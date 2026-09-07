<script lang="ts">
  import type { FileNode } from "@kotonoha/types";
  import { tick, untrack } from "svelte";
  import { moveDestination } from "@kotonoha/ui/tree-move";
  import { createFolder, createNewFile, deleteEntry, moveEntry } from "../stores/vault.svelte";

  interface Props {
    files: FileNode[];
    selectedPath: string | null;
    vaultPath: string;
    focused?: boolean;
    onSelect: (path: string) => void;
    onBlur: () => void;
    onCreateBase?: () => void;
  }

  let { files, selectedPath, vaultPath, focused = false, onSelect, onBlur, onCreateBase }: Props = $props();

  interface FlatItem {
    node: FileNode;
    depth: number;
    expanded: boolean;
  }

  // 入力行。作成・フォルダ作成・改名を1本で受ける
  type TreeInput =
    | { kind: "file"; dir: string }
    | { kind: "folder"; dir: string }
    | { kind: "rename"; target: FileNode };

  let expandedDirs = $state(new Set<string>());
  let cursorIndex = $state(0);
  let treeInput = $state<TreeInput | null>(null);
  let treeInputValue = $state("");
  let opError = $state<string | null>(null);
  let inputElement: HTMLInputElement;
  let sidebarElement: HTMLDivElement;
  let listElement: HTMLDivElement;

  // Drag & drop
  let dragSource = $state<string | null>(null);
  let dragTarget = $state<string | null>(null);

  // Context menu
  let contextMenu = $state<{ x: number; y: number; node: FileNode; confirming?: boolean } | null>(null);

  function closeContextMenu() {
    contextMenu = null;
  }

  async function handleDeleteEntry(path: string) {
    closeContextMenu();
    opError = null;
    try {
      await deleteEntry(path);
    } catch (err) {
      opError = String(err);
    }
  }

  /** ノードを起点にした作成先。フォルダならその中、ファイルならその隣 */
  function containingDir(node: FileNode): string {
    return node.is_dir ? node.path : node.path.split("/").slice(0, -1).join("/");
  }

  function countFiles(node: FileNode): number {
    if (!node.is_dir) return 1;
    return (node.children ?? []).reduce((sum, child) => sum + countFiles(child), 0);
  }

  function canDropInto(node: FileNode): boolean {
    return (
      node.is_dir && dragSource !== null && moveDestination(dragSource, node.path) !== null
    );
  }

  async function handleDrop(toDir: string) {
    const from = dragSource;
    dragSource = null;
    dragTarget = null;
    if (!from) return;
    const to = moveDestination(from, toDir);
    if (!to) return;

    opError = null;
    try {
      await moveEntry(from, to);
    } catch (err) {
      opError = String(err);
    }
  }

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
      const dirsToExpand: string[] = [];
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        dirsToExpand.push(current);
      }
      // Use untrack to avoid tracking expandedDirs reads (prevents infinite loop)
      untrack(() => {
        let changed = false;
        for (const dir of dirsToExpand) {
          if (!expandedDirs.has(dir)) {
            expandedDirs.add(dir);
            changed = true;
          }
        }
        if (changed) {
          expandedDirs = new Set(expandedDirs);
        }
      });
    }
  });

  // Focus management: when focused prop becomes true, focus the sidebar
  $effect(() => {
    if (focused && sidebarElement) {
      const path = selectedPath;
      tick().then(() => {
        sidebarElement.focus();
        if (path && flatItems.length > 0) {
          const idx = flatItems.findIndex((item) => item.node.path === path);
          if (idx >= 0) {
            cursorIndex = idx;
            tick().then(() => scrollIntoView());
          }
        }
      });
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
    return isDir ? name : name.replace(/\.(md|html)$/, "");
  }

  function scrollIntoView() {
    const el = listElement?.querySelector(`[data-index="${cursorIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }

  /** キー操作からの削除。確認メニューをカーソル行の位置に出す */
  function openConfirmAtCursor(node: FileNode) {
    const rect = listElement
      ?.querySelector(`[data-index="${cursorIndex}"]`)
      ?.getBoundingClientRect();
    contextMenu = {
      x: rect?.left ?? 0,
      y: rect?.bottom ?? 0,
      node,
      confirming: true,
    };
  }

  function withMdExtension(name: string): string {
    return /\.(md|base|html)$/.test(name) ? name : `${name}.md`;
  }

  async function handleTreeInputSubmit() {
    const input = treeInput;
    const name = treeInputValue.trim();
    if (!input || !name) {
      treeInput = null;
      return;
    }

    // .base は空ファイルではなくウィザードで組み立てる
    if (input.kind === "file" && (name.endsWith(".base") || name === "base")) {
      treeInput = null;
      treeInputValue = "";
      onCreateBase?.();
      return;
    }

    treeInput = null;
    treeInputValue = "";
    opError = null;
    try {
      if (input.kind === "folder") {
        await createFolder(input.dir ? `${input.dir}/${name}` : name);
      } else if (input.kind === "file") {
        await createNewFile(withMdExtension(input.dir ? `${input.dir}/${name}` : name));
      } else {
        const { target } = input;
        const newName = target.is_dir ? name : withMdExtension(name);
        const dir = target.path.split("/").slice(0, -1).join("/");
        const to = dir ? `${dir}/${newName}` : newName;
        if (to !== target.path) await moveEntry(target.path, to);
      }
    } catch (err) {
      opError = String(err);
    }
    tick().then(() => sidebarElement?.focus());
  }

  function handleTreeInputKeydown(e: KeyboardEvent) {
    // 入力行のキーをサイドバーへ流さない。
    // Escape が伝播すると入力を閉じたうえで onBlur まで走り、ツリーごと閉じてしまう
    e.stopPropagation();
    if (e.key === "Escape") {
      treeInput = null;
      tick().then(() => sidebarElement?.focus());
    } else if (e.key === "Enter") {
      handleTreeInputSubmit();
    }
  }

  function startTreeInput(input: TreeInput) {
    closeContextMenu();
    opError = null;
    treeInput = input;
    treeInputValue = input.kind === "rename" ? input.target.name : "";
    requestAnimationFrame(() => {
      inputElement?.focus();
      inputElement?.select();
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!focused || treeInput) return;

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
        startTreeInput({ kind: "file", dir: item ? containingDir(item.node) : "" });
        break;
      case "a":
        e.preventDefault();
        startTreeInput({ kind: "folder", dir: item ? containingDir(item.node) : "" });
        break;
      case "r":
        e.preventDefault();
        if (item) startTreeInput({ kind: "rename", target: item.node });
        break;
      case "x":
        e.preventDefault();
        if (item) openConfirmAtCursor(item.node);
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
    <button
      class="new-btn"
      onclick={() => startTreeInput({ kind: "folder", dir: "" })}
      title="新規フォルダ (a)"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
      </svg>
    </button>
    <button
      class="new-btn"
      onclick={() => startTreeInput({ kind: "file", dir: "" })}
      title="新規ファイル (o)"
    >
      +
    </button>
  </div>

  {#if treeInput}
    <div class="input-row">
      {#if treeInput.kind === "rename"}
        <span class="input-hint">名前を変更</span>
      {:else if treeInput.dir}
        <span class="input-hint">{treeInput.dir}/</span>
      {/if}
      <input
        bind:this={inputElement}
        bind:value={treeInputValue}
        placeholder={treeInput.kind === "folder" ? "フォルダ名" : "filename.md / reading.base"}
        class="create-input"
        onkeydown={handleTreeInputKeydown}
      />
    </div>
  {/if}

  {#if opError}
    <div class="op-error" role="alert">{opError}</div>
  {/if}

  <div
    class="file-list"
    bind:this={listElement}
    ondragover={(e) => { if (dragSource) e.preventDefault(); }}
    ondrop={(e) => {
      e.preventDefault();
      handleDrop("");
    }}
  >
    {#each flatItems as item, i}
      <button
        class="file-item"
        class:selected={focused && i === cursorIndex}
        class:is-current={item.node.path === selectedPath}
        class:drop-target={dragTarget === item.node.path}
        data-index={i}
        onclick={() => {
          closeContextMenu();
          if (item.node.is_dir) {
            toggleDir(item.node.path);
          } else {
            onSelect(item.node.path);
          }
        }}
        oncontextmenu={(e) => {
          e.preventDefault();
          contextMenu = { x: e.clientX, y: e.clientY, node: item.node };
        }}
        draggable="true"
        ondragstart={(e) => {
          e.dataTransfer?.setData("text/plain", item.node.path);
          dragSource = item.node.path;
        }}
        ondragend={() => { dragSource = null; dragTarget = null; }}
        ondragover={(e) => {
          if (!canDropInto(item.node)) return;
          e.preventDefault();
          dragTarget = item.node.path;
        }}
        ondragleave={() => { if (dragTarget === item.node.path) dragTarget = null; }}
        ondrop={(e) => {
          // 落とせない相手なら何もしない。
          // 止めないと .file-list の drop に流れてルートへ移動してしまう
          e.preventDefault();
          e.stopPropagation();
          if (canDropInto(item.node)) {
            handleDrop(item.node.path);
          } else {
            dragSource = null;
            dragTarget = null;
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
      <kbd>j/k</kbd> 移動 <kbd>h/l</kbd> 開閉 <kbd>Enter</kbd> 開く <kbd>o</kbd> 新規 <kbd>a</kbd> フォルダ <kbd>r</kbd> 改名 <kbd>x</kbd> 削除 <kbd>ドラッグ</kbd> 移動 <kbd>Esc</kbd> 戻る
    </div>
  {/if}
</div>

{#if contextMenu}
  {@const node = contextMenu.node}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="context-overlay" onclick={closeContextMenu} oncontextmenu={(e) => { e.preventDefault(); closeContextMenu(); }}>
    <div
      class="context-menu"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px"
      onclick={(e) => e.stopPropagation()}
    >
      {#if contextMenu.confirming}
        <div class="confirm-msg">
          {#if node.is_dir}
            「{node.name}」を中のファイル {countFiles(node)} 件ごと削除？
          {:else}
            「{node.name}」を削除？
          {/if}
        </div>
        <div class="confirm-actions">
          <button class="danger" onclick={() => handleDeleteEntry(node.path)}>削除</button>
          <button onclick={closeContextMenu}>キャンセル</button>
        </div>
      {:else}
        {#if node.is_dir}
          <button onclick={() => startTreeInput({ kind: "file", dir: node.path })}>
            ここに新規ファイル
          </button>
          <button onclick={() => startTreeInput({ kind: "folder", dir: node.path })}>
            ここに新規フォルダ
          </button>
        {/if}
        <button onclick={() => startTreeInput({ kind: "rename", target: node })}>
          名前を変更
        </button>
        <button
          class="danger"
          onclick={() => { contextMenu = { ...contextMenu!, confirming: true }; }}
        >削除</button>
      {/if}
    </div>
  </div>
{/if}

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
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .input-hint {
    flex-shrink: 0;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-size: 10px;
    font-family: var(--font-mono);
  }

  .op-error {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-tertiary);
    color: #f38ba8;
    font-size: 10px;
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

  /* Drop target highlight */
  .file-item.drop-target {
    background: rgba(137, 180, 250, 0.15);
    outline: 1px dashed var(--accent);
  }

  /* Context menu */
  .context-overlay {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .context-menu {
    position: fixed;
    z-index: 100;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .context-menu button {
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .context-menu button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .context-menu .danger:hover {
    background: rgba(243, 139, 168, 0.15);
    color: #f38ba8;
  }

  .confirm-msg {
    padding: 6px 12px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .confirm-actions {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
  }

  .confirm-actions button {
    flex: 1;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 11px;
    text-align: center;
  }
</style>
