---
title: "External Reference Audit 03 — Strategies, Order Flow & Alerts"
track: OpenMarket-Audit
owner: research-execution (Allegedly Spikes OMS)
status: verified
created: 2026-11-27
updated: 2026-11-27
scope: "Paper/Local-Sim OMS, Replay, Strategy Testing, Alerts, and Order Flow Engine"
---

# External Reference Audit 03: Strategies, Order Flow & Alerts

> [!IMPORTANT]
> **Clean-Room & IP Hygiene Attestation ([R09-Legal-Licensing.md](../../02-Research/R09-Legal-Licensing.md)):**
> This document records a clean-room functional audit of publicly accessible reference documentation covering strategy backtesting, alert systems, and order-flow analytics. All descriptions below are written exclusively in original technical prose describing standard execution math, auction-market-theory (AMT) mechanics, inputs, outputs, and accounting invariants. Zero text is copied verbatim, and zero third-party product names, scripting language names, or trademarked UI labels are adopted into Allegedly's design. All execution recommendations strictly adhere to Allegedly's **Paper / Local-Sim Only** boundary (`LIVE_TRADING_COMPILED_IN = false`, zero live broker orders, zero forbidden prop-firm adapters).

---

## 1. Allegedly Baseline Inventory (Verified From Codebase)

Before comparing external mechanics, every relevant Allegedly crate, frontend renderer, and research baseline was audited directly from disk.

### 1.1 Order Management & Paper Simulation (`crates/allegedly-oms/`)

| File | Verified Capabilities | Verified Gaps & Defects |
| :--- | :--- | :--- |
| [lib.rs](../../crates/allegedly-oms/src/lib.rs) | [`LocalPaperOms`](../../crates/allegedly-oms/src/lib.rs), [`OrderRecord`](../../crates/allegedly-oms/src/lib.rs), [`FORBIDDEN_DO_NOT_BUILD_ADAPTERS`](../../crates/allegedly-oms/src/lib.rs) (9 blocked prop/unauthorized gateways), compile-time [`LIVE_TRADING_COMPILED_IN`](../../crates/allegedly-oms/src/lib.rs) guard (default `false`), batched `kill_switch_cancel_all`. | `submit_order_with_mark` fills **only** `OrderType::Market` synchronously at `mark_price_e9`; `Limit`, `Stop`, and `StopLimit` are stored as `Acked` and **never match** against ticks or bars. `OrderRequest.oco_group_id` is accepted and silently discarded. No `stop_price`, trailing stop, bracket legs, average entry price, cash/equity ledger, fees, slippage, margin, funding, or `BrokerAdapter` trait. |
| [state.rs](../../crates/allegedly-oms/src/state.rs) | 12-state [`OrderState`](../../crates/allegedly-oms/src/state.rs) FSM (`PendingLocal` through `Orphaned`), explicit transition whitelist (`can_transition`), [`OrderSide`](../../crates/allegedly-oms/src/state.rs), [`OrderType`](../../crates/allegedly-oms/src/state.rs), [`OrderRequest`](../../crates/allegedly-oms/src/state.rs). | `OrderRequest` has `limit_price: Option<PriceE9>` and `oco_group_id: Option<Uuid>`, but lacks `stop_price: Option<PriceE9>`, `trail_points`, `trail_offset`, `time_in_force`, and parent/child bracket metadata. |
| [risk.rs](../../crates/allegedly-oms/src/risk.rs) | [`RiskGate`](../../crates/allegedly-oms/src/risk.rs) implementing the Risk-Reduction Bypass Rule (cancels, kill-switch, reconciliation, and strictly position-reducing `reduce_only` orders bypass `BookState != Live` and `reconciling`). | Hardcodes `max_order_qty_e9: 100_000_000_000` (100 units regardless of contract/coin scale). Missing correlated product-group anti-hedging (`ES`/`MES`, `NQ`/`MNQ`), daily drawdown breaker, order-rate circuit breaker, and notional/margin admission checks. |
| [journal.rs](../../crates/allegedly-oms/src/journal.rs) | [`OrderJournal`](../../crates/allegedly-oms/src/journal.rs) on SQLite WAL (`PaperSim` uses `synchronous=NORMAL`; `BrokerLive` uses `synchronous=FULL` + `fullfsync=ON`; single-transaction batched Kill-Switch commit). | Schema stores `limit_price_e9` only — lacks `stop_price_e9`, `oco_group_id`, `fill_price_e9`, `fee_micros`, `slippage_bps`, `strategy_id`, and a closed-trades ledger table. |

### 1.2 Deterministic Replay (`crates/allegedly-replay/`)

| File | Verified Capabilities | Verified Gaps & Defects |
| :--- | :--- | :--- |
| [lib.rs](../../crates/allegedly-replay/src/lib.rs) | [`IncrementalReplayEngine`](../../crates/allegedly-replay/src/lib.rs), [`ReplaySession`](../../crates/allegedly-replay/src/lib.rs) (in-memory or `.atvault` streaming via `AtVaultBlockReader`), [`ReplaySpeed`](../../crates/allegedly-replay/src/lib.rs) (`1x`/`5x`/`50x`/`max`), SHA-256 bit-exact cross-speed determinism check (`SV-09`), bounded `REPLAY_ARENA_MAX_BARS = 512` eviction, VWAP + Footprint stepping. | Feeds ticks **only** into `FootprintSlabArena` and `VwapAccumulator`. Zero hook for paper OMS order matching, strategy script execution (`on_bar`), equity/trade recording, TPO, SVP, CVD, or L2 heatmap stepping. `batch_step()` uses fixed tick counts (8/40/400/2000) rather than `ts_exchange_ns` pacing. Hardcodes `Bps(30_000)` imbalance threshold. Backward seek replays from tick 0 (no checkpoint snapshots). |

### 1.3 Order Flow Engine & Renderer (`crates/allegedly-orderflow/`, `allegedly-ipc`, `allegedly-app`, `apps/desktop/`)

