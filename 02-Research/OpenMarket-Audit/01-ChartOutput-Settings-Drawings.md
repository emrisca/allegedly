---
title: "OpenMarket Audit 01: TradingView-Clean UI Simplification, Frontend Inconsistency Audit & Under-the-Hood Charting/Drawing Mechanics"
track: "02-Research / OpenMarket-Audit"
status: "completed"
owner: "MV Charts & UI (research-charts, research-shell-ui)"
updated: "2026-11-27"
code_refs:
  - "apps/desktop/src/panels/chart-panel.tsx"
  - "apps/desktop/src/drawings/drawing-engine.ts"
  - "apps/desktop/src/drawings/render-drawings.ts"
  - "apps/desktop/src/render/webgl2-orderflow-overlay.ts"
  - "apps/desktop/src/render/hysteresis.ts"
  - "apps/desktop/src/components/left-drawing-rail.tsx"
  - "apps/desktop/src/components/chart-context-menu.tsx"
  - "apps/desktop/src/components/right-icon-rail.tsx"
  - "apps/desktop/src/components/indicators-dialog.tsx"
  - "apps/desktop/src/components/replay-bar.tsx"
  - "apps/desktop/src/panels/watchlist-panel.tsx"
  - "apps/desktop/src/panels/dom-ladder-panel.tsx"
  - "apps/desktop/src/App.tsx"
  - "apps/desktop/src/styles.css"
  - "packages/ui-chrome/src/chart-settings.ts"
  - "packages/ui-chrome/src/chart-settings-dialog.tsx"
  - "packages/ui-chrome/src/chrome-toolbar.tsx"
  - "packages/ui-chrome/src/workspace-host.tsx"
  - "packages/ui-chrome/src/status-bar.tsx"
---

# OpenMarket Audit 01: TradingView-Clean UI Simplification, Frontend Inconsistency Audit & Under-the-Hood Charting/Drawing Mechanics

> [!IMPORTANT]
> **Product Direction Anchor (2026-11-27)**: Allegedly's UI must be **simple, consistent, and effortless like TradingView** — zero visual clutter, zero leaked developer telemetry, and **NOT** an overwhelming chrome-heavy interface like OpenMarket. Every recommendation in this audit is filtered through three goals:
> 1. **Bring the right under-the-hood mechanics** (drawing precision, multi-pane charting, WebGL2 orderflow, clean auto-generated indicator `Inputs`/`Style` dialogs) while **explicitly rejecting** OpenMarket's UI bloat.
> 2. **Strip, unify, and fix every concrete UI inconsistency** across Allegedly's current desktop frontend.
> 3. **Remove TradingView free-tier restrictions cleanly** (unlimited indicators, intraday/tick replay, multi-chart splits, custom timeframes, local alerts, saved layouts, volume profile/footprint/TPO) without adding chrome clutter.

> [!NOTE]
> **Clean-Room & IP Hygiene Notice (per `02-Research/R09-Legal-Licensing.md`)**: All observations from OpenMarket's public documentation (24 pages retrieved `2026-11-27`) are written independently in our own words with zero verbatim text and zero third-party brand/indicator/theme names copied as Allegedly names.

---

## Question

How should Allegedly combine **(1)** the best under-the-hood drawing, rendering, and declarative study mechanics observed in OpenMarket, **(2)** a rigorous cleanup of Allegedly's current frontend UI inconsistencies and debug clutter, and **(3)** full removal of TradingView free-tier paywall limits — while keeping the visible interface **TradingView-clean, consistent, fast (60 fps, React strictly off hot paths), Apache-2.0 `$0` core, local-first, and targeting macOS + Windows first**?

---

## Findings (Facts with Citations)

### 1. Concrete UI Inconsistency & Clutter Audit of Allegedly's Current Frontend

Direct inspection of Allegedly's desktop UI files (`OA01-C01`..`OA01-C19`) reveals **four structural causes** behind the inconsistent, cluttered feel: (A) duplicate buttons performing identical actions, (B) raw engineering/QA telemetry exposed in primary user chrome, (C) fragmented hardcoded color/radius/sizing tokens ignoring `styles.css` variables, and (D) broken/lying controls that fail to do what their icons imply.

#### 1.1 Duplicate & Conflicting Controls (Strip / Consolidate)

| Redundant Action | Current Duplicate Locations in Allegedly | Exact Citations | Fix (TradingView-Clean Target) |
| :--- | :--- | :--- | :--- |
| **Provenance / Status (5×!)** | (1) Left `A` monogram circle in Tier 2 toolbar; (2) right-cluster gradient avatar circle; (3) right-cluster lightbulb-plus icon; (4) `RightIconRail` layers icon; plus (5) non-clickable decorative `A` badge at bottom of `RightIconRail`. | `chrome-toolbar.tsx` (lines 504, 838, 902), `right-icon-rail.tsx` (lines 64, 114) | **Keep 1 entry**: move Provenance & Diagnostics into a single subtle status popover or App Menu item. Remove all 4 duplicate icons. |
| **Symbol Search / `Cmd+K` (3×)** | (1) `NQ1!` pill on Tier 2 left; (2) `+` "Compare" circle icon right next to it (opens the exact same `Cmd+K` switcher, does NOT compare!); (3) Magnifying-glass-spark icon on Tier 2 right. | `chrome-toolbar.tsx` (lines 517, 608, 848) | **Keep 1**: clean symbol search button on top-left (plus optional real Compare overlay later). Remove duplicate search icon on right. |
| **Layout Mode Toggle (3×)** | (1) Tier 1 top-right grid icon; (2) Tier 2 right-cluster pane icon; (3) Inside `DESK ▾` workspace dropdown. Worse: toggling `focus <-> dockview` remounts `ChartPanel` and wipes drawings! | `chrome-toolbar.tsx` (lines 379, 741, 796), `App.tsx` | **Keep 1**: single clean TV-style **Layout Split** icon (`1×1`, `1×2`, `2×1`, `2×2`) on top-right. Lift chart/drawing state so switching layouts never remounts or wipes state. |
| **Paper OMS / Trade (2× side-by-side)** | `Trade` pill AND bright-white `PAPER / SIM` hero pill sit immediately next to each other and **both** call `onToggleTrade?.()`. | `chrome-toolbar.tsx` (lines 921–943) | **Collapse to 1** subtle `Paper` drawer toggle (or right-rail tab). Remove the bright promo-style hero pill. |
| **Crosshair Cursor on Left Rail (2×)** | Top crosshair icon AND a *second* mysterious diamond-between-bars button below the 7 drawing slots that also calls `onSelectTool("cursor")`. | `left-drawing-rail.tsx` (lines 107, 175) | **Delete the duplicate button** at line 175. Keep only the top Crosshair tool. |
| **Scale Controls (`log` / `auto`) (2×)** | Bottom status bar (`log`, `auto`) AND a floating bottom-right gear popover inside `ChartPanel` (which also duplicates overlay toggles `FP`/`VP`/`TPO`). | `status-bar.tsx` (lines 117–143), `chart-panel.tsx` (lines 2850–2970) | **Keep 1 clean bottom-right scale cluster** (`% | log | auto` + gear) aligned directly under the price axis, matching TradingView. |

