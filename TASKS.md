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

- [ ] **Mobile UI redesign** (branch: `ai/claude-mobile-redesign`)
  - Design reference: `prototype.html` in repo root — open in browser to see the approved design.
  - Style: minimal black/white theme (PGA Tour app inspired), Inter font, full-bleed hero banner on Home, underline tabs, bottom navigation bar + blue circular FAB for create, bottom sheets instead of modals, page transition animations.
  - Approach: rewrite UI layer only (HTML templates in `src/app.js` render functions + `src/styles.css`). Do NOT touch `src/store.js`, Firebase logic, routing, or `src/booking.js`.
  - Screen order: 1) base styles + bottom nav/FAB ✅ (done 2026-06-11), 2) Home (hero banner, underline tabs, game list rows with circular course thumbs) ✅ (done 2026-06-12), 3) Create game (chip selectors, tee-time bottom sheet) ✅ (done 2026-06-12), 4) Game detail (banner header, numbered player list) ✅ (done 2026-06-12), 5) Profile (centered avatar, stats row, form).
  - After each screen: `npm run build`, show user before continuing.

## Done

- [x] Rename app from GolfUp to UB Golf.
- [x] Add player circles and interest circles.
- [x] Limit game circle choices to the creator's assigned circles.
- [x] Add admin user search.
- [x] Collapse admin create-user form.
- [x] Fix duplicate notification creation.
- [x] Filter history by the selected home tab.
- [x] Upgrade Firebase Functions runtime to Node.js 22.
