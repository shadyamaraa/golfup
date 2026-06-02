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
- `src/store.js`

### Summary
Added game event notifications: edit (game_updated), join/leave (player_joined/player_left), and delete (game_deleted). All joined players receive notifications — not just the creator. Edit form tracks what changed (date/time/location/group size/description) and includes the diff in the notification. game_deleted notification has no View button. store.saveNotification dedup bypassed for event types that repeat per-user.

### Risk
Low. Additive feature; no UI layout changes.

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
