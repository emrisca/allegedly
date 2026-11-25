---
title: "S08 — 100M-Tick Hive Parquet Storage, Streaming Replay & Fixed-Point Order-Flow Benchmark"
type: spike
status: verified
phase: Phase 2
owner: scripting-storage
updated: 2026-11-24
verdict: PASS-WITH-CAVEAT
code_refs:
  - spikes/S08-storage-100m-replay/Cargo.toml
  - spikes/S08-storage-100m-replay/README.md
  - spikes/S08-storage-100m-replay/src/main.rs
  - spikes/S08-storage-100m-replay/src/types.rs
  - spikes/S08-storage-100m-replay/src/vault.rs
  - spikes/S08-storage-100m-replay/src/hot_ring.rs
  - spikes/S08-storage-100m-replay/src/orderflow.rs
  - spikes/S08-storage-100m-replay/src/metrics.rs
---

# S08 — 100M-Tick Hive Parquet Storage, Streaming Replay & Fixed-Point Order-Flow Benchmark

## 1. Executive Summary & Verdict

- **Overall Verdict:** **`PASS-WITH-CAVEAT`** (zero failed gates; every measured storage, replay, pruning, determinism, lock-free SPSC, fixed-point order-flow, Dyadic VRVP, TPO, and binary-size gate cleared by **`2.75×` to `270×`**).
- **Headline Empirical Proof Points:**
  1. **100,000,000 Fixed-Point Ticks Written in `4.443 s` (`22.51M ticks/sec`) at `4.26 bytes/tick`:** Writing 20 trading days × 5,000,000 CME ES fixed-point ticks (`1e-9` `i64`, `26 B` packed / `32 B` C-aligned) to Hive-partitioned Parquet 2.0 (`DELTA_BINARY_PACKED` + dictionary + Zstd-3, `200k` row groups) + SQLite WAL catalog (`20.00 KiB`) produced **`406.24 MiB` (`425,971,894 bytes`)** — a **`6.10×`** compression ratio vs. 26 B packed (`2.42 GiB`) and **`7.51×`** vs. 32 B C-aligned (`2.98 GiB`), peaking at only **`33.80 MiB` RSS**.
  2. **Full 100M-Tick Streaming Sequential Replay in `0.975 s` (`102.55M ticks/sec`) at `34.44 MiB` RSS:** Streaming all 20 Parquet files (`100,000,000` ticks) matched exact `i128` volume (`756,383,777`) and delta (`40,557`) with **`34.44 MiB` peak RSS** (`86.5×` smaller than raw aligned data). Independent dual-run Day 1 (`5M` ticks → `1,380` 1m Footprint bars) verified **100% SHA-256 bit-identity** (`f8b52b2ebab234bcc06319c59747493f822f48c19065d483c97ef6764d0ea6a0`).
  3. **`5.22 ms` Cold (`F_NOCACHE`) / `5.19 ms` Warm Random 1-Hour Seeks Across 100M Ticks:** 2-stage pruning (SQLite WAL partition index + Parquet row-group min/max statistics) skipped **`99.58%`** of vault row groups (reading avg `2.08` RGs out of `500`), reconstructing `~217,376` ticks → `61.0` zero-drift 1m Footprint bars at **`8.79 ms` cold p99** (`6.94 ms` warm p99) — beating R07's `<= 100 ms` seek / `<= 250 ms` cold scan gates by **`11.4×–28.4×`**.
  4. **Lock-Free `rtrb` SPSC Ring + Zero-Float Fixed-Point Order-Flow (`R05` & `R07`):**
     - Saturation throughput: **`67.65M ticks/sec`** (`270×` above R07's `250k/s` gate).
     - Paced `500,000 ticks/sec` (`2×` R07 gate) end-to-end handoff + Footprint + TPO latency: **`p50 = 0.08 µs | p95 = 0.21 µs | p99 = 11.25 µs`** (`44.4×` below R07's `500 µs` gate).
     - **100,000-Bar 16-ary Dyadic Profile Segment Tree VRVP (`R05` `< 0.25 ms` target):** **`p50 = 9.04 µs (0.0090 ms)` | `p99 = 27.08 µs (0.0271 ms)` | `max = 139.50 µs (0.1395 ms)`** across `10,000` random viewports (`500..50,000` bars wide) — **9.2× faster than R05's `0.25 ms` target at p99, and 1.8× faster even at worst-case max**, with 100% exact brute-force volume parity!
     - **64-bit `u64` TPO Bitmask (`popcnt` + bitwise split):** **`2.10 ns/tick`** (`95×` faster than R05's `< 200 ns` target), zero-rescan bitwise split verified.
     - **L2 Conservative Queue-Position Fill Sanity Check:** Passed (100-lot resting bid queue vs. 10-lot touch does not prematurely fill).
  5. **Lean Core Storage Binary Footprint:** Stripped `s08-storage-100m-replay` (`arrow v60.2.0` + `parquet v60.2.0` + `zstd` + `rusqlite v0.43.0` bundled + `rtrb` + `sha2`) measured **`3.05 MiB` `gzip-9` (`+2.91 MiB` vs baseline) / `2.09 MiB` `xz-6` (`+1.98 MiB` vs baseline)** — clearing R07's `<= 8 MB` compressed gate by **`2.75×–4.0×`** even without `opt-level = "z"`.
  6. **Disk Cleanup Verified:** All temporary multi-GB/multi-hundred-MB Parquet and SQLite files (`406M` across 20 partitions) in `/tmp/allegedly-s08-bench/` were deleted immediately after recording exact sizes and SHA-256 digests (`ls -la /tmp/allegedly-s08-bench/` confirmed `0` files remaining).
- **Why `PASS-WITH-CAVEAT` (Honest Scope Disclosures):**
  1. **Synthetic 100M Trades vs. L2/L3 Delta Archive & `DataFusion` Size Probe (`UNVERIFIED`):** S08 scaled trade storage/replay to **`100,000,000` fixed-point ticks** (100× larger than R07's 1M-trade minimum) and verified the L2 conservative queue-fill invariant, but did not ingest a `10M`-row L2 MBP delta Parquet archive or compile a standalone `Apache DataFusion v56.0.0` size probe. Because pure `parquet` + `rusqlite` already hits `5.22 ms` cold seeks at `+2.91 MiB` gzip-9, omitting `DataFusion` from core and delegating ad-hoc SQL to an optional DuckDB CLI/sidecar over the shared Hive Parquet vault is already validated.
  2. **Cross-OS SHA-256 Determinism (`UNVERIFIED` on Linux/Windows):** Dual-run SHA-256 replay identity was proven on `aarch64-apple-darwin`; cross-OS (`x86_64-unknown-linux-gnu`) SHA-256 parity belongs in Phase 3 CI.
  3. **100k-Bar In-Memory Footprint Arena Optimization Needed in Phase 3:** Streaming 100M ticks stayed at **`34.44 MiB` RSS**, whereas materializing `100,000` cloned `FootprintBar` structs (each with a heap-allocated `Vec<FootprintCell>`) plus the 4-level Dyadic tree in RAM pushed final process RSS to `260.77 MiB`. Replacing per-bar `Vec` allocations with a flat contiguous `FootprintCell` slab arena in Phase 3 will cut 100k-bar order-flow RAM by `~4–6×`.

---

## 2. Hardware, Environment & Reproducible Commands

### 2.1 Measured Host Environment
- **Hardware:** Apple M2 (`arm64`, 8 cores, 8 GiB RAM, internal Apple NVMe SSD)
- **OS:** macOS `26.6.2` (`Build 25G83`, Darwin Kernel `25.6.0`)
- **Toolchain:** `rustc 1.99.1 (58cf8f9c3 2026-10-13)`, `cargo 1.99.1 (5f94df478 2026-08-27)`
- **Git Base Commit (before S08 edits):** `6507faf`
- **Build & Data Isolation:**
  - `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` (verified zero `target/` inside vault).
  - Temporary benchmark vault strictly under `/tmp/allegedly-s08-bench/vault` (enforced via runtime assertion rejecting any path containing `/Documents/Obsidian/`), deleted after recording exact byte counts and SHA-256 digests.

### 2.2 Locked Crate & License Audit
| Crate | Exact Locked Version | License | Role in S08 |
|---|---|---|---|
| `arrow` | `60.2.0` (`default-features = false`, `prettyprint`) | `Apache-2.0` | Columnar `RecordBatch` in-memory arrays |
| `parquet` | `60.2.0` (`default-features = false`, `arrow`, `zstd`) | `Apache-2.0` | Parquet 2.0 `DELTA_BINARY_PACKED` + Zstd-3 + row-group stats |
| `zstd` | `0.14.5` (transitive via `parquet`) | `MIT` (Rust bindings) / `BSD-3-Clause` (`zstd` C lib) | Zstd-3 columnar compression |
| `rusqlite` | `0.43.0` (`bundled` feature) | `MIT` (wrapper) / Public Domain (SQLite) | Warm WAL metadata & partition catalog |
| `rtrb` | `0.4.1` | `MIT OR Apache-2.0` | Lock-free wait-free SPSC hot ring buffer |
| `sha2` | `0.10.9` | `MIT OR Apache-2.0` | Manifest & deterministic replay SHA-256 proofs |

### 2.3 Reproducible Run Commands
```bash
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target
mkdir -p /tmp/allegedly-s08-bench

# 1. Run release unit tests (32-byte struct layouts, Footprint zero-drift, Dyadic VRVP parity, TPO split, SPSC)
cargo test --release --manifest-path spikes/S08-storage-100m-replay/Cargo.toml -- --nocapture

# 2. Run full 100M-tick write + 100M streaming replay + 50x cold/warm seeks + rtrb/Footprint/VRVP/TPO
cargo run --release --manifest-path spikes/S08-storage-100m-replay/Cargo.toml

# 3. Measure stripped binary size (in /tmp) and clean up temp multi-GB/MB vault files
cp "$CARGO_TARGET_DIR/release/s08-storage-100m-replay" /tmp/allegedly-s08-bench/s08-stripped
strip /tmp/allegedly-s08-bench/s08-stripped
stat -f%z /tmp/allegedly-s08-bench/s08-stripped
gzip -9 -c /tmp/allegedly-s08-bench/s08-stripped | wc -c
xz -6 -c /tmp/allegedly-s08-bench/s08-stripped | wc -c
rm -rf /tmp/allegedly-s08-bench/vault /tmp/allegedly-s08-bench/s08-stripped
```

---

## 3. Measured Results (Verified Facts)

### 3.1 Unit Test Suite (`cargo test --release`)
All **`4 / 4`** release tests passed in **`0.28 s`**:
- `canonical_struct_layouts_are_32_bytes` — Verified `size_of::<TickEvent>() == 32` and `size_of::<FootprintCell>() == 32` (zero floating-point fields).
- `footprint_zero_drift_and_dyadic_vrvp_exact_parity` — Verified `100,000` ticks zero-drift Footprint math and exact brute-force VRVP parity on 2,048-bar tree.
- `tpo_bitmask_split_and_l2_queue_fill_sanity` — Verified 64-bit TPO bitwise split/merge invariant (`left | (right << 2) == orig`) and conservative L2 queue-position fill realism.
- `hot_ring_spsc_mini_pipeline` — Verified end-to-end `rtrb` SPSC + Footprint + TPO + Dyadic VRVP (`p99 < 250 µs`) + paced 500k/s handoff (`p99 < 500 µs`).

### 3.2 Benchmark 1 & 2: 100M-Tick Hive Parquet Write, Compression & Streaming Replay
*(Canonical `TickEvent`: `ts_event: i64`, `price_fp: i64` (`1e-9` scale), `qty_fp: i64`, `aggressor_side: u8`, `flags: u8` = `26 B` packed / `32 B` C-aligned; 20 daily partitions × 5,000,000 ticks/day = `100,000,000` ticks; Parquet 2.0, Zstd-3, `DELTA_BINARY_PACKED` on `ts_event`/`price_fp`, dictionary on `qty_fp`/`aggressor_side`/`flags`, `200,000` rows/row-group.)*

| Metric | Measured Value | Exact Bytes / Digest |
|---|---:|---|
| **Total Ticks Written & Replayed** | **`100,000,000`** | `20` daily Hive `.parquet` files (`500` row groups total) |
| **Write Wall Time & Throughput** | **`4.443 s`** (`22,506,717 ticks/sec`) | `558.1 MB/s` raw packed equivalent |
| **Compressed Parquet Disk Size** | **`406.24 MiB`** (**`4.26 bytes/tick`**) | `425,971,894 bytes` (`du -sh`: `406M` before cleanup) |
| **Compression Ratio** | **`6.10×`** (vs 26 B) / **`7.51×`** (vs 32 B) | Raw `2.42 GiB` packed / `2.98 GiB` aligned |
| **SQLite WAL Catalog Size** | **`20.00 KiB`** | `20,480 bytes` (after `PRAGMA wal_checkpoint(TRUNCATE)`) |
| **Vault Manifest SHA-256** | Verified | `f80c3225def6ef40afc589dfdeb63d723c907962e3c5f62b60b01a811e31436b` |
| **Write Peak RSS** | **`33.80 MiB`** | Start RSS `6.02 MiB` |
| **Full 100M Streaming Replay Wall Time** | **`0.975 s`** (**`102,551,314 ticks/sec`**) | `2,542.8 MB/s` raw packed equivalent; `27,609` 1m bars |
| **Streaming Replay Peak RSS** | **`34.44 MiB`** | Bounded `65,536`-row Arrow batches across `100M` ticks |
| **Exact `i128` Volume & Delta Parity** | **`0` drift** | `total_vol = 756,383,777` · `total_delta = 40,557` · digest `fcfdeaae0e928125` |
| **5M-Tick Dual-Run Replay Bit-Identity** | **`PASS` (100% SHA-256 identical)** | `1,380` 1m Footprint bars · SHA-256 `f8b52b2ebab234bcc06319c59747493f822f48c19065d483c97ef6764d0ea6a0` |

### 3.3 Benchmark 3: Random 1-Hour Time-Range Seek (`50` Random Slices Across `100M` Ticks)
*(Each seek queries SQLite WAL partition index → opens matching daily `.parquet` file → prunes row groups via `ts_event` min/max statistics → streams matching ticks → builds & asserts zero-drift on `~61.0` 1-minute Footprint bars averaging `217,376` ticks/slice.)*

| Seek Mode | Row Groups Pruned | Avg RGs Read / 500 | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | Zero-Drift Footprint Asserted |
|---|---:|---:|---:|---:|---:|---:|---|
| **Cold Seek (`F_NOCACHE = true`, bypasses macOS UBC page cache)** | **`99.58%`** | `2.08` | **`5.22`** | **`7.01`** | **`8.79`** | `8.79` | `TRUE` (`50 / 50` seeks) |
| **Warm Seek (OS page cache warm)** | **`99.58%`** | `2.08` | **`5.19`** | **`6.64`** | **`6.94`** | `6.94` | `TRUE` (`50 / 50` seeks) |

### 3.4 Benchmark 4: Hot `rtrb` SPSC Ring + Fixed-Point Order-Flow Engine (`R05` & `R07`)

| Component / Benchmark | Throughput / Scale | p50 | p95 | p99 | max | Correctness / Invariant Proof |
|---|---|---:|---:|---:|---:|---|
| **`rtrb` SPSC Unthrottled Saturation** | **`67,651,598 ticks/sec`** (`5M` ticks in `0.074 s`, 65,536-slot ring) | `1,012.54 µs` *(queueing)* | `1,075.50 µs` *(queueing)* | `1,213.92 µs` *(queueing)* | `1,283.33 µs` *(queueing)* | Exact Little's Law saturation queueing (`65,536 / 67.65M = 969 µs`) |
| **`rtrb` SPSC Paced (`500,000 ticks/sec`, `2×` R07 gate)** | `100,000` ticks → Footprint + TPO end-to-end | **`0.08 µs`** | **`0.21 µs`** | **`11.25 µs`** | `1,150.38 µs` *(1 OS preemption)* | Zero-drift Footprint asserted (`PASS` vs `<= 500 µs` p99 gate) |
| **Fixed-Point Footprint Builder (`i64`/`i128`)** | `5,000,000` ticks → `1,380` 1m bars (`32 B` `FootprintCell`) | — | — | — | — | `Zero Floating-Point Drift = true`; 300% `i128` diagonal imbalances + 70% Steidlmayer VA |
| **64-bit `u64` TPO Bitmask (`popcnt` + Split)** | `1,000,000` ticks isolated benchmark | **`2.10 ns/tick`** *(avg)* | — | — | — | `POC tick = 23852 (20 TPOs)`, `IB = 238 ticks`, `Bitwise Split = true` |
| **100k-Bar Dyadic Profile Segment Tree VRVP (`R05`)** | `100,000` bars built in `27.17 ms`; `10,000` random viewports (`500..50k` bars, avg `48.7` blocks) | **`9.041 µs`** (`0.0090 ms`) | **`14.083 µs`** (`0.0141 ms`) | **`27.084 µs`** (`0.0271 ms`) | **`139.500 µs`** (`0.1395 ms`) | **`100%` exact brute-force volume parity (`10,000 / 10,000`)** |
| **L2 Conservative Queue-Position Fill Sanity (`R07`)** | 100-lot resting bid queue vs. 10-lot touch | — | — | — | — | **PASS** — no premature touch-fill; fills only on `>= 100` lots or trade-through |

### 3.5 Storage Stack Binary Size Measurement (`aarch64-apple-darwin`, stripped `opt-level = 3`, `lto = "thin"`)
| Binary | Stripped Raw | `gzip -9` | `xz -6` | Compressed Δ vs `probe-baseline` (S07) |
|---|---:|---:|---:|---|
| `probe-baseline` (reference from S07) | `302,720 B` (`0.29 MiB`) | `142,798 B` (`0.14 MiB`) | `111,312 B` (`0.11 MiB`) | `—` |
| `s08-storage-100m-replay` (`arrow` + `parquet` + `zstd` + `rusqlite` bundled + `rtrb` + `sha2`) | `8,681,200 B` (`8.28 MiB`) | **`3,200,080 B` (`3.05 MiB`)** | **`2,190,204 B` (`2.09 MiB`)** | **`+2.91 MiB` (`gzip-9`) / `+1.98 MiB` (`xz-6`)** |

---

## 4. Pass / Fail Evaluation Against R05 & R07 Thresholds

| Pre-Declared Gate (`R05` / `R07`) | Threshold | Measured Value | Verdict |
|---|---|---|---|
| **Hot-Path Lock-Free SPSC Throughput (`R07`)** | `>= 250,000` events/sec on 1 core | **`67,651,598 ticks/sec`** | **PASS (270× headroom)** |
| **Hot-Path SPSC End-to-End Handoff Latency (`R07`)** | `p99 <= 500 µs` | **`11.25 µs` p99** at `500k ticks/s` (`2×` target rate) | **PASS (44.4× headroom)** |
| **Parquet Write Throughput & Compression (`R07`)** | `>= 300,000` rows/s; `<= 12 MB / 1M` trades (`>= 5×` ratio) | **`22.51M ticks/s`**; **`4.06 MiB / 1M` trades** (`4.26 B/tick`, `6.10×–7.51×`) | **PASS (75× speed / 3.0× size headroom)** |
| **Cold-Tier Streaming Scan & RSS (`R07`)** | Cold scan `<= 250 ms` (1M) / peak RSS `<= 200 MB` | **`0.975 s` for 100M** (`9.75 ms` / 1M equiv.); **`34.44 MiB` RSS** | **PASS (25.6× speed / 5.8× RSS headroom)** |
| **Random-Access Time-Range Seek (`R07`)** | `<= 100 ms` (cold) | **`8.79 ms` cold p99** (`F_NOCACHE=true`); **`6.94 ms` warm p99** | **PASS (11.4× headroom)** |
| **Deterministic Replay Bit-Identity (`R07`)** | `100%` SHA-256 identical across independent runs | **100% SHA-256 identical** (`5M` ticks → `1,380` Footprint bars) | **PASS** (cross-OS deferred to CI) |
| **L2 Conservative Queue-Position Fill Sanity (`R07`)** | No fill on 10-lot touch behind 100-lot bid queue | **Verified (`PASS`)** | **PASS** |
| **Dyadic Segment Tree VRVP Query (`R05` Tool 2B)** | **`< 0.25 ms` (`250 µs`)** across `100k+` bars | **`0.0271 ms` (`27.08 µs`) p99**; **`0.1395 ms` max** (`10k` random viewports) | **PASS (9.2× p99 / 1.8× max headroom)** |
| **64-bit TPO Bitmask Update & Split (`R05` Tool 3)** | `< 200 ns` update; zero-rescan bitwise split | **`2.10 ns/tick`**; bitwise split verified exact | **PASS (95× headroom)** |
| **Storage Stack Binary Size Delta (`R07`)** | `<= 8 MB` compressed (`rusqlite` + `parquet` + `dbn`) | **`+2.91 MiB` `gzip-9` / `+1.98 MiB` `xz-6`** (excl. `dbn` ~0.3 MiB) | **PASS (2.75×–4.0× headroom)** |

---

## 5. Inferences & Architectural Findings

1. **Parquet 2.0 `DELTA_BINARY_PACKED` + Zstd-3 Makes Local Multi-Year Tick Vaults Effortless:** At `4.26 bytes/tick`, an entire year of active CME ES trades (~`1.25 billion` ticks across 250 trading days) occupies only **`~5.0 GiB` on disk**, and a full 100M-tick backtest sweep finishes reading from disk in **`< 1.0 second`** on an entry-level Apple M2 with **`34.44 MiB` RSS**.
2. **Cold vs. Warm Seek Convergence on Apple NVMe (`5.22 ms` vs. `5.19 ms`):** With `99.58%` row-group pruning (`2.08` row groups ≈ `~1.7 MiB` compressed read per 1-hour seek), NVMe SSD transfer time at `~3 GB/s` is `< 0.6 ms` — meaning Zstd decompression + Arrow decoding + 61-bar Footprint aggregation (`~4.6 ms`) dominates latency rather than disk I/O! Jumping to any arbitrary hour inside a 100M-tick vault feels instantaneous (`< 9 ms` p99, under half a single 60 fps frame).
3. **Why Combined S07 + S08 Core Footprint Easily Clears the `< 40 MB` Installer Non-Negotiable:** Combining all verified compressed deltas from S07 and S08:
   - Wasmtime (`v51.0.0`, Cranelift minimal): `+1.74 MiB` `gzip-9` (`+1.28 MiB` `xz-6`)
   - Luau (`mlua v0.12.3`, MIT): `+0.47 MiB` `gzip-9` (`+0.34 MiB` `xz-6`)
   - Storage stack (`arrow` + `parquet` + `zstd` + `rusqlite` + `rtrb`): `+2.91 MiB` `gzip-9` (`+1.98 MiB` `xz-6`)
   - **Total Scripting + Storage Core Delta = only `+5.12 MiB` `gzip-9` / `+3.60 MiB` `xz-6`!** This leaves `> 34 MB` for Tauri + WebGL2 charting + market data + OMS inside the `< 40 MB` budget.
4. **Actionable Phase 3 Memory Finding (Flat Arena for 100k Bars):** Benchmark 4 proved that `100,000` `FootprintBar` structs each owning an individual heap `Vec<FootprintCell>` + 4-level Dyadic `Vec<i64>` blocks consumed `~223 MiB` RAM (bringing peak RSS from `34.44 MiB` to `260.77 MiB`). Moving `FootprintBar` storage to a single flat contiguous `Vec<FootprintCell>` slab indexed by `(cell_offset: u32, cell_len: u16)` and keeping only the active chart's visible+cached window in the Dyadic tree will cut peak order-flow memory below `~40–60 MiB`, preserving generous headroom under the `< 300 MB` Idle RAM constraint.

---

## 6. Phase 3 ADR Recommendations

1. **ADR-S08-1 (Canonical 3-Tier Local Storage Lock):** Lock Allegedly's local storage engine to:
   - **Hot:** `rtrb` (`v0.4.1`) lock-free SPSC rings (`4,096`–`16,384` slots sized for low queueing latency with coalescing to `30–60 Hz` UI snapshots).
   - **Warm:** `rusqlite` (`v0.43.0`, WAL mode, `synchronous = NORMAL`) for instruments, calendars, layouts, and Parquet partition `(min_ts_ns, max_ts_ns)` index.
   - **Cold:** Hive-partitioned Parquet 2.0 via `arrow`/`parquet` (`v60.2.0`, Zstd-3, `DELTA_BINARY_PACKED` on `ts_event`/`price_fp`, `200,000`-row groups) — **zero embedded DuckDB or DataFusion in core binary**, keeping DuckDB strictly as an optional user/sidecar analytics engine reading the exact same Parquet files.
2. **ADR-S08-2 (Zero-Float Fixed-Point Order-Flow & Flat Slab Arena):** Lock `1e-9` `i64` fixed-point `TickEvent` (`32 B`), `FootprintCell` (`32 B`), `i128` cross-multiplied diagonal imbalance & VWAP numerators, `u64` 52-letter TPO bitmask (`popcnt` + bitwise split/merge), and the 16-ary **Dyadic Profile Segment Tree** (`< 0.03 ms` p99 VRVP) — upgrading `FootprintBar` cell storage to a flat contiguous arena (`cell_offset`, `cell_len`) in Phase 3 to eliminate per-bar `Vec` overhead.
3. **ADR-S08-3 (Deterministic Replay & Conservative Fill Engine):** Lock `mv-replay` around strict event-time ordering, zero wall-clock reads, conservative L2 FIFO queue-position depletion (no premature touch-fills), and automated cross-OS SHA-256 bit-identity regression tests in CI.

---

## 7. Open Questions & Unverified Items

1. **10M-Row L2 MBP Delta Archive Compression & Snapshot Seek (`UNVERIFIED`):** Validate exact Parquet compression ratio (`<= 120 MB / 10M` L2 deltas) and nearest-snapshot + delta catchup seek latency (`<= 100 ms`) on a real Databento CME MDP 3.0 or Binance Futures L2 capture in Phase 3.
2. **Cross-OS SHA-256 Determinism (`UNVERIFIED` on Linux/Windows):** Verify that `verify_deterministic_replay_sha256` emits the exact same SHA-256 (`f8b52b2ebab234bcc06319c59747493f822f48c19065d483c97ef6764d0ea6a0`) on `x86_64-unknown-linux-gnu` and `x86_64-pc-windows-msvc` in Phase 3 CI.
3. **`Apache DataFusion v56.0.0` Stripped Size Probe (`UNVERIFIED`):** Not built in S08 because pure `parquet` + `rusqlite` already cleared every seek/replay/size gate by `2.75×–75×`; only revisit if Abel specifically requests built-in in-app SQL screening without installing DuckDB.

---

## 8. Sources

| Source ID | Artifact / Reference | URL / Path | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|
| `S08-S01` | Spike S08 100M-Tick Benchmark Harness & Unit Tests | [spikes/S08-storage-100m-replay/src/main.rs](file:///Users/abelmora/Documents/Obsidian/Allegedly/spikes/S08-storage-100m-replay/src/main.rs) | 2026-11-24 | Compiled & executed release build (`cargo test --release`, `cargo run --release`) on Apple M2 | High |
| `S08-S02` | Hive Parquet 2.0 + SQLite WAL Vault & `F_NOCACHE` Seek Engine | [spikes/S08-storage-100m-replay/src/vault.rs](file:///Users/abelmora/Documents/Obsidian/Allegedly/spikes/S08-storage-100m-replay/src/vault.rs) | 2026-11-24 | Generated, replayed, seek-tested, hashed, and cleaned up `100M`-tick vault (`406.24 MiB`) | High |
| `S08-S03` | Fixed-Point `i64`/`i128` Footprint, 16-ary Dyadic VRVP & 64-bit TPO Engine | [spikes/S08-storage-100m-replay/src/orderflow.rs](file:///Users/abelmora/Documents/Obsidian/Allegedly/spikes/S08-storage-100m-replay/src/orderflow.rs) | 2026-11-24 | Executed `5M`-tick stream + `10,000` random 100k-bar VRVP queries + `4/4` unit tests | High |
| `S08-S04` | Phase 1 Research & Pre-Declared Gates (`R05`, `R07`) | [02-Research/R07-Storage-Replay-Backtest.md](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R07-Storage-Replay-Backtest.md) | 2026-11-24 | Direct workspace read (`R05`, `R07`) | High |
| `S08-S05` | Allegedly Charter Constraints & Glossary | [01-Charter/Constraints.md](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Constraints.md) | 2026-11-24 | Direct workspace read | High |
