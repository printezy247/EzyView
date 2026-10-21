use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static NEXT_WINDOW: AtomicU32 = AtomicU32::new(1);

/// Open a chart in its own window so it can be moved to another monitor.
/// `query` is the already-encoded query string, e.g. `?detached=BINANCE%3ABTCUSDT&res=1h`.
fn spawn_chart_window(app: &AppHandle, query: &str) -> Result<tauri::WebviewWindow, String> {
    if !query.starts_with("?detached=") {
        return Err("unexpected window query".into());
    }
    let label = format!("chart-{}", NEXT_WINDOW.fetch_add(1, Ordering::Relaxed));
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html{query}").into()))
        .title("EzyView chart")
        .inner_size(1100.0, 700.0)
        .min_inner_size(500.0, 350.0)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_chart_window(app: AppHandle, query: String) -> Result<(), String> {
    spawn_chart_window(&app, &query).map(|_| ())
}

/// One chart window as it was when EzyView last quit: what it showed and where it sat.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
struct WindowRecord {
    query: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

const WINDOWS_FILE: &str = "windows.json";
const MAX_RESTORED_WINDOWS: usize = 8;

/// Records worth reopening: a valid detached query, a sane size, capped in number.
fn restorable(records: Vec<WindowRecord>) -> Vec<WindowRecord> {
    records
        .into_iter()
        .filter(|r| r.query.starts_with("?detached=") && r.query.len() <= 512 && r.width >= 200 && r.height >= 150)
        .take(MAX_RESTORED_WINDOWS)
        .collect()
}

/// Remember every open chart window (symbol, interval, position, size) as the main window closes.
fn save_chart_windows(app: &AppHandle) {
    use tauri::Manager;
    let mut records = Vec::new();
    for (label, window) in app.webview_windows() {
        if !label.starts_with("chart-") {
            continue;
        }
        let (Ok(url), Ok(pos), Ok(size)) = (window.url(), window.outer_position(), window.outer_size()) else {
            continue;
        };
        let Some(query) = url.query() else { continue };
        records.push(WindowRecord { query: format!("?{query}"), x: pos.x, y: pos.y, width: size.width, height: size.height });
    }
    let Ok(dir) = app_data(app) else { return };
    let path = dir.join(WINDOWS_FILE);
    match serde_json::to_string(&records) {
        Ok(json) if !records.is_empty() => {
            let _ = std::fs::write(path, json);
        }
        _ => {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Reopen the windows saved at last quit, each back on its monitor position.
fn restore_chart_windows(app: &AppHandle) {
    let Ok(dir) = app_data(app) else { return };
    let path = dir.join(WINDOWS_FILE);
    let Ok(text) = std::fs::read_to_string(&path) else { return };
    // Consume the file first: a window that crashes on open must not loop forever.
    let _ = std::fs::remove_file(&path);
    let Ok(records) = serde_json::from_str::<Vec<WindowRecord>>(&text) else { return };
    for record in restorable(records) {
        if let Ok(window) = spawn_chart_window(app, &record.query) {
            let _ = window.set_size(tauri::PhysicalSize::new(record.width, record.height));
            let _ = window.set_position(tauri::PhysicalPosition::new(record.x, record.y));
        }
    }
}

/// Write the workspace snapshot MCP clients read. The file name is fixed, so
/// the webview chooses contents only; the write is atomic (temp + rename) so a
/// reader never sees half a file.
#[tauri::command]
fn write_snapshot(app: AppHandle, json: String) -> Result<(), String> {
    if json.len() > 20 * 1024 * 1024 {
        return Err("snapshot too large".into());
    }
    let dir = app_data(&app)?;
    let tmp = dir.join("workspace-snapshot.json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("workspace-snapshot.json")).map_err(|e| e.to_string())
}

/// Shell settings the user can change in Settings → Desktop. They are read
/// before the webview exists (they become environment variables WebKitGTK and
/// GLib honour), so they live in a plain JSON file, not in the webview store.
#[derive(serde::Serialize, serde::Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
struct ShellSettings {
    /// `Some(false)` turns GPU compositing off (fixes blank/flickering windows on some drivers).
    hardware_acceleration: Option<bool>,
    /// `http://`, `https://` or `socks5://` proxy for the app's network traffic; empty = none.
    proxy: String,
}

const SHELL_SETTINGS_FILE: &str = "shell-settings.json";

fn valid_proxy(proxy: &str) -> bool {
    proxy.is_empty()
        || (proxy.len() <= 256
            && ["http://", "https://", "socks5://"].iter().any(|p| proxy.starts_with(p))
            && !proxy.chars().any(|c| c.is_whitespace() || c.is_control()))
}

/// Linux data folder before the app handle exists (mirrors Tauri's `app_data_dir`).
#[cfg(target_os = "linux")]
fn early_data_dir() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/share")))?;
    Some(base.join("com.printezy247.ezyview"))
}

/// Apply saved shell settings before Tauri starts. Linux only: the variables
/// are WebKitGTK / GLib specific. A missing or malformed file changes nothing.
#[cfg(target_os = "linux")]
fn apply_shell_settings_early() {
    let Some(dir) = early_data_dir() else { return };
    let Ok(text) = std::fs::read_to_string(dir.join(SHELL_SETTINGS_FILE)) else { return };
    let Ok(settings) = serde_json::from_str::<ShellSettings>(&text) else { return };
    if settings.hardware_acceleration == Some(false) {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    if !settings.proxy.is_empty() && valid_proxy(&settings.proxy) {
        for var in ["http_proxy", "https_proxy", "all_proxy"] {
            std::env::set_var(var, &settings.proxy);
        }
        // Local services (MT5 bridge, sd-server, Ollama) must never go via the proxy.
        if std::env::var_os("no_proxy").is_none() {
            std::env::set_var("no_proxy", "127.0.0.1,localhost,::1");
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn apply_shell_settings_early() {}

fn app_data(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn get_shell_settings(app: AppHandle) -> Result<ShellSettings, String> {
    let text = std::fs::read_to_string(app_data(&app)?.join(SHELL_SETTINGS_FILE)).unwrap_or_default();
    Ok(serde_json::from_str(&text).unwrap_or_default())
}

#[tauri::command]
fn set_shell_settings(app: AppHandle, settings: ShellSettings) -> Result<(), String> {
    if !valid_proxy(&settings.proxy) {
        return Err("proxy must be http://, https:// or socks5:// with no spaces".into());
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(app_data(&app)?.join(SHELL_SETTINGS_FILE), json).map_err(|e| e.to_string())
}

/// Restart so saved shell settings take effect.
#[tauri::command]
fn relaunch_app(app: AppHandle) {
    app.restart();
}

/// Factory reset: wipe the webview's local data (workspace, journal, layouts)
/// and EzyView's own files, then restart. Keyring secrets are left alone and
/// are removed from Settings → Data.
#[tauri::command]
fn factory_reset(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    window.clear_all_browsing_data().map_err(|e| e.to_string())?;
    let dir = app_data(&app)?;
    for name in ["crash.log", "workspace-snapshot.json", WINDOWS_FILE, SHELL_SETTINGS_FILE] {
        match std::fs::remove_file(dir.join(name)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    app.restart();
}

const LOG_CAP: usize = 256 * 1024;

/// Keep the newest `LOG_CAP` bytes, cutting at a line start (and a char boundary).
fn trim_log(text: &str) -> String {
    if text.len() <= LOG_CAP {
        return text.to_string();
    }
    let mut start = text.len() - LOG_CAP;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    let tail = &text[start..];
    match tail.find('\n') {
        Some(i) => tail[i + 1..].to_string(),
        None => tail.to_string(),
    }
}

fn log_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("crash.log"))
}

/// Append a crash block to the local log (capped); nothing leaves the machine.
#[tauri::command]
fn append_log(app: AppHandle, text: String) -> Result<(), String> {
    let path = log_path(&app)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    std::fs::write(&path, trim_log(&format!("{existing}{text}"))).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_log(app: AppHandle) -> Result<String, String> {
    Ok(std::fs::read_to_string(log_path(&app)?).unwrap_or_default())
}

#[tauri::command]
fn clear_log(app: AppHandle) -> Result<(), String> {
    match std::fs::remove_file(log_path(&app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// A bare file name for the save dialog's default: no separators, no traversal.
fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 200 && name != ".." && !name.contains(['/', '\\', '\0'])
}

/// Ask the user where to save, then write `bytes` there. The dialog runs in
/// Rust so the webview never supplies a write path. `Ok(false)` = cancelled.
#[tauri::command]
async fn save_file(
    app: AppHandle,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    if !is_plain_file_name(&default_name) {
        return Err("unexpected file name".into());
    }
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let picked = app
        .dialog()
        .file()
        .set_file_name(default_name)
        .add_filter(filter_name, &exts)
        .blocking_save_file();
    let Some(path) = picked else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Keyring service name; each provider key is stored under its own account.
const KEYRING_SERVICE: &str = "EzyView";
/// The only secrets the webview may read or write: data-provider keys and the MT5 MCP key.
const API_KEY_NAMES: [&str; 3] = ["finnhub", "alphavantage", "mt5"];
/// Per-account broker passwords live under `mt5:<login>@<server>` (Phase 1).
const MT5_ACCOUNT_PREFIX: &str = "mt5:";
/// Charset guard for the dynamic account suffix: no spaces, no path chars, no `@`/`:` games beyond the single separator.
const MT5_ACCOUNT_CHARS: &[char] = &['.', '_', '-', '+'];

fn is_mt5_account_name(name: &str) -> bool {
    let Some(rest) = name.strip_prefix(MT5_ACCOUNT_PREFIX) else {
        return false;
    };
    // `LOGIN@SERVER`: both sides non-empty, bounded, and from a strict charset.
    let Some((login, server)) = rest.split_once('@') else {
        return false;
    };
    let ok = |s: &str| {
        !s.is_empty()
            && s.len() <= 128
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || MT5_ACCOUNT_CHARS.contains(&c))
    };
    ok(login) && ok(server)
}

fn key_entry(name: &str) -> Result<keyring::Entry, String> {
    if !API_KEY_NAMES.contains(&name) && !is_mt5_account_name(name) {
        return Err(format!("unknown API key name: {name}"));
    }
    keyring::Entry::new(KEYRING_SERVICE, name).map_err(|e| e.to_string())
}

/// Read a provider API key from the OS keyring; `None` when it was never set.
#[tauri::command]
fn api_key_get(name: String) -> Result<Option<String>, String> {
    match key_entry(&name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Store a provider API key in the OS keyring; an empty value deletes it.
#[tauri::command]
fn api_key_set(name: String, value: String) -> Result<(), String> {
    let entry = key_entry(&name)?;
    let value = value.trim();
    if value.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(value).map_err(|e| e.to_string())
}

/// Ctrl+Alt+E brings the main window to the front from anywhere. Registration
/// can fail (another app owns the combo, Wayland): the app just runs without it.
fn register_show_shortcut(app: &tauri::App) {
    use tauri::Manager;
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
    let combo = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyE);
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if shortcut == &combo && event.state() == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build();
    if app.handle().plugin(plugin).is_ok() {
        let _ = app.global_shortcut().register(combo);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    apply_shell_settings_early();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // Rust panics (release builds abort) land in the same local log.
            use tauri::Manager;
            if let Ok(dir) = app.path().app_data_dir() {
                let path = dir.join("crash.log");
                std::panic::set_hook(Box::new(move |info| {
                    use std::io::Write;
                    let _ = std::fs::create_dir_all(&dir);
                    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
                        let _ = writeln!(f, "[rust panic] {info}");
                    }
                }));
            }
            register_show_shortcut(app);
            restore_chart_windows(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::Manager;
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    save_chart_windows(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_chart_window,
            api_key_get,
            api_key_set,
            save_file,
            write_snapshot,
            append_log,
            read_log,
            clear_log,
            get_shell_settings,
            set_shell_settings,
            relaunch_app,
            factory_reset
        ])
        .run(tauri::generate_context!())
        .expect("error while running EzyView");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_key_names() {
        assert!(api_key_get("../etc".into()).is_err());
        assert!(api_key_set("github".into(), "x".into()).is_err());
    }

    #[test]
    fn trim_log_keeps_the_newest_whole_lines() {
        assert_eq!(trim_log("a\nb\n"), "a\nb\n");
        let big = format!("old\n{}new\n", "x\n".repeat(LOG_CAP));
        let out = trim_log(&big);
        assert!(out.len() <= LOG_CAP);
        assert!(out.ends_with("new\n"));
        assert!(!out.starts_with("old"));
    }

    #[test]
    fn only_sane_chart_windows_are_restored() {
        let rec = |query: &str, width: u32| WindowRecord { query: query.into(), x: -1920, y: 40, width, height: 700 };
        let kept = restorable(vec![
            rec("?detached=OANDA%3AXAUUSD&res=1h", 1100),
            rec("?evil=1", 1100),
            rec("?detached=X&res=1D", 50),
        ]);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].x, -1920);
        let many: Vec<_> = (0..20).map(|_| rec("?detached=X&res=1D", 800)).collect();
        assert_eq!(restorable(many).len(), MAX_RESTORED_WINDOWS);
    }

    #[test]
    fn proxy_values_are_checked() {
        for ok in ["", "http://127.0.0.1:8080", "socks5://proxy.local:1080", "https://p.example"] {
            assert!(valid_proxy(ok), "should accept {ok:?}");
        }
        for bad in ["ftp://x", "127.0.0.1:8080", "http://a b", "http://x\n", "javascript:alert(1)"] {
            assert!(!valid_proxy(bad), "should reject {bad:?}");
        }
    }

    #[test]
    fn shell_settings_tolerate_missing_fields() {
        let s: ShellSettings = serde_json::from_str(r#"{"proxy":"http://p:1"}"#).unwrap();
        assert_eq!(s.hardware_acceleration, None);
        assert_eq!(s.proxy, "http://p:1");
        assert_eq!(serde_json::from_str::<ShellSettings>("{}").unwrap(), ShellSettings::default());
    }

    #[test]
    fn save_file_names_must_be_plain() {
        assert!(is_plain_file_name("chart-BTCUSDT-1D.png"));
        for bad in ["", "..", "../x.png", "a/b.png", "a\\b.png", "a\0b.png"] {
            assert!(!is_plain_file_name(bad), "should reject {bad:?}");
        }
    }

    #[test]
    fn accepts_mt5_account_names() {
        assert!(is_mt5_account_name("mt5:4123@MetaQuotes-Demo"));
        assert!(is_mt5_account_name("mt5:12345678@Broker.Server_1"));
    }

    #[test]
    fn rejects_malicious_mt5_names() {
        for bad in [
            "mt5:", // no suffix
            "mt5:@server",   // empty login
            "mt5:4123@",     // empty server
            "mt5:4123",      // no separator
            "mt5:4123@two@servers",
            "mt5:../etc@host",
            "mt5:41 23@host", // space
            "mt5:4123@hos:t", // colon games
            "mt5:&long=123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890@host",
            "other:4123@host",
        ] {
            assert!(!is_mt5_account_name(bad), "should reject {bad}");
            assert!(api_key_get(bad.into()).is_err(), "should reject {bad}");
        }
    }

    /// Touches the real OS keyring, so it only runs on demand:
    /// `cargo test -- --ignored keyring_round_trip`
    #[test]
    #[ignore]
    fn keyring_round_trip() {
        api_key_set("finnhub".into(), "test-value".into()).unwrap();
        assert_eq!(api_key_get("finnhub".into()).unwrap().as_deref(), Some("test-value"));
        api_key_set("finnhub".into(), "  ".into()).unwrap();
        assert_eq!(api_key_get("finnhub".into()).unwrap(), None);
    }
}
