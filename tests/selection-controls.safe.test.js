import test from 'node:test';
import assert from 'node:assert/strict';
import { application } from './application-safe-helpers.js';

test('selection preferences: validation, concurrent edits, persistence and reset without execution', { timeout: 30000 }, async t => {
  const app = await application(); t.after(() => app.close());
  const post = value => app.api('/api/selection-controls', { method: 'POST', body: JSON.stringify(value) });
  assert.equal((await fetch(app.address + '/api/selection-controls')).status, 401);
  assert.equal((await app.api('/api/selection-controls', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await app.api('/api/selection-controls')).data, null);
  const original = { version: 1, revision: 0, pointer: { button: 0, modifiers: ['control', 'shift'] }, keyboard: { code: 'KeyE', modifiers: ['alt'] } };
  for (const value of [
    { ...original, version: 2 }, { ...original, revision: -1 },
    { ...original, pointer: { button: 5, modifiers: [] } },
    { ...original, pointer: { button: 0, modifiers: ['alt', 'alt'] } },
    { ...original, pointer: { button: 2, modifiers: ['command'] } },
    { ...original, keyboard: { code: 'Escape', modifiers: [] } },
    { ...original, keyboard: { code: 'Tab', modifiers: ['shift'] } },
    { ...original, keyboard: { code: 'KeyZZ', modifiers: [] } },
    { ...original, keyboard: { code: 'F01', modifiers: [] } },
    { ...original, keyboard: undefined },
    { ...original, pointer: { modifiers: [] } },
    { ...original, command: 'never-run-this' }
  ]) assert.equal((await post(value)).status, 400);
  const saved = await post(original); assert.equal(saved.status, 200); assert.equal(saved.data.revision, 1);
  assert.equal((await post(original)).status, 409, 'A stale window must not overwrite a saved preference');
  await app.restart(); assert.deepEqual((await app.api('/api/selection-controls')).data, saved.data);
  let revision = 1;
  for (const button of [1, 2, 3, 4, null]) {
    const result = await post({ ...original, revision, pointer: { button, modifiers: [] }, keyboard: null });
    assert.equal(result.status, 200); revision = result.data.revision;
  }
  const reset = await post({ version: 1, revision, pointer: { button: 2, modifiers: ['alt'] }, keyboard: { code: 'KeyD', modifiers: ['alt', 'shift'] } });
  assert.equal(reset.status, 200);
  assert.equal((await app.api('/api/status')).data.executionEnabled, false);
  assert.deepEqual((await app.api('/api/tasks')).data, []);
});
