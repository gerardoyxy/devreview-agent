import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
const options = { timeout: 90000, skip: !process.env.NUDGETHIS_TEST_BROWSER && 'Set NUDGETHIS_TEST_BROWSER for browser checks' };
test('Landing profiles select distinct animations, freeze hidden motion and support phone and reduced motion', options, async t => {
  const root = fileURLToPath(new URL('../dist/site/', import.meta.url));
  const server = createServer(async (req, res) => { try { const url = new URL(req.url, 'http://localhost'), file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname); if (!file.startsWith(root)) throw new Error(); const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }; res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); } catch { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({ executablePath: process.env.NUDGETHIS_TEST_BROWSER, headless: true, args: ['--no-sandbox'] }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const profile of ['idea', 'code', 'ai']) {
    await page.locator(`button[data-profile=${profile}]`).click();
    const scene = page.locator(`[data-profile-scene=${profile}]`); assert(await scene.isVisible());
    assert.equal(await page.locator('[data-profile-scene]:not([hidden])').count(), 1);
    assert.equal(await page.locator('[data-profile-scene][hidden][data-running=true]').count(), 0);
    const steps = scene.locator(profile === 'ai' ? '[data-demo-step]' : '[data-journey-step]');
    await steps.nth(3).click(); assert.equal(await steps.nth(3).getAttribute('aria-current'), 'step'); assert.equal(await scene.getAttribute('data-running'), 'false');
    await steps.nth(0).click(); assert.equal(await steps.nth(0).getAttribute('aria-current'), 'step');
  }
  await page.locator('button[data-profile=idea]').click();
  await page.locator('[data-profile-scene=idea] [data-journey-play]').click();
  assert.equal(await page.locator('[data-profile-scene=idea] .journey-panel:not([hidden])').evaluate(e => getComputedStyle(e).opacity), '1', 'Pausing immediately must not leave an empty scene');
  const stopped = await page.locator('[data-profile-scene=idea]').getAttribute('style'); await page.waitForTimeout(150); assert.equal(await page.locator('[data-profile-scene=idea]').getAttribute('style'), stopped);
  if (process.env.NUDGETHIS_TEST_SCREENSHOT) await page.screenshot({ path: process.env.NUDGETHIS_TEST_SCREENSHOT.replace('.png', '-desktop.png') });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const profile of ['idea', 'code', 'ai']) {
    await page.locator(`button[data-profile=${profile}]`).click(); const scene = page.locator(`[data-profile-scene=${profile}]`);
    assert.equal(await scene.getAttribute('data-running'), 'false'); assert.equal(await scene.getAttribute(profile === 'ai' ? 'data-stage' : 'data-step'), profile === 'ai' ? 'applied' : '3');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${profile} fits a phone`);
  }
  await page.locator('button[data-profile=idea]').click();
  if (process.env.NUDGETHIS_TEST_SCREENSHOT) await page.screenshot({ path: process.env.NUDGETHIS_TEST_SCREENSHOT, fullPage: true });
  assert.deepEqual(errors, []);
});
