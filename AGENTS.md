# AGENTS.md

This file is the shared working agreement for every AI tool used on this repository.

Tool-specific entry files:

- `CODEX.md` for Codex
- `CLAUDE.md` for Claude Code
- `GEMINI.md` for Gemini / Antigravity

Each tool should read this shared file first, then read its own tool-specific file.

## Project

UB Golf is a single-page vanilla JS golf game organizer backed by Firebase Realtime Database and Firebase Hosting.

The project is often edited from two PCs and multiple AI tools. GitHub is the source of truth.

## Mandatory Workflow

Before changing code:

1. Read `AGENTS.md`, `PROJECT_NOTES.md`, `TASKS.md`, and the relevant tool-specific note (`CODEX.md`, `CLAUDE.md`, or `GEMINI.md`) if present.
2. Run `git status --short`.
3. Make sure you understand whether the current branch is correct for the task.
4. Do not overwrite unrelated user or AI changes.
5. Explain the files you plan to change before editing when the task is not trivial.

After changing code:

1. Run `npm run build`.
2. Run `git diff --check` on changed source files.
3. Summarize changed files, behavior, risks, and verification.
4. Update `CHANGELOG_AI.md` for meaningful code changes.

## Git Rules

- `main` is the stable branch and should stay deployable.
- **Always work on a feature branch. Never commit or push directly to `main`.**
  - `ai/codex-task-name`
  - `ai/claude-task-name`
  - `ai/gemini-task-name`
  - `feature/task-name`
  - `fix/task-name`
- Even if the user asks to work on `main` directly, create a branch, do the work there, push the branch, and ask the user to merge via GitHub.
- `main` receives changes only through GitHub merges, not direct AI pushes.
- Always pull before starting work on a second PC:

```bash
git checkout main
git pull origin main
```

Commit only relevant files. Do not include `dist/`, `node_modules/`, local clones, or unrelated generated files.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Build to dist/
npm run preview   # Preview production build locally
```

Deploy hosting:

```bash
firebase deploy --only hosting
```

Deploy functions only when `functions/` changes:

```bash
firebase deploy --only functions
```

## Architecture

Boot sequence:

`index.html` -> `src/main.js` -> `initStore()` -> `initApp()` -> `router()`

Key files:

- `src/app.js`: all routing, rendering, and UI handlers.
- `src/store.js`: Firebase/localStorage CRUD, notifications, follows, FCM token storage.
- `src/config.js`: Firebase config and app constants.
- `src/i18n.js`: Mongolian/English translations. Add new UI strings to both languages.
- `src/style.css`: app styling.
- `functions/index.js`: Firebase Cloud Function for FCM push notifications.
- `public/firebase-messaging-sw.js`: FCM service worker.

Routes:

- `#/` home and game list
- `#/create` create game
- `#/game/:id` game detail
- `#/join/:id` join redirect
- `#/edit/:id` edit game
- `#/users` player list
- `#/admin` admin panel

## Data Notes

Users:

```js
{
  id,
  name, username, fullName,
  // no password here: it is a hash under userSecrets/{id}, server-only (docs/phone-login.md)
  role, // admin | marshal | user — changed by admins only
  status,
  communities,
  // phone, bankName, bankAccount, bankIban, mtbogdCode are stored under
  // userPrivate/{id} (signed-in members only), not on users/{id}. The store
  // merges them in, so a record read through src/store.js has them.
  phone,
  bankName, bankAccount, bankIban, mtbogdCode,
  avatar,
  notifyWeb, notifySms,
  fcmToken
}
```

GHIN (`ghin/{memberId}`, written by the server only — `docs/ghin.md`):

```js
{
  number, found, // found: false when GHIN has no golfer under the number
  name, club, association, status,
  hi, hiValue, // '12.3' as GHIN displays it, and the number behind it
  lowHi, revDate, withdrawn,
  env, // staging | production
  syncedAt
}
```

A member's scoring record on GHIN (`ghinScores/{memberId}`, written by the
server only; read by the member, an admin, and by others only when
`visibility` is `everyone`):

```js
{
  number, env, syncedAt,
  visibility, // 'everyone' | 'club' — GHIN's own setting for the golfer
  revision,   // the scores the Handicap Index is worked out from, newest first
  recent,     // posted since the last revision
  stats, message
}
// a score: { date, score, used, id, diff, rawDiff, holes, course, tee, rating, slope, type, pcc, exceptional, penalty }
```

Games:

```js
{
  id,
  createdBy, creatorName,
  date, time, location, description,
  groupSize,
  groups,
  waitingList,
  isPrivate,
  targetCommunities,
  invitedIds,
  holes,       // 'full18' | 'front9' | 'back9'
  scoreMode,   // 'normal' | 'comp' (stroke play only)
  format,      // 'stroke' (default when missing) | 'match' | 'skins' | 'stableford'
               // | 'scramble' | 'fourball' | 'foursome' — docs/casual-formats.md
  course,      // { name, rating, slope, par, tee } when known
  // Written by the scorer, path-scoped, and excluded from saveGame():
  // scores, scoreAudit, hcp, pairing, holeOverrides, teamScores
}
```

Tournaments (`tournaments/{id}`, the in-app stroke play node — see
`docs/tournament-cut.md`, `docs/stableford.md`, `docs/tournament-scramble.md`):

```js
{
  format,        // 'stroke' | 'match' | 'ryder' | 'scramble' | 'fourball' | 'foursome'
                 // — tnKind() branches on it; the three team types ride the stroke rails
  logo,          // data URI — the crest; see src/media.js for the size caps
  sponsors,      // [ { name, logo, link } ] — partner organisations, shown as a strip
  guide,         // { text, image } — the удирдамж, opened in a popup
  spScoring,     // 'strokes' (default when missing) | 'stableford'
  spTeamSize,    // scramble only: 2 | 4 (4 when missing)
  spTeamRank,    // scramble only: 'board' (default) | 'match' — two-player teams only
  sp: {
    players: {   // pid → { name, userId?, hcp?, status?, groups: { round: gid } }
                 // a TEAM is a player entry too: { kind: 'team', members: {pid: true}, hcp }
                 // and its members keep their own entries for the flight pointer
    },
    scores,      // pid → round → hole → strokes  (a team's ball lives under its teamKey)
    groups       // round → gid → { number, teeTime, startHole?, players: {pid: true} }
  }
}
```

Notifications:

```js
/notifications/{userId}/{notificationId}
```

`saveNotification()` includes duplicate protection by `gameId + type + from`.

Coaching (`docs/coaching.md`) — a lesson booked with a coach:

```js
coaches/{coachId}                 // { active, bio, place, price30, price60, ... } — admin makes a coach
coachSlots/{coachId}/{slotId}     // { start, minutes, status: 'open'|'booked', price } — slotId = 's' + start
coachBookings/{coachId}/{slotId}  // { playerId, bookedAt, note } — coach, that player and admins only
playerLessons/{playerId}/{key}    // { coachId, slotId, start, minutes } — key = coachId + '_' + slotId
coachChanges/{coachId}/{slotId}   // the player of a booked lesson asks for another time: { playerId, wantStart, note, at }
coachReminded/...                 // server only (functions/coaching.js)
coachPrograms/{coachId}/{id}      // a coach's course or package: { title, level, summary, options, people, thumb, hasPoster, active }
coachPosters/{coachId}/{id}       // its poster, an image data URI — read one at a time, never the whole node
coachEnrollments/{coachId}/{id}/{playerId}  // a member's request to join: { option, label, price, note, at }
playerPrograms/{playerId}/{key}   // the member's own list — key = coachId + '_' + programId
```

Booking and cancelling are each ONE multi-path write (`bookingWrites`,
`cancelWrites` in `src/coaching.js`); the database rules refuse a partial
one from anyone — player, coach or admin (slot `booked` ⇔ a booking ⇔ the
lesson on that player's list). Moving a lesson is one write as well
(`moveWrites` by the player onto an open slot, `approveChangeWrites` by the
coach for a request), and a cancellation takes the lesson's request to
change with it. Programs the same way (`src/coaching-programs.js`):
a request to join and the member's list entry are one write, a program and
its poster are one write, and a program is removed only with its poster and
every request. Keep the poster out of the program record — the list of
programs is read whole. Do not split them into separate writes, and do not put the player's
id on the slot — members read slots, not who booked them.

## Product Rules

- Use `displayUsername(user)` for public/member list names.
- Full name and private info should only appear in detail/admin contexts.
- Circle membership is assigned by admin when creating/editing users.
- When creating games, users can only target their own assigned circles.
- Private games should be visible to creator, joined players, invited players, admin, and marshal.
- All UI strings should go through `t(key)` when practical.

## Do Not Touch Without Explicit Request

- Firebase project IDs and credentials in `src/config.js`.
- `.firebaserc` and deployment target settings.
- `functions/package.json` runtime/dependencies.
- Auth/session localStorage keys.
- Existing deployed functions behavior.

## Safety

- Never run destructive git commands such as `git reset --hard` unless the user explicitly asks.
- Never delete user work to resolve conflicts.
- Keep changes scoped.
- Prefer fixing the direct issue over broad refactors.