#### 1.2 Leaked Developer / QA Telemetry in Primary User Chrome (Strip Immediately)

| Clutter Item | Where It Currently Appears | Exact Citation | Clean Replacement |
| :--- | :--- | :--- | :--- |
| `LIVE_ARMED = false` badge + crimson `KILL` button | Permanently pinned in the top tab strip (Tier 1), even during pure charting/analysis. | `chrome-toolbar.tsx` (lines 359–374) | Hide `KILL` unless Paper/Live trading panel is open with active working orders; move `LIVE_ARMED` into Diagnostics/Settings. |
| `BOOK: LIVE`, `PROVENANCE`, `OFFLINE-SIM · rev 42 · drops 0`, `UPDATES_ON_BOOT: false` | Crammed into the main bottom chart footer next to `1D 5D 1M 3M 6M YTD 1Y All`. | `status-bar.tsx` (lines 86–116) | Bottom bar shows **only**: Quick date ranges (`1D..All`), live clock/timezone, and `% | log | auto` scale toggles. Put connection dot + diagnostics in a click-to-inspect popover. |
| `Verify SV-09` button & `SHA-256:a1b2c3d4 ✓ BIT-EXACT` | Exposed on the user-facing Bar Replay toolbar beside Play/Pause/Step. | `replay-bar.tsx` (lines 87–105) | Keep Replay Bar strictly TV-clean: `Play/Pause`, `Step`, `Speed`, `Scrubber`, `Jump to Date`, `×`. Move SV-09 checksum verification to Dev/Diagnostics menu. |
| `"Toggle Deterministic Replay Bar (SV-09)"`, `"rev 42"` | Visible in `Cmd+K` command palette and workspace menus. | `chrome-toolbar.tsx` (lines 565–597, 789) | Use plain trader language: `"Bar Replay"`, `"Reset Layout"`. Strip internal spec IDs (`SV-01`, `SV-09`, `ALG2`, `rev N`). |
| `"TIME & SALES (ALG2)"` | Painted onto Canvas2D DOM panel header. | `dom-ladder-panel.tsx` (line 116) | Plain `"Time & Sales"`. |
| Unexplained yellow `S` pill on every watchlist row | Hardcoded beside every symbol in Watchlist. | `watchlist-panel.tsx` (line 84) | Remove or show only a clean tooltip-backed data-source indicator when relevant. |

#### 1.3 Design-Token, Layout & Primitive Inconsistencies (Unify Immediately)

1. **CSS Tokens Defined but Ignored**: `apps/desktop/src/styles.css` defines 9 semantic variables (`--allegedly-bg`, `--allegedly-chrome`, `--allegedly-canvas`, `--allegedly-elevated`, `--allegedly-hover`, `--allegedly-active`, `--allegedly-border`, `--allegedly-text`, `--allegedly-muted`), yet components hardcode raw Tailwind hexes everywhere:
   - **8 different background hexes**: `#0c0d11`, `#0e1015`, `#0f1014`, `#101217`, `#14171f`, `#15171e`, `#16181f`, `#181a20`.
   - **13 different border hexes**: `#1c1e26`, `#1d202b`, `#22252e`, `#232733`, `#242833`, `#262934`, `#262a35`, `#292d38`, `#2a2d38`, `#2a2e39`, `#2a2f3d`, `#2c3140`, `#343a4c`.
   - **6 different muted-text hexes**: `#6f7687`, `#787e8d`, `#868c9b`, `#8c93a4`, `#959baa`, `#9aa1b2`.
   - **4 conflicting green/red pairs**: `#26a69a`/`#ef5350` (Watchlist), `emerald-400`/`rose-400` (Toolbar & Context Menu), `#34d399`/`#f87171` (DOM prices), `#22c55e`/`#ef4444` (DOM tape).
