<script lang="ts">
  import { parseBase, BaseParseError } from '@kotonoha/base'

  type Props = {
    rawYaml: string
    onSave: (yaml: string) => Promise<void>
    onClose: () => void
  }

  let { rawYaml, onSave, onClose }: Props = $props()

  let draft = $state(rawYaml)
  let error = $state<string | null>(null)
  let saving = $state(false)
  let validationError = $derived.by(() => {
    if (draft.trim() === '') return null
    try {
      parseBase(draft)
      return null
    } catch (e) {
      return e instanceof BaseParseError ? e.message : String(e)
    }
  })

  async function handleSave() {
    if (validationError) {
      error = validationError
      return
    }
    saving = true
    error = null
    try {
      await onSave(draft)
      onClose()
    } catch (e) {
      error = (e as Error).message
    } finally {
      saving = false
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }
</script>

<div class="filter-editor" onkeydown={handleKeydown} role="dialog">
  <header class="editor-header">
    <span class="title">.base YAML を編集</span>
    <span class="help">⌘S で保存 · Esc で閉じる</span>
  </header>
  <textarea
    bind:value={draft}
    class="editor"
    class:invalid={!!validationError}
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    data-testid="filter-editor-textarea"
  ></textarea>
  {#if validationError}
    <div class="validation">{validationError}</div>
  {/if}
  {#if error}
    <div class="error">{error}</div>
  {/if}
  <footer class="editor-footer">
    <button type="button" onclick={onClose} class="secondary">キャンセル</button>
    <button
      type="button"
      onclick={handleSave}
      disabled={saving || !!validationError}
      class="primary"
    >
      {saving ? '保存中...' : '保存'}
    </button>
  </footer>
</div>

<style>
  .filter-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--koto-bg-surface, #1a1a1a);
    border: 1px solid var(--koto-border, #333);
    border-radius: 6px;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .title {
    font-weight: 600;
    color: var(--koto-text-primary, #eee);
  }
  .help {
    font-size: 11px;
    color: var(--koto-text-muted, #888);
  }
  .editor {
    flex: 1;
    min-height: 240px;
    padding: 10px 12px;
    background: var(--koto-bg-input, #111);
    color: var(--koto-text-primary, #eee);
    border: 1px solid var(--koto-border, #333);
    border-radius: 4px;
    font-family: var(--koto-font-mono, monospace);
    font-size: 13px;
    resize: vertical;
    outline: none;
  }
  .editor:focus {
    border-color: var(--koto-accent, #a88b50);
  }
  .editor.invalid {
    border-color: #f38ba8;
  }
  .validation,
  .error {
    font-size: 12px;
    color: #f38ba8;
    padding: 4px 8px;
    background: rgba(243, 139, 168, 0.1);
    border-radius: 3px;
  }
  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .editor-footer button {
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
