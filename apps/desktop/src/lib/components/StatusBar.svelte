<script lang="ts">
  import { getGitState } from "../stores/git.svelte";
  import { getEditorState } from "../stores/editor.svelte";

  interface Props {
    vaultPath: string;
  }

  let { vaultPath }: Props = $props();
  const git = getGitState();
  const editor = getEditorState();
</script>

<footer class="statusbar">
  <div class="left">
    {#if git.status}
      <span class="git-info">
        {git.status.branch}
        {#if git.changeCount > 0}
          <span class="changes">+{git.changeCount}</span>
        {/if}
      </span>
    {/if}
  </div>
  <div class="right">
    <span class="hint">⌘O 検索</span>
    <span class="hint">⌘P プレビュー</span>
    <span class="hint">⌘\ サイドバー</span>
  </div>
</footer>

<style>
  .statusbar {
    height: var(--statusbar-height);
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .git-info {
    font-family: var(--font-mono);
  }

  .changes {
    color: var(--yellow);
  }

  .hint {
    font-family: var(--font-mono);
  }
</style>
