// Agent protocol fixtures are deliberately opt-in, separate from the default CI.
import { spawnSync } from 'node:child_process';
if (process.env.NUDGETHIS_ALLOW_AGENT_TESTS !== '1') {
  console.error('Agent tests are disabled. Explicitly set NUDGETHIS_ALLOW_AGENT_TESTS=1 to run protocol fixtures.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', 'tests/native-runtime.test.js', 'tests/rust-server.test.js', 'tests/project-context.test.js'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
