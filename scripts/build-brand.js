import { Resvg } from '@resvg/resvg-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

/** Export mobile icons from the canonical SVG, with no separately maintained artwork. */
export async function buildMobileIcons(output) {
  const source = await readFile(new URL('../assets/brand/nudgethis-icon.svg', import.meta.url), 'utf8');
  // Standalone raster icons use the brand defaults; inline app SVGs remain themeable.
  const svg = source.replace(/var\(--nt-logo-[a-z-]+,\s*(#[\da-f]{6})\)/gi, '$1');
  await mkdir(output, { recursive: true });
  for (const [name, size, opaque] of [
    ['favicon-32.png', 32, false],
    ['apple-touch-icon.png', 180, true],
    ['icon-192.png', 192, true],
    ['icon-512.png', 512, true]
  ]) {
    const renderer = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      ...(opaque ? { background: '#2147cc' } : {}),
      font: { loadSystemFonts: false }
    });
    await writeFile(new URL(name, output), renderer.render().asPng());
  }
}
