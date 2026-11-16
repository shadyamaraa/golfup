# GHIN — the official Handicap Index

How the app reads a member's Handicap Index from GHIN, what has to be set
up, and what is not done yet.

## What it is

GHIN is the USGA's handicap service. The Mongolian Golf Association (MGA)
is a member — Federation 188 — and its golfers each have a GHIN number. The
agreement the app runs under is the ADA International Agreement; the login
(an Admin Portal account, held by Hyperspace LLC) is limited to MGA's data.

This is the first step, **reading only**:

- A member can check a GHIN number before saving it: «GHIN шалгах» on the
  profile form shows the name GHIN has under it, the club and the Handicap
  Index.
- The member's Handicap Index is read and stored, and shown on the profile
  as its own tile beside the app's own index.
- An admin can read every member's at once and see the list: Admin →
  Тоглогчид, «GHIN-ээс татах».

It is a **trial**, on GHIN's **staging** environment:

- Staging holds a copy of the real data taken at some earlier date (last
  refreshed 2026-11-12/13), not today's. Everything from it is marked
  «туршилт».
- Only admins see the GHIN parts of the app (`GHIN_STAGE = 'admin'` in
  `src/app.js`). `'all'` shows them to every member, `'off'` to no one.
- The Handicap Index from GHIN does **not** feed a playing handicap. Games
  and tournaments still use the app's own index (`users/{id}/hcpIndex`,
  computed from the rounds entered in the app).

## Where the login is

The association's login can read every golfer's email, phone and date of
birth. It never reaches the browser:

- It lives in Secret Manager as `GHIN_EMAIL` / `GHIN_PASSWORD`.
- Every call to GHIN is made by a Cloud Function (`functions/ghin.js`).
- What leaves the function is trimmed to: number, name, club, association,
  status, Handicap Index (as displayed and as a number), low Handicap
  Index, revision date, withdrawn or not.
- Only a signed-in member may call the functions — they take the member's
  Firebase ID token, like `setPassword` (`docs/phone-login.md`).

## The functions

All three are called at their own address
(`https://us-central1-golfup-app.cloudfunctions.net/...`), not through a
hosting rewrite.

| Function | Who | What |
|---|---|---|
| `ghinGolfer { idToken, ghin }` | any member | Who GHIN has under a number. Nothing is stored. Thirty an hour for each member. |
| `ghinSync { idToken, memberId? }` | a member for themselves, an admin for anyone | Reads the Handicap Index for the GHIN number **on the member's record** and stores it under `ghin/{memberId}`. |
| `ghinSyncAll { idToken }` | admins | The same for every member with a GHIN number — `golfers/search` takes fifty numbers a request. |

`ghin/{memberId}`:

```js
{
  number, found,              // found: false — GHIN has no golfer under the number
  name, club, association, status,
  hi,                         // as GHIN displays it: '12.3', '+1.2', 'NH'
  hiValue,                    // the number behind it; absent when there is none
  lowHi, revDate, withdrawn,
  env,                        // 'staging' | 'production'
  syncedAt
}
```

The database rules give `ghin` to signed-in members to read and to no
client to write, so what it holds is what GHIN said. A record counts only
for the number the member has now (`ghinFor`): after a member corrects or
removes their number, the old record is not shown.

The profile reads the Handicap Index again in the background when the
stored one is more than a day old.

GHIN side, from the spec
(<https://app.swaggerhub.com/apis-docs/GHIN/GHIN2020AllStage/2.0>):

- `POST /users/login.json` `{ user: { email, password, remember_me } }` →
  `{ token }`, good for twelve hours. The function keeps it for ten and
  logs in again on a 401.
- `GET /golfers/search.json?golfer_id=1,2,3&per_page=100&page=1` →
  `{ golfers: [...] }`, one row for each club a golfer belongs to; the home
  club's row is the one read. A row for a club the login has no rights to
  has its number masked (`7*****4`): among several numbers it cannot be
  told whose it is, so those are asked for again one at a time.

## Where the code is

| Part | File |
|---|---|
| The GHIN client, trimming, the three functions' logic | `functions/ghin.js` |
| The functions themselves | `functions/index.js` (`ghinGolfer`, `ghinSync`, `ghinSyncAll`) |
| Which record is a member's, how it reads, what a refusal says (pure) | `src/ghin.js` |
| The browser's calls | `src/store.js` (`ghinCheck`, `ghinSync`, `ghinSyncAll`, `loadGhin`, `loadAllGhin`) |
| The screens | `src/app.js` (`wireProfileForm`, `renderProfile`, `ghinAdminHTML`) |
| Tests | `scripts/test-ghin.mjs`, `scripts/test-ghin-app.mjs`, `scripts/test-rules.mjs` |
| A live check from your own terminal | `scripts/ghin-smoke.mjs` |

## Setup — once

1. **Try the login from your own terminal** (optional, but it shows the
   real answer before anything is deployed). It only reads; the password is
   asked for and not shown:
   ```bash
   git checkout main && git pull origin main
   node scripts/ghin-smoke.mjs 12345678
   ```
   with your own GHIN number. It prints the name, club and Handicap Index,
   and the names of the fields GHIN sent — no one's personal details.
2. **The login, as secrets** (typed into the terminal, never into a file or
   a chat):
   ```bash
   firebase functions:secrets:set GHIN_EMAIL --project golfup-app
   firebase functions:secrets:set GHIN_PASSWORD --project golfup-app
   ```
3. **Deploy the three functions**:
   ```bash
   firebase deploy --only functions:ghinGolfer,functions:ghinSync,functions:ghinSyncAll --project golfup-app
   ```
4. **Try it**, signed in as an admin: Profile → edit → «GHIN шалгах»; the
   profile's GHIN tile; Admin → Тоглогчид → «GHIN-ээс татах» and the list.

| What you see | Meaning |
|---|---|
| «GHIN холболт хараахан идэвхжээгүй байна» | The functions are not deployed, the secrets are not set, or GHIN refused the login |
| «GHIN-д энэ дугаартай тоглогч олдсонгүй» | GHIN has no active golfer under the number — or one the MGA login may not see |
| «GHIN-тэй холбогдож чадсангүй» | GHIN did not answer, or answered with an error |
| «GHIN-ээс шалгахын тулд аппаас гараад дахин нэвтэрнэ үү» | This browser has no member identity — sign in again |
| A name in the admin's list that is not the member's | The member's GHIN number is somebody else's |

## Not done yet

- **A playing handicap from GHIN.** Once the USGA grants production
  (`GHIN_BASE_URL`), the official index can replace the app's own in games
  and tournaments (`gamePlayingHcp` in `src/game-score.js`,
  `src/strokeplay-admin.js`). That is a decision as much as a change.
- **A daily refresh.** GHIN has `golfers/hi_changed_golfers` for exactly
  this; it needs a scheduled function. Today a member's index is read when
  they open their profile (at most once a day) or when an admin reads all.
- **Course data** — ratings, slopes, pars and stroke indexes from
  `courses/search` and `Courses/{id}/TeeSetRatings`. Chinggis Khaan is on
  GHIN (CourseID 29422) and matched the club's card; its coordinates are
  wrong there and it has no women's tee set — both for MGA to fix.
- **Posting scores** (`scores/hbh`). Not in the first phase by agreement.
  `rounds/{ghinNumber}/{gameId}` is already kept in a shape that posts
  (`toGhinScorePayload`).
- **Production.** A separate step with the USGA after the staging
  integration is reviewed.
