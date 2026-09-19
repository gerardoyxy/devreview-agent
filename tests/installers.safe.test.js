import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, access, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const windows = process.platform === 'win32';
const platform = windows ? 'windows-x64' : process.platform === 'darwin' ? `macos-${process.arch}` : 'linux-x64';
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', timeout: 45000, ...options });

test('terminal installers verify downloads, preserve existing installs and support version changes without executing the app', { timeout: 240000 }, async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'nudgethis-install-test-'));
  t.after(() => rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const fixtures = path.join(folder, 'downloads'), mock = path.join(folder, 'tools');
  await mkdir(fixtures); await mkdir(mock);
  const scriptName = windows ? 'install.ps1' : 'install.sh';
  const installer = path.join(folder, scriptName);
  const source = (await readFile(path.join(root, 'scripts', scriptName), 'utf8')).replaceAll('@VERSION@', version);
  await writeFile(installer, source);
  try { assert.equal(await readFile(path.join(root, 'dist/site', scriptName), 'utf8'), source, 'Published installer matches the release template'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = { ...process.env, NUDGETHIS_DISABLE_EXECUTION: '1', NUDGETHIS_INSTALL_FIXTURES: fixtures };
  let wrapper;
  if (windows) {
    wrapper = path.join(folder, 'run-installer.ps1');
    await writeFile(wrapper, `
$ErrorActionPreference = 'Stop'
function Invoke-WebRequest {
  param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing, [int]$TimeoutSec)
  if (-not $Uri.StartsWith('https://github.com/gerardoyxy/nudgethis/releases/download/v')) { throw 'Unexpected download URL' }
  Copy-Item -LiteralPath (Join-Path $env:NUDGETHIS_INSTALL_FIXTURES ([Uri]$Uri).Segments[-1]) -Destination $OutFile
}
& $env:NUDGETHIS_INSTALL_SCRIPT -Version $env:NUDGETHIS_INSTALL_VERSION -InstallDir $env:NUDGETHIS_INSTALL_DESTINATION
`);
  } else {
    await writeFile(path.join(mock, 'curl'), `#!/bin/sh
set -eu
url=''; output=''
while [ "$#" -gt 0 ]; do
 case "$1" in
  -o) output=$2; shift 2 ;;
  https://github.com/gerardoyxy/nudgethis/releases/download/v*) url=$1; shift ;;
  *) shift ;;
 esac
done
[ -n "$url" ] && [ -n "$output" ]
cp "$NUDGETHIS_INSTALL_FIXTURES/$(basename "$url")" "$output"
`);
    await chmod(path.join(mock, 'curl'), 0o755);
    env.PATH = mock + path.delimiter + env.PATH;
  }
  async function fixture(release, { corrupt = false, wrongRoot = false } = {}) {
    const name = `nudgethis-${release}-${platform}`, actualName = wrongRoot ? 'unexpected-root' : name;
    const source = path.join(folder, 'source-' + release), contents = path.join(source, actualName);
    await mkdir(contents, { recursive: true });
    // Inert application files: installers must never execute a download during installation.
    await writeFile(path.join(contents, windows ? 'nudgethis.exe' : 'nudgethis'), '#!/bin/sh\nexit 97\n', { mode: 0o755 });
    await writeFile(path.join(contents, 'LICENSE'), 'Installer test archive\n');
    if (platform.startsWith('macos')) {
      const bundle = path.join(contents, 'NudgeThis.app/Contents/MacOS');
      await mkdir(bundle, { recursive: true });
      await writeFile(path.join(bundle, 'nudgethis'), '#!/bin/sh\nexit 97\n', { mode: 0o755 });
    }
    const filename = `${name}.${windows ? 'zip' : 'tar.gz'}`, archive = path.join(fixtures, filename);
    if (windows) {
      const prepare = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:NUDGETHIS_ZIP_SOURCE, $env:NUDGETHIS_ZIP_TARGET)'], { env: { ...env, NUDGETHIS_ZIP_SOURCE: source, NUDGETHIS_ZIP_TARGET: archive } });
      assert.equal(prepare.status, 0, prepare.stderr);
    } else {
      const prepare = run('tar', ['-czf', archive, '-C', source, actualName]);
      assert.equal(prepare.status, 0, prepare.stderr);
    }
    const sum = corrupt ? '0'.repeat(64) : createHash('sha256').update(await readFile(archive)).digest('hex');
    await writeFile(archive + '.sha256', `${sum}  ${filename}\n`);
  }
  function install(release, destination) {
    return windows
      ? run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper], { env: { ...env, NUDGETHIS_INSTALL_SCRIPT: installer, NUDGETHIS_INSTALL_VERSION: release, NUDGETHIS_INSTALL_DESTINATION: destination } })
      : run('sh', [installer, '--version', release, '--install-dir', destination], { env });
  }
  async function selected(destination) {
    return windows ? readFile(path.join(destination, 'bin/nudgethis.cmd'), 'utf8') : readlink(path.join(destination, 'current'));
  }
  const destination = path.join(folder, 'user installation');
  await fixture(version);
  let result = install(version, destination);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const original = await selected(destination);
  assert(original.includes(version));
  assert.equal(install(version, destination).status, 0, 'Reinstalling the same verified version is idempotent');
  assert.equal(await selected(destination), original);

  const next = '9.9.9-alpha.1'; await fixture(next);
  result = install(next, destination); assert.equal(result.status, 0, result.stderr || result.stdout);
  assert((await selected(destination)).includes(next));
  await access(path.join(destination, 'versions', version));
  assert.equal(install(version, destination).status, 0, 'An earlier installed version can be selected');
  assert.equal(await selected(destination), original);

  const bad = '9.9.8-alpha.1'; await fixture(bad, { corrupt: true });
  result = install(bad, destination); assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Checksum mismatch/);
  await assert.rejects(access(path.join(destination, 'versions', bad)));
  assert.equal(await selected(destination), original, 'Checksum failure preserves the selected version');
  assert.notEqual(install('9.9.7-alpha.1', destination).status, 0, 'A failed download fails installation');
  assert.equal(await selected(destination), original);

  const malformed = '9.9.6-alpha.1'; await fixture(malformed, { wrongRoot: true });
  result = install(malformed, destination); assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Unexpected archive paths/);
  assert.equal(await selected(destination), original);
  result = install('../outside', destination); assert.notEqual(result.status, 0);

  const occupied = path.join(folder, 'occupied');
  await mkdir(path.join(occupied, 'versions', version), { recursive: true });
  await writeFile(path.join(occupied, 'versions', version, 'keep.txt'), 'Existing files');
  result = install(version, occupied); assert.notEqual(result.status, 0);
  assert.equal(await readFile(path.join(occupied, 'versions', version, 'keep.txt'), 'utf8'), 'Existing files');
  const collision = path.join(folder, 'command collision');
  await mkdir(windows ? path.join(collision, 'bin') : collision, { recursive: true });
  const existingCommand = path.join(collision, windows ? 'bin/nudgethis.cmd' : 'current');
  await writeFile(existingCommand, 'Existing command');
  assert.notEqual(install(version, collision).status, 0);
  assert.equal(await readFile(existingCommand, 'utf8'), 'Existing command');
});
