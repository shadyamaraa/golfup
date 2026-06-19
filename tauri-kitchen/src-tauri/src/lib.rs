use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, UserAttentionType, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// Produce a JS string literal (quoted + escaped) so arbitrary text — including
// Cyrillic and quotes — can be injected safely via initialization_script.
fn js_str(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// Builds a small, borderless, always-on-top toast in the top-right corner that
// floats above the cashier's ERP window. focused(false) keeps the ERP keyboard
// focus intact. The page is the locally bundled popup.html (served from
// tauri://localhost), so window.__TAURI__ is injected and a click can invoke
// open_main directly. Title/body are passed through initialization_script.
fn show_order_popup(app: &tauri::AppHandle, title: &str, body: &str) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("popup-") {
            let _ = w.close();
        }
    }

    let label = format!("popup-{}", now_millis());

    let init = format!(
        "window.__ORDER_TITLE__={};window.__ORDER_BODY__={};",
        js_str(title),
        js_str(body),
    );

    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("popup.html".into()))
        .title("Шинэ захиалга")
        .inner_size(360.0, 140.0)
        .decorations(false)
        .always_on_top(true)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .initialization_script(&init)
        .additional_browser_args(
            "--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI",
        )
        .build();

    match built {
        Ok(win) => {
            // Pin to the top-right corner of whichever monitor we can resolve.
            // current_monitor is most reliable once the window exists; fall back
            // to primary_monitor. If both fail, leave the default position.
            let monitor = win
                .current_monitor()
                .ok()
                .flatten()
                .or_else(|| win.primary_monitor().ok().flatten());
            if let Some(monitor) = monitor {
                let scale = monitor.scale_factor();
                let mx = monitor.position().x;
                let my = monitor.position().y;
                let mw = monitor.size().width as i32;
                let pw = (360.0 * scale) as i32;
                let margin = (20.0 * scale) as i32;
                let _ = win.set_position(PhysicalPosition::new(mx + mw - pw - margin, my + margin));
            }
            let _ = win.show();

            let app2 = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(10));
                if let Some(w) = app2.get_webview_window(&label) {
                    let _ = w.close();
                }
            });
        }
        Err(e) => eprintln!("show_order_popup build failed: {e}"),
    }
}

#[tauri::command]
fn notify_new_order(app: tauri::AppHandle, title: String, body: String) {
    show_order_popup(&app, &title, &body);
    let _ = app.notification().builder().title(&title).body(&body).show();
    // Flash the main window's taskbar icon without forcing it to the foreground.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.request_user_attention(Some(UserAttentionType::Critical));
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

// Called from a popup's click handler — closes any popups and brings the main
// kitchen window to the foreground.
#[tauri::command]
fn open_main(app: tauri::AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("popup-") {
            let _ = w.close();
        }
    }
    show_main_window(&app);
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
                .tooltip("UB Golf Club")
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
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![notify_new_order, open_main])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
