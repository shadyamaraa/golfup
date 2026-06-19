use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

// Builds a small, borderless, always-on-top toast window in the top-right
// corner. Created `focused(false)` so it surfaces ON TOP of the cashier's
// ERP without stealing keyboard focus. Auto-dismisses after 10 seconds.
// Data is passed via a Tauri event after the window loads (query-string
// params in WebviewUrl::App are treated as part of the filename on Windows
// and the page would fail to load).
fn show_order_popup(app: &tauri::AppHandle, title: &str, body: &str) {
    // Clear any earlier popups so they don't stack in the same spot.
    for (label, w) in app.webview_windows() {
        if label.starts_with("popup-") {
            let _ = w.close();
        }
    }

    let label = format!(
        "popup-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("popup.html".into()))
        .title("Шинэ захиалга")
        .inner_size(360.0, 140.0)
        .decorations(false)
        .always_on_top(true)
        .focused(false) // do NOT take focus away from the ERP
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .build();

    match built {
        Ok(win) => {
            // Park it in the top-right corner of the primary monitor.
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let scale = monitor.scale_factor();
                let mw = monitor.size().width as i32;
                let pw = (360.0 * scale) as i32;
                let margin = (20.0 * scale) as i32;
                let _ = win.set_position(PhysicalPosition::new(mw - pw - margin, margin));
            }
            let _ = win.show();

            // Send order data via event once the page has had time to load.
            let title_s = title.to_string();
            let body_s = body.to_string();
            let win2 = win.clone();
            let app2 = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(400));
                let _ = win2.emit("order-data", serde_json::json!({ "title": title_s, "body": body_s }));
                // Auto-dismiss after 10 seconds.
                std::thread::sleep(std::time::Duration::from_secs(10));
                if let Some(w) = app2.get_webview_window(&label) {
                    let _ = w.close();
                }
            });
        }
        Err(e) => {
            eprintln!("show_order_popup: failed to build popup window: {e}");
        }
    }
}

// Called from the webview when a new paid order arrives.
#[tauri::command]
fn notify_new_order(app: tauri::AppHandle, title: String, body: String) {
    show_order_popup(&app, &title, &body);
    // Native toast — works when installed via MSI/NSIS; silently fails otherwise.
    let _ = app.notification().builder().title(&title).body(&body).show();
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Нээх", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Гарах", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("UB Golf — Гал тогоо")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(&tray.app_handle().clone());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![notify_new_order])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
