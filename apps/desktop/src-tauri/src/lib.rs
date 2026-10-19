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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![open_chart_window])
        .run(tauri::generate_context!())
        .expect("error while running EzyView");
}
