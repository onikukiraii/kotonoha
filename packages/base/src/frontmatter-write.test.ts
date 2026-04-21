import { describe, it, expect } from 'vitest'
import { updateFrontmatterProperty } from './frontmatter-write.js'

describe('updateFrontmatterProperty', () => {
  it('updates an existing scalar property, preserving body', () => {
    const md = `---
status: active
priority: high
---

# Body

more
`
    const updated = updateFrontmatterProperty(md, 'status', 'done')
    expect(updated).toBe(`---
status: done
priority: high
---

# Body

more
`)
  })

  it('adds a new property to existing frontmatter (keeps key order)', () => {
    const md = `---
status: active
---

Body
`
    const updated = updateFrontmatterProperty(md, 'priority', 'high')
    expect(updated).toBe(`---
status: active
priority: high
---

Body
`)
  })

  it('creates frontmatter when none exists', () => {
    const md = `# Title

Body.
`
    const updated = updateFrontmatterProperty(md, 'status', 'draft')
    expect(updated).toBe(`---
status: draft
---
# Title

Body.
`)
  })

  it('preserves comments on other lines', () => {
    const md = `---
# a comment above status
status: active
priority: high
---

Body
`
    const updated = updateFrontmatterProperty(md, 'status', 'done')
    expect(updated).toContain('# a comment above status')
    expect(updated).toContain('status: done')
    expect(updated).toContain('priority: high')
  })

  it('updates numeric type', () => {
    const md = `---
progress: 30
---

body
`
    const updated = updateFrontmatterProperty(md, 'progress', 80)
    expect(updated).toContain('progress: 80')
  })

  it('updates boolean type', () => {
    const md = `---
finished: false
---

body
`
    const updated = updateFrontmatterProperty(md, 'finished', true)
    expect(updated).toContain('finished: true')
  })

  it('updates list type', () => {
    const md = `---
tags:
  - work
---

body
`
    const updated = updateFrontmatterProperty(md, 'tags', ['work', 'urgent'])
    expect(updated).toContain('work')
    expect(updated).toContain('urgent')
  })

  it('writes date as ISO string without quoting if YAML accepts it', () => {
    const md = `---
due_date: 2026-01-01
---

body
`
    const updated = updateFrontmatterProperty(md, 'due_date', '2026-06-30')
    expect(updated).toContain('due_date: 2026-06-30')
  })
})
