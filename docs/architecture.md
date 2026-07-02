# アーキテクチャ

## ディレクトリ構成

```
audio-md/
├── src/
│   ├── extension.ts          # Extension Host エントリポイント
│   ├── parser.ts             # .audionote.md / .audiomd.md パーサー（Effect.ts使用）
│   └── webview/
│       ├── index.html        # Webviewのシェル（VSCode用）
│       ├── standalone.html   # ブラウザ単体動作用（開発・デバッグ用）
│       ├── main.ts           # Webview側JS（VSCode依存を含めない）
│       └── style.css
├── CLAUDE.md
├── docs/
├── esbuild.mjs               # Extension Host用とWebview用でターゲットを分ける
├── package.json
└── tsconfig.json
```

## 再利用性の原則

`src/webview/main.ts` はVSCode依存のコードを一切含めない。
VSCode固有の処理（`acquireVsCodeApi`・`postMessage`）は起動時に外部から注入する。

```typescript
// main.ts が受け取るインターフェース
interface PlatformBridge {
  onMessage: (handler: (msg: unknown) => void) => void;
  postMessage: (msg: unknown) => void;
}
```

`standalone.html` ではモックのbridgeを渡すだけで単体動作する。

## VSCode拡張登録

`.audionote.md` / `.audiomd.md` はデフォルトでテキストエディタで開く。
ビュワーはコマンド経由でテキストエディタの右隣に開く（Markdown プレビューと同じ動作）。

`package.json` に以下を含めること:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "audio-md.openPreview",
        "title": "Open AudioMD Preview",
        "icon": "$(open-preview)"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "audio-md.openPreview",
          "when": "resourceFilename =~ /\\.(audionote|audio-md)\\.md$/",
          "group": "navigation"
        }
      ]
    }
  },
  "activationEvents": [
    "onLanguage:markdown"
  ]
}
```

## 音声ファイルのWebview参照

VSCode WebviewはローカルファイルへのDirect accessをブロックする。必ず `asWebviewUri()` で変換すること。

```typescript
const audioUri = panel.webview.asWebviewUri(
  vscode.Uri.file(path.resolve(documentDir, audioMdDoc.audioPath))
);
// → Webviewに渡して <audio src="..."> に使う
```

## エラー処理

実装を最小限にするが以下の2点は必ず対応する。

| ケース | 対応 |
|--------|------|
| 音声ファイルが存在しない | Webview内にエラーバナーを表示。拡張はクラッシュしない |
| `decodeAudioData` が失敗 | `console.error` でログ出力 + Webview内にエラーバナーを表示 |
