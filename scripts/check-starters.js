// Explicit framework checks only. Never invokes a coding agent, provider fixture or model.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const root = await mkdtemp(path.join(tmpdir(), 'nudgethis-starter-builds-'));
const binary = process.env.NUDGETHIS_TEST_BINARY || fileURLToPath(new URL('../target/debug/nudgethis', import.meta.url));
// welcome and every opened project hard-disable agents. Only explicitly reviewed npm commands are enabled here.
const server = spawn(binary, ['welcome', '--library', root, '--no-browser'], { env: { ...process.env, NUDGETHIS_DISABLE_EXECUTION: '0' }, stdio: 'ignore' });
let url, token;
const api = async (origin, secret, endpoint, input) => { const response = await fetch(origin + endpoint, { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(15000) }); const data = await response.json(); assert.equal(response.status, 200, data.error); return data; };
const waitFor = async (origin, secret, expected) => { for (let i = 0; i < 1200; i++) { const report = await api(origin, secret, '/api/preview'); if (report.state.status === expected) return report; if (report.state.status === 'failed' || (expected === 'running' && report.state.status === 'stopped')) throw new Error(report.state.message); await delay(500); } throw new Error('Starter operation timed out'); };
async function action(origin, secret, operation) { const review = await api(origin, secret, '/api/preview/review', { action: operation }); assert.match(review.command, /--ignore-scripts/); await api(origin, secret, '/api/preview', { previewId: review.id, confirm: true }); }
async function build(directory) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await new Promise((resolve, reject) => { const child = spawn(npm, ['--ignore-scripts', 'run', 'build'], { cwd: directory, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''; child.stdout.on('data', x => { output += x; }); child.stderr.on('data', x => { output += x; }); const timer = setTimeout(() => { child.kill(); reject(new Error('Starter build timed out')); }, 120000); child.on('error', e => { clearTimeout(timer); reject(e); }); child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(output)); }); });
}
async function inspectOutput(directory) { for (const e of await readdir(directory, { withFileTypes: true })) { const p = path.join(directory, e.name); if (e.isDirectory()) await inspectOutput(p); else if (/\.(html|js)$/.test(e.name)) { const source = await readFile(p, 'utf8'); assert(!source.includes('starter-bridge.js'), 'Production output excludes development bridge'); assert(!source.includes(token), 'Production output excludes local token'); } } }
try {
  for (let i = 0; i < 200; i++) {
    try { const descriptor = JSON.parse(await readFile(path.join(root, '.nudgethis/welcome.json'), 'utf8')); token = (await readFile(path.join(root, '.nudgethis/token'), 'utf8')).trim(); url = `http://127.0.0.1:${descriptor.port}`; await api(url, token, '/api/starter'); break; } catch { await delay(50); }
  }
  assert(url && token, 'Welcome started');
  for (const template of ['react', 'astro']) {
    const answers = { goal: template === 'astro' ? 'content' : 'app', objective: 'A useful first page', audience: 'Our readers', data: 'none', accounts: false, payments: false, budget: 'free' };
    const plan = await api(url, token, '/api/starter/plan', { template, name: `check-${template}`, answers });
    const project = await api(url, token, '/api/starter/create', { previewId: plan.id, confirm: true });
    const opened = new URL((await api(url, token, '/api/starter/open', { id: project.id })).url), secret = new URLSearchParams(opened.hash.slice(1)).get('token');
    assert.equal((await api(opened.origin, secret, '/api/status')).executionEnabled, false);
    await action(opened.origin, secret, 'install'); await waitFor(opened.origin, secret, 'stopped'); await build(project.path); await inspectOutput(path.join(project.path, 'dist'));
    await action(opened.origin, secret, 'start'); const preview = await waitFor(opened.origin, secret, 'running');
    const response = await fetch(new URL(preview.state.url).origin); assert.equal(response.status, 200); const html = await response.text(); assert(!html.includes(secret));
    if (template === 'astro') assert.match(html, /starter-bridge.js/);
    await api(opened.origin, secret, '/api/preview', { action: 'stop' }); await assert.rejects(fetch(new URL(preview.state.url).origin));
    await api(url, token, '/api/starter/close', { id: project.id });
    console.log(`${template}: reviewed install, production build without bridge, real preview and owned shutdown passed; agents disabled.`);
  }
} finally {
  if (url && token) await api(url, token, '/api/shutdown', {}).catch(() => {});
  if (server.exitCode === null) await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(10000)]);
  if (server.exitCode === null) server.kill();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
