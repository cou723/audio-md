import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseAudioNote, AudioNoteDocument } from "./parser";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("audionote.openPreview", () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (!uri || !uri.fsPath.endsWith(".audionote.md")) return;
      openPreviewPanel(context, vscode.window.activeTextEditor!.document);
    })
  );
}

export function deactivate(): void {}

function openPreviewPanel(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
): void {
  const documentDir = path.dirname(document.uri.fsPath);
  const logFile = path.join(context.extensionPath, "webview-debug.log");

  const panel = vscode.window.createWebviewPanel(
    "audionote.viewer",
    `Audio Note: ${path.basename(document.uri.fsPath)}`,
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

  panel.webview.html = buildHtml(panel.webview, context);

  const sendDocument = () => {
    const doc = parseAudioNote(document.getText());
    const audioUri = resolveAudioUri(panel.webview, documentDir, doc);
    panel.webview.postMessage({ type: "init", document: doc, audioUri });
  };

  panel.webview.onDidReceiveMessage(msg => {
    switch ((msg as { type: string }).type) {
      case "ready":
        sendDocument();
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

  panel.onDidDispose(() => sub.dispose());
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
  <title>Audio Note</title>
  <style>${APP_CSS}</style>
</head>
<body>
${APP_HTML}
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">(function(){
    const vscode = acquireVsCodeApi();
    AudioNoteApp.init({
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
  doc: AudioNoteDocument
): string {
  if (!doc.audioPath) return "";
  const audioFile = path.resolve(documentDir, doc.audioPath);
  if (!fs.existsSync(audioFile)) return "";
  return webview.asWebviewUri(vscode.Uri.file(audioFile)).toString();
}

function writeLog(logFile: string, msg: { level: string; args: string[] }): void {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5_000_000) {
    fs.writeFileSync(logFile, "");
  }
  fs.appendFileSync(logFile, `[${msg.level}] ${msg.args.join(" ")}\n`);
}

const APP_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e1e1e;color:#d4d4d4;font-family:monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column}
#toolbar{height:44px;display:flex;align-items:center;gap:12px;padding:0 12px;background:#252526;border-bottom:1px solid #3c3c3c;flex-shrink:0}
#play-btn{background:none;border:1px solid #555;color:#d4d4d4;padding:4px 10px;cursor:pointer;border-radius:3px;font-size:14px}
#play-btn:hover{background:#3c3c3c}
#file-label{margin-left:auto;color:#888;font-size:12px}
#error-banner{display:none;background:#5a1d1d;color:#f48771;padding:8px 12px;font-size:12px;flex-shrink:0}
#main-area{display:flex;flex:1;overflow:hidden}
#wave-panel{width:160px;flex-shrink:0;overflow-y:scroll;overflow-x:hidden}
#wave-inner{position:relative;width:160px}
#wave-canvas{display:block;cursor:crosshair}
#playhead{position:absolute;left:0;right:0;height:2px;background:#f44747;pointer-events:none;z-index:10}
#notes-panel{flex:1;overflow-y:scroll}
#notes-inner{position:relative}
.note-block{position:absolute;left:0;right:0;padding:4px 24px;line-height:1.75;font-size:13px;border-top:1px solid #3c3c3c;white-space:pre-wrap}
#wave-panel::-webkit-scrollbar,#notes-panel::-webkit-scrollbar{width:6px}
#wave-panel::-webkit-scrollbar-thumb,#notes-panel::-webkit-scrollbar-thumb{background:#555;border-radius:3px}
`;

const APP_HTML = `  <div id="toolbar">
    <button id="play-btn">&#9654;</button>
    <span id="time-display">0:00 / 0:00</span>
    <span id="file-label"></span>
  </div>
  <div id="error-banner"></div>
  <div id="main-area">
    <div id="wave-panel">
      <div id="wave-inner">
        <canvas id="wave-canvas" width="160" height="0"></canvas>
        <div id="playhead" style="top:0"></div>
      </div>
    </div>
    <div id="notes-panel">
      <div id="notes-inner"></div>
    </div>
  </div>`;

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
