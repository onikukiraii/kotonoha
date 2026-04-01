<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    categories: string[];
    onSelect: (category: string) => void;
    onClose: () => void;
  }

  let props: Props = $props();
  let categories = $derived(props.categories);
  let onSelect = $derived(props.onSelect);
  let onClose = $derived(props.onClose);

  let selectedIndex = $state(0);
  let modalElement: HTMLDivElement;

  onMount(() => {
    modalElement?.focus();
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      if (categories.length > 0) {
        selectedIndex = (selectedIndex + 1) % categories.length;
      }
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      if (categories.length > 0) {
        selectedIndex = (selectedIndex - 1 + categories.length) % categories.length;
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (categories[selectedIndex]) {
        onSelect(categories[selectedIndex]);
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="overlay"
  bind:this={modalElement}
  tabindex="0"
  onkeydown={handleKeydown}
  onclick={onClose}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <span class="modal-title">学習カテゴリを選択</span>
      <span class="modal-hint">↑↓ 移動 / Enter 選択 / Esc 閉じる</span>
    </div>
    <div class="modal-list">
      {#each categories as category, i}
        <button
          class="modal-item"
          class:selected={i === selectedIndex}
          onclick={() => onSelect(category)}
          onmouseenter={() => (selectedIndex = i)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          {category}
        </button>
      {/each}
      {#if categories.length === 0}
        <div class="empty">カテゴリが見つかりません</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
    outline: none;
  }

  .modal {
    width: 400px;
    max-height: 50vh;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .modal-hint {
    font-size: 11px;
    color: var(--text-muted);
  }

  .modal-list {
    overflow-y: auto;
    padding: 4px;
  }

  .modal-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .modal-item:hover,
  .modal-item.selected {
    background: var(--bg-tertiary);
  }

  .empty {
    padding: 20px 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }
</style>
