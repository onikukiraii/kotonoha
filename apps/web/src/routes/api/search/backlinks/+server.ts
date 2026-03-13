import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { getBacklinks } from '$lib/db/index.js'

export const GET: RequestHandler = async ({ url }) => {
  const filename = url.searchParams.get('filename')
  if (!filename) {
    return json({ backlinks: [] })
  }

  const backlinks = getBacklinks(filename)
  return json({ backlinks })
}
