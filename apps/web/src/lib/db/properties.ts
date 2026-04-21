import type Database from 'better-sqlite3'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

export type PropertyValueType = 'string' | 'number' | 'bool' | 'date' | 'list' | 'object' | 'null'

type Row = {
  path: string
  key: string
  value_text: string | null
  value_num: number | null
  value_type: PropertyValueType
}

export const PROPERTIES_SCHEMA = `
CREATE TABLE IF NOT EXISTS properties (
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  value_text TEXT,
  value_num REAL,
  value_type TEXT NOT NULL,
  PRIMARY KEY (path, key)
);
CREATE INDEX IF NOT EXISTS idx_properties_key_num ON properties(key, value_num);
CREATE INDEX IF NOT EXISTS idx_properties_key_text ON properties(key, value_text);
`

export function initPropertiesSchema(db: Database.Database): void {
  db.exec(PROPERTIES_SCHEMA)
}

export function upsertProperties(
  db: Database.Database,
  path: string,
  properties: Record<string, unknown>,
): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM properties WHERE path = ?').run(path)
    const insert = db.prepare(
      'INSERT INTO properties (path, key, value_text, value_num, value_type) VALUES (?, ?, ?, ?, ?)',
    )
    for (const [key, value] of Object.entries(properties)) {
      const { text, num, type } = encodeValue(value)
      insert.run(path, key, text, num, type)
    }
  })
  tx()
}

export function getProperties(db: Database.Database, path: string): Record<string, unknown> {
  const rows = db
    .prepare('SELECT key, value_text, value_num, value_type FROM properties WHERE path = ?')
    .all(path) as Omit<Row, 'path'>[]
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    out[row.key] = decodeValue(row.value_text, row.value_num, row.value_type)
  }
  return out
}

export type FileWithProperties = {
  path: string
  filename: string
  updated_at: number
  note: Record<string, unknown>
}

export function getAllFilesWithProperties(db: Database.Database): FileWithProperties[] {
  const files = db
    .prepare('SELECT path, filename, updated_at FROM files')
    .all() as { path: string; filename: string; updated_at: number }[]
  const rows = db
    .prepare('SELECT path, key, value_text, value_num, value_type FROM properties')
    .all() as Row[]

  const byPath = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    let bag = byPath.get(row.path)
    if (!bag) {
      bag = {}
      byPath.set(row.path, bag)
    }
    bag[row.key] = decodeValue(row.value_text, row.value_num, row.value_type)
  }
  return files.map((f) => ({ ...f, note: byPath.get(f.path) ?? {} }))
}

function encodeValue(value: unknown): {
  text: string | null
  num: number | null
  type: PropertyValueType
} {
  if (value === null || value === undefined) {
    return { text: null, num: null, type: 'null' }
  }
  if (typeof value === 'boolean') {
    return { text: value ? '1' : '0', num: value ? 1 : 0, type: 'bool' }
  }
  if (typeof value === 'number') {
    return { text: null, num: value, type: 'number' }
  }
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) {
      return { text: value, num: Date.parse(value), type: 'date' }
    }
    return { text: value, num: null, type: 'string' }
  }
  if (Array.isArray(value)) {
    return { text: JSON.stringify(value), num: null, type: 'list' }
  }
  if (value instanceof Date) {
    const iso = value.toISOString()
    return { text: iso, num: value.getTime(), type: 'date' }
  }
  if (typeof value === 'object') {
    return { text: JSON.stringify(value), num: null, type: 'object' }
  }
  return { text: String(value), num: null, type: 'string' }
}

function decodeValue(
  text: string | null,
  num: number | null,
  type: PropertyValueType,
): unknown {
  switch (type) {
    case 'null':
      return null
    case 'bool':
      return num === 1
    case 'number':
      return num
    case 'date':
      return text
    case 'string':
      return text
    case 'list':
    case 'object':
      return text ? JSON.parse(text) : null
  }
  return text
}
