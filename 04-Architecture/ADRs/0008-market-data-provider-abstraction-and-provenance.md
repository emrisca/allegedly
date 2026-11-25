---
title: "ADR-0008: Market-Data Provider Abstraction, Tick-Vault Ingest, and Loud Provenance"
type: adr
status: proposed
phase: Phase 3
owner: architect
updated: 2026-11-24
code_refs:
  - spikes/S05-live-ingest-tickvault/src/model.rs
  - spikes/S05-live-ingest-tickvault/src/fixed_point.rs
  - spikes/S05-live-ingest-tickvault/src/kraken.rs
  - spikes/S05-live-ingest-tickvault/src/coinbase.rs
  - spikes/S05-live-ingest-tickvault/src/orderbook.rs
  - spikes/S05-live-ingest-tickvault/src/vault.rs
  - spikes/S05-live-ingest-tickvault/src/resilience.rs
  - spikes/S05-live-ingest-tickvault/src/offline.rs
  - spikes/S05-live-ingest-tickvault/src/inference.rs
---

# ADR-0008: Market-Data Provider Abstraction, Tick-Vault Ingest, and Loud Provenance

## 1. Context

Allegedly is an order-flow-first trading terminal (`Footprint Bar`, `DOM Ladder`, `Volume Profile`, `TPO Profile`, `Imbalance`, Absorption) constrained by a strict **`$0` core** charter and **Honest Data Provenance** (`[[01-Charter/Constraints]]`, `[[01-Charter/Principles]]` P5). Market-data reality imposes four non-negotiable constraints uncovered in `[[02-Research/R03-Market-Data]]` and validated empirically in `[[03-Spikes/S05-Live-Ingest-TickVault]]`:

1. **Zero free real-time CME / US-equities L2/L3 feeds exist:** CME Group's 2026 fee schedule (`R03-S34`) charges vendors `$29,280/yr` per exchange (`$117,120/yr` across 4 DCMs) for real-time distribution, `$21,840/yr` for delayed, and `$35,220/yr` for historical redistribution; individual Non-Pro subscribers still pay `$1.55/mo` L1 (`$4.65` bundle) or `$12.10/mo` L2 (`$36.50` bundle) through a licensed `Provider` or `Broker`. Allegedly therefore **never redistributes exchange data**—it ships `$0` zero-key public crypto feeds out of the box and supports Bring-Your-Own-Key (BYOK) / local-file ingestion for CME futures, equities, and FX.
2. **Offshore geo-blocks and scrapers are fatal defaults:** `Binance Global` (`HTTP 451` US block + Terms §b), `Bybit` (`HTTP 403` Excluded Jurisdiction), and `Hyperliquid` (US Terms prohibition + June 2026 `l2Book` throttling) cannot be US-safe defaults. Scraping tools (`yfinance` after Yahoo Nov 2026 C&Ds; `Stooq` after Mar–Apr 2026 CAPTCHA wall; reverse-engineered Sierra Chart `.scid` after docs removal on `2026-10-13`) violate charter ToS hygiene.
3. **Provider quirks corrupt order-flow analytics if normalized carelessly:**
   - **Floating-point drift:** `f64` price keys corrupt `Book Level` maps and `Footprint Bar` price buckets.
   - **Inverted `Aggressor` semantics:** Coinbase Advanced Trade WebSocket `market_trades` reports the **maker's** side rather than the **taker's** (`Aggressor`) side. In `S05`'s live 60s soak (`579` trades), inverting Coinbase's `side` matched BBO **`84.11%` strict / `85.84%` midpoint (`487/579`, `497/579`)** versus **`11.92%` strict / `13.99%` midpoint (`69/579`, `81/579`)** uninverted—a **`6.1×` empirical proof** that forgetting to invert flips every `Footprint Bar` delta backward. Moreover, the residual `~14.2%` mismatch stems from Coinbase's `~50 ms` `level2` coalescing (~14.8 level deltas per WS message), proving the inverted exchange side must remain authoritative and **never** be overwritten by L2 quote-matching.
   - **Silent book corruption:** Dropped frames, sequence gaps, CRC32 mismatches, or channel backpressure silently poison a `DOM Ladder` unless the `Provider` fails closed into an explicit stale state.
