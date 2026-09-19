// Application-only fixtures. Execution is disabled at configuration, CLI and environment levels.
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const binary = process.env.NUDGETHIS_TEST_BINARY || fileURLToPath(new URL(`../target/debug/nudgethis${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
export const environment = { ...process.env, NUDGETHIS_DISABLE_EXECUTION: '1' };
export function cli(root, ...args) {
  return spawnSync(binary, ['--root', root, ...args], { encoding: 'utf8', env: environment, timeout: 15000 });
}
export async function application({ origins = [], environment: overrides = {}, repository = 'ready' } = {}) {
  const fixtureEnvironment = { ...environment, ...overrides, NUDGETHIS_DISABLE_EXECUTION: '1' };
  const root = await mkdtemp(path.join(tmpdir(), 'nudgethis-application-'));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env: environment, encoding: 'utf8', timeout: 15000 });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout;
  };
  if (repository !== 'none') { git('init', '-b', 'main'); git('config', 'core.autocrlf', 'false'); }
  await writeFile(path.join(root, '.gitignore'), '.nudgethis/\n');
  await writeFile(path.join(root, 'example.txt'), 'Application-only fixture\n');
  await writeFile(path.join(root, 'nudgethis.toml'), '[execution]\nenabled = false\n' + (origins.length ? `\n[server]\nallowedOrigins = ${JSON.stringify(origins)}\n` : ''));
  if (repository === 'ready') {
    git('add', '--', '.');
    git('-c', 'user.name=Application Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-m', 'Application fixture');
  }
  let child, address, token;
  const stopped = () => new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const timer = setTimeout(() => reject(new Error('Application did not stop')), 10000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  const api = async (endpoint, options = {}) => {
    const response = await fetch(address + endpoint, { ...options, signal: options.signal || AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } });
    return { status: response.status, data: await response.json() };
  };
  const start = async () => {
    child = spawn(binary, ['--root', root, 'start', '--port', '0', '--no-execution'], { env: fixtureEnvironment, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', startupError;
    child.on('error', error => { startupError = error; });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let n = 0; n < 200; n++) {
      if (startupError) throw startupError;
      // Never log startup output: it contains a local session token.
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        address = `http://127.0.0.1:${match[1]}`;
        token = (await readFile(path.join(root, '.nudgethis/token'), 'utf8')).trim();
        const status = await api('/api/status');
        if (status.status !== 200 || status.data.executionEnabled !== false) throw new Error('Fixture must have execution disabled');
        return;
      }
      if (child.exitCode !== null) throw new Error(`Application exited during startup (${child.exitCode})`);
      await delay(25);
    }
    throw new Error('Application startup timed out');
  };
  const stop = async () => { const ended = stopped(); await api('/api/shutdown', { method: 'POST', body: '{}' }); await ended; };
  try { await start(); } catch (error) { child?.kill(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); throw error; }
  return { root, git, api, get address() { return address; }, get token() { return token; }, restart: async () => { await stop(); await start(); }, close: async () => { try { await stop(); } finally { child?.kill(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } } };
}
