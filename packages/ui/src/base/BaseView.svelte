<script lang="ts">
  import type { BaseFile, PropertySchema, QueryResult, Row } from '@kotonoha/base'
  import TableView from './TableView.svelte'
  import CardView from './CardView.svelte'
  import ListView from './ListView.svelte'
  import GroupedContainer from './GroupedContainer.svelte'
  import FilterEditor from './FilterEditor.svelte'
  import BaseSettingsPanel from './BaseSettingsPanel.svelte'

  type Props = {
    result: QueryResult
    displayNames?: Record<string, string>
    onRowClick?: (row: Row) => void
    onCellEdit?: (row: Row, key: string, value: unknown) => void
    rawYaml?: string
    onSaveYaml?: (yaml: string) => Promise<void>
    base?: BaseFile
    schema?: PropertySchema
    onBaseChange?: (next: BaseFile) => void
  }

  let {
    result,
    displayNames = {},
    onRowClick,
    onCellEdit,
    rawYaml,
    onSaveYaml,
    base,
    schema,
    onBaseChange,
  }: Props = $props()

  let activeIndex = $state(0)
  let mode = $state<'view' | 'settings' | 'yaml'>('view')
  const activeView = $derived(result.views[activeIndex] ?? result.views[0])
  const isGrouped = $derived(!!activeView?.groups)
  const canEdit = $derived(!!base && !!schema && !!onBaseChange)
  const canEditYaml = $derived(rawYaml !== undefined && !!onSaveYaml)

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

<div class="base-view">
  {#if result.views.length === 0}
    <div class="empty">ビューが定義されていません</div>
  {:else}
    <nav class="view-tabs">
      {#if result.views.length > 1}
        {#each result.views as v, i (i)}
          <button
            class:active={i === activeIndex}
            onclick={() => (activeIndex = i)}
            type="button"
          >
            {v.name}
          </button>
        {/each}
      {/if}
      <span class="spacer"></span>
      {#if canEdit}
        <button
          type="button"
          class="mode-btn"
          class:active={mode === 'settings'}
          onclick={() => (mode = mode === 'settings' ? 'view' : 'settings')}
          title="設定"
        >
          ⚙ 設定
        </button>
      {/if}
      {#if canEditYaml}
        <button
          type="button"
          class="mode-btn advanced"
          class:active={mode === 'yaml'}
          onclick={() => (mode = mode === 'yaml' ? 'view' : 'yaml')}
          title="上級: YAML を直接編集"
        >
          {'{ }'} 上級
        </button>
      {/if}
    </nav>

    <div class="panes">
      <div class="main-pane" class:narrowed={mode === 'settings' || mode === 'yaml'}>
        {#if activeView}
          <div class="view-body">
            {#if isGrouped}
              <GroupedContainer view={activeView} {displayNames} {onRowClick} />
            {:else if activeView.type === 'table'}
              <TableView view={activeView} {displayNames} {onRowClick} {onCellEdit} />
            {:else if activeView.type === 'cards'}
              <CardView view={activeView} {displayNames} {onRowClick} />
            {:else if activeView.type === 'list'}
              <ListView view={activeView} {displayNames} {onRowClick} />
            {/if}
          </div>

          {#if !isGrouped && summaryEntries(activeView.summaries).length > 0}
            <footer class="summary-bar">
              {#each summaryEntries(activeView.summaries) as s (s.col)}
                <span class="summary">
                  <span class="s-label">{s.label}</span>
                  <span class="s-value">{s.value}</span>
                </span>
              {/each}
            </footer>
          {/if}
        {/if}
      </div>

      {#if mode === 'settings' && base && schema && onBaseChange}
        <BaseSettingsPanel
          {base}
          {schema}
          onChange={onBaseChange}
          onClose={() => (mode = 'view')}
        />
      {/if}

      {#if mode === 'yaml' && rawYaml !== undefined && onSaveYaml}
        <div class="yaml-pane">
          <FilterEditor
            rawYaml={rawYaml}
            onSave={onSaveYaml}
            onClose={() => (mode = 'view')}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .base-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  .view-tabs {
    display: flex;
    gap: 4px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--koto-border, #333);
    flex-shrink: 0;
    align-items: center;
  }
  .spacer {
    flex: 1;
  }
  .view-tabs button {
    background: none;
    border: 1px solid transparent;
    padding: 4px 10px;
    border-radius: 4px;
    color: var(--koto-text-muted, #888);
    cursor: pointer;
    font-size: var(--koto-font-size-sm, 13px);
  }
  .view-tabs button.active {
    color: var(--koto-text-primary, #eee);
    border-color: var(--koto-border, #333);
    background: var(--koto-bg-elevated, #222);
  }
  .mode-btn {
    font-size: 12px;
  }
  .advanced {
    font-family: var(--koto-font-mono, monospace);
    opacity: 0.7;
  }
  .advanced:hover,
  .advanced.active {
    opacity: 1;
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
  .main-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .yaml-pane {
    width: 380px;
    flex-shrink: 0;
    border-left: 1px solid var(--koto-border, #333);
    padding: 8px;
    display: flex;
  }
  .view-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .empty {
    padding: 24px;
    color: var(--koto-text-muted, #888);
    text-align: center;
  }
  .summary-bar {
    border-top: 1px solid var(--koto-border, #333);
    padding: 8px 12px;
    display: flex;
    gap: 16px;
    flex-shrink: 0;
    background: var(--koto-bg-surface, #1a1a1a);
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
</style>
