import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep, posix } from 'node:path'
import { initPropertiesSchema } from '$lib/db/properties.js'
import { indexMarkdownContent, indexBaseContent } from './indexer-core.js'
import { runBaseFile } from './base-runner.js'

const VAULT = join(__dirname, '..', '..', '..', '..', '..', 'packages/base/test-fixtures/vault')
const GOLDEN = join(__dirname, '..', '..', '..', '..', '..', 'packages/base/test-fixtures/golden')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

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

  for (const abs of walk(VAULT)) {
    const rel = relative(VAULT, abs).split(sep).join(posix.sep)
    const content = readFileSync(abs, 'utf-8')
    const mtime = Math.floor(statSync(abs).mtimeMs)
    if (rel.endsWith('.md')) {
      indexMarkdownContent(db, rel, content, mtime)
    } else if (rel.endsWith('.base')) {
      indexBaseContent(db, rel, content, mtime)
    }
  }
})

describe('runBaseFile', () => {
  it('runs tasks.base and matches golden output', async () => {
    const result = await runBaseFile({ db, vaultRoot: VAULT, basePath: 'tasks.base' })
    const expected = JSON.parse(readFileSync(join(GOLDEN, 'tasks.expected.json'), 'utf-8'))
    expect(result).toEqual(expected)
  })

  it('runs library.base and matches golden output (groupBy + summaries)', async () => {
    const result = await runBaseFile({ db, vaultRoot: VAULT, basePath: 'library.base' })
    const expected = JSON.parse(readFileSync(join(GOLDEN, 'library.expected.json'), 'utf-8'))
    expect(result).toEqual(expected)
  })

  it('runs overdue.base (formulas)', async () => {
    const result = await runBaseFile({ db, vaultRoot: VAULT, basePath: 'overdue.base' })
    const expected = JSON.parse(readFileSync(join(GOLDEN, 'overdue.expected.json'), 'utf-8'))
    delete expected._note
    expect(result).toEqual(expected)
  })

  it('throws when .base file does not exist', async () => {
    await expect(runBaseFile({ db, vaultRoot: VAULT, basePath: 'missing.base' })).rejects.toThrow(
      /not found/i,
    )
  })
})
