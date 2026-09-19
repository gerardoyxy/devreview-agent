import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { binary, environment } from './application-safe-helpers.js';
test('Portable launcher starts and reuses a local welcome without opening a browser or agent', { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'nudgethis-launcher-'));
  const launcher = path.join(path.dirname(binary), `nudgethis-launcher${process.platform === 'win32' ? '.exe' : ''}`);
  let address, token;
  const launch = () => new Promise((resolve, reject) => { const child = spawn(launcher, ['--library', root, '--no-browser'], { env: environment, stdio: 'ignore' }); const timer = setTimeout(() => { child.kill(); reject(new Error('Launcher timed out')); }, 23000); child.on('error', e => { clearTimeout(timer); reject(e); }); child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Launcher exited ${code}`)); }); });
  try {
    await launch();
    const first = JSON.parse(await readFile(path.join(root, '.nudgethis/welcome.json'), 'utf8'));
    address = `http://127.0.0.1:${first.port}`; token = (await readFile(path.join(root, '.nudgethis/token'), 'utf8')).trim();
    const api = endpoint => fetch(address + endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    assert.equal((await (await api('/api/status')).json()).executionEnabled, false);
    const page = await fetch(address + '/welcome'); assert.equal(page.status, 200); assert.match(await page.text(), /Start from an idea/);
    await launch(); const second = JSON.parse(await readFile(path.join(root, '.nudgethis/welcome.json'), 'utf8')); assert.equal(first.pid, second.pid); assert.equal(first.port, second.port);
    assert.equal((await (await api('/api/starter')).json()).projects.length, 0);
  } finally {
    if (address && token) await fetch(address + '/api/shutdown', { method: 'POST', body: '{}', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000) });
    for (let i = 0; i < 100; i++) { try { await access(path.join(root, '.nudgethis/server.lock')); await delay(50); } catch { break; } }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
