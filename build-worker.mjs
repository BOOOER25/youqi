import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['cutout-worker.source.js'],
  outfile: 'cutout-worker.js',
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  minify: true,
  legalComments: 'linked'
});
await copyFile('node_modules/@imgly/background-removal/LICENSE.md', 'LICENSE.md');
console.log('Built standalone background-removal worker.');
