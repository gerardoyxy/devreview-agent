import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '../packages/shared/src/index.js';

export async function git(root, ...args) {
  const result = await run('git', ['-c', 'user.name=DevReview Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root });
  if (result.code) throw new Error(result.stderr);
  return result.stdout.trim();
}
export async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'devreview-test-'));
  t.cleanups = [];
  t.after(async () => {
    for (const cleanup of t.cleanups) await cleanup();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  await git(root, 'init', '-b', 'main');
  await writeFile(path.join(root, '.gitignore'), '.devreview/\n');
  await writeFile(path.join(root, 'button.css'), '.button { color: red; }\n');
  await writeFile(path.join(root, 'other.txt'), 'unchanged\n');
  await git(root, 'add', '.'); await git(root, 'commit', '-m', 'Fixture');
  return root;
}
export const config = { port: 0, origins: ['http://localhost:3000'], maxConcurrent: 2, commands: [], validationTimeout: 5000, agentOptions: {} };
export const input = { request: 'Make the button green', context: { url: 'http://localhost:3000/settings', route: '/settings', tagName: 'button', selector: '.button', viewport: { width: 1440, height: 900 } } };
export const agent = { name: 'fixture', async run({ cwd }) { await writeFile(path.join(cwd, 'button.css'), '.button { color: green; }\n'); return { output: 'Changed the button color.' }; } };
export async function until(check, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await check(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Condition timed out');
}
export const finished = (core, id) => until(() => { const task = core.store.get(id); return ['ready', 'awaiting_feedback', 'failed', 'cancelled'].includes(task.status) && !core.queue.active.has(id) ? task : false; });
