<script lang="ts">
  import type { FileNode } from "@kotonoha/types";
  import { tick } from "svelte";
  import { createNewFile } from "../stores/vault.svelte";

  interface Props {
    files: FileNode[];
    selectedPath: string | null;
    vaultPath: string;
    focused?: boolean;
    onSelect: (path: string) => void;
    onBlur: () => void;
  }

  let { files, selectedPath, vaultPath, focused = false, onSelect, onBlur }: Props = $props();

  interface FlatItem {
    node: FileNode;
    depth: number;
    expanded: boolean;
  }

  let expandedDirs = $state(new Set<string>());
  let cursorIndex = $state(0);
  let creating = $state(false);
  let newFileName = $state("");
  let inputElement: HTMLInputElement;
  let sidebarElement: HTMLDivElement;
  let listElement: HTMLDivElement;

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

  // Expand dirs to selected file
  $effect(() => {
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

  // Focus management: when focused prop becomes true, focus the sidebar
  $effect(() => {
    if (focused && sidebarElement) {
      tick().then(() => sidebarElement.focus());
      // Move cursor to current file
      if (selectedPath && flatItems.length > 0) {
        const idx = flatItems.findIndex((item) => item.node.path === selectedPath);
        if (idx >= 0) cursorIndex = idx;
      }
    }
  });

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

  function toggleDir(path: string) {
    if (expandedDirs.has(path)) {
      expandedDirs.delete(path);
    } else {
      expandedDirs.add(path);
    }
    expandedDirs = new Set(expandedDirs);
  }

  function displayName(name: string, isDir: boolean): string {
    return isDir ? name : name.replace(/\.md$/, "");
  }

  function scrollIntoView() {
    const el = listElement?.querySelector(`[data-index="${cursorIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
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
    tick().then(() => sidebarElement?.focus());
  }

  function handleCreateKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      creating = false;
      tick().then(() => sidebarElement?.focus());
    } else if (e.key === "Enter") {
      handleCreateSubmit();
    }
  }

  function startCreate() {
    creating = true;
    newFileName = "";
    requestAnimationFrame(() => inputElement?.focus());
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!focused || creating) return;

    const item = flatItems[cursorIndex];

    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        cursorIndex = Math.min(cursorIndex + 1, flatItems.length - 1);
        scrollIntoView();
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        cursorIndex = Math.max(cursorIndex - 1, 0);
        scrollIntoView();
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
            if (parentIdx >= 0) cursorIndex = parentIdx;
          }
        }
        break;
      case "Enter":
        e.preventDefault();
        if (item) {
          if (item.node.is_dir) {
            toggleDir(item.node.path);
          } else {
            onSelect(item.node.path);
            onBlur();
          }
        }
        break;
      case "o":
        e.preventDefault();
        startCreate();
        break;
      case "g":
        e.preventDefault();
        cursorIndex = 0;
        scrollIntoView();
        break;
      case "G":
        e.preventDefault();
        cursorIndex = flatItems.length - 1;
        scrollIntoView();
        break;
      case "Escape":
      case "q":
        e.preventDefault();
        onBlur();
        break;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="tree-sidebar"
  class:focused
  bind:this={sidebarElement}
  onkeydown={handleKeydown}
  tabindex="-1"
>
  <div class="sidebar-header">
    <span class="title">{vaultPath.split("/").pop()}</span>
    <button class="new-btn" onclick={startCreate} title="新規ファイル">+</button>
  </div>

  {#if creating}
    <div class="input-row">
      <input
        bind:this={inputElement}
        bind:value={newFileName}
        placeholder="filename.md"
        class="create-input"
        onkeydown={handleCreateKeydown}
      />
    </div>
  {/if}

  <div class="file-list" bind:this={listElement}>
    {#each flatItems as item, i}
      <button
        class="file-item"
        class:selected={focused && i === cursorIndex}
        class:is-current={item.node.path === selectedPath}
        data-index={i}
        onclick={() => {
          if (item.node.is_dir) {
            toggleDir(item.node.path);
          } else {
            onSelect(item.node.path);
          }
        }}
        style="padding-left: {item.depth * 14 + 8}px"
      >
        {#if item.node.is_dir}
          <span class="dir-chevron" class:open={item.expanded}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M3 2l4 3-4 3z" />
            </svg>
          </span>
          <span class="dir-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              {#if item.expanded}
                <path d="M1.5 3h5l1 1.5H14.5v8.5h-13z" fill="#f9e2af" opacity="0.85" />
                <path d="M1.5 6L3 13h10.5L14.5 6z" fill="#f9e2af" />
              {:else}
                <path d="M1.5 3h5l1 1.5H14.5v9h-13z" fill="#f9e2af" opacity="0.85" />
              {/if}
            </svg>
          </span>
          <span class="name dir-name">{displayName(item.node.name, true)}</span>
        {:else}
          {@const fi = getFileIcon(item.node.name)}
          <span class="file-badge" style="color: {fi.color}; border-color: {fi.color}">{fi.icon}</span>
          <span class="name">{displayName(item.node.name, false)}</span>
        {/if}
      </button>
    {/each}
    {#if flatItems.length === 0}
      <div class="empty">ファイルがありません</div>
    {/if}
  </div>

  {#if focused}
    <div class="nav-footer">
      <kbd>j/k</kbd> 移動 <kbd>h/l</kbd> 開閉 <kbd>Enter</kbd> 開く <kbd>o</kbd> 新規 <kbd>Esc</kbd> 戻る
    </div>
  {/if}
</div>

<style>
  .tree-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    outline: none;
  }

  .tree-sidebar.focused {
    background: var(--bg-secondary);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .new-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    border-radius: 3px;
  }

  .new-btn:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .input-row {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .create-input {
    width: 100%;
    background: var(--bg-tertiary);
    border: 1px solid var(--accent);
    color: var(--text-primary);
    padding: 3px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-family: var(--font-mono);
    outline: none;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 8px;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-sans);
  }

  .file-item:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .file-item.selected {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .file-item.is-current {
    background: var(--bg-tertiary);
  }

  .file-item.is-current .name {
    color: var(--accent);
  }

  .dir-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 0.1s;
  }

  .dir-chevron.open {
    transform: rotate(90deg);
  }

  .dir-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .dir-icon svg {
    display: block;
  }

  .file-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    font-size: 7px;
    font-weight: 700;
    font-family: var(--font-mono);
    border: 1px solid;
    border-radius: 2px;
    line-height: 1;
    opacity: 0.85;
    margin-left: 10px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dir-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .empty {
    padding: 12px;
    text-align: center;
    color: var(--text-muted);
    font-size: 11px;
  }

  .nav-footer {
    padding: 4px 8px;
    border-top: 1px solid var(--border);
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .nav-footer kbd {
    background: var(--bg-tertiary);
    padding: 1px 4px;
    border-radius: 2px;
    font-family: var(--font-mono);
    font-size: 9px;
  }
</style>
