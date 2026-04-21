import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/db/index.js'
import { env } from '$lib/server/env.js'
import { readBaseContent, writeBaseContent } from '$lib/server/base-content.js'

export const GET: RequestHandler = async ({ url }) => {
  const basePath = url.searchParams.get('path')
  if (!basePath) error(400, 'path is required')
  try {
    const yaml = await readBaseContent({ vaultRoot: env.VAULT_PATH, basePath })
    return json({ path: basePath, yaml })
  } catch (e) {
    error(400, (e as Error).message)
  }
}

export const PUT: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { path?: string; yaml?: string }
  if (!body.path || typeof body.yaml !== 'string') error(400, 'path and yaml are required')
  try {
    await writeBaseContent({
      db: getDb(),
      vaultRoot: env.VAULT_PATH,
      basePath: body.path,
      yaml: body.yaml,
    })
    return json({ ok: true })
  } catch (e) {
    error(400, (e as Error).message)
  }
}
