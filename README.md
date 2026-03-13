# kotonoha

Markdown ノートアプリ。ローカルファイルベースの Obsidian 風ノート管理を、Desktop (Tauri + Rust) と Web (SvelteKit + Node.js) の2つのインターフェースで提供する。

## アーキテクチャ

```
kotonoha/
├── apps/
│   ├── desktop/     # Tauri v2 + Svelte 5 + Rust (Mac ネイティブ)
│   └── web/         # SvelteKit + Node.js (Docker / ホームサーバー)
├── packages/
│   ├── types/       # 共有 TypeScript 型定義
│   └── ui/          # 共有 Svelte コンポーネント
├── Dockerfile
├── docker-compose.yml
└── Makefile
```

- **Desktop App**: Mac 上でネイティブ動作。vim keybindings、3ペインレイアウト、Rust バックエンド (rusqlite, git2, nucleo)
- **Web App**: Docker でホームサーバーに配置。iPhone 等ブラウザからアクセス。パスワード認証 (bcrypt + JWT)

両アプリとも同一の Vault (Markdown ファイル群のフォルダ) を Git リポジトリ経由で同期する。

---

## Desktop App

### 起動方法

```bash
# 前提: Rust, Node.js 22, pnpm がインストール済み
cd apps/desktop
source ~/.cargo/env   # cargo が PATH に無い場合
pnpm install
pnpm tauri dev
```

### UI レイアウト

```
┌─────────────────────────────────────────────────┐
│ kotonoha                          [main] [+2]   │
├──────────┬─────────────────┬────────────────────┤
│ Sidebar  │  Editor (vim)   │  Preview           │
│ (250px)  │  (flex 1)       │  (flex 1)          │
│          │                 ├────────────────────┤
│ FileTree │                 │  Backlinks         │
└──────────┴─────────────────┴────────────────────┘
│ ステータスバー: branch名 / 変更数 / ショートカット │
└─────────────────────────────────────────────────┘
```

### キーボードショートカット

| キー | 動作 |
|------|------|
| `⌘O` | ファジー検索 (ファイル名モード) |
| `⌘⇧F` | ファジー検索 (全文検索モード) |
| `⌘P` | プレビューパネル 表示/非表示 |
| `⌘\` | サイドバー 表示/非表示 |
| `⌘B` | バックリンクパネル 表示/非表示 |
| `⌘⇧G` | Git パネル 表示/非表示 |

### ファジー検索モーダル

| キー | 動作 |
|------|------|
| `↑` / `↓` | 結果の選択移動 |
| `Enter` | 選択したファイルを開く |
| `Tab` | ファイル名検索 ↔ 全文検索 モード切替 |
| `Esc` | 閉じる |

### エディタ (vim モード)

CodeMirror 6 + vim keybindings がデフォルトで有効。通常の vim 操作 (`i`, `Esc`, `dd`, `yy`, `p`, `/search` 等) がすべて使える。

- **自動保存**: 編集停止後 500ms で自動的にファイルを保存
- **未保存インジケータ**: ファイル名の横にオレンジの丸が表示される

### ファイル操作

| 操作 | 方法 |
|------|------|
| ファイル作成 | サイドバー上部の `+` ボタン → ファイル名入力 → Enter |
| ファイル選択 | サイドバーでクリック、またはファジー検索 |
| ファイル保存 | 自動保存 (500ms debounce) |

### Markdown 記法

標準の Markdown に加え、以下の拡張記法をサポート:

| 記法 | 説明 | 例 |
|------|------|----|
| `[[wikilink]]` | 他ノートへのリンク | `[[daily-note]]` |
| `[[path/to/note]]` | パス付きリンク | `[[projects/kotonoha]]` |
| `#tag` | タグ (日本語対応) | `#Rust` `#日記` `#アイデア` |
| テーブル | GFM テーブル | `\| col1 \| col2 \|` |
| タスクリスト | チェックボックス | `- [x] done` `- [ ] todo` |
| ~~取り消し線~~ | 打ち消し | `~~deleted~~` |

### Wikilink ナビゲーション

- **プレビューパネル**: `[[wikilink]]` をクリックすると対象ファイルに遷移
- リンク先は `.md` 拡張子を省略可能 (`[[note]]` → `note.md`)

### 検索・インデックス

| 機能 | 説明 |
|------|------|
| ファイル名検索 | nucleo (fuzzy matcher) によるあいまい検索。スコア順に上位20件表示 |
| 全文検索 | SQLite FTS5 (trigram tokenizer) による日本語対応全文検索。マッチ箇所をハイライト表示 |
| バックリンク | 現在開いているファイルを `[[wikilink]]` で参照している他ファイルを一覧表示 |
| タグ検索 | `#tag` によるファイルフィルタリング |

インデックスはアプリ起動時に差分更新 (ファイルの mtime を比較し変更分のみ更新)。ファイル保存時にも個別更新される。

### Git 連携

`⌘⇧G` で Git パネルを開く:

- **Status**: ブランチ名、staged / modified / untracked ファイル一覧
- **Commit**: メッセージ入力 → Commit ボタン (全変更を add してコミット)
- **Push**: origin にプッシュ (GitHub PAT で認証)
- **Pull**: origin からプル (fast-forward またはマージ、コンフリクト時は通知)

