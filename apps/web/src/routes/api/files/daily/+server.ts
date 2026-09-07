import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { existsSync } from 'fs'
import { resolveSafePath, createFile } from '$lib/server/vault.js'
import { indexPath } from '$lib/server/indexer.js'
import { getDailyNotePath, getDailyNoteTemplate } from '@kotonoha/ui/daily'

export const POST: RequestHandler = async () => {
  try {
    const path = getDailyNotePath()
    const absPath = resolveSafePath(path)
    const exists = existsSync(absPath)

    if (!exists) {
      await createFile(path, getDailyNoteTemplate())
      await indexPath(path)
    }

    return json({ path, created: !exists })
  } catch (err) {
    return json({ error: 'Failed to ensure daily note' }, { status: 500 })
  }
}
