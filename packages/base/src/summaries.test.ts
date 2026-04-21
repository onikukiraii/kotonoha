import { describe, it, expect } from 'vitest'
import { applySummary } from './summaries.js'

describe('applySummary — numeric aggregates', () => {
  it('Sum', () => {
    expect(applySummary('Sum', [1, 2, 3])).toBe(6)
    expect(applySummary('Sum', [])).toBe(0)
    expect(applySummary('Sum', [1, null, 2, undefined])).toBe(3)
  })

  it('Average', () => {
    expect(applySummary('Average', [2, 4, 6])).toBe(4)
    expect(applySummary('Average', [])).toBe(0)
    expect(applySummary('Average', [1, null, 3])).toBe(2)
  })

  it('Min / Max', () => {
    expect(applySummary('Min', [3, 1, 2])).toBe(1)
    expect(applySummary('Max', [3, 1, 2])).toBe(3)
    expect(applySummary('Min', [])).toBeNull()
    expect(applySummary('Max', [])).toBeNull()
  })
})

describe('applySummary — date aggregates', () => {
  it('Earliest (ISO strings)', () => {
    const r = applySummary('Earliest', ['2026-05-15', '2026-03-01', '2026-04-25'])
    expect(r).toBe('2026-03-01')
  })

  it('Latest (ISO strings)', () => {
    const r = applySummary('Latest', ['2026-05-15', '2026-03-01', '2026-04-25'])
    expect(r).toBe('2026-05-15')
  })

  it('Earliest / Latest — ignores null', () => {
    expect(applySummary('Earliest', ['2026-05-15', null, '2026-01-01'])).toBe('2026-01-01')
  })

  it('returns null when no dates', () => {
    expect(applySummary('Earliest', [])).toBeNull()
    expect(applySummary('Latest', [])).toBeNull()
  })
})

describe('applySummary — boolean aggregates', () => {
  it('Checked returns count of truthy booleans', () => {
    expect(applySummary('Checked', [true, false, true, null])).toBe(2)
  })

  it('Unchecked returns count of explicit false', () => {
    expect(applySummary('Unchecked', [true, false, false, null])).toBe(2)
  })
})

describe('applySummary — generic aggregates', () => {
  it('Unique', () => {
    expect(applySummary('Unique', ['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })

  it('Empty counts null/undefined', () => {
    expect(applySummary('Empty', [1, null, undefined, 2])).toBe(2)
  })

  it('Filled counts non-null values', () => {
    expect(applySummary('Filled', [1, null, 2, undefined, 3])).toBe(3)
  })
})

describe('applySummary — error handling', () => {
  it('throws on unknown summary function', () => {
    expect(() => applySummary('Bogus', [1])).toThrow(/unsupported/)
  })
})
