# Allegedly Phase 2 Spike S06 — Deterministic OMS & Paper Execution

> **SAFETY RAIL:** PAPER / LOCAL WIRE-MOCK ONLY. Zero live orders, zero real broker credentials, zero external network broker calls. Live execution is disabled at compile time (`allow-live-trading` feature defaults off) and `LIVE_ARMED` boots `false`.

## What This Spike Validates

Maps directly to `02-Research/R04-Execution-Brokers-Props.md` (`S06-T1` through `S06-T7`) and `01-Charter/Constraints.md` §1.7:

- **100% Fixed-Point Integer Accounting (`src/types.rs`):** `PriceTicks(i64)`, `Qty(i64)`, `MoneyMicros(i128)`, `Bps(i64)`, and rational `InstrumentSpec` (`tick_size_num / tick_size_den`). Zero `f32`/`f64` anywhere in `src/`.
- **Deterministic OMS State Machine (`src/state.rs`, `src/oms.rs`):** Explicit transition table (`IntentLogged`, `PendingNew`, `Accepted`, `PartiallyFilled`, `Filled`, `PendingCancel`, `Canceled`, `PendingReplace`, `Replaced`, `Rejected`, `Expired`, `UnknownPendingReconcile`), UUIDv7 `client_order_id` idempotency, `exec_id` fill deduplication, and atomic Bracket/OCO partial-fill scaling (`protected_qty == cum_filled_qty`) in both Broker-Native and Client-Managed fallback (`ProtectiveLegMode::ClientManagedWarning`) modes.
- **Pre-Trade Risk Gate & Panic Kill-Switch (`src/risk.rs`, `src/oms.rs`):** Max order size, max projected net position, daily realized + unrealized loss circuit-breaker, integer-bps fat-finger collar, duplicate-order throttle, 1-second rate limiter, CME Rule 534 correlated product-group anti-hedging (`ES`/`MES`), Sim-vs-Live host allowlist & redacted `ApiCredentials`, and 4-step atomic Kill-Switch + Flatten-All.
- **SQLite WAL Write-Ahead Journal & Crash Recovery (`src/journal.rs`, `src/oms.rs`):** Every intent and transition is persisted to SQLite (`journal_mode=WAL`, `synchronous=FULL`) strictly inside `/tmp/allegedly-s06-bench/`. Cold recovery boots in `RECONCILING` mode (blocking new orders) until reconciled against broker snapshots, recovering missed fills/cancels and flagging unjournaled orphan working orders.
- **Adapters & Local Wire-Mock (`src/adapter/`, `src/mock_alpaca.rs`):**
  - `LocalPaperAdapter`: Deterministic offline paper matching engine with configurable partial-fill policies and fault injection.
  - `AlpacaPaperAdapter` + local `axum` `MockAlpacaHandle`: Wire-compatible Alpaca Trading API v2 REST + `trade_updates` WebSocket with HTTP 429 `Retry-After` backoff, 5xx query-before-retry (`GET /v2/orders:by_client_order_id`), malformed JSON/`NaN` rejection, and automatic WS reconnect reconciliation.
  - **R04 Compliance Denylist (`FORBIDDEN_DO_NOT_BUILD_ADAPTERS`):** Hard-blocks Apex, Take Profit Trader, Bulenox, Elite Trader Funding, Rithmic, and CQG adapter IDs at OMS construction time.

## How to Run (All Build Artifacts Outside the Vault)

```bash
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target

# Run full integration & fault-injection test suite in release mode
cargo test --release --manifest-path spikes/S06-oms-paper-execution/Cargo.toml

# Run latency & crash-recovery benchmark suite in release mode
cargo run --release --manifest-path spikes/S06-oms-paper-execution/Cargo.toml
```

All temporary SQLite WAL files are created under `/tmp/allegedly-s06-bench/` and cleaned up automatically after each test/benchmark.
