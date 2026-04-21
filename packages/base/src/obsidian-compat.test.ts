import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseBase } from './parser.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(__dirname, '..', 'test-fixtures', 'obsidian-compat')

describe('Obsidian compatibility — real .base fixtures', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.base'))

  it.each(files)('parses %s without error', (name) => {
    const yaml = readFileSync(join(FIXTURES, name), 'utf-8')
    const base = parseBase(yaml)
    expect(base.views.length).toBeGreaterThan(0)
    for (const v of base.views) {
      expect(['table', 'cards', 'list']).toContain(v.type)
    }
  })
})

describe('Obsidian compat — books-by-status.base details', () => {
  const yaml = readFileSync(join(FIXTURES, 'books-by-status.base'), 'utf-8')
  const base = parseBase(yaml)

  it('keeps the and/or structure of the top-level filter', () => {
    expect(base.filters?.kind).toBe('and')
  })

  it('recognizes both views and their types', () => {
    expect(base.views.map((v) => v.type)).toEqual(['table', 'cards'])
    expect(base.views[0]?.name).toBe('Currently Reading')
    expect(base.views[1]?.name).toBe('Finished')
  })

  it('preserves per-view filter + sort + groupBy + summaries + image', () => {
    const cards = base.views[1]!
    expect(cards.groupBy?.property).toBe('genre')
    expect(cards.summaries?.rating).toBe('Average')
    expect(cards.image).toBe('cover')
    expect(cards.filters?.kind).toBe('and')
  })

  it('captures formulas as raw strings for lazy evaluation', () => {
    expect(base.formulas.year_published).toBe('date(published) - date("1900-01-01")')
  })
})
