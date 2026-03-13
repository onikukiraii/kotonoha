import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { createFile, deleteFile } from '$lib/server/vault.js'
import { removeFileIndex } from '$lib/server/indexer.js'

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { path: filePath, content } = body as { path: string; content?: string }

  if (!filePath) {
    return json({ error: 'path required' }, { status: 400 })
  }

  try {
    await createFile(filePath, content)
    return json({ ok: true })
  } catch (err) {
    return json({ error: 'Failed to create file' }, { status: 500 })
  }
}

export const DELETE: RequestHandler = async ({ url }) => {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    return json({ error: 'path parameter required' }, { status: 400 })
  }

  try {
    await deleteFile(filePath)
    await removeFileIndex(filePath)
    return json({ ok: true })
  } catch (err) {
    return json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
