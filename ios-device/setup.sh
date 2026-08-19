#!/usr/bin/env bash
# One-time setup for wer9loc (device-wide iOS location controller).
# Creates a local Python venv and installs pymobiledevice3.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required." >&2; exit 1
fi

echo "• Creating virtual environment (.venv)…"
python3 -m venv "$HERE/.venv"
echo "• Installing dependencies…"
"$HERE/.venv/bin/pip" install --upgrade pip >/dev/null
"$HERE/.venv/bin/pip" install --prefer-binary -r "$HERE/requirements.txt"

echo
echo "✓ Done. Use it with:"
echo "    \"$HERE/.venv/bin/python\" \"$HERE/wer9loc.py\" status"
echo
echo "Linux note: also install the usb daemon:  sudo apt install usbmuxd"
echo "Windows note: install Apple Mobile Device Support (comes with iTunes)."
