---
title: R01 — Charting & Rendering Engine Research
track: R01
status: verified
owner: research-charts
updated: 2026-11-24
code_refs: []
---

# R01 — Charting & Rendering Engine Research

## Question

Which FOSS charting base and rendering architecture can deliver TradingView-grade **Bar** charting, multi-pane **Studies**, interactive **Drawings**, and Multi-Timeframe (**MTF**) analysis alongside MotiveWave-grade **Footprint Bars**, **Volume Profiles**, **TPO Profiles**, and order-book **Liquidity Heatmaps** at a sustained `60 fps` with `100k+` bars across macOS (`WKWebView`), Windows (`WebView2`), and Linux (`WebKitGTK`, X11 + Wayland), while strictly honoring `[[Constraints]]` (FOSS-only, `$0` core, fixed-point financial math, zero GC stalls)?

---

## Findings (Facts)

### 1. Candidate Charting Libraries — Primary-Source Audit

All repositories, versions, licenses, and release dates below were directly verified via GitHub API, repository `LICENSE`/`NOTICE`/`README` files, npm registry, and official documentation on `2026-11-24`.

| Library | Primary Repo / Pkg | Latest Stable | Verified License | Maintenance Health (2026-11-24) | Renderer | Built-in Drawings | Built-in Study Panes | Built-in MTF | Core Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **TradingView Lightweight Charts** | `tradingview/lightweight-charts` (`lightweight-charts`) | `v5.3.0` (`2026-11-10`) [R01-S01] | **Apache-2.0** + `NOTICE` attribution [R01-S02] | **Active** — 17,978 stars; pushed `2026-11-18`; official plugins released `2026-11-13` [R01-S01] | HTML5 Canvas2D [R01-S03] | None built-in (primitive hooks + reference plugin pkgs) [R01-S04] | Multi-pane API (`v5+`); **0 built-in Study calculations** [R01-S05], [R01-S06] | None [R01-S06] | **Adopt as base chart** |
| **TradingView Charting Library ("Advanced Charts" / "Trading Platform")** | `tradingview/charting_library` (private — HTTP 404) [R01-S07] | `v30` docs [R01-S08] | **Proprietary** — non-redistributable; public-website-only or paid commercial [R01-S08] | Commercial active | HTML5 Canvas2D | 110+ built-in [R01-S08] | 100+ built-in [R01-S08] | Yes (resolutions) [R01-S08] | **DISQUALIFIED** (violates Non-Negotiables #1, #2, #3) |
| **KLineChart** (+ `klinecharts/pro`) | `klinecharts/KLineChart` (`klinecharts`) | `v10.1.1` (`2026-11-16`) [R01-S09] | **Apache-2.0** (`LICENSE` verified; `klinecharts/pro` also Apache-2.0) [R01-S09], [R01-S10] | **Active** — 4,332 stars; pushed `2026-11-16`; zero deps, ~40 KB gzip [R01-S09], [R01-S11] | HTML5 Canvas2D [R01-S09] | **16 built-in** (lines, channels, Fib, `brush`) + `registerOverlay` [R01-S12] | Yes (built-in indicators + multi-pane + multi-Y-axis in `v10`) [R01-S11], [R01-S12] | None (consumer feeds bars) [R01-S11] | **Primary Fallback** |
| **TradingVue.js** | `tvjsx/trading-vue-js` | `v1.0` (`2020-12-20`) [R01-S13] | MIT [R01-S13] | **Dormant** — 2,314 stars; last push `2024-06-24`; Vue 2 coupled [R01-S13] | HTML5 Canvas2D | Community overlays | Yes | None | **Disqualified** (unmaintained, Vue 2) |
| **d3fc** | `ScottLogic/d3fc` (`d3fc`) | `15.2.13` (`2024-07-30`) [R01-S14] | MIT [R01-S14] | **Stagnant** — 1,350 stars; last push `2024-09-28` (2+ yrs inactive) [R01-S14] | SVG / Canvas2D / WebGL (`d3fc-webgl`) [R01-S14] | None | Composable D3 layouts only | None | **Disqualified** (stagnant, no trading UX) |
| **Apache ECharts** | `apache/echarts` (`echarts`) | `6.1.0` (`2026-05-19`) [R01-S15] | Apache-2.0 [R01-S15] | **Very Active** — 67,789 stars; pushed `2026-10-13` [R01-S15] | Canvas2D / SVG (+ optional `echarts-gl`) | Generic graphic elements only | Multi-grid BI layouts | None | **Disqualified as trading chart** (BI-oriented; usable for backtest equity curves) |
| **finplot** *(Reference Only)* | `highfestiva/finplot` | Continuous (`master`, no GH releases) [R01-S16] | MIT [R01-S16] | Active — 1,189 stars; pushed `2026-09-24`; **Python / PyQtGraph** [R01-S16] | Qt / PyQtGraph | Basic ROI lines | Linked multi-pane | None | **Reference only** (Python/Qt architecture benchmark) |
| **HQChart** | `jones2000/HQChart` (`hqchart`) | `1.1.15948` (npm) [R01-S17] | **LICENSE CONFLICT RISK** — `LICENSE` is Apache-2.0, **but** README binds custom `用户协议.txt` [R01-S17], [R01-S18] | Active — 3,431 stars; pushed `2026-11-24` [R01-S17] | HTML5 Canvas2D | 20+ built-in [R01-S17] | 80+ built-in (Tongdaxin/Mai syntax) [R01-S17] | Basic periods | **DISQUALIFIED** (unilateral termination & non-OSI terms) |

---

### 2. Deep-Dive Verification of Key Libraries

#### 2.1 TradingView Lightweight Charts (`v5.3.0`, Apache-2.0)
- **Panes API (`v5.0+`):** Supports multiple vertically stacked panes sharing a synchronized time scale with independent price scales (`chart.addPane()`, `chart.panes()`, `chart.swapPanes()`, `chart.removePane()`, `series.moveToPane(paneIndex)`, `pane.setHeight()`, `pane.setStretchFactor()`, `layout.panes.enableResize`, `chart.priceScale(id, paneIndex)`) [R01-S05].
- **Primitives & Custom Series API:**
  - `ISeriesPrimitiveBase` (`series.attachPrimitive()`) exposes `paneViews`, `priceAxisPaneViews`, `timeAxisPaneViews`, `priceAxisViews`, `timeAxisViews`, and `attached({ chart, series, requestUpdate })` [R01-S04].
  - `IPanePrimitiveBase` (`pane.attachPrimitive()`) renders pane-wide visuals independent of any series (e.g., watermarks, session shading) [R01-S04].
  - `ICustomSeriesPaneView` (`chart.addCustomSeries()`) enables custom bar types with `priceValueBuilder()` for auto-scaling and `CustomSeriesHitTestResult` for hover arbitration [R01-S04].
  - TradingView began publishing official plugin packages (`@tradingview/lwc-toolkit` `v1.1.0` + 19 graduated plugins across rounds `plugins-2026-09-16` and `plugins-2026-11-13`, including trend line, rectangle, volume profile, heatmap, and delta tooltip examples) [R01-S01], [R01-S04].
- **Exact Gaps & Compliance Requirements:**
  1. **Canvas2D only:** All built-in series and primitive renderers draw onto `CanvasRenderingContext2D` on the main thread — no WebGL/WebGPU acceleration [R01-S03], [R01-S04].
  2. **Zero built-in Studies:** Official docs explicitly state *"Lightweight Charts™ does not contain any built-in indicators"* [R01-S06].
  3. **No complete Drawing suite:** Primitives provide coordinate transforms (`timeToCoordinate`, `priceToCoordinate`) and hit-testing hooks, not a turnkey drawing toolbar, magnet snapping engine, undo/redo command stack, or drawing persistence model [R01-S04].
  4. **No built-in MTF:** Consumer must supply resampled bars and synchronize crosshairs/time ranges across charts [R01-S06].
  5. **IEEE-754 `number` API:** JS series inputs use standard JS floats; per `[[Constraints]]` #7, Allegedly MUST keep canonical prices/quantities as fixed-point `i64` tick counts in Rust and convert only at the chart view boundary.
  6. **Mandatory Attribution Notice:** The Apache-2.0 `NOTICE` file and `README.md` require retaining the attribution notice (`TradingView Lightweight Charts™`, copyright notice) and a link to `https://www.tradingview.com/` (satisfiable via the built-in `attributionLogo` option or a visible attribution notice/link in the terminal UI/About page) [R01-S02].

#### 2.2 TradingView Charting Library — Why It Is Hard-Disqualified
- Verified directly from TradingView's official Advanced Charts documentation (`https://www.tradingview.com/charting-library-docs/latest/introduction`) and GitHub API (`tradingview/charting_library` returns HTTP 404) [R01-S07], [R01-S08]:
  - **Private proprietary repository:** Requires submitting an access form and signing TradingView's proprietary license agreement; source code is **non-redistributable** and prohibited in public open-source repositories [R01-S07], [R01-S08].
  - **Public-website-only restriction:** Free *Advanced Charts* is permitted *"provided that the TradingView attribution remains visible and the implementation environment is public (not for private use or behind a paywall)"* — incompatible with a local-first, offline-capable desktop FOSS terminal [R01-S08].
  - **Commercial paywall for terminal features:** Multi-chart layouts, Session Volume Profile, DOM, order tickets, and chart trading are gated behind the paid commercial **Trading Platform** license [R01-S08].
- **Rule:** Allegedly must **never** depend on, wrap, bundle, or copy assets/code from TradingView Advanced Charts or Trading Platform.

#### 2.3 KLineChart (`v10.1.1`, Apache-2.0)
- `v10.0.0` (`2026-07-10`) through `v10.1.1` (`2026-11-16`) introduced a major architectural upgrade: multiple Y-axes per pane (`createYAxis`, `yAxisId`), custom hotkey registration (`setHotkey`, `registerHotkey`), continuous freehand `brush` overlay, zoom anchors, and decoupled pane/axis APIs [R01-S09], [R01-S12].
- Ships **16 built-in drawing overlays** (`horizontalRayLine`, `horizontalSegment`, `horizontalStraightLine`, `verticalRayLine`, `verticalSegment`, `verticalStraightLine`, `rayLine`, `segment`, `straightLine`, `priceLine`, `priceChannelLine`, `parallelStraightLine`, `fibonacciLine`, `brush`, `simpleAnnotation`, `simpleTag`) with `normal`, `weak_magnet`, and `strong_magnet` price snapping, plus `registerOverlay` / `registerFigure` extension APIs [R01-S12].
- **Exact Gaps:** HTML5 Canvas2D only (same CPU ceiling for dense Footprint Bars and Liquidity Heatmaps); no built-in MTF engine; JS float coordinates; smaller Western contributor base than Lightweight Charts [R01-S09], [R01-S11].

#### 2.4 HQChart — Exact License Risk Verified
- Although `jones2000/HQChart/LICENSE` is Apache-2.0, `README.md` (lines 29–30, 560–576) binds users to a separate Chinese User Agreement (`用户协议.txt`) [R01-S17], [R01-S18]:
  - Section III.2–3 imposes non-OSI field-of-use restrictions (PRC internet/SMS rules).
  - Section IV.4 reserves unilateral author rights to judge violations and **suspend or terminate the license at any time without consent or prior notice** (*"有权随时中止或终止本协议。HQChart作者无需就此征得用户同意或提前通知用户"*) [R01-S18].
  - Section VI.1–2 reserves all interpretation and modification rights under PRC law, and the README gates advanced modules/tutorials behind paid fees (`源码收费`) [R01-S17], [R01-S18].
- **Verdict:** Contradicts OSI FOSS principles and `[[Constraints]]` #1. Hard-disqualified.

---

### 3. GPU Rendering Layer Options (WebGL2 / WebGPU)

| Option | Latest Stable | License | Backend Capabilities | Assessment for Allegedly Order-Flow Layer |
|---|---|---|---|---|
| **Raw WebGL2** *(+ optional WebGPU future path)* | Web standard (GLSL ES 3.00) | Royalty-free W3C/Khronos spec | Universal across `WKWebView`, `WebView2`, `WebKitGTK` (hardware + Mesa software fallback) [R01-S19], [R01-S20] | **Best fit for targeted order-flow layer.** Zero JS dependency bloat; 1 instanced draw call renders 200k+ heatmap cells or 10k footprint boxes; direct Float32/Int32 typed-array upload from Rust IPC. |
| **PixiJS** | `v8.23.0` (`2026-11-11`) [R01-S21] | MIT [R01-S21] | Dual **WebGPU + WebGL2** renderer, 48,894 stars [R01-S21] | Viable if building an entire custom scene-graph renderer, but retains display-object overhead for 200k+ volatile heatmap cells compared to raw instanced buffers + adds bundle weight. |
| **regl** | `v2.1.1` [R01-S22] | MIT [R01-S22] | **WebGL 1 ONLY** — verified in `lib/webgl.js` (`get('webgl') \|\| get('experimental-webgl')`) [R01-S22] | **Disqualified.** Lacks native WebGL2 instanced arrays, integer/3D textures, and GLSL ES 3.00. |
| **wgpu / wgpu-wasm** | `v30.0.2` (`2026-11-12`) [R01-S23] | MIT OR Apache-2.0 [R01-S23] | Native Metal/Vulkan/DX12 or WASM (WebGPU / WebGL2) [R01-S23] | Strong only if rendering natively in a Rust surface (outside WebView). Inside WebView via WASM, adds multi-MB WASM footprint and still falls back to WebGL2 on Linux WebKitGTK [R01-S20]. |

#### Cross-Platform WebGPU Reality Check (2026-11-24)
- **WKWebView (macOS):** WebGPU ships by default starting in **Safari 26 / macOS Tahoe 26** (Metal backend), but is unavailable on macOS Sonoma/Sequoia [R01-S20].
- **WebView2 (Windows):** WebGPU ships by default on Windows `x86/x64` (Direct3D 12 / Dawn), but **Windows ARM64** still requires `--enable-unsafe-webgpu` [R01-S20].
- **WebKitGTK (Linux, up to `2.54.3`):** **WebGPU is NOT shipped** (`UNSTABLE` flag only; lacks a shipping Linux Vulkan/Dawn backend) [R01-S20], [R01-S24].
- **Conclusion:** **WebGL2 is the mandatory cross-platform GPU baseline**; WebGPU cannot be load-bearing under `[[Constraints]]` #4 (no second-class Linux platform).

---

### 4. Text Rendering Strategy at Scale (Footprint Bars, TPO Profiles, Axis Labels)

A dense **Footprint Bar** viewport (100 visible bars × 50 price ticks = 5,000 cells = 10,000 bid/ask numbers) or **TPO Profile** (hundreds of bracket letters) exceeds what naive `Canvas2D.fillText()` can shape and rasterize within a `16.6 ms` frame during continuous pan/zoom.

| Strategy | Underlying Tech / Libs | Pros | Cons | Best Use in Allegedly |
|---|---|---|---|---|
| **1. Direct Canvas2D `fillText()`** | Browser native Skia/CoreGraphics | Crisp subpixel hinting; full Unicode/RTL support | CPU-bound text shaping stalls `60 fps` above ~500–1,500 dynamic strings/frame | Price/time axes, crosshair badges, Drawing labels, sparse Study tags |
| **2. Pre-Baked DPR Glyph Sprite Atlas** *(Bitmap Atlas)* | Offscreen `<canvas>` pre-rendering `0-9`, `.`, `,`, `K`, `M`, `-`, `+`, `A-Z`, `a-z` at current `devicePixelRatio` | **Pixel-sharp at small sizes (8–13 px)**; renders 10,000+ Footprint digits in `< 1 ms` via WebGL2 instanced textured quads (or fast Canvas2D `drawImage`) | Must re-bake atlas (~2 ms one-time) when font size or `devicePixelRatio` changes | **Primary strategy for Footprint Bars & TPO letters** (tiny fixed monospace glyph set) |
| **3. SDF / MSDF Texture Atlas** | `Chlumsky/msdfgen` (`v1.13.1`, MIT) [R01-S25] or `mapbox/tiny-sdf` (`v2.3.0`, BSD-2-Clause) [R01-S26] | Resolution-independent crisp zoom across continuous scale factors without re-baking | Slight hinting softness below ~10 px on 1x monitors vs DPR-snapped bitmap glyphs; extra build/atlas pipeline | Evaluated side-by-side with Bitmap Atlas in **Spike S02** for smoothly zoomable Footprint/TPO labels |

---

### 5. OffscreenCanvas + Worker Split Feasibility Across WebView Engines

| Engine / OS | `OffscreenCanvas` 2D | `OffscreenCanvas` + `WebGL2` in Worker | Known Blockers & Quirks (Verified 2026-11-24) |
|---|---|---|---|
| **WebView2** (Windows 10/11 Chromium) | Supported (Edge 79+) [R01-S19] | Supported (Edge 79+) [R01-S19] | Subject to Chromium GPU driver blocklist (`edge://gpu`) [R01-S19]. |
| **WKWebView** (macOS Safari 17+ / macOS 26) | Supported (Safari 16.4+) [R01-S19] | Supported (Safari 17.0+; nested workers & WebGL2 fix in 17.4+) [R01-S19] | Does **not** support passing `SharedArrayBuffer` directly into `WebGL2.bufferData()`/`readPixels()` (requires `ArrayBuffer` copy/transfer) [R01-S19]. |
| **WebKitGTK** (Linux `2.42`–`2.54.3`) | Supported [R01-S24], [R01-S27] | **DISABLED BY DEFAULT** (`AllowWebGLInWorkers` runtime flag is OFF; `wry` does not enable it) [R01-S27] | 1) `new OffscreenCanvas(1,1).getContext('webgl2')` returns `null` unless enabled via `webkit_settings_set_feature_enabled` before navigation [R01-S27].<br>2) Even when enabled, combining transferred Worker WebGL2 + document WebGL2 on **NVIDIA + Wayland** has caused fatal UI-process crashes (`Gdk-Message: Error 71 (Protocol error)`) [R01-S27].<br>3) WebKitGTK masks `WEBGL_debug_renderer_info` as `"Apple GPU"` and silently falls back to software GL [R01-S27]. |

