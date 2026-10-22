# Debian packaging inputs

These files are copied into the `.deb` by `apps/desktop/src-tauri/tauri.conf.json`
under `bundle.linux.deb.files`.

| File | Destination |
|---|---|
| `copyright` (DEP-5) | `/usr/share/doc/ezy-view/copyright` |
| `changelog.gz` | `/usr/share/doc/ezy-view/changelog.gz` |
| `ezyview.1.gz` | `/usr/share/man/man1/ezyview.1.gz` |
| `com.printezy247.ezyview.metainfo.xml` | `/usr/share/metainfo/` |
| `EzyView.desktop.hbs` | rendered desktop entry (via `desktopTemplate`) |

The Debian changelog and the manual page are committed compressed because
Tauri copies files verbatim and lintian requires both `.gz` names. After
editing `changelog` or `ezyview.1`, regenerate the copies deterministically:

```bash
gzip -9 -n -c packaging/changelog > packaging/changelog.gz
gzip -9 -n -c packaging/ezyview.1 > packaging/ezyview.1.gz
```

`lintian --fail-on error` and `appstreamcli validate` run on the built package
in the desktop CI job. The declared glibc floor (`libc6 (>= 2.39)`) matches the
Ubuntu 24.04 / Mint 22 build host; change both together if the build baseline
moves.
