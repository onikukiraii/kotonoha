<script lang="ts">
  import type { BaseFile, BaseView, FilterNode, PropertySchema, SortSpec, ViewType } from '@kotonoha/base'

  type Props = {
    base: BaseFile
    schema: PropertySchema
    onChange: (base: BaseFile) => void
    onClose: () => void
  }

  let { base, schema, onChange, onClose }: Props = $props()

  const OPERATORS = [
    { value: '==', label: '==' },
    { value: '!=', label: '!=' },
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: 'contains', label: 'contains' },
  ] as const

  const SUMMARY_FNS = ['', 'Sum', 'Average', 'Min', 'Max', 'Earliest', 'Latest', 'Checked']

  const FILE_KEYS = [
    { name: 'file.name', types: ['string'] },
    { name: 'file.basename', types: ['string'] },
    { name: 'file.folder', types: ['string'] },
    { name: 'file.path', types: ['string'] },
    { name: 'file.size', types: ['number'] },
    { name: 'file.mtime', types: ['date'] },
    { name: 'file.ctime', types: ['date'] },
  ]

  const allKeys = $derived([...FILE_KEYS, ...schema.keys])
  const numericDateBoolKeys = $derived(
    allKeys.filter((k) =>
      k.types.includes('number') || k.types.includes('date') || k.types.includes('bool'),
    ),
  )

  type FilterRow = { key: string; op: string; value: string }

  // Only work on the first view for now
  const view = $derived(base.views[0])

  function extractRows(node: FilterNode | undefined): FilterRow[] {
    if (!node) return []
    const exprs =
      node.kind === 'and' ? node.children : node.kind === 'expr' ? [node] : []
    return exprs
      .filter((c): c is FilterNode & { kind: 'expr' } => c.kind === 'expr')
      .map((c) => parseExprRow(c.source))
  }

  function parseExprRow(source: string): FilterRow {
    for (const op of ['==', '!=', '>=', '<=', '>', '<']) {
      const idx = source.indexOf(op)
      if (idx > 0) {
        const key = source.slice(0, idx).trim()
        let value = source.slice(idx + op.length).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        return { key, op, value }
      }
    }
    const m = /^contains\(([^,]+),\s*"(.*)"\)$/.exec(source)
    if (m) return { key: m[1]!.trim(), op: 'contains', value: m[2]! }
    return { key: source, op: '==', value: '' }
  }

  function rowToExpr(row: FilterRow): string {
    if (row.op === 'contains') return `contains(${row.key}, "${row.value}")`
    const valueLiteral = numericLike(row.value) ? row.value : `"${row.value}"`
    return `${row.key} ${row.op} ${valueLiteral}`
  }

  function numericLike(s: string): boolean {
    if (s === 'true' || s === 'false') return true
    return /^-?\d+(\.\d+)?$/.test(s)
  }

  let filterRows = $state<FilterRow[]>(extractRows(view?.filters))

  function commitView(patch: Partial<BaseView>) {
    if (!view) return
    const nextViews = [...base.views]
    nextViews[0] = { ...view, ...patch } as BaseView
    onChange({ ...base, views: nextViews })
  }

  function commitFilterRows(rows: FilterRow[]) {
    filterRows = rows
    if (!view) return
    const valid = rows.filter((r) => r.key && r.value !== '')
    const filters: FilterNode | undefined =
      valid.length === 0
        ? undefined
        : {
            kind: 'and',
            children: valid.map((r) => ({ kind: 'expr', source: rowToExpr(r) })),
          }
    commitView({ filters })
  }

  function addFilter() {
    const firstKey = schema.keys[0]?.name ?? ''
    commitFilterRows([...filterRows, { key: firstKey, op: '==', value: '' }])
  }

  function updateFilter(i: number, patch: Partial<FilterRow>) {
    const next = filterRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    commitFilterRows(next)
  }

  function removeFilter(i: number) {
    commitFilterRows(filterRows.filter((_, idx) => idx !== i))
  }

  const columnSelection = $derived(() => {
    const set = new Set(view?.order ?? [])
    const has: Record<string, boolean> = { 'file.name': set.has('file.name') }
    for (const k of schema.keys) has[k.name] = set.has(k.name)
    return has
  })

  function toggleColumn(name: string) {
    if (!view) return
    const current = view.order ?? []
    const next = current.includes(name)
      ? current.filter((c) => c !== name)
      : [...current, name]
    commitView({ order: next })
  }

  function addSort() {
    if (!view) return
    const firstKey = schema.keys[0]?.name ?? 'file.name'
    const next = [...(view.sort ?? []), { column: firstKey, direction: 'asc' as const }]
    commitView({ sort: next })
  }

  function updateSort(i: number, patch: Partial<SortSpec>) {
    if (!view) return
    const next = (view.sort ?? []).map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    commitView({ sort: next })
  }

  function removeSort(i: number) {
    if (!view) return
    const next = (view.sort ?? []).filter((_, idx) => idx !== i)
    commitView({ sort: next.length === 0 ? undefined : next })
  }

  function setGroupBy(name: string) {
    if (!view) return
    commitView({ groupBy: name ? { property: name } : undefined })
  }

  function setSummary(col: string, fn: string) {
    if (!view) return
    const next = { ...(view.summaries ?? {}) }
    if (fn) next[col] = fn
    else delete next[col]
    commitView({ summaries: Object.keys(next).length === 0 ? undefined : next })
  }

  function setViewType(t: ViewType) {
    commitView({ type: t })
  }
