import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, chmod, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { application } from './application-safe-helpers.js';
import { applyFixture, preview, save, selection, post, author, editDatabase } from './versions-safe-helpers.js';

test('Save version: real commit, unrelated staged/unstaged work, identity, idempotency and restart', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  const base = app.git('rev-parse', 'HEAD').trim();
  const task = await applyFixture(app, { 'example.txt': 'Readable page\n' });
  await writeFile(path.join(app.root, 'other.txt'), 'staged elsewhere\n'); app.git('add', '--', 'other.txt');
  await writeFile(path.join(app.root, 'other.txt'), 'later local work\n');
  await writeFile(path.join(app.root, 'notes.txt'), 'untracked work\n');
  const index = await readFile(path.join(app.root, '.git/index'));
  const plan = await preview(app, task);
  assert.deepEqual(plan.files, ['example.txt']); assert.match(plan.diff, /Readable page/); assert.doesNotMatch(plan.diff, /staged elsewhere|later local|untracked work/);
  assert.deepEqual(await readFile(path.join(app.root, '.git/index')), index); assert.equal(app.git('rev-parse', 'HEAD').trim(), base);
  const result = await save(app, plan); assert.equal(result.status, 200, JSON.stringify(result.data));
  const record = result.data; assert.equal(record.status, 'saved'); assert.equal(record.parent, undefined); assert.equal(record.indexBefore, undefined);
  assert.equal(app.git('rev-parse', 'HEAD').trim(), record.commit); assert.equal(app.git('rev-parse', 'HEAD^').trim(), base);
  assert.equal(app.git('log', '-1', '--format=%an <%ae>').trim(), `${author.name} <${author.email}>`);
  assert.equal(app.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').trim(), 'example.txt');
  assert.equal(app.git('show', ':other.txt'), 'staged elsewhere\n'); assert.equal(await readFile(path.join(app.root, 'other.txt'), 'utf8'), 'later local work\n');
  assert.equal(await readFile(path.join(app.root, 'notes.txt'), 'utf8'), 'untracked work\n');
  assert.equal(app.git('diff', '--', 'example.txt'), ''); assert.equal(app.git('diff', '--cached', '--', 'example.txt'), '');
  assert.deepEqual((await save(app, plan)).data, record); assert.equal(app.git('rev-list', '--count', 'HEAD').trim(), '2');
  assert.equal((await post(app, `/api/tasks/${task.id}/undo`, { attempt: 1 })).status, 409);
  assert.equal((await app.api(`/api/tasks/${task.id}`)).data.savedVersion, true);
  await app.restart(); const state = (await app.api('/api/versions')).data;
  assert.deepEqual(state.pending, []); assert.equal(state.history[0].commit, record.commit); assert.equal((await save(app, plan)).status, 200);
  assert.equal((await app.api('/api/status')).data.executionEnabled, false);
});

test('Save version: dependent corrections must be reviewed together', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  const first = await applyFixture(app, { 'example.txt': 'First correction\n' }, 'Improve spacing');
  const second = await applyFixture(app, { 'example.txt': 'Second correction\n' }, 'Improve headings');
  assert.equal((await post(app, '/api/versions/preview', selection(first))).status, 409);
  assert.equal((await post(app, '/api/versions/preview', selection(second))).status, 409);
  const plan = await preview(app, second, first); assert.equal(plan.suggestedMessage, 'Save 2 reviewed changes');
  assert.equal((await save(app, plan)).status, 200); assert.equal(app.git('show', 'HEAD:example.txt'), 'Second correction\n');
  assert.deepEqual((await app.api('/api/versions')).data.pending, []);
});

