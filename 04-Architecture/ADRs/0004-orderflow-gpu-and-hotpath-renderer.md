---
title: "ADR-0004: Synchronized Raw WebGL2 Order-Flow Layer & Canvas2D Hot-Path DOM Renderer"
type: adr
status: proposed
phase: Phase 3
owner: architect
updated: 2026-11-24
code_refs:
  - spikes/S01-chart-webgl-sync/src/
  - spikes/S01-chart-webgl-sync/bench-results.json
  - spikes/S04-css-layout-perf/src/
  - spikes/S04-css-layout-perf/bench-results.json
---

# ADR-0004: Synchronized Raw WebGL2 Order-Flow Layer & Canvas2D Hot-Path DOM Renderer

- **Status:** Proposed (Draft for Red-Team Review)
- **Date:** `2026-11-24`
- **Owner:** Architect (Workstream A — Shell, Charting, GPU, IPC & UI)
- **Decides:** GPU rendering strategy and frame-sync hook for high-density order-flow overlays (**Footprint Bars**, **Volume Profile**, **TPO Profile**, Liquidity Heatmap) plus the hot-path rendering engine for the **DOM Ladder** and Time & Sales tape.

---

## 1. Context

Institutional order-flow visualization pushes two distinct `60 fps` hot paths inside Allegedly's WebView:
1. **Chart-Aligned Order-Flow Overlays (`S01`):** Up to `500` visible **Footprint Bars** (`~10,500+` instanced bid/ask cells + crisp DPR volume numerals), Liquidity Heatmaps (`100k–200k` historical L2 cells), **Volume Profiles**, and **TPO Profiles** must track `Lightweight Charts v5.3.0` (`[[0003-chart-base-and-viewport-windowing]]`) across rapid panning, zooming, pane resizing, and `2× → 1×` DPR display switches with **zero visual tearing or 1-frame coordinate lag**.
2. **High-Frequency DOM Ladder & Time-and-Sales Tape (`S04`):** `100` live **Book Levels** + `50` streaming trade rows updating at `30–60 Hz` (`500–2,000` deltas/s) must never trigger browser Layout or RecalcStyle thrashing that starves sibling chart panes.

Phase 2 Spikes [[S01-Chart-WebGL-Sync]] and [[S04-CSS-Layout-Perf]] resolved both questions empirically:
- **Sync Mechanism (`S01`):** Invoking WebGL2 rendering synchronously inside `Lightweight Charts`'s `ISeriesPrimitive` `useBitmapCoordinateSpace` callback (`primitive-hook`) achieved **`0.000 CSS px` coordinate & pixel-centroid drift** and **`0` lagging frames** across rest, rapid-pan (`90` frames), rapid-zoom (`90` frames), resize (`8` frames), and `2× → 1×` DPR transitions (`90` frames). By contrast, a decoupled `subscribeVisibleLogicalRangeChange + requestAnimationFrame` loop (`range-raf`) lagged by up to **`54.0 CSS px`** on rapid-pan (`86/90` lagging frames), **`12.369 CSS px`** on rapid-zoom (`22/90`), **`557.244 CSS px`** on resize (`4/8`), and **`488.016 CSS px`** under live stress.
- **GPU Draw Cost (`S01`):** Raw WebGL2 instanced drawing (`~10,560–10,666` Footprint quads + `~203–212` DPR bitmap-atlas glyphs) took only **`0.30–0.40 ms` p50 / `0.40–0.80 ms` p95** CPU time per frame on Apple M2 (`ANGLE Metal`, WebGL 2.0, `maxTextureSize = 16384`).
- **DOM Ladder / Tape Renderer (`S04`):** At `60 Hz` / `2,000 deltas/s` (`5,000 ms` capture, `2×` DPR), dedicated **`canvas2d`** consumed **`0.00 ms` Layout**, **`0.00 ms` RecalcStyle**, and **`86.38 ms` Script** (`1.7%` of the 5-second budget, `36` DOM nodes, `0` React commits, `60.2 fps`, `0.3/0.4 ms` render CPU, `0` stalls `> 20 ms`). Both **`react-state`** (`422.87 ms` total = `208.05 ms` Layout + `74.40 ms` RecalcStyle + `140.42 ms` Script, `300` commits, `1,684` DOM nodes — **`4.9×`** higher CPU) and **`imperative-dom-contained`** (`455.74 ms` total = `268.36 ms` Layout + `86.46 ms` RecalcStyle + `100.92 ms` Script, `3,686` DOM nodes — **`5.3×`** higher CPU) incurred severe browser layout overhead (`6.8×` and `4.7×` higher even at `30 Hz` / `500 deltas/s`).

