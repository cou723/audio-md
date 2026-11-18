import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseAudioMD, type AudioMDDocument } from "./parser";
import { migrateLegacyAudioLine } from "./migration";
import type { PlayerCommand, PlayerCommandMessage } from "./webview/playerCommands";

const VOLUME_SETTING = "audio-md.volume";

// settings.json は手編集され得るため、範囲外・非数値は既定値に倒す。
function readVolume(): number {
  const value = vscode.workspace.getConfiguration().get<unknown>(VOLUME_SETTING);
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

// Global 指定にすることで、現在のプロファイルの settings.json に書かれる。
// workbench.settings.applyToAllProfiles にこのキーがある場合は、VS Code が default プロファイルへ書き込む。
async function saveVolume(volume: number): Promise<void> {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) return;
  try {
    await vscode.workspace.getConfiguration().update(VOLUME_SETTING, volume, vscode.ConfigurationTarget.Global);
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not save the AudioMD volume: ${String(error)}`);
  }
}

const NOTE_FILE_EXTENSIONS = [".audionote.md", ".audiomd.md"];

function isNoteFile(fsPath: string): boolean {
  return NOTE_FILE_EXTENSIONS.some(ext => fsPath.endsWith(ext));
}

export function activate(context: vscode.ExtensionContext): void {
  const panels = new Map<string, vscode.WebviewPanel>();
  const sendPlayerCommand = async (command: PlayerCommand): Promise<void> => {
    // Webview フォーカス時は、直前のテキストエディタではなくそのパネルを優先する。
    const activePanel = [...panels.values()].find(panel => panel.active);
    const editor = vscode.window.activeTextEditor;
    const panel = activePanel ?? (editor && isNoteFile(editor.document.uri.fsPath)
      ? panels.get(editor.document.uri.toString()) : undefined);
    if (!panel) {
      void vscode.window.showInformationMessage("Open the AudioMD preview for this note first.");
      return;
    }
    const message: PlayerCommandMessage = { type: "playerCommand", command };
    if (!await panel.webview.postMessage(message)) {
      void vscode.window.showInformationMessage("The AudioMD preview is not ready. Open it and try again.");
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("audio-md.openPreview", () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (!uri || !isNoteFile(uri.fsPath)) return;
      openPreviewPanel(context, vscode.window.activeTextEditor!.document, panels);
    }),
    vscode.commands.registerCommand("audio-md.migrateAudioReference", migrateAudioReference),
    vscode.commands.registerCommand("audio-md.seekBackward", () => sendPlayerCommand("seekBackward")),
    vscode.commands.registerCommand("audio-md.seekForward", () => sendPlayerCommand("seekForward")),
    vscode.commands.registerCommand("audio-md.togglePlayback", () => sendPlayerCommand("togglePlayback")),
    vscode.commands.registerCommand("audio-md.insertCurrentTimestamp", () => sendPlayerCommand("insertCurrentTimestamp"))
  );
}

export function deactivate(): void {}

async function migrateAudioReference(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isNoteFile(editor.document.uri.fsPath)) {
    void vscode.window.showInformationMessage("Open an .audionote.md or .audiomd.md file to migrate its audio reference.");
    return;
  }

  const firstLine = editor.document.lineAt(0);
  const frontMatter = migrateLegacyAudioLine(firstLine.text);
  if (frontMatter === null) {
    void vscode.window.showInformationMessage("No legacy @audio reference found on the first line. The file was not changed.");
    return;
  }

  const applied = await editor.edit(edit => {
    edit.replace(firstLine.range, frontMatter);
  }, { undoStopBefore: true, undoStopAfter: true });

  if (applied) {
    void vscode.window.showInformationMessage("Audio reference migrated to YAML Front Matter. Save the file to keep the change, or Undo to revert it.");
  } else {
    void vscode.window.showErrorMessage("Could not migrate the audio reference. The file was not changed.");
  }
}

function openPreviewPanel(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  panels: Map<string, vscode.WebviewPanel>
): void {
  const key = document.uri.toString();
  const existing = panels.get(key);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Beside);
    return;
  }
  const documentDir = path.dirname(document.uri.fsPath);
  const logFile = path.join(context.extensionPath, "webview-debug.log");

  const panel = vscode.window.createWebviewPanel(
    "audio-md.viewer",
    `AudioMD: ${path.basename(document.uri.fsPath)}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(documentDir),
        vscode.Uri.joinPath(context.extensionUri, "dist"),
      ],
      retainContextWhenHidden: true,
    }
  );

  panels.set(key, panel);
  panel.webview.html = buildHtml(panel.webview, context);

  let lastAudioUri = "";
  const sendDocument = () => {
    const doc = parseAudioMD(document.getText());
    const audioUri = resolveAudioUri(panel.webview, documentDir, doc);
    if (!audioUri && lastAudioUri) {
      // audioUri が突然空になった場合（フォーマッタや一時的な編集状態）は再生を中断しない
      console.warn(`[audio-md] sendDocument: audioUri が空になったためスキップ (audioPath="${doc.audioPath}", lastUri="${lastAudioUri}")`);
      return;
    }
    lastAudioUri = audioUri;
    panel.webview.postMessage({ type: "init", document: doc, audioUri });
  };

  const sendVolume = () => {
    void panel.webview.postMessage({ type: "settings", volume: readVolume() });
  };

  panel.webview.onDidReceiveMessage(msg => {
    switch ((msg as { type: string }).type) {
      case "ready":
        sendDocument();
        sendVolume();
        break;
      case "setVolume":
        void saveVolume((msg as { volume: number }).volume);
        break;
      case "log":
        writeLog(logFile, msg as { level: string; args: string[] });
        break;
      case "insertTimestamp":
        void insertTimestamp(document, (msg as { text: string }).text);
        break;
    }
  });

  const sub = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === document.uri.toString()) {
      sendDocument();
    }
  });

  // 他のプレビューや設定画面での変更も反映する。
  const configSub = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(VOLUME_SETTING)) sendVolume();
  });

  panel.onDidDispose(() => {
    panels.delete(key);
    sub.dispose();
    configSub.dispose();
  });
}

