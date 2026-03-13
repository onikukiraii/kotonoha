<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  interface BacklinkResult {
    source_path: string;
    snippet: string;
  }

  interface Props {
    filePath: string;
    onSelect: (path: string) => void;
  }

  let { filePath, onSelect }: Props = $props();
  let backlinks = $state<BacklinkResult[]>([]);

  $effect(() => {
    if (filePath) {
      loadBacklinks(filePath);
    }
  });

  async function loadBacklinks(path: string) {
    try {
      const target = path.replace(/\.md$/, "");
      backlinks = await invoke<BacklinkResult[]>("get_backlinks", { target });
    } catch {
      backlinks = [];
    }
  }

  function displayName(path: string): string {
    return path.replace(/\.md$/, "").split("/").pop() ?? path;
  }
</script>

<div class="backlink-panel">
  <div class="panel-header">
    <span>Backlinks ({backlinks.length})</span>
  </div>
  <div class="backlink-list">
    {#each backlinks as bl}
      <button class="backlink-item" onclick={() => onSelect(bl.source_path)}>
        <span class="bl-name">{displayName(bl.source_path)}</span>
        {#if bl.snippet}
          <span class="bl-snippet">{bl.snippet}</span>
        {/if}
      </button>
    {/each}
    {#if backlinks.length === 0}
      <div class="empty">バックリンクなし</div>
    {/if}
  </div>
</div>

<style>
  .backlink-panel {
    border-top: 1px solid var(--border);
    max-height: 200px;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    padding: 6px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
  }

  .backlink-list {
    overflow-y: auto;
    flex: 1;
  }

  .backlink-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 6px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 13px;
  }

  .backlink-item:hover {
    background: var(--bg-hover);
  }

  .bl-name {
    color: var(--accent);
    font-weight: 500;
  }

  .bl-snippet {
    color: var(--text-muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    padding: 12px 16px;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
