---
title: Allegedly — Start Here (MOC)
type: moc
status: active
phase: Phase 2 In Progress (Spikes S01–S08)
owner: orchestrator
updated: 2026-11-24
code_refs: []
---

# Allegedly — Plan of Record (MOC)

> *"Allegedly a trading terminal."*

> **Mission:** Produce a long-lived, evidence-backed development plan for **Allegedly** *(chosen brand after retiring working title `MotiveView`; see [[R09-Legal-Licensing]] & [[Compliance-Notes]])*: a free, open-source (`Apache-2.0`), local-first, cross-platform trading terminal combining **TradingView's UI/UX clarity** with **MotiveWave's order-flow & analytical depth**.
>
> **GitHub Repository:** https://github.com/emrisca/allegedly (`Apache-2.0`, public)
>
> **Current Phase:** **Phase 2 In Progress (`S01`–`S08`)** — Vault renamed to **Allegedly**, Obsidian build exclusions written while closed, `CARGO_TARGET_DIR` isolated to `~/.cache/allegedly-target`, and Spikes `S01`–`S08` running.

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
- [[R02-Shell-UI-Stack]] — Tauri v2 (`2.12.7`) + React 19 + shadcn/ui + Dockview MIT core (Electron fallback)
- [[R03-Market-Data]] & [[Provider-Capability-Matrix]] — Brutal Truths, US-verified Kraken/Coinbase defaults, Databento `.dbn`, tick-side inference
- [[R04-Execution-Brokers-Props]] — Broker APIs, DTC boundaries, 8-firm prop legality audit (4 `DO-NOT-BUILD`), OMS semantics
- [[R05-Orderflow-Profile-Tooling]] — Exact `i64`/`i128` fixed-point math for Footprint, Volume Profile, TPO, CVD, Heatmap, DOM, T&S, VWAP
- [[R06-Scripting-Indicator-Engine]] — Rust `mv-studies` → Wasmtime → Rhai/Luau → clean-room Pine-inspired DSL
- [[R07-Storage-Replay-Backtest]] — Hot SPSC rings → SQLite WAL → Hive Parquet (`arrow-rs`), optional DuckDB & NautilusTrader sidecars
- [[R08-Prior-Art]] — Verified FOSS prior art & [[Adopt-Build-Fork]] ledger (12 Adopt, 0 Fork, 6 justified Build)
- [[R09-Legal-Licensing]] — **`Apache-2.0`** chosen, [[License-Registry]], [[Compliance-Notes]], 5 clean-room rename options
- [[R10-UX-Teardown-Control-Model]] — TradingView vs MotiveWave teardown, 3-tier settings compression, unified Object Tree + Analyses

## 03 — Spikes (Phase 2 — Numbers, Not Opinions)
- `S01`–`S08` thresholds pre-declared across `R01`–`R07`; runnable code queued pending Obsidian exclusion / spike-path confirmation.

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
