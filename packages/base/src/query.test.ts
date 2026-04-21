import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, posix, sep } from 'node:path'
import { runBase } from './query.js'
import { parseBase } from './parser.js'
import { parseFrontmatter } from './frontmatter.js'
import type { IndexedFile } from './query.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VAULT = join(__dirname, '..', 'test-fixtures', 'vault')
const GOLDEN = join(__dirname, '..', 'test-fixtures', 'golden')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function loadVault(): IndexedFile[] {
  const files: IndexedFile[] = []
  for (const abs of walk(VAULT)) {
    if (!abs.endsWith('.md')) continue
    const content = readFileSync(abs, 'utf-8')
    const parsed = parseFrontmatter(content)
    const rel = relative(VAULT, abs).split(sep).join(posix.sep)
    const stat = statSync(abs)
    const note: Record<string, unknown> = {}
    if (parsed.ok) {
      for (const [k, v] of Object.entries(parsed.properties)) {
        note[k] = v.value
      }
    }
    files.push({
      path: rel,
      name: rel.split('/').pop()!,
      basename: rel.split('/').pop()!.replace(/\.md$/, ''),
      folder: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '',
      size: stat.size,
      ctime: Math.floor(stat.birthtimeMs),
      mtime: Math.floor(stat.mtimeMs),
      tags: [],
      links: [],
      backlinks: [],
      note,
    })
  }
  return files
}

const read = (p: string) => readFileSync(p, 'utf-8')
const golden = (p: string) => JSON.parse(read(join(GOLDEN, p)))

describe('runBase — tasks.base', () => {
  it('matches tasks.expected.json', () => {
    const base = parseBase(read(join(VAULT, 'tasks.base')))
    const files = loadVault()
    const result = runBase(base, files, { basePath: 'tasks.base' })
    expect(result).toEqual(golden('tasks.expected.json'))
  })
})

describe('runBase — library.base', () => {
  it('matches library.expected.json', () => {
    const base = parseBase(read(join(VAULT, 'library.base')))
    const files = loadVault()
    const result = runBase(base, files, { basePath: 'library.base' })
    expect(result).toEqual(golden('library.expected.json'))
  })
})

describe('runBase — overdue.base', () => {
  it('matches overdue.expected.json', () => {
    const base = parseBase(read(join(VAULT, 'overdue.base')))
    const files = loadVault()
    const result = runBase(base, files, { basePath: 'overdue.base' })
    const expected = golden('overdue.expected.json')
    delete expected._note
    expect(result).toEqual(expected)
  })
})