| File | Verified Capabilities | Verified Gaps & Defects |
| :--- | :--- | :--- |
| [footprint.rs](../../crates/allegedly-orderflow/src/footprint.rs) | [`FootprintSlabArena`](../../crates/allegedly-orderflow/src/footprint.rs) with 32-byte `FootprintCell`, `BarSlice`, `div_euclid` bucketing, backwards out-of-order tick drop (`late_ticks_dropped`), `i128` diagonal imbalance check (`ask[i]*10_000 >= bid[i-1]*ratio`), POC flagging, bar eviction with offset compaction. | Imbalances and POC are computed **only** inside `seal_active_bar()`, never on the live forming bar. `BIT_UNFINISHED` is never computed. No `row_ticks` grouping multiplier `G`, no `min_volume` threshold or `ignore_zeros` toggle, no stacked imbalances, no absorption detection, no bar VAH/VAL, no intrabar min/max delta, no per-bar `ProvenanceTier`. |
| [tpo.rs](../../crates/allegedly-orderflow/src/tpo.rs) | [`TpoProfile`](../../crates/allegedly-orderflow/src/tpo.rs) with `BTreeMap<i64, u128>` bitmask (up to 128 periods), `rows_128()`, single-row 70% VA (`summary()`), exact `PriceTicks` `magnet_snap()`. | Uses floor division `(total * 70) / 100` instead of ceiling division and hardcodes 70%. Single-row step-out only (missing CME/Steidlmayer dual-row step-out and center-proximity POC tie-break). Missing IB/IBR, extensions, opening/closing range, poor high/low, single prints, tails, developing POC/VA, naked extensions, session split/merge, RTH/ETH clocks, and statistics summary. |
| [vrvp.rs](../../crates/allegedly-orderflow/src/vrvp.rs) | [`DyadicVrvpTree`](../../crates/allegedly-orderflow/src/vrvp.rs) (16-ary segment tree at levels 0/16/256) + integer `compute_value_area(&bins, bps)`. | Uses floor division `(total_vol * bps) / 10_000` instead of ceiling division; single-row step-out only; lowest-price POC tie-break. **Not actually wired into `allegedly-app` runtime!** No Session Volume Profile (SVP), HVN/LVN, or developing levels. |
| [framing.rs](../../crates/allegedly-ipc/src/framing.rs) | Binary IPC frame types (`FootprintSlabSoa = 0x0002`, `LiveL2BookBatch = 0x0102`, `LiveFootprintDelta`, `VpBins`, `TpoRows`) and bitflag constants (`BIT_BUY_IMBAL = 1`, `BIT_SELL_IMBAL = 2`, `BIT_POC = 4`, `BIT_UNFINISHED = 8`). | `FootprintSlabSoa` is unused in `allegedly-app` (historical footprint bars are never streamed). Bitflags conflict directly with the frontend WebGL2 renderer (see §4.1). |
| [builtins.rs](../../crates/allegedly-studies/src/builtins.rs) | Built-in indicator helpers including `footprint_delta_series` and `cvd_series`. | **Uses `f64` slices (`&[f64] -> Vec<f64>`)**, violating Allegedly's zero-float money/quantity invariant (`Constraints.md` §1.7). No intrabar OHLC delta, no session/anchored resets, no multi-venue aggregation, no provenance tagging. |
| [provenance.rs](../../crates/allegedly-core/src/provenance.rs) | 5-tier [`ProvenanceTier`](../../crates/allegedly-core/src/provenance.rs) (`ExactL3Mbo`, `ExactTickAggr`, `EstimatedL1Quote`, `EstimatedTickRule`, `SyntheticIntrabar`). | `supports_absorption_triggers()` returns `true` for `EstimatedTickRule` and `EstimatedL1Quote`, which is too permissive for automated orderflow/absorption alert triggers. |
| [lib.rs](../../crates/allegedly-app/src/lib.rs) | Desktop backend wiring live/sim feeds into IPC frames (`vrvp_bins`, `tpo`, `footprint`, synthetic 12-level L2 book). | Accumulates unbounded `vrvp_bins` since boot (bypasses `DyadicVrvpTree`), drives TPO brackets off `(frame_seq / 12) % 96` instead of exchange timestamps/session clocks, stamps `ProvenanceTier::ExactTickAggr` onto synthetic L2 books, and streams only the active footprint bar. |
| [webgl2-orderflow-overlay.ts](../../apps/desktop/src/render/webgl2-orderflow-overlay.ts) | Instanced WebGL2 quad renderer (`MAX_QUADS = 16_384`) composited synchronously inside Lightweight Charts' `ISeriesPrimitive` pass (zero drag drift). | **Swaps `BIT_SELL_IMBAL` (`1 << 0`) and `BIT_BUY_IMBAL` (`1 << 1`)** relative to Rust IPC. Renders only the single active footprint bar (no historical bars, no text/glyph atlas, no zoom LOD). Renders TPO as an undifferentiated left-margin purple bar. Zero heatmap shader or texture pipeline. |
| [paper-oms-panel.tsx](../../apps/desktop/src/panels/paper-oms-panel.tsx) | React UI chrome for paper order ticket, open orders, kill switch. | Only supports basic order submission against `LocalPaperOms`; no Strategy Tester panel, no Alerts tab/dialog, no equity curve/trade ledger UI. |

**Cross-referenced design baselines:** [R04-Execution-Brokers-Props.md](../../02-Research/R04-Execution-Brokers-Props.md) (broker legality, 8-prop-firm DO-NOT-BUILD audit, OMS state machine & reconciliation specs) and [R05-Orderflow-Profile-Tooling.md](../../02-Research/R05-Orderflow-Profile-Tooling.md) (5-tool integer orderflow algorithms, CME dual-row VA, keyframe+delta L2 heatmap ring buffer, WebGL2 `R16Uint` tile architecture).

---

## 2. Clean-Room Reference Analysis

The following summarizes the observable functional mechanics, execution semantics, inputs, and edge-case safeguards across the three audited domains, translated strictly into vendor-neutral engineering terms.

### 2.1 Strategies & Strategy Backtester

1. **Unified Script & Strategy Declaration Model**
   - A strategy is a standard chart study script augmented with a declarative broker-configuration header specifying: initial capital, quote currency, default sizing mode (`fixed` units, `percent_of_equity`, or fixed `cash` allocation), commission rate, slippage basis points and slippage model, pyramiding cap (maximum concurrent same-direction entries), intrabar fill resolution model, and instrument accounting mode (`spot` vs `perpetual_margin`).
   - Numeric configuration parameters can bind directly to user-editable study inputs so traders can sweep sizing, leverage, or risk thresholds from the UI without editing or recompiling script code.

