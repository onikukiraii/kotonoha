import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/db/index.js'
import { readVaultSchema } from '$lib/server/schema-runner.js'

export const GET: RequestHandler = ({ url }) => {
  const folder = url.searchParams.get('folder')
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : undefined
  if (limitParam && Number.isNaN(limit)) error(400, 'limit must be a number')
  try {
    const schema = readVaultSchema(getDb(), { folder, limit })
    return json(schema)
  } catch (e) {
    error(500, (e as Error).message)
  }
}
