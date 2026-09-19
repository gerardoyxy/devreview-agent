import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { application } from './application-safe-helpers.js';
import { applyFixture } from './versions-safe-helpers.js';

test('Saved versions in Chromium: novice flow, real local commit, history, SSE and mobile overlay', {
  timeout: 90000, skip: !process.env.NUDGETHIS_TEST_BROWSER && 'Set NUDGETHIS_TEST_BROWSER to run browser interaction checks'
}, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  // Blank fixture-local values override any developer/machine identity without changing it.
  app.git('config', 'user.name', ''); app.git('config', 'user.email', '');
  const task = await applyFixture(app, { 'example.txt': 'Readable content\n' }, 'Make the page easier to read');
  const browser = await chromium.launch({ executablePath: process.env.NUDGETHIS_TEST_BROWSER, headless: true, args: ['--no-sandbox'] }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${app.address}/#token=${app.token}`);
  const reminder = page.getByRole('complementary', { name: 'Changes ready to save' });
  await reminder.waitFor(); assert.match(await reminder.textContent(), /1 applied change ready to save/);
  await reminder.getByRole('button', { name: 'Review & save', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved versions', exact: true });
  const choice = dialog.getByRole('checkbox'); assert(await choice.isChecked());
  await choice.uncheck(); await dialog.getByRole('button', { name: 'Review selected changes', exact: true }).click();
  await dialog.getByText('Choose at least one change to review.', { exact: true }).waitFor();
  await choice.check(); await dialog.getByRole('button', { name: 'Review selected changes', exact: true }).click();
  await dialog.getByLabel('Version name', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('Version name', { exact: true }).inputValue(), task.request);
  await dialog.getByText('View files and technical diff', { exact: true }).click();
  assert.match(await dialog.locator('pre').textContent(), /Readable content/);
  await dialog.getByText('View files and technical diff', { exact: true }).click();
  await dialog.getByLabel('Version name', { exact: true }).fill('Improve readability');
  await dialog.getByLabel('Author name', { exact: true }).fill('Browser Test');
  await dialog.getByLabel('Author email', { exact: true }).fill('browser@example.invalid');
  await dialog.getByRole('button', { name: 'Save version', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Version saved on your computer.', exact: true }).waitFor();
  assert.equal(app.git('log', '-1', '--format=%s').trim(), 'Improve readability');
  assert.equal(app.git('remote').trim(), '', 'Local saving requires no GitHub connection');
  await reminder.waitFor({ state: 'hidden' });
  await dialog.getByRole('button', { name: 'View history', exact: true }).click();
  await dialog.getByText('Improve readability · Saved locally', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: task.request, exact: true }).click();
  const conversation = page.getByRole('dialog', { name: 'Task conversation', exact: true });
  await conversation.getByRole('button', { name: 'View saved versions', exact: true }).waitFor();
  assert.equal(await conversation.getByRole('button', { name: 'Undo applied changes', exact: true }).count(), 0);

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await phoneContext.newPage(); phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(`${app.address}/playground#token=${app.token}`);
  await phone.locator('.launcher').tap();
  await phone.getByRole('button', { name: 'Saved versions', exact: true }).tap();
  const mobile = phone.getByRole('dialog', { name: 'Saved versions', exact: true });
  await mobile.getByText('Improve readability · Saved locally', { exact: true }).waitFor();
  assert(await mobile.evaluate(e => e.scrollWidth <= e.clientWidth), 'Dialog fits a phone viewport');
  const next = await applyFixture(app, { 'phone.txt': 'Touch-friendly controls\n' }, 'Make controls easier to tap');
  await mobile.getByRole('checkbox').waitFor();
  await mobile.getByRole('checkbox').check(); await mobile.getByRole('button', { name: 'Review selected changes', exact: true }).tap();
  await mobile.getByLabel('Version name', { exact: true }).waitFor(); assert.equal(await mobile.getByLabel('Version name', { exact: true }).inputValue(), next.request);
  assert.equal(await mobile.getByLabel('Author name', { exact: true }).inputValue(), 'Browser Test');
  assert(await mobile.evaluate(e => e.scrollWidth <= e.clientWidth), 'Review form fits a phone viewport');
  if (process.env.NUDGETHIS_TEST_SCREENSHOT) await phone.screenshot({ path: process.env.NUDGETHIS_TEST_SCREENSHOT });
  await mobile.getByRole('button', { name: 'Save version', exact: true }).tap();
  await mobile.getByRole('heading', { name: 'Version saved on your computer.', exact: true }).waitFor();
  await phone.reload(); await phone.locator('.launcher').tap(); await phone.getByRole('button', { name: 'Saved versions', exact: true }).tap();
  await mobile.getByText('Make controls easier to tap · Saved locally', { exact: true }).waitFor();
  assert.equal(app.git('rev-list', '--count', 'HEAD').trim(), '3');
  assert.equal((await app.api('/api/status')).data.executionEnabled, false); assert.deepEqual(errors, []);
});
