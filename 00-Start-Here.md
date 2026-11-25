---
title: Allegedly — Research & Plan of Record (Home)
type: index
status: active
phase: Stage D v0.1 Implementation — Apple M2 Mac Slices 1-5 Complete (Pending Red-Team Stage D Audit & Windows CI)
owner: orchestrator
updated: 2026-11-25
---

# Allegedly — Research & Plan of Record

> *"Allegedly a trading terminal."* — **A fast, local-first, Apache-2.0 desktop trading terminal (macOS + Windows for v0.1–v1.0; Linux deferred post-v1.0) combining TradingView-grade charting & scripting with MotiveWave-grade order-flow, volume/TPO profiles, DOM execution, and deterministic replay.**

---

## Current Phase Status

| Phase | Scope | Gate / Status |
|---|---|---|
| **Phase 0** | Charter, Constraints, Assumptions, Glossary, Defaults | **COMPLETE** (`beb3369`, `1c12c8b`) |
| **Phase 1** | 10 Research Tracks (`R01`–`R10`), Principles (`P1`–`P10`), Risks, Legal/Licenses | **COMPLETE** (`b0b3d97`) |
| **Phase 2** | 8 Verified Proof-of-Concept Spikes (`S01`–`S08`) | **COMPLETE** (`f7ad53d`) |
| **Phase 3** | Architecture Specs (9 docs), ADRs (`0001`–`0010`), `Architecture.canvas`, Red-Team Audit | **COMPLETE — Red-Team `PASS` (`18/18` closed)** |
| **Phase 4** | Roadmap, Milestones (`v0.1`–`v1.0`), Epics/Stories, `v0.1` Sprint Plan & DoD | **COMPLETE — Red-Team `PASS` (`12/12` closed)** |
| **Phase 5** | Final Holistic Red-Team Audit & `Plan-of-Record.md` | **COMPLETE — Red-Team `PASS` (`6/6` closed)** |
| **Stage D (`v0.1` Build)** | 9 Rust Crates + Tauri v2 / React 19 / `@ui-sdk/react` / WebGL2 / Luau / SV-09 Replay / M2 `.app` (`12.07 MB`) | **Slices 1–5 Verified on Apple M2 (`darwin-arm64`)** · Windows CI & Red-Team Stage D Audit Active |

---

## 01 — Charter & Governance
- [[Charter]] — Mission, non-goals, target user personas, locked platform scope (macOS + Windows first; Linux deferred post-v1.0)
- [[Constraints]] — Hard budgets (`< 40 MB` installer, `< 2.0 s` cold start, `< 300 MB` idle RAM, `$0` core, `Apache-2.0`, zero telemetry)
- [[Principles]] — `P1`–`P10` architectural & sovereignty principles + 20-rule Sovereignty Verification Checklist (`SV-01`–`SV-20`)
- [[Assumptions]] — Logged defaults & explicit Abel decisions (`ui-sdk`, macOS+Windows scope, brand, workspace paths)
- [[Glossary]] — Canonical domain & architectural vocabulary (updated with Phase 3 terms)
- [[Questions-For-Abel]] — Resolved decision ledger

## 02 — Research (`R01`–`R10`, All Verified)
- [[R01-Charting-Rendering]] | [[R02-Shell-UI-Stack]] | [[R03-Market-Data]] | [[Provider-Capability-Matrix]]
- [[R04-Execution-Brokers-Props]] | [[R05-Orderflow-Profile-Tooling]] | [[R06-Scripting-Indicator-Engine]]
- [[R07-Storage-Replay-Backtest]] | [[R08-Prior-Art]] | [[R09-Legal-Licensing]] | [[R10-UX-Teardown-Control-Model]]

## 03 — Proof-of-Concept Spikes (`S01`–`S08`, All Verified on Apple M2)
- [[S01-Chart-WebGL-Sync]] (`0.000 CSS px` sync drift, `0.30–0.40 ms` WebGL2 draw, `5,000`-bar Rust viewport window)
- [[S02-Tauri-IPC-Throughput]] (`3.0 ms` `100k`-bar binary IPC, `100,450 msgs/s` 16ms-batched channel, `2.68 MB` gzip release binary)
- [[S03-Dockview-Multiwindow]] (MIT `dockview` `8.9.1`, `0.60 ms` p95 pop-out sync, `0` leaks over 20 cycles)
- [[S04-CSS-Layout-Perf]] (Canvas2D DOM + Tape `60.2 fps`, `0.00 ms` Layout/RecalcStyle, `4.9×–5.3×` less CPU)
- [[S05-Live-Ingest-TickVault]] (`17.73M events/s` ingest, `100.00%` Kraken CRC32, `6.1×` Coinbase inversion proof, `14/14` tests)
- [[S06-OMS-Paper-Execution]] (`i64` zero-float OMS, `119.75 µs` WAL append, `6.13–7.04 ms` 50-order Kill-Switch, `54` HTTP fault tests)
- [[S07-Scripting-Sandbox]] (Luau `mlua` adopted over Rhai at `10.05×` batch / `19.41×` live p99; Wasmtime `+3.32%` vs Native; `12/12` escapes blocked)
- [[S08-Storage-100M-Replay]] (`102.55M ticks/s` streaming replay at `34.44 MiB` RSS; `5.22 ms` cold 1h seek; `0.0271 ms` p99 Dyadic VRVP)

