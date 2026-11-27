---
title: Reference Audit 04 — Market Data Feeds, Order-Flow Inputs & Licensing Gaps
track: R03
type: audit
status: verified
owner: research-data
updated: 2026-11-27
code_refs:
  - crates/allegedly-ingest/src/lib.rs
  - crates/allegedly-ingest/src/ws_client.rs
  - crates/allegedly-ingest/src/parsers.rs
  - crates/allegedly-ingest/src/dispatcher.rs
  - crates/allegedly-ingest/src/classifier.rs
  - crates/allegedly-ingest/src/live_feed.rs
  - crates/allegedly-storage/src/atvault.rs
  - crates/allegedly-storage/src/parquet_vault.rs
  - crates/allegedly-app/src/lib.rs
---

# Audit 04 — Market Data Feeds, Order-Flow Inputs & Licensing Gaps

> Clean-room architectural gap analysis comparing the market-data surface of a modern browser-based order-flow & scripting terminal ("the Reference Platform") against Allegedly's current ingest, storage, runtime, and research baseline (`02-Research/R03-Market-Data.md`, `02-Research/Provider-Capability-Matrix.md`). No verbatim passages or proprietary brand names are reproduced. All facts follow `01-Charter/Constraints.md` (FOSS-only, `$0` core, honest data provenance, no ToS/license handwaving) and `01-Charter/Glossary.md`.

---

## 1. Verified Facts

### 1.1 Reference Platform Market-Data Architecture (Retrieved 2026-11-27)

Based on primary documentation inspection (`OM04-S01`–`OM04-S07`), the Reference Platform exposes a unified, declarative bar-aligned market-data model to both its charting engine and its browser-compiled scripting runtime:

1. **Unified Bar-Grid & Multi-Source Alignment (`OM04-S01`, `OM04-S02`, `OM04-S03`):**
   - Every indicator declares a primary scalar input (typically chart OHLCV candles) that establishes the canonical row grid.
   - Secondary inputs join onto that grid by bar open timestamp, with explicit per-input missing-data policies: `"carry"` (forward-fill last value), `"nan"` (explicit missingness), `"zero"` (quiet bar = 0), or `"empty"` (for optional block inputs).
   - Coarser-timeframe pins confirm only on bar close to prevent lookahead/repainting; finer-timeframe intrabar slices deliver sub-bars inside each chart bar as a block.
   - Cross-venue aggregation is expressed via pinned `(symbol, exchange)` inputs or dynamic coin-following venue legs (`follow: "coin"` with currency normalization to `USD` or `Coin`) rather than hard-coded composite feeds.
2. **Rich Celled (Block-per-Bar) Order-Flow Inputs (`OM04-S01`, `OM04-S02`, `OM04-S04`):**
   - **Sided Trades:** Exchange-tagged aggressive `BUY` and `SELL` volume per bar (supporting `Coin`, `USD`, or `Auto` contract units).
   - **Per-Bar Footprint / Volume Profile Blocks:** 4-tuples `[low, high, buy, sell]` per price bucket with configurable tick merging (`ticks_per_bar: 1..500`), zero silent truncation (overflowing `max_cells` refuses execution unless explicitly marked optional).
   - **Trade-Size Bucketed Flow:** 7 notional USD tiers (`<$1K` up to `$10M+`), returning `[bucket, buy_usd, sell_usd, buy_count, sell_count]` per bar.
   - **Order-Book Depth Blocks:** 3-tuples `[price, size, side (+1/-1)]` per resting level plus depth-band scans (`±depth_pct` around mid) and imbalance/wall analytics.
   - **Forced Liquidations:** Sided USD liquidation volume per bar (with forced sells representing liquidated longs).
3. **Derivatives Positioning Feeds (`OM04-S01`, `OM04-S02`):**
   - **Open Interest (OHLC/Close):** Quoted in USD or native coin/contract units, plus closed higher-timeframe OI candle streams.
   - **Funding Rates:** Normalized to percent-per-hour so venues with differing settlement intervals (1h vs 4h vs 8h) are directly comparable.
   - **Long/Short Ratios:** Total account ratio, top-trader account ratio, and top-trader position ratio (on charts `>= 5m`).
