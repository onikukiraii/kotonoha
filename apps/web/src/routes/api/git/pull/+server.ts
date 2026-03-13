import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { gitPull } from '$lib/server/git.js'
import { buildDifferentialIndex } from '$lib/server/indexer.js'

export const POST: RequestHandler = async () => {
  try {
    const result = await gitPull()
    if (result.updated) {
      await buildDifferentialIndex()
    }
    return json(result)
  } catch (err) {
    return json({ error: 'Failed to pull' }, { status: 500 })
  }
}
