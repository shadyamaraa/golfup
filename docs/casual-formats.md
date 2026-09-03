# Casual game formats — stroke play, match play, skins

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
- Phase 2 (not built): **Scramble**, **Fourball**, **Foursome** — 2 v 2 pairs
  inside the group. See the end of this file.

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

- Net only when **everyone involved** has a handicap: one missing makes that
  match (or the whole skins game) gross — a one-sided allowance would be no
  fairer than none.
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

Unchanged. A player's card still posts to `rounds/{ghin}` when every hole
has strokes. A conceded hole with no strokes leaves the card incomplete, so
nothing posts — the right outcome for a pick-up. Phase 2's one-ball formats
(scramble, foursome) will skip posting altogether.

## Data model

Under `games/{id}`, all optional:

| Path | Holds |
| --- | --- |
| `format` | `'stroke'` \| `'match'` \| `'skins'` — missing reads as stroke, never backfilled |
| `pairing/{groupIdx}` | the group's playing ORDER as player ids: `order[0]` v `order[1]`, `order[2]` v `order[3]` |
| `holeOverrides/{pairKey}/{hole}` | a hand-set hole: the winner's player id, or `'h'` |
| `scoreAudit` | existing trail, plus `kind: 'override'` entries |

`pairKey` is the two ids sorted and joined with `+`. A pairing is honoured
only while it names exactly the group's current players; otherwise the join
order applies. Overrides under a pair that is not currently playing each
other are never read.

`saveGame()` strips `pairing` and `holeOverrides` (as it already did
`scores`, `scoreAudit`, `hcp`) so an Edit / join / leave never wipes what the
scorer wrote. No database-rules change: `games` is wide open.

## Code map

| File | Responsibility |
| --- | --- |
| `src/game-formats.js` | The rules. Pure functions: format, pairing, allowance, match, skins. |
| `src/game-score.js` | The scorer: format panels, the hand-set chooser, ⇄. |
| `src/app.js` | Create/edit format chips, the game page's boards, the pills. |
| `src/scorecard.js` | The printed match / skins reports. |
| `src/store.js` | `saveGamePairing`, `saveGameHoleOverride`, the `saveGame` strip list. |

Tests: `npm run test:mp` runs `scripts/test-game-formats.mjs` with the rest.

## Phase 2 — scramble, fourball, foursome

Two-player teams from the same order (`order[0]+order[1]` v
`order[2]+order[3]`), the same ⇄. Fourball is derived from individual
strokes (best net ball per side); scramble and foursome play one ball, so
they need a team score path (`games/{id}/teamScores/{groupIdx}/{teamKey}/holes`),
team rows on the scorer, and no WHS posting. Overrides reuse `pairKey` on
the two team keys. The M Cup rulebook in `src/mcup-rules.js` already
describes fourball and foursomes; splitting it into per-format exports gives
the game page its blurb.