2. **Asymmetric Rail Geometry**: `LeftDrawingRail` is `44px` (`w-11`, `left-drawing-rail.tsx:96`) while `RightIconRail` is `40px` (`w-10`, `right-icon-rail.tsx:76`). Unify both to a crisp `44px` (or `42px`) standard with identical `32px` hit targets.
3. **Mixed Border Radii in One Bar**: Tier 2 toolbar mixes `rounded-full`, `rounded-[6px]`, `rounded-md`, and `rounded`, while popovers mix `rounded-lg` and `rounded-xl`. Standardize to 3 radii: `4px` (buttons/chips), `6px` (menus/popovers), `10px` (modals).
4. **Mixed UI Primitives**: `ChromeToolbar` uses `@ui-sdk/react` (`Button`, `Toolbar`, `Dialog`, `Command`) for some controls, but hand-rolls `<button>` + `fixed inset-0 z-30` backdrops for dropdowns (`tfMenuOpen`, `workspaceMenuOpen`, `moreMenuOpen`) and `ChartContextMenu` (which can clip past the viewport bottom/right edges!). Standardize all cold-path menus, popovers, dialogs, and tabs on `@ui-sdk/react` primitives with proper viewport collision flipping and keyboard navigation.

#### 1.4 Broken / Misleading Controls & Core Charting Bugs (Fix Immediately)

| ID | Severity | Verified Defect in Allegedly | Exact Citation |
| :--- | :--- | :--- | :--- |
| **BUG-01** | **P0** | **Magnet snaps to the newest candle, not the cursor's candle**: `collectMagnetTargets()` reads only `activeCandles[activeCandles.length - 1]`, pulling historical drawing anchors toward the latest bar's price. | `chart-panel.tsx` (`collectMagnetTargets`) |
| **BUG-02** | **P0** | **Placed drawings cannot be selected, moved, styled, or deleted individually**: `pointerSurfaceRef` sets `pointer-events-none` whenever `activeTool === "cursor"` (lines 2947–2952). Zero hit-testing, zero selection handles, zero anchor/body drag, zero `Delete`/`Backspace`, zero Quick-Style Bar, zero per-drawing Settings modal. | `chart-panel.tsx` (lines 2945–2954), `render-drawings.ts` |
| **BUG-03** | **P0** | **Drawings vanish when an anchor scrolls off-screen or into future whitespace**: `drawVectorDrawing()` maps via LWC `timeToCoordinate()` (returns `null` off-edge) and `toAnchorFromPointer()` clamps future clicks to `activeBarTimeSec`. | `render-drawings.ts`, `chart-panel.tsx` |
| **BUG-04** | **P0** | **Drawings wiped on reload or layout switch**: `DrawingEngine` lives inside `ChartPanel` `useRef` and its `.atanalysis.toml` save/load methods are never wired; toggling `focus <-> dockview` remounts `ChartPanel` and deletes all drawings. | `chart-panel.tsx`, `drawing-engine.ts`, `App.tsx` |
| **BUG-05** | **P0** | **Oscillators crammed onto the price pane**: Non-overlay studies ignore LWC v5 `chart.addPane()`, squeezing into the bottom 28% of the price pane with hidden Y-axes. | `chart-panel.tsx` (`studyOverlays`) |
| **BUG-06** | **P0** | **Broken/placeholder math in existing drawing tools**: `long_position`/`short_position` hardcode `"R:R 2.00"` with no 3rd SL handle; `bars_pattern`/`ghost_feed` draw a fake `Math.sin` wave; `fib_wedge` falls through to `fib_spiral`; `fib_time_zone`/`cyclic_lines` use screen pixels instead of bar counts; `fixed_range_vp`/`anchored_vwap` run `O(N)` JS loops every paint frame. | `render-drawings.ts` |
| **BUG-07** | **P0** | **~18 dead/unwired settings in `ChartSettingsDialog`**: Checkboxes across `symbol`, `scales`, `canvas`, `trading`, and the entire `events` tab save to localStorage but do nothing in `ChartPanel`. | `chart-settings.ts`, `chart-settings-dialog.tsx`, `chart-panel.tsx` |
| **BUG-08** | **P1** | **Fake / misleading chrome triggers**: `Watchlist ▾` is a dead `<span>`; `Indicators ▾` chevron opens a modal instead of a dropdown; `Candle Style` button only toggles Monochrome vs Classic color instead of chart types; `Object Tree` opens the `studies` tab of `PaperOmsPanel`; `Compare (+)` just switches symbols. | `watchlist-panel.tsx`, `chrome-toolbar.tsx`, `App.tsx`, `chart-context-menu.tsx` |
| **BUG-09** | **P1** | **Missing `Shift` drawing constraints & awkward rail flyouts**: `Shift` does nothing while placing lines/boxes/ellipses; left-rail flyouts require hitting a tiny 10 px chevron instead of TradingView's effortless hover/click flyout. | `chart-panel.tsx`, `left-drawing-rail.tsx` |
| **BUG-10** | **P1** | **Single-bar bar-only Footprint**: `WebGl2OrderflowOverlay` paints footprint bars only on `activeBarTimeSec` with no text/number glyph atlas. | `webgl2-orderflow-overlay.ts`, `chart-panel.tsx` |

---

### 2. OpenMarket Audit Filtered Through the Simplicity Lens: What to Adopt Under the Hood vs. What to Reject

Auditing all 24 OpenMarket documentation pages (`OA01-S01`..`OA01-S24`) shows why OpenMarket feels overwhelming to traders: it exposes too many competing visual surfaces, bespoke card skins, and deep multi-page settings rails. However, several of its **under-the-hood engineering mechanics** are genuinely strong and make a **simple, TradingView-clean UI** dramatically better.

