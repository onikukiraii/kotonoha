import { describe, it, expect } from 'vitest'
import { compileExpression } from './compile.js'
import { evaluateFilter } from './evaluate.js'
import type { FilterNode } from '../schema.js'
import type { EvalContext } from './evaluate.js'

const ctx = (fm: Record<string, unknown>, file: Partial<EvalContext['file']> = {}): EvalContext => ({
  file: {
    name: 'proj-a.md',
    basename: 'proj-a',
    path: 'projects/proj-a.md',
    folder: 'projects',
    size: 0,
    ctime: 0,
    mtime: 0,
    tags: [],
    links: [],
    backlinks: [],
    ...file,
  },
  note: fm,
})

describe('expression evaluator', () => {
  it.each([
    ['status == "active"', { status: 'active' }, true],
    ['status == "active"', { status: 'done' }, false],
    ['priority != "low"', { priority: 'high' }, true],
    ['priority != "low"', { priority: 'low' }, false],
    ['progress >= 50', { progress: 60 }, true],
    ['progress >= 50', { progress: 30 }, false],
    ['progress > 50', { progress: 50 }, false],
    ['progress < 100', { progress: 99 }, true],
    ['progress <= 100', { progress: 100 }, true],
    ['rating == 5', { rating: 5 }, true],
  ])('%s with %j → %s', (expr, fm, expected) => {
    const compiled = compileExpression(expr)
    expect(compiled(ctx(fm))).toBe(expected)
  })

  it('handles missing note properties as undefined (== never matches a literal)', () => {
    const compiled = compileExpression('status == "active"')
    expect(compiled(ctx({}))).toBe(false)
  })
})

describe('file.* functions', () => {
  it('file.hasTag', () => {
    const compiled = compileExpression('file.hasTag("work")')
    expect(compiled(ctx({}, { tags: ['work', 'frontend'] }))).toBe(true)
    expect(compiled(ctx({}, { tags: ['personal'] }))).toBe(false)
  })

  it('file.inFolder matches exact parent folder', () => {
    const compiled = compileExpression('file.inFolder("projects")')
    expect(compiled(ctx({}, { folder: 'projects' }))).toBe(true)
    expect(compiled(ctx({}, { folder: 'books' }))).toBe(false)
  })

  it('file.inFolder matches subfolders', () => {
    const compiled = compileExpression('file.inFolder("projects")')
    expect(compiled(ctx({}, { folder: 'projects/archive' }))).toBe(true)
  })

  it('file.name reference', () => {
    const compiled = compileExpression('file.name == "proj-a.md"')
    expect(compiled(ctx({}))).toBe(true)
  })
})

describe('global functions — contains / startsWith / endsWith / in / matches', () => {
  it('contains(string, substring)', () => {
    const fn = compileExpression('contains(file.name, "proj")')
    expect(fn(ctx({}, { name: 'proj-a.md' }))).toBe(true)
    expect(fn(ctx({}, { name: 'other.md' }))).toBe(false)
  })

  it('contains(list, element)', () => {
    const fn = compileExpression('contains(file.tags, "work")')
    expect(fn(ctx({}, { tags: ['work', 'urgent'] }))).toBe(true)
    expect(fn(ctx({}, { tags: ['personal'] }))).toBe(false)
  })

  it('startsWith / endsWith', () => {
    const a = compileExpression('startsWith(file.name, "proj")')
    expect(a(ctx({}, { name: 'proj-a.md' }))).toBe(true)
    expect(a(ctx({}, { name: 'book.md' }))).toBe(false)
    const b = compileExpression('endsWith(file.name, ".md")')
    expect(b(ctx({}, { name: 'book.md' }))).toBe(true)
    expect(b(ctx({}, { name: 'book.base' }))).toBe(false)
  })

  it('in(value, list) — element containment', () => {
    const fn = compileExpression('in("work", file.tags)')
    expect(fn(ctx({}, { tags: ['work', 'urgent'] }))).toBe(true)
    expect(fn(ctx({}, { tags: ['personal'] }))).toBe(false)
  })

  it('matches(value, pattern) — regex', () => {
    const fn = compileExpression('matches(file.name, "^proj-[a-z]+\\\\.md$")')
    expect(fn(ctx({}, { name: 'proj-a.md' }))).toBe(true)
    expect(fn(ctx({}, { name: 'proj-1.md' }))).toBe(false)
  })

  it('if(cond, then, else)', () => {
    const fn = compileExpression('if(progress >= 100, "done", "wip")')
    expect(fn(ctx({ progress: 100 }))).toBe('done')
    expect(fn(ctx({ progress: 30 }))).toBe('wip')
  })
})

