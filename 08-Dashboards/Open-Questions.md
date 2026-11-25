---
title: Dashboard — Open Questions
type: dashboard
owner: orchestrator
updated: 2026-11-24
---

# Open Questions Dashboard

> **Note:** Obsidian's community `Dataview` plugin is not currently installed in `/Users/abelmora/Documents/Obsidian/.obsidian/community-plugins.json` (Obsidian `Bases` core plugin *is* enabled). The Dataview block below will render automatically if you install Dataview; until then, Ember maintains the live summary table below at every gate.

```dataview
TABLE status, round, owner, updated
FROM "01-Charter" OR "02-Research" OR "04-Architecture"
WHERE status = "awaiting-abel" OR contains(file.name, "Questions")
SORT updated DESC
```

## Live Summary (Phase 0 Gate)
| File | Topic | Status | Waiting On |
|---|---|---|---|
| [[Questions-For-Abel]] | Round 1 Frontier (Q1–Q8: OS, Instruments, Prop Firms, Budget, v0.1 Scope, Build Model, FOSS/Mobile, Repo Layout) | `awaiting-abel` (defaults logged in [[Assumptions]]) | Abel |
