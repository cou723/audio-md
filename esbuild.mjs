import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--watch');

const base = {
  bundle: true,
  sourcemap: isDev,
  minify: !isDev,
};

async function build() {
  const extCtx = await esbuild.context({
    ...base,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  });

  const webCtx = await esbuild.context({
    ...base,
    entryPoints: ['src/webview/main.tsx'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    globalName: 'AudioMDApp',
    jsx: 'automatic',
    jsxImportSource: 'preact',
  });

  if (isDev) {
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('Watching...');
  } else {
    await Promise.all([extCtx.rebuild(), webCtx.rebuild()]);
    await Promise.all([extCtx.dispose(), webCtx.dispose()]);
    console.log('Build complete');
  }
}

build().catch(err => { console.error(err); process.exit(1); });
