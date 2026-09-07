<script lang="ts">
  import { onMount } from 'svelte'
  import { FileTree, FuzzySearch, BacklinkPanel, CategoryPicker, BaseView, CreateBaseWizard } from '@kotonoha/ui'
  import type { FileNode, SearchResult } from '@kotonoha/types'
  import type { BaseFile, PropertySchema, QueryResult } from '@kotonoha/base'
  import { parseBase, serializeBase } from '@kotonoha/base'
  import {
    fileTree,
    currentFilePath,
    currentFileContent,
    currentBacklinks,
    loadFileTree,
    openFile,
  } from '$lib/stores/vault.js'
  import { isDirty, scheduleSave } from '$lib/stores/editor.js'
  import { searchFiles, searchFullText, openDailyNote, getSubdirs, createLearningLog, createNewFile, createNewFolder, deleteEntryApi, renameFileApi, runBaseApi, updateBasePropertyApi, getBaseContentApi, saveBaseContentApi, getBaseSchemaApi } from '$lib/api.js'
  import { renderMarkdownClient } from '$lib/markdown.js'
  import { LEARNING_LOGS_DIR } from '@kotonoha/ui/learning-log'
  import { isUnder, moveDestination, remapOpenPath } from '@kotonoha/ui/tree-move'

  // Mobile: 2 tabs (files / note), note has editor/preview toggle
  type MobileTab = 'files' | 'note'
  type NoteMode = 'editor' | 'preview'

  let mobileTab = $state<MobileTab>('files')
  let noteMode = $state<NoteMode>('editor')
  let showSearch = $state(false)
  let showCategoryPicker = $state(false)
  let learningCategories = $state<string[]>([])
  let searchResults = $state<SearchResult[]>([])
  let renderedHtml = $state('')
  let editorContent = $state('')
  let cursorLine = $state(0)

  let baseResult = $state<QueryResult | null>(null)
  let baseRawYaml = $state<string | null>(null)
  let baseError = $state<string | null>(null)
  let baseAst = $state<BaseFile | null>(null)
  let baseSchema = $state<PropertySchema | null>(null)
  let showCreateWizard = $state(false)
  let baseWizardDir = $state('')
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const isBaseFile = $derived($currentFilePath?.endsWith('.base') ?? false)
  const isHtmlFile = $derived($currentFilePath?.endsWith('.html') ?? false)
  const basePropertyDisplayNames = $derived(buildDisplayNameMap(baseResult))

  function buildDisplayNameMap(_r: QueryResult | null): Record<string, string> {
    return {}
  }

  function collectFolders(nodes: FileNode[], acc: string[] = []): string[] {
    for (const n of nodes) {
      if (n.is_dir) {
        acc.push(n.path)
        if (n.children) collectFolders(n.children, acc)
      }
    }
    return acc
  }

  function findNode(nodes: FileNode[], path: string): FileNode | null {
    for (const n of nodes) {
      if (n.path === path) return n
      if (n.children) {
        const found = findNode(n.children, path)
        if (found) return found
      }
    }
    return null
  }

  function countFiles(node: FileNode): number {
    if (!node.is_dir) return 1
    return (node.children ?? []).reduce((sum, child) => sum + countFiles(child), 0)
  }

  function parentDir(path: string): string {
    return path.split('/').slice(0, -1).join('/')
  }

  /** ノードを起点にした作成先。フォルダならその中、ファイルならその隣 */
  function containingDir(node: FileNode): string {
    return node.is_dir ? node.path : parentDir(node.path)
  }

  async function handleBaseAstChange(next: BaseFile) {
    baseAst = next
    const yaml = serializeBase(next)
    baseRawYaml = yaml
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      if (!$currentFilePath) return
      try {
        await saveBaseContentApi($currentFilePath, yaml)
        baseResult = await runBaseApi($currentFilePath)
      } catch (err) {
        baseError = (err as Error).message
      }
    }, 400)
  }

  async function handleCreateBase(filePath: string, yaml: string) {
    const path = baseWizardDir && !filePath.startsWith(`${baseWizardDir}/`)
      ? `${baseWizardDir}/${filePath}`
      : filePath
    await createNewFile(path, yaml)
    await loadFileTree()
    showCreateWizard = false
    await handleFileSelect({
      name: path.split('/').pop() ?? path,
      path,
      is_dir: false,
    })
  }

  // ツリー上の入力行。作成もフォルダ作成も改名もここで受ける
  type TreeInput =
    | { kind: 'file'; dir: string }
    | { kind: 'folder'; dir: string }
    | { kind: 'rename'; target: FileNode }
  let treeInput = $state<TreeInput | null>(null)
  let treeInputValue = $state('')
  let treeInputEl: HTMLInputElement | undefined = $state()

  // ノード単位のアクションシート・移動先選択・削除確認
  let actionTarget = $state<FileNode | null>(null)
  let moveTarget = $state<FileNode | null>(null)
  let deleteTarget = $state<FileNode | null>(null)
  let opError = $state<string | null>(null)

  const moveCandidates = $derived.by(() => {
    const node = moveTarget
    if (!node) return []
    return ['', ...collectFolders($fileTree)].filter(
      (dir) => moveDestination(node.path, dir) !== null,
    )
  })

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
    if (node.path.endsWith('.base')) {
      currentFilePath.set(node.path)
      baseError = null
      try {
        const [result, yaml, schema] = await Promise.all([
          runBaseApi(node.path),
          getBaseContentApi(node.path),
          getBaseSchemaApi(null),
        ])
        baseResult = result
        baseRawYaml = yaml
        baseAst = parseBase(yaml)
        baseSchema = schema
      } catch (err) {
        baseError = (err as Error).message
        baseResult = null
        baseRawYaml = null
        baseAst = null
        baseSchema = null
      }
      mobileTab = 'note'
      return
    }
    if (node.path.endsWith('.html')) {
      await openFile(node.path)
      mobileTab = 'note'
      noteMode = 'preview'
      return
    }
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

  async function handleSearch(query: string, mode: 'filename' | 'fulltext') {
    if (mode === 'filename') {
      searchResults = await searchFiles(query)
    } else {
      searchResults = await searchFullText(query)
    }
  }

  async function handleSearchSelect(result: SearchResult) {
    showSearch = false
    await openFile(result.path)
    editorContent = $currentFileContent
    renderedHtml = renderMarkdownClient(editorContent)
    mobileTab = 'note'
    noteMode = 'editor'
  }

  async function handleWikilinkClick(target: string) {
    function findFile(nodes: FileNode[], name: string): FileNode | null {
      for (const node of nodes) {
        if (!node.is_dir && (node.name === name || node.name === `${name}.md` || node.name === `${name}.html`)) {
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
      await handleFileSelect(file)
    }
  }

  async function handleBacklinkSelect(sourcePath: string) {
    await openFile(sourcePath)
    editorContent = $currentFileContent
    renderedHtml = renderMarkdownClient(editorContent)
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

  async function handleOpenLearningLog() {
    learningCategories = await getSubdirs(LEARNING_LOGS_DIR)
    showCategoryPicker = true
  }

  // --- ツリー上の入力行 ---
  function startTreeInput(input: TreeInput) {
    actionTarget = null
    opError = null
    treeInput = input
    treeInputValue = input.kind === 'rename' ? input.target.name : ''
    requestAnimationFrame(() => {
      treeInputEl?.focus()
      treeInputEl?.select()
    })
  }

  async function openMarkdown(path: string) {
    await openFile(path)
    editorContent = $currentFileContent
    renderedHtml = renderMarkdownClient(editorContent)
    mobileTab = 'note'
    noteMode = 'editor'
  }

  function withMdExtension(name: string): string {
    return /\.(md|base|html)$/.test(name) ? name : `${name}.md`
  }

  async function handleTreeInputSubmit() {
    const input = treeInput
    const name = treeInputValue.trim()
    if (!input || !name) {
      treeInput = null
      return
    }

    // .base は空ファイルではなくウィザードで組み立てる
    if (input.kind === 'file' && (name.endsWith('.base') || name === 'base')) {
      baseWizardDir = input.dir
      showCreateWizard = true
      treeInput = null
      return
    }

    treeInput = null
    opError = null
    try {
      if (input.kind === 'folder') {
        await createNewFolder(input.dir ? `${input.dir}/${name}` : name)
        await loadFileTree()
        return
      }
      if (input.kind === 'file') {
        const path = withMdExtension(input.dir ? `${input.dir}/${name}` : name)
        await createNewFile(path, '')
        await loadFileTree()
        await openMarkdown(path)
        return
      }
      const { target } = input
      const newName = target.is_dir ? name : withMdExtension(name)
      const dir = parentDir(target.path)
      await applyMove(target.path, dir ? `${dir}/${newName}` : newName)
    } catch (err) {
      opError = (err as Error).message
    }
  }

  function handleTreeInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      treeInput = null
    } else if (e.key === 'Enter') {
      handleTreeInputSubmit()
    }
  }

  // --- 移動と改名（どちらも rename API） ---
  async function applyMove(from: string, to: string) {
    if (from === to) return
    await renameFileApi(from, to)
    await loadFileTree()
    // 中身は変わらないのでパスだけ差し替える。開き直すと .base や .html の
    // 表示が崩れ、ドラッグしただけでノートのペインへ飛ばされる。
    // 自動保存は保存時に currentFilePath を読むので、ここを更新しないと旧パスへ書き戻す
    currentFilePath.set(remapOpenPath($currentFilePath, from, to))
  }

  async function handleMove(fromPath: string, toDir: string) {
    const to = moveDestination(fromPath, toDir)
    if (!to) return
    opError = null
    try {
      await applyMove(fromPath, to)
    } catch (err) {
      opError = (err as Error).message
    }
  }

  async function handleMoveSelect(toDir: string) {
    const node = moveTarget
    moveTarget = null
    if (node) await handleMove(node.path, toDir)
  }

  // --- 削除 ---
  async function handleDeleteConfirm() {
    const node = deleteTarget
    deleteTarget = null
    if (!node) return

    opError = null
    try {
      await deleteEntryApi(node.path)
      if ($currentFilePath !== null && isUnder($currentFilePath, node.path)) {
        currentFilePath.set(null)
        currentFileContent.set('')
        editorContent = ''
        renderedHtml = ''
        mobileTab = 'files'
      }
      await loadFileTree()
    } catch (err) {
      opError = (err as Error).message
    }
  }

  async function handleCategorySelect(category: string) {
    showCategoryPicker = false
    const { path } = await createLearningLog(category)
    await loadFileTree()
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

{#if showCategoryPicker}
  <CategoryPicker
    categories={learningCategories}
    onSelect={handleCategorySelect}
    onClose={() => (showCategoryPicker = false)}
  />
{/if}

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

{#if showCreateWizard}
  <CreateBaseWizard
    folders={collectFolders($fileTree)}
    loadSchema={(folder) => getBaseSchemaApi(folder)}
    onCreate={handleCreateBase}
    onCancel={() => { showCreateWizard = false; baseWizardDir = '' }}
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
          <button
            class="create-btn"
            onclick={() => startTreeInput({ kind: 'folder', dir: '' })}
            title="新規フォルダ"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
          <button
            class="create-btn"
            onclick={() => startTreeInput({ kind: 'file', dir: '' })}
            title="新規ファイル"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        {#if treeInput}
          <div class="create-input-row">
            {#if treeInput.kind === 'rename'}
              <span class="input-hint">名前を変更</span>
            {:else if treeInput.dir}
              <span class="input-hint">{treeInput.dir}/</span>
            {/if}
            <input
              bind:this={treeInputEl}
              bind:value={treeInputValue}
              placeholder={treeInput.kind === 'folder' ? 'フォルダ名' : 'filename.md / reading.base'}
              class="create-input"
              onkeydown={handleTreeInputKeydown}
              onblur={() => { if (!treeInputValue.trim()) treeInput = null }}
            />
          </div>
        {/if}
        {#if opError}
          <div class="op-error" role="alert">{opError}</div>
        {/if}
        <FileTree
          nodes={$fileTree}
          selectedPath={$currentFilePath}
          disableVimKeys={true}
          onSelect={handleFileSelect}
          onMove={handleMove}
          onNodeMenu={(node) => { opError = null; actionTarget = node }}
        />
      </aside>
    </div>

    <!-- Note pane (editor or preview, toggled) -->
    <div class="mobile-pane">
      {#if $currentFilePath}
        <div class="note-header">
          <span class="file-name">{$currentFilePath.split('/').pop()}</span>
          {#if !isBaseFile && !isHtmlFile && noteMode === 'editor' && $isDirty}
            <span class="dirty-indicator">*</span>
          {/if}
          <button
            class="action-menu-btn"
            onclick={() => {
              const path = $currentFilePath
              if (path) actionTarget = findNode($fileTree, path)
            }}
            title="ファイル操作"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
            </svg>
          </button>
          {#if !isBaseFile && !isHtmlFile}
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
          {/if}
        </div>

        {#if isBaseFile}
          <section class="base-section">
            {#if baseError}
              <div class="base-error">.base 実行失敗: {baseError}</div>
            {:else if baseResult}
              <BaseView
                result={baseResult}
                displayNames={basePropertyDisplayNames}
                rawYaml={baseRawYaml ?? ''}
                base={baseAst ?? undefined}
                schema={baseSchema ?? undefined}
                onBaseChange={handleBaseAstChange}
                onRowClick={(row) => handleFileSelect({ name: row.path.split('/').pop() ?? '', path: row.path, is_dir: false })}
                onCellEdit={async (row, key, value) => {
                  try {
                    await updateBasePropertyApi(row.path, key, value)
                    if ($currentFilePath) baseResult = await runBaseApi($currentFilePath)
                  } catch (err) {
                    baseError = (err as Error).message
                  }
                }}
                onSaveYaml={async (yaml) => {
                  if (!$currentFilePath) return
                  await saveBaseContentApi($currentFilePath, yaml)
                  baseRawYaml = yaml
                  baseAst = parseBase(yaml)
                  baseResult = await runBaseApi($currentFilePath)
                }}
              />
            {:else}
              <div class="base-loading">読み込み中...</div>
            {/if}
          </section>
        {:else if isHtmlFile}
          <section class="preview-section">
            {#await import('@kotonoha/ui').then(m => m.HtmlViewer) then HtmlViewer}
              <svelte:component this={HtmlViewer} html={$currentFileContent} />
            {/await}
          </section>
        {:else if noteMode === 'editor'}
          <section class="editor-section">
            {#key $currentFilePath}
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
            {/key}
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
  <button class="nav-btn" onclick={handleOpenDaily}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <span class="nav-label">Today</span>
  </button>
  <button class="nav-btn" onclick={handleOpenLearningLog}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
    </svg>
    <span class="nav-label">学習</span>
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

{#if actionTarget}
  {@const node = actionTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => (actionTarget = null)}>
    <div class="action-sheet" onclick={(e) => e.stopPropagation()}>
      <div class="action-sheet-header">
        <span class="action-sheet-title">{node.name}</span>
      </div>
      {#if node.is_dir}
        <button
          class="action-sheet-item"
          onclick={() => startTreeInput({ kind: 'file', dir: containingDir(node) })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          ここに新規ファイル
        </button>
        <button
          class="action-sheet-item"
          onclick={() => startTreeInput({ kind: 'folder', dir: containingDir(node) })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
          ここに新規フォルダ
        </button>
      {/if}
      <button
        class="action-sheet-item"
        onclick={() => startTreeInput({ kind: 'rename', target: node })}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        名前を変更
      </button>
      <button
        class="action-sheet-item"
        onclick={() => { moveTarget = node; actionTarget = null }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/>
        </svg>
        移動
      </button>
      <button
        class="action-sheet-item danger"
        onclick={() => { deleteTarget = node; actionTarget = null }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
        削除
      </button>
      <button class="action-sheet-cancel" onclick={() => (actionTarget = null)}>
        キャンセル
      </button>
    </div>
  </div>
{/if}

{#if moveTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => (moveTarget = null)}>
    <div class="action-sheet scrollable" onclick={(e) => e.stopPropagation()}>
      <div class="action-sheet-header">
        <span class="action-sheet-title">「{moveTarget.name}」の移動先</span>
      </div>
      {#each moveCandidates as dir}
        <button class="action-sheet-item" onclick={() => handleMoveSelect(dir)}>
          {dir || 'vault のルート'}
        </button>
      {/each}
      <button class="action-sheet-cancel" onclick={() => (moveTarget = null)}>
        キャンセル
      </button>
    </div>
  </div>
{/if}

{#if deleteTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => (deleteTarget = null)}>
    <div class="confirm-sheet" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-msg">
        {#if deleteTarget.is_dir}
          「{deleteTarget.name}」を中のファイル {countFiles(deleteTarget)} 件ごと削除しますか？
        {:else}
          「{deleteTarget.name}」を削除しますか？
        {/if}
      </div>
      <div class="confirm-actions">
        <button class="confirm-delete" onclick={handleDeleteConfirm}>削除</button>
        <button class="confirm-cancel" onclick={() => (deleteTarget = null)}>キャンセル</button>
      </div>
    </div>
  </div>
{/if}

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

  .search-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
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

  .search-btn:hover {
    background: var(--koto-bg-hover);
    color: var(--koto-text-secondary);
  }

  .create-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--koto-touch-min);
    min-height: var(--koto-touch-min);
    background: none;
    border: 1px solid var(--koto-border);
    color: var(--koto-text-muted);
    cursor: pointer;
    border-radius: var(--koto-radius-sm);
    flex-shrink: 0;
    transition: background var(--koto-transition-fast), color var(--koto-transition-fast);
  }

  .create-btn:active {
    color: var(--koto-accent);
    background: var(--koto-accent-subtle);
  }

  .create-input-row {
    display: flex;
    align-items: center;
    gap: var(--koto-space-2);
    padding: var(--koto-space-2);
    border-bottom: 1px solid var(--koto-border);
    flex-shrink: 0;
  }

  .input-hint {
    flex-shrink: 0;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--koto-text-muted);
    font-size: var(--koto-font-size-xs);
    font-family: var(--koto-font-mono);
  }

  .op-error {
    padding: var(--koto-space-2) var(--koto-space-3);
    border-bottom: 1px solid var(--koto-border);
    background: var(--koto-bg-elevated);
    color: #f38ba8;
    font-size: var(--koto-font-size-xs);
    flex-shrink: 0;
  }

  .create-input {
    width: 100%;
    min-height: var(--koto-touch-min);
    padding: var(--koto-space-2) var(--koto-space-3);
    background: var(--koto-bg-input);
    border: 1px solid var(--koto-accent);
    border-radius: var(--koto-radius-sm);
    color: var(--koto-text-primary);
    font-size: var(--koto-font-size-sm);
    font-family: var(--koto-font-mono);
    outline: none;
    box-sizing: border-box;
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

  .base-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .base-error {
    padding: 16px;
    color: #f38ba8;
    font-size: var(--koto-font-size-sm);
  }
  .base-loading {
    padding: 16px;
    color: var(--koto-text-muted);
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

  .action-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--koto-touch-min);
    min-height: var(--koto-touch-min);
    margin: calc(-1 * var(--koto-space-2)) 0;
    background: none;
    border: none;
    color: var(--koto-text-muted);
    cursor: pointer;
    border-radius: var(--koto-radius-sm);
    transition: color var(--koto-transition-fast), background var(--koto-transition-fast);
  }

  .action-menu-btn:active {
    color: var(--koto-accent);
    background: var(--koto-accent-subtle);
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

  /* Overlay */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
  }

  /* Action sheet (bottom sheet) */
  .action-sheet {
    width: 100%;
    max-width: 480px;
    background: var(--koto-bg-surface);
    border-radius: var(--koto-radius-lg) var(--koto-radius-lg) 0 0;
    padding-bottom: var(--koto-safe-bottom);
    overflow: hidden;
  }

  .action-sheet.scrollable {
    max-height: 70vh;
    overflow-y: auto;
  }

  .action-sheet-header {
    padding: var(--koto-space-4);
    border-bottom: 1px solid var(--koto-border);
    text-align: center;
  }

  .action-sheet-title {
    font-size: var(--koto-font-size-sm);
    color: var(--koto-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-sheet-item {
    display: flex;
    align-items: center;
    gap: var(--koto-space-3);
    width: 100%;
    min-height: var(--koto-touch-min);
    padding: var(--koto-space-3) var(--koto-space-4);
    background: none;
    border: none;
    color: var(--koto-text-primary);
    font-size: var(--koto-font-size-base);
    cursor: pointer;
    text-align: left;
    transition: background var(--koto-transition-fast);
  }

  .action-sheet-item:active {
    background: var(--koto-bg-hover);
  }

  .action-sheet-item.danger {
    color: #f38ba8;
  }

  .action-sheet-cancel {
    display: block;
    width: 100%;
    min-height: var(--koto-touch-min);
    padding: var(--koto-space-3);
    margin-top: var(--koto-space-2);
    background: none;
    border: none;
    border-top: 1px solid var(--koto-border);
    color: var(--koto-text-muted);
    font-size: var(--koto-font-size-base);
    cursor: pointer;
    text-align: center;
  }

  /* Delete confirmation sheet */
  .confirm-sheet {
    width: 100%;
    max-width: 480px;
    background: var(--koto-bg-surface);
    border-radius: var(--koto-radius-lg) var(--koto-radius-lg) 0 0;
    padding: var(--koto-space-4);
    padding-bottom: calc(var(--koto-space-4) + var(--koto-safe-bottom));
  }

  .confirm-msg {
    text-align: center;
    color: var(--koto-text-secondary);
    font-size: var(--koto-font-size-base);
    padding: var(--koto-space-4) 0;
  }

  .confirm-actions {
    display: flex;
    gap: var(--koto-space-3);
  }

  .confirm-actions button {
    flex: 1;
    min-height: var(--koto-touch-min);
    border: none;
    border-radius: var(--koto-radius-md);
    font-size: var(--koto-font-size-base);
    cursor: pointer;
    transition: background var(--koto-transition-fast);
  }

  .confirm-delete {
    background: #f38ba8;
    color: #1e1d20;
    font-weight: 600;
  }

  .confirm-delete:active {
    background: #e06c8a;
  }

  .confirm-cancel {
    background: var(--koto-bg-elevated);
    color: var(--koto-text-secondary);
  }

  .confirm-cancel:active {
    background: var(--koto-bg-hover);
  }
</style>
