<script lang="ts">
  import type { Row, ViewResult } from '@kotonoha/base'
  import PropertyEditor from './PropertyEditor.svelte'

  type Props = {
    view: ViewResult
    rows?: Row[]
    displayNames?: Record<string, string>
    onRowClick?: (row: Row) => void
    onCellEdit?: (row: Row, key: string, value: unknown) => void
  }

  let { view, rows: rowsProp, displayNames = {}, onRowClick, onCellEdit }: Props = $props()

  const rows = $derived(rowsProp ?? view.rows ?? [])
  const columns = $derived(view.columns)

  let editing = $state<{ path: string; key: string } | null>(null)

  function formatCell(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function columnLabel(col: string): string {
    if (displayNames[col]) return displayNames[col]!
    if (displayNames[`note.${col}`]) return displayNames[`note.${col}`]!
    if (displayNames[`formula.${col}`]) return displayNames[`formula.${col}`]!
    return col
  }

  function isEditable(key: string): boolean {
    if (!onCellEdit) return false
    // file.* / formula.* は読み取り専用
    return !key.startsWith('file.') && !key.startsWith('formula.')
  }

  function handleCellClick(e: MouseEvent, row: Row, key: string) {
    if (!isEditable(key)) {
      onRowClick?.(row)
      return
    }
    e.stopPropagation()
    editing = { path: row.path, key }
  }

  function handleCommit(row: Row, key: string, value: unknown) {
    editing = null
    onCellEdit?.(row, key, value)
  }
</script>

<div class="base-table-wrap">
  <table class="base-table">
    <thead>
      <tr>
        {#each columns as col (col)}
          <th>{columnLabel(col)}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.path)}
        <tr
          onclick={() => onRowClick?.(row)}
          class:clickable={onRowClick !== undefined}
          data-testid="base-table-row"
        >
          {#each columns as col (col)}
            <td
              data-testid="base-cell-{col}"
              class:editable={isEditable(col)}
              onclick={(e) => handleCellClick(e, row, col)}
            >
              {#if editing && editing.path === row.path && editing.key === col}
                <PropertyEditor
                  value={row.properties[col]}
                  onCommit={(v) => handleCommit(row, col, v)}
                  onCancel={() => (editing = null)}
                />
              {:else}
                {formatCell(row.properties[col])}
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .base-table-wrap {
    overflow: auto;
    width: 100%;
  }
  .base-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--koto-font-size-sm, 13px);
  }
  .base-table th,
  .base-table td {
    border-bottom: 1px solid var(--koto-border, #333);
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }
  .base-table th {
    font-weight: 600;
    color: var(--koto-text-secondary, #ccc);
    background: var(--koto-bg-surface, #1a1a1a);
    position: sticky;
    top: 0;
  }
  tr.clickable {
    cursor: pointer;
  }
  tr.clickable:hover {
    background: var(--koto-bg-hover, rgba(255, 255, 255, 0.04));
  }
  td.editable {
    cursor: text;
  }
</style>
