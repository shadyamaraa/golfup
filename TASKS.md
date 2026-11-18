# TASKS.md

## Workflow Tasks

- [ ] Use a branch for larger changes instead of editing `main` directly.
- [ ] Pull latest from GitHub before starting work on another PC.
- [ ] Keep `AGENTS.md`, `CLAUDE.md`, and `PROJECT_NOTES.md` updated when workflow or architecture changes.

## Product Backlog

- [ ] Add marshal/manage desktop timetable view.
- [ ] Add booking status flow: pending, confirmed, cancelled.
- [ ] Send marshal notifications for new games.
- [ ] Consider mapping `manage.ubgolf.club` to a manage route or separate manage app.
- [ ] Improve admin panel layout for desktop operations.
- [ ] Add clearer notification cleanup/status handling.
- [ ] M Cup: decide on Firebase Auth so scorer access can be enforced by
      database rules, not only in the UI. See `docs/mcup-match-play.md`.
- [ ] M Cup phase 2 (spec §27): push notifications, player and pair
      statistics, historical results.
- [ ] Casual formats phase 3: a cross-group scramble leaderboard — rank every
      team in the game by net total, not only the 2 v 2 inside each group.
- [ ] Coaching phase 2: payment through the club's own QPay and the club
      paying the coaches their share; then counting lessons used against a
      package, a class with a fixed timetable, lesson notes. See
      `docs/coaching.md` («Not in this version»).

## In Progress

- [ ] None

## Done

- [x] Coaching, flexible times — a coach opens weeks at once, a player
      books a weekly series, and a lesson's time is changed at once or by a
      request the coach grants. `docs/coaching.md`.
- [x] Coach programs — a coach posts a course or package with a poster and
      prices in four steps; members ask to join and the coach sees who.
      `docs/coaching.md` («Programs»).
- [x] Coaching, first version — Services → «Дасгалжуулагч»: admin-made
      coaches open their own times, members book and cancel, both are
      reminded. Payment stays outside the app. `docs/coaching.md`.
- [x] Gender on the member profile — chips on the member's own form, a
      required select when an admin creates a profile, and a one-off backfill
      from the women's circle and the club's ladies events.
- [x] Printable tournament score cards at #/spsheet — one flight in the
      casual game's card layout, own and team first, with a whole-flight or
      only-mine toggle. The grid is shared, so the two cannot drift apart.
- [x] Tournament scoring screens no longer rebuild themselves on every score
      entered anywhere in the tournament — scorers reported the card jumping
      and taps being eaten mid-round.
- [x] A member's own team is marked on team-event leaderboards — the ticker
      badge, the home strip, the board row and the ТАНЫ БАЙР banner — without
      giving a team a userId.
- [x] Leaderboard ticker on the tournament scoring screens — the live board
      flows past above the card, so a player entering a hole sees where the
      tournament stands without leaving it.
- [x] A live game ends only when 🏁 Finish is pressed — the four-hour clock
      no longer pushes a round still being played into history, and a game
      nobody finishes drops out a day after its tee time.
- [x] Rename app from GolfUp to UB Golf.
- [x] Add player circles and interest circles.
- [x] Limit game circle choices to the creator's assigned circles.
- [x] Add admin user search.
- [x] Collapse admin create-user form.
- [x] Fix duplicate notification creation.
- [x] Filter history by the selected home tab.
- [x] Upgrade Firebase Functions runtime to Node.js 22.
- [x] Fourball and Foursome tournaments on the scramble rails — fourball's
      pair derived best-ball-by-hole off full per-player HCPs, its members'
      cards posting to WHS; foursome as a scramble for pairs.
- [x] Scramble tournaments — teams as sp.players entries, organiser-typed team
      HCP, team size 2 or 4, board or flight-match reading. See
      `docs/tournament-scramble.md`.
- [x] Casual game formats phase 2: scramble / fourball / foursome — 2 v 2
      inside a tee group, one-ball team scores under `games/{id}/teamScores`,
      no WHS posting for scramble/foursome.
- [x] M Cup live match tracking (team match play) — phase 1 of the spec.
- [x] Stableford scoring for casual games and stroke play tournaments.
