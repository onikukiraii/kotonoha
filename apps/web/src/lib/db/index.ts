import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import path from 'path'
import type { SearchResult, BacklinkResult } from '@kotonoha/types'
import { PROPERTIES_SCHEMA } from './properties.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  source_path TEXT NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (source_path, target)
);

CREATE TABLE IF NOT EXISTS tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
  path UNINDEXED,
  content,
  tokenize = 'trigram'
);

CREATE TABLE IF NOT EXISTS bases (
  path TEXT PRIMARY KEY,
  raw_yaml TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  mtime INTEGER NOT NULL
);
${PROPERTIES_SCHEMA}
`

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = process.env['DATA_DIR'] ?? path.join(process.cwd(), 'data')
    mkdirSync(dataDir, { recursive: true })
    db = new Database(path.join(dataDir, 'kotonoha.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function initDb(): void {
  const database = getDb()
  database.exec(SCHEMA)
}

export function upsertFile(filePath: string, filename: string, updatedAt: number): void {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO files (path, filename, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET filename = excluded.filename, updated_at = excluded.updated_at`,
    )
    .run(filePath, filename, updatedAt)
}

export function deleteFileRecord(filePath: string): void {
  const database = getDb()
  database.prepare('DELETE FROM files WHERE path = ?').run(filePath)
  database.prepare('DELETE FROM links WHERE source_path = ?').run(filePath)
  database.prepare('DELETE FROM tags WHERE path = ?').run(filePath)
  database.prepare('DELETE FROM fts WHERE path = ?').run(filePath)
  database.prepare('DELETE FROM properties WHERE path = ?').run(filePath)
  database.prepare('DELETE FROM bases WHERE path = ?').run(filePath)
}

export function getAllFiles(): { path: string; filename: string; updated_at: number }[] {
  const database = getDb()
  return database.prepare('SELECT path, filename, updated_at FROM files').all() as {
    path: string
    filename: string
    updated_at: number
  }[]
}

export function searchFilesByName(query: string): SearchResult[] {
  const database = getDb()
  const pattern = `%${query}%`
  const rows = database
    .prepare(
      `SELECT path, filename, updated_at FROM files
       WHERE filename LIKE ? ORDER BY updated_at DESC LIMIT 20`,
    )
    .all(pattern) as { path: string; filename: string; updated_at: number }[]

  return rows.map((row, i) => ({
    path: row.path,
    filename: row.filename,
    score: 1 - i * 0.05,
  }))
}

// Phase 2: Full-text search & backlinks

export function upsertLinks(sourcePath: string, targets: string[]): void {
  const database = getDb()
  database.prepare('DELETE FROM links WHERE source_path = ?').run(sourcePath)
  const insert = database.prepare('INSERT OR IGNORE INTO links (source_path, target) VALUES (?, ?)')
  for (const target of targets) {
    insert.run(sourcePath, target)
  }
}

export function upsertTags(filePath: string, tags: string[]): void {
  const database = getDb()
  database.prepare('DELETE FROM tags WHERE path = ?').run(filePath)
  const insert = database.prepare('INSERT OR IGNORE INTO tags (path, tag) VALUES (?, ?)')
  for (const tag of tags) {
    insert.run(filePath, tag)
  }
}

export function upsertFts(filePath: string, content: string): void {
  const database = getDb()
  database.prepare('DELETE FROM fts WHERE path = ?').run(filePath)
  database.prepare('INSERT INTO fts (path, content) VALUES (?, ?)').run(filePath, content)
}

export function searchFullText(query: string): SearchResult[] {
  const database = getDb()
  // Trigram tokenizer: wrap query in quotes for substring match
  const ftsQuery = `"${query.replace(/"/g, '""')}"`
  const rows = database
    .prepare(
      `SELECT f.path, f.filename, snippet(fts, 1, '<mark>', '</mark>', '...', 30) as snippet
       FROM fts
       JOIN files f ON fts.path = f.path
       WHERE fts.content MATCH ?
       LIMIT 30`,
    )
    .all(ftsQuery) as { path: string; filename: string; snippet: string }[]

  return rows.map((row, i) => ({
    path: row.path,
    filename: row.filename,
    snippet: row.snippet,
    score: 1 - i * 0.03,
  }))
}

export function getBacklinks(target: string): BacklinkResult[] {
  const database = getDb()
  // Match by exact target or by filename (last component)
  const rows = database
    .prepare(
      `SELECT DISTINCT l.source_path
       FROM links l
       WHERE l.target = ? OR l.target LIKE ?`,
    )
    .all(target, `%/${target}`) as { source_path: string }[]

  // Get snippet for each backlink
  const results: BacklinkResult[] = []
  for (const row of rows) {
    const ftsRow = database
      .prepare(`SELECT snippet(fts, 1, '', '', '...', 20) as snippet FROM fts WHERE path = ?`)
      .get(row.source_path) as { snippet: string } | undefined

    results.push({
      source_path: row.source_path,
      snippet: ftsRow?.snippet ?? '',
    })
  }

  return results
}

export function getAllTags(): string[] {
  const database = getDb()
  const rows = database.prepare('SELECT DISTINCT tag FROM tags ORDER BY tag').all() as { tag: string }[]
  return rows.map((r) => r.tag)
}

export function searchByTag(tag: string): SearchResult[] {
  const database = getDb()
  const rows = database
    .prepare(
      `SELECT t.path, f.filename, f.updated_at
       FROM tags t JOIN files f ON t.path = f.path
       WHERE t.tag = ? ORDER BY f.updated_at DESC`,
    )
    .all(tag) as { path: string; filename: string; updated_at: number }[]

  return rows.map((row, i) => ({
    path: row.path,
    filename: row.filename,
    score: 1 - i * 0.05,
  }))
}
