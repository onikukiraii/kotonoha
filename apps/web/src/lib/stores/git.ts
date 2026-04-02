import { writable } from 'svelte/store'
import type { GitStatus } from '@kotonoha/types'
import { getGitStatus, gitPullApi, gitCommitPush } from '$lib/api.js'

export const gitState = writable<GitStatus | null>(null)
export const gitLoading = writable(false)
export const gitError = writable<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null
let backupTimer: ReturnType<typeof setInterval> | null = null

export async function loadGitStatus(): Promise<void> {
  try {
    const status = await getGitStatus()
    gitState.set(status)
    gitError.set(null)
  } catch (err) {
    gitError.set('Failed to get git status')
  }
}

export async function pullFromRemote(): Promise<{ updated: boolean; conflicts: string[] }> {
  gitLoading.set(true)
  try {
    const result = await gitPullApi()
    await loadGitStatus()
    gitLoading.set(false)
    return result
  } catch (err) {
    gitLoading.set(false)
    throw err
  }
}

export async function commitAndPush(message?: string): Promise<void> {
  gitLoading.set(true)
  try {
    await gitCommitPush(message)
    await loadGitStatus()
  } finally {
    gitLoading.set(false)
  }
}

/** 未pushの変更があればcommit+pushする（safety net） */
async function autoBackup(): Promise<void> {
  try {
    const status = await getGitStatus()
    const hasChanges =
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0
    if (!hasChanges) return

    await gitCommitPush()
    await loadGitStatus()
  } catch {
    // auto-backup failure should not disrupt the app
  }
}

export function startStatusPolling(intervalMs = 30000): void {
  stopStatusPolling()
  void loadGitStatus()
  pollTimer = setInterval(() => {
    void loadGitStatus()
  }, intervalMs)
  // Auto-backup every 5 minutes (safety net for external changes)
  backupTimer = setInterval(() => {
    void autoBackup()
  }, 300000)
}

export function stopStatusPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (backupTimer) {
    clearInterval(backupTimer)
    backupTimer = null
  }
}
