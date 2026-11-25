---
title: Dashboard — Unverified Claims
type: dashboard
owner: orchestrator
updated: 2026-11-24
---

# Unverified Claims Dashboard

> Tracks every `UNVERIFIED` marker across `02-Research/`, `03-Spikes/`, and `06-Risk/`. Target before Phase 3 lock: **0 unacknowledged gaps** (every remaining `UNVERIFIED` item must carry explicit human verification steps).

```dataview
TABLE status, owner, updated
FROM "02-Research" OR "03-Spikes" OR "06-Risk"
WHERE contains(string(status), "unverified") OR status = "in-progress"
SORT file.name ASC
```

## Live Audit
- Populated automatically after Phase 1 research tracks `R01`–`R10` return.
