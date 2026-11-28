---
title: "OpenMarket Audit 02 — Indicators, Scripting Runtime, Language Semantics & Cookbook"
type: research-audit
status: verified
owner: research-scripting
updated: 2026-11-27
scope:
  - OpenMarket Docs: Get started, Indicators, Language, Reference, Cookbook
  - OpenMarket Learn: Indicators Library & Suites
  - Allegedly Baseline: crates/allegedly-studies, apps/desktop, packages/ipc-client
code_refs:
  - crates/allegedly-studies/src/lib.rs
  - crates/allegedly-studies/src/builtins.rs
  - crates/allegedly-studies/src/luau_sandbox.rs
  - crates/allegedly-app/src/lib.rs
  - apps/desktop/src-tauri/src/main.rs
  - packages/ipc-client/src/offline-sim-adapter.ts
  - apps/desktop/src/App.tsx
  - apps/desktop/src/components/indicators-dialog.tsx
  - apps/desktop/src/panels/chart-panel.tsx
  - apps/desktop/src/panels/paper-oms-panel.tsx
---

# OpenMarket Audit 02 — Indicators, Scripting Runtime, Language Semantics & Cookbook

> [!IMPORTANT]
> **Clean-Room & IP Hygiene Compliance (`01-Charter/Constraints.md`, `02-Research/R09-Legal-Licensing.md`)**:
> This audit documents observable external behavior, standard public-domain textbook mathematical definitions, execution invariants, and UI ergonomics in original engineering prose. Zero verbatim external documentation copy, zero proprietary scripting/language branding, and zero proprietary trademarks are carried into Allegedly's proposed APIs, types, or UI specifications.

---

## Executive Verdict

**Verified Summary**: OpenMarket's indicator and scripting architecture is built around a single coherent contract: declarative static metadata driving zero-recompile parameter UIs, a deterministic bar-by-bar stateful WebAssembly runtime (AssemblyScript compiled in a Web Worker) with strict fixed-memory limits (`4 MiB`, zero heap growth after init), forming-bar snapshot/rollback, static compiler proofs for partial pan-back recomputation, non-repainting multi-timeframe primitives, flat microstructure cell arrays, and an 82-indicator stateful TA library (`52` core + `30` extended) verified bit-exact against a reference fixture.

By contrast, Allegedly's current study implementation (`crates/allegedly-studies` + desktop UI) is an early prototype with **6 built-in batch functions** and a **single-shot Luau evaluator** that has critical architectural bugs:
1. **Broken fixed-point boundary**: The frontend sends JSON `Vec<f64>` closes (omitting `open`, `high`, `low`, and `time` completely) to Rust instead of Rust reading canonical `PriceE9`/`QtyE9` (`i64`) bars directly from core storage.
2. **Incorrect VWAP & NaN-poisoned built-ins**: `vwap_series` receives `closes` instead of `(H+L+C)/3`, never resets on session/calendar boundaries, and silently substitutes `1.0` volumes on length mismatch; `sma`, `ema`, and `wilder_rsi` permanently poison on any `NaN`.
3. **Zero live/replay/symbol lifecycle**: Active studies in `App.tsx` never recompute when new candles arrive, when stepping replay, or when changing symbols/timeframes, and there is no intrabar snapshot/rollback or Wasmtime runner in `allegedly-studies` yet (despite `04-Architecture/Plugin-ABI.md` specifying both).
4. **Hardcoded UI & fake offline mode**: Oscillators render squashed inside the main price pane as single lines formatted as prices, parameters are hardcoded with no settings dialog, `indicators-dialog.tsx` misreports the Luau memory cap as `2 MiB` when Rust enforces `8 MiB`, and `offline-sim-adapter.ts` silently returns a 2-bar average for arbitrary Luau code.

---

## 1. Allegedly Baseline Inventory (Facts)

All facts below were verified directly against the Allegedly workspace on `2026-11-27`.

### 1.1 Rust Core & Tauri Bridge

