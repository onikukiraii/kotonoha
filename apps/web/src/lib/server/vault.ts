import { readdir, readFile, writeFile, mkdir, rm, rename, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type { FileNode } from '@kotonoha/types'
import { env } from './env.js'

export function resolveSafePath(requestedPath: string): string {
  const root = path.resolve(env.VAULT_PATH)
  const resolved = path.resolve(root, requestedPath)
  if (!resolved.startsWith(root + path.sep)) {
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
      nodes.push({
        name: entry.name,
        path: relativePath,
        is_dir: true,
        children: await getFileTree(relativePath),
      })
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.base') || entry.name.endsWith('.html')) {
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

export class AlreadyExistsError extends Error {}

export async function createFile(filePath: string, content: string = ''): Promise<void> {
  const absPath = resolveSafePath(filePath)
  if (existsSync(absPath)) {
    throw new AlreadyExistsError(`${filePath} already exists`)
  }
  await mkdir(path.dirname(absPath), { recursive: true })
  await writeFile(absPath, content, 'utf-8')
}

export async function createFolder(dirPath: string): Promise<void> {
  const absPath = resolveSafePath(dirPath)
  if (existsSync(absPath)) {
    throw new AlreadyExistsError(`${dirPath} already exists`)
  }
  await mkdir(absPath, { recursive: true })
}

export async function deleteEntry(entryPath: string): Promise<void> {
  const absPath = resolveSafePath(entryPath)
  await rm(absPath, { recursive: true })
}

export async function renameFile(from: string, to: string): Promise<void> {
  const absFrom = resolveSafePath(from)
  const absTo = resolveSafePath(to)
  if (existsSync(absTo)) {
    throw new AlreadyExistsError(`${to} already exists`)
  }
  await mkdir(path.dirname(absTo), { recursive: true })
  await rename(absFrom, absTo)
}