4. **Tick-side inference has hard accuracy ceilings:** Academic benchmarks (`Ellis et al. 2000`, `Chakrabarty et al. 2012`, `Panayides et al. 2019`, `Savickas & Wilson 2003`) place quote-based Lee-Ready classification at `66.55%–81.05%` on US equities and high-activity bursts (`19%–33%` misclassification) and tick-rule fallback as low as `59%` on wide-spread options. Treating inferred or OHLCV-synthesized `Aggressor` sides as exchange-exact order flow is dishonest and dangerous.

---

## 2. Options & Weighted Criteria

### 2.1 `v0.1` `$0` Zero-Key Live Default `Provider`s (`R03` §6.1)

Scored `1.0`–`5.0` from `[[02-Research/R03-Market-Data]]` §6.1:

| Criterion | Weight | **Kraken WS v2 + Coinbase AdvTrade/Exch WS** | Binance Global | Bybit + OKX Global | Hyperliquid | Alpaca Basic IEX + dxFeed Demo |
|---|---:|---:|---:|---:|---:|---:|
| US-Legal & Zero-Key Public Access | 30% | 5.0 | 1.5 | 2.0 | 2.0 | 4.5 |
| Native `Aggressor` + L2/L3 Order-Book Integrity | 30% | 5.0 | 5.0 | 4.5 | 3.5 | 1.5 |
| Protocol Quality (CRC32 / Sequence Numbers / Latency) | 20% | 4.6 | 4.8 | 4.2 | 4.0 | 3.5 |
| ToS Cleanliness & Stability | 20% | 4.3 | 4.5 | 4.0 | 4.5 | 4.5 |
| **Weighted Total (out of 5.00)** | **100%** | **4.78** | **3.81** | **3.59** | **3.35** | **3.40** |

### 2.2 CME Futures & Institutional Order-Flow Path (`R03` §6.2)

Scored `1.0`–`5.0` from `[[02-Research/R03-Market-Data]]` §6.2:

| Criterion | Weight | **Databento DBN Local + BYO API (`$125` credits → `$199/mo` Live)** | dxFeed | Massive Futures | IBKR Clean-Room `rust-ibapi` (`v0.2` Broker Plug-In) |
|---|---:|---:|---:|---:|---:|
| True Exchange L3 MBO / Native `Aggressor` Fidelity | 35% | 5.0 | 4.5 | 2.0 | 2.0 |
| Self-Serve Onboarding & `$0` Local-File Ergonomics | 25% | 5.0 | 2.5 | 4.0 | 2.5 |
| Schema & Licensing (`Apache-2.0` `dbn v0.75.0`, `1e-9` `i64`) | 20% | 5.0 | 3.5 | 4.0 | 4.0 |
| Concurrent Depth / Tick Limits & Retail Cost | 20% | 4.15 | 4.2 | 3.8 | 2.75 |
| **Weighted Total (out of 5.00)** | **100%** | **4.83** | **3.74** | **3.26** | **2.68** |

*Note:* `IBKR` (`wboayue/rust-ibapi v5.7.0`, `MIT`) is **not** selected as a primary tick/depth `Provider` (capped at `3` concurrent L2 books and `5` tick-by-tick streams, no native `Aggressor`, requires `$500+` account + paid CME subs), but **is** retained as a `v0.2` retail `Broker` + Rung 2 secondary feed adapter.

### 2.3 Canonical Numeric Domain & Ingest Hot-Path Architecture

