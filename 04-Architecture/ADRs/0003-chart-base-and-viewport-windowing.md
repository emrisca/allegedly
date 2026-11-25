---
title: "ADR-0003: Base Charting Engine & Mandatory Rust-Backed 5,000-Bar Viewport Windowing"
type: adr
status: accepted
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - spikes/S01-chart-webgl-sync/package.json
  - spikes/S01-chart-webgl-sync/src/
  - spikes/S01-chart-webgl-sync/bench-results.json
  - spikes/S08-storage-100m-replay/src/vault.rs
---

# ADR-0003: Base Charting Engine & Mandatory Rust-Backed 5,000-Bar Viewport Windowing

- **Status:** Proposed (Draft for Red-Team Review)
- **Date:** `2026-11-24`
- **Owner:** Architect (Workstream A — Shell, Charting, GPU, IPC & UI)
- **Decides:** Base 2D financial charting library, live-tick scaling architecture (`<= 5,000`-bar active windowing with `6,000`-bar hysteresis), and clean-room drawing/attribution boundaries.

---

## 1. Context

Allegedly must render multi-pane Candlestick / OHLCV **Bars**, volume histograms, price/time axes, crosshair snapping, and clean-room **Drawings** at a locked **`60 fps` (`<= 16.67 ms`)** while ingesting `30–60 Hz` live ticks and navigating multi-month (`100,000+`-bar) histories. Per [[Constraints]] #1 and [[Adopt-Build-Fork]], proprietary charting SDKs (TradingView Charting Library) and license-conflicted libraries (`HQChart`) are disqualified.

Research [[R01-Charting-Rendering]] recommended **TradingView Lightweight Charts (`v5.3.0`, `Apache-2.0` + `NOTICE`)** as the base chart engine, paired with a synchronized WebGL2 order-flow layer. However, Phase 2 Spike [[S01-Chart-WebGL-Sync]] uncovered a decisive architectural constraint in `lightweight-charts 5.3.0`:

- **Pure Pan/Zoom (`0 Hz` live updates) at `100,000` Bars:** **`60.1 fps`** (`p50 16.70 ms`, `p95 17.80 ms`, `p99 19.10 ms`, `max 22.10 ms`, `0` stalls `> 33 ms`).
- **Live `30 Hz` `series.update()` Cliff at `100,000` Bars:** Calling `candleSeries.update()` + `volSeries.update()` at `30 Hz` on a `100,000`-bar LWC instance caused even **`lwc-only`** (zero WebGL overlay) to collapse to **`18.5 fps`** (`p50 50.4 ms`, `p95 95.5 ms`, `max 113.0 ms`, `72` stalls `> 33 ms`), with `primitive-hook` at `21.1 fps` (`p50 46.1 ms`, `p95 65.1 ms`).
- **Rust-Backed `5,000`-Bar Active Viewport Window:** Bounding LWC's active series to **`5,000` Bars** (with `500` visible Footprint Bars rendered in WebGL2) completely eliminated the `O(N)` cliff, delivering **`60.0 fps`** at `30 Hz` (`p50 16.80 ms`, `p95 19.20 ms`, `max 21.30 ms`, `0` stalls `> 33 ms`) and **`60.0 fps`** at `60 Hz` (`p50 16.60 ms`, `p95 18.70 ms`, `max 22.40 ms`, `0` stalls `> 33 ms`), with an **`80.7 ms`** window reload.

---

## 2. Options & Weighted Criteria

Criteria weights reflect [[R01-Charting-Rendering]] and `S01` empirical findings:
- **60 FPS Live-Tick & Pan/Zoom Performance (30%)** — Zero stalls `> 33 ms` under `30–60 Hz` live updates + rapid pan/zoom.
- **Zero-Drift GPU Overlay Extensibility (25%)** — Same-frame coordinate hook (`ISeriesPrimitive` `useBitmapCoordinateSpace`) for order-flow WebGL2 sync.
- **License & Clean-Room Safety (20%)** — Permissive FOSS (`Apache-2.0`/`MIT`), zero proprietary terms.
- **Time-to-Ship & Ecosystem Maturity (15%)** — Native Panes, time/price scale ergonomics, TypeScript types, active maintenance.
- **Long-Term Maintainability & Memory Efficiency (10%)** — Small bundle, bounded memory, clean seam for custom drawings.

