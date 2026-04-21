import type { BaseFile, BaseView, FilterNode, SortSpec, ViewType } from './schema.js'
import type { FileCtx } from './filter/evaluate.js'
import { evaluateFilter } from './filter/evaluate.js'
import { compileExpression } from './filter/compile.js'
import { buildFileCtx, type IndexedFileInput } from './fileCtx.js'
import { applySummary } from './summaries.js'

export type IndexedFile = IndexedFileInput & {
  note: Record<string, unknown>
}

export type Row = {
  path: string
  properties: Record<string, unknown>
}

export type Group = {
  key: string
  rows: Row[]
  summaries: Record<string, unknown>
}

export type ViewResult = {
  name: string
  type: ViewType
  columns: string[]
  image?: string
  rows?: Row[]
  groups?: Group[]
  summaries?: Record<string, unknown>
}

export type QueryResult = {
  basePath: string
  views: ViewResult[]
}

export type RunOptions = {
  basePath: string
}

type Scope = {
  file: FileCtx
  note: Record<string, unknown>
  formula: Record<string, unknown>
  path: string
}

export function runBase(base: BaseFile, files: IndexedFile[], opts: RunOptions): QueryResult {
  const scopes: Scope[] = files.map((f) => ({
    file: buildFileCtx(f),
    note: f.note ?? {},
    formula: {},
    path: f.path,
  }))

  const globalFiltered = base.filters
    ? scopes.filter((s) => evaluateFilter(base.filters!, scopeToEvalCtx(s)))
    : scopes

  for (const s of globalFiltered) {
    s.formula = computeFormulas(base.formulas, s)
  }

  const views = base.views.map((v) => runView(v, base, globalFiltered))
  return { basePath: opts.basePath, views }
}

function scopeToEvalCtx(s: Scope) {
  return { file: s.file, note: s.note, formula: s.formula }
}

function computeFormulas(formulas: Record<string, string>, s: Scope): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const proxyScope: Scope = { ...s, formula: out }
  for (const [name, expr] of Object.entries(formulas)) {
    const fn = compileExpression(expr)
    out[name] = fn(scopeToEvalCtx(proxyScope))
  }
  return out
}

function runView(view: BaseView, base: BaseFile, scopes: Scope[]): ViewResult {
  let filtered = view.filters
    ? scopes.filter((s) => evaluateFilter(view.filters!, scopeToEvalCtx(s)))
    : scopes

  if (view.sort && view.sort.length > 0) {
    filtered = sortScopes(filtered, view.sort, base)
  }

  const columns = view.order ? [...view.order] : []
  const rows: Row[] = filtered.map((s) => buildRow(s, columns, view))

  const result: ViewResult = {
    name: view.name,
    type: view.type,
    columns,
  }
  if (view.image) result.image = view.image

  if (view.groupBy) {
    const grouped = groupRows(rows, filtered, view.groupBy.property, view.summaries ?? {})
    result.groups = grouped
  } else {
    let finalRows = rows
    if (view.limit !== undefined) finalRows = finalRows.slice(0, view.limit)
    result.rows = finalRows
    result.summaries = computeGroupSummaries(filtered, view.summaries ?? {})
  }

  return result
}

function sortScopes(scopes: Scope[], sort: SortSpec[], _base: BaseFile): Scope[] {
  return scopes.slice().sort((a, b) => {
    for (const s of sort) {
      const va = resolveColumn(a, s.column)
      const vb = resolveColumn(b, s.column)
      const c = compareValues(va, vb)
      if (c !== 0) return s.direction === 'asc' ? c : -c
    }
    return 0
  })
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const as = String(a)
  const bs = String(b)
  if (as < bs) return -1
  if (as > bs) return 1
  return 0
}

function buildRow(s: Scope, columns: string[], view: BaseView): Row {
  const props: Record<string, unknown> = {}
  for (const col of columns) {
    props[col] = resolveColumn(s, col)
  }
  if (view.image) {
    const v = resolveColumn(s, view.image)
    props[view.image] = v === undefined ? null : v
  }
  return { path: s.path, properties: props }
}

function resolveColumn(s: Scope, key: string): unknown {
  if (key.startsWith('file.')) {
    const k = key.slice(5) as keyof FileCtx
    return s.file[k]
  }
  if (key.startsWith('formula.')) {
    return s.formula[key.slice(8)]
  }
  if (key.startsWith('note.')) {
    return s.note[key.slice(5)]
  }
  if (Object.prototype.hasOwnProperty.call(s.note, key)) return s.note[key]
  if (Object.prototype.hasOwnProperty.call(s.formula, key)) return s.formula[key]
  return undefined
}

function groupRows(
  rows: Row[],
  scopes: Scope[],
  propertyKey: string,
  summarySpec: Record<string, string>,
): Group[] {
  const buckets = new Map<string, { rows: Row[]; scopes: Scope[] }>()
  rows.forEach((row, i) => {
    const s = scopes[i]!
    const key = String(resolveColumn(s, propertyKey) ?? '')
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { rows: [], scopes: [] }
      buckets.set(key, bucket)
    }
    bucket.rows.push(row)
    bucket.scopes.push(s)
  })

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, { rows, scopes }]) => ({
      key,
      rows,
      summaries: computeGroupSummaries(scopes, summarySpec),
    }))
}

function computeGroupSummaries(
  scopes: Scope[],
  spec: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [col, fnName] of Object.entries(spec)) {
    const values = scopes.map((s) => resolveColumn(s, col))
    out[col] = applySummary(fnName, values)
  }
  return out
}
