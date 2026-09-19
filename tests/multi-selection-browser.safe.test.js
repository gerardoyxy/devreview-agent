import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { application } from './application-safe-helpers.js';

const options = { timeout: 90000, skip: !process.env.NUDGETHIS_TEST_BROWSER && 'Set NUDGETHIS_TEST_BROWSER for browser checks' };
async function fixture(t) {
  const site = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Group selection</title>
      <style>body{margin:0;padding:24px;font:16px system-ui}main{max-width:800px}h1{margin:12px 0 45px}.targets{display:flex;gap:12px}.targets button,.targets a{width:90px;height:50px;display:inline-flex;align-items:center;justify-content:center;margin:0;border:1px solid;background:#eee;color:#111}.private{margin-top:50px}input{display:block}</style>
      <main><h1>Example application</h1><div class="targets"><button id="one"><span>Alpha</span></button><button id="two">Beta</button><a id="three" href="#activated">Gamma</a></div>
      <div class="private" data-nudgethis-private><button id="private" aria-label="PRIVATE-LABEL">PRIVATE-CONTENT</button></div><label>Name<input id="input" value="PRIVATE-VALUE"></label></main>
      <script>window.actions=[];for(const name of ['pointerdown','mousedown','mouseup','click','auxclick','contextmenu'])document.querySelector('main').addEventListener(name,e=>{window.actions.push(name);if(name==='contextmenu')e.preventDefault()})</script></html>`);
  });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  t.after(async () => { site.closeAllConnections(); await new Promise(resolve => site.close(resolve)); });
  const origin = `http://127.0.0.1:${site.address().port}`;
  const app = await application({ origins: [origin] }); t.after(() => app.close());
  const browser = await chromium.launch({ executablePath: process.env.NUDGETHIS_TEST_BROWSER, headless: true }); t.after(() => browser.close());
  const errors = [];
  const open = async (mobile = false) => {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(async ({ server, token }) => {
      const { NudgeThis } = await import(`${server}/overlay.js`);
      window.overlay = NudgeThis.init({ enabled: true, server, token, captureDom: true });
      navigator.clipboard.writeText = async text => { window.copied = text; };
    }, { server: app.address, token: app.token });
    await page.getByText('NudgeThis · 0 changes', { exact: true }).waitFor();
    return { page, context };
  };
  return { app, browser, errors, open };
}

test('multiple selection: toggles, clipboard privacy, stale targets, one draft and historical group review', options, async t => {
  const { app, errors, open } = await fixture(t), { page } = await open();
  const tray = page.getByRole('region', { name: 'Selected elements' });
  const panel = page.locator('[data-nudgethis-overlay] .panel');
  const count = async n => tray.getByText(`${n} selected`, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Select multiple', exact: true }).click();
  // Nested text and the button box must resolve to the same control.
  await page.locator('#one span').click(); await page.locator('#two').click(); await count(2);
  await page.locator('#one').click({ position: { x: 5, y: 5 } }); await count(1);
  await page.locator('#one').click({ position: { x: 5, y: 5 } }); await page.locator('#three').click(); await count(3);
  await tray.getByRole('button', { name: 'Remove element 3', exact: true }).click(); await count(2);
  assert.deepEqual(await page.evaluate(() => window.actions), []); assert.equal(new URL(page.url()).hash, '');
  await tray.getByRole('button', { name: 'Review selection', exact: true }).click();
  await panel.getByLabel('Your request').fill('Make all selected buttons the same width');
  await panel.getByRole('button', { name: 'Copy context', exact: true }).click();
  const copied = await page.evaluate(() => window.copied);
  const portable = JSON.parse(copied.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(portable.elements.map(e => e.selector), ['#two', '#one']);
  await page.locator('#two').evaluate(node => { node.textContent = 'A different target'; });
  await panel.getByText('A target no longer matches. Select it again or remove it; your request is preserved.', { exact: true }).waitFor();
  assert(await panel.getByRole('button', { name: 'Save draft', exact: true }).isDisabled());
  assert.equal(await panel.getByLabel('Your request').inputValue(), 'Make all selected buttons the same width');
  await page.locator('#two').evaluate(node => { node.textContent = 'Beta'; });
  await page.waitForFunction(() => !document.querySelector('[data-nudgethis-overlay]').shadowRoot.querySelector('.save-draft').disabled);
  // Identical DOM replacement can be reidentified; ambiguous replacements cannot.
  await page.locator('#two').evaluate(node => node.replaceWith(node.cloneNode(true)));
  assert(await panel.getByRole('button', { name: 'Save draft', exact: true }).isEnabled());
  await panel.getByRole('button', { name: 'Add more elements', exact: true }).click();
  await page.locator('#private').click(); await count(3);
  await tray.getByRole('button', { name: 'Review selection', exact: true }).click();
  await panel.getByRole('button', { name: 'Copy context', exact: true }).click();
  assert(!(await page.evaluate(() => window.copied)).includes('PRIVATE-CONTENT'));
  assert(!(await page.evaluate(() => window.copied)).includes('PRIVATE-LABEL'));
  await panel.getByRole('button', { name: 'Save draft', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'NudgeThis conversations', exact: true }); await review.waitFor();
  const tasks = (await app.api('/api/tasks')).data; assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, 'draft'); assert.equal(tasks[0].context.elements.length, 3);
  assert.equal(tasks[0].context.elements[2].text, ''); assert.equal(tasks[0].context.elements[2].domSnippet, '');
  await review.getByRole('tab', { name: 'Context used', exact: true }).click();
  await review.locator('.dr-element-context summary').click();
  assert.equal(await review.locator('.dr-element-context li').count(), 3);
  await review.getByRole('button', { name: 'Edit draft', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'New change', exact: true });
  await editor.getByLabel('What needs to change?', { exact: true }).fill('Keep the three buttons aligned');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await review.getByRole('tab', { name: 'History', exact: true }).click();
  await review.getByRole('button', { name: 'View v1', exact: true }).click();
  await review.locator('.dr-past .dr-element-context summary').click();
  assert.equal(await review.locator('.dr-past .dr-element-context li').count(), 3);
  await review.getByRole('button', { name: 'Close conversations', exact: true }).click();
  await page.getByRole('button', { name: 'Select multiple', exact: true }).click(); await page.locator('#one').click();
  await tray.getByRole('button', { name: 'Review selection', exact: true }).click();
  await panel.getByLabel('Your request').fill('Discarded request');
  await panel.getByRole('button', { name: 'Add more elements', exact: true }).click();
  await tray.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Select multiple', exact: true }).click(); await page.locator('#two').click();
  await tray.getByRole('button', { name: 'Review selection', exact: true }).click();
  assert.equal(await panel.getByLabel('Your request').inputValue(), '', 'A cancelled selection must not lend its request to a new group');
  assert.equal((await app.api('/api/status')).data.executionEnabled, false); assert.deepEqual(errors, []);
});

test('area selection: reverse drag, atomic targets, keyboard modifiers, limits and touch cancellation', options, async t => {
  const { app, errors, open } = await fixture(t), { page, context } = await open();
  const tray = page.getByRole('region', { name: 'Selected elements' });
  const area = async reverse => {
    const rect = await page.locator('.targets').boundingBox();
    await page.getByRole('button', { name: 'Select area', exact: true }).click();
    const start = { x: rect.x - 8, y: rect.y - 8 }, end = { x: rect.x + rect.width + 8, y: rect.y + rect.height + 8 };
    await page.mouse.move(reverse ? end.x : start.x, reverse ? end.y : start.y); await page.mouse.down();
    await page.mouse.move(reverse ? start.x : end.x, reverse ? start.y : end.y, { steps: 8 }); await page.mouse.up();
  };
  await page.locator('.targets').evaluate(row => row.insertAdjacentHTML('beforeend', '<div style="opacity:0"><button>Invisible</button></div><button hidden>Hidden</button>'));
  await area(true); await tray.getByText('3 selected', { exact: true }).waitFor();
  const labels = await tray.locator('.selection-items li span').allTextContents();
  assert(labels[0].includes('button')); assert(!labels.some(label => label.includes('span')));
  assert.deepEqual(await page.evaluate(() => window.actions), []);
  await tray.getByRole('button', { name: 'Cancel', exact: true }).click();
  const previous = (await app.api('/api/selection-controls')).data;
  await app.api('/api/selection-controls', { method: 'POST', body: JSON.stringify({ version: 1, revision: previous?.revision || 0, pointer: { button: 2, modifiers: ['alt'] }, keyboard: { code: 'KeyD', modifiers: ['alt', 'shift'] }, additiveModifier: 'control' }) });
  await page.getByRole('button', { name: 'Selection controls', exact: true }).click();
  const controls = page.getByRole('dialog', { name: 'Selection controls', exact: true });
  await page.waitForFunction(() => document.querySelector('[data-nudgethis-overlay]').shadowRoot.querySelector('#nt-selection-additive').value === 'control');
  await controls.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#one').focus(); await page.keyboard.press('Control+Alt+Shift+KeyD');
  await page.locator('#two').click({ button: 'right', modifiers: ['Alt', 'Control'] });
  await tray.getByText('2 selected', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Select multiple', exact: true }).getAttribute('aria-pressed'), 'false');
  await tray.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.targets').evaluate(row => { row.innerHTML = Array.from({ length: 21 }, (_, i) => `<button style="width:20px;min-width:20px;height:24px" id="many-${i}">${i}</button>`).join(''); row.style.gap = '4px'; });
  await area(false); await tray.getByText('That area contains 21 elements. Select a smaller area (up to 20).', { exact: true }).waitFor();
  await tray.getByRole('button', { name: 'Cancel', exact: true }).click();
  const phone = (await open(true)).page;
  await phone.getByRole('button', { name: 'Select multiple', exact: true }).tap();
  await phone.locator('#one').tap({ position: { x: 5, y: 5 } }); await phone.locator('#three').tap();
  const mobileTray = phone.getByRole('region', { name: 'Selected elements' });
  await mobileTray.getByText('2 selected', { exact: true }).waitFor();
  assert.deepEqual(await phone.evaluate(() => window.actions), []); assert.equal(new URL(phone.url()).hash, '');
  await mobileTray.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await phone.getByRole('button', { name: 'Select area', exact: true }).tap();
  const rect = await phone.locator('.targets').boundingBox(), cdp = await phone.context().newCDPSession(phone);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x - 5, y: rect.y - 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + rect.width + 5, y: rect.y + rect.height + 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobileTray.getByText('3 selected', { exact: true }).waitFor();
  assert.equal(await phone.evaluate(() => scrollY), 0, 'Dragging an area must not scroll the page');
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobileTray.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await phone.getByRole('button', { name: 'Select area', exact: true }).tap();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x - 5, y: rect.y - 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert(await phone.locator('.selection-rectangle').isHidden());
  await phone.evaluate(() => window.overlay.destroy()); await phone.locator('#three').tap();
  assert.equal(new URL(phone.url()).hash, '#activated', 'Destroy restores normal page interactions');
  assert.equal((await app.api('/api/status')).data.executionEnabled, false); assert.deepEqual((await app.api('/api/tasks')).data, []);
  assert.deepEqual(errors, []); await context.close();
});