2. **Deterministic Confirmed-Bar Execution Pipeline (Zero Lookahead)**
   - Every historical confirmed bar `N` executes six strictly ordered phases before advancing to bar `N+1`:
     1. **Periodic Funding Settlement (Perpetuals/Margin only):** If a position is open at bar `N` and funding data is available for that timestamp, settle funding against isolated margin. If margin falls to or below zero, liquidate immediately at bar open and record any bankruptcy deficit.
     2. **Protective Exit Evaluation:** Evaluate resting `stop`, `limit`, and `trailing_stop` orders attached to open positions. Trailing stops track favorable excursion from entry until an optional activation distance is crossed, then ratchet a trailing stop level by the configured offset. Support One-Cancels-All (OCA) both internally per exit ID (stop + target pair) and across named user-defined OCA groups.
     3. **Pending Signal Exits:** Process explicit close / flatten instructions queued on bar `N-1` in FIFO insertion order.
     4. **Pending Entry Orders:** Process entries queued on bar `N-1`:
        - *Market entries* fill at bar `N` open adjusted adversely by configured slippage.
        - *Resting limit entries* fill if bar `N`'s high/low range reaches the limit price, filling at the better of bar open (gap-through) or limit price with zero slippage.
        - *Resting stop entries* trigger when bar `N` touches the stop level, filling at the worse of bar open or stop price plus adverse slippage.
        - *Position reversals* atomically close the existing exposure and open the opposite leg in a single transition.
        - *Admission checks* enforce pyramiding limits, positive equity, and initial margin availability; rejected orders increment a `rejected_orders` counter rather than throwing runtime exceptions.
     5. **Phase-End Liquidation Check (Perpetuals/Margin only):** Compute the isolated liquidation threshold from entry price, leverage, and maintenance margin rate; if bar `N`'s extreme breaches liquidation, force-close the position, floor account equity at zero, and accumulate any unrecovered deficit into `bankruptcy_deficit`.
     6. **Script `on_bar()` Execution:** Invoke user script logic at bar `N` close. Position/equity getters expose post-fill state for bar `N`; any newly submitted orders queue strictly for evaluation on bar `N+1`.

3. **Intrabar Disambiguation & Honest Disclosure**
   - When both a stop-loss and a take-profit fall inside the same OHLC bar `N`:
     - **Pessimistic mode (default):** Always assumes the adverse leg (stop) hits first.
     - **Path-heuristic mode:** Infers intrabar sequencing from candle polarity (`open -> low -> high -> close` on green bars; `open -> high -> low -> close` on red bars) when sub-bar data is absent.
     - **Fine-grained resolution:** When lower-timeframe bars or tick data exist, replay intrabar ticks/sub-bars chronologically to determine the exact hit order, tracking `fine_resolved_count` and `fine_fill_coverage_pct`.
   - Every unresolved contested bar increments an `ambiguous_fill_count` metric and marks the affected trade row with a visible `±` ambiguity badge.
   - If a user requests order-book-derived slippage (`book_estimate`) on a feed without historical L2 book depth, the engine **explicitly refuses to run** with an actionable error instead of silently falling back to fixed bps.
   - Missing funding intervals increment `funding_unavailable_count` rather than inventing synthetic rates.

4. **Live Forming-Bar Isolation (Anti-Repainting Guarantee)**
   - During live streaming, the forming bar is evaluated on a cloned broker snapshot throttled to ~1 Hz. Equity is marked-to-market at current price, **zero simulated fills occur on the forming bar**, and orders emitted mid-bar are counted as rejected/deferred until the bar officially seals. Once confirmed, the bar folds once into canonical state so live results match a fresh historical re-run bit-for-bit.

5. **Strategy Backtester UI & Metric Suite**
   - **Overview tab:** Headline KPIs, interactive equity curve with synchronized underwater drawdown lane, Buy-and-Hold benchmark overlay, and (for leveraged instruments) margin utilization / cumulative funding sub-charts plus liquidation alerts.
   - **Performance tab:** Grouped Returns, Risk, Trade stats, Long-vs-Short column split, PnL distribution histogram, and max win/loss streak counters.
   - **Trades tab:** Filterable Closed (showing `Exit via` reason and `±` ambiguity badge), Open, and Pending order lists; clicking any row scrolls and centers the chart on that trade.
   - **Run Details & Compare Mode:** Transparent disclosure of fill model, fees, slippage, fine-resolution coverage, and rejected orders; multi-strategy comparison normalizing equity curves, showing a combined portfolio column and pairwise return correlation matrix.
   - **Chart Markers:** Entry/exit markers overlaid on candles, automatically clustering into compact count pills when visible trade count exceeds ~150 to avoid canvas clutter.
   - **Standardized Stats Reference:** Net profit (currency & %), Gross profit/loss, Profit factor, Buy & Hold return %, Win rate, Avg trade / Avg win / Avg loss, Payoff ratio, Largest win/loss, Avg bars held, Max drawdown (currency & %), Max runup, Annualized Sharpe & Sortino (computed over confirmed bars only with `bars_per_year = 31_536_000_000 / interval_ms`), Time-in-market exposure %, Maker vs Taker fee breakdown, Funding paid/received, Liquidation count & deficit, and Simulation-quality counters.

---

### 2.2 Alerts & Signal Delivery

1. **Creation Surfaces & Trigger Types**
   - **Price & Drawing alerts:** Right-click chart price, toolbar bell, or watchlist row menu; draggable chart price lines (hidden on dense layouts like 3×3/4×4); alerts attached to drawings move dynamically with the drawing geometry.
   - **Indicator output conditions:** Trigger against any plotted series via Crossing (`above`, `below`, `gt`, `lt`), Channel (`entering`, `exiting`, `inside`, `outside`), or Moving (`up`, `down`, `up_%`, `down_%`).
   - **Script-declared named signals:** Scripts declare up to 64 named alerts with a boolean/nonzero condition gate (`when`), firing cadence (default edge-triggered on `false -> true`, or optional `every_bar`), human-readable `title`/`description`, static templated `message` (supporting `{{symbol}}`, `{{close}}`, `{{<output>}}`), or dynamic per-bar string output slot.
   - **Strategy lifecycle triggers:** Built-in reserved event triggers for `order_placed`, `trade_opened`, `trade_closed`, `position_changed`, and `equity_changed`.

2. **Evaluation Cadence, Windowing & Pre-Flight Eligibility**
   - **Cadence:** Choice of `once_per_bar_close` (guaranteed non-repainting) or intrabar coalesced evaluation (max 1 Hz on forming bar — tracks intrabar wick extremes, explicitly documenting that sub-second round-trips can be missed).
   - **Bounded lookback:** Evaluates on a rolling primary window (e.g., 600 bars) with capped secondary-stream history (e.g., 2,000 bars) and explicit script `warmup(N)` declarations.
   - **Deterministic pre-flight eligibility validator:** Before arming any script alert, a shared validator verifies venue allowlist, supported interval, script ABI shape, foreign/index symbol permissions, timeframe alignment, parameter bounds, required venue data availability, and non-empty alertable outputs.
   - **Runtime fault tolerance:** Repeated evaluation errors transition the alert to a visible `paused_runtime` state with bounded automatic recovery retries rather than silently dying.

3. **Delivery Channels, Audio & Payload Sanitization**
   - **Channels:** In-app toast, native OS / browser notifications, client-side audio cues (rate-limited to <= 4/sec, prioritized by declaration order, strictly muted during history load, replay scrub, and settings edits), email, and HTTPS webhooks (with reusable saved destinations and formatting presets for generic JSON, Discord, and Telegram chat routing).
   - **Delivery observability:** Failed webhook deliveries mark the alert history entry `not_delivered` and emit a rate-limited diagnostic notice (max once per day per destination).
   - **Security sanitization:** Cap rendered alert text (e.g., 200 chars), strip bidirectional override/control/zero-width Unicode characters, neutralize chat mention pings (`@everyone`, `@here`), render URLs as non-clickable text, and prohibit double-interpolation of dynamic script strings.

