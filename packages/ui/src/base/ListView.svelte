<script lang="ts">
  import type { Row, ViewResult } from '@kotonoha/base'

  type Props = {
    view: ViewResult
    rows?: Row[]
    displayNames?: Record<string, string>
    onRowClick?: (row: Row) => void
  }

  let { view, rows, displayNames = {}, onRowClick }: Props = $props()

  const actualRows = $derived(rows ?? view.rows ?? [])

  function formatCell(v: unknown): string {
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  function label(col: string): string {
    return displayNames[col] ?? displayNames[`note.${col}`] ?? col
  }
</script>

<ul class="base-list">
  {#each actualRows as row (row.path)}
    <li
      class="list-item"
      class:clickable={onRowClick !== undefined}
      onclick={() => onRowClick?.(row)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onRowClick?.(row)}
      role={onRowClick ? 'button' : undefined}
      tabindex={onRowClick ? 0 : undefined}
      data-testid="base-list-item"
    >
      {#each view.columns as col, i (col)}
        <span class="cell">
          {#if i > 0}
            <span class="label">{label(col)}:</span>
          {/if}
          <span class="value">{formatCell(row.properties[col])}</span>
        </span>
      {/each}
    </li>
  {/each}
</ul>

<style>
  .base-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .list-item {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--koto-border, #333);
    font-size: var(--koto-font-size-sm, 13px);
  }
  .list-item.clickable {
    cursor: pointer;
  }
  .list-item.clickable:hover {
    background: var(--koto-bg-hover, rgba(255, 255, 255, 0.04));
  }
  .cell {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
  }
  .label {
    color: var(--koto-text-muted, #888);
    font-size: 11px;
  }
  .value {
    color: var(--koto-text-primary, #eee);
  }
</style>
