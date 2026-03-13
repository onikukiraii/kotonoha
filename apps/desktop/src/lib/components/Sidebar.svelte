<script lang="ts">
  import type { FileNode } from "@kotonoha/types";
  import FileTreeNode from "./FileTreeNode.svelte";
  import { createNewFile } from "../stores/vault.svelte";

  interface Props {
    files: FileNode[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
    vaultPath: string;
  }

  let { files, selectedPath, onSelect, vaultPath }: Props = $props();

  let newFileName = $state("");
  let showNewFile = $state(false);

  async function handleCreateFile() {
    if (!newFileName.trim()) return;
    const path = newFileName.endsWith(".md") ? newFileName : `${newFileName}.md`;
    await createNewFile(path);
    newFileName = "";
    showNewFile = false;
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <span class="title">Files</span>
    <button
      class="icon-btn"
      onclick={() => (showNewFile = !showNewFile)}
      title="新規ファイル"
    >
      +
    </button>
  </div>

  {#if showNewFile}
    <div class="new-file">
      <input
        bind:value={newFileName}
        placeholder="filename.md"
        onkeydown={(e) => e.key === "Enter" && handleCreateFile()}
      />
    </div>
  {/if}

  <div class="file-list">
    {#each files as node}
      <FileTreeNode {node} {selectedPath} {onSelect} depth={0} />
    {/each}
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px;
    border-bottom: 1px solid var(--border);
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.5px;
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .icon-btn:hover {
    color: var(--text-primary);
  }

  .new-file {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }

  .new-file input {
    width: 100%;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--font-mono);
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
</style>
