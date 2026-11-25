---
title: Allegedly — Start Here (MOC)
type: moc
status: active
phase: Phase 2 Complete — Gate Ready (Awaiting Abel Approval for Phase 3)
owner: orchestrator
updated: 2026-11-24
code_refs: []
---

# Allegedly — Plan of Record (MOC)

> *"Allegedly a trading terminal."*

> **Mission:** Produce a long-lived, evidence-backed development plan for **Allegedly** *(chosen brand after retiring working title `MotiveView`; see [[R09-Legal-Licensing]] & [[Compliance-Notes]])*: a free, open-source (`Apache-2.0`), local-first desktop trading terminal (**macOS & Windows** for `v0.1`–`v1.0`; **Linux** deferred to a future milestone) combining **TradingView's UI/UX clarity** with **MotiveWave's order-flow & analytical depth**.
>
> **GitHub Repository:** https://github.com/emrisca/allegedly (`Apache-2.0`, public)
>
> **Current Phase:** **Phase 2 Complete (`S01`–`S08` ALL `verified`)** — Ready at **Phase 2 Gate** for Abel's approval to begin **Phase 3 (Architecture & ADRs)** (`ui-sdk` adopted in `AGENTS.md`; macOS & Windows first, Linux deferred to post-v1.0).

## 01 — Charter & Decisions
- [[Charter]] — Mission, scope, phase gates, and Definition of Done
- [[Constraints]] — Non-negotiables, performance budgets, safety rails, evidence protocol
- [[Principles]] — Verified UX & Sovereignty Principles + 20-assertion **Sovereignty Checklist (`SV-01`–`SV-20`)**
- [[Assumptions]] — Logged Phase 0 defaults (`A01`–`A08`)
- [[Questions-For-Abel]] — Batched Round 1 design-tree frontier (`Q1`–`Q8`)
- [[Glossary]] — Canonical domain language (`domain-modeling` format)

## 02 — Research Tracks (Phase 1 — ALL `verified`)
- [[_Sources]] — Master consolidated bibliography (`P0` + `R01`–`R10`)
- [[R01-Charting-Rendering]] — Lightweight Charts `v5.3.0` + synchronized raw WebGL2 order-flow canvas
- [[R02-Shell-UI-Stack]] — Tauri v2 (`2.12.7`) + React 19 + **UI SDK** (`@ui-sdk/react` / `@ui-sdk/core`, `Apache-2.0`, see `AGENTS.md`) + Tailwind v4 + Dockview MIT core (Electron & shadcn/Radix fallbacks)
- [[R03-Market-Data]] & [[Provider-Capability-Matrix]] — Brutal Truths, US-verified Kraken/Coinbase defaults, Databento `.dbn`, tick-side inference
- [[R04-Execution-Brokers-Props]] — Broker APIs, DTC boundaries, 8-firm prop legality audit (4 `DO-NOT-BUILD`), OMS semantics
- [[R05-Orderflow-Profile-Tooling]] — Exact `i64`/`i128` fixed-point math for Footprint, Volume Profile, TPO, CVD, Heatmap, DOM, T&S, VWAP
- [[R06-Scripting-Indicator-Engine]] — Rust `mv-studies` → Wasmtime → Rhai/Luau → clean-room Pine-inspired DSL
- [[R07-Storage-Replay-Backtest]] — Hot SPSC rings → SQLite WAL → Hive Parquet (`arrow-rs`), optional DuckDB & NautilusTrader sidecars
- [[R08-Prior-Art]] — Verified FOSS prior art & [[Adopt-Build-Fork]] ledger (12 Adopt, 0 Fork, 6 justified Build)
- [[R09-Legal-Licensing]] — **`Apache-2.0`** chosen, [[License-Registry]], [[Compliance-Notes]], 5 clean-room rename options
- [[R10-UX-Teardown-Control-Model]] — TradingView vs MotiveWave teardown, 3-tier settings compression, unified Object Tree + Analyses

