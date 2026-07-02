# AudioMD

`.audionote.md` / `.audio_md.md` ファイルの音声同期プレビューを提供する VSCode 拡張機能。

![preview](./preview.png)

## 機能

- 音声ファイルと Markdown ノートの同期表示
- 縦軸を時間とした音声波形の描画
- 波形クリック/ドラッグによるシーク
- 右クリック/ドラッグでエディタへタイムスタンプ構文を挿入
- 再生中の自動スクロール

## ファイル形式

拡張子: `*.audionote.md` または `*.audio_md.md`（両方サポート）

```markdown
@audio ./track.mp3

[0:10](#t=10) コメントA

[1:30](#t=90) コメントB

[1:30-1:45](#t=90,105) 範囲コメント
```

通常の Markdown のスーパーセットのため、既存の Markdown レンダラーでもそのまま開ける。

## 使い方

`.audionote.md` または `.audio_md.md` ファイルをエディタで開き、タイトルバーの「Open AudioMD Preview」ボタン (`$(open-preview)`) をクリック。

## セットアップ

```sh
pnpm install
pnpm build
```

ビルド後、`.vsix` をパッケージして VSCode にインストール:

```sh
pnpm package
```

## 開発

```sh
pnpm watch   # ウォッチビルド
```

Webview のデバッグログは `webview-debug.log` に出力される。

```sh
tail -f webview-debug.log
```
