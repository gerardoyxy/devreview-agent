import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { NativeAgent } from './runtime-driver.js';
import { fixture, input } from './helpers.js';

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
  if (process.platform === 'win32') return; // Server cancellation is covered on every OS in rust-server.test.js.
  const controller = new AbortController();
  const pending = make('stdio', 'timeout').run({ cwd, task: input, signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 400);
  t.after(() => clearTimeout(timer));
  await assert.rejects(pending, /Cancelled/);
  await new Promise(resolve => setTimeout(resolve, 1300));
  await assert.rejects(access(path.join(cwd, 'escaped-child.txt')));
});
