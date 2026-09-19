# Updating to the NudgeThis 0.4 preview

Version 0.4 uses one name across the executable, configuration, local storage, browser
integration and native crates. This is a breaking naming change from earlier previews.

| Surface | Current name |
| --- | --- |
| Executable | `nudgethis` / `nudgethis.exe` |
| Project configuration | `nudgethis.toml` |
| Private local state | `.nudgethis/` |
| Browser integration | `NudgeThis.init()` |
| Development token example | `VITE_NUDGETHIS_TOKEN` |
| Private DOM content | `data-nudgethis-private` |
| Optional source hint | `data-nudgethis-source` |
| Native application crate | `nudgethis` |
| Transport library | `nudgethis-agent-runtime` |

Retired names are no longer exported or accepted as compatibility aliases.

## Existing application integrations

1. Stop the previous service and its device browser. Finish or reject outstanding patches
   before changing versions. Keep a private backup of the previous configuration and state.
2. Extract the current archive into a new directory. Update shortcuts/PATH to its executable.
3. Run `nudgethis init` in your application's repository. Review `nudgethis.toml` and transfer
   your trusted origin, agent, setup and validation settings from the previous configuration.
4. Update your development import to `NudgeThis.init()`. Update the token environment variable,
   private-content markers and source-hint attributes together. See the [integration example](../README.md#use-with-your-application).
5. Start with `nudgethis start --no-execution`, use its new local token, and verify selection,
   privacy markers and drafts before enabling execution.

The service uses `.nudgethis/` and does not automatically discover, move or delete state
stored under a retired directory name. Keep previous state ignored and backed up. Do not
rename an active worktree directory or mix SQLite databases and WAL files. Automated import
of those older task/worktree records is not provided in this preview. Recreate the required
context/preferences in the new workspace; themes with earlier uploaded-font identifiers
need their font files uploaded again. Existing source changes are not undone by this update.

## Source checkouts

The naming cleanup rewrote published source history. Clone the repository again to a new
directory. Preserve uncommitted work separately and reapply reviewed patches; do not merge
an old clone's history back into the cleaned repository. Old commit URLs and release tags
are not stable references. Earlier preview archives have been retired; use the current
release and verify its checksums.

See [installation](install.md), [recovery](recovery.md) and [the roadmap](../ROADMAP.md).
