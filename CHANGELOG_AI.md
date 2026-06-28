# CHANGELOG_AI.md

## 2026-06-28

### UX improvements batch (high-impact quick wins from docs/ux-improvements.md)

- **Waiting-list position** (`src/app.js` `renderGameView`): when the current
  user is on a game's waiting list, a banner shows their spot ("Та хүлээлгийн
  жагсаалтын N-р байранд") via `waitlistBannerText` (mn/en/kr).
- **Order tracking** (`renderOrderDetail`): 2-step tracker → 4-step
  Захиалсан → Төлсөн → Бэлдэж байна → Бэлэн, with a pulsing "current" step.
  New `#/orders` "Миний захиалга" view (`renderMyOrders`) listing the user's
  orders with status chips, plus a shortcut button on the home hero.
- **Game cards** (`renderGamesCards`): slot progress bar + "N дагадаг" social
  proof for players the user follows.
- **Join friction** (`renderGameView`): one-click join — the confirm modal is
  dropped since the description already shows on the detail page.
- **Empty state** (home): added a "Тоглолт үүсгэх" CTA under the empty message.
- **Kitchen bump** (`renderKitchenDisplay`): tapping "Дууссан ✓" smooth-scrolls
  to and flashes the next active order.
- `src/i18n.js`: keys myOrders, noOrdersYet, trackOrdered/Preparing/Ready,
  followingHere, createFirstGame (mn/en/kr).
- `src/style.css`: slot progress, status chips, waitlist banner, current-step
  pulse, kitchen-bump flash.

## 2026-06-19 (3)

### Rename desktop app to "UB Golf Club" + new icon + robust popup position

- `tauri-kitchen/src-tauri/tauri.conf.json`: `productName` "UB Golf Kitchen" →
  "UB Golf Club"; main window title → "UB Golf Club".
- `tauri-kitchen/src-tauri/src/lib.rs`: tray tooltip → "UB Golf Club"; popup
  now positions against `current_monitor()` (falling back to `primary_monitor`)
  and accounts for the monitor origin, so it lands top-right of the active
  display instead of drifting to 0,0.
- `tauri-kitchen/src-tauri/icons/*`: regenerated the full icon set from
  `public/UBGolf_app_icon.png` (the UB Golf Club logo).

## 2026-06-19 (2)

### Kitchen floating popup now uses a locally bundled page

- `popup.html` (new, repo root): standalone always-on-top toast for the Tauri
  kitchen app. Reads injected `window.__ORDER_TITLE__`/`__ORDER_BODY__`, plays a
  double beep, and on click invokes the `open_main` command.
- `vite.config.js`: added `popup.html` as a second rollup input so it ships in
  `dist/` and is served from `tauri://localhost/popup.html`.
- `tauri-kitchen/src-tauri/src/lib.rs`: `show_order_popup` now loads
  `WebviewUrl::App("popup.html")` (instead of the flaky `data:` URL that
  WebView2 sometimes refused to render) and passes order text via
  `initialization_script`. Added `open_main` command; removed the 800ms
  `Focused(true)` click hack — the popup now opens the main window via a real
  IPC call on click.
- `tauri-kitchen/src-tauri/capabilities/default.json`: added `popup-*` to
  `windows` so popup windows can invoke `open_main`.
- Net effect: the green popup reliably floats above the ERP/cashier window
  without stealing keyboard focus, and clicking it opens the kitchen window.

## 2026-06-19

### Food menu image fixes + orderNotes + preview deploy workflow

- `scripts/seed-asem-menu.js`: imageUrl paths changed from `/food/<slug>.jpg` to
  `https://raw.githubusercontent.com/shadyamaraa/golfup/main/public/food/<slug>.jpg`
  so images load without a hosting deploy.
- 22 items with dark (CMYK-inverted) or mismatched photos had `imageUrl` reset to `''`
  (🍽️ placeholder shown instead).
