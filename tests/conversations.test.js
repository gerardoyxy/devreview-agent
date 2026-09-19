import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCore } from '../packages/core/src/index.js';
import { startServer } from '../packages/server/src/index.js';
import { codexMessages, buildPrompt } from '../packages/agent-sdk/src/index.js';
import { TaskStore } from '../packages/queue/src/store.js';
import { DatabaseSync } from 'node:sqlite';
import { fixture, config, input, agent, finished, until, git } from './helpers.js';

test('follow-ups keep the conversation, previous edits, and historical diffs', async t => {
  const root = await fixture(t);
  const seen = [];
  const conversational = { name: 'conversation', async run({ cwd, task, onMessage }) {
    seen.push(task.messages);
    if (task.attempt === 1) await writeFile(path.join(cwd, 'button.css'), '.button { color: green; }\n');
    else {
      assert.match(await readFile(path.join(cwd, 'button.css'), 'utf8'), /green/);
      await writeFile(path.join(cwd, 'button.css'), '.button { color: green; border-radius: 14px; }\n');
    }
    onMessage(task.attempt === 1 ? 'I made it green.' : 'I kept it green and rounded the corners.');
    return {};
  } };
  const core = await createCore({ root, config, agent: conversational }); t.cleanups.push(() => core.close());
  const task = await core.queue.submit(input); await finished(core, task.id);
  const first = core.store.get(task.id).diff;
  await core.queue.message(task.id, 'Also round the corners');
  const second = await finished(core, task.id);
  assert.equal(second.status, 'ready'); assert.equal(second.attempt, 2);
  assert.match(second.diff, /green; border-radius: 14px/);
  assert.equal(core.store.revision(task.id, 1).diff, first);
  assert.deepEqual(seen[1].map(message => message.content), ['Make the button green', 'I made it green.', 'Also round the corners']);
  const detail = core.store.details(task.id);
  assert.equal(detail.messages.length, 4); assert.equal(detail.revisions.length, 2);
  assert.ok(detail.history.some(event => event.action === 'ready'));
  await core.queue.action(task.id, 'apply');
  assert.match(await readFile(path.join(root, 'button.css'), 'utf8'), /border-radius: 14px/);
  assert.equal(core.store.revision(task.id, 2).status, 'applied');
});

test('a question-only response waits for feedback and a reply can produce a patch', async t => {
  const root = await fixture(t);
  const core = await createCore({ root, config, agent: { name: 'clarification', async run({ task, cwd, onMessage }) {
    if (task.attempt === 1) { onMessage('Should the button be green or blue?'); return {}; }
    assert.equal(task.messages.at(-1).content, 'Green, please');
    await agent.run({ cwd }); return { message: 'I used green.' };
  } } }); t.cleanups.push(() => core.close());
  const task = await core.queue.submit(input);
  assert.equal((await finished(core, task.id)).status, 'awaiting_feedback');
  await assert.rejects(core.queue.action(task.id, 'apply'), /Only ready/);
  await core.queue.message(task.id, 'Green, please');
  assert.equal((await finished(core, task.id)).status, 'ready');
  assert.equal(core.store.messages(task.id).at(-1).content, 'I used green.');
});

test('assistant feedback is persisted before the agent finishes and overlapping turns are rejected', async t => {
  const root = await fixture(t);
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const core = await createCore({ root, config, agent: { name: 'stream', async run({ onMessage, cwd }) {
    onMessage('I am working on the layout.'); await wait; return agent.run({ cwd });
  } } }); t.cleanups.push(() => core.close());
  const task = await core.queue.submit(input);
  try {
    await until(() => core.store.messages(task.id).length === 2);
    assert.equal(core.store.get(task.id).status, 'working');
    await assert.rejects(core.queue.message(task.id, 'Another adjustment'), /Wait for the agent/);
    assert.equal(core.store.messages(task.id).length, 2);
  } finally { release(); }
  await finished(core, task.id);
});

test('conversation and versions persist across server restart, including applied history', async t => {
  const root = await fixture(t);
  let core = await createCore({ root, config, agent });
  t.cleanups.push(() => core.close());
  const task = await core.queue.submit(input); await finished(core, task.id);
  await core.queue.message(task.id, 'Keep the color, please'); await finished(core, task.id);
  await core.queue.action(task.id, 'apply');
  await core.close(); core = await createCore({ root, config, agent });
  assert.equal(core.store.details(task.id).messages.length, 2);
  assert.equal(core.store.details(task.id).revisions.length, 2);
  await assert.rejects(core.queue.message(task.id, 'Now add padding'), /Commit or stash/);
  await git(root, 'add', '.'); await git(root, 'commit', '-m', 'Apply first change');
  await core.queue.message(task.id, 'Now add padding'); await finished(core, task.id);
  assert.equal(core.store.get(task.id).attempt, 3);
  assert.equal(core.store.revision(task.id, 2).status, 'applied');
});

