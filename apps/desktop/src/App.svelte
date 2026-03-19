<script lang="ts">
  import { onMount } from "svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import TabBar from "./lib/components/TabBar.svelte";
  import BacklinkPanel from "./lib/components/BacklinkPanel.svelte";
  import FuzzySearchModal from "./lib/components/FuzzySearchModal.svelte";
  import GitPanel from "./lib/components/GitPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import VaultSelector from "./lib/components/VaultSelector.svelte";
  import {
    getVaultState,
    initVault,
    openVault,
    openDailyNote,
    reloadVault,
  } from "./lib/stores/vault.svelte";
  import {
    getEditorState,
    toggleFuzzySearch,
    closeFuzzySearch,
    toggleBacklinks,
    toggleGitPanel,
    toggleLivePreview,
  } from "./lib/stores/editor.svelte";
  import {
    getTabsState,
    openTab,
    closeTab,
    activateTab,
    activateNextTab,
    activatePrevTab,
  } from "./lib/stores/tabs.svelte";
  import { startGitPolling, stopGitPolling } from "./lib/stores/git.svelte";

  const vault = getVaultState();
  const editor = getEditorState();
  const tabsState = getTabsState();

  let initialized = $state(false);
  let hasVault = $state(false);

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

  async function handleFileSelect(path: string) {
    await openTab(path);
  }

  async function handleWikilinkNavigate(target: string) {
    const name = target.endsWith(".md") ? target : `${target}.md`;

    function findFile(nodes: import("@kotonoha/types").FileNode[], search: string): string | null {
      for (const node of nodes) {
        if (!node.is_dir && (node.name === search || node.path === search)) {
          return node.path;
        }
        if (node.is_dir && node.children) {
          const found = findFile(node.children, search);
          if (found) return found;
        }
      }
      return null;
    }

    const filePath = findFile(vault.fileTree, name);
    if (filePath) {
      await openTab(filePath);
    }
  }

  async function handleSearchSelect(path: string) {
    closeFuzzySearch();
    await openTab(path);
  }

  async function handleOpenDailyNote() {
    const path = await openDailyNote();
    if (path) {
      await openTab(path);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === "o") {
      e.preventDefault();
      toggleFuzzySearch("filename");
    } else if (meta && e.key === "p") {
      e.preventDefault();
      toggleLivePreview();
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
      handleOpenDailyNote();
    } else if (meta && e.key === "w") {
      e.preventDefault();
      if (tabsState.activeTabId) {
        closeTab(tabsState.activeTabId);
      }
    } else if (meta && e.key === "]") {
      e.preventDefault();
      activateNextTab();
    } else if (meta && e.key === "[") {
      e.preventDefault();
      activatePrevTab();
    } else if (meta && e.key === "r") {
      e.preventDefault();
      reloadVault();
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
      {#if tabsState.tabs.length > 0}
        <TabBar
          tabs={tabsState.tabs}
          activeTabId={tabsState.activeTabId}
          onActivate={(id) => activateTab(id)}
          onClose={(id) => closeTab(id)}
        />
      {/if}

      {#if tabsState.activeTabId && vault.currentFile}
        <div class="panes">
          <div class="editor-pane">
            {#key vault.currentFile}
              <EditorPane
                content={vault.fileContent}
                filePath={vault.currentFile}
                vaultPath={vault.meta?.path ?? ""}
                onCursorLineChange={() => {}}
                onWikilinkNavigate={handleWikilinkNavigate}
              />
            {/key}
          </div>

          {#if editor.showBacklinks}
            <div class="backlinks-area">
              <BacklinkPanel
                filePath={vault.currentFile}
                onSelect={handleFileSelect}
              />
            </div>
          {/if}
        </div>
      {:else}
        <div class="empty-state">
          <p>ファイルを選択してください</p>
          <p class="hint">
            <kbd>⌘O</kbd> ファイル検索 &nbsp; <kbd>⌘D</kbd> Today &nbsp; <kbd>⌘R</kbd> リロード &nbsp; <kbd>⌘[</kbd><kbd>⌘]</kbd> タブ移動 &nbsp; <kbd>⌘W</kbd> タブを閉じる
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
  }

  .backlinks-area {
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    overflow-y: auto;
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
