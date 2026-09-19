#!/bin/sh
# Published by build-site.js with the matching release version. No sudo or shell-profile edits.
set -eu
version='@VERSION@'
prefix="${XDG_DATA_HOME:-${HOME:?HOME is required}/.local/share}/nudgethis"
fail() { printf 'NudgeThis: %s\n' "$*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) [ "$#" -ge 2 ] || fail 'Missing --version value'; version=${2#v}; shift 2 ;;
    --install-dir) [ "$#" -ge 2 ] || fail 'Missing --install-dir value'; prefix=$2; shift 2 ;;
    --help|-h) printf '%s\n' 'Usage: sh install.sh [--version VERSION] [--install-dir /absolute/folder]' 'Installs a verified release for your user. Does not start NudgeThis or edit PATH.'; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9]+(\.[a-z0-9]+)*)?$' || fail 'Invalid version. Use the published installer or supply --version.'
case "$prefix" in /*) ;; *) fail '--install-dir must be absolute' ;; esac
case "$prefix" in *'
'*) fail 'Installation paths cannot contain newlines' ;; esac
case "$(uname -s):$(uname -m)" in
  Linux:x86_64) platform=linux-x64 ;;
  Darwin:arm64) platform=macos-arm64 ;;
  Darwin:x86_64) platform=macos-x64 ;;
  *) fail 'No native archive for this platform. Use a supported release or build from source.' ;;
esac
for tool in curl tar awk; do command -v "$tool" >/dev/null 2>&1 || fail "Install $tool first"; done
if command -v sha256sum >/dev/null 2>&1; then hash_tool=sha256sum
elif command -v shasum >/dev/null 2>&1; then hash_tool=shasum
else fail 'Install sha256sum or shasum first'; fi

mkdir -p "$prefix"
lock="$prefix/.install-lock"
mkdir "$lock" 2>/dev/null || fail 'Another installation may be running. If it stopped unexpectedly, remove .install-lock from the installation folder after checking.'
stage=''
cleanup() { [ -z "$stage" ] || rm -rf "$stage"; rmdir "$lock" 2>/dev/null || :; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stage=$(mktemp -d "$prefix/.install.XXXXXXXX")
name="nudgethis-$version-$platform"
archive="$name.tar.gz"
base="https://github.com/gerardoyxy/nudgethis/releases/download/v$version"
printf 'Downloading NudgeThis %s (%s)…\n' "$version" "$platform"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 180 "$base/$archive" -o "$stage/$archive"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 60 "$base/$archive.sha256" -o "$stage/checksum"
expected=$(awk -v file="$archive" 'NF == 2 && $2 == file {print $1}' "$stage/checksum")
printf '%s\n' "$expected" | grep -Eq '^[a-f0-9]{64}$' || fail 'Invalid release checksum'
if [ "$hash_tool" = sha256sum ]; then actual=$(sha256sum "$stage/$archive" | awk '{print $1}')
else actual=$(shasum -a 256 "$stage/$archive" | awk '{print $1}'); fi
[ "$actual" = "$expected" ] || fail 'Checksum mismatch. Nothing was installed.'

# Official archives contain only regular files and directories under one release folder.
tar -tzf "$stage/$archive" > "$stage/entries"
awk -v root="$name" 'index($0, root "/") != 1 || $0 ~ /(^|\/)\.\.?($|\/)/ {bad=1} END {exit bad || NR == 0}' "$stage/entries" || fail 'Unexpected archive paths'
tar -tvzf "$stage/$archive" > "$stage/types"
awk 'substr($0,1,1) != "-" && substr($0,1,1) != "d" {bad=1} END {exit bad}' "$stage/types" || fail 'Archive contains unsupported links or file types'
mkdir "$stage/unpacked"
tar -xzf "$stage/$archive" -C "$stage/unpacked"
[ -f "$stage/unpacked/$name/nudgethis" ] && [ -x "$stage/unpacked/$name/nudgethis" ] || fail 'Archive is missing the executable'
[ -f "$stage/unpacked/$name/LICENSE" ] || fail 'Archive is missing its license'
case "$platform" in macos-*) [ -x "$stage/unpacked/$name/NudgeThis.app/Contents/MacOS/nudgethis" ] || fail 'Archive is missing the macOS application';; esac
[ ! -L "$prefix/versions" ] || fail 'The versions folder must not be a symbolic link'
mkdir -p "$prefix/versions"
destination="$prefix/versions/$version"
if [ -e "$destination" ] || [ -L "$destination" ]; then
  [ ! -L "$destination" ] && [ -f "$destination/.archive-sha256" ] && [ "$(cat "$destination/.archive-sha256")" = "$expected" ] && [ -x "$destination/nudgethis" ] || fail 'An unrecognized installation already exists at this version; it was preserved.'
else
  printf '%s\n' "$expected" > "$stage/unpacked/$name/.archive-sha256"
  mv "$stage/unpacked/$name" "$destination"
fi
if [ -L "$prefix/current" ]; then
  previous=$(readlink "$prefix/current")
  case "$previous" in versions/*) ;; *) fail 'The current link is not managed by NudgeThis; it was preserved.' ;; esac
elif [ -e "$prefix/current" ]; then fail 'The current path already exists and is not a managed link; it was preserved.'
fi
ln -sfn "versions/$version" "$prefix/current"
printf '\nInstalled NudgeThis %s in %s\n' "$version" "$destination"
printf 'Run: "%s/current/nudgethis" --help\n' "$prefix"
printf 'Add this directory to your PATH: %s/current\n' "$prefix"
printf '%s\n' 'No agent, project command or application was started. Previous versions remain available.'
