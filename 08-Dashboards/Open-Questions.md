---
title: Dashboard — Open Questions
type: dashboard
owner: orchestrator
updated: 2026-11-25
---

# Open Questions Dashboard

> **Note:** Obsidian's `Dataview` community plugin is not installed; Ember maintains the live summary below at every phase gate.

```dataview
TABLE status, round, owner, updated
FROM "01-Charter" OR "02-Research" OR "04-Architecture"
WHERE status = "awaiting-abel" OR contains(file.name, "Questions")
SORT updated DESC
```

## Live Summary (Phase 3 Complete — Overnight Autonomous Execution)
| File | Topic | Status | Waiting On |
|---|---|---|---|
| [[Questions-For-Abel]] | Phase 0/1 Decisions: `Q1` (macOS + Windows first; Linux post-v1.0), `Q7` (FOSS Desktop-only), `Q8` (in-repo spikes), Brand (**Allegedly**), UI kit (**`ui-sdk`**) **RESOLVED**; defaults `Q2`–`Q6` active in [[Assumptions]] | `resolved` | None (Abel may override anytime) |
| **Overnight Autonomous Authorization (`2026-11-25`)** | Abel explicitly authorized autonomous progression through Phase 3, Phase 4, Phase 5, and `v0.1` implementation without pausing for manual phase-gate sign-offs | `authorized` | Review morning summary & commits |
