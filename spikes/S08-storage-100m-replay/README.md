# Allegedly Phase 2 Spike S08: 100M-Tick Storage, Replay & Fixed-Point Order-Flow Benchmark

Runnable Rust benchmark validating Allegedly's local-first Hive-partitioned Parquet + SQLite WAL tick vault, lock-free `rtrb` SPSC hot ring, and zero-floating-point `i64`/`i128` order-flow engines against `R05` and `R07` pass/fail gates:

1. **100,000,000 Fixed-Point Ticks Write & Compression** — 20 trading days × 5,000,000 CME ES fixed-point ticks (`1e-9` `i64` price/qty, 26 B packed / 32 B C-aligned) written to Parquet 2.0 (`DELTA_BINARY_PACKED` + dictionary + Zstd-3, 200k-row groups) + SQLite WAL metadata catalog.
2. **Full 100M-Tick Streaming Sequential Replay** — Bounded-RAM streaming Arrow/Parquet scan with exact `i128` volume/delta accounting + 5M-tick independent dual-run SHA-256 bit-identity determinism verification.
3. **Random 1-Hour Time-Range Seek (Cold `F_NOCACHE` + Warm)** — 50 pseudo-random 1-hour slices across the 100M-tick vault using SQLite WAL partition pruning + Parquet row-group min/max pruning + live 1m Footprint reconstruction with zero-drift assertions.
4. **Hot `rtrb` SPSC Ring + Fixed-Point Order-Flow Engine (`R05`)** — 5M-tick lock-free SPSC handoff feeding 32-byte `FootprintCell` bars (`i128` diagonal imbalances, POC, dual-row 70% Steidlmayer VA), 64-bit `u64` TPO bitmask (`popcnt` + zero-rescan bitwise split), 100,000-bar 16-ary **Dyadic Profile Segment Tree** VRVP (`< 0.25 ms` target across 10,000 random viewports of 500..50,000 bars), and L2 conservative queue-position fill sanity check.

## Safety Guardrails

- All Cargo build outputs MUST use `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target`.
- All multi-GB Parquet/SQLite temporary vault files MUST live under `/tmp/allegedly-s08-bench/` (enforced by a runtime assertion refusing any path containing `/Documents/Obsidian/`).

## Reproducible Commands

```bash
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target

# 1. Run unit tests (32-byte layouts, Footprint zero-drift, Dyadic VRVP parity, TPO bitwise split, SPSC pipeline)
cargo test --release --manifest-path spikes/S08-storage-100m-replay/Cargo.toml

# 2. Run full 100M-tick write + replay + 50x cold/warm seek + rtrb/order-flow benchmark
cargo run --release --manifest-path spikes/S08-storage-100m-replay/Cargo.toml

# 3. Clean up temporary multi-GB Parquet files after recording measurements
rm -rf /tmp/allegedly-s08-bench/vault
```

See `03-Spikes/S08-Storage-100M-Replay.md` for full measured results, compression ratios, latency distributions, and Phase 3 ADR recommendations.
