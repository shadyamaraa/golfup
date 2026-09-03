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
- [ ] Casual game formats phase 2: scramble / fourball / foursome — 2 v 2
      inside a tee group, one-ball team scores under
      `games/{id}/teamScores`, no WHS posting for scramble/foursome.
      See `docs/casual-formats.md`.

## In Progress

- [ ] None

## Done

- [x] Rename app from GolfUp to UB Golf.
- [x] Add player circles and interest circles.
- [x] Limit game circle choices to the creator's assigned circles.
- [x] Add admin user search.
- [x] Collapse admin create-user form.
- [x] Fix duplicate notification creation.
- [x] Filter history by the selected home tab.
- [x] Upgrade Firebase Functions runtime to Node.js 22.
- [x] M Cup live match tracking (team match play) — phase 1 of the spec.
- [x] Stableford scoring for casual games and stroke play tournaments.
