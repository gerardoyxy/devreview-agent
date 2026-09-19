import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCore, loadConfig } from '../packages/core/src/index.js';
import { TaskStore } from '../packages/queue/src/store.js';
import { fixture, config, input, agent, finished } from './helpers.js';
import { run, validateInput } from '../packages/shared/src/index.js';

test('tasks and tokens survive restart; only one server may own a repository', async t => {
  const root = await fixture(t);
  const core = await createCore({ root, config, agent });
  const task = await core.queue.submit(input); await finished(core, task.id);
  await assert.rejects(createCore({ root, config, agent }), /server lock/);
  const token = core.token; await core.close();
  const reopened = await createCore({ root, config, agent }); t.cleanups.push(() => reopened.close());
  assert.equal(reopened.token, token); assert.equal(reopened.store.get(task.id).status, 'ready');
});

test('interrupted task states recover as failed without silently rerunning an agent', () => {
  const store = new TaskStore(':memory:');
  try {
    const task = store.create(input); store.update(task.id, { status: 'working' }); store.recover();
    assert.equal(store.get(task.id).status, 'failed'); assert.match(store.get(task.id).error, /Server stopped/);
    assert.throws(() => store.get('../../escape'), /Invalid task/);
  } finally { store.close(); }
});

test('input is bounded and does not carry execution or credential fields', () => {
  const result = validateInput({ ...input, request: 'x'.repeat(9000), command: 'rm -rf anything', context: { ...input.context, password: 'secret' } });
  assert.equal(result.request.length, 8000); assert.equal(result.command, undefined); assert.equal(result.context.password, undefined);
  assert.throws(() => validateInput({ request: '   ', context: input.context }), /Describe/);
});

test('configuration rejects wildcard / external origins', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'nudgethis.config.mjs'), "export default {server: {allowedOrigins: ['https://example.com']}};");
  await assert.rejects(loadConfig(root), /loopback origins/);
});

test('process cancellation and timeout do not report success', async () => {
  const controller = new AbortController();
  const pending = run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, /Cancelled/);
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 30 }), /timed out/);
});

test('local credentials are not created unless the state directory is ignored', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, '.gitignore'), '');
  await assert.rejects(createCore({ root, config, agent }), /Ignore .nudgethis/);
  const { access } = await import('node:fs/promises');
  await assert.rejects(access(path.join(root, '.nudgethis/token')));
});
