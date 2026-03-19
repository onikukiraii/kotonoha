import simpleGit, { type SimpleGit } from 'simple-git'
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { GitStatus } from '@kotonoha/types'
import { env } from './env.js'

let gitLock = Promise.resolve<unknown>(undefined)

function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = gitLock.then(fn, fn)
  gitLock = next.catch(() => {})
  return next as Promise<T>
}

function getGit(): SimpleGit {
  const git = simpleGit(env.VAULT_PATH)
  return git
}

function getAuthUrl(): string {
  if (!env.GITHUB_REPO_URL || !env.GITHUB_PAT) return ''
  const url = new URL(env.GITHUB_REPO_URL)
  url.username = 'x-access-token'
  url.password = env.GITHUB_PAT
  return url.toString()
}

async function configureGitUser(): Promise<void> {
  await simpleGit().raw(['config', '--global', 'user.name', env.GIT_USER_NAME])
  await simpleGit().raw(['config', '--global', 'user.email', env.GIT_USER_EMAIL])
}

/**
 * 競合マーカーを除去して両方の内容を結合する
 * <<<<<<< / ======= / >>>>>>> マーカーを取り除き、両側の内容を保持する
 */
function resolveConflictMarkers(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let inConflict = false
  let inOurs = false

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inConflict = true
      inOurs = true
      continue
    }
    if (line.startsWith('=======') && inConflict) {
      inOurs = false
      continue
    }
    if (line.startsWith('>>>>>>>') && inConflict) {
      inConflict = false
      inOurs = false
      continue
    }
    result.push(line)
  }

  return result.join('\n')
}

/**
 * 競合ファイルを自動解決（両方の内容をマージ）してコミットする
 */
async function resolveConflictsAndCommit(git: SimpleGit): Promise<string[]> {
  const status = await git.status()
  const conflicted = status.conflicted
  if (conflicted.length === 0) return []

  console.log(`[git] resolving ${conflicted.length} conflicted file(s):`, conflicted)

  for (const file of conflicted) {
    const filePath = path.join(env.VAULT_PATH, file)
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8')
      const resolved = resolveConflictMarkers(content)
      writeFileSync(filePath, resolved, 'utf-8')
      console.log(`[git] resolved conflicts in: ${file}`)
    }
    await git.add(file)
  }

  await git.commit('auto: resolve merge conflicts (keep both changes)')
  console.log('[git] committed conflict resolution')
  return conflicted
}

/**
 * rebaseではなくmergeでpullし、競合があれば自動解決する
 */
async function pullWithConflictResolution(git: SimpleGit): Promise<{ updated: boolean; resolved: string[] }> {
  try {
    const result = await git.pull('origin', 'main')
    return { updated: result.files.length > 0, resolved: [] }
  } catch (pullErr) {
    // merge競合が発生した場合、自動解決を試みる
    const status = await git.status()
    if (status.conflicted.length > 0) {
      const resolved = await resolveConflictsAndCommit(git)
      return { updated: true, resolved }
    }
    throw pullErr
  }
}

export async function initOrCloneVault(): Promise<void> {
  return withGitLock(async () => {
    const gitDir = path.join(env.VAULT_PATH, '.git')

    if (existsSync(gitDir)) {
      // Already a git repo, commit local changes then pull
      try {
        const git = getGit()
        await configureGitUser()
        const authUrl = getAuthUrl()
        if (authUrl) {
          await git.remote(['set-url', 'origin', authUrl])
        }

        // rebase途中の状態が残っていたらabortする
        try {
          const rebaseDir = path.join(env.VAULT_PATH, '.git', 'rebase-merge')
          const rebaseApplyDir = path.join(env.VAULT_PATH, '.git', 'rebase-apply')
          if (existsSync(rebaseDir) || existsSync(rebaseApplyDir)) {
            console.log('[git] aborting incomplete rebase from previous session')
            await git.rebase(['--abort'])
          }
        } catch {
          // rebase --abort自体が失敗しても続行
        }

        // merge途中の状態が残っていたらabortする
        try {
          const mergeHead = path.join(env.VAULT_PATH, '.git', 'MERGE_HEAD')
          if (existsSync(mergeHead)) {
            console.log('[git] aborting incomplete merge from previous session')
            await git.merge(['--abort'])
          }
        } catch {
          // merge --abort自体が失敗しても続行
        }

        // Commit any uncommitted local changes before pulling
        const status = await git.status()
        const hasChanges =
          status.not_added.length > 0 ||
          status.modified.length > 0 ||
          status.staged.length > 0
        if (hasChanges) {
          await git.add('-A')
          await git.commit('auto: commit local changes before pull')
          console.log('[git] committed local changes before startup pull')
        }

        const { resolved } = await pullWithConflictResolution(git)
        if (resolved.length > 0) {
          console.log('[git] startup pull completed with auto-resolved conflicts:', resolved)
        } else {
          console.log('[git] startup pull completed')
        }
      } catch (err) {
        console.error('[git] startup pull failed:', (err as Error).message)
      }
      return
    }

    if (env.GITHUB_REPO_URL && env.GITHUB_PAT) {
      const authUrl = getAuthUrl()
      console.log(`[git] cloning from ${env.GITHUB_REPO_URL} to ${env.VAULT_PATH}`)
      try {
        await simpleGit().clone(authUrl, env.VAULT_PATH)
        await configureGitUser()
        console.log('[git] clone completed')
      } catch (err) {
        console.error('[git] clone failed:', (err as Error).message)
        throw err
      }
    } else {
      console.log('[git] no remote configured, initializing empty repo')
      if (!existsSync(gitDir)) {
        await getGit().init()
      }
      await configureGitUser()
    }
  })
}

export async function gitPull(): Promise<{ updated: boolean; conflicts: string[] }> {
  return withGitLock(async () => {
    const git = getGit()

    // Commit any local changes before pulling to avoid untracked file conflicts
    const status = await git.status()
    const hasChanges =
      status.not_added.length > 0 ||
      status.modified.length > 0 ||
      status.staged.length > 0
    if (hasChanges) {
      await git.add('-A')
      await git.commit('auto: commit local changes before pull')
      console.log('[git] committed local changes before pull')
    }

    const { updated, resolved } = await pullWithConflictResolution(git)
    if (resolved.length > 0) {
      console.log('[git] pull completed with auto-resolved conflicts:', resolved)
    }

    return {
      updated,
      conflicts: [], // 自動解決済みなので空
    }
  })
}

export async function gitAddAndCommit(
  filePaths: string[],
  message?: string,
): Promise<string> {
  return withGitLock(async () => {
    const git = getGit()
    for (const filePath of filePaths) {
      await git.add(filePath)
    }
    const fileNames = filePaths.map((p) => path.basename(p)).join(', ')
    const commitMessage = message ?? `auto: update ${fileNames}`
    const result = await git.commit(commitMessage)
    return result.commit
  })
}

export async function gitCommitAll(message: string): Promise<string> {
  return withGitLock(async () => {
    const git = getGit()
    await git.add('-A')
    const result = await git.commit(message)
    return result.commit
  })
}

export async function gitPush(): Promise<void> {
  return withGitLock(async () => {
    await getGit().push('origin', 'main')
  })
}

export async function gitStatus(): Promise<GitStatus> {
  return withGitLock(async () => {
    const git = getGit()
    const status = await git.status()
    return {
      branch: status.current ?? 'main',
      staged: status.staged,
      unstaged: status.modified,
      untracked: status.not_added,
    }
  })
}
