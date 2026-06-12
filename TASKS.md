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

## In Progress

(нothing — mobile redesign awaiting review/merge)

## Done

- [x] **Mobile UI redesign** (branch: `claude/blissful-meitner-a2xk5m`, all 5 screens done 2026-06-11…12)
  - Design reference: `prototype.html` in repo root. Minimal black/white theme, Inter, full-bleed hero, underline tabs, bottom nav + blue FAB, bottom sheets.
  - UI layer only: `src/app.js` render functions + `src/style.css`; store/Firebase/booking logic untouched.
  - Screens: 1) base+nav/FAB ✅ 2) Home ✅ 3) Create ✅ 4) Game detail ✅ 5) Profile (`#/profile` route replaces modal; logout button on screen) ✅

- [x] Rename app from GolfUp to UB Golf.
- [x] Add player circles and interest circles.
- [x] Limit game circle choices to the creator's assigned circles.
- [x] Add admin user search.
- [x] Collapse admin create-user form.
- [x] Fix duplicate notification creation.
- [x] Filter history by the selected home tab.
- [x] Upgrade Firebase Functions runtime to Node.js 22.
