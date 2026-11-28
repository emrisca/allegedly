# Master Gap Analysis: External Platform Audit & TradingView-Clean Roadmap

> **Date:** 2026-11-27  
> **Scope:** Clean-room synthesis of all 4 specialist audits comparing Allegedly against modern charting/scripting terminal capabilities (`Get started`, `Market data`, `Indicators`, `Chart output`, `Settings`, `Strategies`, `Cookbook`, `Language`, `Reference`), filtered through Allegedly's core product rule: **TradingView-simple, calm, consistent UI with zero paywalls, zero clutter, and full institutional power under the hood.**

---

## Specialist Audit Reports

1. **UI, Chart Output, Settings & Drawings:** [01-ChartOutput-Settings-Drawings.md](./OpenMarket-Audit/01-ChartOutput-Settings-Drawings.md)
2. **Indicators, Scripting Runtime, Language & Cookbook:** [02-Indicators-Scripting-Language-Cookbook.md](./OpenMarket-Audit/02-Indicators-Scripting-Language-Cookbook.md)
3. **Strategies, Order Flow & Alerts:** [03-Strategies-OrderFlow-Alerts.md](./OpenMarket-Audit/03-Strategies-OrderFlow-Alerts.md)
4. **Market Data Feeds & Licensing:** [04-Market-Data-Feeds.md](./OpenMarket-Audit/04-Market-Data-Feeds.md)

---

## Product Design Filter (Adopt vs. Reject)

| Adopt (Under-the-Hood Power + TradingView-Clean UX) | Reject (UI Clutter & Complexity Bloat) |
| :--- | :--- |
| Real public `$0` live market data (Kraken Spot WS v2 + Coinbase Advanced Trade WS) with zero-socket offline boot default (`SV-01`) | Persistent telemetry chrome (`UPDATES_ON_BOOT`, `OFFLINE-SIM · rev · drops`, `Verify SV-09`, `SHA-256` pills on main chart) |
| Full per-indicator settings (`Inputs`, `Style`, `Visibility`) accessible via gear icon / double-click on each active indicator row | Overwhelming multi-widget sidebars, redundant top bar buttons, duplicate orderflow chips, noisy watchlist badges |
| Full per-drawing selection, anchor/body drag, TradingView Floating Quick-Style Bar, and `Style`/`Text`/`Coordinates`/`Visibility` modal | Separate non-standard toolbars competing with TradingView muscle memory |
| Typed Luau indicator & strategy runtime (`series` lookback, `input.*`, `plot`/`hline`/`fill`/`plotshape`, multi-pane oscillators, deterministic backtester) | Unbounded scripts or float-based core OMS/ingest math (must preserve `#![forbid(unsafe_code)]`, `i64` fixed-point `1e9`, and memory/instruction caps) |
| Authentic order-flow aggregation (Footprint, VRVP, TPO, L2 DOM) rendered natively inside Lightweight Charts at 60fps | Paywalling indicator counts, chart layouts, replay timeframes, or drawing tools |

---

## Completed Today (Shipped & Verified)

### 1. Real Market Data End-to-End (Rust + Tauri + Frontend)
- **Rust live ingest (`crates/allegedly-ingest/src/live_feed.rs`):** Zero new crates, `#![forbid(unsafe_code)]`, zero `f64` floats, lock-free `rtrb` channel.
  - **Kraken Spot WS v2** (`wss://ws.kraken.com/v2`): `trade`, `book` (`depth: 25` with top-10 CRC32 checksum verification -> stale + reconnect on mismatch), and `ohlc` for `BTC/USD`, `ETH/USD`, `SOL/USD`.
  - **Coinbase Advanced Trade WS** (`wss://advanced-trade-ws.coinbase.com`): `market_trades` + `heartbeats`, monotonic `sequence_num` gap detection, newest-first snapshot sorting, mandatory maker-to-taker aggressor inversion.
- **Tauri & IPC wiring (`crates/allegedly-app/src/lib.rs`, `apps/desktop/src-tauri/src/main.rs`, `packages/ipc-client`):**
  - `set_market_data_source` / `get_market_data_status` commands wired to the clean `Sim / Kraken Live / Coinbase Live` toolbar dropdown (`data-testid="market-data-feed-trigger"`).
  - Browser preview fallback in `OfflineSimTransportAdapter` connects directly to Kraken/Coinbase public WS only on explicit user opt-in.
  - **`SV-01` preserved:** Boots 100% offline in `paper_sim` with zero outbound sockets until explicitly switched.

### 2. TradingView-Simple UI Unification
- Unified single TradingView dark palette (`#131722` bg/chrome/canvas, `#1e222d` elevated popovers/modals, `#2a2e39` 1px borders, `#d1d4dc` primary text, `#787b86` muted, `#2962ff` accent, `#089981`/`#f23645` up/down).
- Single clean 40px top bar, pure 28px bottom bar (ranges `1D`–`All`, clock, `log`, `auto`), trimmed 4-tab right rail, stripped all dev/QA badges (`UPDATES_ON_BOOT`, `OFFLINE-SIM`, `Verify SV-09`, `SHA-256`, noisy `S` pills, redundant buttons).

