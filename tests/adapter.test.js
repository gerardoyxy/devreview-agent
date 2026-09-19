import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexAgent } from '../packages/agent-sdk/src/index.js';
import { input } from './helpers.js';

test('Codex adapter keeps QA text on stdin and requests workspace-write isolation', { skip: process.platform === 'win32' }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'nudgethis-adapter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shim = path.join(root, 'codex-fixture.mjs');
  await writeFile(shim, `#!${process.execPath}\nimport {writeFile} from 'node:fs/promises';let input='';for await(const chunk of process.stdin)input+=chunk;await writeFile('captured.json',JSON.stringify({args:process.argv.slice(2),input}));console.log('fixture output');`);
  await chmod(shim, 0o755);
  const adapter = new CodexAgent({ command: shim });
  const result = await adapter.run({ cwd: root, task: { ...input, request: '$(touch SHOULD_NOT_EXIST); align right' }, signal: new AbortController().signal });
  const captured = JSON.parse(await readFile(path.join(root, 'captured.json'), 'utf8'));
  assert.deepEqual(captured.args, ['exec', '--sandbox', 'workspace-write', '--json', '--color', 'never', '-']);
  assert.match(captured.input, /\$\(touch SHOULD_NOT_EXIST\)/);
  assert.match(result.output, /fixture output/);
  const { access } = await import('node:fs/promises');
  await assert.rejects(access(path.join(root, 'SHOULD_NOT_EXIST')));
});
