import type Database from 'better-sqlite3'
import { summarizeProperties, type PropertySchema, type IndexedFile } from '@kotonoha/base'

type Opts = {
  folder: string | null
  limit?: number
}

export function readVaultSchema(db: Database.Database, opts: Opts): PropertySchema {
  const fileRows = db
    .prepare('SELECT path, filename, updated_at FROM files')
    .all() as { path: string; filename: string; updated_at: number }[]

  const propRows = db
    .prepare('SELECT path, key, value_text, value_num, value_type FROM properties')
    .all() as {
      path: string
      key: string
      value_text: string | null
      value_num: number | null
      value_type: string
    }[]

  const propsByPath = new Map<string, Record<string, unknown>>()
  for (const row of propRows) {
    let bag = propsByPath.get(row.path)
    if (!bag) {
      bag = {}
      propsByPath.set(row.path, bag)
    }
    bag[row.key] = decodeValue(row.value_text, row.value_num, row.value_type)
  }

  const files: IndexedFile[] = fileRows.map((f) => ({
    path: f.path,
    tags: [],
    links: [],
    backlinks: [],
    note: propsByPath.get(f.path) ?? {},
  }))

  return summarizeProperties(files, {
    folder: opts.folder ?? undefined,
    limit: opts.limit,
  })
}

function decodeValue(text: string | null, num: number | null, type: string): unknown {
  switch (type) {
    case 'null':
      return null
    case 'bool':
      return num === 1
    case 'number':
      return num
    case 'date':
    case 'string':
      return text
    case 'list':
    case 'object':
      return text ? JSON.parse(text) : null
  }
  return text
}
