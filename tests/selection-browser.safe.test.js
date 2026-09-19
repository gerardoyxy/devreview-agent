import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { application } from './application-safe-helpers.js';

test('selection controls in Chromium: gestures, no accidental actions, shortcuts, touch and live preferences', {
  timeout: 90000, skip: !process.env.NUDGETHIS_TEST_BROWSER && 'Set NUDGETHIS_TEST_BROWSER to run browser interaction checks'
}, async t => {
  const site = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Selection fixture</title><style>body{font:16px system-ui;padding:24px}button,a,input{display:block;margin:20px 0;padding:16px}</style><main><h1>Selection fixture</h1><button id="target">Save profile</button><a id="link" href="#navigated">Open profile</a><label>Profile name<input id="name"></label></main><script>window.actions=[];for(const name of ["pointerdown","mousedown","mouseup","click","auxclick","contextmenu"])document.querySelector("main").addEventListener(name,e=>{window.actions.push(name);if(name==="contextmenu")e.preventDefault()});</script></html>');
  });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  t.after(async () => { site.closeAllConnections(); await new Promise(resolve => site.close(resolve)); });
  const origin = `http://127.0.0.1:${site.address().port}`;
  const app = await application({ origins: [origin] }); t.after(() => app.close());
  const browser = await chromium.launch({ executablePath: process.env.NUDGETHIS_TEST_BROWSER, headless: true, args: ['--no-sandbox'] }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), dashboard = await context.newPage(), errors = [];
  for (const tab of [page, dashboard]) tab.on('pageerror', error => errors.push(error.message));
  const init = tab => tab.evaluate(async ({ server, token }) => { const { DevReview } = await import(`${server}/overlay.js`); window.overlay = DevReview.init({ enabled: true, server, token }); }, { server: app.address, token: app.token });
  await page.goto(origin); await init(page);
  await page.getByText('NudgeThis · 0 changes', { exact: true }).waitFor();
  const target = page.locator('#target'), panel = page.locator('[data-devreview-overlay] .panel');
  const close = () => panel.getByRole('button', { name: 'Close', exact: true }).click();
  const actions = () => page.evaluate(() => window.actions);
  const clear = () => page.evaluate(() => { window.actions = []; });
  await target.click({ button: 'right' }); assert(await panel.isHidden()); assert((await actions()).includes('contextmenu'));
  await clear(); await target.click({ button: 'right', modifiers: ['Alt'] }); await panel.waitFor(); assert.deepEqual(await actions(), []); await close();

  await dashboard.goto(`${app.address}/#token=${app.token}`);
  await dashboard.getByRole('button', { name: 'Selection controls', exact: true }).click();
  const controls = dashboard.getByRole('dialog', { name: 'Selection controls', exact: true });
  await controls.getByLabel('Mouse button', { exact: true }).selectOption('0');
  await controls.getByLabel('Alt / Option', { exact: true }).uncheck();
  await controls.getByLabel('Shift', { exact: true }).check();
  await controls.getByRole('button', { name: 'Record keyboard shortcut', exact: true }).click();
  await dashboard.keyboard.press('Alt+KeyE');
  await controls.getByRole('button', { name: 'Test your mouse gesture here', exact: true }).click({ modifiers: ['Shift'] });
  await controls.getByText('Matches your mouse gesture.', { exact: true }).waitFor();
  await controls.getByRole('button', { name: 'Save controls', exact: true }).click();
  await controls.getByText('Saved. Connected page overlays now use these controls.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-devreview-overlay]').shadowRoot.querySelector('.pick-launcher').title.startsWith('Shift + Left click'));
  await clear(); await target.click({ modifiers: ['Shift'] }); await panel.waitFor(); assert.deepEqual(await actions(), []); await close();
  await target.click({ modifiers: ['Shift', 'Alt'] }); assert(await panel.isHidden()); assert((await actions()).includes('click'), 'Extra modifiers must preserve the page gesture');
  await target.focus(); await page.keyboard.press('Alt+KeyE'); await panel.waitFor(); await close();

  // Save different buttons through the API and verify connected UI receives them without reloading.
  const update = async (button, keyboard = { code: 'KeyE', modifiers: [] }, modifiers = []) => {
    const previous = (await app.api('/api/selection-controls')).data;
    const result = await app.api('/api/selection-controls', { method: 'POST', body: JSON.stringify({ ...previous, pointer: { button, modifiers }, keyboard }) });
    assert.equal(result.status, 200);
    await page.waitForFunction(button => document.querySelector('[data-devreview-overlay]').shadowRoot.querySelector('.pick-launcher').title.startsWith(button === null ? 'Mouse gesture off' : ['Left click', 'Middle click', 'Right click', 'Side button: Back', 'Side button: Forward'][button]), button);
  };
  await update(0); await clear(); await page.locator('#link').click(); await panel.waitFor(); assert.equal(new URL(page.url()).hash, ''); assert.deepEqual(await actions(), []); await close();
  await page.locator('#name').focus(); await page.keyboard.type('hello'); assert.equal(await page.locator('#name').inputValue(), 'hello'); assert(await panel.isHidden());
  await target.focus(); await page.keyboard.press('KeyE'); await panel.waitFor(); await close();
  await update(1); await clear(); await page.locator('#link').click({ button: 'middle' }); await panel.waitFor(); assert.equal(context.pages().length, 2); assert.deepEqual(await actions(), []); await close();

  const cdp = await context.newCDPSession(page);
  for (const button of [3, 4]) {
    await update(button); await clear();
    const rect = await target.boundingBox(), params = { x: rect.x + 20, y: rect.y + 20, button: button === 3 ? 'back' : 'forward', clickCount: 1 };
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...params });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...params });
    await panel.waitFor(); assert.deepEqual(await actions(), []); await close();
  }
  await update(null, null); await clear(); await target.click(); assert(await panel.isHidden()); assert((await actions()).includes('click'));
  await page.getByRole('button', { name: 'Pick element', exact: true }).click(); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Pick element', exact: true }).getAttribute('aria-pressed'), 'false');
  await clear(); await page.getByRole('button', { name: 'Pick element', exact: true }).click(); await page.locator('#link').click(); await panel.waitFor(); assert.equal(new URL(page.url()).hash, ''); assert.deepEqual(await actions(), []); await close();
  await page.reload(); await init(page); await page.waitForFunction(() => document.querySelector('[data-devreview-overlay]').shadowRoot.querySelector('.pick-launcher').title.startsWith('Mouse gesture off'));
  await target.click(); assert(await panel.isHidden(), 'Saved controls survive reload');

  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await touch.newPage(); phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(origin); await init(phone);
  await phone.getByRole('button', { name: 'Pick element', exact: true }).tap(); await phone.locator('#link').tap();
  await phone.locator('[data-devreview-overlay] .panel').waitFor(); assert.equal(new URL(phone.url()).hash, '');
  assert.deepEqual(await phone.evaluate(() => window.actions), []);
  await phone.locator('[data-devreview-overlay] .panel').getByRole('button', { name: 'Close', exact: true }).tap();
  await phone.getByRole('button', { name: 'Selection controls', exact: true }).tap();
  assert(await phone.getByRole('dialog', { name: 'Selection controls', exact: true }).isVisible());
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.getByRole('button', { name: 'Reset defaults', exact: true }).tap();
  await phone.getByRole('button', { name: 'Save controls', exact: true }).tap();
  await phone.getByText('Saved. Connected page overlays now use these controls.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-devreview-overlay]').shadowRoot.querySelector('.pick-launcher').title.startsWith('Alt / Option + Right click'));
  await page.evaluate(() => window.overlay.destroy()); await clear(); await target.click({ button: 'right', modifiers: ['Alt'] });
  assert((await actions()).includes('contextmenu'), 'Destroy must remove gesture interception');
  assert.equal((await app.api('/api/status')).data.executionEnabled, false);
  assert.deepEqual((await app.api('/api/tasks')).data, []); assert.deepEqual(errors, []);
});
