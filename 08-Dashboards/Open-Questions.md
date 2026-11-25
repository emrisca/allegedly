---
title: Dashboard — Open Questions
type: dashboard
owner: orchestrator
updated: 2026-11-24
---

# Open Questions Dashboard

> **Note:** Obsidian's `Dataview` community plugin is not installed; Ember maintains the live summary below at every phase gate.

```dataview
TABLE status, round, owner, updated
FROM "01-Charter" OR "02-Research" OR "04-Architecture"
WHERE status = "awaiting-abel" OR contains(file.name, "Questions")
SORT updated DESC
```

## Live Summary (Phase 1 Gate)
| File | Topic | Status | Waiting On |
|---|---|---|---|
| [[Questions-For-Abel]] | Round 1 Frontier (`Q1`–`Q8`: OS, Instruments, Prop Firms, Budget, v0.1 Scope, Build Model, FOSS/Mobile, Repo/Spike Layout) | `awaiting-abel` (defaults logged in [[Assumptions]]) | Abel |
| [[R09-Legal-Licensing]] | Project Rename Decision (`Ordlith`, `Rungcraft`, `Cairntape`, `Tallyrung`, `Tickkiln`) to resolve USPTO `MOTIVEWAVE`/`TRADINGVIEW` trademark collision | `open-for-round-2` | Abel (before Phase 3 / public repo) |
| [[R02-Shell-UI-Stack]] / [[Blocked-Items]] | Obsidian `Excluded files` (`userIgnoreFilters`) configuration before Phase 2 `pnpm install`/`cargo build` | `blocking-phase-2-in-vault-builds` | Abel |