---

### 2.3 Order Flow Suite

1. **Footprint (Bid/Ask Cluster Bars)**
   - **Display modes:** Split Bid×Ask, Delta, Total Volume, Cluster/Profile histogram, Imbalance-only, Ladder, and configurable 1–4 column layouts (including Diagonal Delta and Delta %).
   - **Zoom-adaptive LOD:** Smoothly collapses text numbers -> colored heatmap cells -> solid candles as horizontal pixel width shrinks below readable legibility thresholds.
   - **Imbalance & auction structure:** Configurable diagonal vs horizontal comparison, ratio threshold (e.g., 300%), minimum row volume filter, ignore-zero toggle, stacked imbalances (N consecutive rows) with naked extension rays, Bar POC / VAH / VAL, Unfinished Auctions (nonzero bid at bar high or nonzero ask at bar low), largest/smallest row highlights, and conditional cell filters (`highlight` or `show_only`).
   - **Per-bar footer statistics (11 toggleable rows):** Total Volume, Buy Volume, Sell Volume, Bar Delta, Delta %, Cumulative Delta, POC Price, Bar Range, Delta Change, Volume Above POC, Volume Below POC.
   - **Ergonomics & aggregation:** Optional pointer zoom card for dense cells, unit-scoped persistence (contract/coin thresholds scoped per market+interval; USD thresholds shared globally), optional crypto liquidation markers, and multi-exchange aggregated footprints.

2. **TPO / Market Profile**
   - **Visual modes & coloring:** Letters, colored blocks, or volume-only; 4 color schemes (by period letter, TPO count density, volume, or delta).
   - **Session clocks:** DST-aware city-clock presets (All-day, Pre/RTH/Post, Asia/London/NY, RTH/ETH split, plus non-overlapping custom sessions).
   - **Market Profile levels & structure:** POC, VAH/VAL + shaded Value Area, Developing POC and Developing VA curves, Naked POC/VAH/VAL extensions with price-axis tags, Prior-session reference levels, Initial Balance (IBR + configurable range extensions), Opening & Closing range markers, Poor Highs / Poor Lows, Single Prints, and Buying / Selling Tails.
   - **Statistics & manipulation:** Toggleable 12-metric profile stats panel (Range, Volume, TPOs above/below POC, VA width, Rotation Factor, IB range/high/low, Total TPOs, Span, Midpoint), attached Volume Profile (beside or overlaid), interactive bitwise Split & Merge across adjacent sessions, and multi-exchange aggregated TPO.

3. **Order Book Liquidity Heatmap**
   - **Data sources & denomination:** Single-venue L2 depth, multi-exchange aggregated depth, CME high-definition depth, plus optional crypto liquidation/resting-cluster overlays; toggleable Base Units vs USD notional.
   - **Rendering & controls:** Selectable vertical resolution (standard vs fine tick density), Single-tone vs Two-tone (bid/ask split around last trade), dual Threshold/Ceiling contrast handles with High/Medium/Low presets (persisted per market+interval), Display modes (Heatmap only, live DOM ladder profile, Combined, or Cross-section pane), Volumetric (size-scaled) vs Classic (uniform tile) cell styles, numeric size overlay, and a pointer zoom card (mutually exclusive with standard floating tooltips).

4. **Volume Delta, CVD & Cross-Market Flow Divergence**
   - **Volume Delta:** Per-bar aggressive buy minus aggressive sell volume in contracts, coins, or quote currency.
   - **Cumulative Volume Delta (CVD):** Multiple plot styles (Line, OHLC Delta Candles, and Momentum shading relative to a configurable moving average such as 26 bars), multi-venue grouping (Spot basket, Perps basket, Custom basket, Aggregated), configurable anchor resets (Continuous, UTC calendar intervals, CME trading-day open at 17:00 CT), rolling last-N-bar window, and RTH/ETH session filtering.
   - **Cross-Market Flow Divergence (Spot vs Perp):** Normalizes per-bar Spot Delta and Perpetual Delta via rolling z-scores to classify each bar into four regimes — Consensus Buying, Consensus Selling, Spot-Led Divergence, or Perp-Led Divergence — with an optional breakdown sub-view comparing both series directly.

5. **Session Volume Profile (SVP)**
   - **Multi-profile layering:** Up to 3 concurrent profiles per chart (e.g., Daily + Weekly + Multi-Exchange Aggregate).
   - **Partitioning:** Auto-scaled presets (narrow/wide relative to chart interval), Daily, Weekly, regional city-clock sessions (US/EU/Asia), 4-session NY-clock split, and custom hour/bar-count windows; configurable daily reset boundary (Chart TZ vs UTC).
   - **Row binning & styling:** Ticks-per-row vs fixed row count, display modes (Total with buy/sell coloring, Split Bid/Ask, Delta, Outline), configurable Value Area % (default 70%) with POC/VAH/VAL lines, low-volume node (LVN) greying threshold, imbalance highlights, left/right alignment, and total/value labels.

---

## 3. Allegedly Specification Constraints & Invariants

Any strategy, alert, or orderflow capability added to Allegedly **must** uphold four non-negotiable architectural invariants from `01-Charter/Constraints.md`, [R04-Execution-Brokers-Props.md](../../02-Research/R04-Execution-Brokers-Props.md), and [R05-Orderflow-Profile-Tooling.md](../../02-Research/R05-Orderflow-Profile-Tooling.md).

### 3.1 Fixed-Point Arithmetic Invariant (Zero IEEE-754 Floats)
All prices, quantities, deltas, money balances, fees, and ratios in Rust core/OMS/orderflow/strategy engines **must** stay strictly in Allegedly's integer types ([fixed.rs](../../crates/allegedly-core/src/fixed.rs)):
- `PriceE9(i64)` — fixed-point $10^{-9}$ price for fills, marks, average entry, stops, limits.
- `QtyE9(i64)` — fixed-point $10^{-9}$ volume, bid/ask size, delta, CVD, and signed position quantities.
- `PriceTicks(i64)` — integer tick grid index (`price_e9 / tick_size_e9`) for Footprint rows, TPO buckets, VRVP/SVP bins, and Heatmap vertical rows.
- `MoneyMicros(i64)` (or `i128` intermediate accumulators) — realized/unrealized PnL, cash balance, equity curve, margin, funding, and commissions (never `f64`).
- `Bps(u32)` — slippage, commission rates, Value Area % (e.g., `Bps(7_000)` = 70.00%), and imbalance thresholds (e.g., `Bps(30_000)` = 300%).
- **Float boundary:** `f64`/`f32` is permitted **only** at the final display/statistics boundary (Sharpe/Sortino standard deviation, z-score normalization for visual divergence shading, and WebGL2 vertex/uniform screen coordinates).

