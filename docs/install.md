# Install, update and remove NudgeThis

Download the archive matching your operating system and CPU from
[GitHub Releases](https://github.com/gerardoyxy/nudgethis/releases).
Preview releases are alpha builds. Their notes identify the checks performed and remaining limits.

| Archive suffix | Platform |
| --- | --- |
| `linux-x64.tar.gz` | x86-64 Linux, built on Ubuntu 22.04 with glibc |
| `windows-x64.zip` | 64-bit Windows |
| `macos-arm64.tar.gz` | Apple Silicon, built on macOS 14 |
| `macos-x64.tar.gz` | Intel Mac, built on macOS 15 |

The builds are unsigned and not notarized. GitHub runners validate each archive's native
executable; this is not certification for all older operating systems. macOS Intel builds
target the build platform. Build from source for platforms without a matching archive.

1. Download the archive and `SHA256SUMS.txt` from the same release.
2. Verify its SHA-256 checksum before extracting. On Linux use `sha256sum <archive>`;
   on macOS use `shasum -a 256 <archive>`; in PowerShell use
   `Get-FileHash .\<archive> -Algorithm SHA256`. Compare the entire hash with the matching line.
3. Extract into a directory you own. The archive contains `nudgethis` or `nudgethis.exe`,
   the license, build metadata and these instructions. Keep it there or add the directory to PATH.
4. Install Git. The compiled app does not require Node or Rust. Your project, package manager
   and chosen coding agent have their own requirements.

From your application's repository root:

```sh
/path/to/nudgethis init
/path/to/nudgethis doctor
/path/to/nudgethis start --no-execution
```

Use a repository with at least one commit. `init` adds `.nudgethis/` to `.gitignore` and
suggests commands from project metadata without executing them. Review `nudgethis.toml`.
The last command opens the local service in review mode: drafts, route review, context,
appearance, existing Apply/Undo and history remain available; setup, validation and agents
cannot run. Open the dashboard URL printed by the server. On Windows use the equivalent
path to `nudgethis.exe` in PowerShell.

When you choose to enable execution, configure your locally installed agent and project
commands, then restart without `--no-execution`. `[execution] enabled = false` or
`NUDGETHIS_DISABLE_EXECUTION=1` also disables execution; remove that setting deliberately.
NudgeThis does not install or authenticate agents, change their accounts or modify global Git settings.

For **Device browser**, install Chrome, Edge or Chromium. Workspace setup and `doctor`
check common executable locations without starting a browser. If necessary, set
`NUDGETHIS_BROWSER_PATH` to its absolute executable path in the server's environment and
restart NudgeThis. The embedded layout preview does not require a separate browser process.
Device review opens an isolated temporary profile; see the
[device browser guide](https://github.com/gerardoyxy/nudgethis/blob/main/docs/route-review.md#device-browser).

## Updating

When updating from an earlier preview with different executable/configuration names, follow
the [0.4 transition guide](https://github.com/gerardoyxy/nudgethis/blob/main/docs/upgrade-0.4.md)
first. It explains the new integration identifiers, local-state boundary and source-history reset.

Stop the running service with `nudgethis stop` or Ctrl+C. Back up `.nudgethis/` while the
service is stopped, download and verify the new archive, then replace the executable.
Keep your repository's configuration and state. Run `doctor` before restarting.
There is no automatic updater or startup download.

Version 0.3 adds fields to existing JSON records and a route-review preference. It preserves
the SQLite schema version, token and task IDs. Older applied tasks without a complete
before/after record do not gain Undo retroactively. See [migration](https://github.com/gerardoyxy/nudgethis/blob/main/docs/migration.md).

## Removing

Stop the service, remove the executable directory and remove any PATH entry you added.
Remove the development overlay integration from your application. Keep `.nudgethis/` if
you want to retain tasks, patches and local preferences. Deleting it discards that local history.
Local snapshot refs under `refs/nudgethis/snapshots/` also retain source snapshots in Git;
they are not branch commits and ordinary branch pushes do not upload them. Do not use
mirror pushes to publish private development state. No account or background service is installed.

## Building an archive from source

With Node 24.15+, stable Rust, a C compiler and Git:

```sh
npm ci
npm run build:frontend
cargo build --release --locked -p nudgethis
npm run package:release
```

Archives and checksums are written under `dist/release/`. The release workflow uses
[standard GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
