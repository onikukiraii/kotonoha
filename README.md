# kotonoha

Markdown ノートアプリ。ローカルファイルベースの Obsidian 風ノート管理を、Desktop (Tauri + Rust) と Web (SvelteKit + Node.js) の2つのインターフェースで提供する。

両アプリとも同一の Vault (Markdown ファイル群のフォルダ) を Git リポジトリ経由で同期する。

## Desktop App

Mac 上でネイティブ動作。vim keybindings、Live Preview エディタ。

```bash
# 前提: Rust, Node.js 22, pnpm
cd apps/desktop && pnpm install && pnpm tauri dev
```

### キーボードショートカット

| キー | 動作 |
|------|------|
| `⌘O` | ファジー検索 (ファイル名モード) |
| `⌘D` | Daily note を開く |
| `⌘⇧F` | ファジー検索 (全文検索モード) |
| `⌘P` | Live Preview / Raw MD 切替 |
| `⌘\` | サイドバー 表示/非表示 |
| `⌘B` | バックリンクパネル 表示/非表示 |
| `⌘G` | Git パネル 表示/非表示 |

### 機能

- **Live Preview**: Obsidian風のインラインMarkdownレンダリング。カーソル行は生Markdownを表示し編集可能。`⌘P` でRaw MD表示と切替
- **エディタ**: CodeMirror 6 + vim keybindings + macOS Emacs キー (`Ctrl+A/E/K`)、自動保存 (500ms debounce)
- **ファジー検索**: ファイル名あいまい検索 / 日本語対応全文検索 (`Tab` で切替)
- **Wikilink**: `[[link]]` でノート間リンク、バックリンク表示
- **タグ**: `#tag` (日本語対応) によるフィルタリング
- **Daily note**: `⌘D` で今日のノートを開く (`00_daily/YYYY/MM/YYYY-MM-DD.md`)
- **Git 連携**: `⌘G` でステータス確認、コミット、プッシュ、プル

## Web App

Docker で動作する Web 版。モバイル対応 (2タブ + スワイプ)。

```bash
cp .env.example .env  # GITHUB_REPO_URL, GITHUB_PAT を設定
make prod-up          # → http://localhost:3003
```

### 環境変数 (.env)

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `VAULT_PATH` | Markdown ファイルの保存先パス | `/app/vault` |
| `GITHUB_REPO_URL` | Vault の Git リポジトリ URL | - |
| `GITHUB_PAT` | GitHub Personal Access Token | - |
| `AUTO_COMMIT` | 自動コミット有効/無効 | `true` |
| `AUTO_COMMIT_IDLE_SEC` | 無編集からコミットまでの秒数 | `300` |
| `AUTO_PULL_INTERVAL` | 自動プル間隔 (秒) | `300` |

## リリース

タグを push すると GitHub Actions が macOS (Apple Silicon / Intel) 向けの `.dmg` を自動ビルドし、[Releases](../../releases) ページに公開する。

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 開発

```bash
make dev           # Web App 開発サーバー
make docker-up     # Docker 開発環境 (ホットリロード)
make docker-down   # Docker 停止
make prod-up       # 本番ビルド & 起動
make prod-down     # 本番停止
make prod-logs     # 本番ログ
make lint          # Lint
make typecheck     # TypeCheck
```
