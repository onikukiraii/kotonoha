<script lang="ts">
  import type { FileNode } from '@kotonoha/types'
  import { moveDestination } from './tree-move.js'

  interface Props {
    nodes?: FileNode[]
    selectedPath?: string | null
    keyboardMode?: boolean
    disableVimKeys?: boolean
    depth?: number
    onSelect?: (node: FileNode) => void
    onCreateFile?: () => void
    onDeleteFile?: (node: FileNode) => void
    onRenameFile?: (node: FileNode) => void
    onMove?: (fromPath: string, toDir: string) => void
    onNodeMenu?: (node: FileNode) => void
  }

  let {
    nodes = [],
    selectedPath = null,
    keyboardMode = false,
    disableVimKeys = false,
    depth = 0,
    onSelect = () => {},
    onCreateFile = () => {},
    onDeleteFile = () => {},
    onRenameFile = () => {},
    onMove = () => {},
    onNodeMenu = () => {},
  }: Props = $props()

  const LONG_PRESS_MS = 500

  let expandedDirs = $state(new Set<string>())
  let focusedIndex = $state(0)
  let treeElement: HTMLDivElement | undefined = $state()

  let dragSource = $state<string | null>(null)
  let dragTarget = $state<string | null>(null)

  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let suppressNextClick = false

  function flattenVisible(items: FileNode[]): FileNode[] {
    const result: FileNode[] = []
    for (const node of items) {
      result.push(node)
      if (node.is_dir && expandedDirs.has(node.path) && node.children) {
        result.push(...flattenVisible(node.children))
      }
    }
    return result
  }

  let flatNodes = $derived(flattenVisible(nodes))

  function toggleDir(path: string) {
    const next = new Set(expandedDirs)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    expandedDirs = next
  }

  function scrollToFocused() {
    const el = treeElement?.querySelector(`[data-index="${focusedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }

  function handleClick(node: FileNode) {
    if (suppressNextClick) {
      suppressNextClick = false
      return
    }
    if (node.is_dir) {
      toggleDir(node.path)
    } else {
      onSelect(node)
    }
  }

  function canDropInto(node: FileNode): boolean {
    return (
      node.is_dir && dragSource !== null && moveDestination(dragSource, node.path) !== null
    )
  }

  function drop(toDir: string) {
    if (dragSource && moveDestination(dragSource, toDir)) {
      onMove(dragSource, toDir)
    }
    dragSource = null
    dragTarget = null
  }

  function startLongPress(node: FileNode) {
    cancelLongPress()
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      suppressNextClick = true
      onNodeMenu(node)
    }, LONG_PRESS_MS)
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!keyboardMode) return

    const flat = flatNodes
    if (flat.length === 0) return

    const isVimKey = (key: string) => ['j', 'k', 'h', 'l', 'o', 'd', 'r'].includes(key)
    if (disableVimKeys && isVimKey(event.key)) return

    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        event.preventDefault()
        focusedIndex = Math.min(focusedIndex + 1, flat.length - 1)
        scrollToFocused()
        break
      case 'k':
      case 'ArrowUp':
        event.preventDefault()
        focusedIndex = Math.max(focusedIndex - 1, 0)
        scrollToFocused()
        break
      case 'l':
      case 'Enter':
      case 'ArrowRight': {
        event.preventDefault()
        const node = flat[focusedIndex]
        if (node) {
          if (node.is_dir) {
            if (!expandedDirs.has(node.path)) {
              toggleDir(node.path)
            }
          } else {
            onSelect(node)
          }
        }
        break
      }
      case 'h':
      case 'ArrowLeft': {
        event.preventDefault()
        const node = flat[focusedIndex]
        if (node && node.is_dir && expandedDirs.has(node.path)) {
          toggleDir(node.path)
        } else {
          // Move to parent directory
          const parentPath = node?.path.split('/').slice(0, -1).join('/')
          if (parentPath) {
            const parentIndex = flat.findIndex((n) => n.path === parentPath)
            if (parentIndex >= 0) {
              focusedIndex = parentIndex
              scrollToFocused()
            }
          }
        }
        break
      }
      case 'o':
        event.preventDefault()
        onCreateFile()
        break
      case 'd':
        event.preventDefault()
        if (flat[focusedIndex]) {
          onDeleteFile(flat[focusedIndex])
        }
        break
      case 'r':
        event.preventDefault()
        if (flat[focusedIndex]) {
          onRenameFile(flat[focusedIndex])
        }
        break
    }
  }

  function getDepth(nodePath: string): number {
    return nodePath.split('/').length - 1
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={treeElement}
  class="filetree"
  tabindex="0"
  onkeydown={handleKeydown}
  ondragover={(e) => { if (dragSource) e.preventDefault() }}
  ondrop={(e) => { e.preventDefault(); drop('') }}
>
  {#each flatNodes as node, i}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="tree-item"
      class:selected={node.path === selectedPath}
      class:focused={keyboardMode && i === focusedIndex}
      class:directory={node.is_dir}
      class:drop-target={dragTarget === node.path}
      role="button"
      tabindex="-1"
      aria-label={node.path}
      aria-expanded={node.is_dir ? expandedDirs.has(node.path) : undefined}
      data-index={i}
      style="padding-left: {getDepth(node.path) * 16 + 12}px"
      onclick={() => handleClick(node)}
      oncontextmenu={(e) => { e.preventDefault(); onNodeMenu(node) }}
      draggable="true"
      ondragstart={(e) => {
        e.dataTransfer?.setData('text/plain', node.path)
        dragSource = node.path
      }}
      ondragend={() => { dragSource = null; dragTarget = null }}
      ondragover={(e) => {
        if (!canDropInto(node)) return
        e.preventDefault()
        dragTarget = node.path
      }}
      ondragleave={() => { if (dragTarget === node.path) dragTarget = null }}
      ondrop={(e) => {
        // 行の上での drop は、落とせない相手なら何もしない。
        // 止めないと .filetree の drop に流れてルートへ移動してしまう
        e.preventDefault()
        e.stopPropagation()
        if (canDropInto(node)) drop(node.path)
        dragSource = null
        dragTarget = null
      }}
      ontouchstart={() => startLongPress(node)}
      ontouchmove={cancelLongPress}
      ontouchend={cancelLongPress}
      ontouchcancel={cancelLongPress}
    >
      <span class="icon">
        {#if node.is_dir}
          <svg class="chevron" class:expanded={expandedDirs.has(node.path)} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="2.5" fill="var(--koto-text-muted)"/>
          </svg>
        {/if}
      </span>
      <span class="name">{node.name}</span>
    </div>
  {/each}

  {#if flatNodes.length === 0}
    <div class="empty">ファイルがありません</div>
  {/if}
</div>

<style>
  .filetree {
    height: 100%;
    overflow-y: auto;
    background: var(--koto-bg-base);
    color: var(--koto-text-secondary);
    font-family: var(--koto-font-body);
    font-size: var(--koto-font-size-sm);
    outline: none;
    user-select: none;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: var(--koto-space-2);
    min-height: var(--koto-touch-min);
    padding: var(--koto-space-3) var(--koto-space-2);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background var(--koto-transition-fast);
    -webkit-touch-callout: none;
  }

  .tree-item:hover {
    background: var(--koto-bg-hover);
  }

  .tree-item.drop-target {
    background: var(--koto-accent-subtle);
    outline: 1px dashed var(--koto-accent);
    outline-offset: -1px;
  }

  .tree-item.selected {
    background: var(--koto-bg-selected);
    color: var(--koto-accent);
  }

  .tree-item.focused {
    outline: 1px solid var(--koto-accent-dim);
    outline-offset: -1px;
  }

  .tree-item.directory .name {
    font-weight: 500;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--koto-text-muted);
  }

  .chevron {
    transition: transform var(--koto-transition-fast);
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    padding: 1rem;
    color: var(--koto-text-muted);
    text-align: center;
  }
</style>
