---
title: "Allegedly — UX & Sovereignty Principles"
status: verified
owner: ux-teardown
updated: 2026-11-25
code_refs: []
---

# UX & Sovereignty Principles

This charter codifies the non-negotiable user experience, financial integrity, and user-sovereignty laws of **Allegedly**, derived from the Phase 1 order-flow mathematical specification ([`02-Research/R05-Orderflow-Profile-Tooling.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R05-Orderflow-Profile-Tooling.md)) and the TradingView vs. MotiveWave UX teardown ([`02-Research/R10-UX-Teardown-Control-Model.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R10-UX-Teardown-Control-Model.md)). Every architectural track, PR, and release gate is evaluated against these principles and the testable **Sovereignty Checklist** in Section 3.

---

## 1. The Eight Core Principles

### P1. Local-First User Sovereignty (Zero Cloud Walls, Zero Telemetry Lock-In)
Allegedly is an instrument owned by the trader, not a SaaS rental funnel.
- **No Account Wall**: The application installs, cold-starts (`< 2 s`), loads offline sample/historical data, replays L1/L2/L3 tick files, and executes all 8 order-flow and profile tools with **zero outbound network requests** when no live [`Provider`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md) or [`Broker`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md) is enabled.
- **Zero Dark Patterns**: No artificial limits on indicators-per-chart, panes-per-layout, alerts, or saved templates. No unsolicited telemetry, analytics beacons, or forced cloud synchronization.
- **User-Owned Open Storage**: All historical market caches (`.atdepth`, Parquet/DuckDB/SQLite) and user configurations live in documented, unencrypted (except OS-keychain credentials) local directories that the user can back up, script, query, or delete at will.

### P2. Speed of Thought (`<= 3` Keystrokes, `60 fps` Canvas, Zero Blocking Modals)
In active order-flow execution, UI latency is financial slippage.
- **`<= 3` Keystrokes to Everything**: Every action, [`Instrument`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), timeframe, [`Study`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), [`Drawing`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), [`Layout`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), and study parameter is reachable via the universal Command Palette (`Cmd/Ctrl+K`, supporting `@symbol`, `/study`, `>setting`, `#template`) or direct canvas hotkeys (`Alt+1..9` study templates).
- **Ban on Blocking Configuration Modals**: Allegedly prohibits MotiveWave-style 7-to-14-tab blocking modal dialogs [R10-S09, R10-S15]. All settings mutate live at `60 fps` through either the **Floating Contextual Micro-Toolbar (Tier 1, $\le 5$ controls)** or the **Non-Blocking Right Property Inspector (`320 px`, Tier 2)** without obscuring price action.
- **Hard Frame-Time Determinism**: Panning, zooming, crosshair synchronization, Visible-Range Volume Profile (VRVP) recomputation (`< 0.25 ms` via Dyadic Segment Trees), and `60 Hz` DOM Ladder updates never allocate on a garbage-collected heap or exceed a `16.6 ms` frame budget on `100k+` bars.

### P3. Progressive Disclosure Without Hiding Power (The 3-Tier Compression Law)
Simplicity of appearance must never be purchased by amputating institutional capabilities.
- **Tier 1 — Essential Surface ($\le 5$ controls)**: Selecting any [`Study`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), [`Drawing`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), or [`Footprint Bar`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md) header exposes its 5 highest-frequency operational controls inline in a floating micro-toolbar (e.g., Footprint Display Mode, Row Tick Size, Imbalance %, Naked POC toggle, Totals toggle).
- **Tier 2 — Power Surface ($12\text{--}25$ controls)**: The Right Inspector Drawer organizes every deep mathematical parameter (3-tier imbalances, absorption delta filters, TPO sub-intervals, IB extensions, study-on-study chaining, cross-timeframe overrides, timeframe visibility pills) into 4 invariant tabs (`Parameters | Style | Timeframes & Session | Alerts`) with an instant search box and a **`Modified Only` filter pill**.
- **Tier 3 — Design-Token Consolidation**: Redundant per-widget font pickers, cell border spinboxes, and margin controls are consolidated into semantic theme tokens (`theme.toml`).

