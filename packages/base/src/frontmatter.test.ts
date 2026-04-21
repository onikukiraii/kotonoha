import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { splitFrontmatter, parseFrontmatter } from './frontmatter.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(__dirname, '..', 'test-fixtures', 'frontmatter')

function read(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

const EXPECTED = JSON.parse(read('expected.json')) as Record<string, unknown>

describe('splitFrontmatter', () => {
  it('extracts frontmatter block and body when both exist', () => {
    const md = '---\ntitle: Hello\nstatus: active\n---\n\nBody goes here.\n'
    const { fm, body, hadFrontmatter } = splitFrontmatter(md)
    expect(hadFrontmatter).toBe(true)
    expect(fm).toBe('title: Hello\nstatus: active\n')
    expect(body).toBe('\nBody goes here.\n')
  })

  it('returns fm=null when no --- delimiter exists', () => {
    const md = '# Plain note\n\nNo frontmatter.\n'
    const { fm, body, hadFrontmatter } = splitFrontmatter(md)
    expect(hadFrontmatter).toBe(false)
    expect(fm).toBeNull()
    expect(body).toBe(md)
  })

  it('handles empty frontmatter block', () => {
    const md = '---\n---\n\nBody only.\n'
    const { fm, body, hadFrontmatter } = splitFrontmatter(md)
    expect(hadFrontmatter).toBe(true)
    expect(fm).toBe('')
    expect(body).toBe('\nBody only.\n')
  })

  it('requires --- to be at the very start (first line)', () => {
    const md = '\n---\ntitle: x\n---\nbody\n'
    const { fm, hadFrontmatter } = splitFrontmatter(md)
    expect(hadFrontmatter).toBe(false)
    expect(fm).toBeNull()
  })

  it('only extracts the first --- ... --- block', () => {
    const md = '---\na: 1\n---\n\nBody with --- inside\n---\nnot-fm: true\n---\n'
    const { fm } = splitFrontmatter(md)
    expect(fm).toBe('a: 1\n')
  })
})

describe('parseFrontmatter', () => {
  it.each([
    ['simple.md'],
    ['date.md'],
    ['nested.md'],
    ['no-fm.md'],
    ['empty-fm.md'],
  ])('matches golden expected.json for %s', (name) => {
    const md = read(name)
    const result = parseFrontmatter(md)
    expect(result).toEqual(EXPECTED[name])
  })

  it('returns ok=false with yaml_parse_error for malformed YAML', () => {
    const md = read('invalid.md')
    const result = parseFrontmatter(md) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toBe('yaml_parse_error')
  })
})
