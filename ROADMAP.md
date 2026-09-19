# NudgeThis roadmap

NudgeThis is a **source alpha**, version `0.2.0-alpha.1`. The current application
can be built and tested from `main`; it is not a stable release or a packaged
installer. This roadmap separates implemented behavior from release requirements
and future capabilities. It is not a delivery-date commitment.

## Implemented in the alpha

- A strict TypeScript overlay, dashboard, conversation and review interface.
- A Rust CLI, HTTP/SSE server, queue, SQLite persistence, Git worktree operations,
  validation supervisor and agent transports. The compiled runtime needs no Node
  bridge; build tools and individual providers have their own requirements.
- Element selection with Alt + right-click, minimized page context, manual source
  hints and Copy context for agents that accept text.
- Conversations, public agent replies, follow-ups, patch versions, validation
  results and explicit Apply/Reject. Agents work in separate Git worktrees.
- Registered Codex JSONL, local ACP subset and custom stdio transports. These are
  adapter mechanisms, not certification of arbitrary agents or provider versions.
- Project context: selected instructions, text skills and reference documents,
  saved locally with immutable snapshots per change. Text imports do not install
  executable skills, plugins or supporting tools.
- Custom light/dark palettes, colors, fonts, local WOFF/WOFF2 uploads and theme
  import/export, shared across the dashboard and isolated overlay.
- A deterministic demo, Rust unit tests and black-box integration tests. CI builds
  and tests on Linux, Windows and macOS. The public landing has a labeled,
  illustrative browser animation and a real demo screenshot.

## Before a packaged public alpha

| Priority | Work | Completion evidence |
| --- | --- | --- |
| 1 | Test real provider integrations | Record exact provider versions and run selection → conversation → follow-up → validation → Apply, plus cancellation and failure handling, in disposable repositories. Start with Codex and a second independent integration. Current automated peers are simulated. |
| 2 | Build installable releases | Produce platform-specific binaries with embedded frontend assets, checksums, release notes and installation/uninstall instructions. Verify them on clean systems without Node or Rust installed; document Git and provider prerequisites. Signing/notarization and update handling need an explicit distribution policy. |
| 3 | Reduce setup friction | Walk through setup with a new user and real local applications. Document framework-specific injection, worktree dependency setup, Windows executable/wrapper behavior and failure recovery. |
| 4 | Complete release validation | Record browser, keyboard, responsive, accessibility and saved-theme checks against the release build; verify existing data migration and backups. Do not treat protocol fixtures or a landing animation as evidence of real provider compatibility. |

These are release requirements, not reasons to hide working source on a development
branch. Tagged releases will identify exactly which builds and integrations were
verified. No npm launcher, installer or binary release is currently published.

## Product work after the current alpha

| Order | Capability | Acceptance boundary |
| --- | --- | --- |
| 1 | Reliable element identity and selection | Reidentify targets after DOM changes with explicit confidence; add parent/child navigation and multi-select. A task ID or CSS selector alone is not persistent element identity. |
| 2 | Safe Undo and continuous review | Store before/after file state and refuse to overwrite later user changes. Support successive changes without requiring a clean committed checkout for every new task. Retry and Reject do not undo an applied patch. |
| 3 | Screenshots and visual verification | Add opt-in, redacted capture and before/after artifacts. Track applied and visually verified separately, including hot-reload/render failures. Current validation runs commands only. |
| 4 | Framework and agent depth | Add evidence-based source mapping, framework integration guides, interactive ACP permissions and native session resume. Publish compatibility results per tested provider/version. |
| 5 | Review sessions and interchange | Group feedback, make conflicts visible, export review data and add MCP tools where useful. GitHub integration, remote agents, Docker support and team/cloud features need their own security and workflow design. |

Automatic Apply, autonomous QA and broad provider claims depend on the earlier
review and recovery work. They are not present in this alpha.

## Current constraints

New tasks start from clean, committed HEAD. Worktrees do not inherit installed
dependencies and are not operating-system sandboxes. Apply changes files without
committing, pushing, confirming hot reload or verifying the visual result. The
`nudgethis` command, configuration names and integration identifiers remain for
compatibility with earlier source builds.

Read [security boundaries](SECURITY.md), [agent capabilities](docs/agents.md),
[architecture](docs/architecture.md) and [contribution guidance](CONTRIBUTING.md)
before extending or deploying the local runtime.
