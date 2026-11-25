---
title: Dashboard — ADR Status
type: dashboard
owner: architect
updated: 2026-11-24
---

# Architecture Decision Records (ADR) Dashboard

> Per `domain-modeling` (`ADR-FORMAT.md`), ADRs are created lazily in `04-Architecture/ADRs/` in Phase 3 once Phase 1 evidence and Phase 2 measured numbers lock each irreversible trade-off.

```dataview
TABLE status, updated, code_refs
FROM "04-Architecture/ADRs"
SORT file.name ASC
```

## Planned Phase 3 ADRs (Informed by Phase 1 Evidence)
| Proposed ADR | Decision Topic | Phase 1 Leading Direction | Required Phase 2 Evidence |
|---|---|---|---|
| `0001` | Application License & Project Name | `Apache-2.0` + clean-room rename off `"MotiveView"` ([[R09-Legal-Licensing]]) | Abel's Round 2 name pick |
| `0002` | Desktop Shell & Binary IPC | `Tauri v2` + `tauri::ipc::Channel<Response>` behind `TransportAdapter` (Fallback: `Electron`) ([[R02-Shell-UI-Stack]]) | Spike `S04` (macOS + Linux X11/Wayland) |
| `0003` | Chart Base & Order-Flow GPU Layer | `Lightweight Charts v5.3.0` + synchronized raw `WebGL2` overlay (Fallbacks: `KLineChart`, unified `WebGL2`) ([[R01-Charting-Rendering]]) | Spikes `S01`, `S02`, `S03` |
| `0004` | Study Runtime & Scripting Language | Rust `mv-studies` → `Wasmtime` → `Rhai` vs `Luau` (`mlua`) → clean-room Pine-inspired DSL ([[R06-Scripting-Indicator-Engine]]) | Spike `S07` |
| `0005` | Tiered Storage & Deterministic Replay | Rust SPSC rings → `SQLite` WAL → Hive `Parquet` (`arrow-rs`), optional `DuckDB` sidecar ([[R07-Storage-Replay-Backtest]]) | Spike `S08` |
| `0006` | Backtest & Execution Engine Boundary | Lean Rust `mv-replay` in-core + `NautilusTrader` (`LGPL-3.0-only`) strictly out-of-process sidecar ([[R07-Storage-Replay-Backtest]], [[Adopt-Build-Fork]]) | Spike `S08` + R09 boundary check |
| `0007` | Market-Data Providers & Provenance | US-safe `$0` Kraken WS v2 + Coinbase Adv WS + local Tick Vault + Databento `.dbn` + 5-tier provenance ([[R03-Market-Data]]) | Spike `S05` |
| `0008` | Broker & Prop-Firm Execution Policy | Alpaca/tastytrade/clean-room IBKR + local paper sim; 4 prop firms `DO-NOT-BUILD` ([[R04-Execution-Brokers-Props]]) | Spike `S06` |
| `0009` | UI Kit, Docking & Settings-as-Code | React 19 + shadcn/ui + Tailwind 4 + `Dockview` MIT core + TOML/JSON 3-tier settings + 20-rule Sovereignty Checklist ([[R02-Shell-UI-Stack]], [[R10-UX-Teardown-Control-Model]], [[Principles]]) | Spike `S04` |
