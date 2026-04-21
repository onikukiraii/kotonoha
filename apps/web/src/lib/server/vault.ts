import { readdir, readFile, writeFile, mkdir, unlink, rename, stat } from 'fs/promises'
import path from 'path'
import type { FileNode } from '@kotonoha/types'
import { env } from './env.js'

export function resolveSafePath(requestedPath: string): string {
  const resolved = path.resolve(env.VAULT_PATH, requestedPath)
  if (!resolved.startsWith(path.resolve(env.VAULT_PATH))) {
    throw new Error('Path traversal detected')
  }
  return resolved
}

export async function getFileTree(dirPath?: string): Promise<FileNode[]> {
  const targetDir = dirPath ? resolveSafePath(dirPath) : env.VAULT_PATH
  const entries = await readdir(targetDir, { withFileTypes: true })
  const nodes: FileNode[] = []

  const sorted = entries
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name, 'ja')
    })

  for (const entry of sorted) {
    const fullPath = path.join(targetDir, entry.name)
    const relativePath = path.relative(env.VAULT_PATH, fullPath)

    if (entry.isDirectory()) {
      const children = await getFileTree(relativePath)
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: relativePath,
          is_dir: true,
          children,
        })
      }
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.base')) {
      const fileStat = await stat(fullPath)
      nodes.push({
        name: entry.name,
        path: relativePath,
        is_dir: false,
        updated_at: fileStat.mtimeMs,
      })
    }
  }

  return nodes
}

export async function readFileContent(filePath: string): Promise<{ content: string; updated_at: number }> {
  const absPath = resolveSafePath(filePath)
  const content = await readFile(absPath, 'utf-8')
  const fileStat = await stat(absPath)
  return { content, updated_at: fileStat.mtimeMs }
}

export async function writeFileContent(filePath: string, content: string): Promise<number> {
  const absPath = resolveSafePath(filePath)
  await mkdir(path.dirname(absPath), { recursive: true })
  await writeFile(absPath, content, 'utf-8')
  const fileStat = await stat(absPath)
  return fileStat.mtimeMs
}

export async function createFile(filePath: string, content: string = ''): Promise<void> {
  const absPath = resolveSafePath(filePath)
  await mkdir(path.dirname(absPath), { recursive: true })
  await writeFile(absPath, content, 'utf-8')
}

export async function deleteFile(filePath: string): Promise<void> {
  const absPath = resolveSafePath(filePath)
  await unlink(absPath)
}

export async function renameFile(from: string, to: string): Promise<void> {
  const absFrom = resolveSafePath(from)
  const absTo = resolveSafePath(to)
  await mkdir(path.dirname(absTo), { recursive: true })
  await rename(absFrom, absTo)
}
