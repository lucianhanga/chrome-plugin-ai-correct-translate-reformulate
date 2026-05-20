#!/usr/bin/env bash
# scripts/package.sh
# Builds the extension and packages dist/ into a distributable zip.
# The zip root contains manifest.json directly, making it loadable via
# "Load unpacked" in Chrome or uploadable to the Chrome Web Store.
#
# Colors: green = success, red = failure, yellow = warning.
# No emoticons.

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MANIFEST="${PROJECT_DIR}/public/manifest.json"
DIST_DIR="${PROJECT_DIR}/dist"

# ---------------------------------------------------------------------------
# Read the version from public/manifest.json
# ---------------------------------------------------------------------------

if [ ! -f "${MANIFEST}" ]; then
  printf "${RED}ERROR: manifest.json not found at %s${RESET}\n" "${MANIFEST}" >&2
  exit 1
fi

VERSION="$(grep '"version"' "${MANIFEST}" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
if [ -z "${VERSION}" ]; then
  printf "${RED}ERROR: Could not read version from manifest.json${RESET}\n" >&2
  exit 1
fi

ZIP_NAME="correct-and-translate-${VERSION}.zip"
ZIP_PATH="${PROJECT_DIR}/${ZIP_NAME}"

printf "${YELLOW}Building extension (version %s)...${RESET}\n" "${VERSION}"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

cd "${PROJECT_DIR}"
if ! pnpm build; then
  printf "${RED}ERROR: Build failed.${RESET}\n" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Sanity check: dist/ must contain manifest.json after the build
# ---------------------------------------------------------------------------

if [ ! -f "${DIST_DIR}/manifest.json" ]; then
  printf "${RED}ERROR: dist/manifest.json not found after build. Check your Vite config.${RESET}\n" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Remove any existing zip for this version before creating a fresh one
# ---------------------------------------------------------------------------

if [ -f "${ZIP_PATH}" ]; then
  printf "${YELLOW}Removing existing %s${RESET}\n" "${ZIP_NAME}"
  rm "${ZIP_PATH}"
fi

# ---------------------------------------------------------------------------
# Zip the CONTENTS of dist/ so manifest.json is at the archive root
# ---------------------------------------------------------------------------

printf "${YELLOW}Creating %s...${RESET}\n" "${ZIP_NAME}"

cd "${DIST_DIR}"
zip -r "${ZIP_PATH}" . --quiet

printf "${GREEN}Package created: %s${RESET}\n" "${ZIP_PATH}"
printf "${GREEN}Done.${RESET}\n"
