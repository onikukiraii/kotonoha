<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { saveFile } from "../stores/vault.svelte";
  import { getEditorState } from "../stores/editor.svelte";

  interface Props {
    content: string;
    filePath: string;
    vaultPath: string;
    onCursorLineChange?: (line: number) => void;
  }

  let { content, filePath, vaultPath, onCursorLineChange = () => {} }: Props = $props();

  const editor = getEditorState();
  let editorElement: HTMLDivElement;
  let view: any = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let currentFilePath = $state(filePath);

  async function initEditor() {
    const { EditorView, keymap, lineNumbers } = await import(
      "@codemirror/view"
    );
    const { EditorState } = await import("@codemirror/state");
    const { markdown, markdownLanguage } = await import(
      "@codemirror/lang-markdown"
    );
    const { languages } = await import("@codemirror/language-data");
    const { defaultKeymap, history, historyKeymap } = await import(
      "@codemirror/commands"
    );
    const { vim } = await import("@replit/codemirror-vim");

    const darkTheme = EditorView.theme(
      {
        "&": {
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          height: "100%",
        },
        ".cm-content": {
          fontFamily: "var(--font-mono)",
          fontSize: "14px",
          lineHeight: "1.6",
          padding: "16px",
          caretColor: "var(--accent)",
        },
        ".cm-cursor": { borderLeftColor: "var(--accent)" },
        ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
        ".cm-gutters": {
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-muted)",
          border: "none",
        },
        ".cm-activeLineGutter": { backgroundColor: "var(--bg-tertiary)" },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
          backgroundColor: "rgba(137, 180, 250, 0.2)",
        },
        ".cm-panels": {
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-primary)",
        },
        ".cm-panels input": {
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        },
        // Vim status bar
        ".cm-vim-panel": {
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-primary)",
          padding: "2px 8px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
        },
      },
      { dark: true },
    );

    const extensions = [
      vim(),
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      darkTheme,
      EditorView.updateListener.of((update: any) => {
        if (update.docChanged) {
          editor.isDirty = true;
          scheduleSave(update.state.doc.toString());
        }
        if (update.selectionSet || update.docChanged) {
          const line = update.state.doc.lineAt(
            update.state.selection.main.head,
          ).number;
          onCursorLineChange(line);
        }
      }),
    ];

    if (view) {
      view.destroy();
    }

    view = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: editorElement,
    });
  }

  function scheduleSave(newContent: string) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await saveFile(currentFilePath, newContent);
      editor.isDirty = false;
    }, 500);
  }

  // React to filePath changes
  $effect(() => {
    if (filePath !== currentFilePath) {
      currentFilePath = filePath;
      if (view) {
        const { EditorState } = view.state.constructor;
        // Re-dispatch the new content
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: content,
          },
        });
      }
    }
  });

  onMount(() => {
    initEditor();
  });

  onDestroy(() => {
    if (saveTimer) clearTimeout(saveTimer);
    if (view) view.destroy();
  });
</script>

<div class="editor-container">
  <div class="editor-header">
    <span class="filename">{filePath.replace(/\.md$/, "")}</span>
    {#if editor.isDirty}
      <span class="dirty-indicator" title="未保存の変更があります"></span>
    {/if}
  </div>
  <div class="editor-content" bind:this={editorElement}></div>
</div>

<style>
  .editor-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .editor-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
  }

  .filename {
    font-family: var(--font-mono);
  }

  .dirty-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--peach);
  }

  .editor-content {
    flex: 1;
    overflow: hidden;
  }

  .editor-content :global(.cm-editor) {
    height: 100%;
  }

  .editor-content :global(.cm-scroller) {
    overflow: auto;
  }
</style>
