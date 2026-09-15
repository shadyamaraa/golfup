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

## Branch Lifecycle

A branch lives for exactly one piece of work and does not outlive it:

1. Cut it from an up-to-date `main` — `git checkout main && git pull origin main`.
2. Do the work, push the branch, open a PR.
3. The owner merges on GitHub, and GitHub deletes the head branch
   (Settings → General → Pull Requests → *Automatically delete head branches*).
4. Every clone runs **`npm run tidy`** to catch up: it prunes, fast-forwards
   `main`, and deletes the local branches whose remote is gone.

`npm run tidy` refuses to run on a dirty tree, never touches `main` or the
branch you are standing on, and prints each deleted branch with its commit, so
`git branch <name> <sha>` brings one back. A branch that was never pushed has
no upstream and is left alone.

Nothing else is expected to accumulate: after a merge the repository should
show `main` and nothing more.

## Deploy

**Production deploys on a marker, not on every merge.** The workflow
`.github/workflows/production-deploy.yml` runs only when the commit landing on
`main` has **`[deploy]`** in its message — so the merge commit title must
carry it:

```
Merge pull request #123: <title> [deploy]
```

A merge without the marker updates `main` and ships nothing. After the run,
confirm both hosts serve the same new bundle:

```bash
curl -s https://ubgolf.club/        | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
curl -s https://golfup-app.web.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

Other pipelines:

- **Preview** — any push to a `claude/**` branch publishes a 7-day preview
  channel (`.github/workflows/preview-deploy.yml`).
- **Database rules** — deployed by the production workflow alongside hosting.
- **Cloud Functions are NOT in CI.** `functions/` changes ship only when the
  owner runs `firebase deploy --only functions` by hand. Say so explicitly
  whenever a change touches `functions/`.

## Sessions

One AI session per project, named after the project rather than after the first
task it happened to start with — a session that has run for weeks is impossible
to find under the name of its first feature.

- Keep the working agreement in this repository, not in a session's memory: a
  new session must be productive after reading `AGENTS.md`, `PROJECT_NOTES.md`
  and `TASKS.md`, with no oral history.
- Archive a session once its project's work is done or it is superseded.
- Anything learned that a future session would need — a marker like `[deploy]`,
  a verification routine, a gotcha — belongs in these files on the way past.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Build to dist/
npm run preview   # Preview production build locally
npm run test:mp   # Run the pure-module test suites
npm run tidy      # Prune merged branches, fast-forward main
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
