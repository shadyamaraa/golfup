use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

// Minimal percent-encoding so order text (incl. Cyrillic) survives the query
// string. Encodes raw UTF-8 bytes; the popup decodes with URLSearchParams.
fn pct(s: &str) -> String {
    let mut out = String::new();
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// Builds a small, borderless, always-on-top toast window in the top-right
// corner. It is created `focused(false)` so it surfaces ON TOP of the cashier's
// ERP without stealing keyboard focus — the cashier keeps working uninterrupted.
// Auto-dismisses after a few seconds.
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
    let url = format!("popup.html?title={}&body={}", pct(title), pct(body));

    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("Шинэ захиалга")
        .inner_size(360.0, 140.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .focused(false) // do NOT take focus away from the ERP
        .skip_taskbar(true)
        .resizable(false)
        .build();

    if let Ok(win) = built {
        // Park it in the top-right corner of the primary monitor.
        if let Ok(Some(monitor)) = win.primary_monitor() {
            let scale = monitor.scale_factor();
            let mw = monitor.size().width as i32;
            let pw = (360.0 * scale) as i32;
            let margin = (20.0 * scale) as i32;
            let _ = win.set_position(PhysicalPosition::new(mw - pw - margin, margin));
        }
        // Auto-dismiss.
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(10));
            if let Some(w) = app2.get_webview_window(&label) {
                let _ = w.close();
            }
        });
    }
}

// Called from the webview when a new paid order arrives. Shows an on-screen
// popup (even when the kitchen window is minimized or hidden to tray) WITHOUT
// stealing focus, plus a native OS toast. The main window is left untouched.
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
        // Focus the existing window if a second copy is launched.
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
        // Closing the window hides it to the tray instead of quitting, so the
        // app keeps listening for new orders in the background.
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