### P4. Settings-as-Code & Deterministic 5-Level Inheritance
Every configuration state in Allegedly is a deterministic, human-readable, Git-diffable artifact.
- **5-Level Property Cascade**: Settings resolve predictably through:
  $$\texttt{Global Defaults} \longrightarrow \texttt{Workspace} \longrightarrow \texttt{Study/Layout Template} \longrightarrow \texttt{Chart Pane} \longrightarrow \texttt{Study/Drawing Instance}$$
- **Explicit Delta Overrides**: Each level serializes **only the properties overridden from its parent**, visually badged in the Inspector with a 1-click `Reset to Inherited` and `Promote to Template` action.
- **Canonical TOML/JSON Portability**: Workspaces (`.atworkspace.toml`), analysis layers (`.atanalysis.toml`), study templates (`template.toml`), themes (`theme.toml`), and keymaps (`keymap.toml`) serialize with deterministically sorted keys and validate against a published JSON Schema.

### P5. Unmistakable Data Provenance & Honest Quantitative Disclosure
A terminal must never lie—or remain conveniently ambiguous—about the fidelity of the data driving an order-flow signal.
- **Mandatory 5-Tier Provenance Badges**: Every order-flow chart and study legend displays its machine-verified [`Provenance`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md) tier:
  1. `EXACT: L3-MBO` (Order-by-order priority & explicit exchange aggressor)
  2. `EXACT: TICK-AGGR` (Exchange-flagged trade aggressor ticks)
  3. `ESTIMATED: L1-QUOTE` (Quote-Rule / Lee-Ready classification against synchronized BBO [R05-S22])
  4. `ESTIMATED: TICK-RULE` (Up-tick / zero-tick fallback without synchronized BBO [R05-S08])
  5. `SYNTHETIC: 1m-INTRABAR` (OHLCV intrabar approximation [R05-S07, R05-S08] — rendered with a high-contrast orange badge and hatched border; Absorption and Unfinished Auction triggers are automatically disabled on synthetic bars).
- **Honest Heuristic Labelling**: Any L2 queue estimate (`PIQ [Est / Max]`), L2 iceberg inference (`HEURISTIC: L2-ICEBERG`), or liquidity-pull marker (`HEURISTIC: L2-PULL`) must be labeled `ESTIMATED` or `HEURISTIC` and expose its sensitivity controls and false-positive disclosures directly in the inspector.

