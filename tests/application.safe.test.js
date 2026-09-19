import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { application, cli } from './application-safe-helpers.js';

test('application API: drafts, context, authentication, persistence and execution lock', { timeout: 60000 }, async t => {
  const app = await application(); t.after(() => app.close());
  const post = (endpoint, data) => app.api(endpoint, { method: 'POST', body: JSON.stringify(data) });
  const unauthorized = await fetch(app.address + '/api/tasks'); assert.equal(unauthorized.status, 401);
  const foreign = await app.api('/api/tasks', { headers: { Origin: 'https://example.com' } }); assert.equal(foreign.status, 403);
  const unknown = await app.api('/api/tasks/QA-01'); assert.equal(unknown.status, 400);
  const status = await app.api('/api/status'); assert.equal(status.data.executionEnabled, false);
  const report = await app.api('/api/diagnostics'); assert.equal(report.status, 200); assert.equal(report.data.executionEnabled, false);
  assert(report.data.agents.every(agent => agent.authentication === 'not checked'));
  const index = await readFile(path.join(app.root, '.git/index'));
  const created = await post('/api/tasks', { request: 'Add pagination to the API', kind: 'backend', draft: true, references: ['src/api.ts'] });
  assert.equal(created.status, 202); assert.equal(created.data.status, 'draft'); assert.equal(created.data.baseCommit, undefined);
  const id = created.data.id;
  const edited = await post(`/api/tasks/${id}/draft`, { attempt: 1, request: 'Add cursor pagination', kind: 'backend', references: ['src/api.ts'], draft: true });
  assert.equal(edited.status, 200); assert.equal(edited.data.attempt, 2); assert.equal(edited.data.messages.length, 2);
  const stale = await post(`/api/tasks/${id}/draft`, { attempt: 1, request: 'Stale draft', draft: true }); assert.equal(stale.status, 409);
  for (const action of ['start', 'retry']) { const result = await post(`/api/tasks/${id}/${action}`, { attempt: 2 }); assert.equal(result.status, 403); }
  const execution = await post('/api/tasks', { request: 'Must remain blocked', kind: 'general' }); assert.equal(execution.status, 403);
  const message = await post(`/api/tasks/${id}/messages`, { content: 'Must remain blocked', attempt: 2 }); assert.equal(message.status, 403);
  const bad = await post('/api/tasks', { request: 'Bad path', draft: true, references: ['../escape'] }); assert.equal(bad.status, 400);
  const context = await app.api('/api/project-context'); assert.equal(context.status, 200);
  const appearance = await app.api('/api/appearance'); assert.equal(appearance.status, 200);
  const unsafeAppearance = await post('/api/appearance', { mode: 'light', customCss: 'url(https://example.com)' }); assert.equal(unsafeAppearance.status, 400);
  const streamController = new AbortController();
  const stream = await fetch(app.address + '/api/events', { headers: { Authorization: `Bearer ${app.token}` }, signal: streamController.signal });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /event: connected/);
  await reader.cancel(); streamController.abort();
  assert.deepEqual(await readFile(path.join(app.root, '.git/index')), index);
  await assert.rejects(access(path.join(app.root, '.devreview/worktrees')));
  await app.restart();
  const persisted = await app.api(`/api/tasks/${id}`); assert.equal(persisted.data.request, 'Add cursor pagination'); assert.equal(persisted.data.status, 'draft');
  const revision = await app.api(`/api/tasks/${id}/revisions/1`); assert.equal(revision.status, 200); assert.equal(revision.data.request, 'Add pagination to the API');
  const deleted = await app.api(`/api/tasks/${id}`, { method: 'DELETE' }); assert.equal(deleted.status, 200);
  assert.equal((await app.api(`/api/tasks/${id}`)).status, 404);
});

test('CLI doctor is read-only and init preserves existing configuration', { timeout: 30000 }, async t => {
  const app = await application(); t.after(() => app.close());
  await writeFile(path.join(app.root, 'package.json'), JSON.stringify({ packageManager: 'bun@1.2.0', dependencies: { vue: '3' }, scripts: { build: 'never-execute-this' } }));
  await writeFile(path.join(app.root, 'bun.lock'), '');
  const before = await readFile(path.join(app.root, 'devreview.toml'));
  const doctor = cli(app.root, 'doctor'); assert.equal(doctor.status, 0, doctor.stderr);
  const report = JSON.parse(doctor.stdout); assert.equal(report.project.packageManager, 'bun'); assert.deepEqual(report.project.frameworks, ['Vue']);
  const init = cli(app.root, 'init'); assert.equal(init.status, 0, init.stderr);
  assert.deepEqual(await readFile(path.join(app.root, 'devreview.toml')), before);
  const help = cli(app.root, 'start', '--help'); assert.equal(help.status, 0); assert.match(help.stdout, /--no-execution/);
});

test('route inventory persists explicit coverage and rejects stale or unsafe updates', { timeout: 30000 }, async t => {
  const app = await application(); t.after(() => app.close());
  await mkdir(path.join(app.root, 'src/app/products/[id]'), { recursive: true });
  await writeFile(path.join(app.root, 'src/app/page.tsx'), 'export default function Page() { return null; }');
  await writeFile(path.join(app.root, 'src/app/products/[id]/page.tsx'), 'export default function Page() { return null; }');
  const post = data => app.api('/api/route-review', { method: 'POST', body: JSON.stringify(data) });
  let report = (await app.api('/api/route-review')).data; assert.equal(report.revision, 0);
  const foreign = await post({ revision: 0, action: 'scan', origin: 'https://example.com' }); assert.equal(foreign.status, 400);
  const scanned = await post({ revision: 0, action: 'scan', origin: app.address }); assert.equal(scanned.status, 200); report = scanned.data;
  assert.deepEqual(report.routes.map(r => r.pattern), ['/', '/products/[id]']);
  assert.equal(report.routes[1].needsUrl, true);
  const unresolved = await post({ revision: report.revision, action: 'review', id: '/products/[id]', viewport: 'mobile', width: 390, status: 'reviewed' }); assert.equal(unresolved.status, 409);
  const resolved = await post({ revision: report.revision, action: 'resolve', id: '/products/[id]', path: '/products/42' }); assert.equal(resolved.status, 200); report = resolved.data;
  const updated = await post({ revision: report.revision, action: 'review', id: '/products/[id]', viewport: 'mobile', width: 390, status: 'reviewed', note: 'Manual viewport check' }); assert.equal(updated.status, 200); report = updated.data;
  assert.equal(report.routes[1].mobile.status, 'reviewed'); assert.equal(report.routes[1].desktop.status, 'pending');
  const stale = await post({ revision: 0, action: 'add', path: '/new' }); assert.equal(stale.status, 409);
  const bad = await post({ revision: report.revision, action: 'add', path: '//example.com' }); assert.equal(bad.status, 400);
  const blocked = await post({ revision: report.revision, action: 'review', id: '/', viewport: 'desktop', status: 'blocked', note: 'Requires sign-in' }); assert.equal(blocked.status, 200); report = blocked.data;
  await app.restart(); const restored = (await app.api('/api/route-review')).data; assert.deepEqual(restored, report);
  const reset = await post({ revision: report.revision, action: 'scan', origin: app.address }); assert.equal(reset.status, 200); assert(reset.data.routes.every(r => r.desktop.status === 'pending' && r.mobile.status === 'pending'));
});
