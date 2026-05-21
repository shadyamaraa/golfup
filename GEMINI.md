# GEMINI.md

Instructions for Gemini / Antigravity when working on this repository.

## Start Here

Before editing:

1. Read `AGENTS.md`.
2. Read `PROJECT_NOTES.md`.
3. Read `TASKS.md`.
4. Run `git status --short`.
5. Confirm whether the current branch and workspace are clean enough for the task.

## Gemini / Antigravity Rules

- Treat GitHub as the source of truth.
- Pull latest changes before starting work on another PC.
- Do not edit `main` directly for large features unless the user explicitly asks.
- Keep edits small and tied to the requested feature or fix.
- Do not overwrite changes from Codex, Claude, or manual edits.
- Do not change Firebase config, deployment config, or function runtime unless explicitly requested.
- Do not touch `.env`, secrets, `node_modules`, `dist`, or local clone folders.
- Run `npm run build` after code changes.
- Update `CHANGELOG_AI.md` for meaningful changes.

## Preferred Implementation Style

- Preserve the existing vanilla JS + Firebase structure.
- Prefer small UI changes inside the relevant render function in `src/app.js`.
- Keep reusable Firebase/database logic in `src/store.js`.
- Add UI text to `src/i18n.js` in both languages.
- Keep mobile interactions simple and admin/manage screens practical for desktop use.

## Git Workflow

For non-trivial work:

```bash
git checkout main
git pull origin main
git checkout -b ai/gemini-task-name
```

After changes:

```bash
npm run build
git diff --check
git status --short
```

Commit, push, or deploy only when requested by the user.
