import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../packages/server/src/index.js';
import { fixture, config, input, agent, finished } from './helpers.js';

test('localhost API enforces token, explicit origins, Host, payload size and valid actions', async t => {
  const root = await fixture(t);
  const app = await startServer({ root, config, agent }); t.cleanups.push(() => app.close());
  const headers = { Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${app.url}/api/tasks`)).status, 401);
  assert.equal((await fetch(`${app.url}/api/tasks`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${app.url}/api/tasks`, { headers: { ...headers, Origin: 'null' } })).status, 403);
  const preflight = await fetch(`${app.url}/api/tasks`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const badHost = await new Promise(resolve => { http.get(`${app.url}/api/tasks`, { headers: { ...headers, Host: `evil.example:${app.port}` } }, response => { response.resume(); resolve(response.statusCode); }); });
  assert.equal(badHost, 403);
  assert.equal((await fetch(`${app.url}/api/tasks`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${app.url}/api/tasks`, { method: 'POST', headers, body: JSON.stringify({ ...input, request: 'x'.repeat(40000) }) })).status, 413);
  const request = await fetch(`${app.url}/api/tasks`, { method: 'POST', headers, body: JSON.stringify({ ...input, command: 'do-not-execute', context: { ...input.context, url: 'http://localhost:3000/settings?token=secret#private' } }) });
  assert.equal(request.status, 202);
  const task = await request.json(); assert.equal(task.context.url, 'http://localhost:3000/settings'); assert.equal(task.command, undefined);
  await finished(app, task.id);
  const detail = await fetch(`${app.url}/api/tasks/${task.id}`, { headers }).then(res => res.json()); assert.match(detail.diff, /green/);
  assert.equal((await fetch(`${app.url}/api/tasks/${task.id}/apply`, { method: 'GET', headers })).status, 404);
  for (const asset of ['/', '/app.js', '/style.css', '/overlay.js', '/playground', '/playground.js']) {
    const response = await fetch(app.url + asset); assert.equal(response.status, 200, asset); assert.ok((await response.text()).length);
  }
});

test('SSE carries status changes with header authentication', async t => {
  const root = await fixture(t);
  const app = await startServer({ root, config, agent }); t.cleanups.push(() => app.close());
  const controller = new AbortController(); t.after(() => controller.abort());
  const response = await fetch(`${app.url}/api/events`, { headers: { Authorization: `Bearer ${app.token}` }, signal: controller.signal });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader(); await reader.read();
  const task = await app.queue.submit(input);
  const event = new TextDecoder().decode((await reader.read()).value);
  assert.match(event, /event: task/); assert.match(event, new RegExp(task.id));
  controller.abort(); await finished(app, task.id);
});
