# Agent transports

TypeScript provides the browser UI; the entire runtime is Rust. The server calls the
`nudgethis-agent-runtime` library directly. A separate protocol executable remains for
integration tests and external callers; no Node bridge is used.

## Configure trusted executables

Build with `npm ci` and `npm run build`. Register installed, authenticated agents in the
application's trusted `nudgethis.toml`:

```toml
defaultAgent = "codex"

[server]
port = 7331
allowedOrigins = ["http://localhost:5173"]

[[agents]]
id = "codex"
label = "Codex CLI"
transport = "codex"
command = "codex"
timeout = 600000

# Replace example paths with installed executables, or remove these entries.
[[agents]]
id = "local-acp"
label = "My ACP agent"
transport = "acp"
command = "/absolute/path/to/acp-agent"
args = []

[[agents]]
id = "custom"
label = "My custom agent"
transport = "stdio"
command = "/absolute/path/to/adapter"
args = []
```

Nothing is installed or authenticated by this file. Executables and arguments come only
from local configuration. Browser requests select an existing agent ID, never a command.
Tasks retain their chosen ID. Removing it fails subsequent turns instead of switching providers.
Each provider keeps its own credentials and runtime requirements. See [migration](migration.md)
for the former `agent` option and in-process JavaScript adapters.

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
nonzero. The external protocol requires a terminal result and exit zero. Its input is
limited to 256 KiB, stdout/stderr to 2 MiB each, and timeout to at most one hour.
The server sends an allowlisted task envelope with up to 128 KB of recent message text; the prompt caps conversation at 48,000 characters. SQLite retains full history.
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

## Project context

All three transports receive the same optional `task.projectContext` snapshot. The common
prompt includes its selected instructions, skills and documents, with explicit guidance to
treat documents as reference material and skills as text instructions. Agents should not
execute code or fetch links merely because an attached document contains them. This does
not provision agent tools, install skill packages or change agent sandbox capabilities.
The snapshot is bounded and versioned by the Rust server; see the [API](api.md#project-context).

## Manual fallback

**Copy context** exports the selected element's minimized context and request as
text, including the currently selected project context when the library is loaded. You can paste it into any agent that accepts text. It does not create a task,
run an agent, read a remote conversation or import its reply. It works in the mounted
overlay even without a token/server session, subject to the browser's clipboard permission.
Source hints are marked unverified; no file or component is invented.

## Validation

Protocol peers in `tests/fixtures/native-agent.mjs` are simulated, deterministic
processes. Tests cover split JSONL, public-only messages, ACP negotiation/session
matching, denied unsupported permissions, provider errors, output limits, timeout,
descendant cleanup, cancellation and task routing through the authenticated API.
Live provider compatibility and consumption of model credits are not part of the suite.
