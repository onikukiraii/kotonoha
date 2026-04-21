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

  function displayFields(row: Row) {
    return view.columns
      .filter((c) => c !== view.image)
      .map((col) => ({
        key: col,
        label: displayNames[col] ?? displayNames[`note.${col}`] ?? col,
        value: formatValue(row.properties[col]),
      }))
  }

  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
</script>

<div class="card-grid">
  {#each actualRows as row (row.path)}
    <div
      class="card"
      class:clickable={onRowClick !== undefined}
      onclick={() => onRowClick?.(row)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onRowClick?.(row)}
      role={onRowClick ? 'button' : undefined}
      tabindex={onRowClick ? 0 : undefined}
      data-testid="base-card"
    >
      {#if view.image && row.properties[view.image]}
        <div class="card-cover">
          <img src={String(row.properties[view.image])} alt="" loading="lazy" />
        </div>
      {/if}
      <div class="card-body">
        {#each displayFields(row) as field (field.key)}
          <div class="field">
            <span class="field-label">{field.label}</span>
            <span class="field-value">{field.value}</span>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    padding: 12px;
  }
  .card {
    background: var(--koto-bg-surface, #1a1a1a);
    border: 1px solid var(--koto-border, #333);
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .card.clickable {
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .card.clickable:hover {
    border-color: var(--koto-accent, #a88b50);
  }
  .card-cover {
    width: 100%;
    aspect-ratio: 16/10;
    overflow: hidden;
    background: var(--koto-bg-elevated, #222);
  }
  .card-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .card-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--koto-font-size-sm, 13px);
  }
  .field {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .field-label {
    color: var(--koto-text-muted, #888);
    min-width: 60px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .field-value {
    color: var(--koto-text-primary, #eee);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
