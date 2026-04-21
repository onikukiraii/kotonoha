import type { IndexedFile } from './query.js'

export type DetectedType = 'string' | 'number' | 'bool' | 'date' | 'list' | 'object' | 'null'

export type PropertyStat = {
  name: string
  types: DetectedType[]
  sampleValues: unknown[]
  count: number
}

export type PropertySchema = {
  keys: PropertyStat[]
}

export type SummarizeOpts = {
  folder?: string
  limit?: number
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

export function summarizeProperties(
  files: IndexedFile[],
  opts: SummarizeOpts = {},
): PropertySchema {
  const limit = opts.limit ?? 5
  const byKey = new Map<
    string,
    { types: Set<DetectedType>; samples: unknown[]; seen: Set<string>; count: number }
  >()

  for (const file of files) {
    if (opts.folder !== undefined && opts.folder !== '') {
      const folder = opts.folder
      if (!file.path.startsWith(folder + '/') && file.path !== folder) continue
    }
    const note = file.note ?? {}
    for (const [key, value] of Object.entries(note)) {
      if (value === undefined) continue
      let bucket = byKey.get(key)
      if (!bucket) {
        bucket = { types: new Set(), samples: [], seen: new Set(), count: 0 }
        byKey.set(key, bucket)
      }
      bucket.count += 1
      bucket.types.add(detectType(value))
      const sig = stringify(value)
      if (!bucket.seen.has(sig) && bucket.samples.length < limit) {
        bucket.seen.add(sig)
        bucket.samples.push(value)
      }
    }
  }

  const keys: PropertyStat[] = Array.from(byKey.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, bucket]) => ({
      name,
      types: Array.from(bucket.types).sort(),
      sampleValues: bucket.samples,
      count: bucket.count,
    }))

  return { keys }
}

function detectType(value: unknown): DetectedType {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) return 'date'
    return 'string'
  }
  if (typeof value === 'object') return 'object'
  return 'string'
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
