#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -x "$SCRIPT_DIR/.runtime/node/bin/node" ]; then
  PATH="$SCRIPT_DIR/.runtime/node/bin:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1 ||
   ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
  printf '%s\n' \
    'Magic Conch requires Node.js 22.13 or newer.' \
    'Run: sh install.sh' >&2
  exit 1
fi

exec node "$SCRIPT_DIR/scripts/launch.mjs" "$@"
