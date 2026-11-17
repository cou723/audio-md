import type * as vscode from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../package.json";

const mocks = vi.hoisted(() => ({
  commands: new Map<string, () => unknown>(),
  panels: [] as {
    active: boolean;
    reveal: ReturnType<typeof vi.fn>;
    onDidDispose: ReturnType<typeof vi.fn>;
    webview: {
      html: string;
      cspSource: string;
      asWebviewUri: ReturnType<typeof vi.fn>;
      postMessage: ReturnType<typeof vi.fn>;
      onDidReceiveMessage: ReturnType<typeof vi.fn>;
    };
  }[],
  workspace: { onDidChangeTextDocument: vi.fn(), applyEdit: vi.fn() },
  window: {
    activeTextEditor: undefined as ReturnType<typeof editor> | undefined,
    visibleTextEditors: [] as ReturnType<typeof editor>[],
    createWebviewPanel: vi.fn(),
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
  workspace: mocks.workspace,
  ViewColumn: { Beside: -2 },
  Uri: { file: (fsPath: string) => ({ fsPath }), joinPath: () => ({}) },
  WorkspaceEdit: class {
    insert = vi.fn();
    replace = vi.fn();
  },
}));
import { activate } from "../src/extension";

function editor(fsPath = "/notes/test.audiomd.md") {
  return {
    document: {
      uri: { fsPath, toString: () => fsPath },
      getText: () => "---\naudio: ./track.mp3\n---",
    },
    selection: { isEmpty: true, active: { line: 3, character: 0 } },
  };
}

async function run(name: string) {
  const command = mocks.commands.get("audio-md." + name);
  expect(command).toBeDefined();
  return await command?.();
}

async function preview(fsPath = "/notes/test.audiomd.md") {
  mocks.panels.forEach(panel => { panel.active = false; });
  mocks.window.activeTextEditor = editor(fsPath);
  await run("openPreview");
  return mocks.panels.at(-1)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.commands.clear();
  mocks.panels.length = 0;
  mocks.window.activeTextEditor = undefined;
  mocks.window.visibleTextEditors = [];
  mocks.workspace.onDidChangeTextDocument.mockReturnValue({ dispose: vi.fn() });
  mocks.workspace.applyEdit.mockResolvedValue(true);
  mocks.window.createWebviewPanel.mockImplementation(() => {
    const panel = {
      active: true,
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
      webview: {
        html: "",
        cspSource: "test",
        asWebviewUri: vi.fn(() => ({ toString: () => "test" })),
        postMessage: vi.fn().mockResolvedValue(true),
        onDidReceiveMessage: vi.fn(),
      },
    };
    mocks.panels.push(panel);
    return panel;
  });
  activate({ subscriptions: [], extensionUri: {}, extensionPath: "/extension" } as unknown as vscode.ExtensionContext);
});

