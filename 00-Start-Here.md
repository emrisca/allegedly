---
title: MotiveView — Start Here (MOC)
type: moc
status: active
phase: Phase 0 -> Phase 1
owner: orchestrator
updated: 2026-11-24
code_refs: []
---

# MotiveView — Plan of Record (MOC)

> **Mission:** Produce a long-lived, evidence-backed development plan for **MotiveView** — a free, open-source, local-first, cross-platform trading terminal combining **TradingView's UI/UX clarity** with **MotiveWave's order-flow & analytical depth**, with total user sovereignty and zero lock-in.
>
> **Current Phase:** Phase 0 complete (defaults logged); **Phase 1 parallel research (R01–R10) in progress**.
> **Discipline:** Follow `grill-with-docs` (round-based decision grilling + active `domain-modeling` for `[[Glossary]]` and ADRs) and strict [[Constraints#Evidence Protocol|Evidence Protocol]].

## 01 — Charter & Decisions
- [[Charter]] — Mission, scope, phase gates, and Definition of Done
- [[Constraints]] — Non-negotiables, performance budgets, safety rails, evidence protocol
- [[Principles]] — UX & sovereignty principles + testable checklist (owned by R10)
- [[Assumptions]] — Logged Phase 0 defaults so research never stalls
- [[Questions-For-Abel]] — Batched Phase 0 design-tree frontier (8 questions)
- [[Glossary]] — Canonical domain language (`domain-modeling` format, implementation-free)

## 02 — Research Tracks (Phase 1)
- [[_Sources]] — Consolidated master bibliography
- [[R01-Charting-Rendering]] — Charting libs, primitives, WebGL2/WebGPU, text rendering
- [[R02-Shell-UI-Stack]] — Tauri v2 vs alternatives, UI kit, docking, Linux parity, IPC
- [[R03-Market-Data]] & [[Provider-Capability-Matrix]] — Free-tier truth, L1/L2/L3, Brutal Truths
- [[R04-Execution-Brokers-Props]] — Brokers, DTC, crypto adapters, prop-firm rulebook audit
- [[R05-Orderflow-Profile-Tooling]] — Footprint, Volume Profile, TPO, DOM, Heatmap, VWAP math
- [[R06-Scripting-Indicator-Engine]] — Study runtime, Pine-subset feasibility, sandboxing, IP
- [[R07-Storage-Replay-Backtest]] — Hot/warm/cold storage, Parquet+DuckDB, replay, backtest engines
- [[R08-Prior-Art]] — Existing FOSS terminals/engines & [[Adopt-Build-Fork]] ledger
- [[R09-Legal-Licensing]] — App license, [[License-Registry]], [[Compliance-Notes]], trademark alternatives
- [[R10-UX-Teardown-Control-Model]] — TradingView vs MotiveWave IA, command palette, settings hierarchy

## 03 — Spikes (Phase 2 — Numbers, Not Opinions)
- `S01`–`S08` notes live in `03-Spikes/`; runnable throwaway code lives in `spikes/S01-…/`.

## 04 — Architecture & ADRs (Phase 3 — Gate: Abel Approval + Red Team)
- [[Adopt-Build-Fork]] — Component adopt/build/fork ledger (seeded in Phase 1 by R08)
- `04-Architecture/ADRs/` — Numbered Architecture Decision Records (created lazily as irreversible decisions crystallize)

## 05 — Roadmap (Phase 4 — Gate: Abel Approval + Red Team)
- `05-Roadmap/Epics/`, `05-Roadmap/Stories/`, `Dependency-Graph`, `Critical-Path`, `Milestones`

## 06 — Risk, Licensing & Compliance
- [[Risk-Register]] — Active technical, legal, data, and scope risks
- [[Kill-Criteria]] — Explicit stop/pivot triggers
- [[License-Registry]] — Full dependency license & linkage audit (owned by R09)
- [[Compliance-Notes]] — Clean-room, ToS, prop-firm, and trademark risk notes (owned by R09)

## 07 — Reviews & Plan of Record (Phase 5)
- `07-Reviews/Red-Team-*.md` — Adversarial audits
- `07-Reviews/Plan-of-Record.md` — Final 2-page executive summary + first 10 executable tasks

## 08 — Dashboards & Visual Maps
- [[Open-Questions]] | [[Unverified-Claims]] | [[Blocked-Items]] | [[ADR-Status]]
- Canvases: [[Architecture.canvas]] | [[Roadmap.canvas]]

## 99 — Meta & Operations
- [[Agent-Roster]] | [[Handoffs]] | [[Worklog]] | [[Prompt-Log]]
