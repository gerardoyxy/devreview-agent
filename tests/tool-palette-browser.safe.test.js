import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { application } from './application-safe-helpers.js';

const options = { timeout: 90000, skip: !process.env.NUDGETHIS_TEST_BROWSER && 'Set NUDGETHIS_TEST_BROWSER for browser checks' };
async function fixture(t, mobile = false) {
  const site = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Palette example</title>
      <style>body{margin:0;padding:24px;font:16px system-ui;background:#f7f8fc;color:#172245}main{max-width:650px}h1{font-size:32px}.actions{display:flex;gap:16px;margin-top:40px}button{padding:12px;border:1px solid #ddd;border-radius:6px;background:white}</style>
      <main><h1>Make room for your next idea.</h1><p>Choose something on this page to improve.</p><div class="actions"><button id="one">Start here</button><button id="two">Learn more</button></div></main>
      <script>window.activations=0;document.querySelector('main').onclick=()=>window.activations++;</script></html>`);
  });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  t.after(async () => { site.closeAllConnections(); await new Promise(resolve => site.close(resolve)); });
  const origin = `http://127.0.0.1:${site.address().port}`;
  const app = await application({ origins: [origin] }); t.after(() => app.close());
  const browser = await chromium.launch({ executablePath: process.env.NUDGETHIS_TEST_BROWSER, headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: mobile ? { width: 320, height: 740 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  const init = async () => {
    await page.evaluate(async ({ server, token }) => {
      const { NudgeThis } = await import(`${server}/overlay.js`);
      window.overlay = NudgeThis.init({ enabled: true, server, token });
      navigator.clipboard.writeText = async text => { window.copied = text; };
    }, { server: app.address, token: app.token });
    await page.getByText('NudgeThis · 0 changes', { exact: true }).waitFor();
  };
  await init();
  return { app, page, errors, init, palette: page.getByRole('region', { name: 'Tools and elements' }), panel: page.locator('[data-nudgethis-overlay] .panel') };
}

test('palette requests preserve drafts, enforce selection scope, and retain grouped context without executing', options, async t => {
  const { app, page, palette, panel, errors } = await fixture(t);
  const launch = page.getByRole('button', { name: 'Open tools and elements', exact: true });
  await launch.click();
  assert(await palette.getByRole('button', { name: 'Prepare request', exact: true }).isDisabled());
  await palette.getByRole('button', { name: 'Pick a reference element', exact: true }).click();
  await page.locator('#one').click();
  await panel.getByLabel('Your request', { exact: true }).fill('Keep the current label.');
  await panel.getByRole('button', { name: 'Tools & elements', exact: true }).click();
  await palette.getByLabel('Color', { exact: true }).fill('#3366aa');
  await palette.getByLabel('Apply color to').selectOption('text');
  await palette.getByRole('button', { name: 'Prepare request', exact: true }).click();
  const request = await panel.getByLabel('Your request', { exact: true }).inputValue();
  assert(request.startsWith('Keep the current label.\n\n')); assert(request.includes('text color of the selected element to #3366aa'));
  assert.equal(await page.locator('#one').textContent(), 'Start here');
  assert.deepEqual((await app.api('/api/tasks')).data, [], 'Preparing a request must not save or start a task');
  await panel.getByRole('button', { name: 'Copy context', exact: true }).click();
  assert((await page.evaluate(() => window.copied)).includes(request));
  await panel.getByLabel('Your request', { exact: true }).fill('x'.repeat(7900));
  await panel.getByRole('button', { name: 'Tools & elements', exact: true }).click();
  await palette.getByRole('button', { name: 'Prepare request', exact: true }).click();
  await palette.getByRole('alert').filter({ hasText: '8,000' }).waitFor();
  assert.equal(await panel.getByLabel('Your request', { exact: true }).inputValue(), 'x'.repeat(7900));
  await page.locator('#one').evaluate(node => { node.textContent = 'Changed elsewhere'; });
  await palette.getByText('A selected element changed. Select it again before preparing a request.', { exact: true }).waitFor();
  assert(await palette.getByRole('button', { name: 'Prepare request', exact: true }).isDisabled());
  await page.keyboard.press('Escape'); assert(await palette.isHidden());
  assert.equal(await launch.getAttribute('aria-expanded'), 'false');
  await page.keyboard.press('Escape');
  await page.locator('#one').evaluate(node => { node.textContent = 'Start here'; });
  await page.getByRole('button', { name: 'Select multiple', exact: true }).click();
  await page.locator('#one').click(); await page.locator('#two').click();
  await launch.click();
  await palette.getByRole('button', { name: 'Change text', exact: true }).click();
  assert(await palette.getByRole('button', { name: 'Prepare request', exact: true }).isDisabled());
  await palette.getByRole('tab', { name: 'Elements', exact: true }).click();
  assert(await palette.getByRole('button', { name: 'Prepare request', exact: true }).isDisabled());
  await palette.getByRole('tab', { name: 'Tools', exact: true }).click();
  await palette.getByRole('button', { name: 'Same size', exact: true }).click();
  await palette.getByRole('button', { name: 'Prepare request', exact: true }).click();
  assert.equal(await panel.locator('.selection-summary .selection-items li').count(), 2);
  await panel.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('dialog', { name: 'NudgeThis conversations', exact: true }).waitFor();
  const tasks = (await app.api('/api/tasks')).data;
  assert.equal(tasks.length, 1); assert.equal(tasks[0].status, 'draft');
  assert.deepEqual(tasks[0].context.elements.map(e => e.selector), ['#one', '#two']);
  assert(tasks[0].request.includes('consistent width and height'));
  assert.equal(await page.evaluate(() => window.activations), 0);
  assert.equal((await app.api('/api/status')).data.executionEnabled, false); assert.deepEqual(errors, []);
});

test('palette components, favorites, keyboard navigation, mobile layout and unavailable storage', options, async t => {
  const { app, page, palette, panel, errors, init } = await fixture(t, true);
  const launch = page.getByRole('button', { name: 'Open tools and elements', exact: true });
  await launch.tap();
  await palette.getByLabel('Palette position').selectOption('left');
  await palette.getByRole('button', { name: 'Favorite Change text', exact: true }).tap();
  assert.equal(await palette.locator('.tp-tool-grid .tp-choice').first().getAttribute('aria-label'), 'Change text');
  await page.evaluate(() => window.overlay.destroy()); await init(); await launch.tap();
  assert.equal(await palette.getByLabel('Palette position').inputValue(), 'left');
  assert.equal(await palette.getByRole('button', { name: 'Favorite Change text', exact: true }).getAttribute('aria-pressed'), 'true');
  await palette.getByRole('tab', { name: 'Tools', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await palette.getByRole('tab', { name: 'Elements', exact: true }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home'); assert.equal(await palette.getByRole('tab', { name: 'Tools', exact: true }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await palette.locator('.tp-element-grid .tp-choice').count(), 6);
  await palette.getByRole('button', { name: 'Card', exact: true }).tap();
  await palette.getByLabel('Placement', { exact: true }).selectOption('after');
  await palette.getByLabel('Component details', { exact: true }).fill('A summary of the selected plan.');
  await palette.getByRole('button', { name: 'Pick a reference element', exact: true }).tap();
  await page.locator('#one').tap();
  await panel.getByRole('button', { name: 'Tools & elements', exact: true }).tap();
  assert.equal(await palette.getByLabel('Component details', { exact: true }).inputValue(), 'A summary of the selected plan.');
  await palette.getByRole('button', { name: 'Prepare request', exact: true }).tap();
  const request = await panel.getByLabel('Your request', { exact: true }).inputValue();
  assert(request.startsWith('Add a card after the selected element.')); assert(request.includes('A summary of the selected plan.'));
  await panel.getByRole('button', { name: 'Copy context', exact: true }).tap();
  assert((await page.evaluate(() => window.copied)).includes('"selector": "#one"'));
  assert.equal(await page.locator('main button').count(), 2);
  await panel.getByRole('button', { name: 'Tools & elements', exact: true }).tap();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Unavailable', 'SecurityError'); }; });
  await palette.getByLabel('Palette position').selectOption('right');
  await palette.getByText('Storage is unavailable. Preferences last until this page closes.', { exact: true }).waitFor();
  for (const viewport of [{ width: 320, height: 740 }, { width: 667, height: 375 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    const bounds = await palette.boundingBox(), dock = await page.locator('.overlay-tools').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
    assert(bounds.y >= 0 && bounds.y + bounds.height <= dock.y, `Palette and dock must not overlap at ${viewport.width}px`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.evaluate(() => { const host = document.querySelector('[data-nudgethis-overlay]'); host.style.setProperty('--dr-accent', '#6940a5'); host.style.setProperty('--dr-surface', '#171d2c'); host.style.setProperty('--dr-text', '#f8f9ff'); });
  assert.equal(await palette.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(23, 29, 44)');
  await page.keyboard.press('Escape');
  assert(await panel.isVisible());
  assert.equal(await page.evaluate(() => document.querySelector('[data-nudgethis-overlay]').shadowRoot.activeElement?.className), 'palette-target');
  assert.deepEqual((await app.api('/api/tasks')).data, []); assert.equal((await app.api('/api/status')).data.executionEnabled, false);
  assert.deepEqual(errors, []);
});
