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
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/git/pull] error:', message)
    return json({ error: message }, { status: 500 })
  }
}
