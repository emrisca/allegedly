---
title: MotiveView Risk Register
type: risk
status: active
owner: orchestrator
updated: 2026-11-24
code_refs: []
---

# Risk Register

> Seeded in Phase 0; continuously updated across Phases 1–5 by research specialists, Architect, and Red Team.

| ID | Category | Risk | Likelihood | Impact | Owner | Mitigation / Verification Plan | Status |
|---|---|---|---|---|---|---|---|
| **RK-01** | Rendering / Linux | WebKitGTK on Linux fails 60fps WebGL2/Canvas target for 100k candles + footprint/heatmap | High | Critical | `research-charts` / `research-shell-ui` | Measure early in `R01`/`R02` and prove on real Linux in `S01`/`S02`/`S04`; define native fallback (egui/wgpu or Electron) | Open |
| **RK-02** | Market Data | Free-tier futures/equities feeds lack L2 depth or true aggressor side, undermining core order-flow value prop | High | High | `research-data` | Document "Brutal Truths" in `R03`; design multi-rung fallback ladder (free crypto L2/ticks, BYO keys, broker-bundled, local tick vault) | Open |
| **RK-03** | Legal / Prop Firms | Prop firms prohibit third-party APIs or custom clients, creating ban risk for users | High | High | `research-execution` / `legal-licensing` | Audit primary rulebooks per firm in `R04`; explicitly mark disallowed firms `DO-NOT-BUILD` | Open |
| **RK-04** | Legal / Trademark | Name **"MotiveView"** is a portmanteau of two active marks (*MotiveWave* + *TradingView*) | High | High | `legal-licensing` | Assess trademark risk in `R09` and propose 5 clean-room alternative names before public launch | Open |
| **RK-05** | Legal / Licensing | GPL/AGPL/BSL/proprietary dependency contamination (e.g., TradingView Charting Library, TimescaleDB, TA-Lib, backtest engines) | Medium | Critical | `legal-licensing` | Choose app license first in `R09`; maintain `[[License-Registry]]` with linkage analysis | Open |
| **RK-06** | Scope Creep | Building a custom chart engine + custom Pine compiler + full order-flow suite + multi-broker execution simultaneously stalls v0.1 | High | Critical | `orchestrator` / `architect` | Enforce Adopt/Build/Fork bias (`R08`), vertical-slice MVP, and single-session story sizing | Open |
| **RK-07** | Financial Math | Floating-point rounding bugs or session-calendar/DST drift corrupt prices, fills, or profiles | Medium | Critical | `architect` / `research-orderflow` | Non-negotiable fixed-point integer/decimal types + golden-file tests + explicit calendar spec | Open |
| **RK-08** | Vault Hygiene | `node_modules/` or Rust `target/` inside Obsidian vault degrades Obsidian startup/indexing >3s | Medium | Medium | `orchestrator` | Configure Obsidian `Excluded files` before any install/build; move `CARGO_TARGET_DIR` out if startup >3s | Open |
