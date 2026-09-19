# Windows + WSL

When your repository and development tools live in WSL, run the Linux version of
NudgeThis in the same distribution. Use your Windows browser for its interface.
The Windows launcher does not currently switch a project into WSL automatically.

## Enter the right distribution

In PowerShell, list installed distributions and open the one that owns your project:

```powershell
wsl -l -v
wsl -d Ubuntu
```

Replace `Ubuntu` with its actual name. These commands open an existing distribution;
they do not install WSL or move a repository. See [Microsoft's WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).

## Install inside WSL

Run the [Linux terminal installation](terminal-install.md#linux-macos-and-wsl) inside that
distribution. The current prebuilt Linux archive requires x64 and glibc; use a compatible
distribution such as Ubuntu 22.04 or later. Linux ARM64 and musl-based distributions need
a source build.

Then open the local welcome without asking Linux to launch a browser:

```sh
nudgethis welcome --no-browser
```

Keep the terminal running. Copy the **complete URL printed by NudgeThis** into Edge,
Chrome or another browser on Windows. WSL normally forwards Linux localhost services
to Windows; see [Microsoft's networking guide](https://learn.microsoft.com/en-us/windows/wsl/networking).

Choose **Open a project** and enter the Linux path, such as `/home/alex/projects/my-app`.
Pasting the path works without a Linux graphical folder picker. The welcome keeps agents
disabled, just as it does on other platforms.

## Work directly from the repository

Alternatively, stay in the WSL terminal:

```sh
cd ~/projects/my-app
nudgethis init
nudgethis doctor
nudgethis start --no-execution
```

Review the generated configuration and open the printed local URL in Windows. Git,
Node/npm or another project runtime, and any chosen coding agent must be installed and
configured in that distribution. A Windows account or executable installation does not
automatically supply its Linux counterpart.

Accessing files through `\\wsl$\Ubuntu\home\alex\projects` from the Windows launcher does not make its commands
run under Linux. Keep the service and development tools in the repository's intended
environment. Microsoft also [recommends keeping Linux projects in the Linux filesystem](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
for performance.

## Connection and preview details

- Start your application's development server in WSL too. Use the exact browser origin in
  `nudgethis.toml`; `localhost` and `127.0.0.1` are different origins.
- If the URL does not open, confirm the Linux process is still running, the port is free
  on Windows and your WSL localhost forwarding is available. Consult Microsoft's networking
  guide for VPN or firewall issues. Keep NudgeThis bound to loopback.
- The embedded responsive preview works in the Windows browser. **Device browser** starts
  Chromium where NudgeThis runs, so a Linux service needs an installed Linux Chromium and
  a graphical session. It does not control an existing Windows browser session.

The Windows-to-WSL one-click launcher is not included yet. Tests of the Linux application
do not cover every Windows, WSL distribution, VPN or browser configuration.
