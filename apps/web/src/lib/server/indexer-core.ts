import type Database from 'better-sqlite3'
import path from 'path'
import { parseFrontmatter, parseBase } from '@kotonoha/base'
import { upsertProperties } from '$lib/db/properties.js'
import { upsertBaseFile } from '$lib/db/bases.js'
import { extractTags, extractWikilinks } from './parser.js'

export function indexMarkdownContent(
  db: Database.Database,
  filePath: string,
  content: string,
  mtime: number,
): void {
  const filename = path.basename(filePath)
  const parsed = parseFrontmatter(content)
  const body = parsed.ok ? parsed.body : content
  const properties: Record<string, unknown> = {}
  if (parsed.ok) {
    for (const [k, v] of Object.entries(parsed.properties)) properties[k] = v.value
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO files (path, filename, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET filename = excluded.filename, updated_at = excluded.updated_at`,
    ).run(filePath, filename, mtime)

    db.prepare('DELETE FROM links WHERE source_path = ?').run(filePath)
    const insertLink = db.prepare(
      'INSERT OR IGNORE INTO links (source_path, target) VALUES (?, ?)',
    )
    for (const target of extractWikilinks(body)) insertLink.run(filePath, target)

    db.prepare('DELETE FROM tags WHERE path = ?').run(filePath)
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (path, tag) VALUES (?, ?)')
    for (const tag of extractTags(body)) insertTag.run(filePath, tag)

    db.prepare('DELETE FROM fts WHERE path = ?').run(filePath)
    db.prepare('INSERT INTO fts (path, content) VALUES (?, ?)').run(filePath, body)

    upsertProperties(db, filePath, properties)
  })
  tx()
}

export function indexBaseContent(
  db: Database.Database,
  filePath: string,
  yaml: string,
  mtime: number,
): void {
  const parsed = parseBase(yaml)
  upsertBaseFile(db, filePath, yaml, JSON.stringify(parsed), mtime)
}
