# CLAUDE.md

Instructions for Claude Code when working on this repository.

## Start Here

Before editing:

1. Read `AGENTS.md`.
2. Read `PROJECT_NOTES.md`.
3. Read `TASKS.md`.
4. Run `git status --short`.
5. Keep changes small and scoped to the request.

## Claude-Specific Rules

- Do not perform broad refactors unless explicitly requested.
- Do not change Firebase config, deployment config, or function runtime unless the user asks.
- Do not touch `.env`, secrets, `node_modules`, or `dist`.
- Before significant edits, state the intended files and behavior.
- After edits, run `npm run build`.
- Update `CHANGELOG_AI.md` for meaningful changes.

## Preferred Implementation Style

- Follow existing vanilla JS patterns in `src/app.js`.
- Use existing store functions in `src/store.js` instead of direct Firebase calls from views.
- Add i18n keys to both Mongolian and English objects.
- Avoid introducing new dependencies unless necessary.
- Keep UI dense and practical. This is an operational golf organizer, not a marketing page.

## Git Workflow

For normal work:

```bash
git checkout main
git pull origin main
git checkout -b ai/claude-task-name
```

After changes:

```bash
npm run build
git diff --check
git status --short
```

- Commit only when requested or when the workflow explicitly calls for it.
- **Never push to `main` directly — always push to the feature branch.**
- After pushing the branch, inform the user so they can review and merge on GitHub.

After a branch is merged:

```bash
npm run tidy      # prune, fast-forward main, drop the merged local branches
```

Two things that are easy to get wrong — both are spelled out in `AGENTS.md`:

- **Production deploys only on a marker.** The merge commit's title must
  contain `[deploy]`, otherwise `main` moves and nothing ships. Afterwards
  check that `ubgolf.club` and `golfup-app.web.app` serve the same new
  `assets/index-*.js`.
- **Cloud Functions are not in CI.** A change under `functions/` ships only
  when the owner runs `firebase deploy --only functions` — say so whenever a
  change touches that folder.
