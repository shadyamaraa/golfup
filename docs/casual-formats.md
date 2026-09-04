# Casual game formats

Stroke play, match play, skins, Stableford, scramble, fourball, foursome.

How a casual game's format works, for whoever runs game days and whoever
maintains the code next. The M Cup counterpart is `docs/mcup-match-play.md`.

## What it is

A casual game (`games/{id}`, the `#/create` → `#/game/:id` → `#/gscore/`
flow) has a **format**. Stroke play is what every game was before the field
existed and stays the default; the match play family reads the same
scorecard differently.

## The formats

- **Stroke play** (`format: 'stroke'`, or no field at all) — ranked by
  gross / net-to-par, the competition 9/9 mode, the WHS posting. Unchanged.
- **Match play** (`'match'`) — classic 1 v 1 inside the tee group. A group of
  four is two matches, a group of two one; the odd player of a three has no
  match and still keeps a card. Status reads as on the M Cup board: `2 UP`,
  `AS`, `4 & 3`, `HALVED`.
- **Skins** (`'skins'`) — every hole is a pot for the whole group: the unique
  lowest score takes it, a tie carries it to the next hole.
- **Stableford** (`'stableford'`) — each player against par for points: par 2,
  birdie 3, bogey 1, double bogey or worse 0, off their full handicap. Higher
  is better, and a blow-up hole costs two points and no more. See
  `docs/stableford.md` — the same engine also scores stroke play tournaments.
- **Scramble** (`'scramble'`) — 2 v 2. Both partners tee off, the better ball
  is chosen and both play on from there; the team writes **one score** per
  hole. No individual card, so **nothing posts to WHS**.
- **Fourball** (`'fourball'`) — 2 v 2. Every player plays their own ball and a
  side's score on a hole is its **best net ball**. Nothing new is stored and
  WHS posting is unaffected.
- **Foursome** (`'foursome'`) — 2 v 2, one ball a side, played alternate shot.
  One team score per hole, and again **nothing posts to WHS**.

The three team formats settle **hole by hole**, through the same engine match
play uses, so they carry dormie, close-outs (`3 & 2`) and the conceded-hole
affordance. See "Teams" at the end of this file.

## The one rule that explains the rest

**Only strokes are stored** — plus, for match play, the holes somebody set
by hand. Everything the screens show (who leads, dormie, the close-out, the
skins standings, the carry) is recomputed from those strokes every time
anything is displayed, by the pure module `src/game-formats.js`. Changing a
game's format after the round has started is therefore safe: the strokes are
the same record, only the reading changes, and nothing is lost switching
back.

## Handicaps

"Play off the low man." In a match the higher-handicap player receives the
**difference**, allocated hole by hole by stroke index (`strokesReceived` in
`src/handicap.js`, the course card in `src/courses.js`). In skins every
player receives their difference to the group's lowest. The playing handicap
is the one the scorer already knows — the hand-entered per-game value, else
the member's WHS index converted for the course (`gamePlayingHcp`).

- A **team's** handicap is the **average** of its two players, and the higher
  team receives the **difference**, rounded to a whole stroke and allocated by
  stroke index — the same "off the low man" idiom, one level up. Half a stroke
  rounds up to the team receiving it.
- **Fourball is the exception among the team formats**: every player is still
  playing their own ball, so it uses the individual allowance off the **lowest
  of the four in the contest**, exactly as match play and skins do.
- Net only when **everyone involved** has a handicap: one missing makes that
  match (or the whole skins game, or the whole team contest) gross — a
  one-sided allowance would be no fairer than none. **Stableford is the
  exception**: each player is measured against par rather than against the
  others, so every player receives their **full** handicap and one player's
  missing handicap only makes that player gross.
- A course with no card (no SI) plays gross automatically.
- On a **9-hole card** the full difference is allocated against the 18-hole
  SI of the nine holes actually played — roughly a half-allowance, on the
  hardest holes. The v1 rule; pinned by a test.

## Scoring on the course