### P6. Fixed-Point Financial Determinism
Price and quantity mathematics are exact across all CPUs, operating systems, and replay runs.
- **Zero Binary Floats in Domain Math**: All prices are represented as integer tick coordinates (`TickIndex = i64`), all sizes as integer lots (`LotQty = i64`), all percentages as integer basis points (`Bps = i32`), and all VWAP/variance accumulators as centered 128-bit integers (`i128`) ([`02-Research/R05-Orderflow-Profile-Tooling.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R05-Orderflow-Profile-Tooling.md)).
- **Reproducible Tick Replay**: Replaying the same L1/L2/L3 capture file at $1\times$, $10\times$, or $100\times$ speed produces the exact same bit-for-bit Footprint cells, POC/VAH/VAL levels, CVD values, and simulated fills.

### P7. Unified Layer & Object Tree ("Parallel Universes" Without File Chaos)
Traders think in multiple overlapping timeframes and what-if scenarios on the same [`Instrument`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md).
- **Composable Analysis Layers**: Clean-room evolution of MotiveWave's `Analyses` [R10-S13] merged with TradingView's `Object Tree` [R10-S02]. Drawings and studies belong to named, stackable `.atanalysis.toml` layers (e.g., `HTF Macro Structure` locked beneath `Intraday Order-Flow` and toggleable `Alt Bearish Count`).
- **Full Z-Order & Timeframe Visibility Control**: Inside each layer, every object supports drag-and-drop Z-ordering, folder grouping, lock/visibility toggles, and 1-click timeframe visibility pills (`1s..1M`).

### P8. Guarded Precision Execution & Domain-Separated Undo
Execution controls must be both instant for scalpers and immune to fat-finger UI accidents.
- **Guarded Price-Axis & DOM Execution**: Unmodified `Click+Drag` on the price scale **always** scales the chart. Direct price-axis order staging requires either the `+` quick-action pill or an armed modifier key (`Click` Limit, `Shift+Click` Stop, `Ctrl+Click` Market [R10-S14, R10-S17]) with a live ghost preview showing exact fixed-point tick distance, dollar risk, and [`Bracket Order`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md) OCO legs.
- **Strict Undo Domain Separation**: `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` provides a deep, reversible command-bus history for all UI, [`Drawing`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), [`Study`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md), and [`Layout`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Glossary.md) mutations, but **never** mutates or cancels live broker orders (which are governed exclusively by explicit order controls and the `Shift+X` / `Shift+F12` cancel/flatten hotkeys).

---

## 2. Allegedly vs. Incumbents: Principle Enforcement Matrix

| Principle | TradingView [R10-S01..S06] | MotiveWave [R10-S07..S17] | Allegedly Standard |
| :--- | :--- | :--- | :--- |
| **Offline Cold Start & Account Sovereignty** | Fails (Cloud login & tier paywalls required) | Partial (Local app, license server check) | **Pass (`0` packets offline, `< 2 s` cold start)** |
| **Modal-Free `<= 3` Keystroke Settings Mutation** | Partial (`Cmd+K` opens tools, settings use modal) | Fails (7-to-14-tab modal dialogs) | **Pass (`Cmd/Ctrl+K >setting` + 320px Inspector)** |
| **Canvas-to-Chrome Area Ratio** | Pass (`~88–92%` canvas) | Fails (`~72–80%` with default toolbars/docks) | **Pass (`>= 90%` canvas in default workspace)** |
| **Git-Diffable Settings-as-Code (`TOML/JSON`)** | Fails (Opaque cloud database state) | Fails (Opaque XML / binary workspace blobs) | **Pass (5-level delta `.toml` + JSON Schema)** |
| **True Tick / L2 / MBO Order-Flow + Provenance** | Fails (1m intrabar footprint approximations) | Partial (True tick/MBO, silent fallback mixing) | **Pass (5-tier loud Provenance + `i64`/`i128` math)** |
| **Analysis Layers + Z-Order Object Tree** | Partial (Object Tree only; no `Analyses` layers) | Partial (`Analyses` only; no Z-order Object Tree) | **Pass (Unified Composable Layer & Object Tree)** |

---

## 3. Concrete, Testable Sovereignty Checklist

Every release candidate of Allegedly must pass **100% of the following 20 automated and measurable assertions (`SV-01` through `SV-20`)** in CI/CD before shipping:

| Check ID | Category | Concrete Test Procedure | Measurable Pass / Fail Assertion |
| :--- | :--- | :--- | :--- |
| **SV-01** | **Zero-Network Offline Boot** | Launch Allegedly binary inside an isolated network namespace (`unshare -n` / macOS firewall block) with a fresh profile directory. | **PASS** if cold start to interactive 60 fps Footprint + DOM workspace completes in **`< 2,000 ms`** with **`0` outbound DNS/TCP/UDP packets** and **`0` error modals**. |
| **SV-02** | **Command Palette Keystroke Bound** | Automated UI harness measures keystrokes required from normal canvas focus to reach and mutate any registered setting across all 8 order-flow tools. | **PASS** if $100\%$ of settings and actions are filterable via `Cmd/Ctrl+K` within **`<= 3` keystrokes** (excluding the search query substring) and mutate inline without spawning a modal dialog. |
| **SV-03** | **Zero Blocking Configuration Modals** | Inspect UI window/widget tree while editing any Study, Drawing, DOM Ladder, Chart, or Theme property. | **PASS** if **`0` modal backdrop overlays** block mouse panning, zooming, or DOM order clicks on the underlying chart canvas during property editing. |
| **SV-04** | **Tier-1 Micro-Toolbar Constraint** | Automated accessibility tree scan of every floating contextual micro-toolbar across all Studies and Drawings. | **PASS** if every contextual micro-toolbar contains **`<= 5` top-level interactive controls** and occupies **`<= 36 px` height**. |
| **SV-05** | **Canvas-to-Chrome Screen Ratio** | Render the default `1920x1080` single-chart workspace and compute the pixel ratio of the Lightweight Charts v5 + WebGL2 price-time canvas to total window pixels. | **PASS** if active chart/data canvas area is **`>= 90.0%`** of total window area (`>= 1,866,240` of `2,073,600` pixels). |
| **SV-06** | **Deterministic TOML Round-Trip & Git Diff** | Export a multi-window Workspace + 3 Analysis Layers + 8 Studies to `.toml`/`.json`, re-import into a clean instance, and re-export. | **PASS** if `SHA-256(export_1) == SHA-256(export_2)` (byte-for-byte identical) and changing 1 study parameter produces a `git diff` of **`<= 3` changed lines**. |
| **SV-07** | **5-Level Cascade Inheritance & Reset** | Override `imbalance_ratio_bps = 40000` on one Footprint instance, verify `Modified Only` filter count $= 1$, then click `Reset to Inherited`. | **PASS** if the instance TOML delta becomes empty (`{}`) and the parameter immediately reflects the parent Study Template value (`30000 bps`). |
| **SV-08** | **Zero Binary Float Static Analysis Gate** | Run CI AST/Clippy lint across `allegedly-core`, `allegedly-orderflow`, `allegedly-oms`, `allegedly-ingest`, `allegedly-storage`, `allegedly-replay`, and `allegedly-ipc` crates for `f32`/`f64` tokens in price, quantity, tick, or VWAP types. | **PASS** if **`0` occurrences** of `f32` or `f64` exist in any domain struct, trait, accumulator, or serialization schema outside GPU viewport pixel-coordinate projection. |
| **SV-09** | **Bit-Exact Cross-Speed Replay Determinism** | Replay a 1,000,000-tick CME ES MBO/L2 capture file at $1\times$, $50\times$, and max-cpu-batch speed. | **PASS** if the resulting state hashes of all 8 tools (Footprint cells, Volume/TPO POC/VAH/VAL, CVD, DOM PIQ, T&S sweeps, `i128` VWAP bands) match **bit-for-bit (`100%`)** across all runs. |
| **SV-10** | **Loud Provenance Badge Enforcement** | Feed a chart a mixed dataset: 5 days of `1m` OHLCV bars, 2 days of `L1_TRADE_ONLY` ticks, and 1 day of `L3_MBO` ticks. | **PASS** if the UI displays distinct, non-dismissible provenance badges (`SYNTHETIC: 1m-INTRABAR`, `ESTIMATED: TICK-RULE`, `EXACT: L3-MBO`) on each respective segment and disables Absorption triggers on the `SYNTHETIC` segment. |
| **SV-11** | **Honest L2 Heuristic Guardrail** | Enable Iceberg and Spoof/Pull detectors on an `L2_MBP` feed without `L3_MBO` order IDs. | **PASS** if the legend and tooltip explicitly display `HEURISTIC: L2-ICEBERG` / `HEURISTIC: L2-PULL`, show `[Est / Max]` queue bounds on the DOM PIQ marker, and expose `dwell_ms` and `conflation_guard_ms` sliders. |
| **SV-12** | **60 FPS Pan/Zoom with Active VRVP on 100k Bars** | Automated benchmark pans and zooms across a 100,000-bar dataset with Visible-Range Volume Profile (VRVP), Footprint, and CVD active. | **PASS** if 99th-percentile frame time $P_{99} \le \mathbf{16.6\text{ ms}}$ (`>= 60 fps`) and Dyadic Segment Tree VRVP recomputation completes in **`< 0.50 ms`**. |
| **SV-13** | **24-Hour L2 Liquidity Heatmap Memory Bound** | Ingest 24 hours ($864,000$ slices at 10 Hz across 200 depth levels) into the Liquidity Heatmap engine. | **PASS** if resident RAM allocated by the heatmap subsystem remains **`< 64 MB`**, disk chunk output is **`< 30 MB` (Zstd)**, and total idle app RAM remains **`< 300 MB`**. |
| **SV-14** | **60 Hz DOM Ladder Zero-Allocation Hot Path** | Stream 5,000 L2/MBO book updates/sec into the 21-column DOM Ladder while rendering at 60 Hz. | **PASS** if the hot-path ingestion and row-layout loop performs **`0` heap allocations** per tick and renders at a locked `60 fps`. |
| **SV-15** | **Price-Axis Zoom vs. Trade Safety Guard** | Perform 1,000 rapid unmodified `Click+Drag` vertical scale gestures across the full width of the right-hand price axis while connected to a simulated broker. | **PASS** if **`0` orders** are staged or submitted unless `Arm Axis Trading` + required modifier key (`Shift`/`Ctrl`/`Alt`) or the `+` quick pill is explicitly invoked. |
| **SV-16** | **Undo/Redo Stack Execution Isolation** | Place 3 drawings, submit 1 live/sim Limit Order on the DOM, modify 1 study parameter, and press `Cmd/Ctrl+Z` twice. | **PASS** if the study parameter and last drawing are cleanly reverted while the working Limit Order remains **100% untouched** in the broker order book. |
| **SV-17** | **POC / VAH / VAL Magnet Snap Precision** | Hold `Ctrl/Cmd` (or enable `POC-Snap Magnet`) and drag a Horizontal Ray or Limit Order within 12 pixels of a Volume/TPO Profile POC, VAH, or VAL. | **PASS** if the coordinate snaps to the **exact `i64` price tick index** of the POC/VAH/VAL with `0` sub-tick float error. |
| **SV-18** | **100% Remappable Keyboard Map & Conflict Check** | Load a custom `keymap.toml` remapping all 40+ default shortcuts and intentionally introduce a duplicate keybinding. | **PASS** if all remapped shortcuts execute within `< 1 ms` and the conflict detector highlights the exact duplicate line and binding in both the UI and CLI validator. |
| **SV-19** | **WCAG AA Tabular Numeral Contrast & Colorblind Audit** | Run automated pixel luminance contrast and Deuteranopia/Protanopia/Tritanopia simulation matrices across all Footprint cells, DOM rows, and Heatmap LUTs. | **PASS** if all numeric text against cell backgrounds achieves **`>= 4.5:1` WCAG AA contrast** and buy vs. sell imbalances maintain $\Delta E_{2000} \ge 20$ under the `Okabe-Ito` colorblind theme. |
| **SV-20** | **Installer & Cold-Start Budget Compliance** | Measure packaged release binary installer size and cold-start time on reference **macOS & Windows** hardware *(Linux added in future post-v1.0 milestone)* ([`01-Charter/Constraints.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Constraints.md)). | **PASS** if installer package is **`< 40 MB`** and cold start to interactive canvas is **`< 2.0 s`**. |