| OpenMarket Capability (`OA01-S01`..`OA01-S24`) | Verdict for Allegedly | How Allegedly Should Surface It (TradingView-Clean, Zero Clutter) |
| :--- | :---: | :--- |
| **3-Mode Magnet (`Off` / `Weak` / `Strong` + `Ctrl/Cmd` temporary flip) & `Shift` 45°/square/axis lock** (`OA01-S21`) | **ADOPT** | Exact TradingView left-rail magnet icon (click toggles, tiny menu switches Weak/Strong). Zero extra chrome. |
| **Full drawing lifecycle: hit-test, anchor/body drag, `Ctrl/Cmd`-drag clone, arrow nudge, Floating Quick-Style Bar, 3-scope auto-save (`This chart / Layout / Global`), timeframe visibility mask** (`OA01-S21`) | **ADOPT** | Floating Quick-Style Bar appears **only** while a drawing is selected (just like TradingView: color, thickness, line style, settings gear, lock, trash). Auto-saves silently to local `.atanalysis.toml`. |
| **3-way rail buttons (hover flyout, click arm, double-click lock) & Bulk Clear popover with live counts** (`OA01-S21`) | **ADOPT** | Makes the left rail effortless and removes the clunky 10 px chevron hunt. Bulk trash shows `"Remove N drawings / Remove M indicators"`. |
| **Missing core TV drawing tools: Channels (4), Pitchforks (4), Gann (4), Anchored viewport Text/Note, Left/Right Arrow Marks, `Ctrl/Cmd+V` image paste** (`OA01-S21`) | **ADOPT** | Fits cleanly inside existing 7 left-rail category drawers — **skip** OpenMarket's 10 decorative stylized arrows and emoji bloat. |
| **Declarative indicator outputs (`line`, `histogram`/`bar`, `area`, `candle`, gated `shape`, `range`/`fill`, `box`/`segment`, `z`-order, `displacement_bars`) & LWC v5 multi-pane (`addPane`)** (`OA01-S01`..`OA01-S05`) | **ADOPT (Engine)** | Completely invisible in chrome — indicators simply render cleanly in proper panes with a standard TV-style legend row (`Name · Values · Eye · Gear · ×`). |
| **Typed indicator parameter manifest (`int`, `number`, `bool`, `choice`, `color`, `source`, `timeframe`, `session`) + auto-derived `Style` tab with `@param` deduplication + reset-to-default dot + dead-setting build lint** (`OA01-S12`..`OA01-S20`) | **ADOPT (Simplified)** | Render as a **clean TradingView-style 2-tab modal (`Inputs` + `Style`, plus optional `Visibility`)** — **NOT** OpenMarket's sprawling multi-page left-rail mega-dialog! Keep chart-click `Pick` for `time`/`price` (great for Anchored VWAP). |
| **GPU-accelerated Price Canvases (Multi-bar Footprint with MSDF text, Volume Profile `session`/`range`/`visible`, TPO, optional Liquidity Heatmap)** (`OA01-S07`) | **ADOPT (Clean Entry)** | Access Footprint/TPO directly from the **Chart Type** dropdown and Volume Profile/Heatmap from **Indicators** — zero floating debug toggle chips (`FP`/`VP`/`TPO`) cluttering the chart canvas! |
| **3-layer non-destructive Theme Stack (Dark/Light mode -> Semantic Palette -> Per-chart overrides that survive theme switches)** (`OA01-S23`) | **ADOPT (Minimal)** | Simple Dark / Light toggle + 3–4 clean Allegedly palettes (`Obsidian Dark`, `Classic Dark`, `Light Paper`, `East-Asia Red-Up`) backed by ONE unified CSS + Canvas token table. |
| **12 ornate HUD card "looks" (`scanlines`, `phosphor`, `cockpit`, `window` fake titlebars, `cover`, `broadsheet`)** (`OA01-S11`) | **REJECT** | Pure visual noise. If a study needs a summary readout, render **one** clean, minimal, translucent theme-matching corner table/readout that respects safe areas. |
| **Sub-chart `panel.pie`, `panel.tiles`, multi-instance terminal widget sprawl & 16-chart `4×4` walls in default chrome** (`OA01-S06`, `OA01-S24`) | **REJECT (Defer)** | Keep workspace simple like TradingView: `1×1`, `1×2`, `2×1`, `2×2` chart grid splits + clean collapsible right sidebar (Watchlist, Object Tree, Alerts, optional DOM/Paper panel). |
| **15+ exotic chart types & 10 stylized arrows in primary pickers** (`OA01-S21`, `OA01-S22`) | **TRIM** | Ship the **10 essential chart types** traders actually use: Candles, Hollow Candles, Bars (OHLC), Line, Area, Baseline, Heikin Ashi, Step Line, plus native Footprint and TPO. |

---

### 3. Removing TradingView Free-Tier Limits Cleanly (Zero Extra Chrome)

Abel's core goal is *"a nice simple UI like TradingView that I can just use and have it work so I can chart and do analysis and be happy with no limits on what TradingView free subscription is limiting me on."* Every paywalled TradingView restriction maps to an unobtrusive, first-class capability in Allegedly:

