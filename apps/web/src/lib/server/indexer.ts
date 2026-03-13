import path from 'path'
import { stat } from 'fs/promises'
import type { FileNode } from '@kotonoha/types'
import { getFileTree, readFileContent, resolveSafePath } from './vault.js'
import { extractWikilinks, extractTags } from './parser.js'
import {
  getDb,
  upsertFile,
  deleteFileRecord,
  getAllFiles,
  upsertLinks,
  upsertTags,
  upsertFts,
} from '$lib/db/index.js'
import { env } from './env.js'

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      result.push(...flattenFiles(node.children))
    } else if (!node.is_dir) {
      result.push(node)
    }
  }
  return result
}

export async function buildDifferentialIndex(): Promise<void> {
  const tree = await getFileTree()
  const currentFiles = flattenFiles(tree)
  const dbFiles = getAllFiles()
  const dbMap = new Map(dbFiles.map((f) => [f.path, f.updated_at]))
  const currentPaths = new Set(currentFiles.map((f) => f.path))

  const db = getDb()
  const transaction = db.transaction(() => {
    // Remove deleted files
    for (const dbFile of dbFiles) {
      if (!currentPaths.has(dbFile.path)) {
        deleteFileRecord(dbFile.path)
      }
    }
  })
  transaction()

  // Update new/modified files
  for (const file of currentFiles) {
    const dbUpdatedAt = dbMap.get(file.path)
    if (dbUpdatedAt !== undefined && file.updated_at !== undefined && Math.abs(dbUpdatedAt - file.updated_at) < 1000) {
      continue // No change
    }

    try {
      const { content } = await readFileContent(file.path)
      await updateFileIndex(file.path, content)
    } catch (err) {
      console.error(`Failed to index ${file.path}:`, err)
    }
  }
}

export async function updateFileIndex(filePath: string, content: string): Promise<void> {
  const absPath = resolveSafePath(filePath)
  const fileStat = await stat(absPath)
  const filename = path.basename(filePath)

  const wikilinks = extractWikilinks(content)
  const tags = extractTags(content)

  const db = getDb()
  const transaction = db.transaction(() => {
    upsertFile(filePath, filename, fileStat.mtimeMs)
    upsertLinks(filePath, wikilinks)
    upsertTags(filePath, tags)
    upsertFts(filePath, content)
  })
  transaction()
}

export async function removeFileIndex(filePath: string): Promise<void> {
  deleteFileRecord(filePath)
}
