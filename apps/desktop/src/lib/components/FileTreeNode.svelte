<script lang="ts">
  import type { FileNode } from "@kotonoha/types";

  interface Props {
    node: FileNode;
    selectedPath: string | null;
    onSelect: (path: string) => void;
    depth: number;
  }

  let { node, selectedPath, onSelect, depth }: Props = $props();
  let expanded = $state(true);

  function displayName(name: string): string {
    return name.replace(/\.md$/, "");
  }
</script>

{#if node.is_dir}
  <div class="tree-item dir" style="padding-left: {depth * 16 + 8}px">
    <button class="tree-btn" onclick={() => (expanded = !expanded)}>
      <span class="chevron" class:open={expanded}>&#9656;</span>
      <span class="name">{node.name}</span>
    </button>
  </div>
  {#if expanded && node.children}
    {#each node.children as child}
      <svelte:self node={child} {selectedPath} {onSelect} depth={depth + 1} />
    {/each}
  {/if}
{:else}
  <div
    class="tree-item file"
    class:selected={selectedPath === node.path}
    style="padding-left: {depth * 16 + 8}px"
  >
    <button class="tree-btn" onclick={() => onSelect(node.path)}>
      <span class="name">{displayName(node.name)}</span>
    </button>
  </div>
{/if}

<style>
  .tree-item {
    display: flex;
    align-items: center;
  }

  .tree-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 13px;
    padding: 3px 8px;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-sans);
  }

  .tree-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .selected .tree-btn {
    background: var(--bg-tertiary);
    color: var(--accent);
  }

  .chevron {
    font-size: 10px;
    display: inline-block;
    transition: transform 0.1s;
    color: var(--text-muted);
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dir .name {
    font-weight: 500;
  }
</style>
