# audionote — VSCode拡張機能 仕様書

> ClaudeCode向けの実装指示書。この文書に書かれていない判断は、最もシンプルな実装を選ぶこと。

---

## 開発環境

### 必須MCPサーバー

| MCP | 用途 |
|-----|------|
| Context7 | VSCode Extension API・Effect.ts の最新ドキュメント取得。実装前に必ず参照すること |

### 技術スタック

| 種別 | 選択 |
|------|------|
| 言語 | TypeScript + Effect.ts |
| パッケージマネージャー | pnpm |
| バンドラー | esbuild |
| 配布 | ローカル `.vsix` のみ（Marketplace公開不要） |

### デバッグ方針

Webviewの `console.log` をExtension Host経由でファイルに書き出す。ClaudeCodeはbashで `tail` して読む。

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

**ClaudeCodeの確認コマンド**
```bash
tail -f webview-debug.log
```

---

## ディレクトリ構成

```
audionote/
├── src/
│   ├── extension.ts          # Extension Host エントリポイント
│   ├── parser.ts             # .audionote.md パーサー（Effect.ts使用）
│   └── webview/
│       ├── index.html        # Webviewのシェル（VSCode用）
│       ├── standalone.html   # ブラウザ単体動作用（開発・デバッグ用）
│       ├── main.ts           # Webview側JS（VSCode依存を含めない）
│       └── style.css
├── CLAUDE.md
├── esbuild.mjs               # Extension Host用とWebview用でターゲットを分ける
├── package.json
└── tsconfig.json
```

### 再利用性の原則

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

---

## VSCode拡張登録

`.audionote.md` はデフォルトでテキストエディタで開く。
ビュワーはコマンド経由でテキストエディタの右隣に開く（Markdown プレビューと同じ動作）。

`package.json` に以下を含めること:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "audionote.openPreview",
        "title": "Open Audio Note Preview",
        "icon": "$(open-preview)"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "audionote.openPreview",
          "when": "resourceFilename =~ /\\.audionote\\.md$/",
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

---

## ファイル形式仕様

### 拡張子

```
*.audionote.md
```

通常のMarkdownのスーパーセット。Markdownレンダラーでそのまま開いても壊れない。

### 構文

```markdown
@audio ./track.mp3

[0:10](#t=10) コメントA
ラベルなしコメント

[1:30](#t=90) コメントB

[1:30-1:45](#t=90,105) 範囲コメント
```

### パース規則

タイムスタンプ行の検出は以下の正規表現を使う：

```
/^\[([^\]]*)\]\(#t=(\d+)(?:,(\d+))?\)/
```

| 要素 | 規則 |
|------|------|
| 音声参照 | **1行目のみ有効**。`@audio <相対パス>` |
| タイムスタンプ行 | 上記正規表現に一致する行 |
| ブロック開始 | タイムスタンプ行が出現した時点で新規ブロック開始 |
| ブロック継続 | 次のタイムスタンプ行が出るまでの全行を含む（空行も含む） |
| Markdown構文 | プレーンテキストとして扱う（パーサーは解釈しない） |
| 暗黙の先頭ブロック | 最初のタイムスタンプより前のコンテンツは `t=0` 扱い |
| 範囲の終了秒 | **含む**（`#t=90,105` は90秒以上105秒以下） |

### 内部表現（パース結果の型）

```typescript
import { Schema } from '@effect/schema';

const AudioNoteBlock = Schema.Struct({
  t:    Schema.Number,
  end:  Schema.NullOr(Schema.Number),
  text: Schema.String,
});

const AudioNoteDocument = Schema.Struct({
  audioPath: Schema.String,
  blocks:    Schema.Array(AudioNoteBlock),
});

type AudioNoteBlock    = Schema.Schema.Type<typeof AudioNoteBlock>;
type AudioNoteDocument = Schema.Schema.Type<typeof AudioNoteDocument>;
```

---

## 機能要件

### 実装する機能（最低限）

1. エディタタイトルバーのボタン押下時、テキストエディタの右隣に Webview パネルを起動する（テキストエディタは残す）
2. 左カラム（160px固定）：音声波形を縦描画（Y軸＝時間）
3. 右カラム（残り全幅）：ブロックテキストを波形と対応するY位置に表示
4. ツールバー：再生・一時停止、現在時刻 / 総時間の表示
5. 波形クリック → 該当秒から再生 + エディタのカーソル位置にタイムスタンプ構文を挿入
6. 波形ドラッグ → 範囲タイムスタンプ構文を挿入
7. 左右カラムのスクロール同期
8. 再生中は波形を自動スクロールしてプレイヘッドを追う
9. Webview console.log をlogファイルへ書き出す（デバッグ用）

