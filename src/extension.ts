import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseAudioNote } from './parser';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'audionote.viewer',
      new AudioNoteEditorProvider(context),
      { supportsMultipleEditorsPerDocument: false }
    )
  );
}

export function deactivate() {}

class AudioNoteEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const logFile = path.join(this.context.extensionPath, 'webview-debug.log');

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(this.context.extensionPath),
        vscode.Uri.file(path.dirname(document.uri.fsPath)),
      ],
    };

    const updateWebview = () => {
      const content = document.getText();
      const doc = parseAudioNote(content);
      const documentDir = path.dirname(document.uri.fsPath);

      let audioUri = '';
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

    webviewPanel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'log') {
        try {
          if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5_000_000) {
            fs.writeFileSync(logFile, '');
          }
          fs.appendFileSync(logFile, `[${msg.level}] ${msg.args.join(' ')}\n`);
        } catch {}
        return;
      }

      if (msg.type === 'insertTimestamp') {
        const editor = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === document.uri.toString()
        );
        if (!editor) return;

        const syntax = msg.syntax as string;
        editor.edit(eb => {
          for (const sel of editor.selections) {
            eb.replace(sel, syntax);
          }
        });
      }
    });

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });
    webviewPanel.onDidDispose(() => changeSubscription.dispose());

    updateWebview();
  }
}

function getWebviewHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  doc: ReturnType<typeof parseAudioNote>,
  audioUri: string
): string {
  const webviewJsUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'dist', 'webview.js'))
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview', 'style.css'))
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