4. **Options Chain, Volatility Surface & Dealer Exposure (`OM04-S01`, `OM04-S05`):**
   - **Live Chain Block:** 10-value tuples `[strike, expiry_ms, side, oi, gamma, delta, mark_iv, underlying, multiplier, vega]` on the live bar.
   - **Historical Per-Bar Strike Snapshots:** 12-value tuples `[strike, expiry_ms, net_gex, call_gex, put_gex, net_dex, net_vex, call_oi, put_oi, call_iv, put_iv, underlying]` enabling historical GEX/DEX/VEX curves, call/put walls, max pain, and gamma flip calculations.
   - **Volatility Surface & Flow:** Term-structure ATM IV, 25-delta and 10-delta skew wings across standard tenors (`1W`, `1M`, `2M`, `3M`, `6M`), volatility indices, daily chain statistics, and option prints (including block trade and RFQ flags).
   - **Explicit Completeness Masks:** Option and surface rows include a `present` bitmask and `isPartial` flag so scripts distinguish unavailable fields from zero values.
5. **Off-Venue / Macro / Cross-Asset Series (`OM04-S01`, `OM04-S03`):**
   - Spot ETF daily USD flows, coin holdings, and NAV premium/discount; macro economic time series (e.g., FRED yields); token supply/market cap; prediction-market outcome odds; and cross-asset pins (US equities/ETFs, OTC FX/metals, OTC indices, CME Group futures).
6. **Exchange Session Calendars & Trade Dates (`OM04-S01`, `OM04-S03`, `OM04-S04`):**
   - Exposes venue-native `trade_date` (e.g., CME day rolling at 17:00 Chicago time; 24/7 crypto on UTC) and `session` phase (`regular`, `pre-market`, `after-hours`, `closed`) with NYSE holiday/early-close calendars (2015–2028) for CVD resets and daily-bar close alignment.
7. **Data Licensing & Entitlement Model (`OM04-S06`, `OM04-S07`):**
   - Crypto data is live and free; US stocks (15m delay) and CME Group futures (10m delay after one-time CME terms clickthrough) chart free on delay, with paid real-time add-ons split into **L1** (top-of-book + trades -> live footprint/CVD, heatmap stays delayed) and **L2 Real-Time Depth** (live heatmap, DOM, pull/stack, depth replay).
   - **Broker-Session Pass-Through:** Connecting an already-entitled futures broker account unlocks live CME candles and order flow without double-paying a platform CME add-on; disconnecting reverts to the 10-minute delay.
   - **Licensing Scope Guards:** Browser-only execution is enforced for CME and OTC index pins because cloud servers/alerts cannot hold per-viewer exchange redistribution licenses.

### 1.2 Allegedly Current Implementation Inventory (Verified in Codebase 2026-11-27)

Inspecting Allegedly's actual Rust crates reveals both strong core primitives and concrete functional gaps:

