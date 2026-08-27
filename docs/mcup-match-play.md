# M Cup — match play (Live Match Center)

How the team match play feature works, for whoever runs the tournament and
whoever maintains the code next.

## What it is

A Ryder Cup-style team competition inside the existing tournament model. A
tournament whose **Format** is `Ryder Cup` grows a second life: teams, a
roster per team, sessions, pairings, a scorer screen, and a public Live Match
Center. Stroke play tournaments are untouched — same records, same Google
Sheet import, same leaderboard.

## The three formats

- **Stroke** (`format: 'stroke'`) — the original stroke play tournament:
  rounds, PAR, the cut, the Google Sheet leaderboard. Unchanged.
- **Match** (`format: 'match'`) — plain match play under Rules of Golf
  Rule 3: **1v1 singles only**. No teams, no sessions, no 12/14-player
  rules. The admin picks participants from the members and pairs them into
  a flat match list; the board shows the match cards plus a player
  standings table (P / W-L-H / Pts). Everything else — the scoring engine,
  the scorer screen, consent, device protection, push — is the same
  machinery as Ryder Cup.
- **Ryder Cup** (`format: 'ryder'`) — everything the rest of this document
  describes: two teams, sessions of FOURSOMES / FOURBALL / SINGLES, the
  club's M Cup rulebook. Tournaments saved before the rename (`'match'`
  with `mp.teams` or `mp.sessions`) are recognised as Ryder Cup
  automatically.

The branching lives in one place: `tnKind(tn)` in `src/matchplay.js`
returns `'stroke' | 'match' | 'ryder'`, and every view, editor and strip
decides from it. Each match play format carries its rulebook
(`src/mcup-rules.js`) — shown on the wizard's type step and on the
tournament's Мэдээлэл tab, with a "📖 Форматын дүрэм" shortcut under the
Match Center.

## The one rule that explains the rest

**Only hole winners are stored.** Everything else — match status, dormie,
close-outs, who won, team points, session results, the overall score — is
recomputed from those holes every time anything is displayed.

That is why a correction needs no cleanup: change hole 4 and the status line,
the final result and both team totals re-settle themselves. It is also why
there is no "recalculate" button to forget to press.

## Setting up a tournament

Admin → Тэмцээн → the creation wizard: name the tournament, pick **Ryder
Cup** on the type step (only that type's questions follow — PAR, rounds,
the cut and the scoring sheet belong to stroke play and never appear), dates
and venue, the two team names, create. It opens straight into its editor,
where the match play section appears under the usual fields.

For a plain **Match** tournament the wizard asks nothing extra — its editor
shows a single Оролцогчид member picker instead of the team boxes, and an
"Match нэмэх" list where each side is one player picked from the
participants; matches are `SINGLES` automatically and there is no session
block.

1. **Teams.** Name, short name (what the cards and scoreboard show), and an
   optional **logo** — pick any image and it is shrunk in the browser to a
   small badge stored inside the tournament record (no storage bucket
   involved). Wherever a logo exists it replaces the team's colour dot: the
   scoreboard, match cards, the detail modal, the scorer screen. Teams
   without one keep the colour dot. Either way the mark is decoration only —
   every status line names its team in words, so the board still reads
   correctly in greyscale or to a colour-blind viewer.
2. **Roster.** Picked straight from the app's members, 14 per team — a
   roster entry IS the member, which is what lets them score their own match.
   Removing a player still fielded in a match warns before it empties that
   pick.
3. **Sessions.** Day, number, format (`FOURSOMES`, `FOURBALL`, `SINGLES`),
   start time. Matches belong to a session and inherit its format, which is
   what sizes the pairing selects (2 v 2, or 1 v 1 for singles).
4. **Matches.** Match number, tee time, and the players on each side.
5. **Scorers.** Per match, pick the app members allowed to enter its holes.

Press **Match play хадгалах**. Until you do, edits live only in the browser —
which is deliberate: the admin tab re-renders often, and a draft cannot lose
your typing to a re-render.

### Validation as you go

Under each session:

- 12 unique players per team per session
- nobody in two matches of the same session
- the right number of players per side for the format
- nobody fielded for the team they are not on

And under the whole setup, **participation**: `n/14` per team, naming the
players who have not been given a match yet. All 14 must play at least once.

## Scoring on the course

