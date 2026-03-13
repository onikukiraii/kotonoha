# 仕様書：kotonoha-web（SvelteKit）

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | SvelteKit |
| APIサーバー | SvelteKit server routes |
| エディター | CodeMirror 6（vim なし） |
| git操作 | `simple-git` |
| DB | SQLite（`better-sqlite3`） |
| ランタイム | Bun |
| ホスティング | 自宅サーバー（Docker Compose） |
| アクセス | Tailscale VPN |

---

## ディレクトリ構成

```
apps/web/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +page.svelte              # メイン画面
│   │   ├── settings/
│   │   │   └── +page.svelte
│   │   └── api/
│   │       ├── files/
│   │       │   └── +server.ts        # ファイルCRUD
│   │       ├── git/
│   │       │   └── +server.ts        # git操作
│   │       └── search/
│   │           └── +server.ts        # fuzzy・全文検索
│   └── lib/
│       ├── server/
│       │   ├── vault.ts              # ファイル操作
│       │   ├── indexer.ts            # SQLiteインデックス
│       │   ├── parser.ts             # wikilink・タグ解析
│       │   └── git.ts                # simple-gitラッパー
│       └── db/
│           └── schema.sql
├── static/
│   └── manifest.json                 # PWA設定
├── Dockerfile
└── docker-compose.yml
```

> `src/lib/` 以下のUIコンポーネントは `packages/ui/` の共有コンポーネントを使う。

---

## API仕様

### ファイル操作

```
GET    /api/files/tree                # ファイルツリー取得
GET    /api/files/content?path=       # ファイル内容取得
PUT    /api/files/content             # ファイル保存（自動commit）
POST   /api/files                     # ファイル作成
DELETE /api/files?path=               # ファイル削除
PATCH  /api/files/rename              # リネーム
```

**ファイルツリー取得**
```typescript
// GET /api/files/tree
Response: {
  tree: FileNode[]
}

type FileNode = {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
  updated_at?: number
}
```

**ファイル保存**
```typescript
// PUT /api/files/content
Body: { path: string; content: string }
Response: { ok: boolean; updated_at: number }
// AUTO_COMMIT=true の場合、保存と同時に git add & commit
```

---

### 検索

```
GET /api/search/files?q=        # fuzzy ファイル名検索
GET /api/search/fulltext?q=     # 全文検索
GET /api/search/backlinks?filename=  # バックリンク取得
GET /api/search/tags             # タグ一覧
GET /api/search/tags?tag=        # タグ検索
```

```typescript
type SearchResult = {
  path: string
  filename: string
  snippet?: string
  score: number
}
```

---

### git操作

```
GET  /api/git/status          # ブランチ・変更ファイル確認
POST /api/git/pull            # GitHub から pull
POST /api/git/commit-push     # commit & push
```

```typescript
// POST /api/git/commit-push
Body: { message?: string }   // 省略時は "update from web: <timestamp>"
Response: { ok: boolean; commit_hash: string }
```

---

### アクセス制御

認証なし。Tailscale VPN内からのみアクセス可能。

---

## SQLiteインデックス

desktopと同一スキーマ。

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

- サーバー起動時に全ファイルをスキャンしてビルド
- `PUT /api/files/content` 時に差分更新
- `POST /api/git/pull` 完了後に全再ビルド

---

## フロントエンド仕様

### レイアウト（iPhone）

```
┌──────────────────────┐
│ kotonoha    [🔍][⟳]  │
├──────────────────────┤
│                      │
│  FileTree            │
│  or Editor           │
│  or Preview          │
│                      │
├──────────────────────┤
│ [Tree] [Edit] [View] │
└──────────────────────┘
```

### レイアウト（PCブラウザ）

```
┌────────────────────────────────────────┐
│ kotonoha                  [🔍] [git⟳] │
├──────────────┬─────────────────────────┤
│  FileTree    │  Editor  │  Preview     │
└──────────────┴─────────────────────────┘
```

### エディター（CodeMirror 6）

vim モードなし。タッチ操作前提。

```typescript
const extensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  customTheme,
  wikilinkDecorator,
]
```

**保存トリガー**
- フォーカスアウト時に自動保存（debounce 1000ms）

### PWA設定

```json
{
  "name": "kotonoha",
  "short_name": "kotonoha",
  "display": "standalone",
  "background_color": "#1a1a1a",
  "theme_color": "#1a1a1a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

---

## gitワークフロー

```
起動時          : git pull origin main
ファイル保存時  : git add <path> && git commit（AUTO_COMMIT=true の場合）
手動push時      : POST /api/git/commit-push → git push origin main
Mac pull時      : Tauriアプリが次回オンライン時にpull
```

GitHub認証は環境変数の PAT を使用。

```
https://x-access-token:${GITHUB_PAT}@github.com/user/repo.git
```

---

## 環境変数

```env
GITHUB_REPO_URL=https://github.com/yourname/kotonoha-vault.git
GITHUB_PAT=ghp_xxxxxxxxxxxx
```

その他はすべてデフォルト値あり（VAULT_PATH=/app/vault, PORT=3000, AUTO_COMMIT=true, AUTO_COMMIT_IDLE_SEC=300, AUTO_PULL_INTERVAL=300）。

---

## Docker Compose

```yaml
version: "3.9"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./vault:/app/vault
      - ./data:/app/data     # SQLite
    env_file:
      - .env
    restart: unless-stopped
```

---

## フェーズ

```
Phase 1：閲覧・軽量編集
  - ファイルツリー
  - Markdownプレビュー
  - 軽量エディター（CodeMirror、vim なし）
  - fuzzy ファイル検索
  - 自動保存 + 自動commit

Phase 2：検索・インデックス
  - 全文検索
  - バックリンク
  - タグ検索

Phase 3：git連携
  - pull / push UI
  - コンフリクト通知
```
