<script lang="ts">
  import { onMount } from 'svelte'
  import DOMPurify from 'dompurify'

  interface Props {
    html?: string
    cursorLine?: number
    onWikilinkClick?: (target: string) => void
  }

  let { html = '', cursorLine = 0, onWikilinkClick = () => {} }: Props = $props()

  let previewElement: HTMLDivElement | undefined = $state()

  const sanitizeConfig = {
    ADD_TAGS: ['mark'],
    ADD_ATTR: ['data-target', 'data-source-line', 'class'],
  }

  let sanitizedHtml = $derived(DOMPurify.sanitize(html, sanitizeConfig))

  function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement
    const wikilinkEl = target.closest('.wikilink') as HTMLElement | null
    if (wikilinkEl) {
      event.preventDefault()
      const linkTarget = wikilinkEl.dataset.target
      if (linkTarget) {
        onWikilinkClick(linkTarget)
      }
    }
  }

  async function renderMermaidBlocks() {
    if (!previewElement) return
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({ startOnLoad: false, theme: 'dark' })

    const mermaidBlocks = previewElement.querySelectorAll('pre > code.language-mermaid')
    for (const block of mermaidBlocks) {
      const pre = block.parentElement!
      const source = block.textContent || ''
      const id = `mermaid-${crypto.randomUUID()}`
      try {
        const { svg } = await mermaid.render(id, source)
        const wrapper = document.createElement('div')
        wrapper.className = 'mermaid-diagram'
        wrapper.innerHTML = svg
        pre.replaceWith(wrapper)
      } catch {
        // Keep the original code block on error
      }
    }
  }

  let scrollTimer: ReturnType<typeof setTimeout> | undefined

  function scrollToLine(line: number) {
    if (!previewElement) return
    const elements = previewElement.querySelectorAll('[data-source-line]')
    let target: Element | null = null
    for (const el of elements) {
      const elLine = parseInt(el.getAttribute('data-source-line') || '0')
      if (elLine <= line) {
        target = el
      } else {
        break
      }
    }
    if (target) {
      target.scrollIntoView({ behavior: 'instant', block: 'center' })
    }
  }

  $effect(() => {
    if (!cursorLine) return
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => scrollToLine(cursorLine), 100)
  })

  $effect(() => {
    if (previewElement && sanitizedHtml) {
      renderMermaidBlocks()
      import('highlight.js').then(({ default: hljs }) => {
        previewElement!.querySelectorAll('pre code:not(.language-mermaid)').forEach((block) => {
          hljs.highlightElement(block as HTMLElement)
        })
      })
    }
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={previewElement} class="preview-container" onclick={handleClick}>
  {@html sanitizedHtml}
</div>

<style>
  .preview-container {
    padding: 1rem;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 15px;
    line-height: 1.7;
    overflow-y: auto;
    height: 100%;
  }

  .preview-container :global(h1) {
    font-size: 1.8em;
    border-bottom: 1px solid #333;
    padding-bottom: 0.3em;
    margin-top: 1.5em;
  }

  .preview-container :global(h2) {
    font-size: 1.4em;
    border-bottom: 1px solid #2a2a2a;
    padding-bottom: 0.2em;
    margin-top: 1.3em;
  }

  .preview-container :global(h3) {
    font-size: 1.2em;
    margin-top: 1.2em;
  }

  .preview-container :global(a) {
    color: #61afef;
    text-decoration: none;
  }

  .preview-container :global(a:hover) {
    text-decoration: underline;
  }

  .preview-container :global(.wikilink) {
    color: #61afef;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
  }

  .preview-container :global(.tag) {
    color: #98c379;
    background: #2a3a2a;
    padding: 0.1em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .preview-container :global(code) {
    background: #2d2d2d;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: 'JetBrains Mono', monospace;
  }

  .preview-container :global(pre) {
    background: #2d2d2d;
    padding: 1em;
    border-radius: 6px;
    overflow-x: auto;
  }

  .preview-container :global(pre code) {
    background: none;
    padding: 0;
  }

  .preview-container :global(blockquote) {
    border-left: 3px solid #61afef;
    margin-left: 0;
    padding-left: 1em;
    color: #abb2bf;
  }

  .preview-container :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  .preview-container :global(th),
  .preview-container :global(td) {
    border: 1px solid #3e4451;
    padding: 0.5em 0.8em;
    text-align: left;
  }

  .preview-container :global(th) {
    background: #2c313a;
  }

  .preview-container :global(img) {
    max-width: 100%;
    border-radius: 4px;
  }

  .preview-container :global(mark) {
    background: #e5c07b;
    color: #1a1a1a;
    padding: 0.1em 0.2em;
    border-radius: 2px;
  }

  .preview-container :global(input[type='checkbox']) {
    margin-right: 0.5em;
  }

  .preview-container :global(ul),
  .preview-container :global(ol) {
    padding-left: 1.5em;
  }

  .preview-container :global(li) {
    margin: 0.3em 0;
  }

  .preview-container :global(hr) {
    border: none;
    border-top: 1px solid #3e4451;
    margin: 1.5em 0;
  }

  .preview-container :global(.mermaid-diagram) {
    display: flex;
    justify-content: center;
    margin: 1em 0;
    overflow-x: auto;
  }

  .preview-container :global(.mermaid-diagram svg) {
    max-width: 100%;
    height: auto;
  }
</style>
