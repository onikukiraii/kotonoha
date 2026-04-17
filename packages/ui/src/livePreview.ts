import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
  type ViewUpdate,
  type DecorationSet,
} from '@codemirror/view'
import { type Extension, type EditorState, Prec, RangeSetBuilder } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

export interface LivePreviewOptions {
  onWikilinkClick?: (target: string) => void
  onLinkClick?: (url: string) => void
  onCheckboxToggle?: (pos: number, checked: boolean) => void
}

// --- Widgets ---

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super()
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'cm-lp-checkbox'
    input.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const newChar = this.checked ? ' ' : 'x'
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 1, insert: newChar },
      })
    })
    return input
  }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.pos === other.pos
  }
}

const BULLET_CHARS = ['•', '◦', '▸', '▹']

class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super()
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-lp-bullet'
    span.textContent = BULLET_CHARS[this.depth % BULLET_CHARS.length]
    return span
  }

  eq(other: BulletWidget) {
    return this.depth === other.depth
  }
}

// --- Mermaid rendering ---

const mermaidCache = new Map<string, string>()
let mermaidInitialized = false

async function renderMermaid(source: string): Promise<string | null> {
  try {
    const mermaid = (await import('mermaid')).default
    if (!mermaidInitialized) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' })
      mermaidInitialized = true
    }
    const id = `mermaid-lp-${crypto.randomUUID()}`
    const { svg } = await mermaid.render(id, source)
    return svg
  } catch {
    return null
  }
}

class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly viewRef: { current: EditorView | null },
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-lp-mermaid'

    const cached = mermaidCache.get(this.source)
    if (cached) {
      container.innerHTML = cached
      return container
    }

    container.textContent = 'Rendering diagram...'
    container.classList.add('cm-lp-mermaid-loading')

    renderMermaid(this.source).then((svg) => {
      if (svg) {
        mermaidCache.set(this.source, svg)
        // Update DOM directly instead of re-dispatching
        container.classList.remove('cm-lp-mermaid-loading')
        container.textContent = ''
        container.innerHTML = svg
      }
    })

    return container
  }

  eq(other: MermaidWidget): boolean {
    return this.source === other.source
  }

  ignoreEvent(): boolean {
    return true
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-lp-hr'
    return hr
  }

  eq() {
    return true
  }
}

// --- Table rendering ---

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderInlineCell(text: string): string {
  let out = escapeHtml(text)
  out = out.replace(/\[\[([^\]]+)\]\]/g, '<span class="cm-lp-wikilink">$1</span>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return out
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((c) => c.trim())
}

function parseAlignments(delimiter: string): Array<'left' | 'right' | 'center' | null> {
  return splitTableRow(delimiter).map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

function renderTableHTML(source: string): string {
  const lines = source.split('\n').filter((l) => l.trim().startsWith('|'))
  if (lines.length < 2) return escapeHtml(source)

  const headers = splitTableRow(lines[0])
  const aligns = parseAlignments(lines[1])
  const rows = lines.slice(2).map(splitTableRow)

  const alignAttr = (i: number) => {
    const a = aligns[i]
    return a ? ` style="text-align:${a}"` : ''
  }

  let html = '<table class="cm-lp-table-el"><thead><tr>'
  headers.forEach((h, i) => {
    html += `<th${alignAttr(i)}>${renderInlineCell(h)}</th>`
  })
  html += '</tr></thead><tbody>'
  for (const row of rows) {
    html += '<tr>'
    row.forEach((c, i) => {
      html += `<td${alignAttr(i)}>${renderInlineCell(c)}</td>`
    })
    html += '</tr>'
  }
  html += '</tbody></table>'
  return html
}

class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-lp-table'
    container.innerHTML = renderTableHTML(this.source)
    return container
  }

  eq(other: TableWidget): boolean {
    return this.source === other.source
  }

  ignoreEvent(): boolean {
    return false
  }
}

// --- Helpers ---

function getCursorLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number
    const endLine = state.doc.lineAt(range.to).number
    for (let l = startLine; l <= endLine; l++) lines.add(l)
  }
  return lines
}

function rangeOverlapsCursorLines(
  fromLine: number,
  toLine: number,
  cursorLines: Set<number>,
): boolean {
  for (let l = fromLine; l <= toLine; l++) {
    if (cursorLines.has(l)) return true
  }
  return false
}