test('Save version: foreign baselines, later edits, staging and stale HEAD are refused without mutation', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  await writeFile(path.join(app.root, 'example.txt'), 'Earlier editor changes\n');
  const foreign = await applyFixture(app, { 'example.txt': 'Applied after local edits\n' });
  assert.match((await post(app, '/api/versions/preview', selection(foreign))).data.error, /earlier edits/);
  const task = await applyFixture(app, { 'fresh.txt': 'New approved file\n' });
  const plan = await preview(app, task);
  await writeFile(path.join(app.root, 'fresh.txt'), 'Later edit\n'); assert.equal((await save(app, plan)).status, 409);
  await writeFile(path.join(app.root, 'fresh.txt'), 'New approved file\n'); app.git('add', '--', 'fresh.txt');
  assert.match((await post(app, '/api/versions/preview', selection(task))).data.error, /already staged/);
  assert.equal((await save(app, plan)).status, 409); app.git('reset', 'HEAD', '--', 'fresh.txt');
  const newer = await preview(app, task);
  app.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'External version');
  const head = app.git('rev-parse', 'HEAD'); assert.equal((await save(app, newer)).status, 409); assert.equal(app.git('rev-parse', 'HEAD'), head);
  assert.equal(await readFile(path.join(app.root, 'example.txt'), 'utf8'), 'Applied after local edits\n');
  await assert.rejects(access(path.join(app.root, '.git/index.lock')));
});

test('Save version: additions, deletions, binary data and CRLF remain exact', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  const bytes = Buffer.from([0, 4, 255, 13, 10, 0, 8]);
  const task = await applyFixture(app, { 'example.txt': null, 'image.bin': bytes, 'read me.txt': 'One\r\nTwo\r\n' });
  const plan = await preview(app, task); assert.match(plan.diff, /GIT binary patch/);
  assert.equal((await save(app, plan)).status, 200); assert.equal(app.git('diff', 'HEAD', '--'), '');
  assert.equal(app.git('ls-tree', 'HEAD', '--', 'example.txt'), '');
  assert.deepEqual(await readFile(path.join(app.root, 'image.bin')), bytes);
  assert.equal(await readFile(path.join(app.root, 'read me.txt'), 'utf8'), 'One\r\nTwo\r\n');
});

test('Save version: auth, malformed selections, identity, hook policy and signing failure', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  for (const endpoint of ['/api/versions', '/api/versions/preview', '/api/versions/save']) {
    assert.equal((await fetch(app.address + endpoint, { method: endpoint.endsWith('versions') ? 'GET' : 'POST' })).status, 401);
    assert.equal((await app.api(endpoint, { headers: { Origin: 'https://example.com' } })).status, 403);
  }
  const task = await applyFixture(app, { 'example.txt': 'Approved\n' });
  assert.equal((await post(app, '/api/versions/preview', { changes: [] })).status, 400);
  assert.equal((await post(app, '/api/versions/preview', selection(task, task))).status, 400);
  assert.equal((await post(app, '/api/versions/preview', selection({ id: 'QA-999', attempt: 1 }))).status, 409);
  const plan = await preview(app, task), base = app.git('rev-parse', 'HEAD');
  assert.equal((await post(app, '/api/versions/save', { previewId: plan.id, message: 'Title', identity: { name: 'Test', email: 'invalid' } })).status, 400);
  assert.equal((await save(app, plan, 'first\nsecond')).status, 400);
  const hooks = path.join(app.root, '.nudgethis/custom-hooks'); await mkdir(hooks);
  const hook = path.join(hooks, 'pre-commit'); await writeFile(hook, '#!/bin/sh\nexit 1\n'); await chmod(hook, 0o755); app.git('config', 'core.hooksPath', hooks);
  assert.match((await save(app, plan)).data.error, /commit hooks/);
  app.git('config', 'core.hooksPath', path.join(app.root, '.nudgethis/no-hooks'));
  app.git('config', 'commit.gpgSign', 'true'); app.git('config', 'gpg.program', path.join(app.root, 'does-not-exist'));
  assert.match((await save(app, plan)).data.error, /signing/); assert.equal(app.git('rev-parse', 'HEAD'), base);
  await assert.rejects(access(path.join(app.root, '.git/index.lock')));
  app.git('config', 'commit.gpgSign', 'false'); assert.equal((await save(app, plan)).status, 200);
});

