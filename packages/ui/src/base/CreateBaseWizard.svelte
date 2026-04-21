<script lang="ts">
  import type { BaseFile, PropertySchema, ViewType } from '@kotonoha/base'
  import { serializeBase } from '@kotonoha/base'

  type Props = {
    defaultName?: string
    folders: string[]
    loadSchema: (folder: string | null) => Promise<PropertySchema>
    onCreate: (filePath: string, yaml: string) => Promise<void>
    onCancel: () => void
  }

  let { defaultName = '', folders, loadSchema, onCreate, onCancel }: Props = $props()

  let name = $state(defaultName)
  let folder = $state<string>('')
  let viewType = $state<ViewType>('table')
  let schema = $state<PropertySchema | null>(null)
  let selectedKeys = $state<Record<string, boolean>>({})
  let loading = $state(false)
  let creating = $state(false)
  let error = $state<string | null>(null)

  $effect(() => {
    const f = folder
    loading = true
    schema = null
    loadSchema(f || null)
      .then((s) => {
        schema = s
        const next: Record<string, boolean> = {}
        for (const k of s.keys) next[k.name] = true
        selectedKeys = next
      })
      .catch((e: Error) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  const selectedCount = $derived(
    Object.values(selectedKeys).filter((v) => v).length,
  )

  async function handleCreate() {
    error = null
    if (!name.trim()) {
      error = '名前を入力してください'
      return
    }
    const fileName = name.endsWith('.base') ? name : `${name}.base`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    const columns = (schema?.keys ?? [])
      .filter((k) => selectedKeys[k.name])
      .map((k) => k.name)
    const order = ['file.name', ...columns]

    const base: BaseFile = {
      formulas: {},
      properties: {},
      summaries: {},
      views: [
        {
          type: viewType,
          name: viewType === 'cards' ? 'Gallery' : viewType === 'list' ? 'List' : 'All',
          order,
        },
      ],
    }
    if (folder) {
      base.filters = {
        kind: 'and',
        children: [{ kind: 'expr', source: `file.inFolder("${folder}")` }],
      }
    }

    const yaml = serializeBase(base)

    creating = true
    try {
      await onCreate(filePath, yaml)
    } catch (e) {
      error = (e as Error).message
    } finally {
      creating = false
    }
  }

  function toggleKey(name: string) {
    selectedKeys = { ...selectedKeys, [name]: !selectedKeys[name] }
  }
</script>

<div
  class="overlay"
  onclick={onCancel}
  role="button"
  tabindex="-1"
  onkeydown={(e) => e.key === 'Escape' && onCancel()}
>
  <div
    class="modal"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    onkeydown={(e) => e.stopPropagation()}
  >
    <header class="modal-header">
      <h2>Base を新規作成</h2>
      <button class="close" onclick={onCancel} aria-label="閉じる" type="button">×</button>
    </header>

    <div class="field">
      <label for="base-name">名前</label>
      <input
        id="base-name"
        bind:value={name}
        placeholder="reading"
        autofocus
        onkeydown={(e) => e.key === 'Enter' && handleCreate()}
      />
      <span class="hint">`.base` は自動で付きます</span>
    </div>

    <div class="field">
      <label for="base-folder">対象フォルダ</label>
      <select id="base-folder" bind:value={folder}>
        <option value="">(Vault 全体)</option>
        {#each folders as f (f)}
          <option value={f}>{f}</option>
        {/each}
      </select>
      <span class="hint">選んだフォルダ内のノートだけが表示対象になります</span>
    </div>

    <div class="field">
      <label>ビュータイプ</label>
      <div class="type-grid">
        {#each [{ k: 'table', label: 'Table', desc: '表形式' }, { k: 'cards', label: 'Cards', desc: 'カード' }, { k: 'list', label: 'List', desc: 'リスト' }] as opt (opt.k)}
          <button
            type="button"
            class="type-btn"
            class:active={viewType === opt.k}
            onclick={() => (viewType = opt.k as ViewType)}
          >
            <span class="type-label">{opt.label}</span>
            <span class="type-desc">{opt.desc}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="field">
      <label>初期表示する列 <span class="counter">({selectedCount})</span></label>
      {#if loading}
        <div class="note">検出中...</div>
      {:else if !schema || schema.keys.length === 0}
        <div class="note">
          このフォルダにはプロパティ付き (YAML frontmatter) のノートが見つかりません。
          あとで `⚙ 設定` パネルから追加できます。
        </div>
      {:else}
        <div class="key-grid">
          {#each schema.keys as k (k.name)}
            <label class="key-row">
              <input
                type="checkbox"
                checked={selectedKeys[k.name] ?? false}
                onchange={() => toggleKey(k.name)}
              />
              <span class="key-name">{k.name}</span>
              <span class="key-meta">{k.types.join('/')} · {k.count}件</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <footer class="modal-footer">
      <button type="button" class="secondary" onclick={onCancel}>キャンセル</button>
      <button
        type="button"
        class="primary"
        disabled={creating || !name.trim()}
        onclick={handleCreate}
      >
        {creating ? '作成中...' : '作成'}
      </button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--koto-bg-surface, #1a1a1a);
    border: 1px solid var(--koto-border, #333);
    border-radius: 8px;
    width: min(540px, 95vw);
    max-height: 90vh;
    overflow: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .modal-header h2 {
    margin: 0;
    font-size: 16px;
    color: var(--koto-text-primary, #eee);
  }
  .close {
    background: none;
    border: none;
    color: var(--koto-text-muted, #888);
    font-size: 20px;
    cursor: pointer;
    padding: 0 8px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field label {
    font-size: 12px;
    color: var(--koto-text-secondary, #ccc);
  }
  .counter {
    color: var(--koto-accent-dim, #c9a86a);
  }
  .field input,
  .field select {
    padding: 6px 10px;
    background: var(--koto-bg-input, #111);
    color: var(--koto-text-primary, #eee);
    border: 1px solid var(--koto-border, #333);
    border-radius: 4px;
    font-size: 13px;
    outline: none;
  }
  .field input:focus,
  .field select:focus {
    border-color: var(--koto-accent, #a88b50);
  }
  .hint {
    font-size: 11px;
    color: var(--koto-text-muted, #888);
  }
  .type-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .type-btn {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    background: var(--koto-bg-elevated, #222);
    color: var(--koto-text-secondary, #ccc);
    border: 1px solid var(--koto-border, #333);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .type-btn.active {
    border-color: var(--koto-accent, #a88b50);
    color: var(--koto-accent, #a88b50);
    background: rgba(168, 139, 80, 0.08);
  }
  .type-label {
    font-weight: 600;
  }
  .type-desc {
    font-size: 11px;
    color: var(--koto-text-muted, #888);
  }
  .key-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    max-height: 220px;
    overflow: auto;
    padding: 6px;
    background: var(--koto-bg-input, #111);
    border: 1px solid var(--koto-border, #333);
    border-radius: 4px;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--koto-text-primary, #eee);
    cursor: pointer;
    padding: 2px 4px;
  }
  .key-row:hover {
    background: var(--koto-bg-hover, rgba(255, 255, 255, 0.04));
  }
  .key-meta {
    margin-left: auto;
    font-size: 10px;
    color: var(--koto-text-muted, #888);
  }
  .note {
    font-size: 12px;
    color: var(--koto-text-muted, #888);
    padding: 10px;
    background: var(--koto-bg-input, #111);
    border: 1px solid var(--koto-border, #333);
    border-radius: 4px;
  }
  .error {
    color: #f38ba8;
    font-size: 12px;
    padding: 6px 10px;
    background: rgba(243, 139, 168, 0.1);
    border-radius: 3px;
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--koto-border, #333);
  }
  .modal-footer button {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid var(--koto-border, #333);
    font-size: 13px;
    cursor: pointer;
  }
  .primary {
    background: var(--koto-accent, #a88b50);
    color: #1e1d20;
    border-color: var(--koto-accent, #a88b50);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .secondary {
    background: var(--koto-bg-elevated, #222);
    color: var(--koto-text-secondary, #ccc);
  }
</style>
