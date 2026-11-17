import { describe, expect, it } from "vitest";
import { migrateLegacyAudioLine } from "../src/migration";
import { parseAudioMD } from "../src/parser";

describe("migrateLegacyAudioLine", () => {
  it("旧音声参照を Front Matter に変換する", () => {
    expect(migrateLegacyAudioLine("@audio ./track.mp3")).toBe('---\naudio: "./track.mp3"\n---');
  });

  it.each([
    "./recordings/my note.mp3",
    "./recordings/note: 01 #2.mp3",
    './recordings/"quoted".mp3',
    "./recordings/true",
    "./recordings/日本語.mp3",
    ".\\recordings\\track.mp3",
  ])("特殊文字を含むパス %s を文字列として保つ", audioPath => {
    const migrated = migrateLegacyAudioLine(`@audio ${audioPath}`);
    expect(migrated).not.toBeNull();
    expect(parseAudioMD(migrated ?? "").audioPath).toBe(audioPath);
  });

  it("旧パーサーと同じようにパスの前後の空白を取り除く", () => {
    const migrated = migrateLegacyAudioLine("@audio   ./track.mp3  ");
    expect(parseAudioMD(migrated ?? "").audioPath).toBe("./track.mp3");
  });

  it.each(["", "---", "audio: ./track.mp3", "@audio", "@audio ", "@audio \t ", " @audio ./track.mp3", "本文 @audio ./track.mp3"])(
    "旧形式の有効な音声参照でない行 %j は変換しない",
    line => {
      expect(migrateLegacyAudioLine(line)).toBeNull();
    }
  );
});