test('JSONL processing handles fragmented lines and only emits public agent messages once', () => {
  const messages = [];
  const parser = codexMessages(text => messages.push(text));
  const events = [
    { type: 'item.completed', item: { id: 'reason', type: 'reasoning', text: 'private reasoning' } },
    { type: 'item.completed', item: { id: 'tool', type: 'command_execution', text: 'tool output' } },
    { type: 'item.completed', item: { id: 'reply', type: 'agent_message', text: 'Here is the fix.' } },
    { type: 'item.completed', item: { id: 'reply', type: 'agent_message', text: 'Here is the fix.' } },
    { type: 'item.completed', item: { id: 'reply2', type: 'agent_message', text: 'Would you like the corners rounded?' } }
  ].map(event => JSON.stringify(event)).join('\n');
  for (let i = 0; i < events.length; i += 11) parser.push(events.slice(i, i + 11));
  parser.finish();
  assert.deepEqual(messages, ['Here is the fix.', 'Would you like the corners rounded?']);
  assert.match(buildPrompt({ ...input, messages: [{ role: 'user', content: 'Make it blue instead' }] }), /Make it blue instead/);
});

test('upgrading an alpha database preserves the original request and current patch without duplicate messages', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'legacy.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec('CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);');
  legacy.prepare('INSERT INTO tasks(data) VALUES (?)').run(JSON.stringify({ ...input, attempt: 1, status: 'ready', diff: 'original patch', files: ['button.css'], validation: [], baseCommit: 'abc', baseBranch: 'main', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  legacy.close();
  let store = new TaskStore(file);
  assert.equal(store.details('QA-1').messages[0].content, input.request);
  assert.equal(store.revision('QA-1', 1).diff, 'original patch');
  store.close(); store = new TaskStore(file);
  assert.equal(store.details('QA-1').messages.length, 1); store.close();
});

test('retry and reject preserve earlier version snapshots and a failed message stores no content', async t => {
  const root = await fixture(t);
  const core = await createCore({ root, config, agent }); t.cleanups.push(() => core.close());
  const task = await core.queue.submit(input); await finished(core, task.id);
  const diff = core.store.get(task.id).diff;
  await core.queue.action(task.id, 'retry'); await finished(core, task.id);
  assert.equal(core.store.revision(task.id, 1).diff, diff);
  await core.queue.action(task.id, 'reject');
  assert.equal(core.store.revision(task.id, 2).status, 'rejected');
  await writeFile(path.join(root, 'other.txt'), 'unsaved changes');
  await assert.rejects(core.queue.message(task.id, 'This must not be stored'), /Commit or stash/);
  assert.equal(core.store.messages(task.id).length, 1);
});

test('conversation and revision endpoints enforce authentication and message validation', async t => {
  const root = await fixture(t);
  const app = await startServer({ root, config, agent }); t.cleanups.push(() => app.close());
  const task = await app.queue.submit(input); await finished(app, task.id);
  const endpoint = `${app.url}/api/tasks/${task.id}`;
  const headers = { Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(endpoint + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"content":"hello"}' })).status, 401);
  for (const content of ['', ' ', 123, 'x'.repeat(8001)]) {
    assert.equal((await fetch(endpoint + '/messages', { method: 'POST', headers, body: JSON.stringify({ content }) })).status, 400);
  }
  const response = await fetch(endpoint + '/messages', { method: 'POST', headers, body: JSON.stringify({ content: 'Keep it green', role: 'assistant' }) });
  assert.equal(response.status, 202);
  await finished(app, task.id);
  const detail = await fetch(endpoint, { headers }).then(res => res.json());
  assert.equal(detail.messages.at(-1).role, 'user'); assert.equal(detail.revisions.length, 2);
  const revision = await fetch(endpoint + '/revisions/1', { headers }).then(res => res.json());
  assert.match(revision.diff, /green/);
  assert.equal((await fetch(endpoint + '/revisions/999', { headers })).status, 404);
});
