import { describe, it, expect } from 'vitest'
import { parseBase } from './parser.js'
import { serializeBase } from './serialize.js'
import type { BaseFile } from './schema.js'

function roundtrip(base: BaseFile): BaseFile {
  return parseBase(serializeBase(base))
}

describe('serializeBase - round-trip', () => {
  it('serializes an empty base to empty YAML-compatible text', () => {
    const base: BaseFile = { formulas: {}, properties: {}, summaries: {}, views: [] }
    const yaml = serializeBase(base)
    expect(parseBase(yaml)).toEqual(base)
  })

  it('serializes a minimal table view and reparses identically', () => {
    const base: BaseFile = {
      formulas: {},
      properties: {},
      summaries: {},
      views: [
        {
          type: 'table',
          name: 'All',
          order: ['file.name'],
        },
      ],
    }
    expect(roundtrip(base)).toEqual(base)
  })

  it('preserves and/or/not filter structure', () => {
    const base: BaseFile = {
      filters: {
        kind: 'and',
        children: [
          { kind: 'expr', source: 'status == "active"' },
          {
            kind: 'or',
            children: [
              { kind: 'expr', source: 'priority == "high"' },
              { kind: 'not', children: [{ kind: 'expr', source: 'archived == true' }] },
            ],
          },
        ],
      },
      formulas: {},
      properties: {},
      summaries: {},
      views: [{ type: 'table', name: 'X', order: ['file.name'] }],
    }
    expect(roundtrip(base)).toEqual(base)
  })

  it('preserves sort, groupBy, summaries, image, limit', () => {
    const base: BaseFile = {
      formulas: {},
      properties: {},
      summaries: {},
      views: [
        {
          type: 'cards',
          name: 'Library',
          order: ['file.name', 'author', 'rating'],
          image: 'cover',
          sort: [{ column: 'rating', direction: 'desc' }],
          groupBy: { property: 'category' },
          summaries: { pages: 'Sum', rating: 'Average' },
          limit: 50,
        },
      ],
    }
    expect(roundtrip(base)).toEqual(base)
  })

  it('preserves formulas as raw strings', () => {
    const base: BaseFile = {
      formulas: {
        days_overdue: 'date("2026-04-20") - due_date',
        is_overdue: 'due_date < date("2026-04-20")',
      },
      properties: {},
      summaries: {},
      views: [{ type: 'list', name: 'Overdue', order: ['file.name'] }],
    }
    expect(roundtrip(base)).toEqual(base)
  })

  it('preserves property displayName metadata', () => {
    const base: BaseFile = {
      formulas: {},
      properties: {
        'note.priority': { displayName: '優先度' },
        'note.due_date': { displayName: '期限' },
      },
      summaries: {},
      views: [{ type: 'table', name: 'X', order: ['file.name'] }],
    }
    expect(roundtrip(base)).toEqual(base)
  })
})

describe('serializeBase - output format', () => {
  it('emits YAML that starts with a top-level mapping (no inline object)', () => {
    const base: BaseFile = {
      formulas: {},
      properties: {},
      summaries: {},
      views: [{ type: 'table', name: 'A', order: ['file.name'] }],
    }
    const yaml = serializeBase(base)
    expect(yaml).toMatch(/^views:/m)
    expect(yaml).not.toMatch(/^views: \[/m) // not flow-style
  })

  it('omits empty top-level sections (formulas/properties/summaries)', () => {
    const base: BaseFile = {
      formulas: {},
      properties: {},
      summaries: {},
      views: [{ type: 'table', name: 'A', order: ['file.name'] }],
    }
    const yaml = serializeBase(base)
    expect(yaml).not.toMatch(/^formulas:/m)
    expect(yaml).not.toMatch(/^properties:/m)
    expect(yaml).not.toMatch(/^summaries:/m)
  })

  it('emits filter expressions as string items', () => {
    const base: BaseFile = {
      filters: {
        kind: 'and',
        children: [{ kind: 'expr', source: 'status == "active"' }],
      },
      formulas: {},
      properties: {},
      summaries: {},
      views: [{ type: 'table', name: 'A', order: ['file.name'] }],
    }
    const yaml = serializeBase(base)
    expect(yaml).toContain('status == "active"')
  })
})
