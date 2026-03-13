<script lang="ts">
  interface Props {
    onOpen: () => void;
  }

  let { onOpen }: Props = $props();
</script>

<div class="vault-selector">
  <h1>kotonoha</h1>
  <p>Markdown note-taking app</p>
  <button onclick={onOpen}>Vaultフォルダを開く</button>
</div>

<style>
  .vault-selector {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
  }

  h1 {
    font-size: 36px;
    font-weight: 300;
    color: var(--accent);
  }

  p {
    color: var(--text-muted);
    font-size: 14px;
  }

  button {
    margin-top: 16px;
    padding: 10px 24px;
    background: var(--accent);
    color: var(--bg-primary);
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    font-weight: 500;
  }

  button:hover {
    background: var(--accent-hover);
  }
</style>
