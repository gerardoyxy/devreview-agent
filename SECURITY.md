# Security

NudgeThis is an experimental local developer tool. Run it only in repositories
you trust and under your own operating-system account.

## Boundaries

- The API binds only to loopback, validates Host and browser Origin, and requires
  a random local token. Do not expose or reverse-proxy it to a public network.
- `.nudgethis/` contains the token, database, logs, and worktrees. Keep it ignored.
- Browser comments are JSON data passed to the adapter through stdin. They are
  never interpolated into a shell command.
- Validation commands come only from trusted `nudgethis.config.mjs`. Loading that
  JavaScript configuration and running validation can execute arbitrary code as
  your OS user. Review repositories and configuration before starting the server.
- The Codex adapter requests its workspace-write sandbox. Git worktrees isolate
  edits but are **not** an OS or network sandbox. Custom adapters are responsible
  for process isolation and cancellation. Never use an unrestricted adapter on
  untrusted requests or repositories.
- Apply is explicit, serialized, and refuses local edits to affected paths,
  changed branches, symlink/submodule patches, and `.env` changes. `git apply`
  performs its normal path checks. No automatic commits or pushes occur.
- Avoid editing an affected file or running another Git command during Apply:
  the local queue serializes its own operations, not arbitrary external programs.

## Context and privacy

The core has no telemetry. SQLite, patches, audit entries and process output stay
local, including conversation history and older patch versions. The coding agent may send selected page context and source to its provider
using your configured account. Treat agent logs and diffs as potentially sensitive.

The overlay omits form values and strips URL queries/fragments. DOM snippets are
off by default. Add `data-nudgethis-private` around content that should be excluded
from text/snippet capture. This is data minimization, not a complete secret scanner;
visible text, selectors, attributes and source files may still contain sensitive data.
Screenshots are not captured in this alpha. Conversation text is rendered as text,
not executable HTML. Only the server can append an assistant message. A new message
cannot apply code; the current validated patch still requires explicit Apply.

## Reporting vulnerabilities

Use the repository's private **Report a vulnerability** feature if it is available.
Otherwise open an issue requesting a private reporting channel, without including
secrets, exploit payloads, or private repository data. Do not post credentials in
public issues. Maintainers should enable private vulnerability reporting before
inviting broad external use.
