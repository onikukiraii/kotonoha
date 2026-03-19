<script lang="ts">
  import type { Tab } from "../stores/tabs.svelte";

  interface Props {
    tabs: Tab[];
    activeTabId: string | null;
    onActivate: (tabId: string) => void;
    onClose: (tabId: string) => void;
  }

  let { tabs, activeTabId, onActivate, onClose }: Props = $props();

  function displayName(filePath: string): string {
    const parts = filePath.split("/");
    const name = parts[parts.length - 1];
    return name.replace(/\.md$/, "");
  }

  function handleMiddleClick(e: MouseEvent, tabId: string) {
    if (e.button === 1) {
      e.preventDefault();
      onClose(tabId);
    }
  }
</script>

<div class="tab-bar">
  {#each tabs as tab (tab.id)}
    <div
      class="tab"
      class:active={tab.id === activeTabId}
      role="tab"
      tabindex="0"
      onclick={() => onActivate(tab.id)}
      onauxclick={(e) => handleMiddleClick(e, tab.id)}
      onkeydown={(e) => { if (e.key === 'Enter') onActivate(tab.id); }}
      title={tab.filePath}
    >
      <span class="tab-name">
        {#if tab.isDirty}
          <span class="dirty-dot"></span>
        {/if}
        {displayName(tab.filePath)}
      </span>
      <button
        class="tab-close"
        onclick={(e) => { e.stopPropagation(); onClose(tab.id); }}
        title="閉じる"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 2l8 8M10 2l-8 8"/>
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: stretch;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    min-height: 30px;
    max-height: 30px;
  }

  .tab-bar::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 0.1s, background 0.1s;
    user-select: none;
  }

  .tab:hover {
    color: var(--text-secondary);
    background: var(--bg-tertiary);
  }

  .tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent);
    background: var(--bg-primary);
  }

  .tab-name {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dirty-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--peach, #fab387);
    flex-shrink: 0;
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 3px;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
  }

  .tab:hover .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