### 3.2 5-Tier Provenance Gating Matrix
Every data stream, bar, orderflow summary, alert trigger, and strategy fill assumption must carry its [`ProvenanceTier`](../../crates/allegedly-core/src/provenance.rs) end-to-end (Rust -> IPC -> WebGL2/UI badge):

| Provenance Tier | Footprint Bid×Ask & Delta | Diagonal Imbalance & Unfinished Auction | Absorption / Stacked Imbalance Alerts | Order Book Liquidity Heatmap | Strategy Fine-Fill Disambiguation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`ExactL3Mbo`** | Allowed (Green badge) | Allowed | Allowed (Full precision) | Allowed (L3/MBO + queue insight) | Exact tick-order resolution |
| **`ExactTickAggr`** | Allowed (Green badge) | Allowed | Allowed (Exact trade aggressor) | Allowed if paired with L2 feed | Exact tick-order resolution |
| **`EstimatedL1Quote`** | Allowed w/ Amber `"Inferred L1"` badge | Allowed w/ Amber warning | **Gated (Disabled by default; opt-in warning)** | L1 BBO only — **Heatmap Refused** | Tick-order w/ quote-rule disclosure |
| **`EstimatedTickRule`** | Allowed w/ Amber `"Tick-Rule Est."` badge | **Gated / Warning** | **Hard-Blocked (`false`)** | **Hard-Blocked (No book)** | Tick-order w/ aggressor disclosure |
| **`SyntheticIntrabar`** | **Blocked or Explicit Synthetic-Only Mode** | **Hard-Blocked** (`SV-10`) | **Hard-Blocked** (`SV-10`) | **Hard-Blocked** | **Pessimistic / Heuristic only** (`ambiguous_fill_count` disclosed) |

### 3.3 Non-Repainting & Lookahead-Free Execution Invariant
- Historical and live strategy evaluation must share a single pure Rust state machine (`StrategyBrokerEngine`) driven exclusively by confirmed bar closes (or chronological tick replay in tick-backtest mode).
- Forming-bar script previews must run on an isolated clone with zero state mutation to positions, cash, or trade history.
- Ambiguous intrabar stop-vs-target collisions must default to **pessimistic** fill order and always surface `ambiguous_fill_count` and `±` trade markers.
- Missing required inputs (e.g., book-depth slippage without L2, or perpetual funding without funding series) must **refuse or explicitly count gaps**, never fabricate synthetic numbers.
- **Paper / Local-Sim Only:** `LIVE_TRADING_COMPILED_IN` remains `false`; strategy signals and webhooks must never bypass [`RiskGate`](../../crates/allegedly-oms/src/risk.rs) or [`FORBIDDEN_DO_NOT_BUILD_ADAPTERS`](../../crates/allegedly-oms/src/lib.rs).

### 3.4 WebGL2 Hot-Path vs React `@ui-sdk/react` Chrome Split (macOS + Windows First)
- **Hot Path (0% React, 60fps chart / 30+Hz DOM & Orderflow):** All Footprint cells/text atlases, TPO letter/block grids, VRVP/SVP histograms, Liquidity Heatmap `R16Uint` tile textures, and Strategy trade-marker clusters render inside WebGL2 (synchronously composited with Lightweight Charts via `ISeriesPrimitive` or dedicated aligned WebGL2 surface without React reconciliation).
- **UI Chrome (`@ui-sdk/react` + React 19+):** Strategy Backtester tabs (Overview, Performance, Trades, Compare), Alert creation/history drawers, Orderflow settings dialogs, Provenance badges, and Paper OMS ticket panels live strictly in React chrome, subscribing to throttled snapshots (<= 4–10 Hz) rather than raw tick streams.
- **Platform priority:** Optimize WebGL2, SQLite WAL, native OS notifications, and audio cues for **macOS and Windows first** (v0.1–v1.0); Linux support remains deferred post-v1.0.

---

## 4. What Allegedly Is Doing Wrong (Verified Code Bugs & Spec Violations)

These are **not** merely unbuilt features — they are active bugs or architectural violations already present in Allegedly's codebase today:

