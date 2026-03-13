# kotonoha — モノレポ構成

## 全体構成

```
kotonoha/
├── apps/
│   ├── desktop/          # Tauri + Vite + Svelte（Mac）
│   └── web/              # SvelteKit（自宅サーバー・iPhone）
└── packages/
    ├── ui/               # 共有Svelteコンポーネント
    └── types/            # 共有型定義
```

## パッケージ管理

`pnpm workspaces` を使用。

```json
// pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

## 共有パッケージ

### packages/types

両アプリで使う型定義。

```typescript
export type FileNode = {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
  updated_at?: number
}

export type SearchResult = {
  path: string
  filename: string
  snippet?: string
  score: number
}

export type BacklinkResult = {
  source_path: string
  snippet: string
}

export type GitStatus = {
  branch: string
  staged: string[]
  unstaged: string[]
  untracked: string[]
}
```

### packages/ui

両アプリで使う共有Svelteコンポーネント。

```
packages/ui/
├── Editor.svelte          # CodeMirrorラッパー（props でvim on/off）
├── Preview.svelte         # Markdownプレビュー
├── FileTree.svelte        # ファイルツリー
├── FuzzySearch.svelte     # 検索モーダル
├── BacklinkPanel.svelte   # バックリンク一覧
└── index.ts
```

**Editorコンポーネントのvimフラグ**

```svelte
<!-- desktop側: vim有効 -->
<Editor vimMode={true} />

<!-- web側: vim無効（タッチ操作前提） -->
<Editor vimMode={false} />
```

## ビルド

```bash
# desktop
pnpm --filter desktop tauri build

# web
pnpm --filter web build
```

## 開発

```bash
# desktop
pnpm --filter desktop tauri dev

# web
pnpm --filter web dev
```
