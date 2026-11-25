---
title: Dashboard — Unverified Claims
type: dashboard
owner: orchestrator
updated: 2026-11-24
---

# Unverified Claims Dashboard

> Consolidated at **Phase 1 Gate (`2026-11-24`)**. Every remaining `UNVERIFIED` item has an explicit owner and concrete verification path (Phase 2 spike measurement, human browser/login check, or attorney review).

```dataview
TABLE status, owner, updated
FROM "02-Research" OR "03-Spikes" OR "06-Risk"
WHERE contains(string(status), "unverified") OR status = "in-progress"
SORT file.name ASC
```

## Phase 1 Consolidated `UNVERIFIED` Register

| Track | Unverified Item | Resolution Path | Target Phase |
|---|---|---|---|
| [[R01-Charting-Rendering]] | Exact live frame times & Linux WebKitGTK Wayland `Error 71` behavior for `200k`-cell heatmap + `5k`-cell footprint; LWC `v5.3` `subscribeVisibleLogicalRangeChange` paint-order timing | Measure empirically in Spikes `S01`–`S03` | Phase 2 |
| [[R02-Shell-UI-Stack]] | Live `tauri::ipc::Channel<Response>` vs custom URI throughput & Dockview popout window IPC isolation; live USD pricing on JS-rendered Azure Artifact Signing page | Measure IPC/Dockview in Spike `S04`; open Azure pricing page in desktop browser only if paid Windows signing is ever needed | Phase 2 / Optional |
| [[R03-Market-Data]] | Direct CME 2026/2027 Fee Schedule PDF binary (Akamai 403; figures cross-verified from indexed PDFs/brokers); Massive Futures native aggressor field; Finnhub free WS symbol cap; IBKR `$20/mo` waiver threshold; non-US crypto WS subscription caps | Human desktop browser verification (exact URLs logged in [[Provider-Capability-Matrix]]) prior to building optional paid/non-US adapters | Post-v0.1 / Optional |
| [[R04-Execution-Brokers-Props]] | Behind-login Lucid Trading Plan Agreement & MFFU Live Funded API addendum; unpublished Rithmic ISV & CQG Enterprise conformance fees | Human account-holder check or partner inquiry only if those optional integrations are pursued (does not affect 4 `DO-NOT-BUILD` verdicts) | Post-v0.2 / Optional |
| [[R05-Orderflow-Profile-Tooling]] | MotiveWave internal tie-breaker when dual-row Value Area candidate sums are strictly equal | Expose deterministic `va_algorithm: DualRowSteidlmayer \| SingleRow` with center-proximity tie-break | Resolved in Design |
| [[R06-Scripting-Indicator-Engine]] & [[R07-Storage-Replay-Backtest]] | Exact stripped binary deltas (`wasmtime`, `rhai`, `mlua`/Luau, `parquet`, `datafusion`, `duckdb`); Rhai vs Luau 100k-bar throughput & GC pause p99; real Parquet+Zstd MB/day compression ratios; MotiveWave raw tick CSV export column order | Measure binary sizes, throughput, and compression in Spikes `S07`–`S08`; inspect MotiveWave CSV export before building optional importer preset | Phase 2 / Optional |
| [[R08-Prior-Art]] & [[R09-Legal-Licensing]] | Formal USPTO TSDR/EUIPO/WIPO phonetic & conceptual trademark clearance for candidate names; attorney sign-off on Pine-inspired clean-room spec, `nautilus_trader` LGPL sidecar boundary, Sierra `.scid` risk, and CFTC Rule 4.41 disclaimers; `hftbacktest` & `openbq-org` 2026 maintenance velocity | Qualified IP/securities counsel before public launch; re-check GitHub activity before direct dependency integration | Pre-Public Release |
