# UB Golf — Kitchen Tray App

A small desktop tray application for the golf club kitchen. It listens to the
UB Golf Realtime Database `orders` node and alerts staff (native notification +
sound) whenever a new paid order arrives — even when the window is hidden in the
system tray.

It connects to the **same Firebase project** as the web app (`golfup-app`) and
shows the same orders as the web kitchen display (`#/kitchen`).

## Behavior

- Listens to `orders` in real time.
- New order = `status === "paid"` and `notified === false`:
  - plays a two-tone beep,
  - shows a native OS notification,
  - marks the order `notified: true` so it only alerts once.
- Orders that arrived while the app was closed appear in the list on startup
  but do **not** beep (no startup beep storm).
- "Дууссан ✓" sets the order `status: "completed"`, removing it from the list
  (same effect as the web kitchen display).
- Closing the window hides it to the system tray; the app keeps listening.
  Quit fully from the tray menu.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Platform build dependencies — see
  https://tauri.app/start/prerequisites/
  - **Windows:** Microsoft C++ Build Tools + WebView2 (preinstalled on Win 10/11).
  - **macOS:** Xcode Command Line Tools.
  - **Linux:** `webkit2gtk-4.1`, `librsvg2`, etc.

## Develop

```bash
cd tauri-kitchen
npm install
npm run dev      # tauri dev
```

## Build a distributable

```bash
cd tauri-kitchen
npm install
npm run build    # tauri build
```

The installer/binary is written to `src-tauri/target/release/bundle/`
(e.g. an `.msi` / `.exe` on Windows).

## Notes

- The Firebase config is embedded in `src/main.js` (public web config, same as
  the web app). No secrets are stored here.
- Requires network access (Realtime Database + Firebase SDK loaded from the
  gstatic CDN).
