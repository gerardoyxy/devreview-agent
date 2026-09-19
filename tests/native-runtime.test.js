import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { NativeAgent } from '../packages/agent-sdk/src/index.js';
import { startServer } from '../packages/server/src/index.js';
import { config, fixture, input, finished } from './helpers.js';

const peer = fileURLToPath(new URL('./fixtures/native-agent.mjs', import.meta.url));
const make = (transport, mode = transport, flavor = 'normal', extra = {}) => new NativeAgent({ id: 'test', transport, command: process.execPath, args: [peer, mode, flavor], ...extra });
const run = (agent, cwd, messages = [], task = input) => agent.run({ cwd, task, signal: new AbortController().signal, onMessage: text => messages.push(text) });

test('Rust Codex transport handles split frames, excludes reasoning, and keeps prompt off arguments', async t => {
  const cwd = await fixture(t), messages = [];
  await run(make('codex'), cwd, messages, { ...input, request: '$(touch INJECTED); keep literal', messages: [{ role: 'user', content: 'Previous turn' }] });
  assert.deepEqual(messages, ['Codex protocol reply.']);
  const captured = JSON.parse(await readFile(path.join(cwd, 'captured.json'), 'utf8'));
  assert.match(captured.input, /Previous turn/); assert.match(captured.input, /\$\(touch INJECTED\)/);
  assert.ok(captured.args.includes('--sandbox')); assert.ok(captured.args.includes('workspace-write'));
  assert.ok(!captured.args.some(arg => arg.includes('INJECTED')));
  await assert.rejects(access(path.join(cwd, 'INJECTED')));
});

test('Rust ACP negotiates, creates a session, assembles public chunks and stops the long-lived peer', async t => {
  const cwd = await fixture(t), messages = [];
  await run(make('acp'), cwd, messages);
  assert.deepEqual(messages, ['Hello from ACP.']);
  assert.equal(await readFile(path.join(cwd, 'acp-cwd.txt'), 'utf8'), cwd);
});

test('ACP accepts a peer closing stderr before completing the response', async t => {
  const cwd = await fixture(t), messages = [];
  await run(make('acp', 'acp', 'close-stderr'), cwd, messages);
  assert.deepEqual(messages, ['Hello from ACP.']);
});

test('ACP rejects protocol mismatch, unrelated sessions and permissions it cannot display', async t => {
  const cwd = await fixture(t);
  await assert.rejects(run(make('acp', 'acp', 'bad-version'), cwd), /Unsupported ACP protocol/);
  await assert.rejects(run(make('acp', 'acp', 'wrong-session'), cwd), /another session/);
  await assert.rejects(run(make('acp', 'acp', 'permission'), cwd), /Interactive permissions are not supported/);
});

test('custom stdio preserves messages and fails on provider errors even with exit zero', async t => {
  const cwd = await fixture(t), messages = [];
  await run(make('stdio'), cwd, messages);
  assert.deepEqual(messages, ['Custom agent reply.']);
  await assert.rejects(run(make('stdio', 'stdio', 'failure'), cwd), /Custom provider failed/);
  await assert.rejects(run(make('codex', 'codex', 'failure'), cwd), /Codex provider failed/);
});

test('native timeout stops descendants before they can write into the worktree', async t => {
  const cwd = await fixture(t);
  await assert.rejects(run(make('stdio', 'timeout', 'normal', { timeout: 400 }), cwd), /timed out/);
  await new Promise(resolve => setTimeout(resolve, 1300));
  await assert.rejects(access(path.join(cwd, 'escaped-child.txt')));
});

test('native transport rejects unbounded output and supports cancellation', async t => {
  const cwd = await fixture(t);
  await assert.rejects(run(make('stdio', 'flood'), cwd), /output exceeded/);
  const controller = new AbortController();
  const pending = make('stdio', 'timeout').run({ cwd, task: input, signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 400);
  t.after(() => clearTimeout(timer));
  await assert.rejects(pending, /Cancelled/);
  await new Promise(resolve => setTimeout(resolve, 1300));
  await assert.rejects(access(path.join(cwd, 'escaped-child.txt')));
});

test('HTTP task routing uses only configured agent IDs and retains conversations/review', async t => {
  const root = await fixture(t);
  const app = await startServer({ root, config: { ...config, defaultAgent: 'first', agents: [
    { id: 'first', transport: 'stdio', command: process.execPath, args: [peer, 'stdio'] },
    { id: 'second', transport: 'stdio', command: process.execPath, args: [peer, 'stdio', 'edit'] }
  ] } });
  t.cleanups.push(() => app.close());
  const headers = { Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json' };
  const post = body => fetch(app.url + '/api/tasks', { method: 'POST', headers, body: JSON.stringify(body) });
  const status = await fetch(app.url + '/api/status', { headers }).then(response => response.json());
  assert.deepEqual(status.agents.map(agent => agent.id), ['first', 'second']);
  assert.equal(status.agents[0].capabilities.resume, false);
  assert.equal((await post({ ...input, agent: 'unknown', command: 'ignored' })).status, 400);
  assert.equal(app.store.list().length, 0);
  const response = await post({ ...input, agent: 'second' }); assert.equal(response.status, 202);
  const created = await response.json(); const ready = await finished(app, created.id);
  assert.equal(ready.agent, 'second'); assert.equal(ready.status, 'ready', ready.error);
  assert.match(ready.diff, /blue/);
  assert.equal(app.store.details(created.id).messages.at(-1).content, 'Custom agent reply.');
  const continued = await app.queue.message(created.id, 'Keep the change and explain it', 1);
  assert.equal(continued.agent, 'second'); await finished(app, created.id);
  await app.queue.action(created.id, 'apply', 2);
  assert.match(await readFile(path.join(root, 'button.css'), 'utf8'), /blue/);
});
