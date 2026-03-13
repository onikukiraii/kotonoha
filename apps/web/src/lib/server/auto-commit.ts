import { env } from './env.js'
import { gitAddAndCommit } from './git.js'

const pendingFiles = new Set<string>()
let idleTimer: ReturnType<typeof setTimeout> | null = null

export function markFileChanged(filePath: string): void {
  if (!env.AUTO_COMMIT) return

  pendingFiles.add(filePath)

  if (idleTimer) {
    clearTimeout(idleTimer)
  }

  idleTimer = setTimeout(
    () => {
      void commitPendingFiles()
    },
    env.AUTO_COMMIT_IDLE_SEC * 1000,
  )
}

async function commitPendingFiles(): Promise<void> {
  if (pendingFiles.size === 0) return

  const files = [...pendingFiles]
  pendingFiles.clear()
  idleTimer = null

  try {
    const message =
      files.length === 1
        ? `auto: update ${files[0].split('/').pop()}`
        : `auto: update ${files.length} file(s)`
    await gitAddAndCommit(files, message)
  } catch (err) {
    console.error('Auto-commit failed:', err)
    // Re-add files for next attempt
    for (const f of files) {
      pendingFiles.add(f)
    }
  }
}
