import { invoke } from "@tauri-apps/api/core";
import type { FileNode, VaultMeta } from "@kotonoha/types";

let vaultMeta = $state<VaultMeta | null>(null);
let fileTree = $state<FileNode[]>([]);
let currentFile = $state<string | null>(null);
let fileContent = $state("");

export function getVaultState() {
  return {
    get meta() {
      return vaultMeta;
    },
    get fileTree() {
      return fileTree;
    },
    get currentFile() {
      return currentFile;
    },
    get fileContent() {
      return fileContent;
    },
  };
}

export async function initVault(): Promise<boolean> {
  try {
    const meta = await invoke<VaultMeta | null>("get_vault");
    if (meta) {
      vaultMeta = meta;
      await loadFiles();
      await buildIndex();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function openVault(path: string): Promise<void> {
  const meta = await invoke<VaultMeta>("open_vault", { path });
  vaultMeta = meta;
  await loadFiles();
  await buildIndex();
}

export async function loadFiles(): Promise<void> {
  if (!vaultMeta) return;
  fileTree = await invoke<FileNode[]>("list_files", {
    vaultPath: vaultMeta.path,
  });
}

async function buildIndex(): Promise<void> {
  if (!vaultMeta) return;
  try {
    await invoke("build_differential_index", { vaultPath: vaultMeta.path });
  } catch {
    // First time: full build
    await invoke("build_index", { vaultPath: vaultMeta.path });
  }
}

export async function openFile(path: string): Promise<void> {
  if (!vaultMeta) return;
  const content = await invoke<string>("read_file", {
    path,
    vaultPath: vaultMeta.path,
  });
  currentFile = path;
  fileContent = content;
}

export async function saveFile(
  path: string,
  content: string,
): Promise<number> {
  if (!vaultMeta) return 0;
  const mtime = await invoke<number>("write_file", {
    path,
    content,
    vaultPath: vaultMeta.path,
  });
  fileContent = content;
  // Update index in background
  invoke("update_file_index", {
    path,
    content,
    vaultPath: vaultMeta.path,
  }).catch(() => {});
  return mtime;
}

export async function createNewFile(path: string): Promise<void> {
  if (!vaultMeta) return;
  await invoke("create_file", { path, vaultPath: vaultMeta.path });
  await loadFiles();
  const { openTab } = await import("./tabs.svelte");
  await openTab(path);
}

export async function deleteCurrentFile(path: string): Promise<void> {
  if (!vaultMeta) return;
  await invoke("delete_file", { path, vaultPath: vaultMeta.path });
  // Close the tab for the deleted file
  const { closeTabByPath } = await import("./tabs.svelte");
  closeTabByPath(path);
  if (currentFile === path) {
    currentFile = null;
    fileContent = "";
  }
  await loadFiles();
}

export async function renameCurrentFile(
  from: string,
  to: string,
): Promise<void> {
  if (!vaultMeta) return;
  await invoke("rename_file", { from, to, vaultPath: vaultMeta.path });
  // Update the tab for the renamed file
  const { renameTab } = await import("./tabs.svelte");
  renameTab(from, to);
  if (currentFile === from) {
    currentFile = to;
  }
  await loadFiles();
}

export async function openDailyNote(): Promise<string | null> {
  if (!vaultMeta) return null;
  const { path, created } = await invoke<{ path: string; created: boolean }>(
    "ensure_daily_note",
    { vaultPath: vaultMeta.path },
  );
  if (created) await loadFiles();
  return path;
}
