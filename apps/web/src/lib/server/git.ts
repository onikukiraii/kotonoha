import simpleGit, { type SimpleGit } from 'simple-git'
import path from 'path'
import { existsSync } from 'fs'
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

export async function initOrCloneVault(): Promise<void> {
  return withGitLock(async () => {
    const gitDir = path.join(env.VAULT_PATH, '.git')

    if (existsSync(gitDir)) {
      // Already a git repo, try pull
      try {
        const authUrl = getAuthUrl()
        if (authUrl) {
          const git = getGit()
          await git.remote(['set-url', 'origin', authUrl])
        }
        await getGit().pull('origin', 'main')
        console.log('[git] startup pull completed')
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
    }
  })
}

export async function gitPull(): Promise<{ updated: boolean; conflicts: string[] }> {
  return withGitLock(async () => {
    const git = getGit()
    const result = await git.pull('origin', 'main')
    const conflicts: string[] = []

    if (result.files.length > 0) {
      const status = await git.status()
      for (const file of status.conflicted) {
        conflicts.push(file)
      }
    }

    return {
      updated: result.files.length > 0,
      conflicts,
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
