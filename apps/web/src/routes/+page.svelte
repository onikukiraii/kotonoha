<script lang="ts">
  import { onMount } from 'svelte'
  import { FileTree, FuzzySearch, BacklinkPanel } from '@kotonoha/ui'
  import type { FileNode, SearchResult } from '@kotonoha/types'
  import {
    fileTree,
    currentFilePath,
    currentFileContent,
    currentBacklinks,
    loadFileTree,
    openFile,
  } from '$lib/stores/vault.js'
  import { isDirty, scheduleSave } from '$lib/stores/editor.js'
  import { searchFiles, searchFullText, openDailyNote } from '$lib/api.js'

  // Mobile: 2 tabs (files / note), note has editor/preview toggle
  type MobileTab = 'files' | 'note'
  type NoteMode = 'editor' | 'preview'

  let mobileTab = $state<MobileTab>('files')
  let noteMode = $state<NoteMode>('editor')
  let showSearch = $state(false)
  let searchResults = $state<SearchResult[]>([])
  let renderedHtml = $state('')
  let editorContent = $state('')
  let cursorLine = $state(0)

  // Swipe gesture state (files <-> note)
  let touchStartX = $state(0)
  let touchStartY = $state(0)
  let touchDeltaX = $state(0)
  let isSwiping = $state(false)
  let swipeTransitioning = $state(false)

  onMount(() => {
    loadFileTree()
  })

  // Swipe between 2 tabs: files (0) and note (1)
  function getTabIndex(tab: MobileTab): number {
    return tab === 'files' ? 0 : 1
  }

  function handleTouchStart(e: TouchEvent) {
    const touch = e.touches[0]
    // In note tab with editor mode: only allow edge swipe
    const isEdgeSwipe = touch.clientX < 30 || touch.clientX > window.innerWidth - 30
    if (mobileTab === 'note' && noteMode === 'editor' && !isEdgeSwipe) return

    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchDeltaX = 0
    isSwiping = false
  }

  function handleTouchMove(e: TouchEvent) {
    if (touchStartX === 0) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartX
    const dy = touch.clientY - touchStartY

    if (!isSwiping) {
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      if (absDx < 10) return
      const angle = Math.atan2(absDy, absDx) * (180 / Math.PI)
      if (angle > 30) {
        touchStartX = 0
        return
      }
      isSwiping = true
    }

    const currentIdx = getTabIndex(mobileTab)
    const maxLeft = currentIdx * window.innerWidth
    const maxRight = (1 - currentIdx) * window.innerWidth
    touchDeltaX = Math.max(-maxRight, Math.min(maxLeft, dx))

    e.preventDefault()
  }

  function handleTouchEnd() {
    if (!isSwiping) {
      touchStartX = 0
      isSwiping = false
      touchDeltaX = 0
      return
    }

    const threshold = window.innerWidth * 0.25
    const currentIdx = getTabIndex(mobileTab)

    swipeTransitioning = true
    if (touchDeltaX > threshold && currentIdx > 0) {
      mobileTab = 'files'
    } else if (touchDeltaX < -threshold && currentIdx < 1) {
      mobileTab = 'note'
    }

    touchDeltaX = 0
    isSwiping = false
    touchStartX = 0

    setTimeout(() => {
      swipeTransitioning = false
    }, 400)
  }

  let mobileTransform = $derived.by(() => {
    const baseOffset = -getTabIndex(mobileTab) * 100
    const swipePx = isSwiping ? touchDeltaX : 0
    return `translateX(calc(${baseOffset}vw + ${swipePx}px))`
  })

  function toggleNoteMode() {
    noteMode = noteMode === 'editor' ? 'preview' : 'editor'
  }

  async function handleFileSelect(node: FileNode) {
    if (node.is_dir) return
    await openFile(node.path)
    editorContent = $currentFileContent
    renderedHtml = renderMarkdownClient(editorContent)
    mobileTab = 'note'
    noteMode = 'editor'
  }

  function handleEditorChange(content: string) {
    editorContent = content
    renderedHtml = renderMarkdownClient(content)
    scheduleSave(content)
  }

  function renderMarkdownClient(content: string): string {
    return content.split('\n').map((line, i) => {
      let escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      escaped = escaped.replace(
        /\[\[([^\]]+)\]\]/g,
        '<a class="wikilink" data-target="$1">$1</a>',
      )

      const attr = `data-source-line="${i + 1}"`
      const headingMatch = escaped.match(/^(#{1,6}) (.*)/)
      if (headingMatch) {
        const level = headingMatch[1].length
        return `<h${level} ${attr}>${headingMatch[2]}</h${level}>`
      }
      if (escaped.trim() === '') {
        return '<br>'
      }
      return `<span ${attr}>${escaped}</span><br>`
    }).join('\n')
  }

  async function handleSearch(query: string, mode: 'filename' | 'fulltext') {
    if (mode === 'filename') {
      searchResults = await searchFiles(query)
    } else {
      searchResults = await searchFullText(query)
    }
  }

  function handleSearchSelect(result: SearchResult) {
    showSearch = false
    openFile(result.path)
    editorContent = $currentFileContent
    renderedHtml = renderMarkdownClient(editorContent)
    mobileTab = 'note'
    noteMode = 'editor'
  }

  function handleWikilinkClick(target: string) {
    function findFile(nodes: FileNode[], name: string): FileNode | null {
      for (const node of nodes) {
        if (!node.is_dir && (node.name === name || node.name === `${name}.md`)) {
          return node
        }
        if (node.is_dir && node.children) {
          const found = findFile(node.children, name)
          if (found) return found
        }
      }
      return null
    }

    const file = findFile($fileTree, target)
    if (file) {
      openFile(file.path)
    }
  }

  function handleBacklinkSelect(sourcePath: string) {
    openFile(sourcePath)
    mobileTab = 'note'
    noteMode = 'editor'
  }

  async function handleOpenDaily() {
    const { path, created } = await openDailyNote()
    if (created) await loadFileTree()
    await openFile(path)
    editorContent = $currentFileContent
    renderedHtml = renderMarkdownClient(editorContent)
    mobileTab = 'note'
    noteMode = 'editor'
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault()
      showSearch = !showSearch
    }
  }}
