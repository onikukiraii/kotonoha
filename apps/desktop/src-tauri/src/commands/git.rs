use git2::{Cred, FetchOptions, RemoteCallbacks, Repository, Signature, StatusOptions};
use once_cell::sync::Lazy;
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use std::fs;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

static GIT_MUTEX: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Serialize, Clone)]
pub struct GitStatusResult {
    pub branch: String,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct PullResult {
    pub updated: bool,
    pub conflicts: Vec<String>,
}

fn get_git_credentials(app: &AppHandle) -> Option<(String, String)> {
    let store = app.store("settings.json").ok()?;
    let repo_url = store.get("github_repo_url")?.as_str()?.to_string();
    let pat = store.get("github_pat")?.as_str()?.to_string();
    Some((repo_url, pat))
}

/// 競合マーカーを除去して両方の内容を結合する
/// Web版 git.ts の resolveConflictMarkers と同じロジック
fn resolve_conflict_markers(content: &str) -> String {
    let mut result = Vec::new();
    let mut in_conflict = false;

    for line in content.lines() {
        if line.starts_with("<<<<<<<") {
            in_conflict = true;
            continue;
        }
        if line.starts_with("=======") && in_conflict {
            continue;
        }
        if line.starts_with(">>>>>>>") && in_conflict {
            in_conflict = false;
            continue;
        }
        result.push(line);
    }

    result.join("\n")
}

/// 競合ファイルを自動解決（両方の内容を保持）してマージコミットを作成する
fn resolve_conflicts_and_commit(
    repo: &Repository,
    vault_path: &str,
    fetch_commit: &git2::Commit,
) -> Result<Vec<String>, String> {
    let index = repo.index().map_err(|e| e.to_string())?;
    let conflict_paths: Vec<String> = index
        .conflicts()
        .map_err(|e| e.to_string())?
        .filter_map(|c| c.ok())
        .filter_map(|c| {
            c.our
                .map(|entry| String::from_utf8_lossy(&entry.path).to_string())
        })
        .collect();

    if conflict_paths.is_empty() {
        return Ok(vec![]);
    }

    let mut index = repo.index().map_err(|e| e.to_string())?;

    for file_path in &conflict_paths {
        let abs_path = Path::new(vault_path).join(file_path);
        if abs_path.exists() {
            let content = fs::read_to_string(&abs_path).map_err(|e| e.to_string())?;
            let resolved = resolve_conflict_markers(&content);
            fs::write(&abs_path, &resolved).map_err(|e| e.to_string())?;
        }
        index
            .add_path(Path::new(file_path))
            .map_err(|e| e.to_string())?;
    }

    index.write().map_err(|e| e.to_string())?;

    // Create merge commit with two parents
    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;
    let sig = Signature::now("kotonoha", "kotonoha@local").map_err(|e| e.to_string())?;
    let head_commit = repo
        .head()
        .map_err(|e| e.to_string())?
        .peel_to_commit()
        .map_err(|e| e.to_string())?;

    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        "auto: resolve merge conflicts (keep both changes)",
        &tree,
        &[&head_commit, fetch_commit],
    )
    .map_err(|e| e.to_string())?;

    repo.cleanup_state().map_err(|e| e.to_string())?;

    Ok(conflict_paths)
}

/// merge/rebase途中の状態が残っていたらクリーンアップする
fn cleanup_incomplete_state(vault_path: &str) {
    let git_dir = Path::new(vault_path).join(".git");

    // Abort incomplete rebase
    if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        if let Ok(repo) = Repository::open(vault_path) {
            let _ = repo.cleanup_state();
            // Reset index to HEAD
            if let Ok(head) = repo.head().and_then(|h| h.peel_to_tree()) {
                let _ = repo.reset(
                    head.as_object(),
                    git2::ResetType::Mixed,
                    None,
                );
            }
        }
    }

    // Abort incomplete merge
    if git_dir.join("MERGE_HEAD").exists() {
        // Remove MERGE_HEAD to abort the merge
        let _ = fs::remove_file(git_dir.join("MERGE_HEAD"));
        if let Ok(repo) = Repository::open(vault_path) {
            let _ = repo.cleanup_state();
            // Reset index to HEAD
            if let Ok(head) = repo.head().and_then(|h| h.peel_to_tree()) {
                let _ = repo.reset(
                    head.as_object(),
                    git2::ResetType::Mixed,
                    None,
                );
            }
        }
    }
}

fn make_fetch_options<'a>(pat: &'a str) -> FetchOptions<'a> {
    let mut callbacks = RemoteCallbacks::new();
    let pat_owned = pat.to_string();
    callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
        Cred::userpass_plaintext("x-access-token", &pat_owned)
    });
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    fetch_options
}

