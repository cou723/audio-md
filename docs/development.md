# 開発環境

## ドキュメント調査方針

VS Code Extension API・Effect.ts に関わる実装前には、インターネットで最新の公式ドキュメントを確認すること。技術的な調査では一次情報を優先する。

## 技術スタック

| 種別 | 選択 |
|------|------|
| 言語 | TypeScript + Effect.ts |
| パッケージマネージャー | pnpm |
| バンドラー | esbuild |
| Markdownレンダリング | `marked`（パース）+ `DOMPurify`（XSSサニタイズ） |
| 配布 | VSCode Marketplace（`vsce publish`）+ ローカル `.vsix` |

## デバッグ方針

Webviewの `console.log` をExtension Host経由でファイルに書き出す。Codexはシェルで `tail` して読む。

**Webview側（必ず実装すること）**
```typescript
const vscode = acquireVsCodeApi();
(['log', 'warn', 'error'] as const).forEach(level => {
  const orig = console[level];
  console[level] = (...args: unknown[]) => {
    orig(...args);
    vscode.postMessage({ type: 'log', level, args: args.map(String) });
  };
});
```

**Extension Host側**
```typescript
import * as fs from 'fs';
import * as path from 'path';

const logFile = path.join(context.extensionPath, 'webview-debug.log');
panel.webview.onDidReceiveMessage(msg => {
  if (msg.type === 'log') {
    // ログが5MBを超えたらローテート
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5_000_000) {
      fs.writeFileSync(logFile, '');
    }
    fs.appendFileSync(logFile, `[${msg.level}] ${msg.args.join(' ')}\n`);
  }
});
```

**Codexの確認コマンド**
```bash
tail -f webview-debug.log
```
