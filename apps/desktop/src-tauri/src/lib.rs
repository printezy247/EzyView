use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static NEXT_WINDOW: AtomicU32 = AtomicU32::new(1);
/// Set once the app is shutting down, so closing chart windows then does not overwrite windows.json.
static QUITTING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Write `bytes` to `path` atomically: a sibling temp file (created with `mode`),
/// flushed to disk, then renamed over the target. The temp file is removed on error.
fn atomic_write(path: &std::path::Path, bytes: &[u8], mode: u32) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    let tmp = path.with_file_name(name);
    let result = (|| {
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(mode).open(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        restrict_permissions(&tmp, mode);
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

/// A window rectangle in physical pixels: x, y, width, height.
type Rect = (i32, i32, u32, u32);
const MAX_WINDOW_DIM: u32 = 16384;

/// Make a saved window rect safe to restore: cap its size, and if its centre is
/// not on any monitor, centre it on the first one; otherwise nudge it fully on-screen.
fn clamp_rect(r: Rect, monitors: &[Rect]) -> Rect {
    let (x, y, w, h) = (r.0, r.1, r.2.min(MAX_WINDOW_DIM), r.3.min(MAX_WINDOW_DIM));
    let Some(first) = monitors.first() else { return (x, y, w, h) };
    let (cx, cy) = (x as i64 + w as i64 / 2, y as i64 + h as i64 / 2);
    let hit = monitors.iter().find(|m| {
        cx >= m.0 as i64 && cx < m.0 as i64 + m.2 as i64 && cy >= m.1 as i64 && cy < m.1 as i64 + m.3 as i64
    });
    let (m, on_screen) = match hit {
        Some(m) => (m, true),
        None => (first, false),
    };
    let (w, h) = (w.min(m.2), h.min(m.3));
    let (max_x, max_y) = (m.0 as i64 + (m.2 - w) as i64, m.1 as i64 + (m.3 - h) as i64);
    if on_screen {
        (((x as i64).clamp(m.0 as i64, max_x)) as i32, ((y as i64).clamp(m.1 as i64, max_y)) as i32, w, h)
    } else {
        (((m.0 as i64 + max_x) / 2) as i32, ((m.1 as i64 + max_y) / 2) as i32, w, h)
    }
}

/// Linux data folder from env values: `XDG_DATA_HOME` only when absolute (per the spec), else `$HOME/.local/share`.
fn data_dir_from(xdg: Option<std::ffi::OsString>, home: Option<std::ffi::OsString>) -> Option<std::path::PathBuf> {
    let base = xdg
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| home.filter(|h| !h.is_empty()).map(|h| std::path::PathBuf::from(h).join(".local/share")))?;
    Some(base.join("com.printezy247.ezyview"))
}

/// Existing `no_proxy` plus the loopback hosts, without duplicates.
fn merge_no_proxy(existing: Option<&str>) -> String {
    let mut parts: Vec<String> = Vec::new();
    for item in existing.unwrap_or("").split(',').map(str::trim).filter(|s| !s.is_empty()).chain(["127.0.0.1", "localhost", "::1"]) {
        if !parts.iter().any(|p| p == item) {
            parts.push(item.to_string());
        }
    }
    parts.join(",")
}

/// Open a chart in its own window so it can be moved to another monitor.
/// `query` is the already-encoded query string, e.g. `?detached=BINANCE%3ABTCUSDT&res=1h`.
fn spawn_chart_window(app: &AppHandle, query: &str) -> Result<tauri::WebviewWindow, String> {
    if !query.starts_with("?detached=") {
        return Err("unexpected window query".into());
    }
    // The query travels straight into a webview URL, so it is bounded and
    // restricted to the characters a symbol and an interval need.
    if query.len() > 512 || !query.chars().all(|c| c.is_ascii_alphanumeric() || "%-_.&=:".contains(c)) {
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
        .filter(|r| {
            r.query.starts_with("?detached=")
                && r.query.len() <= 512
                && (200..=MAX_WINDOW_DIM).contains(&r.width)
                && (150..=MAX_WINDOW_DIM).contains(&r.height)
        })
        .take(MAX_RESTORED_WINDOWS)
        .collect()
}

/// Remember every open chart window (symbol, interval, position, size) as the main window closes.
fn save_chart_windows(app: &AppHandle) {
    save_chart_windows_except(app, None);
}

fn save_chart_windows_except(app: &AppHandle, skip: Option<&str>) {
    use tauri::Manager;
    let mut records = Vec::new();
    for (label, window) in app.webview_windows() {
        if !label.starts_with("chart-") || Some(label.as_str()) == skip {
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
            let _ = atomic_write(&path, json.as_bytes(), 0o600);
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
    let monitors: Vec<Rect> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    for record in restorable(records) {
        let (x, y, w, h) = clamp_rect((record.x, record.y, record.width, record.height), &monitors);
        if let Ok(window) = spawn_chart_window(app, &record.query) {
            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
}

/// Write the workspace snapshot MCP clients read. The file name is fixed, so
/// the webview chooses contents only; the write is atomic (temp + rename) so a
/// reader never sees half a file.
#[tauri::command]
async fn write_snapshot(app: AppHandle, json: String) -> Result<(), String> {
    if json.len() > 20 * 1024 * 1024 {
        return Err("snapshot too large".into());
    }
    let path = app_data(&app)?.join("workspace-snapshot.json");
    tauri::async_runtime::spawn_blocking(move || atomic_write(&path, json.as_bytes(), 0o600))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
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
    data_dir_from(std::env::var_os("XDG_DATA_HOME"), std::env::var_os("HOME"))
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
        let merged = merge_no_proxy(std::env::var("no_proxy").ok().as_deref());
        std::env::set_var("no_proxy", merged);
    }
}

#[cfg(not(target_os = "linux"))]
fn apply_shell_settings_early() {}

fn app_data(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // The folder holds the trading journal, the workspace snapshot and the
    // crash log. They are the user's private trading data, so the folder is
    // for the owner only.
    restrict_permissions(&dir, 0o700);
    Ok(dir)
}

/// Best-effort `chmod`: the file is the user's own data, and a filesystem
/// that does not support unix modes is not a reason to fail the command.
fn restrict_permissions(path: &std::path::Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode));
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
    let path = app_data(&app)?.join(SHELL_SETTINGS_FILE);
    atomic_write(&path, json.as_bytes(), 0o600).map_err(|e| e.to_string())
}

/// Restart so saved shell settings take effect.
#[tauri::command]
fn relaunch_app(app: AppHandle) {
    save_chart_windows(&app);
    app.restart();
}

/// Factory reset: wipe the webview's local data (workspace, journal, layouts),
/// EzyView's own files and the keyring secrets, then restart. Every step runs
/// even if an earlier one failed; failures are reported together (no restart then).
#[tauri::command]
async fn factory_reset(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    use tauri::Manager;
    QUITTING.store(true, Ordering::Relaxed);
    let mut errors: Vec<String> = Vec::new();
    for (label, w) in app.webview_windows() {
        if label.starts_with("chart-") {
            let _ = w.destroy();
        }
    }
    if let Err(e) = window.clear_all_browsing_data() {
        errors.push(e.to_string());
    }
    let dir = app_data(&app)?;
    {
        let _guard = LOG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        for name in ["crash.log", "workspace-snapshot.json", WINDOWS_FILE, SHELL_SETTINGS_FILE] {
            match std::fs::remove_file(dir.join(name)) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => errors.push(format!("{name}: {e}")),
            }
        }
    }
    match tauri::async_runtime::spawn_blocking(|| clear_secrets(None)).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => errors.push(e),
        Err(e) => errors.push(e.to_string()),
    }
    if !errors.is_empty() {
        return Err(errors.join("; "));
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
    restrict_permissions(&dir, 0o700);
    Ok(dir.join("crash.log"))
}

static LOG_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Append a crash block to the local log (capped); nothing leaves the machine.
#[tauri::command]
fn append_log(app: AppHandle, text: String) -> Result<(), String> {
    let _guard = LOG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    // A webview can call this with any text, so the block is bounded before
    // it reaches the disk.
    let text: String = text.chars().take(64 * 1024).collect();
    let path = log_path(&app)?;
    let existing = String::from_utf8_lossy(&std::fs::read(&path).unwrap_or_default()).into_owned();
    let next = trim_log(&format!("{existing}{text}"));
    atomic_write(&path, next.as_bytes(), 0o600).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_log(app: AppHandle) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&std::fs::read(log_path(&app)?).unwrap_or_default()).into_owned())
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

const MAX_SAVE_BYTES: usize = 50 * 1024 * 1024;

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
    if bytes.len() > MAX_SAVE_BYTES {
        return Err("file too large to save (max 50 MB)".into());
    }
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
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(path, bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(true)
}

/// Keyring service name; each provider key is stored under its own account.
const KEYRING_SERVICE: &str = "EzyView";
/// The only secrets the webview may read or write: data-provider keys, the MT5
/// MCP key and the shared token for the local MT5 bridge.
const API_KEY_NAMES: [&str; 5] = ["finnhub", "alphavantage", "twelvedata", "mt5", "mt5-bridge"];
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

fn key_get(name: &str) -> Result<Option<String>, String> {
    match key_entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn key_set(name: &str, value: &str) -> Result<(), String> {
    let entry = key_entry(name)?;
    let value = value.trim();
    if value.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(value).map_err(|e| e.to_string())
}

fn clear_secrets(extra_keys: Option<Vec<String>>) -> Result<(), String> {
    for name in API_KEY_NAMES {
        if let Ok(entry) = key_entry(name) {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    if let Some(extras) = extra_keys {
        for name in extras {
            if is_mt5_account_name(&name) {
                if let Ok(entry) = key_entry(&name) {
                    let _ = entry.delete_credential();
                }
            }
        }
    }
    Ok(())
}

/// Keyring calls can block (D-Bus / unlock prompts), so they run off the async runtime threads.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// Read a provider API key from the OS keyring; `None` when it was never set.
#[tauri::command]
async fn api_key_get(name: String) -> Result<Option<String>, String> {
    blocking(move || key_get(&name)).await
}

/// Store a provider API key in the OS keyring; an empty value deletes it.
#[tauri::command]
async fn api_key_set(name: String, value: String) -> Result<(), String> {
    blocking(move || key_set(&name, &value)).await
}

/// Token file written by `/usr/bin/ezyview-mt5-bridge` (0600, per install).
fn bridge_token_path() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| {
            std::env::var_os("HOME")
                .map(|home| std::path::PathBuf::from(home).join(".config"))
        })?;
    Some(base.join("ezyview").join("mt5-bridge.token"))
}

/// Read the shared token the packaged bridge launcher generated, so the user
/// does not have to copy it by hand. The keyring value still wins when set.
#[tauri::command]
fn read_bridge_token() -> Result<String, String> {
    let path = bridge_token_path().ok_or_else(|| "no config directory".to_string())?;
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("{}: {error}", path.display()))?;
    let token = text.trim().to_string();
    if token.is_empty() {
        return Err("bridge token file is empty".to_string());
    }
    Ok(token)
}

/// Wipe provider keys and optional dynamic broker credentials from the OS keyring on explicit user request.
#[tauri::command]
async fn clear_keyring_secrets(extra_keys: Option<Vec<String>>) -> Result<(), String> {
    blocking(move || clear_secrets(extra_keys)).await
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
                    use tauri::Emitter;
                    let _ = window.emit("shortcut-focused", ());
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Rust panics (release builds abort) land in the same local log.
            use tauri::Manager;
            if let Ok(dir) = app.path().app_data_dir() {
                let path = dir.join("crash.log");
                let previous = std::panic::take_hook();
                std::panic::set_hook(Box::new(move |info| {
                    use std::io::Write;
                    use std::os::unix::fs::OpenOptionsExt;
                    let _ = std::fs::create_dir_all(&dir);
                    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).mode(0o600).open(&path) {
                        let _ = writeln!(f, "[rust panic] {info}");
                    }
                    previous(info);
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
                    QUITTING.store(true, Ordering::Relaxed);
                }
            } else if window.label().starts_with("chart-") {
                // Keep windows.json current as charts are closed (a crash then restores what was open).
                if let tauri::WindowEvent::Destroyed = event {
                    if !QUITTING.load(Ordering::Relaxed) {
                        save_chart_windows_except(window.app_handle(), Some(window.label()));
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_chart_window,
            api_key_get,
            api_key_set,
            read_bridge_token,
            clear_keyring_secrets,
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
        .build(tauri::generate_context!())
        .expect("error while building EzyView")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Only save while chart windows still exist: after they close, the main window's save already ran.
                if !QUITTING.swap(true, Ordering::Relaxed) {
                    save_chart_windows(app);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_key_names() {
        assert!(key_get("../etc").is_err());
        assert!(key_set("github", "x").is_err());
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
            assert!(key_get(bad).is_err(), "should reject {bad}");
        }
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("ezyview-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn atomic_write_replaces_file_with_private_mode_and_no_tmp() {
        use std::os::unix::fs::PermissionsExt;
        let d = scratch("atomic");
        let p = d.join("a.json");
        atomic_write(&p, b"one", 0o600).unwrap();
        atomic_write(&p, b"two", 0o600).unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"two");
        assert_eq!(std::fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600);
        assert!(!d.join("a.json.tmp").exists());
        // Failure (target is a directory) leaves no temp file behind.
        let dir_target = d.join("sub");
        std::fs::create_dir(&dir_target).unwrap();
        assert!(atomic_write(&dir_target, b"x", 0o600).is_err());
        assert!(!d.join("sub.tmp").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn xdg_data_home_must_be_absolute_and_non_empty() {
        use std::ffi::OsString as S;
        let home = Some(S::from("/home/u"));
        let want = std::path::PathBuf::from("/home/u/.local/share/com.printezy247.ezyview");
        assert_eq!(data_dir_from(Some(S::from("")), home.clone()), Some(want.clone()));
        assert_eq!(data_dir_from(Some(S::from("rel/dir")), home.clone()), Some(want.clone()));
        assert_eq!(data_dir_from(None, home), Some(want));
        assert_eq!(
            data_dir_from(Some(S::from("/x/data")), None),
            Some(std::path::PathBuf::from("/x/data/com.printezy247.ezyview"))
        );
        assert_eq!(data_dir_from(Some(S::from("")), Some(S::from(""))), None);
    }

    #[test]
    fn no_proxy_always_gains_loopback_without_duplicates() {
        assert_eq!(merge_no_proxy(None), "127.0.0.1,localhost,::1");
        assert_eq!(merge_no_proxy(Some("")), "127.0.0.1,localhost,::1");
        assert_eq!(merge_no_proxy(Some("corp.local, localhost")), "corp.local,localhost,127.0.0.1,::1");
    }

    #[test]
    fn window_rect_is_clamped_onto_a_monitor() {
        let mons = [(0, 0, 1920, 1080), (1920, 0, 1280, 1024)];
        // Already fine.
        assert_eq!(clamp_rect((100, 50, 800, 600), &mons), (100, 50, 800, 600));
        // Unplugged monitor far off-screen: centred on the first monitor.
        assert_eq!(clamp_rect((-5000, 40, 800, 600), &mons), (560, 240, 800, 600));
        // Centre on the second monitor but hanging off its edge: pulled fully inside it.
        assert_eq!(clamp_rect((1700, 700, 800, 600), &mons), (1920, 424, 800, 600));
        // Oversized: capped to the monitor.
        assert_eq!(clamp_rect((0, 0, 99999, 99999), &mons), (0, 0, 1920, 1080));
        // No monitor info: only the size cap applies.
        assert_eq!(clamp_rect((5, 5, 99999, 700), &[]), (5, 5, MAX_WINDOW_DIM, 700));
    }

    /// Touches the real OS keyring, so it only runs on demand:
    /// `cargo test -- --ignored keyring_round_trip`
    #[test]
    #[ignore]
    fn keyring_round_trip() {
        key_set("finnhub", "test-value").unwrap();
        assert_eq!(key_get("finnhub").unwrap().as_deref(), Some("test-value"));
        key_set("finnhub", "  ").unwrap();
        assert_eq!(key_get("finnhub").unwrap(), None);
    }
}
