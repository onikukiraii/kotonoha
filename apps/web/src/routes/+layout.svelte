<script lang="ts">
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'
  import { startStatusPolling, stopStatusPolling } from '$lib/stores/git.js'
  import '@kotonoha/ui/theme.css'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
  let lastScrollY = 0
  let headerHidden = $state(false)

  onMount(() => {
    startStatusPolling()
    return () => {
      stopStatusPolling()
    }
  })

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement
    const currentY = target.scrollTop ?? 0
    if (currentY > lastScrollY && currentY > 44) {
      headerHidden = true
    } else {
      headerHidden = false
    }
    lastScrollY = currentY
  }
</script>

<div class="app">
  <header class="app-header" class:header-hidden={headerHidden}>
    <div class="header-left">
      <a href="/" class="logo">kotonoha</a>
    </div>
    <div class="header-right">
      <a href="/settings" class="header-btn" title="設定">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      </a>
    </div>
  </header>

  <main class="app-main" onscroll={handleScroll}>
    {@render children()}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--koto-bg-base);
    color: var(--koto-text-primary);
    font-family: var(--koto-font-body);
    -webkit-font-smoothing: antialiased;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    padding-top: var(--koto-safe-top);
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--koto-space-3);
    height: 36px;
    background: var(--koto-bg-surface);
    border-bottom: 1px solid var(--koto-border);
    flex-shrink: 0;
    transition: transform var(--koto-transition-normal);
    z-index: 10;
  }

  .app-header.header-hidden {
    transform: translateY(-100%);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--koto-space-3);
  }

  .logo {
    font-size: var(--koto-font-size-base);
    font-weight: 700;
    color: var(--koto-accent);
    text-decoration: none;
    letter-spacing: -0.5px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--koto-space-3);
  }

  .header-btn {
    color: var(--koto-text-muted);
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--koto-touch-min);
    min-height: var(--koto-touch-min);
    border-radius: var(--koto-radius-sm);
    transition: background var(--koto-transition-fast), color var(--koto-transition-fast);
  }

  .header-btn:hover {
    background: var(--koto-bg-hover);
    color: var(--koto-text-primary);
  }

  .app-main {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
