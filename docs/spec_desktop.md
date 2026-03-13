# 仕様書：kotonoha-desktop（Tauri）

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | Tauri v2 |
| フロントエンド | Vite + Svelte 5 |
| エディター | CodeMirror 6 + `@codemirror/vim` |
| ファイル操作 | `tauri-plugin-fs` |
| git操作 | `git2` crate（Rust） |
| ローカルDB | SQLite（`rusqlite`） |
| fuzzy検索 | `nucleo` crate（Rust） |
| Markdownパース | `pulldown-cmark`（wikilink拡張） |
| 設定永続化 | `tauri-plugin-store` |
| 認証情報 | `tauri-plugin-keychain` |

---

## ディレクトリ構成

```
apps/desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── fs.rs        # ファイル読み書き・ツリー取得
│   │   │   ├── git.rs       # commit / push / pull
│   │   │   ├── index.rs     # SQLiteインデックス・検索
│   │   │   └── parse.rs     # wikilink・タグ・backlink解析
│   │   └── db/
│   │       └── schema.sql
│   └── Cargo.toml
└── src/
    ├── main.ts
    ├── App.svelte
    ├── lib/
    │   ├── editor/
    │   │   ├── EditorPane.svelte     # CodeMirrorラッパー
    │   │   └── extensions.ts        # vim / markdown / theme設定
    │   ├── preview/
    │   │   └── PreviewPane.svelte
    │   ├── filetree/
    │   │   └── FileTree.svelte
    │   ├── search/
    │   │   └── FuzzySearch.svelte
    │   ├── backlinks/
    │   │   └── BacklinkPanel.svelte
    │   └── stores/
    │       ├── vault.ts
    │       └── editor.ts
    └── vite.config.ts
```

> `lib/` 以下のコンポーネントは `packages/ui/` の共有コンポーネントを使う。
> desktop固有のロジック（Tauriコマンド呼び出し等）だけをこのディレクトリに置く。

---

## 機能仕様

### 1. Vault管理

- 初回起動時にローカルディレクトリを選択するダイアログを表示
- 選択したパスを `tauri-plugin-store` に永続化
- 単一Vault前提

```typescript
// Tauriコマンド
open_vault(path: string) -> VaultMeta
get_vault() -> VaultMeta | null
```

---

### 2. ファイルツリー

**キーボード操作（yazi風）**

| キー | 動作 |
|---|---|
| `j` / `k` | 上下移動 |
| `h` | 親ディレクトリ / フォルダを閉じる |
| `l` / `Enter` | ファイルを開く / フォルダを展開 |
| `o` | 新規ファイル作成 |
| `d` | ファイル削除（確認あり） |
| `r` | リネーム |

```typescript
// Tauriコマンド
list_files(vault_path: string) -> FileNode[]
create_file(path: string) -> void
delete_file(path: string) -> void
rename_file(from: string, to: string) -> void
```

---

### 3. エディター（CodeMirror 6）

**vim モード**
- `@codemirror/vim` で Normal / Insert / Visual を実装
- デフォルトは Normal モード

**有効にする拡張**

```typescript
import { vim } from "@codemirror/vim"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { EditorView } from "@codemirror/view"

const extensions = [
  vim(),
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  wikimcustomerDecorator,  // [[wikilink]] ハイライト
  customTheme,
]
```

**wikilink**
- `[[ファイル名]]` をカスタムDecorationでハイライト
- Normal モードで `gd` またはクリックでそのファイルを開く

**自動保存**
- debounce 500ms で `tauri-plugin-fs` の `write_text_file` を呼ぶ

**レイアウト**
- 左：エディター / 右：プレビュー のsplit表示
- `cmd+P` でsplit / エディターのみ を切り替え

---

### 4. Markdownプレビュー

Rust側でHTMLに変換してフロントに渡す。

