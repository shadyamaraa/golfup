# CHANGELOG_AI.md

## 2026-08-29 (Manual flights: empty groups by count, type-to-search adds)

The draw isn't the only way to build flights any more: "Хоосон групп" —
give a count and that many empty groups appear, numbered after the last
and continuing the 10-minute tee procession (from the first-tee field
when the round is empty). Each group's add control is now the same
type-to-search picker as everywhere else — focus lists every unassigned
player, typing filters, a tap moves the player in (and out of their old
group); players already in a flight never show in another's search.

## 2026-08-29 (Stroke play flights: auto draw, tee-time procession, group card)

Stroke tournaments get per-round groups, following the real draw
conventions: groups of 3–4, tee times 10 minutes apart, and a fresh draw
each round. Stored as `sp/groups/{round}` plus a `groups[round]` pointer
on each player — the pointer is what the database rules read to allow
"anyone in my flight may enter my strokes" for exactly that round.

- **Draw** (`drawGroups` in strokeplay.js, pure + tested): Random /
  Balance by HCP (snake seeding, every group mixes strong and weak) /
  By standings with the leaders off last (the professional R2+ draw;
  WD/DQ are left out). `chunkGroups` spreads leftovers so nobody plays
  alone (10 at size 4 → 4/3/3).
- **Editor**: a Groups section with round tabs, method/size/first-tee
  controls, one-tap draw, manual add/move/remove per group, and tee
  times that re-chain 10 minutes apart when one is edited. An
  **Excel/CSV import** reads (group, name[, tee]) rows or "Group N"
  heading blocks and matches names to the roster with the sheet-era
  tolerant matcher (`groupsFromRows`, tested); unmatched names are
  reported, never guessed.
- **Group card** (`#/spgroup/{tn}/{round}/{gid}`): the marker practice —
  one screen, one hole at a time, a stroke input per flight member with
  running totals; opens on the first unfinished hole. Writes hit the
  same per-hole paths as the individual card.
- **Board**: a Schedule fold listing every flight with its tee time and
  players; a player's "Оноо оруулах" shortcut goes to their flight's
  group card once a draw exists. Individual cards now also accept a
  flight-mate's edits for the shared round (client and rules alike).
  Tests 85.

Deploy needs `firebase deploy --only database,hosting` (group rule).

## 2026-08-28 (Scoring devices card folds away)

Registration went automatic, so the "Оноо бичих төхөөрөмжүүд" card is a
diagnostic now, not a daily stop: it renders collapsed (a `<details>`
showing just the title, this device's tier and the registry count),
remembers being opened across the admin tab's re-renders, and springs
open on its own only when something actually needs the admin — an empty
registry to bootstrap, or a pending manual request. The registry itself
stays: it is the invisible device↔member link the database rules read to
enforce "only this match's players, its assigned markers, and officials
may write".

## 2026-08-28 (Stroke play scores live in the app — sheets are gone)

The stroke play tournament stops reading a Google Sheet and stops
importing Excel; everything happens in the app:

- **Engine** (`src/strokeplay.js`, new, pure, tested): per-hole strokes
  under `tournaments/{id}/sp` are the only stored fact; `spEntries()`
  recomputes the leaderboard entries the existing pure ranking
  (`rankEntries`/`cutSet` in tournament-sheet.js) already consumes. A
  round posts to-par once complete; a running round shows its thru.
  **Net = Gross − HCP** per completed round.
- **Wizard**: the stroke step is picks, not typing — a course dropdown
  (`COURSES`: Sky Resort, Chinggis Khaan; picking one fills venue, city
  and PAR), rounds 1–4, the cut as a dropdown; currentRound starts at 1;
  no sheet fields. The editor's stroke fields match (course/rounds/
  currentRound/cut dropdowns) and picking a course fills PAR there too.
