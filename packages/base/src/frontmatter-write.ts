import { parseDocument, stringify, isMap } from 'yaml'
import { splitFrontmatter } from './frontmatter.js'

export function updateFrontmatterProperty(md: string, key: string, value: unknown): string {
  const { fm, body, hadFrontmatter } = splitFrontmatter(md)

  if (!hadFrontmatter) {
    const fmBlock = stringify({ [key]: value }).trimEnd()
    return `---\n${fmBlock}\n---\n${body}`
  }

  const doc = parseDocument(fm ?? '')
  if (doc.contents === null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.contents = doc.createNode({ [key]: value }) as any
  } else if (isMap(doc.contents)) {
    doc.set(key, value)
  } else {
    const fmBlock = stringify({ [key]: value }).trimEnd()
    return `---\n${fmBlock}\n---\n${body}`
  }

  const newFm = doc.toString().trimEnd()
  return `---\n${newFm}\n---\n\n${body.replace(/^\n+/, '')}`
}
