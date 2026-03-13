import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { getAllTags, searchByTag } from '$lib/db/index.js'

export const GET: RequestHandler = async ({ url }) => {
  const tag = url.searchParams.get('tag')

  if (tag) {
    const results = searchByTag(tag)
    return json({ results })
  }

  const tags = getAllTags()
  return json({ tags })
}
