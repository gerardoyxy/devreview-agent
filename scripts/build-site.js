import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/site/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../apps/site/public/', import.meta.url), output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['apps/site/site.ts', 'apps/site/site.css'],
  outdir: 'dist/site/assets',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  external: ['*.woff2']
});
await writeFile(new URL('.nojekyll', output), '');
console.log('Built the static NudgeThis landing in dist/site (no Rust runtime required).');
