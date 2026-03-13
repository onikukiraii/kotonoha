<script lang="ts">
  import type { FileNode } from "@kotonoha/types";
  import { onMount, tick } from "svelte";
  import { createNewFile } from "../stores/vault.svelte";

  interface Props {
    files: FileNode[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
    onClose: () => void;
    vaultPath: string;
  }

  let { files, selectedPath, onSelect, onClose, vaultPath }: Props = $props();

  interface FlatItem {
    node: FileNode;
    depth: number;
    expanded: boolean;
  }

  let expandedDirs = $state(new Set<string>());
  let cursorIndex = $state(0);
  let renaming = $state(false);
  let renameValue = $state("");
  let creating = $state(false);
  let newFileName = $state("");
  let navigatorElement: HTMLDivElement;
  let listElement: HTMLDivElement;
  let inputElement: HTMLInputElement;

  // File extension to icon/color mapping
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

  // Initialize expanded dirs from the selected path
  onMount(() => {
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

  // Auto-focus: wait for bind:this to resolve, then focus
  $effect(() => {
    if (navigatorElement) {
      tick().then(() => navigatorElement.focus());
    }
  });

  function flattenTree(nodes: FileNode[], depth: number): FlatItem[] {
    const items: FlatItem[] = [];
    // Sort: directories first, then alphabetically
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

  // Set initial cursor to currently selected file
  $effect(() => {
    if (selectedPath && flatItems.length > 0) {
      const idx = flatItems.findIndex((item) => item.node.path === selectedPath);
      if (idx >= 0) cursorIndex = idx;
    }
  });

  function scrollIntoView() {
    const el = listElement?.querySelector(`[data-index="${cursorIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (renaming || creating) {
      if (e.key === "Escape") {
        renaming = false;
        creating = false;
      } else if (e.key === "Enter") {
        if (renaming) handleRenameSubmit();
        if (creating) handleCreateSubmit();
      }
      return;
    }

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
          // Go to parent directory
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
            if (expandedDirs.has(item.node.path)) {
              expandedDirs.delete(item.node.path);
            } else {
              expandedDirs.add(item.node.path);
            }
            expandedDirs = new Set(expandedDirs);
          } else {
            onSelect(item.node.path);
            onClose();
          }
        }
        break;
      case "o":
        e.preventDefault();
        creating = true;
        newFileName = "";
        requestAnimationFrame(() => inputElement?.focus());
        break;
      case "r":
        e.preventDefault();
        if (item && !item.node.is_dir) {
          renaming = true;
          renameValue = item.node.name;
          requestAnimationFrame(() => inputElement?.focus());
        }
        break;
      case "Escape":
      case "q":
        e.preventDefault();
        onClose();
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
    }
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

  async function handleRenameSubmit() {
    // TODO: implement rename via Tauri command
    renaming = false;
    renameValue = "";
  }

  function displayName(name: string, isDir: boolean): string {
    return isDir ? name : name.replace(/\.md$/, "");
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={onClose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="navigator"
    bind:this={navigatorElement}
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
    tabindex="-1"
    role="dialog"
  >
    <div class="nav-header">
      <span class="title">Files</span>
      <span class="path">{vaultPath.split("/").pop()}</span>
    </div>

    {#if creating}
      <div class="input-row">
        <input
          bind:this={inputElement}
          bind:value={newFileName}
          placeholder="filename.md"
          class="nav-input"
        />
      </div>
    {/if}

    {#if renaming}
      <div class="input-row">
        <input
          bind:this={inputElement}
          bind:value={renameValue}
          class="nav-input"
        />
      </div>
    {/if}

    <div class="file-list" bind:this={listElement}>
      {#each flatItems as item, i}
        <button
          class="file-item"
          class:selected={i === cursorIndex}
          class:is-current={item.node.path === selectedPath}
          data-index={i}
          onclick={() => {
            cursorIndex = i;
            if (!item.node.is_dir) {
              onSelect(item.node.path);
              onClose();
            } else {
              if (expandedDirs.has(item.node.path)) {
                expandedDirs.delete(item.node.path);
              } else {
                expandedDirs.add(item.node.path);
              }
              expandedDirs = new Set(expandedDirs);
            }
          }}
          onmouseenter={() => (cursorIndex = i)}
          style="padding-left: {item.depth * 16 + 12}px"
        >
          {#if item.node.is_dir}
            <span class="dir-icon" class:open={item.expanded}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                {#if item.expanded}
                  <path d="M1.5 3h5l1 1.5H14.5v8.5h-13z" fill="#f9e2af" opacity="0.85"/>
                  <path d="M1.5 6L3 13h10.5L14.5 6z" fill="#f9e2af"/>
                {:else}
                  <path d="M1.5 3h5l1 1.5H14.5v9h-13z" fill="#f9e2af" opacity="0.85"/>
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

    <div class="nav-footer">
      <kbd>j/k</kbd> 移動 &nbsp; <kbd>h/l</kbd> 開閉 &nbsp;
      <kbd>Enter</kbd> 開く &nbsp; <kbd>o</kbd> 新規 &nbsp;
      <kbd>q/Esc</kbd> 閉じる
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
    padding-top: 60px;
    z-index: 100;
  }

  .navigator {
    width: 560px;
    max-height: 640px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    align-self: flex-start;
    outline: none;
  }

  .nav-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.5px;
  }

  .path {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .input-row {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }

  .nav-input {
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

  .file-list {
    flex: 1;
    overflow-y: auto;
    max-height: 520px;
    padding: 4px 0;
  }

  .file-item {
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

  .file-item.selected {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .file-item.is-current .name {
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
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  .nav-footer {
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
  }

  .nav-footer kbd {
    background: var(--bg-tertiary);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
  }
</style>
