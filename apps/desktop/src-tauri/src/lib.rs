mod commands;
mod db;

use commands::{fs, git, index, parse};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // fs
            fs::open_vault,
            fs::get_vault,
            fs::list_files,
            fs::read_file,
            fs::write_file,
            fs::create_file,
            fs::delete_file,
            fs::rename_file,
            // parse
            parse::render_markdown,
            // index
            index::build_index,
            index::build_differential_index,
            index::update_file_index,
            index::fuzzy_files,
            index::full_text_search,
            index::get_backlinks,
            index::search_by_tag,
            index::list_tags,
            // git
            git::git_status,
            git::git_commit,
            git::git_push,
            git::git_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
