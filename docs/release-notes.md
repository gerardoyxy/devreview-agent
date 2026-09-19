NudgeThis 0.4.0-alpha.1 unifies the product name across the complete application and adds
the selection controls and My Style features to the downloadable preview.

- Run `nudgethis` / `nudgethis.exe`, configure `nudgethis.toml`, and keep private local state
  in `.nudgethis/`. Browser integrations import `NudgeThis` and call `NudgeThis.init()`.
- Choose mouse buttons/modifiers or a keyboard shortcut, or pick an element with a click/tap.
- Build a personal style through branching visual choices, scoped rules and live component
  previews. Export/import portable profiles and prepare element/page/project requests.
- Review suggestions from repeated supported CSS corrections in applied changes. Each rule
  requires explicit acceptance and a scope. No model training or chat interpretation is involved.
- Retain desktop/mobile route review, Chromium device emulation, project context, drafts,
  isolated worktrees, reviewed Apply, guarded Undo and versioned conversations.

This release changes the public technical names. Retired aliases are removed. It does not
automatically import task/worktree state from differently named older storage directories.
Stop the previous service, keep a private backup and follow the
[0.4 update guide](https://github.com/gerardoyxy/nudgethis/blob/main/docs/upgrade-0.4.md).
Source history has been cleaned and older preview publications retired; use a fresh clone
instead of merging an earlier clone's history back into the repository.

Validation is restricted to application code: native/API persistence, Git safety, context
and style rules, Rust formatting/Clippy, TypeScript, and Chromium browser flows. Native
archives are built and checked on Linux x64, Windows x64, Apple Silicon and Intel Mac.
No agent, model, provider fixture or demo is run by the release checks.

Archives contain the NudgeThis executable with embedded frontend assets, build metadata,
license and installation instructions. Verify them against `SHA256SUMS.txt`. Builds remain
unsigned, not notarized and experimental. Worktrees are not OS sandboxes, device emulation
does not reproduce physical hardware/Safari, and these checks do not certify real providers.

See [installation](https://github.com/gerardoyxy/nudgethis/blob/main/docs/install.md),
[My Style](https://github.com/gerardoyxy/nudgethis/blob/main/docs/my-style.md), and
[the roadmap](https://github.com/gerardoyxy/nudgethis/blob/main/ROADMAP.md).
