<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { livePreview } from './livePreview'

  interface Props {
    content?: string
    vimMode?: boolean
    livePreviewMode?: boolean
    onChange?: (content: string) => void
    onCursorLineChange?: (line: number) => void
    onWikilinkNavigate?: (target: string) => void
  }

  let {
    content = $bindable(''),
    vimMode = false,
    livePreviewMode = false,
    onChange = () => {},
    onCursorLineChange = () => {},
    onWikilinkNavigate = () => {},
  }: Props = $props()

  let editorElement: HTMLDivElement | undefined = $state()
  let view: any = $state(null)
  let updating = false

  onMount(async () => {
    const { EditorView, keymap, ViewPlugin, Decoration, WidgetType } = await import('@codemirror/view')
    const { EditorState, StateField } = await import('@codemirror/state')
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')
    const { languages } = await import('@codemirror/language-data')
    const { defaultKeymap, history, historyKeymap, indentWithTab } = await import('@codemirror/commands')
    const { syntaxHighlighting, defaultHighlightStyle, bracketMatching } = await import('@codemirror/language')
    const { closeBrackets } = await import('@codemirror/autocomplete')

    const wikilinkDecoration = Decoration.mark({ class: 'cm-wikilink' })

    const wikilinkPlugin = ViewPlugin.fromClass(
      class {
        decorations: any

        constructor(view: any) {
          this.decorations = this.buildDecorations(view)
        }

        update(update: any) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view)
          }
        }

        buildDecorations(view: any) {
          const builder: any[] = []
          const { doc } = view.state
          const text = doc.toString()
          const regex = /\[\[([^\]]+)\]\]/g
          let match
          while ((match = regex.exec(text)) !== null) {
            builder.push(wikilinkDecoration.range(match.index, match.index + match[0].length))
          }
          return Decoration.set(builder)
        }
      },
      { decorations: (v) => v.decorations },
    )

    const darkTheme = EditorView.theme(
      {
        '&': { backgroundColor: '#1e1d20', color: '#e0ddd5', height: '100%' },
        '.cm-content': { caretColor: '#d4a574', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: '15px', lineHeight: '1.75', letterSpacing: '0.01em' },
        '.cm-cursor': { borderLeftColor: '#d4a574' },
        '.cm-activeLine': { backgroundColor: '#2c2a30' },
        '.cm-selectionBackground': { backgroundColor: '#3a2f1e' },
        '&.cm-focused .cm-selectionBackground': { backgroundColor: '#3a2f1e' },
        '.cm-gutters': { backgroundColor: '#1e1d20', color: '#6b665f', border: 'none' },
        '.cm-wikilink': { color: '#d4a574', textDecoration: 'underline', cursor: 'pointer' },
        '.cm-line': { padding: '1px 4px' },
      },
      { dark: true },
    )

    // macOS Emacs keybindings
    const { cursorLineStart, cursorLineEnd } = await import('@codemirror/commands')
    const emacsKeys = keymap.of([
      { key: 'Ctrl-a', run: cursorLineStart },
      { key: 'Ctrl-e', run: cursorLineEnd },
      {
        key: 'Ctrl-k',
        run: (v: any) => {
          const head = v.state.selection.main.head
          const line = v.state.doc.lineAt(head)
          if (head === line.to) return false
          v.dispatch({ changes: { from: head, to: line.to } })
          return true
        },
      },
    ])

    const extensions = [
      emacsKeys,
      keymap.of([indentWithTab]),
      history(),
      bracketMatching(),
      closeBrackets(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      darkTheme,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update: any) => {
        if (update.docChanged && !updating) {
          onChange(update.state.doc.toString())
        }
        if (update.selectionSet || update.docChanged) {
          const line = update.state.doc.lineAt(update.state.selection.main.head).number
          onCursorLineChange(line)
        }
      }),
    ]

    if (livePreviewMode) {
      extensions.push(...livePreview({ onWikilinkClick: onWikilinkNavigate }))
    } else {
      // Fallback: basic wikilink decoration + click handler (original behavior)
      extensions.push(wikilinkPlugin)
      extensions.push(
        EditorView.domEventHandlers({
          click(event: MouseEvent, editorView: any) {
            const target = event.target as HTMLElement
            if (target.closest('.cm-wikilink')) {
              const pos = editorView.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos !== null) {
                const text = editorView.state.doc.toString()
                const regex = /\[\[([^\]]+)\]\]/g
                let match
                while ((match = regex.exec(text)) !== null) {
                  if (pos >= match.index && pos <= match.index + match[0].length) {
                    onWikilinkNavigate(match[1])
                    break
                  }
                }
              }
            }
          },
        }),
      )
    }

    if (vimMode) {
      const { vim } = await import('@replit/codemirror-vim')
      extensions.unshift(vim())
    }

    view = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: editorElement!,
    })
  })

  onDestroy(() => {
    view?.destroy()
  })

  $effect(() => {
    if (view && content !== view.state.doc.toString()) {
      updating = true
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      })
      updating = false
    }
  })
</script>

<div bind:this={editorElement} class="editor-container"></div>

<style>
  .editor-container {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
  }

  .editor-container :global(.cm-scroller) {
    overflow: auto;
  }
</style>