| Layer | Current Codebase State | Verified Strengths | Verified Deficits / Bugs |
|---|---|---|---|
| **Core Types** (`crates/allegedly-core`) | `NormalizedTick` (72 B, `#[repr(C)]`), `BookLevel` (24 B), `PriceE9`/`QtyE9` (`i64` scaled `1e-9`), 5-tier `ProvenanceTier`, `ProvenanceModifiers`, `BookState` (`Live`/`Stale`/`Rebuilding`/`Disconnected`/`Halted`). | **Zero `f64` floats** in price/qty math; exact `1e-9` fixed-point; compile-time layout assertions; explicit provenance & book-health enums. | `AssetClass` lacks `CryptoPerp`, `Options`, `Macro`; no domain structs for `OhlcBar`, `OpenInterest`, `FundingRate`, `Liquidation`, `OptionContract`, or `SessionPhase`. |
| **Ingest** (`crates/allegedly-ingest`) | `parse_kraken_trade`, `kraken_book_crc32`, `parse_coinbase_trade` (with maker->taker inversion), `SideClassifier` (Lee-Ready + Tick Rule), lock-free `rtrb` SPSC rings, `ws_client.rs`, `bin/live_soak.rs`, `SyntheticSimProvider`. | Zero-float `serde_json` `arbitrary_precision` parsing; fail-closed Kraken CRC32 & Coinbase `sequence_num` gap detection; verified US-legal `$0` Kraken/Coinbase WS connectivity. | **Defect 1:** `SyntheticSimProvider::next_tick()` tags synthetic ticks as `ProvenanceTier::ExactTickAggr` (`dispatcher.rs:162`) instead of a synthetic provenance marker. **Defect 2:** Prior to Part B, live WS feeds existed only in tests/soak binary and were not wired into `AllegedlyRuntime`. **Defect 3:** No REST historical OHLCV/trade backfill, no L2 book snapshot persistence, no multi-venue fan-in, no Coinbase L2/L3 stream wired yet. |
| **Storage** (`crates/allegedly-storage`) | `.atvault` Zstd-3 CRC32-checked append-only tick blocks (`atvault.rs`), Parquet 2.0 `DELTA_BINARY_PACKED` + Zstd-3 (`parquet_vault.rs`), SQLite partition catalog (`catalog.sqlite`). | Crash-safe atomic `sync_all()` + rename; bounded block deserialization (no OOM DoS); row-group min/max pruning; 100% lossless fixed-point tick roundtrip. | **Trades-only schema:** Only 72-byte `NormalizedTick` is persisted. Zero on-disk tables/schemas for L2 depth snapshots/deltas, OHLCV bars, derivatives positioning (OI/funding/liqs), or options chains. |
| **Order Flow & IPC** (`crates/allegedly-orderflow`, `crates/allegedly-ipc`) | `FootprintSlabArena` (bounded `5_000` bars), `TpoProfile` (`u128` 96 brackets), `DyadicVrvpTree`, 9 binary `ALG2` frame types (`0x0001`–`0x0201`). | Zero-JSON raw binary IPC (`tauri::ipc::Response`); exact integer diagonal imbalance & POC/VA math; out-of-order tick drop protection. | No trade-size bucket accumulator; no resting depth-band/wall/pull-stack tracker; no exchange session/trade-date calendar roll; no `ALG2` frames for derivatives positioning or options chains. |
| **Runtime & Studies** (`crates/allegedly-app`, `crates/allegedly-studies`) | `AllegedlyRuntime` (`SV-01` offline boot default), `LocalPaperOms` + SQLite WAL, Luau sandbox (`StudyRunRequest`). | Zero-network boot (`updates_check_on_startup=false`, `live_armed=false`, `offline_mode=true`); single-process low-latency local architecture. | Prior to Part B, `poll_binary_frames` was hardcoded to `step_sim_frames`; `AllegedlyRuntime` tracks only a single active symbol/stream; `StudyRunRequest` passes only scalar `Vec<f64>` (`closes`, `volumes`, `buy_volumes`, `sell_volumes`) — zero access to footprint cells, L2 book snapshots, or cross-symbol inputs. |

---

## 2. Brutal Truths (Economic, Legal & Architectural Realities)