`#/score/:tournamentId/:matchId`. The players IN a match score it themselves:
their own match card on the Match Center grows an **Оноо оруулах** button.
Admins, marshals and per-match assigned scorers can score any match from the
admin editor's link as before.

The screen is three buttons: **team A**, **ТЭНЦСЭН**, **team B**. Tap the one
that won the hole; the screen moves to the next hole itself. That is the whole
interaction — a hole should take a couple of seconds.

- **Сүүлийн нүхийг буцаах** clears the last hole entered.
- **Tapping any played hole** in the strip at the bottom opens it for
  correction. Everything after it re-settles.
- **Corrections need the enterer's consent.** Changing a hole SOMEBODY ELSE
  entered does not overwrite it: the change parks as a proposal (⏳ on that
  hole), and the person who entered it sees it at the top of their scoring
  screen with Зөвшөөрөх / Татгалзах. Your own entries, holes nobody owns,
  and officials (admin, marshal) write straight through. Ownership passes to
  whoever's value was accepted.
- **Түр зогсоох** marks the match SUSPENDED (weather, darkness). This is the
  one state a human sets rather than the holes deriving; resume clears it.

A match closes itself out the moment it is decided — 4 up with 3 to play is
`4 & 3`, `COMPLETED`, and nothing entered afterwards can change it. Undo the
hole that caused the close-out and the later holes come back into play.

### Bad signal on the course

Taps are written through Firebase Realtime Database, which queues writes
locally when the phone is offline and sends them when signal returns. The
screen updates immediately either way, because it paints from the database's
own local answer rather than waiting for the network.

Two scorers on the same match cannot diverge: neither screen keeps scoring
state of its own, and each tap reads the match as it stands at that moment
rather than as it looked when the screen was drawn.

One caveat worth telling the scoring crew: **open the screen before you lose
signal**. A screen already open keeps working through a dead spot, but one
opened cold with no connection has nothing to show until the connection
returns — it waits rather than failing, but it cannot score in the meantime.

## What spectators see

The tournament page opens on **Match Center**:

1. **Team score** — `ALTAI 8.5 — 7.5 WELLCOM`, with the running session under it.
2. **LIVE matches**, then **FINAL**, then **UPCOMING**.
3. **Session results** — the breakdown per session and the overall.

Each card gives the match number, format, both sides, and one line: who leads
and by how much (`ALTAI 2 UP`), plus `Явц 11`. Before a match tees off that
line is its tee time instead. Tapping a card opens the hole-by-hole story.

The home strip shows the team score, how many matches are live, and the
current session — not a player list. Updates arrive on their own; there is
nothing to refresh.

## Points

Win 1, halve ½ each, loss 0. Team totals are the sum over completed matches.
An unfinished match contributes nothing until it finishes. Nobody types a team
score anywhere.

## Data model

Under `tournaments/{id}/mp`:

| Path | Holds |
| --- | --- |
| `teams/{a\|b}` | name, short, color, logo (small image data URI) |
| `roster/{playerId}` | teamId, name |
| `sessions/{sessionId}` | day, number, format, startTime |
| `matches/{matchId}` | sessionId, number, teeTime, players.{a,b}[], scorerIds, stateOverride |
| `matches/{matchId}/holes/{n}` | `'a'` \| `'b'` \| `'h'` |
| `matches/{matchId}/holeMeta/{n}` | by — who entered the hole (consent owner) |
| `matches/{matchId}/pending/{n}` | value \| 'clear', by, byName, at — proposed correction |
| `audit/{pushId}` | at, by, matchId, hole, value/action, prev |

`'h'` rather than `null` for a halved hole: Realtime Database deletes null
values, so a halved hole stored as null would be indistinguishable from a hole
nobody has played.

Setup saves and scoring writes never touch the same paths, so an admin fixing
a tee time cannot erase a hole a scorer entered a second earlier. The setup
editor writes one key per field and never writes `holes` or `stateOverride` at
all; deletions come from what the editor actually removed, so a match created
by someone else while the editor was open survives the save.

A suspension is the only stored state, and it never outranks the holes: a
match the holes have decided is COMPLETED whatever the flag says, so play that
resumes without anyone pressing Resume still finishes and still scores its
point.

## Server-side protection: the device allowlist

