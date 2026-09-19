import { mkdir, readFile, writeFile, open, unlink, realpath } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { Repository } from '../../git/src/index.js';
import { TaskStore } from '../../queue/src/store.js';
import { TaskQueue } from '../../queue/src/index.js';
import { CodexAgent, NativeAgent } from '../../agent-sdk/src/index.js';
import { assert } from '../../shared/src/index.js';

export const defineConfig = config => config;

export async function loadConfig(root) {
  const file = path.join(root, 'devreview.config.mjs');
  let user = {};
  try { await readFile(file); user = (await import(pathToFileURL(file).href)).default; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(user && typeof user === 'object', 'Configuration must export an object');
  const config = {
    port: user.server?.port ?? 7331,
    origins: user.server?.allowedOrigins ?? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'],
    maxConcurrent: user.workers?.maxConcurrent ?? 2,
    commands: user.validation?.commands ?? [],
    validationTimeout: user.validation?.timeout ?? 120000,
    agentOptions: user.agent ?? {},
    agents: user.agents, defaultAgent: user.defaultAgent
  };
  assert(Number.isInteger(config.port) && config.port >= 0 && config.port <= 65535, 'Invalid server port');
  assert(Number.isInteger(config.maxConcurrent) && config.maxConcurrent >= 1 && config.maxConcurrent <= 8, 'Workers must be between 1 and 8');
  assert(Array.isArray(config.commands) && config.commands.every(command => typeof command === 'string' && command.length > 0), 'Validation commands must be strings');
  assert(Array.isArray(config.origins), 'Allowed origins must be an array');
  for (const origin of config.origins) {
    const url = new URL(origin);
    assert(url.origin === origin && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Only explicit loopback origins are supported');
  }
  assert(Number.isFinite(config.validationTimeout) && config.validationTimeout > 0, 'Invalid validation timeout');
  return config;
}

export async function createCore({ root, config, agent } = {}) {
  root = await realpath(root ?? process.cwd());
  config ??= await loadConfig(root);
  const stateDir = path.join(root, '.devreview');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  assert(await realpath(stateDir) === stateDir, '.devreview must be a real directory inside the repository');
  const lockPath = path.join(stateDir, 'server.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('A server lock exists. Stop the other DevReview server; if it crashed, confirm it is stopped before removing .devreview/server.lock.');
  }
  await lock.writeFile(String(process.pid));
  await lock.close();
  let store, queue;
  try {
    const repository = new Repository(root, stateDir);
    await repository.inspect();
    try { await repository.git(['check-ignore', '--quiet', '--no-index', '.devreview/token']); }
    catch { throw new Error('Ignore .devreview/ before starting the server. Run devreview init, then commit the configuration.'); }
    const tokenFile = path.join(stateDir, 'token');
    let token;
    try { token = (await readFile(tokenFile, 'utf8')).trim(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; token = randomBytes(32).toString('hex'); await writeFile(tokenFile, token, { mode: 0o600, flag: 'wx' }); }
    assert(/^[a-f0-9]{64}$/.test(token), 'Invalid local token file');
    store = new TaskStore(path.join(stateDir, 'tasks.sqlite'));
    store.recover();
    const agents = config.agents === undefined ? undefined : new Map();
    if (agents) {
      assert(Array.isArray(config.agents) && config.agents.length > 0, 'agents must be a non-empty list');
      for (const entry of config.agents) {
        const adapter = new NativeAgent(entry);
        assert(!agents.has(adapter.name), 'Duplicate agent ID');
        agents.set(adapter.name, adapter);
      }
    }
    if (agent && agents) agents.set(agent.name, agent);
    const defaultAgent = agent ?? (agents ? agents.get(config.defaultAgent ?? agents.keys().next().value) : new CodexAgent(config.agentOptions));
    assert(defaultAgent, 'defaultAgent must match a configured agent ID');
    queue = new TaskQueue({ ...config, store, repository, agent: defaultAgent, agents });
    return { root, stateDir, token, config, store, queue, repository,
      async close() { await queue.close(); store.close(); await unlink(lockPath); }
    };
  } catch (error) { await queue?.close(); store?.close(); await unlink(lockPath); throw error; }
}