---

## 2. Options & Weighted Criteria

### 2A. Chart Order-Flow GPU Layer

Weights: **Zero-Drift Sync (30%)**, **Frame CPU/GPU Budget (30%)**, **macOS `WKWebView` + Windows `WebView2` Portability (20%)**, **Bundle & Dependency Simplicity (10%)**, **License Safety (10%)**.

| Option | Zero-Drift Sync (30%) | Frame Perf (30%) | WebView Portability (20%) | Simplicity (10%) | License (10%) | Weighted Score (/5.0) |
|---|---:|---:|---:|---:|---:|---:|
| **A1. Raw WebGL2 Instanced Renderer + DPR Glyph Atlas via `ISeriesPrimitive` (`useBitmapCoordinateSpace`)** *(Selected)* | **5.0** (`0.000 CSS px` drift, `0` lag frames `S01`) | **5.0** (`0.30–0.40 ms` p50 / `0.40–0.80 ms` p95 `S01`) | **4.8** (WebGL2 supported on `WKWebView` & `WebView2`; Canvas2D fallback) | **4.2** (`~2–4k` LOC, zero scene-graph deps) | **5.0** (First-party `Apache-2.0`) | **4.88** |
| **A2. Raw WebGL2 via `subscribeVisibleLogicalRangeChange + rAF` (`range-raf`)** *(Rejected)* | **1.0** (`54–557 CSS px` drift, `86/90` lagging pan frames `S01`) | **5.0** (`0.30 ms` draw) | **4.8** | **4.4** | **5.0** | **3.70** |
| **A3. `PixiJS v8.23.0` (`MIT`) Scene Graph Overlay** *(Rejected)* | **4.0** (Still needs LWC primitive hook) | **3.2** (Per-cell display-object churn & GC overhead on `10k+` dynamic quads) | **4.6** | **3.5** (Extra runtime & abstraction layer) | **5.0** (`MIT`) | **3.93** |
| **A4. WebGPU-Only Renderer** *(Rejected for v1.0)* | **4.8** | **5.0** | **2.2** (Inconsistent `WKWebView`/older GPU driver coverage & zero Linux fallback) | **3.5** | **5.0** | **4.23** |

### 2B. Hot-Path DOM Ladder & Time-and-Sales Renderer

Weights: **Main-Thread CPU & Zero Layout Thrash (40%)**, **60 FPS Stability Under Burst (25%)**, **Visual Crispness & Tabular Alignment (15%)**, **Click-to-Trade Hit Testing & Accessibility (10%)**, **Memory & DOM Footprint (10%)**.

| Option | Zero Layout Thrash (40%) | 60 FPS Stability (25%) | Visual Crispness (15%) | Hit-Test / A11y (10%) | Memory / DOM (10%) | Weighted Score (/5.0) |
|---|---:|---:|---:|---:|---:|---:|
| **B1. Dedicated Canvas2D (`@allegedly/dom-canvas`) + Thin Accessible Header/Toolbar Chrome** *(Selected)* | **5.0** (`0.00 ms` Layout, `0.00 ms` RecalcStyle, `1.7%` CPU `S04`) | **5.0** (`60.2 fps`, `0` stalls `> 20 ms`, `0.4 ms` p95 `S04`) | **4.8** (Native DPR scaling + `JetBrains Mono` tabular canvas glyphs) | **4.0** (Exact O(1) row/col coordinate math + aria live summary) | **5.0** (`36` DOM nodes, `+0.69 MB` heap `S04`) | **4.87** |
| **B2. Imperative DOM + CSS `contain: strict` (`imperative-dom-contained`)** *(Rejected)* | **2.0** (`268.36 ms` Layout + `86.46 ms` RecalcStyle = `5.3×` CPU `S04`) | **3.5** (Risk of frame drops when combined with multi-pane charts) | **4.8** | **4.8** | **2.5** (`3,686` DOM nodes `S04`) | **3.13** |
| **B3. React 19 State + Zustand (`react-state`)** *(Rejected)* | **2.2** (`208.05 ms` Layout + `74.40 ms` RecalcStyle = `4.9×–6.8×` CPU, `300` commits `S04`) | **3.2** (Competes with React UI chrome commits) | **4.8** | **5.0** | **3.0** (`1,684` DOM nodes, `+1.54 MB` heap `S04`) | **3.20** |

