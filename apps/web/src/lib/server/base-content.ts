import type Database from 'better-sqlite3'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { indexBaseContent } from './indexer-core.js'

type ReadOpts = { vaultRoot: string; basePath: string }
type WriteOpts = {
  db: Database.Database
  vaultRoot: string
  basePath: string
  yaml: string
}

function guardBasePath(vaultRoot: string, basePath: string): string {
  if (!basePath.endsWith('.base')) throw new Error('path must end with .base')
  const abs = resolve(vaultRoot, basePath)
  const normRoot = resolve(vaultRoot)
  if (!abs.startsWith(normRoot + '/') && abs !== normRoot) {
    throw new Error('Path traversal detected')
  }
  return abs
}

export async function readBaseContent(opts: ReadOpts): Promise<string> {
  const abs = guardBasePath(opts.vaultRoot, opts.basePath)
  return readFile(abs, 'utf-8')
}

export async function writeBaseContent(opts: WriteOpts): Promise<void> {
  const abs = guardBasePath(opts.vaultRoot, opts.basePath)
  await writeFile(abs, opts.yaml, 'utf-8')
  const mtime = (await stat(abs)).mtimeMs
  indexBaseContent(opts.db, opts.basePath, opts.yaml, mtime)
}
