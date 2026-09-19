import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, symlink } from 'node:fs/promises';
import path from 'node:path';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { application } from './application-safe-helpers.js';

export const answers = { goal: 'website', objective: 'Show <our menu> & opening hours', audience: 'Local customers', data: 'none', accounts: false, payments: false, budget: 'free' };
const post = (app, endpoint, input) => app.api(endpoint, { method: 'POST', body: JSON.stringify(input) });
async function create(app, name, template = 'website') {
  const plan = await post(app, '/api/starter/plan', { name, template, answers }); assert.equal(plan.status, 200, JSON.stringify(plan.data));
  const created = await post(app, '/api/starter/create', { previewId: plan.data.id, confirm: true }); assert.equal(created.status, 200, JSON.stringify(created.data));
  return { plan: plan.data, project: created.data };
}
function client(url) {
  const u = new URL(url), token = new URLSearchParams(u.hash.slice(1)).get('token');
  return { token, address: u.origin, async api(endpoint, options = {}) { const res = await fetch(u.origin + endpoint, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }); return { status: res.status, data: await res.json() }; } };
}
async function state(app, status) { for (let i = 0; i < 100; i++) { const r = (await app.api('/api/preview')).data; if (r.state.status === status) return r; if (r.state.status === 'failed') assert.fail(r.state.message); await delay(30); } assert.fail(`Preview did not reach ${status}`); }
async function preview(app, action) { const plan = await post(app, '/api/preview/review', { action }); assert.equal(plan.status, 200, JSON.stringify(plan.data)); const r = await post(app, '/api/preview', { previewId: plan.data.id, confirm: true }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r; }

test('Project diagnosis, reviewed creation, local context and persistent library without Git or agents', { timeout: 30000 }, async t => {
  const app = await application({ repository: 'none' }); t.after(() => app.close());
  for (const [input, expected] of [[answers, 'website'], [{ ...answers, goal: 'content' }, 'astro'], [{ ...answers, accounts: true }, 'react'], [{ ...answers, data: 'shared' }, 'react']]) {
    const result = await post(app, '/api/starter/diagnose', input); assert.equal(result.status, 200); assert.equal(result.data.recommended, expected);
  }
  assert.equal((await post(app, '/api/starter/diagnose', { ...answers, objective: '' })).status, 400);
  for (const name of ['../escape', 'Bad Name', 'con', 'aux', 'x/y']) assert.equal((await post(app, '/api/starter/plan', { name, answers })).status, 400);
  const { plan, project } = await create(app, 'first-site');
  assert.equal((await post(app, '/api/starter/create', { previewId: plan.id, confirm: true })).data.id, project.id, 'Creation retries return the existing project');
  assert.equal((await post(app, '/api/starter/plan', { name: 'first-site', answers })).status, 409);
  await assert.rejects(access(path.join(project.path, '.git')));
  const source = await readFile(path.join(project.path, 'index.html'), 'utf8'); assert.match(source, /Show &lt;our menu&gt; &amp; opening hours/); assert(!source.includes(app.token));
  const opened = await post(app, '/api/starter/open', { id: project.id }); assert.equal(opened.status, 200, JSON.stringify(opened.data)); const child = client(opened.data.url);
  assert.equal((await child.api('/api/status')).data.executionEnabled, false);
  const context = (await child.api('/api/project-context')).data; assert.match(JSON.stringify(context), /Show <our menu> & opening hours/);
  const workspace = (await child.api('/api/workspace')).data; assert.equal(workspace.ready, false);
  await app.restart(); const rows = (await app.api('/api/starter')).data.projects; assert.equal(rows.length, 1); assert.equal(rows[0].url, undefined);
  assert.equal((await post(app, '/api/starter/remove', { id: project.id })).status, 400);
  assert.equal((await post(app, '/api/starter/remove', { id: project.id, confirm: true })).status, 200); await access(path.join(project.path, 'index.html'));
});

test('Owned Rust preview serves the generated website, keeps tokens out of files, stops and rejects unsafe paths', { timeout: 30000 }, async t => {
  const app = await application({ repository: 'none' }); t.after(() => app.close()); const { project } = await create(app, 'preview-site');
  const child = client((await post(app, '/api/starter/open', { id: project.id })).data.url);
  await preview(child, 'start'); const report = await state(child, 'running'), url = new URL(report.state.url);
  const body = await (await fetch(url.origin)).text(); assert.match(body, /starter-bridge.js/); assert(!body.includes(child.token));
  const bridge = await fetch(`${child.address}/starter-bridge.js`, { headers: { Origin: url.origin } }); assert.equal(bridge.headers.get('access-control-allow-origin'), url.origin);
  assert.equal((await fetch(url.origin + '/style.css')).status, 200);
  for (const relative of ['/.nudgethis/token', '/nudgethis.toml', '/%2e%2e/example.txt', '/.git/config']) assert.equal((await fetch(url.origin + relative)).status, 404);
  const foreignHost = await new Promise((resolve, reject) => { const req = request(url.origin, { headers: { Host: 'foreign.example' } }, r => { r.resume(); resolve(r.statusCode); }); req.on('error', reject); req.end(); }); assert.equal(foreignHost, 403);
  if (process.platform !== 'win32') { await symlink(path.join(app.root, 'example.txt'), path.join(project.path, 'outside.html')); assert.equal((await fetch(url.origin + '/outside.html')).status, 404); }
  await preview(child, 'restart'); await state(child, 'running');
  await post(child, '/api/preview', { action: 'stop' }); assert.equal((await child.api('/api/preview')).data.state.status, 'stopped'); await assert.rejects(fetch(url.origin));
  await preview(child, 'start'); const live = await state(child, 'running'); await post(app, '/api/starter/close', { id: project.id }); await assert.rejects(fetch(new URL(live.state.url).origin));
});

test('Framework starters are explicit, project command disable is enforced and stale reviews are rejected', { timeout: 30000 }, async t => {
  const app = await application({ repository: 'none' }); t.after(() => app.close());
  for (const template of ['react', 'astro']) {
    const { project } = await create(app, `my-${template}`, template); const pkg = JSON.parse(await readFile(path.join(project.path, 'package.json'), 'utf8')); assert.equal(pkg.private, true);
    const child = client((await post(app, '/api/starter/open', { id: project.id })).data.url);
    assert.equal((await child.api('/api/preview')).data.recipe.supported, true);
    assert.equal((await post(child, '/api/preview/review', { action: 'install' })).status, 403);
  }
  const { project } = await create(app, 'changed-site'); const child = client((await post(app, '/api/starter/open', { id: project.id })).data.url);
  const plan = await post(child, '/api/preview/review', { action: 'start' }); await writeFile(path.join(project.path, 'package.json'), '{}');
  assert.equal((await post(child, '/api/preview', { previewId: plan.data.id, confirm: true })).status, 409);
  const existing = await post(app, '/api/starter/import', { path: project.path, confirm: true }); assert.equal(existing.data.id, project.id);
});

test('Starter refuses nesting a new project inside existing Git history', async t => {
  const app = await application(); t.after(() => app.close());
  const response = await post(app, '/api/starter/plan', { name: 'nested', answers });
  assert.equal(response.status, 409); assert.match(response.data.error, /outside an existing Git project/);
});