**Architectural takeaway:** Do **not** depend on `OffscreenCanvas + Worker WebGL2` as a mandatory rendering path. Run data decimation, Footprint/TPO layout geometry packing, and indicator math off the main thread (**Rust core + optional JS compute Worker**), and issue thin WebGL2/Canvas2D draw calls on the **main thread** so Linux stays crash-free and pointer/crosshair alignment never suffers 1-frame worker presentation lag.

---

## Options Table (Weighted Criteria)

Scoring scale: `1` (poor) to `5` (excellent). Disqualified candidates are marked `DQ` on violating hard `[[Constraints]]`.

| Option | FOSS & License Purity (20%) | Perf: 100k Bars + Order-Flow (25%) | Extensibility: Drawings / Studies / Footprint / Heatmap (25%) | Cross-Platform WebView Reliability (15%) | Maintenance & Velocity (15%) | Weighted Score |
|---|---|---|---|---|---|---|
| **A. Hybrid: Lightweight Charts `v5.3` + Synchronized Raw WebGL2 Order-Flow Layer + Rust MTF Core** | 4.5 *(Apache-2.0 + NOTICE)* | **4.8** *(LWC bars + GPU heatmap/footprint)* | **4.6** *(Panes + Primitives + custom WebGL2)* | **4.5** *(WebGL2 baseline + Canvas2D fallback)* | **4.7** *(18k stars, active, official plugins)* | **4.64** |
| **B. Hybrid: KLineChart `v10.1` + Synchronized Raw WebGL2 Order-Flow Layer + Rust MTF Core** | **5.0** *(Apache-2.0, no logo notice)* | 4.5 *(Canvas2D base + GPU order-flow)* | 4.6 *(16 built-in drawings + multi-Y-axis)* | 4.4 *(Canvas2D + WebGL2 fallback)* | 3.9 *(4.3k stars, smaller EN ecosystem)* | **4.52** |
| **C. Custom Unified WebGL2 Chart + Canvas2D Axis Engine (Build from Scratch)** | **5.0** *(100% owned)* | **5.0** *(single GPU frame loop, 0 sync drift)* | **5.0** *(total control)* | 4.3 *(WebGL2 Linux quirks still apply)* | 2.0 *(high engineering cost for pan/zoom/scale/drawings)* | **4.40** |
| **D. Lightweight Charts `v5.3` Alone (Canvas2D Primitives Only)** | 4.5 | 2.8 *(Canvas2D stalls on 200k-cell heatmap & dense footprints)* | 3.5 | **4.8** *(pure Canvas2D)* | **4.7** | **3.88** |
| **E. KLineChart `v10.1` Alone (Canvas2D Overlays Only)** | **5.0** | 2.6 *(Canvas2D CPU bottleneck)* | 3.8 | **4.8** | 3.9 | **3.88** |
| **F. PixiJS `v8.23` Custom Financial Engine** | **5.0** *(MIT)* | 4.2 *(scene-graph overhead vs raw instancing)* | 4.5 *(build everything)* | 4.2 | 2.5 *(must build all chart/axis/scale math)* | **4.18** |
| **G. Apache ECharts `v6.1`** | **5.0** | 2.8 | 2.2 *(BI-oriented)* | 4.5 | 4.8 | **3.65** |
| **H. d3fc (`v15.2`)** | **5.0** | 3.5 | 2.5 | 4.0 | 1.5 *(2+ yrs dormant)* | **3.33** |
| **I. TradingVue.js (`v1.0`)** | **5.0** | 2.0 | 2.5 | 3.0 | 1.0 *(Vue 2, dormant)* | **2.73** |
| **J. TradingView Charting Library** | **DQ** *(Proprietary)* | — | — | — | — | **DQ** |
| **K. HQChart** | **DQ** *(Conflicting `用户协议.txt`)* | — | — | — | — | **DQ** |

