import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink, access } from 'node:fs/promises';
import path from 'node:path';
import { createCore } from '../packages/core/src/index.js';
import { fixture, config, input, agent, finished, git, until } from './helpers.js';

async function setup(t, overrides = {}) {
  const root = await fixture(t);
  const core = await createCore({ root, config, agent, ...overrides });
  t.cleanups.push(() => core.close());
  return core;
}

test('a task edits an isolated worktree, validates, and only applies on explicit request', async t => {
  const core = await setup(t, { config: { ...config, commands: [`"${process.execPath}" -e "process.exit(require('fs').readFileSync('button.css','utf8').includes('green')?0:1)"`] } });
  const task = await core.queue.submit(input);
  const ready = await finished(core, task.id);
  assert.equal(ready.status, 'ready'); assert.equal(ready.validation[0].passed, true);
  assert.match(ready.diff, /\+\.button \{ color: green; \}/);
  assert.match(await readFile(path.join(core.root, 'button.css'), 'utf8'), /red/);
  const head = await git(core.root, 'rev-parse', 'HEAD');
  await core.queue.action(task.id, 'apply');
  assert.equal(core.store.get(task.id).status, 'applied');
  assert.match(await readFile(path.join(core.root, 'button.css'), 'utf8'), /green/);
  assert.equal(await git(core.root, 'rev-parse', 'HEAD'), head, 'Applying does not create a commit');
  await assert.rejects(access(core.repository.worktree(task.id)));
  assert.equal(core.store.db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'applied'").get().n, 1);
});

test('local edits are preserved and conflicts can retry against a new committed state', async t => {
  const core = await setup(t);
  const task = await core.queue.submit(input); await finished(core, task.id);
  await writeFile(path.join(core.root, 'button.css'), '.button { color: blue; }\n');
  await assert.rejects(core.queue.action(task.id, 'apply'), /local edits/);
  assert.equal(core.store.get(task.id).status, 'conflict');
  assert.match(await readFile(path.join(core.root, 'button.css'), 'utf8'), /blue/);
  await git(core.root, 'add', '.'); await git(core.root, 'commit', '-m', 'Developer edit');
  await core.queue.action(task.id, 'retry');
  const retried = await finished(core, task.id);
  assert.equal(retried.status, 'ready'); assert.equal(retried.attempt, 2);
  assert.match(retried.diff, /-\.button \{ color: blue; \}/);
});

test('a compatible patch can apply after an unrelated commit, preserving unrelated edits', async t => {
  const core = await setup(t);
  const task = await core.queue.submit(input); await finished(core, task.id);
  await writeFile(path.join(core.root, 'other.txt'), 'new commit\n');
  await git(core.root, 'add', 'other.txt'); await git(core.root, 'commit', '-m', 'Unrelated commit');
  await writeFile(path.join(core.root, 'other.txt'), 'uncommitted unrelated edit\n');
  await core.queue.action(task.id, 'apply');
  assert.equal(await readFile(path.join(core.root, 'other.txt'), 'utf8'), 'uncommitted unrelated edit\n');
});

test('branch changes and overlapping committed edits are conflicts', async t => {
  const core = await setup(t);
  const task = await core.queue.submit(input); await finished(core, task.id);
  await git(core.root, 'switch', '-c', 'other');
  await assert.rejects(core.queue.action(task.id, 'apply'), /branch changed/);
  await git(core.root, 'switch', 'main');
  await core.queue.action(task.id, 'retry'); await finished(core, task.id);
  await writeFile(path.join(core.root, 'button.css'), 'completely different\n');
  await git(core.root, 'add', '.'); await git(core.root, 'commit', '-m', 'Overlap');
  await assert.rejects(core.queue.action(task.id, 'apply'), /patch/);
  assert.equal(await readFile(path.join(core.root, 'button.css'), 'utf8'), 'completely different\n');
});

test('concurrent tasks run separately and concurrent applies serialize', async t => {
  const paths = new Set();
  const core = await setup(t, { agent: { name: 'concurrent', async run({ cwd }) { paths.add(cwd); await new Promise(resolve => setTimeout(resolve, 50)); return agent.run({ cwd }); } } });
  const [a, b] = await Promise.all([core.queue.submit(input), core.queue.submit(input)]);
  await Promise.all([finished(core, a.id), finished(core, b.id)]);
  assert.equal(paths.size, 2);
  const results = await Promise.allSettled([core.queue.action(a.id, 'apply'), core.queue.action(b.id, 'apply')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.deepEqual(new Set([core.store.get(a.id).status, core.store.get(b.id).status]), new Set(['applied', 'conflict']));
});

test('validation failure prevents apply and retains the worktree for inspection', async t => {
  const core = await setup(t, { config: { ...config, commands: [`"${process.execPath}" -e "console.error('broken test');process.exit(1)"`] } });
  const task = await core.queue.submit(input);
  const failed = await finished(core, task.id);
  assert.equal(failed.status, 'failed'); assert.match(failed.validation[0].output, /broken test/);
  await assert.rejects(core.queue.action(task.id, 'apply'), /Only ready/);
  await access(core.repository.worktree(task.id));
  await core.queue.action(task.id, 'reject'); await assert.rejects(access(core.repository.worktree(task.id)));
});

test('cancellation interrupts a running adapter and never produces a ready patch', async t => {
  const core = await setup(t, { agent: { name: 'waiting', async run({ signal }) { await new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true }); }); } } });
  const task = await core.queue.submit(input);
  await until(() => core.store.get(task.id).status === 'working');
  await core.queue.action(task.id, 'cancel');
  assert.equal(core.store.get(task.id).status, 'cancelled');
  assert.equal(core.queue.active.size, 0);
  assert.match(await readFile(path.join(core.root, 'button.css'), 'utf8'), /red/);
});

test('new binary files and deleted files are included in the reviewed patch', async t => {
  const { unlink } = await import('node:fs/promises');
  const bytes = Buffer.from([0, 2, 255, 4, 0, 6]);
  const core = await setup(t, { agent: { name: 'files', async run({ cwd }) { await writeFile(path.join(cwd, 'asset.bin'), bytes); await unlink(path.join(cwd, 'other.txt')); return {}; } } });
  const task = await core.queue.submit(input); const ready = await finished(core, task.id);
  assert.equal(ready.status, 'ready'); assert.deepEqual(ready.files.sort(), ['asset.bin', 'other.txt']);
  await core.queue.action(task.id, 'apply'); assert.deepEqual(await readFile(path.join(core.root, 'asset.bin')), bytes);
  await assert.rejects(access(path.join(core.root, 'other.txt')));
});

test('secret files and symlink patches cannot become ready', async t => {
  const core = await setup(t, { agent: { name: 'unsafe', async run({ cwd }) { await writeFile(path.join(cwd, '.env'), 'SECRET=value'); return {}; } } });
  const secret = await core.queue.submit(input); assert.equal((await finished(core, secret.id)).status, 'failed');
  if (process.platform !== 'win32') {
    core.queue.agent = { name: 'symlink', async run({ cwd }) { await symlink('/tmp', path.join(cwd, 'escape')); return {}; } };
    const link = await core.queue.submit(input); assert.match((await finished(core, link.id)).error, /Symlink/);
  }
});

test('dirty snapshots are rejected before an agent starts', async t => {
  const core = await setup(t);
  await writeFile(path.join(core.root, 'untracked.txt'), 'not committed');
  await assert.rejects(core.queue.submit(input), /Commit or stash/);
  assert.equal(core.store.list().length, 0);
});
