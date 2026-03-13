<script lang="ts">
  import {
    getGitState,
    gitCommit,
    gitPush,
    gitPull,
    loadGitStatus,
  } from "../stores/git.svelte";

  interface Props {
    vaultPath: string;
  }

  let { vaultPath }: Props = $props();
  const git = getGitState();

  let commitMessage = $state("");

  async function handleCommit() {
    if (!commitMessage.trim()) return;
    await gitCommit(commitMessage, vaultPath);
    commitMessage = "";
  }

  async function handlePush() {
    await gitPush(vaultPath);
  }

  async function handlePull() {
    const result = await gitPull(vaultPath);
    if (result.conflicts.length > 0) {
      alert(`コンフリクト: ${result.conflicts.join(", ")}`);
    }
  }
</script>

<aside class="git-panel">
  <div class="panel-header">
    <span>Git</span>
    <button class="icon-btn" onclick={() => loadGitStatus(vaultPath)}>↻</button>
  </div>

  {#if git.status}
    <div class="branch">
      <span class="label">Branch:</span>
      <span class="value">{git.status.branch}</span>
    </div>

    {#if git.status.staged.length > 0}
      <div class="section">
        <div class="section-title">Staged ({git.status.staged.length})</div>
        {#each git.status.staged as file}
          <div class="file-item staged">{file}</div>
        {/each}
      </div>
    {/if}

    {#if git.status.unstaged.length > 0}
      <div class="section">
        <div class="section-title">Modified ({git.status.unstaged.length})</div>
        {#each git.status.unstaged as file}
          <div class="file-item modified">{file}</div>
        {/each}
      </div>
    {/if}

    {#if git.status.untracked.length > 0}
      <div class="section">
        <div class="section-title">
          Untracked ({git.status.untracked.length})
        </div>
        {#each git.status.untracked as file}
          <div class="file-item untracked">{file}</div>
        {/each}
      </div>
    {/if}

    <div class="actions">
      <input
        bind:value={commitMessage}
        placeholder="Commit message..."
        class="commit-input"
        onkeydown={(e) => e.key === "Enter" && handleCommit()}
      />
      <div class="btn-row">
        <button
          class="action-btn"
          onclick={handleCommit}
          disabled={git.isLoading || !commitMessage.trim()}
        >
          Commit
        </button>
        <button
          class="action-btn"
          onclick={handlePush}
          disabled={git.isLoading}
        >
          Push
        </button>
        <button
          class="action-btn"
          onclick={handlePull}
          disabled={git.isLoading}
        >
          Pull
        </button>
      </div>
    </div>
  {:else}
    <div class="no-git">Git情報を取得できません</div>
  {/if}
</aside>

<style>
  .git-panel {
    width: 280px;
    min-width: 280px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.5px;
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
  }

  .icon-btn:hover {
    color: var(--text-primary);
  }

  .branch {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }

  .label {
    color: var(--text-muted);
  }

  .value {
    color: var(--accent);
    font-family: var(--font-mono);
  }

  .section {
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }

  .section-title {
    padding: 4px 12px;
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  .file-item {
    padding: 2px 12px 2px 20px;
    font-size: 12px;
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-item.staged {
    color: var(--green);
  }
  .file-item.modified {
    color: var(--yellow);
  }
  .file-item.untracked {
    color: var(--text-muted);
  }

  .actions {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .commit-input {
    width: 100%;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 6px 8px;
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--font-mono);
  }

  .btn-row {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    flex: 1;
    padding: 6px 0;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .no-git {
    padding: 16px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
  }
</style>
