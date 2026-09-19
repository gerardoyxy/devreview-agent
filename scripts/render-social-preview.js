import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// Run after editing the artwork; normal site builds use the committed PNG.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NUDGETHIS_BROWSER_PATH ? { executablePath: process.env.NUDGETHIS_BROWSER_PATH } : {})
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(new URL('../assets/brand/social-preview.html', import.meta.url).href);
  const assetsLoaded = await page.evaluate(async () => {
    const fonts = await Promise.all([400, 700, 900].map(weight => document.fonts.load(`${weight} 24px Archivo`)));
    await Promise.all([...document.images].map(image => image.decode()));
    return fonts.every(loaded => loaded.length > 0);
  });
  if (!assetsLoaded) throw new Error('The bundled Archivo fonts could not be loaded.');
  await page.locator('.card').screenshot({
    path: fileURLToPath(new URL('../apps/site/public/assets/social-preview.png', import.meta.url))
  });
  console.log('Rendered the 1200 × 630 social preview.');
} finally {
  await browser.close();
}
