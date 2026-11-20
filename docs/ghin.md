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
- The member's **scoring record** is read and shown on the profile as
  «Сүүлийн 20 оноо»: the scores the Handicap Index is worked out from, the
  ones it counts marked, and above them the scores posted since (below).

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
| `ghinScores { idToken, memberId? }` | a member for themselves, an admin for anyone | Reads the scoring record for the GHIN number on the member's record and stores it under `ghinScores/{memberId}`. An answer less than ten minutes old is given back without asking GHIN again. |
| `ghinPhoneReport { idToken }` | admins | Who can be found on GHIN by the phone they sign in with (below). Counts and candidates; nothing stored. |
| `ghinLinkByPhone { idToken, links: [{ memberId, number }] }` | admins | Ties the members found that way to their golfers. The server reads each golfer's phone again and ties only where it is the member's own. |
| `ghinNightly` | no one — a schedule, 02:30 in Ulaanbaatar | The night's round (below): ties the new members found by phone whose name GHIN's also bears out, then reads every Handicap Index afresh. |

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

## The scoring record — «Сүүлийн 20 оноо»

A Handicap Index is the average of the best eight of a golfer's last twenty
score differentials. GHIN calls those twenty the **revision scores**, marks
the ones that count (`used`), and keeps the scores posted since the last
night's revision apart (**recent scores**) until the next one takes them in.

`ghinScores/{memberId}`:

```js
{
  number, env, syncedAt,
  visibility,     // 'everyone' when GHIN says anyone may see the record, else 'club'
  revision: [],   // the revision's scores, newest first (25 at most)
  recent: [],     // posted since — not in the index yet (20 at most)
  stats,          // { count, low, high, average } — GHIN's own; absent when it has none
  message,        // what GHIN says when it will not show the record; absent otherwise
  withheld        // true: the scores were kept back (below); absent otherwise
}
// one score — a field GHIN left out is left out:
{ date, score, used, id, diff, rawDiff, holes, course, tee, rating, slope, type, pcc, exceptional, penalty }
```

`score` is the adjusted gross score, `diff` the score differential as GHIN
counts it, `rawDiff` what it was before an adjustment (kept only when the
two differ — an exceptional score takes 1.0 off each of the last twenty),
`type` GHIN's own letter (H home, A away, T tournament, C combined
nine-hole scores…). For a nine-hole score `diff` is the eighteen-hole
differential GHIN makes of it (`adjusted_scaled_up_differential`) where it
sends one — read off the field names; not yet seen on a real nine-hole
score. Hole-by-hole scores and everything about the golfer stay on the
server.

GHIN side: `GET /golfers/{number}/scores.json?source_golfer_id={number}` →
`{ revision_scores: { scores }, recent_scores: { scores },
score_history_stats, scoring_record_visibility,
scoring_record_visibility_message }` — both lists in one request. Where
GHIN refuses that one, the lists are asked for on their own
(`golfers/{number}/revision_scores`, `…/recent_scores`; the recent ones are
then optional). Tried against staging from the owner's terminal
(2026-11-20, `scripts/ghin-smoke.mjs`): the one request answers for the
association's login — twenty revision scores, eight counted, the record
shown to everyone. The same golfer in the GHIN app had two newer rounds and
another index: staging's copy ended the day before them.

Who reads it (database rules): the member their own, an admin anyone's,
another member only a record whose `visibility` is `everyone` — GHIN lets a
golfer keep their scoring record to their club (`club_only`), and the app
keeps to that. Nobody reads the whole node at once; no client writes it.

**Whose record it is.** The GHIN number on a member's record is theirs to
type (it is on the public half, which a client writes), so it proves
nothing: a member could type another golfer's. A record GHIN shows to
everyone needs no proof — anyone may see it there too. A record kept to the
golfer's club is stored, and given to the member, only where the server
itself tied the member to that golfer (`ghinLink/{memberId}` with the same
number — the phone they sign in with). Otherwise the scores are **kept
back**: what is stored and answered has no scores and no `stats`, and
`withheld: true`; the member is told their number is not verified. An admin,
who reads for the association, is still answered in full — but what is
stored is the record without scores, so the member cannot read it there,
and an admin's next look asks GHIN again.

