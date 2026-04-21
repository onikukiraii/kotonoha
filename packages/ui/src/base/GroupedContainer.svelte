<script lang="ts">
  import type { Group, Row, ViewResult } from '@kotonoha/base'
  import TableView from './TableView.svelte'
  import CardView from './CardView.svelte'
  import ListView from './ListView.svelte'

  type Props = {
    view: ViewResult
    displayNames?: Record<string, string>
    onRowClick?: (row: Row) => void
  }

  let { view, displayNames = {}, onRowClick }: Props = $props()

  const groups = $derived<Group[]>(view.groups ?? [])
  let collapsed = $state<Record<string, boolean>>({})

  function toggle(key: string) {
    collapsed[key] = !collapsed[key]
  }

  function summaryEntries(summaries: Record<string, unknown> | undefined) {
    if (!summaries) return []
    return Object.entries(summaries).map(([col, value]) => ({
      col,
      label: displayNames[col] ?? displayNames[`note.${col}`] ?? col,
      value: formatSummary(value),
    }))
  }

  function formatSummary(v: unknown): string {
    if (v === null || v === undefined) return '-'
    if (typeof v === 'number') {
      return Number.isInteger(v) ? String(v) : v.toFixed(2)
    }
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }
</script>

<div class="grouped-container">
  {#each groups as group (group.key)}
    {@const isCollapsed = collapsed[group.key] === true}
    <section class="group">
      <header class="group-header">
        <button class="toggle" onclick={() => toggle(group.key)} type="button">
          <span class="chev">{isCollapsed ? '▸' : '▾'}</span>
          <span class="key">{group.key || '(なし)'}</span>
          <span class="count">{group.rows.length}</span>
        </button>
        {#if summaryEntries(group.summaries).length > 0}
          <div class="summaries">
            {#each summaryEntries(group.summaries) as s (s.col)}
              <span class="summary">
                <span class="s-label">{s.label}</span>
                <span class="s-value">{s.value}</span>
              </span>
            {/each}
          </div>
        {/if}
      </header>

      {#if !isCollapsed}
        <div class="group-body">
          {#if view.type === 'table'}
            <TableView {view} rows={group.rows} {displayNames} {onRowClick} />
          {:else if view.type === 'cards'}
            <CardView {view} rows={group.rows} {displayNames} {onRowClick} />
          {:else}
            <ListView {view} rows={group.rows} {displayNames} {onRowClick} />
          {/if}
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  .grouped-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .group {
    border: 1px solid var(--koto-border, #333);
    border-radius: 6px;
    overflow: hidden;
  }
  .group-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--koto-bg-surface, #1a1a1a);
    border-bottom: 1px solid var(--koto-border, #333);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: var(--koto-text-primary, #eee);
    cursor: pointer;
    padding: 0;
    font-size: var(--koto-font-size-sm, 13px);
  }
  .chev {
    color: var(--koto-text-muted, #888);
    width: 12px;
  }
  .key {
    font-weight: 600;
  }
  .count {
    color: var(--koto-text-muted, #888);
    font-size: 11px;
    padding: 1px 6px;
    background: var(--koto-bg-elevated, #222);
    border-radius: 10px;
  }
  .summaries {
    display: inline-flex;
    gap: 12px;
    margin-left: auto;
    font-size: 11px;
  }
  .summary {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
  }
  .s-label {
    color: var(--koto-text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .s-value {
    color: var(--koto-accent-dim, #c9a86a);
    font-weight: 600;
  }
  .group-body {
    background: var(--koto-bg-base, #111);
  }
</style>
