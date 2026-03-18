<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { saveFile } from "../stores/vault.svelte";
  import { getEditorState, toggleLivePreview } from "../stores/editor.svelte";
  import { livePreview } from "@kotonoha/ui/livePreview";

  interface Props {
    content: string;
    filePath: string;
    vaultPath: string;
    onCursorLineChange?: (line: number) => void;
    onWikilinkNavigate?: (target: string) => void;
  }

  let { content, filePath, vaultPath, onCursorLineChange = () => {}, onWikilinkNavigate = () => {} }: Props = $props();

  const editor = getEditorState();
  let editorElement: HTMLDivElement;
  let view: any = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let currentFilePath = $state(filePath);

  async function initEditor(useLivePreview: boolean) {
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

    // Preserve current doc content if view exists
    const currentDoc = view ? view.state.doc.toString() : content;

    // macOS Emacs keybindings (work in vim insert mode)
    const { cursorLineStart, cursorLineEnd } = await import("@codemirror/commands");
    const emacsKeys = keymap.of([
      { key: "Ctrl-a", run: cursorLineStart },
      { key: "Ctrl-e", run: cursorLineEnd },
      {
        key: "Ctrl-k",
        run: (v: any) => {
          const head = v.state.selection.main.head;
          const line = v.state.doc.lineAt(head);
          if (head === line.to) return false;
          v.dispatch({ changes: { from: head, to: line.to } });
          return true;
        },
      },
    ]);

    const extensions = [
      vim(),
      emacsKeys,
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      darkTheme,
      ...(useLivePreview ? livePreview({ onWikilinkClick: onWikilinkNavigate }) : []),
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
      state: EditorState.create({ doc: currentDoc, extensions }),
      parent: editorElement,
    });
    view.focus();
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
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: content,
          },
        });
        view.focus();
      }
    }
  });

  // React to livePreview toggle
  $effect(() => {
    const lp = editor.livePreviewEnabled;
    if (view && editorElement) {
      initEditor(lp);
    }
  });

  onMount(() => {
    initEditor(editor.livePreviewEnabled);
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
    <button
      class="lp-toggle"
      class:active={editor.livePreviewEnabled}
      onclick={toggleLivePreview}
      title={editor.livePreviewEnabled ? "Raw Markdown (⌘P)" : "Live Preview (⌘P)"}
    >
      {#if editor.livePreviewEnabled}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
      {/if}
    </button>
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
    flex: 1;
  }

  .dirty-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--peach);
  }

  .lp-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .lp-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .lp-toggle.active {
    color: var(--accent);
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