The group scorer (`#/gscore/:gameId/:groupIdx`) is the same screen for every
format: the − / + stepper enters each player's strokes for the hole, the
first + seeds the hole's par, the strip at the bottom jumps between holes.
Under the strokes, the format adds its own panel:

**Match play** — one card per match: the two names, the status line, thru,
the allowance ("Дорж +5 цох." or "Гросс"), and a hole strip (A / B / –).

- **Tap a hole in the match strip** to set its result by hand — the four
  buttons are A won / ТЭНЦСЭН / B won / Авто. This is how a **conceded
  hole** is recorded: the hole needs no strokes at all, the match walks on
  past it. A hand-set hole shows a small dot; Авто removes it.
- A hole that neither hand-set nor fully entered stops the walk, like a gap
  in the M Cup scorer. The card names it ("Нүх 3 дутуу") with a dashed ring
  in the strip.
- **Хос солих (⇄)** cycles a four-player group through its three possible
  splits. Anyone who can open the scorer for the group may do it — the pairing
  is decided on the first tee by the people standing there, and cycling is
  lossless: strokes are per player and hand-set holes are per pair, so a
  split that comes back brings its holes with it.

**Skins** — standings chips and a strip where a won hole carries the winner's
initial on gold with the pot beside the hole number, a tie shows ↷, and
"Дамжсан N" is the pot still carrying.

**Stableford** — standings chips with each player's running points and their
allowance ("+10"), and a strip of the leader's points hole by hole; a hole where
they take a stroke is marked with a dot. A hole nobody finished simply scores
nothing and stops nothing — unlike skins, the walk carries on.

**Scramble / Foursome** — the four player rows are replaced by **two team
rows**: both partners' names, the team's running ball, and one − / + stepper,
because a team writes one score. Under each team's name sit its two partners'
**HCP chips** — with no individual rows, that is the only place a marker can
set a playing handicap, and without one the team has no average and the contest
quietly plays gross. The panel is the match card, plus each team's gross and
net line. Everything else — the strip, the ⇄, tapping a hole to concede it —
works exactly as it does for a 1 v 1 match.

**Fourball** — the four player rows and the stepper are **completely
unchanged**; only the panel is added, showing the side-by-side match off the
best net ball.

Who may score is unchanged: yourself, your group, the game's creator, admin
and marshal (`canScoreGamePlayer`).

## What the game page and the printed card show

- The game page's title carries a format pill; the scoreboard becomes the
  group's matches (name · status · name) or the skins standings. Stroke
  play games keep the ranked table and the 9/9 toggle. Home cards carry the
  pill too.
- The final report on the scorer (after Тоглолт дуусгах) leads with the
  format's own lines and keeps the strokes table under them.
- The printable `#/scorecard/:gameId` keeps every player's card and replaces
  the F9 / B9 / 18 net reports with a match table (result, hole-by-hole,
  hand-set holes starred) or a skins table.

## WHS posting

A player's card posts to `rounds/{ghin}` when every hole has strokes. A
conceded hole with no strokes leaves the card incomplete, so nothing posts —
the right outcome for a pick-up. Match play, skins, Stableford and **fourball**
are all unchanged by this: in every one of them each player played their own
ball for every hole.

**Scramble and foursome never post.** One ball a team means no player has a
card of their own, and a "complete" round there would be partly somebody else's
shots. The check is `isOneBallFormat()` at the top of `finalizeRoundIfComplete`
in `src/game-score.js` — deliberately not in `handicap.js`, because
`game-formats.js` imports `handicap.js` and asking it for the format would close
that circle. The one cost: the odd player of a three- or five-player scramble
group, who really is playing their own ball, stops posting too.

## Data model

Under `games/{id}`, all optional:

