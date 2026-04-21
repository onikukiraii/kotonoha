import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initPropertiesSchema, getProperties } from '$lib/db/properties.js'
import { indexMarkdownContent } from './indexer-core.js'
import { updateFileProperty } from './update-property.js'

let db: Database.Database
let vaultRoot: string

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

  vaultRoot = join(tmpdir(), `kotonoha-update-prop-${Date.now()}-${Math.random()}`)
  mkdirSync(vaultRoot, { recursive: true })
})

afterEach(() => {
  rmSync(vaultRoot, { recursive: true, force: true })
})

describe('updateFileProperty', () => {
  it('persists a new property value to frontmatter file and re-indexes DB', async () => {
    const filePath = 'note.md'
    const initial = `---
status: active
priority: high
---

# Body
`
    writeFileSync(join(vaultRoot, filePath), initial, 'utf-8')
    indexMarkdownContent(db, filePath, initial, 0)
    expect(getProperties(db, filePath)).toEqual({ status: 'active', priority: 'high' })

    await updateFileProperty({ db, vaultRoot, filePath, key: 'status', value: 'done' })

    const content = readFileSync(join(vaultRoot, filePath), 'utf-8')
    expect(content).toContain('status: done')
    expect(content).toContain('priority: high')

    expect(getProperties(db, filePath)).toEqual({ status: 'done', priority: 'high' })
  })

  it('adds a frontmatter block if file has none', async () => {
    const filePath = 'bare.md'
    const initial = '# Just body\n'
    writeFileSync(join(vaultRoot, filePath), initial, 'utf-8')
    indexMarkdownContent(db, filePath, initial, 0)

    await updateFileProperty({ db, vaultRoot, filePath, key: 'status', value: 'draft' })

    const content = readFileSync(join(vaultRoot, filePath), 'utf-8')
    expect(content).toMatch(/^---\nstatus: draft\n---/)
    expect(getProperties(db, filePath)).toEqual({ status: 'draft' })
  })

  it('rejects path traversal outside the vault', async () => {
    await expect(
      updateFileProperty({ db, vaultRoot, filePath: '../escape.md', key: 'x', value: 1 }),
    ).rejects.toThrow(/traversal|outside/i)
  })

  it('rejects non-.md files (only markdown frontmatter is editable)', async () => {
    writeFileSync(join(vaultRoot, 'x.base'), 'filters: []\n', 'utf-8')
    await expect(
      updateFileProperty({ db, vaultRoot, filePath: 'x.base', key: 'x', value: 1 }),
    ).rejects.toThrow(/only/i)
  })
})
