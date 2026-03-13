<script lang="ts">
  import type { BacklinkResult } from '@kotonoha/types'

  interface Props {
    backlinks?: BacklinkResult[]
    onSelect?: (sourcePath: string) => void
  }

  let { backlinks = [], onSelect = () => {} }: Props = $props()
</script>

<div class="backlink-panel">
  <div class="panel-header">
    <span class="panel-title">バックリンク</span>
    <span class="panel-count">{backlinks.length}</span>
  </div>

  <div class="backlink-list">
    {#each backlinks as backlink}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="backlink-item" onclick={() => onSelect(backlink.source_path)}>
        <div class="backlink-source">
          {backlink.source_path.split('/').pop()}
        </div>
        <div class="backlink-snippet">{backlink.snippet}</div>
      </div>
    {/each}

    {#if backlinks.length === 0}
      <div class="empty">バックリンクなし</div>
    {/if}
  </div>
</div>

<style>
  .backlink-panel {
    height: 100%;
    overflow-y: auto;
    background: #1e1e1e;
    color: #cccccc;
    font-size: 13px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #3e4451;
    position: sticky;
    top: 0;
    background: #1e1e1e;
  }

  .panel-title {
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    color: #888;
  }

  .panel-count {
    background: #3e4451;
    color: #ccc;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
  }

  .backlink-item {
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid #2a2a2a;
  }

  .backlink-item:hover {
    background: #2a2d2e;
  }

  .backlink-source {
    color: #61afef;
    font-weight: 500;
    margin-bottom: 2px;
  }

  .backlink-snippet {
    color: #888;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    padding: 1rem;
    text-align: center;
    color: #666;
  }
</style>
