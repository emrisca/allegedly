---
title: Dashboard — ADR Status
type: dashboard
owner: architect
updated: 2026-11-24
---

# Architecture Decision Records (ADR) Dashboard

> Per `domain-modeling` (`ADR-FORMAT.md`), ADRs are created in `04-Architecture/ADRs/` in **Phase 3** now that Phase 1 evidence and Phase 2 measured numbers (`S01`–`S08`) are complete.

```dataview
TABLE status, updated, code_refs
FROM "04-Architecture/ADRs"
SORT file.name ASC
```

## Phase 3 ADRs Ready to Draft (Backed by Phase 1 + Phase 2 Evidence)
| Proposed ADR | Decision Topic | Evidence-Locked Direction | Backing Spikes |
|---|---|---|---|
| `0001` | Application License, Brand & Platform Scope | `Apache-2.0`, **Allegedly** (`emrisca/allegedly`), **macOS & Windows first** (`v0.1`–`v1.0`), Linux post-v1.0 ([[R09-Legal-Licensing]], [[Assumptions]]) | Locked by Abel |
| `0002` | Desktop Shell & Binary IPC Contract | **Tauri v2 (`2.12.7`)** + `tauri::ipc::Response` (bulk `3.0 ms` / `100k` bars) + `16 ms`-batched `Channel<InvokeResponseBody>` (`100k+ msgs/s`) behind `TransportAdapter` (loopback WS fallback) | [[S02-Tauri-IPC-Throughput]] |
| `0003` | Chart Base, Windowing & Order-Flow WebGL2 Layer | **Lightweight Charts `v5.3.0`** + **`ISeriesPrimitive` paneView sync (`0.000 px` drift)** + **Rust-backed `5,000`-bar viewport windowing** (`60.0 fps` live updates) + raw WebGL2 overlay (`0.3–0.4 ms`) | [[S01-Chart-WebGL-Sync]] |
| `0004` | Study Runtime & Scripting Language | **Tiered:** Native Rust `mv-studies` → **Wasmtime `v51.0.0`** minimal (`+3.32%` vs Native, `+1.74 MiB` gzip) → **Luau (`mlua v0.12.3`, `+0.47 MiB` gzip; decisively beats Rhai by `10–21×`)** → clean-room Pine-inspired DSL | [[S07-Scripting-Sandbox]] |
| `0005` | Tiered Storage, Tick-Vault & Deterministic Replay | Rust `rtrb` SPSC (`67.65M ticks/s`) → `SQLite` WAL metadata catalog → **Hive Parquet Zstd (`arrow-rs`, `4.26 B/tick`, `102.55M ticks/s` replay at `34.4 MiB` RSS, `5.22 ms` cold 1h seek)** + exact `i64`/`i128` Footprint & Dyadic VRVP (`0.0271 ms` p99); DuckDB & DataFusion kept out of core | [[S08-Storage-100M-Replay]] |
| `0006` | Backtest & Execution Sidecar Boundary | Lean Rust replay/backtest in-core + `NautilusTrader` (`LGPL-3.0-only`) strictly out-of-process sidecar over Parquet/IPC ([[Adopt-Build-Fork]]) | [[S08-Storage-100M-Replay]], [[R09-Legal-Licensing]] |
| `0007` | Market-Data Providers, Normalization & Provenance | US-safe `$0` **Kraken WS v2** (`100%` CRC32) + **Coinbase Adv WS** (mandatory maker→taker inversion, `6.1×` proven) + `.atvault` + **Databento `dbn v0.75.0`** (`18.43M rec/s`) + 5-tier provenance badges | [[S05-Live-Ingest-TickVault]] |
| `0008` | Deterministic OMS, Risk Gate & Broker/Prop Policy | Zero-float `i64` OMS + SQLite WAL (`119.8 µs` p50) + Panic Kill-Switch (`6–7 ms` / 50 orders) + `PaperOnly` / `LIVE_ARMED=false` boot rail + Alpaca/tastytrade/clean-room IBKR adapters; 4 prop firms + Rithmic/CQG `DO-NOT-BUILD` | [[S06-OMS-Paper-Execution]] |
| `0009` | UI Kit (`ui-sdk`), Docking & Hot-Path Rendering | **React 19 + `ui-sdk` (`@ui-sdk/react` / `@ui-sdk/core`, `Apache-2.0`, see `AGENTS.md`) + Tailwind v4 + `Dockview` MIT core (`dockview` + `dockview-react` `8.9.1`, `0` enterprise deps)** + **Canvas2D DOM Ladder & Time & Sales (`0.00 ms` Layout/Style, `60.2 fps`)** + 3-tier TOML/JSON settings | [[S03-Dockview-Multiwindow]], [[S04-CSS-Layout-Perf]] |
