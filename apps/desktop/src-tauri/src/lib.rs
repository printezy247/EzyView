use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static NEXT_WINDOW: AtomicU32 = AtomicU32::new(1);

/// Open a chart in its own window so it can be moved to another monitor.
/// `query` is the already-encoded query string, e.g. `?detached=BINANCE%3ABTCUSDT&res=1h`.
#[tauri::command]
async fn open_chart_window(app: AppHandle, query: String) -> Result<(), String> {
    if !query.starts_with("?detached=") {
        return Err("unexpected window query".into());
    }
    let label = format!("chart-{}", NEXT_WINDOW.fetch_add(1, Ordering::Relaxed));
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(format!("index.html{query}").into()))
        .title("EzyView chart")
        .inner_size(1100.0, 700.0)
        .min_inner_size(500.0, 350.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Keyring service name; each provider key is stored under its own account.
const KEYRING_SERVICE: &str = "EzyView";
/// The only secrets the webview may read or write.
const API_KEY_NAMES: [&str; 2] = ["finnhub", "alphavantage"];

fn key_entry(name: &str) -> Result<keyring::Entry, String> {
    if !API_KEY_NAMES.contains(&name) {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![open_chart_window, api_key_get, api_key_set])
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
