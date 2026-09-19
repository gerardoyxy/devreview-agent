# Published by build-site.js with the matching release version. Requires PowerShell 5.1+.
[CmdletBinding()]
param(
    [string]$Version = '@VERSION@',
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'NudgeThis'),
    [switch]$AddToPath
)
$ErrorActionPreference = 'Stop'
$Version = $Version -replace '^v', ''
if ($Version -cnotmatch '^\d+\.\d+\.\d+(-[a-z0-9]+(\.[a-z0-9]+)*)?$') { throw 'Invalid version. Use the published installer or supply -Version.' }
$architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($env:OS -ne 'Windows_NT' -or $architecture -ne 'AMD64') { throw 'This installer requires x64 Windows. Inside WSL, use install.sh.' }
if (-not [IO.Path]::IsPathRooted($InstallDir) -or $InstallDir -match '[\r\n]') { throw 'InstallDir must be an absolute local path.' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if ($InstallDir.StartsWith('\\')) { throw 'Use a local Windows installation folder. For a WSL repository, install inside its Linux distribution.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[void][IO.Directory]::CreateDirectory($InstallDir)
$lock = $null
$stage = Join-Path $InstallDir ('.install-' + [Guid]::NewGuid().ToString('N'))
try {
    $lock = [IO.File]::Open((Join-Path $InstallDir '.install-lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    [void][IO.Directory]::CreateDirectory($stage)
    $name = "nudgethis-$Version-windows-x64"
    $archive = "$name.zip"
    $base = "https://github.com/gerardoyxy/nudgethis/releases/download/v$Version"
    $zipPath = Join-Path $stage $archive
    $sumPath = Join-Path $stage 'checksum'
    Write-Host "Downloading NudgeThis $Version (windows-x64)..."
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$archive" -OutFile $zipPath -TimeoutSec 180
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$archive.sha256" -OutFile $sumPath -TimeoutSec 60
    $checksum = [IO.File]::ReadAllText($sumPath).Trim()
    if ($checksum -cnotmatch ('^([a-f0-9]{64})\s+' + [regex]::Escape($archive) + '$')) { throw 'Invalid release checksum.' }
    $expected = $Matches[1]
    if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Checksum mismatch. Nothing was installed.' }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        if ($zip.Entries.Count -eq 0) { throw 'The archive is empty.' }
        foreach ($entry in $zip.Entries) {
            $relative = $entry.FullName.Replace('\', '/')
            if (-not $relative.StartsWith("$name/", [StringComparison]::Ordinal) -or $relative -match '(^|/)\.\.?(/|$)|:') { throw 'Unexpected archive paths.' }
            $kind = ($entry.ExternalAttributes -shr 16) -band 0xF000
            if ($kind -notin @(0, 0x8000, 0x4000)) { throw 'Archive contains unsupported links or file types.' }
        }
    } finally { $zip.Dispose() }
    $unpacked = Join-Path $stage 'unpacked'
    Expand-Archive -LiteralPath $zipPath -DestinationPath $unpacked
    $source = Join-Path $unpacked $name
    if (-not (Test-Path -LiteralPath (Join-Path $source 'nudgethis.exe') -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $source 'LICENSE') -PathType Leaf)) { throw 'Archive is missing the executable or license.' }
    $versions = Join-Path $InstallDir 'versions'
    if ((Test-Path -LiteralPath $versions) -and ((Get-Item -LiteralPath $versions).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The versions folder must not be a link.' }
    [void][IO.Directory]::CreateDirectory($versions)
    $destination = Join-Path $versions $Version
    $receipt = Join-Path $destination '.archive-sha256'
    if (Test-Path -LiteralPath $destination) {
        if (((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not (Test-Path -LiteralPath $receipt) -or [IO.File]::ReadAllText($receipt).Trim() -ne $expected -or -not (Test-Path -LiteralPath (Join-Path $destination 'nudgethis.exe') -PathType Leaf)) { throw 'An unrecognized installation already exists at this version; it was preserved.' }
    } else {
        [IO.File]::WriteAllText((Join-Path $source '.archive-sha256'), $expected)
        Move-Item -LiteralPath $source -Destination $destination
    }
    $bin = Join-Path $InstallDir 'bin'
    if ((Test-Path -LiteralPath $bin) -and ((Get-Item -LiteralPath $bin).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The bin folder must not be a link.' }
    [void][IO.Directory]::CreateDirectory($bin)
    $launcher = Join-Path $bin 'nudgethis.cmd'
    $marker = '@rem NudgeThis managed launcher'
    if ((Test-Path -LiteralPath $launcher) -and (-not [IO.File]::ReadAllText($launcher).StartsWith($marker))) { throw 'An unrelated nudgethis.cmd already exists; it was preserved.' }
    $next = Join-Path $stage 'nudgethis.cmd'
    [IO.File]::WriteAllText($next, "$marker`r`n@echo off`r`n@`"%~dp0..\versions\$Version\nudgethis.exe`" %*`r`n@exit /b %errorlevel%`r`n", [Text.Encoding]::ASCII)
    Move-Item -LiteralPath $next -Destination $launcher -Force
    if ($AddToPath) {
        $userPath = [string][Environment]::GetEnvironmentVariable('Path', 'User')
        if (($userPath -split ';') -notcontains $bin) { [Environment]::SetEnvironmentVariable('Path', (($userPath.TrimEnd(';') + ';' + $bin).TrimStart(';')), 'User') }
        if (($env:Path -split ';') -notcontains $bin) { $env:Path += ';' + $bin }
    }
    Write-Host "Installed NudgeThis $Version in $destination"
    if ($AddToPath) { Write-Host 'Open a new terminal and run: nudgethis --help' }
    else { Write-Host "Run: & '$launcher' --help"; Write-Host "Optional PATH directory: $bin" }
    Write-Host 'No agent, project command or application was started. Previous versions remain available.'
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    if ($null -ne $lock) { $lock.Dispose() }
}