- `src/app.js` + `src/i18n.js`: Added `orderNotes` textarea to food order checkout modal.
  Value is persisted to RTDB, shown in `#/orders/:id` detail view, and shown as
  💬 note in the kitchen display card.
- `.github/workflows/preview-deploy.yml`: New workflow that auto-deploys to a Firebase
  Hosting preview channel on every push to `claude/**` branches. Requires
  `FIREBASE_SERVICE_ACCOUNT` GitHub secret.

## 2026-06-18 (2)

### Add food photos from QR menu PDF

- Extracted 59 JPEG food images from `QR_May_23_2025.pdf` using `pdfimages -j`.
- Placed them in `public/food/<slug>.jpg` with kebab-case slug names matching menu items.
- Added `imageUrl` field to every item in `scripts/seed-asem-menu.js`:
  - 59 items get `/food/<slug>.jpg` (visually matched to QR PDF photos).
  - Remaining items get `imageUrl: ''` (no QR photo available — 🍽️ placeholder shown).
- Seed record object updated to persist `imageUrl: item.imageUrl || ''`.
- **Action required**: run `node scripts/seed-asem-menu.js` to push imageUrl values to Firebase.

## 2026-06-18

### Food menu — image-rich item cards + admin image/description fields

- Menu items gained two optional fields: `imageUrl` (photo) and `description`
  (ingredients/notes). `saveMenuItem` already persists the whole object, so no
  store change was needed.
- Customer menu (`renderFoodOrder`) redesigned from a plain list into modern
  food-delivery-style cards: 84px photo (or 🍽️ gradient placeholder when no
  image), name + EN name, 2-line clamped description, gold price, and a +/−
  stepper. New `.food-card*` styles in `src/style.css`.
- Admin menu tab (`renderAdminMenuTab`): added Image URL input with live
  preview and a Description textarea; item rows now show a 44px thumbnail and an
  "(идэвхгүй)" flag. Wired up the previously-dead ✏️ Edit button — it now loads
  the item into the form and saves in place (preserves `id`/`sortOrder`).
- Image URLs accept any source (external host or local `/menu/...` path);
  broken images fall back to the placeholder via `onerror`. No Firebase config
  or new dependencies.
- New i18n keys (mn/en/kr): `itemImageUrl`, `itemDescription`,
  `itemDescPlaceholder`.

## 2026-06-17

### Food ordering Phase 2 — Kitchen tray app (Tauri v2)

New `tauri-kitchen/` desktop app (Tauri v2 + vanilla JS, buildless frontend).
- Listens to RTDB `orders` via the Firebase JS SDK (same `golfup-app` project).
- New paid order (`status === "paid" && notified === false`) → two-tone WebAudio
  beep + native OS notification (sent from Rust via `tauri-plugin-notification`),
  then marks `notified: true` so it alerts once. Startup catch-up orders show in
  the list but do not beep.
- System tray icon with Show/Quit menu; closing the window hides to tray and
  keeps listening; `tauri-plugin-single-instance` focuses the existing window.
- "Дууссан ✓" sets order `status: "completed"` (mirrors the web kitchen display).
- Rust deps resolved: tauri 2.11, notification 2.3, single-instance 2.4.
- Build instructions in `tauri-kitchen/README.md` (final binary built on the
  target OS — Linux CI lacks webkit so it is not compiled here).

### Food ordering Phase 1 — switch orders to RTDB, permission + login fixes

**Fixes (post-testing):**
- `src/store.js`: Moved `orders` from Firestore to RTDB — Firestore API was never enabled on the project. `createOrder`, `updateOrderStatus`, `loadOrder`, `onOrdersChanged` now use RTDB; removed all `firebase/firestore` imports and the `isFirestoreReady` helper.
- `src/app.js`: Kitchen display reads numeric `createdAt` (was Firestore `Timestamp.toDate()`); removed the dead Firestore-not-ready guard screen.
- `database.rules.json` (new) + `firebase.json`: `menu`/`tables` rules used `auth != null`, but the app has no Firebase Auth login so reads were always denied — set to `true` and added `orders` node. Wired RTDB rules into deploy config.
- `KITCHEN_PASSWORD` secret had a trailing newline (login always failed); re-set without newline and redeployed `kitchenLogin`.

