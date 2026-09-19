import test from 'node:test';
import assert from 'node:assert/strict';
import { application } from './application-safe-helpers.js';

test('grouped browser context is validated, minimized and preserved in drafts and revisions without execution', { timeout: 60000 }, async t => {
  const app = await application(); t.after(() => app.close());
  const target = (id, extra = {}) => ({ url: 'http://example:discard@localhost:5173/settings?private=discard#discard', selector: `#${id}`, tagName: 'button', text: id, sourceVerified: true, outerHTML: 'discard this field', ...extra });
  const submit = context => app.api('/api/tasks', { method: 'POST', body: JSON.stringify({ request: 'Give these buttons the same spacing', draft: true, context }) });
  const created = await submit({ selector: '#ignored-parent', elements: [target('first'), target('second')] });
  assert.equal(created.status, 202); assert.equal(created.data.status, 'draft');
  const { id, context } = created.data;
  assert.equal(context.selector, '#first', 'The legacy top-level target mirrors the first member');
  assert.equal(context.url, 'http://localhost:5173/settings');
  assert.deepEqual(context.elements.map(e => e.selector), ['#first', '#second']);
  for (const element of context.elements) {
    assert.equal(element.sourceVerified, false); assert.equal(element.route, '/settings');
    assert.equal(element.outerHTML, undefined); assert.equal(element.url, context.url);
  }
  for (const elements of [null, [], {}, Array.from({ length: 21 }, (_, i) => target(`item-${i}`)),
    [target('same'), target('same')], [null], [target('one', { elements: [] })],
    [target('one'), target('two', { url: 'https://other.example/settings' })],
    [target('one'), target('two', { url: 'http://localhost:5173/other' })],
    [target('one', { url: 'javascript:void(0)' })], [target('one', { selector: '' })],
    [target('one', { tagName: '' })], [target('one', { url: '' })],
    Array.from({ length: 20 }, (_, i) => target(`item-${i}`, { domSnippet: 'x'.repeat(4000) }))
  ]) assert.equal((await submit({ elements })).status, 400);
  assert.equal((await app.api('/api/tasks')).data.length, 1, 'Rejected groups must not create partial tasks');
  const large = { elements: Array.from({ length: 20 }, (_, i) => target(`large-${i}`, { text: 'x'.repeat(700), domSnippet: 'x'.repeat(1100) })) };
  assert(JSON.stringify(large).length > 32768);
  assert.equal((await submit(large)).status, 202, 'Bounded groups can exceed the former single-element request limit');
  const edited = await app.api(`/api/tasks/${id}/draft`, { method: 'POST', body: JSON.stringify({ request: 'Align the full group', draft: true, attempt: 1, context: large }) });
  assert.equal(edited.status, 200); assert.equal(edited.data.context.elements.length, 20);
  const old = await app.api(`/api/tasks/${id}/revisions/1`);
  assert.deepEqual(old.data.context, context, 'The original group stays attached to its historical version');
  await app.restart();
  assert.equal((await app.api(`/api/tasks/${id}`)).data.context.elements.length, 20);
  const single = await submit(target('legacy')); assert.equal(single.status, 202);
  assert.equal(single.data.context.elements, undefined, 'Existing single-element integrations remain supported');
  assert.equal((await app.api('/api/status')).data.executionEnabled, false);
  const blocked = await app.api(`/api/tasks/${id}/start`, { method: 'POST', body: JSON.stringify({ attempt: 2 }) });
  assert.equal(blocked.status, 403);
});
