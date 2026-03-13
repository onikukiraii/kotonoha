<script lang="ts">
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'
  import { gitState, startStatusPolling, stopStatusPolling } from '$lib/stores/git.js'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()

  onMount(() => {
    startStatusPolling()
    return () => stopStatusPolling()
  })
</script>

<div class="app">
  <header class="app-header">
    <div class="header-left">
      <a href="/" class="logo">kotonoha</a>
    </div>
    <div class="header-right">
      {#if $gitState}
        <span class="git-info">
          [{$gitState.branch}]
          {#if $gitState.staged.length + $gitState.unstaged.length + $gitState.untracked.length > 0}
            <span class="git-changes">+{$gitState.staged.length + $gitState.unstaged.length + $gitState.untracked.length}</span>
          {/if}
        </span>
      {/if}
      <a href="/settings" class="header-btn" title="設定">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      </a>
    </div>
  </header>

  <main class="app-main">
    {@render children()}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #1a1a1a;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    height: 44px;
    background: #252526;
    border-bottom: 1px solid #3e4451;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    font-size: 16px;
    font-weight: 700;
    color: #e0e0e0;
    text-decoration: none;
    letter-spacing: -0.5px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .git-info {
    font-size: 12px;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
  }

  .git-changes {
    color: #e5c07b;
  }

  .header-btn {
    color: #888;
    text-decoration: none;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
  }

  .header-btn:hover {
    background: #3e4451;
    color: #e0e0e0;
  }

  .app-main {
    flex: 1;
    overflow: hidden;
  }
</style>
