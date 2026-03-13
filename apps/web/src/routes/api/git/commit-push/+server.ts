import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { gitCommitAll, gitPush } from '$lib/server/git.js'

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}))
    const { message } = body as { message?: string }

    const commitMessage = message || `update from web: ${new Date().toISOString()}`
    const commit_hash = await gitCommitAll(commitMessage)
    await gitPush()

    return json({ ok: true, commit_hash })
  } catch (err) {
    return json({ error: 'Failed to commit and push' }, { status: 500 })
  }
}