describe('duration arithmetic', () => {
  it('date + "7d" adds 7 days', () => {
    const fn = compileExpression('date("2026-04-20") + "7d"')
    const r = fn(ctx({})) as Date
    expect(r).toBeInstanceOf(Date)
    expect(r.toISOString().slice(0, 10)).toBe('2026-04-27')
  })

  it('date - "3d" subtracts 3 days', () => {
    const fn = compileExpression('date("2026-04-20") - "3d"')
    const r = fn(ctx({})) as Date
    expect(r.toISOString().slice(0, 10)).toBe('2026-04-17')
  })

  it('date + "1M" advances 1 month', () => {
    const fn = compileExpression('date("2026-04-20") + "1M"')
    const r = fn(ctx({})) as Date
    expect(r.toISOString().slice(0, 10)).toBe('2026-05-20')
  })

  it('date + "1y" advances 1 year', () => {
    const fn = compileExpression('date("2026-04-20") + "1y"')
    const r = fn(ctx({})) as Date
    expect(r.toISOString().slice(0, 10)).toBe('2027-04-20')
  })

  it('non-duration string remains string concatenation', () => {
    const fn = compileExpression('file.name + ".bak"')
    expect(fn(ctx({}, { name: 'foo' }))).toBe('foo.bak')
  })
})

describe('security — allowlist', () => {
  it('rejects unknown function calls', () => {
    expect(() => compileExpression('file.evilFn()')).toThrow(/unknown function/i)
  })

  it('rejects accessing prototype chain', () => {
    expect(() => compileExpression('constructor.constructor()')).toThrow()
  })
})

describe('evaluateFilter — and/or/not composition', () => {
  const node = (source: string): FilterNode => ({ kind: 'expr', source })

  it('and returns true only when all children pass', () => {
    const f: FilterNode = {
      kind: 'and',
      children: [node('status == "active"'), node('file.inFolder("projects")')],
    }
    expect(evaluateFilter(f, ctx({ status: 'active' }))).toBe(true)
    expect(evaluateFilter(f, ctx({ status: 'done' }))).toBe(false)
    expect(evaluateFilter(f, ctx({ status: 'active' }, { folder: 'books' }))).toBe(false)
  })

  it('or returns true if any child passes', () => {
    const f: FilterNode = {
      kind: 'or',
      children: [node('status == "urgent"'), node('priority == "high"')],
    }
    expect(evaluateFilter(f, ctx({ priority: 'high' }))).toBe(true)
    expect(evaluateFilter(f, ctx({ priority: 'low' }))).toBe(false)
  })

  it('not inverts its children (implicit and)', () => {
    const f: FilterNode = {
      kind: 'not',
      children: [node('status == "done"')],
    }
    expect(evaluateFilter(f, ctx({ status: 'active' }))).toBe(true)
    expect(evaluateFilter(f, ctx({ status: 'done' }))).toBe(false)
  })

  it('nested or under not', () => {
    const f: FilterNode = {
      kind: 'and',
      children: [
        node('file.inFolder("projects")'),
        {
          kind: 'not',
          children: [
            { kind: 'or', children: [node('status == "done"'), node('status == "archived"')] },
          ],
        },
      ],
    }
    expect(evaluateFilter(f, ctx({ status: 'active' }))).toBe(true)
    expect(evaluateFilter(f, ctx({ status: 'done' }))).toBe(false)
  })
})
