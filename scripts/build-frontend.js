import { build } from 'esbuild';

await build({
  entryPoints: { playground: 'apps/playground/app.ts', overlay: 'packages/overlay/src/index.ts', review: 'packages/overlay/src/review.ts', app: 'packages/server/public/app.ts' },
  outdir: 'dist/browser', bundle: true, format: 'esm', target: 'es2022', sourcemap: true
});
console.log('Built TypeScript browser modules.');
