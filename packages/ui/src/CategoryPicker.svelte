<script lang="ts">
  interface Props {
    categories: string[]
    onSelect?: (category: string) => void
    onClose?: () => void
  }

  let {
    categories = [],
    onSelect = () => {},
    onClose = () => {},
  }: Props = $props()

  let selectedIndex = $state(0)

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex = (selectedIndex + 1) % categories.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex = (selectedIndex - 1 + categories.length) % categories.length
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (categories[selectedIndex]) {
        onSelect(categories[selectedIndex])
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onClose}>
  <div class="picker" onclick={(e) => e.stopPropagation()}>
    <div class="picker-header">
      <span class="picker-title">カテゴリを選択</span>
      <button class="close-btn" onclick={onClose}>✕</button>
    </div>
    <div class="picker-list">
      {#each categories as category, i}
        <button
          class="picker-item"
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
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
  }

  .picker {
    width: 100%;
    max-width: 480px;
    max-height: 60vh;
    background: var(--koto-bg, #1e1e2e);
    border-radius: 12px 12px 0 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--koto-border, #333);
  }

  .picker-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--koto-text, #cdd6f4);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--koto-text-muted, #6c7086);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .picker-list {
    overflow-y: auto;
    padding: 8px;
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    background: none;
    border: none;
    border-radius: 8px;
    color: var(--koto-text, #cdd6f4);
    font-size: 15px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .picker-item:hover,
  .picker-item.selected {
    background: var(--koto-bg-hover, #313244);
  }

  .empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--koto-text-muted, #6c7086);
  }
</style>