| Criterion | Weight | **Fixed-Point `i64` (`1e-9` Nano-Units) + Raw JSON / Zero-Copy Binary + `.atvault` → Parquet** | `f64` Prices + Direct SQLite Tick Inserts | `rust_decimal` (`128-bit`) Everywhere |
|---|---:|---:|---:|---:|
| Zero Float Drift & Exact `Book Level` / `Footprint Bar` Keys | 30% | 5.0 | 1.0 | 5.0 |
| 1:1 `Databento` DBN (`FIXED_PRICE_SCALE = 1e9`) Interop | 25% | 5.0 | 2.0 | 3.0 |
| Hot-Path Throughput & Compact Storage (`S05`, `S08`) | 30% | 5.0 | 2.5 | 3.5 |
| Implementation Simplicity | 15% | 4.5 | 5.0 | 4.0 |
| **Weighted Total (out of 5.00)** | **100%** | **4.93** | **2.30** | **3.90** |

---

## 3. Decision

### 3.1 Unified `MarketDataProvider` Trait & Canonical Fixed-Point Domain (`allegedly-ingest`)

1. **Zero-Float Core Domain (`1e-9` `i64`):** Every price (`price_e9: i64`) and quantity (`qty_e9: i64`) across `allegedly-ingest` `Provider` adapters, `OrderBook`, local tick vault (`allegedly-storage`), `Footprint Bar` aggregators (`allegedly-orderflow`), and `DOM Ladder` snapshots uses signed 64-bit fixed-point nano-units (`scale = 1_000_000_000`), giving exact 1:1 bit compatibility with Databento `dbn v0.75.0` (`FIXED_PRICE_SCALE = 1_000_000_000`).
   - JSON `Provider`s parse decimal numbers directly from `serde_json::value::RawValue` into `i64` without ever passing through `f64` (proven in `spikes/S05-live-ingest-tickvault/src/fixed_point.rs` and `kraken.rs`).
   - Legacy binary feeds carrying floats (such as Dukascopy `.bi5` `f32` sizes) convert to `i64` strictly at the ingress boundary (`offline.rs`).
2. **Normalized Event Envelope & `MarketDataProvider` Trait:** All live and offline adapters in `allegedly-ingest` implement a single Rust `MarketDataProvider` trait emitting strongly typed `MarketEvent` records stamped with canonical `InstrumentId`, `Venue`, `Provider`, `ts_exchange_ns`, `ts_recv_ns`, `sequence_num`, and immutable `ProvenanceMetadata`:
   - `TradeTick` (`price_e9`, `qty_e9`, `aggressor: AggressorSide`, `aggressor_source: AggressorSource`, `provenance: ProvenanceTier`)
   - `BookSnapshot` / `BookDelta` (L2 `BTreeMap<i64, i64>` bids/asks or L3 MBO order events)
   - `BookHealthTransition` (`Syncing` → `Live` → `Stale(StaleReason)`)
   - `SessionGap` / `ProviderNotice`
3. **Mandatory Provider-Specific Normalization Rules:**
   - **Kraken Spot WS v2 (`wss://ws.kraken.com/v2`):** Maintain L2 depth=25 (or configurable depth), validate Kraken's exact IEEE-802.3 CRC32 checksum over top-10 asks + top-10 bids on **every** update (`18,112 / 18,112` = `100.00%` passed in `S05`), and record `AggressorSource::ExchangeReported` (`78/78` = `100.00%` BBO match in `S05`).
   - **Coinbase Advanced Trade WS (`wss://advanced-trade-ws.coinbase.com/`):** Enforce monotonic `sequence_num` checking on every frame (`2,594 / 2,594` zero-gap in `S05`) and **always invert** `market_trades` `side` (`BUY` maker → `Sell` `Aggressor`, `SELL` maker → `Buy` `Aggressor`), tagging `AggressorSource::ExchangeReportedInverted`. Never overwrite the inverted exchange side with L2 quote-matching.
   - **Databento DBN Local / BYO API (`dbn v0.75.0`, `Apache-2.0`):** Zero-float ingest of `TradeMsg`, `Mbp10Msg`, `TbboMsg`, and `MboMsg` (`EXACT: L3-MBO` for `MboMsg`, `EXACT: TICK-AGGR` for `TradeMsg`/`TbboMsg`).
   - **Dukascopy `.bi5` Offline FX Decoder:** User-fetched LZMA `>3I2f` (`20 B` records) decoded strictly as `VenueType::OtcIndicative` + `AggressorSource::None` (`ESTIMATED: L1-QUOTE` or `SYNTHETIC` only—never promoted to exchange-exact).

