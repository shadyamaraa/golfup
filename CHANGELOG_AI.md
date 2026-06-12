# CHANGELOG_AI.md

## 2026-06-12

### Sponsor/ad banner slots in home game list — `src/app.js`, `src/style.css`

PGA Tour app-style advertisement slots between game-list day groups on home:
after the 1st day group and every 3rd after that, plus below the empty state
so the slot is visible without games. Banners are defined in the
`HOME_AD_BANNERS` array (id/href/html) and rotate by slot index via
`adBannerHTML()` — add more entries there to run several. Each slot shows a
tiny centered ADVERTISEMENT label over a full-bleed 96px tappable banner.
Trial creative: Rolex — green gradient, gold crown SVG, serif ROLEX wordmark,
"Official Timekeeper" line, links to rolex.com in a new tab.

### Mobile redesign step 5 (final): profile screen — `src/app.js`, `src/style.css`, `src/i18n.js`

New `#/profile` route (`renderProfile`) replacing the profile modal for normal
use: back-circle header, 92px centered avatar (live-updates when picking an
emoji), name + @username · circles line, stats row (тоглолт/дагагч/дагасан —
games counted from `loadAllGames`, follows from already-loaded state), then
the full former-modal form (овог/нэр/username/утас/нууц үг/банк/IBAN/
мэдэгдэл) with `.btn-main` save and a red-tinted `.btn-line` logout. Save
logic extracted to shared `applyProfileForm` so the forced profile-completion
modal (`showProfileModal({required:true})`) keeps working unchanged. Bottom
nav Профайл and the header avatar now route to `#/profile`; top header hidden
there like home/detail. i18n: `statGames`, `statFollowers`, `statFollowing`,
`logoutBtn`, `infoSection` (mn/en/ko). Also: toggle-label text no longer
inherits the uppercase field-label style.

### Mobile redesign step 4: game detail per prototype — `src/app.js`, `src/style.css`

`renderGameView`/`renderGroupCard` markup restyled to the prototype; join/
leave/delete/invite/booking/follow logic and live `onGameChanged` re-render
untouched. Full-bleed banner header (260px hero art) with back circle and
top-right circles for edit ✏️ / delete 🗑 (creator/admin) and share; banner
title is "Өнөөдөр · 10:00"-style with location pill. Top header hidden on
`#/game/` like home. Booking confirmation shows as a check-icon strip with
the code (creator only). Groups render as `.sec-h` headings ("Групп N" +
x/y бүртгэгдсэн + "+ Урих" creator button or count badge) over numbered crow
rows: 42px avatar, name, role line (★ Зохион байгуулагч / Гишүүн · timeAgo),
follow/bank/remove actions on the right; waiting list and invite statuses in
the same style. Share button opens a bottom sheet with Viber and copy-link
options (new `openShareSheet`, replacing the two inline buttons). Footer
actions are full-width: `.btn-main` join, `.btn-line` leave/book/invite.
New i18n: `shareTitle`, `roleOrganizer`, `roleMember`, `registered`.

### Mobile redesign step 3: create-game screen per prototype — `src/app.js`, `src/style.css`

`renderCreateGame` markup restyled to the prototype; submit/validation/booking
logic and all element IDs untouched. Location `<select>` is now hidden behind
two chips that set its value and dispatch `change` (so the MTBogd section
toggle keeps working). Page gets a back-circle + title header; date/hour/min
in a prototype grid; Нүх 9/18 as chips; tee-time picker opens as a bottom
sheet (`.sheet-overlay`/`.sheet` with handle) instead of a centered popup,
with slot times/tees as chips; visibility radios became `.vis-card` rows
(custom dot, ink border on select, `syncVisCards` replaces inline
border-color juggling); payment radios, invite chips, and selected-slot box
restyled light; submit is a full-width `.btn-main` "⛳ Тоглолт үүсгэх" with a
`.btn-line` cancel under it. New CSS: `.vis-card`/`.vis-dot`/`.vis-title`,
`.btn-dashed`.

### Mobile redesign step 2: Home screen per prototype — `src/app.js`, `src/style.css`, `src/i18n.js`

Home now matches `prototype.html`: full-bleed sunrise hero banner (SVG art,
round UB GOLF logo, tagline, location/date pill) with the top app header
hidden on home only — lang toggle, users and admin links move to translucent
circle buttons overlaid on the hero. Filter tabs sit sticky under the banner.
Game lists render as `.crow` rows (circular course-art thumbnail with palette
picked by location hash, name, ЦАГ/ҮҮСГЭСЭН/КОД meta, overlapping avatar
stack, СУЛ/full badge on the right) grouped under `.sec-h` day headings
(Өнөөдөр/Маргааш + full date) instead of the old card carousel; history and
archive reuse the same rows dimmed. Added a "Бүх тоглолт харах" pill that
switches to the All tab. The hero "Тоглолт үүсгэх" button was removed — the
FAB covers creation. No store/Firebase logic touched; `renderGamesHome`
filtering, sorting, day grouping, and live listeners unchanged. New helpers:
`formatDayHeading`, `heroArtSVG`, `courseThumbSVG`, `renderAvStack` (replaces
`renderPlayerDots`). i18n: `heroLocation`, `spotsShort`, `codeLabel`,
`viewAllGames` (mn/en/ko).

## 2026-06-11

### Mobile redesign step 1: B/W base theme + bottom nav + FAB — `src/style.css`, `index.html`, `src/app.js`, `src/i18n.js`

First implementation step of the approved `prototype.html` design (minimal
black/white, Inter, PGA Tour app inspired):

- `src/style.css` rewritten to the light theme. Legacy token names
  (`--gold`, `--emerald`, `--bg-card`, …) are kept but remapped to B/W values
  so not-yet-redesigned screens stay usable. Added the prototype design-system
  classes (`.utabs`, `.crow`, `.av`, `.badge`, `.chip`, `.btn-main`,
  `.pill-btn`, `.sheet-overlay`/`.sheet`, `.sec-h`) for the upcoming screens.
  Home filter tabs restyled as underline tabs.
- `index.html`: fixed bottom navigation (Нүүр / Тоглолт / Мэдэгдэл / Профайл)
  + blue circular create FAB, both hidden until login; theme-color → #ffffff;
  Inter weight 900 added.
- `src/app.js`: `updateBottomChrome()` syncs nav visibility/active tab and
  shows the FAB only on list screens. Нүүр→home ("mine" tab), Тоглолт→home
  ("all" tab via new `pendingHomeFilter`), Мэдэгдэл→scrolls to notifications
  (blue dot on the icon when unread exist), Профайл→profile modal. Auth screen
  logo switched to `UBGolf_app_icon.png` (main logo has white text, invisible
  on white).
- `src/i18n.js`: `navHome`/`navGames`/`navNotifications`/`navProfile` keys
  (mn/en/ko).

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
