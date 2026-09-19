# NudgeThis

**Point at your UI. Tell your coding agent what to change.**

Alt + right-click an element in your local application, describe the change, and keep reviewing.
Each task has its own conversation, live public agent replies, diff, validation results and
persistent version history. Agents edit isolated Git worktrees. You explicitly apply reviewed
changes to your branch, without automatic commits or pushes.

[Agents](docs/agents.md) · [Architecture](docs/architecture.md) · [API](docs/api.md) · [Migration](docs/migration.md) · [Security](SECURITY.md)

The project and repository are **NudgeThis**. Its English [static landing](apps/site/README.md)
builds with `npm run build:site` and is published at [nudgethis.click](https://nudgethis.click/).
[Publication setup](docs/landing.md). The CLI still uses `nudgethis` for compatibility.
The current source alpha is maintained on `main`. See the [roadmap](ROADMAP.md) for
implemented capabilities, release requirements and planned features.

## Build and try

The frontend is strict TypeScript. The HTTP/SSE server, queue, SQLite, Git operations,
validation, CLI and agent transports are Rust. Compiled browser assets are embedded in the
`nudgethis` executable. Node is a build/test dependency, not a NudgeThis runtime dependency.
Your configured agent or application may independently require Node.

Build requirements: Git, Node.js 24.15+, stable Rust and a C compiler for bundled SQLite.

```bash
git clone https://github.com/gerardoyxy/nudgethis.git
cd nudgethis
npm ci
npm run build
./target/debug/nudgethis demo
```

Windows: `target\debug\nudgethis.exe demo`. For a release executable, run
`cargo build --release --locked` after building the frontend. Use `demo --port 7441`
if port 7331 is occupied. No npm package or binary release is published yet.

The demo uses a disposable Git repository and a labelled, deterministic Rust agent. It
changes `button.css` without model calls. Open the printed Playground link, report the button,
review the patch, send a follow-up and apply. The capture page is not a live preview of that
CSS file. Ctrl+C stops the demo and removes its repository.

## Use with your application

Install and authenticate your chosen coding agent locally. Configure its real executable;
NudgeThis does not install providers or change their accounts. See [agent transports](docs/agents.md).

From your application's **repository root**:

```bash
/absolute/path/to/nudgethis init
# Edit nudgethis.toml, then commit it and .gitignore along with application changes.
/absolute/path/to/nudgethis start
```

Example trusted `nudgethis.toml`:

```toml
defaultAgent = "codex"

[server]
port = 7331
allowedOrigins = ["http://localhost:5173"]

[workers]
maxConcurrent = 2

[validation]
commands = ["npm ci", "npm test"]
timeout = 120000

[[agents]]
id = "codex"
label = "Codex CLI"
transport = "codex"
command = "codex"
timeout = 600000
```

Open the dashboard URL printed by `start`. Its fragment contains a local access token;
the dashboard removes it and stores the token in session storage. The token is also in
ignored `.nudgethis/token`. Never commit it or include it in production bundles.

Inject the overlay **only in development**, for example with Vite:

```ts
if (import.meta.env.DEV) {
  const { NudgeThis } = await import(
    /* @vite-ignore */ 'http://127.0.0.1:7331/overlay.js'
  );
  const review = NudgeThis.init({
    enabled: true,
    server: 'http://127.0.0.1:7331',
    token: import.meta.env.VITE_NUDGETHIS_TOKEN
  });
  // Call review.destroy() when unmounting the integration.
}
```

Put the token in an ignored local development environment file. Configure the exact browser
origin: `localhost` and `127.0.0.1` differ. A restrictive application CSP must permit the local
NudgeThis script, API connection and overlay styles; adjust only your development policy.

Use Alt + right-click, or focus an element and press Alt + Shift + D. Set `modifier: 'none'`
for ordinary right-click. Select an agent and start a conversation, or use **Copy context**
to paste the minimized request into any agent that accepts text.

## Conversations and review

The in-page modal and dashboard show the same **Conversation**, **Changes**, **History**
and **Context used**.
Follow-ups retain previous worktree edits and pass recent conversation context to the agent.
A question-only reply waits for feedback. Every resulting patch is validated again.
History keeps prior patches; Apply always targets the current ready version. Stale UI actions
are rejected. Applied/rejected tasks get a new worktree when continued; commit applied changes
first. Conflicting tasks require Retry from HEAD.

This is a new conversation with the selected agent, not a connection to an existing chat in
another application. ACP native resume, interactive permissions and images remain unsupported.

## Project context

Open **Project context** in the dashboard or review modal to save project instructions,
reusable skills and reference documentation. Paste text or import UTF-8 Markdown/text files,
including `SKILL.md`. Choose defaults for new conversations, then adjust **Context for this
change** before sending a request or follow-up.

Rust stores the library per repository and records the full selected text and versions for
each change. **Context used** shows that snapshot; **History** keeps earlier snapshots.
Editing or deleting a library item does not rewrite past context. Follow-ups keep the
recorded context unless you change the selection or reload the library; Retry also keeps it.

Instructions and skills are explicitly selected guidance. Documentation is reference
material; the shared prompt tells agents not to treat embedded instructions as commands.
Text skills do not install scripts, tools or supporting assets. PDF/image imports, URL
fetching and automatic discovery of repository skills are not included. Agent compatibility
still depends on the selected adapter.

The library supports 32 items, 16 KiB of text per item and 128 KiB total. Each selected
snapshot is limited to 48 KiB, including JSON metadata. Content stays in local SQLite until
you send it to your agent or use **Copy context**. See the [context API](docs/api.md#project-context).

## Your colors and typography

Open **Appearance** in the dashboard or modal. Customize independent light/dark palettes,
18 semantic colors, body/heading/code fonts, base text size and corner radius. Choose system
mode, preview before saving, cancel, reset or import/export a JSON theme. Font family names
use installed fonts and fallbacks; upload WOFF/WOFF2 for portable local fonts (three files,
1 MiB combined). No external font service is contacted. Exported themes include uploaded fonts.

Appearance persists per repository in SQLite and synchronizes through authenticated SSE.
Contrast notices flag low-contrast combinations without overriding your choices. Overlay
styles stay inside NudgeThis's Shadow DOM and do not restyle the inspected application.

The default blue identity is shared by the landing, dashboard and overlay: self-hosted
Archivo, fine borders and compact controls. Saved custom themes keep their own colors and fonts.
Design work used [Impeccable](https://github.com/pbakaus/impeccable).
[Design system](DESIGN.md) · [Appearance details](docs/appearance.md).

## Git and persistence

New tasks require a clean checkout at committed HEAD. Dependencies are not copied into
worktrees; configure trusted setup/validation commands where needed. Apply requires the
original branch, clean affected files and a successful `git apply --check`. Unrelated local
edits are preserved. Binary additions/deletions are supported; secret, symlink and submodule
patches require manual handling. Validation that changes source blocks Apply.

Retry discards that task's worktree and starts from current HEAD. Reject removes its worktree.
Stop cancels running processes; interrupted active tasks recover as failed on restart. A stale
`.nudgethis/server.lock` after a crash requires confirming that the previous server is stopped
before manual removal. SQLite migration from the Node alpha creates a WAL-aware backup before
schema changes and preserves task IDs, tokens, messages and patch versions.

## CLI

```text
nudgethis init                  nudgethis start [--port 7331]
nudgethis stop                  nudgethis status
nudgethis tasks                 nudgethis task QA-1
nudgethis apply QA-1             nudgethis reject QA-1
nudgethis retry QA-1             nudgethis cancel QA-1
nudgethis demo [--port 7441]
```

Use `--root /absolute/repository` with any repository command. Client commands read the port
from `nudgethis.toml`; if you override `start --port`, update the config for CLI client use.

## Limits and development

This remains an alpha. Screenshots, stable element identity, safe Undo, framework source
mapping, automatic rebase and post-HMR visual verification are future work. The
[roadmap](ROADMAP.md) distinguishes implemented capabilities from release work and future features.
Tests use deterministic agents and do not certify every provider. ACP and custom agents must
supply their own filesystem/network sandbox; a Git worktree is not an OS sandbox.

```bash
npm ci
npm run build
npm run check
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
npm test
```

CI runs on Windows, macOS and Linux. [Contributing](CONTRIBUTING.md).

MIT © 2026 gerardoyxy and NudgeThis Agent contributors.
