// Deterministic file patches for application tests. No provider, model or agent is invoked.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { environment } from './application-safe-helpers.js';

export const post = (app, endpoint, data) => app.api(endpoint, { method: 'POST', body: JSON.stringify(data), signal: AbortSignal.timeout(60000) });
export const author = { name: 'Version Test', email: 'versions@example.invalid' };
export const selection = (...tasks) => ({ changes: tasks.map(({ id, attempt }) => ({ id, attempt })) });
export const save = (app, preview, message = 'Make the page easier to read') => post(app, '/api/versions/save', { previewId: preview.id, message, identity: author });
export async function preview(app, ...tasks) {
  const result = await post(app, '/api/versions/preview', selection(...tasks)); assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data;
}
export function editDatabase(app, action) {
  const db = new DatabaseSync(path.join(app.root, '.nudgethis/tasks.sqlite'));
  try { return action(db); } finally { db.close(); }
}
export async function applyFixture(app, edits, request = 'Make the page easier to read') {
  const created = await post(app, '/api/tasks', { request, kind: 'general', draft: true });
  assert.equal(created.status, 202); const task = created.data;
  const index = path.join(app.root, '.nudgethis', `fixture-index-${randomUUID()}`);
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: app.root, env: { ...environment, GIT_INDEX_FILE: index }, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  const originals = new Map();
  const write = async (name, bytes) => { const file = path.join(app.root, name); if (bytes === null) await rm(file, { force: true }); else { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); } };
  let base, diff, files;
  try {
    git('read-tree', 'HEAD'); git('add', '-A', '--', '.'); base = git('write-tree').trim();
    for (const [name, bytes] of Object.entries(edits)) { originals.set(name, await readFile(path.join(app.root, name)).catch(e => { if (e.code === 'ENOENT') return null; throw e; })); await write(name, bytes); }
    git('add', '-A', '--', '.'); const final = git('write-tree').trim();
    diff = git('diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', base, final, '--');
    files = git('diff', '--name-only', '-z', '--no-renames', base, final, '--').split('\0').filter(Boolean);
  } finally { for (const [name, bytes] of originals) await write(name, bytes); await rm(index, { force: true }); }
  Object.assign(task, { status: 'ready', baseCommit: base, baseBranch: app.git('branch', '--show-current').trim(), diff, files, validationStatus: 'not_configured' });
  editDatabase(app, db => db.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(task), Number(task.id.slice(3))));
  const applied = await post(app, `/api/tasks/${task.id}/apply`, { attempt: task.attempt }); assert.equal(applied.status, 200, JSON.stringify(applied.data));
  return applied.data;
}
