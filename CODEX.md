# CODEX.md

Instructions for Codex when working on this repository.

## Start Here

Before editing:

1. Read `AGENTS.md`.
2. Read `PROJECT_NOTES.md`.
3. Read `TASKS.md`.
4. Run `git status --short`.
5. Check whether there are uncommitted changes from another tool or PC.

## Codex-Specific Rules

- Keep changes tightly scoped to the user's request.
- Prefer reading existing code before proposing architecture.
- Do not overwrite unrelated changes made by Claude, Gemini, Antigravity, or the user.
- Use `rg` for code search when possible.
- Use `apply_patch` for manual edits.
- Do not edit Firebase config, deployment config, or function runtime unless explicitly requested.
- Do not touch `.env`, secrets, `node_modules`, `dist`, or local clone folders.
- For frontend changes, verify with `npm run build`.
- Update `CHANGELOG_AI.md` for meaningful code or workflow changes.

## Preferred Implementation Style

- Follow existing vanilla JS rendering patterns in `src/app.js`.
- Use store helpers in `src/store.js` rather than adding direct Firebase logic in views.
- Add i18n strings to both Mongolian and English objects.
- Keep admin/manage UI dense and operational.
- Avoid broad refactors unless the user asks.

## Git Workflow

For non-trivial work:

```bash
git checkout main
git pull origin main
git checkout -b ai/codex-task-name
```

After changes:

```bash
npm run build
git diff --check
git status --short
```

- Commit, push, or deploy only when requested by the user.
- **Never push to `main` directly. Always push the feature branch and ask the user to merge.**
