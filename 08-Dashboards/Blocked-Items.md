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

## Live Summary (Phase 2 Active)
| Item | Blocker | Owner | Next Action |
|---|---|---|---|
| **Phase 3 Architecture & ADRs** | Gate requires Phase 2 (`S01`–`S08`) measured numbers + Abel's explicit approval | Orchestrator | Complete Spikes `S01`–`S08`, consolidate Phase 2 Gate report, request Abel's approval |
| **Phase 4 Roadmap & Stories** | Gate requires Phase 3 Red-Team pass + Abel's explicit approval | Orchestrator | Request approval after Phase 3 Gate |
| **Linux X11/Wayland WebKitGTK Hardware Validation (`S01`–`S04`)** | Host machine is macOS `arm64` with no Docker/Lima/UTM Linux desktop VM running yet (`qemu-system-aarch64` present) | `Allegedly Charts & UI` | Measure macOS `arm64` natively in Phase 2, document Linux gap honestly as `UNVERIFIED` on hardware with exact CI/VM commands to run on Linux |
