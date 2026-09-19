#!/usr/bin/env node
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../../server/src/index.js';
import { loadConfig } from '../../core/src/index.js';
import { run, assert, taskId } from '../../shared/src/index.js';

const [command = 'help', id] = process.argv.slice(2);
const root = process.cwd();
async function main() {
  if (command === 'init') {
    const result = await run('git', ['rev-parse', '--show-toplevel'], { cwd: root });
    assert(result.code === 0 && path.resolve(result.stdout.trim()) === root, 'Run init at the root of a Git repository');
    const file = path.join(root, 'nudgethis.config.mjs');
    try {
      await writeFile(file, `// Trusted local configuration. These validation commands execute on your machine.\nexport default {\n  server: { port: 7331, allowedOrigins: ['http://localhost:3000', 'http://localhost:5173'] },\n  workers: { maxConcurrent: 2 },\n  agent: { command: 'codex', timeout: 600000 },\n  validation: { commands: [], timeout: 120000 }\n};\n`, { flag: 'wx' });
    } catch (error) { if (error.code !== 'EEXIST') throw error; console.log('Keeping existing nudgethis.config.mjs'); }
    let ignore = '';
    try { ignore = await readFile(path.join(root, '.gitignore'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!ignore.split(/\r?\n/).some(line => ['.nudgethis/', '/.nudgethis/'].includes(line))) await appendFile(path.join(root, '.gitignore'), '\n# Local QA state (credentials, database, worktrees)\n.nudgethis/\n');
    console.log('Initialized NudgeThis. Configure validation, then commit the config and .gitignore before starting QA.'); return;
  }
  if (command === 'start') {
    const app = await startServer({ root });
    console.log(`\nNudgeThis Agent · ${app.queue.agent.name}\nDashboard: ${app.url}/#token=${app.token}\nOverlay module: ${app.url}/overlay.js\nListening only on 127.0.0.1. Press Ctrl+C to stop.\n`);
    if (!app.config.commands.length) console.log('No validation commands configured. Add them to nudgethis.config.mjs.');
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await app.close(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop); return;
  }
  if (['status', 'tasks', 'task', 'apply', 'reject', 'retry', 'cancel'].includes(command)) {
    const config = await loadConfig(root);
    const token = (await readFile(path.join(root, '.nudgethis/token'), 'utf8')).trim();
    const action = ['apply', 'reject', 'retry', 'cancel'].includes(command);
    const endpoint = command === 'status' ? '/api/status' : command === 'tasks' ? '/api/tasks' : `/api/tasks/${taskId(id || '')}${action ? `/${command}` : ''}`;
    const response = await fetch(`http://127.0.0.1:${config.port}${endpoint}`, { method: action ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(action ? { body: '{}' } : {}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    console.log(JSON.stringify(data, null, 2)); return;
  }
  console.log('NudgeThis Agent (experimental)\n\nUsage: nudgethis <command>\n\n  init          Create local configuration\n  start         Run the local server and queue\n  status        Show repository and agent status\n  tasks         List tasks\n  task QA-1     Show context, validation and diff\n  apply QA-1    Explicitly apply a ready patch (does not commit)\n  reject QA-1   Reject and clean up the worktree\n  retry QA-1    Retry against committed HEAD\n  cancel QA-1   Stop a pending or running task');
}
main().catch(error => { console.error(`NudgeThis: ${error.message}`); process.exitCode = 1; });