## 04 — Architecture & ADRs (Phase 3 — Red-Team `PASS`)
- [[C4-Architecture]] — System Context, Container, Component, Thread/SPSC Topology, and `allegedly-*` Crate Map
- [[Data-Model]] — Fixed-point `PriceE9`/`QtyE9`/`TimestampNs`, 5-tier `ProvenanceTier`, `BookState`, `32 B` `FootprintCell`, `u128` `TpoRow`, 12-state `OrderState`
- [[IPC-Contract]] — Aligned Binary Wire Framing (`40 B` trades, `32 B` footprints, `16 B` status), `state_rev: u64`, Risk-Reduction Bypass Rule
- [[Plugin-ABI]] — Flat SoA `ByteView` ABI, Luau & Wasmtime determinism, `<= 64 MiB` global study memory pool
- [[Error-Observability]] — Local-only ring-buffer diagnostics, Active 5-Tier Provenance Ledger, zero telemetry
- [[Testing-Strategy]] — Complete `SV-01`–`SV-20` CI verification matrix, deterministic replay fixtures, legacy-prefix ban
- [[Release-Signing-Update]] — macOS Developer ID / notarization, Windows Authenticode, opt-in updates (`updates.checkOnStartup = false`)
- [[Docs-Strategy]] — Local-first documentation, clean-room scripting reference, ADR & Glossary workflow
- [[Adopt-Build-Fork]] — Master 18-subsystem Adopt/Build/Fork ledger aligned to locked Phase 3 ADRs
- **ADRs:**
  - [[0001-license-brand-and-platform-scope|ADR-0001]] | [[0002-desktop-shell-and-binary-ipc|ADR-0002]] | [[0003-chart-base-and-viewport-windowing|ADR-0003]] | [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]] | [[0005-study-runtime-and-scripting-language|ADR-0005]]
  - [[0006-tiered-storage-and-replay|ADR-0006]] | [[0007-backtest-engine-adopt-vs-build|ADR-0007]] | [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]] | [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]] | [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]]

## 05 — Roadmap (Phase 4 — Red-Team `PASS`)
- [[Milestones]] — Canonical `v0.1`, `v0.2`, `v0.5`, `v1.0`, `Post-v1.0` releases (macOS + Windows first; Linux deferred)
- [[Epics-and-Stories]] — 10 Epics (`E01`–`E10`), 42 vertical-slice stories (`ST-01`–`ST-42`), 20-row `SV-01`–`SV-20` matrix
- [[Sprint-Plan-v0.1]] — 4 two-week sprints, Mermaid DAG & critical path, `UV-01`–`UV-10` schedule, kickoff tasks `T01`–`T10a`/`T10b`
- [[v0.1-Definition-of-Done]] — Tier A (`v0.1-dev`) & Tier B (`v0.1.0` unsigned Alpha) binary release gates

## 06 — Risk, Licensing & Compliance
- [[Risk-Register]] — Active risks (`RK-01` deferred post-v1.0; `RK-02`–`RK-10` tracked)
- [[Kill-Criteria]] — Pre-committed stop/pivot triggers (`KC-01`–`KC-07`)
- [[License-Registry]] — Complete dependency/linkage/compatibility matrix + `cargo-deny` CI gate (updated with Phase 3 deps & `ui-sdk` pin)
- [[Compliance-Notes]] — TradingView, Pine, MotiveWave EULA, Sierra `.scid`/DTC ban, CME data, prop rules, OS Keychain, Trademark screening

## 07 — Reviews & Plan of Record
- [[Red-Team-Phase3]] — **Verdict: `PASS`** (`18/18` findings verified closed on `2026-11-25`)
- [[Red-Team-Phase4]] — **Verdict: `PASS`** (`12/12` findings verified closed on `2026-11-25`)
- [[Plan-of-Record]] — Canonical executive Plan of Record & Stage D `v0.1` kickoff guide
- [[Red-Team-Phase5]] — Final holistic Red-Team audit (**Verdict: `PASS`**)

## 08 — Dashboards & Visual Maps
- [[Open-Questions]] | [[Unverified-Claims]] | [[Blocked-Items]] | [[ADR-Status]]
- Canvases: [[Architecture.canvas]] | [[Roadmap.canvas]]

## 99 — Meta & Operations
- [[Agent-Roster]] | [[Handoffs]] | [[Worklog]] | [[Prompt-Log]]