/>

{#if showSearch}
  <FuzzySearch
    results={searchResults}
    modes={['filename', 'fulltext']}
    fullscreen={true}
    onSearch={handleSearch}
    onSelect={handleSearchSelect}
    onClose={() => (showSearch = false)}
  />
{/if}

<!-- Mobile: 2-pane (files / note) with swipe -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="mobile-panes-wrapper"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <div
    class="mobile-panes"
    class:transitioning={!isSwiping || swipeTransitioning}
    style="transform: {mobileTransform}"
  >
    <!-- Files pane -->
    <div class="mobile-pane">
      <aside class="sidebar">
        <div class="sidebar-header">
          <button class="search-btn" onclick={() => (showSearch = true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            検索
          </button>
          <button class="daily-btn" onclick={handleOpenDaily}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Today
          </button>
        </div>
        <FileTree
          nodes={$fileTree}
          selectedPath={$currentFilePath}
          disableVimKeys={true}
          onSelect={handleFileSelect}
        />
      </aside>
    </div>

    <!-- Note pane (editor or preview, toggled) -->
    <div class="mobile-pane">
      {#if $currentFilePath}
        <div class="note-header">
          <span class="file-name">{$currentFilePath.split('/').pop()}</span>
          {#if noteMode === 'editor' && $isDirty}
            <span class="dirty-indicator">*</span>
          {/if}
          <button class="mode-toggle" onclick={toggleNoteMode} title={noteMode === 'editor' ? 'プレビュー' : '編集'}>
            {#if noteMode === 'editor'}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            {/if}
          </button>
        </div>

        {#if noteMode === 'editor'}
          <section class="editor-section">
            {#await import('@kotonoha/ui').then(m => m.Editor) then Editor}
              <svelte:component
                this={Editor}
                content={editorContent}
                vimMode={false}
                livePreviewMode={true}
                onChange={handleEditorChange}
                onCursorLineChange={(line: number) => (cursorLine = line)}
                onWikilinkNavigate={handleWikilinkClick}
              />
            {/await}
          </section>
        {:else}
          <section class="preview-section">
            {#await import('@kotonoha/ui').then(m => m.Preview) then Preview}
              <svelte:component
                this={Preview}
                html={renderedHtml}
                cursorLine={cursorLine}
                onWikilinkClick={handleWikilinkClick}
              />
            {/await}

            {#if $currentBacklinks.length > 0}
              <div class="backlinks-section">
                <BacklinkPanel
                  backlinks={$currentBacklinks}
                  onSelect={handleBacklinkSelect}
                />
              </div>
            {/if}
          </section>
        {/if}
      {:else}
        <div class="empty-state">
          <p>ファイルを選択してください</p>
          <p class="hint">ファイルタブから選択</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<nav class="bottom-nav">
  <button class="nav-btn" class:active={mobileTab === 'files'} onclick={() => (mobileTab = 'files')}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
    <span class="nav-label">ファイル</span>
    {#if mobileTab === 'files'}
      <span class="nav-dot"></span>
    {/if}
  </button>
  <button class="nav-btn" class:active={mobileTab === 'note'} onclick={() => (mobileTab = 'note')}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
    <span class="nav-label">ノート</span>
    {#if mobileTab === 'note'}
      <span class="nav-dot"></span>
    {/if}
  </button>
</nav>

<style>
  .sidebar {
    width: 100%;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    height: 100%;
  }

  .sidebar-header {
    display: flex;
    gap: var(--koto-space-2);
    padding: var(--koto-space-2);
    border-bottom: 1px solid var(--koto-border);
  }

  .search-btn,
  .daily-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--koto-touch-min);
    padding: var(--koto-space-2) var(--koto-space-3);
    background: var(--koto-bg-elevated);
    border: 1px solid var(--koto-border);
    border-radius: var(--koto-radius-sm);
    color: var(--koto-text-muted);
    font-size: var(--koto-font-size-sm);
    cursor: pointer;
    transition: background var(--koto-transition-fast), color var(--koto-transition-fast);
  }

  .search-btn {
    flex: 1;
  }

  .search-btn:hover,
  .daily-btn:hover {
    background: var(--koto-bg-hover);
    color: var(--koto-text-secondary);
  }

  .editor-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .file-name {
    color: var(--koto-text-secondary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dirty-indicator {
    color: var(--koto-dirty);
  }

  .preview-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .backlinks-section {
    border-top: 1px solid var(--koto-border);
    max-height: 200px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--koto-text-muted);
  }

  .empty-state .hint {
    font-size: var(--koto-font-size-xs);
    color: var(--koto-text-muted);
    opacity: 0.7;
  }

  /* Mobile layout */
  .mobile-panes-wrapper {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .mobile-panes {
    display: flex;
    width: 200%;
    height: 100%;
    will-change: transform;
  }

  .mobile-panes.transitioning {
    transition: transform var(--koto-transition-slow);
  }

  .mobile-pane {
    width: 50%;
    height: 100%;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  /* Note header */
  .note-header {
    display: flex;
    align-items: center;
    gap: var(--koto-space-1);
    padding: var(--koto-space-2) var(--koto-space-3);
    background: var(--koto-bg-surface);
    border-bottom: 1px solid var(--koto-border);
    font-size: var(--koto-font-size-sm);
    flex-shrink: 0;
  }

  .mode-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--koto-touch-min);
    min-height: var(--koto-touch-min);
    margin: calc(-1 * var(--koto-space-2)) calc(-1 * var(--koto-space-3));
    margin-left: auto;
    background: none;
    border: none;
    color: var(--koto-accent-dim);
    cursor: pointer;
    border-radius: var(--koto-radius-sm);
    transition: color var(--koto-transition-fast), background var(--koto-transition-fast);
  }

  .mode-toggle:active {
    color: var(--koto-accent);
    background: var(--koto-accent-subtle);
  }

  /* Bottom nav */
  .bottom-nav {
    display: flex;
    border-top: 1px solid var(--koto-border);
    background: var(--koto-bg-surface);
    flex-shrink: 0;
    padding-bottom: var(--koto-safe-bottom);
    height: calc(48px + var(--koto-safe-bottom));
  }

  .nav-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 48px;
    padding: var(--koto-space-1) 0;
    background: none;
    border: none;
    color: var(--koto-text-muted);
    font-size: var(--koto-font-size-xs);
    cursor: pointer;
    position: relative;
    transition: color var(--koto-transition-fast);
  }

  .nav-btn.active {
    color: var(--koto-accent);
  }

  .nav-label {
    font-size: 10px;
    letter-spacing: 0.3px;
  }

  .nav-dot {
    position: absolute;
    bottom: 4px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--koto-accent);
  }
</style>
