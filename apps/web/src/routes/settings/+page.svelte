<script lang="ts">
  import { onMount } from 'svelte'
  import { gitState, loadGitStatus, pullFromRemote, commitAndPush, gitLoading } from '$lib/stores/git.js'
  import { logout } from '$lib/api.js'

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

  <section class="settings-section">
    <h3>アカウント</h3>
    <button class="logout-btn" onclick={logout}>ログアウト</button>
  </section>
</div>

<style>
  .settings {
    max-width: 600px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
  }

  h3 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: #ccc;
  }

  .settings-section {
    background: #252526;
    border: 1px solid #3e4451;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .git-status {
    margin-bottom: 1rem;
  }

  .status-row {
    display: flex;
    gap: 8px;
    padding: 4px 0;
    font-size: 13px;
  }

  .label {
    color: #888;
    min-width: 80px;
  }

  .value {
    color: #e0e0e0;
    font-family: 'JetBrains Mono', monospace;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .commit-form {
    display: flex;
    gap: 8px;
  }

  .commit-form input {
    flex: 1;
    padding: 8px 12px;
    background: #1a1a1a;
    border: 1px solid #3e4451;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 13px;
    outline: none;
  }

  button {
    padding: 8px 16px;
    background: #3e4451;
    border: none;
    border-radius: 4px;
    color: #e0e0e0;
    cursor: pointer;
    font-size: 13px;
  }

  button:hover:not(:disabled) {
    background: #4e5561;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .logout-btn {
    background: #e06c75;
    color: white;
  }

  .logout-btn:hover {
    background: #c75a63;
  }

  .status-message {
    margin-top: 8px;
    font-size: 13px;
    color: #98c379;
  }
</style>