| Option | 60 FPS Perf (30%) | GPU Sync Hook (25%) | License Safety (20%) | Time-to-Ship (15%) | Maintainability (10%) | Weighted Score (/5.0) |
|---|---:|---:|---:|---:|---:|---:|
| **A. `Lightweight Charts v5.3.0` + Mandatory Rust `<= 5,000`-Bar Viewport Windowing** *(Selected)* | **4.8** (`60.0 fps` @ `60 Hz`, `0` stalls, `80.7 ms` window swap) | **5.0** (`0.000 CSS px` drift via `ISeriesPrimitive` `S01`) | **5.0** (`Apache-2.0` + `NOTICE`, verified `2026-11-24`) | **4.6** (`17,978★`, native v5 Panes, clean TS API; drawings built clean-room) | **4.5** (Bounded `5k`-bar JS heap; Rust owns `100k+` history) | **4.83** |
| **B. `Lightweight Charts v5.3.0` Unwindowed (`100k` Bars Directly in JS)** *(Rejected)* | **1.2** (`18.5 fps`, `72` stalls `> 33 ms` @ `30 Hz` live `S01`) | **5.0** (`0.000 px` drift) | **5.0** (`Apache-2.0` + `NOTICE`) | **4.8** (No window manager needed) | **2.5** (Unbounded JS bar array memory) | **3.58** |
| **C. `KLineChart v10.1.1` (`Apache-2.0`)** *(Fallback)* | **3.6** (`UNVERIFIED` live `100k` bench; Canvas2D-only) | **3.2** (No equivalent `useBitmapCoordinateSpace` primitive hook verified) | **5.0** (`Apache-2.0`) | **4.2** (16 built-in overlays; smaller community & docs variance) | **3.8** (Higher custom overlay coupling) | **3.89** |
| **D. Build Unified Custom WebGL2 Chart Engine From Scratch** *(Long-Term Escape Hatch)* | **5.0** (Full control over `O(1)` updates & GPU instancing) | **5.0** (Single native GPU pipeline) | **5.0** (First-party `Apache-2.0`) | **1.2** (Must build price/time axes, log/percent scales, touch/wheel inertia, multi-pane splitters, crosshair, DPR text) | **3.5** (High engineering surface for small team) | **4.28** |
| **E. `Apache ECharts v6.1.0` (`Apache-2.0`)** *(Rejected)* | **2.5** (General-purpose BI chart; poor tick-level financial axis ergonomics) | **2.0** (No financial primitive paint-sync hook) | **5.0** (`Apache-2.0`) | **3.2** (Heavy bundle, non-trading interaction feel) | **3.0** (Awkward order-flow integration) | **3.03** |

---

## 3. Decision

1. **Adopt `lightweight-charts 5.3.0` (`Apache-2.0` + mandatory `NOTICE` attribution)** as Allegedly's base financial charting engine for `v0.1`–`v1.0`, utilizing its native v5 multi-pane API for volume/oscillator sub-panes and its `ISeriesPrimitive` interface for zero-drift WebGL2 synchronization ([[0004-orderflow-gpu-and-hotpath-renderer]]) and clean-room drawings.
2. **Mandate Rust-Backed `<= 5,000`-Bar Active Viewport Windowing (`ChartViewportController`):**
   - Rust (`allegedly-storage` + `allegedly-studies` + `allegedly-ipc`) is the single source of truth for full `100,000+`-bar histories, full-lookback Study warmup, and `100M+`-tick vaults (`S08`: `5.22 ms` cold 1-hour seek).
   - Each `Lightweight Charts` series instance targets **`W_ACTIVE = 5,000` Bars** with a **`max_window = 6,000`-bar hysteresis ceiling** (`1,000`-bar live tail slack) before scheduling an idle-frame front trim (`requestIdleCallback`, strictly between bar closes and never during pointer drags).
   - Panning within `W_MARGIN = 750` Bars of either window edge triggers an asynchronous `viewport.prefetch_window` call (`W_STRIDE = 2,500` Bars, `50%` overlap), followed by an atomic `series.setData()` + timestamp-anchored `setVisibleLogicalRange()` restore (`80.7 ms` measured in `S01`; binary IPC payload `~340 KB` transfers in `< 1 ms` per `S02`).
   - Visible-range Volume Profiles (`VRVP`) never scan JS bar arrays; they query Rust's 16-ary Dyadic Segment Tree (`S08`: `9.04 µs` p50 / `27.08 µs` p99 across `100,000` Bars).
3. **Build Clean-Room Drawing Suite Over `ISeriesPrimitive` (`B2` in [[Adopt-Build-Fork]]):**
   - Implement Allegedly's drawing tools (Trendline, Ray, Horizontal/Vertical Line, Rectangle, Fib Retracement, Anchored Volume Profile, Magnet Snap) in `@allegedly/chart-engine` using `ISeriesPrimitive` and integer-tick anchor serialization in `analysis.toml`.
   - Retain TradingView's `Apache-2.0` `NOTICE` attribution visibly in `THIRD_PARTY_NOTICES.md` and the application About dialog; do not copy any TradingView icons, cursors, or proprietary Charting Library code.

---

## 4. Consequences

### Positive
- **Locked `60.0 fps` Live Trading Performance:** Eliminates LWC's `18.5 fps` `100k`-bar `update()` bottleneck while retaining `Lightweight Charts`' battle-tested axis formatting, kinetic pan/zoom, multi-pane layout, and `0.000 CSS px` `ISeriesPrimitive` paint synchronization (`S01`).
- **Tiny Per-Pane JS Memory:** Each chart pane holds `5,000–6,000` Bars (`~340 KB` raw SoA) instead of duplicating `100k+` Bars per detached window, while `allegedly-studies` maintains exact full-history Study warmup in Rust.
- **Fast v0.1 Delivery:** Avoids writing custom financial axes, session-break time scales, and zoom inertia from scratch.
- **Full Ownership of Drawings & Settings-as-Code:** Clean-room `ISeriesPrimitive` drawings serialize deterministically to `analysis.toml` with integer `PriceTicks(i64)` anchors.

