#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MAGIC_CONCH_REPOSITORY=https://github.com/seraujeu/Magic-Conch.git \
MAGIC_CONCH_BRANCH=main \
  exec node "$SCRIPT_DIR/scripts/update-from-github.mjs" "$@"
