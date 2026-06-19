use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

// Builds a small, borderless, always-on-top toast window in the top-right
// corner of the primary monitor. Focused(false) keeps the cashier's ERP
// keyboard focus intact. Content is injected via eval() so we never rely
// on file-serving (WebviewUrl::App treats "popup.html?..." as a literal
// filename on Windows and the page would load blank).
fn show_order_popup(app: &tauri::AppHandle, title: &str, body: &str) {
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

    // Load an empty local page — the real content is injected by eval() below.
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("popup.html".into()))
        .title("Шинэ захиалга")
        .inner_size(360.0, 140.0)
        .decorations(false)
        .always_on_top(true)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .additional_browser_args("--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI")
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

            // JSON-encode strings so any Cyrillic / special chars are safe in JS.
            let title_j = serde_json::to_string(title).unwrap_or_else(|_| "\"\"".into());
            let body_j = serde_json::to_string(body).unwrap_or_else(|_| "\"\"".into());

            let win2 = win.clone();
            let app2 = app.clone();
            std::thread::spawn(move || {
                // Give WebView2 time to initialise before eval.
                std::thread::sleep(std::time::Duration::from_millis(400));

                // Inject the entire popup UI via eval — bypasses file-serving.
                let js = format!(
                    r#"(function(){{
  var T={title};
  var B={body};
  var de=document.documentElement;
  de.style.cssText='height:100%;margin:0;padding:0;';
  document.body.style.cssText='height:100%;margin:0;padding:14px 16px;box-sizing:border-box;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-family:"Segoe UI",Inter,Arial,sans-serif;display:flex;flex-direction:column;gap:8px;';
  de.style.background='#15803d';
  var h=document.createElement('div');
  h.style.cssText='font-size:1.15rem;font-weight:800;';
  h.textContent=T;
  var b=document.createElement('div');
  b.style.cssText='font-size:0.95rem;opacity:0.96;';
  b.textContent=B;
  var bar=document.createElement('div');
  bar.style.cssText='height:4px;background:rgba(255,255,255,0.3);border-radius:2px;margin-top:auto;overflow:hidden;';
  var i=document.createElement('i');
  i.style.cssText='display:block;height:100%;background:#fff;width:100%;';
  bar.appendChild(i);
  document.body.innerHTML='';
  document.body.appendChild(h);
  document.body.appendChild(b);
  document.body.appendChild(bar);
  i.animate([{{width:'100%'}},{{width:'0%'}}],{{duration:10000,fill:'forwards'}});
  try{{
    var c=new AudioContext();
    var tone=function(f,s,d){{
      var o=c.createOscillator(),g=c.createGain();
      o.type='sine';o.frequency.value=f;
      o.connect(g);g.connect(c.destination);
      g.gain.setValueAtTime(0.001,c.currentTime+s);
      g.gain.exponentialRampToValueAtTime(0.4,c.currentTime+s+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+s+d);
      o.start(c.currentTime+s);o.stop(c.currentTime+s+d);
    }};
    tone(880,0,0.18);tone(1175,0.2,0.25);
  }}catch(e){{}}
}})();"#,
                    title = title_j,
                    body = body_j
                );
                let _ = win2.eval(&js);

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