### 3.2 Fail-Closed `BookState::Stale` Resilience Contract

Every live `Provider` adapter operates behind a bounded ingestion ring (`rtrb` SPSC ring per provider, capacity locked to **`16,384` frames in production** and **`1,024` frames in backpressure fault-injection tests**, aligned with `[[04-Architecture/IPC-Contract]]` and `[[03-Spikes/S08-Storage-100M-Replay]]`) and an explicit state machine:

```text
Connecting ──► Syncing (snapshot) ──► Live
                    ▲                   │
                    │                   ├─ sequence gap
                    │                   ├─ CRC32 mismatch
                    │                   ├─ WS/TCP disconnect
                    │                   └─ bounded channel drop (backpressure)
                    │                   ▼
                    └── resync ◄── Stale(StaleReason) [FAIL-CLOSED]
```

- **Fail-Closed Rule:** Any sequence gap, Kraken CRC32 mismatch, abrupt TCP/WS drop, or bounded-channel backpressure drop **immediately** transitions the `Instrument`'s book to `BookState::Stale(StaleReason)`, rejects deltas while stale (preventing poisoned `Book Level` prices from reaching the `DOM Ladder` or `Footprint Bar`), emits a `T3` degraded-feed warning (`[[04-Architecture/Error-Observability]]`), and reconnects with equal-jitter exponential backoff + full snapshot resync.
- **Verified Recovery (`S05`):** Loopback fault-injection recovered an injected sequence gap in **`7.41 ms`** (rejecting poisoned `59399.00` bid), recovered an abrupt TCP drop across a 3-attempt equal-jitter backoff (`[17, 40, 61] ms`) in **`129.68 ms`**, and transitioned immediately to `BookState::Stale(BackpressureDrop)` under `100,000`-message burst saturation (`98,976` dropped on the `1,024`-frame test ring, **`0` silent corruptions**).

### 3.3 Two-Tier Local Tick-Vault Storage Pipeline (`allegedly-storage`)

- **Hot Append Tier (`.atvault`, `S05`):** Live trade ticks append into crash-safe Zstd-3 framed `.atvault` files (`ALGDTV01` magic + immutable `ProvenanceHeader` + per-chunk CRC32; depth snapshots use `.atdepth`). Validated at **`18.32 B/tick`** (`3.93×`) on 60s live soak (`657` ticks) and **`12.37 B/tick`** (`5.82×`), **`2.48M ticks/s` write / `10.46M ticks/s` read** on 100k burst with `0` lost ticks and `0` mismatches.
- **Cold Archive Tier (Hive Parquet + SQLite Catalog, `S08`):** Completed `.atvault` session segments compact asynchronously into Hive-partitioned Parquet (`Zstd`, `4.26 B/tick`, `22.51M ticks/s` write, `102.55M ticks/s` streaming replay, `5.22 ms` cold 1-hour seeks) indexed by SQLite metadata (`[[04-Architecture/ADRs/0006-tiered-storage-and-replay]]`).

### 3.4 Six-Rung Explicit Fallback Ladder (Zero Silent Substitution)

Allegedly enforces the 6-rung ladder from `[[02-Research/R03-Market-Data]]` §4. Switching rungs **always requires explicit user action** and updates the chart `Provenance` badge immediately—Allegedly **never** silently downgrades a live feed to a delayed, partial, or synthetic feed:

