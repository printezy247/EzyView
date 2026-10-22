/// Commands the webview may call. Listing them makes each one need an explicit
/// `allow-<name>` permission in a capability, so a window only gets what it is granted.
const COMMANDS: &[&str] = &[
    "open_chart_window",
    "api_key_get",
    "api_key_set",
    "clear_keyring_secrets",
    "save_file",
    "write_snapshot",
    "append_log",
    "read_log",
    "clear_log",
    "get_shell_settings",
    "set_shell_settings",
    "relaunch_app",
    "factory_reset",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