### 実装しない機能

- Webviewでのノート編集（読み取り専用）
- ノートクリックによるシーク
- ファイルの自動保存（VSCodeの手動保存のみ）
- バリデーション（ファイルサイズ・フォーマット検証不要）

---

## UIレイアウト

```
┌─────────────────────────────────────────────────┐
│ ▶  0:00 / 3:45                    track.mp3     │  ← ツールバー (44px)
├──────────────┬──────────────────────────────────┤
│              │                                  │
│   波形        │  コメントA                        │  ← top: 10 * 80px
│  (Canvas)    │  ラベルなしコメント                │
│   縦描画      │                                  │
│   Y軸=時間    │  コメントB                        │  ← top: 90 * 80px
│              │                                  │
│              │  範囲コメント                      │  ← top: 90 * 80px
│              │                                  │
└──────────────┴──────────────────────────────────┘
    160px固定          残り全幅
```

---

## 波形レンダリング仕様

### Canvas高さ

```
全体高さ = audioDuration * PX_PER_SEC
```

想定最大10分 × 80px/sec = 48,000px。仮想スクロール不要、Canvas高さをそのまま使う。

### 波形データ取得

```typescript
// 1. AudioContext.decodeAudioData で Float32Array を取得
// 2. モノラルにダウンミックス（チャンネルが複数ある場合は平均）
// 3. ピークデータを間引く（描画高さ1pxあたり1ピーク値）
const channelData: Float32Array = buffer.getChannelData(0); // ch0のみ使用
```

### グリッド

- `PX_PER_SEC = 80`
- 5秒ごとに薄いグリッド線と時刻ラベル

---

## 波形クリック・ドラッグの時間計算

```typescript
// クリック位置 → 時間（スクロール込み）
const y    = event.offsetY + waveformPanel.scrollTop;
const time = y / PX_PER_SEC;

// ドラッグ範囲
// mousedown → startTime
// mouseup   → endTime
// 5px未満のドラッグは点クリック扱い
const isDrag = Math.abs(mouseupY - mousedownY) >= 5;
```

---

## 波形クリック時の挿入構文

エディタへの挿入は最初のカーソル位置のみ使用。選択範囲がある場合は置換。

```
// 点クリック
[1:30](#t=90) 

// 範囲ドラッグ
[1:30-1:45](#t=90,105) 
```

ラベルはタイムスタンプ文字列をそのまま使う（ユーザーが後で書き換える想定）。

### 時刻フォーマット関数

```typescript
function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
```

---

## スクロール同期

左右パネルのスクロール比率を一致させる。

```typescript
// left → right
right.scrollTop = (left.scrollTop / (left.scrollHeight - left.clientHeight))
                * (right.scrollHeight - right.clientHeight);
```

相互に登録するが、同期ループを防ぐため `isSyncing` フラグで排他制御すること。

---

## 再生中の自動スクロール

プレイヘッドが可視領域の中央から外れた場合のみスクロールする（毎フレームジャンプしない）。

```typescript
const viewportCenter = wavePanel.scrollTop + wavePanel.clientHeight / 2;
if (Math.abs(playheadY - viewportCenter) > wavePanel.clientHeight * 0.3) {
  wavePanel.scrollTop = playheadY - wavePanel.clientHeight / 2;
}
```

---

## ノートカラムのレイアウト

各ブロックは絶対配置。

```css
.note-block {
  position: absolute;
  top: calc(var(--t) * 80px);  /* --t はブロックの開始秒 */
  left: 0;
  right: 0;
  padding: 4px 24px;
  line-height: 1.75;
}
```

---

## 音声ファイルのWebview参照

VSCode WebviewはローカルファイルへのDirect accessをブロックする。必ず `asWebviewUri()` で変換すること。

```typescript
const audioUri = panel.webview.asWebviewUri(
  vscode.Uri.file(path.resolve(documentDir, audioNoteDoc.audioPath))
);
// → Webviewに渡して <audio src="..."> に使う
```

---

## エラー処理

実装を最小限にするが以下の2点は必ず対応する。

| ケース | 対応 |
|--------|------|
| 音声ファイルが存在しない | Webview内にエラーバナーを表示。拡張はクラッシュしない |
| `decodeAudioData` が失敗 | `console.error` でログ出力 + Webview内にエラーバナーを表示 |
