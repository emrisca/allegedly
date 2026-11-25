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

## Live Summary (Stage D — Slices 1–5 Complete on Apple M2 macOS `arm64`; `UV-01` & `UV-04` Closed, `UV-02` & `UV-05` Verified on M2)
| Item | Blocker | Owner | Next Action |
|---|---|---|---|
| **Windows 10/11 `WebView2` Hardware/CI Verification (`UV-03`, `UV-05` Windows, `v0.1` `.msi`)** | Dev host is macOS `arm64`; Windows 10/11 validation requires GitHub Actions `windows-latest` or Windows 11 host | Orchestrator / Abel | `.github/workflows/ci-pr-fast.yml` wired for `windows-latest` (Rust + Frontend + `UV-01` a11y); validate full `.msi` bundle + `WebView2` frame times when Windows 11 access is available |
| **Apple Developer ID / Windows EV Code Signing Secrets** | Requires human-owned signing certificates (`Release-Signing-Update.md`) | Abel | Local unsigned/ad-hoc `.app` (`12.07 MB`) & `v0.1.0` unsigned Alpha tag proceed cleanly (`SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`); signing keys supplied prior to `v0.2` signed Beta (`ST-41`) per [[Milestones]] & [[Plan-of-Record]] |
| **Linux X11/Wayland WebKitGTK Support** | Explicitly deferred by Abel (`2026-11-24`) to a future post-v1.0 milestone (`ADR-0001`) | Orchestrator | Re-open after `v1.0` ships on macOS & Windows |