---

## 3. Decision

1. **Build a Thin Raw WebGL2 Instanced Order-Flow Renderer (`@allegedly/orderflow-gl`, `B1` in [[Adopt-Build-Fork]]):**
   - Renders **Footprint Bars** (from canonical `32 B` `FootprintCell` slabs including `imbalance_flags` and `trade_count`), **Volume Profiles** (Session, Anchored, and Dyadic VRVP), **TPO Profiles** (`u128` / multi-word bitsets), Liquidity Heatmaps, and imbalance highlights using WebGL 2.0 instanced vertex buffers (`gl.drawArraysInstanced`) and a crisp **DPR-aware bitmap glyph atlas** (`JetBrains Mono v2.304`, `OFL-1.1`).
   - **Mandatory Synchronous Paint Hook:** All chart-aligned GPU draws MUST be driven from inside a `Lightweight Charts` `ISeriesPrimitive` `useBitmapCoordinateSpace` callback (converting LWC logical/price coordinates to physical framebuffer pixels inside the exact same paint pass). Decoupled `rAF` or `subscribeVisibleLogicalRangeChange` rendering loops are **prohibited** due to `S01`'s `54–557 CSS px` drift proof.
   - **Context Budget & Graceful Fallback:** Enforce a strict per-window WebGL2 context cap (pooled/shared offscreen or single context per active chart pane with clean `loseContext()` disposal on panel unmount). On `webglcontextlost` or software-GL detection, automatically fall back to a decimated Canvas2D Footprint/Profile renderer and display a non-blocking GPU status badge.
2. **Mandate Dedicated Canvas2D Rendering for DOM Ladder & Time-and-Sales (`@allegedly/dom-canvas`):**
   - All `>= 30 Hz` tabular market-data panels (**DOM Ladder**, Time & Sales tape, high-frequency quote grids) render directly to a DPR-scaled HTML5 `<canvas>` fed by zero-copy typed views from `IPC Contract v1` (`16 ms`-batched `LIVE_L2_BOOK_BATCH` and `40 B` `LIVE_TRADE_BATCH`).
   - Pointer hit-testing (single-click limit/stop order entry, modifier-key cancel, center-on-last-price, drag-to-modify working order) uses deterministic `O(1)` pixel-to-`PriceTicks(i64)` math aligned to row height (`0` DOM hit-test nodes).
   - Surrounding static panel headers, account selector, order-size presets, and armed-status toggles use `ui-sdk` + React (`[[0010-ui-kit-docking-and-settings-as-code]]`), strictly decoupled from the `60 Hz` canvas draw loop.
3. **Hard Rule — Zero React Reconciliation on Hot Paths (`SV-14`):** Neither `60 fps` chart/order-flow ticks nor `30+ Hz` DOM Ladder / Time & Sales updates may call React `setState` or trigger Zustand selectors bound to React component trees. `v0.1` Implementation CI (post-Phase-5) performance tests verify `0` React commits during `5 s` live stress runs (`S04`).

---

## 4. Consequences

### Positive
- **Zero Visual Drift:** Guarantees `0.000 CSS px` alignment between Candlestick Bars and WebGL2 Footprint/Profile overlays across rapid pan, zoom, resize, and multi-monitor `2× ↔ 1×` DPR transitions (`S01`).
- **Sub-Millisecond GPU & DOM Budgets:** Combined `0.40–0.80 ms` p95 WebGL2 draw (`S01`) + `0.40 ms` p95 Canvas2D DOM draw (`S04`) leaves **`> 14 ms`** of every `16.67 ms` frame free for LWC, IPC decoding, and OS compositing — even across multi-pane layouts.
- **Zero Browser Layout Thrash:** Eliminates `208–268 ms` of wasted Layout and `74–86 ms` of RecalcStyle per `5 s` (`4.9×–6.8×` total CPU reduction in `S04`).
- **Zero External Graphics Bloat:** No `PixiJS`, `Three.js`, or copyleft (`GPL-3.0` Flowsurface) dependencies.

