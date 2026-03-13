import { writable } from 'svelte/store'
import type { FileNode, BacklinkResult } from '@kotonoha/types'
import { getFileTree, getFileContent, getBacklinksApi } from '$lib/api.js'

export const fileTree = writable<FileNode[]>([])
export const currentFilePath = writable<string | null>(null)
export const currentFileContent = writable<string>('')
export const currentBacklinks = writable<BacklinkResult[]>([])

export async function loadFileTree(): Promise<void> {
  const tree = await getFileTree()
  fileTree.set(tree)
}

export async function openFile(path: string): Promise<void> {
  const { content } = await getFileContent(path)
  currentFilePath.set(path)
  currentFileContent.set(content)

  // Load backlinks
  const filename = path.split('/').pop() ?? ''
  try {
    const backlinks = await getBacklinksApi(filename)
    currentBacklinks.set(backlinks)
  } catch {
    currentBacklinks.set([])
  }
}
