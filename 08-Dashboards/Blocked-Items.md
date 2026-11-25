---
title: Dashboard — Blocked Items
type: dashboard
owner: orchestrator
updated: 2026-11-24
---

# Blocked Items Dashboard

```dataview
TABLE status, owner, updated
WHERE status = "blocked"
SORT updated DESC
```

## Live Summary
| Item | Blocker | Owner | Next Action |
|---|---|---|---|
| Obsidian `userIgnoreFilters` | Obsidian is currently running on `/Users/abelmora/Documents/Obsidian`; editing `.obsidian/app.json` while open risks overwrite | Abel | Add `node_modules`, `target`, `dist`, `build`, `.git`, `.venv`, `spikes/*/node_modules` in Obsidian Settings → Files & links → Excluded files, and disable "Detect all file extensions" before Phase 2 installs |
| Phase 3 Architecture & ADRs | Gate requires Phase 1 + Phase 2 completion and Abel's approval | Orchestrator | Complete Phase 1 & Phase 2, then request gate approval |
