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
