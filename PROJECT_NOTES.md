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

## Current Production

- Firebase project: `golfup-app`
- Hosting URL: `https://golfup-app.web.app`
- Custom app URL used in functions/service worker: `https://ubgolf.club`
- GitHub repo: `https://github.com/shadyamaraa/golfup`
- Main branch: `main`

## Important Product Concepts

### Users

Users have `username`, `fullName`, `phone`, `role`, `status`, bank details, notification preferences, and `communities`.

Roles:

- `admin`: full admin access
- `marshal`: operational access, can see all games
- `user`: normal player

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
