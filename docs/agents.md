# Agent transports (migration phase 1)

The browser UI is TypeScript. `crates/agent-runtime` owns coding-agent subprocesses
and protocols in Rust. A temporary Node bridge feeds it the existing queue's task
and isolated worktree. The HTTP server, SQLite, queue, Git and validation are still
Node modules during this phase; see the [migration review](roadmap-review.es.md).

## Configure trusted executables

Build with `npm ci && npm run build` from this checkout (Node 24.15+, Git and stable
Rust). The source CLI finds `target/debug/nudgethis-agent-runtime[.exe]`. Set
`NUDGETHIS_RUNTIME` to the absolute path of a release binary when using `cargo build --release`.
This setting is local to the process; it does not change any provider login.

In the target application's trusted `nudgethis.config.mjs`:

```js
export default {
  server: { port: 7331, allowedOrigins: ['http://localhost:5173'] },
  defaultAgent: 'codex',
  agents: [
    { id: 'codex', label: 'Codex', transport: 'codex', command: 'codex' },
    // Replace these example paths/arguments with an installed, authenticated agent.
    { id: 'local-acp', label: 'My ACP agent', transport: 'acp', command: '/absolute/path/to/acp-agent', args: [] },
    { id: 'custom', label: 'My custom agent', transport: 'stdio', command: '/absolute/path/to/adapter', args: [] }
  ],
  validation: { commands: ['npm test'] }
};
```

Keep only installed agents in your configuration. Nothing is installed or
authenticated by this file. Commands, arguments and runtime paths come only from
trusted local configuration. Browser requests choose an existing agent ID, never
an executable. A task retains its chosen ID on follow-ups/retry; removing that ID
from configuration produces an explicit failure instead of silently switching providers.
Provider credentials stay in each provider's own configuration/environment.

Legacy single-agent `agent: { command: 'codex', model, timeout }` remains supported.
Custom in-process JavaScript adapters remain possible for the demo and compatibility
tests, but are not the final plugin API.

## Runtime protocol v1

One invocation processes one turn. The parent sends one JSON document on stdin,
then closes stdin. The Rust runtime emits newline-delimited JSON to stdout.

```json
{
  "protocolVersion": 1,
  "transport": "stdio",
  "command": "/absolute/path/to/adapter",
  "args": [],
  "cwd": "/absolute/path/to/isolated-worktree",
  "timeoutMs": 600000,
  "task": { "id": "QA-1", "request": "Align the button", "context": {}, "messages": [] }
}
```

Runtime events:

```jsonl
{"protocolVersion":1,"type":"message","text":"I changed the alignment."}
{"protocolVersion":1,"type":"result","output":"...","stderr":"..."}
```

Failure emits `{"protocolVersion":1,"type":"error","message":"..."}` and exits
nonzero. The bridge requires a terminal result as well as exit zero. The input is
limited to 256 KiB, stdout/stderr to 2 MiB each, and timeout to at most one hour.
Recent conversation is bounded before crossing the bridge; SQLite retains full history.
Only public messages enter chat. Reasoning and raw tool payloads are not rendered.

The runtime uses Unix process groups or Windows Job Objects. Completion, cancellation,
protocol errors and timeouts stop the agent process tree before the queue collects a
patch. This is lifecycle management, **not** filesystem/network sandboxing. Agents
must supply their own sandbox; Codex is launched with `--sandbox workspace-write`.

## Custom stdio adapter

The configured executable receives one JSON envelope and EOF:

```json
{"protocolVersion":1,"task":{"request":"...","context":{},"messages":[]},"prompt":"Bounded instructions and conversation..."}
```

It can edit only its supplied working directory, then emit public replies:

```jsonl
{"type":"message","id":"reply-1","text":"The button is now aligned."}
```

`id` is optional; duplicate IDs are ignored. An error frame
`{"type":"error","message":"Provider unavailable"}` fails the task even when the
process exits zero. Other event types are ignored; malformed JSON fails the adapter.
Use stderr for ordinary logs. A plain-text CLI requires a wrapper that converts its
output; arbitrary CLIs are not guessed or scraped. A remote API also requires a
wrapper and an explicit way to edit or return changes to the worktree.

## ACP scope

The Rust client implements local ACP v1 over stdio: `initialize`, `session/new`,
`session/prompt`, `session/update` public text and `end_turn`. It verifies version,
request IDs and session IDs. Public chunks are joined into messages; a tool boundary,
message-ID change or turn completion flushes the message to the UI.

It advertises no client filesystem, terminal, image, elicitation or interactive
authentication capabilities. The agent must use its own tools/authentication and
sandbox. Permission requests receive a cancelled outcome and the task fails with a
clear limitation. Unknown client requests receive JSON-RPC method-not-found.
There is no native session resume yet: every turn starts a new session with bounded
conversation context. Cancellation stops the process tree; graceful ACP session
cancellation/resume and an interactive permission UI are later work.

This is a tested protocol subset, not certification for every ACP agent. See the
[ACP initialization](https://agentclientprotocol.com/protocol/v1/initialization),
[session](https://agentclientprotocol.com/protocol/v1/session-setup) and
[prompt](https://agentclientprotocol.com/protocol/v1/prompt-turn) specifications.

## Manual fallback

**Copy context** exports the selected element's minimized context and request as
text. You can paste it into any agent that accepts text. It does not create a task,
run an agent, read a remote conversation or import its reply. It works in the mounted
overlay even without a token/server session, subject to the browser's clipboard permission.
Source hints are marked unverified; no file or component is invented.

## Validation

Protocol peers in `tests/fixtures/native-agent.mjs` are simulated, deterministic
processes. Tests cover split JSONL, public-only messages, ACP negotiation/session
matching, denied unsupported permissions, provider errors, output limits, timeout,
descendant cleanup, cancellation and task routing through the authenticated API.
Live provider compatibility and consumption of model credits are not part of the suite.
