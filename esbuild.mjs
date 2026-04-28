import * as esbuild from 'esbuild';
import { argv } from 'process';

const isWatch = argv.includes('--watch');

const baseConfig = {
  bundle: true,
  minify: false,
  sourcemap: true,
};

// Extension Host bundle (Node.js target)
const extensionBuild = esbuild.build({
  ...baseConfig,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  format: 'cjs',
});

// Webview bundle (browser target)
const webviewBuild = esbuild.build({
  ...baseConfig,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  globalName: 'AudioNoteWebview',
});

if (isWatch) {
  const [extCtx, webCtx] = await Promise.all([
    esbuild.context({
      ...baseConfig,
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/extension.js',
      platform: 'node',
      target: 'node18',
      external: ['vscode'],
      format: 'cjs',
    }),
    esbuild.context({
      ...baseConfig,
      entryPoints: ['src/webview/main.ts'],
      outfile: 'dist/webview.js',
      platform: 'browser',
      target: 'es2020',
      format: 'iife',
      globalName: 'AudioNoteWebview',
    }),
  ]);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log('Watching...');
} else {
  await Promise.all([extensionBuild, webviewBuild]);
  console.log('Build complete');
}