### Negative
- **Historical Viewport Seam & Periodic Live-Tail Trim (`~80.7 ms`, `RT3-09`):** Both continuous high-speed horizontal scrubbing across a `2,500`-bar historical seam AND periodic live-tail front trims (when a live session accumulates `1,000` new bars and crosses `max_window = 6,000`) invoke `series.setData()`, incurring a single **`~80.7 ms`** (~5-frame) hitch (`S01`). On a `1m` chart this occurs once every `16.7` hours; on a `1s` or fast tick chart it occurs more frequently, so trims are strictly buffered by the `max_window = 6,000` hysteresis band and deferred via `requestIdleCallback` to idle intervals between bar closes (and LWC `v5.3` incremental front-pop APIs will be evaluated during `v0.1` implementation to eliminate the `setData()` hitch entirely).
- **No Built-In Drawings:** Every drawing tool must be built and maintained in-house in `@allegedly/chart-engine` (staged incrementally: core 6 tools in v0.1, expanded set in v0.2+).

### Risks & Explicit `UNVERIFIED` Gaps
1. **Window-Swap Visual Smoothness Under Continuous Drag (`UNVERIFIED` UX Feel):** While `S01` measured the `5,000`-bar reload at `80.7 ms` and `60.0 fps` live ticks, interactive pointer-drag continuity across a live window swap (preserving active mouse-drag momentum without snapping back) must be validated with an automated Playwright drag-across-seam test in `v0.1` Implementation CI (post-Phase-5).
2. **Cross-Engine Performance (`UNVERIFIED` on `WKWebView` / `WebView2`):** `S01` ran on macOS Brave (`ANGLE Metal`). `lightweight-charts 5.3.0` `5,000`-bar `60 Hz` update cost and `setData()` swap time on macOS `WKWebView` and Windows `WebView2` remain `UNVERIFIED` until `v0.1` Implementation CI (post-Phase-5).
3. **Upstream LWC v6 Breaking Changes:** Pin `lightweight-charts` to exact `5.3.x` semver and wrap all calls inside `@allegedly/chart-engine` so upstream API shifts stay localized.

---

## 5. Reversal Cost

- **Medium (3–4 Engineering Weeks) to Swap to `KLineChart v10.1.1` (`Apache-2.0`):** Because `ChartViewportController`, binary `OHLCV_BARS_SOA` IPC, Rust storage, and WebGL2 order-flow shaders live outside LWC's API, only `@allegedly/chart-engine` (the thin LWC wrapper and `ISeriesPrimitive` bridge) would need replacement.
- **High (8–12 Engineering Weeks) to Replace Base Chart with Unified Custom WebGL2 Engine:** Warranted only if LWC's Canvas2D base layer or `80.7 ms` window-swap / live-tail trim seam becomes a proven user-facing bottleneck across multi-pane pro layouts (`KC-01`).

---

## 6. Revisit Trigger

Reopen this ADR if any of the following occur:
1. **`WKWebView` or `WebView2` Windowed Frame Drop:** Active `5,000`-bar chart at `60 Hz` live updates drops below **`55 fps` p95** or records **`> 2` stalls `> 33 ms`** per `10 s` on macOS `WKWebView` or Windows `WebView2`.
2. **Window-Swap Seam Regression:** `5,000`-bar `setData()` swap exceeds **`120 ms` p95** or breaks continuous mouse-drag panning inertia across seams in `v0.1` Implementation CI UX testing (post-Phase-5).
3. **Extreme Multi-Pane Scaling (`>= 6` Concurrent Charts):** Having `6+` simultaneous LWC Canvas2D panes degrades composite frame time past `16.67 ms` on target mid-tier hardware, justifying a unified shared-context WebGL2 chart canvas.
4. **Upstream License or Abandonment Change:** TradingView changes `lightweight-charts`'s `Apache-2.0` license for future versions or halts security/bugfix maintenance for `> 12` months.

---

## 7. Evidence Links

- [[R01-Charting-Rendering]] — Base charting library survey, license verification, `ISeriesPrimitive` architecture.
- [[S01-Chart-WebGL-Sync]] — Empirical proof of LWC `18.5 fps` `100k`-bar `update()` cliff, `60.0 fps` `5,000`-bar windowed fix, `80.7 ms` reload, and `0.000 CSS px` `ISeriesPrimitive` alignment.
- [[S08-Storage-100M-Replay]] — Rust `5.22 ms` cold 1-hour seek and `9.04 µs` p50 16-ary Dyadic VRVP tree backing windowed charts.
- [[IPC-Contract]] — §5 `5,000`-bar viewport windowing sequence diagram, `6,000`-bar hysteresis, full-history Study warmup, and binary `OHLCV_BARS_SOA` wire layout.
- [[Adopt-Build-Fork]] — Ledger items #2 (`Lightweight Charts`) and #6 (`B2` clean-room drawings).
- [[0004-orderflow-gpu-and-hotpath-renderer]] — Companion ADR for WebGL2 order-flow synchronization.