| Component | File & Symbols | Verified Current Behavior | Gaps / Anomalies Observed |
| :--- | :--- | :--- | :--- |
| **Crate dependencies** | [`crates/allegedly-studies/Cargo.toml`](../../crates/allegedly-studies/Cargo.toml) | Depends on `mlua` (`luau`, `vendored`), `serde`, `thiserror`. | No `wasmtime` dependency yet (Tier-2 WASM runtime from `Plugin-ABI.md` is not implemented in this crate). |
| **Study request/response & dispatch** | [`crates/allegedly-studies/src/lib.rs`](../../crates/allegedly-studies/src/lib.rs#L12-L115) (`BuiltinStudyKind`, `StudyRunRequest`, `StudyRunResponse`, `evaluate_study_request`) | Accepts JSON-deserialized `closes: Vec<f64>`, `volumes`, `buy_volumes`, `sell_volumes`. Supports 6 built-ins (`sma`, `ema`, `wilder_rsi`, `vwap`, `cvd`, `footprint_delta`) or one `luau_script: String`. Converts non-finite outputs (`NaN`, `±Inf`) to `None` via `sanitize_series`. | No `opens`, `highs`, `lows`, `timestamps_ns`, or `PriceE9`/`QtyE9` inputs. Passes `&req.closes` into `vwap_series` (`L95`) instead of HLC3. Silently fabricates `vec![1.0; closes.len()]` when `volumes.len() != closes.len()` (`L92-L94`). Hardcodes `overlay: true` for all Luau scripts (`L69`). Instantiates a fresh `LuauStudyRunner::new` per call (`L58-L60`), dropping the pool reservation before reading `pool.reserved_bytes()` (`L71`), so `memory_pool_reserved_bytes` is always `0` on non-concurrent calls. |
| **Built-in TA math** | [`crates/allegedly-studies/src/builtins.rs`](../../crates/allegedly-studies/src/builtins.rs#L3-L113) (`sma`, `ema`, `wilder_rsi`, `vwap_series`, `footprint_delta_series`, `cvd_series`) | Stateless batch functions returning `Vec<f64>`. `sma`: rolling add/subtract (`L3-L18`). `ema`: SMA-seeded, `k = 2/(p+1)` (`L20-L34`). `wilder_rsi`: Wilder 1978 smoothing, returns `100.0` when `avg_loss == 0.0` (`L37-L71`). `vwap_series`: centered-offset cumulative sum (`L74-L92`). `footprint_delta_series` & `cvd_series`: `buy - sell` and running sum (`L95-L113`). | Zero incremental `update()` / `snapshot()` / `restore()` state. `sma` permanently poisons on any `NaN` and accumulates floating-point cancellation drift. `ema` and `wilder_rsi` permanently poison on any `NaN`. `vwap_series` has no session/calendar anchor reset. `cvd_series` has no session reset and silently truncates mismatched lengths via `.min()`. |
| **Luau sandbox** | [`crates/allegedly-studies/src/luau_sandbox.rs`](../../crates/allegedly-studies/src/luau_sandbox.rs#L6-L189) (`GlobalStudyMemoryPool`, `LuauStudyRunner`, `FloatSeriesView`) | Global atomic pool cap `64 MiB` (`L7`), default per-study cap `8 MiB` (`L8`), default interrupt budget `250_000` (`L9`). Strips `os`, `io`, `package`, `debug`, `dofile`, `loadfile`, `require`, `math.random`, `math.randomseed`; calls `lua.sandbox(true)` and `lua.set_memory_limit(effective_cap)`. RAII `PoolReservation` and `InterruptGuard`. | Only exposes `close` (`FloatSeriesView`), `close_bytes` (packed LE string), and `close_len`. Allocates a full `8 * N` byte Rust `Vec<u8>` AND copies it into a Lua string inside the 8 MiB VM heap on every call (`L172-L178`), consuming half the VM heap at ~500k bars. No `open`/`high`/`low`/`volume`/`time`/`ta.*` bindings, no persistent bar-by-bar state, no wall-clock timeout, no multi-output support. |
| **App facade & Tauri IPC** | [`crates/allegedly-app/src/lib.rs`](../../crates/allegedly-app/src/lib.rs#L580-L620), [`apps/desktop/src-tauri/src/main.rs`](../../apps/desktop/src-tauri/src/main.rs#L90-L160) | `#[tauri::command] fn run_study` locks `state.runtime.lock()` synchronously and forwards `StudyRunRequest` straight to `allegedly_studies::evaluate_study_request`. | Holds the global app runtime mutex synchronously during Luau/study execution, blocking other commands. Bypasses core Rust `Bar` / tick storage completely. |

### 1.2 Frontend, Chart Rendering & Offline Adapter

| Component | File & Lines | Verified Current Behavior | Gaps / Anomalies Observed |
| :--- | :--- | :--- | :--- |
| **Offline sim adapter** | [`packages/ipc-client/src/offline-sim-adapter.ts`](../../packages/ipc-client/src/offline-sim-adapter.ts#L365-L545) (`evalOfflineStudy`) | Re-implements the 6 built-ins in TypeScript for browser preview mode. | For any `luau_script`, runs a regex blocklist (`os|io|...`), ignores the script code entirely, and fabricates `(closes[i-1] + closes[i]) / 2` (`L421-L436`) — violating honest output guarantees. |
| **Desktop state & wiring** | [`apps/desktop/src/App.tsx`](../../apps/desktop/src/App.tsx#L225-L260), [`L515-L675`](../../apps/desktop/src/App.tsx#L515-L675) | Stores chart snapshots in `seriesSnapshotRef` (`{ times, closes, volumes, buyVolumes, sellVolumes }`). `handleRunBuiltinStudy` and `handleRunLuauStudy` call IPC `runStudy` once on add/toggle. | `seriesSnapshotRef` drops `opens`, `highs`, `lows`. `activeStudies` are **never re-evaluated** on live tick updates, new candle closes, replay stepping, or symbol/timeframe switches (stale study values remain drawn on new symbols). |
| **Indicators dialog** | [`apps/desktop/src/components/indicators-dialog.tsx`](../../apps/desktop/src/components/indicators-dialog.tsx#L1-L875) | Modal with sidebar tabs (`favorites`, `technicals`, `orderflow`, `fundamentals`, `my_scripts`), search, favorites persisted in `localStorage`, hardcoded catalog (`SMA 20`, `EMA 9/20/50`, `RSI 14`, `VWAP`, `CVD`, `Footprint Delta` + 4 chart layers), and a raw `<textarea>` Luau script runner. | Displays `Luau (2 MiB)` (`L614`) while Rust actually reserves `8 MiB`. No per-indicator settings/inputs editor, no style controls, no suites/presets, no multi-output plots. `fundamentals` tab is an empty placeholder reusing VWAP/Orderflow rows. Uses `localStorage` instead of sovereign `.toml` workspace files (`Constraints.md` #3). |
| **Chart rendering & legend** | [`apps/desktop/src/panels/chart-panel.tsx`](../../apps/desktop/src/panels/chart-panel.tsx#L375-L470), [`L2325-L2400`](../../apps/desktop/src/panels/chart-panel.tsx#L2325-L2400) | Renders legend rows with last value, hide/show eye, and remove button (`L375-L470`). Renders every study output as a single `LineSeries` (`lineWidth: 2`) (`L2349-L2361`). | Non-overlay oscillators (`!isOverlay`) do NOT get a separate lower pane — they are drawn inside the bottom 28% of the price pane (`scaleMargins: { top: 0.72, bottom: 0.04 }`) with `visible: false` price scale! Legend formats every study value with `formatPriceValue(lastVal)` (`L449`), misformatting RSI, CVD, and delta. No settings gear, no histograms/bands/fills/markers/tables/HUDs. |
| **Paper OMS panel** | [`apps/desktop/src/panels/paper-oms-panel.tsx`](../../apps/desktop/src/panels/paper-oms-panel.tsx#L275-L410) | Includes quick study run buttons duplicating the legacy study trigger flow. | No declarative strategy/backtest integration or unified study controller. |

---

## 2. Clean-Room Breakdown of OpenMarket's 6 Assigned Tabs (Facts)

All behavioral facts in Section 2 were retrieved from OpenMarket's public documentation and Learn pages on `2026-11-27` (see Section 8 Sources `OMA-02-S01`–`OMA-02-S20`) and restated strictly in clean-room engineering terms.

### 2.1 Tab 1 — Get Started (Authoring Workflow, Editor, Diagnostics & Packaging)

*Sources: `OMA-02-S01`–`OMA-02-S05`.*

1. **Single-File Compiled Architecture**:
   - Scripts are written in a statically typed TypeScript-syntax dialect compiled via AssemblyScript (`0.27.37`) to WebAssembly inside a browser Web Worker (`15 s` compile timeout, `20 s` execution timeout; cached compiled binaries).
   - Strict fixed-width numeric typing (`f64`, `i32`) is enforced: no untyped `any`, no closures capturing local variables, no union types, no `try/catch`, and no nondeterministic wall-clock/PRNG calls (`Date.now`, `Math.random`).
   - Every script has a top-level static declaration section (parameters, data inputs, outputs, render primitives, alerts, strategy rules), an optional one-time initialization hook (`onStart`), and a mandatory per-bar callback (`onBar`).
2. **Multi-Stage Deterministic Pipeline**:
   - Editing triggers a 6-stage pipeline with line-pinned diagnostics:
     1. *Declaration parse*: extracts static config/schema.
     2. *Static lint*: rejects unsafe or positional raw-slot access.
     3. *Metadata & digest*: compiles the declarative manifest ("sheet") and computes a SHA-256 content hash.
     4. *Compilation*: compiles to WASM bytecode.
     5. *Contract validation*: verifies the binary only imports allowlisted host functions and exports the expected ABI entrypoints.
     6. *Execution sanity*: runs on chart history and flags silent defects (e.g., all-`NaN` output series).
3. **In-App IDE Ergonomics**:
   - Multi-pane script workspace with file Explorer, ~85 starter templates grouped by domain (`Starters`, `On price`, `Order flow`, `Prediction markets`, `HUDs`, `Beyond the time axis`, `Strategies`), inline squiggles, hover type inspection, go-to-definition (`F12`) into standard library definitions, and an interactive inspection Console (`sheet`, `last N <output>`, string debug slot inspection).
   - Includes a one-click **"Copy for LLM"** bundle that packages source code, manifest metadata, and recent diagnostics for external AI debugging.
4. **Packaging, Versioning & Visibility**:
   - Scripts follow immutable SemVer releases (`0.1.0` with Patch/Minor/Major bumps).
   - Visibility tiers distinguish open-source forkable scripts (`<= 256 KiB`), compiled-binary-only modules, and server-executed protected modules, with audience controls (`Everyone`, `Invite only`, `Just me`).
   - *Clean-room relevance to Allegedly*: Allegedly is local-first FOSS (`Constraints.md` #1, #3), so cloud-hosted protected execution is explicitly out of scope; however, immutable local bundle versioning, SHA-256 manifest hashing, forkable built-in source code, multi-stage diagnostics, and AI-context export are directly applicable.

### 2.2 Tab 2 — Indicators (TA Library, Extra Indicators, Stats & History)

*Sources: `OMA-02-S06`–`OMA-02-S10`.*

OpenMarket ships **82 stateful indicator classes** (`52` core + `30` extended) plus an allocation-free statistics & ring-buffer toolkit. All stateful classes follow a uniform contract:
- Allocate fixed-size scratch buffers strictly in the constructor (zero per-bar heap allocation).
- Provide `.update(...) -> f64` returning the primary value, expose secondary values (e.g., upper/lower bands, signal/histogram, `+DI`/`-DI`) as typed fields on the instance, and provide `.reset()` to clear state cleanly.
- Verified **bit-exact** (`0.0` max absolute error and identical `NaN` mask) against a reference implementation on a 690-bar 1h BTCUSDT fixture, with 3 explicit documented divergences: (a) causal Lagging Span (`chikou` outputs current close and shifts visually `-26` bars rather than peeking ahead), (b) deep calendar VWAP anchors, and (c) strict right-side tie rejection on Pivot High/Low.

#### A. Core 52 Stateful Indicator Classes (Textbook Formulas, Warm-Up & NaN Rules)

| Category | Indicator Classes (Count) | Key Textbook Math / Behavioral Specs | First Finite Bar (0-indexed) | NaN / Edge-Case Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Moving Averages (9)** | `Sma`, `Ema`, `Rma`, `Wma`, `Hma`, `Vwma`, `Alma`, `Swma`, `Linreg` | `SMA`: $\frac{1}{p}\sum_{k=0}^{p-1} x_{t-k}$. `EMA`: SMA-seeded, $\alpha = \frac{2}{p+1}$, $y_t = \alpha x_t + (1-\alpha) y_{t-1}$. `RMA` (Wilder): SMA-seeded, $y_t = \frac{(p-1)y_{t-1} + x_t}{p}$. `WMA`: linear weights $1..p$. `HMA`: $\text{WMA}(\lfloor\sqrt{p}\rfloor, 2\text{WMA}(\lfloor p/2\rfloor) - \text{WMA}(p))$. `VWMA`: $\frac{\sum x_i v_i}{\sum v_i}$. `ALMA`: Gaussian weights (`offset=0.85, sigma=6`). `SWMA`: $\frac{x_{t-3} + 2x_{t-2} + 2x_{t-1} + x_t}{6}$. `Linreg(p, offset)`: OLS endpoint evaluated at $p - 1 - \text{offset}$. | `p - 1` (most); `SWMA`: `3`; `HMA`: `p - 1 + round(sqrt(p)) - 1` | Sliding-window MAs (`Sma`, `Wma`, `Vwma`, `Alma`, `Swma`, `Linreg`) return `NaN` if any element in the window is non-finite and **self-heal** once it exits. Recursive MAs (`Ema`, `Rma`) return `NaN` on a non-finite bar and **skip updating state**, resuming cleanly on the next finite bar. |
| **Stats & Series Math (12)** | `Sum`, `Median`, `Percentile`, `Variance`, `Stdev`, `Zscore`, `Correlation`, `Change`, `Mom`, `Roc`, `Cum`, `Fixnan` | `Variance`/`Stdev`: population denominator $p$ (not $p-1$). `Percentile`: nearest-rank $\lceil \frac{q \cdot p}{100} \rceil$. `ROC`: $\frac{x_t - x_{t-n}}{x_{t-n}} \times 100$. `Zscore`: $\frac{x_t - \mu}{\sigma}$ (`0` if $\sigma = 0$). `Correlation`: Pearson $r$. `Fixnan`: carries forward last finite value. | `Sum`: `0` (partial); `Change`/`Mom`/`Roc`: `n`; Windowed stats: `p - 1`; `Cum`/`Fixnan`: `0` | `Sum` skips `NaN` (partial sum from bar 0). `Zscore` skips `NaN` in sums but divides by `period`. `Cum` **permanently poisons** on any `NaN`. |
| **Oscillators (10)** | `Rsi`, `Cmo`, `Tsi`, `Cci`, `Mfi`, `Wpr`, `Stoch`, `Stochastic`, `Macd`, `Obv` | `RSI`: Wilder `RMA(gain)`/`RMA(loss)`. `CMO`: $100 \cdot \frac{\sum g - \sum l}{\sum g + \sum l}$. `TSI(13,25)`: double-smoothed momentum ratio. `CCI(20, 0.015)`: $\frac{\text{HLC3} - \text{SMA}}{\text{0.015}\cdot\text{MAD}}$. `MFI(14)`: money flow $\text{HLC3}\cdot V$ (`1e-10` flat tolerance). `WPR(14)`: $-100 \cdot \frac{H_p - C}{H_p - L_p}$. `Stoch(pK, sK, pD)`: raw `%K` smoothed twice (`k`, `d`). `MACD(12,26,9)`: `EMA(12) - EMA(26)`, `EMA(9)` signal, `hist`. `OBV`: signed cumulative volume (`bar 0 = 0`). | `RSI`/`MFI`: `p`; `CCI`/`WPR`: `p - 1`; `TSI`: `long + short - 1`; `MACD` line: `slow - 1`, signal: `slow + sig - 2`; `OBV`: `0` | `RSI`: zero average loss returns `100.0`; skips non-finite bars without corrupting `RMA` state. `WPR`/`Stoch`: flat range ($H_p = L_p$) returns `0` (`Stochastic` alternative returns `50` and avoids `NaN`). |
| **Ranges & Bands (9)** | `Tr`, `Atr`, `Bb`, `Keltner`, `Donchian`, `Highest`, `Lowest`, `HighestBars`, `LowestBars` | `TR`: $\max(H-L, |H-C_{t-1}|, |L-C_{t-1}|)$ (bar 0 = $H-L$). `ATR`: `RMA(TR, p)`. `BB(p, m)`: `SMA ± m * pop_stdev` (`basis`, `upper`, `lower`). `Keltner(p, m, atrP)`: `EMA ± m * ATR`. `Donchian(p)`: highest high / lowest low / mid. `Highest`/`Lowest` also expose `.bars` (negative offset); `HighestBars`/`LowestBars` expose `.value`. | `TR`/`Donchian`: `0` (partial); `ATR`/`BB`/extrema: `p - 1` | `BB` heals when `NaN` leaves window; `ATR` skips `NaN` via `RMA`. |
| **Trend & VWAP (5)** | `Adx`, `Ichimoku`, `Psar`, `Supertrend`, `Vwap` | `ADX(14)`: Wilder sum-seeded smoothing $S_t = S_{t-1} - S_{t-1}/p + x_t$; fields `adx`, `plusDi`, `minusDi`. `Ichimoku(9,26,52,26)`: `tenkan`, `kijun`, `senkouA`/`senkouB` (pre-shifted causally by `displacement`), `chikou` (current close with visual shift `-26`). `PSAR(0.02, 0.02, 0.2)`: Parabolic SAR with acceleration factor cap. `Supertrend(f, atrP)`: `line`, `direction ∈ {+1, -1}`. `VWAP(anchor, price)`: supports anchors `""` (sessionless), `"day"`, `"week"` (Monday), `"month"`, `"quarter"`, `"year"`, or ms bucket; price basis `hlc3`/`hl2`/`ohlc4`/`hlcc4`/`close`; uses exchange trade date when available, else UTC. | `DI`: `p`, `ADX`: `2p - 1`; `Ichimoku`: `0` (partial); `PSAR`: `1`; `Supertrend`: `atrP - 1`; `VWAP`: `0` | `ADX` and `PSAR` **permanently poison** on `NaN`. `VWAP` invalidates only the current bucket on a `NaN` bar and **recovers cleanly** on the next anchor reset. |
| **Bar Events (7)** | `Rising`, `Falling`, `PivotHigh`, `PivotLow`, `ValueWhen`, `BarsSince`, `Cross`, `PineCross` | `PivotHigh`/`PivotLow(L, R)`: confirms `R` bars after the pivot bar; allows left-side ties, strictly rejects right-side ties; non-finite stops side comparison. `Cross`: `+1` if $a_{t-1} < b_{t-1} \land a_t \ge b_t$, `-1` symmetric, `0` otherwise. `PineCross`: tracks last defined pair across `NaN` gaps. `ValueWhen(occ)` / `BarsSince`: event latches. | `Pivot`: `L + R`; `Cross`: `1` | `Cross` always returns `0` on `NaN`; `Pivot` never confirms early (strictly non-repainting). |

#### B. Extended 30 Indicator Classes & Allocation-Free Utilities

- **30 Extended Classes**: `Dev` (mean absolute deviation), `PercentRank` (excludes current bar, first finite at bar `p`), `Bbw`, `Kcw`, `AccDist`, `Wad`, `Wvad`, `Nvi`/`Pvi` (initialized at `1.0`, never `NaN`), `Pvt`, `RunningMax`/`RunningMin`, `Mode`, `Range`, `Cog`, `Iii`, `Dema` (`2p-2`), `Tema` (`3p-3`), `Zlema` (`floor((p-1)/2)+p-1`), `Trix` (`3p-2`), `Ultimate(7,14,28)` (bar `p3`), `Vortex(p)` (`plus`, `minus`), `Aroon(p)` (`up`, `down`, `osc`), `Choppiness(p)`, `Efficiency(p)`, `Kama(p, 2, 30)`, plus 4 compatibility variants (`Dmi` with `1e-10` flat tolerance & NaN-skipping `RMA`, `SourceStoch`, `SourceVwap`, `HeikinAshi`).
- **Slice Stats & Ring Buffers**: Allocation-free slice functions (`sum`, `mean`, `variance`, `stdev`, `min`, `max`, `argmin`, `argmax`, `slope`, `covariance`, `correlation`, `zscore`, `sortAscending`, `median`, `percentile`, `percentileLinearInterpolation`), fixed-size `History(N)` ring buffer (`push`, `ago(n)`, `latest`, `max`/`min`/`mean`/`sum`), fixed-capacity `List`, `HandleRing` (bounded drawing handle recycling), `roundTo`/`roundToTick`, and a deterministic seeded PRNG.

#### C. Unified NaN Propagation Taxonomy

1. **Strict Sliding Windows** (`Sma`, `Wma`, `Bb`, `Stdev`, `Cci`, `Donchian`): return `NaN` while any non-finite value resides in the active window; **heal automatically** once it rolls out.
2. **NaN-Skipping Recursive Smoothers** (`Ema`, `Rma`, `Rsi`, `Atr`, `Macd`, `Dmi`): emit `NaN` on the offending bar, leave internal accumulator untouched, and resume smoothly on the next finite bar.
3. **Unbounded Accumulators** (`Adx`, `Cum`, `Psar`, `AccDist`, `Pvt`): poison permanently on `NaN` (except `Vwap`, which heals at the next anchor reset).
4. **Boolean / Event Detectors** (`Cross`, `Rising`, `Falling`): emit `0` / `false` on `NaN`.

### 2.3 Tab 3 — Language (Execution Model, Repaint Prevention, MTF & Microstructure)

*Sources: `OMA-02-S11`–`OMA-02-S15`.*

1. **Causal Execution & Structural No-Lookahead**:
   - Host runs `onStart()` once, then invokes `onBar()` strictly chronologically from bar `0` to bar `N - 1`.
   - Module-scope variables persist across bars; function-local variables are ephemeral per bar.
   - There is no global forward-indexing `series[i + k]` operator, preventing lookahead bias by construction.
   - Accessing `bar.isLast()` or `bar.count()` is explicit opt-in; using `bar.count()` forces a full recompute on new bar open so live charts match freshly loaded charts identically.
2. **Forming-Bar Snapshot & Rollback**:
   - After evaluating the last closed bar, the host snapshots the module's entire WASM linear memory plus active drawing handle tables.
   - On each live forming-bar tick (throttled at `<= 1 Hz` with coalescing), the host restores the snapshot, writes updated live OHLCV/orderflow inputs, runs `onBar()` once, and overwrites the live row.
   - When the bar closes, the host runs `onBar()` once more with `isLast == false` and advances the closed-bar snapshot.
3. **Pan-Back Recomputation via Static Compiler Proofs**:
   - **`history_independent`**: If the compiler proves `onBar()` holds zero cross-bar mutable state, loading older history evaluates only the newly prepended bars.
   - **`history_warmup(W)`**: If all persistent state belongs to finite-window primitives (e.g., `Sma`, `Wma`, `Bb`, `History(N)`, `PivotHigh`), the compiler computes exact settling depth `W` and evaluates only `W` warm-up bars plus newly loaded bars.
   - Unbounded / IIR state (`Ema`, `Rsi`, `Vwap`, `Cum`, user module accumulators) falls back to a full-history rerun for exact bit parity.
4. **Non-Repainting Multi-Timeframe (MTF) — Three Distinct Mechanisms**:
   - **In-module bucket folding**: Fold chart bars into rolling (`floor(t / N)`) or calendar/exchange-trade-date buckets (`1D`, Monday-anchored `1W` via `floor((day + 3) / 7)`, `1M`, `1Q`, `1Y`). Emit confirmed HTF value only when the next bucket begins (staircase series); keep any developing value visually distinct and excluded from alert/strategy triggers.
   - **Coarse interval pin**: Request a higher timeframe that is an integer multiple of the chart interval. Defaults to `confirmed` (as of bar close), with explicit opt-in `forming`, `is_new_period`, and `offset: 1..500`.
   - **Celled candle & intrabar streams**:
     - `candles` / `oi_candles` / `volume_profile_candles`: 6-tuple cells `[offset_ms, O, H, L, C, V]` delivering closed backlog on bar `0` and incremental closed HTF candles on bar boundaries.
     - `intrabar`: finer sub-bars (`>= 1m`) dividing the chart bar evenly, delivered as a flat cell slice for intrabar delta/absorption calculation without repainting.
5. **Flat Celled Microstructure Inputs**:
   - Order book (`[price, size, side]`, up to `500` levels/side, or aggregated depth bands), volume profile (`[low, high, buy, sell]`), trade volume by USD size (7 buckets), exchange-tagged buy/sell trade volume (including `follow: "coin"` cross-venue aggregation), raw tape cells, OI, funding, liquidations, options chain (10-tuple cells) & strikes, and `time.trade_date` (exchange session trading day, e.g., 17:00 Chicago CME open).

### 2.4 Tab 4 — Reference (Declarations, Limits, Symbols & ABI Versioning)

*Sources: `OMA-02-S16`–`OMA-02-S19`.*

1. **Declarative Sheet & Zero-Recompile Parameter Binding**:
   - Top-level declarations generate the settings dialog automatically from 15 typed parameter kinds: `int`, `number`, `bool`, `choice`, `color`, `time`, `price`, `range`, `multi`, `list`, `source`, `timeframe`, `symbol`, `session`, and `text`/`text_area`, organized with `page`, `section`, `divider`, `note`, and `presets`.
   - Outputs support plot types (`line`, `bar`, `area`, `histogram`, `candle`, `shape`, `scatter`, `none`), pane placement (`overlay`, `lower`, or up to 4 named panes), bands/fills (`range`, `fill`), structural drawings (`box`, `segment`), rich orderflow plots (`footprint`, `tpo`, `profile`, `heatmap`, `matrix`), batched markers (`marks`, `spans`, `rays`, `flags`), and overlays (`hud`, `table`, `text`, `label`, `bgcolor`, `barcolor`), plus `alert` (edge-triggered or `every_bar`) and `strategy` declarations.
   - Style bindings (e.g. referencing `"@colorParam"` or `"@colorParam/0.4"` opacity) resolve in the host UI without recompiling or even rerunning the WASM binary.
2. **Published Sandbox Limits & Fail-Loud Semantics**:
   - **Memory**: Fixed **`4 MiB`** WASM linear memory per script instance; **zero memory growth allowed after `onStart()`** (`256 KiB` pre-reserved per-bar scratch pool swept at `32 KiB`).
   - **Timeouts**: `15 s` compile ceiling, `20 s` run ceiling.
   - **Numeric honesty**: Output values must be finite `f64` or `NaN`; **`±Infinity` fails the run loudly** instead of silently coercing to blank.
   - **Celled & rendering caps**: Celled inputs enforce strict `max_cells` and fail loudly rather than silently truncating; strings never silently truncate (`64` slots × `<= 4,096 B`, `64 KiB`/row, `2 MiB`/run); frames `8 × <= 96 KiB`; live drawing handles `<= 1,000`/kind and `<= 1,500` total; `4,096` draw calls/bar; expanded render payload `<= 8 MiB`; chart render trims at `2,000` drawings/run and auto-coarsens TPO above `512` rows/period with a visible warning.
   - **Static paint-weight badge**: Measures render cost on a reference 1,500-bar BTC 15m dataset and flags scripts as "Heavy" when TPO/footprint/profile exceeds `512` rows or `8,192` cells, or grid heatmaps exceed `25,600` cells.
3. **Venue-Native Symbol Addressing & Frozen ABI Versioning**:
   - Cross-symbol inputs require explicit `(EXCHANGE, native_symbol)` pairs (e.g., `KRAKEN` `XBT/USD`, `COINBASE` `BTC-USD`, `CME` `ES1!`) and fail loudly by name on missing/half-pinned sources instead of rendering flat zeros.
   - ABI versions (`v1`–`v6`) are inferred automatically from declared features and frozen permanently so existing user scripts remain bit-identical across platform upgrades.

### 2.5 Tab 5 — Cookbook (6 Domain Recipe Groups)

*Sources: `OMA-02-S20`, `OMA-02-S21`.*

OpenMarket organizes `79` templates + `6` walkthrough recipes (`85` total) into 6 clear engineering domains:

| Cookbook Group | Representative Patterns Studied | Architectural Takeaway for Allegedly |
| :--- | :--- | :--- |
| **1. On price** | Anchored VWAP using `time.trade_date` + emitting `NaN` during the incomplete first session; 4h staircase regime filter; key levels; supply/demand zones; session maps; trend candles. | Session-aware VWAP requires exchange trade-date boundaries and honest `NaN` masking when bar 0 lands mid-session. |
| **2. Order flow** | Cross-venue Aggregated CVD (`follow: "coin"` + venue bitmask + unit toggle); Absorption (delta spike vs rolling mean + narrow ATR range + batched span boxes); Volume Footprint (`plot.footprint` + diagonal 3:1 imbalance + 3 stacked imbalances + cumulative pane); TPO letters; book heat; liquidation bursts. | High-value orderflow studies need flat celled footprint/profile/trade-size inputs, multi-output plot routing (price overlay + separate cumulative delta pane), and batched draw spans. |
| **3. Prediction markets** | Event-market odds vs spot price rolling correlation. | Generic multi-symbol alignment (`symbol` param + time-aligned `source`) handles equities, futures, crypto, and alternative feeds identically. |
| **4. HUDs** | Market HUD, decision board, order-flow HUD, book HUD, session HUD, options exposure/skew/GEX cards. | Declarative structured HUD/table primitives keep custom analytics off ad-hoc DOM hacks while staying theme-consistent. |
| **5. Beyond the time axis** | Docked Volume Profile + Value Area, OI Profile, Depth Curve, Yield Curve, Correlation Matrix, Seasonality Grid, Volatility Surface. | Dedicated non-time-axis primitives (`profile`, `matrix`, `heatmap`) unlock institutional workflows without forcing hacks onto time-series lines. |
| **6. Strategies** | MA crossover; risk-sized RSI + ATR mean reversion using equity-risk position sizing and ring-buffered trade rails in handles. | Unified study/strategy declaration model lets the exact same compiled script power live chart overlays, alert triggers, and deterministic replay backtests. |

### 2.6 Tab 6 — Learn Indicators (Catalog UX, 8 Categories, Suites & Legend)

*Source: `OMA-02-S22`.*

- **Unified Fast Search (`/` or `Cmd/Ctrl+K`)**: Abbreviation-aware search (`rsi`, `vrvp`, `cvd`), filter pills (`Favorites`, `Official`, `Community`, `My Scripts`), sort options (Quality/Relevance, Name, Recent), and `Shift+Click` to apply an indicator across every chart in a multi-chart workspace.
- **8 Official Categories**:
  1. *Trending*
  2. *Exchange Metrics*
  3. *Options & Derivatives*
  4. *Lending & Margin*
  5. *Market Analysis* (CVD, Delta, Buy/Sell Ratio, Order Book Heatmap, Skew)
  6. *Institutional Metrics* (CME OI, ETF flows/premium)
  7. *Volume Footprints* (Footprint, SVP, VRVP, TPO + multi-venue aggregated variants)
  8. *Technical* (16 open-source scripted classics — RSI, BB, MACD, Volume, EMA, SMA, Ichimoku, Stoch, CCI, MFI, OBV, ADL, ADX, PSAR, Volume Bubbles, Bar Statistics — all inspectable and forkable in one click)
- **Suites**: Named bundles of up to `8` indicators preserving per-indicator parameter settings and venue selections (10 starter suites, e.g., Spot Volume Flow, Perp Volume Flow, Ultimate Order Flow).
- **Legend Row UX**: Compact top-left legend stack showing live numeric values formatted per series unit, with hover actions: **Settings gear**, **Hide/Show eye**, **Remove cross**, and **More (`...`)** (bind alert, inspect/fork source, move pane).
- **Favorites & Recents**: Starred favorites + automatic list of last 20 recently added indicators.

---

## 3. Allegedly Architectural Boundary & Spec Precision

### 3.1 Fixed-Point `PriceE9` / `QtyE9` (`i64`) ↔ `f64` Study Boundary

Per `01-Charter/Constraints.md` (#2, #6, #8) and `04-Architecture/Plugin-ABI.md`:
- **Core Rule**: Ingestion, storage (`DuckDB`/Parquet/tick logs), bar aggregation, order books, OMS, and IPC **MUST** store and transmit prices and quantities as fixed-point `i64` (`PriceE9`, `QtyE9`, scale $10^9$).
- **Exact Conversion Boundary**: Conversion `i64 -> f64` (`val as f64 * 1e-9`) happens **exclusively inside `crates/allegedly-studies`** (never in frontend JS, never by round-tripping `Vec<f64>` over Tauri JSON).
- **Zero-Allocation Read from Core Store**: `StudyRunRequest` should pass a `(series_id / symbol, timeframe, bar_range)` handle (or shared read-only `Arc<BarSlice>` backed by Rust `BarRing`) — **never** `closes: Vec<f64>` copied out of React state.
- **Output Encoding**:
  - For overlay studies whose values represent prices (`SMA`, `EMA`, `VWAP`, `BB`, `Supertrend`, `PSAR`), convert finite outputs back to `PriceE9` (`(v * 1e9).round() as i64`) when persisting or crossing binary fixed-point ABI boundaries, with `i64::MIN` as the canonical sentinel for `NaN`/`None` (matching `Plugin-ABI.md`).
  - For dimensionless/oscillator/volume outputs (`RSI`, `ADX`, `Zscore`, `Correlation`, `CVD`), tag each `OutputSeries` with an explicit `OutputUnit` (`Price`, `Percent`, `Volume`, `Delta`, `Ratio`, `Integer`, `Timestamp`) so chart formatters never display `RSI 64.20` as `\$64.20`.
  - **Strict `Infinity` Rejection**: Reject `v.is_infinite()` with a structured `StudyEvalError::NonFiniteOverflow { output, bar_index }` instead of silently mapping `±Inf` to `None`.

### 3.2 Clean-Room Incremental Study Contract (`allegedly-studies`)

To support live 60 fps ticks, deterministic 100M-tick replay (`S08`), intrabar rollback, and Tier-1/Tier-2/Tier-3 parity, replace stateless `Vec<f64>` functions with a clean-room stateful trait:

```rust
/// Clean-room incremental study state contract for Tier-1 Rust built-ins
/// (mirrored 1:1 by Tier-2 Wasmtime linear-memory snapshots and Tier-3 Luau).
pub trait IncrementalStudy: Send {
    type Snapshot: Clone + Send;

    /// Reset all internal buffers and accumulators to bar -1.
    fn reset(&mut self);

    /// Advance state by one canonical bar (PriceE9/QtyE9 converted internally).
    /// Writes primary + secondary outputs into `out_row` (length == manifest.outputs.len()).
    fn update_bar(&mut self, bar: &CanonicalBarView, out_row: &mut [f64]) -> Result<(), StudyEvalError>;

    /// Capture committed closed-bar state for O(1) intrabar rollback.
    fn snapshot_state(&self) -> Self::Snapshot;

    /// Restore last committed closed-bar state before re-evaluating a forming bar.
    fn restore_state(&mut self, snap: &Self::Snapshot);

    /// Static warm-up / pan-back classification.
    fn history_class(&self) -> HistoryClass;
}

pub enum HistoryClass {
    /// Zero cross-bar state; pan-back evaluates only newly loaded bars.
    Independent,
    /// Finite settling depth `warmup_bars`; pan-back evaluates `warmup_bars + new_bars`.
    FiniteWarmup { warmup_bars: usize },
    /// IIR smoother or unbounded accumulator; pan-back requires full-history recompute.
    FullHistoryRequired,
}
```

### 3.3 Warm-Up, NaN, Session Calendar & Repaint-Prevention Invariants

1. **Warm-Up Bar Counts**: Every built-in declares its exact `warmup_bars` in its `StudyManifest` (e.g., `SMA(p) -> p - 1`, `RSI(p) -> p`, `MACD(12,26,9) -> 33` for signal, `ADX(p) -> 2p - 1`, `Pivot(L, R) -> L + R`) and emits `NaN` (`None` / `i64::MIN`) prior to convergence.
2. **NaN Handling Rules**: Adopt the 4-class taxonomy from §2.2.C across all 82 planned built-ins and document each indicator's NaN class in unit tests:
   - Fix `sma` using either a ring buffer with exact window recompute on `NaN` exit + Kahan/compensated sum (or periodic re-sum every `256` bars) so `NaN` never poisons permanently and drift stays `< 1 ULP`.
   - Fix `ema`, `rma`, `wilder_rsi`, `atr` to skip non-finite inputs without corrupting recursive state.
   - Fix `vwap` to require explicit `(H + L + C) / 3` (or configurable basis `hlc3`/`hl2`/`ohlc4`/`close`), anchor mode (`Session`, `DayUtc`, `WeekMon`, `Month`, `Quarter`, `Year`, `AnchoredTimestamp`, `None`), exchange session calendar (`trade_date` UTC offset / rollover hour), and optional `mask_incomplete_first_session: bool` (emitting `NaN` until the first complete session open is observed).
3. **Repainting Prevention Contract**:
   - Scripts receive only bars `0..=t` (causal evaluation) and an explicit `bar.is_forming: bool` flag.
   - Closed-bar snapshots are immutable; forming-bar updates always `restore_state()` → `update_bar()` (coalesced at `<= 10 Hz` UI / `<= 1 Hz` heavy scripts) → `restore_state()` → final closed `update_bar()` → `snapshot_state()`.
   - Higher-timeframe (`MTF`) inputs default strictly to `MtfAlignment::ConfirmedOnClose` (staircase). Any developing HTF preview requires explicit `allow_forming = true`, carries a UI warning badge, and is forbidden as a deterministic backtest/alert trigger unless explicitly acknowledged.

### 3.4 Sandbox CPU & Memory Budgets (Reconciled with `Plugin-ABI.md` & `S07`)

| Tier / Runtime | Per-Instance Memory Cap | Post-Init Growth | CPU / Execution Budget | Global Pool Cap | Determinism & Isolation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Native Rust (`allegedly-studies`)** | Bounded struct size (`<= 256 KiB` typical) | Zero per-bar heap alloc | `O(1)` / `O(log p)` per bar (`< 50 ns` target) | Tracked in `GlobalStudyMemoryPool` | Deterministic IEEE-754, zero I/O, zero PRNG |
| **Tier 2: Wasmtime (`v51.0.0`, flat SoA ABI)** | **`4 MiB`** default (`8 MiB` max via manifest override) | **Optional `0 B` post-init lock** (after `on_start`) | Fuel metering (`500k` fuel/bar, `50M` fuel/run) + epoch interruption (`5 s` batch / `16 ms` forming tick) | Shared `<= 64 MiB` terminal pool + LRU background eviction | Zero WASI, strict import allowlist, `.cwasm` AOT cache, full linear-memory snapshot/rollback |
| **Tier 3: Embedded Luau (`mlua`, `sandbox(true)`)** | **`4 MiB`** default (reconcile UI label with Rust constant — eliminate the `2 MiB` vs `8 MiB` lie!) | Enforced by `lua.set_memory_limit` | Interrupt hook (`250k` ticks/batch, `5k` ticks/forming bar) + wall-clock deadline (`2 s` batch / `10 ms` tick) | Shared `<= 64 MiB` terminal pool (`1:1` reservation, long-lived VM pool) | `os`/`io`/`package`/`debug`/`require`/`math.random` stripped; expose zero-copy `UserData` OHLCV views (remove `close_bytes` Lua string copy!) |

### 3.5 Clean-Room Naming & IP Hygiene Rules for Allegedly

- **Do NOT use** in Allegedly code, docs, or UI: `wrun`, `Pine Script`, `TradingView`, `OpenMarket`, `OpenMarket Plus`, `kScore`, or any third-party indicator suite brand names.
- **Use neutral, Allegedly-native terminology**:
  - Crate & runtime: `allegedly-studies`, `StudyManifest`, `StudyRuntime`, `StudyHost`, `WasmStudyRunner`, `LuauStudyRunner`.
  - Standard library module exposed to scripts: `ta` (universal public-domain technical analysis abbreviation), `stats`, `ring` / `history`, `bar`, `book`, `footprint`.
  - UI constructs: **Indicators**, **Study Packs** (or **Indicator Presets** / **Study Bundles**), **Custom Studies**, **Script Workspace**, **Pane Manager**.
  - Persistence: Local-first sovereign `.toml` / `.json` files in the user's Allegedly workspace directory (`~/.allegedly/studies/` and `<workspace>/studies.toml`), never cloud-locked or browser-`localStorage`-only.

---

## 4. What Allegedly Is Doing Wrong (Concrete Defects)

1. **Passing `Vec<f64>` closes from React over Tauri JSON instead of reading `PriceE9`/`QtyE9` bars from Rust core**
   - *Where*: [`crates/allegedly-studies/src/lib.rs:21-33`](../../crates/allegedly-studies/src/lib.rs#L21-L33), [`apps/desktop/src/App.tsx:225-260`](../../apps/desktop/src/App.tsx#L225-L260).
   - *Impact*: Violates `Constraints.md` #2 (fixed-point boundary), duplicates bar arrays in JS + JSON + Rust, and omits `open`, `high`, `low`, `time` entirely — making ATR, Stochastic, CCI, Ichimoku, Supertrend, PSAR, and real VWAP impossible.
2. **VWAP uses `closes` instead of HLC3, never resets on sessions, and silently fabricates unit volumes**
   - *Where*: [`crates/allegedly-studies/src/lib.rs:90-96`](../../crates/allegedly-studies/src/lib.rs#L90-L96), [`crates/allegedly-studies/src/builtins.rs:74-92`](../../crates/allegedly-studies/src/builtins.rs#L74-L92).
   - *Impact*: Produces mathematically wrong VWAP values that drift with scrollback length and silently fabricates `1.0` volume on mismatched vectors (violating `Constraints.md` #6/#8).
3. **`sma`, `ema`, and `wilder_rsi` permanently poison on any `NaN` and suffer floating-point drift**
   - *Where*: [`crates/allegedly-studies/src/builtins.rs:3-71`](../../crates/allegedly-studies/src/builtins.rs#L3-L71).
   - *Impact*: A single gap or missing tick corrupts the entire downstream series; rolling `sum += x[i]; sum -= x[i-p]` drifts over long histories.
4. **Active studies never re-evaluate on live ticks, replay steps, or symbol/timeframe changes**
   - *Where*: [`apps/desktop/src/App.tsx:515-675`](../../apps/desktop/src/App.tsx#L515-L675).
   - *Impact*: Switching from `BTCUSD` to `ES` leaves old BTC SMA/RSI numbers plotted on the new chart until manually toggled off and on.
5. **Synchronous mutex lock in Tauri `run_study` + fresh `Lua::new()` on every invocation**
   - *Where*: [`apps/desktop/src-tauri/src/main.rs:90-160`](../../apps/desktop/src-tauri/src/main.rs#L90-L160), [`crates/allegedly-studies/src/lib.rs:56-75`](../../crates/allegedly-studies/src/lib.rs#L56-L75).
   - *Impact*: Blocks the runtime mutex during script execution, discards VM state every call, and reports `memory_pool_reserved_bytes: 0` because the RAII guard drops before telemetry is read.
6. **Redundant `close_bytes` Lua string copy inside the Luau VM heap**
   - *Where*: [`crates/allegedly-studies/src/luau_sandbox.rs:171-178`](../../crates/allegedly-studies/src/luau_sandbox.rs#L171-L178).
   - *Impact*: Copies `8 * N` bytes into Rust AND into the Luau VM's 8 MiB heap even when the script only uses zero-copy `FloatSeriesView` (`close[i]`), triggering premature OOM on large histories.
7. **Memory-cap UI lie & fake offline Luau evaluation**
   - *Where*: [`apps/desktop/src/components/indicators-dialog.tsx:614`](../../apps/desktop/src/components/indicators-dialog.tsx#L614) (`Luau (2 MiB)` vs Rust `8 MiB`), [`packages/ipc-client/src/offline-sim-adapter.ts:421-436`](../../packages/ipc-client/src/offline-sim-adapter.ts#L421-L436) (returns 2-bar average for any Luau script).
   - *Impact*: Misleads users about both sandbox budgets and script correctness.
8. **Silent `±Infinity` coercion to `None`**
   - *Where*: [`crates/allegedly-studies/src/lib.rs:47-51`](../../crates/allegedly-studies/src/lib.rs#L47-L51).
   - *Impact*: Masks division-by-zero / overflow bugs in user scripts as ordinary warm-up gaps.
9. **Oscillators squashed into the price pane with hidden scale and price-formatted legend**
   - *Where*: [`apps/desktop/src/panels/chart-panel.tsx:449`](../../apps/desktop/src/panels/chart-panel.tsx#L449), [`L2349-L2361`](../../apps/desktop/src/panels/chart-panel.tsx#L2349-L2361).
   - *Impact*: RSI, CVD, and Footprint Delta render as single lines overlaid over the bottom 28% of price candles with no dedicated axis and wrong currency formatting.
10. **Luau scripts hardcoded to `overlay: true` and `localStorage` indicator persistence**
    - *Where*: [`crates/allegedly-studies/src/lib.rs:69`](../../crates/allegedly-studies/src/lib.rs#L69), [`apps/desktop/src/components/indicators-dialog.tsx`](../../apps/desktop/src/components/indicators-dialog.tsx).
    - *Impact*: Custom scripts cannot render in lower panes; favorites and saved scripts live in WebView `localStorage` instead of portable on-disk files.

---

## 5. What Allegedly Is Missing (Gap Matrix)

| Domain | OpenMarket Benchmark Capability | Allegedly Current State | Severity |
| :--- | :--- | :--- | :--- |
| **Built-in TA Catalog** | `82` stateful zero-alloc classes (`52` core + `30` extended) + slice `stats` + `History` ring buffer, bit-exact fixture tests. | `6` stateless batch functions (`sma`, `ema`, `wilder_rsi`, `vwap`, `cvd`, `footprint_delta`). | **P0** |
| **WASM Sandbox (Tier 2)** | AssemblyScript→WASM worker, `4 MiB` fixed heap, `0 B` post-init growth, allowlist validation, linear-memory snapshot/rollback. | Specified in `Plugin-ABI.md` & Spike `S07`, **not wired into `crates/allegedly-studies`**. | **P0** |
| **Incremental & Live Engine** | Causal `onStart`/`onBar`, closed-bar snapshot + forming-bar rollback (`<= 1 Hz`), pan-back static warmup optimization. | Full-array one-shot batch recompute; zero live/replay/symbol re-evaluation. | **P0** |
| **Declarative Manifest & Settings UI** | 15 typed parameter kinds, sections/presets, zero-recompile style bindings (`@param`), auto-generated settings modal. | Hardcoded periods (`SMA 20`, `RSI 14`), zero settings gear/modal, zero style controls. | **P0** |
| **Multi-Output & Rich Plots** | Multi-series (`BB`, `MACD`, `Ichimoku`, `ADX`), histograms, fills/bands, candles, shapes, boxes/segments, footprint/TPO/profile/heatmap/matrix, HUD/table. | Single `LineSeries` per study only; no lower panes (squashed into main pane). | **P0 / P1** |
| **Luau Host Ergonomics** | *(Comparable to script stdlib)* Full OHLCV + `ta.*` + `History` + params + multi-output + persistent bar state. | Only `close` + `close_bytes` + `close_len`; single output; overlay-only; no `ta.*`. | **P0 / P1** |
| **Multi-Timeframe & Microstructure** | Non-repainting confirmed HTF pins, celled HTF/intrabar candles, flat orderbook/footprint/profile/trade-size/tape/OI/options cells, `time.trade_date`. | `App.tsx` lacks even `O/H/L/time`; no MTF or celled microstructure study inputs. | **P1** |
| **Authoring IDE & Diagnostics** | Multi-stage diagnostics, console inspector (`sheet`, `last N`), starter templates, forkable built-ins, LLM context export, heavy-render badge. | Raw `<textarea>` in modal with generic error string. | **P1 / P2** |
| **Library UX & Study Bundles** | 8 categories, abbreviation search, `Shift+Click` apply-to-all-charts, reusable multi-indicator Suites (up to 8), recents, legend context menu. | Flat hardcoded list, broken `fundamentals` tab, no bundles, no legend gear/menu. | **P1 / P2** |
| **Strategy / Alert Unification** | Same script emits plots, edge-triggered alerts, and replay/backtest strategy orders. | Disconnected `paper-oms-panel.tsx` buttons; no alert/strategy study hooks. | **P2** |

---

## 6. Prioritized Implementation Suggestions (P0 / P1 / P2)

### P0 — Foundation & Correctness (Fix Broken Architecture First)

1. **Enforce the Rust Fixed-Point Study Boundary (`crates/allegedly-studies`, `crates/allegedly-app`)**:
   - Replace `StudyRunRequest { closes: Vec<f64>, ... }` with a bar-store query handle (`symbol`, `timeframe`, `range`, `params`) so Rust reads canonical `PriceE9`/`QtyE9` OHLCV + `buy_vol`/`sell_vol` + `timestamp_ns` directly from core storage and converts `i64 -> f64` strictly inside `allegedly-studies`.
   - Move `run_study` execution off the synchronous app runtime lock onto a dedicated study worker pool (`tokio::task::spawn_blocking` / rayon study lane) with bounded concurrency.
2. **Implement `IncrementalStudy` + Fix Existing 6 Built-Ins + Expand to Tier-1 Core 25**:
   - Refactor `builtins.rs` into stateful `IncrementalStudy` implementations with `snapshot_state()` / `restore_state()` and exact `HistoryClass`.
   - Fix `sma` (ring buffer + NaN self-healing + compensated sum), `ema` / `wilder_rsi` (NaN-skipping), `vwap` (true `HLC3`, session/UTC/exchange-trade-date anchor resets, optional incomplete-first-session `NaN` mask, fail-loud on missing volume instead of fabricating `1.0`), and `cvd` (optional session reset).
   - Add a **bit-exact golden fixture test suite** (690+ bar fixture with injected `NaN` gaps, flat bars, zero-volume bars, and session rollovers) covering the P0 Core 25: `Sma`, `Ema`, `Rma`, `Wma`, `Hma`, `Vwma`, `Rsi`, `Macd`, `Stoch`, `Cci`, `Mfi`, `Obv`, `Tr`, `Atr`, `Bb`, `Keltner`, `Donchian`, `Adx`/`Dmi`, `Supertrend`, `Psar`, `Ichimoku` (causal `chikou`), `Vwap`, `PivotHigh`/`PivotLow`, `Cross`, `History`.
   - Fail loudly on `±Infinity` outputs rather than silently coercing to `None`.
3. **Wire Live Tick, Replay Step & Symbol/Timeframe Lifecycle (`apps/desktop/src/App.tsx`, `chart-panel.tsx`)**:
   - Bind active studies to chart `(symbol, timeframe)` state so symbol/timeframe switches trigger clean reset + batch warmup, and live ticks / replay steps invoke incremental forming-bar rollback (`restore_state` → `update_bar`).
   - Add **real stacked lower chart panes** with visible independent Y-axes, unit-aware legend formatting (`Price`, `Percent`, `Volume`, `Delta`, `Ratio`), and multi-output series support (`Line`, `Histogram`, `Area`, `BandFill`, `Markers`).
4. **Declarative `StudyManifest` + Settings Dialog + Sovereign Persistence**:
   - Define `StudyManifest` (typed params: `Int`, `Float`, `Bool`, `Choice`, `Color`, `Source`, `Timeframe`, `Session`; outputs with `unit`, `pane`, `plot_kind`; `overlay` bool) so built-ins, WASM modules, and Luau scripts share one auto-generated settings modal triggered from a **legend gear icon**.
   - Persist favorite indicators, saved parameter presets, and custom scripts to `<workspace>/studies/` (`.toml` + `.lua`/`.wasm`) instead of WebView `localStorage`.
5. **Fix Luau Sandbox & Offline Adapter Honesty**:
   - Pool long-lived `LuauStudyRunner` instances per active study (stopping per-call `Lua::new()` churn and fixing pool telemetry), remove the wasteful `close_bytes` Lua string copy, expose zero-copy `open`/`high`/`low`/`close`/`volume`/`buy_vol`/`sell_vol`/`time` + `ta.*` host intrinsics, support `overlay: bool` + multi-output returns, reconcile UI memory cap badge with Rust (`4 MiB` default), and replace the fake `offline-sim-adapter.ts` Luau fallback with an explicit `"Luau sandbox requires desktop Rust runtime"` error.

### P1 — Parity & Competitive Differentiation

1. **Integrate Tier-2 Wasmtime Runner (`crates/allegedly-studies/src/wasm_sandbox.rs`)**:
   - Promote Spike `S07` into `allegedly-studies` using Wasmtime `v51.0.0`, flat SoA linear-memory ABI (`Plugin-ABI.md`), `4 MiB` fixed memory (`0 B` growth option post-`on_start`), fuel + epoch deadlines, `.cwasm` AOT caching, and linear-memory snapshot/rollback for forming bars.
   - Support compiling Rust/AssemblyScript/C studies to this ABI with versioned frozen ABI headers (`allegedly-study-abi-v1`).
2. **Complete Full 82-Indicator Built-In Parity + `stats` Module**:
   - Add remaining 57 indicators (`Alma`, `Swma`, `Linreg`, `Dema`, `Tema`, `Zlema`, `Tsi`, `Cmo`, `Wpr`, `Trix`, `Ultimate`, `Vortex`, `Aroon`, `Choppiness`, `Efficiency`, `Kama`, `Bbw`, `Kcw`, `AccDist`, `Nvi`/`Pvi`, `Pvt`, `Zscore`, `Correlation`, `Percentile`, `PercentRank`, `HeikinAshi`, etc.) plus allocation-free `stats` helpers.
3. **Non-Repainting Multi-Timeframe (MTF) & Celled Microstructure Inputs**:
   - Expose confirmed-on-close HTF inputs (`MtfAlignment::ConfirmedOnClose` default) + intrabar sub-bar slices + flat celled `footprint`, `volume_profile`, `book_depth`, and `trade_size_buckets` buffers to all three runtime tiers, backed by an exchange session calendar (`trade_date` for CME/NYSE/crypto UTC).
4. **Library UX, Study Bundles & Built-In Source Inspection**:
   - Upgrade `indicators-dialog.tsx` to categorized library (`Technical`, `Order Flow & Footprint`, `Volume Profile & TPO`, `Derivatives & OI`, `Market Internals`, `My Scripts`, `Study Bundles`), abbreviation-aware search (`Cmd/Ctrl+K`), `Shift+Click` apply-to-all-charts, reusable **Study Bundles** (up to 8 pre-configured studies saved as `.toml`), and one-click "View / Fork Built-in" (shipping canonical readable Luau/Rust reference scripts).
5. **Rich Orderflow & Non-Time-Axis Plot Primitives**:
   - Add declarative `footprint`, `tpo`, `profile`, `heatmap`, `box`, `segment`, `hud`, and `table` render primitives with strict draw-count / cell-count budgets and a "Heavy" paint-weight indicator.

### P2 — Power Authoring, Cookbook & Strategy Unification

1. **In-App Script Workspace & Multi-Stage Diagnostics**:
   - Replace the modal `<textarea>` with a split Script Editor panel featuring multi-stage diagnostics (declaration → lint → compile → ABI validate → NaN check), an inspection console (`manifest`, `last N <output>`, debug log), and one-click **"Copy Context for LLM"** export.
2. **Ship Local-First Clean-Room Cookbook (30–50 Starter Recipes)**:
   - Ship MIT/Apache-2.0 clean-room starter scripts organized by domain: *On Price* (Session Anchored VWAP, HTF Regime Gate, Pivot Structure), *Order Flow* (Cross-Venue CVD, Absorption Detector, Stacked Footprint Imbalances), *HUDs* (Session Stats HUD, Book Imbalance Card), *Profiles & Matrices* (Docked VRVP, Correlation Matrix), and *Strategies* (ATR Risk-Sized Mean Reversion).
3. **Unified Alert & Deterministic Replay Strategy Hooks**:
   - Allow `StudyManifest` to declare edge-triggered alerts and strategy signals executed identically across live feeds and Allegedly's 100M-tick replay backtest engine (`S08`), plus static pan-back `HistoryClass` optimization.

---

## 7. Inferences, Risks & Open Questions

### Inferences
- **Why OpenMarket's AssemblyScript/WASM model feels snappy despite running in a browser**: Zero post-init allocation, fixed `4 MiB` linear memory, `<= 1 Hz` forming-bar throttling, linear-memory snapshot rollback, and compiler-proved pan-back warmup windows eliminate GC pauses and redundant history recomputes. Allegedly has an even larger structural advantage because Tier-1 native Rust and Tier-2 native Wasmtime execute directly on desktop CPU cores against memory-mapped local tick storage without browser serialization overhead.
- **Why Allegedly should keep both Tier-2 Wasmtime AND Tier-3 Luau**: Luau (`mlua`) gives zero-toolchain instant edit-and-run scripting for traders (no external compiler needed), while Wasmtime (`v51.0.0`) delivers near-native speed, strict fixed-memory snapshots, and multi-language extensibility (Rust, AssemblyScript, C, Zig) for heavy footprint/ML/orderflow studies.

### Open Questions & Unverified Items
1. **`UNVERIFIED` — AssemblyScript Compiler Bundling**: OpenMarket compiles AssemblyScript inside a browser Web Worker (`~300 KB` JS compiler bundle). Whether Allegedly should bundle an offline AssemblyScript→WASM compiler in the desktop app (so users can author TS-like Tier-2 WASM scripts without installing Rust) or keep Luau as the built-in zero-toolchain language and Rust/WASM as the compiled SDK is an open product decision.
2. **`UNVERIFIED` — OpenMarket Internal Pan-Back AST Analyzer**: Exact AST rules used by OpenMarket's compiler to prove `history_independent` vs `history_warmup(W)` were inferred from its public execution-model docs; exact internal compiler heuristics are not open-source (`UNVERIFIED`). For Allegedly Tier-1 Rust built-ins, explicit `HistoryClass` trait metadata achieves the same optimization with zero compiler complexity.
3. **`UNVERIFIED` — Cross-Venue Live Feed Normalization for `follow: "coin"`**: OpenMarket's Aggregated CVD relies on a managed server-side symbology map across venues. In Allegedly's local-first architecture, multi-venue aggregation depends on user-configured local adapters and a local `.toml` instrument-mapping registry (owned by ingestion/symbology research).
4. **Open Question — Multi-Pane Chart Library Limits**: Verify whether Allegedly's current charting canvas (`chart-panel.tsx` / lightweight-charts or custom WebGL renderer) supports dynamic stacked panes with independent synced time scales and custom non-time-axis overlays (`profile`, `matrix`, `heatmap`) without React re-renders in the 60 fps loop.

---

## 8. Sources Table

| Source ID | Source URL / File | Retrieved Date | How Verified | Confidence |
| :--- | :--- | :--- | :--- | :--- |
| `OMA-02-S01` | `https://openmarket.xyz/wrun/llms.txt` | `2026-11-27` | Direct HTTP fetch (`read_url_content`) of full docs index | High |
| `OMA-02-S02` | `https://openmarket.xyz/wrun/introduction` | `2026-11-27` | Direct HTTP fetch of Get Started overview | High |
| `OMA-02-S03` | `https://openmarket.xyz/wrun/the-editor.md` | `2026-11-27` | Direct HTTP fetch of editor pipeline, console & IDE docs | High |
| `OMA-02-S04` | `https://openmarket.xyz/wrun/wrun-vs-pine.md` | `2026-11-27` | Direct HTTP fetch of language/execution comparison docs | High |
| `OMA-02-S05` | `https://openmarket.xyz/wrun/functions/publishing.md` | `2026-11-27` | Direct HTTP fetch of versioning & visibility docs | High |
| `OMA-02-S06` | `https://openmarket.xyz/wrun/functions/ta-library.md` | `2026-11-27` | Direct HTTP fetch of all 52 core TA classes & NaN/warmup rules | High |
| `OMA-02-S07` | `https://openmarket.xyz/wrun/functions/extra-indicators.md` | `2026-11-27` | Direct HTTP fetch of all 30 extended TA classes | High |
| `OMA-02-S08` | `https://openmarket.xyz/wrun/functions/trend-indicators.md` | `2026-11-27` | Direct HTTP fetch of ADX/Ichimoku/PSAR/Supertrend/VWAP specs | High |
| `OMA-02-S09` | `https://openmarket.xyz/wrun/functions/volume-indicators.md` | `2026-11-27` | Direct HTTP fetch of volume & money-flow indicator specs | High |
| `OMA-02-S10` | `https://openmarket.xyz/wrun/functions/stats-history-lists.md` | `2026-11-27` | Direct HTTP fetch of allocation-free stats, `History` & ring utils | High |
| `OMA-02-S11` | `https://openmarket.xyz/wrun/core-concepts/execution-model` | `2026-11-27` | Direct HTTP fetch of bar-by-bar, rollback & pan-back proof docs | High |
| `OMA-02-S12` | `https://openmarket.xyz/wrun/core-concepts/repainting.md` | `2026-11-27` | Direct HTTP fetch of repaint prevention & forming-bar semantics | High |
| `OMA-02-S13` | `https://openmarket.xyz/wrun/core-concepts/multi-timeframe.md` | `2026-11-27` | Direct HTTP fetch of 3 MTF modes & bucket math | High |
| `OMA-02-S14` | `https://openmarket.xyz/wrun/core-concepts/core-variables.md` | `2026-11-27` | Direct HTTP fetch of core & microstructure celled inputs | High |
| `OMA-02-S15` | `https://openmarket.xyz/wrun/core-concepts/na-and-scalar-types.md` | `2026-11-27` | Direct HTTP fetch of scalar/NaN handling rules | High |
| `OMA-02-S16` | `https://openmarket.xyz/wrun/reference/quick-reference` & `declarations.md` | `2026-11-27` | Direct HTTP fetch of declaration sheet, 15 param kinds & outputs | High |
| `OMA-02-S17` | `https://openmarket.xyz/wrun/reference/limits.md` & `limitations.md` | `2026-11-27` | Direct HTTP fetch of memory, timeout, cell & render caps | High |
| `OMA-02-S18` | `https://openmarket.xyz/wrun/reference/symbol-format.md` | `2026-11-27` | Direct HTTP fetch of venue-native symbol rules | High |
| `OMA-02-S19` | `https://openmarket.xyz/wrun/reference/versions.md` | `2026-11-27` | Direct HTTP fetch of frozen ABI contract versioning | High |
| `OMA-02-S20` | `https://openmarket.xyz/wrun/cookbook/overview` | `2026-11-27` | Direct HTTP fetch of 6 recipe groups & template inventory | High |
| `OMA-02-S21` | `https://openmarket.xyz/wrun/cookbook/{anchored-vwap,aggregated-cvd,absorption,volume-footprint,strategy-risk-reversion}.md` | `2026-11-27` | Direct HTTP fetch of 5 representative cookbook implementations | High |
| `OMA-02-S22` | `https://openmarket.xyz/learn/indicators` | `2026-11-27` | Direct HTTP fetch of Learn Indicators UI, 8 categories & suites | High |
| `OMA-02-S23` | Allegedly repo (`crates/allegedly-studies`, `crates/allegedly-app`, `apps/desktop`, `packages/ipc-client`, `01-Charter/Constraints.md`, `04-Architecture/Plugin-ABI.md`) | `2026-11-27` | Direct source file inspection (`client_view_file`) | High |
