---
title: Dashboard — ADR Status
type: dashboard
owner: architect
updated: 2026-11-24
---

# Architecture Decision Records (ADR) Dashboard

> Per `domain-modeling` (`ADR-FORMAT.md`), ADRs are created lazily in `04-Architecture/ADRs/` only when a decision is hard to reverse, surprising without context, and involves a real trade-off.

```dataview
TABLE status, updated, code_refs
FROM "04-Architecture/ADRs"
SORT file.name ASC
```

## Planned Phase 3 ADRs (Pending Phase 1 & 2 Evidence)
- `0001` — Application License (evidence: [[R09-Legal-Licensing]])
- `0002` — Desktop Shell & IPC Architecture (evidence: [[R02-Shell-UI-Stack]], `S04`)
- `0003` — Chart Base & Order-Flow Renderer (evidence: [[R01-Charting-Rendering]], `S01`–`S03`)
- `0004` — Study Runtime & Scripting Language Strategy (evidence: [[R06-Scripting-Indicator-Engine]], `S07`)
- `0005` — Storage, Tick Vault & Deterministic Replay (evidence: [[R07-Storage-Replay-Backtest]], `S08`)
- `0006` — Backtest / Execution Engine Adopt-vs-Build (evidence: [[R07-Storage-Replay-Backtest]], [[R08-Prior-Art]])
- `0007` — Market-Data Provider Abstraction & Provenance Model (evidence: [[R03-Market-Data]], `S05`)
- `0008` — Broker & Prop-Firm Execution Strategy (evidence: [[R04-Execution-Brokers-Props]], `S06`)
- `0009` — UI Kit, Docking & Settings-as-Code Architecture (evidence: [[R02-Shell-UI-Stack]], [[R10-UX-Teardown-Control-Model]])
