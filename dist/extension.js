"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// src/parser.ts
var TIMESTAMP_RE = /^\[([^\]]*)\]\(#t=(\d+)(?:,(\d+))?\)/;
function parseAudioNote(content) {
  const lines = content.split("\n");
  let audioPath = "";
  const firstLine = lines[0]?.trim() ?? "";
  const audioMatch = firstLine.match(/^@audio\s+(.+)$/);
  if (audioMatch) {
    audioPath = audioMatch[1].trim();
  }
  const blocks = [];
  let currentBlock = null;
  let preamble = "";
  let hasSeen = false;
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && audioMatch)
      continue;
    const line = lines[i];
    const tsMatch = line.match(TIMESTAMP_RE);
    if (tsMatch) {
      if (!hasSeen && preamble.trim()) {
        blocks.push({ t: 0, end: null, text: preamble.trimEnd() });
      }
      hasSeen = true;
      if (currentBlock) {
        currentBlock.text = currentBlock.text.trimEnd();
        blocks.push(currentBlock);
      }
      const t = parseInt(tsMatch[2], 10);
      const end = tsMatch[3] != null ? parseInt(tsMatch[3], 10) : null;
      const rest = line.slice(tsMatch[0].length);
      currentBlock = { t, end, text: rest };
    } else if (!hasSeen) {
      preamble += line + "\n";
    } else if (currentBlock) {
      currentBlock.text += "\n" + line;
    }
  }
  if (!hasSeen && preamble.trim()) {
    blocks.push({ t: 0, end: null, text: preamble.trimEnd() });
  }
  if (currentBlock) {
    currentBlock.text = currentBlock.text.trimEnd();
    blocks.push(currentBlock);
  }
  return { audioPath, blocks };
}

// src/extension.ts
function activate(context) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "audionote.viewer",
      new AudioNoteEditorProvider(context),
      { supportsMultipleEditorsPerDocument: false }
    )
  );
}
function deactivate() {
}
var AudioNoteEditorProvider = class {
  constructor(context) {
    this.context = context;
  }
  async resolveCustomTextEditor(document, webviewPanel) {
    const logFile = path.join(this.context.extensionPath, "webview-debug.log");
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(this.context.extensionPath),
        vscode.Uri.file(path.dirname(document.uri.fsPath))
      ]
    };
    const updateWebview = () => {
      const content = document.getText();
      const doc = parseAudioNote(content);
      const documentDir = path.dirname(document.uri.fsPath);
      let audioUri = "";
      if (doc.audioPath) {
        const audioFsPath = path.resolve(documentDir, doc.audioPath);
        audioUri = webviewPanel.webview.asWebviewUri(
          vscode.Uri.file(audioFsPath)
        ).toString();
      }
      webviewPanel.webview.html = getWebviewHtml(
        webviewPanel.webview,
        this.context,
        doc,
        audioUri
      );
    };
    webviewPanel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "log") {
        try {
          if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5e6) {
            fs.writeFileSync(logFile, "");
          }
          fs.appendFileSync(logFile, `[${msg.level}] ${msg.args.join(" ")}
`);
        } catch {
        }
        return;
      }
      if (msg.type === "insertTimestamp") {
        const editor = vscode.window.visibleTextEditors.find(
          (e) => e.document.uri.toString() === document.uri.toString()
        );
        if (!editor)
          return;
        const syntax = msg.syntax;
        editor.edit((eb) => {
          for (const sel of editor.selections) {
            eb.replace(sel, syntax);
          }
        });
      }
    });
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });
    webviewPanel.onDidDispose(() => changeSubscription.dispose());
    updateWebview();
  }
};
function getWebviewHtml(webview, context, doc, audioUri) {
  const webviewJsUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, "dist", "webview.js"))
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, "src", "webview", "style.css"))
  );
  const docJson = JSON.stringify(doc);
  const audioUriJson = JSON.stringify(audioUri);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${webview.cspSource} blob:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Audio Note</title>
</head>
<body>
  <div id="app"></div>
  <script src="${webviewJsUri}"></script>
  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      (['log', 'warn', 'error']).forEach(level => {
        const orig = console[level];
        console[level] = (...args) => {
          orig(...args);
          vscode.postMessage({ type: 'log', level, args: args.map(String) });
        };
      });

      const bridge = {
        onMessage: (handler) => {
          window.addEventListener('message', e => handler(e.data));
        },
        postMessage: (msg) => {
          vscode.postMessage(msg);
        }
      };

      AudioNoteWebview.init(
        document.getElementById('app'),
        bridge,
        ${docJson},
        ${audioUriJson}
      );
    })();
  </script>
</body>
</html>`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