| TradingView Free-Tier Restriction | Allegedly Free Local-First Implementation | UI Surface (Zero Clutter) |
| :--- | :--- | :--- |
| **Max 2 indicators per chart** | **Unlimited built-in & custom Luau indicators**, with real LWC v5 multi-pane oscillators (`chart.addPane()`) and per-indicator `Inputs` / `Style` settings. | Standard top-bar `Indicators` modal + inline per-pane legend (`Eye / Gear / ×`). |
| **Bar Replay locked to Daily+ only** | **Unlimited intraday & tick-level Bar Replay** on any timeframe (`1m`, `5m`, `15m`, etc.) with Play, Pause, Step, Speed (`1x..Max`), and Jump-to-Date. | Clean TV-style compact floating Replay bar (no `SV-09` / `SHA-256` dev badges). |
| **Single chart only (no split view)** | **Multi-chart split layouts (`1×1`, `1×2`, `2×1`, `2×2`)** with 4 clean sync checkboxes (`Symbol`, `Interval`, `Crosshair`, `Time`) in one tiny dropdown. | Single Layout Grid icon on top-right toolbar. |
| **1 saved layout / limited templates** | **Unlimited local chart layouts, drawing templates & indicator presets** auto-saved locally to `.atworkspace.toml` / `.atanalysis.toml`. | Single Workspace name dropdown on top-right (`Save`, `Load`, `New`, `Export`). |
| **Max 1 active alert** | **Unlimited local price, trendline/drawing, and indicator alerts** with desktop notification & optional sound. | Top-bar `Alert` button + right-click `"Add alert at price"` + clean Alerts drawer tab. |
| **No custom timeframes & capped bar history** | **Any custom interval** (`2m`, `3m`, `10m`, `45m`, `2h`, `12h`, `3D`, or custom N-min/hr) + full local tick/bar history from Rust vault. | Clean Timeframe strip (`1m 5m 15m 1h 4h D W`) + dropdown with custom interval input. |
| **Volume Profile, Footprint & TPO paywalled** | **Free GPU-accelerated Volume Profile (VRVP, Fixed-Range drawing, Session), Multi-Bar Footprint (with MSDF numbers), and TPO**. | Chart Type dropdown (`Footprint`, `TPO`) + Indicators (`Volume Profile`) + Drawing rail (`Fixed Range VP`). |
| **Ads, upgrade nags, capped watchlists** | **Zero ads, zero upsell pills, unlimited local watchlists & symbols**, 100% local-first `$0` core. | Clean Watchlist sidebar with real list switcher dropdown (`Watchlist ▾`). |

---

### 4. Spec Precision Matrix: Coordinate Anchoring & Hot-Path Classification

Even with a radically simpler UI, Allegedly preserves strict financial precision (`PriceE9` / integer `priceTick: bigint`) and strict **hot-path isolation** (React `@ui-sdk/react` stays 100% off 60 fps canvas rendering and 30+ Hz market ticks):

| Surface | Coordinate Anchoring | Off-Screen & Future Behavior | Hot-Path Tier | React Allowed on Tick/Hover? |
| :--- | :--- | :--- | :--- | :---: |
| **Base Series (Candles, Hollow, OHLC Bars, Heikin Ashi, Line, Area, Baseline)** | `timeSec: UTCTimestamp` + `PriceE9 -> f64` view projection | LWC viewport culling + 5k/6k hysteresis (`hysteresis.ts`) | **Tier 1 (60 fps)**: LWC v5 native / `ICustomSeriesPaneView` | **NO** |
| **GPU Orderflow Canvases (Multi-bar Footprint, TPO, Volume Profile, optional Heatmap)** | `logicalIndex` (bar column) + integer `priceTick: bigint` (bucket step) | Visible logical range + visible tick band culling; Rust aggregates buckets | **Tier 1 (60 fps GPU)**: Shared offscreen **WebGL2** instanced quads + **MSDF glyph atlas**, blitted synchronously in `ISeriesPrimitive.draw()` | **NO** |
| **User Drawings (Lines, Channels, Fibs, Pitchforks, Gann, Positions, Shapes)** | `AnchorPoint { timeSec: number; barOffset?: number; priceTick: bigint }` | Resolve `timeSec -> logicalIndex` (extrapolating linearly into future whitespace); Cohen–Sutherland clip to viewport rect so lines **never** vanish off-edge | **Tier 2 (60 fps sync)**: Synchronous `ISeriesPrimitive` Canvas2D pass + per-frame AABB/segment hit-test index | **NO** (React mounts Floating Quick Bar only on selection change) |
| **Anchored Text / Notes (Viewport-Pinned)** | Viewport-relative `[pctX, pctY]` inside safe pane rect | Stays fixed in viewport regardless of pan/zoom | **Tier 2 (60 fps sync)**: Synchronous `ISeriesPrimitive` Canvas2D pass | **NO** |
| **Fixed-Range VP & Anchored VWAP Drawings** | `[startTimeSec, endTimeSec]` -> Rust `PriceE9` bucket/VWAP query | Cached in typed arrays; recomputed **only** on anchor move or new bar inside range (never per paint frame) | **Tier 1/2**: Rust/worker compute -> WebGL2/Canvas2D cached draw | **NO** |
| **OHLC Legend, Study Readouts & Minimal Corner Readout** | Top-left pane header / corner safe area | Never shifts candles or Y-axis | **Tier 3 (Imperative DOM)**: Pre-mounted DOM nodes mutated via `textContent` on rAF | **NO** |
| **Top Bar, Left/Right Rails, Quick-Style Bar, Chart/Indicator Settings, Object Tree, Watchlist, Replay Controls** | Standard desktop shell layout | Viewport-aware `@ui-sdk/react` popovers & modals | **Tier 4 (Cold UI Chrome)**: React (`@ui-sdk/react`) | **Cold path only** |

---

### 5. Prioritized Implementation Plan (P0 / P1 / P2)

> [!TIP]
> Sequencing prioritizes **making the UI immediately clean, consistent, and trustworthy (P0)** before layering deeper under-the-hood features (P1–P2). Targets **macOS + Windows first** (portable WebGL2 + Rust + `TransportAdapter`).