describe("playback command routing", () => {
  it.each(["seekBackward", "seekForward", "togglePlayback", "insertCurrentTimestamp"])("sends %s from the note editor", async command => {
    const panel = await preview();
    panel.active = false;
    await run(command);
    expect(panel.webview.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "playerCommand", command });
  });

  it("uses the active preview even if the previous text editor is a different note", async () => {
    const first = await preview("/notes/a.audiomd.md");
    const second = await preview("/notes/b.audiomd.md");
    mocks.window.activeTextEditor = editor("/notes/a.audiomd.md");
    await run("seekForward");
    expect(second.webview.postMessage).toHaveBeenCalledOnce();
    expect(first.webview.postMessage).not.toHaveBeenCalled();
  });

  it("uses the preview's document when no text editor is active", async () => {
    const panel = await preview();
    mocks.window.activeTextEditor = undefined;
    await run("togglePlayback");
    expect(panel.webview.postMessage).toHaveBeenCalledOnce();
  });

  it("does not control another note's preview", async () => {
    const panel = await preview("/notes/a.audiomd.md");
    panel.active = false;
    mocks.window.activeTextEditor = editor("/notes/b.audiomd.md");
    await run("seekBackward");
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(mocks.window.showInformationMessage).toHaveBeenCalledOnce();
  });

  it("does not control playback from ordinary Markdown", async () => {
    const panel = await preview();
    panel.active = false;
    mocks.window.activeTextEditor = editor("/notes/README.md");
    await run("togglePlayback");
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
  });

  it.each([undefined, "/notes/test.audiomd.md"])("guides the user if no preview exists (%s)", async fsPath => {
    mocks.window.activeTextEditor = fsPath ? editor(fsPath) : undefined;
    await run("insertCurrentTimestamp");
    expect(mocks.window.showInformationMessage).toHaveBeenCalledOnce();
  });

  it("reuses a note's existing preview to avoid ambiguous playback targets", async () => {
    const panel = await preview();
    await run("openPreview");
    expect(mocks.window.createWebviewPanel).toHaveBeenCalledOnce();
    expect(panel.reveal).toHaveBeenCalledOnce();
  });

  it("removes disposed previews and unsubscribes from document updates", async () => {
    const panel = await preview();
    const subscription = mocks.workspace.onDidChangeTextDocument.mock.results[0]!.value;
    panel.onDidDispose.mock.calls[0]![0]();
    panel.active = false;
    await run("seekForward");
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(subscription.dispose).toHaveBeenCalledOnce();
    await run("openPreview");
    expect(mocks.window.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("reports undeliverable commands", async () => {
    const panel = await preview();
    panel.webview.postMessage.mockResolvedValue(false);
    await run("togglePlayback");
    expect(mocks.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("not ready"));
  });

  it("inserts a received timestamp into the source note, not the other active editor", async () => {
    const panel = await preview("/notes/a.audiomd.md");
    mocks.window.visibleTextEditors = [mocks.window.activeTextEditor];
    mocks.window.activeTextEditor = editor("/notes/b.audiomd.md");
    panel.webview.onDidReceiveMessage.mock.calls[0]![0]({ type: "insertTimestamp", text: "[0:12](#t=12) " });
    const edit = mocks.workspace.applyEdit.mock.calls[0]![0];
    expect(edit.insert).toHaveBeenCalledWith(expect.objectContaining({ fsPath: "/notes/a.audiomd.md" }),
      { line: 3, character: 0 }, "[0:12](#t=12) ");
  });

  it("replaces the source selection when a timestamp is inserted", async () => {
    const panel = await preview();
    mocks.window.activeTextEditor.selection.isEmpty = false;
    mocks.window.visibleTextEditors = [mocks.window.activeTextEditor];
    panel.webview.onDidReceiveMessage.mock.calls[0]![0]({ type: "insertTimestamp", text: "[0:12](#t=12) " });
    const edit = mocks.workspace.applyEdit.mock.calls[0]![0];
    expect(edit.replace).toHaveBeenCalledWith(mocks.window.activeTextEditor.document.uri,
      mocks.window.activeTextEditor.selection, "[0:12](#t=12) ");
  });
});

describe("default keybindings", () => {
  it("registers four distinct shortcuts limited to note editors and AudioMD previews", () => {
    const bindings = manifest.contributes.keybindings;
    expect(bindings.map(binding => binding.key).sort()).toEqual(["ctrl+alt+i", "ctrl+alt+j", "ctrl+alt+k", "ctrl+alt+l"]);
    for (const binding of bindings) {
      expect(mocks.commands.has(binding.command)).toBe(true);
      expect(manifest.contributes.commands.some(command => command.command === binding.command)).toBe(true);
      expect(binding.when).toContain("editorTextFocus");
      expect(binding.when).toContain("audionote|audiomd");
      expect(binding.when).toContain("activeWebviewPanelId == 'audio-md.viewer'");
    }
  });
});
