import { run } from '../../shared/src/index.js';

export async function validate(commands, cwd, { signal, timeout = 120000, onResult = () => {} } = {}) {
  const results = [];
  for (const command of commands) {
    const started = Date.now();
    // Only trusted repository configuration may supply validation commands.
    const result = await run(command, [], { cwd, shell: true, signal, timeout });
    const item = { command, passed: result.code === 0, code: result.code, durationMs: Date.now() - started, output: result.stdout + result.stderr };
    results.push(item); onResult([...results]);
    if (!item.passed) break;
  }
  return results;
}
