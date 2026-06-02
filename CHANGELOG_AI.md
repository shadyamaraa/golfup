# CHANGELOG_AI.md

Track meaningful AI-assisted changes here so work done across two PCs and multiple tools stays understandable.

## 2026-06-02

### Tool
Claude Code

### Branch
claude/beldey-nguk4

### Changed Files
- `src/app.js`
- `src/i18n.js`

### Summary
Implemented split-tee (Hole 1 + Hole 10) feature. Games now have `holes` (9 or 18) and `startingHole` (1 or 10) fields. Create/edit forms include radio toggles for these fields with visual highlight. Slot conflict validation blocks two games at the same date+time+startingHole. Personal time conflict check updated to use holes-based duration (9h = 2h, 18h = 4.5h) with window overlap logic. Game cards and detail view display holes/startingHole info.

### Risk
Low. Additive feature; existing games without the new fields fall back to defaults (18 holes, Hole 1).

## 2026-05-21

### Tool
Codex

### Branch
main

### Changed Files
- `AGENTS.md`
- `CODEX.md`
- `CLAUDE.md`
- `GEMINI.md`
- `PROJECT_NOTES.md`
- `TASKS.md`
- `CHANGELOG_AI.md`

### Summary
Added shared AI workflow notes and separate tool-specific instructions for Codex, Claude Code, and Gemini/Antigravity. Documented Git workflow, architecture, product concepts, and backlog.

### Risk
Low. Documentation-only change.
