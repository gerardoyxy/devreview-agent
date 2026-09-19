import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildMobileIcons } from './build-brand.js';
import { buildDocs } from './build-docs.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/site/', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version)) throw new Error('Invalid release version');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../apps/site/public/', import.meta.url), output, { recursive: true });
await cp(new URL('../assets/brand/nudgethis-icon.svg', import.meta.url), new URL('assets/favicon.svg', output));
await cp(new URL('../assets/brand/nudgethis.svg', import.meta.url), new URL('assets/nudgethis.svg', output));
await buildMobileIcons(new URL('assets/', output));
for (const name of ['install.sh', 'install.ps1']) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  await writeFile(new URL(name, output), source.replaceAll('@VERSION@', version));
}
await buildDocs(root, fileURLToPath(output), version);
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
