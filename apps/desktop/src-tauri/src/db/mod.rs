use once_cell::sync::Lazy;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

static DB: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));

pub fn init_db(vault_path: &str) -> Result<(), String> {
    let db_path = PathBuf::from(vault_path).join(".kotonoha.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS links (
            source_path TEXT NOT NULL,
            target TEXT NOT NULL,
            PRIMARY KEY (source_path, target)
        );

        CREATE TABLE IF NOT EXISTS tags (
            path TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY (path, tag)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
            path UNINDEXED,
            content,
            tokenize = 'trigram'
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    let mut db = DB.lock().map_err(|e| e.to_string())?;
    *db = Some(conn);
    Ok(())
}

pub fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let db = DB.lock().map_err(|e| e.to_string())?;
    match db.as_ref() {
        Some(conn) => f(conn),
        None => Err("Database not initialized".to_string()),
    }
}