### Negative
- **Custom Shader & Glyph Atlas Maintenance:** `@allegedly/orderflow-gl` (`~2–4k` LOC GLSL ES 3.00 + TypeScript) and `@allegedly/dom-canvas` must be maintained in-house, including DPR font-atlas regeneration on display scale changes and explicit WCAG AA / Okabe-Ito colorblind theme token uploads (`SV-19`).
- **Accessibility Requires Explicit Bridge:** Because Canvas2D DOM Ladder rows are not native DOM `<tr>` elements, keyboard navigation (arrow-key price ladder stepping, screen-reader aria-live BBO/position announcements) must be explicitly implemented on the canvas wrapper.

### Risks & Explicit `UNVERIFIED` Gaps
1. **macOS `WKWebView` & Windows `WebView2` GPU Measurements (`UNVERIFIED`):** `S01` and `S04` ran on macOS Brave (`ANGLE Metal`). `WKWebView` WebGL2 `ISeriesPrimitive` blit overhead (e.g., `drawImage(glCanvas)` vs stacked transparent WebGL2 canvas synced in the same paint tick) and Windows `WebView2` ANGLE D3D11 shader compile/draw latency remain **`UNVERIFIED`** until `v0.1` Implementation CI (post-Phase-5) runs on native Tauri macOS + Windows builds.
2. **Multi-Pane WebGL2 Context Limit (`~8–16` per WebView):** Opening `10+` simultaneous chart panes in a single WebView window can hit browser WebGL2 context eviction limits unless `v0.1` implementation (post-Phase-5) implements a shared single-canvas scissor-rect renderer or strictly pools contexts to active visible tabs.

---

## 5. Reversal Cost

- **Low–Medium (2–3 Engineering Weeks) for DOM Ladder:** `@allegedly/dom-canvas` consumes a clean typed `BookSnapshot` / `TradeRing` buffer; switching to a virtualized DOM or WebGL2 DOM renderer affects only one package.
- **Medium (3–5 Engineering Weeks) for GPU Backend:** Because Rust `allegedly-orderflow` owns all Footprint/VRVP/TPO integer math and streams flat binary `32 B` cell slabs (`IPC Contract v1`), upgrading `@allegedly/orderflow-gl` from WebGL2 to WebGPU (once `WKWebView`/`WebView2` support is ubiquitous) or swapping the compositing bridge stays isolated inside one package.

---

## 6. Revisit Trigger

Reopen this ADR if any of the following occur:
1. **`WKWebView` / `WebView2` Sync Overhead Regression:** `ISeriesPrimitive`-driven WebGL2 overlay exceeds **`3.0 ms` p95** draw/composite CPU per pane or introduces **`> 0.5 CSS px`** drift on native macOS `WKWebView` or Windows `WebView2`.
2. **Context Eviction on Pro Multi-Pane Workspaces:** A `6`-chart + `2`-DOM workspace triggers `webglcontextlost` on Apple Silicon or mid-tier Windows GPUs, requiring migration from per-pane WebGL2 contexts to a single shared viewport-scissored WebGL2 surface.
3. **WebGPU Ubiquity + Compute-Shader Need:** If post-v1.0 volume-heatmap or volumetric shader features require GPU compute shaders and WebGPU achieves `100%` stable parity across macOS `WKWebView` and Windows `WebView2`.

---

## 7. Evidence Links

- [[R01-Charting-Rendering]] — GPU overlay options (WebGL2 vs PixiJS vs WebGPU vs Canvas2D) and text-atlas strategy.
- [[S01-Chart-WebGL-Sync]] — Empirical proof of `0.000 CSS px` `ISeriesPrimitive` sync vs `54–557 CSS px` `range-raf` lag, and `0.30–0.40 ms` p50 WebGL2 draw CPU.
- [[S04-CSS-Layout-Perf]] — Empirical proof of Canvas2D `0.00 ms` Layout/RecalcStyle (`4.9×–6.8×` lower CPU than React/DOM) at `30–60 Hz`.
- [[Adopt-Build-Fork]] — Ledger item #3 (`B1` raw WebGL2 order-flow layer justification).
- [[0003-chart-base-and-viewport-windowing]] — Companion ADR locking `Lightweight Charts v5.3.0` + `5,000`-bar windowing.
- [[0010-ui-kit-docking-and-settings-as-code]] — Companion ADR enforcing React/`ui-sdk` isolation to non-hot-path UI chrome.
