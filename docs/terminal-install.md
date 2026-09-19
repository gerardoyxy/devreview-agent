# Install from the terminal

The CLI and portable launcher use the same native NudgeThis application. These installers
download a published archive, verify its SHA-256 checksum, and keep versions in your user
folder. They do not need administrator access or install Node.js, Rust, Git or agents.

## Linux, macOS and WSL

Run these commands in a Linux or macOS shell. For a WSL repository, run them inside that
Linux distribution; see [Windows + WSL](wsl.md).

```sh
curl -fsSLo nudgethis-install.sh https://nudgethis.click/install.sh
sh nudgethis-install.sh
export PATH="${XDG_DATA_HOME:-$HOME/.local/share}/nudgethis/current:$PATH"
nudgethis --help
```

[Read the shell installer](https://nudgethis.click/install.sh) before running it. It selects
Linux x64, macOS Apple Silicon or macOS Intel from the current environment. Other
architectures need a [source build](../README.md#build-and-try). Linux archives use glibc;
see [platform requirements](install.md). Downloads remain unsigned and unnotarized.

Installation defaults to `${XDG_DATA_HOME:-$HOME/.local/share}/nudgethis`. The `current`
link selects a complete version directory. The PATH command above affects this terminal;
add that line to your own shell profile if you want it in future sessions. The installer
does not edit shell profiles. Curl, tar and either sha256sum or shasum must be installed.

## Windows PowerShell

Use PowerShell on x64 Windows. For repositories and tools inside WSL, use the Linux
instructions instead.

```powershell
Invoke-WebRequest -UseBasicParsing https://nudgethis.click/install.ps1 -OutFile nudgethis-install.ps1
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\nudgethis-install.ps1 -AddToPath
```

[Read the PowerShell installer](https://nudgethis.click/install.ps1) before running it.
`RemoteSigned` applies only to this installer process; it does not change the system's
execution policy. Organization policies still apply. If your policy requires signed
scripts, use the [portable archive](install.md) or your organization's approved process.

Open a **new terminal**, then run:

```powershell
nudgethis --help
```

The installer stores versions under `%LOCALAPPDATA%\NudgeThis\versions` and a command
wrapper under `%LOCALAPPDATA%\NudgeThis\bin`. `-AddToPath` adds only that bin directory to
your user's PATH. Omit it to manage PATH yourself; the installer prints the full command.
It does not change the machine PATH, install a service or start the application.

## Open the welcome or an existing repository

To choose or create a project in your browser:

```sh
nudgethis welcome
```

For terminal-first setup, run these commands from your project's root:

```sh
nudgethis init
nudgethis doctor
nudgethis start --no-execution
```

Review `nudgethis.toml` after initialization. Open the complete local URL printed by the
server, including its access token. Keep that URL private. `--no-execution` lets you prepare
drafts and inspect the project without running agents. See [agent configuration](agents.md)
and [overlay integration](../README.md#use-with-your-application) before enabling changes.

## Versions, updates and rollback

The published installer defaults to the release linked on the website. To choose a
specific published version, use `--version` in a shell or `-Version` in PowerShell:

```sh
sh nudgethis-install.sh --version 0.7.0-alpha.1
```

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\nudgethis-install.ps1 -Version 0.7.0-alpha.1
```

Stop running NudgeThis services and back up local state before changing versions. Download
the installer again to update, or select an earlier compatible version to roll back. Previous
application versions remain on disk; changing the executable does not roll back your database
or project files. See [migration](migration.md) for data compatibility. A failed download or
checksum check leaves the selected installation unchanged.

Custom installation folders use `--install-dir /absolute/folder` or
`-InstallDir C:\Tools\NudgeThis`. Use a dedicated folder and add its `current` directory
(Linux/macOS) or `bin` directory (Windows) to PATH as appropriate. Installers preserve an
unrecognized existing version or command instead of overwriting it.

## Remove a terminal installation

Quit NudgeThis and remove its installation directory and the PATH entry you added. For
the default installation, this is the `nudgethis` folder under your local data directory
on Linux/macOS, or `%LOCALAPPDATA%\NudgeThis` on Windows. Delete any downloaded installer
scripts when no longer needed.

Project files, the welcome library in your user directory and each project's `.nudgethis/`
are separate. Keep them to preserve work and history; see [removal](install.md#removing).
