#!/usr/bin/env bash
# Policy gate for the built .deb. Requires lintian, desktop-file-utils and
# appstream (installed by the CI desktop job and the release workflow).
#
# Usage: scripts/check-deb.sh [path/to/EzyView_*.deb]
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
deb=${1:-}
if [[ -z "$deb" ]]; then
  deb=$(find "$repo_root/apps/desktop/src-tauri/target/release/bundle/deb" -name 'EzyView_*.deb' | sort | tail -1)
fi
if [[ -z "$deb" || ! -f "$deb" ]]; then
  echo "No .deb found (looked in the Tauri bundle directory)." >&2
  exit 1
fi

echo "Checking $deb"
lintian --fail-on error "$deb"
dpkg-deb -I "$deb"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# List once to a file: grep -q closes the pipe early, which makes dpkg-deb's
# tar fail with SIGPIPE under `set -o pipefail`.
dpkg-deb -c "$deb" > "$work/contents.txt"
grep -q 'usr/share/doc/ezy-view/copyright' "$work/contents.txt"
grep -q 'usr/share/man/man1/ezyview.1.gz' "$work/contents.txt"
grep -q 'usr/bin/ezyview-mt5-bridge' "$work/contents.txt"
grep -q 'usr/lib/EzyView/mt5-bridge/bridge.py' "$work/contents.txt"
dpkg-deb -x "$deb" "$work/root"

desktop-file-validate "$work/root/usr/share/applications/EzyView.desktop"
appstreamcli validate --no-net "$work/root/usr/share/metainfo/com.printezy247.ezyview.metainfo.xml"

echo "Package checks passed."
