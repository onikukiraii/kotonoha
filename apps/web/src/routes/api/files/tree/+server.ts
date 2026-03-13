import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { getFileTree } from '$lib/server/vault.js'

export const GET: RequestHandler = async () => {
  const tree = await getFileTree()
  return json({ tree })
}
