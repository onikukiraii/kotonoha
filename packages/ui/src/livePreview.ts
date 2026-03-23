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

function buildDecorations(view: EditorView, options: LivePreviewOptions): DecorationSet {
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
          if (!onCursor) {
            const n = node.node
            let c = n.cursor()
            if (c.firstChild()) {
              do {
                if (c.type.name === 'CodeMark') {
                  // Hide opening/closing ``` lines (stay within the line, don't cross newline)
                  const line = state.doc.lineAt(c.from)
                  entries.push({
                    from: line.from,
                    to: line.to,
                    deco: Decoration.replace({}),
                  })
                } else if (c.type.name === 'CodeInfo') {
                  // Also hide the info line (it's on the same line as the opening ```)
                  // Already handled by CodeMark line replacement
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

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, options)
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet
        ) {
          this.decorations = buildDecorations(update.view, options)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  )

  return [plugin, livePreviewTheme, livePreviewClickHandler(options)]
}
