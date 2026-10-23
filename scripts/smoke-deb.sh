#!/usr/bin/env bash
# Install the built .deb and prove the packaged binary starts and stays up.
#
# A bundle that exists is not a bundle that runs: this catches a missing
# runtime library, a bad Exec line or an immediate startup panic. The app is
# expected to keep running until the timeout kills it, which exits 124.
#
# Usage: scripts/smoke-deb.sh <path/to/EzyView_*.deb>
set -euo pipefail

deb=${1:?usage: scripts/smoke-deb.sh path/to/EzyView_*.deb}
[[ -f "$deb" ]] || { echo "No such file: $deb" >&2; exit 1; }

sudo dpkg -i "$deb" || sudo apt-get -f install -y

# Keep the smoke run away from the runner's real profile.
XDG_DATA_HOME=$(mktemp -d)
XDG_CONFIG_HOME=$(mktemp -d)
XDG_CACHE_HOME=$(mktemp -d)
export XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
log=$(mktemp)
trap 'rm -rf "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$log"' EXIT

set +e
timeout 15s xvfb-run -a ezyview >"$log" 2>&1
code=$?
set -e

if [[ $code -ne 124 ]]; then
  echo "ezyview exited with status $code instead of staying up:" >&2
  tail -50 "$log" >&2
  exit 1
fi
if grep -qiE 'panicked at|Gtk-ERROR|Failed to load module|cannot open shared object' "$log"; then
  echo "ezyview logged a startup failure:" >&2
  tail -50 "$log" >&2
  exit 1
fi

echo "Installed package launched and stayed up for 15s."
