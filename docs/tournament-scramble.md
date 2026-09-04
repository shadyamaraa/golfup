# Scramble tournaments

How a team event runs on the tournament side, for whoever organises one and
whoever maintains the code next. The casual-game counterpart is
`docs/casual-formats.md`; this page is about `tournaments/{id}` with
`format: 'scramble'`.

## What it is

A scramble is played by **teams** — two or four players a side, the
organiser's choice — and every team writes **one score** per hole: both (or
all four) tee off, the best ball is chosen, everyone plays on from there, and
so on into the hole. The field is ranked by **team total**, exactly like a
stroke play leaderboard, and the organiser may instead read a two-team flight
as a **2 v 2 match** settled hole by hole.

## The idea that makes it cheap

**A team is an `sp.players` entry.** Nothing else in the stroke play stack had
to learn what a team is:

- its one ball lives at the ordinary `sp.scores[teamKey][round][hole]` path;
- `spEntries` ranks it like any competitor, so `rankEntries`, the cut, the
  ▲/▼ arrows, the board, the schedule and the printed sheet are untouched;
- the same-flight database rule already lets anyone in the flight write it.

The team's **members stay in `sp.players` too**. That is what carries the
flight pointer (`sp/players/{pid}/groups/{round}`) the database rules read, so
a member can enter their own team's ball. They have no card of their own and
are simply left off the board.

## Data model

| Field | Holds |
| --- | --- |
| `format` | `'scramble'` — the fourth tournament type after `stroke`, `match`, `ryder` |
| `spTeamSize` | `2` \| `4` — missing reads as **4**, the club scramble, because a flight of four already is a team |
| `spTeamRank` | `'board'` \| `'match'` — only meaningful with two-player teams, since four IS the flight and has nobody to play |
| `sp.players[teamKey]` | `{ kind: 'team', name, hcp, members: {pid: true, …}, groups: {round: gid} }` |
| `sp.players[pid]` | the members, as ordinary player entries — with the same `groups` pointer as their team |
| `sp.scores[teamKey][round][hole]` | the team's one ball — the existing path |
| `sp.groups[round][gid].players` | the **teams** in the flight, not the people |

`teamKey` is the members' ids sorted and joined with `+` (`teamKeyOf`), the
same collision-proof shape a casual game's `pairKey` gives, so a team taken
apart and rebuilt the same way finds its scores again. `members` is a
`{pid: true}` map rather than an array so a database rule can test membership
without iterating.

**No database-rules change.** `sp/scores/$pid/$round` allows a writer whose own
`sp/players/{me}/groups/{round}` equals the target's — and the admin editor
writes that pointer onto every member of a team in a flight, in the same save
that writes the team's.

## Handicaps

The **team handicap is typed by the organiser**, per team, in the admin
editor. Nothing is derived from the members: a scramble's allowance is the
organiser's call and no single formula fits both a pair and a four (the
common ladders are 35/15 % for two and 25/20/15/10 % for four). The board's
Net reading and the Stableford option both take that number as the team's
handicap, exactly as they take a player's.

In a **flight match** (`spTeamRank: 'match'`) the two team handicaps play off
the lower, the difference allocated by stroke index — the app's usual "off the
low man", and the same rule the casual scramble uses.

## WHS

A scramble tournament **never posts a round**. One ball a team means no player
has a card of their own, and a "complete" round would be partly somebody else's
shots. The guard is `tnIsTeam()` at the top of `finalizeSpRoundIfComplete` in
`src/strokeplay-score.js` — the tournament-side twin of the casual scorer's
`isOneBallFormat()`.

## What the organiser does

1. **Wizard** — pick *Скрэмбл*, then on the settings step the team size (4 by
   default) and, for two-player teams, how a flight is read (board or match).
   Course, tee, PAR, rounds and cut are the ordinary stroke play settings.
2. **Editor → Тоглогчид** — add players from the members, as for any
   tournament.
3. **Editor → Багууд** — tick the players for a team, name it (a default is
   offered from their first names), *Баг үүсгэх*. Type each team's handicap.
   Disbanding a team frees its members.
4. **Editor → flights** — the draw sends **teams** out: one four-player team a
   flight, or up to two two-player teams. Team names show in the flights, on
   the schedule and on the printed sheet.
5. On the tournament page the board ranks the teams; in a match event a
   *Flight matches* card above it settles each two-team flight hole by hole,
   and the rulebook sits in a fold under the board.
6. Scores go in on the **flight scorecard** (`#/spgroup/…`): one row and one
   stepper per team, its members named underneath; in a match event the
   flight's status line reads *2 UP · Thru 9* the way the M Cup does.

## Code map

| File | Responsibility |
| --- | --- |
| `src/strokeplay.js` | `tnIsTeam`, `tnTeamSize`, `tnTeamRank`, `teamKeyOf`, `isTeamEntry`, `teamMemberIds`, `spTeams`, `spFlightMatch`; `spEntries` and `drawGroups` read teams in a team event |
| `src/strokeplay-admin.js` | the Багууд fold; `saveDraft` writes `kind`/`members` and every member's flight pointer |
| `src/strokeplay-score.js` | team rows with member lines, the flight match line, the WHS guard |
| `src/tournament-wizard.js` | the Скрэмбл card and its two settings |
| `src/app.js` | `tnFormatText`, the team size on the facts line under the title, the board's ТEAM column head, the flight-matches card in a match event, and the rulebook fold under the board — a stroke-kind tournament has no info tab, so that is where a player reads the rules |
| `src/mcup-rules.js` | `scrambleRulesHTML()` — the Mongolian rulebook block, shared with casual games |

Tests: `npm run test:mp` — the team section of `scripts/test-strokeplay.mjs`.
