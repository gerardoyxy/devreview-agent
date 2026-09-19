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
3. Extract into a folder you own. Keep all files together.
4. Open **Open NudgeThis.exe** on Windows, **NudgeThis.app** on macOS, or the
   **Open NudgeThis** executable on Linux. Linux file managers may ask you to choose
   “Run”; an executable permission and a graphical desktop with `xdg-open` are required.
5. Your browser opens the local welcome. Choose **Start from an idea**, **Use a starter**
   or **Open a project**. No GitHub account or existing repository is required.

Unsigned downloads can be blocked by your operating system. Verify the release and checksum,
then use the operating system's normal per-application approval flow if you trust the download.
Do not disable system-wide security protections. The macOS bundle is not notarized; the
portable Windows launcher is not a signed installer. This is still an alpha onboarding path.

## Start your first project

The welcome asks about your goal, audience, data needs and optional accounts or payments.
Recommendations use local rules; no model is called. Review the starter, destination and
file list before creating a new folder. Your decisions become **Project context**.

| Starter | Additional requirements | Preview |
| --- | --- | --- |
| Simple website | None | Built-in Rust file server |
| Content website | Node.js 22.12+ and npm | Astro development server |
| Interactive app | Node.js 22.12+ and npm | React + TypeScript + Vite |

Accounts, payments and shared storage are planning choices, not completed features. The
React checklist is example data in memory. Node/Rust are not required to run the compiled
NudgeThis application. Projects and agents may have separate dependencies.

After creating a project, choose **Open workspace & preview**. **Project preview** reviews
installation or startup before it runs. It can stop and restart the processes it owns.
Dependency installation uses npm with lifecycle scripts disabled and never installs globally.
A project requiring install scripts may need manual setup. Managed preview currently supports
maintained website starters and npm-based Astro/Vite projects with a `dev` script. Existing
Bun, pnpm, Yarn, Angular or backend projects can use their own development servers and normal
overlay integration; opening their folder does not imply managed preview support.

The library and default project folder live under `NudgeThis` in your user directory.
**Remove from list** preserves project files. **Close workspace** stops its owned preview.
**Quit NudgeThis** stops the welcome and every workspace it opened. Closing a browser tab
alone does not stop the service. Reopening the launcher reuses an existing local welcome.

## Version history and agents

Fresh projects and projects opened from the welcome have **agent execution disabled**.
Install Git when you want version history. **Branch & publish** guides initialization,
a reviewed first commit, working branches, version saving and optional GitHub publishing.
It does not silently commit or create a remote repository. See [the branch guide](branch-publish.md).

To enable an agent later, close that workspace in the welcome, configure your locally
installed agent and project commands in `nudgethis.toml`, deliberately set
`[execution] enabled = true`, then start the project from a terminal:

```sh
/path/to/nudgethis --root /absolute/path/to/project doctor
/path/to/nudgethis --root /absolute/path/to/project start
```

The welcome never overrides an agent's disabled state to start it. It does not install or
authenticate agents, switch accounts or change global Git settings.

## Terminal options

```sh
nudgethis welcome
nudgethis welcome --library /absolute/path/to/my-library
nudgethis welcome --no-browser
nudgethis --root /absolute/path/to/project start --no-execution
```

Running `nudgethis` without a subcommand also opens the welcome. Set
`NUDGETHIS_LIBRARY_DIR` to override its default folder. On Windows use `nudgethis.exe`.
`start --no-execution` and `[execution] enabled = false` prevent agents, agent setup and
validation commands. Separately reviewed **Project preview** commands remain available.
`NUDGETHIS_DISABLE_EXECUTION=1` also blocks preview package installation and external preview
commands; the built-in website server still works. Native folder selection is optional:
Windows uses a system folder dialog, macOS uses Finder, and Linux uses Zenity or KDialog
when available. You can always paste an absolute folder path.

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

Choose **Quit NudgeThis**, or stop a terminal service with `nudgethis stop` or Ctrl+C.
Back up the library and each project’s `.nudgethis/` while stopped, download and verify
the new archive, then replace the complete extracted application folder.
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