interface DecoEntry {
  from: number
  to: number
  deco: Decoration
}

// --- Core ViewPlugin ---

function buildDecorations(
  view: EditorView,
  options: LivePreviewOptions,
  viewRef: { current: EditorView | null } = { current: null },
): DecorationSet {
  const state = view.state
  const cursorLines = getCursorLines(state)
  const entries: DecoEntry[] = []
  const tree = syntaxTree(state)

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const nodeFromLine = state.doc.lineAt(node.from).number
        const nodeToLine = state.doc.lineAt(node.to).number
        const onCursor = rangeOverlapsCursorLines(nodeFromLine, nodeToLine, cursorLines)

        const type = node.type.name

        // --- Headings ---
        if (/^ATXHeading([1-6])$/.test(type)) {
          const level = parseInt(type.charAt(type.length - 1))
          if (!onCursor) {
            // Find HeaderMark children to hide
            const headingNode = node.node
            let cursor = headingNode.cursor()
            if (cursor.firstChild()) {
              do {
                if (cursor.type.name === 'HeaderMark') {
                  // Hide the # marks and the space after (stay within the same line)
                  const markEnd = cursor.to
                  const lineEnd = state.doc.lineAt(cursor.from).to
                  const afterMark = Math.min(markEnd + 1, lineEnd, node.to)
                  entries.push({
                    from: cursor.from,
                    to: afterMark,
                    deco: Decoration.replace({}),
                  })
                }
              } while (cursor.nextSibling())
            }
          }
          // Apply heading style (mark for inline, line for spacing)
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: `cm-lp-h${level}` }),
          })
          // Line decoration for margin/padding
          entries.push({
            from: node.from,
            to: node.from,
            deco: Decoration.line({ class: `cm-lp-h${level}-line` }),
          })
          return
        }

        // --- StrongEmphasis (bold) ---
        if (type === 'StrongEmphasis') {
          if (!onCursor) {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'EmphasisMark') {
                  entries.push({ from: c.from, to: c.to, deco: Decoration.replace({}) })
                }
              } while (c.nextSibling())
            }
          }
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-bold' }),
          })
          return
        }

        // --- Emphasis (italic) ---
        if (type === 'Emphasis') {
          if (!onCursor) {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'EmphasisMark') {
                  entries.push({ from: c.from, to: c.to, deco: Decoration.replace({}) })
                }
              } while (c.nextSibling())
            }
          }
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-italic' }),
          })
          return
        }

        // --- Strikethrough ---
        if (type === 'Strikethrough') {
          if (!onCursor) {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'StrikethroughMark') {
                  entries.push({ from: c.from, to: c.to, deco: Decoration.replace({}) })
                }
              } while (c.nextSibling())
            }
          }
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-strikethrough' }),
          })
          return
        }

        // --- InlineCode ---
        if (type === 'InlineCode') {
          if (!onCursor) {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'CodeMark') {
                  entries.push({ from: c.from, to: c.to, deco: Decoration.replace({}) })
                }
              } while (c.nextSibling())
            }
          }
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-code' }),
          })
          return
        }

        // --- FencedCode ---
        if (type === 'FencedCode') {
          // Detect language from CodeInfo child
          let language = ''
          {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'CodeInfo') {
                  language = state.doc.sliceString(c.from, c.to).trim().toLowerCase()
                }
              } while (c.nextSibling())
            }
          }

          // Mermaid block: hide all lines and insert SVG widget when cursor is outside
          if (language === 'mermaid' && !onCursor) {
            const fullText = state.doc.sliceString(node.from, node.to)
            const lines = fullText.split('\n')
            const mermaidSource = lines.slice(1, -1).join('\n').trim()
            if (mermaidSource) {
              // Hide each line individually (ViewPlugin cannot replace across line breaks)
              const startLine = state.doc.lineAt(node.from)
              const endLine = state.doc.lineAt(node.to)
              for (let ln = startLine.number; ln <= endLine.number; ln++) {
                const line = state.doc.line(ln)
                entries.push({
                  from: line.from,
                  to: line.to,
                  deco: Decoration.replace({}),
                })
              }
              // Insert widget at the start of the first line
              entries.push({
                from: node.from,
                to: node.from,
                deco: Decoration.widget({
                  widget: new MermaidWidget(mermaidSource, viewRef),
                  side: 1,
                }),
              })
              return false
            }
          }

          // Non-mermaid (or cursor on mermaid): hide ``` marks, apply codeblock style
          if (!onCursor) {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'CodeMark') {
                  const line = state.doc.lineAt(c.from)
                  entries.push({
                    from: line.from,
                    to: line.to,
                    deco: Decoration.replace({}),
                  })
                }
              } while (c.nextSibling())
            }
          }
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-codeblock' }),
          })
          return false // don't descend
        }

        // --- Table (GFM) ---
        if (type === 'Table') {
          if (!onCursor) {
            const startLine = state.doc.lineAt(node.from)
            const endLine = state.doc.lineAt(node.to)
            const fullText = state.doc.sliceString(startLine.from, endLine.to)
            for (let ln = startLine.number; ln <= endLine.number; ln++) {
              const line = state.doc.line(ln)
              entries.push({
                from: line.from,
                to: line.to,
                deco: Decoration.replace({}),
              })
            }
            entries.push({
              from: startLine.from,
              to: startLine.from,
              deco: Decoration.widget({
                widget: new TableWidget(fullText),
                side: -1,
              }),
            })
          }
          return false
        }

        // --- Link ---
        if (type === 'Link') {
          // Skip if this is part of a wikilink [[...]]
          const docText = state.doc.toString()
          if (node.from > 0 && docText[node.from - 1] === '[') {
            return false
          }
          if (!onCursor) {
            const n = node.node
            let linkMarkCount = 0
            let urlNode: { from: number; to: number } | null = null
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'LinkMark') {
                  linkMarkCount++
                  if (linkMarkCount === 1) {
                    // Opening [
                    entries.push({ from: c.from, to: c.to, deco: Decoration.replace({}) })
                  } else if (linkMarkCount === 2) {
                    // Closing ](
                    entries.push({ from: c.from, to: c.to, deco: Decoration.replace({}) })
                  } else if (linkMarkCount === 3) {
                    // Closing )
                    entries.push({ from: c.from, to: c.to, deco: Decoration.replace({}) })
                  }
                }
                if (c.type.name === 'URL') {
                  urlNode = { from: c.from, to: c.to }
                }
              } while (c.nextSibling())
            }
            if (urlNode) {
              entries.push({ from: urlNode.from, to: urlNode.to, deco: Decoration.replace({}) })
            }
          }
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-link' }),
          })
          return false
        }

        // --- Blockquote ---
        if (type === 'Blockquote') {
          if (!onCursor) {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'QuoteMark') {
                  // Hide > and space (stay within the same line)
                  const markEnd = c.to
                  const lineEnd = state.doc.lineAt(c.from).to
                  const afterMark = Math.min(markEnd + 1, lineEnd, node.to)
                  entries.push({
                    from: c.from,
                    to: afterMark,
                    deco: Decoration.replace({}),
                  })
                }
              } while (c.nextSibling())
            }
          }
          // Apply blockquote line decoration for each line
          for (let l = nodeFromLine; l <= nodeToLine; l++) {
            const line = state.doc.line(l)
            entries.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: 'cm-lp-blockquote' }),
            })
          }
          return
        }

        // --- HorizontalRule ---
        if (type === 'HorizontalRule') {
          if (!onCursor) {
            // Replace only within the line (don't cross newline)
            const hrLineEnd = state.doc.lineAt(node.from).to
            entries.push({
              from: node.from,
              to: Math.min(node.to, hrLineEnd),
              deco: Decoration.replace({ widget: new HorizontalRuleWidget() }),
            })
          }
          return
        }

        // --- Task list checkbox ---
        if (type === 'TaskMarker') {
          if (!onCursor) {
            const text = state.doc.sliceString(node.from, node.to)
            const checked = text.includes('x') || text.includes('X')
            // Position of the character inside [ ] (e.g., the space or x)
            const charPos = node.from + 1
            entries.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({
                widget: new CheckboxWidget(checked, charPos),
              }),
            })
          }
          return
        }

        // --- List marker (-, *, +) → bullet ---
        if (type === 'ListMark') {
          const markText = state.doc.sliceString(node.from, node.to)
          // Only for unordered list markers (-, *, +), not ordered (1., 2.)
          if (/^[-*+]$/.test(markText) && !onCursor) {
            // Count nesting depth by walking up BulletList ancestors
            let depth = 0
            let parent = node.node.parent
            while (parent) {
              if (parent.type.name === 'BulletList') depth++
              parent = parent.parent
            }
            // depth starts at 1 (the current BulletList), so subtract 1
            depth = Math.max(0, depth - 1)
            const afterMark = Math.min(node.to + 1, state.doc.lineAt(node.from).to)
            entries.push({
              from: node.from,
              to: afterMark,
              deco: Decoration.replace({ widget: new BulletWidget(depth) }),
            })
          }
          return
        }
      },
    })
  }

  // --- Regex-based: Wikilinks [[target]] ---
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to)
    const regex = /\[\[([^\]]+)\]\]/g
    let match
    while ((match = regex.exec(text)) !== null) {
      const matchFrom = from + match.index
      const matchTo = matchFrom + match[0].length
      const matchLine = state.doc.lineAt(matchFrom).number
      const onCursor = cursorLines.has(matchLine)

      if (!onCursor) {
        entries.push({
          from: matchFrom,
          to: matchFrom + 2,
          deco: Decoration.replace({}),
        })
        entries.push({
          from: matchTo - 2,
          to: matchTo,
          deco: Decoration.replace({}),
        })
      }
      entries.push({
        from: matchFrom,
        to: matchTo,
        deco: Decoration.mark({ class: 'cm-lp-wikilink' }),
      })
    }
  }

  // --- Regex-based: Tags (#tag, including Japanese) ---
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to)
    // Match #tag but not headings (must be preceded by whitespace or start of line, not followed by space)
    const regex = /(?:^|(?<=\s))#([\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF][\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF/-]*)/gm
    let match
    while ((match = regex.exec(text)) !== null) {
      const matchFrom = from + match.index + (match[0].length - match[1].length - 1)
      const matchTo = matchFrom + 1 + match[1].length
      const matchLine = state.doc.lineAt(matchFrom).number

      // Skip if this is actually a heading line
      const line = state.doc.line(matchLine)
      if (/^#{1,6}\s/.test(line.text)) continue

      if (cursorLines.has(matchLine)) continue

      entries.push({
        from: matchFrom,
        to: matchTo,
        deco: Decoration.mark({ class: 'cm-lp-tag' }),
      })
    }
  }

  // Sort entries by from position, then by specificity (replace before mark)
  entries.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from
    // line decorations (from === to) go first
    if (a.from === a.to && b.from !== b.to) return -1
    if (b.from === b.to && a.from !== a.to) return 1
    return a.to - b.to
  })

  // Build decoration set, filtering out invalid overlapping replaces
  const builder = new RangeSetBuilder<Decoration>()
  let lastReplaceEnd = -1
  for (const entry of entries) {
    // Line decorations
    if (entry.from === entry.to) {
      builder.add(entry.from, entry.to, entry.deco)
      continue
    }

    const isReplace = (entry.deco.spec as any)?.widget !== undefined ||
      ((entry.deco as any).startSide !== undefined && entry.from !== entry.to && !(entry.deco.spec as any).class)

    // Check if this is a replace-type decoration
    const spec = entry.deco.spec as any
    const isReplaceType = spec && !spec.class && !spec.attributes

    if (isReplaceType) {
      if (entry.from < lastReplaceEnd) continue // Skip overlapping replace
      lastReplaceEnd = entry.to
    }

    builder.add(entry.from, entry.to, entry.deco)
  }

  return builder.finish()
}