---

## Recommendation + Rationale

### Primary Recommendation: **Hybrid Adopt + Targeted Build (Option A)**
1. **Adopt `tradingview/lightweight-charts` (`v5.3.0`, Apache-2.0)** as the primary price/time coordinate engine, multi-pane manager (`IPaneApi`), standard **Bar** renderer, and crosshair/scale interaction layer. Retain the Apache-2.0 `NOTICE` attribution cleanly (documented in About + non-intrusive attribution link per `NOTICE`).
2. **Build a Drawing & Study Overlay Layer on LWC `ISeriesPrimitive` / `ICustomSeriesPaneView`:** Owns Allegedly's clean-room **Drawing** tools (trendline, ray, fib, channel, rectangle, anchored VWAP/profile, text), snap-to-OHLC magnet logic, undo/redo command history, and JSON/TOML serialization — completely decoupled from any vendor UI.
3. **Build a Synchronized Raw WebGL2 Order-Flow Canvas Layer:** A pointer-transparent `<canvas>` aligned over LWC's main pane, driven by `timeScale().subscribeVisibleLogicalRangeChange` and `series.priceToCoordinate()`, rendering:
   - **Order-book Liquidity Heatmaps** via instanced colored quads (or 2D data texture),
   - **Footprint Bars** & **TPO Profiles** via instanced quads + a **pre-baked DPR-snapped monospace glyph atlas** (benchmarked vs MSDF in Spike S02),
   - Automatic runtime frame-time watchdog that falls back to a decimated Canvas2D mode if a Linux system silently drops to software GL.
