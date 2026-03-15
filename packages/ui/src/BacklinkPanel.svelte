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
    background: var(--koto-bg-base);
    color: var(--koto-text-secondary);
    font-size: var(--koto-font-size-sm);
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--koto-space-2);
    padding: var(--koto-space-2) var(--koto-space-3);
    border-bottom: 1px solid var(--koto-border);
    position: sticky;
    top: 0;
    background: var(--koto-bg-base);
  }

  .panel-title {
    font-weight: 600;
    font-size: var(--koto-font-size-xs);
    text-transform: uppercase;
    color: var(--koto-text-muted);
  }

  .panel-count {
    background: var(--koto-bg-hover);
    color: var(--koto-text-secondary);
    padding: 1px 6px;
    border-radius: var(--koto-radius-md);
    font-size: var(--koto-font-size-xs);
  }

  .backlink-item {
    min-height: var(--koto-touch-min);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--koto-space-3);
    cursor: pointer;
    border-bottom: 1px solid var(--koto-border-subtle);
    transition: background var(--koto-transition-fast);
  }

  .backlink-item:hover {
    background: var(--koto-bg-hover);
  }

  .backlink-source {
    color: var(--koto-accent);
    font-weight: 500;
    margin-bottom: 2px;
  }

  .backlink-snippet {
    color: var(--koto-text-muted);
    font-size: var(--koto-font-size-xs);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    padding: 1rem;
    text-align: center;
    color: var(--koto-text-muted);
  }
</style>