</script>

<aside class="settings-panel" role="complementary">
  <header class="panel-header">
    <h3>⚙ ベース設定</h3>
    <button class="close" onclick={onClose} aria-label="閉じる" type="button">×</button>
  </header>

  {#if !view}
    <div class="empty">ビューがありません</div>
  {:else}
    <section class="section">
      <h4>ビュータイプ</h4>
      <div class="segmented">
        {#each ['table', 'cards', 'list'] as t (t)}
          <button
            type="button"
            class:active={view.type === t}
            onclick={() => setViewType(t as ViewType)}
          >
            {t}
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <h4>フィルタ (AND)</h4>
      {#each filterRows as row, i (i)}
        <div class="row">
          <select value={row.key} onchange={(e) => updateFilter(i, { key: (e.currentTarget as HTMLSelectElement).value })}>
            <optgroup label="ファイル情報">
              {#each FILE_KEYS as k (k.name)}
                <option value={k.name}>{k.name}</option>
              {/each}
            </optgroup>
            {#if schema.keys.length > 0}
              <optgroup label="frontmatter">
                {#each schema.keys as k (k.name)}
                  <option value={k.name}>{k.name}</option>
                {/each}
              </optgroup>
            {/if}
          </select>
          <select value={row.op} onchange={(e) => updateFilter(i, { op: (e.currentTarget as HTMLSelectElement).value })}>
            {#each OPERATORS as op (op.value)}
              <option value={op.value}>{op.label}</option>
            {/each}
          </select>
          <input
            type="text"
            list="vals-{i}"
            value={row.value}
            onchange={(e) => updateFilter(i, { value: (e.currentTarget as HTMLInputElement).value })}
          />
          <datalist id="vals-{i}">
            {#each (schema.keys.find((k) => k.name === row.key)?.sampleValues ?? []) as v (v)}
              <option value={String(v)}></option>
            {/each}
          </datalist>
          <button class="remove" type="button" onclick={() => removeFilter(i)} aria-label="削除">×</button>
        </div>
      {/each}
      <button class="add" type="button" onclick={addFilter}>+ 条件を追加</button>
    </section>

    <section class="section">
      <h4>表示する列</h4>
      <div class="columns">
        <label class="col-row">
          <input
            type="checkbox"
            checked={columnSelection()['file.name'] ?? false}
            onchange={() => toggleColumn('file.name')}
          />
          <span>file.name</span>
        </label>
        {#each schema.keys as k (k.name)}
          <label class="col-row">
            <input
              type="checkbox"
              checked={columnSelection()[k.name] ?? false}
              onchange={() => toggleColumn(k.name)}
            />
            <span>{k.name}</span>
            <span class="meta">{k.types.join('/')}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="section">
      <h4>並び替え</h4>
      {#each (view.sort ?? []) as s, i (i)}
        <div class="row">
          <select
            value={s.column}
            onchange={(e) => updateSort(i, { column: (e.currentTarget as HTMLSelectElement).value })}
          >
            <optgroup label="ファイル情報">
              {#each FILE_KEYS as k (k.name)}
                <option value={k.name}>{k.name}</option>
              {/each}
            </optgroup>
            {#if schema.keys.length > 0}
              <optgroup label="frontmatter">
                {#each schema.keys as k (k.name)}
                  <option value={k.name}>{k.name}</option>
                {/each}
              </optgroup>
            {/if}
          </select>
          <select
            value={s.direction}
            onchange={(e) => updateSort(i, { direction: (e.currentTarget as HTMLSelectElement).value as 'asc' | 'desc' })}
          >
            <option value="asc">昇順</option>
            <option value="desc">降順</option>
          </select>
          <button class="remove" type="button" onclick={() => removeSort(i)} aria-label="削除">×</button>
        </div>
      {/each}
      <button class="add" type="button" onclick={addSort}>+ 並び替え基準を追加</button>
    </section>

    <section class="section">
      <h4>グループ化</h4>
      <select
        value={view.groupBy?.property ?? ''}
        onchange={(e) => setGroupBy((e.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">(グループ化しない)</option>
        <optgroup label="ファイル情報">
          {#each FILE_KEYS as k (k.name)}
            <option value={k.name}>{k.name}</option>
          {/each}
        </optgroup>
        {#if schema.keys.length > 0}
          <optgroup label="frontmatter">
            {#each schema.keys as k (k.name)}
              <option value={k.name}>{k.name}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
    </section>

    <section class="section">
      <h4>集計</h4>
      <div class="summaries">
        {#each numericDateBoolKeys as k (k.name)}
          <div class="row">
            <span class="col-name">{k.name}</span>
            <select
              value={view.summaries?.[k.name] ?? ''}
              onchange={(e) => setSummary(k.name, (e.currentTarget as HTMLSelectElement).value)}
            >
              {#each SUMMARY_FNS as fn (fn)}
                <option value={fn}>{fn || '(なし)'}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</aside>

<style>
  .settings-panel {
    width: 320px;
    background: var(--koto-bg-surface, #1a1a1a);
    border-left: 1px solid var(--koto-border, #333);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--koto-border, #333);
    position: sticky;
    top: 0;
    background: var(--koto-bg-surface, #1a1a1a);
  }
  .panel-header h3 {
    margin: 0;
    font-size: 13px;
    color: var(--koto-text-primary, #eee);
  }
  .close {
    background: none;
    border: none;
    color: var(--koto-text-muted, #888);
    font-size: 18px;
    cursor: pointer;
  }
  .section {
    padding: 10px 14px;
    border-bottom: 1px solid var(--koto-border, #333);
  }
  .section h4 {
    margin: 0 0 8px 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--koto-text-muted, #888);
  }
  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4px;
  }
  .segmented button {
    padding: 6px;
    background: var(--koto-bg-elevated, #222);
    color: var(--koto-text-secondary, #ccc);
    border: 1px solid var(--koto-border, #333);
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .segmented button.active {
    border-color: var(--koto-accent, #a88b50);
    color: var(--koto-accent, #a88b50);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto;
    gap: 4px;
    margin-bottom: 4px;
    align-items: center;
  }
  .row select,
  .row input {
    padding: 4px 6px;
    background: var(--koto-bg-input, #111);
    color: var(--koto-text-primary, #eee);
    border: 1px solid var(--koto-border, #333);
    border-radius: 3px;
    font-size: 12px;
    outline: none;
    min-width: 0;
  }
  .remove {
    background: none;
    border: none;
    color: var(--koto-text-muted, #888);
    cursor: pointer;
    font-size: 14px;
    padding: 0 6px;
  }
  .add {
    padding: 4px 8px;
    background: var(--koto-bg-elevated, #222);
    color: var(--koto-text-secondary, #ccc);
    border: 1px dashed var(--koto-border, #333);
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    width: 100%;
    margin-top: 4px;
  }
  .columns,
  .summaries {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 200px;
    overflow-y: auto;
  }
  .col-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--koto-text-primary, #eee);
    cursor: pointer;
  }
  .col-row .meta {
    margin-left: auto;
    font-size: 10px;
    color: var(--koto-text-muted, #888);
  }
  .col-name {
    font-size: 12px;
    color: var(--koto-text-primary, #eee);
  }
  .empty {
    padding: 24px;
    text-align: center;
    color: var(--koto-text-muted, #888);
  }
  .section:last-child {
    border-bottom: none;
  }
  .section select {
    width: 100%;
    padding: 4px 6px;
    background: var(--koto-bg-input, #111);
    color: var(--koto-text-primary, #eee);
    border: 1px solid var(--koto-border, #333);
    border-radius: 3px;
    font-size: 12px;
  }
</style>
