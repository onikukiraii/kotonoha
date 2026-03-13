import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { gitStatus } from '$lib/server/git.js'

export const GET: RequestHandler = async () => {
  try {
    const status = await gitStatus()
    return json(status)
  } catch (err) {
    return json({ error: 'Failed to get git status' }, { status: 500 })
  }
}