1. **CRITICAL — Buy/Sell Imbalance Bitmask Inversion Between Rust IPC and WebGL2 Renderer:**
   - [framing.rs](../../crates/allegedly-ipc/src/framing.rs#L9-L12) defines `BIT_BUY_IMBAL = 1 << 0` (`1`) and `BIT_SELL_IMBAL = 1 << 1` (`2`).
   - [webgl2-orderflow-overlay.ts](../../apps/desktop/src/render/webgl2-orderflow-overlay.ts#L53-L55) defines `BIT_SELL_IMBAL = 1 << 0` (`1`) and `BIT_BUY_IMBAL = 1 << 1` (`2`), then consumes them at [lines 275–293](../../apps/desktop/src/render/webgl2-orderflow-overlay.ts#L275-L293).
   - **Impact:** Every buy imbalance highlights the red bid column as a sell imbalance, and every sell imbalance highlights the green ask column as a buy imbalance.

2. **CRITICAL — Zero-Float Invariant Violation for CVD & Footprint Delta:**
   - [allegedly-orderflow/Cargo.toml](../../crates/allegedly-orderflow/Cargo.toml) describes the crate as a *"CVD/VWAP engine"*, yet neither CVD nor Delta exists in `allegedly-orderflow`.
   - Instead, `footprint_delta_series` and `cvd_series` were placed in [builtins.rs](../../crates/allegedly-studies/src/builtins.rs) operating on `f64` slices (`&[f64] -> Vec<f64>`), violating `Constraints.md` §1.7 and accumulating floating-point drift over long sessions.

3. **HIGH — Active Forming Footprint Bar Never Computes POC or Imbalances, and Historical Bars Are Never Streamed:**
   - [footprint.rs](../../crates/allegedly-orderflow/src/footprint.rs) computes `BIT_POC`, `BIT_BUY_IMBAL`, and `BIT_SELL_IMBAL` **only** inside `seal_active_bar()`.
   - Meanwhile, [allegedly-app/src/lib.rs](../../crates/allegedly-app/src/lib.rs#L487) streams only `active_cells_snapshot()` over `LIVE_FOOTPRINT_DELTA` (never using `FootprintSlabSoa`), and [webgl2-orderflow-overlay.ts](../../apps/desktop/src/render/webgl2-orderflow-overlay.ts#L262-L296) draws only `activeBarTimeSec`.
   - **Impact:** Users see zero POC or imbalance highlights on the live bar, and historical footprint bars vanish the instant a bar closes.

4. **HIGH — Footprint Imbalance False Positives on Zero/1-Lot Prints & Dead `BIT_UNFINISHED` Flag:**
   - [footprint.rs](../../crates/allegedly-orderflow/src/footprint.rs) checks `ask[i]*10_000 >= bid[i-1]*ratio` with no `min_volume` guard and no `ignore_zeros` toggle. Any 1-lot ask print diagonally adjacent to a `0` bid triggers a buy imbalance.
   - `BIT_UNFINISHED = 1 << 3` is defined in [framing.rs](../../crates/allegedly-ipc/src/framing.rs#L12) but never set anywhere in Rust or decoded anywhere in TypeScript.

5. **HIGH — Value Area Math Discrepancies (Floor vs Ceiling, Single-Row Only, Lowest-Price POC Tie-Break):**
   - Both [vrvp.rs](../../crates/allegedly-orderflow/src/vrvp.rs#L94) (`(total_vol * value_area_bps) / 10_000`) and [tpo.rs](../../crates/allegedly-orderflow/src/tpo.rs#L64) (`(total * 70) / 100`) use truncating **floor** division instead of ceiling division `(total * bps + 9_999) / 10_000` required by [R05-Orderflow-Profile-Tooling.md](../../02-Research/R05-Orderflow-Profile-Tooling.md).
   - Both implement single-row expansion only (omitting CME/Steidlmayer dual-row step-out) and break POC ties arbitrarily toward the lowest price instead of closest to the profile midpoint. `tpo.rs` also hardcodes `70%` instead of accepting `Bps`.

6. **HIGH — Broken Runtime Wiring of VRVP, TPO, and Provenance in `allegedly-app`:**
   - [allegedly-app/src/lib.rs](../../crates/allegedly-app/src/lib.rs#L425-L440) bypasses `DyadicVrvpTree` entirely, accumulating an unbounded `BTreeMap<i64, (i64, i64)>` from process start with zero visible-range or session reset.
   - The same loop feeds `self.tpo.record_bracket(((self.frame_seq / 12) % 96) as u16, ...)` using frame sequence numbers instead of exchange timestamps, wrapping modulo 96 and corrupting bracket 0 instead of rolling sessions.
   - [allegedly-app/src/lib.rs](../../crates/allegedly-app/src/lib.rs#L519) stamps `ProvenanceTier::ExactTickAggr` onto synthetic L2 book frames, violating provenance honesty.

7. **HIGH — Silent Drop of `oco_group_id` and Non-Functional Resting Order Types in `allegedly-oms`:**
   - [state.rs](../../crates/allegedly-oms/src/state.rs) accepts `OrderType::{Limit, Stop, StopLimit}` and `OrderRequest.oco_group_id`, yet [lib.rs](../../crates/allegedly-oms/src/lib.rs) never stores `oco_group_id`, never persists it in [journal.rs](../../crates/allegedly-oms/src/journal.rs), has no `stop_price` field on `OrderRequest`, and never fills resting limit/stop orders against price movement.

8. **MEDIUM — Overly Permissive Provenance Gate for Absorption Triggers:**
   - [provenance.rs](../../crates/allegedly-core/src/provenance.rs#L46) (`ProvenanceTier::supports_absorption_triggers()`) returns `true` for `EstimatedTickRule` and `EstimatedL1Quote`, blocking only `SyntheticIntrabar`. Tick-rule estimates cannot reliably detect passive absorption and should not silently unlock automated absorption alerts.

9. **MEDIUM — Scale-Blind `RiskGate` Limit:**
   - [risk.rs](../../crates/allegedly-oms/src/risk.rs) hardcodes `max_order_qty_e9 = 100_000_000_000` (100 units), which is dangerously huge for `BTC` or `ES` futures and unusably tiny for sub-dollar tokens or micro-lot FX.

---

## 5. What Allegedly Is Missing (Gap Matrix)

| Domain | Capability Area | Current State in Allegedly | Missing Elements Required for Parity & Institutional Quality |
| :--- | :--- | :--- | :--- |
| **Strategies & Backtester** | Paper Fill & Matching Engine | Market-only immediate fill in `LocalPaperOms`; zero resting order matching | Deterministic 6-phase confirmed-bar + tick-replay matcher (`Market`, `Limit`, `Stop`, `StopLimit`, `TrailingStop`, bracket/OCO groups, position reversals, partial fills, pessimistic vs path-heuristic vs fine-tick disambiguation). |
| **Strategies & Backtester** | Account, Cost & Margin Ledger | Signed qty map `HashMap<u32, i64>` only | Fixed-point `MoneyMicros` cash/equity/realized/unrealized PnL, avg entry price, contract `point_value` multiplier, maker/taker commission (`Bps`), fixed slippage (`Bps`), explicit refusal for missing L2 book slippage, isolated margin / liquidation / funding model for perpetuals. |
| **Strategies & Backtester** | Script-to-OMS Bridge & Replay Hook | `allegedly-studies` (Luau) and `allegedly-replay` completely disconnected from `allegedly-oms` | Strategy script API (`strategy_config`, `entry`, `exit`, `close`, `close_all`, position/equity getters), forming-bar cloned dry-run isolation, Replay-driven strategy stepping, and `ambiguous_fill_count` / `rejected_orders` / `fine_fill_coverage_pct` telemetry. |
| **Strategies & Backtester** | Strategy Backtester UI | Does not exist | React (`@ui-sdk/react`) Strategy Tester panel: Overview (equity + underwater DD + Buy & Hold), Performance (Returns/Risk/Long-Short/histogram), Trades ledger (with `Exit via` & `±` badge + click-to-jump), Run Details, Multi-strategy Compare + correlation matrix, WebGL2 clustered chart markers (>150 collapse). |
| **OMS & Risk** | Sandbox Broker Adapters & Prop Safety | `LocalPaperOms` + `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` only | `BrokerAdapter` trait + paper/sandbox adapters (`barter-rs`, Alpaca Paper, tastytrade Sandbox per `R04`), correlated product-group anti-hedging (`ES`/`MES`, `NQ`/`MNQ`), notional/daily-loss/order-rate circuit breakers. |
| **Alerts** | Alert Engine & Conditions | Does not exist | Price/drawing alerts (draggable chart lines), indicator output conditions (Crossing/Channel/Moving), Luau script-declared named signals (edge-triggered vs `every_bar`, dynamic text vs templates, `warmup`), strategy lifecycle triggers (`order_placed`, `trade_opened/closed`, `position/equity_changed`). |
| **Alerts** | Pre-Flight Validator, Runtime & Delivery | Does not exist | Deterministic pre-flight alertability checker, coalesced <= 1 Hz forming-bar vs bar-close evaluator, `paused_runtime` self-healing state, local audio cue rate-limiter (<= 4/sec, muted on history/replay), macOS/Windows native OS notifications, HTTPS webhooks (JSON/Discord/Telegram) with delivery failure logging & Unicode/mention sanitization. |
| **Order Flow** | Footprint Engine & Renderer | Single active bar, raw Bid×Ask quads, swapped flags | Multi-bar `FootprintSlabSoa` IPC streaming, WebGL2 glyph/text atlas + zoom-adaptive LOD, 7 display modes + 1–4 configurable columns, `row_ticks` grouping `G`, `min_volume` & `ignore_zeros`, diagonal/horizontal + stacked imbalances + naked extensions, Bar POC/VAH/VAL, Unfinished Auctions, Absorption, 11-row footer stats, pointer zoom card, per-bar `ProvenanceTier`. |
| **Order Flow** | TPO / Market Profile | `u128` bitmask + floor single-row VA + left-margin bar | Multi-session X-aligned WebGL2 letters/blocks renderer (Period/Count/Volume/Delta colors), DST city-clock presets & RTH/ETH split, CME dual-row VA + center POC tie-break, Developing POC/VA, Naked extensions, Initial Balance (IBR + extensions), Opening/Closing range, Poor High/Low, Single Prints, Tails, 12-metric stats box, attached VP, bitwise Split/Merge. |
| **Order Flow** | Order Book Liquidity Heatmap | Synthetic 12-level `LiveL2BookBatch` snapshot only | Keyframe + Delta L2 ring buffer (`R05` Tool 5), Zstd `.atdepth` disk vault, WebGL2 `R16Uint` tile texture shader, Base vs USD scaling, Single/Two-tone & Volumetric/Classic styles, Threshold/Ceiling contrast handles, live DOM + Cross-section pane, pointer zoom card, strict provenance gate (refused on L1/Synthetic). |
| **Order Flow** | Delta, CVD & Cross-Market Divergence | `f64` helpers in `allegedly-studies` only | Fixed-point `QtyE9` / `MoneyMicros` Delta & OHLC CVD engine in `allegedly-orderflow`, plot modes (Line, Candles, MA-Momentum), session/UTC/CME-open anchors, rolling N-bar window, multi-venue Spot vs Perp z-score Flow Divergence classifier. |
| **Order Flow** | Session Volume Profile (SVP) | Visible-range `DyadicVrvpTree` (unwired in app) | Wire `DyadicVrvpTree` for VRVP + add multi-profile SVP engine (up to 3 stacked profiles: Daily/Weekly/Regional/Custom/4-session NY), ticks-per-row vs fixed-rows, Total/Split/Delta/Outline modes, LVN threshold greying, HVN/LVN detection, naked POC extensions. |

---

## 6. Prioritized Implementation Suggestions (P0 / P1 / P2)

All priorities assume **Paper / Local-Sim Only** execution (`LIVE_TRADING_COMPILED_IN = false`), macOS + Windows first, and strict separation of WebGL2 hot paths from `@ui-sdk/react` UI chrome.

### P0 — Correctness Fixes & Core Paper Execution Foundation (Immediate)

1. **Fix Active Orderflow & IPC Bugs (1–2 days, Zero Architectural Risk):**
   - **Bitmask parity:** Fix `BIT_BUY_IMBAL` (`1 << 0`) and `BIT_SELL_IMBAL` (`1 << 1`) in [webgl2-orderflow-overlay.ts](../../apps/desktop/src/render/webgl2-orderflow-overlay.ts#L53-L55) to match [framing.rs](../../crates/allegedly-ipc/src/framing.rs#L9-L12); add a cross-language constant parity test.
   - **Footprint live flags & guards:** Update [footprint.rs](../../crates/allegedly-orderflow/src/footprint.rs) to compute `BIT_POC`, `BIT_BUY_IMBAL`, `BIT_SELL_IMBAL`, and `BIT_UNFINISHED` incrementally on the active bar, add `min_volume_e9: QtyE9`, `ignore_zeros: bool`, and `row_ticks: i64` grouping, and attach `ProvenanceTier` to every `BarSlice`.
   - **Value Area math:** Switch [vrvp.rs](../../crates/allegedly-orderflow/src/vrvp.rs#L94) and [tpo.rs](../../crates/allegedly-orderflow/src/tpo.rs#L64) to integer ceiling division `(total * bps + 9_999) / 10_000`, add configurable `ValueAreaMethod::{SingleRow, DualRowCme}`, center-proximity POC tie-break, and configurable `Bps` on `TpoProfile`.
   - **Runtime wiring & provenance honesty:** Replace unbounded `vrvp_bins` in [allegedly-app/src/lib.rs](../../crates/allegedly-app/src/lib.rs#L425-L440) with `DyadicVrvpTree`, drive TPO period indices from `ts_exchange_ns` session clocks instead of `frame_seq`, stop labeling synthetic L2 frames as `ExactTickAggr`, and tighten `ProvenanceTier::supports_absorption_triggers()` in [provenance.rs](../../crates/allegedly-core/src/provenance.rs#L46) to allow only `ExactL3Mbo` and `ExactTickAggr`.
   - **Zero-float CVD/Delta:** Move Delta and OHLC CVD into `crates/allegedly-orderflow/src/cvd.rs` using `QtyE9` / `MoneyMicros` with session/UTC/CME-open anchor resets; deprecate `f64` CVD/delta in [builtins.rs](../../crates/allegedly-studies/src/builtins.rs).

2. **Upgrade `allegedly-oms` into a Real Deterministic Paper Broker (`crates/allegedly-oms/`):**
   - Extend [`OrderRequest`](../../crates/allegedly-oms/src/state.rs) and [`OrderJournal`](../../crates/allegedly-oms/src/journal.rs) with `stop_price_e9: Option<PriceE9>`, `trail_activation_ticks: Option<i64>`, `trail_offset_ticks: Option<i64>`, `oco_group_id: Option<Uuid>`, `parent_order_id: Option<Uuid>`, `fill_price_e9`, `fee_micros: MoneyMicros`, and `slippage_bps: Bps`.
   - Implement `PaperMatchingEngine` supporting the 6-phase confirmed-bar pipeline (and tick-by-tick replay matching): `Market`, `Limit`, `Stop`, `StopLimit`, `TrailingStop`, OCA sibling cancellation, position reversals, and `FillResolutionMode::{Pessimistic, PathHeuristic, FineTick}` with `ambiguous_fill_count` tracking.
   - Add `PaperAccountLedger` (`MoneyMicros` cash, realized/unrealized PnL, avg entry `PriceE9`, contract `point_value_micros`, maker/taker commission `Bps`, isolated margin + liquidation + funding support, `bankruptcy_deficit`, `rejected_orders`).
   - Replace hardcoded `max_order_qty_e9` in [`RiskGate`](../../crates/allegedly-oms/src/risk.rs) with per-instrument notional/qty caps, daily-loss breaker, runaway order-rate cap, and correlated product-group anti-hedging (`ES`/`MES`, `NQ`/`MNQ`).

3. **Unify `allegedly-replay` + `allegedly-studies` + `allegedly-oms` for Deterministic Strategy Testing:**
   - Add a `StrategySession` runner inside `crates/allegedly-replay` (or a new `crates/allegedly-strategy` crate) that feeds confirmed bars or `.atvault` ticks simultaneously into Orderflow accumulators, the Luau study sandbox, and `PaperMatchingEngine`.
   - Guarantee forming-bar isolation (clone-and-discard dry run) and add a `SV-11` bit-exact determinism test proving `live_bar_by_bar_equity == full_historical_replay_equity`.

### P1 — Core Order Flow Parity, Strategy Backtester UI & Alerts Engine (v0.5–v0.8)

1. **Multi-Bar Footprint & Full WebGL2 Text/LOD Renderer:**
   - Stream historical bars via `FootprintSlabSoa` (`0x0002`), add MSDF/bitmap glyph atlas in WebGL2 (`apps/desktop/src/render/`), implement 3-tier zoom-adaptive LOD, 7 display modes (Split, Delta, Total, Cluster, Imbalance, Ladder, 1–4 Columns), stacked imbalances + naked extensions, bar VAH/VAL, 11-row footer stats strip, and pointer zoom card.
2. **Full Market Profile (TPO) & Session Volume Profile (SVP):**
   - Extend [tpo.rs](../../crates/allegedly-orderflow/src/tpo.rs) with DST city-clock sessions, Initial Balance (`IBR` + extensions), Poor High/Low, Single Prints, Buying/Selling Tails, Developing POC/VA, naked level extensions, 12-metric stats box, and bitwise Split/Merge (`split_at_period`, `merge_adjacent`).
   - Add `crates/allegedly-orderflow/src/svp.rs` supporting up to 3 stacked session profiles (Daily/Weekly/US-EU-Asia/NY-4-session/Custom), LVN threshold greying, HVN/LVN peaks, and naked POC rays.
3. **Alerts Crate (`crates/allegedly-alerts/`) & Delivery Pipeline:**
   - Implement condition evaluators (Price, Drawing, Study Output Crossing/Channel/Moving, Luau Script Named Signals up to 64/script, and Strategy Lifecycle events).
   - Add the shared pre-flight eligibility validator, coalesced 1 Hz forming-bar vs bar-close scheduler, `paused_runtime` fault recovery, SQLite alert history log, local audio engine (<= 4/sec, muted on history/replay), macOS/Windows native notifications, and HTTPS webhook dispatcher (JSON/Discord/Telegram presets + Unicode/mention sanitization + `not_delivered` telemetry).
4. **React (`@ui-sdk/react`) Strategy Backtester & Alerts Chrome:**
   - Build the Strategy Backtester drawer (Overview w/ synced drawdown & Buy-and-Hold, Performance w/ Long-Short & histogram, Trades table w/ `Exit via` & `±` badge + chart jump, Run Details disclosure) plus WebGL2 trade marker clustering (>150 collapse).
   - Build the Alerts sidebar tab, chart right-click / draggable alert-line integration, and delivery destination manager.

### P2 — Institutional Differentiation (v0.9–v1.0)

1. **Order Book Liquidity Heatmap (`crates/allegedly-orderflow/src/heatmap.rs` + WebGL2 `R16Uint` Tile Pipeline):**
   - Implement the `R05` Tool 5 keyframe + delta L2 ring buffer, `.atdepth` Zstd archival vault, WebGL2 `R16Uint` texture tiles, Base/USD toggle, Single/Two-tone & Volumetric/Classic styles, Threshold/Ceiling contrast handles, live DOM + cross-section pane, and strict provenance gating (hard-blocked when L2 is absent).
2. **Cross-Market Flow Divergence & Multi-Venue Aggregation:**
   - Add multi-exchange aggregated Footprint/TPO/SVP/CVD streams and a Spot-vs-Perp z-score Flow Divergence study pane (Consensus Buying/Selling, Spot-Led, Perp-Led + Breakdown view).
3. **Multi-Strategy Compare Mode & Sandbox Broker Adapters:**
   - Add normalized multi-strategy equity comparison, combined portfolio column, and pairwise correlation matrix in the Backtester UI.
   - Implement the `BrokerAdapter` trait in `allegedly-oms` with paper/sandbox connectors (`barter-rs`, Alpaca Paper, tastytrade Sandbox) strictly honoring `R04` legality gates and `FORBIDDEN_DO_NOT_BUILD_ADAPTERS`.
4. **Replay Enhancements:**
   - Add exchange-timestamp (`ts_exchange_ns`) real-time pacing alongside tick-batch stepping, plus periodic state checkpoints for O(1) backward seek.

---

## 7. Sources Table

All external documentation pages were retrieved directly via HTTP (`read_url_content`) on `2026-11-27` and cross-checked against Allegedly's local codebase.

| Source ID | Domain | Primary Reference URL | Retrieved Date | How Verified | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `OM-S01` | Strategies | https://openmarket.xyz/wrun/strategies/overview | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S02` | Strategies | https://openmarket.xyz/wrun/strategies/first-strategy | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S03` | Strategies | https://openmarket.xyz/wrun/strategies/writing-strategies | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S04` | Strategies | https://openmarket.xyz/wrun/strategies/fill-simulation | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S05` | Strategies | https://openmarket.xyz/wrun/strategies/slippage-and-costs | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S06` | Strategies | https://openmarket.xyz/wrun/strategies/perps | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S07` | Strategies | https://openmarket.xyz/wrun/strategies/reading-the-tester | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S08` | Strategies | https://openmarket.xyz/wrun/strategies/stats-reference | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S09` | Alerts | https://openmarket.xyz/wrun/functions/alerts | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S10` | Alerts | https://openmarket.xyz/wrun/reference/declarations | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S11` | Alerts | https://openmarket.xyz/learn/faq/alerts | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S12` | Alerts | https://openmarket.xyz/learn/faq/alerts/alerts-on-phone-discord-telegram | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S13` | Alerts | https://openmarket.xyz/learn/faq/alerts/where-to-create-alerts | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S14` | Order Flow | https://openmarket.xyz/learn/order-flow | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S15` | Order Flow | https://openmarket.xyz/learn/order-flow/footprint | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S16` | Order Flow | https://openmarket.xyz/learn/order-flow/footprint/playbook | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S17` | Order Flow | https://openmarket.xyz/learn/order-flow/footprint/settings-reference | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S18` | Order Flow | https://openmarket.xyz/learn/order-flow/tpo | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S19` | Order Flow | https://openmarket.xyz/learn/order-flow/tpo/playbook | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S20` | Order Flow | https://openmarket.xyz/learn/order-flow/tpo/settings-reference | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S21` | Order Flow | https://openmarket.xyz/learn/order-flow/order-book-heatmap | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S22` | Order Flow | https://openmarket.xyz/learn/order-flow/cvd-and-delta | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
| `OM-S23` | Order Flow | https://openmarket.xyz/learn/order-flow/session-volume-profile | 2026-11-27 | Direct HTTP read (`read_url_content`) | High |
