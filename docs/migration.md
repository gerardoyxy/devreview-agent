# Migrating from the Node alpha to Rust

The server, HTTP/SSE API, queue, SQLite storage, Git operations, validation, CLI and
demo now run in Rust. The frontend remains TypeScript. Building requires Node and
Rust; running the compiled executable requires Git and your chosen agent's prerequisites.

## Steps

1. Stop the previous server and its tasks. Do not run both versions against the same repository.
2. In the NudgeThis checkout, run `npm ci` and `npm run build`. The result is
   `target/debug/devreview` or `target/debug/devreview.exe`. For a release build,
   then run `cargo build --release --locked`.
3. In your application's repository, run the new executable with `init`. It does
   not overwrite an existing `devreview.toml`.
4. Transfer values from `devreview.config.mjs` to `devreview.toml` and review them.
5. Commit the configuration and `.gitignore`, then run `devreview start`.

JavaScript configuration is **not evaluated**. If only the legacy file exists,
the server explains how to migrate instead of starting with assumed values. If
both files exist, it uses TOML. Functions, imports and in-process JavaScript
adapters cannot be converted into TOML data; expose those adapters through the
stdio protocol and register their executables.

| Previous configuration | TOML |
| --- | --- |
| `server.port` | `[server] port` |
| `server.allowedOrigins` | `[server] allowedOrigins` |
| `workers.maxConcurrent` | `[workers] maxConcurrent` |
| `validation.commands`, `timeout` | `[validation] commands`, `timeout` |
| `defaultAgent` | `defaultAgent` before any section |
| `agents: [{...}]` | One `[[agents]]` section per agent |
| `agent: {command,model,timeout}` | `[[agents]]` with `id="codex"`, `transport="codex"` and those values |
| `DEVREVIEW_RUNTIME` | No longer used: the server embeds the Rust library |
| `node .../packages/cli/src/index.js start` | `/path/to/devreview start` |

Complete example:

```toml
defaultAgent = "codex"

[server]
port = 7331
allowedOrigins = ["http://localhost:5173"]

[workers]
maxConcurrent = 2

[setup]
commands = ["npm ci"]
timeout = 120000

[validation]
commands = ["npm test"]
timeout = 120000

[[agents]]
id = "codex"
label = "Codex CLI"
transport = "codex"
command = "codex"
args = []
timeout = 600000
```

On Windows, TOML literal strings support paths such as `command = 'C:\path\agent.exe'`.
Validation commands run through `cmd.exe` on Windows and `sh` on Unix; check the
syntax for your platform. The configured executable must be directly launchable;
`.cmd` wrappers require an appropriate `cmd.exe` command and arguments. Migration
does not change GitHub sessions or global Git configuration.

## Existing data

The server preserves `.devreview/token` and opens `.devreview/tasks.sqlite`. If the
previous database has `user_version=0`, it first creates
`tasks.before-rust-<timestamp>.sqlite` through SQLite's backup API, including
committed WAL pages. Only then does migration run inside a transaction. If the
backup fails, migration does not run.

Task IDs, requests, messages, audit entries, diffs and available versions are
preserved. Interrupted active tasks become failed for inspection. Pending tasks
retain their queue behavior and may start when the new server starts. Messages
that the previous version never saved cannot be reconstructed.

To return to the previous version, stop Rust first. Keep a copy of the current
state before restoring the backup; restoring it discards changes made after
migration. Do not copy a SQLite database while a server is using it or mix its
WAL files with those from another database state.

A forced shutdown may leave `server.lock` behind. Verify that the previous server
and its agents have stopped before removing it. The server does not automatically
remove another process's lock.

## Updating from 0.2 to 0.3

Keep `devreview.toml` and local state. Existing configurations default to an empty setup
list and enabled execution. Move dependency installation commands into `[setup]`; leave
repeatable checks in `[validation]`. Existing `init` configurations are never overwritten.
Use `doctor` to inspect suggestions and `start --no-execution` to review safely after upgrade.

The update adds draft/task metadata, preparation results, Undo records and route coverage
without changing the SQLite schema version. Old revisions remain readable; old applied
patches cannot gain missing before/after Undo records. Interrupted Apply or Undo enters
`recovery_required` for manual inspection instead of automatic replay.
