import { mkdir, copyFile, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version)) throw new Error('Invalid release version');
const platforms = { linux: 'linux', darwin: 'macos', win32: 'windows' };
const platform = platforms[process.platform];
if (!platform || !['x64', 'arm64'].includes(process.arch)) throw new Error('Unsupported release platform');
const name = `nudgethis-${version}-${platform}-${process.arch}`, binary = `nudgethis${process.platform === 'win32' ? '.exe' : ''}`;
const directory = path.resolve('dist/release'), stage = path.join(directory, name);
await mkdir(stage, { recursive: true });
await copyFile(path.resolve('target/release', binary), path.join(stage, binary));
if (process.platform !== 'win32') await chmod(path.join(stage, binary), 0o755);
const launcherBinary = `nudgethis-launcher${process.platform === 'win32' ? '.exe' : ''}`;
let launcher = path.join(stage, process.platform === 'win32' ? 'Open NudgeThis.exe' : 'Open NudgeThis');
if (process.platform === 'darwin') {
  const contents = path.join(stage, 'NudgeThis.app', 'Contents');
  await mkdir(path.join(contents, 'MacOS'), { recursive: true });
  await mkdir(path.join(contents, 'Resources'), { recursive: true });
  await copyFile(path.join(stage, binary), path.join(contents, 'MacOS', binary));
  await chmod(path.join(contents, 'MacOS', binary), 0o755);
  launcher = path.join(contents, 'MacOS', 'Open NudgeThis');
  const releaseVersion = version.split('-')[0];
  await writeFile(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>NudgeThis</string><key>CFBundleDisplayName</key><string>NudgeThis</string><key>CFBundleIdentifier</key><string>click.nudgethis.welcome</string><key>CFBundleExecutable</key><string>Open NudgeThis</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${releaseVersion}</string><key>CFBundleVersion</key><string>${releaseVersion}</string><key>CFBundleIconFile</key><string>NudgeThis</string><key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/></dict></plist>\n`);
  const iconset = path.join(directory, 'NudgeThis.iconset'); await mkdir(iconset, { recursive: true });
  const svg = await readFile('assets/brand/nudgethis-icon.svg', 'utf8');
  for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size * scale } }).render().asPng();
    await writeFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), png);
  }
  const icon = spawnSync('iconutil', ['--convert', 'icns', '--output', path.join(contents, 'Resources', 'NudgeThis.icns'), iconset], { encoding: 'utf8' });
  if (icon.status !== 0) throw new Error(icon.stderr || 'Could not build macOS icon');
  await rm(iconset, { recursive: true });
  // Retain a terminal entry point without duplicating the embedded server in the archive.
  await writeFile(path.join(stage, binary), '#!/bin/sh\nexec "$(dirname "$0")/NudgeThis.app/Contents/MacOS/nudgethis" "$@"\n');
}
await copyFile(path.resolve('target/release', launcherBinary), launcher);
if (process.platform !== 'win32') await chmod(launcher, 0o755);
for (const executable of [path.join(stage, binary), launcher]) {
  const smoke = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 15000 });
  if (smoke.status !== 0 || !smoke.stdout.includes(version)) throw new Error(`Packaged executable version check failed: ${path.basename(executable)}`);
}
await copyFile('LICENSE', path.join(stage, 'LICENSE'));
await copyFile('docs/install.md', path.join(stage, 'INSTALL.md'));
await writeFile(path.join(stage, 'build.json'), JSON.stringify({ product: 'NudgeThis', version, platform, architecture: process.arch, commit: process.env.GITHUB_SHA || null, signed: false, launcher: process.platform === 'darwin' ? 'NudgeThis.app' : path.basename(launcher) }, null, 2) + '\n');
const archive = `${name}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
let result;
if (process.platform === 'win32') {
  // Only fixed, generated directory names enter PowerShell; paths use literal arguments.
  result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -LiteralPath '${name}' -DestinationPath '${archive}' -Force`], { cwd: directory, encoding: 'utf8' });
} else {
  result = spawnSync('tar', ['-czf', archive, name], { cwd: directory, encoding: 'utf8' });
}
if (result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Packaging failed');
const checksum = createHash('sha256').update(await readFile(path.join(directory, archive))).digest('hex');
await writeFile(path.join(directory, `${archive}.sha256`), `${checksum}  ${archive}\n`);
await rm(stage, { recursive: true });
console.log(`Created ${archive} and SHA-256 checksum.`);
