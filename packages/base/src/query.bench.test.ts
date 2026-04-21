import { describe, it, expect } from 'vitest'
import { parseBase } from './parser.js'
import { runBase, type IndexedFile } from './query.js'

function generateVault(n: number): IndexedFile[] {
  const priorities = ['high', 'medium', 'low']
  const statuses = ['active', 'done', 'pending']
  const owners = ['alice', 'bob', 'carol']
  const files: IndexedFile[] = []
  for (let i = 0; i < n; i++) {
    const folder = i % 4 === 0 ? 'projects' : i % 4 === 1 ? 'archive' : i % 4 === 2 ? 'books' : 'misc'
    files.push({
      path: `${folder}/file-${i}.md`,
      note: {
        status: statuses[i % 3],
        priority: priorities[i % 3],
        owner: owners[i % 3],
        progress: (i * 7) % 100,
        due_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
      },
      tags: i % 2 === 0 ? ['work'] : ['personal'],
      links: [],
      backlinks: [],
      size: 500 + i,
      ctime: 1700000000000 + i,
      mtime: 1700000000000 + i * 1000,
    })
  }
  return files
}

describe('runBase — performance budget', () => {
  it('runs a filter + sort + groupBy query over 1000 files in under 100ms', () => {
    const files = generateVault(1000)
    const base = parseBase(`
filters:
  and:
    - 'file.inFolder("projects")'
    - 'status == "active"'

views:
  - type: table
    name: Perf
    order: [file.name, priority, due_date, owner, progress]
    sort:
      - column: priority
        direction: asc
      - column: due_date
        direction: asc
    limit: 100
`)

    const iterations = 10
    let totalMs = 0
    let lastResult
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      lastResult = runBase(base, files, { basePath: 'perf.base' })
      totalMs += performance.now() - start
    }
    const median = totalMs / iterations
    console.log(`[bench] filter+sort 1000 files: avg=${median.toFixed(2)}ms`)

    expect(lastResult!.views[0]?.rows?.length).toBeGreaterThan(0)
    expect(median).toBeLessThan(100)
  })

  it('groupBy + summaries (Sum/Average) over 1000 files in under 100ms', () => {
    const files = generateVault(1000)
    const base = parseBase(`
views:
  - type: cards
    name: BookStats
    order: [file.name]
    groupBy:
      property: owner
    summaries:
      progress: Sum
      size: Average
`)

    const iterations = 10
    let totalMs = 0
    let lastResult
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      lastResult = runBase(base, files, { basePath: 'perf.base' })
      totalMs += performance.now() - start
    }
    const median = totalMs / iterations
    console.log(`[bench] groupBy+summaries 1000 files: avg=${median.toFixed(2)}ms`)

    expect(lastResult!.views[0]?.groups?.length).toBe(3)
    expect(median).toBeLessThan(100)
  })
})
