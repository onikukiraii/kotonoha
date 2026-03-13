use crate::commands::parse::{extract_tags, extract_wikilinks};
use crate::db::with_db;
use nucleo_matcher::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher};
use serde::Serialize;
use std::fs;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub filename: String,
    pub snippet: Option<String>,
    pub score: f64,
}

#[derive(Serialize, Clone)]
pub struct BacklinkResult {
    pub source_path: String,
    pub snippet: String,
}

#[tauri::command]
pub fn build_index(vault_path: String) -> Result<(), String> {
    let vault = std::path::PathBuf::from(&vault_path);
    let files: Vec<(String, String, String, u64)> = WalkDir::new(&vault)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
        .filter_map(|e| {
            let path = e
                .path()
                .strip_prefix(&vault)
                .ok()?
                .to_string_lossy()
                .to_string();
            let filename = e.file_name().to_string_lossy().to_string();
            let content = fs::read_to_string(e.path()).ok()?;
            let mtime = e
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some((path, filename, content, mtime))
        })
        .collect();

    with_db(|conn| {
        let tx = conn
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string());
        if let Err(e) = tx {
            return Err(e);
        }

        // Clear existing data
        conn.execute_batch(
            "DELETE FROM files; DELETE FROM links; DELETE FROM tags; DELETE FROM fts;",
        )
        .map_err(|e| e.to_string())?;

        for (path, filename, content, mtime) in &files {
            conn.execute(
                "INSERT INTO files (path, filename, updated_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![path, filename, mtime],
            )
            .map_err(|e| e.to_string())?;

            // Links
            let links = extract_wikilinks(content);
            for target in &links {
                conn.execute(
                    "INSERT OR IGNORE INTO links (source_path, target) VALUES (?1, ?2)",
                    rusqlite::params![path, target],
                )
                .map_err(|e| e.to_string())?;
            }

            // Tags
            let tags = extract_tags(content);
            for tag in &tags {
                conn.execute(
                    "INSERT OR IGNORE INTO tags (path, tag) VALUES (?1, ?2)",
                    rusqlite::params![path, tag],
                )
                .map_err(|e| e.to_string())?;
            }

            // FTS
            conn.execute(
                "INSERT INTO fts (path, content) VALUES (?1, ?2)",
                rusqlite::params![path, content],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn build_differential_index(vault_path: String) -> Result<(), String> {
    let vault = std::path::PathBuf::from(&vault_path);

    // Collect current files on disk
    let disk_files: Vec<(String, String, u64)> = WalkDir::new(&vault)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
        .filter_map(|e| {
            let path = e
                .path()
                .strip_prefix(&vault)
                .ok()?
                .to_string_lossy()
                .to_string();
            let filename = e.file_name().to_string_lossy().to_string();
            let mtime = e
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some((path, filename, mtime))
        })
        .collect();

    with_db(|conn| {
        // Get existing DB records
        let mut stmt = conn
            .prepare("SELECT path, updated_at FROM files")
            .map_err(|e| e.to_string())?;
        let db_files: std::collections::HashMap<String, u64> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let disk_paths: std::collections::HashSet<&str> =
            disk_files.iter().map(|(p, _, _)| p.as_str()).collect();

        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;

        // Delete removed files
        for db_path in db_files.keys() {
            if !disk_paths.contains(db_path.as_str()) {
                remove_file_from_index(conn, db_path)?;
            }
        }

        // Add/update changed files
        for (path, filename, mtime) in &disk_files {
            let needs_update = match db_files.get(path) {
                Some(db_mtime) => *mtime != *db_mtime,
                None => true,
            };

            if needs_update {
                let full_path = vault.join(path);
                if let Ok(content) = fs::read_to_string(&full_path) {
                    upsert_file_index(conn, path, filename, &content, *mtime)?;
                }
            }
        }

        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        Ok(())
    })
}

fn remove_file_from_index(conn: &rusqlite::Connection, path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM files WHERE path = ?1", rusqlite::params![path])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM links WHERE source_path = ?1",
        rusqlite::params![path],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE path = ?1", rusqlite::params![path])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM fts WHERE path = ?1", rusqlite::params![path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_file_index(
    conn: &rusqlite::Connection,
    path: &str,
    filename: &str,
    content: &str,
    mtime: u64,
) -> Result<(), String> {
    // Remove old data
    remove_file_from_index(conn, path)?;

    // Insert file record
    conn.execute(
        "INSERT INTO files (path, filename, updated_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![path, filename, mtime],
    )
    .map_err(|e| e.to_string())?;

    // Links
    for target in extract_wikilinks(content) {
        conn.execute(
            "INSERT OR IGNORE INTO links (source_path, target) VALUES (?1, ?2)",
            rusqlite::params![path, target],
        )
        .map_err(|e| e.to_string())?;
    }

    // Tags
    for tag in extract_tags(content) {
        conn.execute(
            "INSERT OR IGNORE INTO tags (path, tag) VALUES (?1, ?2)",
            rusqlite::params![path, tag],
        )
        .map_err(|e| e.to_string())?;
    }

    // FTS
    conn.execute(
        "INSERT INTO fts (path, content) VALUES (?1, ?2)",
        rusqlite::params![path, content],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_file_index(path: String, content: String, vault_path: String) -> Result<(), String> {
    let vault = std::path::PathBuf::from(&vault_path);
    let full_path = vault.join(&path);
    let filename = full_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mtime = fs::metadata(&full_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    with_db(|conn| upsert_file_index(conn, &path, &filename, &content, mtime))
}

#[tauri::command]
pub fn fuzzy_files(query: String) -> Result<Vec<SearchResult>, String> {
    let all_files = with_db(|conn| {
        let mut stmt = conn
            .prepare("SELECT path, filename FROM files")
            .map_err(|e| e.to_string())?;
        let files: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(files)
    })?;

    if query.is_empty() {
        return Ok(all_files
            .into_iter()
            .take(20)
            .map(|(path, filename)| SearchResult {
                path,
                filename,
                snippet: None,
                score: 0.0,
            })
            .collect());
    }

    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let pattern = Pattern::new(
        &query,
        CaseMatching::Ignore,
        Normalization::Smart,
        AtomKind::Fuzzy,
    );

    let mut scored: Vec<(String, String, u32)> = all_files
        .into_iter()
        .filter_map(|(path, filename)| {
            let mut buf = Vec::new();
            let haystack = nucleo_matcher::Utf32Str::new(&filename, &mut buf);
            let score = pattern.score(haystack, &mut matcher)?;
            Some((path, filename, score))
        })
        .collect();

    scored.sort_by(|a, b| b.2.cmp(&a.2));

    Ok(scored
        .into_iter()
        .take(20)
        .map(|(path, filename, score)| SearchResult {
            path,
            filename,
            snippet: None,
            score: score as f64,
        })
        .collect())
}

#[tauri::command]
pub fn full_text_search(query: String) -> Result<Vec<SearchResult>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT fts.path, f.filename, snippet(fts, 1, '<mark>', '</mark>', '...', 32)
                 FROM fts
                 JOIN files f ON f.path = fts.path
                 WHERE fts MATCH ?1
                 LIMIT 50",
            )
            .map_err(|e| e.to_string())?;

        let results: Vec<SearchResult> = stmt
            .query_map(rusqlite::params![query], |row| {
                Ok(SearchResult {
                    path: row.get(0)?,
                    filename: row.get(1)?,
                    snippet: row.get(2)?,
                    score: 1.0,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    })
}

#[tauri::command]
pub fn get_backlinks(target: String) -> Result<Vec<BacklinkResult>, String> {
    with_db(|conn| {
        // Match both exact path and filename-only references
        let target_filename = std::path::Path::new(&target)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| target.clone());

        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT l.source_path
                 FROM links l
                 WHERE l.target = ?1 OR l.target = ?2",
            )
            .map_err(|e| e.to_string())?;

        let source_paths: Vec<String> = stmt
            .query_map(rusqlite::params![target, target_filename], |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // Get snippets from FTS
        let mut results = Vec::new();
        for source_path in source_paths {
            let snippet = conn
                .query_row(
                    "SELECT content FROM fts WHERE path = ?1",
                    rusqlite::params![source_path],
                    |row| row.get::<_, String>(0),
                )
                .ok()
                .and_then(|content| {
                    content
                        .lines()
                        .find(|line| line.contains(&format!("[[{}]]", target))
                            || line.contains(&format!("[[{}]]", target_filename)))
                        .map(|s| s.to_string())
                });

            results.push(BacklinkResult {
                source_path,
                snippet: snippet.unwrap_or_default(),
            });
        }

        Ok(results)
    })
}

#[tauri::command]
pub fn search_by_tag(tag: String) -> Result<Vec<SearchResult>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT t.path, f.filename
                 FROM tags t
                 JOIN files f ON f.path = t.path
                 WHERE t.tag = ?1",
            )
            .map_err(|e| e.to_string())?;

        let results: Vec<SearchResult> = stmt
            .query_map(rusqlite::params![tag], |row| {
                Ok(SearchResult {
                    path: row.get(0)?,
                    filename: row.get(1)?,
                    snippet: None,
                    score: 1.0,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    })
}

#[tauri::command]
pub fn list_tags() -> Result<Vec<String>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare("SELECT DISTINCT tag FROM tags ORDER BY tag")
            .map_err(|e| e.to_string())?;

        let tags: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(tags)
    })
}
