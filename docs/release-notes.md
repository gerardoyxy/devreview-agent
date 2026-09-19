NudgeThis 0.3.0-alpha.1 adds workspace tasks, review-only operation and route coverage.

- Create and edit drafts for frontend, backend, tests, documentation and general changes.
- Detect project frameworks and package managers; inspect setup with `nudgethis doctor`.
- Configure dependency preparation separately from validation; see unchecked patches clearly.
- Capture existing local edits without changing the user's Git index or branch. Apply checks
  affected files against the snapshot; Undo refuses to overwrite later edits. Interrupted
  Apply/Undo operations retain a recovery record and require manual inspection.
- Navigate selected elements through parents, children and siblings. Stale selectors must
  still match captured identity hints. Source-file hints remain unverified.
- Scan route candidates, resolve dynamic URLs, switch desktop/mobile layout widths, track
  manual review coverage, record blockers, create contextual tasks and export a report.
- Search and filter the queue; retain the shared blue style and custom colors/fonts.

Archives contain one executable with embedded browser assets, build metadata, license and
installation instructions. Verify downloads against `SHA256SUMS.txt`. Builds are unsigned
and not notarized; this is a prerelease, not a stable or provider-certified release.

Validation is restricted to application code: Rust Git/store/input tests, API tests with
execution disabled, TypeScript/static checks and local browser review. The release workflow
checks the native executable on Linux x64, Windows x64, macOS Apple Silicon and macOS Intel.
No agent/model integrations, deterministic agent fixtures or demos were exercised for this release.

Route discovery is a bounded static scan, not a guarantee that all runtime routes exist.
Coverage counts explicit human review; loading a route does not certify its rendering.
Mobile preview resizes the layout viewport, without emulating user agent, touch or hardware.
Full device checks remain available through the browser's own developer tools. Worktrees are
not OS sandboxes; provider support still depends on the configured adapter.

See [installation](https://github.com/gerardoyxy/nudgethis/blob/main/docs/install.md),
[route review](https://github.com/gerardoyxy/nudgethis/blob/main/docs/route-review.md) and
[recovery](https://github.com/gerardoyxy/nudgethis/blob/main/docs/recovery.md).
