import type Database from 'better-sqlite3'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseBase, runBase, type IndexedFile, type QueryResult } from '@kotonoha/base'
import { getBaseFile } from '$lib/db/bases.js'

type RunOpts = {
  db: Database.Database
  vaultRoot: string
  basePath: string
}

export async function runBaseFile(opts: RunOpts): Promise<QueryResult> {
  const { db, vaultRoot, basePath } = opts
  const cached = getBaseFile(db, basePath)
  let rawYaml: string | null = cached?.raw_yaml ?? null
  if (rawYaml === null) {
    try {
      rawYaml = await readFile(join(vaultRoot, basePath), 'utf-8')
    } catch {
      throw new Error(`base file not found: ${basePath}`)
    }
  }
  const base = parseBase(rawYaml)
  const files = loadIndexedFiles(db)
  return runBase(base, files, { basePath })
}

function loadIndexedFiles(db: Database.Database): IndexedFile[] {
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

  const tagRows = db.prepare('SELECT path, tag FROM tags').all() as {
    path: string
    tag: string
  }[]
  const tagsByPath = new Map<string, string[]>()
  for (const row of tagRows) {
    const arr = tagsByPath.get(row.path) ?? []
    arr.push(row.tag)
    tagsByPath.set(row.path, arr)
  }

  const linkRows = db.prepare('SELECT source_path, target FROM links').all() as {
    source_path: string
    target: string
  }[]
  const linksByPath = new Map<string, string[]>()
  const backlinksByPath = new Map<string, string[]>()
  for (const row of linkRows) {
    const fwd = linksByPath.get(row.source_path) ?? []
    fwd.push(row.target)
    linksByPath.set(row.source_path, fwd)
    const bk = backlinksByPath.get(row.target) ?? []
    bk.push(row.source_path)
    backlinksByPath.set(row.target, bk)
  }

  return fileRows.map((f) => ({
    path: f.path,
    name: f.filename,
    basename: f.filename.replace(/\.md$/, ''),
    folder: f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '',
    size: 0,
    ctime: f.updated_at,
    mtime: f.updated_at,
    tags: tagsByPath.get(f.path) ?? [],
    links: linksByPath.get(f.path) ?? [],
    backlinks: backlinksByPath.get(f.path) ?? [],
    note: propsByPath.get(f.path) ?? {},
  }))
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
