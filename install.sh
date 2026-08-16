#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' \
    'Magic Conch requires Node.js 22.13 or newer.' \
    'Download it from https://nodejs.org/ and run this installer again.' >&2
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
  printf 'Magic Conch requires Node.js 22.13 or newer. Found: %s\n' "$(node --version)" >&2
  printf '%s\n' 'Download a supported version from https://nodejs.org/ and run this installer again.' >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'npm was not found. Reinstall Node.js with npm included, then run this installer again.' >&2
  exit 1
fi

printf '%s\n' 'Installing Magic Conch dependencies...'
npm ci

printf '\n%s\n' \
  'Magic Conch is installed.' \
  'Launch it with sh "Launch Magic Conch.sh" or run: npm run launch'
