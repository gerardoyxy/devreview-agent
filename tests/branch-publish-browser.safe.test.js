import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { application } from './application-safe-helpers.js';
import { applyFixture } from './versions-safe-helpers.js';

const options = { timeout: 90000, skip: !process.env.NUDGETHIS_TEST_BROWSER && 'Set NUDGETHIS_TEST_BROWSER to run browser interaction checks' };
async function browserFor(t) {
  const browser = await chromium.launch({ executablePath: process.env.NUDGETHIS_TEST_BROWSER, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close()); return browser;
}
test('Branch guide in Chromium: no repository, first version, branch creation, external switch and phone overlay', options, async t => {
  const app = await application({ repository: 'none' }); t.after(() => app.close());
  const browser = await browserFor(t), page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.goto(`${app.address}/#token=${app.token}`);
  const banner = page.getByRole('complementary', { name: 'Workspace guide' });
  await banner.getByRole('button', { name: 'Enable version history', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Branch & publish', exact: true });
  await dialog.getByText('Keep versions on this computer', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Enable version history', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Choose the starting point' }).waitFor();
  app.git('config', 'commit.gpgSign', 'false'); app.git('config', 'core.autocrlf', 'false');
  await dialog.getByRole('button', { name: 'Review first version', exact: true }).click();
  await dialog.getByLabel('Version name', { exact: true }).fill('Start my project');
  await dialog.getByLabel('Author name', { exact: true }).fill('Browser Test');
  await dialog.getByLabel('Author email', { exact: true }).fill('browser@example.invalid');
  await dialog.getByRole('button', { name: 'Save first version', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Your first version is saved.' }).waitFor();
  assert.equal(app.git('rev-list', '--count', 'HEAD').trim(), '1'); assert.equal(app.git('remote').trim(), '');
  await dialog.getByRole('button', { name: 'Your branch', exact: true }).click();
  await dialog.getByLabel('New working branch', { exact: true }).fill('improve-checkout');
  await dialog.getByRole('button', { name: 'Create a working branch', exact: true }).click();
  await dialog.getByRole('heading', { name: 'You’re working on improve-checkout', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Continue on improve-checkout', exact: true }).click();
  await banner.waitFor({ state: 'hidden' }); await page.reload(); await banner.waitFor({ state: 'hidden' });
  app.git('checkout', 'main'); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await banner.getByText('You’re working on main', { exact: true }).waitFor();
  assert.match(await page.locator('#branch').textContent(), /main/);
  await page.locator('#branch-button').click(); await dialog.getByRole('button', { name: 'Git basics', exact: true }).click();
  await dialog.getByText('Commit / version', { exact: true }).waitFor();
  assert.match(await dialog.textContent(), /Send saved commits and their history/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const task = await applyFixture(app, { 'example.txt': 'Reviewed local correction\n' }, 'Make the checkout clearer');
  await page.getByRole('button', { name: task.request, exact: true }).click();
  const conversation = page.getByRole('dialog', { name: 'Task conversation', exact: true }), undo = conversation.getByRole('button', { name: 'Undo applied changes', exact: true });
  await undo.waitFor(); assert(await undo.isEnabled());
  app.git('checkout', 'improve-checkout'); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await conversation.getByText(/Branch: main \(return to this branch to apply\)/).waitFor(); assert(await undo.isDisabled());
  app.git('checkout', '--detach', 'HEAD'); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('#branch')?.textContent === 'Local workspace'); assert(await undo.isDisabled());
  app.git('checkout', 'main');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  phone.on('pageerror', e => errors.push(e.message)); await phone.goto(`${app.address}/playground#token=${app.token}`);
  await phone.locator('.launcher').tap(); await phone.getByRole('button', { name: 'Branch: main', exact: true }).tap();
  const mobile = phone.getByRole('dialog', { name: 'Branch & publish', exact: true });
  await mobile.getByLabel('New working branch', { exact: true }).waitFor();
  assert(await mobile.evaluate(e => e.scrollWidth <= e.clientWidth), 'Branch guide fits a phone');
  await mobile.getByRole('button', { name: 'Git basics', exact: true }).tap();
  await mobile.getByText('Commit / version', { exact: true }).waitFor();
  if (process.env.NUDGETHIS_TEST_SCREENSHOT) await phone.screenshot({ path: process.env.NUDGETHIS_TEST_SCREENSHOT });
  assert.deepEqual(errors, []); assert.equal((await app.api('/api/status')).data.executionEnabled, false);
});

test('GitHub UI in Chromium: explicit account, reviewed upload, editable proposal and blocked merge', options, async t => {
  const app = await application(); t.after(() => app.close()); app.git('checkout', '-b', 'feature');
  const head = app.git('rev-parse', 'HEAD').trim(), browser = await browserFor(t), page = await browser.newPage(), errors = [], actions = [];
  page.on('pageerror', e => errors.push(e.message));
  const target = { id: 41, fullName: 'fixture/project', private: true, defaultBranch: 'main', url: 'https://github.com/fixture/project', allowMerge: true, allowSquash: true, allowRebase: false };
  const proposal = { number: 1, title: 'Improve checkout', state: 'open', merged: false, head, branch: 'feature', base: 'main', url: `${target.url}/pull/1` };
  const status = { available: true, account: null, target: null, suggestedTarget: '', last: null };
  let ready = false;
  // Browser presentation uses a local API fixture. Rust tests exercise actual Git transfers against a local bare repository.
  await page.route('**/api/github', async route => {
    let result = status;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); actions.push(body);
      switch (body.action) {
        case 'connect': status.account = 'fixture'; break;
        case 'target': status.target = target; break;
        case 'preview': result = { id: 'review', account: 'fixture', target, branch: 'feature', head, remoteHead: '', commits: [{ sha: head, title: 'Improve checkout' }], files: ['example.txt'], diff: '+Reviewed correction', dirty: { staged: 0, unstaged: 1, untracked: 0 }, updatesMain: false }; break;
        case 'publish': status.last = { branch: 'feature', head, checkedAt: new Date().toISOString(), proposal: null }; break;
        case 'propose': status.last.proposal = proposal; result = proposal; break;
        case 'merge-preview': result = { id: 'merge-review', target, proposal, canMerge: ready, head, baseHead: head, diff: '+Reviewed correction', checks: [{ name: 'Application checks', status: 'completed', conclusion: 'success' }], status: 'success', reviewDecision: ready ? 'APPROVED' : 'REVIEW_REQUIRED' }; break;
        case 'merge': assert.equal(ready, true); status.last.proposal = { ...proposal, merged: true }; result = { merged: true }; break;
        default: throw new Error(`Unexpected UI action ${body.action}`);
      }
    }
    await route.fulfill({ json: result });
  });
  await page.goto(`${app.address}/#token=${app.token}`); await page.locator('#branch-button').click();
  const dialog = page.getByRole('dialog', { name: 'Branch & publish', exact: true });
  await dialog.getByRole('button', { name: 'GitHub', exact: true }).click();
  await dialog.getByLabel('GitHub username', { exact: true }).fill('fixture');
  await dialog.getByLabel('Connection method', { exact: true }).selectOption('token');
  await dialog.getByLabel('GitHub token', { exact: true }).fill('fixture-only-token-never-persist');
  await dialog.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
  await dialog.getByLabel('GitHub repository', { exact: true }).fill('fixture/project');
  await dialog.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await dialog.getByRole('button', { name: 'Review publishing', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Ready to publish', exact: true }).waitFor();
  assert.match(await dialog.textContent(), /default branch stays unchanged/); assert.match(await dialog.textContent(), /uncommitted edits/);
  await dialog.getByRole('button', { name: 'Publish to GitHub', exact: true }).click();
  await dialog.getByRole('button', { name: 'Propose changes', exact: true }).click();
  await dialog.getByLabel('Proposal title', { exact: true }).fill('Clearer checkout');
  await dialog.getByLabel('Proposal description', { exact: true }).fill('Ready for review.');
  await dialog.getByRole('button', { name: 'Create proposal', exact: true }).click();
  await dialog.getByRole('button', { name: 'Review & merge', exact: true }).click();
  const merge = dialog.getByRole('button', { name: 'Merge on GitHub', exact: true });
  await dialog.getByText('Review requirement: REVIEW_REQUIRED. Commit status: success.', { exact: true }).waitFor(); assert(await merge.isDisabled());
  ready = true; await dialog.getByRole('button', { name: 'Refresh merge review', exact: true }).click();
  await dialog.getByText('GitHub reports this proposal is ready to merge.', { exact: true }).waitFor();
  await merge.click(); await dialog.getByRole('heading', { name: 'Merged on GitHub.', exact: true }).waitFor();
  assert.match(await dialog.textContent(), /local files and branch are unchanged/);
  assert.equal(actions.find(a => a.action === 'propose').title, 'Clearer checkout'); assert.equal(actions.find(a => a.action === 'propose').body, 'Ready for review.');
  assert(!await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('fixture-only-token-never-persist')));
  assert.equal(app.git('remote').trim(), ''); assert.deepEqual(errors, []);
});
