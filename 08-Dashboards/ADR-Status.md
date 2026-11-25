---
title: Dashboard — ADR Status
type: dashboard
owner: orchestrator
updated: 2026-11-25
---

# ADR Status Dashboard

> **Phase 3 Complete (`2026-11-25`):** All 10 foundational ADRs (`0001`–`0010`) are authored, reconciled with [[Adopt-Build-Fork]], and cleared by [[Red-Team-Phase3]] (**Verdict: `PASS`**, `0` open findings).

```dataview
TABLE status, date, supersedes, updated
FROM "04-Architecture/ADRs"
SORT file.name ASC
```

## Locked Phase 3 ADRs (`0001`–`0010`)

| ADR | Decision | Status | Anchored Evidence |
|---|---|---|---|
| [[0001-license-brand-and-platform-scope\|ADR-0001]] | `Apache-2.0` license, **Allegedly** brand (`allegedly-*` crates, `.at*` extensions, zero `mv-*` residue), macOS + Windows `v0.1`–`v1.0` (Linux post-v1.0) | `accepted` | [[Charter]], [[R09-Legal-Licensing]], [[Compliance-Notes]] |
| [[0002-desktop-shell-and-binary-ipc\|ADR-0002]] | Tauri v2 + Rust core + binary IPC (`tauri::ipc::Response` + `16 ms` batched `Channel`); `< 40 MB` installer, `< 2.0 s` cold start, `< 300 MB` idle RAM | `accepted` | [[S02-Tauri-IPC-Throughput]], [[IPC-Contract]] |
| [[0003-chart-base-and-viewport-windowing\|ADR-0003]] | Lightweight Charts v5.3 (`Apache-2.0`) + Rust `5,000`-bar viewport windowing (`6,000`-bar hysteresis/idle trim + full-history Rust study warmup) | `accepted` | [[S01-Chart-WebGL-Sync]], [[R01-Charting-Rendering]] |
| [[0004-orderflow-gpu-and-hotpath-renderer\|ADR-0004]] | Raw WebGL2 Footprint/Profile/Heatmap primitive (`0.000 CSS px` drift, `0.30–0.40 ms` draw) + Canvas2D DOM Ladder & Time & Sales (`60.2 fps`, `0.00 ms` layout) | `accepted` | [[S01-Chart-WebGL-Sync]], [[S04-CSS-Layout-Perf]] |
| [[0005-study-runtime-and-scripting-language\|ADR-0005]] | Adopt **Luau** (`mlua`, `+0.47 MiB` gzip) over Rhai (`10.05×` batch / `19.41×` live p99) + **Wasmtime** (`+1.74 MiB` gzip) with flat SoA `ByteView` ABI & `<= 64 MiB` global pool | `accepted` | [[S07-Scripting-Sandbox]], [[Plugin-ABI]] |
| [[0006-tiered-storage-and-replay\|ADR-0006]] | Hive-partitioned `.atvault` Parquet + SQLite WAL (`PRAGMA fullfsync = ON` on macOS for OMS WAL) + `16`-ary Dyadic Segment Tree VRVP (`0.0271 ms` p99, `102.55M ticks/s` replay) | `accepted` | [[S08-Storage-100M-Replay]], [[Data-Model]] |
| [[0007-backtest-engine-adopt-vs-build\|ADR-0007]] | In-process deterministic Rust study/replay backtester (`allegedly-replay`) + optional out-of-process `DuckDB` (`MIT`) / `nautilus_trader` (`LGPL-3.0-only`) IPC/Parquet sidecars | `accepted` | [[S08-Storage-100M-Replay]], [[R07-Storage-Replay-Backtest]], [[License-Registry]] |
| [[0008-market-data-provider-abstraction-and-provenance\|ADR-0008]] | Provider-agnostic `allegedly-ingest` (Kraken WS v2 + Coinbase WS `$0` US defaults, Databento DBN, Dukascopy `.bi5`, Synthetic Sim), strict per-provider `rtrb` SPSC → Dispatcher, 5-tier `ProvenanceTier` & fail-closed `BookState` | `accepted` | [[S05-Live-Ingest-TickVault]], [[R03-Market-Data]], [[C4-Architecture]] |
| [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]] | Zero-float `i64` 12-state `OrderState` OMS, SQLite WAL crash reconciliation, panic Kill-Switch, **Risk-Reduction Bypass Rule**, in-process retail brokers (Alpaca/tastytrade/IBKR Web) vs out-of-process sidecars, 4 prop firms `DO-NOT-BUILD` | `accepted` | [[S06-OMS-Paper-Execution]], [[R04-Execution-Brokers-Props]] |
| [[0010-ui-kit-docking-and-settings-as-code\|ADR-0010]] | React 19 + `ui-sdk` (`@ui-sdk/react` / `@ui-sdk/core` pinned `"0.1.0-beta.17"`, `Apache-2.0`, per `AGENTS.md`) + Tailwind v4 + MIT `dockview` `8.9.1` (`0` enterprise deps) + 3-tier TOML settings (`state_rev: u64`) | `accepted` | [[S03-Dockview-Multiwindow]], [[S04-CSS-Layout-Perf]], [[R10-UX-Teardown-Control-Model]] |