| Rung | Source Class | Examples | Default `Provenance` Tier |
|---|---|---|---|
| **Rung 1** | BYO Paid / Credit Pro Feeds | Databento Live/Historical (`$125` signup credits → `$199/mo`), dxFeed BYO, Massive BYO | `EXACT: L3-MBO` / `EXACT: TICK-AGGR` |
| **Rung 2** | Broker-Bundled Feeds (`v0.2+`) | IBKR (`wboayue/rust-ibapi` `MIT`, user's funded account + exchange subs), TradeStation/Tradovate BYO | `EXACT: TICK-AGGR` or `ESTIMATED: L1-QUOTE` (per venue) |
| **Rung 3** | `$0` Zero-Key Live Crypto + User-Fetched FX | **Kraken Spot WS v2**, **Coinbase AdvTrade/Exch WS**; user-fetched Dukascopy `.bi5` | `EXACT: TICK-AGGR` (crypto); `ESTIMATED` / `OTC-INDICATIVE` (FX) |
| **Rung 4** | User Local Archive Files | Local `.dbn` / `.dbn.zst`, Parquet, CSV imports | Inherited from file header (`EXACT: L3-MBO` / `TICK-AGGR` / `ESTIMATED`) |
| **Rung 5** | Self-Recorded Local Tick Vault | Locally captured `.atvault` → Hive Parquet history from user's own sessions | Preserves original capture `ProvenanceHeader` verbatim |
| **Rung 6** | Delayed / Partial / OHLCV Synthetic | Alpaca Basic IEX (`~2.5%` US vol, no L2), dxFeed 15m delayed demo, 1m OHLCV intrabar | `ESTIMATED` / `SYNTHETIC: 1m-INTRABAR` (restricted analytics) |

**Hard-Banned Feeds:** `yfinance`, `Stooq`, Sierra Chart `.scid` parsers, and US-blocked offshore defaults (`Binance Global`, `Bybit`, `Hyperliquid`).

### 3.5 Five-Tier Loud `Provenance` System & Tick-Side Inference Guardrails

Every `Chart`, `Footprint Bar`, `DOM Ladder`, `Volume Profile`, and exported artifact carries a mandatory, non-dismissible `Provenance` badge with an on-click provenance drawer (`Source`, `Venue`, `AggressorSource`, `Accuracy Ceiling`, `BookState`):

| Tier | Badge Label | Condition | Order-Flow Feature Gate |
|---|---|---|---|
| **1** | `EXACT: L3-MBO` | Exchange order-by-order MBO (`Databento GLBX.MDP3` MBO, Coinbase Exchange `full` L3, Kraken auth L3) | All features enabled (queue position, resting-size pulls/adds, `Footprint Bar`, Absorption, Unfinished Auction) |
| **2** | `EXACT: TICK-AGGR` | Native exchange-reported `Aggressor` (`Kraken WS v2`, `Coinbase AdvTrade` inverted, Databento `Trades`/`TBBO`) | Full `Footprint Bar`, `Imbalance`, `DOM Ladder` (L2), `Volume Profile`, `TPO Profile`, Absorption |
| **3** | `ESTIMATED: L1-QUOTE` | No native `Aggressor`, L1 BBO available → integer `i128` Lee-Ready quote rule (`87.67%` live `n=657` / `86.56%` 10k bench in `S05`; literature **`66.55%–81.05%`** on US equities & bursts → `19%–33%` error) | Persistent amber badge + tooltip showing accuracy limits; `Footprint Bar` allowed with warning |
| **4** | `ESTIMATED: TICK-RULE` | No native `Aggressor` and no L1 quote → quote-less tick rule (`88.82%` live / `72.27%` 10k bench in `S05`; **`59%`** on wide-spread options) | Persistent amber/orange badge + warning; Absorption disabled |
| **5** | `SYNTHETIC: 1m-INTRABAR` | OHLCV `Bar` approximation only | High-contrast orange hatched badge; **Absorption & Unfinished Auction hard-disabled**; partial-venue feeds (IEX `~2.5%` vol) & `OtcIndicative` FX lock `Footprint Bar` Delta behind an explicit user opt-in warning |

---

## 4. Consequences

### Positive
- **Empirically validated throughput and memory headroom (`KC-05` cleared `886×`):** `S05` sustained **`17.73M events/s`** (`0.042 µs` p99) synthetic ingest + L2 book updates and **`15.33 MB`** post-soak / **`36.34 MB`** peak RSS across simultaneous Kraken + Coinbase live feeds (budget `< 60 MB`).
- **Zero-key `$0` day-one experience:** Any user on macOS or Windows can open Allegedly and view real-time `EXACT: TICK-AGGR` `Footprint Bar`s and `DOM Ladder`s on `BTC/USD` and `ETH/USD` with zero API keys, zero credit cards, and zero US geo-blocks.
- **Zero silent order-flow lies:** Coinbase's maker-side inversion is permanently encoded and regression-tested; sequence gaps, CRC32 mismatches, and backpressure fail closed; estimated/synthetic feeds cannot masquerade as exchange-exact order flow.
- **Seamless institutional upgrade path:** Switching from free crypto to Databento CME futures (`ES`/`NQ`) requires zero numeric conversion (`1e-9` `i64` 1:1) and unlocks `EXACT: L3-MBO` automatically.

### Negative
- **US equities and CME futures require BYO data:** Traders expecting free real-time `ES`/`NQ` or `AAPL` L2 depth out of the box will hit CME/SIP licensing reality and must bring a Databento key, local `.dbn` file, or `v0.2` broker account.
- **Per-venue adapter maintenance:** Every new `Provider` requires explicit verification of decimal precision, `Aggressor` polarity (maker vs taker), checksum/sequence rules, and rate limits—no generic "plug in any JSON feed" shortcut is safe.
- **Coinbase ~50 ms L2 coalescing:** Coinbase Advanced Trade `level2` batches ~14.8 deltas per WS message (~50 ms cadence), making Kraken WS v2 (`301.8` L2 updates/s, `2.13 µs` p50 parse, `100%` CRC32) the cleaner microsecond-resolution default when comparing crypto depth smoothness.

### Risks
- **Public WS rate-limit or endpoint changes (`RK-02`):** Free unauthenticated crypto WebSocket schemas or IP limits can change without SLA notice; dual-venue shipping (Kraken + Coinbase) mitigates single-venue outages, and `v0.1` Implementation CI (post-Phase-5) smoke tests detect schema drift.
- **Peak-volatility soak unverified (`S05` caveat):** `S05` validated a 60-second live soak (`301.8` L2/s Kraken + `558.9` level deltas/s Coinbase); a 30-minute CPI/FOMC peak-volatility live soak and ingestion of a real user-downloaded CME `GLBX.MDP3` `.dbn.zst` file remain open `v0.1` Implementation CI (post-Phase-5) verification items.
- **User frustration with disabled features on Rung 6 feeds:** Disabling Absorption/Unfinished Auction on `SYNTHETIC: 1m-INTRABAR` feeds and gating `Footprint Bar` Delta on OTC FX/IEX may surprise users accustomed to platforms that fabricate order flow—mitigated by clear inline provenance explanations (`[[04-Architecture/Docs-Strategy]]`).

---

## 5. Reversal Cost

- **Changing the `1e-9` `i64` fixed-point representation:** **Very High** once `.atvault` files, Parquet schemas (`S08`), `Footprint Bar` aggregators, and `Study` ABI (`Wasmtime`/`Luau`) are serialized on disk.
- **Relaxing `ProvenanceTier` or `BookState::Stale` contracts:** **Medium** technically, **Charter-Breaking** conceptually (violates `Principles` P5 Honest Data Provenance).
- **Adding or swapping a `Provider` adapter (e.g., adding Coinbase Exchange `full` L3 or `v0.2` IBKR `rust-ibapi`):** **Low** — isolated behind the `MarketDataProvider` trait and normalized `MarketEvent` envelope in `allegedly-ingest`.

---

## 6. Revisit Trigger

Reopen this ADR if any of the following occurs:
1. Kraken WS v2 or Coinbase Advanced Trade deprecates unauthenticated public `trade`/`book`/`level2` WebSocket access or imposes restrictive US geo-blocks.
2. `v0.1` Implementation CI (post-Phase-5) 30-minute peak-volatility soak exposes bounded-ring drop rates or RSS growth approaching the `< 60 MB` ingest budget, requiring ring capacity (`16,384` default) or backpressure policy tuning.
3. Testing against a real `$125`-credit Databento `GLBX.MDP3` `.dbn.zst` file reveals edge cases in CME `MboMsg` (`F_LAST` flags, implied book legs, or `price == UNDEF_PRICE`) not covered by `S05`'s synthetic DBN fixture.
4. A new `$0` US-legal, non-geo-blocked exchange offers native L3 MBO over unauthenticated WebSocket, warranting promotion into Rung 3 defaults.

---

## 7. Evidence Links

- `[[01-Charter/Constraints]]` — `$0` core, FOSS-or-die, honest data provenance, no ToS/license handwaving.
- `[[01-Charter/Principles]]` — Principle P5 (Honest Data Provenance, loud badges, no silent fallback).
- `[[01-Charter/Glossary]]` — Canonical terms (`Instrument`, `Venue`, `Provider`, `Provenance`, `Aggressor`, `Book Level`, `Footprint Bar`, `DOM Ladder`, `Imbalance`, `Bar`, `Broker`).
- `[[02-Research/R03-Market-Data]]` — Weighted matrices (§6.1 Kraken+Coinbase `4.78`; §6.2 Databento `4.83`), CME 2026 fee schedule (`R03-S34`), 6-rung fallback ladder (§4), tick-side inference literature limits (`66.55%–81.05%` Lee-Ready, `59%` tick rule, §5), banned feeds (`yfinance`, `Stooq`, `.scid`).
- `[[02-Research/Provider-Capability-Matrix]]` — Endpoint, auth, depth, `Aggressor`, and rate-limit truth table.
- `[[03-Spikes/S05-Live-Ingest-TickVault]]` — Live 60s dual-venue soak (`2026-11-25T05:13:45.55Z` → `05:14:46.13Z`), Kraken `18,112/18,112` CRC32 & `78/78` BBO, Coinbase `6.1×` maker→taker inversion proof (`84.11%`/`85.84%` vs `11.92%`/`13.99%`), `15.33 MB` / `36.34 MB` RSS, `17.73M events/s`, `.atvault` `12.37 B/tick` & `2.48M` write / `10.46M` read, `7.41 ms` / `129.68 ms` resilience recovery, `dbn v0.75.0` `18.43M rec/s` `TradeMsg` / `5.67M rec/s` `Mbp10Msg`, Dukascopy `.bi5` `1.26M rec/s`.
- `[[03-Spikes/S08-Storage-100M-Replay]]` — Cold Hive Parquet archive (`4.26 B/tick`, `22.51M ticks/s` write, `102.55M ticks/s` replay, `5.22 ms` cold 1-hr seeks).
- `[[04-Architecture/IPC-Contract]]` — `16,384`-frame production ingest ring capacity and `BookState` / `ProvenanceTier` IPC propagation.
- `[[04-Architecture/Error-Observability]]` — `IngestError` typed domain, `T3` degraded-feed warning behavior, `BookState::Stale` UI diagnostics.
- `[[04-Architecture/Docs-Strategy]]` — User-facing provenance guide explaining Rung 1–6 tiers and why synthetic order flow is restricted.
