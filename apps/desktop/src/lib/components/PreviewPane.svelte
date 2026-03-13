<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import DOMPurify from "dompurify";

  interface Props {
    content: string;
    vaultPath: string;
    cursorLine?: number;
    onWikilinkClick: (target: string) => void;
  }

  let { content, vaultPath, cursorLine = 0, onWikilinkClick }: Props = $props();

  let renderedHtml = $state("");
  let previewElement: HTMLDivElement;

  $effect(() => {
    if (content !== undefined) {
      renderContent(content);
    }
  });

  async function renderMermaidBlocks() {
    if (!previewElement) return;
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: "dark" });

    const mermaidBlocks = previewElement.querySelectorAll(
      "pre > code.language-mermaid",
    );
    for (const block of mermaidBlocks) {
      const pre = block.parentElement!;
      const source = block.textContent || "";
      const id = `mermaid-${crypto.randomUUID()}`;
      try {
        const { svg } = await mermaid.render(id, source);
        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-diagram";
        wrapper.innerHTML = svg;
        pre.replaceWith(wrapper);
      } catch {
        // Keep the original code block on error
      }
    }
  }

  $effect(() => {
    if (previewElement && renderedHtml) {
      renderMermaidBlocks();
    }
  });

  async function renderContent(md: string) {
    try {
      const html = await invoke<string>("render_markdown", {
        content: md,
        vaultPath,
      });
      renderedHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ["mark"],
        ADD_ATTR: ["data-target", "data-source-line", "class"],
      });
    } catch {
      renderedHtml = "<p>Render error</p>";
    }
  }

  let scrollTimer: ReturnType<typeof setTimeout> | null = null;

  function scrollToLine(line: number) {
    if (!previewElement) return;
    const elements = previewElement.querySelectorAll("[data-source-line]");
    let target: Element | null = null;
    for (const el of elements) {
      const elLine = parseInt(el.getAttribute("data-source-line") || "0");
      if (elLine <= line) {
        target = el;
      } else {
        break;
      }
    }
    if (target) {
      target.scrollIntoView({ behavior: "instant", block: "center" });
    }
  }

  $effect(() => {
    if (!cursorLine) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => scrollToLine(cursorLine), 100);
  });

  function handleClick(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest(
      'a.wikilink',
    ) as HTMLElement | null;
    if (target) {
      e.preventDefault();
      const wikilinkTarget = target.getAttribute("data-target");
      if (wikilinkTarget) {
        onWikilinkClick(wikilinkTarget);
      }
    }
  }
</script>

<div class="preview-container">
  <div class="preview-header">
    <span>Preview</span>
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="preview-content"
    bind:this={previewElement}
    onclick={handleClick}
  >
    {@html renderedHtml}
  </div>
</div>

<style>
  .preview-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .preview-header {
    padding: 6px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
  }

  .preview-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    font-family: var(--font-sans);
    line-height: 1.7;
  }

  .preview-content :global(h1) {
    font-size: 1.8em;
    margin-bottom: 0.5em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--border);
  }
  .preview-content :global(h2) {
    font-size: 1.4em;
    margin: 1em 0 0.5em;
  }
  .preview-content :global(h3) {
    font-size: 1.2em;
    margin: 0.8em 0 0.4em;
  }
  .preview-content :global(p) {
    margin-bottom: 0.8em;
  }
  .preview-content :global(a.wikilink) {
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .preview-content :global(a.wikilink:hover) {
    color: var(--accent-hover);
  }
  .preview-content :global(.tag) {
    color: var(--peach);
    font-size: 0.9em;
  }
  .preview-content :global(code) {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }
  .preview-content :global(pre) {
    background: var(--bg-secondary);
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin-bottom: 1em;
  }
  .preview-content :global(pre code) {
    background: none;
    padding: 0;
  }
  .preview-content :global(blockquote) {
    border-left: 3px solid var(--accent);
    padding-left: 16px;
    color: var(--text-secondary);
    margin-bottom: 1em;
  }
  .preview-content :global(ul),
  .preview-content :global(ol) {
    padding-left: 24px;
    margin-bottom: 1em;
  }
  .preview-content :global(li) {
    margin-bottom: 0.3em;
  }
  .preview-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 1em;
  }
  .preview-content :global(th),
  .preview-content :global(td) {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
  }
  .preview-content :global(th) {
    background: var(--bg-tertiary);
  }
  .preview-content :global(input[type="checkbox"]) {
    margin-right: 6px;
  }
  .preview-content :global(mark) {
    background: rgba(249, 226, 175, 0.3);
    color: var(--text-primary);
    padding: 1px 3px;
    border-radius: 2px;
  }
  .preview-content :global(.mermaid-diagram) {
    display: flex;
    justify-content: center;
    margin: 1em 0;
    overflow-x: auto;
  }
  .preview-content :global(.mermaid-diagram svg) {
    max-width: 100%;
    height: auto;
  }
</style>
