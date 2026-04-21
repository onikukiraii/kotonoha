import type { FileCtx } from './filter/evaluate.js'

export type IndexedFileInput = {
  path: string
  name?: string
  basename?: string
  folder?: string
  size?: number
  ctime?: number
  mtime?: number
  tags?: string[]
  links?: string[]
  backlinks?: string[]
  note?: Record<string, unknown>
}

export function buildFileCtx(input: IndexedFileInput): FileCtx {
  const name = input.name ?? input.path.split('/').pop() ?? ''
  const basename = input.basename ?? name.replace(/\.md$/, '')
  const folder =
    input.folder ?? (input.path.includes('/') ? input.path.slice(0, input.path.lastIndexOf('/')) : '')
  return {
    name,
    basename,
    path: input.path,
    folder,
    size: input.size ?? 0,
    ctime: input.ctime ?? 0,
    mtime: input.mtime ?? 0,
    tags: input.tags ?? [],
    links: input.links ?? [],
    backlinks: input.backlinks ?? [],
  }
}
