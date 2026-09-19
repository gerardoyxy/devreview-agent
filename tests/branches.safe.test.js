import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { application } from './application-safe-helpers.js';
import { post, save, author, applyFixture } from './versions-safe-helpers.js';

test('Workspace onboarding: a folder without Git can keep drafts and explicitly save a reviewed first version', { timeout: 90000 }, async t => {
  const app = await application({ repository: 'none' }); t.after(() => app.close());
  let status = (await app.api('/api/status')).data; assert.equal(status.workspace.kind, 'no_repository'); assert.equal(status.executionEnabled, false);
  await assert.rejects(access(path.join(app.root, '.git')));
  const draft = await post(app, '/api/tasks', { request: 'Keep this plan', draft: true }); assert.equal(draft.status, 202);
  await writeFile(path.join(app.root, '.env'), 'SECRET=not-for-git'); await writeFile(path.join(app.root, 'private.pem'), 'not-for-git');
  await mkdir(path.join(app.root, 'node_modules')); await writeFile(path.join(app.root, 'node_modules/dependency.js'), 'generated');
  assert.equal((await post(app, '/api/workspace/initialize', { branch: 'main' })).status, 400);
  assert.equal((await post(app, '/api/workspace/initialize', { branch: 'main', confirm: true })).status, 200);
  app.git('config', 'commit.gpgSign', 'false');
  assert.equal((await app.api('/api/workspace')).data.kind, 'unborn');
  const files = (await app.api('/api/workspace/initial-files')).data.files;
  assert(files.includes('example.txt')); assert(!files.some(f => /\.env|private\.pem|node_modules|\.nudgethis\//.test(f)));
  assert.equal((await post(app, '/api/workspace/initial-preview', { files: ['.env'] })).status, 400);
  const plan = await post(app, '/api/workspace/initial-preview', { files }); assert.equal(plan.status, 200, JSON.stringify(plan.data));
  await writeFile(path.join(app.root, 'example.txt'), 'Later editor change\n'); assert.equal((await save(app, plan.data)).status, 409);
  await writeFile(path.join(app.root, 'example.txt'), 'Application-only fixture\n');
  const result = await save(app, plan.data, 'Start project history'); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(app.git('rev-list', '--count', 'HEAD').trim(), '1'); assert(!app.git('ls-tree', '-r', '--name-only', 'HEAD').includes('.nudgethis/'));
  assert.equal(await readFile(path.join(app.root, '.env'), 'utf8'), 'SECRET=not-for-git');
  assert.equal(app.git('remote').trim(), ''); assert.equal((await app.api('/api/workspace')).data.kind, 'ready');
  assert.equal((await app.api(`/api/tasks/${draft.data.id}`)).data.status, 'draft');
  await app.restart(); assert.equal((await app.api('/api/workspace')).data.kind, 'ready');
  assert.equal((await post(app, '/api/workspace/initialize', { confirm: true, branch: 'main' })).status, 409);
});

test('Branch changes preserve edits, refuse stale context and keep conversations on their original branch', { timeout: 90000 }, async t => {
  const app = await application(); t.after(() => app.close());
  let w = (await app.api('/api/workspace')).data; assert.equal(w.branch, 'main');
  const index = await readFile(path.join(app.root, '.git/index'));
  await app.api('/api/workspace'); assert.deepEqual(await readFile(path.join(app.root, '.git/index')), index, 'Read-only polling never refreshes the real index');
  await writeFile(path.join(app.root, 'example.txt'), 'Existing editor change\n');
  assert.equal((await post(app, '/api/workspace/branch', { action: 'create', name: 'feature/readability', expected: w })).status, 409);
  assert.equal((await post(app, '/api/workspace/branch', { action: 'create', name: 'feature/readability', carryChanges: true, expected: w })).status, 200);
  assert.equal(await readFile(path.join(app.root, 'example.txt'), 'utf8'), 'Existing editor change\n');
  assert.equal((await post(app, '/api/workspace/branch', { action: 'switch', name: 'main', expected: w })).status, 409, 'Old branch context rejected');
  w = (await app.api('/api/workspace')).data;
  assert.equal((await post(app, '/api/workspace/branch', { action: 'switch', name: 'main', expected: w })).status, 409, 'Dirty branch is not switched');
  app.git('restore', '--', 'example.txt');
  assert.equal((await post(app, '/api/workspace/branch', { action: 'switch', name: 'main', expected: w })).status, 200);
  w = (await app.api('/api/workspace')).data;
  for (const name of ['../bad', '-B', 'bad name', '@{-1}']) assert.equal((await post(app, '/api/workspace/branch', { action: 'create', name, expected: w })).status, 400);
  const task = await applyFixture(app, { 'example.txt': 'Applied correction\n' });
  const blocked = await post(app, '/api/workspace/branch', { action: 'create', name: 'mixed-work', carryChanges: true, expected: w }); assert.equal(blocked.status, 409); assert.match(blocked.data.error, /Save or undo/);
  assert.equal((await app.api(`/api/tasks/${task.id}`)).data.baseBranch, 'main'); assert.equal(app.git('branch', '--show-current').trim(), 'main');
});

test('Existing unborn and detached repositories open the guide; staging and concurrent Git work remain protected', { timeout: 90000 }, async t => {
  const app = await application({ repository: 'unborn' }); t.after(() => app.close());
  assert.equal((await app.api('/api/workspace')).data.kind, 'unborn'); app.git('config', 'commit.gpgSign', 'false');
  app.git('add', '--', 'example.txt');
  assert.equal((await post(app, '/api/workspace/initial-preview', { files: ['example.txt'] })).status, 409);
  app.git('rm', '--cached', '--', 'example.txt');
  const files = (await app.api('/api/workspace/initial-files')).data.files;
  const plan = (await post(app, '/api/workspace/initial-preview', { files })).data;
  assert.equal((await save(app, plan, 'First version')).status, 200);
  app.git('checkout', '--detach', 'HEAD'); let w = (await app.api('/api/workspace')).data; assert.equal(w.kind, 'detached');
  await app.restart(); assert.equal((await app.api('/api/status')).data.workspace.kind, 'detached');
  assert.equal((await post(app, '/api/workspace/branch', { action: 'create', name: 'continue-here', expected: w })).status, 200);
  w = (await app.api('/api/workspace')).data;
  await writeFile(path.join(app.root, '.git/MERGE_HEAD'), w.head);
  assert.equal((await post(app, '/api/workspace/branch', { action: 'switch', name: 'main', expected: w })).status, 409); await rm(path.join(app.root, '.git/MERGE_HEAD'));
});

test('A missing Git installation is explained without starting commands or exposing credentials', { timeout: 30000 }, async t => {
  const app = await application({ repository: 'none', environment: { PATH: '' } }); t.after(() => app.close());
  assert.equal((await app.api('/api/status')).data.workspace.kind, 'missing_git');
  assert.equal((await post(app, '/api/tasks', { request: 'Plan before setup', draft: true })).status, 202);
  const status = await app.api('/api/github'); assert.equal(status.status, 200); assert.equal(status.data.available, false); assert.equal(status.data.account, null);
  assert.equal((await post(app, '/api/github', { action: 'publish' })).status, 409);
  assert.equal((await fetch(app.address + '/api/workspace')).status, 401); assert.equal((await fetch(app.address + '/api/github')).status, 401);
  assert.equal((await post(app, '/api/workspace/initialize', { branch: 'main', confirm: true })).status, 409);
  assert.equal((await post(app, '/api/versions/save', { message: 'Never save', identity: author, previewId: 'missing' })).status, 409);
});

test('First-version ref failure leaves source and index intact and allows a fresh review', { timeout: 90000 }, async t => {
  const app = await application({ repository: 'unborn' }); t.after(() => app.close()); app.git('config', 'commit.gpgSign', 'false');
  const files = (await app.api('/api/workspace/initial-files')).data.files;
  const plan = (await post(app, '/api/workspace/initial-preview', { files })).data;
  const lock = path.join(app.root, '.git/refs/heads/main.lock'); await writeFile(lock, 'other Git operation');
  assert.equal((await save(app, plan, 'First version')).status, 409); await rm(lock);
  await assert.rejects(access(path.join(app.root, '.git/index.lock'))); await assert.rejects(access(path.join(app.root, '.git/index')));
  assert.equal((await app.api('/api/workspace')).data.kind, 'unborn');
  assert.equal((await app.api('/api/versions')).data.history[0].status, 'failed');
  await app.restart(); const retry = (await post(app, '/api/workspace/initial-preview', { files })).data;
  assert.equal((await save(app, retry, 'First version')).status, 200);
  assert.equal(app.git('rev-list', '--count', 'HEAD').trim(), '1');
});
