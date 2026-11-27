# PROJECT_NOTES.md

## Project Purpose

UB Golf helps golfers create, join, organize, and manage golf games. It supports player circles, invitations, notifications, admin user management, and Firebase push notifications.

## Current Stack

- Frontend: Vanilla JavaScript + Vite
- Styling: plain CSS in `src/style.css`
- Data: Firebase Realtime Database with localStorage fallback
- Hosting: Firebase Hosting
- Functions: Firebase Cloud Functions, Node.js 22, 1st Gen trigger using `firebase-functions/v1`
- Push notifications: Firebase Cloud Messaging
- Food ordering: menu/tables/orders in RTDB; web kitchen display at `#/kitchen`
- Tournaments: stroke play reads a linked Google Sheet; team match play (M Cup)
  stores hole winners in RTDB and derives everything else — see
  `docs/mcup-match-play.md`
- Kitchen tray app: `tauri-kitchen/` (Tauri v2 desktop app, listens to RTDB `orders`)

## Current Production

- Firebase project: `golfup-app`
- Hosting URL: `https://golfup-app.web.app`
- Custom app URL used in functions/service worker: `https://ubgolf.club`
- GitHub repo: `https://github.com/shadyamaraa/golfup`
- Main branch: `main`

## Important Product Concepts

### Users

Users have `username`, `fullName`, `phone`, `role`, `status`, bank details, notification preferences, and `communities`.

A member's record is in two places: `users/{id}` is the public half, which
anyone can read; `userPrivate/{id}` holds `phone`, `bankName`,
`bankAccount`, `bankIban` and `mtbogdCode`, and the database rules open it
only to a signed-in member. `src/store.js` merges the halves on read and
splits them on write (`src/member-record.js`), so views work with one
record. Never write a private field to `users/{id}` — the rules refuse it.
`role` and `status` are changed by admins only. `npm run test:rules` runs
the rules against the database emulator.

Roles:

- `admin`: full admin access
- `marshal`: operational access, can see all games
- `user`: normal player

Sign-in: a member is found by `phone` and signs in by SMS through
verify.mn — they send one SMS from their own phone to 144773. A password
is the fallback, one link away on the sign-in page; it is a hash under
`userSecrets/{memberId}` that only the functions read, never a field on the
member record. `PHONE_LOGIN_DEFAULT` in `src/app.js` decides which is the
default. Functions: `phoneVerifyStart` / `phoneVerifyCheck` (secret
`VERIFY_MN_API_KEY`), `passwordLogin`, `setPassword`, `migratePasswords`,
`migratePrivateFields`. The sign-in page does not look a phone up itself —
the member list a visitor reads has no phone numbers; the server does.
See `docs/phone-login.md`.

GHIN: a member's official Handicap Index is read from GHIN (the USGA's
handicap service, through the Mongolian Golf Association's login) by the
server only — `functions/ghin.js`, secrets `GHIN_EMAIL` / `GHIN_PASSWORD`,
functions `ghinGolfer`, `ghinSync`, `ghinSyncAll`, `ghinPhoneReport`,
`ghinLinkByPhone`, and `ghinNightly` (a schedule, 02:30: ties new members
found by phone whose name agrees, then reads every index and every
scoring record) — and stored
under `ghin/{memberId}`, which members read
and no client writes. `ghinScores` reads a member's scoring record — the
twenty or so scores the index is worked out from, and the ones posted since
— into `ghinScores/{memberId}`; the profile shows it as «Сүүлийн 20 оноо»
(`src/ghin-scores.js`), and the index over the last year that rides with it
as a chart, «Индексийн өөрчлөлт» (`src/ghin-history.js`). How a member was tied to their golfer (on the proof
of the phone they sign in with) is under `ghinLink/{memberId}`, likewise. It is a trial
on GHIN's staging environment: only admins see it (`GHIN_STAGE` in
`src/app.js`), and it does not feed a playing handicap — games still use
the app's own `hcpIndex`. Never call GHIN from the browser or put its login
in the app. See `docs/ghin.md`.

The members hub: MT Bogd membership (a member's club code,
`userPrivate/{id}/mtbogdCode`) is filled in by a separate project,
`golf-members-hub`, which ties UB Golf's members to MT Bogd's and — once its
admin turns that on — writes the code here through a service account. It
reads and writes both halves of a member record and keeps its own mark
under `hubSync/{id}`, which no rule opens and no browser may read (the mark
is made from the phone). See `docs/members-hub.md`.

### Circles

Circle membership is assigned by admin when creating or editing users.

Club circles:

- Club
- Eagle
- Khan Bogd
- Soyombo
- Star
- JCI
- Vista
- Zaan Terelj

Interest circles:

- Эмэгтэйчүүд
- Сениор
- Булаа

When creating games, users may target only their own assigned circles.

### Games

Game visibility:

- Everyone
- My circles
- Selected circles
- Invited only

Private/invited games remain visible to creator, invited users, joined users, admin, and marshal.

### Notifications

Notifications are stored at `/notifications/{userId}/{notifId}`.

Duplicate protection exists in `saveNotification()` for the same `gameId + type + from`.

FCM push notifications are sent from `functions/index.js`.

### Coaching

Services → «Дасгалжуулагч» (`#/coaching`). An admin makes a member a coach
(Users → «Засах» → the «Дасгалжуулагч» box); the coach opens 30- or
60-minute times and sets prices on `#/coaching/me`; a member books an open
time at once and can cancel until 12 hours before. Payment is outside the
app for now — the next phase is the club's own QPay with the club paying the
coaches. Reminders (a day and two hours before) come from the scheduled
function `coachReminders`, deployed by hand like the other functions.
Times are flexible: the coach opens the same hours for weeks at once
(weekdays × 1–12 weeks), a player books the same hour week after week in
one go, and «Цаг солих» moves a booked lesson — at once onto an open time,
or by a request the coach grants for any other time.

A coach also offers **programs** («Сургалт»): a course or a package with a
poster, a description and prices («10 хичээл», «1 сар», a trial lesson),
made in four steps on `#/coaching/new`. A member opens one and presses
«Бүртгүүлэх» — a request the coach sees with the member's name and phone;
not a booking and not a payment. The poster is an image data URI kept in
its own node (`coachPosters`), not in a storage bucket.
Everything is in `docs/coaching.md`.

### Course map

On the casual game scorer, «Нүхний зураг» **2D / 3D** under the hole title
opens the map of that hole — Mt. Bogd's drone photograph with distances —
over the whole screen (`src/course-map.js`). The map is **not part of this
repository**: it has its own repository and is served from its own Hosting
site in the same Firebase project, `https://course.ubgolf.club/`, published
by hand from the PC that holds the survey data. The app only opens
`?hole=<1..18>&view=<2d|3d>` in a frame. A trial for now: admins only
(`COURSE_MAP_STAGE` in `src/course-map.js`; `'all'` / `'off'`).
Everything is in `docs/course-map.md`.

## Known Cautions

- `src/app.js` is large and contains most UI logic. Keep edits focused.
- PowerShell may display Mongolian text as mojibake, but files can still be UTF-8.
- Do not rename Firebase project IDs or localStorage keys casually; it may break live data/session behavior.
- Functions are currently 1st Gen. Do not migrate to 2nd Gen without planning because Firebase does not upgrade 1st Gen functions directly.

## Useful Checks

```bash
npm run build
git diff --check
git status --short
```

For hosting deploy:

```bash
firebase deploy --only hosting
```

For functions deploy:

```bash
firebase deploy --only functions
```
