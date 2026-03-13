<script lang="ts">
  import type { FileNode } from '@kotonoha/types'

  interface Props {
    nodes?: FileNode[]
    selectedPath?: string | null
    keyboardMode?: boolean
    depth?: number
    onSelect?: (node: FileNode) => void
    onCreateFile?: () => void
    onDeleteFile?: (node: FileNode) => void
    onRenameFile?: (node: FileNode) => void
  }

  let {
    nodes = [],
    selectedPath = null,
    keyboardMode = false,
    depth = 0,
    onSelect = () => {},
    onCreateFile = () => {},
    onDeleteFile = () => {},
    onRenameFile = () => {},
  }: Props = $props()

  let expandedDirs = $state(new Set<string>())
  let focusedIndex = $state(0)
  let treeElement: HTMLDivElement | undefined = $state()

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

  function handleClick(node: FileNode) {
    if (node.is_dir) {
      toggleDir(node.path)
    } else {
      onSelect(node)
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!keyboardMode) return

    const flat = flatNodes
    if (flat.length === 0) return

    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        event.preventDefault()
        focusedIndex = Math.min(focusedIndex + 1, flat.length - 1)
        break
      case 'k':
      case 'ArrowUp':
        event.preventDefault()
        focusedIndex = Math.max(focusedIndex - 1, 0)
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
            if (parentIndex >= 0) focusedIndex = parentIndex
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
>
  {#each flatNodes as node, i}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="tree-item"
      class:selected={node.path === selectedPath}
      class:focused={keyboardMode && i === focusedIndex}
      class:directory={node.is_dir}
      style="padding-left: {getDepth(node.path) * 16 + 8}px"
      onclick={() => handleClick(node)}
    >
      <span class="icon">
        {#if node.is_dir}
          {expandedDirs.has(node.path) ? '📂' : '📁'}
        {:else}
          📄
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
    background: #1e1e1e;
    color: #cccccc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    outline: none;
    user-select: none;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tree-item:hover {
    background: #2a2d2e;
  }

  .tree-item.selected {
    background: #094771;
    color: #ffffff;
  }

  .tree-item.focused {
    outline: 1px solid #007fd4;
    outline-offset: -1px;
  }

  .tree-item.directory .name {
    font-weight: 500;
  }

  .icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    padding: 1rem;
    color: #666;
    text-align: center;
  }
</style>