- **Players** (`src/strokeplay-admin.js`, new): picked from the members
  with the same type-to-search picker as match play (entries keyed by
  the member's id — `tnIsMe` stops needing name matching), non-members
  added by typing a name (generated pid, no self-scoring), each player
  with an HCP number and a WD/DQ status. Draft + per-field save, never
  touching `sp/scores`.
- **Scorecard** (`src/strokeplay-score.js`, new; route
  `#/spscore/{tnId}/{pid}`): 18 numeric hole inputs per round with a
  live total, per-hole writes (`store.saveTnSpScore`) that queue
  offline, an audit trail, and the same access ladder as match play
  (the player themself + admin/marshal — enforced client-side by
  `canScoreSp` and server-side by new `sp` rules in
  database.rules.json).
- **Board**: computes entries from `sp` on every paint (one
  `onTournamentChanged` listener is the whole live feed), a Gross/Net
  toggle appears once anyone has an HCP, and a player sees an
  "Оноо оруулах" shortcut to their own card. Legacy records that carry
  sheet-era entries keep displaying them as a static snapshot.
- **Removed**: sheet fetch/cache/polling, Sync/Excel buttons, the file
  importer and analysis panel, the wizard/editor sheet fields. The club
  ranking Excel importer is untouched (xlsx stays). Tests: 76.

Deploy needs `firebase deploy --only database,hosting` (new sp rules).

## 2026-08-27 (Tee times pace themselves at 10-minute intervals)

The admin gives the first match its tee time by hand and the rest of the
draw follows: setting any match's time fills every later match in that
session (singles: in the flat list) whose time is still empty, 10
minutes apart, and "+ Match нэмэх" creates the new match 10 minutes
behind the previous one. A hand-set time is never overwritten — the
chain adopts it as its new base. Pure engine functions
`addMinutesHHMM` / `cascadeTeeTimes` in `src/matchplay.js` (midnight
wraps handled), applied from the editor's teeTime edit and add-match
paths; committing a tee time now repaints the section so the filled
times show at once. Tests 65.

## 2026-08-27 (Cards name their day and session)

Match cards on the board and the detail modal header showed only the
format (FOURSOMES / FOURBALL / SINGLES), so with several sessions set up
nothing said which day a match belongs to. Both now carry the session's
full label ("Өдөр 1 — FOURSOMES") via the existing `sessionLabel`;
sessionless singles matches fall back to their own format text.

## 2026-08-27 (Score entry reachable straight from the Match Center)

Entering scores from the Match Center only worked for fielded players —
tapping a match card opened the detail with no way in, and admins had to
go through the admin editor's own link. The "⛳ Оноо оруулах" shortcut is
now gated by the same `canScore` the scorer screen enforces (fielded
players, assigned scorers, admin/marshal), appears both under the card
and inside the match detail modal, and the modal closes itself when the
link navigates to the scorer. `renderMatchCenter` receives the full
viewer (`ctx.user`) so the role is known; a bare `userId` still works.
Render tests cover player/admin/spectator visibility (59 total).

## 2026-08-27 (Legacy names still showed Овог first — one memberName helper)

Flipping the display composition wasn't enough: rosters, pickers and the
scorer chips were built straight from stored `fullName` strings, which
predate the rename and read "Овог Нэр". A single `store.memberName(u)`
now defines how a member is named — split firstName/lastName fields win
(first name first), stored `fullName` is only the legacy fallback — and
every label site uses it: the match play pickers, roster entries, scorer
chips, `displayFullName`, the editor's member sort, booking names, and
the audit `byName`. The editor also refreshes stale roster snapshots
from the live member records on paint (on both `tn.mp` and the draft —
a clean draft re-clones from `tn.mp`, so the source must carry the fix),
and the next save persists them. Members with only a single `fullName`
string and no split fields keep it unchanged — the order of a plain
string can't be known.

## 2026-08-27 (Session pickers only offer the remaining players)

Within a session, once a match's players are placed the next match's
player picker no longer lists them — only whoever remains unfielded in
that session (a player fields once per session; `lineupIssues` already
flagged the duplicates, now the picker prevents them). The slot's own
pick stays visible so it can be re-chosen, and singles is untouched
except that a match's picker hides that same match's own picks (nobody
plays themselves).

## 2026-08-27 (Type-to-search player pickers; names read Нэр Овог)

The four `<select>` pickers in the match play editor — team roster add,
singles participants add, match player slots, scorer assignment — are now
type-to-search comboboxes (`pickerHTML`/`wirePickers` in
`src/matchplay-admin.js`, the same look as the app's player-search modal).
Focus shows the full candidate list so tap-only picking still works;
typing filters by name/username; a pick goes through the exact same
mutation paths the selects used, and a filled player slot clears with ✕.
Candidates are resolved on focus so they always reflect the current
draft (members already rostered, scorers already assigned are excluded).

Name order flipped everywhere a surname+name pair is composed:
`displayFullName` and the stored `fullName` on admin create/edit and
profile save now read **firstName lastName** (Нэр Овог), and the three
forms put the Нэр input first. Sheet-name matching is unaffected
(`nameKey` sorts tokens, so order never mattered there).

## 2026-08-27 (Device access is automatic, tiered by member role)

An admin hit PERMISSION_DENIED creating a tournament because their device
was not in the `mpDevices` allowlist. Requests and approvals are gone:
a logged-in member's browser now registers itself
(`store.ensureDeviceAccess`, called from the router and on login), and
`database.rules.json` verifies the claimed member's role in `users/`
server-side. Three tiers: member `admin` → full tournament write; member
`marshal` → only `tournaments/$id/mp/**` ("Marshal / Marker": scores and
everything inside a tournament, but no creating/deleting tournaments);
plain member → only matches they play in or are assigned to score
(`scorerIds` map / `players` slots, checked in the rules). Hand-approved
devices are never downgraded; the request flow stays as a fallback; the
empty-registry bootstrap is unchanged. Scorer-screen banner now only
appears when self-registration could not cover the device. Tests 56.
Deploy needs `firebase deploy --only database,hosting`.
## 2026-08-28 (fix green pull-to-refresh strip)

The pull-to-refresh indicator still used the pre-redesign hardcoded
dark-green background (`rgba(15,36,26,0.9)` in style.css). Added a
re-skin override in tokens-redesign.css (same glass-chrome pattern as
the header/bottom-nav) so it now follows the theme: cream in light,
navy in dark, gold text.

## 2026-08-28 (Scorecard: par/SI from the Mt. Bogd card, to-par, manual handicap & net)

- **Course data** (`src/courses.js`, new): per-hole par and stroke index for
  Sky Resort (= Mt. Bogd Golf Club, from the club's official scorecard) plus
  the six tee rating/slope pairs. `physicalHole()` maps a back9 game's card
  holes 1–9 onto physical holes 10–18.
- **Scorer** (`src/game-score.js`): hole header now reads
  "3-р Нүх · Пар 4 · SI 9" (per-language phrasing) with a small "3 / 18"
  under it where the course card is known; a hole's score colors by golf
  reading (under par red, par muted); each player's line shows to-par
  ("Нийт 17 (+4)") and net.
- **Manual handicap until GHIN** : `games/{id}/hcp/{playerId}` (0–54),
  entered via an HCP chip on the scorer row by anyone who may score that
  player; falls back to the profile WHS index → course handicap. Net
  allocates strokes per hole by SI (`strokesReceived`), evenly where SI is
  unknown, so partial rounds net correctly. `saveGame()` now also spares
  the `hcp` branch; `saveGamePlayerHcp()` in store.js.
- **Standings** (`gameScoreboardHTML`): to-par column; when every player has
  a net the board ranks by net (the game is "played on handicap"), else by
  gross.
- **Handicap math** (`src/handicap.js`): AGS for the differential caps each
  hole at par + 5 where par is known (stored strokes stay real).
- i18n: mn `gsPar` → "Пар", kr → "파", new `gsHcpPrompt` ×3.
- **Chinggis Khaan** (= Riverside Golf Club, Terelj) added to `COURSE_DATA`
  from its official scorecard: per-hole par/SI (par 72) and four tee
  rating/slope pairs — every location-keyed feature (hole header, to-par,
  SI net allocation, AGS cap) works there with no further code.

## 2026-08-27 (GHIN roster import: merge GHIN numbers into user profiles)

Matched the club's GHIN roster export (golfers_20260730, 332 golfers)
against the app's users and stored each match on
`users/{id}.ghinNumber` — the field `rounds/{ghinNumber}` and the WHS
handicap machinery key on. 88 of 105 profiles received their number
(87 automatic name matches + 1 manually confirmed transliteration
variant); ambiguous or roster-missing users were left untouched and
reported for admin follow-up.

- **Importer** (`scripts/import-ghin.mjs`, new): repeatable CLI. Reads a
  roster CSV (name + GHIN columns), fetches `users` over the RTDB REST
  API, matches firstName/lastName against given/surname in either order
  with Mongolian-Latin spelling folds (kh/h, double vowels, ...) and
  Cyrillic transliteration. Dry run by default; `--apply` PATCHes only
  the `ghinNumber` key; `--set userId=GHIN` applies a manual decision;
  ambiguous matches (two roster rows or two users competing for one
  number, duplicate roster names) are never auto-applied. Existing
  different values are skipped unless `--force`.
- **Admin forms** (`src/app.js`): the admin create-user and edit-user
  forms now read and write `ghinNumber` instead of the parallel legacy
  `ghin` field (which the scoring code never read), with the same 7-8
  digit validation as the profile settings page; a user's legacy `ghin`
  key is dropped on the next admin save.

## 2026-08-27 (Casual games: group scorecards, WHS handicap, GHIN-ready rounds)

Players in a casual game's group can now enter stroke scores in the app —
their own and their group-mates' (marker practice) — and a completed card
feeds a WHS handicap index, stored in a shape ready for a future USGA GHIN
API connection (GHIN is a closed API requiring USGA authorisation, so only
the adapter stub ships now).

- **Scorer** (`src/game-score.js`, new): `#/gscore/:gameId/:groupIdx` —
  per-hole stroke stepper for every player in the group, hole strip with
  per-hole entry counts, auto-advance to the group's first open hole.
  Follows the M Cup scorer's construction: no local scoring state, every
  tap is a path-scoped write (`games/{id}/scores/{playerId}/holes/{n}`,
  keyed by member id so regrouping never detaches a card) and the
  `onGameChanged` listener repaints. Permission: admin/marshal, the game's
  creator, yourself, or a member of the same group.
- **Store** (`src/store.js`): `saveGameScoreHole()` (+ `scoreAudit` push),
  `upsertRound`/`loadRounds` under `rounds/{ghinNumber}/{gameId}`,
  `saveUserHcp()`, `loadUserById()`. `saveGame()` now writes with a
  scores-sparing `update()` instead of a whole-record `set()`, so
  join/leave edits can no longer clobber a concurrent score tap.
- **Handicap** (`src/handicap.js`, new): WHS score differential
  `(113/slope) × (AGS − rating)`, best-8-of-20 index with the small-sample
  table (3–19 rounds), course handicap, and `roundFromGame()` building a
  GHIN-shaped round record. Computed fire-and-forget when a player's card
  completes; index cached on `users/{id}.hcpIndex`.
- **GHIN prep** (`src/ghin.js`, new): payload mapper + config stub only —
  wired to nothing until USGA credentials exist. Profile gains a validated
  7-8 digit GHIN number field (rounds are keyed by it) and an HCP tile.
- **Game page** (`src/app.js`): "⛳ Оноо оруулах" button on group cards
  (visible to anyone who may score in that group, not gated on start
  time), live gross/net standings card, optional course rating/slope/par
  fields on the create and edit forms.
- i18n: `gs*` keys in mn/en/kr; `database.rules.json` opens the new
  `rounds` path (games/users were already open).

## 2026-08-27 (Three formats: Stroke / Match play (1v1) / Ryder Cup)

The team M Cup system is now the **Ryder Cup** format (`format: 'ryder'`),
and a new plain **Match play** format (`format: 'match'`) joins it: 1v1
singles under Rule 3, no teams, no sessions, no 12/14 rules. All branching
goes through a new pure helper `tnKind(tn)` in `src/matchplay.js`
(`'stroke' | 'match' | 'ryder'`; legacy `'match'` records carrying
`mp.teams`/`mp.sessions` are recognised as Ryder Cup, so nothing saved
before the rename changes behaviour).

- **Wizard** (`src/tournament-wizard.js`): three type cards — ⛳ Цохилтын
  тоглолт / 🎯 Match play / 🏆 Ryder Cup — each match play card with a
  "Дүрэм харах" fold-out; Ryder asks the two team names, Match asks nothing
  (participants and pairs are built in the editor).
- **Rulebooks** (`src/mcup-rules.js`, new): the club's full M Cup document
  (Fourball, Foursomes odd/even tee, Singles, dormie / 4&3 / gimme,
  Score → Hole → Match → TEAM) for Ryder Cup, and a Rule 3 primer for
  Match play. Shown on the wizard's type step and the tournament's
  Мэдээлэл tab; a "📖 Форматын дүрэм" button under the Match Center jumps
  there.
- **Editor** (`src/matchplay-admin.js`): singles mode — one Оролцогчид
  member picker instead of team boxes, a flat sessionless match list with
  one player per side (format `SINGLES` automatic), and a warning when both
  sides are the same player. Saving never writes `mp/teams` or
  `mp/sessions` for singles, so a Match tournament can't drift into
  looking like a team one.
- **Board** (`src/matchplay-view.js`): singles shows a player standings
  table (P / W-L-H / Pts) instead of the team scoreboard and session
  breakdown; cards and the detail legend lead with player names ("Бат
  2 UP"). The scorer keypad and its legend do the same
  (`src/matchplay-score.js`).
- **Push** (`functions/index.js`): a finished singles match is announced by
  the winner's name instead of a team short.
- i18n: `fmtMatch` → 'Match play', new `fmtRyder`; the demo tournament is
  `format: 'ryder'` now. Tests grew to 54 (tnKind table + singles render).

## 2026-08-27 (M Cup — players score their own matches, corrections need consent, and creation grows a wizard)

Four connected changes, modelled on how Squabbit runs its tournaments and on
what match play actually needs.

**Creation is a wizard now** (`src/tournament-wizard.js`): name → type (two
cards, Цохилтын тоглолт / Багийн тулаан — Scramble left the picker, legacy
records still display) → dates & venue → the chosen type's own settings →
summary and create. Match play is never asked for PAR, rounds, a cut or a
scoring sheet — those are stroke play concepts; it asks for the two team
names instead and opens straight into its editor. The row editor got the
same discipline: a match tournament's editor hides the stroke fields, its
row hides Sync/Excel and the sheet-analysis panel, and switching type in the
editor swaps the visible fields without losing what was typed.

**Rosters are members, not names.** The team roster is picked from the app's
member list (same picker pattern as scorer assignment); a roster entry is
keyed by the member's userId, which is what makes the next change possible.
Legacy name-only entries keep working. Removing a fielded player warns
before it empties their match pick.

**Players score their own match.** `canScore` now recognises a fielded
member, and their own match's card on the Match Center grows an "Оноо
оруулах" button. Officials and per-match assigned scorers keep their access.

**Corrections need the enterer's consent.** Every hole write records who
entered it (`holeMeta/{n}`). Changing a hole somebody else entered files a
proposal (`pending/{n}`, ⏳ on the strip) instead of overwriting; the
original enterer sees it at the top of their scoring screen with
Зөвшөөрөх / Татгалзах, and only their approval (or an official's) applies
it — ownership then passes to the proposer. Your own entries, unowned legacy
holes and officials write straight through. The decision lives in the engine
as pure `holeChangeAction` / `canResolveHoleChange` with tests (51 total).
`holes` stays canonical, so nothing downstream — settling, points, the
board — changed at all.

## 2026-08-27 (M Cup — team logos instead of the colour picker)

The team editor's colour picker gave way to a logo upload. Any picked image
is shrunk in the browser to a 96px badge and stored as a data URI inside the
tournament record — a few KB, so no storage bucket, no storage rules, no
second fetch; the existing per-field team save carries it. Wherever a team
mark is drawn — the scoreboard, match cards, the detail modal, the stats
panel, pair records, the scorer screen header — the logo now renders, with
the old colour dot as the fallback for teams that have none. Colours
themselves stay stored and keep painting the accent bars, hole cells and
scorer keypad, so nothing built on them regressed.

A logo is only ever accepted as an image data URI (checked by the same
regex at every render site — that is the XSS boundary), and the demo teams
carry tiny inline SVG monograms so the rendering can be reviewed on a
preview build without uploading anything.

## 2026-08-27 (M Cup phase 2 — pushes when matches finish, player stats, the archive)

**Pushes.** A member taps "Мэдэгдэл авах" on the Match Center (subscription
in `tnSubs/{tnId}/{userId}`, open like the rest of the member data). A new
Cloud Function, `mcupMatchFinished`, watches hole writes, re-settles the
match server-side (a compact copy of settleMatch — the client bundle cannot
be imported into functions, so the comment marks the twin), and writes one
record per subscriber into the existing `/notifications` pipeline, whose
sender gained an `mcup` branch: ready-made title/body, link to the
tournament. The title carries the result ("Match №7 — ALTAI 4 & 3"); when
that was the last undecided match, the body carries the tournament's final
score instead of burying it. What was last announced is recorded in
`mp/notified/{matchId}` — a correction that CHANGES a final result announces
again, a same-result recompletion stays silent. The bell list renders `mcup`
entries with their own text and a tournament link, grouped per tournament so
24 finishes don't stack 24 rows. Needs `firebase deploy --only
functions,database` once.

**Player statistics (spec §25).** `playerStats()` and `pairStats()` in the
engine — completed matches only, each player carrying their side's match
points — with three regression tests, including slot order not splitting a
pair. The Match Center shows them in a collapsed panel (score and matches
stay the headline per §22): per team Played / W-L-H / Pts sorted by points,
pair records under. A live repaint no longer snaps the panel shut if the
viewer had it open.

**The archive.** Below the board, finished match play tournaments list with
their derived final scores, newest first, each linking to its own Match
Center. `tournamentComplete()` (never vacuously true on an empty setup) is
the gate, so the archive grows by itself as tournaments finish.

## 2026-08-27 (M Cup match play — the scoreboard stops taking writes from strangers)

Until now the database accepted a tournament write from anyone who could
reach it — the role checks lived in the UI alone, which is the app's general
model but a poor fit for a public live scoreboard. Now every browser signs in
to Firebase anonymously (the app's own member sign-in is untouched) and the
rules only accept writes under `tournaments/` from device uids allowlisted in
`mpDevices`. The registry is managed from a card at the top of Admin →
Тэмцээн: the first claim on an empty registry bootstraps that device as
admin; scorers request access from the banner the scoring screen shows an
unapproved device — before the first tap on the course, not as a failed write
at hole one — and the admin approves, promotes, or revokes each device. The
last admin device cannot be revoked, so the registry cannot lock itself out.
Requests can only be filed by a device for itself, and only admin devices
touch the registry (server-enforced both).

Two console steps turn it on: enable the Anonymous sign-in provider, then
`firebase deploy --only database`. Until both happen, nothing is gated — the
card and banner stay hidden and the app behaves exactly as before, so this
ships safely ahead of the console work. Approval is per device and coarse
(any approved device may write any tournament); per-match scorer enforcement
remains UI-level until the full Firebase Auth migration. All spelled out in
docs/mcup-match-play.md.

## 2026-08-27 (a tournament board needs no account, and deploys stop hiding for an hour)

A tournament board is a public scoreboard — spec §1's viewer "opens UB Golf
and just sees it" — but the router sent every signed-out visitor to the login
card, so a shared M Cup link demanded an account before showing a score. Now
`#/tournament/…` renders for guests: the board, the match cards, the detail
modal, all read-only. Guests get a Нэвтрэх button in the header on those
pages, and the home route shows the sign-in card with the tournament strip
above it, so a visitor landing on the site sees the live team score first and
the way in second. Everything else — games, orders, member lists, admin, and
the scorer screen — still requires signing in, and the strip rebuilds when
identity changes, guests counting as an identity of their own. Verified in a
browser with no stored user: board and detail render, the scorer route
bounces to the sign-in card, the strip links to the board.

Separately, the reason "deploy went out, phones still show the old app" kept
happening: firebase.json gave `no-cache` to `/index.html`, but hash routing
means browsers request `/` — which matched no header rule and got the CDN
default of an hour. `/` now carries the same `no-cache, must-revalidate`, so
the next visit after any deploy picks up the new version at once.

The whole flow was driven end to end in a real browser against a local
preview build: the Match Center (dark and light, mobile and desktop), the
match detail modal, the home strip, and the scorer screen — where tapping
ALTAI took the demo fourball 2 UP → 3 UP → 4 UP → 5 & 4 with the keypad
withdrawing itself, Undo brought it back to 4 UP, and correcting hole 6
re-settled the match to 6 & 5. One gap found: the scorer screen was the only
piece of the feature the sample tournament did not reach — it read straight
from the database, so a reviewer on a preview channel had nothing to try.

`renderScorerPage` now takes the demo the same way the tournament page does
(localhost and preview hosts only): taps land on a local copy, nothing is
written anywhere, the screen carries the same "sample data" note, and a
reload resets it.

## 2026-08-27 (M Cup match play — what an adversarial read of the branch found)

An independent review of the whole feature turned up three ways it could lose
or misreport a result. Each is fixed with a regression test (46 total).

**A finished match with a stale suspension scored nothing.** `matchState()`
checked the suspension flag before asking whether the holes had already
decided the match, and `matchPoints()` only pays a COMPLETED match. Suspend at
dusk, resume next morning, keep tapping without pressing Resume — the match
closes out, sits under LIVE forever, and its point never reaches the
scoreboard. The holes now settle the state first; a suspension only holds a
match that is genuinely unfinished.

**Saving the setup could resurrect deleted scores.** The merge took the
scorer's fields from the live record only when the live record *had* them, so
absence never propagated: a hole the scorer had just undone, or a suspension
they had just cleared, came back from the draft's snapshot — the second of
those combining with the bug above to silently delete a match's point.
Scorer-owned fields (`holes`, `stateOverride`) are now never written by this
editor at all. Two more in the same code: `mp/matches` and `mp/sessions` were
replaced wholesale, deleting anything another admin had created since the
draft was cloned, and deletions were inferred from absence rather than
recorded — both now write one key per record, from an explicit record of what
this editor removed. Drafts are also dropped when the editor closes, so an
hour-old snapshot cannot come back to overwrite newer work.

**Undo could void a whole match.** The handler settled from the match as it
was when the buttons were wired, so with a second scorer on the same match it
could clear a hole that was no longer the last one — and since the engine
treats a gap as the end of play, every hole after it stopped counting. Taps
now read the match as it stands at that moment.

Also fixed: the scorer screen told you to pick a hole to correct on a
completed match and then did nothing (the keypad was gated on the match being
unfinished); the screen gave up with "tournament not found" when opened
offline, where it should wait for the listener; a session switched to a
smaller format stranded players in slots nothing rendered; `lineupIssues()`
waved through an unrecognized format entirely, mis-attributed a wrong-team
player's place, and described two slots of one match as "plays twice in one
session"; `settleMatch()` never finished if `totalHoles` arrived as a string;
upcoming cards read "AS" before anyone had teed off; suspended matches were
counted under the LIVE heading; a match with no session held points that no
row showed; the Match Center tab needed a reload to appear when the first
match arrived; and an open match detail was a frozen snapshot.

The review found no XSS or escaping gaps, no missing i18n keys, and no arity
or runtime-throw problems.

## 2026-08-27 (M Cup match play — a sample tournament to review it against)

`src/matchplay-demo.js` (new) is an M Cup shaped like the real one: both teams
at 14, three sessions (foursomes finished, fourball running, singles still to
tee off), 24 matches covering every state the tournament can produce — a
3 & 2 close-out, a 1 UP decided on the last green, a halved match, a dormie,
a suspension, and one just teed off. `#/tournament/mcup-demo` opens it, and
with no real tournament to feature it also takes the home strip so the
team-score row can be reviewed; the stroke play sample is unchanged at
`#/tournament/demo`. Confined to localhost and preview channels by the same
`tnDemoAllowed()` gate as the existing sample.

It doubles as a fixture: four more tests (38 total) assert the sample passes
its own lineup rules in every session, fields all 14 players per team, covers
all four states, and renders the board — including the spec's own example
card, ALTAI 2 UP thru 11. A careless edit to the sample fails there rather
than on a reviewer's screen.

Also fixed: correcting an earlier hole left the scorer's screen on that hole,
because `viewHole` was cleared after the database listener had already
repainted with it still set.

## 2026-08-27 (M Cup match play — suspension, render tests, docs, phase 5 of 5)

`SUSPENDED` was readable but unreachable: `matchState()` honoured it and
nothing could ever set it. The scorer screen now has a suspend/resume button
(weather and darkness being the usual reasons) writing through
`setTnMatchSuspended()`, audited like a hole entry. It is the one match state
a human sets rather than the holes deriving, so resuming simply clears it.

Render smoke tests (`scripts/test-matchplay-render.mjs`, 11 cases, 34 total)
push a full M Cup-shaped tournament — two teams, two sessions, a match in
every state — through the Match Center and check the HTML for what a
spectator must be able to read: both team names and their derived points, the
running session, a card per match, `ALTAI 2 UP` with `Thru 11` on the live
one, `3 & 2` on the closed-out one, a tee time on the upcoming one, group
order, the session breakdown, and that a player name containing a tag is
escaped rather than rendered. They catch template crashes and silently empty
sections the pure engine tests cannot see.

`docs/mcup-match-play.md` documents the feature for whoever runs the
tournament and whoever maintains it next — setup, the scorer flow, the data
model, why halved holes store `'h'` rather than null, and the scorer-access
limitation, which is now also a backlog item. Dropped `mpScorerHint`, an i18n
key nothing used.

## 2026-08-27 (M Cup match play — the public Live Match Center, phase 4 of 5)

`src/matchplay-view.js` (new) is what a spectator opens: the team scoreboard
(ALTAI 8.5 — 7.5 WELLCOM) with the running session under it, then match cards
grouped LIVE → FINAL → UPCOMING, then the session-by-session breakdown. Each
card answers the spec's two-second question on one line — who leads and by how
much, and how far the match has got: THRU before the off becomes the tee time
instead. Tapping a card opens the hole-by-hole detail (A / W / – across 18,
with the running status behind it). Every status line names its team, so
nothing depends on colour alone.

The tournament page grows a Match Center tab, first and selected by default
when the tournament's format is 'match' and it has matches; a match play
tournament with no stroke entries drops the leaderboard tab entirely rather
than showing an empty board. On the home strip a match play tournament shows
the team score, the live match count and the session in place of the player
list — the strip's job there is "who is winning", not "where am I".

Live updates need no new machinery: the page's existing RTDB listener already
repaints the board on every change, so a scorer's tap reaches every spectator
without the polling the spec allowed as a fallback (§20).

Tests: 8 more cases (23 total) covering which session a viewer is shown —
including a suspended match holding its session — and what the strip
summarizes.

## 2026-08-27 (M Cup match play — the scorer screen, phase 3 of 5)

`#/score/:tnId/:matchId` (`src/matchplay-score.js`, new) is the on-course
screen: three big buttons — team A, HALVED, team B — under the match's current
status, sized for a thumb and labelled with team names rather than colour
alone (spec §23). The hole advances by itself after each tap, UNDO clears the
last hole entered, and the 18-hole strip below doubles as the correction
affordance: tapping a played hole edits it, and the engine re-settles
everything after it (spec §13).

The screen holds no scoring state of its own — every tap writes the hole and
the RTDB listener paints what came back. Two scorers on the same match
therefore cannot diverge, and offline it still feels instant because RTDB
answers its own listener from the pending write before the network sees it.
`saveTnMatchHole()` no longer lets the audit read block the write for the same
reason. Admins assign scorers per match from a member picker in the setup
section (spec §14), and each match row links straight to its scorer screen.

Access is currently enforced in the UI only: admins and marshals score any
match, others only where assigned. Server-side enforcement is not possible as
things stand — the app authenticates through a localStorage session rather
than Firebase Auth, so a database rule has no identity to check. Worth
deciding separately before the tournament; the assignment data the rule would
need is already stored.

## 2026-08-27 (M Cup match play — admin setup, phase 2 of 5)

The admin side of a match play tournament: `src/matchplay-admin.js` (new)
renders a setup section inside the existing tournament editor whenever the
tournament's format is 'match' — teams (name, short name, color), a roster
textarea per team (one name per line, reconciled by name so an unchanged
player keeps their id and their match assignments), sessions (day, number,
FOURSOMES/FOURBALL/SINGLES, start time) and matches (number, tee time, player
selects sized by the session's format). The lineup panel runs the engine's
validation live — duplicate players, 12-per-team-per-session, wrong-team and
off-roster picks — and the participation indicator shows n/14 per team with
the unplayed names.

Editing happens on a local draft, so the admin tab re-rendering never loses
keystrokes; the save button writes only the mp/* subtrees and merges hole
results, scorer assignments and suspensions from a fresh read first, so
saving the setup can never erase what a scorer entered meanwhile. For the
same reason the base tournament form's save switched from a whole-record set
to a partial update. Creating a match-format tournament now opens straight
into its editor. Deleting a session or match that already carries scores
asks twice as loudly.

## 2026-08-27 (M Cup match play — the scoring engine, phase 1 of 5)

Groundwork for the M Cup Live Match Center (Ryder Cup-style team match play),
integrated into the existing tournament model rather than built beside it: the
`format` field a tournament already carries becomes the switch, and a
match-play tournament keeps everything else — dates, status, the strip — as is.

`src/matchplay.js` (new) is the whole rulebook as pure functions, mirroring how
`tournament-sheet.js` keeps the stroke play ranking testable without a browser.
Hole results are the ONLY stored scoring fact (`'a' | 'b' | 'h'` per hole —
halved needs a real sentinel because RTDB deletes nulls); status lines
(AS / 2 UP), dormie, close-outs (4 & 3), match states, points (1 / ½ / 0), team
and session totals, the hole-by-hole timeline, lineup validation (12 unique
players per team per session, no double-booking, roster/side checks) and the
14-player participation indicator are all derived, so a correction to any hole
re-settles everything downstream by itself. The replay walks holes strictly in
order, stops at a gap or a close-out — a stray entry past either can never
change a result, and undoing the hole that caused a close-out brings later
entries back into play.

`src/store.js` gains `updateTournament()` (partial update — `saveTournament()`
sets the whole record, which would clobber a scorer's concurrent write) and
`saveTnMatchHole()`: one scorer tap or its undo, with an audit entry (who,
when, what it replaced) pushed alongside every write. RTDB queues writes while
offline, which is what the on-course dead spots need.

Tests: `npm run test:mp` (node's built-in runner, no new dependency) — 15
cases walking the spec's own examples. Nothing is wired into the UI yet; the
admin setup screens, scorer interface and the public Live Match Center are the
next phases.

The organisers asked whether the app's cut updates their sheet. It does not —
the data only travels `Sheet → App`, so their Position column and the PDF they
print from it go on numbering cut players 51, 52, 53. The cut can be computed in
the sheet instead, and the app already honours a `CUT` in the Status column, but
the two did not compose: `cutSet()` skipped withdrawals when it ranked the field
and not sheet-supplied cuts, so such a player still held a place and one extra
player was dropped. Measured on six players cutting to three, with one marked
`CUT` in the sheet: two made it instead of three. Anyone the sheet has already
taken out now frees their place, exactly as a withdrawal does.

The guidance also lost its helper columns. The scorers ran the three formulas
against their own workbook and did not want the extra columns, which was fair —
they were never needed. The doc now leads with the true answer, that nothing has
to be added to the sheet at all because the app derives the cut itself, and
offers a single-cell alternative for anyone who wants the printed PDF to say CUT
too: a wrapper around their existing `Position` formula, no new columns, the
rank folded into one `SUMPRODUCT`. Simulated against the real 76-player field it
cuts exactly the same 17 players the app does, and marking the leader `WD` drops
that to 16 with the 51st promoted.

`docs/tournament-cut.md` writes the whole thing down for the scorers: what has to
be typed (WD and DQ, always — no formula can tell "withdrew" from "not entered
yet") and what never does (CUT), the app's two settings, and the three
spreadsheet formulas that make the sheet agree with the app. Also why a filter on
the sheet cannot do this: the app reads the gviz CSV, which returns cells rather
than anybody's view, and a filter cannot express "promote the 51st when a top-50
player withdraws" — that is a re-rank.

Checked against the organisers' Day-2 sheet again: 76 players, 0 mismatches,
every earlier cut/tie/promotion case still passing, and the spreadsheet formula
cuts exactly the same 17 players the app does.

## 2026-08-21 (the cut, and what WD/DQ do to it)

A four-day tournament cuts the field after Day 2, and the board had no notion of
it. That was about to break the standings outright: a player cut on two rounds
keeps a two-round total, so the moment Day 3 scores landed a missed-cut +58 would
have sorted above a +75 who actually played.

Three tiers now, not two. Players with a standing rank as before; **CUT** keeps
the total and the round scores it was cut on but holds no position; **WD/DQ**
keep nothing. Each sorts below the one before it, and positions are numbered over
the players still in the tournament only — so a cut player who happens to share a
total can no longer turn somebody's position into a tie.

The cut is derived, never stored: `cutSet()` ranks the field on the rounds before
the cut, skips anyone withdrawn or disqualified, and drops everyone past the cut
size except those level with the last player inside it ("top 50 and ties").
Because the retired are skipped every time it runs, a player who makes the cut
and then withdraws frees their place and the next player is pulled in on the
spot — the organisers' promotion rule, with no history to keep. The cut only
bites once the following round is under way, so the day's own standings still
show the whole field, with a marked line where the cut currently falls.

Two admin fields drive it, both optional: the round the cut follows, and how many
advance. Blank means no cut.

The ranking moved to `tournament-sheet.js` (`activeRound`, `cutSet`,
`rankEntries`) so it is pure and can be checked without a browser; `app.js` keeps
the movement arrows, which need the rendered list.

Sheets also carry the status in the day the player stopped — "Day 2: WD" — as
often as in a Status column, and only the column was read. Either now works.

Checked against the organisers' hand-made Day-2 result sheet, 76 players: the
standings reproduce it exactly, ties and all nine WD/DQ rows included, with
nobody cut while Day 3 is empty. With Day 3 opened for the qualifiers, the 17
players from 51 down read CUT, sort below every ranked player and keep their
totals; a player level with 50th survives; and marking a qualifier WD — or DQ —
promotes the player who was 51st.

## 2026-08-21 (the round chips ride on the player's own line)

The R1..R4 chips sat on a second line under the name, which doubled the row
height and broke the table's scan. They now sit between the name and the total,
on the player's own line, in a track that sizes itself to however many rounds
have been played. On a phone the other columns give width back to make room —
position, total and thru tighten and the chips drop a size.

Four chips plus a name still do not fit a 390px phone, so past two rounds the
chips fall back to a second line on narrow screens only; every wider screen
stays single-line at four rounds. A withdrawn player keeps an empty chip cell
rather than none, or the total and thru columns would slide left on that row.

Measured at 390px and 700px, both themes: two rounds are single-line at both
widths (row height 61px, was 61/91); four rounds are single-line at 700px and
wrap only on the phone; nothing overflows horizontally; the withdrawn row's
total and thru land on the same pixel column as every other row.

## 2026-08-21 (a link with a gid names its own tab; the tab field steps aside)

The R1–R4 change shipped and the board still showed one round. The code was
live; the record was not. `sheetTab` on the live tournament read `"Scoring"`
again — the 2-day tab, where Day 2 is empty — a few minutes after being
cleared. Clearing it by hand cannot stick: any page still holding the old
record writes the old value back on its next sync.

So the rule is now in the code rather than in the data. A link carrying a gid
already names its tab and is the most recent thing the admin pointed at, so it
wins outright: the tab field is only read when the link has no gid, on the live
read and on sync alike, and a sync against a gid link clears any stored name.
A stale name is now ignored rather than obeyed, which makes the record
self-healing. The admin field says when it applies.

Measured against the live workbook, all four combinations: stale name + gid
link → 4 rounds, 2 played (was 2 rounds, 1 played — the reported bug); no name
+ gid link → the same; name + link without a gid → that named tab, so a
gid-less link can still be steered; neither → the probe's default.

## 2026-08-21 (every played round on the board, not just the current one)

The leaderboard had a single round column, so a four-day tournament showed R4
and hid R1–R3 — a player could not see how the days added up to the total.

Every round anybody has posted a score in now gets its own R1..R4 value. Four
score columns plus a name do not fit a 390px phone (measured: the columns alone
want 470px), so from the second round on the rounds move to their own line
under the name as chips and the R column drops out; the round being played
carries the gold outline. A one-round tournament is untouched — same table,
same single R1 column. A withdrawn player, who has no round scores, gets no
chip line rather than a row of dashes.

Checked in the browser at 390px in both themes: R1 R2 R3 R4 on one line, no
horizontal overflow, the own-position row still highlighted.

## 2026-08-21 (a saved tab name no longer outranks a freshly pasted link)

Pointing the tournament at the 4-day tab did nothing: the board kept showing
R1. The link had been updated to the right tab's gid, but `sheetTab` still held
`"Scoring"` — written automatically by an earlier sync — and a named tab is
tried before the link's gid, so the app kept reading the 2-day tab where Day 2
is empty.

Sync now persists the tab that answered only when the admin actually named one
(so a typo still self-corrects) or when the link carries no gid to steer by.
A name saved on an earlier sync can no longer silently override a link the
admin has just changed.

Measured on the live workbook: `sheetTab="Scoring"` → 2 rounds, shows R1;
`sheetTab` blank with the link's gid → 4 rounds, shows R2.

Existing records still carry the stale name, so it has to be cleared once in
the admin form.

## 2026-08-21 (round follows the scores; strip paints before the sheet answers)

**The displayed round is now derived from the data.** `currentRound` had to be
bumped by hand each morning or the board kept saying "R1" while round three was
on the course — it drove the strip's round chip and which round the
leaderboard's last column showed. `tnActiveRound()` takes the highest round
anybody has posted a score in, and falls back to `currentRound` only before
play starts. Verified against the live 4-day tab: shows R2 today, and R3/R4 as
those days land, with `currentRound` left at 1. The admin field is relabelled
"Эхлэх тойрог (оноогоор автоматаар)" since it is now a starting value.

**The strip no longer waits for the linked sheet before painting.**
`renderTournamentStrip()` awaited `tnWithLiveEntries()` before writing any
markup, so on a slow or unreachable connection the top of home sat blank for as
long as the fetch took to fail — through every probed tab. It now paints the
stored snapshot immediately and repaints when the live read lands. Measured
with Google unreachable: previously blank after 12s, now populated in 2.5s.

Both verified in a browser against the built app; the leaderboard, own-position
banner and movement arrows are unchanged.

## 2026-08-21 (read a 4-day scoring tab; accept a Drive link)

Two blockers found on the new MNAOC workbook, both in the parser.

**A merged title cost us the player column.** gviz folds a spreadsheet's title
row into the first column's label, so that cell is a sentence, not a column
name. The 4-day sheet's title reads *"Enter Day 2–4 strokes only in yellow
cells"* — `classify()` matched "Day 2" in it and filed the **player** column as
a round-2 score column, leaving no name column at all (`no-player-column`, zero
entries). A long cell that names the player column is now taken as the player
column before the round/hole patterns are tried. The old workbook's title had
no "Day N" in it, which is why this only surfaced now.

**A sheet opened from Drive gives a `/file/d/<id>/view` URL**, not a
`/spreadsheets/` one, and `parseSheetUrl()` returned null for it — the second
tournament could not sync at all. `/file/d/<id>`, `?id=<id>` and a bare id are
all accepted now; the id works against the same endpoints either way.

Verified against the live file: `Scoring 4 Days` reads 76 players over **4
rounds** with every round's gross, to-par and hole columns mapped; the original
workbook still reads 2 rounds with Day 2 in progress; wrong-tab recovery, the
Mongolian-header cases and the 50/76 member matching all unchanged.

Note for operators: the tab auto-probe tries `Scoring` before `Scoring 4 Days`,
so a 4-day tournament must name its tab explicitly in the admin form.

## 2026-08-21 (fix: an uploaded file was ignored; show which column fed which field)

### Uploading an Excel file appeared to do nothing

A tournament with a `sheetUrl` had its board overlaid from the linked Google
Sheet on **every** render, so an uploaded file was written to RTDB and then
immediately painted over. The upload looked like it had failed.

The active source is now explicit. `entriesSource` is set to `'file'` on
upload and `'sheet'` on sync, and `tnWithLiveEntries()` skips the sheet overlay
while a file is active. The admin row says which source is feeding the board
and, when a file overrides a still-linked sheet, spells out that pressing Sync
switches back. The cached sheet read is dropped on upload so nothing stale
survives.

### "Which column did this come from?"

The import summary reported categories ("player, total, thru") but not the
column each one was actually read from, so there was no way to check a mapping
before it reached the leaderboard. `analyzeSheet()` now returns the matched
header text per field instead of a boolean, and the admin panel renders it as a
mapping:

```
Тоглогч  ← Player        R1 Нийт   ← D1 To Par
Нийт     ← To Par        R1 Цохилт ← Day 1
Цохилт   ← Total         R2 Цохилт ← Day 2
Нүх      ← Thru
Байр     ← Position
Төлөв    ← Status
```

Records written before this stored booleans; the renderer treats only strings
as column names, so old entries degrade to no mapping rather than breaking.

Long labels keep their **tail**, not their head: gviz merges a spreadsheet's
title row into the header cell, which puts the real column name at the end — a
head-first cap dropped the word "Player" entirely from the MNAOC sheet.

Verified by uploading the real MNAOC workbook through the admin button in a
browser: source flips to Файл with the override note, and the mapping lists all
nine columns.

## 2026-08-21 (make tournament editing findable)

Editing a tournament already worked, but the only way in was clicking the
tournament's **name** — the action row offered Дэлгэрэнгүй / Sync / Excel /
Устгах and nothing that said "edit", so the feature read as missing.

- The row now leads with a **Засах** button (pencil icon) that opens the same
  inline editor and flips to **Хаах** while it is open. Clicking the name still
  works; both share one handler.
- Opening the editor scrolls it into view. The form renders below the row's
  actions, so on a list of several tournaments it could land off screen — and a
  button that appears to scroll nothing reads as a dead button.
- New `tnEdit` / `tnClose` keys in MN/EN/KR rather than reusing the
  menu-specific `editMenuItem`.

Verified in a browser against the built app: the action row reads Засах ·
Дэлгэрэнгүй · Sync · Excel · Устгах; opening prefills every field from the
record; changing the name, format and current round and pressing Хадгалах
saves and re-renders the row with the new title.

## 2026-08-21 (drop circles from the leaderboard; match players to members by name)

### Circles removed

The "Миний тойрог" filter, the club sub-label on each row and the club column
detection are gone end to end — parser, entry shape, UI, i18n and the chip-row
CSS. The MNAOC sheet has no such column and the filter had nothing to filter
on. `.tn-club` became `.tn-sub` since it now only carries the "Та" tag.

### A leaderboard name now finds its member

Scoring sheets write **"Given Surname"** while the app stores **"Surname
Given"**, so the old exact-string check in `tnIsMe()` never matched anybody —
the own-position banner and the highlighted row were dead code for every real
tournament. Matching now compares **sorted token sets** after normalizing case,
dots, hyphens and accents, which makes the name order irrelevant.

- One token may differ by a single character (Biligsaikhan / Bilegsaikhan);
  every other token must be exact. Two slips are rejected: handing a member
  somebody else's score is worse than showing them nothing.
- A single-token name never matches — too weak to identify anyone.
- Measured against the live data: **50 of 76** sheet entries resolve to a UB
  Golf member, **0 ambiguous** (no entry matches two different members). The
  26 that don't match are competitors who aren't app members — MNAOC is a
  national championship, not a club event.
- The comparison lives in `tournament-sheet.js` (pure, no DOM, no Firebase) as
  `nameKey` / `userNameKeys` / `nameMatches`, so it can be tested directly
  against real data; `app.js` keeps only the current-user glue.

### Your own line on the home strip

A member playing in the tournament now gets their own line **first** in the
strip — gold "ТА" chip, position, total, thru — with the leaders behind it.
It is the one thing horizontal scrolling could hide, and it is what a
competitor opens the app for. Members already inside the top five are
highlighted in place rather than shown twice.

**Fixed while doing this:** the strip is built once during `initApp()`, before
the router has resolved who is signed in, so `currentUser` was still null and
the member's line could never have appeared — for the demo or for real data.
`updateTournamentStripVisibility()` now rebuilds the strip when the signed-in
identity changes, reusing the cached tournament list rather than re-reading it.

## 2026-08-21 (fix: silent failures in the tournament admin, wrong-tab recovery)

Creating a tournament appeared to do nothing. Two causes, both fixed here; the
third is operational and is on the deploy side.

- **Failures were silent.** `/tournaments` writes are rejected because that
  rule sits in `database.rules.json` but was never deployed, and the rejected
  promise was not caught — which looks exactly like a dead button. Create,
  save, delete, sync and Excel import now route errors through
  `tnAdminError()`: a permission denial names the missing rules deploy and the
  command that fixes it, anything else shows its own message.
- **A denied READ read as "no tournaments yet."** The admin tab now shows a
  red banner with the same explanation instead of an empty-state.
- **A wrong tab name is no longer fatal.** `fetchSheet` used to give up when an
  explicitly named tab failed; it now tries that name first and falls back to
  the full probe. The tab that actually answered is written back, so a typo
  ("MTBogd" in the tab field) corrects itself on the first sync.

Still required to make this work against real data — nothing in the app can do
it, it needs the project owner's credentials:

```bash
firebase deploy --only database
```

Verified: `/tournaments.json` currently answers `Permission denied` while
`/news.json` and `/ranking.json` answer normally, which is the root rule having
expired (2026-06-03) and leaving un-ruled paths closed.

## 2026-08-21 (tournaments managed in-app: Google Sheet source, Excel import, movement arrows)

### The tournament is created and fed from the admin panel, not from the code

- **Admin → Тэмцээн** (new tab): create a tournament (name, venue, city, dates,
  rounds, current round, course par, format, status), edit it inline, delete
  it, and feed its leaderboard one of two ways —
  - **Google Sheet link** + optional tab name, with a **Sync** button, or
  - **Excel/CSV upload** (.xlsx/.xls/.csv), reusing the lazily-imported SheetJS
    chunk the ranking upload already pulls in.
  Status left blank means "derive from the dates".
- **What the importer understood is shown before it ships**: after a sync or an
  upload the row reports how many players and rounds were read, which columns
  were recognized (player, club, to-par, strokes, thru, position, status), and
  warns about what was missing — a sheet with no club column says so, because
  the "my circles" filter silently depends on it.

### Reading the sheet (option A: the sheet stays the source of truth)

New `src/tournament-sheet.js` — no DOM, no Firebase, unit-testable:

- Accepts any Sheets URL (or a bare id) and reads the **gviz CSV** endpoint,
  which Google serves with permissive CORS while the document is link-shared.
  Deliberately sent without a `headers` parameter: gviz's own header detection
  merges a title row into the column labels, which is what makes a column like
  "Day 1" resolvable at all.
- **Probes tabs**: the link a scorer has open usually points at a setup tab, so
  the URL's gid is tried first, then Scoring / Leaderboard / Live / Results /
  Хүснэгт / Оноо / Дүн, then the default sheet.
- **Column detection works in Cyrillic.** `\b` is defined over ASCII word
  characters and never fires next to a Cyrillic letter, so the matchers use
  Unicode letter/number boundaries — "Тойрог 1" resolves as round 1, a bare
  "Тойрог" as a circle.
- **Gross vs to-par is decided from the values, not the header**, per column and
  by median: an 18-hole gross sits far above anything to-par reaches. A round
  column holding 74 is strokes; one holding −2 is to-par.
- **Withdrawals hold no position**: WD/DQ/DNS/DNF/NC/RTD keep their strokes but
  their to-par is nulled, so a blanked cell can't be back-derived into a
  standing the scorer deliberately removed. They sort last and show the status
  where a position would be.
- Live reads are cached ~45s so the strip and the leaderboard share one
  request, refresh every 60s while a tournament is live, and fall back to the
  stored snapshot on any failure (sharing revoked, offline, Google down).

### Movement arrows

▲/▼ in the leaderboard, same vocabulary as the ranking page. **No stored
history**: each entry carries a per-round score, so ranking the field on the
rounds completed *before* the current one gives the "before" position. Arrows
appear by themselves once round two starts landing and reset when a new round
opens.

### Verified / not verified

Parser checked against the real MNAOC 2026 workbook (76 players, 2 rounds, 3
WD, top of the board and every column mapping); arrows, WD handling and the
admin tab checked in a browser against the built app. **The browser-side fetch
to Google could not be exercised here** — the build sandbox has no route to
docs.google.com at all — so the CORS headers were confirmed with curl instead.
The preview channel is where that last hop gets proven.

## 2026-08-21 (tournament strip on home + leaderboard page)

### A live tournament reads from the top of home, one tap from the full board

Two levels, modelled on how the tour apps do it but built from the existing
vocabulary — no new tokens, no new dependency.

- **Home strip** (`#tn-strip` in index.html, rendered by
  `renderTournamentStrip()`): a ~100px band on the card surface, full-bleed,
  **sticky directly under the header** — round chip + state (a pulsing dot
  while live), the tournament name, then the **top 5** players in a
  horizontally scrolling row (`T1 · avatar · name · НИЙТ −6 · ЯВЦ F`) with a
  fade at the right edge. Home route only; hidden in kiosk, when signed out,
  and when no tournament qualifies. Its sticky offset (`--tn-top`) is measured
  from the header rather than hard-coded, and re-measured on resize.
- **Leaderboard page** (`#/tournament/:id`): hero card (crest, state, name,
  venue, dates/format/rounds), Хүснэгт / Мэдээлэл tabs, player search, an
  "all players / my circles" filter, an own-position banner, and the full
  table — POS · player (+ club) · TOT · THRU · round — paged 20 at a time.
  Live-updates over `onTournamentChanged`, repainting the list alone while a
  search is in progress so the caret is never stolen.
- **Which tournament gets the strip**: live first, else the nearest upcoming
  within 14 days, else one that finished in the last 3 days (`tnFeatured()`).
  Status is an explicit field when set, otherwise derived from the dates.
- **Score colours follow golf reading, not app semantics**: under par is
  `--red`, level is muted, over par is ink. Positions are tie-aware (T1, T1, 3).
- Instead of a country flag the strip and table carry the player's **club /
  circle**, which is what this app actually knows about people.
- `src/store.js`: `loadTournaments`, `loadTournament`, `saveTournament`,
  `deleteTournament`, `onTournamentsChanged`, `onTournamentChanged` over
  RTDB `/tournaments/{id}`. Entries are denormalized onto the record (same
  shape `ranking` uses), so strip and page each need one read.
- `database.rules.json`: `tournaments` read/write, matching the sibling
  collections. **Not deployed** — run `firebase deploy --only database` before
  real tournament data can be read.
- **Demo data**: `TN_DEMO` renders only on localhost and Firebase preview
  channels (`tnDemoAllowed()` — preview hosts carry a `--` segment), so the UI
  can be reviewed before any record exists. It never renders on
  ubgolf.club or golfup-app.web.app, where no data simply means no strip.
- i18n keys in MN/EN/KR; component CSS in tokens-redesign.css (dark theme
  follows the tokens).

Not built yet, deliberately: admin CRUD for tournaments and score entry, tee
times / flights tabs, favouriting a player. The page reads; nothing writes.

## 2026-08-17 (weather forecast on home + game detail)

### Show course weather with zero friction for players

New `src/weather.js` module backed by Open-Meteo (no API key, no signup,
CORS-open) — players see weather with no permission prompts, no login, no
taps. One request per course per hour, cached in localStorage + memory;
cached data up to 6h old is served silently when offline, and every failure
path just hides the weather UI (no toasts/errors).

- Home: compact `.wx-strip` under the greeting — current temp, condition,
  day high/low, rain chance pill (only when > 20%). Coordinates come from
  the user's next game's course, else the default course. A same-height
  skeleton prevents layout shift while loading.
- Game detail: `.wx-game` block (styled like the description callout) under
  the date/time meta — forecast for the game's date at tee-time hour: temp,
  feels-like, condition, day high/low, wind (m/s), rain %. Advisory pills
  appear only past thresholds: wind ≥ 8 m/s, rain ≥ 60%, temp ≤ 0°.
  Hidden entirely for past games and games beyond the 16-day forecast range.
- 10 new stroke icons (`wx-*`) in the existing icon style; weather i18n keys
  in MN/EN/KR; component CSS in tokens-redesign.css (dark theme via tokens).
- Course coordinates live in `COURSE_GEO` (src/weather.js). Sky Resort is
  exact (47.880971, 107.042176); Chinggis Khaan is still approximate —
  swap in the exact Google Maps value there when available.
- index.html: preconnect to api.open-meteo.com.

## 2026-07-01 (news image upload)

### Admin news images can now be uploaded, not just linked by URL

Mirrors the sponsor banner upload: an "Зураг оруулах" button + file input
next to the news image URL field in the admin news add/edit form. Reuses
the existing `fileToWideImageDataURL` helper (proportional resize, no crop
— matches how news cards already render via `background-size:cover`) and
the existing URL/preview/save flow unchanged; the uploaded file just
becomes the value of the `news-image` field.

## 2026-07-01 (show MTBogd's real member/guest price on the booking)

### Surface the actual price MTBogd charges, not just the pre-match slot listing

`GET /tee-times` (used while picking a slot in the create form) has no
phone/member parameter — it shows one generic price for every slot, before
any member match happens. So the "300K₮" shown at slot-selection time can be
wrong: if the creator doesn't actually match a club membership, MTBogd may
charge the guest rate instead (e.g. 380K₮) once the booking is confirmed
with their phone. There's no way to preview the correct rate *before*
booking (the API doesn't support a phone-aware quote) — but the real number
becomes knowable immediately *after* `confirmBooking` sends the phone.

- Game detail (creator view only) now shows "MTBogd-ийн бодит үнэ" under the
  booking code, sourced live from `mtbogd.getQpayStatus(bookingId).amount` —
  the same call already used to detect payment — labeled "(гишүүний үнэ)" /
  "(зочны үнэ)" from `customerType`. Shows a loading state until it resolves;
  if already paid, reads the stored `game.paidAmount` instead of re-fetching.
  New i18n keys (bookRealPrice/bookPriceChecking/bookPriceMember/
  bookPriceGuest, MN/EN/KR).

## 2026-07-01 (remaining green notification accents)

### Replace leftover pre-redesign green on toasts/alert banners with navy/gold

A few notification-style elements still used the old bright green from
before the redesign — either through the shared `--green-bright` token
(`.toast-success`) or literal hex colors that bypassed the token system
entirely (tee-time confirmation banners, the order-completed banner, the
kitchen new-order alert). Fixed all of them to the brand's navy/gold
language; left alone `.status-open`/`.order-chip.done` (already
deliberately tuned green per theme) and the persistent invite/delivery
status badges, since those are categorical labels, not notifications.

- `.toast-success` (tokens-redesign.css): navy background + bold gold text
  (was `--green-bright`) — now distinct from `.toast-info` (navy + cream)
  and `.toast-warning` (gold + navy).
- Tee-time slot-selected confirmation banners (create form + book-teetime
  modal): green rgba/border → `rgba(var(--primary-rgb),0.12)` + gold border.
- Order-detail "completed" banner: green rgba tint → same `--primary-rgb`
  based gold tint (border/text were already gold, so the background now
  matches instead of clashing).
- Kitchen new-order alert banner: solid green → gold background + navy
  text/close button, matching the toast-warning treatment.
- `.food-cart-pill`'s dead `--primary-rgb` fallback (style.css) updated
  from an old green default to the current gold rgb (cosmetic, inert).

## 2026-07-01 (MTBogd member match for later joiners)

### Send joining players' phone numbers to MTBogd so they can be matched to club membership

MTBogd's member-match only ever ran once, against the original booker's
phone at booking creation. Players who joined a game afterwards via
UBGolf's "Нэгдэх" flow were synced to MTBogd (`PATCH .../bookings/:id/players`)
by name only — no phone was ever sent, so they could never be matched to
a club membership (always stayed "guest"). MTBogd has now added optional
per-player `phone` support to that endpoint (backward-compatible with the
old name-only array).

- `syncBookingPlayers(game)` now includes each player's phone (from
  `allUsersMap`) when known: `{ name, phone }`; players with no phone on
  file keep the old `{ name }` shape (per MTBogd's spec, not an empty
  string). No change needed to `functions/index.js` — the Cloud Function
  proxy already forwards the `players` array as-is.

## 2026-07-01 (sponsor banner upload)

### Admin sponsor banner can now be uploaded, not just linked by URL

Mirrors the profile avatar upload added earlier: an "Зураг оруулах" button +
file input next to the sponsor image URL field in the admin news/sponsor
tab. Reuses the existing URL field, preview, drag-to-position and save flow
unchanged — the uploaded file just becomes the value of that field.

- New `fileToWideImageDataURL(file, maxWidth=1200)` helper — scales an image
  down to fit `maxWidth` (aspect ratio preserved, no cropping, unlike the
  square avatar helper) and returns a JPEG data-URL.
- On upload, `sp-image`'s value is set to the data-URL, drag position resets
  to center, and the existing preview/drag-to-position code picks it up
  exactly as if a URL had been pasted in.

## 2026-07-01 (join payment page fix)

### Drop the invented per-player price estimate on the join-pay page

MTBogd bills a flat rate per booked slot — it isn't split per player — so
dividing the total by `groupSize` and labeling it an "estimate" was made-up
math, not a real number from MTBogd. The join-pay page (`#/join-pay/:gameId`)
now shows only `Нийт дүн` (the real total from `mtbogd.getQpayStatus`);
removed the per-player row and the now-unused `joinPayPerPlayer` i18n key.

## 2026-07-01 (join payment page)

### Joining a paid tee-time game now shows a payment step first

Previously "Нэгдэх" (join) added the player immediately for every game.
Games booked with MTBogd (have a `bookingId`) now route through a payment
page first; casual games with no booking still join with one click
(unchanged).

- New `#/join-pay/:gameId` page (`renderJoinPay`): shows the game's
  location/time, the live total + estimated per-player price (fetched via
  `mtbogd.getQpayStatus(bookingId).amount` — not stored on the game, so it
  stays accurate for older bookings too), and a Clubhouse/QPay `seg-chip`
  payment-method choice (QPay shows "Удахгүй" while `QPAY_ENABLED` is false).
  If the price can't be fetched, the price block is simply omitted.
- `join-btn` now branches: `game.bookingId` → `#/join-pay/:id`; otherwise the
  existing one-click join.
- `handleJoin(game, paymentMethod)` gained an optional second param; the
  chosen method is tagged onto the player record (`paymentMethod`) for the
  creator/marshal's reference. No tag when joining without this page.
- New i18n keys (joinPayTitle, joinPayPerPlayer, MN/EN/KR).

## 2026-07-01 (avatar photo upload)

### Profile avatar can now be an uploaded photo (not just an emoji)

The profile edit form gained a photo upload alongside the emoji picker, and
every avatar slot in the app now renders an image when the avatar is a photo.

- `fileToAvatarDataURL()` reads the chosen image and produces a small square
  JPEG data-URL (cover-cropped, max 256px, ~15-30KB) stored in `user.avatar`.
- New avatar preview circle + "Зураг оруулах" button + file input in
  `profileFormInner`; `wireProfileForm` handles upload → preview → save.
- `isImageAvatar()` / `avatarInner()` helpers make every avatar slot (header,
  profile, player rows/dots, invite chips, feature-card avatars, modal titles,
  follow list) show an `<img>` for photo avatars and the emoji/initial
  otherwise. `.avatar-img` fills the circular container (containers clip).
- New i18n keys (avatarUpload / avatarUploadHint / avatarUploadFail, MN/EN/KR);
  the "Аватар" label no longer says "(Emoji)".

## 2026-07-01 (news carousel)

### Home news becomes a real side-scrolling carousel with multiple items

When more than one admin news item exists, the home news block now behaves as
a proper swipeable carousel instead of a silent scroll area.

- Added dot indicators under the cards; the active dot elongates (gold).
- Auto-advances every 5s, looping; pauses while the user hovers/touches and
  resumes after. Tapping a dot scrolls to that card; manual swipe updates the
  active dot (snap scroll retained).
- Single-item / welcome-fallback behaviour unchanged (no dots, no timer).

## 2026-07-01 (checkout as a page + chips)

### Restaurant checkout converted from popup modal to a full page

The food-order checkout ("Захиалгын мэдээлэл") was a body-appended overlay
modal; it's now a proper routed page at `#/checkout` (and `#/checkout/:gameId`)
with the app header/nav, so it behaves like every other screen.

- New `renderCheckout(gameId)` renders into `main()` with a back link;
  `showCheckoutModal` removed. Cart-pill navigates to `#/checkout` instead of
  opening a modal. A `preserveCartOnce` flag keeps the cart if the user backs
  out of checkout to the menu.
- The three radio groups are now `seg-chip`/`chip-row` chips (matching the rest
  of the app): delivery location (Хаана авах вэ?), pickup time (Хэзээ авах вэ?),
  and payment (Төлбөр). Selecting "table" still reveals the floor plan and
  "scheduled" still reveals the datetime input; values read from the active
  chip's `data-*` attribute.

## 2026-06-30 (payment method chips)

### Tee-time "Төлбөрийн арга" switched from radio buttons to chips

The payment-method selector shown after picking a tee-time slot used boxed
radio buttons; converted it to the same `seg-chip`/`chip-row` pattern used for
holes/size/visibility in the create form, for visual consistency.

- Clubhouse / QPay are now `seg-chip` toggle buttons (gold active state);
  disabled QPay uses `chip-disabled`.
- Selected value now read from `#create-payment-chips .seg-chip.active`
  (`data-pay`) instead of a checked radio input.

## 2026-06-30 (favicon + app icons)

### Favicon and push-notification icons switched to the new brand mark

The browser favicon and FCM push icons still used the old green "UB" logo
while the home-screen/app icons were already the navy/gold golfer-shield. Made
them consistent with the new brand.

- Generated `favicon.ico` (16/32/48) + `favicon-16/32/48/64.png` from
  `icon-512.png` and pointed the `index.html` `<link rel="icon">` set at them.
- Push notifications (`public/firebase-messaging-sw.js`) now use
  `/icon-192.png` (icon) and `/favicon-48.png` (badge) instead of the old
  `/icon.svg`.
- Removed the stale old-brand assets `public/UBGolf_web_favicon.png` and
  `public/icon.svg` (no longer referenced anywhere).
- App icons (`icon-192/512`, `apple-touch-icon`) and the manifest were already
  on the new mark and are unchanged.

## 2026-06-30 (icon sweep)

### Replaced remaining emoji glyphs with the line-icon set

Swept the app for leftover emoji used as UI icons and replaced them with the
inline SVG line icons from `src/icons.js` so the interface is visually
consistent everywhere (no old emoji in chrome).

- Added icons: `star`, `card`, `phone`, `table`, `trash`, `close`.
- Food/menu: title, category filter, popular-item badge, image placeholder,
  search field, admin menu list (placeholder, popular badge, edit/delete).
- Orders: status chips/banners, cart pill, checkout pay options, kitchen
  table/area badges, kitchen title.
- Game detail/admin: remove-player and copy-bank buttons, edit-game/edit-user
  titles, Admin link, news/table delete, waiting-list & group headers,
  followed-group label, success checkmarks, empty states, users-list role.
- Left in place intentionally: avatar-picker emoji, onboarding illustrations,
  transient toast/share-text glyphs, and the dev styleguide preview.

## 2026-06-30 (home dashboard)

### Home rebuilt as the prototype dashboard

Home is now a dashboard (the full games browser lives on `#/games`):
greeting → news carousel → enriched next-game card → sponsor slot → 3 stat
tiles → "Upcoming" list. Presentation only.

- News carousel: branded welcome card (no announcements backend yet — a single
  honest placeholder, carousel-ready for real news later).
- Next-game card enriched: group-size + slots chips and a player avatar stack
  with `+N` overflow (real players), gold "details" CTA.
- Sponsor slot: neutral placeholder banner (replaceable with a real sponsor).
- 3 stat tiles from REAL data — games joined/created, following, followers
  (the prototype's handicap/ranking aren't in the app's data model, so real
  social stats are used instead of fabricated numbers).
- "Upcoming" list: nearest games as surface list rows + "All" → `#/games`.
- New i18n keys (upcoming/viewAllShort/news/sponsor/stat*, MN/EN/KR); CSS for
  carousel, sponsor slot, stat row, next-game chips + avatar stack.

### Risk
Low. Markup/CSS only; verified the dashboard renders (forced-localStorage build,
reverted). Games browser/history/archive intact on `#/games`.

## 2026-06-30 (structure)

### Prototype information architecture — 5-tab nav, Games + Services routes, course picker

Follow-up to the markup pass: matched the prototype's structure, not just the
look. Presentation/navigation only — no data model, store, or business logic
changed.

- Bottom nav rebuilt to the prototype's 5-tab layout with a center gold FAB:
  Нүүр (home) · Тоглолт (`#/games`) · ➕ (create) · Үйлчилгээ (`#/services`) ·
  Захиалга (`#/orders`). Profile moved to the home avatar (as in the prototype).
- New `#/games` route: the full games browser (segmented tabs + day carousel)
  with a serif title + create FAB. Extracted shared `gamesBrowserHTML()` /
  `wireGamesBrowser()` so Home and Games reuse one implementation.
- New `#/services` hub: navy feature card (Food → `#/menu`) + 2×2 service grid
  (tee time, equipment, coaching, pro shop) + events row; non-built services
  show a "coming soon" toast.
- Create: course `<select>` replaced with selectable rows (navy flag tile +
  gold check). A hidden `<select id="game-location">` preserves every existing
  `.value` read and the `change` listener (mtbogd tee-time section intact).
- New i18n keys (nav + services + gamesTitle + comingSoon, MN/EN/KR).
- New CSS: 5-tab nav + FAB, services hub, course picker.

### Risk
Low–moderate. Verified locally (forced-localStorage build) that Home, Games,
Services and Create render correctly with the new nav; reverted the temp patch.
All ids/handlers/routes-to-existing-views preserved; `#/menu` still works.

## 2026-06-30 (later)

### Full prototype redesign — page markup to the approved design

Building on the token foundation, the page markup was rebuilt to match the
approved prototype layout (design handoff), not just the palette. Presentation
only — no data flow, routing, handlers, or i18n logic changed.

- Home: greeting header (name + bell + avatar) instead of the hero block; navy
  "next game" feature card computed from the user's nearest upcoming game;
  segmented gold filter tabs; line-icon section headers.
- Games card: surface card with a navy leading tile, serif course title, clock
  meta, status pill, lock icon, footer dots + slot progress + chevron.
- Auth: navy splash with gold rings + cream card + vertical crest logo.
- Members: prototype page header (serif title + count pill) + icon search field.
- Orders: order rows as surface list-rows with an order tile; icon headers.
- Game detail: line icons for location/time/actions; community pill.
- Admin: 2×2 stat overview tiles + icon section tabs.
- Create: line-icon back link + invite button.
- Reusable component classes added to `tokens-redesign.css` (feature card,
  surface card, segmented tabs, list row + tile icon, stat tile/grid, page
  head, search field, soft-gold pill) plus prototype→app var aliases so the
  handoff markup ports faithfully and stays theme-aware.
- New i18n keys (greetingHi/nextGame/viewDetails/notifications/adminTitle,
  MN/EN/KR).

### Risk
Low–moderate. Markup/CSS only; all ids, `data-*`, event bindings, routes and
`t()` keys preserved. Verified build + auth/styleguide render with no JS errors.

## 2026-06-30

### Visual redesign — navy · gold · cream (append-only token override)

Re-skins the whole app by re-pointing the design tokens `style.css` already
exposes (the documented "a redesign re-points these, the whole app follows"
playbook). Forest-green ➜ navy, antique gold ➜ brighter brand gold, Inter ➜
Manrope (body) + Merriweather (display headings). No JS changes — the app's
existing white-alpha surfaces read correctly on navy.

- `src/redesign.css` (new): append-only override loaded after `style.css`.
  Re-points `--bg-*`, `--gold*`, `--text-*`, `--emerald*` (reused as the navy
  feature tone) and `--font`; semantic `--color-*` follow. Switches active/
  primary states (primary button, active filter tab, date badge, order tracker,
  nav) to gold. Also defines `--primary-color`, `--border-color`, `--bg-color`,
  `--danger-color`, `--primary-rgb` — referenced in code but never defined, so
  the notif badge, order tracker and food cart pill were silently colorless;
  now they render.
- `index.html`: load `redesign.css` after `style.css`; `theme-color` → `#08203A`.
- Preview on `#/styleguide`. A light-cream variant is possible but needs ~5
  find/replace in `app.js` for inline white-alpha surfaces, so the safe drop-in
  is the navy theme.

### Risk
Low. Additive CSS override + two `index.html` lines; no JS or data changes.

## 2026-07-02

### Tee-time QPay moves to MTBogd (MTBogd owns the QPay lifecycle)

UBGolf no longer creates QPay invoices for tee-time itself. MTBogd owns the QPay
merchant + payment lifecycle; UBGolf calls MTBogd's API and shows the QR.

- `functions/index.js`: `MTBOGD_BASE` → `https://api-sci3zq7dca-df.a.run.app/external/v1`
  (all MTBogd calls migrate to the new base + new `mbg_live_` key). New
  `mtbogdWebhook` (`/api/mtbogd-webhook`): HMAC-SHA256 signature verify
  (`MTBOGD_WEBHOOK_SECRET`), delivery dedup, reflects `paid`/`cancelled` onto the
  game (found by `bookingId`).
- `src/booking.js`: `createQpayInvoice(bookingId)`, `getQpayStatus(bookingId)`.
- `src/app.js`: tee-time QPay now confirms the booking up front (like clubhouse),
  saves the game, then shows `showMtbogdQpayModal` (MTBogd QR + status polling).
  The game always exists regardless of payment. Removed the bookingPayments /
  server-confirm tee-time flow.
- `firebase.json`: `/api/mtbogd-webhook` rewrite.
- `database.rules.json`: `games` `.indexOn ["bookingId"]`; `mtbogdDeliveries`.
- Food-order QPay (UBGolf's own) is unchanged.
- New secret `MTBOGD_WEBHOOK_SECRET`; `MTBOGD_API_KEY` re-set to the new key.
- Docs: `functions/MTBOGD_QPAY.md`.

## 2026-06-28 (3)

### Design system foundation (for upcoming UI redesign)

- `src/style.css` `:root`: added a **semantic token layer** (`--color-*`,
  `--space-*`, `--text-*`, font weights) that aliases the existing primitives —
  a redesign re-points these centrally without touching component code. Existing
  primitives untouched (non-breaking).
- `src/app.js` `renderStyleGuide()` + `#/styleguide` route (no login required):
  a **living style guide** that renders the real tokens and component classes —
  colors, type, spacing, radius, buttons, chips, cards, tracker, skeleton — so
  it never drifts from the app.
- `docs/design-system.md`: documents the 3-layer structure (primitive →
  semantic → component), token reference, component class list, and a
  step-by-step UI-redesign playbook. Stays vanilla JS (no React/Storybook).

## 2026-06-28 (2)

### UX improvements — remaining items (#1,6,7,9,10,12)

- **Bottom navigation** (`index.html`, `updateBottomNav`): fixed mobile nav
  (🏠 Нүүр / ➕ Тоглолт / 🍽️ Хоол / 👤 Профайл) with active-route highlight;
  hidden in kiosk, auth and kitchen. Profile opens the existing profile modal.
- **Onboarding** (`showOnboarding`/`maybeShowOnboarding`): one-time 3-step intro
  after first login (localStorage `golfup_onboarded`), gated behind profile
  completion.
- **Skeleton loader** (`skeletonCards`): shimmer placeholders replace the home
  feed spinner.
- **Pull-to-refresh** (`initPullToRefresh`): pull down at the top to re-run the
  router (mobile only; skipped when a modal is open).
- **Food → Game link** (`renderFoodOrder`): entering #/menu with no game context
  shows a picker of the user's upcoming games to attach the order to.
- **Tee-time picker** (#12): single-tee times select in one tap; multi-tee
  times show a count badge.
- i18n: nav/onboarding/ptr/food-picker keys (mn/en/kr). CSS: bottom nav,
  skeleton, pull-to-refresh, onboarding.

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
