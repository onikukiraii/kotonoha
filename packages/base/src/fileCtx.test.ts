import { describe, it, expect } from 'vitest'
import { buildFileCtx } from './fileCtx.js'

describe('buildFileCtx — derived properties', () => {
  it('derives name, basename, folder from path when not given', () => {
    const ctx = buildFileCtx({ path: 'projects/archive/old-note.md' })
    expect(ctx.name).toBe('old-note.md')
    expect(ctx.basename).toBe('old-note')
    expect(ctx.folder).toBe('projects/archive')
    expect(ctx.path).toBe('projects/archive/old-note.md')
  })

  it('returns empty folder for root-level files', () => {
    const ctx = buildFileCtx({ path: 'tasks.base' })
    expect(ctx.folder).toBe('')
    expect(ctx.name).toBe('tasks.base')
    expect(ctx.basename).toBe('tasks.base')
  })

  it('preserves explicit overrides', () => {
    const ctx = buildFileCtx({
      path: 'a/b.md',
      name: 'override-name.md',
      basename: 'override-base',
      folder: 'custom/folder',
      size: 100,
      ctime: 1000,
      mtime: 2000,
      tags: ['work'],
      links: ['target'],
      backlinks: ['source'],
    })
    expect(ctx.name).toBe('override-name.md')
    expect(ctx.basename).toBe('override-base')
    expect(ctx.folder).toBe('custom/folder')
    expect(ctx.size).toBe(100)
    expect(ctx.ctime).toBe(1000)
    expect(ctx.mtime).toBe(2000)
    expect(ctx.tags).toEqual(['work'])
    expect(ctx.links).toEqual(['target'])
    expect(ctx.backlinks).toEqual(['source'])
  })

  it('defaults size/ctime/mtime/tags/links/backlinks to zero/empty', () => {
    const ctx = buildFileCtx({ path: 'a.md' })
    expect(ctx.size).toBe(0)
    expect(ctx.ctime).toBe(0)
    expect(ctx.mtime).toBe(0)
    expect(ctx.tags).toEqual([])
    expect(ctx.links).toEqual([])
    expect(ctx.backlinks).toEqual([])
  })

  it('strips only .md extension for basename (keeps .base)', () => {
    const ctx = buildFileCtx({ path: 'tasks.base' })
    expect(ctx.basename).toBe('tasks.base')
    const md = buildFileCtx({ path: 'note.md' })
    expect(md.basename).toBe('note')
  })
})

describe('filter evaluator — file.* references', () => {
  it.each([
    ['file.name', 'projects/proj-a.md', 'proj-a.md'],
    ['file.basename', 'projects/proj-a.md', 'proj-a'],
    ['file.path', 'projects/proj-a.md', 'projects/proj-a.md'],
    ['file.folder', 'projects/proj-a.md', 'projects'],
  ])('%s resolves correctly for %s', async (expr, path, expected) => {
    const { compileExpression } = await import('./filter/compile.js')
    const fn = compileExpression(expr)
    const ctx = {
      file: buildFileCtx({ path }),
      note: {},
    }
    expect(fn(ctx)).toBe(expected)
  })
})
