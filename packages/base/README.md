# @kotonoha/base

Obsidian Bases 互換の `.base` ファイル処理を、Desktop/Web の両方で共有する pure TypeScript ライブラリ。

## 責務

- `.md` の YAML frontmatter 抽出
- `.base` YAML のパース → `BaseFile` AST
- filter 式 / formula 式のパース（Pratt parser）
- filter / formula / summaries の評価エンジン
- `runBase(base, files)` による table/cards/list 各 view の行生成

詳細仕様は `test-fixtures/` と `src/*.test.ts` を参照。フィクスチャこそが唯一の仕様。

## ディレクトリ

- `src/` — 実装（Phase 1 以降）
- `test-fixtures/vault/` — 擬似 Vault（frontmatter 付き `.md` と `.base`）
- `test-fixtures/golden/` — 各 `.base` に対する期待 JSON
- `test-fixtures/inputs/` — パーサ単体テスト用の YAML 片
- `test-fixtures/frontmatter/` — TS/Rust パリティ用 frontmatter サンプル

## 未対応

- map view
- `![[x.base]]` embed（Markdown プレビュー内）