In the app (`src/ghin-scores.js`, `mountGhinScores` in `src/app.js`), for
whoever sees the GHIN parts (`GHIN_STAGE`):

- **Profile**: «Сүүлийн 20 оноо» under the tiles — the score, the course,
  date · tee · rating/slope · type, and the differential; the ones the index
  counts are marked with a star and a bar down the left, as in GHIN's own
  app; scores posted since are tagged «шинэ», an exceptional score «E», a
  penalty score «P»; an adjusted differential has the adjustment under it
  («−1.0»). Five rows, then «Бүгдийг харах».
- **Home screen**: first thing under the greeting, as GHIN's own app opens
  — «Handicap Index»: the index, the low index and the latest score as
  tiles, then the revision's scores as a board of cells (the day, the
  score, the differential), two rows of ten, the ones the index counts
  filled in (`ghinHomeHTML`, `renderHomeGhin`). A score posted since is not
  on the board — it is not in the index yet — but is the latest-score tile
  and is counted in the board's heading («+1 шинэ»). «Бүгд» and the board
  lead to the full list on the profile. Not there for a member with no GHIN
  number.
- **A player's details** (Тоглогчид → a name): «GHIN оноо» opens the same
  list for that player. Only an admin's opening it reads GHIN; another
  member sees what is stored, if the record is open to everyone.
- What is stored is shown at once; when it is more than a day old it is
  read again in the background.

Not in the night's round: a record is read when its member opens their
profile, or an admin opens it. Before the list is shown to every member
(`GHIN_STAGE = 'all'`) the night's round should read them all.

### Why a number here is not the number in the GHIN app

Two different things can be meant:

- **«HCP индекс»** on the profile is the app's own index, worked out from
  the rounds scored *in UB Golf* (`users/{id}/hcpIndex`, `src/handicap.js`).
  It has nothing to do with GHIN and will differ from it for anyone who
  posts scores to GHIN that were not played through the app, or the other
  way round.
- **«GHIN HI»** and «Сүүлийн 20 оноо» come from GHIN's **staging**
  environment while they are marked «туршилт»: a copy of the real data
  taken on some earlier date. A score posted in the GHIN app since that copy
  is not there, and the index has not moved with it. The revision date on
  the GHIN tile and the dates in the list say how old the copy is. Only
  production access from the USGA (`GHIN_BASE_URL`) makes the two agree.

## Courses — the app's list against GHIN's

A score differential is `(113 / slope) × (score − rating)`: it agrees with
GHIN's only when it is worked out from GHIN's rating and slope for the tee
played. And a score is posted under GHIN's own course id and tee-set id,
not a name. So the app's course list (`src/courses.js`, typed from the
clubs' scorecards) has to agree with the course as GHIN keeps it. It does
not everywhere: on screens of GHIN's own app Mt. Bogd is Blue 71.4 / 131
and White 69.4 / 127, where the app has 71.5 / 130 and 69.4 / 128.

GHIN side (`functions/ghin.js`: `findCourses`, `courseById`, `trimCourse`):

- `GET /courses/search.json?name=…` → `{ courses: [{ CourseID, CourseName,
  FacilityName, City, State, Country, CourseStatus, … }] }` — a facility's
  or a course's name, the world over.
- `GET /courses/{id}.json` → `{ Facility, CourseId, CourseName, TeeSets: [{
  TeeSetRatingId, TeeSetRatingName, Gender, TotalPar, Ratings: [{ RatingType:
  Total | Front | Back, CourseRating, SlopeRating, BogeyRating }], Holes: [{
  Number, Par, Allocation, Length }] }] }` — a tee set is rated for men or
  for women; par and stroke allocation come with each tee set.

