import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { createCore } from '../../core/src/index.js';
import { AppError, assert, validateInput } from '../../shared/src/index.js';

const assets = new Map([
  ['/', ['../public/index.html', 'text/html']],
  ['/app.js', ['../public/app.js', 'text/javascript']],
  ['/style.css', ['../public/style.css', 'text/css']],
  ['/overlay.js', ['../../overlay/src/index.js', 'text/javascript']],
  ['/review.js', ['../../overlay/src/review.js', 'text/javascript']],
  ['/playground', ['../../../apps/playground/index.html', 'text/html']],
  ['/playground.js', ['../../../apps/playground/app.js', 'text/javascript']]
]);

async function jsonBody(req) {
  assert(req.headers['content-type']?.split(';')[0] === 'application/json', 'Use application/json', 415);
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    assert(Buffer.byteLength(data) <= 32768, 'Task payload exceeds 32 KB', 413);
  }
  try { return JSON.parse(data); } catch { throw new AppError('Invalid JSON'); }
}

export async function startServer(options = {}) {
  const core = await createCore(options);
  const clients = new Set();
  let port;
  const summary = task => {
    const { diff, output, agentErrors, validation, ...rest } = task;
    return { ...rest, validation: validation?.map(({ output, ...check }) => check) };
  };
  const send = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      assert([`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host), 'Unrecognized Host', 403);
      const origin = req.headers.origin;
      const allowed = [...core.config.origins, `http://127.0.0.1:${port}`, `http://localhost:${port}`];
      assert(!origin || allowed.includes(origin), 'Origin is not allowed', 403);
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.writeHead(204); res.end(); return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        res.end(await readFile(new URL(file, import.meta.url))); return;
      }
      const token = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
      const expected = Buffer.from(core.token);
      assert(token.length === expected.length && timingSafeEqual(token, expected), 'Local token required', 401);
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.write('event: connected\ndata: {}\n\n'); clients.add(res);
        req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        send(res, 200, { repository: await core.repository.inspect(), agent: core.queue.agent.name, validationCommands: core.config.commands, workers: core.config.maxConcurrent, playgroundUrl: options.playgroundUrl || null }); return;
      }
      if (url.pathname === '/api/tasks' && req.method === 'GET') { send(res, 200, core.store.list().map(summary)); return; }
      if (url.pathname === '/api/tasks' && req.method === 'POST') {
        send(res, 202, await core.queue.submit(validateInput(await jsonBody(req)))); return;
      }
      const revision = /^\/api\/tasks\/(QA-[1-9]\d{0,8})\/revisions\/([1-9]\d{0,8})$/.exec(url.pathname);
      if (revision && req.method === 'GET') { send(res, 200, core.store.revision(revision[1], Number(revision[2]))); return; }
      const match = /^\/api\/tasks\/(QA-[1-9]\d{0,8})(?:\/(apply|reject|retry|cancel|messages))?$/.exec(url.pathname);
      if (match && req.method === 'GET' && !match[2]) { send(res, 200, core.store.details(match[1])); return; }
      if (match && req.method === 'POST' && match[2]) {
        const body = await jsonBody(req);
        if (match[2] === 'messages') { send(res, 202, await core.queue.message(match[1], body?.content, body?.attempt)); return; }
        send(res, 200, await core.queue.action(match[1], match[2], body?.attempt)); return;
      }
      if (match && req.method === 'DELETE' && !match[2]) { send(res, 200, await core.queue.action(match[1], 'delete')); return; }
      throw new AppError('Not found', 404);
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
      else res.end();
      if (!error.status) console.error(error);
    }
  });
  const change = task => { for (const client of clients) client.write(`event: task\ndata: ${JSON.stringify(summary(task))}\n\n`); };
  core.store.on('change', change);
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000);
  heartbeat.unref();
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(core.config.port, '127.0.0.1', resolve); });
  } catch (error) { clearInterval(heartbeat); await core.close(); throw error; }
  port = server.address().port;
  core.queue.pump();
  return { ...core, port, url: `http://127.0.0.1:${port}`, server,
    async close() {
      clearInterval(heartbeat);
      for (const client of clients) client.end();
      await new Promise(resolve => server.close(resolve));
      core.store.off('change', change);
      await core.close();
    }
  };
}
