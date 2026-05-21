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
  phone, password,
  role, // admin | marshal | user
  status,
  communities,
  bankName, bankAccount, bankIban,
  avatar,
  notifyWeb, notifySms,
  fcmToken
}
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
  bookingStatus
}
```

Notifications:

```js
/notifications/{userId}/{notificationId}
```

`saveNotification()` includes duplicate protection by `gameId + type + from`.

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
