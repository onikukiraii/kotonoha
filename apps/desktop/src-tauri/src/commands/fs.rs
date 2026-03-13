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
        // For new files, check parent
        let parent = resolved.parent().ok_or("Invalid path")?;
        let canonical_parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
        canonical_parent.join(resolved.file_name().ok_or("Invalid filename")?)
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
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
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
                .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
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
            } else if path.extension().map_or(false, |ext| ext == "md") {
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
pub fn create_file(path: String, vault_path: String) -> Result<(), String> {
    let abs_path = resolve_safe_path(&vault_path, &path)?;
    if let Some(parent) = abs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs_path, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_file(path: String, vault_path: String) -> Result<(), String> {
    let abs_path = resolve_safe_path(&vault_path, &path)?;
    fs::remove_file(&abs_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_file(from: String, to: String, vault_path: String) -> Result<(), String> {
    let abs_from = resolve_safe_path(&vault_path, &from)?;
    let abs_to = resolve_safe_path(&vault_path, &to)?;
    if let Some(parent) = abs_to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&abs_from, &abs_to).map_err(|e| e.to_string())
}
