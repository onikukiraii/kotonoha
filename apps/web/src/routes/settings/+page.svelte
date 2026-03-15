<script lang="ts">
  import { onMount } from 'svelte'
  import { gitState, loadGitStatus, pullFromRemote, commitAndPush, gitLoading } from '$lib/stores/git.js'

  let commitMessage = $state('')
  let statusMessage = $state('')

  onMount(() => {
    loadGitStatus()
  })

  async function handlePull() {
    try {
      const result = await pullFromRemote()
      if (result.conflicts.length > 0) {
        statusMessage = `コンフリクト: ${result.conflicts.join(', ')}`
      } else if (result.updated) {
        statusMessage = 'Pull完了'
      } else {
        statusMessage = '変更なし'
      }
    } catch {
      statusMessage = 'Pull失敗'
    }
    setTimeout(() => (statusMessage = ''), 3000)
  }

  async function handleCommitPush() {
    try {
      await commitAndPush(commitMessage || undefined)
      commitMessage = ''
      statusMessage = 'Commit & Push完了'
    } catch {
      statusMessage = 'Commit & Push失敗'
    }
    setTimeout(() => (statusMessage = ''), 3000)
  }
</script>

<div class="settings">
  <h2>設定</h2>

  <section class="settings-section">
    <h3>Git</h3>

    {#if $gitState}
      <div class="git-status">
        <div class="status-row">
          <span class="label">ブランチ:</span>
          <span class="value">{$gitState.branch}</span>
        </div>
        <div class="status-row">
          <span class="label">Staged:</span>
          <span class="value">{$gitState.staged.length} ファイル</span>
        </div>
        <div class="status-row">
          <span class="label">Unstaged:</span>
          <span class="value">{$gitState.unstaged.length} ファイル</span>
        </div>
        <div class="status-row">
          <span class="label">Untracked:</span>
          <span class="value">{$gitState.untracked.length} ファイル</span>
        </div>
      </div>
    {/if}

    <div class="actions">
      <button onclick={handlePull} disabled={$gitLoading}>
        {$gitLoading ? '処理中...' : 'Pull'}
      </button>

      <div class="commit-form">
        <input
          type="text"
          bind:value={commitMessage}
          placeholder="コミットメッセージ (省略可)"
        />
        <button onclick={handleCommitPush} disabled={$gitLoading}>
          Commit & Push
        </button>
      </div>
    </div>

    {#if statusMessage}
      <p class="status-message">{statusMessage}</p>
    {/if}
  </section>

</div>

<style>
  .settings {
    max-width: 600px;
    margin: 0 auto;
    padding: 1.5rem;
    padding-left: calc(1.5rem + var(--koto-safe-left));
    padding-right: calc(1.5rem + var(--koto-safe-right));
    padding-bottom: calc(1.5rem + var(--koto-safe-bottom) + 48px);
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    color: var(--koto-text-primary);
  }

  h3 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: var(--koto-text-secondary);
  }

  .settings-section {
    background: var(--koto-bg-surface);
    border: 1px solid var(--koto-border);
    border-radius: var(--koto-radius-md);
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .git-status {
    margin-bottom: 1rem;
  }

  .status-row {
    display: flex;
    gap: var(--koto-space-2);
    padding: var(--koto-space-1) 0;
    font-size: var(--koto-font-size-sm);
  }

  .label {
    color: var(--koto-text-muted);
    min-width: 80px;
  }

  .value {
    color: var(--koto-text-primary);
    font-family: var(--koto-font-mono);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--koto-space-2);
  }

  .commit-form {
    display: flex;
    flex-direction: column;
    gap: var(--koto-space-2);
  }

  .commit-form input {
    flex: 1;
    padding: var(--koto-space-2) var(--koto-space-3);
    min-height: var(--koto-touch-min);
    background: var(--koto-bg-input);
    border: 1px solid var(--koto-border);
    border-radius: var(--koto-radius-sm);
    color: var(--koto-text-primary);
    font-size: var(--koto-font-size-base);
    outline: none;
    font-family: var(--koto-font-body);
  }

  .commit-form input:focus {
    border-color: var(--koto-accent-dim);
  }

  button {
    padding: var(--koto-space-2) var(--koto-space-4);
    min-height: var(--koto-touch-min);
    background: var(--koto-bg-hover);
    border: none;
    border-radius: var(--koto-radius-sm);
    color: var(--koto-text-primary);
    cursor: pointer;
    font-size: var(--koto-font-size-base);
    font-family: var(--koto-font-body);
    transition: background var(--koto-transition-fast);
  }

  button:hover:not(:disabled) {
    background: var(--koto-accent-dim);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-message {
    margin-top: var(--koto-space-2);
    font-size: var(--koto-font-size-sm);
    color: var(--koto-success);
  }
</style>