---

## 4. Sources Table

All public documentation references supporting these principles are cataloged in [`02-Research/R05-Orderflow-Profile-Tooling.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R05-Orderflow-Profile-Tooling.md) (`R05-S01` through `R05-S23`) and [`02-Research/R10-UX-Teardown-Control-Model.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R10-UX-Teardown-Control-Model.md) (`R10-S01` through `R10-S18`).

| Source ID | Primary Reference & URL | Retrieved Date | How Verified | Confidence |
| :--- | :--- | :---: | :--- | :---: |
| **R10-S01..S06** | TradingView Help Center — *Chart Interface, Object Tree, Drawing Micro-Toolbar, Magnet Mode, Quick Search (`Cmd/Ctrl+K`), Price Scale Settings* (`https://www.tradingview.com/support/`) | 2026-11-24 | Direct HTTP retrieval & UX pattern extraction in Track R10. | **High (Verified)** |
| **R10-S07..S17** | MotiveWave User Guide — *Console, Charts, Studies, Docking Framework, Keyboard Shortcuts, Tool Bar, Analyses Guide, Chart Trading, Volume Imprint, TPO, DOM* (`https://docs.motivewave.com/user-guide/`) | 2026-11-24 | Direct HTTP retrieval & full parameter/tab inventory in Tracks R05 & R10. | **High (Verified)** |
| **R10-S18** | W3C WCAG 2.2 Contrast Minimum (1.4.3) & Okabe-Ito Color Universal Design (`https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html`) | 2026-11-24 | Direct specification verification for `4.5:1` contrast and colorblind palette assertions (`SV-19`). | **High (Verified)** |
