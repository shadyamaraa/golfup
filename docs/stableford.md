# Stableford

How points scoring works, for whoever runs a tournament and whoever maintains
the code next. Stableford is available in two places — a **casual game format**
(alongside Match play and Skins, see `docs/casual-formats.md`) and a **stroke
play tournament setting** the organiser chooses. Both read the same strokes
through the same engine.

## What it is

Every hole is scored on its own, against par, after the player's handicap
strokes:

| Hole | Points |
| --- | --- |
| Albatross (3 under) | 5 |
| Eagle | 4 |
| Birdie | 3 |
| **Par** | **2** |
| Bogey | 1 |
| Double bogey or worse | 0 |

The floor is the point of the format: a blow-up hole costs a player their two
points and no more, so one wrecked hole does not wreck the round. It also means
a player who cannot score can pick the ball up, which is why Stableford suits a
club field and a slow Saturday.

Two numbers worth remembering:

- **36 points gross** is a round played exactly to par.
- **36 points net** is a round played exactly to handicap. Anything above 36 is
  better than your handicap; below it, worse.

**Higher is better** — the opposite of every other stroke play board in the app,
which is the one thing the code has to be careful about.

## Handicaps

A player receives their **full playing handicap**, allocated hole by hole by the
course's **stroke index**: a handicap of 18 gets a stroke everywhere, a handicap
of 4 gets one on the four hardest holes, a handicap of 20 gets two on the two
hardest and one elsewhere. That is `strokesReceived(hcp, si)` in
`src/handicap.js`, the same allocator match play and skins use.

- **A player with no handicap scores gross Stableford.** Unlike match play and
  skins — where the allowance is a *difference* between players, so one missing
  handicap makes the whole contest gross — Stableford is each player against
  par, so one player's missing handicap only affects that player.
- **A course with no stroke index plays gross** for everyone, automatically:
  `strokesReceived` returns 0 without one.
- **A course with no per-hole pars cannot be scored at all.** The board shows
  nothing rather than a total that quietly skipped holes, and says why. Only the
  registry courses in `src/courses.js` (Sky Resort, Chinggis Khaan, and their
  aliases) carry a card.
- **A plus handicap gives no strokes back** — a known limitation, shared with
  every other format in the app.
- A **nine-hole** casual card allocates the full handicap against the 18-hole
  stroke index of the nine holes actually played, the same v1 rule the match and
  skins allowance already uses.

Where each surface gets the handicap:

| | Handicap | Stroke index |
| --- | --- | --- |
| Casual game | `gamePlayingHcp()` — the hand-entered per-game value, else the member's WHS index converted for the course | `holeSI(game, n)` (maps a back-9 card through to its physical hole) |
| Tournament | `sp.players[pid].hcp`, set by the admin or filled from the WHS index | `tnSIs(tn)[hole]` |

## Choosing it

**Casual game** — the Format chip row on the create form (and the edit form):
Strokeplay / Match play / Skins / **Stableford**. Competition 9/9 is a stroke
play idea and its row disappears for the other formats.

**Tournament** — the organiser's choice, stored on the tournament as
`spScoring`. It sits next to PAR on the creation wizard's stroke play step and
in the admin editor. It is **not** a viewer toggle: the board, the cut and the
movement arrows all follow it, so it has to be the same for everyone looking.

Changing it later is safe on both surfaces. Strokes are the only stored input;
points are recomputed on every render, so switching to Stableford and back
loses nothing.

## What the board shows

- Totals are **plain integers** — no `E`, no `+`/`−`, and no red, which on a
  stroke play board means "under par" and would read backwards here.
- The column is headed **ОНОО** (Points) instead of НИЙТ (Total).
- Positions run **highest first**, ties still read `T1`, and a player with no
  score still sorts last.
- The **cut** keeps the top N and ties by points.
- The **▲/▼ arrows** compare the previous round's points the same way up.
- The **Net toggle disappears** — Stableford is already played off handicap, so
  there is no gross to switch to. A `Stableford · Net` label takes its place.
- The **player card** header shows points; its hole rows still show strokes and
  to-par, with an extra **STB** row per nine.
- The **scorers** are unchanged — strokes are still what gets entered — but the
  totals line carries the running points beside the gross.

## WHS posting

Unchanged. A round posts to `rounds/{ghin}` when every hole has strokes, exactly
as it always did: posting reads the strokes and never looks at the format. The
one nuance is real golf, not code — a player who picks up leaves a hole blank,
so that card is incomplete and correctly does not post.

## Data model

| Path | Holds |
| --- | --- |
| `tournaments/{id}.spScoring` | `'strokes'` \| `'stableford'` — missing reads as `'strokes'`, never backfilled |
| `games/{id}.format` | gains `'stableford'` alongside `'match'` and `'skins'` |

Nothing else is stored. `saveTournament` writes the whole record with no field
whitelist and the database rules already let an admin device write tournament
fields, so there was **no store change and no rules change**.

## Code map

| File | Responsibility |
| --- | --- |
| `src/stableford.js` | The points themselves. `holePoints`, `roundPoints`, `strokesOverHoles` — pure, shared by both surfaces. |
| `src/game-formats.js` | `stablefordResult()` for a casual game's group. |
| `src/strokeplay.js` | `tnScoring` / `tnHigherWins` / `spMetricFor`, and `spEntries(tn, 'stableford')`. |
| `src/tournament-sheet.js` | `higherWins` in `rankEntries` and `cutSet`. |
| `src/game-score.js`, `src/app.js`, `src/scorecard.js`, `src/strokeplay-card.js`, `src/strokeplay-score.js` | The panels, boards, printed reports and cards. |

### How the ranking flips

`rankEntries` and `cutSet` did not grow a second sorting path. They take a
`higherWins` flag and **negate the sort key** once, inside the one function that
derives it. The ascending sort, the `Infinity` sentinel that means "no score,
sorts last", the tie counting and the `T`-prefixed position labels then all keep
reading exactly as they do for strokes. Negation is a bijection, so a tie stays
a tie.

Tests: `npm run test:mp` runs `scripts/test-stableford.mjs` for the engine, plus
the Stableford sections of `scripts/test-game-formats.mjs` (casual) and
`scripts/test-strokeplay.mjs` (tournament ranking, the cut, the draw).
