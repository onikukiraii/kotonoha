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
  import { searchFiles, searchFullText } from '$lib/api.js'

  type View = 'tree' | 'editor' | 'preview'
  let currentView = $state<View>('tree')
  let showSearch = $state(false)
  let searchResults = $state<SearchResult[]>([])
  let renderedHtml = $state('')
  let editorContent = $state('')
  let cursorLine = $state(0)
  let isMobile = $state(false)

  onMount(() => {
    loadFileTree()
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  })

  function checkMobile() {
    isMobile = window.innerWidth < 768
  }

  async function handleFileSelect(node: FileNode) {
    if (node.is_dir) return
    await openFile(node.path)
    editorContent = $currentFileContent
    renderedHtml = renderMarkdownClient(editorContent)
    if (isMobile) currentView = 'editor'
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
    if (isMobile) currentView = 'editor'
  }

  function handleWikilinkClick(target: string) {
    // Find file matching the wikilink target
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
    if (isMobile) currentView = 'editor'
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
    onSearch={handleSearch}
    onSelect={handleSearchSelect}
    onClose={() => (showSearch = false)}
  />
{/if}

<div class="main-layout" class:mobile={isMobile}>
  {#if !isMobile || currentView === 'tree'}
    <aside class="sidebar">
      <div class="sidebar-header">
        <button class="search-btn" onclick={() => (showSearch = true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          検索
        </button>
      </div>
      <FileTree
        nodes={$fileTree}
        selectedPath={$currentFilePath}
        onSelect={handleFileSelect}
      />
    </aside>
  {/if}

  {#if !isMobile || currentView === 'editor'}
    <section class="editor-section">
      {#if $currentFilePath}
        <div class="editor-header">
          <span class="file-name">{$currentFilePath.split('/').pop()}</span>
          {#if $isDirty}
            <span class="dirty-indicator">*</span>
          {/if}
        </div>
        {#await import('@kotonoha/ui').then(m => m.Editor) then Editor}
          <svelte:component
            this={Editor}
            content={editorContent}
            vimMode={false}
            onChange={handleEditorChange}
            onCursorLineChange={(line: number) => (cursorLine = line)}
            onWikilinkNavigate={handleWikilinkClick}
          />
        {/await}
      {:else}
        <div class="empty-state">
          <p>ファイルを選択してください</p>
          <p class="hint">Cmd+O で検索</p>
        </div>
      {/if}
    </section>
  {/if}

  {#if !isMobile || currentView === 'preview'}
    <section class="preview-section">
      {#if $currentFilePath}
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
      {:else}
        <div class="empty-state">
          <p>プレビュー</p>
        </div>
      {/if}
    </section>
  {/if}
</div>

{#if isMobile}
  <nav class="bottom-nav">
    <button class="nav-btn" class:active={currentView === 'tree'} onclick={() => (currentView = 'tree')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
      Tree
    </button>
    <button class="nav-btn" class:active={currentView === 'editor'} onclick={() => (currentView = 'editor')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Edit
    </button>
    <button class="nav-btn" class:active={currentView === 'preview'} onclick={() => (currentView = 'preview')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
      View
    </button>
  </nav>
{/if}

<style>
  .main-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .main-layout.mobile {
    flex-direction: column;
  }

  .sidebar {
    width: 250px;
    border-right: 1px solid #3e4451;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .mobile .sidebar {
    width: 100%;
    flex: 1;
    border-right: none;
  }

  .sidebar-header {
    padding: 8px;
    border-bottom: 1px solid #3e4451;
  }

  .search-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: #2a2a2a;
    border: 1px solid #3e4451;
    border-radius: 4px;
    color: #888;
    font-size: 13px;
    cursor: pointer;
  }

  .search-btn:hover {
    background: #333;
    color: #ccc;
  }

  .editor-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-right: 1px solid #3e4451;
  }

  .mobile .editor-section {
    border-right: none;
  }

  .editor-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: #252526;
    border-bottom: 1px solid #3e4451;
    font-size: 13px;
  }

  .file-name {
    color: #ccc;
  }

  .dirty-indicator {
    color: #e5c07b;
  }

  .preview-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .backlinks-section {
    border-top: 1px solid #3e4451;
    max-height: 200px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #666;
  }

  .empty-state .hint {
    font-size: 12px;
    color: #555;
  }

  .bottom-nav {
    display: flex;
    border-top: 1px solid #3e4451;
    background: #252526;
    flex-shrink: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .nav-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 0;
    background: none;
    border: none;
    color: #666;
    font-size: 10px;
    cursor: pointer;
  }

  .nav-btn.active {
    color: #61afef;
  }
</style>
