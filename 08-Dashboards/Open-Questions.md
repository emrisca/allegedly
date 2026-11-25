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

## Live Summary (Phase 2 Gate Ready)
| File | Topic | Status | Waiting On |
|---|---|---|---|
| [[Questions-For-Abel]] | Phase 0/1 Decisions: `Q1` (macOS + Windows first; Linux future), `Q7` (FOSS Desktop-only), `Q8` (in-repo spikes), Brand (**Allegedly**), UI kit (**`ui-sdk`**) **RESOLVED**; remaining defaults (`Q2`–`Q6`) accepted unless Abel overrides | `mostly-resolved` (defaults active in [[Assumptions]]) | Abel (optional override at Phase 2 Gate) |
| [[03-Spikes/S01-Chart-WebGL-Sync\|Phase 2 Gate (`S01`–`S08`)]] | Explicit approval to advance from Phase 2 (all 8 spikes verified) into **Phase 3 (Architecture & ADRs)** using `grill-with-docs` | `awaiting-abel-gate` | Abel |