#### P0 — Strip Clutter, Unify Visual System & Fix Core Drawing/Chart Breakage
1. **TradingView-Clean Chrome Declutter & Token Unification**:
   - Delete duplicate controls: keep **1** Symbol Search (`Cmd+K`), **1** Layout button, **1** `Trade/Paper` toggle, **1** Crosshair tool on left rail, **1** bottom-right `% | log | auto` scale cluster, and **0** duplicate Provenance/avatar/lightbulb icons.
   - Strip all dev/QA telemetry from user chrome: remove `LIVE_ARMED = false`, always-on `KILL`, `BOOK: LIVE`, `PROVENANCE`, `OFFLINE-SIM · rev N · drops 0`, `UPDATES_ON_BOOT: false`, `Verify SV-09`, `SHA-256`, `(ALG2)`, and raw `S` badges from default views (move diagnostics into one clean App Status / Diagnostics modal).
   - Enforce **one** semantic design-token layer (`styles.css` CSS variables + mirrored Canvas/WebGL2 `ThemeTokens`) across every component — eliminating the 8 mismatched backgrounds, 13 border hexes, 4 green/red pairs, mixed radii, and `44px` vs `40px` rail mismatch.
   - Replace hand-rolled dropdown backdrops and viewport-clipping `ChartContextMenu` with `@ui-sdk/react` primitives.
   - Prune or wire all ~18 dead switches in `ChartSettingsDialog` (consolidate into a clean TradingView 4-tab modal: `Symbol`, `Status line`, `Scales`, `Appearance`, adding `Trading`/`Alerts` tabs only for live-wired controls).
2. **Make Drawings Actually Work (`BUG-01`..`BUG-04`, `BUG-06`)**:
   - Replace `pointer-events-none` on `pointerSurfaceRef` with a unified capture-phase hit-test router so drawings in cursor mode can be clicked, hovered, selected, anchor-dragged, body-dragged, `Ctrl/Cmd`-cloned, arrow-nudged, and `Delete`-removed without blocking LWC pan/zoom on misses.
   - Add a clean TradingView-style **Floating Quick-Style Bar** (color swatches, width, dash, gear, lock, delete) and **Drawing Settings Modal** (`Coordinates` in exact `timeSec`/`priceTick`, `Style`, `Text`, `Visibility`).
   - Fix Magnet to snap to the **candle under the cursor** with `Off | Weak | Strong` + momentary `Ctrl/Cmd` flip, and add `Shift` 45°/square/axis constraints.
   - Fix off-screen & future projection via logical bar index + viewport clipping; lift `DrawingEngine` out of `ChartPanel` and auto-persist to `.atanalysis.toml` so drawings survive reloads and layout changes.
   - Fix placeholder math in `long_position`/`short_position` (real 3-anchor Entry/TP/SL + R:R), `fib_wedge`, `bars_pattern`, `fib_time_zone`/`cyclic_lines` (bar-count intervals), and cache `fixed_range_vp`/`anchored_vwap` outside the paint loop.
3. **True Multi-Pane Oscillators (`BUG-05`)**:
   - Mount non-overlay studies in dedicated LWC v5 panes (`chart.addPane()`) with visible price axes, draggable pane heights, and clean per-pane inline legends (`Eye / Gear / ×`).

#### P1 — TradingView Free-Tier Parity (Unlimited Analysis, Clean UX)
4. **Clean Chart Types + Unified Dark/Light Theme System**:
   - Replace the monochrome color-toggle button with a clean **Chart Type** dropdown: Candles, Hollow Candles, Bars (OHLC), Line, Area, Baseline, Heikin Ashi, Step Line, plus native **Footprint** and **TPO** modes.
   - Ship Dark + Light base modes + 4 clean Allegedly palettes (`Obsidian Dark`, `Classic Dark`, `Light Paper`, `East-Asia Red-Up`) with non-destructive per-chart overrides.
5. **Under-the-Hood Declarative Indicator Manifest -> Clean 2-Tab (`Inputs` / `Style`) Dialog**:
   - Add typed parameters (`int`, `number`, `bool`, `choice`, `color`, `time`/`price` with chart-click `Pick`, `source` + blends, `timeframe`, `session`) and expanded plot outputs (`line`, `histogram`/`bar`, `area`, `candle`, gated `shape`, `range`/`fill`, `box`/`segment`, `z`-order, `displacement_bars`) with `@param` style deduplication, modified-dot reset, and build-time dead-setting lint — rendered in a clean, minimal TV-style `Inputs | Style | Visibility` modal.
6. **Multi-Bar GPU Footprint, Full TPO & Multi-Span Volume Profile (`BUG-10`)**:
   - Add a pre-baked **MSDF glyph atlas** to `WebGl2OrderflowOverlay` for crisp 60 fps multi-bar Footprint numbers, diagonal/stacked imbalances, TPO letters/IB/single prints, and Session/Fixed-Range/Visible Volume Profile (removing the floating `FP`/`VP`/`TPO` chart pills in favor of standard Chart Type / Indicators / Drawing entry points).
7. **Real Object Tree, Complete Core Drawings & 3-Way Rail UX (`BUG-08`, `BUG-09`)**:
   - Wire `Object Tree` to a real `@ui-sdk/react` hierarchical layer list (Studies + Drawings: visibility, lock, reorder, rename, delete).
   - Upgrade `LeftDrawingRail` to hover-flyout, click-arm, double-click-lock, and live-count Bulk Clear popover.
   - Add missing core tools: Channels (4), Pitchforks (4), Gann (4), Anchored viewport Text/Note, Left/Right Arrow Marks, and `Ctrl/Cmd+V` image paste.
   - Fix `Watchlist ▾` to switch/create unlimited local watchlists, and add custom timeframe entry in the timeframe dropdown.

#### P2 — Clean Multi-Chart Splits & Power-User Polish
8. **Multi-Chart Splits (`1×1`, `1×2`, `2×1`, `2×2`) & Unlimited Local Layouts**:
   - Add a single top-right Layout Split picker with 4 sync checkboxes (`Symbol`, `Interval`, `Crosshair`, `Time`), shared offscreen WebGL2 context pooling (avoiding WebView WebGL context caps), and clean `.atworkspace.toml` layout switching/export.
9. **Unlimited Local Alerts & Rebindable Keyboard Shortcuts**:
   - Wire unlimited local price/drawing/indicator alerts into the top-bar `Alert` button + right-click menu + right-rail Alerts tab; add a searchable shortcut reference/rebinding modal in Settings.

