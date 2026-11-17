import type * as vscode from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAudioMD } from "../src/parser";

const mocks = vi.hoisted(() => ({
  commands: new Map<string, () => unknown>(),
  window: {
    activeTextEditor: undefined as {
      document: {
        uri: { fsPath: string };
        lineAt: (line: number) => { text: string; range: object };
      };
      edit: ReturnType<typeof vi.fn>;
    } | undefined,
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((name: string, callback: () => unknown) => {
      mocks.commands.set(name, callback);
      return { dispose: vi.fn() };
    }),
  },
  window: mocks.window,
}));

import { activate } from "../src/extension";

function openEditor(content: string, fsPath = "/notes/test.audiomd.md", applyEdit = true) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const firstLine = content.split(eol)[0] ?? "";
  const range = { start: { line: 0, character: 0 }, end: { line: 0, character: firstLine.length } };
  let text = content;
  const replace = vi.fn((editRange: object, replacement: string) => {
    expect(editRange).toBe(range);
    text = replacement.replace(/\r?\n/g, eol) + content.slice(firstLine.length);
  });
  const edit = vi.fn(async (callback: (builder: { replace: typeof replace }) => void) => {
    if (applyEdit) callback({ replace });
    return applyEdit;
  });
  mocks.window.activeTextEditor = {
    document: {
      uri: { fsPath },
      lineAt: (line: number) => {
        expect(line).toBe(0);
        return { text: firstLine, range };
      },
    },
    edit,
  };
  return { edit, replace, getText: () => text };
}

async function migrate() {
  const command = mocks.commands.get("audio-md.migrateAudioReference");
  expect(command).toBeDefined();
  await command?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.commands.clear();
  mocks.window.activeTextEditor = undefined;
  // コマンド登録に必要な ExtensionContext の部分だけをモックする。
  const subscriptions: vscode.ExtensionContext["subscriptions"] = [];
  activate({ subscriptions } as vscode.ExtensionContext);
});

describe("audio-md.migrateAudioReference", () => {
  it.each([".audionote.md", ".audiomd.md"])("%s の先頭行だけを変換する", async extension => {
    const body = "\n\n[0:10](#t=10) コメント\n\n```\n@audio ./example.mp3\n```\n";
    const editor = openEditor(`@audio ./track.mp3${body}`, `/notes/test${extension}`);
    await migrate();

    expect(editor.getText()).toBe(`---\naudio: "./track.mp3"\n---${body}`);
    expect(parseAudioMD(editor.getText()).audioPath).toBe("./track.mp3");
    expect(editor.edit).toHaveBeenCalledWith(expect.any(Function), { undoStopBefore: true, undoStopAfter: true });
    expect(editor.replace).toHaveBeenCalledTimes(1);
    expect(mocks.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it("CRLF の本文と改行を保つ", async () => {
    const body = "\r\n\r\n[0:01](#t=1) note\r\n";
    const editor = openEditor(`@audio ./track.mp3${body}`);
    await migrate();
    expect(editor.getText()).toBe(`---\r\naudio: "./track.mp3"\r\n---${body}`);
  });

  it("末尾改行のない旧音声参照だけのファイルを変換する", async () => {
    const editor = openEditor("@audio ./track.mp3");
    await migrate();
    expect(editor.getText()).toBe('---\naudio: "./track.mp3"\n---');
  });

  it.each([
    '---\naudio: "./track.mp3"\n---\n[0:01](#t=1) note',
    "# title\n@audio ./track.mp3\n[0:01](#t=1) note",
    "",
    "@audio ",
  ])("移行済みまたは旧参照のないファイル %j は変更しない", async content => {
    const editor = openEditor(content);
    await migrate();
    expect(editor.edit).not.toHaveBeenCalled();
    expect(editor.getText()).toBe(content);
    expect(mocks.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("not changed"));
  });

  it("通常の Markdown ファイルは変更しない", async () => {
    const editor = openEditor("@audio ./track.mp3", "/notes/README.md");
    await migrate();
    expect(editor.edit).not.toHaveBeenCalled();
  });

  it("エディタがない場合は案内する", async () => {
    await migrate();
    expect(mocks.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("Open an .audionote.md"));
  });

  it("編集失敗時は成功扱いにしない", async () => {
    const editor = openEditor("@audio ./track.mp3", "/notes/test.audiomd.md", false);
    await migrate();
    expect(editor.getText()).toBe("@audio ./track.mp3");
    expect(mocks.window.showErrorMessage).toHaveBeenCalledOnce();
    expect(mocks.window.showInformationMessage).not.toHaveBeenCalled();
  });
});
