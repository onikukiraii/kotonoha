use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct VaultMeta {
    pub path: String,
    pub name: String,
    pub file_count: u32,
}

#[derive(Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
    pub updated_at: Option<u64>,
}

fn resolve_safe_path(vault_path: &str, requested: &str) -> Result<PathBuf, String> {
    let vault = fs::canonicalize(vault_path).map_err(|e| e.to_string())?;
    let resolved = vault.join(requested);
    let canonical = if resolved.exists() {
        fs::canonicalize(&resolved).map_err(|e| e.to_string())?
    } else {
        // For new files, walk up to find the nearest existing ancestor and
        // resolve the remaining components relative to it. This handles cases
        // where multiple levels of parent directories don't exist yet (e.g.
        // 00_daily/2026/04/2026-04-01.md when the "04" directory is new).
        let mut ancestor = resolved.as_path();
        let mut missing: Vec<&std::ffi::OsStr> = Vec::new();
        loop {
            if let Some(parent) = ancestor.parent() {
                missing.push(
                    ancestor
                        .file_name()
                        .ok_or("Invalid path component")?,
                );
                if parent.exists() {
                    let canonical_ancestor =
                        fs::canonicalize(parent).map_err(|e| e.to_string())?;
                    let mut result = canonical_ancestor;
                    for component in missing.iter().rev() {
                        result = result.join(component);
                    }
                    break result;
                }
                ancestor = parent;
            } else {
                return Err("No existing ancestor directory found".to_string());
            }
        }
    };

    if !canonical.starts_with(&vault) {
        return Err("Path traversal detected".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
pub fn open_vault(path: String, app: AppHandle) -> Result<VaultMeta, String> {
    let vault_path = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !vault_path.is_dir() {
        return Err("Not a directory".to_string());
    }

    let file_count = WalkDir::new(&vault_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map_or(false, |ext| ext == "md" || ext == "base")
        })
        .count() as u32;

    let name = vault_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let meta = VaultMeta {
        path: vault_path.to_string_lossy().to_string(),
        name,
        file_count,
    };

    // Store vault path
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("vault_path", serde_json::json!(meta.path));

    // Initialize DB
    crate::db::init_db(&meta.path)?;

    Ok(meta)
}

#[tauri::command]
pub fn get_vault(app: AppHandle) -> Result<Option<VaultMeta>, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;

    match store.get("vault_path") {
        Some(val) => {
            let path = val.as_str().ok_or("Invalid vault path")?.to_string();
            let vault_path = PathBuf::from(&path);
            if !vault_path.is_dir() {
                return Ok(None);
            }

            let file_count = WalkDir::new(&vault_path)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
            e.path()
                .extension()
                .map_or(false, |ext| ext == "md" || ext == "base")
        })
                .count() as u32;

            let name = vault_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Initialize DB
            crate::db::init_db(&path)?;

            Ok(Some(VaultMeta {
                path,
                name,
                file_count,
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn list_files(vault_path: String) -> Result<Vec<FileNode>, String> {
    fn build_tree(dir: &Path, vault_root: &Path) -> Result<Vec<FileNode>, String> {
        let mut nodes = Vec::new();
        let mut entries: Vec<_> = fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
            .collect();

        entries.sort_by(|a, b| {
            let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
            match (a_dir, b_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.file_name().cmp(&b.file_name()),
            }
        });

        for entry in entries {
            let path = entry.path();
            let relative = path
                .strip_prefix(vault_root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            let name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                let children = build_tree(&path, vault_root)?;
                if !children.is_empty() {
                    nodes.push(FileNode {
                        name,
                        path: relative,
                        is_dir: true,
                        children: Some(children),
                        updated_at: None,
                    });
                }
            } else if path
                .extension()
                .map_or(false, |ext| ext == "md" || ext == "base")
            {
                let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                let updated_at = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64);

                nodes.push(FileNode {
                    name,
                    path: relative,
                    is_dir: false,
                    children: None,
                    updated_at,
                });
            }
        }
        Ok(nodes)
    }

    let vault = PathBuf::from(&vault_path);
    build_tree(&vault, &vault)
}

#[tauri::command]
pub fn read_file(path: String, vault_path: String) -> Result<String, String> {
    let abs_path = resolve_safe_path(&vault_path, &path)?;
    fs::read_to_string(&abs_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String, vault_path: String) -> Result<u64, String> {
    let abs_path = resolve_safe_path(&vault_path, &path)?;
    super::watcher::mark_self_write(abs_path.clone());
    if let Some(parent) = abs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs_path, &content).map_err(|e| e.to_string())?;

    let metadata = fs::metadata(&abs_path).map_err(|e| e.to_string())?;
    let mtime = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    Ok(mtime)
}

#[tauri::command]
pub fn create_file(
    path: String,
    vault_path: String,
    content: Option<String>,
) -> Result<(), String> {
    let abs_path = resolve_safe_path(&vault_path, &path)?;
    super::watcher::mark_self_write(abs_path.clone());
    if let Some(parent) = abs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs_path, content.unwrap_or_default()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_file(path: String, vault_path: String) -> Result<(), String> {
    let abs_path = resolve_safe_path(&vault_path, &path)?;
    super::watcher::mark_self_write(abs_path.clone());
    fs::remove_file(&abs_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_file(from: String, to: String, vault_path: String) -> Result<(), String> {
    let abs_from = resolve_safe_path(&vault_path, &from)?;
    let abs_to = resolve_safe_path(&vault_path, &to)?;
    super::watcher::mark_self_write(abs_from.clone());
    super::watcher::mark_self_write(abs_to.clone());
    if let Some(parent) = abs_to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&abs_from, &abs_to).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
pub struct DailyNoteResult {
    pub path: String,
    pub created: bool,
}

const DAILY_TEMPLATE: &str = "\n\n\n# 疑問\n\n## MNTSQ関連の疑問\n- [ ] \n## IT系の疑問\n- [ ] \n## その他疑問\n- [ ] \n\n# 学び\n- \n# 考えたこと\n- \n\n# 読書ログ\n- \n\n# フロントエンド積み上げ\n\n\n# やったこと\n- ";

#[tauri::command]
pub fn ensure_daily_note(vault_path: String) -> Result<DailyNoteResult, String> {
    let now = chrono::Local::now();
    let path = format!(
        "00_daily/{}/{}/{}.md",
        now.format("%Y"),
        now.format("%m"),
        now.format("%Y-%m-%d")
    );
    let abs_path = resolve_safe_path(&vault_path, &path)?;

    if abs_path.exists() {
        return Ok(DailyNoteResult {
            path,
            created: false,
        });
    }

    super::watcher::mark_self_write(abs_path.clone());
    if let Some(parent) = abs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs_path, DAILY_TEMPLATE).map_err(|e| e.to_string())?;

    Ok(DailyNoteResult {
        path,
        created: true,
    })
}

#[tauri::command]
pub fn list_subdirs(dir_path: String, vault_path: String) -> Result<Vec<String>, String> {
    let abs_path = resolve_safe_path(&vault_path, &dir_path)?;
    if !abs_path.exists() {
        return Ok(Vec::new());
    }
    let mut dirs = Vec::new();
    for entry in fs::read_dir(&abs_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') {
                dirs.push(name);
            }
        }
    }
    dirs.sort();
    Ok(dirs)
}
