---
title: Dashboard — Blocked Items
type: dashboard
owner: orchestrator
updated: 2026-11-25
---

# Blocked Items Dashboard

```dataview
TABLE status, owner, updated
WHERE status = "blocked"
SORT updated DESC
```

## Live Summary (Phase 5 Complete)
| Item | Blocker | Owner | Next Action |
|---|---|---|---|
| **Windows `WebView2` Hardware/CI Verification (`S01`–`S04`, `S07`–`S08`, `v0.1` `.msi`)** | Dev host is macOS `arm64`; Windows 10/11 runner requires GitHub Actions `windows-latest` | Orchestrator / CI | Wire `windows-latest` workflow in `v0.1` CI (`Testing-Strategy.md`) |
| **Apple Developer ID / Windows EV Code Signing Secrets** | Requires human-owned signing certificates (`Release-Signing-Update.md`) | Abel | Local unsigned/ad-hoc dev builds & `v0.1.0` unsigned Alpha tag proceed cleanly (`SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`); signing keys supplied prior to `v0.2` signed Beta (`ST-41`) per [[Milestones]] & [[Plan-of-Record]] |
| **Linux X11/Wayland WebKitGTK Support** | Explicitly deferred by Abel (`2026-11-24`) to a future post-v1.0 milestone (`ADR-0001`) | Orchestrator | Re-open after `v1.0` ships on macOS & Windows |
