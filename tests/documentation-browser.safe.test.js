import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('documentation, terminal choices and copy controls work on desktop, mobile and without JavaScript', { skip: !process.env.NUDGETHIS_TEST_BROWSER, timeout: 120000 }, async t => {
  const { chromium } = await import('playwright');
  const root = fileURLToPath(new URL('../dist/site/', import.meta.url));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      assert(file === path.resolve(root) || file.startsWith(root));
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.NUDGETHIS_TEST_BROWSER, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedCode = text; } } }));
  await page.goto(base + '/');
  const tabs = page.getByRole('tablist', { name: 'Installation environment' });
  await tabs.getByRole('tab', { name: 'Windows', exact: true }).click();
  assert(await page.locator('#install-windows').isVisible());
  assert.equal(await page.locator('[data-install-panel]:not([hidden])').count(), 1);
  await page.locator('#install-windows').getByRole('button', { name: 'Copy code' }).click();
  assert.match(await page.evaluate(() => window.copiedCode), /Invoke-WebRequest/);
  assert.equal(await page.locator('#install-windows [role=status]').textContent(), 'Copied');
  await tabs.getByRole('tab', { name: 'Windows', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.getByRole('tab', { name: 'WSL', exact: true }).getAttribute('aria-selected'), 'true');
  assert(await page.locator('#install-wsl').isVisible());
  await page.keyboard.press('Home');
  assert(await page.locator('#install-unix').isVisible());
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Denied'); }; });
  await page.locator('#install-unix').getByRole('button', { name: 'Copy code' }).click();
  assert.match(await page.locator('#install-unix [role=status]').textContent(), /manually/);
  if (process.env.NUDGETHIS_TEST_SCREENSHOT) await page.locator('#terminal').screenshot({ path: process.env.NUDGETHIS_TEST_SCREENSHOT.replace('.png', '-terminal.png') });

  await page.locator('#documentation').getByRole('link', { name: 'Browse all guides' }).click();
  assert.match(page.url(), /\/docs\/$/);
  await page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Install from the terminal' }).click();
  assert.equal(await page.title(), 'Install from the terminal | NudgeThis Docs');
  assert(await page.getByRole('heading', { level: 1, name: 'Install from the terminal' }).isVisible());
  assert.equal(await page.locator('.docs-sidebar [aria-current=page]').textContent(), 'Install from the terminal');
  assert((await page.locator('.docs-article pre').count()) > 0);
  if (process.env.NUDGETHIS_TEST_SCREENSHOT) await page.screenshot({ path: process.env.NUDGETHIS_TEST_SCREENSHOT.replace('.png', '-docs-desktop.png') });

  // Every generated internal guide link and heading must resolve without GitHub or a router.
  const documents = ['index.html'];
  for (const entry of await readdir(path.join(root, 'docs'), { withFileTypes: true })) if (entry.isDirectory()) documents.push(entry.name + '/index.html');
  for (const document of documents) {
    const url = base + '/docs/' + document.replace(/index\.html$/, '');
    const response = await page.goto(url); assert.equal(response.status(), 200);
    const links = await page.locator('a[href]').evaluateAll(anchors => anchors.map(a => a.href));
    for (const href of new Set(links)) {
      const target = new URL(href); if (target.origin !== base) continue;
      const response = await fetch(target); assert.equal(response.status, 200, href);
      if (target.hash) {
        const html = await response.text();
        assert(html.includes(`id="${decodeURIComponent(target.hash.slice(1))}"`), 'Missing heading: ' + href);
      }
    }
  }

  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto(base + '/docs/wsl/');
  assert.equal(await page.locator('[data-docs-navigation]').getAttribute('open'), null);
  await page.getByText('Browse guides', { exact: true }).click();
  assert(await page.locator('.docs-sidebar nav').isVisible());
  await page.getByText('Browse guides', { exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Documentation fits 320px');
  if (process.env.NUDGETHIS_TEST_SCREENSHOT) await page.screenshot({ path: process.env.NUDGETHIS_TEST_SCREENSHOT.replace('.png', '-docs-mobile.png'), fullPage: true });
  await page.goto(base + '/');
  await page.getByRole('tab', { name: 'WSL', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Terminal section fits 320px');

  const plain = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await plain.goto(base + '/');
  assert.equal(await plain.locator('[data-install-panel]:visible').count(), 3, 'All instructions remain available without JavaScript');
  await plain.goto(base + '/docs/terminal-install/');
  assert(await plain.getByRole('heading', { name: 'Install from the terminal', level: 1 }).isVisible());
  assert(await plain.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Plain documentation fits a phone');
  assert.deepEqual(errors, []);
});
