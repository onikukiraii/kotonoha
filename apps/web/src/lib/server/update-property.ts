import type Database from 'better-sqlite3'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { updateFrontmatterProperty } from '@kotonoha/base'
import { indexMarkdownContent } from './indexer-core.js'

type UpdateOpts = {
  db: Database.Database
  vaultRoot: string
  filePath: string
  key: string
  value: unknown
}

export async function updateFileProperty(opts: UpdateOpts): Promise<void> {
  const { db, vaultRoot, filePath, key, value } = opts
  if (!filePath.endsWith('.md')) {
    throw new Error('only .md files support property updates')
  }
  const abs = resolve(vaultRoot, filePath)
  const normRoot = resolve(vaultRoot)
  if (!abs.startsWith(normRoot + '/') && abs !== normRoot) {
    throw new Error('Path traversal detected')
  }

  const current = await readFile(abs, 'utf-8')
  const updated = updateFrontmatterProperty(current, key, value)
  if (updated !== current) {
    await writeFile(abs, updated, 'utf-8')
  }
  const mtime = (await stat(abs)).mtimeMs
  indexMarkdownContent(db, filePath, updated, mtime)
}

export async function updateFilePropertyByVault(
  db: Database.Database,
  vaultRoot: string,
  filePath: string,
  key: string,
  value: unknown,
): Promise<void> {
  return updateFileProperty({ db, vaultRoot, filePath, key, value })
}

export const _paths = { join } as const
