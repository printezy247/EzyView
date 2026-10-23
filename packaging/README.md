# Debian packaging inputs

These files are copied into the `.deb` by `apps/desktop/src-tauri/tauri.conf.json`
under `bundle.linux.deb.files`.

| File | Destination |
|---|---|
| `copyright` (DEP-5) | `/usr/share/doc/ezy-view/copyright` |
| `changelog.gz` | `/usr/share/doc/ezy-view/changelog.gz` |
| `ezyview.1.gz` | `/usr/share/man/man1/ezyview.1.gz` |
| `ezyview-mt5-bridge` | `/usr/bin/ezyview-mt5-bridge` |
| `ezyview-mt5-bridge.1.gz` | `/usr/share/man/man1/ezyview-mt5-bridge.1.gz` |
| `../tools/mt5-bridge/README.md` | `/usr/share/doc/ezy-view/mt5-bridge.md` |
| `../tools/mt5-bridge/bridge.py` | `/usr/lib/EzyView/mt5-bridge/` (Tauri resource) |
| `com.printezy247.ezyview.metainfo.xml` | `/usr/share/metainfo/` |
| `EzyView.desktop.hbs` | rendered desktop entry (via `desktopTemplate`) |

The Debian changelog and the manual page are committed compressed because
Tauri copies files verbatim and lintian requires both `.gz` names. After
editing `changelog` or `ezyview.1`, regenerate the copies deterministically:

```bash
gzip -9 -n -c packaging/changelog > packaging/changelog.gz
gzip -9 -n -c packaging/ezyview.1 > packaging/ezyview.1.gz
gzip -9 -n -c packaging/ezyview-mt5-bridge.1 > packaging/ezyview-mt5-bridge.1.gz
```

`scripts/check-deb.sh` runs `lintian --fail-on error`, checks the required
copyright and man-page files, validates the desktop entry and AppStream data,
and is called by both the desktop CI job and the release workflow.
`scripts/smoke-deb.sh` installs the package and proves the binary starts.

Bump the version in all four declarations together (`npm run check:versions`
enforces it) and add both a `changelog` entry and an AppStream `<release>`.
The declared glibc floor (`libc6 (>= 2.39)`) matches the Ubuntu 24.04 / Mint 22
build host; change both together if the build baseline moves.

Release process: [`docs/RELEASING.md`](../docs/RELEASING.md).
