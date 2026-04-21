import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/db/index.js'
import { env } from '$lib/server/env.js'
import { runBaseFile } from '$lib/server/base-runner.js'

export const GET: RequestHandler = async ({ url }) => {
  const basePath = url.searchParams.get('path')
  if (!basePath || !basePath.endsWith('.base')) {
    error(400, 'path query param is required and must end with .base')
  }
  try {
    const result = await runBaseFile({
      db: getDb(),
      vaultRoot: env.VAULT_PATH,
      basePath,
    })
    return json(result)
  } catch (e) {
    error(404, (e as Error).message)
  }
}
