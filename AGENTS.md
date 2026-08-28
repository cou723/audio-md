# audio-md — VS Code拡張機能

> Codex向けの実装指示書。この文書に書かれていない判断は、最もシンプルな実装を選ぶこと。
> 詳細仕様は `docs/` 配下に分割されている。作業内容に応じて該当ドキュメントのみ参照すること。

## コマンド実行

- 開発用Webサーバーは `pnpm run serve` で起動すること。`python3 -m http.server` などを直接実行しないこと。

## ドキュメント一覧

| ドキュメント | 内容 |
|------|------|
| [docs/development.md](./docs/development.md) | ドキュメント調査方針・技術スタック・デバッグ方針（Webviewログ収集） |
| [docs/architecture.md](./docs/architecture.md) | ディレクトリ構成・再利用性の原則・VS Code拡張登録・音声ファイル参照・エラー処理 |
| [docs/file-format.md](./docs/file-format.md) | `.audiomd.md` の拡張子・構文・パース規則・内部表現の型 |
| [docs/features.md](./docs/features.md) | 実装する/しない機能一覧 |
| [docs/webview-ui.md](./docs/webview-ui.md) | UIレイアウト・波形レンダリング・クリック操作・スクロール同期の実装仕様 |
