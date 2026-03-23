<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { saveFile } from "../stores/vault.svelte";
  import { getEditorState, toggleLivePreview } from "../stores/editor.svelte";
  import { getTabsState, setTabDirty, setEditorViewRef } from "../stores/tabs.svelte";
  import { livePreview } from "@kotonoha/ui/livePreview";
  import { openUrl } from "@tauri-apps/plugin-opener";

  interface Props {
    content: string;
    filePath: string;
    vaultPath: string;
    onCursorLineChange?: (line: number) => void;
    onWikilinkNavigate?: (target: string) => void;
  }

  let { content, filePath, vaultPath, onCursorLineChange = () => {}, onWikilinkNavigate = () => {} }: Props = $props();

  const editor = getEditorState();
  const tabsState = getTabsState();
  let editorElement: HTMLDivElement;
  let view: any = null;
  let livePreviewCompartment: any = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function getLivePreviewExtensions(enabled: boolean) {
    if (enabled) {
      return livePreview({ onWikilinkClick: onWikilinkNavigate, onLinkClick: (url: string) => openUrl(url) });
    }
    return [];
  }

  async function initEditor(useLivePreview: boolean) {
    const { EditorView, keymap, lineNumbers, drawSelection } = await import(
      "@codemirror/view"
    );
    const { EditorState, Compartment } = await import("@codemirror/state");
    const { markdown, markdownLanguage } = await import(
      "@codemirror/lang-markdown"
    );
    const { languages } = await import("@codemirror/language-data");
    const { defaultKeymap, history, historyKeymap, indentWithTab } = await import(
      "@codemirror/commands"
    );
    const { vim, getCM } = await import("@replit/codemirror-vim");

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
          backgroundColor: "rgba(137, 180, 250, 0.45) !important",
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

    // Create compartment for live preview extensions (allows dynamic reconfigure)
    livePreviewCompartment = new Compartment();

    const extensions = [
      vim(),
      drawSelection(),
      emacsKeys,
      keymap.of([indentWithTab]),
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      darkTheme,
      livePreviewCompartment.of(getLivePreviewExtensions(useLivePreview)),
      EditorView.updateListener.of((update: any) => {
        if (update.docChanged) {
          editor.isDirty = true;
          if (tabsState.activeTabId) {
            setTabDirty(tabsState.activeTabId, true);
          }
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

    // Listen for vim mode changes
    const cm = getCM(view);
    if (cm) {
      cm.on("vim-mode-change", (e: { mode: string; subMode?: string }) => {
        if (e.mode === "normal") editor.vimMode = "NORMAL";
        else if (e.mode === "insert") editor.vimMode = "INSERT";
        else if (e.mode === "visual") {
          if (e.subMode === "linewise") editor.vimMode = "V-LINE";
          else if (e.subMode === "blockwise") editor.vimMode = "V-BLOCK";
          else editor.vimMode = "VISUAL";
        } else if (e.mode === "replace") editor.vimMode = "REPLACE";
      });
    }

    setEditorViewRef(view);
    view.focus();
  }

  function scheduleSave(newContent: string) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await saveFile(filePath, newContent);
      editor.isDirty = false;
      if (tabsState.activeTabId) {
        setTabDirty(tabsState.activeTabId, false);
      }
    }, 500);
  }

  // React to livePreview toggle — reconfigure extensions without destroying the editor
  $effect(() => {
    const lp = editor.livePreviewEnabled;
    if (view && livePreviewCompartment) {
      view.dispatch({
        effects: livePreviewCompartment.reconfigure(getLivePreviewExtensions(lp)),
      });
    }
  });

  // Update editor content when navigating to a different file
  // (safety net in case {#key} doesn't trigger component recreation)
  $effect(() => {
    const _fp = filePath;
    if (view) {
      const newContent = untrack(() => content);
      if (view.state.doc.toString() !== newContent) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newContent },
        });
      }
    }
  });

  onMount(() => {
    initEditor(editor.livePreviewEnabled);
  });

  onDestroy(() => {
    if (saveTimer) clearTimeout(saveTimer);
    if (view) view.destroy();
    setEditorViewRef(null);
  });
</script>

<div class="editor-container">
  <div class="editor-header">
    <span class="vim-mode" class:insert={editor.vimMode === "INSERT"} class:visual={editor.vimMode.startsWith("V") || editor.vimMode === "VISUAL"} class:replace={editor.vimMode === "REPLACE"}>{editor.vimMode}</span>
    <span class="header-spacer"></span>
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

  .vim-mode {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .vim-mode.insert {
    background: var(--green, #a6e3a1);
    color: var(--bg-primary, #1e1e2e);
  }

  .vim-mode.visual {
    background: var(--mauve, #cba6f7);
    color: var(--bg-primary, #1e1e2e);
  }

  .vim-mode.replace {
    background: var(--red, #f38ba8);
    color: var(--bg-primary, #1e1e2e);
  }

  .header-spacer {
    flex: 1;
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
