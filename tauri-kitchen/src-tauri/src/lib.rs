use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, UserAttentionType, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

// Builds a small, borderless, always-on-top toast in the top-right corner.
// focused(false) keeps the cashier's ERP keyboard focus intact.
// Uses a fixed "popup" label (listed in capabilities) so WebviewUrl::App can
// serve the local popup.html. Order data is injected via Rust eval() after
// the page loads rather than through query strings or events.
fn show_order_popup(app: &tauri::AppHandle, title: &str, body: &str) {
    // Close any existing popup first.
    if let Some(w) = app.get_webview_window("popup") {
        let _ = w.close();
    }

    let built = WebviewWindowBuilder::new(app, "popup", WebviewUrl::App("popup.html".into()))
        .title("Шинэ захиалга")
        .inner_size(360.0, 140.0)
        .decorations(false)
        .always_on_top(true)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .build();

    match built {
        Ok(win) => {
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let scale = monitor.scale_factor();
                let mw = monitor.size().width as i32;
                let pw = (360.0 * scale) as i32;
                let margin = (20.0 * scale) as i32;
                let _ = win.set_position(PhysicalPosition::new(mw - pw - margin, margin));
            }
            let _ = win.show();

            // Inject the order data and start the beep once the page has loaded.
            let title_s = title
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n");
            let body_s = body
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n");
            let win2 = win.clone();
            let app2 = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(400));
                let js = format!(
                    r#"
                    document.getElementById('t').textContent = "{title}";
                    document.getElementById('b').textContent = "{body}";
                    try {{
                        var c = new (window.AudioContext || window.webkitAudioContext)();
                        function tone(f, s, d) {{
                            var o = c.createOscillator(), g = c.createGain();
                            o.type = 'sine'; o.frequency.value = f;
                            o.connect(g); g.connect(c.destination);
                            g.gain.setValueAtTime(0.001, c.currentTime + s);
                            g.gain.exponentialRampToValueAtTime(0.4, c.currentTime + s + 0.02);
                            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + s + d);
                            o.start(c.currentTime + s); o.stop(c.currentTime + s + d);
                        }}
                        tone(880, 0, 0.18); tone(1175, 0.2, 0.25);
                    }} catch(e) {{}}
                    "#,
                    title = title_s,
                    body = body_s,
                );
                let _ = win2.eval(&js);

                // Auto-dismiss after 10 seconds.
                std::thread::sleep(std::time::Duration::from_secs(10));
                if let Some(w) = app2.get_webview_window("popup") {
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
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                let _ = window.hide();
                api.prevent_close();
            }
            // Clicking the popup (fires Focused) → open the main kitchen window.
            tauri::WindowEvent::Focused(true) if window.label() == "popup" => {
                show_main_window(&window.app_handle().clone());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![notify_new_order])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