**The comparison** is read from your own terminal — it only reads, and
nothing in it is personal:

```bash
node scripts/ghin-courses.mjs
```

For each course of the app it finds the GHIN course (Chinggis Khaan by its
id, 29422; Mt. Bogd by a search — when a search finds several it lists them
and asks for `sky=<id>`), prints every tee set GHIN has with its id, rating
and slope, and what differs from the app (`src/ghin-course.js`,
`courseDiff`): a tee's rating or slope, a tee GHIN has no rating for, a
hole's par or stroke index — men's and women's cards apart. An app tee is
matched to the GHIN tee set of its colour rated for its gender (`gold` is
men's, `goldLadies` and `red` women's); a rating is not carried from one
gender to the other. `--find "name"` only searches.

Written from GHIN's spec; the course requests have not been tried with the
association's login yet. What follows once they are: `src/courses.js` takes
GHIN's numbers where they differ (a decision — a playing handicap moves with
them) and carries the GHIN course and tee-set ids a posted score needs.

## Tying a member to their golfer — the phone trial

Today a member is tied to GHIN by a GHIN number typed on their record, by
them or by an admin. That is fine for showing an index and not good enough
for posting scores: a mistyped or borrowed number would send a member's
scores to somebody else's record.

The app has one thing that is proven: the phone number a member signs in
with (the SMS). GHIN holds a phone for a golfer too. «Утсаар хайх» in the
admin's GHIN card (`ghinPhoneReport`) measures whether that is enough to
tie the two:

- For members who **have** a GHIN number: is the phone GHIN holds for that
  golfer the member's own — the same, another, none, or the golfer not
  found.
- For members who have **none**: is there a golfer with their phone?
  Exactly one is a candidate (shown with the name GHIN has); several are
  listed apart; a candidate whose number another member already has is
  marked.

What GHIN allows shapes how it is done. Tried against staging, 2026-11-17:

| Asked | Answer |
|---|---|
| `golfers/search?phone_number=…` | refused — a search is by GHIN number, or a last name with a state, country, association or club |
| `golfers/search?last_name=%&association_id=…` | 400 — «last_name should contain at least 3 characters with the use of wildcards» |
| `clubs/{id}/golfers` for the members' own club (Mongolian Golf Club) | the roster, 342 golfers — **without phones** |
| `clubs/{id}/golfers` for a club of another association | 404 AccessDenied |
| `golfers/search?golfer_id=…` | the golfers **with** their phones |

So the report goes: the association most linked members are in (by their
home club's row — a golfer on staging may also have a row in some other
association's test club) → its clubs (`associations/{id}/clubs`, or failing
that the clubs the linked members are in) → each club's roster, for the
GHIN numbers (a roster calls one `id`) → those numbers searched fifty at a
time for the phones. The phones are compared on the server; a phone counts
when it reads as the same Mongolian number however it was typed
(`99119007`, `+976 9911 9007`).

A step GHIN refuses is passed over and shown with GHIN's own words; the
card says which rosters were read and how many of their golfers have a
phone. Under the first count it names the members for whom GHIN holds
another phone, or none — a tie worth a second look, since a number that
is somebody else's shows up there. It only reads; no phone number is in the
answer, and a failure stays on the page with its reason.

Result (staging, 2026-11-17): of 95 linked members, for 77 the phone on
GHIN is their own, 14 another, 4 none; of 52 members without a GHIN
number, 36 were found by phone — one golfer each — and 16 were not. The
roster read was Mongolian Golf Club, 342 golfers, 304 with a phone.

### Tying the members found

The candidates come with a tick each (a number another member already has
cannot be ticked) and «Сонгосныг холбох». The ticked `{ memberId, number }`
pairs go to `ghinLinkByPhone`, which does not take the screen on trust: it
reads those golfers from GHIN again and ties a member only when the phone
GHIN holds for that number is the phone on the member's record. Each tie
is refused on its own, with a reason — the member has another number, the
number is another member's, the phone differs, GHIN has no such golfer.

