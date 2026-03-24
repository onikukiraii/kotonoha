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
let pollInterval: ReturnType<typeof setInterval> | null = null;
let backupInterval: ReturnType<typeof setInterval> | null = null;

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
  try {
    const status = await invoke<GitStatus>("git_status", { vaultPath });
    const hasChanges =
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0;

    if (!hasChanges) return;

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
  }
}

export function startGitPolling(vaultPath: string): void {
  stopGitPolling();
  loadGitStatus(vaultPath);
  // Status check every 30s, auto-backup every 5 minutes
  pollInterval = setInterval(() => loadGitStatus(vaultPath), 30000);
  backupInterval = setInterval(() => autoBackup(vaultPath), 300000);
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
}
