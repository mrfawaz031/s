#!/usr/bin/env bash
# wer9loc launcher for macOS / Linux.
# First run sets up the environment, then opens the interactive menu.
# Pass arguments to use the CLI directly, e.g.:  ./run.sh set --lat .. --lng ..
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [ ! -x ".venv/bin/python" ]; then
  echo "First-time setup…"
  bash "$HERE/setup.sh"
fi

exec ".venv/bin/python" "$HERE/wer9loc.py" "$@"