### Food ordering Phase 1 — menu, ordering, kitchen display

**New features:**
- `src/store.js`: Added Firestore (`getFirestore`) for `orders` collection. New functions: `loadMenu`, `saveMenuItem`, `deleteMenuItem`, `loadTables`, `saveTable`, `deleteTable`, `createOrder`, `updateOrderStatus`, `loadOrder`, `onOrdersChanged`. Menu and tables stored in RTDB; orders in Firestore.
- `src/app.js`: New routes `#/menu`, `#/order/:gameId`, `#/orders/:id`, `#/kitchen`. Food order button added to game detail view. `renderFoodOrder()` — popular items shown first, others collapsible; cart with stepper. `showCheckoutModal()` — delivery location (restaurant table with floor plan, outdoor, course/marshal), pickup time (ASAP or scheduled datetime), customer name/phone auto-filled from current user. `renderOrderDetail()` — deeplink target for Tauri. `renderKitchenDisplay()` — password-protected real-time orders list; beep on new order; mark done button. `renderAdminMenuTab()` — add/delete menu items (popular flag, available toggle, category, EN name), add/delete tables.
- `src/app.js`: Admin panel gets new "🍽️ Цэс" tab.
- `src/i18n.js`: Added food ordering keys in mn/en/kr.
- `functions/index.js`: Added `kitchenLogin` function (KITCHEN_PASSWORD secret).
- `firebase.json`: Added `/api/kitchen-login` → `kitchenLogin` rewrite.

**Fixes:**
- Removed bookingId diagnostic text from game detail view.

## 2026-06-12

### MTBogd player sync fixes — `src/app.js`, `src/booking.js`

- Fixed proxy body forwarding: PATCH/PUT requests were arriving with empty body at MTBogd. Now `functions/index.js` forwards body for all non-GET methods.
- Fixed player names: `handleJoin` and `handleAddPlayer` were storing `displayUsername` (username) instead of `displayFullName` (full name) in player objects and sync calls.
- Fixed `handleAddPlayer`: MTBogd sync was missing entirely from the creator's direct "add player" flow. Now syncs on all join/leave/kick/add paths.
- All sync calls now resolve player names via `allUsersMap[p.id]` lookup so existing records with stale usernames still send correct full names.

### MTBogd booking edit warning — `src/app.js`, `src/i18n.js`

When editing a game that has an MTBogd booking, changing date/time/location now shows a confirmation dialog warning that the MTBogd booking will NOT be automatically updated. User must confirm before saving.

## 2026-06-09

### Sync MTBogd booking player list on join/leave/kick — `src/booking.js`, `src/app.js`

Added `updateBookingPlayers(bookingId, players)` to `src/booking.js` which calls
`PATCH /api/mtbogd/bookings/:bookingId/players` (proxied to MTBogd external API).
Called from `handleJoin` (only when player lands in a group, not waiting list),
`handleLeave`, and `handleRemovePlayer` whenever `game.bookingId` is set.
Errors are non-fatal — game is always saved to Firebase first; a warning toast
shows if the MTBogd sync fails.

## 2026-06-07

### Tee-time slots → popup picker; remove cart selector — `src/app.js`

In game creation, the available tee-times no longer render as a long inline
list inside the form. The "Боломжит цаг харах" button now opens a popup
(reusing the `.popup-overlay` + `.glass-card` pattern); picking a time fills the
manual hour/minute picker and closes the popup. The Нүх (9/18) control stays
inline. The Тэрэг (cart) selector was removed from both the create form and the
game-detail booking popup (`handleBookTeeTime`); `createHold` now uses its
default `cartCount = 0`.

