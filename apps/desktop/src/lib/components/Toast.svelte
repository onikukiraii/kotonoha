<script lang="ts">
  import { getToastState } from "../stores/toast.svelte";

  const toast = getToastState();
</script>

{#if toast.visible}
  <div class="toast" role="status" aria-live="polite">
    {toast.message}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    right: 16px;
    bottom: calc(var(--statusbar-height) + 12px);
    padding: 6px 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    animation: toast-fade 0.18s ease-out;
    z-index: 9999;
  }

  @keyframes toast-fade {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
