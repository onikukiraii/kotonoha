import { parse as parseYaml } from 'yaml'
import type {
  BaseFile,
  BaseView,
  FilterNode,
  GroupBySpec,
  PropertyMeta,
  SortSpec,
  SummarySpec,
  ViewType,
} from './schema.js'

export class BaseParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BaseParseError'
  }
}

export function parseBase(yaml: string): BaseFile {
  if (yaml.trim() === '') {
    return { formulas: {}, properties: {}, summaries: {}, views: [] }
  }
  let raw: unknown
  try {
    raw = parseYaml(yaml, { schema: 'core' })
  } catch (e) {
    throw new BaseParseError(`invalid yaml: ${(e as Error).message}`)
  }
  if (raw === null || raw === undefined) {
    return { formulas: {}, properties: {}, summaries: {}, views: [] }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BaseParseError('top-level of a .base file must be a mapping')
  }
  const obj = raw as Record<string, unknown>

  const base: BaseFile = {
    formulas: asStringMap(obj['formulas']),
    properties: asPropertyMap(obj['properties']),
    summaries: asStringMap(obj['summaries']),
    views: asViews(obj['views']),
  }
  if (obj['filters'] !== undefined) {
    base.filters = toFilterNode(obj['filters'])
  }
  return base
}

function toFilterNode(input: unknown): FilterNode {
  if (typeof input === 'string') {
    return { kind: 'and', children: [{ kind: 'expr', source: input }] }
  }
  if (Array.isArray(input)) {
    return { kind: 'and', children: input.map(toFilterChild) }
  }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length !== 1) {
      throw new BaseParseError(
        `filter object must have exactly one of and/or/not, got: ${keys.join(', ')}`,
      )
    }
    const key = keys[0]!
    if (key !== 'and' && key !== 'or' && key !== 'not') {
      throw new BaseParseError(`unknown filter operator: ${key}`)
    }
    const children = obj[key]
    if (!Array.isArray(children)) {
      throw new BaseParseError(`filter.${key} must be a list`)
    }
    return { kind: key, children: children.map(toFilterChild) }
  }
  throw new BaseParseError(`unexpected filter shape: ${typeof input}`)
}

function toFilterChild(input: unknown): FilterNode {
  if (typeof input === 'string') {
    return { kind: 'expr', source: input }
  }
  return toFilterNode(input)
}

function asStringMap(input: unknown): Record<string, string> {
  if (input === undefined || input === null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BaseParseError('expected mapping of name → expression')
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new BaseParseError(`value for "${k}" must be a string expression`)
    }
    out[k] = v
  }
  return out
}

function asPropertyMap(input: unknown): Record<string, PropertyMeta> {
  if (input === undefined || input === null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BaseParseError('properties must be a mapping')
  }
  const out: Record<string, PropertyMeta> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) {
      out[k] = {}
      continue
    }
    if (typeof v !== 'object' || Array.isArray(v)) {
      throw new BaseParseError(`properties.${k} must be a mapping`)
    }
    const meta = v as Record<string, unknown>
    const entry: PropertyMeta = {}
    if (typeof meta['displayName'] === 'string') {
      entry.displayName = meta['displayName']
    }
    out[k] = entry
  }
  return out
}

function asViews(input: unknown): BaseView[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    throw new BaseParseError('views must be a list')
  }
  return input.map((v, i) => toView(v, i))
}

function toView(input: unknown, index: number): BaseView {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BaseParseError(`views[${index}] must be a mapping`)
  }
  const obj = input as Record<string, unknown>
  const type = obj['type']
  if (type !== 'table' && type !== 'cards' && type !== 'list') {
    throw new BaseParseError(`views[${index}].type must be one of table/cards/list`)
  }
  const name = typeof obj['name'] === 'string' ? obj['name'] : `view-${index}`
  const view: BaseView = { type: type as ViewType, name }

  if (obj['filters'] !== undefined) {
    view.filters = toFilterNode(obj['filters'])
  }
  if (Array.isArray(obj['order'])) {
    view.order = (obj['order'] as unknown[]).map((x) => String(x))
  }
  if (Array.isArray(obj['sort'])) {
    view.sort = (obj['sort'] as unknown[]).map(toSortSpec)
  }
  if (typeof obj['limit'] === 'number') {
    view.limit = obj['limit']
  }
  if (obj['groupBy'] !== undefined) {
    view.groupBy = toGroupBy(obj['groupBy'])
  }
  if (obj['summaries'] !== undefined) {
    view.summaries = toSummary(obj['summaries'])
  }
  if (typeof obj['image'] === 'string') {
    view.image = obj['image']
  }
  return view
}

function toSortSpec(input: unknown): SortSpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BaseParseError('sort entry must be a mapping with column + direction')
  }
  const obj = input as Record<string, unknown>
  const column = obj['column']
  const direction = obj['direction']
  if (typeof column !== 'string') {
    throw new BaseParseError('sort.column must be a string')
  }
  if (direction !== 'asc' && direction !== 'desc') {
    throw new BaseParseError('sort.direction must be "asc" or "desc"')
  }
  return { column, direction }
}

function toGroupBy(input: unknown): GroupBySpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BaseParseError('groupBy must be a mapping')
  }
  const property = (input as Record<string, unknown>)['property']
  if (typeof property !== 'string') {
    throw new BaseParseError('groupBy.property must be a string')
  }
  return { property }
}

function toSummary(input: unknown): SummarySpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BaseParseError('summaries must be a mapping')
  }
  const out: SummarySpec = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new BaseParseError(`summaries.${k} must be a string (e.g. "Sum")`)
    }
    out[k] = v
  }
  return out
}
