import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initPropertiesSchema } from '$lib/db/properties.js'
import { getBaseFile } from '$lib/db/bases.js'
import { readBaseContent, writeBaseContent } from './base-content.js'

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
  vaultRoot = join(tmpdir(), `kotonoha-base-content-${Date.now()}-${Math.random()}`)
  mkdirSync(vaultRoot, { recursive: true })
})

afterEach(() => {
  rmSync(vaultRoot, { recursive: true, force: true })
})

describe('readBaseContent', () => {
  it('returns the raw YAML from disk', async () => {
    const yaml = 'filters: []\nviews: []\n'
    writeFileSync(join(vaultRoot, 'x.base'), yaml, 'utf-8')
    const got = await readBaseContent({ vaultRoot, basePath: 'x.base' })
    expect(got).toBe(yaml)
  })

  it('rejects path traversal', async () => {
    await expect(
      readBaseContent({ vaultRoot, basePath: '../outside.base' }),
    ).rejects.toThrow(/traversal/)
  })

  it('rejects non-.base paths', async () => {
    await expect(
      readBaseContent({ vaultRoot, basePath: 'file.md' }),
    ).rejects.toThrow(/\.base/)
  })
})

describe('writeBaseContent', () => {
  it('persists new YAML and updates the bases table', async () => {
    const original = 'filters: []\n'
    writeFileSync(join(vaultRoot, 'x.base'), original, 'utf-8')
    const next = `filters:
  - 'status == "active"'
views:
  - type: table
    name: New
    order: [file.name]
`
    await writeBaseContent({ db, vaultRoot, basePath: 'x.base', yaml: next })
    expect(readFileSync(join(vaultRoot, 'x.base'), 'utf-8')).toBe(next)
    const row = getBaseFile(db, 'x.base')
    expect(row).not.toBeNull()
    expect(JSON.parse(row!.parsed_json).views[0].name).toBe('New')
  })

  it('rejects invalid YAML (BaseParseError)', async () => {
    writeFileSync(join(vaultRoot, 'x.base'), 'filters: []\n', 'utf-8')
    await expect(
      writeBaseContent({ db, vaultRoot, basePath: 'x.base', yaml: 'views:\n  - type: unknown_type' }),
    ).rejects.toThrow()
  })
})