## 03 — Spikes (Phase 2 — ALL `verified`, Numbers Not Opinions)
- [[S01-Chart-WebGL-Sync]] — **`PASS-WITH-CAVEAT`**: `ISeriesPrimitive` achieved `0.000 CSS px` drift; `0.30–0.40 ms` WebGL2 draw (`~10.6k` quads); discovered Rust-backed `5,000`-bar viewport windowing is required to hold `60.0 fps` during live `series.update()`
- [[S02-Tauri-IPC-Throughput]] — **`PASS-WITH-CAVEAT`**: Native Tauri `tauri::ipc::Response` `100k` bars in `3.0 ms` (`9.7×` faster than JSON); `16 ms`-batched streaming sustained `100,450 msgs/s` (`1–2 ms` RTT); release binary `2.68 MB` gzip
- [[S03-Dockview-Multiwindow]] — **`PASS-WITH-CAVEAT`**: MIT-only `dockview` + `dockview-react` `8.9.1` (`0` enterprise deps); 9 panels serialize/restore in `0.20 / 5.30 ms` p95; `0.60 ms` p95 pop-out sync; `+0.109 MB` over 20 cycles (`0` DOM/listener leaks)
- [[S04-CSS-Layout-Perf]] — **`PASS`**: Canvas2D DOM Ladder + Tape at `60 Hz` / `2,000` deltas/s hit `60.2 fps`, `0` stalls `> 20 ms`, `0.00 ms` Layout/RecalcStyle (`4.9×–5.3×` less CPU than React/DOM)
- [[S05-Live-Ingest-TickVault]] — **`PASS-WITH-CAVEAT`**: Live 60s Kraken + Coinbase soak (`100.00%` Kraken CRC32, `6.1×` empirical Coinbase maker→taker inversion proof); `17.73M events/s` ingest (`KC-05` cleared `886×`); `dbn v0.75.0` `18.43M rec/s`; `14/14` release tests pass
- [[S06-OMS-Paper-Execution]] — **`PASS-WITH-CAVEAT`**: Zero-float `i64` OMS; SQLite WAL append `119.75 µs` p50; 50-order Kill-Switch `6.13–7.04 ms` p50 (`0` stray orders); 500-order WAL crash reconcile in `6.15 ms` (`0` orphans); `54` wire-mock HTTP faults (`0` duplicates); `7/7` release tests pass
- [[S07-Scripting-Sandbox]] — **`PASS-WITH-CAVEAT`**: **Adopt Luau (`mlua`, `+0.47 MiB` gzip), reject Rhai** (`10.05×` faster batch, `19.41×` faster live p99); Wasmtime `+3.32%` vs Native (`+1.74 MiB` gzip); `12/12` hostile sandbox escapes blocked; `0.000e0` numerical drift
- [[S08-Storage-100M-Replay]] — **`PASS-WITH-CAVEAT`**: 100M-tick Hive Parquet Zstd write `22.51M ticks/s` (`4.26 B/tick`), streaming replay `102.55M ticks/s` at `34.44 MiB` peak RSS; 1h random seek `5.22 ms` cold p50 (`99.58%` pruned); Dyadic VRVP `0.0271 ms` p99 (`9.2×` faster than `0.25 ms` target); `+2.91 MiB` gzip binary delta

## 04 — Architecture & ADRs (Phase 3 — Gate: Abel Approval + Red Team)
- [[Adopt-Build-Fork]] — Master 18-subsystem Adopt/Build/Fork ledger (`status: verified`)
- `04-Architecture/ADRs/` — Numbered ADRs (created in Phase 3 after Phase 2 measurements)

## 05 — Roadmap (Phase 4 — Gate: Abel Approval + Red Team)
- `05-Roadmap/Epics/`, `05-Roadmap/Stories/`, `Dependency-Graph`, `Critical-Path`, `Milestones`

## 06 — Risk, Licensing & Compliance
- [[Risk-Register]] — Active risks (`RK-01`–`RK-10`) updated with Phase 1 evidence
- [[Kill-Criteria]] — Pre-committed stop/pivot triggers (`KC-01`–`KC-07`)
- [[License-Registry]] — Complete dependency/linkage/compatibility matrix + `cargo-deny` CI gate
- [[Compliance-Notes]] — TradingView, Pine, MotiveWave EULA, Sierra `.scid`/DTC, CME data, prop rules, OS Keychain, Trademark analysis

## 07 — Reviews & Plan of Record (Phase 5)
- `07-Reviews/Red-Team-*.md` — Adversarial audits
- `07-Reviews/Plan-of-Record.md` — Final executive summary + first 10 executable tasks

## 08 — Dashboards & Visual Maps
- [[Open-Questions]] | [[Unverified-Claims]] | [[Blocked-Items]] | [[ADR-Status]]
- Canvases: [[Architecture.canvas]] | [[Roadmap.canvas]]

## 99 — Meta & Operations
- [[Agent-Roster]] | [[Handoffs]] | [[Worklog]] | [[Prompt-Log]]
