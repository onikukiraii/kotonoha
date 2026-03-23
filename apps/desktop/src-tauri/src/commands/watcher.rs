use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

static WATCHER: Lazy<Mutex<Option<Debouncer<notify::RecommendedWatcher>>>> =
    Lazy::new(|| Mutex::new(None));

static SELF_WRITES: Lazy<Mutex<HashMap<PathBuf, Instant>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize, Clone)]
pub struct FsChangeEvent {
    pub paths: Vec<String>,
}

/// Record a path as written by this app (called from fs commands)
pub fn mark_self_write(path: PathBuf) {
    if let Ok(mut writes) = SELF_WRITES.lock() {
        writes.insert(path, Instant::now());
        // Clean up old entries (>5s)
        writes.retain(|_, t| t.elapsed() < Duration::from_secs(5));
    }
}

fn is_self_write(path: &PathBuf) -> bool {
    if let Ok(writes) = SELF_WRITES.lock() {
        writes
            .get(path)
            .map_or(false, |t| t.elapsed() < Duration::from_secs(2))
    } else {
        false
    }
}

fn should_ignore(rel: &str, path: &PathBuf) -> bool {
    if rel.starts_with(".git/") || rel.starts_with(".git\\") || rel == ".git" {
        return true;
    }
    if rel.starts_with(".kotonoha") {
        return true;
    }
    if rel.starts_with('.') {
        return true;
    }
    // Allow directories (new folder with .md files inside)
    if path.is_dir() {
        return false;
    }
    // Only watch .md files
    path.extension().map_or(true, |ext| ext != "md")
}

fn stop_watcher_internal() -> Result<(), String> {
    let mut w = WATCHER.lock().map_err(|e| e.to_string())?;
    *w = None;
    Ok(())
}

#[tauri::command]
pub fn start_watcher(vault_path: String, app: AppHandle) -> Result<(), String> {
    stop_watcher_internal()?;

    let vault = PathBuf::from(&vault_path);
    let vault_clone = vault.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            let Ok(events) = events else { return };

            let mut changed_paths: Vec<String> = Vec::new();

            for event in events {
                let path = &event.path;

                let rel = match path.strip_prefix(&vault_clone) {
                    Ok(r) => r.to_string_lossy().to_string(),
                    Err(_) => continue,
                };

                if should_ignore(&rel, path) {
                    continue;
                }
                if is_self_write(path) {
                    continue;
                }

                changed_paths.push(rel);
            }

            if changed_paths.is_empty() {
                return;
            }

            changed_paths.sort();
            changed_paths.dedup();

            let payload = FsChangeEvent {
                paths: changed_paths,
            };

            let _ = app.emit("fs-change", &payload);
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(vault.as_ref(), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut w = WATCHER.lock().map_err(|e| e.to_string())?;
    *w = Some(debouncer);

    Ok(())
}

#[tauri::command]
pub fn stop_watcher() -> Result<(), String> {
    stop_watcher_internal()
}
