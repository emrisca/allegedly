---
title: "ADR-0006: Tiered Local-First Market-Data Storage & Streaming Replay Architecture"
type: adr
status: accepted
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - 01-Charter/Constraints.md
  - 01-Charter/Principles.md
  - 02-Research/R05-Orderflow-Profile-Tooling.md
  - 02-Research/R07-Storage-Replay-Backtest.md
  - 03-Spikes/S05-Live-Ingest-TickVault.md
  - 03-Spikes/S06-OMS-Paper-Execution.md
  - 03-Spikes/S08-Storage-100M-Replay.md
  - 04-Architecture/Data-Model.md
  - 06-Risk/License-Registry.md
  - spikes/S05-live-ingest-tickvault/src/vault.rs
  - spikes/S08-storage-100m-replay/src/vault.rs
  - spikes/S08-storage-100m-replay/src/hot_ring.rs
  - spikes/S08-storage-100m-replay/src/orderflow.rs
---

# ADR-0006: Tiered Local-First Market-Data Storage & Streaming Replay Architecture

- **Status:** `proposed`
- **Date:** `2026-11-24`
- **Owner:** `architect`
- **Scope:** Allegedly (`Apache-2.0`), macOS (Apple Silicon + Intel) & Windows 10/11 first *(Linux deferred post-v1.0)*

---

## 1. Context & Problem Statement

