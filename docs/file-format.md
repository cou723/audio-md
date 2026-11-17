# ファイル形式仕様

## 拡張子

```
*.audionote.md
*.audiomd.md
```

両方の拡張子をサポートする（後方互換性のため `.audionote.md` を維持しつつ、新規は `.audiomd.md` を推奨）。
通常のMarkdownのスーパーセット。Markdownレンダラーでそのまま開いても壊れない。

## 構文

```markdown
---
audio: ./track.mp3
---

[0:10](#t=10) コメントA
ラベルなしコメント

[1:30](#t=90) コメントB

[1:30-1:45](#t=90,105) 範囲コメント
```

## パース規則

タイムスタンプ行の検出は以下の正規表現を使う：

```
/^\[([^\]]*)\]\(#t=(\d+)(?:,(\d+))?\)/
```

| 要素 | 規則 |
|------|------|
| Front Matter | ファイル先頭の `---` で囲まれた YAML のみ有効 |
| 音声参照 | Front Matter の `audio` に相対パスを文字列で指定 |
| タイムスタンプ行 | 上記正規表現に一致する行 |
| ブロック開始 | タイムスタンプ行が出現した時点で新規ブロック開始 |
| ブロック継続 | 次のタイムスタンプ行が出るまでの全行を含む（空行も含む） |
| Markdown構文 | パーサーはプレーンテキストとして格納する。ビューワーが `marked` でレンダリングする |
| 暗黙の先頭ブロック | 最初のタイムスタンプより前のコンテンツは `t=0` 扱い |
| 範囲の終了秒 | **含む**（`#t=90,105` は90秒以上105秒以下） |

## 内部表現（パース結果の型）

```typescript
import { Schema } from '@effect/schema';

const AudioMDBlock = Schema.Struct({
  t:    Schema.Number,
  end:  Schema.NullOr(Schema.Number),
  text: Schema.String,
});

const AudioMDDocument = Schema.Struct({
  audioPath: Schema.String,
  blocks:    Schema.Array(AudioMDBlock),
});

type AudioMDBlock    = Schema.Schema.Type<typeof AudioMDBlock>;
type AudioMDDocument = Schema.Schema.Type<typeof AudioMDDocument>;
```