### 3. Full Customizable Per-Indicator & Per-Drawing Settings
- **Per-Indicator Settings (`IndicatorSettingsDialog`):** Gear icon (`⚙`) + double-click on every row in `ActiveIndicatorsLegend` opens a 3-tab modal (`Inputs`: display name, length/period, price source `Close/Open/High/Low/HL2/HLC3/OHLC4`, Luau script; `Style`: color picker + presets, line width `1–4px`, `Solid/Dashed/Dotted`, opacity, price scale label/line; `Visibility`: Minutes/Hours/Days/Weeks/Months + `Reset defaults`).
- **Interactive Drawing Selection, Drag, Floating Quick-Style Bar & Full Settings (`DrawingSettingsDialog`):**
  - Fixed `BUG-02` non-blocking cursor-mode hit-testing: clicking a drawing selects it (without blocking LWC pan/zoom on empty chart space), dragging anchor handles or body moves it smoothly with 1-step Undo/Redo, `Delete`/`Backspace` removes it, double-click opens Settings.
  - Compact `DrawingQuickStyleBar` appears on selection (color palette, line width, line style, `⚙` Settings, lock, delete).
  - Full 4-tab `DrawingSettingsDialog` (`Style`, `Text`, `Coordinates`, `Visibility` + `Reset defaults`) persisted in `.atanalysis.toml`.

---


### 4. Verified Critical Bug Fixed Immediately
- **Inverted Footprint Imbalance Bitmasks (`Audit 03`):** `apps/desktop/src/render/webgl2-orderflow-overlay.ts` previously inverted `BIT_BUY_IMBAL` / `BIT_SELL_IMBAL` relative to `crates/allegedly-ipc/src/framing.rs`. Fixed to import canonical bitmasks directly from `@allegedly/ipc-client`.

## Remaining Prioritized Roadmap (From Audits 01–04)

### P0 — High-Leverage Engine Correctness & Core Capabilities
1. **Rich Indicator Output Primitives & Multi-Pane Oscillators (`Audit 01` + `Audit 02`):**
   - Extend `StudyRunResponse` from a single `values: Vec<Option<f64>>` line into typed plot outputs (`line`, `histogram`, `area`, `band/fill`, `hline`, `markers/shapes`) and render non-overlay oscillators (`RSI`, `MACD`, `CVD`) in genuine dedicated LWC v5 lower panes (`addSeries(..., paneIndex)`), not overlapping bottom margins.
2. **Real-Time Indicator Recomputation on Live Ticks (`Audit 02`):**
   - Re-evaluate active studies automatically on bar close / symbol change / timeframe switch instead of only when added or manually edited.
3. **Luau Scripting Runtime Upgrade (`Audit 02`):**
   - Expose full OHLCV + buy/sell volume arrays (`open`, `high`, `low`, `close`, `volume`, `buy_vol`, `sell_vol`, `time`), bar-index helpers, built-in `ta.*` library (`sma`, `ema`, `rma`, `rsi`, `atr`, `bb`, `macd`, `vwap`, `crossover`, `crossunder`), and declarative `input.*` declarations so custom Luau scripts auto-generate their own `Inputs` tab in `IndicatorSettingsDialog`.
4. **Live-to-Orderflow & Historical Backfill Pipeline (`Audit 03` + `Audit 04`):**
   - Fetch initial REST OHLCV history (e.g., Kraken REST `/0/public/OHLC`) on explicit live feed opt-in so switching to `Kraken Live` shows full historical candles immediately rather than starting from the current bar.
   - Route real live trades into `FootprintSlabArena`, `DyadicVrvpTree`, and `TpoProfile` so orderflow overlays reflect authentic live market prints (fixing the debug-profile overflow in `allegedly-orderflow::slab_arena_10chart_100k_bars_stays_under_60_mib`).

### P1 — Strategy Backtester, Alerts Engine & Multi-Asset Feeds
5. **Deterministic Strategy Backtesting Engine (`Audit 03`):**
   - Add `strategy.*` entry/exit/cancel hooks to the Luau runtime backed by `LocalPaperOms` + `IncrementalReplayEngine`, producing deterministic equity curves, trade lists, Sharpe/Sortino, max drawdown, and profit factor (with strict bar-close execution semantics to prevent lookahead bias).
6. **Stateful Alert Engine (`Audit 03`):**
   - Move alerts from chart-local price lines to a Rust-backed alert evaluator supporting crossing-up, crossing-down, entering/exiting channel, indicator-condition triggers, webhook/desktop notifications, and durable SQLite alert history.
7. **Expanded Zero-Key & Bring-Your-Own-Key Market Data (`Audit 04`):**
   - Add Binance/Bybit public spot/perp adapters (optional, user-selected), CME/equities BYOK adapter interfaces (Databento / Polygon / Rithmic / Interactive Brokers) with explicit provenance tier labeling (`L3 MBO`, `L2 MBP`, `Exact Tick`, `Bar Approx`).

### P2 — Polish & Power-User Workflows
8. **Multi-Timeframe (`request.security`-equivalent) Resampling (`Audit 02`):**
   - Strict non-repainting higher-timeframe aggregation using sealed bars only.
9. **Drawing Templates & Object Tree Synchronization (`Audit 01`):**
   - Save/load per-tool drawing style presets and sync object tree selection/lock/hide bidirectionally with the chart canvas.
10. **Expanded Built-In Technical Library (`Audit 02`):**
    - Add Bollinger Bands, MACD, ATR, SuperTrend, Stochastic RSI, Ichimoku Cloud, Anchored VWAP bands, and Session High/Low levels — all using the same clean `IndicatorSettingsDialog` with zero indicator count limits.