---

### Options Table (Weighted Criteria)

| Criterion (Weight) | Option A: Copy OpenMarket's Full UI & Chrome Model | Option B (Recommended): TradingView-Clean Shell + Under-the-Hood Engine Mechanics (LWC v5 Multi-Pane, WebGL2 MSDF, Clean Declarative `Inputs`/`Style`) | Option C: Minimal Patch on Current UI (Keep Existing Chrome & Ad-Hoc Forms) |
| :--- | :---: | :---: | :---: |
| **UI Simplicity & Consistency — Zero Clutter (30%)** | 1.5 / 5 (Overwhelming chrome, 12 HUD skins, deep multi-page dialogs) | **5 / 5** (Single token set, 0 duplicate controls, 0 leaked telemetry, instant TV familiarity) | 2 / 5 (Retains 8 bg hexes, duplicate buttons, dev badges) |
| **Removing TradingView Free-Tier Limits (25%)** | 4.5 / 5 (Capable, buried in complex UI) | **5 / 5** (Unlimited studies, intraday/tick replay, splits, alerts, custom TFs, VP/Footprint/TPO cleanly surfaced) | 2.5 / 5 (No multi-pane, broken drawings, 1 chart type) |
| **60 fps / Zero-React-Hot-Path Performance (20%)** | 4 / 5 | **5 / 5** (LWC v5 + shared WebGL2 MSDF + Rust `PriceE9` + imperative DOM legends) | 2.5 / 5 (JS paint-loop VP/VWAP, single-bar footprint) |
| **Maintainability & Time-to-Ship on macOS + Windows (15%)** | 2 / 5 (Huge surface area to build/maintain) | **4.5 / 5** (Focused scope; reuses LWC v5, WebGL2 primitive, `DrawingEngine` ticks, `@ui-sdk/react`) | 3.5 / 5 (Quick hacks, high UI tech debt) |
| **FOSS / `$0` Core / Local-First Compliance (10%)** | 5 / 5 | **5 / 5** (Apache-2.0 stack, local `.atanalysis.toml` / `.atworkspace.toml`) | 5 / 5 |
| **Weighted Total** | **3.18 / 5.00** | **4.93 / 5.00** | **2.75 / 5.00** |

---

### Recommendation + Rationale

**Adopt Option B: A strict TradingView-clean, single-token shell powered under the hood by LWC v5 multi-pane, WebGL2 MSDF orderflow canvases, fixed-point interactive drawings, and a simplified declarative `Inputs`/`Style` study schema.**

1. **Directly resolves user pain first**: Stripping the 5× duplicated Provenance triggers, 3× layout/search duplicates, leaked engineering badges (`LIVE_ARMED`, `UPDATES_ON_BOOT`, `Verify SV-09`, `SHA-256`, `ALG2`), 8 conflicting background hexes, and dead settings immediately transforms Allegedly from a developer prototype into a calm, cohesive charting app.
2. **Delivers the real value of OpenMarket without its UX weight**: Users get rock-solid drawing physics (cursor-bar 3-mode magnet, `Shift` constraints, hit-testing/handles/quick bar, logical-index projection, auto-save), multi-pane indicators with zero-boilerplate `Inputs`/`Style` dialogs, and GPU-accelerated Footprint/TPO/Volume Profile — all tucked cleanly behind familiar TradingView entry points.
3. **Eliminates every TradingView free-tier wall cleanly**: Unlimited indicators, intraday/tick Bar Replay, `1×1`..`2×2` splits, unlimited layouts/alerts/watchlists, custom timeframes, and orderflow tools work out of the box locally for `$0` without adding a single noisy toolbar strip.

---

### Inferences

- **Inference 1**: Most of Allegedly's visual fragmentation happened because `ChromeToolbar`, `LeftDrawingRail`, `RightIconRail`, `StatusBar`, `WatchlistPanel`, `ChartSettingsDialog`, and `ChartContextMenu` were authored in separate passes with raw Tailwind hex values rather than referencing `styles.css` CSS variables or shared `@ui-sdk/react` component wrappers. Enforcing semantic utility classes (e.g., `bg-[var(--bg-chrome)]`) and a lint rule banning raw hexes in TSX will prevent drift from returning.
- **Inference 2**: Extracting headless controllers (`DrawingController`, `StudyPaneManager`) out of the ~3,000-line `chart-panel.tsx` monolith before adding multi-chart splits (`2×2`) will avoid state duplication and prevent the current bug where layout toggles remount the chart and wipe drawings.
- **Inference 3**: Sharing one pooled offscreen WebGL2 context across `1×2` / `2×2` chart splits avoids hitting WKWebView / WebView2 WebGL context limits while keeping memory overhead low on laptops.

---

### Risks

| Risk | Likelihood | Impact | Mitigation |
| :--- | :---: | :---: | :--- |
| **Over-engineering chrome again during P1/P2** | Medium | High | Apply a hard "TradingView simplicity gate" on every UI PR: every visible button must map to one unique trader action, zero engineering IDs (`SV-*`, `ALG2`, `rev`) in user-facing copy, zero dead settings. |
| **LWC v5 `timeToCoordinate` returning `null` for off-screen/future drawing anchors** | High | High | Resolve via `timeSec -> logicalIndex` map + `logicalToCoordinate()` linear extrapolation + Cohen–Sutherland viewport clipping. |
| **React re-renders sneaking into 60 fps drawing drag / hover / tick paths** | Medium | High | Keep drag/hit-test/crosshair/HUD mutations strictly in refs/Canvas/WebGL2; React mounts Quick-Style Bar only when `selectedDrawingId` changes. |
| **Hidden diagnostics needed by power users/developers** | Low | Low | Do not delete SV-09 determinism verification or provenance data — simply relocate them out of the main chart chrome into a single optional `Diagnostics` modal accessible from the app menu or `Cmd+K`. |

