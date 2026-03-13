import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { readFileContent, writeFileContent } from '$lib/server/vault.js'
import { markFileChanged } from '$lib/server/auto-commit.js'
import { updateFileIndex } from '$lib/server/indexer.js'

export const GET: RequestHandler = async ({ url }) => {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    return json({ error: 'path parameter required' }, { status: 400 })
  }

  try {
    const { content, updated_at } = await readFileContent(filePath)
    return json({ content, path: filePath, updated_at })
  } catch (err) {
    return json({ error: 'File not found' }, { status: 404 })
  }
}

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { path: filePath, content } = body as { path: string; content: string }

  if (!filePath || content === undefined) {
    return json({ error: 'path and content required' }, { status: 400 })
  }

  try {
    const updated_at = await writeFileContent(filePath, content)
    await updateFileIndex(filePath, content)
    markFileChanged(filePath)
    return json({ ok: true, updated_at })
  } catch (err) {
    return json({ error: 'Failed to write file' }, { status: 500 })
  }
}
