<script lang="ts">
  import { onMount } from "svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import PreviewPane from "./lib/components/PreviewPane.svelte";
  import BacklinkPanel from "./lib/components/BacklinkPanel.svelte";
  import FuzzySearchModal from "./lib/components/FuzzySearchModal.svelte";
  import GitPanel from "./lib/components/GitPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import VaultSelector from "./lib/components/VaultSelector.svelte";
  import {
    getVaultState,
    initVault,
    openVault,
    openFile,
    openDailyNote,
  } from "./lib/stores/vault.svelte";
  import {
    getEditorState,
    togglePreview,
    toggleFuzzySearch,
    closeFuzzySearch,
    toggleBacklinks,
    toggleGitPanel,
  } from "./lib/stores/editor.svelte";
  import { startGitPolling, stopGitPolling } from "./lib/stores/git.svelte";

  const vault = getVaultState();
  const editor = getEditorState();

  let initialized = $state(false);
  let hasVault = $state(false);
  let cursorLine = $state(0);

  onMount(async () => {
    hasVault = await initVault();
    if (hasVault && vault.meta) {
      startGitPolling(vault.meta.path);
    }
    initialized = true;
  });

  async function handleOpenVault() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        await openVault(selected as string);
        hasVault = true;
        if (vault.meta) {
          startGitPolling(vault.meta.path);
        }
      }
    } catch (e) {
      console.error("Dialog error:", e);
      // Fallback: prompt for path
      const path = window.prompt("Vaultフォルダのパスを入力:");
      if (path) {
        await openVault(path);
        hasVault = true;
        if (vault.meta) {
          startGitPolling(vault.meta.path);
        }
      }
    }
  }

  function handleFileSelect(path: string) {
    openFile(path);
  }

  function handleWikilinkNavigate(target: string) {
    // Find the file matching the wikilink target
    const path = target.endsWith(".md") ? target : `${target}.md`;
    openFile(path);
  }

  function handleSearchSelect(path: string) {
    closeFuzzySearch();
    openFile(path);
  }

  function handleKeydown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === "o") {
      e.preventDefault();
      toggleFuzzySearch("filename");
    } else if (meta && e.key === "p") {
      e.preventDefault();
      togglePreview();
    } else if (meta && e.key === "b") {
      e.preventDefault();
      toggleBacklinks();
    } else if (meta && e.shiftKey && e.key === "F") {
      e.preventDefault();
      toggleFuzzySearch("fulltext");
    } else if (meta && !e.shiftKey && e.key === "g") {
      e.preventDefault();
      toggleGitPanel();
    } else if (meta && e.key === "d") {
      e.preventDefault();
      openDailyNote();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !initialized}
  <div class="loading">
    <span>loading...</span>
  </div>
{:else if !hasVault}
  <VaultSelector onOpen={handleOpenVault} />
{:else}
  <div class="app-layout">
    <div class="main-area">
      {#if vault.currentFile}
        <div class="panes">
          <div class="editor-pane">
            <EditorPane
              content={vault.fileContent}
              filePath={vault.currentFile}
              vaultPath={vault.meta?.path ?? ""}
              onCursorLineChange={(line) => (cursorLine = line)}
            />
          </div>

          {#if editor.showPreview}
            <div class="preview-area">
              <PreviewPane
                content={vault.fileContent}
                vaultPath={vault.meta?.path ?? ""}
                cursorLine={cursorLine}
                onWikilinkClick={handleWikilinkNavigate}
              />
              {#if editor.showBacklinks}
                <BacklinkPanel
                  filePath={vault.currentFile}
                  onSelect={handleFileSelect}
                />
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="empty-state">
          <p>ファイルを選択してください</p>
          <p class="hint">
            <kbd>⌘O</kbd> ファイル検索 &nbsp; <kbd>⌘D</kbd> Today
          </p>
        </div>
      {/if}
    </div>

    {#if editor.showGitPanel}
      <GitPanel vaultPath={vault.meta?.path ?? ""} />
    {/if}
  </div>

  <StatusBar vaultPath={vault.meta?.path ?? ""} />

  {#if editor.showFuzzySearch}
    <FuzzySearchModal
      mode={editor.searchMode}
      files={vault.fileTree}
      selectedPath={vault.currentFile}
      onSelect={handleSearchSelect}
      onClose={closeFuzzySearch}
    />
  {/if}
{/if}

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
  }

  .app-layout {
    display: flex;
    height: calc(100% - var(--statusbar-height));
    overflow: hidden;
  }

  .main-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .panes {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .editor-pane {
    flex: 1;
    min-width: 0;
    border-right: 1px solid var(--border);
  }

  .preview-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    gap: 12px;
  }

  .hint {
    font-size: 12px;
  }

  .hint kbd {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 11px;
  }
</style>
