import { mkdir, copyFile, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version)) throw new Error('Invalid release version');
const platforms = { linux: 'linux', darwin: 'macos', win32: 'windows' };
const platform = platforms[process.platform];
if (!platform || !['x64', 'arm64'].includes(process.arch)) throw new Error('Unsupported release platform');
const name = `nudgethis-${version}-${platform}-${process.arch}`, binary = `devreview${process.platform === 'win32' ? '.exe' : ''}`;
const directory = path.resolve('dist/release'), stage = path.join(directory, name);
await mkdir(stage, { recursive: true });
await copyFile(path.resolve('target/release', binary), path.join(stage, binary));
if (process.platform !== 'win32') await chmod(path.join(stage, binary), 0o755);
await copyFile('LICENSE', path.join(stage, 'LICENSE'));
await copyFile('docs/install.md', path.join(stage, 'INSTALL.md'));
await writeFile(path.join(stage, 'build.json'), JSON.stringify({ product: 'NudgeThis', version, platform, architecture: process.arch, commit: process.env.GITHUB_SHA || null, signed: false }, null, 2) + '\n');
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
