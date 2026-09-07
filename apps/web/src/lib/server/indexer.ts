import path from 'path'
import { stat } from 'fs/promises'
import type { FileNode } from '@kotonoha/types'
import { getFileTree, readFileContent, resolveSafePath } from './vault.js'
import { getDb, deleteFileRecord, getAllFiles } from '$lib/db/index.js'
import { indexMarkdownContent, indexBaseContent, indexHtmlContent } from './indexer-core.js'

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
    for (const dbFile of dbFiles) {
      if (!currentPaths.has(dbFile.path)) {
        deleteFileRecord(dbFile.path)
      }
    }
  })
  transaction()

  for (const file of currentFiles) {
    const dbUpdatedAt = dbMap.get(file.path)
    if (
      dbUpdatedAt !== undefined &&
      file.updated_at !== undefined &&
      Math.abs(dbUpdatedAt - file.updated_at) < 1000
    ) {
      continue
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
  const db = getDb()
  if (filePath.endsWith('.base')) {
    indexBaseContent(db, filePath, content, fileStat.mtimeMs)
  } else if (filePath.endsWith('.html')) {
    indexHtmlContent(db, filePath, content, fileStat.mtimeMs)
  } else {
    indexMarkdownContent(db, filePath, content, fileStat.mtimeMs)
  }
}

export async function removeFileIndex(filePath: string): Promise<void> {
  deleteFileRecord(filePath)
}

/** ファイルなら1件、フォルダなら配下の全ファイルを索引に入れ直す。 */
export async function indexPath(relPath: string): Promise<void> {
  const absPath = resolveSafePath(relPath)
  const entryStat = await stat(absPath)

  if (!entryStat.isDirectory()) {
    const { content } = await readFileContent(relPath)
    await updateFileIndex(relPath, content)
    return
  }

  for (const file of flattenFiles(await getFileTree(relPath))) {
    const { content } = await readFileContent(file.path)
    await updateFileIndex(file.path, content)
  }
}

/** パス自身と、その配下のファイルの索引を落とす。 */
export async function removeIndexUnder(relPath: string): Promise<void> {
  const prefix = `${relPath}/`
  for (const file of getAllFiles()) {
    if (file.path === relPath || file.path.startsWith(prefix)) {
      deleteFileRecord(file.path)
    }
  }
}

export { path }
