<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount, tick } from "svelte";
  import type { FileNode } from "@kotonoha/types";
  import { createNewFile } from "../stores/vault.svelte";

  interface SearchResult {
    path: string;
    filename: string;
    snippet?: string;
    score: number;
  }

  interface Props {
    mode: "filename" | "fulltext" | "tree";
    files?: FileNode[];
    selectedPath?: string | null;
    onSelect: (path: string) => void;
    onClose: () => void;
  }

  let props: Props = $props();
  let mode = $derived(props.mode);
  let files = $derived(props.files ?? []);
  let selectedPath = $derived(props.selectedPath ?? null);
  let onSelect = $derived(props.onSelect);
  let onClose = $derived(props.onClose);

  // --- Shared state ---
  let currentMode = $state(mode);
  let selectedIndex = $state(0);
  let modalElement: HTMLDivElement;

  const modes: Array<"filename" | "fulltext" | "tree"> = [
    "filename",
    "fulltext",
    "tree",
  ];
  const modeLabels = { filename: "ファイル名", fulltext: "全文検索", tree: "ツリー" };

  // --- Search state ---
  let query = $state("");
  let results = $state<SearchResult[]>([]);
  let inputElement: HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Tree state ---
  interface FlatItem {
    node: FileNode;
    depth: number;
    expanded: boolean;
  }
  let expandedDirs = $state(new Set<string>());
  let treeCursor = $state(0);
  let creating = $state(false);
  let newFileName = $state("");
  let treeInputElement: HTMLInputElement;
  let treeListElement: HTMLDivElement;

  const fileIcons: Record<string, { icon: string; color: string }> = {
    md: { icon: "M", color: "#89b4fa" },
    ts: { icon: "TS", color: "#3178c6" },
    js: { icon: "JS", color: "#f0db4f" },
    json: { icon: "{}", color: "#a6e3a1" },
    css: { icon: "#", color: "#74c7ec" },
    html: { icon: "<>", color: "#fab387" },
    svelte: { icon: "S", color: "#ff3e00" },
    rs: { icon: "Rs", color: "#f38ba8" },
    toml: { icon: "T", color: "#a6adc8" },
    yaml: { icon: "Y", color: "#f38ba8" },
    yml: { icon: "Y", color: "#f38ba8" },
    png: { icon: "I", color: "#cba6f7" },
    jpg: { icon: "I", color: "#cba6f7" },
    svg: { icon: "I", color: "#cba6f7" },
    sql: { icon: "Q", color: "#f9e2af" },
    sh: { icon: "$", color: "#a6e3a1" },
  };

  function getFileIcon(name: string): { icon: string; color: string } {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return fileIcons[ext] ?? { icon: "F", color: "var(--text-muted)" };
  }

  // --- Init ---
  onMount(() => {
    // Expand dirs to selected file
    if (selectedPath) {
      const parts = selectedPath.split("/");
      let current = "";
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        expandedDirs.add(current);
      }
      expandedDirs = new Set(expandedDirs);
    }
  });

  $effect(() => {
    currentMode = mode;
  });

  // Focus management per mode
  $effect(() => {
    if (currentMode === "tree") {
      tick().then(() => modalElement?.focus());
    } else {
      tick().then(() => inputElement?.focus());
    }
  });

  // --- Search logic ---
  $effect(() => {
    if (currentMode === "tree") return;
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = query;
    const m = currentMode;
    debounceTimer = setTimeout(() => doSearch(q, m), 100);
  });

  async function doSearch(q: string, m: string) {
    try {
      if (m === "filename") {
        results = await invoke<SearchResult[]>("fuzzy_files", { query: q });
      } else {
        if (q.length < 2) {
          results = [];
          return;
        }
        results = await invoke<SearchResult[]>("full_text_search", {
          query: q,
        });
      }
      selectedIndex = 0;
    } catch {
      results = [];
    }
  }

  // --- Tree logic ---
  function flattenTree(nodes: FileNode[], depth: number): FlatItem[] {
    const items: FlatItem[] = [];
    const sorted = [...nodes].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of sorted) {
      const expanded = expandedDirs.has(node.path);
      items.push({ node, depth, expanded });
      if (node.is_dir && expanded && node.children) {
        items.push(...flattenTree(node.children, depth + 1));
      }
    }
    return items;
  }

  let flatItems = $derived(flattenTree(files, 0));

  // Set initial tree cursor to current file
  $effect(() => {
    if (currentMode === "tree" && selectedPath && flatItems.length > 0) {
      const idx = flatItems.findIndex((item) => item.node.path === selectedPath);
      if (idx >= 0) treeCursor = idx;
    }
  });

  function treeScrollIntoView() {
    const el = treeListElement?.querySelector(`[data-index="${treeCursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }

  function displayName(name: string, isDir: boolean): string {
    return isDir ? name : name.replace(/\.md$/, "");
  }

  async function handleCreateSubmit() {
    if (!newFileName.trim()) {
      creating = false;
      return;
    }
    const path = newFileName.endsWith(".md") ? newFileName : `${newFileName}.md`;
    await createNewFile(path);
    creating = false;
    newFileName = "";
  }

  // --- Keydown handlers ---
  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter" && results[selectedIndex]) {
      onSelect(results[selectedIndex].path);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const idx = modes.indexOf(currentMode);
      currentMode = modes[(idx + 1) % modes.length];
    }
  }

  function handleTreeKeydown(e: KeyboardEvent) {
    if (creating) {
      if (e.key === "Escape") {
        creating = false;
      } else if (e.key === "Enter") {
        handleCreateSubmit();
      }
      return;
    }

    const item = flatItems[treeCursor];

    switch (e.key) {
      case "Tab":
        e.preventDefault();
        {
          const idx = modes.indexOf(currentMode);
          currentMode = modes[(idx + 1) % modes.length];
        }
        break;
      case "j":
      case "ArrowDown":
        e.preventDefault();
        treeCursor = Math.min(treeCursor + 1, flatItems.length - 1);
        treeScrollIntoView();
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        treeCursor = Math.max(treeCursor - 1, 0);
        treeScrollIntoView();
        break;
      case "l":
      case "ArrowRight":
        e.preventDefault();
        if (item?.node.is_dir) {
          expandedDirs.add(item.node.path);
          expandedDirs = new Set(expandedDirs);
        }
        break;
      case "h":
      case "ArrowLeft":
        e.preventDefault();
        if (item?.node.is_dir && expandedDirs.has(item.node.path)) {
          expandedDirs.delete(item.node.path);
          expandedDirs = new Set(expandedDirs);
        } else if (item) {
          const parentPath = item.node.path.split("/").slice(0, -1).join("/");
          if (parentPath) {
            const parentIdx = flatItems.findIndex(
              (fi) => fi.node.path === parentPath,
            );
            if (parentIdx >= 0) treeCursor = parentIdx;
          }
        }
        break;
      case "Enter":
        e.preventDefault();
        if (item) {
          if (item.node.is_dir) {
            if (expandedDirs.has(item.node.path)) {
              expandedDirs.delete(item.node.path);
            } else {
              expandedDirs.add(item.node.path);
            }
            expandedDirs = new Set(expandedDirs);
          } else {
            onSelect(item.node.path);
          }
        }
        break;
      case "o":
        e.preventDefault();
        creating = true;
        newFileName = "";
        requestAnimationFrame(() => treeInputElement?.focus());
        break;
      case "g":
        e.preventDefault();
        treeCursor = 0;
        treeScrollIntoView();
        break;
      case "G":
        e.preventDefault();
        treeCursor = flatItems.length - 1;
        treeScrollIntoView();
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  function displaySearchName(filename: string): string {
    return filename.replace(/\.md$/, "");
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={onClose}>
  <div
    class="modal"
    bind:this={modalElement}
    onclick={(e) => e.stopPropagation()}
    onkeydown={currentMode === "tree" ? handleTreeKeydown : handleSearchKeydown}
    tabindex="-1"
  >
    <div class="search-header">
      <div class="mode-tabs">
        {#each modes as m}
          <button
            class="mode-tab"
            class:active={currentMode === m}
            onclick={() => (currentMode = m)}
          >
            {modeLabels[m]}
          </button>
        {/each}
      </div>
      {#if currentMode !== "tree"}
        <input
          bind:this={inputElement}
          bind:value={query}
          placeholder={currentMode === "filename"
            ? "ファイル名を検索..."
            : "全文検索..."}
          class="search-input"
        />
      {/if}
    </div>

    {#if currentMode === "tree"}
      <!-- Tree mode -->
      {#if creating}
        <div class="input-row">
          <input
            bind:this={treeInputElement}
            bind:value={newFileName}
            placeholder="filename.md"
            class="tree-input"
          />
        </div>
      {/if}

      <div class="results" bind:this={treeListElement}>
        {#each flatItems as item, i}
          <button
            class="tree-item"
            class:selected={i === treeCursor}
            class:is-current={item.node.path === selectedPath}
            data-index={i}
            onclick={() => {
              treeCursor = i;
              if (!item.node.is_dir) {
                onSelect(item.node.path);
              } else {
                if (expandedDirs.has(item.node.path)) {
                  expandedDirs.delete(item.node.path);
                } else {
                  expandedDirs.add(item.node.path);
                }
                expandedDirs = new Set(expandedDirs);
              }
            }}
            onmouseenter={() => (treeCursor = i)}
            style="padding-left: {item.depth * 16 + 12}px"
          >
            {#if item.node.is_dir}
              <span class="dir-icon" class:open={item.expanded}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  {#if item.expanded}
                    <path
                      d="M1.5 3h5l1 1.5H14.5v8.5h-13z"
                      fill="#f9e2af"
                      opacity="0.85"
                    />
                    <path d="M1.5 6L3 13h10.5L14.5 6z" fill="#f9e2af" />
                  {:else}
                    <path
                      d="M1.5 3h5l1 1.5H14.5v9h-13z"
                      fill="#f9e2af"
                      opacity="0.85"
                    />
                  {/if}
                </svg>
              </span>
              <span class="tree-name dir-name"
                >{displayName(item.node.name, true)}</span
              >
            {:else}
              {@const fi = getFileIcon(item.node.name)}
              <span
                class="file-badge"
                style="color: {fi.color}; border-color: {fi.color}"
                >{fi.icon}</span
              >
              <span class="tree-name"
                >{displayName(item.node.name, false)}</span
              >
            {/if}
          </button>
        {/each}
        {#if flatItems.length === 0}
          <div class="no-results">ファイルがありません</div>
        {/if}
      </div>
    {:else}
      <!-- Search mode -->
      <div class="results">
        {#each results as result, i}
          <button
            class="result-item"
            class:selected={i === selectedIndex}
            onclick={() => onSelect(result.path)}
            onmouseenter={() => (selectedIndex = i)}
          >
            <span class="result-name"
              >{displaySearchName(result.filename)}</span
            >
            <span class="result-path">{result.path}</span>
            {#if result.snippet}
              <span class="result-snippet">{@html result.snippet}</span>
            {/if}
          </button>
        {/each}
        {#if results.length === 0 && query.length > 0}
          <div class="no-results">結果なし</div>
        {/if}
      </div>
    {/if}

    <div class="search-footer">
      {#if currentMode === "tree"}
        <kbd>j/k</kbd> 移動 &nbsp; <kbd>h/l</kbd> 開閉 &nbsp;
        <kbd>Enter</kbd> 開く &nbsp; <kbd>o</kbd> 新規 &nbsp;
        <kbd>Tab</kbd> モード切替 &nbsp; <kbd>Esc</kbd> 閉じる
      {:else}
        <kbd>↑↓</kbd> 移動 &nbsp; <kbd>Enter</kbd> 開く &nbsp;
        <kbd>Tab</kbd> モード切替 &nbsp; <kbd>Esc</kbd> 閉じる
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    padding-top: 80px;
    z-index: 100;
  }

  .modal {
    width: 560px;
    max-height: 600px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    align-self: flex-start;
    outline: none;
  }

  .search-header {
    padding: 8px;
    border-bottom: 1px solid var(--border);
  }

  .mode-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }

  .mode-tab {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
  }

  .mode-tab.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .search-input {
    width: 100%;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    font-family: var(--font-mono);
    outline: none;
  }

  .search-input:focus {
    border-color: var(--accent);
  }

  .input-row {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }

  .tree-input {
    width: 100%;
    background: var(--bg-tertiary);
    border: 1px solid var(--accent);
    color: var(--text-primary);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--font-mono);
    outline: none;
  }

  .results {
    flex: 1;
    overflow-y: auto;
    max-height: 460px;
  }

  /* Search results */
  .result-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    font-family: var(--font-sans);
  }

  .result-item.selected {
    background: var(--bg-tertiary);
  }

  .result-name {
    font-size: 14px;
    font-weight: 500;
  }

  .result-path {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .result-snippet {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-snippet :global(mark) {
    background: rgba(249, 226, 175, 0.3);
    color: var(--text-primary);
  }

  /* Tree items */
  .tree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 12px;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-sans);
  }

  .tree-item.selected {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .tree-item.is-current .tree-name {
    color: var(--accent);
  }

  .dir-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .dir-icon svg {
    display: block;
  }

  .file-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    font-size: 8px;
    font-weight: 700;
    font-family: var(--font-mono);
    border: 1px solid;
    border-radius: 3px;
    line-height: 1;
    opacity: 0.85;
  }

  .tree-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dir-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .no-results {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  .search-footer {
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
  }

  .search-footer kbd {
    background: var(--bg-tertiary);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
  }
</style>