### Secured MTBogd API behind a server-side proxy — `functions/index.js`, `firebase.json`, `src/booking.js`

The MTBogd external API now requires an `x-api-key`. To avoid exposing the
live key in the client bundle, all booking calls go through a Firebase
Function proxy (`mtbogdProxy`) reachable at `/api/mtbogd/*` via a hosting
rewrite. The proxy injects the key (stored in Cloud Secret Manager as
`MTBOGD_API_KEY`) and forwards to the MTBogd `external/v1/*` endpoints.
`src/booking.js` calls the same-origin proxy; no key in frontend code.
`getPublicSettings()` still hits the public `settings/public` endpoint
directly (no key needed).

### Added `handleBookTeeTime(game)` — `src/app.js`

Added the missing function body for the "⛳ Book Tee Time" button that already existed in the game detail view. The modal lets the creator select holes (9/18), cart count, fetch available tee time slots from the MTBogd API, pick a slot, and confirm the booking. On success, `bookingCode`, `bookingId`, and `bookingSlotId` are saved to the game via `store.saveGame` and the view re-renders.

## 2026-06-05

### Tool
Claude Code

### Branch
feature/mtbogd-booking

### Changed Files
- `src/config.js`
- `src/booking.js` (new)
- `src/app.js`
- `src/i18n.js`

### Summary
MTBogd Golf Course booking integration (preview channel only — not yet merged to main). Three parts:
1. **`src/booking.js`** — API helpers for MTBogd public guest endpoints: `getPublicSettings()`, `getTeeTimes(date, players, holes)`, `createHold(slotId, players, holes, cartCount)`, `confirmBooking(holdId, customer, players, notes)`.
2. **Game creation tee-time picker** — when "Sky Resort Golf Club" is selected, a section appears with holes (9/18), cart count, and "Боломжит цаг харах" button. Slots load from MTBogd API; selecting one auto-fills the time. On game submit: hold is created → booking confirmed → `bookingCode`/`bookingId`/`bookingSlotId` stored in the game. Booking code shown in game detail for creator.
3. **Standalone booking view** (`#/booking`) — date / players / holes / cart pickers, slot grid, customer name+phone+notes form, booking confirmation with code display. Linked from home screen hero button.

### Risk
Medium. New external API dependency (MTBogd Cloud Functions). No changes to Firebase data model for existing games. Booking fields (`bookingCode` etc.) are additive. Preview channel URL: https://golfup-app--mtbogd-preview-v3mu79tt.web.app

Track meaningful AI-assisted changes here so work done across two PCs and multiple tools stays understandable.

## 2026-06-02

### Tool
Claude Code

### Branch
claude/beldey-nguk4

### Changed Files
- `src/app.js`
- `src/i18n.js`

### Summary
Game history/archive lifecycle. Past games now stay in the "History" section for 7 days, then move to a new collapsible "Archive" section on the home screen (computed by date — no data model or background job changes). Past and archived games can no longer be deleted: the delete button is hidden on past games and `handleDelete` guards against deleting any game whose start time has passed. Added `gameArchive` / `noArchive` / `cannotDeletePast` i18n keys (MN/EN/KR).

### Risk
Low. Additive UI section + delete guard; no data model change.

## 2026-05-21

### Tool
Codex

### Branch
main

### Changed Files
- `AGENTS.md`
- `CODEX.md`
- `CLAUDE.md`
- `GEMINI.md`
- `PROJECT_NOTES.md`
- `TASKS.md`
- `CHANGELOG_AI.md`

### Summary
Added shared AI workflow notes and separate tool-specific instructions for Codex, Claude Code, and Gemini/Antigravity. Documented Git workflow, architecture, product concepts, and backlog.

### Risk
Low. Documentation-only change.