// --- Theme ---

const livePreviewTheme = EditorView.theme(
  {
    '.cm-lp-h1': { fontSize: '1.7em', fontWeight: 'bold', lineHeight: '1.4' },
    '.cm-lp-h2': { fontSize: '1.4em', fontWeight: 'bold', lineHeight: '1.3' },
    '.cm-lp-h3': { fontSize: '1.2em', fontWeight: 'bold', lineHeight: '1.3' },
    '.cm-lp-h4': { fontSize: '1.1em', fontWeight: 'bold' },
    '.cm-lp-h5': { fontSize: '1.05em', fontWeight: 'bold' },
    '.cm-lp-h6': { fontSize: '1em', fontWeight: 'bold', opacity: '0.8' },
    '.cm-lp-h1-line': { paddingTop: '0.6em' },
    '.cm-lp-h2-line': { paddingTop: '0.5em' },
    '.cm-lp-h3-line': { paddingTop: '0.4em' },
    '.cm-lp-h4-line': { paddingTop: '0.3em' },
    '.cm-lp-h5-line': { paddingTop: '0.2em' },
    '.cm-lp-h6-line': { paddingTop: '0.2em' },
    '.cm-lp-bold': { fontWeight: 'bold' },
    '.cm-lp-italic': { fontStyle: 'italic' },
    '.cm-lp-strikethrough': { textDecoration: 'line-through' },
    '.cm-lp-code': {
      backgroundColor: 'rgba(255,255,255,0.06)',
      padding: '1px 4px',
      borderRadius: '3px',
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '0.9em',
    },
    '.cm-lp-codeblock': {
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '0.9em',
    },
    '.cm-lp-link': {
      color: 'var(--accent, #89b4fa)',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    '.cm-lp-wikilink': {
      color: 'var(--accent, #d4a574)',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted' as any,
      cursor: 'pointer',
    },
    '.cm-lp-blockquote': {
      borderLeft: '3px solid var(--accent, #89b4fa)',
      paddingLeft: '1em',
    },
    '.cm-lp-tag': {
      color: 'var(--peach, #fab387)',
      fontSize: '0.9em',
    },
    '.cm-lp-hr': {
      display: 'block',
      border: 'none',
      borderTop: '1px solid var(--border, #45475a)',
      margin: '0.5em 0',
    },
    '.cm-lp-checkbox': {
      marginRight: '4px',
      cursor: 'pointer',
      verticalAlign: 'middle',
    },
    '.cm-lp-bullet': {
      marginRight: '4px',
      width: '1.2em',
      display: 'inline-block',
      color: 'var(--accent, #89b4fa)',
    },
    '.cm-lp-mermaid': {
      display: 'flex',
      justifyContent: 'center',
      margin: '0.5em 0',
      overflowX: 'auto',
    },
    '.cm-lp-mermaid svg': {
      maxWidth: '100%',
      height: 'auto',
    },
    '.cm-lp-mermaid-loading': {
      padding: '1em',
      color: 'var(--text-muted, #6c7086)',
      fontStyle: 'italic',
      textAlign: 'center',
    },
    '.cm-lp-table': {
      display: 'block',
      margin: '0.5em 0',
      overflowX: 'auto',
    },
    '.cm-lp-table .cm-lp-table-el': {
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans, sans-serif)',
      fontSize: '0.95em',
    },
    '.cm-lp-table th, .cm-lp-table td': {
      border: '1px solid var(--border, #45475a)',
      padding: '4px 10px',
      textAlign: 'left',
      verticalAlign: 'top',
    },
    '.cm-lp-table th': {
      background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
      fontWeight: 'bold',
    },
    '.cm-lp-table code': {
      backgroundColor: 'rgba(255,255,255,0.06)',
      padding: '1px 4px',
      borderRadius: '3px',
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '0.9em',
    },
  },
  { dark: true },
)