| Path | Holds |
| --- | --- |
| `format` | `'stroke'` \| `'match'` \| `'skins'` \| `'stableford'` \| `'scramble'` \| `'fourball'` \| `'foursome'` — missing reads as stroke, never backfilled |
| `pairing/{groupIdx}` | the group's playing ORDER as player ids: singles `order[0]` v `order[1]`; teams `order[0]+order[1]` v `order[2]+order[3]` |
| `holeOverrides/{key}/{hole}` | a hand-set hole: the winning side's id, or `'h'` |
| `teamScores/{teamKey}/holes/{hole}` | one team's ball — scramble and foursome only |
| `scoreAudit` | existing trail, plus `kind: 'override'` and `kind: 'team'` entries |

`pairKey` is two ids sorted and joined with `+`. A **team's id is its two
partners' pair key**, and a team contest's override key is `pairKey` of the two
team ids — so a singles key has one `+` and a team-vs-team key three, and they
can never collide. A pairing is honoured only while it names exactly the
group's current players; otherwise the join order applies. Overrides under a
side that is not currently playing are never read.

**`teamScores` is keyed by the team, not by the group index.** The earlier
sketch in this file said `teamScores/{groupIdx}/{teamKey}`, and that was wrong:
`reflowGroupsBySize()` re-packs every player into fresh groups on an Edit save,
so changing the group size or removing one player renumbers everybody. A
pairing survives that because it self-heals back to join order — **scores
cannot**, because they are the input rather than a derived reading, and would
simply be orphaned. The team key survives a renumber and a ⇄ alike.

`saveGame()` strips `pairing`, `holeOverrides` and `teamScores` (as it already
did `scores`, `scoreAudit`, `hcp`) so an Edit / join / leave never wipes what
the scorer wrote. No database-rules change: `games` is wide open.

## Code map

| File | Responsibility |
| --- | --- |
| `src/game-formats.js` | The rules. Pure functions: format, pairing, allowance, match, skins, Stableford. |
| `src/stableford.js` | The points themselves, shared with the tournament board. |
| `src/game-score.js` | The scorer: format panels, the hand-set chooser, ⇄. |
| `src/app.js` | Create/edit format chips, the game page's boards, the pills. |
| `src/scorecard.js` | The printed match / skins reports. |
| `src/store.js` | `saveGamePairing`, `saveGameHoleOverride`, `saveGameTeamScoreHole`, the `saveGame` strip list. |
| `src/mcup-rules.js` | The Mongolian rulebook blocks, one export per format, shown on the game page. |

Tests: `npm run test:mp` runs `scripts/test-game-formats.mjs` with the rest.

## Teams

One sentence covers every group size: **teams are consecutive pairs of the
playing order, contests are consecutive pairs of teams, and anything left over
keeps its own ball and has no opponent.** That is the rule `groupPairs` already
applies to players, applied once more to the teams it produces — which is why
`groupTeams` and `teamContests` are six lines between them.

The group size is the organiser's choice up to `APP_CONFIG.maxGroupSize` (8),
so the odd cases are reachable and all of them read honestly:

| Players | Teams | Contests | The scorer shows |
| --- | --- | --- | --- |
| 0–1 | 0 | 0 | the format's name and "2 v 2 needs four players" |
| 2 | 1 | 0 | one team ball, totalled, with no opponent |
| 3 | 1 + spare | 0 | one team ball plus the third player's own row |
| **4** | **2** | **1** | the normal case |
| 5 | 2 | 1 | one contest plus the fifth player's own row |
| 6 | 3 | 1 | one contest plus a third team with nobody to play |
| 8 | 4 | 2 | two contests, both settled |

The **⇄** cycles a four-player group through its three splits, and it is
lossless for teams exactly as it is for singles: a team's ball lives under its
own key and its conceded holes under the contest key, so a split that comes
back brings both with it.

## Tournaments

A **scramble tournament** is the tournament-side counterpart — teams of two or
four, one ball, a field-wide leaderboard by team total. It shares this file's
rulebook block and the same "off the low man" flight match, but stores teams
as `sp.players` entries rather than under `teamScores`. See
`docs/tournament-scramble.md`.

## Phase 3 (not built)

A **cross-group scramble leaderboard** — every team in the game ranked by net
total, rather than only the 2 v 2 inside each tee group. The numbers are already
derived; only the board is missing.
