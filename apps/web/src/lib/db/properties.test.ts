import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initPropertiesSchema, upsertProperties, getProperties, getAllFilesWithProperties } from './properties.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (path TEXT PRIMARY KEY, filename TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `)
  initPropertiesSchema(db)
  db.prepare('INSERT INTO files (path, filename, updated_at) VALUES (?, ?, ?)').run(
    'projects/proj-a.md',
    'proj-a.md',
    1700000000000,
  )
  db.prepare('INSERT INTO files (path, filename, updated_at) VALUES (?, ?, ?)').run(
    'projects/proj-b.md',
    'proj-b.md',
    1700000000000,
  )
})

describe('upsertProperties + getProperties', () => {
  it('round-trips strings, numbers, booleans, dates, lists, objects', () => {
    upsertProperties(db, 'projects/proj-a.md', {
      status: 'active',
      priority: 'high',
      progress: 60,
      finished: true,
      due_date: '2026-05-15',
      tags: ['work', 'frontend'],
      owner: { name: 'alice', email: 'alice@example.com' },
    })

    const props = getProperties(db, 'projects/proj-a.md')
    expect(props).toEqual({
      status: 'active',
      priority: 'high',
      progress: 60,
      finished: true,
      due_date: '2026-05-15',
      tags: ['work', 'frontend'],
      owner: { name: 'alice', email: 'alice@example.com' },
    })
  })

  it('replaces previous properties on subsequent upsert (no leftover keys)', () => {
    upsertProperties(db, 'projects/proj-a.md', { status: 'active', owner: 'alice' })
    upsertProperties(db, 'projects/proj-a.md', { status: 'done' })

    const props = getProperties(db, 'projects/proj-a.md')
    expect(props).toEqual({ status: 'done' })
  })

  it('stores numeric value in value_num for efficient SQL comparisons', () => {
    upsertProperties(db, 'projects/proj-a.md', { progress: 60 })
    const row = db
      .prepare('SELECT value_num, value_text, value_type FROM properties WHERE path = ? AND key = ?')
      .get('projects/proj-a.md', 'progress') as {
        value_num: number | null
        value_text: string | null
        value_type: string
      }
    expect(row.value_num).toBe(60)
    expect(row.value_type).toBe('number')
  })

  it('stores date ISO strings in value_text with value_type=date', () => {
    upsertProperties(db, 'projects/proj-a.md', { due_date: '2026-05-15' })
    const row = db
      .prepare('SELECT value_text, value_type FROM properties WHERE path = ? AND key = ?')
      .get('projects/proj-a.md', 'due_date') as {
        value_text: string
        value_type: string
      }
    expect(row.value_text).toBe('2026-05-15')
    expect(row.value_type).toBe('date')
  })
})

describe('getAllFilesWithProperties', () => {
  it('returns files with their merged properties in a single call', () => {
    upsertProperties(db, 'projects/proj-a.md', { status: 'active', priority: 'high' })
    upsertProperties(db, 'projects/proj-b.md', { status: 'done', priority: 'low' })

    const files = getAllFilesWithProperties(db)
    const byPath = new Map(files.map((f) => [f.path, f]))

    expect(byPath.get('projects/proj-a.md')?.note).toEqual({
      status: 'active',
      priority: 'high',
    })
    expect(byPath.get('projects/proj-b.md')?.note).toEqual({
      status: 'done',
      priority: 'low',
    })
  })

  it('returns empty note for files with no properties', () => {
    const files = getAllFilesWithProperties(db)
    expect(files).toHaveLength(2)
    expect(files[0]?.note).toEqual({})
  })
})
