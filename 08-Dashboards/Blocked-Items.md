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

## Live Summary (Phase 2 Gate Ready)
| Item | Blocker | Owner | Next Action |
|---|---|---|---|
| **Phase 3 Architecture & ADRs** | Gate requires Abel's explicit approval after reviewing Phase 2 (`S01`–`S08`) measurements | Orchestrator | Awaiting Abel's go-ahead at Phase 2 Gate |
| **Phase 4 Roadmap & Stories** | Gate requires Phase 3 Red-Team pass + Abel's explicit approval | Orchestrator | Request approval after Phase 3 Gate |
| **Windows `WebView2` Hardware/CI Verification (`S01`–`S04`, `S07`–`S08`)** | Dev host is macOS `arm64`; Windows 10/11 runner not yet executed | Orchestrator / CI | Run `S01`–`S04` & `S07`–`S08` benchmarks + packaged `.msi` installer size check on GitHub Actions `windows-latest` in Phase 3/4 |
| **Linux X11/Wayland WebKitGTK Support** | Explicitly deferred by Abel (`2026-11-24`) to a future post-v1.0 milestone | Orchestrator | Re-open after v1.0 ships on macOS & Windows |