---

### Open Questions

1. **Default Layout Chrome**: Should Allegedly boot into a pure TradingView-style single chart + collapsible right Watchlist drawer (with DOM Ladder & Paper Trading tucked cleanly as optional tabs on the right rail), reserving Dockview free-form docking for an explicit `"Advanced Workspace"` toggle? (Recommended default: **Yes**.)
2. **Chart-Settings Scope**: Should the `Trading` and `Events` tabs in `ChartSettingsDialog` be hidden completely until their features are wired, leaving a crisp 4-tab dialog (`Symbol`, `Status line`, `Scales`, `Appearance`)? (Recommended default: **Yes — zero dead switches**.)
3. **WebGL2 MSDF Blit Benchmark**: Verify `ctx2d.drawImage(offscreenWebGL2Canvas)` frame times at 4K/Retina DPR on macOS WKWebView and Windows WebView2 across a `2×2` split before committing to shared-context blitting vs direct stacked WebGL2 canvas.

---

### What Would Change This Decision

- **Trigger 1**: If users explicitly ask for multi-monitor free-form window tearing / 9–16 chart walls in v1.0, promote `3×3` / `4×4` grids and floating Dockview windows from P2/deferred to P1 (with automatic lightweight-mode degradation).
- **Trigger 2**: If LWC v5 `chart.addPane()` shows layout or scaling bugs under 4+ indicator panes on Windows WebView2, evaluate stacked synchronized LWC instances as a fallback.
- **Trigger 3**: If `ctx2d.drawImage(offscreenWebGL2Canvas)` exhibits >4 ms readback stalls on Retina/4K with MSDF text, switch `WebGl2OrderflowOverlay` to a direct stacked transparent `<canvas>` synchronized on `subscribeVisibleLogicalRangeChange` + rAF.

---

### Sources Table

#### External Primary Sources (OpenMarket Public Documentation)

| ID | Source URL | Retrieved Date | How Verified | Confidence |
| :--- | :--- | :--- | :--- | :---: |
| `OA01-S01` | https://openmarket.xyz/wrun/presentation/style-anything | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S02` | https://openmarket.xyz/wrun/presentation/overview | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S03` | https://openmarket.xyz/wrun/presentation/plotting | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S04` | https://openmarket.xyz/wrun/presentation/styling | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S05` | https://openmarket.xyz/wrun/presentation/drawing-objects | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S06` | https://openmarket.xyz/wrun/presentation/cards-frames-panels | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S07` | https://openmarket.xyz/wrun/presentation/price-canvases | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S08` | https://openmarket.xyz/wrun/presentation/marks-spans-rays | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S09` | https://openmarket.xyz/wrun/presentation/legend | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S10` | https://openmarket.xyz/wrun/presentation/labels-and-tooltips | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S11` | https://openmarket.xyz/wrun/presentation/hud-and-hover-cards | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S12` | https://openmarket.xyz/wrun/settings/overview | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S13` | https://openmarket.xyz/wrun/settings/kinds | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S14` | https://openmarket.xyz/wrun/settings/options | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S15` | https://openmarket.xyz/wrun/settings/layout | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S16` | https://openmarket.xyz/wrun/settings/presets | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S17` | https://openmarket.xyz/wrun/settings/style-page | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S18` | https://openmarket.xyz/wrun/settings/sessions-and-units | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S19` | https://openmarket.xyz/wrun/settings/picks-and-lanes | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S20` | https://openmarket.xyz/wrun/settings/checks | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S21` | https://openmarket.xyz/learn/charting/drawing-tools | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S22` | https://openmarket.xyz/learn/charting | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S23` | https://openmarket.xyz/learn/charting/themes-and-appearance | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |
| `OA01-S24` | https://openmarket.xyz/learn/charting/workspaces-and-widgets | 2026-11-27 | Direct HTTP fetch (`read_url_content`) & full inspection | High |

#### Internal Allegedly Codebase & Research Sources

| ID | Local File Path | Retrieved Date | How Verified | Confidence |
| :--- | :--- | :--- | :--- | :---: |
| `OA01-C01` | `apps/desktop/src/panels/chart-panel.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C02` | `apps/desktop/src/drawings/drawing-engine.ts` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C03` | `apps/desktop/src/drawings/render-drawings.ts` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C04` | `apps/desktop/src/render/webgl2-orderflow-overlay.ts` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C05` | `apps/desktop/src/render/hysteresis.ts` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C06` | `apps/desktop/src/components/left-drawing-rail.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C07` | `apps/desktop/src/components/chart-context-menu.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C08` | `apps/desktop/src/components/right-icon-rail.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C09` | `apps/desktop/src/components/indicators-dialog.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C10` | `apps/desktop/src/App.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C11` | `apps/desktop/src/styles.css` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C12` | `packages/ui-chrome/src/chart-settings.ts` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C13` | `packages/ui-chrome/src/chart-settings-dialog.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C14` | `packages/ui-chrome/src/chrome-toolbar.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C15` | `packages/ui-chrome/src/workspace-host.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C16` | `packages/ui-chrome/src/status-bar.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C17` | `apps/desktop/src/components/replay-bar.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C18` | `apps/desktop/src/panels/watchlist-panel.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-C19` | `apps/desktop/src/panels/dom-ladder-panel.tsx` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-R01` | `02-Research/R01-Charting-Rendering.md` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-R09` | `02-Research/R09-Legal-Licensing.md` | 2026-11-27 | Direct source read (`client_view_file`) | High |
| `OA01-R10` | `02-Research/R10-UX-Teardown-Control-Model.md` | 2026-11-27 | Direct source read (`client_view_file`) | High |
