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

## Live Summary (Stage D — Slice 1 Complete; Slice 2 Awaiting Policy Approval)
| Item | Blocker | Owner | Next Action |
|---|---|---|---|
| **`UV-01` Frontend `pnpm install` (`@ui-sdk/core@0.1.0-beta.17` & `@ui-sdk/react@0.1.0-beta.17`)** | `pnpm 11.28.9` release-age policy blocked clean install (auto-proposing `minimumReleaseAgeExclude` for `@ui-sdk/core@0.1.0-beta.17` & `@ui-sdk/react@0.1.0-beta.17`) and exited with `ERR_PNPM_IGNORED_BUILDS` on `esbuild@0.25.12`. Per `AGENTS.md` #1, policy bypasses were reverted and not committed. | Abel | Confirm whether to allow `minimumReleaseAgeExclude` for `@ui-sdk/*@0.1.0-beta.17` + `allowBuilds.esbuild: true` in `pnpm-workspace.yaml`, or wait for the release-age window to pass |
| **Windows `WebView2` Hardware/CI Verification (`S01`–`S04`, `S07`–`S08`, `v0.1` `.msi`)** | Dev host is macOS `arm64`; Windows 10/11 runner requires GitHub Actions `windows-latest` | Orchestrator / CI | `.github/workflows/ci-pr-fast.yml` wired for `windows-latest`; execute on PR/push |
| **Apple Developer ID / Windows EV Code Signing Secrets** | Requires human-owned signing certificates (`Release-Signing-Update.md`) | Abel | Local unsigned/ad-hoc dev builds & `v0.1.0` unsigned Alpha tag proceed cleanly (`SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`); signing keys supplied prior to `v0.2` signed Beta (`ST-41`) per [[Milestones]] & [[Plan-of-Record]] |
| **Linux X11/Wayland WebKitGTK Support** | Explicitly deferred by Abel (`2026-11-24`) to a future post-v1.0 milestone (`ADR-0001`) | Orchestrator | Re-open after `v1.0` ships on macOS & Windows |
