---
title: Non-Negotiables, Safety Rails & Evidence Protocol
type: charter
status: locked
owner: orchestrator
updated: 2026-11-24
code_refs: []
---

# Non-Negotiables & Operating Constraints

## 1. Eight Design Non-Negotiables
1. **FOSS or die.** Zero proprietary runtime dependencies in core. Zero copied code, assets, icons, docs, or trademarks from TradingView or MotiveWave. Zero decompiling or reverse-engineering MotiveWave (EULA). Clean-room reimplementation from public docs, screenshots, and domain math only.
2. **$0 core.** A user with zero paid subscriptions gets a genuinely useful terminal. Paid data feeds and brokers are optional plug-ins, never load-bearing.
3. **Local-first & sovereign.** All data, settings, layouts, scripts, and history live on disk in open formats. Full import/export. Offline capable. Zero telemetry without explicit opt-in. No account required.
4. **Truly cross-platform.** macOS (Apple Silicon + Intel), Windows 10/11, and Linux (X11 + Wayland, including at least one non-Ubuntu distro). No second-class platform.
5. **Lightweight, with measured budgets** (validated or revised with evidence in Phase 2):
   - Installer `< 40 MB`
   - Cold start `< 2 s`
   - Idle RAM `< 300 MB`
   - Pan/zoom `60 fps` with `100k+` candles
   - Smooth DOM at `30+` updates/s
   - Zero GC stalls in the hot path
6. **User in control (operationalized).** Every meaningful default is exposed, documented, overridable per-chart AND globally, scriptable, diffable, and version-controlled. Settings-as-code (JSON/TOML) with schema-generated UI. Universal undo/redo. Keyboard-first with remappable bindings. Zero silent data substitution.
7. **Financial correctness.** Prices and quantities use fixed-point integers (tick counts / scaled `i64`) or exact decimal — **never IEEE-754 binary floats** for money, tick math, or order quantities. Explicit session calendars, RTH/ETH, holidays, tick-size rules, and instrument metadata.
8. **Honest data provenance.** Every rendered value can report: provider, real-time vs. delayed, venue coverage, and actual vs. inferred aggressor side.

## 2. Evidence Protocol (Strict Anti-Hallucination)
- **Never invent** a repository, star count, license, API endpoint, price tier, or capability.
- Every factual claim requires:
  - `Source URL`
  - `Retrieved Date` (YYYY-MM-DD)
  - `How Verified` (`read primary docs` / `cloned & ran` / `live API call` / `repo LICENSE file` / `rulebook text`)
  - `Confidence` (`high` / `medium` / `low`)
- Any unverified claim MUST be labeled **`UNVERIFIED`** with concrete human verification steps.
- Every research note separates **Facts**, **Inferences**, **Recommendations**, and **Open Questions**.
- Primary sources only (repo `LICENSE`, official docs, exchange/broker rulebooks, real API responses).

## 3. Safety Rails
- No spending money, signing contracts, or accepting commercial data agreements.
- No live orders and no real brokerage credentials. Sandbox/paper/demo environments only.
- Secrets never enter the vault, spikes, or git history.
- Ask Abel before any destructive command or account creation.
