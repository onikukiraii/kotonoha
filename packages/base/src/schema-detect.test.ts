import { describe, it, expect } from 'vitest'
import { summarizeProperties } from './schema-detect.js'
import type { IndexedFile } from './query.js'

const f = (path: string, note: Record<string, unknown>): IndexedFile => ({
  path,
  note,
  tags: [],
  links: [],
  backlinks: [],
})

describe('summarizeProperties', () => {
  it('returns empty schema for empty vault', () => {
    expect(summarizeProperties([])).toEqual({ keys: [] })
  })

  it('collects unique keys across files', () => {
    const files = [
      f('a.md', { status: 'active', priority: 'high' }),
      f('b.md', { status: 'done', rating: 5 }),
    ]
    const schema = summarizeProperties(files)
    const names = schema.keys.map((k) => k.name).sort()
    expect(names).toEqual(['priority', 'rating', 'status'])
  })

  it('collects sample values (unique) per key', () => {
    const files = [
      f('a.md', { status: 'active' }),
      f('b.md', { status: 'done' }),
      f('c.md', { status: 'active' }),
    ]
    const schema = summarizeProperties(files)
    const status = schema.keys.find((k) => k.name === 'status')!
    expect(status.sampleValues.sort()).toEqual(['active', 'done'])
    expect(status.count).toBe(3)
  })

  it('infers types per key', () => {
    const files = [
      f('a.md', { status: 'active', rating: 5, finished: true, due_date: '2026-05-15' }),
    ]
    const schema = summarizeProperties(files)
    const byName = Object.fromEntries(schema.keys.map((k) => [k.name, k]))
    expect(byName['status']?.types).toEqual(['string'])
    expect(byName['rating']?.types).toEqual(['number'])
    expect(byName['finished']?.types).toEqual(['bool'])
    expect(byName['due_date']?.types).toEqual(['date'])
  })

  it('filters by folder prefix when given', () => {
    const files = [
      f('projects/a.md', { status: 'active' }),
      f('books/b.md', { rating: 5 }),
    ]
    const schema = summarizeProperties(files, { folder: 'projects' })
    expect(schema.keys.map((k) => k.name)).toEqual(['status'])
  })

  it('caps sampleValues per key (limit = 5 by default)', () => {
    const files: IndexedFile[] = []
    for (let i = 0; i < 20; i++) {
      files.push(f(`f-${i}.md`, { label: `value-${i}` }))
    }
    const schema = summarizeProperties(files, { limit: 5 })
    expect(schema.keys[0]?.sampleValues.length).toBeLessThanOrEqual(5)
    expect(schema.keys[0]?.count).toBe(20)
  })

  it('treats list-typed properties as list type', () => {
    const files = [f('a.md', { tags: ['work', 'frontend'] })]
    const schema = summarizeProperties(files)
    expect(schema.keys[0]?.types).toEqual(['list'])
  })
})