Allegedly is a local-first order-flow terminal (`Constraints` #3, #5, #7) that must ingest high-rate live tick/L2 feeds (`>= 20k` ticks/s per `KC-05`), persist months of fixed-point `i64` tick history in open user-owned files, seek arbitrarily across `100,000,000+` ticks in milliseconds, reconstruct Footprint/Volume Profile/TPO state at `60 fps` (`< 0.25 ms` VRVP recomputation per `R05`/`SV-12`), and stay inside a **`< 40 MB` desktop installer** and **`< 300 MB` idle RAM** budget (`SV-13`, `SV-20`).

Phase 1 research (`R07-Storage-Replay-Backtest.md`) uncovered two decisive constraints:
- **Binary Size Trap:** `duckdb v2.0.1` (`MIT`) release libraries weigh `18.4–26.9 MB` compressed (`38.9 MB` macOS universal), which would consume over half the `< 40 MB` installer budget if statically embedded alongside Tauri v2, Wasmtime, and Luau.
- **License Traps (`KC-04`):** `ArcticDB v7.0.0` is non-FOSS `BSL 1.1`; `TimescaleDB v2.32.1` puts compression & continuous aggregates under non-OSI `TSL`; Sierra Chart permanently deleted its `.scid` format docs on `2026-10-13` (`R07-S19`), making `.scid` parsing a legal stop-sign.

Phase 2 Spikes `S05` and `S08` empirically validated a pure-Rust tiered storage pipeline (`rtrb` + `.atvault` + `rusqlite` WAL + `arrow`/`parquet` 2.0) at `100,000,000` ticks.

---

## 2. Decision

Adopt a **3-tier pure-Rust local-first storage architecture** with **Apache Parquet 2.0 as the canonical open cold contract** and **optional out-of-process DuckDB CLI/sidecar interoperability**:

1. **Tier 0 — Hot In-Memory Pipeline (`allegedly-orderflow` + `rtrb v0.4.1`, `MIT OR Apache-2.0`):**
   - Lock-free wait-free SPSC `rtrb` ring buffers decouple network ingest from order-flow aggregation and UI frame snapshots.
   - Zero-float `i64`/`i128` Footprint engine stored in a **flat contiguous `FootprintSlabArena`** (`32 B` `FootprintCell` + `64 B` bar headers, fixing S08's per-bar `Vec` RSS growth), indexed by a **16-ary Dyadic Segment Tree** for Visible-Range Volume Profile (VRVP) and **`u128` TPO bitmasks** (+ variable-word `Vec<u64>` bitset for multi-day composites, avoiding 64-period truncation on 15m 24h / weekly profiles).
2. **Tier 1 — Hot/Warm Live Capture & Metadata Catalog (`.atvault` + `rusqlite v0.43.0` bundled WAL, `MIT` / Public Domain):**
   - Live ticks stream sequentially into crash-safe **`.atvault`** Zstd-3 + CRC32 binary segments (`S05`, `12.37–18.32 B/tick`), rotating at `1M` ticks / `15 MiB` / `1 hour` before asynchronous background compaction into Cold Parquet.
   - `catalog.sqlite` (`PRAGMA journal_mode = WAL`, `synchronous = NORMAL`) indexes instruments, sessions, provenance manifests, and partition `[ts_min_ns, ts_max_ns]` bounds (`20.00 KiB` for `100M` ticks in `S08`).
   - OMS execution state uses a **physically separate** SQLite WAL journal (`paper_journal.sqlite` / `live_journal.sqlite`): Paper defaults to `synchronous = FULL`, while macOS `ExecutionEnv::BrokerLive` mandates **`PRAGMA fullfsync = ON` paired with single-transaction batched Kill-Switch WAL commits** (1 `F_FULLFSYNC` per 50-order cancel wave instead of 50), gated by an explicit `v0.1` Implementation CI (post-Phase-5) macOS APFS benchmark (`UNVERIFIED`).
3. **Tier 2 — Cold Columnar Vault & Native Importers (`arrow v60.2.0` + `parquet v60.2.0` + `databento/dbn v0.75.0`, all `Apache-2.0`):**
   - Hive-partitioned **Parquet 2.0** (`venue=<V>/symbol=<S>/date=<YYYY-MM-DD>/part-*.parquet`) with `ZSTD(3)`, `DELTA_BINARY_PACKED` on `ts_event`/`price_fp`, dictionary encoding on `qty_fp`/`aggressor_side`/`flags`, and `200,000`-row groups with chunk min/max statistics.
   - Pre-computed `footprints_1m` Parquet rollups accelerate multi-month chart boot; raw `l2_mbp`/`l3_mbo` recording is **opt-in per instrument with explicit retention quotas** to prevent SSD exhaustion.
   - Native zero-cost offline importers: **`databento/dbn v0.75.0`** (`Apache-2.0`), CSV/Parquet, NinjaTrader `.txt`, and user-initiated Dukascopy `.bi5` (`OtcIndicative`). **Zero Sierra Chart `.scid` support.**
   - **Omit embedded DuckDB and embedded DataFusion from core binary:** Users needing ad-hoc SQL analytics point an optional external **DuckDB `v2.0.1` (`MIT`)** sidecar/CLI directly at `<ALLEGEDLY_HOME>/vault/ticks/**/*.parquet` with zero ETL or schema translation.

---

## 3. Empirical Evidence Summary (`S05` & `S08` Verified on Apple M2, macOS 26.6.2, `rustc 1.99.1`)

| Metric | Measured Result | Pre-Declared Gate (`R05`/`R07`/`KC-05`) | Margin | Source |
|---|---|---|---|---|
| **100M-Tick Hive Parquet Write** (`20` days × `5M` ES ticks) | **`4.443 s`** (**`22,506,717 ticks/s`**) · Peak RSS **`33.80 MiB`** | Streaming ingest `>= 250k/s` | `90×` | `S08` |
| **100M-Tick Parquet Disk Footprint** | **`406.24 MiB`** (**`4.26 B/tick`**, `6.10×` vs 26 B / `7.51×` vs 32 B) | Compact columnar storage | Verified | `S08` |
| **SQLite WAL Catalog Size (`100M` ticks)** | **`20.00 KiB`** (`20,480 B`) | Lightweight local index | Verified | `S08` |
| **Full 100M-Tick Streaming Replay** | **`0.975 s`** (**`102,551,314 ticks/s`**) · Peak RSS **`34.44 MiB`** | `<= 300 MB` RAM; deterministic | `8.7×` RAM | `S08` |
| **5M-Tick Dual-Run Footprint Determinism** | **`100%` SHA-256 identical** (`f8b52b2e...6a0`, `0` drift) | Bit-exact (`SV-09`) | Exact | `S08` |
| **50× Random 1-Hour Seeks Across 100M Ticks** | **`99.58%` RGs pruned** (`2.08/500`) · Cold (`F_NOCACHE`): **`5.22 ms` p50 / `8.79 ms` p99** · Warm: **`5.19 ms` p50 / `6.94 ms` p99** | `<= 100 ms` seek / `<= 250 ms` cold scan | **`11.4×–28.4×`** | `S08` |
| **Hot `rtrb` SPSC Ring Buffer** | Saturation **`67.65M ticks/s`** · Paced `500k/s`: **`0.08 µs` p50 / `11.25 µs` p99** | `>= 250k/s`, `p99 <= 500 µs` (`KC-05`) | **`44×–270×`** | `S08` |
| **100k-Bar 16-ary Dyadic VRVP Segment Tree** | **`9.041 µs` p50 / `27.084 µs` p99 / `139.500 µs` max** (`10,000` random viewports, `100%` exact parity) | `< 0.25 ms` (`250 µs`) (`R05`, `SV-12`) | **`9.2×` p99** | `S08` |
| **TPO Bitmask Prototype** | **`2.10 ns/tick`** (64-bit prototype; widened to `u128` in production); exact bitwise split | `< 200 ns/tick` (`R05`) | **`95×`** | `S08` |
| **`.atvault` Live Capture Segment** | **`12.37–18.32 B/tick`** · **`2.48M ticks/s`** write · **`10.46M ticks/s`** read · `CRC32` verified | Crash-safe live capture | Verified | `S05` |
| **`databento/dbn v0.75.0` Offline Decode** | **`18.43M rec/s`** (`200k` `TradeMsg`), **`5.67M rec/s`** (`50k` `Mbp10Msg`), `0` mismatches | `>= 500k rec/s` (`S05-G5`) | **`11×–37×`** | `S05` |
| **Storage Stack Stripped Binary Delta** | **`+2.91 MiB` `gzip-9`** (`+3,057,282 B`) / **`+1.98 MiB` `xz-6`** (`+2,078,892 B`) vs `probe-baseline` | `<= 8 MB` compressed (`R07`) | **`2.75×–4.0×`** | `S08` |

*Combined S07 (`+2.20 MiB` = `2,312,026 B`) + S08 (`+2.91 MiB` = `3,057,282 B`) Core Backend Compressed Binary Delta:* Exact sum **`5,369,308 B` (`+5.12 MiB` `gzip-9`)** / **`3,782,212 B` (`+3.61 MiB` `xz-6`)**, keeping the `< 40 MB` installer budget decisively safe.

---

## 4. Weighted Decision Matrix

| Criterion | Weight | **Tiered `rtrb` + `.atvault` + SQLite + Parquet + DuckDB Sidecar (Chosen)** | Embedded `duckdb-rs` (`v2.0.1`) in Core | Embedded `DataFusion` (`v56.0.0`) in Core | External Server DB (`QuestDB` / `ClickHouse`) | SQLite-Only for Raw Ticks | `ArcticDB` (`BSL 1.1`) / `TimescaleDB` (`TSL`) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **100M-Tick Replay & Cold Seek Latency** | `25%` | **5** (`102.55M/s`, `5.22 ms` cold seek, `34.4 MiB` RSS) | **5** (fast vectorized scans, higher RAM) | **4** (fast scans, higher planning overhead) | **5** (fast, adds IPC/network hop) | **1** (B-tree bloat, slow columnar scans) | **4** (good perf, license DQ) |
| **Installer Size Budget (`< 40 MB`)** | `25%` | **5** (`+2.91 MiB` gzip-9 / `+1.98 MiB` xz-6) | **1** (`+18.4–26.9 MB` compressed blows budget) | **2** (`UNVERIFIED`, heavy query planner/expr crate graph) | **1** (external daemon installation/ops) | **5** (`< 1 MiB`) | **1** (heavy server / C++ runtime) |
| **Local-First Sovereignty & Zero-Ops UX** | `20%` | **5** (zero daemons, open Parquet + SQLite files, instant DuckDB interop) | **5** (zero daemons, single binary) | **5** (zero daemons, open Parquet) | **1** (requires managing background DB server) | **4** (single file, poor quant ecosystem interop) | **1** (daemon / non-FOSS restrictions) |
| **License Compatibility (`Apache-2.0`, `KC-04`)** | `15%` | **5** (`Apache-2.0` / `MIT` / Public Domain) | **5** (`MIT`) | **5** (`Apache-2.0`) | **4** (`Apache-2.0` OSS; QuestDB Enterprise features paywalled) | **5** (Public Domain / `MIT`) | **0** (**DISQUALIFIED**: `BSL 1.1` / `TSL`) |
| **Live Append Crash-Safety & Hot-Path Determinism** | `15%` | **5** (`rtrb` + `.atvault` CRC32 + async Parquet compaction) | **3** (WAL/checkpoint pauses on high-rate live tick writes) | **3** (still requires live segment buffer) | **4** (ILP fast, async flush) | **3** (write amplification at `20k+` ticks/s) | **2** (not designed for `500k/s` desktop ring) |
| **Weighted Score (Max 5.00)** | **`100%`** | **`5.00`** | **`3.70`** | **`3.70`** | **`2.90`** | **`3.50`** | **`1.75` (DQ)** |

---

## 5. Consequences

### Positive
- **Zero-ETL Ecosystem Interoperability:** Because Allegedly writes clean Hive-partitioned Parquet 2.0 files (`4.26 B/tick`), users can query their own tick vault immediately with external DuckDB, Polars, Python `pyarrow`, R, or `nautilus_trader` without exporting a single byte.
- **Tiny Core Footprint & Bounded Streaming RAM:** Full `100M`-tick streaming replay held `34.44 MiB` RSS and the entire storage/catalog/ring stack added only `+2.91 MiB` (`gzip-9`).
- **Two-Stage Pruning Eliminates Heavy Query Engines:** Combining a `20 KiB` SQLite WAL partition table with Parquet `ts_event` row-group statistics pruned `99.58%` of row groups (`5.22 ms` cold `F_NOCACHE` seek), proving Allegedly does not need a heavyweight SQL optimizer embedded in its core binary.

### Negative & Trade-Offs
- **No Built-In Ad-Hoc SQL Console Without DuckDB Sidecar:** Users wanting arbitrary SQL `JOIN`/`GROUP BY` screening inside Allegedly must install or enable the optional DuckDB CLI/sidecar (zero core bloat, slight UX step for SQL power users).
- **Two-Format Compaction Lifecycle:** Maintaining `.atvault` live capture segments + background compaction into Cold Parquet requires deterministic crash recovery (idempotent compaction keyed by `sha256_hex` and atomic SQLite catalog registration).
- **Mandatory Slab Arena Refactor for 100k-Bar Materialized Footprints:** S08 revealed `260.77 MiB` RSS when holding 100k cloned `FootprintBar`s with per-bar `Vec<FootprintCell>`; `v0.1` implementation (post-Phase-5) must ship `FootprintSlabArena` (`Data-Model.md` §3.2) to keep large materialized viewports well under `< 300 MB` total app RAM.

### Operational
- Enforce explicit user-visible disk quotas and retention policies on opt-in `l2_mbp` / `l3_mbo` archives (`R07` risk mitigation).
- Validate `.atvault` → Parquet compaction with exact `i128` total volume, delta, and row-count equality before deleting sealed `.atvault` segments.

---

## 6. Reversal Cost

- **Adding Embedded SQL (`DataFusion` or `DuckDB`) Later: Low (`1–2` weeks).** Because the on-disk Hive Parquet 2.0 layout is already standard Apache Parquet, embedding `DataFusion` or `duckdb-rs` later requires **zero** data migration.
- **Changing the Canonical Fixed-Point Parquet Schema (`1e-9` `i64`): High after v0.2.** Requires a schema migration tool (`schema_version = 1 → 2`) across user tick vaults; locking `1e-9` `i64` now (1:1 with Databento DBN) avoids future churn.

---

## 7. Revisit Triggers

Re-open ADR-0006 if any of the following occurs:
1. **Installer Budget Relaxed or SQL UX Demand Spikes:** If Abel raises the installer ceiling to `>= 70 MB` (making embedded `duckdb-rs` viable) OR if a trimmed `DataFusion` probe measures `<= 4 MiB` compressed delta and users demand built-in zero-setup SQL screeners.
2. **L2/L3 Parquet Compression Disappoints:** If `v0.1` Implementation CI (post-Phase-5) benchmarking on `10M` real CME `Mbp10` / Kraken L2 deltas exceeds `12 B/row` or cold L2 seek exceeds `50 ms` p99 (triggering dictionary/byte-stream-split tuning or custom L2 delta blocks).
3. **Slab Arena Still Exceeds RAM Budget:** If `FootprintSlabArena` + 4-level Dyadic VRVP tree on `100,000` bars fails to keep total app RSS `< 300 MB` (`SV-13`), triggering LRU eviction of off-viewport footprint cells while retaining coarse Dyadic summary blocks.

---

## 8. Evidence Links & `UNVERIFIED` Items

- **Primary Evidence:** [`03-Spikes/S08-Storage-100M-Replay.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/03-Spikes/S08-Storage-100M-Replay.md), [`03-Spikes/S05-Live-Ingest-TickVault.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/03-Spikes/S05-Live-Ingest-TickVault.md), [`02-Research/R07-Storage-Replay-Backtest.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R07-Storage-Replay-Backtest.md), [`04-Architecture/Data-Model.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/04-Architecture/Data-Model.md), [`06-Risk/License-Registry.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/06-Risk/License-Registry.md).
- **`UNVERIFIED` Item 1 — `10M`-Row L2 MBP Delta Parquet Archive & `DataFusion` Size Probe:** S08 scaled trade ticks to `100M` (`4.26 B/tick`) and verified L2 queue-fill invariants, but did not benchmark a `10M`-row L2 MBP Parquet dataset or compile a standalone `DataFusion v56.0.0` size probe (`S08` Caveat #1).
- **`UNVERIFIED` Item 2 — Cross-OS SHA-256 Replay Parity (`Windows`) & macOS `PRAGMA fullfsync = ON` Batched WAL Benchmark:** S08 proved dual-run SHA-256 bit-identity on macOS `arm64`; verifying identical SHA-256 digests on `x86_64-pc-windows-msvc` and measuring single-transaction batched Kill-Switch WAL latency under `PRAGMA fullfsync = ON` on macOS APFS are mandatory `v0.1` Implementation CI (post-Phase-5) gates.
- **`UNVERIFIED` Item 3 — Real Databento Portal `.dbn.zst` Fixture & MotiveWave Raw Tick CSV Layout:** Real user-downloaded CME `.dbn.zst` verification (`S05`) and MotiveWave raw tick CSV export columns (`R07-S18`) remain human verification steps.