4. **Build MTF & Order-Flow Aggregation in Rust Core (Non-Negotiable #7):** All tick-to-bar resampling (time, tick, volume, range bars), RTH/ETH session calendars, fixed-point `i64` tick math, Volume Profile, Footprint imbalance math, and TPO brackets execute in Rust and stream only visible/buffered viewport slices to the chart.

### Concrete Fallbacks
- **Fallback 1 (Base Chart Pivot — Triggered if Spike S01 favors KLineChart's built-in drawings or exposes LWC v5 pane/scale friction):** Swap Lightweight Charts v5 for **KLineChart `v10.1.1` (Apache-2.0)**, keeping the identical Rust core and synchronized WebGL2 order-flow layer.
- **Fallback 2 (Renderer Unification Pivot — Triggered if Spike S01/S02 reveals >1 px coordinate drift or resize desync between LWC Canvas2D and the overlay WebGL2 canvas on WKWebView/WebKitGTK):** Promote the **Spike S02 WebGL2 engine** into a unified single-canvas financial renderer (Option C), reusing the exact same Rust data contract and Drawing data model.

---

## Pre-Declared Phase 2 Spike Hypotheses & Pass/Fail Thresholds (`S01`–`S03`)

### Spike S01 — Base Chart & Synchronized Overlay Benchmark (`spikes/S01-chart-base/`)
- **Hypothesis:** Lightweight Charts `v5.3.0` (vs KLineChart `v10.1.1` head-to-head) can render `100,000` OHLCV bars across 3 stacked panes with 50 interactive Drawing primitives and `30 Hz` live bar updates while keeping a synchronized overlay canvas locked within `<= 0.5 CSS px` drift.
- **Pass Thresholds:**
  - Sustained pan/zoom frame time: `p95 <= 16.6 ms` (`>= 60 fps`), `p99 <= 25.0 ms` on macOS Apple Silicon (`WKWebView`) and Linux (`WebKitGTK`) / Chromium.
  - GC pauses: `0` main-thread stalls `> 33 ms` across a 60-second continuous pan + `30 Hz` update loop.
  - Initial `100k` bar load + first paint: `< 250 ms`.
  - Overlay alignment drift between base chart bars and overlay canvas: `0` physical px at rest; `<= 1` animation frame lag during rapid wheel zoom.
- **Pivot Trigger:** If LWC fails alignment drift or pan/zoom budget while KLineChart passes -> execute **Fallback 1**. If both fail dual-canvas sync -> execute **Fallback 2**.

### Spike S02 — High-Density Order-Flow GPU Renderer & Text Strategy (`spikes/S02-orderflow-gpu/`)
- **Hypothesis:** A raw **WebGL2** instanced renderer with a pre-baked DPR monospace glyph atlas outperforms Canvas2D by `>= 4×` and sustains `60 fps` on `100` visible Footprint Bars × `50` price tick levels (`5,000` cells / `10,000` numbers) layered over a `1,000 × 200` Liquidity Heatmap (`200,000` cells) updating at `30 Hz`.
- **Benchmarks Compared:** (1) Canvas2D `fillText`, (2) Canvas2D pre-baked glyph sprites, (3) WebGL2 instanced quads + DPR bitmap glyph atlas, (4) WebGL2 instanced quads + MSDF atlas (`msdfgen`/`tiny-sdf`).
- **Pass Thresholds:**
  - `p95 frame time <= 16.6 ms` (`>= 60 fps`) and `p99 <= 25.0 ms` at `2×` HiDPI (`>= 2560×1440` logical viewport).
  - Crisp, artifact-free legibility of `9–12 px` tabular digits at both `1×` and `2×` DPR (verified via screenshot inspection).
  - GPU texture/buffer VRAM `< 64 MB` per chart instance.
  - Watchdog detects simulated software-GL (`frame time > 25 ms` over 30 frames) and transitions cleanly to decimated Canvas2D fallback with zero crash.
- **Pivot Trigger:** If WebGL2 bitmap atlas is blurry under fractional zoom (1.25×/1.5×) while MSDF stays crisp and meets `<= 16.6 ms`, select MSDF; if raw WebGL2 proves simpler and faster than dual-canvas sync, evaluate **Fallback 2**.

### Spike S03 — OffscreenCanvas + Worker Split & Cross-Engine Parity (`spikes/S03-offscreen-worker/`)
- **Hypothesis:** Running geometry/decimation packing in a Worker (or Rust backend) with main-thread WebGL2 draw is strictly safer and lower-latency than `transferControlToOffscreen()` WebGL2 in a Worker, especially on Linux `WebKitGTK`.
- **Pass Thresholds:**
  - `0` WebView crashes or Wayland `Error 71` errors over 5 minutes of continuous live updates + repeated window resize/maximize on macOS `WKWebView` and Linux `WebKitGTK` (X11 + Wayland).
  - Main-thread JS compute time per frame `<= 6.0 ms` (`p95`) when geometry packing runs off-main-thread.
  - Runtime feature detector accurately distinguishes native WebGL2 vs disabled `OffscreenCanvas` WebGL2 without throwing uncaught exceptions.
- **Pivot Trigger:** If `OffscreenCanvas` Worker WebGL2 crashes or returns `null` on Linux `WebKitGTK` (expected per findings), permanently lock the architecture to **off-main-thread geometry packing + main-thread WebGL2 draw** in Phase 3 ADR.

---

## Inferences

- **Fixed-point precision safety:** Because both Lightweight Charts and KLineChart accept JS `number` (`f64`, exact integer precision up to $2^{53} - 1 \approx 9 \times 10^{15}$), passing display prices converted from Rust `i64` tick counts right before rendering introduces zero financial calculation error so long as **no order sizing, P&L, tick rounding, or imbalance math ever reads back from chart floats**.
- **Single-developer / AI-agent velocity (`[[Assumptions]]` A06):** Building a production-grade interactive chart axis/inertia/touch/zoom engine from scratch consumes months of subtle edge-case bugs; adopting LWC v5 for the coordinate/bar shell while focusing custom GPU engineering strictly on the order-flow layer maximizes time-to-MVP (`v0.1` Charting + Order-Flow).
- **WebGPU timing:** Given WebKitGTK `2.54.3` still lacks WebGPU on Linux, designing our shader math cleanly (simple instanced vertex + fragment shaders) makes a future WebGPU backend trivial without penalizing Linux today.

---

## Risks

1. **Dual-Canvas Synchronization Jitter (High Impact / Medium Likelihood):** Syncing a transparent WebGL2 canvas over LWC's internal Canvas2D during rubber-band scrolling or fractional-DPR resizing can cause 1-frame visual lag. *Mitigation:* Measure exact pixel drift in **Spike S01**; keep **Fallback 2** (unified WebGL2 renderer) ready.
2. **Linux WebKitGTK Silent Software WebGL & Masked GPU Info (High Impact / High Likelihood):** WebKitGTK reports `"Apple GPU"` on Linux and silently uses software rasterization when hardware EGL/DMA-BUF fails [R01-S27]. *Mitigation:* Implement a frame-time watchdog + explicit user rendering toggle (`Auto / WebGL2 / Canvas2D`).
3. **Lightweight Charts Attribution Misunderstanding (Medium Impact / Low Likelihood):** Stripping the Apache-2.0 `NOTICE` attribution or TradingView link would violate Lightweight Charts' license terms [R01-S02]. *Mitigation:* Preserve `NOTICE` in distribution, document attribution in About dialog, and verify exact UI compliance in `[[R09-Legal-Licensing]]`.
4. **Custom Drawing Suite Scope Creep (Medium Impact / Medium Likelihood):** LWC provides zero built-in drawings; building 30+ TradingView drawings upfront would stall v0.1. *Mitigation:* Ship 6 core drawings in v0.1 (Trendline, Horizontal Ray, Price Level, Rectangle/Zone, Fib Retracement, Text/Measure) via a clean declarative primitive architecture.

---

## Open Questions

1. **UNVERIFIED — Exact real-world frame times on Linux Wayland + NVIDIA (`WebKitGTK 2.52+/2.54+`) for our target `200k`-cell heatmap + `5k`-cell footprint scene:** Cannot be determined from docs alone; **Human/Spike Verification:** Run `spikes/S01-chart-base/` and `spikes/S02-orderflow-gpu/` on Linux X11 + Wayland VMs (and NVIDIA hardware if available) and record `p50/p95/p99` frame times and `Error 71` logs.
2. **UNVERIFIED — Exact LWC `v5.3` `priceToCoordinate` / `timeToCoordinate` timing relative to internal `requestAnimationFrame` paint:** Does `subscribeVisibleLogicalRangeChange` fire before or after LWC paints its own canvas? **Human/Spike Verification:** Measure single-frame video capture / canvas timestamp delta in Spike S01.
3. **Attribution UX preference:** Should Lightweight Charts' built-in `attributionLogo` stay visible in the chart corner, or should Allegedly satisfy the `NOTICE` link via a clean status-bar / About attribution (to be cross-checked with `[[R09-Legal-Licensing]]`)?

---

## What Would Change This Decision

- **Pivot to KLineChart `v10` (Fallback 1):** If Spike S01 shows KLineChart matches LWC's `60 fps` pan/zoom smoothness on `100k` bars while cutting v0.1 Drawing tool effort by `> 50%`.
- **Pivot to Custom Unified WebGL2 Engine (Fallback 2):** If Spike S01/S02 proves dual-canvas sync cannot stay within `<= 1` frame lag during rapid zoom/pan across `WKWebView` and `WebKitGTK`.
- **Pivot to WebGPU-First:** Only if Linux `WebKitGTK` ships stable hardware WebGPU across major distros (Ubuntu LTS, Fedora, Arch) OR if R02 pivots the desktop shell to Electron/Chromium with stable Linux X11 + Wayland WebGPU across AMD/Intel/NVIDIA.

---

## Sources

| Source ID | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|
| `R01-S01` | `tradingview/lightweight-charts` GitHub repo & releases (`v5.3.0`, `plugins-2026-11-13`) | https://github.com/tradingview/lightweight-charts | 2026-11-24 | GitHub API (`repos/...`, `/releases`) + npm registry | High |
| `R01-S02` | Lightweight Charts `LICENSE`, `NOTICE`, and `README.md` attribution terms | https://github.com/tradingview/lightweight-charts/blob/master/NOTICE | 2026-11-24 | Read `LICENSE`, `NOTICE`, `README.md` via GitHub API | High |
| `R01-S03` | Lightweight Charts Canvas Rendering Target & Docs | https://tradingview.github.io/lightweight-charts/docs | 2026-11-24 | Read primary docs | High |
| `R01-S04` | Lightweight Charts Plugin Development (Primitives & Custom Series) | https://tradingview.github.io/lightweight-charts/docs/plugins/intro | 2026-11-24 | Read primary docs (`read_url_content`) | High |
| `R01-S05` | Lightweight Charts v5 Panes API Documentation | https://tradingview.github.io/lightweight-charts/docs/panes | 2026-11-24 | Read primary docs (`read_url_content`) | High |
| `R01-S06` | TradingView Product Comparison (Lightweight Charts vs Advanced Charts) | https://www.tradingview.com/charting-library-docs/latest/product-comparison | 2026-11-24 | Read primary docs (`read_url_content`) | High |
| `R01-S07` | `tradingview/charting_library` GitHub repository visibility check | https://github.com/tradingview/charting_library | 2026-11-24 | GitHub API returned HTTP 404 (private repo) | High |
| `R01-S08` | TradingView Advanced Charts & Trading Platform Introduction / License Restrictions | https://www.tradingview.com/charting-library-docs/latest/introduction | 2026-11-24 | Read primary docs (`read_url_content`) | High |
| `R01-S09` | `klinecharts/KLineChart` GitHub repo, `LICENSE` (Apache-2.0), & `v10.1.1` release | https://github.com/klinecharts/KLineChart | 2026-11-24 | GitHub API (`repos`, `LICENSE`, releases) + npm registry | High |
| `R01-S10` | `klinecharts/pro` GitHub repo & `LICENSE` (Apache-2.0) | https://github.com/klinecharts/pro | 2026-11-24 | GitHub API (`repos`, `LICENSE`, `README.md`) | High |
| `R01-S11` | KLineChart v10 Official Introduction Documentation | https://klinecharts.com/en-US/guide/introduction | 2026-11-24 | Read primary docs (`read_url_content`) | High |
| `R01-S12` | KLineChart `v10.0.0` Release Notes & Overlay/Pane API Docs | https://github.com/klinecharts/KLineChart/releases/tag/v10.0.0 | 2026-11-24 | GitHub API release body + `klinecharts.com` v10 docs search | High |
| `R01-S13` | `tvjsx/trading-vue-js` GitHub repo & maintenance status | https://github.com/tvjsx/trading-vue-js | 2026-11-24 | GitHub API (`repos`, releases, `README.md`) | High |
| `R01-S14` | `ScottLogic/d3fc` GitHub repo & release history | https://github.com/ScottLogic/d3fc | 2026-11-24 | GitHub API (`repos`, releases, `README.md`) + npm | High |
| `R01-S15` | `apache/echarts` GitHub repo (`v6.1.0`, Apache-2.0) | https://github.com/apache/echarts | 2026-11-24 | GitHub API (`repos`, releases) + npm registry | High |
| `R01-S16` | `highfestiva/finplot` GitHub repo (Python/PyQtGraph reference) | https://github.com/highfestiva/finplot | 2026-11-24 | GitHub API (`repos`, `README.md`) | High |
| `R01-S17` | `jones2000/HQChart` GitHub repo, `LICENSE`, `README.md`, & npm (`hqchart`) | https://github.com/jones2000/HQChart | 2026-11-24 | GitHub API (`repos`, `LICENSE`, `README.md`) + npm | High |
| `R01-S18` | HQChart Custom User Agreement (`用户协议.txt` — unilateral termination & PRC clauses) | https://github.com/jones2000/HQChart/blob/master/%E7%94%A8%E6%88%B7%E5%8D%8F%E8%AE%AE.txt | 2026-11-24 | Read raw file via GitHub API | High |
| `R01-S19` | MDN `OffscreenCanvas` API & WebGL2 Worker compatibility (Chrome/Edge/Safari/WKWebView) | https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas | 2026-11-24 | Read primary MDN docs (`read_url_content`) + caniuse/Safari 17.4 verification | High |
| `R01-S20` | WebGPU cross-engine status (`WKWebView` Safari 26+, `WebView2`, Linux `WebKitGTK` unsupported) | https://github.com/gpuweb/gpuweb/wiki/Implementation-Status | 2026-11-24 | Web search synthesis cross-checked with WebKitGTK releases (`R01-S24`) | Medium |
| `R01-S21` | `pixijs/pixijs` GitHub repo (`v8.23.0`, MIT, WebGPU + WebGL2) | https://github.com/pixijs/pixijs | 2026-11-24 | GitHub API (`repos`, releases, `README.md`) + npm | High |
| `R01-S22` | `regl-project/regl` (`v2.1.1`, MIT) — verified WebGL 1 only in `lib/webgl.js` | https://github.com/regl-project/regl/blob/master/lib/webgl.js | 2026-11-24 | Read `package.json` & `lib/webgl.js` via GitHub API | High |
| `R01-S23` | `gfx-rs/wgpu` GitHub repo (`v30.0.2`, MIT/Apache-2.0) | https://github.com/gfx-rs/wgpu | 2026-11-24 | GitHub API (`repos`, `LICENSE.APACHE`, `LICENSE.MIT`) + crates.io | High |
| `R01-S24` | WebKitGTK Releases Index (`webkitgtk-2.54.3`) | https://webkitgtk.org/releases/ | 2026-11-24 | Read primary releases index (`read_url_content`) | High |
| `R01-S25` | `Chlumsky/msdfgen` GitHub repo (`v1.13.1`, MIT) | https://github.com/Chlumsky/msdfgen | 2026-11-24 | GitHub API (`repos`, releases) | High |
| `R01-S26` | `mapbox/tiny-sdf` GitHub repo (`v2.3.0`, BSD-2-Clause) | https://github.com/mapbox/tiny-sdf | 2026-11-24 | GitHub API (`repos`, releases) | High |
| `R01-S27` | WebKitGTK `AllowWebGLInWorkers` off by default, NVIDIA/Wayland `Error 71`, & masked `"Apple GPU"` | https://github.com/forge-ci/kernal-api/pull/272 | 2026-11-24 | GitHub API PR search + WebKitGTK/Tauri docs search | Medium |