ステータスバーに現在のブランチ名と変更ファイル数が常時表示される (30秒間隔でポーリング)。

---

## Web App

### Docker デプロイ

```bash
# 1. 環境変数を設定
cp .env.example .env
# .env を編集 (下記参照)

# 2. パスワードハッシュを生成
make hash-password
# 表示されたハッシュを .env の AUTH_PASSWORD_HASH に設定

# 3. 起動
make docker-up
# → http://localhost:3000 でアクセス可能
```

### 環境変数 (.env)

| 変数 | 必須 | 説明 | デフォルト |
|------|------|------|-----------|
| `VAULT_PATH` | Yes | Markdown ファイルの保存先パス | `/app/vault` |
| `JWT_SECRET` | Yes | JWT 署名シークレット (ランダム文字列) | - |
| `AUTH_PASSWORD_HASH` | Yes | bcrypt ハッシュ化されたパスワード | - |
| `GITHUB_REPO_URL` | No | Vault の Git リポジトリ URL | - |
| `GITHUB_PAT` | No | GitHub Personal Access Token | - |
| `PORT` | No | サーバーポート | `3000` |
| `AUTO_COMMIT` | No | 自動コミット有効/無効 | `true` |
| `AUTO_COMMIT_IDLE_SEC` | No | 無編集からコミットまでの秒数 | `300` (5分) |
| `AUTO_PULL_INTERVAL` | No | 自動プル間隔 (秒) | `300` (5分) |

### 認証

- ブラウザでアクセスすると `/login` にリダイレクト
- パスワードを入力 → bcrypt で検証 → JWT (30日有効) を発行
- 以降のAPIリクエストは JWT で自動認証

### UI レイアウト (レスポンシブ)

**デスクトップ (768px以上)**:
```
┌─────────────────────────────────────────┐
│ kotonoha       [検索] [sync] [設定]     │
├──────────┬──────────────────────────────┤
│ FileTree │  Editor / Preview            │
│ (250px)  │  (メイン領域)                │
└──────────┴──────────────────────────────┘
```

**モバイル (768px未満)**:
```
┌─────────────────────┐
│     メイン領域       │
│  (1画面ずつ表示)     │
├─────┬───────┬───────┤
│Tree │ Edit  │ View  │  ← ボトムタブで切替
└─────┴───────┴───────┘
```

### 自動コミット

ファイル保存時に即座にコミットせず、アイドル検出 (デフォルト5分間無編集) 後にまとめて1回のコミットを行う。これにより高速編集時のコミット爆発を防止する。

### API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/login` | パスワード認証 → JWT 発行 |
| GET | `/api/files/tree` | ファイルツリー取得 |
| GET | `/api/files/content?path=` | ファイル内容取得 |
| PUT | `/api/files/content` | ファイル保存 |
| POST | `/api/files` | ファイル新規作成 |
| DELETE | `/api/files?path=` | ファイル削除 |
| PATCH | `/api/files/rename` | ファイルリネーム |
| GET | `/api/search/files?q=` | ファイル名検索 |
| GET | `/api/search/fulltext?q=` | 全文検索 |
| GET | `/api/search/backlinks?filename=` | バックリンク取得 |
| GET | `/api/search/tags` | 全タグ一覧 |
| GET | `/api/search/tags?tag=` | タグでフィルタ |
| GET | `/api/git/status` | Git ステータス |
| POST | `/api/git/pull` | Git プル |
| POST | `/api/git/commit-push` | コミット&プッシュ |

---

## 開発

### 前提環境

- Node.js 22 (mise で管理)
- pnpm
- Rust (Desktop App のみ)
- Docker (Web App デプロイのみ)

### コマンド

```bash
# Web App 開発サーバー
make dev
# or: pnpm --filter @kotonoha/web dev

# Desktop App 開発
cd apps/desktop
pnpm tauri dev

# Docker ビルド & 起動
make docker-up

# Docker 停止
make docker-down

# Lint
make lint

# TypeCheck
make typecheck

# パスワードハッシュ生成
make hash-password
```

### 技術スタック

| レイヤー | Desktop | Web |
|---------|---------|-----|
| フロントエンド | Svelte 5 | Svelte 5 (SvelteKit) |
| エディタ | CodeMirror 6 + vim | CodeMirror 6 + vim (optional) |
| バックエンド | Rust (Tauri v2) | Node.js (SvelteKit server) |
| DB | rusqlite (SQLite + FTS5) | better-sqlite3 (SQLite + FTS5) |
| Git | git2 (libgit2) | simple-git |
| 検索 | nucleo-matcher (fuzzy) + FTS5 trigram | fuse.js (fuzzy) + FTS5 trigram |
| Markdown | pulldown-cmark | marked |
| セキュリティ | パストラバーサル防止 | bcrypt + JWT + DOMPurify + パストラバーサル防止 |

### セキュリティ

- **パストラバーサル防止**: Vault ディレクトリ外へのアクセスを `canonicalize` + `starts_with` で遮断
- **XSS 防止**: Markdown プレビューは DOMPurify でサニタイズ
- **認証**: bcrypt ハッシュ比較 + JWT (Web App)
- **Git 排他制御**: Mutex / Promise chain で同時操作を防止
