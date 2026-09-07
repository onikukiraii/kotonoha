import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { AlreadyExistsError, createFile, createFolder, deleteEntry } from '$lib/server/vault.js'
import { indexPath, removeIndexUnder } from '$lib/server/indexer.js'

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { path: entryPath, content, is_dir } = body as {
    path: string
    content?: string
    is_dir?: boolean
  }

  if (!entryPath) {
    return json({ error: 'path required' }, { status: 400 })
  }

  try {
    if (is_dir) {
      await createFolder(entryPath)
    } else {
      await createFile(entryPath, content)
      await indexPath(entryPath)
    }
    return json({ ok: true }, { status: 201 })
  } catch (err) {
    if (err instanceof AlreadyExistsError) {
      return json({ error: '同じ名前のファイルかフォルダがあります' }, { status: 409 })
    }
    console.error('Create failed:', err)
    return json({ error: '作成できませんでした' }, { status: 500 })
  }
}

export const DELETE: RequestHandler = async ({ url }) => {
  const entryPath = url.searchParams.get('path')
  if (!entryPath) {
    return json({ error: 'path parameter required' }, { status: 400 })
  }

  try {
    await deleteEntry(entryPath)
    await removeIndexUnder(entryPath)
    return json({ ok: true })
  } catch (err) {
    console.error('Delete failed:', err)
    return json({ error: '削除できませんでした' }, { status: 500 })
  }
}
