import { describe, expect, it } from "vitest";
import { parseAudioMD } from "../src/parser";

describe("parseAudioMD", () => {
  it("YAML Front Matter の audio と本文をパースする", () => {
    const document = parseAudioMD(`---
audio: "./recordings/note:01.mp3"
---

[0:10](#t=10) コメント
[0:20-0:30](#t=20,30) 範囲コメント`);

    expect(document).toEqual({
      audioPath: "./recordings/note:01.mp3",
      blocks: [
        { t: 10, end: null, text: " コメント" },
        { t: 20, end: 30, text: " 範囲コメント" },
      ],
    });
  });

  it("CRLF の Front Matter をパースする", () => {
    const document = parseAudioMD("---\r\naudio: ./track.mp3\r\n---\r\n[0:01](#t=1) note");

    expect(document.audioPath).toBe("./track.mp3");
    expect(document.blocks).toEqual([{ t: 1, end: null, text: " note" }]);
  });

  it("旧 @audio 構文を音声参照として扱わない", () => {
    const document = parseAudioMD("@audio ./legacy.mp3\n\n[0:01](#t=1) note");

    expect(document.audioPath).toBe("");
  });

  it("audio が文字列でない場合は音声参照を空にする", () => {
    const document = parseAudioMD("---\naudio: 123\n---\n[0:01](#t=1) note");

    expect(document.audioPath).toBe("");
    expect(document.blocks).toHaveLength(1);
  });
});
