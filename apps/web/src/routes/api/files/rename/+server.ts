import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { AlreadyExistsError, renameFile } from '$lib/server/vault.js'
import { indexPath, removeIndexUnder } from '$lib/server/indexer.js'

export const PATCH: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { from, to } = body as { from: string; to: string }

  if (!from || !to) {
    return json({ error: 'from and to required' }, { status: 400 })
  }

  try {
    await renameFile(from, to)
    await removeIndexUnder(from)
    await indexPath(to)
    return json({ ok: true })
  } catch (err) {
    if (err instanceof AlreadyExistsError) {
      return json({ error: '移動先に同じ名前のファイルかフォルダがあります' }, { status: 409 })
    }
    console.error('Rename failed:', err)
    return json({ error: '移動できませんでした' }, { status: 500 })
  }
}
