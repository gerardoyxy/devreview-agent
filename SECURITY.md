# Security

NudgeThis is an experimental local developer tool. Run it only in repositories
you trust and under your own operating-system account.

## Boundaries

- The API binds only to loopback, validates Host and browser Origin, and requires
  a random local token. Do not expose or reverse-proxy it to a public network.
- `.nudgethis/` contains the token, database, logs, and worktrees. Keep it ignored.
- Browser comments are JSON data passed to the adapter through stdin. They are
  never interpolated into a shell command.
- Validation commands come only from trusted `nudgethis.toml`. TOML is parsed as data. Configured
  agent executables and validation commands can execute arbitrary code as your OS user. Review repositories and configuration before starting the server.
- The Codex adapter requests its workspace-write sandbox. Git worktrees isolate
  edits but are **not** an OS or network sandbox. The Rust runtime terminates process groups/jobs on cancellation, but each custom
  or ACP agent must supply filesystem/network isolation. ACP client capabilities
  are minimal and permission requests currently fail rather than grant access. Never use an unrestricted adapter on
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

Project context can include instructions, text skills and reference documents.
Selected content is sent to the configured agent and retained in version snapshots.
Editing or deleting a library item does not remove its earlier snapshots. Review
the selected content before sending it or copying it to another service.

The overlay omits form values and strips URL queries/fragments. DOM snippets are
off by default. Add `data-nudgethis-private` around content that should be excluded
from text/snippet capture. This is data minimization, not a complete secret scanner;
visible text, selectors, attributes and source files may still contain sensitive data.
Screenshots are not captured in this alpha. Conversation text is rendered as text,
not executable HTML. Only the server can append an assistant message. A new message
cannot apply code; the current validated patch still requires explicit Apply.

## Reporting vulnerabilities

Use [Report a vulnerability](https://github.com/gerardoyxy/nudgethis/security/advisories/new)
to contact the maintainers privately. Private vulnerability reporting is enabled
for this repository. Include a minimal reproduction and the affected version;
omit credentials and private repository data. Do not post exploit details or
credentials in public issues.

## Native runtime and agent selection

Only trusted local configuration supplies executable paths and arguments. The
browser submits a configured agent ID. Prompt text travels through stdin, not shell
interpolation. ACP/stdio wrappers execute with your local provider configuration;
there is no shared credential store and no automatic provider login. A configured
agent is trusted code, not a sandboxed plugin.

The runtime limits input/output sizes and wall-clock duration, verifies ACP session
and protocol IDs, and does not publish reasoning/tool payloads as chat. Interactive
ACP permissions, external filesystem/terminal client operations and native resume
are not yet implemented. Copy Context writes only the minimized selection/request
to the clipboard; sending it to another service is a separate user action.

## Appearance data

Themes and uploaded fonts stay in the local database. The API accepts only hex colors,
bounded font-family names and WOFF/WOFF2 payloads (1 MiB combined); it does not fetch
user-supplied font URLs. Browser font parsing is still performed by the browser. Imported
themes are data and cannot provide scripts or executable CSS. Exported themes include
uploaded fonts; users are responsible for rights to distribute those files.
