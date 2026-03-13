import { writable, get } from 'svelte/store'
import { saveFileContent } from '$lib/api.js'
import { currentFilePath } from './vault.js'

export const isDirty = writable(false)

let saveTimer: ReturnType<typeof setTimeout> | null = null

export function markDirty(): void {
  isDirty.set(true)
}

export function scheduleSave(content: string): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void saveCurrentFile(content)
  }, 1000)
}

export async function saveCurrentFile(content: string): Promise<void> {
  const path = get(currentFilePath)
  if (!path) return

  try {
    await saveFileContent(path, content)
    isDirty.set(false)
  } catch (err) {
    console.error('Save failed:', err)
  }
}