#[tauri::command]
pub fn git_status(vault_path: String) -> Result<GitStatusResult, String> {
    let _lock = GIT_MUTEX.lock().map_err(|e| e.to_string())?;

    let repo = Repository::open(&vault_path).map_err(|e| e.to_string())?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());

    let mut opts = StatusOptions::new();
    opts.include_untracked(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED,
        ) {
            staged.push(path.clone());
        }

        if status.intersects(
            git2::Status::WT_MODIFIED | git2::Status::WT_DELETED | git2::Status::WT_RENAMED,
        ) {
            unstaged.push(path.clone());
        }

        if status.contains(git2::Status::WT_NEW) {
            untracked.push(path);
        }
    }

    Ok(GitStatusResult {
        branch,
        staged,
        unstaged,
        untracked,
    })
}

#[tauri::command]
pub fn git_commit(message: String, vault_path: String) -> Result<String, String> {
    let _lock = GIT_MUTEX.lock().map_err(|e| e.to_string())?;

    let repo = Repository::open(&vault_path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;

    // Add all changes
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;

    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;

    let sig = Signature::now("kotonoha", "kotonoha@local").map_err(|e| e.to_string())?;

    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

    let parents: Vec<&git2::Commit> = parent.as_ref().map(|p| vec![p]).unwrap_or_default();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;

    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_push(vault_path: String, app: AppHandle) -> Result<(), String> {
    let _lock = GIT_MUTEX.lock().map_err(|e| e.to_string())?;

    let (_repo_url, pat) = get_git_credentials(&app).ok_or("Git credentials not configured")?;

    let repo = Repository::open(&vault_path).map_err(|e| e.to_string())?;
    let mut remote = repo.find_remote("origin").map_err(|e| e.to_string())?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "main".to_string());

    let mut callbacks = RemoteCallbacks::new();
    let pat_clone = pat.clone();
    callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
        Cred::userpass_plaintext("x-access-token", &pat_clone)
    });

    let mut push_options = git2::PushOptions::new();
    push_options.remote_callbacks(callbacks);

    remote
        .push(
            &[&format!("refs/heads/{}", branch)],
            Some(&mut push_options),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn git_pull(vault_path: String, app: AppHandle) -> Result<PullResult, String> {
    let _lock = GIT_MUTEX.lock().map_err(|e| e.to_string())?;

    // Clean up incomplete merge/rebase state from previous sessions
    cleanup_incomplete_state(&vault_path);

    let (_repo_url, pat) = get_git_credentials(&app).ok_or("Git credentials not configured")?;

    let repo = Repository::open(&vault_path).map_err(|e| e.to_string())?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "main".to_string());

    // Fetch
    let mut remote = repo.find_remote("origin").map_err(|e| e.to_string())?;
    let mut fetch_options = make_fetch_options(&pat);

    remote
        .fetch(&[&branch], Some(&mut fetch_options), None)
        .map_err(|e| e.to_string())?;

    // Get fetch head
    let fetch_head = repo
        .find_reference("FETCH_HEAD")
        .map_err(|e| e.to_string())?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(|e| e.to_string())?;

    // Merge analysis
    let (analysis, _preference) = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|e| e.to_string())?;

    if analysis.is_up_to_date() {
        return Ok(PullResult {
            updated: false,
            conflicts: vec![],
        });
    }

    if analysis.is_fast_forward() {
        // Fast-forward
        let refname = format!("refs/heads/{}", branch);
        let mut reference = repo.find_reference(&refname).map_err(|e| e.to_string())?;
        reference
            .set_target(fetch_commit.id(), "Fast-forward pull")
            .map_err(|e| e.to_string())?;
        repo.set_head(&refname).map_err(|e| e.to_string())?;
        repo.checkout_head(Some(
            git2::build::CheckoutBuilder::default()
                .safe()
                .allow_conflicts(true),
        ))
        .map_err(|e| e.to_string())?;

        return Ok(PullResult {
            updated: true,
            conflicts: vec![],
        });
    }

    // Normal merge
    let fetch_commit_obj = repo
        .find_commit(fetch_commit.id())
        .map_err(|e| e.to_string())?;
    repo.merge(&[&fetch_commit], None, None)
        .map_err(|e| e.to_string())?;

    // Check for conflicts and auto-resolve
    let index = repo.index().map_err(|e| e.to_string())?;
    if index.has_conflicts() {
        drop(index); // Release index before resolve_conflicts_and_commit re-acquires it
        let resolved = resolve_conflicts_and_commit(&repo, &vault_path, &fetch_commit_obj)?;
        if !resolved.is_empty() {
            eprintln!("[git] auto-resolved conflicts in: {:?}", resolved);
        }
        return Ok(PullResult {
            updated: true,
            conflicts: vec![],
        });
    }

    // Auto-commit the merge (no conflicts)
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;
    let sig = Signature::now("kotonoha", "kotonoha@local").map_err(|e| e.to_string())?;
    let head_commit = repo
        .head()
        .map_err(|e| e.to_string())?
        .peel_to_commit()
        .map_err(|e| e.to_string())?;

    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        "Merge remote changes",
        &tree,
        &[&head_commit, &fetch_commit_obj],
    )
    .map_err(|e| e.to_string())?;

    repo.cleanup_state().map_err(|e| e.to_string())?;

    Ok(PullResult {
        updated: true,
        conflicts: vec![],
    })
}
