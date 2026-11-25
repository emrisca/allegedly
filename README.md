# Allegedly

> *"Allegedly a trading terminal."*

**Allegedly** is a free (`$0` core), open-source (`Apache-2.0`), local-first, cross-platform trading terminal combining **TradingView's UI/UX clarity** with **MotiveWave's order-flow, profile, and DOM analytical depth** — with total user sovereignty (zero forced cloud accounts, zero telemetry, zero indicator limits, BYO data & broker keys).

> **Current Status:** **Phase 2 (Benchmark Spikes `S01`–`S08`)** — This repository currently holds the evidence-backed **Plan of Record** (structured as an Obsidian vault) and runnable benchmark spikes. Product implementation begins after Phase 5 Plan of Record sign-off.

## Navigation

Start at [`00-Start-Here.md`](./00-Start-Here.md) (best browsed in [Obsidian](https://obsidian.md), or directly on GitHub):

| Folder | Contents | Status |
| --- | --- | --- |
| [`01-Charter/`](./01-Charter/) | Mission, scope, non-negotiable constraints, 20-rule Sovereignty Checklist (`SV-01`–`SV-20`), Glossary, Assumptions | Verified |
| [`02-Research/`](./02-Research/) | 10 primary-source research tracks (`R01`–`R10`), Provider Capability Matrix, 279 consolidated primary sources ([`_Sources.md`](./02-Research/_Sources.md)) | Verified (Phase 1 Gate Passed) |
| [`03-Spikes/`](./03-Spikes/) & [`spikes/`](./spikes/) | 8 runnable performance, IPC, market-data, OMS, scripting, and storage benchmark spikes (`S01`–`S08`) | **In Progress** |
| [`04-Architecture/`](./04-Architecture/) | Adopt/Build/Fork ledger (`18` subsystems), C4 diagrams, IPC/Plugin contracts, ADRs | Pending Phase 2 Gate |
| [`05-Roadmap/`](./05-Roadmap/) | Milestones, Epics, Stories, Dependency Graph, Critical Path | Pending Phase 3 Gate |
| [`06-Risk/`](./06-Risk/) | Risk Register (`RK-01`–`RK-10`), Kill Criteria (`KC-01`–`KC-07`), License Registry, Legal/Compliance Notes | Active |
| [`07-Reviews/`](./07-Reviews/) | Adversarial Red-Team audits & final Plan of Record | Pending |
| [`08-Dashboards/`](./08-Dashboards/) & [`90-Canvas/`](./90-Canvas/) | Progress dashboards and Obsidian Canvas visual maps | Active |

## Planned Core Stack (Under Spike Verification)

- **Shell & UI:** Tauri v2 + Rust Core + React 19 + shadcn/ui + Tailwind 4 + Dockview (MIT core) *(Electron fallback behind `TransportAdapter`)*
- **Charting & Order-Flow Rendering:** TradingView Lightweight Charts v5 (`Apache-2.0`) + synchronized raw WebGL2 order-flow canvas
- **Order-Flow Math:** 100% fixed-point `i64`/`i128` (zero floating-point price/volume drift), Dyadic Segment Tree VRVP, 64-bit TPO masks
- **Market Data (`$0` US-verified defaults):** Kraken Spot WS v2 + Coinbase Advanced Trade WS + local Tick Vault + Databento `.dbn` (`Apache-2.0`)
- **Storage & Replay:** Hot SPSC rings (`rtrb`) -> SQLite WAL -> Hive Parquet (`arrow-rs`), with optional out-of-process DuckDB & NautilusTrader sidecars
- **Scripting:** Rust `mv-studies` -> Wasmtime -> Rhai/Luau (benchmarked in `S07`) -> clean-room Pine-inspired DSL

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).
