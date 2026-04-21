use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Serialize)]
pub struct MdFile {
    pub path: String,
    pub filename: String,
    pub content: String,
    pub mtime: u64,
    pub ctime: u64,
    pub size: u64,
}

#[tauri::command]
pub fn read_vault_markdown(vault_path: String) -> Result<Vec<MdFile>, String> {
    let vault = PathBuf::from(&vault_path);
    let mut out = Vec::new();
    for entry in WalkDir::new(&vault).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.extension().map_or(false, |e| e == "md") {
            continue;
        }
        let rel = match path.strip_prefix(&vault) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        let filename = entry.file_name().to_string_lossy().to_string();
        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let ctime = meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(mtime);
        out.push(MdFile {
            path: rel,
            filename,
            content,
            mtime,
            ctime,
            size: meta.len(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn read_base_file(vault_path: String, base_path: String) -> Result<String, String> {
    let vault = PathBuf::from(&vault_path);
    let target = vault.join(&base_path);
    let canonical = fs::canonicalize(&target).map_err(|e| e.to_string())?;
    let vault_canonical = fs::canonicalize(&vault).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&vault_canonical) {
        return Err("Path traversal detected".to_string());
    }
    fs::read_to_string(&canonical).map_err(|e| e.to_string())
}
