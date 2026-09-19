# NudgeThis roadmap

The current release is `0.6.0-alpha.1`, an unsigned alpha available as portable archives
for Windows, Linux and macOS. See [installation](docs/install.md) and the
[release notes](docs/release-notes.md).

## Available now

| Area | Capabilities | Guide |
| --- | --- | --- |
| Getting started | Portable launcher, local project library, goal diagnosis, HTML/CSS, Astro and React starters, reviewed preview commands | [Start a project](docs/project-starter.md) |
| Terminal setup | Checksum-verified per-user installers, selectable versions, CLI instructions and a manual WSL workflow | [Terminal installation](docs/terminal-install.md), [WSL](docs/wsl.md) |
| Visual feedback | Single, multiple and area selection, configurable mouse/keyboard input, group review and Copy context | [Selection controls](docs/selection-controls.md) |
| Conversations | General, frontend, backend, test and documentation requests; drafts, follow-ups, changes and persistent history | [Usage](README.md#conversations-and-review) |
| Project context | Instructions, text skills and documents with selected, versioned snapshots | [Project context](README.md#project-context) |
| Design preferences | Custom application themes and fonts, reusable My Style profiles and suggestions from repeated CSS corrections | [Appearance](docs/appearance.md), [My Style](docs/my-style.md) |
| Route review | Route candidates, dynamic URL resolution, desktop/mobile coverage, blockers and Chromium device emulation | [Route review](docs/route-review.md) |
| Local changes | Isolated worktrees, explicit Apply, guarded Undo, reviewed commits and recovery records | [Recovery](docs/recovery.md), [Saved versions](docs/saved-versions.md) |
| GitHub | Local-history onboarding, branches, explicit account/repository selection, reviewed publishing, pull requests and merge checks | [Branch & publish](docs/branch-publish.md) |
| Agent connections | Codex, a local ACP subset, custom stdio and manual Copy context | [Agent transports](docs/agents.md) |

The application uses TypeScript in the browser and Rust for the local service, storage,
Git operations and agent transports. The [architecture](docs/architecture.md) and
[API reference](docs/api.md) describe those boundaries.

## Planned improvements

These are development priorities, not release-date commitments.

| Area | Next steps |
| --- | --- |
| Setup | Configure agents without a terminal; support more existing-project preview workflows and a guided Windows-to-WSL launcher. |
| Framework integration | Add verified DOM-to-source mapping, router AST adapters, nested/generated routes and broader React/Vue/Angular fixtures. |
| Review | Add optional redacted screenshots, post-HMR visual checks, before/after comparisons and coverage for multiple device profiles per route. |
| My Style | Support CSS tokens and utility classes, selector-aware evidence and more correction patterns. |
| Recovery | Improve backups, local-state retention, interrupted-operation guidance and conflict visualization. |
| Accessibility | Expand keyboard, screen-reader, physical touch-device and cross-browser coverage. |
| Distribution | Add signing/notarization, native installers, clean-machine checks and an update/rollback policy. |
| Agent transports | Add native session resume, interactive ACP permissions, image context and versioned provider compatibility checks. |
| Data interchange | Add review-session import/export, API pagination and scoped MCP integration. |

Team/cloud execution and remote agents require further workflow and security design.

## Current limits

- Agent setup requires local installation and configuration. Default application tests run
  with execution disabled; passing them does not establish real-provider compatibility.
- Managed previews support the maintained website starter and npm-based Astro/Vite projects.
  Other projects use their own development server and overlay integration.
- Route discovery is bounded. Coverage records explicit human review; rescan after source
  changes. Chromium emulation does not reproduce physical devices or Safari/WebKit.
- Element selectors and source hints are not verified source identities. Groups are limited
  to 20 elements on one page; area selection does not enter iframe contents or shadow roots.
- My Style suggestions detect supported CSS values, not semantic intent or model training.
- Worktrees isolate edits but are not operating-system sandboxes. Some interrupted mutations
  require manual recovery. See [Security](SECURITY.md) before enabling execution.
- GitHub publishing requires GitHub CLI. Conflicts, unsupported repository policies and
  mixed local edits may require a Git client. Merging does not guarantee website deployment.
- Archives are unsigned previews without an automatic updater. State is stored locally;
  review-session backup, retention and export remain incomplete.