1. **A Cloud-Relayed Web Platform's Feed Catalog Cannot Be Cloned for `$0` in a Local FOSS App — Nor Should It Be.**
   The Reference Platform operates centralized market-data servers that pay commercial redistribution licenses (CME Group vendor licenses alone cost **$29,280/yr/exchange** real-time, **$21,840/yr/exchange** delayed, and **$35,220/yr/exchange** historical across 4 DCMs = `$87K–$141K/yr` before OPRA or Massive/Polygon business feeds; see `02-Research/R03-Market-Data.md` §3). Allegedly is strictly FOSS + `$0` core (`Constraints.md` #1, #2). Attempting to host a centralized relay for CME/OPRA/US Equities would violate both budget and exchange ILAs.
2. **Direct-to-Exchange Local Execution Is a Structural Advantage on Crypto & BYO Feeds.**
   Because Allegedly runs natively on the user's machine (`Rust + Tauri`), connecting directly to `wss://ws.kraken.com/v2` and `wss://advanced-trade-ws.coinbase.com` removes cloud-relay latency, avoids server-side rate-limit throttling, and lets users record their own local Tick Vault (`.atvault`/Parquet) with zero subscription fees.
3. **US-Legal `$0` Live Data Has Hard Gaps in Perps, Futures, Equities & Options.**
   - **Spot Crypto (Kraken + Coinbase):** `$0`, live, US-legal, native aggressor side, L2 depth (and L3 on Coinbase Exchange). **Does NOT include perpetual OI, funding rates, or forced liquidations.**
   - **Offshore Crypto Perps (Binance Global HTTP 451, Bybit HTTP 403, Hyperliquid US ToS ban) & Crypto Options (Deribit):** Cannot be US out-of-the-box defaults (`R03` §3). Must be strictly opt-in regional/user-configured adapters.
   - **CME Futures & OPRA Options:** Real-time data CANNOT be `$0`. Legal paths are Rung 1 (BYO Databento `$125` credits / `$199/mo` live), Rung 2 (Broker-session pass-through via user's entitled IBKR/Rithmic/Tradovate account), or Rung 4 (user-owned `.dbn`/Parquet replay).
   - **US Equities:** Free live tiers (Alpaca Basic `feed=iex`, Tiingo) cover **~2.5% of US market volume** with no L2 depth and no native aggressor side.
4. **Tick-Side Inference Accuracy Limits Still Apply Whenever Aggressor Side Is Absent.**
   Any US-equities SIP feed (Alpaca/Massive) or IBKR `reqTickByTickData` stream lacks exchange-reported aggressor flags. Peer-reviewed microstructure benchmarks (`R03` §5.2) establish hard accuracy ceilings:
   - **Lee-Ready (1991):** ~`69%` (0s lag, Chakrabarty et al. 2012) to `81.05%` (Ellis et al. 2000), degrading sharply to **`66.55%–67.20%` during high-activity bursts** (Panayides et al. 2019) — precisely when order-flow traders read footprint imbalances.
   - **Tick Rule:** `72.8%–77.66%` on equities, collapsing to **`59%` on wide-spread options** (Savickas & Wilson 2003).
   - Every misclassified trade flips `+V` to `-V` (`2V` delta error). Allegedly's 5-tier `ProvenanceTier` + `ProvenanceModifiers` MUST remain loudly surfaced on charts and study outputs whenever `SideClassifier` is active.
5. **The Reference Platform's Float-Only Scripting ABI Is a Correctness Regression We Must Avoid.**
   While the Reference Platform's *data model* (celled blocks, explicit `missing` policy, `present` bitmasks) is strong, its scripting layer passes all prices, quantities, and book levels as IEEE-754 `f64` (`StaticArray<f64>`). Allegedly must keep its fixed-point integer `PriceE9`/`QtyE9` core invariant intact end-to-end and only convert to float at final display/script-boundary edges where explicitly required.

---

## 3. Comprehensive Feed & Feature Gap Matrix

| Domain / Feed | Reference Platform Capability | Allegedly Current State | `$0` Core Feasibility (US-Legal) | Gap Severity |
|---|---|---|---|---|
| **Live Spot Crypto Tape + Native Aggressor** | Multi-venue live trades, `BUY`/`SELL` split, coin/USD currency toggle | Kraken WS v2 + Coinbase AdvTrade WS (wired in Part B; maker->taker inversion verified) | **Yes (`$0`, zero keys)** | Closed in P0 (needs historical backfill) |
| **Live L2 Order Book + Integrity** | `book.cells` (`[price, size, side]`), depth-band imbalance, walls, heatmap | Kraken WS v2 `book` (depth 25/100 + live top-10 CRC32 fail-closed -> `BookState::Stale`) wired in Part B; Coinbase L2/L3 not yet wired into runtime | **Yes (`$0`, zero keys)** | Medium (add Coinbase `level2` + depth-band analytics) |
| **Historical OHLCV & Intrabar Bootstrap** | Immediate multi-TF candles + `intrabar.cells` (`1m` inside `1h`) | None in runtime — live chart starts empty until live ticks arrive; Kraken WS `ohlc` gives only active/recent snapshot | **Yes (`$0` public REST on Kraken/Coinbase)** | **High (P1)** |
| **Trade-Size Bucketed Flow** | 7 notional USD tiers (`<$1K` to `$10M+`), buy/sell USD & counts | Missing | **Yes (`$0`, computed locally from live/vault ticks!)** | Medium (P1 — high value, zero external API cost) |
| **Multi-Venue Aggregation & Cross-Symbol** | Pinned `(symbol, exchange)`, dynamic `follow: "coin"` legs, venue dominance, spreads | Single `active_symbol` + single live stream in `AllegedlyRuntime`; no cross-venue symbol normalizer | **Yes (`$0` across Kraken + Coinbase)** | **High (P1)** |
| **L2 Depth & Bar Persistence (Storage)** | Server-backed historical depth replay & footprints | `allegedly-storage` persists `NormalizedTick` only (`.atvault` + Parquet); zero L2/bar storage | **Yes (`$0` local disk)** | **High (P1)** |
| **Sparse Alignment & Completeness Semantics** | Per-input `missing: carry/nan/zero/empty`, `present` bitmask, `isPartial`, strict no-truncation | No bar-grid join layer or missingness policy; `StudyRunRequest` takes raw `Vec<f64>` only | **Yes (`$0` local engine design)** | Medium-High (P2) |
| **Exchange Session & Trade-Date Calendars** | Venue-native `trade_date` (CME 17:00 CT, NYSE RTH/ETH, holidays/early closes) | Pure UTC modulo bucketing in `FootprintSlabArena` & `TpoProfile` | **Yes (`$0` static calendar tables)** | Medium (P2) |
| **Derivatives Positioning (OI, Funding, Liqs, L/S)** | Hourly-normalized funding, USD/coin OI, sided USD liquidations, top-trader L/S | Missing completely in core, ingest, storage, and IPC | **Partial:** Not on Kraken/Coinbase Spot; requires US CFTC derivatives APIs or opt-in non-US perp adapters | Medium (P3) |
| **Options Chain, Vol Surface & Dealer GEX** | Live 10-field chain, 12-field historical strike snapshots, GEX/DEX/VEX, IV term/skew, OPRA/CME/Deribit flow | Missing completely | **No for OPRA/CME (`$` BYO)**; crypto options (Deribit public) geo-restricted for US trading (**UNVERIFIED** public data ToS) | Low-Medium for v0.1; P3 for v0.3+ |
| **Off-Venue Macro & ETF Flows** | FRED series, Spot ETF daily flows/holdings/premium, token supply, prediction odds | Missing completely | **FRED API is `$0` (free BYO key)**; ETF flows require free public/BYO sources | Low (P2/P3) |
| **CME Futures & Broker Entitlement Pass-Through** | Free 10m delayed CME + paid L1/L2 add-ons + broker-session pass-through (Tradovate/Rithmic) | Research/design in `R03` Rung 1/2/4; `.dbn` importer & broker adapters not yet in `allegedly-app` | **Offline `.dbn` (`$0` + `$125` Databento credits) & BYO Broker Pass-Through (`$0` to Allegedly)** | High for v0.2 (P2) |

---

## 4. Provenance, Integrity & Latency Considerations

### 4.1 Direct Desktop Ingest vs Cloud Relay
- **Latency:** Direct TLS WebSocket connections from Allegedly's Rust core (`tokio-tungstenite` + `rustls`) to exchange edge nodes avoid an intermediate SaaS ingest/fan-out hop, keeping normalize-to-ringbuffer overhead sub-millisecond (`R03` S05-G4 target: p99 `< 1.0 ms`).
- **Fail-Closed Integrity:** Allegedly validates Kraken WS v2 top-10 L2 **CRC32 checksums** on every snapshot/delta and enforces strict Coinbase `sequence_num` monotonicity, transitioning immediately to `BookState::Stale` and emitting an uncoalesced `STREAM_STATUS_FRAME` (`0x0201`) plus automatic resync on any anomaly. By contrast, cloud-relayed terminals buffer and re-aggregate upstream feeds (and publicly document CME lag/freeze/gap incidents).
- **Provenance Honesty Defect to Fix:** `SyntheticSimProvider::next_tick()` currently emits `ProvenanceTier::ExactTickAggr` on synthetic ticks. While `get_market_data_status()` now surfaces `"SYNTHETIC: PAPER-SIM"` for Paper Sim mode, `SyntheticSimProvider` and `step_sim_frames` should ultimately carry an explicit synthetic provenance modifier/tier so replay files or IPC consumers can never mistake simulated ticks for real exchange prints.

### 4.2 Multi-Rung Fallback Ladder Alignment
Allegedly's 6-rung ladder (`R03` §4) maps cleanly against the Reference Platform's paid/delayed tiers without violating `$0` core:
- **Rung 1 (BYO Pro API — Databento / Massive / Alpaca Plus):** Replaces platform-resold CME/OPRA/SIP add-ons with user-owned keys (zero redistribution liability for Allegedly).
- **Rung 2 (Broker-Session Entitlement Pass-Through — IBKR clean-room / Rithmic / Tradovate):** Matches the Reference Platform's best UX insight — if a trader already pays their futures broker for live CME data, connecting that broker session unlocks live charts/DOM/footprint in Allegedly at `$0` extra platform cost.
- **Rung 3 (`$0` Zero-Key Live Crypto — Kraken WS v2 + Coinbase AdvTrade WS):** Live v0.1 default (implemented in Part B), legally clean for US & global users.
- **Rung 4–5 (Local `.dbn`/Parquet Import + Self-Recorded Local Tick Vault):** Replaces server-side historical depth replay with user-owned local storage (`.atvault` + Parquet).
- **Rung 6 (Delayed / Partial / Synthetic Fallback):** Explicitly badged `SYNTHETIC: PAPER-SIM` or `DELAYED` — zero silent substitution (e.g., selecting `NQ1!` or `ES1!` on Kraken WS v2 fails explicitly with supported-symbol diagnostics instead of silently falling back to fake data).

---

## 5. Inferences

1. **Celled Order-Flow Inputs Are the Real Differentiator — Not 50 Exotic Feeds:** Reviewing the Reference Platform's cookbook and order-flow kit (`OM04-S01`, `OM04-S04`), the highest-leverage capability for discretionary and systematic order-flow traders is letting user scripts read **per-bar footprint buckets, L2 book depth/imbalance, and multi-venue CVD** directly on a synchronized bar grid with explicit missing-data rules — all of which Allegedly can compute **100% locally at `$0`** from Kraken/Coinbase streams and local `.dbn`/`.atvault` vaults.
2. **Trade-Size Bucketing Is a Zero-Cost Quick Win:** Because Allegedly already ingests every raw `NormalizedTick` (`price_e9`, `qty_e9`, `aggressor_side`), computing 7 notional USD trade-size buckets per bar requires zero external APIs, zero extra network bandwidth, and pure integer `i128` multiplication (`price_e9 * qty_e9 / 1e9`).
3. **Broker-Session Data Pass-Through Solves CME Adoption Without Platform Licensing Costs:** Replicating the Reference Platform's broker-entitlement pass-through pattern (Rung 2) is the single cleanest path to live CME Futures in Allegedly v0.2 while remaining 100% FOSS and `$0` core.
4. **Options Chains & Crypto Perp Positioning Should Be Schema-First, Adapter-Second:** Designing clean fixed-point structs and `present` bitmasks in `allegedly-core` before adding opt-in adapters avoids retrofitting float-based schemas later.

---

## 6. Prioritized Recommendations

| Priority | Milestone | Action Item | Owned Crates / Docs | `$0` Core Compliant? |
|---|---|---|---|---|
| **P0 (Now)** | **v0.1 Live Core** | Wire real Kraken WS v2 (`trade`, `book` with live top-10 CRC32, `ohlc`) and Coinbase AdvTrade WS (`market_trades` with `sequence_num` monotonicity + maker->taker inversion) into `allegedly-ingest`, `allegedly-app`, and Tauri while keeping `SV-01` offline boot default intact. *(Completed in Part B.)* | `allegedly-ingest`, `allegedly-app`, `apps/desktop/src-tauri` | Yes (`$0`, zero keys) |
| **P1 (Next)** | **v0.1.1 Usability & Parity** | 1. Add opt-in public REST OHLCV + recent-trade bootstrap (Kraken/Coinbase) on live stream connect so charts open with populated historical bars.<br>2. Add `SyntheticSimProvider` honest provenance flag (`ProvenanceModifiers` bit or `ProvenanceTier::SyntheticIntrabar`) across sim ticks.<br>3. Add Coinbase AdvTrade `level2` (`l2_data`) book maintenance + local **7-tier notional trade-size bucketing**.<br>4. Extend `allegedly-storage` with L2 snapshot/delta and OHLCV bar Parquet/vault schemas.<br>5. Add multi-venue fan-in (`Kraken + Coinbase` composite CVD, spread, venue share) with explicit `missing` policy (`carry`/`nan`/`zero`) and canonical symbol resolver (`BTC/USD` ↔ `BTC-USD` ↔ `XBT/USD`). | `allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-app` | Yes (`$0`, zero keys) |
| **P2** | **v0.2 Order-Flow Scripting & CME** | 1. Expose read-only bounded celled inputs (footprint buckets, L2 top-N levels, size buckets, multi-symbol pins) + `present`/`isPartial` flags to `allegedly-studies` (Luau sandbox).<br>2. Add exchange session & trade-date calendars (24/7 UTC, CME 17:00 CT, NYSE RTH/ETH + holidays) for accurate CVD/TPO resets.<br>3. Ship native `.dbn`/`.dbn.zst` reader (`databento/dbn` Apache-2.0) + BYO broker-session CME pass-through (`rust-ibapi` MIT / R04 futures broker adapters) + `$0` BYO FRED macro fetcher. | `allegedly-core`, `allegedly-studies`, `allegedly-ingest`, `allegedly-orderflow` | Yes (`$0` core + BYO user keys/brokers) |
| **P3** | **v0.3+ Perps & Options** | 1. Add fixed-point derivatives positioning schema (`OpenInterest`, `FundingRateHourly`, `LiquidationEvent`) for US CFTC crypto derivatives (Coinbase/Kraken Derivatives US) and opt-in non-US perp adapters.<br>2. Add options chain / vol-surface / GEX data model (`present` bitmask, as-of expiry clock, strike-table aggregation) for BYO OPRA/CME (Databento/Massive/IBKR) and opt-in crypto options feeds. | `allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-ipc` | Yes (`$0` core + BYO) |

---

## 7. Open Questions & UNVERIFIED Items

### 7.1 Open Architecture Questions
1. **Live Vault Auto-Recording Default:** Should activating a live Kraken/Coinbase stream automatically record ticks to the local `.atvault` / Parquet vault (Rung 5) by default, or require an explicit "Record to Vault" toggle to bound disk usage?
2. **Kraken/Coinbase US CFTC Derivatives Availability:** Confirm whether Coinbase US CFTC Perpetual/Futures (`CDE`) and Kraken Derivatives US expose unauthenticated public WS channels for OI, funding, and liquidations accessible from US IPs.
3. **Luau Study Celled ABI Representation:** Confirm with Core/Studies (`allegedly-studies`) whether celled footprint/book blocks passed to Luau scripts should use integer `i64` tick/e9 arrays or pre-scaled fixed-point helper accessors to keep `f64` precision loss out of order-flow math.

### 7.2 UNVERIFIED Items & Concrete Human Verification Steps
1. **Reference Platform Exact CME Add-On Dollar Pricing (`UNVERIFIED`):** The public CME FAQ (`OM04-S07`) states prices depend on non-professional vs professional status and are shown only at authenticated checkout.
   - *Human verification step:* If competitive pricing benchmarks are needed, inspect the authenticated subscription checkout page manually (never commit credentials or paywalled screenshots to the vault).
2. **Deribit Public Market-Data WebSocket Terms for US Persons (`UNVERIFIED`):** Deribit prohibits US persons from trading/accounts, and whether unauthenticated read-only market-data consumption from US IPs is permitted under Deribit's current API Terms was not verified in this audit.
   - *Human verification step:* Review Deribit's current Terms of Service and API documentation in a browser before implementing any P3 crypto options adapter; keep any Deribit adapter strictly opt-in/non-US unless cleared.
3. **Coinbase US CFTC Derivatives Public WS Schema (`UNVERIFIED`):** Exact unauthenticated public channels for OI/funding/liquidations on US-regulated Coinbase derivatives contracts were not probed in this pass.
   - *Human verification step:* Query Coinbase Advanced Trade public product list (`GET /api/v3/brokerage/market/products?product_type=FUTURE`) and inspect live WS channel support for perpetual/dated futures contracts.

---

## 8. Sources

| Source ID | Track | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|---|
| `OM04-S01` | R03 | Market Data Overview (`what-you-can-read`) | https://openmarket.xyz/wrun/core-concepts/what-you-can-read | 2026-11-27 | Direct HTTP fetch & full markdown inspection | High |
| `OM04-S02` | R03 | Data Sources Reference (`data-sources`) | https://openmarket.xyz/wrun/core-concepts/data-sources | 2026-11-27 | Direct HTTP fetch & markdown inspection | High |
| `OM04-S03` | R03 | Multi-Source & Aggregation Reference (`multi-source`) | https://openmarket.xyz/wrun/core-concepts/multi-source | 2026-11-27 | Direct HTTP fetch & full markdown inspection | High |
| `OM04-S04` | R03 | Order-Flow Functions Reference (`order-flow-kit`) | https://openmarket.xyz/wrun/functions/order-flow-kit | 2026-11-27 | Direct HTTP fetch & markdown inspection | High |
| `OM04-S05` | R03 | Options Analytics Reference (`options-kit`) | https://openmarket.xyz/wrun/functions/options-kit | 2026-11-27 | Direct HTTP fetch & markdown inspection | High |
| `OM04-S06` | R03 | Plans & Data Entitlements FAQ (`what-data-do-i-get`) | https://openmarket.xyz/learn/faq/plans-data/what-data-do-i-get | 2026-11-27 | Direct HTTP fetch & full markdown inspection | High |
| `OM04-S07` | R03 | CME Futures Data Plans FAQ (`what-does-cme-data-include`) | https://openmarket.xyz/learn/faq/data-symbols/what-does-cme-data-include | 2026-11-27 | Direct HTTP fetch & full markdown inspection | High |
| `OM04-S08` | R03 | Allegedly Market Data Research & Capability Matrix | `02-Research/R03-Market-Data.md`, `02-Research/Provider-Capability-Matrix.md` | 2026-11-27 | Local vault file inspection | High |
| `OM04-S09` | R03 | Allegedly Rust Workspace (`allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-ipc`, `allegedly-app`) | `crates/*` | 2026-11-27 | Local source code inspection | High |
