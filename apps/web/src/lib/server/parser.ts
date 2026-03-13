import { marked } from 'marked'

export function extractWikilinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g
  const results: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    results.push(match[1])
  }
  return results
}

export function extractTags(content: string): string[] {
  const regex = /(?:^|\s)#([a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+)/g
  const results: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    results.push(match[1])
  }
  return [...new Set(results)]
}

export function renderMarkdown(content: string): string {
  // Replace [[wikilink]] with custom HTML before parsing
  const withWikilinks = content.replace(
    /\[\[([^\]]+)\]\]/g,
    '<a class="wikilink" data-target="$1">$1</a>',
  )

  // Replace #tags (but not inside code blocks or headings)
  const withTags = withWikilinks.replace(
    /(?:^|\s)#([a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+)/g,
    (match, tag) => match.replace(`#${tag}`, `<span class="tag">#${tag}</span>`),
  )

  const html = marked.parse(withTags, { async: false }) as string
  return html
}
