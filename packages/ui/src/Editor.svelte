<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  interface Props {
    content?: string
    vimMode?: boolean
    onChange?: (content: string) => void
    onCursorLineChange?: (line: number) => void
    onWikilinkNavigate?: (target: string) => void
  }

  let {
    content = $bindable(''),
    vimMode = false,
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
    const { defaultKeymap, history, historyKeymap } = await import('@codemirror/commands')
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
        '&': { backgroundColor: '#1a1a1a', color: '#e0e0e0', height: '100%' },
        '.cm-content': { caretColor: '#528bff', fontFamily: "'JetBrains Mono', monospace", fontSize: '14px' },
        '.cm-cursor': { borderLeftColor: '#528bff' },
        '.cm-activeLine': { backgroundColor: '#2c313a' },
        '.cm-selectionBackground': { backgroundColor: '#3e4451' },
        '&.cm-focused .cm-selectionBackground': { backgroundColor: '#3e4451' },
        '.cm-gutters': { backgroundColor: '#1a1a1a', color: '#636d83', border: 'none' },
        '.cm-wikilink': { color: '#61afef', textDecoration: 'underline', cursor: 'pointer' },
        '.cm-line': { padding: '0 4px' },
      },
      { dark: true },
    )

    const extensions = [
      history(),
      bracketMatching(),
      closeBrackets(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      wikilinkPlugin,
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
    ]

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
