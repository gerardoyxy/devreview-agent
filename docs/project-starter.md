# Start a project with NudgeThis

The portable launcher opens a local welcome in your browser. The application is Rust with
a TypeScript interface; the templates are separate projects you own. No model is used to
diagnose the goal, recommend a stack, generate the maintained files or serve a simple website.

## Starting points

- **Start from an idea:** describe the goal, audience, data needs, accounts, payments and
  budget preference. The recommendation explains why a starter fits and what still needs work.
- **Use a starter:** choose a maintained template and record what it should help people do.
- **Open a project:** select an existing local folder. No clone, Git initialization, agent
  authentication or package installation is performed by opening it.

HTML/CSS is recommended for a simple website or an undecided initial idea. Astro is recommended
for pages and articles. React + TypeScript is recommended for interactive apps or requested
accounts, payments or shared information. You can override the recommendation. These answers
are requirements for future implementation, not evidence that backend services already exist.

## Review and creation

The server holds the reviewed template, answers, destination and file list for ten minutes.
The parent folder must be outside existing Git history and local application state.
Creation reserves a **new** directory exclusively; existing files are never replaced. Repeating
a successful creation request returns its existing library entry. If creation stops partway
through, the entry is marked incomplete and already-created files are preserved for inspection.

The project gets source files, a README, an ignore file and `nudgethis.toml` with execution
disabled. Its objective, audience, decisions and next steps are saved as a default instruction
in local Project context. No commit, remote repository, hosting service or account is created.
Use **Branch & publish** to review the first local version when ready.

The library contains up to 64 entries and can own eight open workspaces. Opening an already
open entry returns that workspace. Closing it stops the processes it owns. Removing the entry
preserves files. Library membership persists across restarts; running sessions do not.

## Project preview

**Project preview** is available in the dashboard and overlay. A simple website uses a Rust
server on an available loopback port. It serves bounded public web assets and excludes local
state, Git, environment files, non-public file types and symlink targets. This is a development
server, not a production host or general-purpose backend.

Astro and Vite previews require npm and Node.js 22.12+. The review displays the folder, command,
actual `dev` script and whether package downloads occur. Installation runs `npm install` or
`npm ci` with `--ignore-scripts --no-audit --no-fund`. The development script runs explicitly;
implicit pre/post scripts are disabled. No global packages are installed. Projects that rely
on lifecycle scripts may need manual setup. Package and configuration changes invalidate
an outstanding command review.

Start, Stop and Restart supervise owned process groups (Job Objects on Windows), including
children. Astro background mode is disabled so its server stays attached to the owned process. A running HTTP preview is required before the UI says it is ready. Installation and
startup show progress states; failure keeps files and offers a new review. The global
`NUDGETHIS_DISABLE_EXECUTION=1` switch prevents external preview commands as well as agents.
The per-project execution setting and `--no-execution` disable agent execution independently.

The maintained templates load their optional overlay only during local development. The
preview link passes the local token in a fragment; the bridge removes it from the address and
keeps it in that tab's session storage. No token is written into the project or served HTML.
React/Astro production builds exclude the bridge. The static server injects it only while
serving the page; the source HTML remains clean.

## Current boundaries

The welcome is a portable browser-based interface, not a signed desktop installer. Agent
setup still needs local configuration and a deliberate terminal launch. GitHub publishing
requires a repository selected by the user; remote repository creation is not automatic.
Built-in preview management is limited to the maintained website starter and npm Astro/Vite
projects. Other stacks continue using their own servers. See [installation](install.md) for
requirements, updates and operating-system prompts.
