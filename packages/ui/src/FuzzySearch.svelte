<script lang="ts">
  import type { SearchResult } from '@kotonoha/types'

  interface Props {
    results?: SearchResult[]
    modes?: ('filename' | 'fulltext')[]
    placeholder?: string
    fullscreen?: boolean
    onSearch?: (query: string, mode: 'filename' | 'fulltext') => void
    onSelect?: (result: SearchResult) => void
    onClose?: () => void
  }

  let {
    results = [],
    modes = ['filename'],
    placeholder = 'ファイルを検索...',
    fullscreen = true,
    onSearch = () => {},
    onSelect = () => {},
    onClose = () => {},
  }: Props = $props()

  let query = $state('')
  let selectedIndex = $state(0)
  let currentMode = $state<'filename' | 'fulltext'>(modes[0] ?? 'filename')
  let inputElement: HTMLInputElement | undefined = $state()
  let resultsElement: HTMLDivElement | undefined = $state()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    inputElement?.focus()
  })

  function handleInput() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (query.trim()) {
        onSearch(query.trim(), currentMode)
        selectedIndex = 0
      }
    }, 200)
  }

  function scrollToSelected() {
    const el = resultsElement?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1)
        scrollToSelected()
        break
      case 'j':
        if (fullscreen || !event.ctrlKey) break
        event.preventDefault()
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1)
        scrollToSelected()
        break
      case 'ArrowUp':
        event.preventDefault()
        selectedIndex = Math.max(selectedIndex - 1, 0)
        scrollToSelected()
        break
      case 'k':
        if (fullscreen || !event.ctrlKey) break
        event.preventDefault()
        selectedIndex = Math.max(selectedIndex - 1, 0)
        scrollToSelected()
        break
      case 'Enter':
        event.preventDefault()
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        onClose()
        break
      case 'Tab':
        if (modes.length > 1) {
          event.preventDefault()
          const idx = modes.indexOf(currentMode)
          currentMode = modes[(idx + 1) % modes.length]
          if (query.trim()) {
            onSearch(query.trim(), currentMode)
            selectedIndex = 0
          }
        }
        break
    }
  }

  function switchMode(mode: 'filename' | 'fulltext') {
    currentMode = mode
    if (query.trim()) {
      onSearch(query.trim(), currentMode)
      selectedIndex = 0
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fuzzy-overlay" class:fullscreen onkeydown={handleKeydown} onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="fuzzy-modal" onclick={(e) => e.stopPropagation()}>
    {#if fullscreen}
      <button class="close-btn" onclick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    {/if}

    {#if modes.length > 1}
      <div class="mode-tabs">
        {#each modes as mode}
          <button
            class="mode-tab"
            class:active={currentMode === mode}
            onclick={() => switchMode(mode)}
          >
            {mode === 'filename' ? 'ファイル名' : '全文検索'}
          </button>
        {/each}
      </div>
    {/if}

    <input
      bind:this={inputElement}
      bind:value={query}
      oninput={handleInput}
      {placeholder}
      class="search-input"
      type="text"
      spellcheck="false"
      autocomplete="off"
    />

    <div class="results" bind:this={resultsElement}>
      {#each results as result, i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="result-item"
          class:selected={i === selectedIndex}
          data-index={i}
          onclick={() => onSelect(result)}
        >
          <div class="result-filename">{result.filename}</div>
          <div class="result-path">{result.path}</div>
          {#if result.snippet}
            <div class="result-snippet">{@html result.snippet}</div>
          {/if}
        </div>
      {/each}

      {#if query && results.length === 0}
        <div class="no-results">結果なし</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .fuzzy-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 100;
  }

  .fuzzy-overlay.fullscreen {
    padding-top: 0;
    background: var(--koto-bg-base);
  }

  .fuzzy-modal {
    background: var(--koto-bg-surface);
    border: 1px solid var(--koto-border);
    border-radius: var(--koto-radius-md);
    width: min(600px, 90vw);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    align-self: flex-start;
    position: relative;
  }

  .fullscreen .fuzzy-modal {
    width: 100%;
    max-height: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
    padding-top: var(--koto-safe-top);
    padding-bottom: var(--koto-safe-bottom);
  }

  .close-btn {
    position: absolute;
    top: var(--koto-space-2);
    right: var(--koto-space-2);
    min-width: var(--koto-touch-min);
    min-height: var(--koto-touch-min);
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--koto-text-muted);
    cursor: pointer;
    border-radius: var(--koto-radius-sm);
    z-index: 1;
  }

  .close-btn:hover {
    background: var(--koto-bg-hover);
    color: var(--koto-text-primary);
  }

  .mode-tabs {
    display: flex;
    border-bottom: 1px solid var(--koto-border);
  }

  .mode-tab {
    flex: 1;
    min-height: var(--koto-touch-min);
    padding: var(--koto-space-2);
    background: none;
    border: none;
    color: var(--koto-text-muted);
    cursor: pointer;
    font-size: var(--koto-font-size-sm);
    transition: color var(--koto-transition-fast);
  }

  .mode-tab.active {
    color: var(--koto-text-primary);
    border-bottom: 2px solid var(--koto-accent);
  }

  .search-input {
    background: var(--koto-bg-input);
    border: none;
    border-bottom: 1px solid var(--koto-border);
    padding: var(--koto-space-3) var(--koto-space-4);
    min-height: var(--koto-touch-min);
    color: var(--koto-text-primary);
    font-size: var(--koto-font-size-lg);
    outline: none;
    font-family: inherit;
  }

  .results {
    overflow-y: auto;
    flex: 1;
  }

  .result-item {
    min-height: var(--koto-touch-min);
    padding: var(--koto-space-3) var(--koto-space-4);
    cursor: pointer;
    border-bottom: 1px solid var(--koto-border-subtle);
    display: flex;
    flex-direction: column;
    justify-content: center;
    transition: background var(--koto-transition-fast);
  }

  .result-item:hover,
  .result-item.selected {
    background: var(--koto-bg-selected);
  }

  .result-filename {
    color: var(--koto-text-primary);
    font-weight: 500;
    font-size: 14px;
  }

  .result-path {
    color: var(--koto-text-muted);
    font-size: var(--koto-font-size-xs);
    margin-top: 2px;
  }

  .result-snippet {
    color: var(--koto-text-secondary);
    font-size: var(--koto-font-size-xs);
    margin-top: var(--koto-space-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-results {
    padding: 2rem;
    text-align: center;
    color: var(--koto-text-muted);
  }
</style>
