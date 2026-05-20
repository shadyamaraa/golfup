# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (hot reload)
npm run build     # Build to dist/
npm run preview   # Preview production build locally
```

Deploy to Firebase Hosting after building:
```bash
firebase deploy --only hosting
```

There are no lint or test scripts configured.

## Architecture

**GolfUp** is a Viber-group golf game organizer — a single-page vanilla JS app with hash-based routing, backed by Firebase Realtime Database with a localStorage fallback.

### Boot sequence

`index.html` → `src/main.js` → `initStore()` → `initApp()` → `router()`

### Key files

| File | Role |
|------|------|
| [src/app.js](src/app.js) | All view rendering, routing, and UI event handlers (~1,400 lines) |
| [src/store.js](src/store.js) | Firebase + localStorage CRUD; real-time listeners |
| [src/config.js](src/config.js) | Firebase credentials + app constants (`defaultGroupSize`, `waitingListThreshold`, etc.) |
| [src/i18n.js](src/i18n.js) | Mongolian/English translations; `t(key)` is the translation function |
| [src/style.css](src/style.css) | Dark glassmorphism theme (emerald + gold palette, no CSS framework) |

### Routing

Hash-based. The `router()` function in [src/app.js](src/app.js) reads `window.location.hash` and renders the matching view into `#app`. Routes:

- `#/` — home (game list)
- `#/create` — create game
- `#/game/:id` — game detail
- `#/join/:id` — join via shared link
- `#/edit/:id` — edit game
- `#/users` — player list with bank details
- `#/admin` — admin panel

All routes except join require authentication (stored in `localStorage` as `currentUser`).

### Data model

**Games** (Firebase path: `/games/:id`):
```js
{
  id, name, date, time, endTime, location,
  groupSize,            // players per group
  groups: [{ players: [userId, ...] }],
  waitingList: [userId, ...],
  createdBy, createdAt
}
```

**Users** (Firebase path: `/users/:id`):
```js
{
  id, name, phone, password,  // plain-text password
  role,                        // 'admin' | 'user'
  bankName, bankAccount,
  status                       // 'active' | 'inactive'
}
```

### State management pattern

`store.js` exposes async functions for CRUD. Real-time updates use Firebase `onValue` listeners: `onAllGamesChanged(callback)` and `onGameChanged(id, callback)`. When Firebase is not configured, all operations fall back to localStorage.

### Group logic

- Players join a waiting list first.
- When `waitingList.length >= waitingListThreshold` (default 3), a new group is auto-created.
- When a player leaves a group, the first waiting-list player is moved in automatically.
- A game becomes read-only 1 hour after its start time.
- Time-conflict detection enforces a 2-hour buffer between a player's games.

### i18n

All UI strings go through `t(key)` from [src/i18n.js](src/i18n.js). Language is toggled via a header button and persisted to `localStorage`. Add new keys to both `mn` and `en` objects in i18n.js.

### UI rendering

Views are rendered by calling a `render*` function that sets `document.querySelector('#app').innerHTML = \`...\`` with a template literal. Event listeners are attached after each render via `document.addEventListener` delegated clicks or direct `querySelector` bindings inside the render function.
