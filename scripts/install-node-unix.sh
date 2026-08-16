#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
RUNTIME_ROOT="$PROJECT_ROOT/.runtime"
INSTALL_DIRECTORY="$RUNTIME_ROOT/node"

case $(uname -s) in
  Darwin) PLATFORM=darwin ;;
  Linux) PLATFORM=linux ;;
  *)
    printf 'Unsupported operating system: %s\n' "$(uname -s)" >&2
    exit 1
    ;;
esac

case $(uname -m) in
  x86_64|amd64) ARCHITECTURE=x64 ;;
  arm64|aarch64) ARCHITECTURE=arm64 ;;
  armv7l) ARCHITECTURE=armv7l ;;
  *)
    printf 'Unsupported architecture: %s\n' "$(uname -m)" >&2
    exit 1
    ;;
esac

if ! command -v tar >/dev/null 2>&1; then
  printf '%s\n' 'tar is required to install Node.js.' >&2
  exit 1
fi

download() {
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error "$1" --output "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet "$1" --output-document="$2"
  else
    printf '%s\n' 'curl or wget is required to install Node.js.' >&2
    return 1
  fi
}

calculate_hash() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    printf '%s\n' 'shasum or sha256sum is required to verify Node.js.' >&2
    return 1
  fi
}

mkdir -p "$RUNTIME_ROOT"
WORK_DIRECTORY=$(mktemp -d "$RUNTIME_ROOT/.install-XXXXXX")
STAGED_DIRECTORY="$WORK_DIRECTORY/node-new"

cleanup() {
  rm -rf -- "$WORK_DIRECTORY"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

CHECKSUM_FILE="$WORK_DIRECTORY/SHASUMS256.txt"
download 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' "$CHECKSUM_FILE"

ARCHIVE_NAME=$(awk -v suffix="-$PLATFORM-$ARCHITECTURE.tar.gz" \
  '$2 ~ /^node-v22\./ && substr($2, length($2) - length(suffix) + 1) == suffix { print $2; exit }' \
  "$CHECKSUM_FILE")
if [ -z "$ARCHIVE_NAME" ]; then
  printf 'No compatible Node.js 22 archive was found for %s %s.\n' "$PLATFORM" "$ARCHITECTURE" >&2
  exit 1
fi

VERSION=${ARCHIVE_NAME#node-}
VERSION=${VERSION%-$PLATFORM-$ARCHITECTURE.tar.gz}
MINOR_VERSION=$(printf '%s\n' "$VERSION" | awk -F. '{ print $2 }')
if [ -z "$MINOR_VERSION" ] || [ "$MINOR_VERSION" -lt 13 ]; then
  printf 'The Node.js release is below the required version: %s\n' "$VERSION" >&2
  exit 1
fi

ARCHIVE_PATH="$WORK_DIRECTORY/$ARCHIVE_NAME"
printf 'Downloading Node.js %s for %s %s...\n' "$VERSION" "$PLATFORM" "$ARCHITECTURE"
download "https://nodejs.org/dist/latest-v22.x/$ARCHIVE_NAME" "$ARCHIVE_PATH"

EXPECTED_HASH=$(awk -v name="$ARCHIVE_NAME" '$2 == name { print $1; exit }' "$CHECKSUM_FILE")
ACTUAL_HASH=$(calculate_hash "$ARCHIVE_PATH")
if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
  printf '%s\n' 'The Node.js download failed its SHA-256 integrity check.' >&2
  exit 1
fi

mkdir -p "$WORK_DIRECTORY/extracted"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIRECTORY/extracted"
EXTRACTED_DIRECTORY="$WORK_DIRECTORY/extracted/node-$VERSION-$PLATFORM-$ARCHITECTURE"
if [ ! -x "$EXTRACTED_DIRECTORY/bin/node" ]; then
  printf '%s\n' 'The downloaded Node.js archive had an unexpected layout.' >&2
  exit 1
fi

mv "$EXTRACTED_DIRECTORY" "$STAGED_DIRECTORY"
rm -rf -- "$INSTALL_DIRECTORY"
mv "$STAGED_DIRECTORY" "$INSTALL_DIRECTORY"
printf 'Node.js %s installed in %s\n' "$VERSION" "$INSTALL_DIRECTORY"