test('Save version: external commits clear reminders; branch changes and in-progress Git operations block saves', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  const task = await applyFixture(app, { 'example.txt': 'Approved\n' }); const plan = await preview(app, task);
  app.git('switch', '-c', 'other'); assert.equal((await save(app, plan)).status, 409); assert.deepEqual((await app.api('/api/versions')).data.pending, []);
  app.git('switch', 'main');
  await writeFile(path.join(app.root, '.git/MERGE_HEAD'), app.git('rev-parse', 'HEAD'));
  assert.match((await save(app, plan)).data.error, /merge/);
  await rm(path.join(app.root, '.git/MERGE_HEAD'));
  app.git('add', '--', 'example.txt'); app.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Saved elsewhere');
  assert.deepEqual((await app.api('/api/versions')).data.pending, []);
});

test('Save version: durable journal reconciles a finished save and blocks ambiguous recovery', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  const task = await applyFixture(app, { 'example.txt': 'Approved\n' }); const plan = await preview(app, task); assert.equal((await save(app, plan)).status, 200);
  const mutate = callback => editDatabase(app, db => { const row = JSON.parse(db.prepare('SELECT data FROM saved_versions WHERE id=?').get(plan.id).data); callback(row); db.prepare('UPDATE saved_versions SET data=? WHERE id=?').run(JSON.stringify(row), plan.id); });
  mutate(row => { row.status = 'saving'; row.error = 'Interrupted'; });
  assert.equal((await app.api('/api/versions')).data.history[0].status, 'saved');
  mutate(row => { row.status = 'saving'; row.indexAfter = 'mismatch'; row.error = 'Inspect this interrupted save'; });
  assert.equal((await app.api('/api/versions')).data.history[0].status, 'saving');
  const details = (await app.api(`/api/tasks/${task.id}`)).data;
  assert.equal(details.savedVersion, false); assert.equal(details.versionSavePending, true);
  assert.equal((await post(app, '/api/versions/preview', selection(task))).status, 409);
  assert.equal((await save(app, plan)).status, 409); assert.equal(app.git('rev-list', '--count', 'HEAD').trim(), '2');
});

test('Save version: index/ref locks, split index and expired reviews cannot consume work', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  const task = await applyFixture(app, { 'example.txt': 'Approved\n' });
  app.git('update-index', '--split-index');
  assert.match((await post(app, '/api/versions/preview', selection(task))).data.error, /split index/);
  app.git('update-index', '--no-split-index');
  const plan = await preview(app, task), base = app.git('rev-parse', 'HEAD'), index = await readFile(path.join(app.root, '.git/index'));
  const indexLock = path.join(app.root, '.git/index.lock'); await writeFile(indexLock, 'other Git operation');
  assert.match((await save(app, plan)).data.error, /Git is busy/);
  assert.equal(await readFile(indexLock, 'utf8'), 'other Git operation'); await rm(indexLock);
  const branchLock = path.join(app.root, '.git/refs/heads/main.lock'); await writeFile(branchLock, 'other ref operation');
  assert.equal((await save(app, plan)).status, 409); await rm(branchLock);
  assert.equal(app.git('rev-parse', 'HEAD'), base); assert.deepEqual(await readFile(path.join(app.root, '.git/index')), index);
  assert.equal(await readFile(path.join(app.root, 'example.txt'), 'utf8'), 'Approved\n'); await assert.rejects(access(indexLock));
  assert.equal((await app.api('/api/versions')).data.history[0].status, 'failed');
  const expired = await preview(app, task); await app.restart();
  assert.match((await save(app, expired)).data.error, /Review these changes again/);
  assert.equal((await save(app, await preview(app, task))).status, 200);
});
