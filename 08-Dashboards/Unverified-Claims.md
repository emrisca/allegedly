---
title: Dashboard — Unverified Claims
type: dashboard
owner: orchestrator
updated: 2026-11-25
---

# Unverified Claims Dashboard

> Consolidated at **Phase 3 Gate (`2026-11-25`, Red-Team `PASS`)**. Every item below is explicitly tagged `UNVERIFIED` in Phase 3 architecture specs and scheduled for verification in Phase 4 (`Sprint-Plan-v0.1.md`) and post-Phase-5 `v0.1` CI.

```dataview
TABLE status, owner, updated
FROM "02-Research" OR "03-Spikes" OR "04-Architecture" OR "06-Risk"
WHERE contains(string(status), "unverified") OR status = "in-progress"
SORT file.name ASC
```

## Active `UNVERIFIED` Register (Post-Phase 3)

| Source | Unverified Claim / Target | Verification Plan | Target Milestone |
|---|---|---|---|
| [[S01-Chart-WebGL-Sync]] – [[S04-CSS-Layout-Perf]], [[0002-desktop-shell-and-binary-ipc\|ADR-0002]] | **Windows 10/11 (`WebView2` + `x86_64-pc-windows-msvc`)** live WebGL2 frame times, binary IPC throughput, pop-out window sync, `luau0-src` C++17 build, and packaged `.msi` installer `< 40 MB` | GitHub Actions `windows-latest` CI + packaged `.msi` smoke | `v0.1` CI (Sprint 2–3) |
| [[0002-desktop-shell-and-binary-ipc\|ADR-0002]], [[C4-Architecture]] | Full OS process-tree **idle RAM `< 300 MB`** (including macOS `launchd`-parented `WKWebView` XPC helpers & Windows `WebView2` child processes) and signed lazy-init **cold start `< 2.0 s`** | Packaged `.app` / `.msi` harness measuring full process tree (`SV-01`, `SV-13`) | `v0.1` CI (Sprint 3) |
| [[Data-Model]], [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]] | macOS APFS **`PRAGMA fullfsync = ON`** latency under batched 50-order Kill-Switch cancel wave (`<= 15 ms` target) | Dedicated macOS APFS `allegedly-oms` bench (`SV-15`) | `v0.1` (Sprint 2) |
| [[Plugin-ABI]], [[0005-study-runtime-and-scripting-language\|ADR-0005]] | Optional **`wasmtime::component`** (WIT) binary size delta and batch call overhead vs `S07`'s flat linear-memory core module (`+3.32%` vs Native) | Keep flat SoA `ByteView` as `v0.1` primary ABI; benchmark WIT overhead before enabling | `v0.2` |
| [[Data-Model]], [[0004-orderflow-gpu-and-hotpath-renderer\|ADR-0004]] | `FootprintSlabArena` live RSS footprint across 10 concurrent multi-timeframe charts within `< 300 MB` idle budget | 10-chart soak memory profiler (`SV-13`) | `v0.1` (Sprint 3) |
| [[0010-ui-kit-docking-and-settings-as-code\|ADR-0010]], [[License-Registry]] | **`@ui-sdk/react` & `@ui-sdk/core` (`0.1.0-beta.17`)** React 19 compile stability, WAI-ARIA keyboard/focus compliance, and `pnpm` release-age policy install check | Clean `pnpm install` (without bypassing release-age policy) + Vite/Playwright smoke per `AGENTS.md` | `v0.1` (Sprint 1) |
| [[S05-Live-Ingest-TickVault]], [[Testing-Strategy]] | 30-minute unattended peak-volatility live soak (`SOL/USD`, depth=100, `>= 1,000` trades/venue) + real user-downloaded Databento `.dbn.zst` CME sample | Nightly soak test (`SV-11`) + optional human `.dbn.zst` fixture | `v0.1` / `v0.2` |
| [[S07-Scripting-Sandbox]], [[S08-Storage-100M-Replay]] | `TA-Lib v0.8.3` C oracle cross-check + 10M-row L2 MBP delta Parquet archive compression & seek latency | Golden fixture parity test + L2 archive benchmark | `v0.1` / `v0.2` |
| [[S06-OMS-Paper-Execution]] | Live-network smoke against `paper-api.alpaca.markets/v2` & tastytrade Certification Sandbox | Opt-in user-credential smoke (`v0.2`; zero live/paid accounts in core CI) | `v0.2` (Opt-in) |
| [[R08-Prior-Art]], [[R09-Legal-Licensing]], [[Compliance-Notes]] | Formal trademark counsel clearance for **"Allegedly"** (`allegedly.market` / `allegedlyapp.com`), Pine clean-room spec, `nautilus_trader` LGPL sidecar boundary, CFTC Rule 4.41 disclaimers | Qualified IP/securities counsel prior to public binary marketing | Pre-Public Release |
