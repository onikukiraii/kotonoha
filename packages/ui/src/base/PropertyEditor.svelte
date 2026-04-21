<script lang="ts">
  type Props = {
    value: unknown
    onCommit: (newValue: unknown) => void
    onCancel: () => void
  }

  let { value, onCommit, onCancel }: Props = $props()

  const initialType = detectType(value)
  let draft = $state(toString(value))
  let inputEl: HTMLInputElement | undefined = $state()

  $effect(() => {
    requestAnimationFrame(() => {
      inputEl?.focus()
      inputEl?.select()
    })
  })

  function detectType(v: unknown): 'number' | 'bool' | 'text' {
    if (typeof v === 'number') return 'number'
    if (typeof v === 'boolean') return 'bool'
    return 'text'
  }

  function toString(v: unknown): string {
    if (v === null || v === undefined) return ''
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }

  function parse(s: string): unknown {
    if (initialType === 'number') {
      const n = Number(s)
      return Number.isNaN(n) ? s : n
    }
    if (initialType === 'bool') {
      if (s === 'true') return true
      if (s === 'false') return false
      return s
    }
    if (Array.isArray(value)) {
      return s
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
    }
    return s
  }

  function commit() {
    const next = parse(draft)
    if (JSON.stringify(next) !== JSON.stringify(value)) onCommit(next)
    else onCancel()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }
</script>

<input
  bind:this={inputEl}
  bind:value={draft}
  onkeydown={onKey}
  onblur={commit}
  class="cell-input"
  type={initialType === 'number' ? 'number' : 'text'}
/>

<style>
  .cell-input {
    width: 100%;
    padding: 2px 6px;
    background: var(--koto-bg-input, #111);
    color: var(--koto-text-primary, #eee);
    border: 1px solid var(--koto-accent, #a88b50);
    border-radius: 3px;
    font-size: inherit;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
  }
</style>
