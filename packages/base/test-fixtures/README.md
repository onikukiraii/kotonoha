# test-fixtures

`@kotonoha/base` の仕様を **実行可能な形** で固定する層。各サブディレクトリの役割は以下の通り。

## ディレクトリ構成

| ディレクトリ | 役割 | 対応テスト |
|---|---|---|
| `vault/` | 擬似 Vault。frontmatter 付き `.md` と `.base` ファイル。end-to-end query テストの入力 | `query.test.ts` |
| `golden/` | 各 `.base` を `runBase` した時の期待 JSON 出力。**ここが仕様** | `query.test.ts` |
| `inputs/` | パーサ単体テスト用の最小 YAML 片（filter 1 式など） | `parser.test.ts`, `filter/evaluate.test.ts`, `formula/evaluate.test.ts` |
| `frontmatter/` | TS / Rust 両方から読ませてパリティを保証する frontmatter サンプル | `frontmatter.test.ts`, Rust `cargo test` |

## 方針

- **Obsidian 互換**を目指すため、`.base` YAML は Obsidian 公式仕様に沿った構造にする
- 仕様を変えたい時は、まず fixture を変え、golden JSON を手で更新してから実装を修正する（TDD）
- Phase 1 で `packages/base/src/*` を実装する際は、この fixture を通過する最小コードから書き始める
