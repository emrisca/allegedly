---
title: Dashboard — Unverified Claims
type: dashboard
owner: orchestrator
updated: 2026-11-24
---

# Unverified Claims Dashboard

> Consolidated at **Phase 2 Gate (`2026-11-24`)**. Phase 2 spikes (`S01`–`S08`) resolved all core macOS `arm64` performance, binary-size, sync-drift, ingest, OMS, scripting, and 100M-tick replay unknowns. Every remaining `UNVERIFIED` item below has a concrete verification step for Phase 3/4 CI or pre-release review.

```dataview
TABLE status, owner, updated
FROM "02-Research" OR "03-Spikes" OR "06-Risk"
WHERE contains(string(status), "unverified") OR status = "in-progress"
SORT file.name ASC
```

## Remaining `UNVERIFIED` Register (Post-Phase 2)

| Track / Spike | Remaining Unverified Item | Resolution Path | Target Phase |
|---|---|---|---|
| [[S01-Chart-WebGL-Sync]] – [[S04-CSS-Layout-Perf]], [[S07-Scripting-Sandbox]], [[S08-Storage-100M-Replay]] | **Windows 10/11 (`WebView2` + `x86_64-pc-windows-msvc`)** live WebGL2 frame times, Tauri IPC throughput, pop-out window capabilities, `luau0-src` C++17 cross-build, and packaged `.msi` size *(Linux deferred to post-v1.0)* | Run existing spike benchmarks + packaged `.msi` build on GitHub Actions `windows-latest` | Phase 3 / v0.1 CI |
| [[S02-Tauri-IPC-Throughput]] | Native macOS `WKWebView` **full XPC process-tree RAM** (including `launchd`-parented WebKit helpers), lazy-init packaged `.app` cold start (`< 1.5 s`), and visible-window `WKWebView` `rAF` drop count | Measure on packaged `.app` bundle with lazy fixture loading (fixing S02's eager `200k`-bar `main()` startup) | Phase 3 / v0.1 |
| [[S05-Live-Ingest-TickVault]] | 30-minute unattended peak-volatility soak (`SOL/USD`, depth=100, `>= 1,000` trades/venue) + real user-downloaded Databento `.dbn.zst` CME file (`$125` free credits) | Promote soak to Phase 3/4 CI; optional human smoke test with portal `.dbn.zst` sample | Phase 3 / v0.1 |
| [[S06-OMS-Paper-Execution]] | Live-network smoke test against `paper-api.alpaca.markets/v2` & optional tastytrade Certification Sandbox | Intentionally skipped in Phase 2 (`Constraints` §3 zero-account/zero-network rail); run opt-in user-env smoke test in v0.2 | v0.2 (Opt-in) |
| [[S07-Scripting-Sandbox]] & [[S08-Storage-100M-Replay]] | `TA-Lib v0.8.3` C oracle cross-check (4-runtime parity already verified at `0.000e0` vs Native Rust); 10M-row L2 MBP delta Parquet archive compression/seek | Add `TA-Lib` golden fixture parity test & L2 snapshot archive benchmark in Phase 3/4 | Phase 3 / v0.1 |
| [[R03-Market-Data]] & [[R04-Execution-Brokers-Props]] | Direct CME PDF binary (Akamai 403), Massive Futures native aggressor field, Finnhub WS cap, behind-login Lucid/MFFU addenda, Rithmic/CQG enterprise fees | Human browser verification only if those optional paid/post-MVP adapters are pursued | Post-v0.2 / Optional |
| [[R08-Prior-Art]] & [[R09-Legal-Licensing]] | Formal trademark attorney clearance for **"Allegedly"** (`allegedly.market` / `allegedlyapp.com`), Pine clean-room spec, `nautilus_trader` LGPL sidecar boundary, Sierra `.scid` prohibition, CFTC Rule 4.41 disclaimers | Qualified IP/securities counsel prior to public marketing / binary release | Pre-Public Release |
