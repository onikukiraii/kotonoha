<script lang="ts">
  import { onMount } from "svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import TabBar from "./lib/components/TabBar.svelte";
  import BacklinkPanel from "./lib/components/BacklinkPanel.svelte";
  import FuzzySearchModal from "./lib/components/FuzzySearchModal.svelte";
  import CategoryPickerModal from "./lib/components/CategoryPickerModal.svelte";
  import GitPanel from "./lib/components/GitPanel.svelte";
  import TreeSidebar from "./lib/components/TreeSidebar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import VaultSelector from "./lib/components/VaultSelector.svelte";
  import { BaseView, CreateBaseWizard } from "@kotonoha/ui";
  import type { BaseFile, PropertySchema, QueryResult, Row } from "@kotonoha/base";
  import { parseBase, serializeBase } from "@kotonoha/base";
  import { runBaseFileDesktop, readVaultSchemaDesktop } from "./lib/base";
  import { invoke } from "@tauri-apps/api/core";
  import { createNewFile, loadFiles } from "./lib/stores/vault.svelte";
  import {
    getVaultState,
    initVault,
    openVault,
    openDailyNote,
    listSubdirs,
    createLearningLog,
    reloadVault,
  } from "./lib/stores/vault.svelte";
  import { LEARNING_LOGS_DIR } from "@kotonoha/ui/learning-log";
  import {
    getEditorState,
    toggleFuzzySearch,
    closeFuzzySearch,
    toggleBacklinks,
    toggleGitPanel,
    toggleLivePreview,
    toggleTreeSidebar,
    blurTreeSidebar,
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
  import { startWatcher, stopWatcher } from "./lib/stores/watcher.svelte";

  const vault = getVaultState();
  const editor = getEditorState();
  const tabsState = getTabsState();

  let initialized = $state(false);
  let hasVault = $state(false);
  let showLearningPicker = $state(false);
  let learningCategories = $state<string[]>([]);
  let baseResult = $state<QueryResult | null>(null);
  let baseRawYaml = $state<string | null>(null);
  let baseAst = $state<BaseFile | null>(null);
  let baseSchema = $state<PropertySchema | null>(null);
  let baseError = $state<string | null>(null);
  let baseLoadingPath = $state<string | null>(null);
  let showCreateWizard = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const activeFilePath = $derived(vault.currentFile);
  const isBaseFile = $derived(activeFilePath?.endsWith(".base") ?? false);

  $effect(() => {
    const p = activeFilePath;
    const vaultPath = vault.meta?.path;
    if (!p || !p.endsWith(".base") || !vaultPath) {
      baseResult = null;
      baseError = null;
      baseRawYaml = null;
      baseAst = null;
      baseSchema = null;
      baseLoadingPath = null;
      return;
    }
    if (baseLoadingPath === p) return;
    baseLoadingPath = p;
    baseResult = null;
    baseError = null;
    Promise.all([
      runBaseFileDesktop(vaultPath, p),
      invoke<string>("read_base_file", { vaultPath, basePath: p }),
      readVaultSchemaDesktop(vaultPath, null),
    ])
      .then(([r, yaml, schema]) => {
        if (activeFilePath !== p) return;
        baseResult = r;
        baseRawYaml = yaml;
        baseAst = parseBase(yaml);
        baseSchema = schema;
      })
      .catch((e: Error) => {
        if (activeFilePath === p) baseError = e.message;
      });
  });

  async function handleBaseRowClick(row: Row) {
    await openTab(row.path);
  }

  function collectFolders(nodes: import("@kotonoha/types").FileNode[], acc: string[] = []): string[] {
    for (const n of nodes) {
      if (n.is_dir) {
        acc.push(n.path);
        if (n.children) collectFolders(n.children, acc);
      }
    }
    return acc;
  }

  async function handleBaseAstChange(next: BaseFile) {
    baseAst = next;
    const yaml = serializeBase(next);
    baseRawYaml = yaml;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const p = activeFilePath;
      const vaultPath = vault.meta?.path;
      if (!p || !vaultPath) return;
      try {
        await invoke("write_file", { path: p, content: yaml, vaultPath });
        baseResult = await runBaseFileDesktop(vaultPath, p);
      } catch (err) {
        baseError = (err as Error).message;
      }
    }, 400);
  }

  async function handleSaveYaml(yaml: string) {
    const p = activeFilePath;
    const vaultPath = vault.meta?.path;
    if (!p || !vaultPath) return;
    await invoke("write_file", { path: p, content: yaml, vaultPath });
    baseRawYaml = yaml;
    baseAst = parseBase(yaml);
    baseResult = await runBaseFileDesktop(vaultPath, p);
  }

  async function handleCreateBase(filePath: string, yaml: string) {
    await createNewFile(filePath, yaml);
    await loadFiles();
    showCreateWizard = false;
    await openTab(filePath);
  }

  onMount(() => {
    (async () => {
      hasVault = await initVault();
      if (hasVault && vault.meta) {
        startGitPolling(vault.meta.path);
        await startWatcher(vault.meta.path);
      }
      initialized = true;
    })();

    return () => {
      stopGitPolling();
      stopWatcher();
    };
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
          await startWatcher(vault.meta.path);
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
          await startWatcher(vault.meta.path);
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

  async function handleOpenLearningLog() {
    learningCategories = await listSubdirs(LEARNING_LOGS_DIR);
    showLearningPicker = true;
  }

  async function handleLearningCategorySelect(category: string) {
    showLearningPicker = false;
    try {
      const path = await createLearningLog(category);
      if (path) {
        await openTab(path);
      }
    } catch (e) {
      console.error("[learning-log] failed:", e);
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
    } else if (meta && e.key === "l") {
      e.preventDefault();
      handleOpenLearningLog();
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
    } else if (meta && e.key === "t") {
      e.preventDefault();
      toggleTreeSidebar();
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
    {#if editor.treeSidebarFocused}
      <div class="tree-sidebar-area">
        <TreeSidebar
          files={vault.fileTree}
          selectedPath={vault.currentFile}
          vaultPath={vault.meta?.path ?? ""}
          focused={editor.treeSidebarFocused}
          onSelect={handleFileSelect}
          onBlur={blurTreeSidebar}
          onCreateBase={() => (showCreateWizard = true)}
        />
      </div>
    {/if}
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
              {#if isBaseFile}
                {#if baseError}
                  <div class="base-error">.base 実行失敗: {baseError}</div>
                {:else if baseResult}
                  <BaseView
                    result={baseResult}
                    rawYaml={baseRawYaml ?? ""}
                    base={baseAst ?? undefined}
                    schema={baseSchema ?? undefined}
                    onBaseChange={handleBaseAstChange}
                    onSaveYaml={handleSaveYaml}
                    onRowClick={handleBaseRowClick}
                  />
                {:else}
                  <div class="base-loading">読み込み中...</div>
                {/if}
              {:else}
                <EditorPane
                  content={vault.fileContent}
                  contentVersion={vault.fileContentVersion}
                  filePath={vault.currentFile}
                  vaultPath={vault.meta?.path ?? ""}
                  onCursorLineChange={() => {}}
                  onWikilinkNavigate={handleWikilinkNavigate}
                />
              {/if}
            {/key}
          </div>

          {#if editor.showBacklinks && !isBaseFile}
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
            <kbd>⌘O</kbd> ファイル検索 &nbsp; <kbd>⌘T</kbd> ツリー &nbsp; <kbd>⌘D</kbd> Today &nbsp; <kbd>⌘L</kbd> 学習ログ &nbsp; <kbd>⌘R</kbd> リロード &nbsp; <kbd>⌘[</kbd><kbd>⌘]</kbd> タブ移動 &nbsp; <kbd>⌘W</kbd> タブを閉じる
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
      vaultPath={vault.meta?.path ?? ""}
      onSelect={handleSearchSelect}
      onClose={closeFuzzySearch}
    />
  {/if}

  {#if showLearningPicker}
    <CategoryPickerModal
      categories={learningCategories}
      onSelect={handleLearningCategorySelect}
      onClose={() => (showLearningPicker = false)}
    />
  {/if}

  {#if showCreateWizard && vault.meta}
    <CreateBaseWizard
      folders={collectFolders(vault.fileTree)}
      loadSchema={(folder) => readVaultSchemaDesktop(vault.meta!.path, folder)}
      onCreate={handleCreateBase}
      onCancel={() => (showCreateWizard = false)}
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

  .tree-sidebar-area {
    width: 220px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
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

  .base-error {
    padding: 16px;
    color: #f38ba8;
    font-size: 13px;
  }
  .base-loading {
    padding: 16px;
    color: var(--text-muted);
  }
</style>
