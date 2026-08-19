#!/usr/bin/env bash
#
# build-safari.sh — convert the wer9store web extension into a Safari
# Web Extension Xcode project (for iOS/iPadOS and macOS).
#
# Requires a Mac with Xcode command line tools installed.
# See ios/BUILD-SAFARI-iOS.md for the full walkthrough.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
OUT="$ROOT/ios/build"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "error: 'xcrun' not found. Run this on macOS with Xcode installed." >&2
  exit 1
fi

mkdir -p "$OUT"

echo "Converting $SRC -> $OUT ..."
xcrun safari-web-extension-converter "$SRC" \
  --project-location "$OUT" \
  --app-name "wer9store" \
  --bundle-identifier "com.wer9store.locator" \
  --no-open

echo
echo "Done. Open the generated project:"
echo "  open \"$OUT/wer9store/wer9store.xcodeproj\""
echo "Then follow ios/BUILD-SAFARI-iOS.md (signing, run on device, enable in Safari)."