async function insertTimestamp(document: vscode.TextDocument, text: string): Promise<void> {
  const editor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === document.uri.toString()
  );

  const edit = new vscode.WorkspaceEdit();

  if (editor) {
    const sel = editor.selection;
    if (!sel.isEmpty) {
      edit.replace(document.uri, sel, text);
    } else {
      edit.insert(document.uri, sel.active, text);
    }
  } else {
    const end = document.lineAt(document.lineCount - 1).range.end;
    edit.insert(document.uri, end, "\n" + text);
  }

  await vscode.workspace.applyEdit(edit);
}

function buildHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "dist", "webview.js")
  );
  const nonce = generateNonce();
  const csp = webview.cspSource;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${csp} blob:; connect-src ${csp} blob:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AudioMD</title>
  <style>${APP_CSS}</style>
</head>
<body>
${APP_HTML}
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">(function(){
    const vscode = acquireVsCodeApi();
    AudioMDApp.init({
      onMessage: function(h){ window.addEventListener('message', function(e){ h(e.data); }); },
      postMessage: function(m){ vscode.postMessage(m); }
    });
  })();</script>
</body>
</html>`;
}

function resolveAudioUri(
  webview: vscode.Webview,
  documentDir: string,
  doc: AudioMDDocument
): string {
  if (!doc.audioPath) return "";
  const audioFile = path.resolve(documentDir, doc.audioPath);
  if (!fs.existsSync(audioFile)) return "";
  return webview.asWebviewUri(vscode.Uri.file(audioFile)).toString();
}

let logSize = 0;

function writeLog(logFile: string, msg: { level: string; args: string[] }): void {
  const line = `[${msg.level}] ${msg.args.join(" ")}\n`;
  if (logSize > 5_000_000) {
    fs.writeFileSync(logFile, "");
    logSize = 0;
  }
  fs.appendFileSync(logFile, line);
  logSize += Buffer.byteLength(line);
}

const APP_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e1e1e;color:#d4d4d4;font-family:monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column}
#app-root{display:flex;flex-direction:column;flex:1;overflow:hidden}
#toolbar{height:44px;display:flex;align-items:center;gap:12px;padding:0 12px;background:#252526;border-bottom:1px solid #3c3c3c;flex-shrink:0}
#play-btn{background:none;border:1px solid #555;color:#d4d4d4;padding:4px 10px;cursor:pointer;border-radius:3px;font-size:14px}
#play-btn:hover{background:#3c3c3c}
#volume-control{display:flex;align-items:center;gap:6px;margin-left:auto}#volume-icon{font-size:14px}#volume-slider{width:80px;cursor:pointer;accent-color:#569cd6}#file-label{color:#888;font-size:12px}
#error-banner{display:none;background:#5a1d1d;color:#f48771;padding:8px 12px;font-size:12px;flex-shrink:0}
#main-area{display:flex;flex:1;overflow:hidden}
#wave-panel{flex-shrink:0;overflow-y:scroll;overflow-x:hidden}
#wave-inner{position:relative}
#wave-canvas{display:block;cursor:crosshair}
#playhead{position:absolute;left:0;right:0;height:2px;background:#f44747;pointer-events:none;z-index:10}
#notes-panel{flex:1;overflow-y:scroll}
#notes-inner{position:relative;overflow:hidden}
.note-block{position:absolute;left:0;right:0;padding:4px 24px;line-height:1.75;font-size:13px;border-top:1px solid #3c3c3c;cursor:pointer}.note-block p{margin:0 0 0.5em}.note-block p:last-child{margin-bottom:0}.note-block ul,.note-block ol{margin:0 0 0.5em;padding-left:1.5em}.note-block blockquote{margin:0 0 0.5em;padding-left:0.75em;border-left:3px solid #555;color:#999}.note-block code{background:#2d2d2d;padding:1px 4px;border-radius:3px;font-family:monospace}.note-block pre{background:#2d2d2d;padding:8px;border-radius:3px;overflow-x:auto;margin:0 0 0.5em}.note-block pre code{background:none;padding:0}
#wave-panel::-webkit-scrollbar,#notes-panel::-webkit-scrollbar{width:6px}
#wave-panel::-webkit-scrollbar-thumb,#notes-panel::-webkit-scrollbar-thumb{background:#555;border-radius:3px}
`;

const APP_HTML = `  <div id="app-root"></div>`;

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
