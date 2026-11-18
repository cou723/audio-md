# Webview UI仕様

## スペクトログラム・レンダリング仕様

### Canvas高さ

```
全体高さ = audioDuration * PX_PER_SEC
```

想定最大10分 × 80px/sec = 48,000px。仮想スクロール不要、Canvas高さをそのまま使う。

### スペクトログラム描画

計算ロジックは DOM 非依存の `src/webview/spectrogram.ts` に置く。定数（FFT サイズ・周波数範囲・dB 範囲）と配色もそこが正本。

1. `AudioContext.decodeAudioData` で取得したチャンネルを、モノラルなら1列、2ch以上なら先頭の L・R を横に並べた2列（各 `SPECTRUM_WIDTH` = 160px）で描画する。3ch以上でも L・R のみ表示する。ステレオ時は L の周波数軸を左右反転し、低域が中央（境界）に寄るようにする（左列: 高→低、右列: 低→高。変換は `spectrumX`）。境界線と L/R ラベルを描き、左カラム全体の幅は 320px になる
2. 各チャンネルについて、Canvas の1行（1px）ごとに、その行の中心時刻を中心とした窓（Hann）で FFT する
3. 各列のX軸は周波数の対数軸（50Hz〜12kHz。サンプリングレートが低ければナイキスト周波数まで）。列ごとに隣接ビンを線形補間する
4. 強さは dBFS で求め、固定の dB 範囲を 0〜1 に正規化して配色（暗い背景から明るい色）に変換し、`ImageData` で一括描画する

### グリッド

- `PX_PER_SEC = 80`
- 5秒ごとに薄いグリッド線と時刻ラベル

## スペクトログラム クリック・ドラッグの時間計算

```typescript
// クリック位置 → 時間（スクロール込み）
const y    = event.offsetY + waveformPanel.scrollTop;
const time = y / PX_PER_SEC;

// ボタン判定：e.button === 0 が左、e.button === 2 が右
// 左クリック/ドラッグ：シークのみ（mouseup の位置を使用）
// 右クリック/ドラッグ：タイムスタンプ挿入
//   ドラッグ判定（右ボタンのみ）：5px未満は点クリック扱い
const isDrag = Math.abs(mouseupY - mousedownY) >= 5;

// 右クリックメニューを抑制する
waveCanvas.addEventListener("contextmenu", e => e.preventDefault());
```

## クリック時の挿入構文

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

## スクロール同期

左右パネルのスクロール比率を一致させる。

```typescript
// left → right
right.scrollTop = (left.scrollTop / (left.scrollHeight - left.clientHeight))
                * (right.scrollHeight - right.clientHeight);
```

相互に登録するが、同期ループを防ぐため `isSyncing` フラグで排他制御すること。

## 再生中の自動スクロール

プレイヘッドが可視領域の中央から外れた場合のみスクロールする（毎フレームジャンプしない）。

```typescript
const viewportCenter = wavePanel.scrollTop + wavePanel.clientHeight / 2;
if (Math.abs(playheadY - viewportCenter) > wavePanel.clientHeight * 0.3) {
  wavePanel.scrollTop = playheadY - wavePanel.clientHeight / 2;
}
```

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
