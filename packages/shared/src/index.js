import { spawn } from 'node:child_process';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function assert(condition, message, status = 400) {
  if (!condition) throw new AppError(message, status);
}

export function taskId(id) {
  assert(/^QA-[1-9]\d{0,8}$/.test(id), 'Invalid task ID');
  return id;
}

export function validateInput(input) {
  assert(input && typeof input === 'object', 'A task object is required');
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const request = text(input.request, 8000).trim();
  assert(request.length > 0, 'Describe the change you need');
  const source = input.context;
  assert(source && typeof source === 'object', 'Element context is required');
  const context = {};
  for (const [key, max] of Object.entries({ url: 2000, route: 1000, selector: 1000, tagName: 80, text: 1000, testId: 200, ariaLabel: 200, source: 1000, domSnippet: 4000 })) {
    context[key] = text(source[key], max);
  }
  assert(context.tagName, 'Element tagName is required');
  try {
    const url = new URL(context.url);
    assert(['http:', 'https:'].includes(url.protocol), 'Invalid page URL');
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    context.url = url.href;
    context.route = url.pathname;
  } catch { throw new AppError('A valid HTTP page URL is required'); }
  for (const [key, fields] of Object.entries({ viewport: ['width', 'height'], boundingBox: ['x', 'y', 'width', 'height'] })) {
    context[key] = Object.fromEntries(fields.map(field => {
      const value = source[key]?.[field];
      return [field, Number.isFinite(value) ? Math.max(-100000, Math.min(100000, value)) : 0];
    }));
  }
  if (input.agent !== undefined) assert(typeof input.agent === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(input.agent), 'Invalid agent ID');
  return { request, context, ...(input.agent === undefined ? {} : { agent: input.agent }) };
}

// Arguments and stdin are separate. Browser comments never become shell commands.
export function run(command, args = [], options = {}) {
  const { cwd, input, signal, timeout = 120000, shell = false, maxOutput = 2 * 1024 * 1024, env, onStdout } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError('Cancelled', 409));
    const child = spawn(command, args, { cwd, shell, env, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', stopReason, killTimer;
    const kill = (force = false) => {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
        } else process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
      } catch { /* Process already exited. */ }
    };
    const stop = reason => {
      if (stopReason) return;
      stopReason = reason; kill();
      killTimer = setTimeout(() => kill(true), 1500); killTimer.unref();
    };
    const abort = () => stop('Cancelled');
    const timer = setTimeout(() => stop(`Command timed out after ${timeout}ms`), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    const append = (which, chunk) => {
      if (stdout.length + stderr.length + chunk.length > maxOutput) return stop('Command output exceeded limit');
      if (which === 'stdout') {
        stdout += chunk;
        try { onStdout?.(chunk); } catch (error) { stop(`Output handler failed: ${error.message}`); }
      } else stderr += chunk;
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => append('stdout', chunk));
    child.stderr.on('data', chunk => append('stderr', chunk));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      const result = { code: code ?? 1, stdout, stderr };
      if (stopReason) return reject(Object.assign(new AppError(stopReason, 409), { result }));
      resolve(result);
    });
  });
}

export function serial() {
  let tail = Promise.resolve();
  return operation => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
}
