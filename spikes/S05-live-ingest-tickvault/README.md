# Spike S05 — Live Market Data Ingest, Side Normalization & Local Tick-Vault Persistence

Runnable Rust verification harness for Allegedly Phase 2 Spike `S05` (see `02-Research/R03-Market-Data.md` §12 and `03-Spikes/S05-Live-Ingest-TickVault.md`).

## Constraints Enforced
- **`$0` Public Feeds Only**: Connects strictly to unauthenticated, US-accessible public feeds:
  - Kraken Spot WS v2 (`wss://ws.kraken.com/v2`) — `trade` + `book` (depth=25) on `BTC/USD`, `ETH/USD`
  - Coinbase Advanced Trade WS (`wss://advanced-trade-ws.coinbase.com/`) — `level2` + `market_trades` + `heartbeats` on `BTC-USD`, `ETH-USD`
- **Zero IEEE-754 Floats in Domain Types**: `NormalizedTick`, `QuoteTick`, `BookLevel`, and `L2OrderBook` use `i64` fixed-point scaled by `1e-9` (1:1 aligned with Databento `FIXED_PRICE_SCALE = 1_000_000_000`). Kraken raw JSON numbers are parsed directly from `serde_json::value::RawValue` tokens without ever touching `f64`.
- **Cache & Output Isolation**: Always set `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` so no `target/` directory is created in the vault, and temporary benchmark outputs write to `/tmp/allegedly-s05-bench/`.

## Commands

```bash
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target

# 1. Run unit & integration tests (fixed-point, Kraken CRC32, Coinbase side inversion,
#    Tick-Vault round-trip, local TCP/WS reconnect + gap + backpressure harness,
#    Databento DBN TradeMsg/Mbp10Msg round-trip, Dukascopy .bi5 decode, Lee-Ready/Tick Rule)
cargo test --release --manifest-path spikes/S05-live-ingest-tickvault/Cargo.toml

# 2. Run full live dual-venue soak (e.g. 60s) + vault verification + benchmarks
cargo run --release --manifest-path spikes/S05-live-ingest-tickvault/Cargo.toml -- --soak-secs 60
```

Outputs are written to `/tmp/allegedly-s05-bench/` (`live_soak.atvault`, `bench_100k.atvault`, `synthetic_glbx_trades.dbn.zst`, `synthetic_glbx_mbp10.dbn.zst`, and `s05_results.json`).
