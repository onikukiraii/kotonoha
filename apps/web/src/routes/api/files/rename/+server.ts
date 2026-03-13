import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { renameFile, readFileContent } from '$lib/server/vault.js'
import { removeFileIndex, updateFileIndex } from '$lib/server/indexer.js'

export const PATCH: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { from, to } = body as { from: string; to: string }

  if (!from || !to) {
    return json({ error: 'from and to required' }, { status: 400 })
  }

  try {
    await renameFile(from, to)
    await removeFileIndex(from)
    const { content } = await readFileContent(to)
    await updateFileIndex(to, content)
    return json({ ok: true })
  } catch (err) {
    return json({ error: 'Failed to rename file' }, { status: 500 })
  }
}
