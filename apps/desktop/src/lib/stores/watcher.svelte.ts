import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { reloadVault, getVaultState, loadFiles } from "./vault.svelte";
import { getTabsState } from "./tabs.svelte";
import { notifyFileSaved } from "./git.svelte";

interface FsChangeEvent {
  paths: string[];
}

let unlisten: UnlistenFn | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

export async function startWatcher(vaultPath: string): Promise<void> {
  await stopWatcher();

  await invoke("start_watcher", { vaultPath });

  unlisten = await listen<FsChangeEvent>("fs-change", (event) => {
    handleFsChange(event.payload);
  });
}

export async function stopWatcher(): Promise<void> {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  try {
    await invoke("stop_watcher");
  } catch {
    // watcher not started yet
  }
}

function handleFsChange(event: FsChangeEvent) {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    performReload(event.paths);
  }, 300);
}

async function performReload(changedPaths: string[]) {
  const vault = getVaultState();
  const tabsState = getTabsState();

  await loadFiles();

  if (vault.currentFile && changedPaths.includes(vault.currentFile)) {
    const activeTab = tabsState.activeTab;
    if (activeTab?.isDirty) {
      return;
    }
    await reloadVault();
  }

  if (vault.meta) {
    invoke("build_differential_index", { vaultPath: vault.meta.path }).catch(
      () => {},
    );
    // 外部変更（Claude Code等）もauto-backup対象にする
    notifyFileSaved(vault.meta.path);
  }
}
