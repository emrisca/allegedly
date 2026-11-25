---
title: Kill & Pivot Criteria
type: risk
status: active
owner: orchestrator
updated: 2026-11-25
code_refs: []
---

# Kill & Pivot Criteria

> Explicit, pre-committed thresholds. If a spike or research track trips a trigger below, we execute the documented pivot instead of quietly lowering the bar.

| Trigger ID | Phase | Threshold / Failure Condition | Mandatory Action / Pivot |
|---|---|---|---|
| **KC-01** | Phase 2 (`S01`/`S02`) | Selected web chart base cannot hold `>= 55 fps` (target 60 fps) on 100k candles + 5 Studies or 5k footprint bars on **macOS or Windows** *(Linux deferred to post-v1.0)* | Pivot chart renderer to custom WebGL2/WebGPU canvas layer or native GPU renderer (`wgpu`/`egui`) |
| **KC-02** | Phase 2 (`S02`/`S04`) | Tauri v2 on **macOS (`WKWebView`) or Windows (`WebView2`)** exhibits broken WebGL2, >2x frame-time regression vs Chromium, or unworkable IPC bottleneck *(Linux WebKitGTK gate deferred to future Linux milestone)* | Pivot shell to fallback evaluated in `R02` (e.g., native Rust UI or Electron with explicit bundle-size ADR revision) |
| **KC-03** | Phase 1 (`R04`) | A prop firm's published rules prohibit third-party/custom execution clients or require unavailable vendor certification | Mark firm `DO-NOT-BUILD` permanently unless written official API program opens |
| **KC-04** | Phase 1 (`R09`) | Any critical candidate dependency carries an incompatible license (proprietary, BSL/TSL, or viral copyleft conflicting with chosen app license) | Reject dependency or isolate behind a clean optional sidecar/plugin process boundary |
| **KC-05** | Phase 2 (`S05`) | Ingest pipeline cannot sustain `20k+` ticks/s with bounded memory and deterministic backpressure | Redesign Rust ring-buffer / frame-coalescing pipeline before Phase 3 architecture lock |
| **KC-06** | Phase 2 (`S07`) | Study runtime diverges numerically from reference Study libraries beyond tolerance or misses latency budget over 1M bars | Fix fixed-point/accumulator math or pivot runtime before scripting grammar work |
| **KC-07** | Phase 4 (v0.1) | Vertical-slice MVP exceeds single-developer/agent-assisted maintainability or takes >8 weeks to reach first real-data demo | Cut breadth (keep 1 exchange, 1 order-flow tool, 1 drawing tool, 1 Study) until spine ships |
