import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseBase } from './parser.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INPUTS = join(__dirname, '..', 'test-fixtures', 'inputs')
const VAULT = join(__dirname, '..', 'test-fixtures', 'vault')

const read = (p: string) => readFileSync(p, 'utf-8')

describe('parseBase - filters', () => {
  it('parses a single-statement filter as an expr node', () => {
    const base = parseBase(read(join(INPUTS, 'filter-simple.yml')))
    expect(base.filters).toEqual({
      kind: 'and',
      children: [{ kind: 'expr', source: 'status == "active"' }],
    })
  })

  it('parses an and block with mixed expr children', () => {
    const base = parseBase(read(join(INPUTS, 'filter-and.yml')))
    expect(base.filters).toEqual({
      kind: 'and',
      children: [
        { kind: 'expr', source: 'status == "active"' },
        { kind: 'expr', source: 'file.inFolder("projects")' },
      ],
    })
  })

  it('parses nested or / not blocks', () => {
    const base = parseBase(read(join(INPUTS, 'filter-or-not.yml')))
    expect(base.filters).toEqual({
      kind: 'or',
      children: [
        { kind: 'expr', source: 'priority == "high"' },
        {
          kind: 'not',
          children: [{ kind: 'expr', source: 'status == "done"' }],
        },
      ],
    })
  })

  it('parses function-call filter statements verbatim', () => {
    const base = parseBase(read(join(INPUTS, 'filter-func.yml')))
    expect(base.filters).toEqual({
      kind: 'and',
      children: [
        { kind: 'expr', source: 'file.hasTag("work")' },
        { kind: 'expr', source: 'file.inFolder("projects")' },
        { kind: 'expr', source: 'file.hasLink("proj-b")' },
      ],
    })
  })
})

describe('parseBase - formulas', () => {
  it('stores formula expressions as raw source keyed by name', () => {
    const base = parseBase(read(join(INPUTS, 'formula-arith.yml')))
    expect(base.formulas).toEqual({
      double_pages: 'pages * 2',
      is_thick: 'pages > 400',
      total_score: 'rating * 20 + progress',
    })
  })
})

describe('parseBase - views', () => {
  it('parses a table view with order, sort, limit', () => {
    const base = parseBase(read(join(INPUTS, 'view-table.yml')))
    expect(base.views).toEqual([
      {
        type: 'table',
        name: 'All',
        order: ['file.name', 'status'],
        sort: [{ column: 'status', direction: 'asc' }],
        limit: 100,
      },
    ])
  })

  it('parses a cards view with groupBy + summaries + image', () => {
    const base = parseBase(read(join(INPUTS, 'view-cards.yml')))
    expect(base.views).toEqual([
      {
        type: 'cards',
        name: 'Gallery',
        order: ['file.name', 'rating'],
        image: 'cover',
        groupBy: { property: 'category' },
        summaries: { rating: 'Average' },
      },
    ])
  })

  it('parses a minimal list view', () => {
    const base = parseBase(read(join(INPUTS, 'view-list.yml')))
    expect(base.views).toEqual([
      {
        type: 'list',
        name: 'Simple',
        order: ['file.name'],
        limit: 10,
      },
    ])
  })
})

describe('parseBase - full vault fixtures', () => {
  it('parses tasks.base end-to-end', () => {
    const base = parseBase(read(join(VAULT, 'tasks.base')))
    expect(base.filters).toEqual({
      kind: 'and',
      children: [
        { kind: 'expr', source: 'file.inFolder("projects")' },
        { kind: 'expr', source: 'status == "active"' },
      ],
    })
    expect(base.properties).toEqual({
      'note.priority': { displayName: '優先度' },
      'note.due_date': { displayName: '期限' },
      'note.owner': { displayName: '担当' },
      'note.progress': { displayName: '進捗' },
    })
    expect(base.views).toHaveLength(1)
    expect(base.views[0]?.type).toBe('table')
    expect(base.views[0]?.sort).toEqual([
      { column: 'priority', direction: 'asc' },
      { column: 'due_date', direction: 'asc' },
    ])
  })

  it('parses library.base end-to-end', () => {
    const base = parseBase(read(join(VAULT, 'library.base')))
    expect(base.views[0]).toMatchObject({
      type: 'cards',
      name: 'All Books',
      image: 'cover',
      groupBy: { property: 'category' },
      summaries: { pages: 'Sum', rating: 'Average' },
    })
  })

  it('parses overdue.base with formulas', () => {
    const base = parseBase(read(join(VAULT, 'overdue.base')))
    expect(base.formulas).toEqual({
      days_overdue: 'date("2026-04-20") - due_date',
      is_overdue: 'due_date < date("2026-04-20")',
    })
    expect(base.views[0]?.filters).toEqual({
      kind: 'and',
      children: [{ kind: 'expr', source: 'is_overdue == true' }],
    })
  })
})

describe('parseBase - error handling', () => {
  it('throws on invalid YAML', () => {
    expect(() => parseBase('::not valid yaml::\n  - [\n')).toThrow()
  })

  it('returns empty defaults for empty input', () => {
    const base = parseBase('')
    expect(base.filters).toBeUndefined()
    expect(base.formulas).toEqual({})
    expect(base.properties).toEqual({})
    expect(base.views).toEqual([])
  })
})
