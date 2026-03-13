import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { searchFilesByName } from '$lib/db/index.js'

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q')
  if (!query) {
    return json({ results: [] })
  }

  const results = searchFilesByName(query)
  return json({ results })
}
