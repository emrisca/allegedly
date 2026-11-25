---
title: R07 — Tick Storage, Deterministic Replay & Backtest Engine
track: R07
status: verified
owner: research-storage-backtest
updated: 2026-11-24
code_refs: []
---

# R07 — Tick Storage, Deterministic Replay & Backtest Engine

## Question

How should Allegedly architect its local-first market-data storage vault, canonical tick/book schemas, deterministic replay engine, data importers, and backtesting integration so that:
1. Live charting (`60 fps`, `100k+` bars) and DOM Ladder (`30+` updates/s) run with **zero GC stalls**, lock-free ingestion, and exact fixed-point financial math (`i64`, never IEEE-754 floats for prices or quantities — [[Constraints#1. Eight Design Non-Negotiables]] #5 & #7).
2. A single trader can store multi-year CME futures and crypto tick/L2 history locally on consumer SSDs in **open, sovereign file formats** (`< 40 MB` installer, `< 300 MB` idle RAM, `$0` core — [[Constraints#1. Eight Design Non-Negotiables]] #1–#3, #5).
3. Replay and backtesting deliver realistic order-flow fill/queue simulation without look-ahead bias or **BSL / TSL / Commons Clause / GPL / LGPL** license contamination.

---

## Findings

> Per [[Constraints#2. Evidence Protocol (Strict Anti-Hallucination)]], this section reports verified **Facts** grounded in primary GitHub repositories, `LICENSE` files, package registries, and official documentation retrieved on `2026-11-24`. Synthesis and architectural judgments are separated into [[#Inferences]] and [[#Recommendation + Rationale]].

### 1. Tiered Local-First Storage Architecture (Hot / Warm / Cold)

A single storage engine cannot simultaneously deliver sub-microsecond live DOM updates, ACID metadata lookups, and 10:1 compressed multi-year analytical scans inside a `< 40 MB` desktop binary. Allegedly requires a **three-tier local architecture**:

| Tier | Workload | Recommended Primitive (Verified 2026-11-24) | Latency / Footprint | Why This Tier Exists |
|---|---|---|---|---|
| **Hot Path (In-Memory)** | Live L1/L2/L3 feed ingestion → book builder → chart/DOM UI render coalescing | Rust lock-free SPSC ring buffers: **`rtrb` `v0.4.1`** (`MIT OR Apache-2.0`, `R07-S01`) or **`ringbuf` `v0.6.0`** (`MIT OR Apache-2.0`, `R07-S02`) + **`crossbeam` `v0.8.5`** (`MIT OR Apache-2.0`, `R07-S03`) | Sub-microsecond handoff; zero allocations; fixed RAM (`~8–32 MiB` pre-allocated) | Isolates network/WebSocket burst rates (10k–100k msgs/s) from UI rendering. Coalesces L2/DOM deltas into dirty-level snapshots at `30–60 Hz` and ticks into active bars without dropping a single event from the persistence writer. |
| **Warm Tier (Local Embedded DB / Catalog)** | Instrument definitions, session calendars, corporate actions, contract roll schedules, layouts/drawings, Parquet partition catalog, recent rolling intraday buffer (last 1–7 days) & trade journal | **SQLite** (Public Domain) via **`rusqlite` `v0.43.0`** (`MIT`, `R07-S04`) in WAL mode | `~1–2 MB` binary impact; `< 1 ms` indexed point queries; rock-solid crash durability | Zero-daemon, single-file ACID metadata & partition index. Handles concurrent UI reads + background writer cleanly via WAL without threatening the `< 40 MB` installer budget. |
| **Cold Tier (Open Columnar Tick Vault)** | Multi-year immutable historical trades, L1 quotes, L2 snapshots+diffs, L3 MBO, pre-aggregated OHLCV/footprint bars | **Apache Parquet (Zstd)** written & scanned natively in Rust via **`arrow-rs` / `parquet` `v60.2.0`** (`Apache-2.0`, `R07-S05`), queried via **`Apache DataFusion` `v56.0.0`** (`Apache-2.0`, `R07-S06`) **OR** optional **`DuckDB` `v2.0.1`** (`MIT`, `R07-S07`) | `~5–15x` compression; open format readable by DuckDB, Polars, PyArrow, Spark, ClickHouse | Total user data sovereignty ([[Constraints#1. Eight Design Non-Negotiables]] #3): every file on disk is standard Hive-partitioned `.parquet`. |

#### Critical Verified Binary-Size Finding: Embedding DuckDB vs. Native `parquet` + Optional DuckDB
Inspection of the official `duckdb/duckdb` **`v2.0.1`** (`2026-11-20`) GitHub release assets (`R07-S07`) reveals a major constraint collision:
- `duckdb-shared-libs-osx-arm64.tar.gz`: **`18.4 MB`** compressed (`osx-universal`: **`38.9 MB`**!)
- `duckdb-shared-libs-linux-amd64.tar.gz`: **`26.9 MB`** compressed
- `duckdb-shared-libs-windows-amd64.zip`: **`19.2 MB`** compressed
- `duckdb-static-libs-*`: **`27.5–49.3 MB`** compressed

**Implication:** Linking `libduckdb` statically inside the core Tauri/Rust desktop installer consumes **~46%–67% of Allegedly's entire `< 40 MB` installer budget** (`Constraints.md` #5) before adding Tauri, charting, or Wasmtime ([[R06-Scripting-Indicator-Engine]]). Conversely, reading/writing Hive-partitioned Parquet directly with the pure-Rust `parquet` crate (`v60.2.0`, Apache-2.0) — and exposing **DuckDB `v2.0.1` (`MIT`) as an optional on-demand analytical CLI/plugin or comparing `parquet` vs. `DataFusion` vs. `DuckDB` in Spike `S08`** — keeps the base installer lean while giving every user full DuckDB SQL power directly over the exact same `.parquet` vault files!

---

### 2. Time-Series & Analytical Database License & Fit Audit (Verified 2026-11-24)

| Database | Latest Release (2026-11-24) | Stars | Actual Verified `LICENSE` | License Trap Analysis | Desktop Local-First Fit |
|---|---|---|---|---|---|
| **DuckDB** (`duckdb/duckdb`, `duckdb-rs`, `R07-S07`, `R07-S08`) | `v2.0.1` (2026-11-20); `duckdb-rs v1.20001.0` | 43,301 | **MIT** | **CLEAN FOSS.** Zero copyleft or source-available traps. | Embedded in-process OLAP powerhouse over Parquet, BUT `18.4–26.9 MB` compressed lib size makes it best as an optional plugin/sidecar (or evaluated vs. `parquet`+`DataFusion` in S08). |
| **Apache DataFusion + `arrow-rs` (`parquet`)** (`R07-S05`, `R07-S06`) | `parquet v60.2.0` (2026-11-21); `datafusion v56.0.0` (2026-11-24) | 9,657 / 3,678 | **Apache-2.0** | **CLEAN FOSS.** Apache Software Foundation governance. | Pure Rust, zero C++ FFI, native Arrow/Parquet streaming; direct `parquet` reader/writer is lean, full `datafusion` SQL engine binary size is **UNVERIFIED** (must measure in S08). |
| **QuestDB** (`questdb/questdb`, `R07-S09`, `R07-S10`) | `v10.2.0` (2026-11-10) | 17,550 | **Apache-2.0** (OSS core); **Commercial** (Enterprise `v4.2.1`) | **CLEAN OSS CORE, BUT WATCH ENTERPRISE BOUNDARY:** Core SQL (`ASOF JOIN`, `WINDOW JOIN`, `HORIZON JOIN`, `SAMPLE BY`, `DECIMAL`, nanosecond timestamps, local Parquet tables, QWP Arrow wire protocol) is Apache-2.0. Enterprise paywalls replication, RBAC/TLS, automated S3 cold tiering, and **TICK Exchange Calendars (`#XNYS`)** (`R07-S10`). | **REJECT for bundled core / OPTIONAL external connector:** Requires a separate **Java/JVM server daemon** (`> 100 MB` runtime + JVM memory overhead), violating `< 40 MB` installer & `< 300 MB` idle RAM. Great optional power-user external DB connector. |
| **ClickHouse** (`ClickHouse/ClickHouse`, `R07-S11`) | `v26.11.1.2942-stable` (2026-11-24) | 51,112 | **Apache-2.0** | **CLEAN FOSS.** | **REJECT for bundled core / OPTIONAL external connector:** Massive C++ server binary (`> 100 MB` compressed) and server-grade RAM footprint; incompatible with lightweight desktop core. |
| **ArcticDB** (`man-group/ArcticDB`, `R07-S12`) | `v7.0.0` (2026-11-23) | 2,659 | **Business Source License 1.1 (BSL 1.1)** (`NOASSERTION` on GitHub; verbatim license inspected) | **HARD LICENSE TRAP (NON-OSI / NON-FOSS):** Explicitly prohibits "Database Service" use; source-available, NOT OSI-approved FOSS. Direct violation of [[Constraints#1. Eight Design Non-Negotiables]] #1. | **DISQUALIFIED.** |
| **TimescaleDB** (`timescale/timescaledb`, `R07-S13`) | `v2.32.1` (2026-11-19) | 23,893 | **Dual: Apache-2.0 (core) + Timescale License (TSL)** (`tsl/LICENSE-TIMESCALE` inspected verbatim) | **HARD LICENSE TRAP (NON-OSI TSL):** Core hypertables are Apache-2.0, but **columnar compression, continuous aggregates, retention policies, and hyperfunctions live inside `tsl/` under the proprietary non-OSI Timescale License (`TSL Agreement`)**. Also requires a full PostgreSQL server daemon. | **DISQUALIFIED.** |

---

### 3. Canonical Schemas & Deterministic Replay Specification

All prices and quantities across every schema strictly obey [[Constraints#1. Eight Design Non-Negotiables]] #7 (**fixed-point `i64`**, never IEEE-754 binary floats). Following the proven industry convention of Databento DBN (`R07-S14`), canonical fixed-point prices use `i64` scaled by `1e-9` (nanodollars/nanounits, range `±9.22 × 10^9` with 9 decimal places — handles CME 1/32 Treasury ticks, equity sub-pennies, and 8-decimal crypto sats losslessly), alongside optional `price_ticks: i64` (`price_fp / instrument.tick_size_fp`) for fast integer DOM/Footprint indexing.

#### 3.1 Core Market-Event Schemas (Apache Arrow / Parquet)
1. **Trades (`trades.parquet`):**
   - `ts_event: Int64` (UTC nanoseconds since Unix epoch — venue matching-engine timestamp; `0` if unavailable)
   - `ts_recv: Int64` (UTC nanoseconds — local/provider receipt timestamp)
   - `sequence_no: UInt64` (venue or feed monotonic sequence for deterministic tie-breaking within same nanosecond)
   - `instrument_id: UInt32` (foreign key to SQLite `instruments` catalog)
   - `price_fp: Int64` (`1e-9` fixed-point price)
   - `qty_fp: Int64` (`1e-9` fixed-point quantity; exact integer contracts × `1e9` or fractional crypto)
   - `aggressor_side: UInt8` (`0 = Unknown`, `1 = Buy/Ask`, `2 = Sell/Bid`)
   - `aggressor_provenance: UInt8` (`0 = ExchangeReported`, `1 = InferredQuoteRule`, `2 = InferredTickRule`, `3 = Unclassified` — enforces [[Constraints#1. Eight Design Non-Negotiables]] #8!)
   - `trade_flags: UInt32` (bitmask: off-exchange/dark-pool, implied/spread leg, opening/closing auction, delayed, unbundled sub-trade)
   - `provider_id: UInt16` (provenance tag)

2. **L1 Quotes / BBO (`quotes_l1.parquet`):**
   - `ts_event: Int64`, `ts_recv: Int64`, `sequence_no: UInt64`, `instrument_id: UInt32`
   - `bid_price_fp: Int64`, `bid_qty_fp: Int64`, `bid_orders: UInt32`
   - `ask_price_fp: Int64`, `ask_qty_fp: Int64`, `ask_orders: UInt32`
   - `flags: UInt16`, `provider_id: UInt16`

3. **L2 Order Book — Market-By-Price (`book_mbp_deltas.parquet` + periodic `book_mbp_snapshots.parquet`):**
   - **Snapshots** (written at session open + every `N` minutes, e.g., every 15 min or every 500k deltas, enabling `< 100 ms` random-access seek during replay): `ts_event`, `ts_recv`, `sequence_no`, `instrument_id`, `side: UInt8`, `level_idx: UInt16`, `price_fp: Int64`, `qty_fp: Int64`, `order_count: UInt32`.
   - **Incremental Diffs (`deltas`)**: `ts_event`, `ts_recv`, `sequence_no`, `instrument_id`, `action: UInt8` (`0=Clear`, `1=Set/Update`, `2=Delete`, `3=SnapshotEnd`), `side: UInt8`, `price_fp: Int64`, `qty_fp: Int64`, `order_count: UInt32`, `flags: UInt16` (`F_LAST` packet-end bit matching CME MDP 3.0 / DBN atomic book-commit semantics so consumers never read half-applied crossed books!).

4. **L3 Order Book — Market-By-Order (`book_mbo.parquet`):**
   - Mirrors Databento MBO (`R07-S14`): `ts_event`, `ts_recv`, `sequence_no`, `instrument_id`, `order_id: UInt64`, `action: UInt8` (`Add`, `Cancel`, `Modify`, `Clear`, `Trade`, `Fill`, `None`), `side: UInt8`, `price_fp: Int64`, `qty_fp: Int64`, `flags: UInt16` (`F_LAST`, `F_SNAPSHOT`, `F_TOB`).

5. **Instrument, Session, Corporate Actions & Contract Roll Metadata (SQLite Warm Catalog):**
   - `instruments`: `(instrument_id, venue_mic, symbol, root_symbol, asset_class, currency, tick_size_fp, lot_size_fp, contract_multiplier_fp, price_display_denom, expiration_ts_ns, tz_iana)`
   - `sessions`: `(session_id, venue_mic, root_symbol, name [RTH/ETH], rrule_schedule, holiday_calendar_version, early_close_overrides_json)`
   - `corporate_actions`: `(action_id, instrument_id, effective_date, action_type [Split/ReverseSplit/CashDividend/SymbolChange], numerator_i64, denominator_i64, cash_amount_fp)` — stored as **immutable raw data + non-destructive adjustment overlay**, never overwriting raw historical prints!
   - `contract_rolls`: `(root_symbol, roll_method [VolumeCrossover/OpenInterest/FixedDaysBeforeExpiry], roll_ts_ns, from_instrument_id, to_instrument_id, back_adjust_offset_fp, ratio_factor_f64)` — continuous charts apply Panama-canal additive shift (`offset_fp`) or ratio adjustment on-the-fly for **signal generation**, while backtest PnL strictly settles on the **actual unadjusted front/back contract prices** plus explicit roll execution costs!

#### 3.2 Deterministic Replay Discipline
- **Canonical Total Order Key:** Every merged multi-stream replay event sorts strictly by `(effective_ts_ns, stream_priority, sequence_no, original_file_row_idx)`.
  - For single-venue replay, `effective_ts_ns = ts_event` (when populated) or `ts_recv` (when provider lacks exchange timestamps; flagged in Provenance).
  - For cross-venue replay, `effective_ts_ns = ts_recv` (local arrival order) so a strategy cannot react to a venue event before packets physically arrived.
- **Strict Simulated Clock:** During replay/backtest, `Clock::now_ns()` advances monotonically *only* with replayed events — **zero calls to `std::time::SystemTime::now()` or wall-clock timers** are permitted inside studies, bar aggregators, or fill simulators.
- **Bit-Identical Replay Guarantee:** Replaying the same Parquet range with the same seed and study/strategy config MUST produce byte-identical bars, footprint cells, study outputs, and fill logs across macOS, Linux, and Windows.

---

### 4. Compression, Partitioning, Retention & Sizing Math (Multi-Year Personal Tick Vault)

#### 4.1 Hive Partitioning & Compaction Layout
```text
vault/
  catalog.sqlite                           # Warm metadata, sessions, rolls, partition index
  market_data/
    schema=trades/venue=GLBX/symbol=ES/year=2026/month=11/day=24/part-000.parquet
    schema=mbp_deltas/venue=GLBX/symbol=ES/year=2026/month=11/day=24/part-000.parquet
    schema=ohlcv_1m/venue=GLBX/symbol=ES/year=2026/month=11/part-000.parquet
```
- **Row-Group Sizing:** `100,000–250,000` rows per Parquet row group (enables min/max `ts_event` row-group pruning so a 1-day range query skips >95% of bytes).
- **Encoding & Compression:** Parquet v2 with `DELTA_BINARY_PACKED` for `ts_event`, `ts_recv`, `sequence_no`, `price_fp` (exploits tiny tick-to-tick deltas!), `RLE_DICTIONARY` for `instrument_id`/`provider_id`/`side`/`action`, and **Zstd level 3** (fast decode ~500+ MB/s, high ratio; Zstd level 9 optional for archived cold years).

#### 4.2 Personal Tick Vault Sizing Estimates (Transparent Calculation)
> **Note:** Exact compressed byte ratios vary by volatility regime and venue message density; figures below are first-principles engineering estimates (**UNVERIFIED** empirically until Spike `S08` benchmarks real CME/Binance tick & L2 fixtures).

| Workload Profile (Per Active Instrument) | Est. Events / Trading Day | Uncompressed Row Width | Raw / Day | Est. Parquet+Zstd Ratio | Est. On-Disk / Day | Est. 1 Year (~252d Futures / 365d Crypto) | Est. 5 Years |
|---|---|---|---|---|---|---|---|
| **CME ES/NQ — Trade Ticks (`trades`)** | `~500k–1.5M` trades/day | ~48 B | `24–72 MB` | `~6x–10x` (delta ts/price) | `~3–10 MB` | `~0.8–2.5 GB` | `~4–12.5 GB` |
| **CME ES/NQ — L2 Book Diffs (`mbp_deltas`, 10-level)** | `~10M–30M` deltas/day | ~44 B | `440 MB–1.3 GB` | `~8x–12x` | `~45–130 MB` | `~11–33 GB` | `~55–165 GB` |
| **Crypto BTC-USDT Perp — Trades (Binance)** | `~1M–3M` trades/day | ~48 B | `48–144 MB` | `~6x–10x` | `~6–20 MB` | `~2.2–7.3 GB` | `~11–36 GB` |
| **Crypto BTC-USDT Perp — L2 Diffs (100ms depth)** | `~864k` snapshots × ~20 diffs ≈ `17M` rows/day | ~44 B | `~750 MB` | `~10x–15x` | `~50–75 MB` | `~18–27 GB` | `~90–135 GB` |
| **1-Minute OHLCV + Delta Summary (`ohlcv_1m`)** | `~1,380` bars/day (23h) | ~96 B | `~132 KB` | `~4x` | `~33 KB` | `~8.3 MB` | `~42 MB` |

**Retention Policy (User-Controlled Settings-as-Code, [[Constraints#1. Eight Design Non-Negotiables]] #6):**
- A single trader tracking **5 liquid CME futures + 3 crypto pairs** needs only **~15–40 GB** for **5 years of full trade ticks + footprint bars**, and **~150–400 GB** for **1 year of raw L2 order-book deltas** — comfortably fitting on a standard 1 TB consumer NVMe SSD.
- Configurable tiered retention rules (never deleting without explicit user policy): e.g., keep raw L3/L2 deltas for `90–365 days`, automatically roll up pre-computed `1s`/`1m` Footprint Bars + Session Volume/TPO Profiles permanently (`< 1%` of raw L2 size), and optionally export archived cold Parquet partitions to external USB/NAS.

---

### 5. Historical Data Import Format Specifications (Verified 2026-11-24)

| Format | Primary Source & License | Exact Verified Technical Spec | Fixed-Point & Provenance Caveats | Allegedly Support Priority |
|---|---|---|---|---|
| **Databento DBN (`.dbn` / `.dbn.zst`)** (`R07-S14`, `R07-S15`) | `databento/dbn` **`v0.75.0`** (`Apache-2.0`, official Rust `dbn` crate + Python `databento-dbn`) | Self-describing metadata header + fixed-size binary structs (`MboMsg`, `Mbp10Msg`, `Mbp1Msg`, `TradeMsg`, `OhlcvMsg`); Zstd-compressed; **`i64` fixed-point prices scaled to `1e-9` (`FIXED_PRICE_SCALE`)**; `u64` UTC nanosecond `ts_event` & `ts_recv`; explicit `side` & `flags`. | **Gold-standard import format.** Zero precision loss; directly maps 1:1 to Allegedly's canonical schemas. | **Tier 1 (Native Rust crate `dbn` in v0.1)** |
| **Apache Parquet & CSV** (`R07-S05`) | `arrow-rs` / `parquet` `v60.2.0` (`Apache-2.0`) | Standard columnar Parquet (auto-mapping columns via schema profile JSON/TOML) + streaming CSV importer with user-configurable delimiter, date/tz format, and column mapper. | CSV float strings MUST be parsed directly via decimal-string → `i64` fixed-point parser (never `str::parse::<f64>()`!). | **Tier 1 (v0.1)** |
| **NinjaTrader 8 (`.txt`)** (`R07-S16`) | Official NinjaTrader 8 Help Guide (Import/Export Historical Data) | Semicolon-delimited (`;`), no header, **UTC**, filename `<Instrument>.<Last\|Bid\|Ask>.txt`. Sub-second tick format: `yyyyMMdd HHmmss fffffff;price;volume` (7-digit `100ns` ticks); Tick Replay format (5 fields): `yyyyMMdd HHmmss fffffff;last;bid;ask;volume`. | Tick Replay format provides contemporaneous Bid/Ask for quote-rule aggressor inference (tag `aggressor_provenance = InferredQuoteRule`). Standard 3-field export lacks aggressor side. | **Tier 2 (v0.2)** |
| **Interactive Brokers TWS API** (`R07-S17`) | Official IBKR TWS API Docs (`reqHistoricalData`, `reqHistoricalTicks`) | Bars (`BarData`): OHLC, `Decimal` volume & `wap`, `barCount`, `date` (epoch sec UTC if `formatDate=2`; daily+ always `yyyyMMdd`). Ticks (`reqHistoricalTicks`): max 1,000 ticks/call, `TRADES`/`BID_ASK`/`MIDPOINT`, `time` is **`int64` Unix epoch seconds (UTC)**. | **Brutal Truth Caveat:** IBKR `reqHistoricalTicks` has **1-second timestamp granularity only** (multiple ticks share identical second) and does NOT provide L2 historical depth. Tag provenance explicitly as `1s-quantized`. | **Tier 2 (v0.2 via IB adapter)** |
| **MotiveWave CSV Export** (`R07-S18`) | Official MotiveWave User Guide (`Export Data` / `Import Tick Data`) | Four built-in export presets: `yyyyMMdd HHmmss,O,H,L,C,V`, `dd/MM/yyyy HH:mm:ss,O,H,L,C,V`, plus two native **NinjaTrader** presets (Start/End of bar). | **UNVERIFIED RAW TICK SCHEMA:** MotiveWave's official public docs do not publish a formal column spec for raw tick CSV exports (import auto-detects CSV/ASCII). *Verification step:* Run a sample MotiveWave `Export Data` with `Bar Size = Tick` (or inspect a user-contributed CSV sample) before shipping a MotiveWave-specific tick preset; NinjaTrader preset works today. | **Tier 2 (v0.2 via CSV mapper + NT preset)** |
| **Sierra Chart `.scid`** (`R07-S19`) | **LEGAL / DOCS WARNING:** Official page `sierrachart.com/index.php?page=doc/IntradayDataFileFormat.html` fetched `2026-11-24` | **PERMANENTLY REMOVED ON `2026-10-13`:** Page now reads verbatim: *"This documentation has been permanently removed and will not be restored. Please refer to the Sierra Chart License Agreement. You agree to abide by the terms of the agreement."* Historically documented (community/archive): 56-byte `s_IntradayHeader` (`"SCID"`) + 40-byte `s_IntradayRecord` (`int64_t` microseconds since `1899-12-30 UTC`, **4 × IEEE-754 `float32` OHLC**, 4 × `uint32_t` counts/volumes; 1-tick records put Bid/Ask/Last in Low/High/Close with sentinel floats in Open). | **DOUBLE HAZARD:** (1) **Legal/EULA risk** flagged for [[R09-Legal-Licensing]] — Sierra Chart's Oct 2026 takedown + License Agreement warning means Allegedly MUST NOT reverse-engineer Sierra Chart binaries and must get R09 legal sign-off before deciding whether to support `.scid` import at all. (2) **Float32 precision loss** in `.scid` requires rounding to instrument `tick_size_fp` on ingest. | **HOLD / BLOCKED ON R09 LEGAL REVIEW (UNVERIFIED LEGALITY)** |

---

### 6. Backtest Engine Evaluation & License Contamination Audit (Verified 2026-11-24)

| Engine | Lang | Stars | Last Push / Latest Release | Actual Verified `LICENSE` | Order-Flow / L2-L3 Fidelity | License & Architecture Verdict |
|---|---|---|---|---|---|---|
| **NautilusTrader** (`nautechsystems/nautilus_trader`, `R07-S20`) | **Rust core + Python/Cython** | 31,788 | `2026-11-24` / `v1.231.0` (2026-08-02) | **LGPL-3.0-or-later** (`LICENSE` verified verbatim) | **Institutional-grade:** Deterministic event-driven nanosecond engine, Rust matching engine, L1/L2/L3 order-book simulation, Databento DBN native adapter, Parquet DataCatalog, live/backtest code parity. | **ADOPT AS OPTIONAL OUT-OF-PROCESS SIDECAR ONLY (NEVER LINK INTO CORE!):** Because Rust statically links dependencies by default, linking NautilusTrader crates into a permissively licensed (MIT/Apache-2.0) Allegedly binary triggers **LGPL-3.0 relinking/object-file obligations**. Running NautilusTrader as an **isolated external sidecar process** communicating over standard Parquet files + JSON-RPC/Arrow IPC completely preserves license boundaries AND keeps the `< 40 MB` installer tiny! |
| **HftBacktest** (`nkaz001/hftbacktest`, `R07-S21`) | **Rust + Python (Numba)** | 5,137 | `2025-12-23` / `rust-v0.9.4` (PyPI `2.4.4`) | **MIT** (`LICENSE` verified verbatim) | **Best-in-class L2/L3 Queue & Latency Modeling:** Full L2 MBP + L3 MBO order-book reconstruction, explicit **feed latency + order-entry latency models**, and **order queue-position models** (Risk-Adverse, Probability, Power-Prob, L3 exact FIFO!). | **EXCELLENT MIT REFERENCE / RUST CRATE CANDIDATE:** Permissive MIT license + Rust native! Ideal reference (or optional crate) for Allegedly's built-in Rust L2/L3 order-flow fill & queue-position simulator. Note: slower commit cadence in 2026 (last push `2025-12-23`); verify maintenance before tight coupling. |
| **QuantConnect Lean** (`QuantConnect/Lean`, `R07-S22`) | **C# (.NET) + Python** | 22,693 | `2026-11-24` (active daily; GitHub release tag stale at `v2.4.0.1` — uses rolling Docker/NuGet releases) | **Apache-2.0** | Strong multi-asset portfolio/options/futures/equities bar & tick backtester, corporate actions, brokerage fee models; weaker on L3 MBO queue-position microstructure than Nautilus/HftBacktest. | **OPTIONAL EXTERNAL SIDECAR ONLY:** Clean Apache-2.0 license, but requires the heavy **.NET runtime + Docker/CLI ecosystem** (`> 200 MB`), totally unsuitable for in-process desktop embedding. |
| **`barter-rs`** (`barter-rs/barter-rs`, `R07-S23`) | **Rust** | 2,377 | `2026-08-24` / `v0.2.1` | **MIT** | Lightweight event-driven Rust trading/backtest framework; mostly crypto L1/bar focused, less mature on CME futures L2/L3 order-flow than Nautilus or HftBacktest. | **REFERENCE ONLY:** Clean MIT Rust design patterns, not mature enough as primary engine. |
| **`vectorbt` (OSS)** (`polakowo/vectorbt`, `R07-S24`) | Python (NumPy/Numba) | 9,935 | `2026-11-11` / `v1.2.1` | **Apache-2.0 WITH Commons Clause v1.0** (`LICENSE.md` verified verbatim!) | Ultra-fast vectorized parameter sweeps on OHLCV arrays; **cannot model L2/L3 order books or realistic event-driven order-flow queues**. | **DISQUALIFIED (LICENSE TRAP!):** Commons Clause v1.0 ("not grant to you the right to Sell the Software") is **NON-OSI / NON-FOSS**, directly violating [[Constraints#1. Eight Design Non-Negotiables]] #1. (Also `vectorbt PRO` is commercial closed-source.) |
| **`zipline-reloaded`** (`stefan-jansen/zipline-reloaded`, `R07-S25`) | Python | 2,022 | `2026-11-24` / `v3.2.1` (2026-10-25) | **Apache-2.0** | Daily & minute US equity/factor backtesting; **no tick, L2/L3 order book, or futures order-flow support**. | **REJECT for order-flow:** Clean Apache-2.0 and actively maintained, but architecturally mismatched for CME futures/crypto tick & order-flow trading ([[Assumptions#A02]]). |
| **`backtrader`** (`mementum/backtrader`, `R07-S26`) | Python | 23,798 | `2024-08-19` (PyPI `2023-04-19`) | **GPL-3.0** | Bar-centric Python framework; no L2/L3 order-book simulation. | **DISQUALIFIED:** **GPL-3.0** strong copyleft + effectively unmaintained (>2 years stale). |
| **`pysystemtrade`** (`robcarver17/pysystemtrade`, `R07-S27`) | Python | 3,642 | `2026-11-02` / `v1.8.3` | **GPL-3.0** | Systematic daily/multi-day futures trend/carry portfolio allocation (Rob Carver's book framework); **not** intraday tick/order-flow. | **DISQUALIFIED:** **GPL-3.0** strong copyleft + wrong timeframe domain (daily portfolio vs. intraday order-flow). |

---

### 7. Realistic Fill, Slippage, Queue Modeling & Anti-Bias Guards

Order-flow strategies (absorption, footprint imbalances, DOM pull/stack fades, VWAP sweeps) fail catastrophically in naive OHLCV bar backtesters because **limit-order fill probability, queue position, and latency dominate expectancy**. Allegedly's built-in Rust Replay/Backtest Simulator MUST implement tiered execution fidelity matched to available data provenance:

1. **Tier A — L3 MBO Exact FIFO Queue Model (when `book_mbo` data is present):**
   - Tracks exact resting order IDs ahead of the simulated resting limit order (`qty_ahead`).
   - Decrements `qty_ahead` on trades at that price level and on cancellations of orders with earlier priority (`order_id` ahead in queue); models pro-rata or FIFO matching per venue spec (e.g., CME ES/NQ = FIFO; CME Treasury/Eurodollar/SOFR = pro-rata + top-order).
2. **Tier B — L2 MBP Probabilistic Queue & Book-Walking Model (when `book_mbp_deltas` is present, inspired by MIT `hftbacktest` `R07-S21`):**
   - **Market / Aggressive Orders:** Walk actual resting L2 levels consuming displayed `qty_fp` level-by-level until order quantity is filled (exact deterministic book-sweep slippage + configurable impact multiplier for hidden/depleted liquidity).
   - **Passive Limit Orders:** Upon arrival (after simulated `order_entry_latency_ns`), initialize `qty_ahead = displayed_level_qty`. On subsequent level size decreases not attributable to trades (cancellations), apply configurable **Queue-Position Model** (default: **Risk-Adverse / Conservative**, assuming cancellations occur strictly *behind* our order until proven otherwise; optional Power-Probabilistic model `f(pos)` for sensitivity testing).
   - **Touch vs. Trade-Through Rule:** Never assume a limit order fills merely when `price == limit_price`; require `qty_ahead == 0` OR price trading strictly *through* the limit price by at least 1 price tick.
3. **Tier C — Trade-Tick + L1 Quote Model (when only `trades` + `quotes_l1` are present):**
   - Aggressive buys fill at `ask_price_fp` (+ configurable fixed/volatility slippage ticks), sells at `bid_price_fp`; passive limits fill only on trade-through (`trade_price < limit_bid` or `trade_price > limit_ask`) or configurable fraction of volume traded at the limit price.
   - **Explicit Honesty Disclosure:** Backtest reports stamp the exact **Fill Fidelity Tier (`L3-FIFO` / `L2-Queue` / `L1-TradeThrough` / `Bar-Close-Only`)** on every equity curve and summary metric.
4. **Latency, Fees & Prop-Firm Realism:**
   - Configurable two-way latency (`feed_latency_ns` + `order_entry_latency_ns`, e.g., `5–50 ms` retail cloud/home vs. `< 1 ms` colo) so signals generated at `ts_event` cannot fill before `ts_event + feed_latency_ns + order_entry_latency_ns`.
   - Exact fixed-point commission + exchange/NFA/clearing fees + maker/taker fee schedules + optional prop-firm drawdown/daily-loss-limit circuit-breaker evaluators (integrating with [[R04-Execution-Brokers-Props]]).
5. **Walk-Forward & Look-Ahead Bias Guards:**
   - **Causal Engine Enforcement:** Studies/strategies receive an immutable read-only view of historical data up to `clock.now_ns()`; future rows are physically inaccessible to the execution harness.
   - **Purged & Embargoed Walk-Forward Validation:** Built-in split runner enforces rolling In-Sample (IS) → Embargo Gap (`>= max_study_lookback + max_trade_holding_period`) → Out-of-Sample (OOS) windows, stitching only OOS equity curves and reporting IS/OOS degradation ratios.
   - **Continuous-Contract Roll Guard:** Signals may read back-adjusted continuous series, while simulated fills execute strictly on the unadjusted active contract and force an explicit flat-and-reenter (or calendar-spread roll cost) at `roll_ts_ns` — eliminating phantom roll-gap PnL.

---

## Options Table (Weighted Criteria)

### Decision A: Local Storage & Query Stack

Weights derived from [[Constraints#1. Eight Design Non-Negotiables]]:
- **Installer Size (`< 40 MB`) & Idle RAM (`< 300 MB`)** (25%)
- **Hot-Path Throughput & Zero-GC Determinism** (25%)
- **Open Format / Local-First Sovereignty** (20%)
- **FOSS License Cleanliness** (20%)
- **SQL / Analytical Query Ergonomics** (10%)

| Option | Size & RAM (25%) | Hot-Path Perf (25%) | Open Sovereignty (20%) | FOSS License (20%) | Query UX (10%) | Weighted Score (/5.00) |
|---|---|---|---|---|---|---|
| **Option 1 (Recommended): Lock-Free Rust Ring Buffers + SQLite (`rusqlite`) Warm Catalog + Pure-Rust `parquet` (`arrow-rs`) Cold Vault + Optional DuckDB Sidecar/Plugin** | 5.0 | 5.0 | 5.0 | 5.0 | 4.0 | **4.90** |
| **Option 2: Lock-Free Ring Buffers + SQLite + Embedded `duckdb-rs` (`v2.0.1`) Bundled in Core Binary** | 2.5 | 4.5 | 5.0 | 5.0 | 5.0 | **4.25** |
| **Option 3: Lock-Free Ring Buffers + SQLite + Embedded `Apache DataFusion` (`v56.0.0`) Full SQL Engine in Core** | 3.5 | 4.5 | 5.0 | 5.0 | 4.5 | **4.45** |
| **Option 4: Bundled QuestDB (`v10.2.0`) or ClickHouse Local Daemon** | 1.5 | 4.5 | 4.0 | 4.5 | 5.0 | **3.70** |
| **Option 5: ArcticDB (`BSL 1.1`) or TimescaleDB (`TSL`)** | 2.0 | 4.0 | 3.0 | 1.0 | 4.0 | **2.70 (DISQUALIFIED — License Trap)** |

### Decision B: Backtest Engine Strategy

Weights:
- **Order-Flow / L2-L3 Queue & Replay Fidelity** (30%)
- **FOSS License Cleanliness (Zero LGPL/GPL/Commons Clause Contamination)** (25%)
- **Tight Integration with Allegedly Charts, Studies & Installer Budget** (25%)
- **Maintenance Health & Quant Ecosystem Interoperability** (20%)

| Option | Order-Flow Fidelity (30%) | License Clean (25%) | Core Integration & Size (25%) | Ecosystem & Health (20%) | Weighted Score (/5.00) |
|---|---|---|---|---|---|---|
| **Option 1 (Recommended): Built-in Rust Deterministic Replay & L1/L2/L3 Fill Simulator (MIT `hftbacktest`-inspired) + Optional Out-of-Process NautilusTrader (`LGPL-3.0`) Sidecar over Shared Parquet** | 5.0 | 5.0 | 4.5 | 5.0 | **4.88** |
| **Option 2: Built-in Rust Simulator Only (No External Engine Bridge)** | 4.5 | 5.0 | 5.0 | 3.0 | **4.45** |
| **Option 3: NautilusTrader (`LGPL-3.0`) Directly Linked into Core** | 5.0 | 1.5 | 2.0 | 5.0 | **3.38 (DISQUALIFIED — LGPL Static Link + Size)** |
| **Option 4: QuantConnect Lean (`Apache-2.0`) External Sidecar Only** | 3.0 | 5.0 | 2.0 | 4.5 | **3.55** |
| **Option 5: `vectorbt` (Commons Clause) / `backtrader` (GPL-3.0) / `pysystemtrade` (GPL-3.0)** | 1.5 | 1.0 | 1.5 | 2.0 | **1.48 (DISQUALIFIED — License & Domain)** |

---

## Recommendation + Rationale

### Verdict
1. **Storage Architecture:** Build a **3-tier, pure-Rust, open-format local vault**:
   - **Hot:** `rtrb` / `ringbuf` lock-free SPSC queues coalescing live feed bursts to `30–60 Hz` UI snapshots while streaming lossless raw events to the background disk writer.
   - **Warm:** **SQLite (`rusqlite` `v0.43.0`, WAL mode)** for instrument definitions, session calendars, corporate actions, contract rolls, user layouts, and the Parquet partition catalog.
   - **Cold:** Standard Hive-partitioned **Apache Parquet (Zstd + delta encoding)** read/written natively via **`arrow-rs` / `parquet` (`v60.2.0`, Apache-2.0)**, with **Databento DBN (`dbn v0.75.0`, Apache-2.0)** as our Tier-1 native binary importer.
   - **Ad-Hoc SQL Analytics:** Keep **DuckDB `v2.0.1` (`MIT`)** as an **optional on-demand plugin/sidecar** (or point users' own DuckDB CLI/Python directly at `vault/market_data/**/*.parquet`) so `libduckdb`'s `18.4–26.9 MB` footprint never blows the `< 40 MB` core installer budget. (Spike `S08` will also measure `DataFusion` vs. raw `parquet` crate binary size to confirm whether lightweight SQL belongs in-core.)
2. **Replay & Backtest Boundary:**
   - **In-Core (v0.1–v0.3):** Build a lean, zero-GC, pure-Rust **Deterministic Replay & Order-Flow Fill Simulator (`mv-replay`)** supporting strict event-time ordering, simulated clock discipline, `L1` trade-through, `L2` book-walking + conservative queue-position modeling (modeled on MIT `nkaz001/hftbacktest`), and purged walk-forward splits — directly powering visual chart/DOM Market Replay AND fast local strategy backtests using the exact same Rust `mv-studies` engine ([[R06-Scripting-Indicator-Engine]]).
   - **Optional Pro Research Sidecar (v0.4+):** Provide a clean, **process-isolated sidecar bridge** (shared Parquet vault + JSON-RPC/Arrow IPC) to **NautilusTrader (`v1.231.0`, LGPL-3.0)** (and optionally **QuantConnect Lean**, Apache-2.0) for quants who want institutional multi-venue Python/Rust portfolio backtesting. Process isolation guarantees **zero LGPL-3.0 linking contamination** in Allegedly's core binary and `$0` bloat for users who never install Python.

### Pre-Declared Pass / Fail Thresholds for Phase 2 Spike `S08`

Spike `S08` (`spikes/S08-storage-replay/`) MUST ingest a real multi-day tick + L2 dataset (e.g., Binance BTC-USDT public historical trades/depth + synthetic CME ES 1-day `1M`-trade / `10M`-L2-delta fixture), write Hive-partitioned Parquet, run deterministic replay, and benchmark against `DuckDB` / `DataFusion` on Apple Silicon macOS (and Linux CI).

| Metric | PASS Threshold | FAIL / Pivot Trigger |
|---|---|---|
| **Hot-Path Lock-Free Ingestion + Coalescing (`rtrb` + L2 book update)** | Sustained `>= 250,000` events/sec on 1 core; p99 event-to-coalesced-snapshot latency `<= 500 µs`; **0 heap allocations** on hot loop | `< 100,000` events/sec or p99 `> 2 ms` → redesign book map (fixed tick-indexed ring/array instead of `BTreeMap`) |
| **Parquet Write + Zstd Compression (1M trades + 10M L2 deltas)** | Write throughput `>= 300,000` rows/sec; compressed size `<= 12 MB` per 1M trades and `<= 120 MB` per 10M L2 deltas (`>= 5x` compression vs. raw) | Compression `< 4x` or write `< 100k` rows/s → tune row-group size, `DELTA_BINARY_PACKED`, Zstd level |
| **Cold-Tier Range Scan + Bar/Footprint Aggregation (`1M` ticks → 1m Footprint Bars)** | Cold disk read + aggregate `<= 250 ms` (`<= 100 ms` warm OS page cache); peak RSS `<= 200 MB` | Cold scan `> 1,000 ms` or RSS `> 300 MB` → add pre-aggregated `1s`/`1m` footprint rollups + tighten row-group pruning |
| **Random-Access Replay Seek (Jump to arbitrary timestamp inside 1-day `10M`-delta L2 file)** | Book state reconstructed from nearest snapshot + delta catchup in `<= 100 ms` | Seek `> 500 ms` → increase L2 snapshot cadence (e.g., every 200k deltas or 5 min) |
| **Deterministic Replay Bit-Identity Test** | Two independent runs (and cross-OS macOS vs. Linux) produce **100% SHA-256 identical** fill logs, equity curve, and L2 top-10 book hashes | Any hash divergence → FAIL (hidden wall-clock, `HashMap` iteration order, or float nondeterminism bug) |
| **L2 Queue-Position Fill Realism Sanity Check** | Passive limit order placed at back of 100-lot bid does **NOT** fill on 10-lot touch; fills only after `>= 100` lots trade at bid (conservative model) or trade-through | Premature touch-fill → FAIL fill simulator |
| **Storage Crate Binary Size Delta (release, stripped)** | `rusqlite` + `parquet` (`arrow-rs`) + `dbn` combined delta `<= 8 MB` compressed; measure `datafusion` vs. `duckdb` delta explicitly | If `datafusion` delta `> 12 MB` compressed → omit SQL engine from core binary and keep SQL strictly in optional DuckDB sidecar |

---

## Inferences

1. **Binary size changes the "obvious" DuckDB answer:** Almost every modern quant blog recommends "just embed DuckDB." Verifying the actual `duckdb v2.0.1` release assets (`18.4–26.9 MB` compressed, `38.9 MB` macOS universal) proves that naively embedding DuckDB inside Allegedly's desktop binary would immediately jeopardize the `< 40 MB` installer Non-Negotiable — especially alongside Tauri and Wasmtime. Using **Apache Parquet as the shared canonical disk contract** lets Allegedly's core stay tiny (`parquet` crate + `SQLite`) while remaining 100% natively queryable by DuckDB!
2. **Every popular Python backtester carries either a license trap or a domain mismatch:** Verifying actual `LICENSE` files on `2026-11-24` disqualified `vectorbt` (**Commons Clause v1.0** — non-FOSS!), `backtrader` (**GPL-3.0** + stale), and `pysystemtrade` (**GPL-3.0** + daily-only), while revealing that **NautilusTrader** is **LGPL-3.0** (safe ONLY via out-of-process sidecar isolation) and **`nkaz001/hftbacktest`** is a standout **MIT-licensed Rust** reference for L2/L3 queue-position and latency modeling.
3. **Sierra Chart's October 13, 2026 `.scid` documentation takedown is a hard legal stop-sign:** Because Sierra Chart permanently deleted `IntradayDataFileFormat.html` and cited its License Agreement, Allegedly must NOT implement a `.scid` parser without explicit clearance from [[R09-Legal-Licensing]]. Databento DBN (`Apache-2.0`), Parquet, CSV, and NinjaTrader `.txt` cover 95%+ of legitimate local tick import workflows with zero EULA exposure.
4. **Fixed-point `i64` (`1e-9`) unifies storage, DBN import, order-book math, and execution:** Adopting Databento's `1e-9` `i64` fixed-point convention eliminates float rounding drift across CME futures, US equities, FX, and crypto without per-instrument decimal re-encoding on ingest.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Unbounded L2/L3 disk growth fills user SSDs** | High | Default to trade-ticks + pre-computed `1m` footprint persistence; make raw L2/L3 recording opt-in per instrument with explicit retention quotas (e.g., rolling 90-day raw L2 + permanent footprint rollups) and visible vault disk gauge. |
| **LGPL-3.0 contamination if any contributor adds `nautilus-*` crates to `Cargo.toml`** | High | Enforce automated CI license audit (`cargo-deny` in [[R09-Legal-Licensing]]) banning `LGPL`, `GPL`, `AGPL`, `BSL`, `TSL`, and `Commons Clause` crates in core workspace; NautilusTrader communicates strictly via external process + Parquet/IPC. |
| **Sierra Chart `.scid` EULA/DMCA dispute** | High | Do **not** ship a `.scid` importer unless [[R09-Legal-Licensing]] clears it; never inspect Sierra Chart binaries. |
| **Non-deterministic `HashMap` ordering or floating-point drift breaks replay reproducibility** | Medium | Ban `std::collections::HashMap` in replay/book state (use `BTreeMap` or fixed tick arrays + `IndexMap` / deterministic ordering); enforce cross-OS SHA-256 replay equivalence in CI. |
| **IBKR 1-second tick timestamp quantization misleads order-flow users** | Medium | Attach `timestamp_resolution_ns = 1_000_000_000` provenance metadata to IBKR-imported ticks and warn in UI when running L2/microstructure studies on 1s-quantized feeds. |

---

## Open Questions

1. **Pure `parquet` crate vs. `Apache DataFusion` (`v56.0.0`) vs. optional `DuckDB` (`v2.0.1`) binary size and query speed:** **UNVERIFIED** — exact stripped binary size delta of `parquet` alone vs. `datafusion` vs. `duckdb` on macOS/Linux/Windows must be measured in Spike `S08`.
2. **Real-world Parquet+Zstd compression ratios on live CME Globex MDP 3.0 & Binance Futures L2 feeds:** **UNVERIFIED** — sizing table in Section 4.2 uses engineering estimates; Spike `S08` will record exact measured MB/day on real sample captures.
3. **Sierra Chart `.scid` importer legal admissibility post-`2026-10-13` documentation removal:** **UNVERIFIED** — escalated to [[R09-Legal-Licensing]] for formal clean-room/EULA assessment before any `.scid` code is written.
4. **MotiveWave raw tick CSV export column layout:** **UNVERIFIED** — MotiveWave's official public docs do not publish a formal raw tick CSV column specification (`R07-S18`). *Human verification step:* Export 100 ticks from a licensed MotiveWave instance (or obtain a user-contributed public CSV sample) via `Chart -> Data -> Export Data (Bar Size = Tick)` and document header/columns before adding a MotiveWave tick preset.
5. **L3 MBO priority for v0.1 vs. v0.3:** Does Abel need L3 MBO ingestion & FIFO queue simulation in v0.1 (requiring Databento CME MDP 3.0 paid/sample data), or is L1 + L2 MBP (free crypto WS + CME L2) sufficient through v0.2 with L3 MBO arriving in v0.3? (Aligned with [[Assumptions#A02]] & [[Assumptions#A03]], defaulting to L1+L2 in v0.1–v0.2 and L3 schema-ready from day one.)

---

## What Would Change This Decision

- **If Spike `S08` proves `DataFusion` adds `<= 6 MB` compressed and meets `< 250 ms` 1M-tick scan budgets:** Include a trimmed `DataFusion` SQL engine directly inside Allegedly core for built-in SQL screening/research queries without needing a DuckDB download.
- **If Abel relaxes the `< 40 MB` installer budget to `<= 75 MB`:** Embedding `duckdb-rs` (`v2.0.1`, MIT) directly in core becomes viable and gives users zero-setup SQL analytics over the Parquet vault out of the box.
- **If `nkaz001/hftbacktest` becomes unmaintained or diverges from CME futures pro-rata needs:** Implement Allegedly's `mv-replay` queue-position models cleanly from scratch in Rust using `hftbacktest`'s documented mathematical models only as literature reference.

---

## Sources

| Source ID | Track | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|---|
| `R07-S01` | R07 | `mgeier/rtrb` (`v0.4.1`, MIT OR Apache-2.0, realtime-safe SPSC ring buffer) | https://github.com/mgeier/rtrb | 2026-11-24 | GitHub API (`repos`, `releases/latest`) + crates.io API | High |
| `R07-S02` | R07 | `agerasev/ringbuf` (`v0.6.0` crates.io, MIT OR Apache-2.0, lock-free SPSC) | https://github.com/agerasev/ringbuf | 2026-11-24 | GitHub API + crates.io API | High |
| `R07-S03` | R07 | `crossbeam-rs/crossbeam` (`v0.8.5`, MIT OR Apache-2.0) | https://github.com/crossbeam-rs/crossbeam | 2026-11-24 | GitHub API (`repos`, `releases/latest`) | High |
| `R07-S04` | R07 | `rusqlite/rusqlite` (`v0.43.0`, MIT, Rust bindings to SQLite) | https://github.com/rusqlite/rusqlite | 2026-11-24 | GitHub API + crates.io API | High |
| `R07-S05` | R07 | `apache/arrow-rs` / `parquet` crate (`v60.2.0`, Apache-2.0) | https://github.com/apache/arrow-rs | 2026-11-24 | GitHub API + crates.io API | High |
| `R07-S06` | R07 | `apache/datafusion` (`v56.0.0`, Apache-2.0, Rust SQL query engine) | https://github.com/apache/datafusion | 2026-11-24 | GitHub API + crates.io API | High |
| `R07-S07` | R07 | `duckdb/duckdb` (`v2.0.1`, MIT) & release asset sizes (`18.4–26.9 MB` libs) | https://github.com/duckdb/duckdb | 2026-11-24 | GitHub API (`repos`, `releases/latest` assets inspected) | High |
| `R07-S08` | R07 | `duckdb/duckdb-rs` (`v1.20001.0`, MIT) | https://github.com/duckdb/duckdb-rs | 2026-11-24 | GitHub API + crates.io API | High |
| `R07-S09` | R07 | `questdb/questdb` (`v10.2.0`, Apache-2.0) | https://github.com/questdb/questdb | 2026-11-24 | GitHub API (`repos`, `releases/latest`, `license`) | High |
| `R07-S10` | R07 | QuestDB Open Source vs. Enterprise Feature Matrix (TICK calendars, RBAC, cold tiering) | https://questdb.com/enterprise/ | 2026-11-24 | Official QuestDB docs & release announcements | High |
| `R07-S11` | R07 | `ClickHouse/ClickHouse` (`v26.11.1.2942-stable`, Apache-2.0) | https://github.com/ClickHouse/ClickHouse | 2026-11-24 | GitHub API (`repos`, `releases/latest`, `license`) | High |
| `R07-S12` | R07 | `man-group/ArcticDB` (`v7.0.0`, **Business Source License 1.1 — non-FOSS**) | https://github.com/man-group/ArcticDB | 2026-11-24 | GitHub API (`repos`, `license` verbatim text read) | High |
| `R07-S13` | R07 | `timescale/timescaledb` (`v2.32.1`, **Apache-2.0 + Timescale License TSL**) | https://github.com/timescale/timescaledb | 2026-11-24 | GitHub API (`LICENSE` & `tsl/LICENSE-TIMESCALE` read verbatim) | High |
| `R07-S14` | R07 | `databento/dbn` (`v0.75.0`, Apache-2.0, `rust/dbn/src/record.rs` & `lib.rs`) | https://github.com/databento/dbn | 2026-11-24 | GitHub API (`repos`, `record.rs` fixed-point `1e-9` & `ts_event`/`ts_recv` verified) + crates.io API | High |
| `R07-S15` | R07 | Databento Binary Encoding (DBN) Official Specification | https://databento.com/docs/standards-and-conventions/databento-binary-encoding | 2026-11-24 | Direct HTTP fetch of Databento docs | High |
| `R07-S16` | R07 | NinjaTrader 8 Historical Data Import/Export Format Specification | https://ninjatrader.com/support/helpguides/nt8/ | 2026-11-24 | Official NinjaTrader 8 Help Guide documentation | High |
| `R07-S17` | R07 | Interactive Brokers TWS API (`reqHistoricalData` & `reqHistoricalTicks` 1s resolution) | https://www.interactivebrokers.com/campus/ibkr-api-page/twsapi-doc/ | 2026-11-24 | Official IBKR TWS API documentation | High |
| `R07-S18` | R07 | MotiveWave User Guide — Export Data & Import Tick Data (raw tick schema undocumented) | https://www.motivewave.com/guides.htm | 2026-11-24 | Official MotiveWave documentation & SDK reference | Medium |
| `R07-S19` | R07 | Sierra Chart `IntradayDataFileFormat.html` (**Permanently removed `2026-10-13`**) | https://www.sierrachart.com/index.php?page=doc/IntradayDataFileFormat.html | 2026-11-24 | Direct HTTP fetch confirming permanent removal notice & License Agreement citation | High |
| `R07-S20` | R07 | `nautechsystems/nautilus_trader` (`v1.231.0`, **LGPL-3.0-or-later**) | https://github.com/nautechsystems/nautilus_trader | 2026-11-24 | GitHub API (`repos`, `license` verbatim, `README.md`) + PyPI JSON API | High |
| `R07-S21` | R07 | `nkaz001/hftbacktest` (`rust-v0.9.4` / PyPI `2.4.4`, **MIT**, L2/L3 queue & latency sim) | https://github.com/nkaz001/hftbacktest | 2026-11-24 | GitHub API (`repos`, `license` verbatim, `README.rst`) + PyPI JSON API | High |
| `R07-S22` | R07 | `QuantConnect/Lean` (**Apache-2.0**, C#/.NET + Python) | https://github.com/QuantConnect/Lean | 2026-11-24 | GitHub API (`repos`, `license` verbatim) | High |
| `R07-S23` | R07 | `barter-rs/barter-rs` (`v0.2.1`, **MIT**, Rust event-driven trading/backtest) | https://github.com/barter-rs/barter-rs | 2026-11-24 | GitHub API (`repos`, `releases/latest`) | High |
| `R07-S24` | R07 | `polakowo/vectorbt` (`v1.2.1`, **Apache-2.0 WITH Commons Clause v1.0 — NON-FOSS**) | https://github.com/polakowo/vectorbt | 2026-11-24 | GitHub API (`repos`, `LICENSE.md` read verbatim) + PyPI JSON API | High |
| `R07-S25` | R07 | `stefan-jansen/zipline-reloaded` (`v3.2.1`, Apache-2.0) | https://github.com/stefan-jansen/zipline-reloaded | 2026-11-24 | GitHub API (`repos`, `license`) + PyPI JSON API | High |
| `R07-S26` | R07 | `mementum/backtrader` (**GPL-3.0**, unmaintained since 2023/2024) | https://github.com/mementum/backtrader | 2026-11-24 | GitHub API (`repos`, `license` verbatim) + PyPI JSON API | High |
| `R07-S27` | R07 | `robcarver17/pysystemtrade` (`v1.8.3`, **GPL-3.0**, daily futures portfolio) | https://github.com/robcarver17/pysystemtrade | 2026-11-24 | GitHub API (`repos`, `license` verbatim) | High |
