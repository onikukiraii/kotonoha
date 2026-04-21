import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getDb } from '$lib/db/index.js'
import { env } from '$lib/server/env.js'
import { updateFileProperty } from '$lib/server/update-property.js'

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { path?: string; key?: string; value?: unknown }
  if (!body.path || !body.key) error(400, 'path and key are required')
  try {
    await updateFileProperty({
      db: getDb(),
      vaultRoot: env.VAULT_PATH,
      filePath: body.path,
      key: body.key,
      value: body.value,
    })
    return json({ ok: true })
  } catch (e) {
    error(400, (e as Error).message)
  }
}