A tie is three writes in one: the GHIN number on the member's record
(`users/{id}/ghinNumber`), what GHIN said of the golfer (`ghin/{id}`, as a
sync would), and how the tie was made —

```js
ghinLink/{memberId}: { number, by: 'phone', at, admin }        // an admin tied it
ghinLink/{memberId}: { number, by: 'phone', at, auto: true }   // the night's round did
```

`ghinLink` is read by signed-in members and written by no client. It is
the start of the record a posted score will need: that this member is
that golfer, and on what proof.

Not everything found should be tied: an account that is not a person (a
marshal's desk login, say) can share a phone with a placeholder golfer —
untick it.

What it decides: if most members are found by phone, tying becomes
automatic — «GHIN-д таны бүртгэл олдлоо … Холбох уу?» at sign-in, written
by the server. If few are (the association did not enter phones), the
number stays typed and an admin approves each tie.

## The night's round

`ghinNightly` runs every night at 02:30 (Asia/Ulaanbaatar) with no one
asking — `nightly` in `functions/ghin.js`:

1. **New members are tied by themselves.** Members with no GHIN number are
   looked for by the phone they sign in with, exactly as the admin's report
   does. A member is tied when one golfer holds that phone, the golfer is
   not another member's, **and GHIN's name for the golfer agrees with the
   member's** — one shared word, whether the member wrote their name in
   Cyrillic or Latin (`nameAgrees`). The tie is the same three writes an
   admin's is, the phone read again first, marked `auto: true`.
2. **Every Handicap Index is read afresh** — the daily read; GHIN revises
   an index once a night.

So someone who signs up today with only a phone number has their GHIN
number and Handicap Index by the morning, and has typed nothing.

What it leaves for an admin (Users tab → the phone list, as before): a
golfer whose name has nothing in common with the member's — the phone
matched, but a placeholder golfer can hold a real phone; a golfer who is
already another member's; a phone two golfers share. A member whose record
has no name beyond a nickname is never tied by the night's round.

It does not stop on what GHIN refuses: each step that fails is named in
the log (`ghinNightly {…}` — counts only, no names or numbers) and the rest
is done. The members hub rebuilds its list an hour later (03:30) and reads
the night's ties (`docs/members-hub.md`).

Deploy it with the functions it shares code with:

```bash
git checkout main && git pull origin main
firebase deploy --only functions:ghinNightly,functions:ghinSyncAll,functions:ghinPhoneReport,functions:ghinLinkByPhone --project golfup-app
```

The first scheduled function of the project: the CLI turns on Cloud
Scheduler and makes the job. To stop it, delete the function
(`firebase functions:delete ghinNightly --project golfup-app`).

## Where this is going

The aim is for a member to do in UB Golf what they would do in GHIN: see
their Handicap Index, play off it, and have the round posted when it is
finished. What that takes, in order:

1. **A tie that is proven** (above), written by the server — the GHIN
   number is on the public half of the member record today, which any
   client can write.
2. **Production.** Staging is a copy; nobody should play off it.
3. **Play off the index.** WHS revises a Handicap Index once a day, after
   the day's scores — not when a score is posted and not on a refresh — so
   the app reads it daily (`hi_changed_golfers`) and a round uses the index
   of the day it is played. A course handicap needs the tee's rating and
   slope, which should come from GHIN's own course record.
4. **Post the score.** `scores/hbh` wants GHIN's course and tee-set ids,
   not a course name: every course the club plays must be on GHIN with its
   tee sets (Chinggis Khaan is, without a women's set). Only formats
   acceptable for handicapping post — the app already keeps scramble and
   foursomes out — a round is posted once (`ghinPosted`), and the player
   confirms it. It needs its own permission from the USGA: the agreement's
   first phase is reading only.

Adding golfers to GHIN, merging them, and a handicap committee's
adjustments stay with the association, in GHIN's own Admin Portal.

## Where the code is

| Part | File |
|---|---|
| The GHIN client, trimming, the three functions' logic | `functions/ghin.js` |
| The functions themselves | `functions/index.js` (`ghinGolfer`, `ghinSync`, `ghinSyncAll`, `ghinScores`) |
| Which record is a member's, how it reads, what a refusal says, a scoring record's rows (pure) | `src/ghin.js` |
| The scoring record as a list | `src/ghin-scores.js` |
| The browser's calls | `src/store.js` (`ghinCheck`, `ghinSync`, `ghinSyncAll`, `loadGhin`, `loadAllGhin`, `loadGhinScores`, `ghinScoresSync`) |
| The screens | `src/app.js` (`wireProfileForm`, `renderProfile`, `renderHomeGhin`, `mountGhinScores`, `ghinAdminHTML`) |
| Tests | `scripts/test-ghin.mjs`, `scripts/test-ghin-app.mjs`, `scripts/test-rules.mjs` |
| A live check from your own terminal | `scripts/ghin-smoke.mjs` |
| The app's courses against GHIN's, from your own terminal | `scripts/ghin-courses.mjs`, `src/ghin-course.js` (pure), `scripts/test-ghin-course.mjs` |
| The login prompt the two scripts share | `scripts/ghin-login.mjs` |

## Setup — once

1. **Try the login from your own terminal** (optional, but it shows the
   real answer before anything is deployed). It only reads; the password is
   asked for and not shown:
   ```bash
   git checkout main && git pull origin main
   node scripts/ghin-smoke.mjs 12345678
   ```
   with your own GHIN number. It prints the name, club and Handicap Index,
   and the names of the fields GHIN sent — no one's personal details. Then
   the scoring record: how many scores, how many count, the newest three,
   and which request GHIN answered.
2. **The login, as secrets** (typed into the terminal, never into a file or
   a chat):
   ```bash
   firebase functions:secrets:set GHIN_EMAIL --project golfup-app
   firebase functions:secrets:set GHIN_PASSWORD --project golfup-app
   ```
3. **Deploy the three functions**:
   ```bash
   firebase deploy --only functions:ghinGolfer,functions:ghinSync,functions:ghinSyncAll,functions:ghinPhoneReport --project golfup-app
   ```
   and, for «Сүүлийн 20 оноо»:
   ```bash
   firebase deploy --only functions:ghinScores --project golfup-app
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

- **Every member's scoring record, every night** — needed before the list
  is opened to all members (`GHIN_STAGE = 'all'`), so that a record is there
  without its member having opened their profile. And a record open to the
  golfer's club only could then be shown to members of that same club; today
  it is shown to the member and to admins.

- **A playing handicap from GHIN.** Once the USGA grants production
  (`GHIN_BASE_URL`), the official index can replace the app's own in games
  and tournaments (`gamePlayingHcp` in `src/game-score.js`,
  `src/strokeplay-admin.js`). That is a decision as much as a change.
- **A lighter daily refresh.** The night's round reads every member's
  index; GHIN has `golfers/hi_changed_golfers` to ask only for those that
  changed. Not worth it at a few hundred members.
- **Tying at sign-in.** The night's round ties a new member by the next
  morning. Doing it in the moment they sign in needs the phones of the
  club's golfers kept somewhere between nights — GHIN does not search by
  phone.
- **Course data in the app.** `scripts/ghin-courses.mjs` reads the courses
  and says what differs (above); `src/courses.js` has not been changed by it
  yet. Chinggis Khaan is on GHIN (CourseID 29422) and matched the club's
  card; its coordinates are wrong there and it has no women's tee set —
  both for MGA to fix.
- **Posting scores** (`scores/hbh`). Not in the first phase by agreement.
  `rounds/{ghinNumber}/{gameId}` is already kept in a shape that posts
  (`toGhinScorePayload`).
- **Production.** A separate step with the USGA after the staging
  integration is reviewed.
