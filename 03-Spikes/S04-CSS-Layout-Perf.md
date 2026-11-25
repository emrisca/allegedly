---
title: S04 — High-Frequency DOM Ladder & Time & Sales Rendering Benchmark (React vs Imperative DOM vs Canvas2D)
type: spike
status: verified
phase: Phase 2
owner: charts-ui
updated: 2026-11-24
verdict: PASS
code_refs:
  - spikes/S04-css-layout-perf/package.json
  - spikes/S04-css-layout-perf/src/App.tsx
  - spikes/S04-css-layout-perf/src/bookStore.ts
  - spikes/S04-css-layout-perf/src/index.css
  - spikes/S04-css-layout-perf/bench.mjs
  - spikes/S04-css-layout-perf/bench-results.json
---

# S04 — High-Frequency DOM Ladder & Time & Sales Rendering Benchmark

## Verdict: `PASS`

1. **Clear Winner — Canvas2D DOM Ladder + Time & Sales (`PASS`):** At both `30 Hz` (`500` Book Level & trade deltas/s) and **`60 Hz` (`2,000` deltas/s — `2×` the `[[Constraints]]` #5 target)**, the Canvas2D strategy fed by Zustand's non-React transient subscription achieved **`60.2 fps`**, **`0` stalls `> 20 ms`**, **`0` React commits**, **`0.00 ms` `LayoutDuration`**, **`0.00 ms` `RecalcStyleDuration`**, **`36` total DOM nodes**, and **`0.30 ms` p50 / `0.40 ms` p95** per-frame render CPU time (`86.38 ms` total V8 `ScriptDuration` over `5,000 ms` = **`1.7%` of main-thread budget**).
2. **Why Both DOM Strategies Lose Headroom Under Composition:** Although Apple M2's single-core speed kept standalone `react-state` and `imperative-dom-contained` at `60.2 fps` with `0` stalls `> 20 ms`, CDP `Performance.getMetrics` exposed massive hidden browser layout & style recalculation overhead:
   - At `60 Hz` (`2,000` deltas/s over `5 s`):
     - **`canvas2d`:** `0.00 ms` layout + `0.00 ms` style + `86.38 ms` script = **`86.38 ms`** total main-thread work (`36` DOM nodes).
     - **`react-state` (Tailwind CSS v4):** `208.05 ms` layout + `74.40 ms` style + `140.42 ms` script = **`422.87 ms`** total (**`4.9×` higher**, `300` React commits, `1,684` DOM nodes, `+1.54 MB` heap churn).
     - **`imperative-dom-contained` (`contain: strict`):** `268.36 ms` layout + `86.46 ms` style + `100.92 ms` script = **`455.74 ms`** total (**`5.3×` higher**, `3,686` DOM nodes, `0` React commits). Even with CSS containment, mutating `textContent` and depth-bar widths on `100` ladder rows + `50` Time & Sales rows every frame forces `301` Chromium layout & style passes per 5 seconds.
3. **Full Process-Tree Memory (`PASS`):** Entire 6-process headless Brave tree measured **`263.13 MB` RSS** (under the `< 300 MB` idle RAM budget even on Chromium) with `0` errors.
4. **Platform Note (`UNVERIFIED`):** Measured on macOS Apple M2 via headless Brave (`2×` DPR). Linux `WebKitGTK` and Windows `WebView2` layout costs (where WebKitGTK DOM mutation overhead is typically heavier than Blink) remain **`UNVERIFIED (macOS Chromium host only)`** — strengthening the case for locking the hot-path **DOM Ladder** and **Time & Sales** to Canvas2D.

---

## Hardware & Environment

| Field | Measured Value |
|---|---|
| Host OS / Hardware | macOS `26.6.2` (Build `25G83`), Apple M2 (8 cores), `8 GB` RAM |
| Browser Harness | Brave Browser `157.1.99.57` (Chromium headless, `--enable-precise-memory-info --force-device-scale-factor=2`), viewport `1280 × 900`, `2×` DPR |
| Frontend Stack | `react 19.3.1` (`MIT`), `zustand 5.1.0` (`MIT`), `tailwindcss 4.3.5` (`MIT`), `@tailwindcss/vite 4.3.5`, Vite `8.3.8`, TypeScript `5.8.3` |
| Workload | `100` visible **DOM Ladder** Book Levels (bid volume-at-price, resting bid depth bar + size, fixed-point price tick, resting ask size + depth bar, ask volume-at-price) + `50` visible **Time & Sales** rows (`timestamp`, fixed-point price, quantity, **Aggressor** color). All prices & sizes stored in fixed-point `Int32Array`s (`TICK_SIZE = 0.25`, `[[Constraints]]` #7). |

---

## Reproducible Run Commands

```bash
cd /Users/abelmora/Documents/Obsidian/Allegedly/spikes/S04-css-layout-perf
pnpm install
pnpm build
pnpm bench
```

Output artifact: `spikes/S04-css-layout-perf/bench-results.json` (run timestamp `2026-11-25T05:14:02Z`, `0` page errors).

---

## Measured Results (`5,000 ms` per Strategy, `2×` DPR)

| Strategy | Rate (Hz) | Deltas/s | Effective FPS | Frame p50 / p95 / p99 / Max (ms) | Render CPU p50 / p95 (ms) | Stalls `> 20 ms` / `> 33 ms` | CDP Layout (ms) | CDP RecalcStyle (ms) | CDP Script (ms) | Total Main-Thread (ms) | React Commits | DOM Nodes | Heap Delta (MB) |
|---|---:|---:|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| `react-state` | `30` | `500` | `60.2` | `16.7 / 16.8 / 16.8 / 16.9` | `0.0 / 0.1` *(excl. React)* | `0 / 0` | `124.55` | `51.81` | `107.51` | `283.87` | `150` | `1,688` | `+2.38` |
| `imperative-dom-contained` | `30` | `500` | `60.2` | `16.6 / 17.2 / 17.6 / 17.9` | `0.2 / 0.3` | `0 / 0` | `106.63` | `40.20` | `48.06` | `194.89` | `0` | `2,583` | `+0.31` |
| **`canvas2d`** | **`30`** | **`500`** | **`60.2`** | **`16.6 / 17.0 / 17.1 / 17.2`** | **`0.3 / 0.4`** | **`0 / 0`** | **`0.00`** | **`0.00`** | **`41.77`** | **`41.77`** | **`0`** | **`36`** | **`+0.77`** |
| `react-state` | `60` | `2,000` | `60.2` | `16.7 / 17.2 / 17.5 / 17.6` | `0.0 / 0.1` *(excl. React)* | `0 / 0` | `208.05` | `74.40` | `140.42` | `422.87` | `300` | `1,684` | `+1.54` |
| `imperative-dom-contained` | `60` | `2,000` | `60.2` | `16.8 / 17.3 / 17.7 / 17.8` | `0.2 / 0.4` | `0 / 0` | `268.36` | `86.46` | `100.92` | `455.74` | `0` | `3,686` | `+0.53` |
| **`canvas2d`** | **`60`** | **`2,000`** | **`60.2`** | **`16.8 / 17.0 / 17.6 / 17.7`** | **`0.3 / 0.4`** | **`0 / 0`** | **`0.00`** | **`0.00`** | **`86.38`** | **`86.38`** | **`0`** | **`36`** | **`+0.69`** |

*Note on `react-state` `renderCpuMs`: `0.0–0.1 ms` measures only the store trigger call; the actual React reconciliation + commit cost appears in CDP `ScriptDuration` (`140.42 ms`), `LayoutDuration` (`208.05 ms`), and `RecalcStyleDuration` (`74.40 ms`).*

Full headless Brave process tree RSS: **`263.13 MB`** (`6` processes).

---

## Pass/Fail Assessment Against `R02` Thresholds

| `R02` Threshold | Measured (`canvas2d` @ `60 Hz` / `2,000` deltas/s) | Status |
|---|---|---|
| Smooth **DOM Ladder** at `>= 30` updates/s (tested at `60` updates/s = `2×` target) | **`60.2 fps`** (`p50 = 16.8 ms`, `p95 = 17.0 ms`, `p99 = 17.6 ms`, `max = 17.7 ms`) | **PASS** *(p95 `17.0 ms` reflects headless Chromium's `16.67 ms` VSync + `0.3 ms` timer quantization; zero missed VSyncs)* |
| `0` GC / frame stalls `> 20 ms` | **`0` stalls `> 20 ms`**, **`0` stalls `> 33 ms`** | **PASS** |
| Zero React reconciliation on hot path | **`0` React commits**, **`0.00 ms` LayoutDuration**, **`0.00 ms` RecalcStyleDuration** | **PASS** |
| Low DOM footprint & full process-tree RAM `< 300 MB` | `36` DOM nodes; `263.13 MB` full 6-process Brave RSS | **PASS** |
| Cross-platform `WKWebView` / `WebView2` / `WebKitGTK` | macOS Brave host only | **UNVERIFIED (macOS Chromium host only)** |

---

## Phase 3 ADR Recommendations

1. **Lock `Canvas2D` + Zustand Transient Subscriptions for Hot-Path DOM Ladder & Time & Sales (`R02` Fallback 3 Promoted to Default):** Eliminating `100%` of browser `LayoutDuration` (`208–268 ms → 0.00 ms`) and `RecalcStyleDuration` (`74–86 ms → 0.00 ms`) cuts total main-thread work by **`4.9×–5.3×`** at `60 Hz` and protects composite workspaces (e.g., 4 live charts + 2 DOM Ladders + Time & Sales on Linux `WebKitGTK` and older laptops) from layout thrash. Pair Canvas2D with an accessible ARIA summary/keyboard-navigable focus model and JetBrains Mono (`OFL-1.1`) tabular digits.
2. **Use `ui-sdk` (`@ui-sdk/react` & `@ui-sdk/core`, `Apache-2.0`) + Tailwind CSS v4 (`4.3.x`) for All Non-Hot-Path UI Chrome:** Per repo root `AGENTS.md`, adopt `ui-sdk` + Tailwind v4 on React 19+ for DOM Ladder header controls, order-quantity presets, bracket-order (`OCO`) toggles, account/instrument pickers, blotters, modals, command palette, and schema-driven settings trees. Strictly keep React state and Tailwind class recalculations **out** of the `30–60 Hz` Canvas2D book cell & chart frame loops.
3. **Retain Fixed-Point `Int32Array` / `BigInt64Array` Store Buffers:** `bookStore.ts` proved zero-object-allocation ring buffers and flat typed arrays integrate seamlessly with Zustand transient listeners and align 1:1 with the `S02` packed binary IPC wire format (`[[Constraints]]` #7).
