import { fileURLToPath } from 'node:url';
import { run, assert } from '../../shared/src/index.js';

const binary = fileURLToPath(new URL(`../../../target/debug/devreview-agent-runtime${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));

/** Temporary Node-to-Rust bridge. All provider protocols/processes live in Rust. */
export class NativeAgent {
  constructor({ id = 'codex', label = id, transport = 'codex', command, args = [], timeout = 600000, model, runtime = process.env.DEVREVIEW_RUNTIME || binary } = {}) {
    assert(/^[a-z][a-z0-9_-]{0,63}$/.test(id), 'Invalid agent ID');
    assert(['codex', 'acp', 'stdio'].includes(transport), 'Unsupported agent transport');
    command ??= transport === 'codex' ? 'codex' : '';
    assert(typeof label === 'string' && label.trim(), 'Agent label is required');
    assert(model === undefined || typeof model === 'string', 'Agent model must be a string');
    assert(typeof command === 'string' && command.trim(), 'Agent command is required');
    assert(Array.isArray(args) && args.every(value => typeof value === 'string'), 'Agent args must be strings');
    assert(Number.isInteger(timeout) && timeout > 0 && timeout <= 3600000, 'Agent timeout must be between 1 and 3600000ms');
    Object.assign(this, { name: id, label, transport, command, args, timeout, model, runtime });
  }
  describe() {
    return { id: this.name, label: this.label, transport: this.transport,
      capabilities: { automatic: true, streaming: true, resume: false, images: false } };
  }
  async run({ task, cwd, signal, onMessage = () => {} }) {
    // Keep full history in SQLite; only bounded recent conversation crosses the runtime boundary.
    const messages = []; let length = 0;
    for (const message of [...(task.messages || [])].reverse()) {
      if (length + message.content.length > 48000) break;
      length += message.content.length; messages.unshift({ role: message.role, content: message.content });
    }
    const request = { protocolVersion: 1, transport: this.transport, command: this.command, args: this.args,
      model: this.model, timeoutMs: this.timeout, cwd, task: { id: task.id, request: task.request, context: task.context, messages } };
    let buffer = '', failure, result;
    const consume = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      assert(event.protocolVersion === 1, 'Unsupported native runtime protocol');
      if (event.type === 'message' && typeof event.text === 'string') onMessage(event.text);
      if (event.type === 'error') failure = event.message;
      if (event.type === 'result') result = { output: event.output || '', stderr: event.stderr || '' };
    };
    let processResult;
    try {
      processResult = await run(this.runtime, [], { cwd, signal, timeout: this.timeout + 5000, input: JSON.stringify(request), maxOutput: 6 * 1024 * 1024,
        onStdout(chunk) { buffer += chunk; let end; while ((end = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); } }
      });
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Native agent runtime is missing. Run cargo build, or configure DEVREVIEW_RUNTIME with the compiled executable path.');
      throw error;
    }
    consume(buffer);
    if (failure || processResult.code || !result) throw Object.assign(new Error(failure || `Agent runtime exited without a result (${processResult.code})`), { result: processResult });
    return result;
  }
}

export class CodexAgent extends NativeAgent {
  constructor(options = {}) { super({ ...options, transport: 'codex' }); }
}
