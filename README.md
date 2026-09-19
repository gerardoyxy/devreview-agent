<p><img src="assets/brand/nudgethis-icon.svg" width="80" height="80" alt="NudgeThis cursor and star logo"></p>

# NudgeThis

**Point at your UI. Tell your coding agent what to change.**

Alt + right-click an element in your local application, describe the change, and keep reviewing.
Each task has its own conversation, agent replies, diff, validation results and
persistent version history. Agents edit isolated Git worktrees. You explicitly apply reviewed
changes to your branch, without automatic commits or pushes.

[Website](https://nudgethis.click/) · [Documentation](https://nudgethis.click/docs/) · [Install](docs/install.md) · [Terminal](docs/terminal-install.md) · [WSL](docs/wsl.md) · [Agents](docs/agents.md) · [API](docs/api.md) · [Security](SECURITY.md)

## Start without a project

Download the [portable alpha](https://github.com/gerardoyxy/nudgethis/releases/tag/v0.6.0-alpha.1),
extract it and open NudgeThis. Choose **Start from an idea**, **Use a starter** or
**Open a project**. The local welcome helps choose HTML/CSS, Astro or React + TypeScript,
records your goals in Project context and creates a fresh folder after review.

A simple website previews with the built-in Rust server. Astro and React starters require
Node.js 22.12+ and npm, with reviewed dependency installation and Start/Stop/Restart controls.
You can begin without Git or GitHub. Agents start disabled. See [installation](docs/install.md)
for operating-system approval, version history, agent setup and current alpha limitations.

## Build and try

For a prebuilt CLI, use the [terminal installer](docs/terminal-install.md). It verifies
the release checksum and installs in your user folder. Linux, macOS and Windows commands
are available on the [website](https://nudgethis.click/#terminal); WSL uses the Linux
installer inside its distribution. No compiler is required for a published executable.

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
./target/debug/nudgethis --help
```

Windows: `target\debug\nudgethis.exe --help`. For a release executable, run
`cargo build --release --locked -p nudgethis` after building the frontend.
[Installation and checksums](docs/install.md) cover native archives, updating and removal.
To inspect your project without running agents, use `start --no-execution` below.

## Use with your application

Install and authenticate your chosen coding agent locally. Configure its real executable;
NudgeThis does not install providers or change their accounts. See [agent transports](docs/agents.md).

From your application's **repository root**:

```bash
/absolute/path/to/nudgethis init
# Review detected setup and validation commands in nudgethis.toml.
/absolute/path/to/nudgethis doctor
/absolute/path/to/nudgethis start --no-execution
```

Example trusted `nudgethis.toml`:

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
timeout = 600000
```

The execution-disabled mode supports drafts, route review, project context and existing patch review without running setup, validation or agents. Restart without `--no-execution` when you choose to enable execution; `[execution] enabled = false` and `NUDGETHIS_DISABLE_EXECUTION=1` also keep execution disabled.

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

Use **Pick element** and click/tap your target, Alt + right-click, or focus an element
and press Alt + Shift + D. Open **Selection controls** in the overlay or dashboard to
choose your mouse button, modifiers and keyboard shortcut. Preferences persist locally
for this repository and update connected overlays. See [selection controls](docs/selection-controls.md).
Set `modifier: 'none'` for ordinary right-click before preferences are saved. Select an agent and start a conversation, or use **Copy context**
to paste the minimized request into any agent that accepts text.

Use **Select multiple** to add or remove elements with clicks or taps, or **Select area**
to drag a rectangle around visible elements. **Review selection** lets you remove targets
and describe one change for the group, such as “give these three buttons the same size.”
The group stays attached to its conversation, draft and history. Up to 20 elements can be
selected on one page. See [selection controls](docs/selection-controls.md#select-a-group).

## Conversations and review

The in-page modal and dashboard show the same **Conversation**, **Changes**, **History**
and **Context used**.
Follow-ups retain previous worktree edits and pass recent conversation context to the agent.
A question-only reply waits for feedback. Every resulting patch is validated again.
History keeps prior patches; Apply always targets the current ready version. Stale UI actions
are rejected. Applied/rejected/undone tasks get a fresh snapshot and worktree when continued,
including current local edits. Conflicting tasks require Retry from workspace.

This is a new conversation with the selected agent, not a connection to an existing chat in
another application. ACP native resume, interactive permissions and images remain unsupported.

## Workspace tasks and route coverage

**New change** accepts frontend, backend, tests, documentation and general requests without
selecting a page element. Add up to 32 relative file references and selected project context.
Save a draft, edit it with version history, or start it when execution is enabled. File
references guide the agent; they are not an edit allowlist. The queue filters by type and status.

**Workspace setup** reports framework/package-manager detection, executable availability,
configured preparation and validation. It does not run commands or verify agent sign-in.
`init` suggests npm, Bun, pnpm or Yarn commands from project declarations/lockfiles; review
those commands before execution. Each fresh worktree runs `[setup]` once, then each patch
runs `[validation]`. Failed setup and unchecked patches are visible in review.

**Route review** scans static candidates from page files and router declarations. Resolve
dynamic URLs, add missing routes, switch desktop/mobile widths, and mark each viewport
reviewed or blocked with notes. Progress counts completed viewports; loading a page is not
review. Use Next pending view, export JSON coverage and create a task from the current route.
Mobile preview changes the layout viewport; browser developer tools provide full device
emulation. Discovery is bounded and cannot guarantee every runtime route. [Guide](docs/route-review.md).

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

## Build and reuse your style

**My Style** offers a branching visual builder, live example components, named profiles,
scoped rules and portable JSON/Markdown exports. **Suggestions** finds repeated supported
CSS values in at least three applied corrections; inspect the source changes and accept
the scope before adding a rule. This is local pattern detection, without model training
or analysis of chat wording and utility classes.

**Apply my style** prepares a reviewed change for an element, page or project. A default
profile can accompany new requests through Project context; existing conversations keep
their captured style version. See [My Style](docs/my-style.md) for supported values and limits.

## Your colors and typography

Open **Appearance** in the dashboard or modal. Customize independent light/dark palettes,
18 semantic colors, body/heading/code fonts, base text size and corner radius. Choose system
mode, preview before saving, cancel, reset or import/export a JSON theme. Font family names
use installed fonts and fallbacks; upload WOFF/WOFF2 for portable local fonts (three files,
1 MiB combined). No external font service is contacted. Exported themes include uploaded fonts.

Appearance persists per repository in SQLite and synchronizes through authenticated SSE.
Contrast notices flag low-contrast combinations without overriding your choices. Overlay
styles stay inside NudgeThis's Shadow DOM and do not restyle the inspected application.

See [Appearance](docs/appearance.md) for theme settings and font requirements.

## Git and persistence

New tasks capture a private snapshot of current tracked and untracked source, preserving the
user's index, branch and working files. Dependencies and ignored files are not copied;
configure `[setup]` for each fresh worktree. Apply checks affected files against the snapshot,
the original branch and `git apply --check`. Unrelated local edits are preserved. Binary
additions/deletions and CRLF files are supported. Protected, symlink and submodule changes
require manual handling; setup or validation that changes source blocks review.

**Undo applied changes** restores a patch only while affected files still match the recorded
applied state. It refuses to overwrite newer work. Apply/Undo keep a journal; an interruption
retains a **Recovery required** record for manual inspection. They do not commit or push.
Retry starts from the current workspace; Reject removes only that task's worktree.
[Snapshots, Undo and recovery](docs/recovery.md) explain limits and crash handling.

**Review & save** turns selected applied corrections into an explicitly approved local
Git commit. Review plain-language summaries, optionally inspect the diff, edit the suggested
version name and choose **Save version**. Unrelated staged and unstaged files are preserved;
stale or mixed edits require another review. **Saved versions** keeps the local history in
the dashboard and overlay. Publishing to GitHub remains separate. See
[Saved versions](docs/saved-versions.md) for author details, hooks, signing and recovery.

**Branch & publish** also supports projects without Git history: keep drafts and context,
explicitly enable local history, review files and save a first version. The guide explains
branches, offers create/switch/continue, and refreshes when another tool changes the branch.
GitHub is optional. Choose an account and destination, review and publish saved commits,
prepare an editable pull request, then merge only after checks and required reviews permit it.
This optional flow needs GitHub CLI; it leaves global account settings untouched. See
[Branches, local history and GitHub](docs/branch-publish.md) for limits and recovery.

SQLite keeps tasks, drafts, conversations, versions, project context, route coverage and
appearance. Legacy migration creates a WAL-aware backup before schema changes. Tokens
and snapshot refs are local development state; never publish them with a mirror push.

## CLI

```text
nudgethis welcome [--library /absolute/folder] [--no-browser]
nudgethis init                  nudgethis doctor
nudgethis start [--port 7331] [--no-execution]
nudgethis stop                  nudgethis status
nudgethis tasks                 nudgethis task QA-1
nudgethis apply QA-1             nudgethis undo QA-1
nudgethis reject QA-1
nudgethis retry QA-1             nudgethis cancel QA-1
```

Use `--root /absolute/repository` with any repository command. Client commands read the port
from `nudgethis.toml`; if you override `start --port`, update the config for CLI client use.

## Limits and development

This remains an alpha. Screenshots, framework-verified source mapping,
automatic rebase, post-HMR visual verification and native provider resume remain future work.
Element reidentification is conservative: changed or ambiguous targets require selection again.
The [roadmap](ROADMAP.md) distinguishes implemented behavior from remaining work.
[Device browser](docs/route-review.md#device-browser) adds Chromium
touch, rotation, density and mobile user-agent emulation to route review.
Worktrees are not OS sandboxes. See [security](SECURITY.md) for the local trust model.

See [Contributing](CONTRIBUTING.md) for development setup and checks, and
[migration](docs/migration.md) when updating an older installation.

MIT © 2026 gerardoyxy and NudgeThis contributors.
