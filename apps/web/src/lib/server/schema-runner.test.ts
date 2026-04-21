import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initPropertiesSchema } from '$lib/db/properties.js'
import { indexMarkdownContent } from './indexer-core.js'
import { readVaultSchema } from './schema-runner.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (path TEXT PRIMARY KEY, filename TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE links (source_path TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY (source_path, target));
    CREATE TABLE tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE fts USING fts5(path UNINDEXED, content, tokenize = 'trigram');
    CREATE TABLE bases (path TEXT PRIMARY KEY, raw_yaml TEXT NOT NULL, parsed_json TEXT NOT NULL, mtime INTEGER NOT NULL);
  `)
  initPropertiesSchema(db)
})

function sampleVault() {
  indexMarkdownContent(
    db,
    'projects/a.md',
    '---\nstatus: active\npriority: high\nprogress: 60\n---\n',
    1,
  )
  indexMarkdownContent(
    db,
    'projects/b.md',
    '---\nstatus: done\npriority: low\nprogress: 100\n---\n',
    2,
  )
  indexMarkdownContent(
    db,
    'books/c.md',
    '---\nrating: 5\nauthor: kafka\n---\n',
    3,
  )
}

describe('readVaultSchema', () => {
  it('returns all unique property keys across the vault', () => {
    sampleVault()
    const schema = readVaultSchema(db, { folder: null })
    const names = schema.keys.map((k) => k.name).sort()
    expect(names).toEqual(['author', 'priority', 'progress', 'rating', 'status'])
  })

  it('filters to a folder when given', () => {
    sampleVault()
    const schema = readVaultSchema(db, { folder: 'projects' })
    const names = schema.keys.map((k) => k.name).sort()
    expect(names).toEqual(['priority', 'progress', 'status'])
  })

  it('returns sample values per key (limited)', () => {
    sampleVault()
    const schema = readVaultSchema(db, { folder: 'projects', limit: 5 })
    const status = schema.keys.find((k) => k.name === 'status')!
    expect(status.sampleValues.sort()).toEqual(['active', 'done'])
    expect(status.count).toBe(2)
  })

  it('reports types per key', () => {
    sampleVault()
    const schema = readVaultSchema(db, { folder: 'projects' })
    const progress = schema.keys.find((k) => k.name === 'progress')!
    expect(progress.types).toEqual(['number'])
  })
})