Score writes are enforced per DEVICE. Every browser silently signs in to
Firebase anonymously and gets a stable uid; the database rules only accept
writes under `tournaments/` from uids listed in `mpDevices`. Nothing about the
app's own member sign-in changes.

Turning it on (one-time):

1. Firebase console → Authentication → Sign-in method → enable **Anonymous**.
2. `firebase deploy --only database` (the rules in `database.rules.json`).
3. Open Admin → Тэмцээн. The "Оноо бичих төхөөрөмжүүд" card appears; while
   the registry is empty, press **"Энэ төхөөрөмжийг админ болгох"** — the
   first claim bootstraps as admin. Do this from your own device first.
4. Each scorer opens their match's scoring screen, sees the "not approved"
   banner, and taps **"Эрх хүсэх"**. Their request appears in the admin card;
   approve it. From then on their taps save.

Notes:

- A device, not a person: clearing browser data issues a new uid, so that
  phone must be re-approved. Approve the crew's phones the morning of play.
- Approval is coarse — an approved device may write any tournament. WHICH
  member may score WHICH match remains a UI-level check (the app's own
  sign-in carries no Firebase identity a rule could read); the audit trail
  records who the app believed was scoring. Finer enforcement is part of the
  full Firebase Auth migration, a wider decision than this feature.
- The last admin device cannot be removed from the card, so the registry
  cannot lock itself out. If it ever does (console mishap), delete the
  `mpDevices` node in the Firebase console and bootstrap again.
- Until Anonymous auth is enabled and the rules are deployed, none of this
  gates anything: the card and banner stay hidden and writes behave as
  before.

## Reviewing it without a real tournament

`#/tournament/mcup-demo` opens a sample M Cup — both teams at 14, three
sessions, 24 matches covering every state including a dormie and a suspension.
It also takes the home strip when there is no real tournament to feature. Like
the stroke play sample at `#/tournament/demo`, it only exists on localhost and
Firebase preview channels, never on the production hosts.

## Code map

| File | Responsibility |
| --- | --- |
| `src/matchplay.js` | The rules. Pure functions, no DOM, no Firebase. |
| `src/matchplay-admin.js` | Setup UI: teams, roster, sessions, pairings, validation. |
| `src/matchplay-score.js` | The scorer screen (`#/score/:tnId/:matchId`). |
| `src/matchplay-view.js` | Public Live Match Center and the home strip summary. |
| `src/matchplay-demo.js` | The sample tournament, also used as a test fixture. |
| `src/store.js` | `updateTournament`, `saveTnMatchHole`, `setTnMatchSuspended`. |

Tests: `npm run test:mp`. They cover the engine against the spec's own worked
examples, which session a viewer is shown, and the rendered output of a full
M Cup-shaped tournament.

## Adding a format

`FOURSOMES`, `FOURBALL` and `SINGLES` differ, as far as the software is
concerned, only in how many players a side fields — the match play arithmetic
is identical. To add one, extend `FORMATS` and `FORMAT_TEAM_SIZE` in
`src/matchplay.js`; the setup UI sizes its selects from that table and the rest
follows.

## Phase 2: notifications, statistics, history

**Push notifications.** A signed-in member opens the tournament's Match
Center and taps "Мэдэгдэл авах"; from then on they get a push (and a bell
entry) each time a match finishes, with the result in the title — and when
the last match ends, the body carries the tournament's final score. The
subscription lives in `tnSubs/{tnId}/{userId}`; a Cloud Function
(`mcupMatchFinished`) watches hole writes, re-settles the match server-side,
and fans results out through the existing `/notifications` pipeline, so the
push mechanics are the ones the app already had. What was last announced is
recorded under `mp/notified/{matchId}` — a correction that changes a final
result announces again; anything else never repeats. Deploying this needs
`firebase deploy --only functions,database` once.

**Player statistics** (spec §25). The Match Center gains a collapsed
"Тоглогчийн статистик" panel: per player Played / W-L-H / Points (each player
carries their side's match points), sorted by points, plus pair records for
the two-player formats. Everything is derived from completed matches only,
by `playerStats()` / `pairStats()` in `src/matchplay.js`.

**Past tournaments.** Below the board, finished match play tournaments are
listed with their derived final scores, newest first, each linking to its own
Match Center — the M Cup archive grows by itself as tournaments finish.
