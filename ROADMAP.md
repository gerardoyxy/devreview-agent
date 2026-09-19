# NudgeThis roadmap

Version `0.4.0-alpha.1` is an experimental application preview. The current source lives on
`main`; tagged previews provide native archives with release notes and SHA-256 checksums.
This preview includes selection controls, My Style and the complete NudgeThis naming transition.
A working feature or passing application test does not certify an agent or a production deployment.

## Implemented

- Source after `0.4.0-alpha.1`: guided Review & save, editable commit names, explicit author,
  local Git version history and safe preservation of unrelated staging. Publishing stays
  separate; hooks and mixed edits use the user's Git client. See [Saved versions](docs/saved-versions.md).
- Strict TypeScript dashboard, isolated overlay, conversations and appearance editors.
- Rust CLI, HTTP/SSE service, queue, SQLite, Git operations, process supervision and transports.
  Browser assets are embedded in the executable; Node and Rust are build requirements.
- General/frontend/backend/test/documentation tasks, optional file references, saved drafts
  and draft editing with version history. An element selection is optional.
- Project metadata detection for common frontend/backend frameworks, npm/Bun/pnpm/Yarn
  suggestions, read-only `doctor`, separate worktree preparation and validation results.
- Explicit execution-disabled mode for reviewing and preparing work without running commands
  or agents. Empty validation lists remain visibly unchecked.
- Local workspace snapshots through a private Git index, retaining uncommitted source without
  modifying branch/index. Apply checks affected paths; Undo protects later work. Mutation
  journals retain interruption evidence for manual recovery.
- Configurable mouse buttons/modifiers and recorded keyboard shortcuts, one-time click/tap
  picking, a gesture test area, and persistent selection preferences synchronized across windows.
- Parent/child/sibling selection, minimized context and conservative reidentification of
  unique matching targets. Source hints are explicitly unverified; Copy context remains available.
- Persistent instructions, text skills and documents with immutable task snapshots. Importing
  text does not install executable skills, plugins or referenced tools.
- Custom light/dark palettes, semantic colors, font roles, local WOFF/WOFF2, sizing, radius
  and theme import/export. The default blue brand is shared by the landing and application.
- My Style: branching visual choices, live component previews, portable profiles, scoped
  rules and explicit/default style context with immutable task snapshots. Repeated supported
  CSS corrections become suggestions only; users inspect evidence and accept their scope.
- Route candidate inventory, dynamic URL resolution, manual additions/exclusions, desktop/mobile
  layout previews, explicit viewport coverage, blocker notes, next-pending navigation,
  contextual task creation and report export. Scanning is static and bounded, not exhaustive.
- An owned Chromium device browser with phone/tablet/desktop profiles, touch, density,
  orientation, mobile user agent/client hints and desktop reset. Device review records verify
  the current route/session and retain browser metrics; visual approval remains manual.
- Queue search/type/status/sort filters, bounded row and diff rendering, patch downloads,
  keyboard controls, reconnect handling and request timeouts.
- Default application-only tests with execution disabled. Agent fixtures are opt-in and
  excluded from default CI. The 0.3 implementation was checked without agents or models.
- Native packaging/release automation for Linux x64, Windows x64, Apple Silicon and Intel Mac,
  with install/update/removal guidance. Archives are unsigned preview builds.

## Next evidence and product milestones

| Work | Acceptance boundary |
| --- | --- |
| Real provider compatibility | Opt-in disposable-project checks with exact agent/version results; never infer compatibility from configured adapters, application tests or simulations. |
| Distribution maturity | Signing/notarization, broader operating-system checks, native installers, documented rollback and a deliberate update policy. Current archives are portable previews. |
| Framework depth | Evidence-based source mapping, router AST adapters, nested/generated route resolution, real application integration examples and language-aware file references. |
| Style learning depth | Selector-aware evidence, utility-class/token adapters and semantic technique recognition. Current suggestions detect exact supported CSS values locally; they do not infer personal intent or train a model. |
| Visual verification | Opt-in redacted screenshots, post-HMR checks, before/after evidence and per-device review matrices. Chromium emulation exists; physical-device and Safari/WebKit behavior still need separate checks. |
| Basic workflow completion | Guided first project connection, real framework fixtures, clearer recovery/retention and broader accessibility/install checks. See the [foundation evidence map](docs/foundations.md). |
| Recovery and scale | More automated recovery only when file state proves the action, snapshot retention controls, API pagination, review sessions and conflict visualization. |
| Agent depth | Native resume, interactive ACP permissions, image context and additional transport capability negotiation with versioned evidence. |
| Interchange | Export/import review sessions and carefully scoped MCP/GitHub integration. Team/cloud execution and remote agents need separate workflow and security design. |

## Current limits

Route candidates and selectors are hints, not verified runtime/source identities. Embedded
mobile frames change layout width; the separate Chromium device browser adds touch, user
agent, density and orientation emulation without reproducing physical hardware or Safari. Progress
only counts explicitly reviewed viewports and becomes outdated when the source changes;
rescan to begin a fresh checklist. Worktrees do not inherit ignored dependencies and are
not operating-system sandboxes. Apply does not commit, push or certify the visual result.

The executable is `nudgethis`, configuration is `nudgethis.toml`, and local state is `.nudgethis/`. No automatic
updater, universal agent certification, autonomous visual QA or stable-release claim is made.
Read [security](SECURITY.md), [route review](docs/route-review.md), [recovery](docs/recovery.md)
and [installation](docs/install.md) before extending or distributing the application.
