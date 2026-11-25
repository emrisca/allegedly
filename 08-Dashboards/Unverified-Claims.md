---
title: Dashboard — Unverified Claims
type: dashboard
owner: orchestrator
updated: 2026-11-25
---

# Unverified Claims Dashboard

> Synchronized at **Phase 5 (`2026-11-25`)** with [[Sprint-Plan-v0.1]] §5 (`UV-01`–`UV-10`) and [[Plan-of-Record]] §6. Every target below remains explicitly **`UNVERIFIED`** until empirically executed in its scheduled Stage D / post-`v0.1` CI or legal gate.

```dataview
TABLE status, owner, updated
FROM "02-Research" OR "03-Spikes" OR "04-Architecture" OR "05-Roadmap" OR "06-Risk"
WHERE contains(string(status), "unverified") OR status = "in-progress"
SORT file.name ASC
```

## Active `UNVERIFIED` Register (`UV-01`–`UV-10`)

| ID | Source | Unverified Claim / Target | Verification Plan | Target Gate |
|---|---|---|---|---|
| **UV-01** | [[0010-ui-kit-docking-and-settings-as-code\|ADR-0010]], [[License-Registry]], `AGENTS.md` | **`@ui-sdk/react` & `@ui-sdk/core` (`"0.1.0-beta.17"`)** clean `pnpm` install (no release-age policy bypass), React 19 compile stability, and WAI-ARIA `axe-core` compliance | **BLOCKED (`2026-11-25`) — Awaiting Abel (`AGENTS.md` #1):** `pnpm 11.28.9` release-age policy flagged `@ui-sdk/{core,react}@0.1.0-beta.17` + `ERR_PNPM_IGNORED_BUILDS` on `esbuild@0.25.12`. Policy bypass reverted; awaiting decision in [[Blocked-Items]] | `v0.1` Sprint 1 (`T02` / `ST-01`, `ST-28`) |
| **UV-02** | [[Data-Model]], [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]] | macOS APFS **`PRAGMA fullfsync = ON`** latency under batched 50-order Kill-Switch cancel wave (`<= 15 ms` target / `<= 25 ms` ceiling) | **VERIFIED on Apple M2 macOS APFS (`2026-11-25`)**: `allegedly-oms` release test measured **`3.961 ms`** (`3,961 µs`, `3.79×` faster than `15 ms` target; `50/50` crash-recovery orders verified). Intel macOS CI still pending. | **Verified (Apple M2)** / CI Sprint 2 |
| **UV-03** | [[S01-Chart-WebGL-Sync]]–[[S04-CSS-Layout-Perf]], [[0002-desktop-shell-and-binary-ipc\|ADR-0002]] | **Windows 10/11 (`WebView2` + `x86_64-pc-windows-msvc`)** live WebGL2 frame times (`<= 16.67 ms` p99), binary IPC throughput, `luau0-src` C++17 build, and packaged `.msi` `< 40 MB` | Early headless `windows-latest` WebGL2/IPC smoke (Sprint 3 Week 5) + packaged `.msi` Tier B gate (`ST-25`, `ST-40`) | `v0.1` Sprint 3 W5 (early) & Sprint 4 Tier B |
| **UV-04** | [[Data-Model]], [[0004-orderflow-gpu-and-hotpath-renderer\|ADR-0004]] | `FootprintSlabArena` live RSS footprint (`< 60 MiB`) across 10 concurrent multi-timeframe charts within `< 300 MB` idle budget | 10-chart soak memory profiler (`SV-13` Tier A, `ST-18`/`ST-26`) | `v0.1` Sprint 3 (`ST-18`, `ST-26`) |
| **UV-05** | [[0002-desktop-shell-and-binary-ipc\|ADR-0002]], [[C4-Architecture]] | Full OS process-tree **idle RAM `< 300 MB`** (including macOS `launchd`-parented `WKWebView` XPC helpers & Windows `WebView2` child processes) and packaged lazy-init **cold start `< 2.0 s`** (`0` outbound packets) | Packaged `.app` / `.msi` harness measuring full OS process tree (`SV-01`, `SV-13` Tier B, `SV-20`) | `v0.1` Sprint 4 Tier B (`ST-25`, `ST-40`) |
| **UV-06** | [[S05-Live-Ingest-TickVault]], [[Testing-Strategy]] | 30-minute unattended peak-volatility live soak (`SOL/USD`, depth=100, `>= 1,000` trades/venue) + real user-downloaded Databento `.dbn.zst` CME fixture | `ci-pre-release-soak.yml` (`v0.1` Sprint 4, `ST-40`) + optional human `.dbn.zst` fixture (`v0.2`, `ST-12`) | `v0.1` Sprint 4 (soak) / `v0.2` (`.dbn.zst`) |
| **UV-07** | [[S07-Scripting-Sandbox]], [[S08-Storage-100M-Replay]], [[Testing-Strategy]] | Dev-only `TA-Lib v0.8.3` C oracle cross-check (`KC-06`) + `10M`-row L2 MBP delta Parquet archive seek + 24h `.atdepth` Liquidity Heatmap (`< 64 MB` RAM / `< 30 MB` Zstd disk, `SV-13`) | Golden fixture parity test (`v0.1` Sprint 3, `ST-31`) + L2 archive (`v0.2`, `ST-12`) + 24h `.atdepth` soak (`v0.5`, re-certified `v1.0` GA, `ST-20`) | `v0.1` (`TA-Lib`) / `v0.2` (L2) / `v0.5`–`v1.0` (24h `.atdepth`) |
| **UV-08** | [[Plugin-ABI]], [[0005-study-runtime-and-scripting-language\|ADR-0005]] | Optional **`wasmtime::component`** (WIT) binary size delta and batch call overhead vs `S07`'s flat linear-memory core module (`+3.32%` vs Native) + `.cwasm` warm deserialize | Keep flat SoA `ByteView` as `v0.1` primary ABI; benchmark WIT overhead before enabling | `v0.2` (`ST-33`) |
| **UV-09** | [[S06-OMS-Paper-Execution]], [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]] | Live-network smoke against `paper-api.alpaca.markets/v2` & tastytrade Certification Sandbox | Opt-in user-credential smoke (zero live/paid accounts in core CI) | `v0.2` Opt-in (`ST-37`) |
| **UV-10** | [[R08-Prior-Art]], [[R09-Legal-Licensing]], [[Compliance-Notes]] | Formal trademark counsel clearance for **"Allegedly"** (`RK-04`), Pine clean-room spec wall, `nautilus_trader` `LGPL-3.0-only` sidecar boundary, CFTC Rule 4.41 disclaimers | Qualified IP/securities counsel prior to public marketing/distribution | Pre-Public Release / `v1.0` (`ST-42`, `RK-04`) |
