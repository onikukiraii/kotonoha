import { invoke } from "@tauri-apps/api/core";

interface GitStatus {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

interface PullResult {
  updated: boolean;
  conflicts: string[];
}

let gitStatus = $state<GitStatus | null>(null);
let isLoading = $state(false);
let isSyncing = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let backupInterval: ReturnType<typeof setInterval> | null = null;
let pullInterval: ReturnType<typeof setInterval> | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

export function getGitState() {
  return {
    get status() {
      return gitStatus;
    },
    get isLoading() {
      return isLoading;
    },
    get changeCount() {
      if (!gitStatus) return 0;
      return (
        gitStatus.staged.length +
        gitStatus.unstaged.length +
        gitStatus.untracked.length
      );
    },
  };
}

export async function loadGitStatus(vaultPath: string): Promise<void> {
  try {
    gitStatus = await invoke<GitStatus>("git_status", { vaultPath });
  } catch {
    gitStatus = null;
  }
}

export async function gitCommit(
  message: string,
  vaultPath: string,
): Promise<string> {
  isLoading = true;
  try {
    const hash = await invoke<string>("git_commit", { message, vaultPath });
    await loadGitStatus(vaultPath);
    return hash;
  } finally {
    isLoading = false;
  }
}

export async function gitPush(vaultPath: string): Promise<void> {
  isLoading = true;
  try {
    await invoke("git_push", { vaultPath });
    await loadGitStatus(vaultPath);
  } finally {
    isLoading = false;
  }
}

export async function gitPull(vaultPath: string): Promise<PullResult> {
  isLoading = true;
  try {
    const result = await invoke<PullResult>("git_pull", { vaultPath });
    await loadGitStatus(vaultPath);
    return result;
  } finally {
    isLoading = false;
  }
}

async function autoBackup(vaultPath: string): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const status = await invoke<GitStatus>("git_status", { vaultPath });
    const hasChanges =
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0;

    if (!hasChanges) return;

    // Pull first to incorporate remote changes before committing
    // (works because uncommitted changes are in the working tree, not staged)
    try {
      await invoke("git_pull", { vaultPath });
    } catch (err) {
      console.warn("[git] auto-backup pull failed:", err);
    }

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const message = `backup ${ts}`;

    await invoke<string>("git_commit", { message, vaultPath });

    try {
      await invoke("git_push", { vaultPath });
    } catch (err) {
      console.warn("[git] auto-backup push failed:", err);
    }

    await loadGitStatus(vaultPath);
  } catch {
    // auto-backup failure should not disrupt the app
  } finally {
    isSyncing = false;
  }
}

async function autoPull(vaultPath: string): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const result = await invoke<PullResult>("git_pull", { vaultPath });
    if (result.updated) {
      await loadGitStatus(vaultPath);
    }
  } catch {
    // periodic pull failure should not disrupt the app
  } finally {
    isSyncing = false;
  }
}

/** ファイル保存後に呼び出し、30秒デバウンスでcommit→pull→pushをトリガーする */
export function notifyFileSaved(vaultPath: string): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    autoBackup(vaultPath);
  }, 30000);
}

export function startGitPolling(vaultPath: string): void {
  stopGitPolling();
  loadGitStatus(vaultPath);
  // Status check every 30s
  pollInterval = setInterval(() => loadGitStatus(vaultPath), 30000);
  // Auto-backup every 5 minutes (safety net)
  backupInterval = setInterval(() => autoBackup(vaultPath), 300000);
  // Auto-pull every 60s to keep up with remote changes
  pullInterval = setInterval(() => autoPull(vaultPath), 60000);
}

export function stopGitPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
  if (pullInterval) {
    clearInterval(pullInterval);
    pullInterval = null;
  }
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}