// --- Click handler ---

function livePreviewClickHandler(options: LivePreviewOptions): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      mousedown(event: MouseEvent, view: EditorView) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false

        const text = view.state.doc.toString()

        if (options.onWikilinkClick) {
          // Double-bracket wikilink: [[target]]
          const doubleRegex = /\[\[([^\]]+)\]\]/g
          let match
          while ((match = doubleRegex.exec(text)) !== null) {
            if (pos >= match.index && pos <= match.index + match[0].length) {
              event.preventDefault()
              options.onWikilinkClick(match[1])
              return true
            }
          }

        }

        // Link click: [text](url)
        const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g
        let match
        while ((match = linkRegex.exec(text)) !== null) {
          if (pos >= match.index && pos <= match.index + match[0].length) {
            event.preventDefault()
            if (options.onLinkClick) {
              options.onLinkClick(match[2])
            } else {
              window.open(match[2], '_blank')
            }
            return true
          }
        }

        return false
      },
    }),
  )
}

// --- Main export ---

export function livePreview(options: LivePreviewOptions = {}): Extension[] {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      viewRef: { current: EditorView | null } = { current: null }

      constructor(view: EditorView) {
        this.viewRef.current = view
        this.decorations = buildDecorations(view, options, this.viewRef)
      }

      update(update: ViewUpdate) {
        this.viewRef.current = update.view
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet
        ) {
          this.decorations = buildDecorations(update.view, options, this.viewRef)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  )

  return [plugin, livePreviewTheme, livePreviewClickHandler(options)]
}
