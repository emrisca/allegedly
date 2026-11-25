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

## Live Summary (Phase 1 Gate)
| Item | Blocker | Owner | Next Action |
|---|---|---|---|
| **Phase 2 Spikes (`S01`–`S08`)** | Section 0.2 hard precondition: `.obsidian/app.json` does not yet have `userIgnoreFilters` (Obsidian is running on `/Users/abelmora/Documents/Obsidian`), and Round 1 `Q8` (in-repo `spikes/` vs external `~/Documents/Projects/motiveview-spikes/`) is awaiting Abel's reply | Abel / Orchestrator | Either (a) add `node_modules`, `target`, `dist`, `build`, `.git`, `.venv`, `spikes/*/node_modules` to Obsidian → Settings → Files & links → Excluded files (and turn OFF *Detect all file extensions*), or (b) confirm external build/spike paths; then Ember launches Spikes `S01`–`S08` |
| **Phase 3 Architecture & ADRs** | Gate requires Phase 2 measured spike numbers + Abel's explicit approval | Orchestrator | Present Phase 2 Spike Gate report and request approval |
| **Phase 4 Roadmap & Stories** | Gate requires Phase 3 Red-Team pass + Abel's explicit approval | Orchestrator | Present Phase 3 Architecture Gate report and request approval |
