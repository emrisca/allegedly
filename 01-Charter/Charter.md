---
title: Allegedly Charter
type: charter
status: active
owner: orchestrator
updated: 2026-11-25
code_refs: []
---

# Allegedly — Project Charter

## 1. Mission
Produce a **decision-grade, evidence-backed development plan** for **Allegedly** (working title; trademark risk evaluated in [[R09-Legal-Licensing]]): a free, open-source, local-first desktop trading terminal (**macOS & Windows** first; Linux planned for a future milestone) that merges:
- **TradingView's UI/UX clarity:** crisp chart layouts, low-friction indicator UX, intuitive drawing tools, and ergonomic scripting.
- **MotiveWave's analytical & order-flow depth:** footprint/cluster charts, Volume Profile, TPO/Market Profile, DOM ladder, liquidity heatmaps, and deep configurable studies.
- **Total user sovereignty & zero lock-in:** local files, open formats, zero mandatory subscriptions, settings-as-code, no dark patterns.

## 2. Phase Scope (Plan, Not Product)
**This engagement produces a PLAN, not the finished application.**
- Disposable, runnable benchmark spikes (`spikes/S01-…/`) are required in Phase 2 to replace opinions with measured numbers.
- No production application scaffolding or live trading occurs during Phases 0–5.

## 3. Phase Gates
| Phase | Deliverable | Gate Criteria |
|---|---|---|
| **Phase 0** | Vault skeleton, hygiene check, `[[Questions-For-Abel]]`, `[[Assumptions]]`, `[[Glossary]]` | Defaults logged; Abel approves or overrides defaults |
| **Phase 1** | Research tracks `R01`–`R10`, `[[Provider-Capability-Matrix]]`, `[[Adopt-Build-Fork]]`, `[[License-Registry]]` | All 10 tracks `verified` with primary sources + dates; zero invented claims |
| **Phase 2** | Spikes `S01`–`S08` with runnable code + hardware/OS measurements | Pass/fail verdicts against pre-declared thresholds; pivots written for any failure |
| **Phase 3** | C4 diagrams, `Data-Model`, `IPC-Contract`, `Plugin-ABI`, numbered ADRs | **Wait for Abel approval before starting**, then Red Team pass |
| **Phase 4** | Vertical-slice MVP, milestones `v0.1`→`v1.0`, single-session stories, dependency graph | **Wait for Abel approval before starting**, then Red Team pass |
| **Phase 5** | Adversarial Red-Team review + `Plan-of-Record.md` + updated MOC/Dashboards/Canvases | All Red-Team findings resolved or rebutted; zero broken links |

## 4. Definition of Done (Phases 0–5)
- [ ] Every track `R01`–`R10` `verified`, with primary sources + retrieved dates
- [ ] Zero fabricated repos, licenses, endpoints, or prices; gaps marked `UNVERIFIED` with verification steps
- [ ] All 8 spikes (`S01`–`S08`) executed with real measured numbers and pass/fail verdicts
- [ ] ADRs written for every irreversible architectural decision, linked to research/spike evidence
- [ ] `[[License-Registry]]` complete; app license selected; working name trademark risk assessed
- [ ] `[[Provider-Capability-Matrix]]` + **Brutal Truths** section written
- [ ] Prop-firm legality resolved per firm with primary rule citations
- [ ] `[[Adopt-Build-Fork]]` ledger complete; every "build" justified
- [ ] Roadmap stories all single-session sized with acceptance criteria and verification tests
- [ ] Red-team review completed and rebutted or incorporated
- [ ] Vault navigable from [[00-Start-Here]]; zero broken wikilinks; no build bloat polluting Obsidian
