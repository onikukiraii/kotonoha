import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { indexMarkdownContent, indexBaseContent } from './indexer-core.js'
import { initPropertiesSchema, getProperties } from '$lib/db/properties.js'
import { getBaseFile } from '$lib/db/bases.js'

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

describe('indexMarkdownContent', () => {
  it('extracts frontmatter to properties table', () => {
    const md = `---
status: active
priority: high
progress: 60
---

# Project A

Body with [[proj-b]] and #work tag.
`
    indexMarkdownContent(db, 'projects/proj-a.md', md, 1700000000000)
    const props = getProperties(db, 'projects/proj-a.md')
    expect(props).toEqual({
      status: 'active',
      priority: 'high',
      progress: 60,
    })
  })

  it('still indexes tags and links (regression check)', () => {
    const md = `---
title: note
---

See [[target]] #foo
`
    indexMarkdownContent(db, 'n.md', md, 1)
    const tags = db.prepare('SELECT tag FROM tags WHERE path = ?').all('n.md') as { tag: string }[]
    const links = db.prepare('SELECT target FROM links WHERE source_path = ?').all('n.md') as { target: string }[]
    expect(tags.map((t) => t.tag)).toContain('foo')
    expect(links.map((l) => l.target)).toContain('target')
  })

  it('clears previous properties on re-index', () => {
    indexMarkdownContent(db, 'n.md', '---\nstatus: active\npriority: low\n---\n', 1)
    indexMarkdownContent(db, 'n.md', '---\nstatus: done\n---\n', 2)
    expect(getProperties(db, 'n.md')).toEqual({ status: 'done' })
  })

  it('no-op when content has no frontmatter', () => {
    indexMarkdownContent(db, 'n.md', '# just body\n', 1)
    expect(getProperties(db, 'n.md')).toEqual({})
  })
})

describe('indexBaseContent', () => {
  it('stores .base file raw + parsed JSON in bases table', () => {
    const yaml = `filters:
  - 'file.inFolder("projects")'
views:
  - type: table
    name: All
    order: [file.name]
`
    indexBaseContent(db, 'tasks.base', yaml, 1700000000000)
    const row = getBaseFile(db, 'tasks.base')
    expect(row).not.toBeNull()
    expect(row!.mtime).toBe(1700000000000)
    const parsed = JSON.parse(row!.parsed_json)
    expect(parsed.views[0].name).toBe('All')
  })
})
