#!/usr/bin/env bash
# Build the Folia detail page for Any Listen Plus.
#
#   ./build.sh            -> fetch Folia Major source, apply folia-src.patch, npm ci, vite build -> ./dist
#
# Env:
#   FOLIA_REPO   upstream repo     (default https://github.com/chthollyphile/folia-major.git)
#   FOLIA_COMMIT pinned commit     (default 7701347918a4177c1c57b538d7556db9606be67a, Folia Major v0.7.19)
#   SKIP_INSTALL=1                 skip npm ci (reuse existing node_modules)
#   SRC_ONLY=1                     only prepare ./folia-src, do not install/build
set -euo pipefail
cd "$(dirname "$0")"

FOLIA_REPO=${FOLIA_REPO:-https://github.com/chthollyphile/folia-major.git}
FOLIA_COMMIT=${FOLIA_COMMIT:-7701347918a4177c1c57b538d7556db9606be67a}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "==> fetching $FOLIA_REPO @ $FOLIA_COMMIT"
git init -q "$TMP/folia-major"
git -C "$TMP/folia-major" remote add origin "$FOLIA_REPO"
if ! git -C "$TMP/folia-major" fetch -q --depth 1 origin "$FOLIA_COMMIT" 2>/dev/null; then
  # some hosts refuse fetching a bare sha: fall back to a full clone
  rm -rf "$TMP/folia-major"
  git clone -q "$FOLIA_REPO" "$TMP/folia-major"
fi
git -C "$TMP/folia-major" -c advice.detachedHead=false checkout -q "$FOLIA_COMMIT" 2>/dev/null \
  || git -C "$TMP/folia-major" -c advice.detachedHead=false checkout -q FETCH_HEAD
[ "$(git -C "$TMP/folia-major" rev-parse HEAD)" = "$FOLIA_COMMIT" ] || { echo "commit mismatch" >&2; exit 1; }

echo "==> preparing ./folia-src"
git -C "$TMP/folia-major" apply --directory=src "$PWD/folia-src.patch"
echo "    applied folia-src.patch"
rm -rf folia-src
cp -r "$TMP/folia-major/src" folia-src

[ "${SRC_ONLY:-0}" = 1 ] && { echo "SRC_ONLY=1, done"; exit 0; }

if [ "${SKIP_INSTALL:-0}" != 1 ]; then
  echo "==> npm ci"
  npm ci --no-audit --no-fund
fi

echo "==> vite build"
npx vite build
rm -f dist/*.map dist/chunks/*.map
cp LICENSE dist/LICENSE
echo "==> done: ./dist (entry dist/folia-player.js). Deploy it as <web dir>/folia/ so it is served at /__m/folia/."
