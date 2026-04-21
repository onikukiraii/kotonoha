import { invoke } from '@tauri-apps/api/core'
import {
  parseBase,
  parseFrontmatter,
  runBase,
  summarizeProperties,
  type IndexedFile,
  type PropertySchema,
  type QueryResult,
} from '@kotonoha/base'

type MdFile = {
  path: string
  filename: string
  content: string
  mtime: number
  ctime: number
  size: number
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g
const TAG_RE = /(?:^|\s)#([a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+)/g

export async function runBaseFileDesktop(
  vaultPath: string,
  basePath: string,
): Promise<QueryResult> {
  const [yaml, mdFiles] = await Promise.all([
    invoke<string>('read_base_file', { vaultPath, basePath }),
    invoke<MdFile[]>('read_vault_markdown', { vaultPath }),
  ])
  const base = parseBase(yaml)

  const forwardLinks = new Map<string, string[]>()
  const backLinks = new Map<string, string[]>()
  const parsed = mdFiles.map((f) => {
    const p = parseFrontmatter(f.content)
    const body = p.ok ? p.body : f.content
    const note: Record<string, unknown> = {}
    if (p.ok) {
      for (const [k, v] of Object.entries(p.properties)) note[k] = v.value
    }
    const tags = Array.from(new Set(matchAll(body, TAG_RE)))
    const links = Array.from(new Set(matchAll(body, WIKILINK_RE)))
    forwardLinks.set(f.path, links)
    for (const t of links) {
      const filename = t.endsWith('.md') ? t : `${t}.md`
      const arr = backLinks.get(filename) ?? []
      arr.push(f.path)
      backLinks.set(filename, arr)
    }
    return { file: f, note, tags, links }
  })

  const files: IndexedFile[] = parsed.map(({ file, note, tags, links }) => ({
    path: file.path,
    name: file.filename,
    basename: file.filename.replace(/\.md$/, ''),
    folder: file.path.includes('/')
      ? file.path.slice(0, file.path.lastIndexOf('/'))
      : '',
    size: file.size,
    ctime: file.ctime,
    mtime: file.mtime,
    tags,
    links,
    backlinks: backLinks.get(file.filename) ?? [],
    note,
  }))

  return runBase(base, files, { basePath })
}

export async function readVaultSchemaDesktop(
  vaultPath: string,
  folder?: string | null,
): Promise<PropertySchema> {
  const mdFiles = await invoke<MdFile[]>('read_vault_markdown', { vaultPath })
  const files: IndexedFile[] = mdFiles.map((f) => {
    const p = parseFrontmatter(f.content)
    const note: Record<string, unknown> = {}
    if (p.ok) {
      for (const [k, v] of Object.entries(p.properties)) note[k] = v.value
    }
    return {
      path: f.path,
      tags: [],
      links: [],
      backlinks: [],
      note,
    }
  })
  return summarizeProperties(files, { folder: folder ?? undefined })
}

function matchAll(input: string, re: RegExp): string[] {
  const out: string[] = []
  const clone = new RegExp(re.source, re.flags)
  let m
  while ((m = clone.exec(input)) !== null) {
    out.push(m[1]!)
  }
  return out
}
