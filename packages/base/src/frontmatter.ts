import { parse as parseYaml } from 'yaml'

export type SplitResult = {
  fm: string | null
  body: string
  hadFrontmatter: boolean
}

export type PropertyType = 'string' | 'number' | 'bool' | 'date' | 'list' | 'object' | 'null'

export type TypedProperty = {
  type: PropertyType
  value: unknown
}

export type ParseResult =
  | {
      ok: true
      properties: Record<string, TypedProperty>
      body: string
      hadFrontmatter: boolean
    }
  | {
      ok: false
      error: 'yaml_parse_error'
    }

const DELIMITER = '---'
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

export function splitFrontmatter(md: string): SplitResult {
  const lines = md.split('\n')
  if (lines.length === 0 || lines[0] !== DELIMITER) {
    return { fm: null, body: md, hadFrontmatter: false }
  }
  let closeLine = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === DELIMITER) {
      closeLine = i
      break
    }
  }
  if (closeLine === -1) {
    return { fm: null, body: md, hadFrontmatter: false }
  }
  const fmLines = lines.slice(1, closeLine)
  const fm = fmLines.length > 0 ? fmLines.join('\n') + '\n' : ''
  const body = lines.slice(closeLine + 1).join('\n')
  return { fm, body, hadFrontmatter: true }
}

export function parseFrontmatter(md: string): ParseResult {
  const { fm, body, hadFrontmatter } = splitFrontmatter(md)
  if (!hadFrontmatter) {
    return { ok: true, properties: {}, body, hadFrontmatter: false }
  }
  if (fm === null || fm.trim() === '') {
    return { ok: true, properties: {}, body, hadFrontmatter: true }
  }

  let parsed: unknown
  try {
    parsed = parseYaml(fm, { schema: 'core' })
  } catch {
    return { ok: false, error: 'yaml_parse_error' }
  }

  if (parsed === null || parsed === undefined) {
    return { ok: true, properties: {}, body, hadFrontmatter: true }
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'yaml_parse_error' }
  }

  const properties: Record<string, TypedProperty> = {}
  for (const [key, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    properties[key] = inferType(rawValue)
  }

  return { ok: true, properties, body, hadFrontmatter: true }
}

function inferType(value: unknown): TypedProperty {
  if (value === null || value === undefined) return { type: 'null', value: null }
  if (typeof value === 'boolean') return { type: 'bool', value }
  if (typeof value === 'number') return { type: 'number', value }
  if (Array.isArray(value)) return { type: 'list', value }
  if (value instanceof Date) {
    return { type: 'date', value: value.toISOString() }
  }
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) return { type: 'date', value }
    return { type: 'string', value }
  }
  if (typeof value === 'object') return { type: 'object', value }
  return { type: 'string', value: String(value) }
}
