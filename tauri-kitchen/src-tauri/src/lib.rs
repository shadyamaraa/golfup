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

// Percent-encode every byte except a small unreserved set, so the whole HTML
// document (including Cyrillic) survives inside a data: URL.
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

// Escape text for safe insertion into HTML element content.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

// Builds a small, borderless, always-on-top toast in the top-right corner.
// focused(false) keeps the cashier's ERP keyboard focus intact. The whole UI
// is embedded in a data: URL — no file serving, no eval timing, no IPC.
// The window label encodes its creation time ("popup-<millis>") so the
// click-to-open handler can distinguish a real click from the spurious focus
// event that fires while the window is being created.
fn show_order_popup(app: &tauri::AppHandle, title: &str, body: &str) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("popup-") {
            let _ = w.close();
        }
    }

    let label = format!("popup-{}", now_millis());

    let html = format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{height:100%;margin:0;padding:0}}
body{{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-family:'Segoe UI',Arial,sans-serif;padding:14px 16px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;cursor:pointer}}
.h{{font-size:1.15rem;font-weight:800}}
.b{{font-size:.95rem;opacity:.96;line-height:1.35}}
.hint{{font-size:.72rem;opacity:.75}}
.bar{{height:4px;background:rgba(255,255,255,.3);border-radius:2px;margin-top:auto;overflow:hidden}}
.bar>i{{display:block;height:100%;background:#fff;width:100%;animation:s 10s linear forwards}}
@keyframes s{{from{{width:100%}}to{{width:0}}}}
</style></head><body>
<div class="h">{title}</div>
<div class="b">{body}</div>
<div class="hint">👆 Дарж нээх</div>
<div class="bar"><i></i></div>
<script>
try{{var c=new(window.AudioContext||window.webkitAudioContext)();function t(f,s,d){{var o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(c.destination);g.gain.setValueAtTime(.001,c.currentTime+s);g.gain.exponentialRampToValueAtTime(.4,c.currentTime+s+.02);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+s+d);o.start(c.currentTime+s);o.stop(c.currentTime+s+d)}}t(880,0,.18);t(1175,.2,.25)}}catch(e){{}}
</script></body></html>"#,
        title = html_escape(title),
        body = html_escape(body),
    );

    let data_url = format!("data:text/html;charset=utf-8,{}", pct(&html));
    let parsed: tauri::Url = match data_url.parse() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("show_order_popup: bad data url: {e}");
            return;
        }
    };

    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .title("Шинэ захиалга")
        .inner_size(360.0, 140.0)
        .decorations(false)
        .always_on_top(true)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .additional_browser_args(
            "--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI",
        )
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
            // Clicking the popup opens the main kitchen window. The popup is
            // created focused(false), but some systems still emit a Focused(true)
            // during creation — we ignore any focus within 800ms of creation
            // (parsed from the label) so the ERP isn't pulled to the background.
            tauri::WindowEvent::Focused(true) if window.label().starts_with("popup-") => {
                let created: u128 = window
                    .label()
                    .strip_prefix("popup-")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                if now_millis().saturating_sub(created) > 800 {
                    show_main_window(&window.app_handle().clone());
                    let _ = window.close();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![notify_new_order])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
