# Releasing EzyView

Tags are the release trigger. Pushing `v<version>` runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which
rebuilds from the tag, runs the gates below, and uploads a **draft** GitHub
Release with the `.deb`, the AppImage and `SHA256SUMS`.

## Before tagging

1. Bump the version in all four declarations and the lockfile entry:
   `package.json`, `apps/desktop/package.json`,
   `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`
   and the `ezyview` package in `apps/desktop/src-tauri/Cargo.lock`.
2. Add a `packaging/changelog` entry and an AppStream `<release>`, then
   regenerate the compressed copies:

   ```bash
   gzip -9 -n -c packaging/changelog > packaging/changelog.gz
   gzip -9 -n -c packaging/ezyview.1 > packaging/ezyview.1.gz
   ```

3. Run the local gate `npm run check:versions`, then `npm run lint`,
   `npm run typecheck` and `npm run test`.
4. Commit, tag, push:

   ```bash
   git tag -a v0.3.1 -m "EzyView 0.3.1"
   git push origin main --tags
   ```

## What the workflow enforces

- The tag equals the declared version.
- Lint, typecheck, unit tests, web build and MCP build pass.
- `lintian --fail-on error`, required copyright/man-page files,
  `desktop-file-validate` and `appstreamcli validate` pass
  (`scripts/check-deb.sh`).
- The built `.deb` installs and the packaged binary stays up for 15 seconds
  under `xvfb` (`scripts/smoke-deb.sh`).
- Only then is the draft release created with checksums.

**Publishing the draft is the release.** `releases/latest` — which the in-app
update check reads — resolves only after the draft is published. Review the
draft, then publish it on GitHub.

## AppImage

The AppImage needs FUSE 2: `libfuse2t64` on Mint 22 / Ubuntu 24.04. Without it,
run `./EzyView_<version>_amd64.AppImage --appimage-extract-and-run`. The `.deb`
is the supported build for Mint/Ubuntu; the AppImage is the portable one.

## Signed in-app updates (not enabled yet)

The app currently checks GitHub Releases and notifies; installation is a manual
download. Enabling `tauri-plugin-updater` needs a signing key that must be
created and backed up by the maintainer — losing it prevents updating existing
installs. When that is done:

1. Generate a minisign keypair with `npm run tauri signer generate -- -w ~/.tauri/ezyview.key`.
2. Store the private key and its password as the repository secrets
   `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and back
   the key up offline.
3. Put the public key in `apps/desktop/src-tauri/tauri.conf.json` under
   `plugins.updater.pubkey`, set `bundle.createUpdaterArtifacts: true`, and add
   the endpoint
   `https://github.com/printezy247/EzyView/releases/latest/download/latest.json`.
4. The release workflow must pass the signing secrets to `npm run build:desktop`.
5. Verify the generated `latest.json` selects `linux-x86_64-deb` and
   `linux-x86_64-appimage` — the `.deb` install path needs an authorization
   prompt or an actionable manual-download fallback. Never restart the app while
   a position is open.
