# audionote

VSCode拡張機能。`.audionote.md` ファイルを音声波形付きのカスタムエディタで表示する。

## Build

```bash
npm install
npm run build
```

## Package

```bash
npm run package
# → audionote-0.0.1.vsix が生成される
```

## Debug log

Webviewのconsole出力は `webview-debug.log` に書き出される:

```bash
tail -f webview-debug.log
```

## Tech stack

- TypeScript + Effect.ts
- esbuild (Extension Host: node/cjs, Webview: browser/iife)
- VSCode Custom Editor API