```rust
// pulldown-cmark でHTML変換
// [[wikilink]] → <a class="wikilink">
// #タグ → <span class="tag">
fn render_markdown(content: &str, vault_path: &str) -> String
```

- コードブロック：`highlight.js` でシンタックスハイライト
- 画像：`asset://` プロトコルで解決
- テーブル・チェックボックス対応

---

### 5. Fuzzy検索

**ファイル名検索（cmd+O）**
- モーダルを開いてファイル名をfuzzy検索
- Rustの `nucleo` でリアルタイムに返す

**全文検索（cmd+shift+F）**
- SQLite FTS5 でファイル内容を横断検索
- マッチ行のスニペットを表示

```typescript
// Tauriコマンド
fuzzy_files(query: string) -> SearchResult[]
full_text_search(query: string) -> SearchResult[]
```

---

### 6. SQLiteインデックス

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE links (
  source_path TEXT NOT NULL,
  target_filename TEXT NOT NULL,
  PRIMARY KEY (source_path, target_filename)
);

CREATE TABLE tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);

CREATE VIRTUAL TABLE fts USING fts5(
  path UNINDEXED,
  content,
  tokenize = 'unicode61'
);
```

- Vault起動時に全ファイルをスキャンしてビルド
- ファイル保存時に差分更新

---

### 7. バックリンクパネル

- 現在開いているファイルを参照している他ファイルの一覧
- クリックでそのファイルを開く
- `[[現在のファイル名]]` を含む行のスニペットを表示

```typescript
// Tauriコマンド
get_backlinks(filename: string) -> BacklinkResult[]
```

---

### 8. git連携

**ステータスバー**
- 現在のブランチと変更ファイル数を常時表示

**gitパネル（cmd+G）**

| 操作 | 内容 |
|---|---|
| Auto-stage | 変更ファイルを全てステージ |
| Commit | メッセージを入力してコミット |
| Push | `origin main` へhttps push |
| Pull | `origin main` からpull |

**認証情報**
- GitHub PAT を `tauri-plugin-keychain` でkeychainに保存
- 設定画面でGitHub repo URLとPATを入力

```typescript
// Tauriコマンド
git_status() -> GitStatus
git_commit(message: string) -> void
git_push() -> void
git_pull() -> void
```

---

### 9. UIレイアウト

```
┌──────────────────────────────────────────────────────┐
│ kotonoha          [main] [+2]              [cmd+,]   │
├───────────────┬─────────────────┬────────────────────┤
│               │                 │                    │
│  FileTree     │  Editor         │  Preview           │
│  (yazi風)     │  (CodeMirror)   │  (rendered MD)     │
│               │  -- vim --      │                    │
│               │                 ├────────────────────┤
│               │                 │  Backlinks         │
└───────────────┴─────────────────┴────────────────────┘
```

---

### 10. キーバインド一覧

| キー | 動作 |
|---|---|
| `cmd+O` | fuzzy file open |
| `cmd+shift+F` | 全文検索 |
| `cmd+G` | gitパネル |
| `cmd+P` | プレビュー toggle |
| `ctrl+Y` | ファイラー（yaziスタイル） |
| `cmd+B` | バックリンクパネル開閉 |
| `cmd+,` | 設定 |

---

### 11. 設定

```typescript
type AppConfig = {
  vault_path: string
  github_repo_url: string
  github_pat: string        // keychain保存
  auto_save_delay_ms: number  // デフォルト500
  theme: "dark" | "light" | "system"
  font_size: number
}
```

---

## フェーズ

```
Phase 1：コア
  - ファイルツリー（yazi風キーボード操作）
  - CodeMirror + vim mode
  - split preview
  - fuzzy file search（cmd+O）
  - wikilink ナビゲーション
  - 自動保存

Phase 2：インデックス
  - SQLite インデックスビルド
  - バックリンクパネル
  - タグ検索
  - 全文検索（cmd+shift+F）

Phase 3：git連携
  - git status / commit / push / pull
  - GitHub PAT管理
```
