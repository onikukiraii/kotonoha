import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolveSafePath } from '$lib/server/vault.js'

export const GET: RequestHandler = async ({ url }) => {
  try {
    const dirPath = url.searchParams.get('path')
    if (!dirPath) {
      return json({ error: 'path parameter is required' }, { status: 400 })
    }

    const absPath = resolveSafePath(dirPath)
    if (!existsSync(absPath)) {
      return json({ dirs: [] })
    }

    const entries = await readdir(absPath, { withFileTypes: true })
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'ja'))

    return json({ dirs })
  } catch (err) {
    return json({ error: 'Failed to list subdirectories' }, { status: 500 })
  }
}
