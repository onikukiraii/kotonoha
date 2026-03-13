<script lang="ts">
  import type { SearchResult } from '@kotonoha/types'

  interface Props {
    results?: SearchResult[]
    modes?: ('filename' | 'fulltext')[]
    placeholder?: string
    onSearch?: (query: string, mode: 'filename' | 'fulltext') => void
    onSelect?: (result: SearchResult) => void
    onClose?: () => void
  }

  let {
    results = [],
    modes = ['filename'],
    placeholder = 'ファイルを検索...',
    onSearch = () => {},
    onSelect = () => {},
    onClose = () => {},
  }: Props = $props()

  let query = $state('')
  let selectedIndex = $state(0)
  let currentMode = $state<'filename' | 'fulltext'>(modes[0] ?? 'filename')
  let inputElement: HTMLInputElement | undefined = $state()
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

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        if (event.key === 'j' && !event.ctrlKey) break
        event.preventDefault()
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1)
        break
      case 'ArrowUp':
      case 'k':
        if (event.key === 'k' && !event.ctrlKey) break
        event.preventDefault()
        selectedIndex = Math.max(selectedIndex - 1, 0)
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
<div class="fuzzy-overlay" onkeydown={handleKeydown} onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="fuzzy-modal" onclick={(e) => e.stopPropagation()}>
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

    <div class="results">
      {#each results as result, i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="result-item"
          class:selected={i === selectedIndex}
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

  .fuzzy-modal {
    background: #252526;
    border: 1px solid #3e4451;
    border-radius: 8px;
    width: min(600px, 90vw);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    align-self: flex-start;
  }

  .mode-tabs {
    display: flex;
    border-bottom: 1px solid #3e4451;
  }

  .mode-tab {
    flex: 1;
    padding: 8px;
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 12px;
  }

  .mode-tab.active {
    color: #e0e0e0;
    border-bottom: 2px solid #61afef;
  }

  .search-input {
    background: #1a1a1a;
    border: none;
    border-bottom: 1px solid #3e4451;
    padding: 12px 16px;
    color: #e0e0e0;
    font-size: 16px;
    outline: none;
    font-family: inherit;
  }

  .results {
    overflow-y: auto;
    flex: 1;
  }

  .result-item {
    padding: 8px 16px;
    cursor: pointer;
    border-bottom: 1px solid #2a2a2a;
  }

  .result-item:hover,
  .result-item.selected {
    background: #094771;
  }

  .result-filename {
    color: #e0e0e0;
    font-weight: 500;
    font-size: 14px;
  }

  .result-path {
    color: #666;
    font-size: 12px;
    margin-top: 2px;
  }

  .result-snippet {
    color: #999;
    font-size: 12px;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-results {
    padding: 2rem;
    text-align: center;
    color: #666;
  }
</style>
