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
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/git/commit-push] error:', message)
    return json({ error: message }, { status: 500 })
  }
}
