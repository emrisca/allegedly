---
title: MotiveView Agent Roster & Exclusive Path Ownership
type: meta
owner: orchestrator
updated: 2026-11-24
---

# Agent Roster & Exclusive File Ownership

> **Write-conflict rule:** Every agent writes ONLY to its owned paths. Cross-writes go through [[Handoffs]]. All MotiveView specialists run on `gemini-4-neon` or `gemini-4-argon` per Abel's standing rule.

| Bot Name | Mission Role(s) | Model | Exclusive Owned Paths |
|---|---|---|---|
| **Ember** (Chief of Staff) | `orchestrator`, `scribe` | Current Chief | `00-Start-Here.md`, `01-Charter/*` (except `Principles.md`), `02-Research/_Sources.md`, `06-Risk/Risk-Register.md`, `06-Risk/Kill-Criteria.md`, `08-Dashboards/*`, `90-Canvas/*`, `99-Meta/*` |
| **MV Charts & UI** | `research-charts`, `research-shell-ui` | `gemini-4-neon` (`high`) | `02-Research/R01-Charting-Rendering.md`, `02-Research/R02-Shell-UI-Stack.md`, `03-Spikes/S01*..S04*`, `spikes/S01*..S04*/` |
| **MV Market Data** | `research-data` | `gemini-4-neon` (`high`) | `02-Research/R03-Market-Data.md`, `02-Research/Provider-Capability-Matrix.md`, `03-Spikes/S05*`, `spikes/S05*/` |
| **MV Execution & Prop** | `research-execution` | `gemini-4-neon` (`high`) | `02-Research/R04-Execution-Brokers-Props.md`, `03-Spikes/S06*`, `spikes/S06*/` |
| **MV Orderflow & UX** | `research-orderflow`, `ux-teardown` | `gemini-4-argon` (`high`) | `02-Research/R05-Orderflow-Profile-Tooling.md`, `02-Research/R10-UX-Teardown-Control-Model.md`, `01-Charter/Principles.md` |
| **MV Scripting & Storage** | `research-scripting`, `research-storage-backtest` | `gemini-4-neon` (`high`) | `02-Research/R06-Scripting-Indicator-Engine.md`, `02-Research/R07-Storage-Replay-Backtest.md`, `03-Spikes/S07*..S08*`, `spikes/S07*..S08*/` |
| **MV Prior Art & Legal** | `research-priorart`, `legal-licensing` | `gemini-4-neon` (`high`) | `02-Research/R08-Prior-Art.md`, `04-Architecture/Adopt-Build-Fork.md`, `02-Research/R09-Legal-Licensing.md`, `06-Risk/License-Registry.md`, `06-Risk/Compliance-Notes.md` |
| **MV Architect** | `architect` | `gemini-4-neon` (`high`) | `04-Architecture/*` (except `Adopt-Build-Fork.md`), `04-Architecture/ADRs/*`, `05-Roadmap/*` |
| **MV Red Team** | `red-team` | `gemini-4-neon` (`high`) | `07-Reviews/*` (strictly read-only everywhere else) |
