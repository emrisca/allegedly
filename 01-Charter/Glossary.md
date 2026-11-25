---
title: Allegedly Domain Glossary
type: glossary
status: living
owner: orchestrator
updated: 2026-11-25
code_refs: []
---

# Allegedly

A local-first, cross-platform trading terminal combining clean charting and scripting with deep order-flow, profile, and execution tooling.

## Market & Data Language

**Instrument**:
A specific tradable contract or asset identified by its venue, symbol, tick size, lot size, currency, and trading calendar (e.g., CME E-mini S&P 500 June 2026 contract).
_Avoid_: Ticker, asset, pair, security (when ambiguity across futures/equities/crypto matters)

**Venue**:
The exchange, matching engine, or liquidity pool where orders match and market data originates.
_Avoid_: Feed, broker, market

**Provider**:
A market-data source or aggregator that delivers historical or live quotes, trades, or order-book updates to the terminal.
_Avoid_: Broker (unless it also routes orders), exchange, vendor

**Provenance**:
The verifiable metadata attached to every displayed price, bar, or order-flow metric: its provider, venue coverage, real-time vs. delayed status, and whether aggressor side was exchange-reported or inferred.
_Avoid_: Metadata, source tag

**Session**:
A named trading interval governed by an instrument's calendar and time zone, distinguishing Regular Trading Hours (RTH) from Extended Trading Hours (ETH) and exchange holidays.
_Avoid_: Day, trading day, market hours

**Tick**:
Either (a) the minimum legal price increment of an instrument (tick size), or (b) a single executed trade event with timestamp, price, quantity, and aggressor side. Always qualify as *price tick* or *trade tick* where ambiguous.
_Avoid_: Point, pip (except FX), print (in canonical specs)

**Aggressor**:
The market participant whose marketable order crossed the spread and triggered a trade, classified as buyer-initiated, seller-initiated, or unknown/inferred.
_Avoid_: Taker side, delta direction

**Book Level**:
An aggregated resting order-book entry at a single price tick (L2 / Market-By-Price) or an individual resting order in queue (L3 / Market-By-Order).
_Avoid_: Depth row, quote level

## Charting & Order-Flow Language

**Bar**:
A summary of trading activity over a defined interval (time, volume, tick count, or price range) holding open, high, low, close, volume, and optional order-flow breakdowns.
_Avoid_: Candle (use *Bar* in domain specs; *Candlestick* is a visual rendering style)

**Footprint Bar**:
A bar whose interior displays trade volume broken down by price tick and aggressor side (bid vs. ask), enabling delta and imbalance analysis.
_Avoid_: Cluster candle, bid-ask bar

**Imbalance**:
A directional dominance where aggressive volume at one price tick exceeds the diagonally opposite side's volume by at least a configured ratio and minimum volume threshold.
_Avoid_: Skew, dominance

**Volume Profile**:
A histogram of traded volume distributed by price tick across a session, visible chart range, or user-anchored range, defining Point of Control (POC) and Value Area (VAH/VAL).
_Avoid_: Market Profile (distinct — TPO uses time, not volume)

**TPO Profile**:
A Time Price Opportunity distribution grouping price ticks visited during sequential time brackets (typically 30-minute letters), exposing Initial Balance, single prints, and poor highs/lows.
_Avoid_: Volume Profile

**DOM Ladder**:
A vertical price ladder showing resting bid/ask book levels, recent traded volume at price, and optional direct order entry.
_Avoid_: Price ladder, order book widget

## Studies, Workspace & Execution Language

**Study**:
A deterministic computation over one or more bar/tick series that produces plots, zones, table values, or alert signals without placing orders.
_Avoid_: Indicator (use *Study* as the umbrella covering indicators, overlays, and order-flow calculators)

**Drawing**:
A user-placed geometric or analytical annotation anchored in time and price coordinates on an instrument, persisted independently of chart zoom.
_Avoid_: Annotation, markup, shape

**Layout**:
A saved arrangement of docked panels, linked chart groups, instrument assignments, active studies, and visual theme.
_Avoid_: Setup, screen, view

**Workspace**:
A portable, self-contained local configuration bundle combining one or more layouts, keybindings, session templates, and study presets.
_Avoid_: Profile (collides with Volume/TPO Profile), project

**Broker**:
An execution venue or intermediary that accepts, modifies, cancels, and reports fills on simulated or live orders.
_Avoid_: Provider, gateway (a gateway is a broker's technical transport)

**Bracket Order**:
An entry order atomically linked to a protective stop-loss and one or more profit-target orders governed by One-Cancels-Other (OCO) semantics.
_Avoid_: ATM strategy (vendor-specific branding), combo order

## Architecture & Safety Language (Locked in Phase 3)

**ProvenanceTier**:
The canonical 5-tier data honesty classification attached to every Bar, Tick, Footprint Bar, Volume Profile, TPO Profile, and Book Level: `ExactL3Mbo` (`EXACT: L3-MBO`), `ExactTickAggr` (`EXACT: TICK-AGGR`), `EstimatedL1Quote` (`ESTIMATED: L1-QUOTE`), `EstimatedTickRule` (`ESTIMATED: TICK-RULE`), and `SyntheticIntrabar` (`SYNTHETIC: 1m-INTRABAR`), paired with orthogonal modifier flags (`PartialVenue`, `OtcIndicative`, `Delayed`).
_Avoid_: Data quality enum, tier badge

**BookState**:
The canonical 5-state order-book health machine (`Live`, `Stale`, `Rebuilding`, `Disconnected`, `Halted`) enforced across `allegedly-ingest`, `allegedly-oms`, binary IPC, and the plugin ABI. Any non-`Live` state blocks risk-increasing live entries while preserving the Risk-Reduction Bypass Rule.
_Avoid_: Feed status, connection flag

**Risk-Reduction Bypass Rule**:
The non-negotiable OMS safety invariant ensuring that whenever `BookState != Live` OR `RECONCILING == true`, all new risk-increasing live orders are rejected fail-closed while risk-reducing actions (`oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch` / `flatten_all`, `oms.reconcile_now`, and verified `reduce_only: true` closing orders) ALWAYS remain permitted.
_Avoid_: Stale lockout, emergency override

**Tick Vault (`.atvault`)**:
The local-first, Hive-partitioned Apache Parquet + SQLite WAL archive format owned by `allegedly-storage` storing normalized fixed-point `i64` (`1e-9`) ticks, books, and provenance headers for deterministic streaming replay (`SV-07`, `SV-14`).
_Avoid_: Cache DB, `.mvdepth`, `.scid`

**Workspace Revision (`state_rev`)**:
A strictly monotonic `u64` counter owned by the Rust core and included on every multi-window layout and drawing mutation (`IPC-Contract.md`) to prevent stale pop-out window writes from clobbering newer state.
_Avoid_: Layout timestamp, version hash
