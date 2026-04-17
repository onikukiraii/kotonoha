import { marked, type TokensList, type Token } from 'marked'

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g
const TAG_RE = /(?:^|\s)#([a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+)/g

export function renderMarkdownClient(content: string): string {
  const withWikilinks = content.replace(
    WIKILINK_RE,
    '<a class="wikilink" data-target="$1">$1</a>',
  )
  const withTags = withWikilinks.replace(TAG_RE, (match, tag) =>
    match.replace(`#${tag}`, `<span class="tag">#${tag}</span>`),
  )

  const tokens = marked.lexer(withTags)
  let line = 1
  const parts: string[] = []
  for (const token of tokens) {
    const tokenLine = line
    line += (token.raw?.match(/\n/g) || []).length
    if (token.type === 'space') {
      parts.push(marked.parser(wrapSingle(token, tokens)))
      continue
    }
    const html = marked.parser(wrapSingle(token, tokens))
    parts.push(injectSourceLine(html, tokenLine))
  }
  return parts.join('')
}

function wrapSingle(token: Token, source: TokensList): TokensList {
  const list = [token] as unknown as TokensList
  ;(list as unknown as { links: TokensList['links'] }).links = source.links
  return list
}

function injectSourceLine(html: string, line: number): string {
  return html.replace(/^(\s*)(<[a-zA-Z][\w-]*)(\s|>|\/>)/, `$1$2 data-source-line="${line}"$3`)
}
