---
title: "Spike S06: Deterministic Fixed-Point OMS, Local Paper Simulator, WAL Crash Reconciliation & Wire-Compatible Alpaca Adapter"
type: spike
status: verified
phase: Phase 2
owner: execution-prop
updated: 2026-11-24
verdict: PASS-WITH-CAVEAT
code_refs:
  - spikes/S06-oms-paper-execution/Cargo.toml
  - spikes/S06-oms-paper-execution/src/lib.rs
  - spikes/S06-oms-paper-execution/src/types.rs
  - spikes/S06-oms-paper-execution/src/state.rs
  - spikes/S06-oms-paper-execution/src/risk.rs
  - spikes/S06-oms-paper-execution/src/journal.rs
  - spikes/S06-oms-paper-execution/src/oms.rs
  - spikes/S06-oms-paper-execution/src/adapter/mod.rs
  - spikes/S06-oms-paper-execution/src/adapter/local_paper.rs
  - spikes/S06-oms-paper-execution/src/adapter/alpaca_paper.rs
  - spikes/S06-oms-paper-execution/src/mock_alpaca.rs
  - spikes/S06-oms-paper-execution/src/main.rs
  - spikes/S06-oms-paper-execution/tests/s06_integration.rs
  - spikes/S06-oms-paper-execution/README.md
---

# Spike S06 — Deterministic OMS, Local Paper Simulator, Crash Reconciliation & Wire-Compatible Broker Adapter

> **Verdict:** **`PASS-WITH-CAVEAT`**
> - **All 7/7 integration & fault-injection test suites and all 7 release latency benchmarks PASSED** with zero compiler warnings, zero live orders, zero external network calls, zero binary floats (`f32`/`f64`) in OMS core, and zero duplicate orders across 54 injected HTTP/transport faults + 6 WebSocket drops.
> - **Single Caveat:** Per the Phase 2 zero-external-network / zero-account-creation safety rail (`01-Charter/Constraints.md` §3), `S06-T2` was verified end-to-end against a wire-compatible local `axum` Alpaca v2 REST + `trade_updates` WebSocket mock (`MockAlpacaHandle`) rather than live internet calls to `paper-api.alpaca.markets/v2` (and optional tastytrade Certification Sandbox OAuth2 `dry-run` remains deferred to user-supplied `$0` sandbox credentials). `AlpacaPaperAdapter` already allowlists `paper-api.alpaca.markets` and is ready for an env-var-gated remote smoke test in Phase 3.

---

## 1. Environment & Reproduction Commands

### Hardware & Toolchain
| Property | Verified Value |
|---|---|
| **OS** | macOS 26.6.2 (Build `25G83`) |
| **Architecture / CPU** | `arm64` — Apple M2 |
| **RAM** | 8 GB (`8,589,934,592` bytes) |
| **Rust Compiler** | `rustc 1.99.1 (58cf8f9c3 2026-10-13)` |
| **Cargo** | `cargo 1.99.1 (5f94df478 2026-08-27)` |
| **Crate LOC (`src/` + `tests/`)** | 8,244 lines across 12 Rust files (`allegedly-s06-oms v0.1.0`) |
| **Release Binary Size** | `9.9 MB` (`/Users/abelmora/.cache/allegedly-target/release/allegedly-s06-oms`, unstripped; includes `axum` test mock + bundled `rusqlite` + `reqwest`/`rustls`) |
| **Cargo Target Dir** | `/Users/abelmora/.cache/allegedly-target` (zero `target/` artifacts inside vault) |
| **Temp SQLite WAL Dir** | `/tmp/allegedly-s06-bench/` (cleaned automatically; zero `.sqlite*` files inside vault) |

### Exact Reproduction Commands
```bash
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target

# 1. Verify zero IEEE-754 floats in OMS source code (only doc-comment reference on lib.rs:5)
grep -rnE '\b(f32|f64)\b' spikes/S06-oms-paper-execution/src/

# 2. Run full integration & fault-injection suite in release mode (7/7 tests)
cargo test --release --manifest-path spikes/S06-oms-paper-execution/Cargo.toml -- --nocapture

# 3. Run release latency & crash-recovery benchmarks
cargo run --release --manifest-path spikes/S06-oms-paper-execution/Cargo.toml
```

---

## 2. Architecture Validated

1. **100% Fixed-Point Domain Layer (`src/types.rs`):**
   - `PriceTicks(i64)`, `Qty(i64)`, `MoneyMicros(i128)`, `Bps(i64)`, and rational `InstrumentSpec { tick_size_num, tick_size_den, qty_scale, point_value_micros, product_group }`.
   - Direct string-to-integer decimal parser (`parse_price_str`, `parse_qty_str`) rejects non-tick-aligned prices (e.g., `"5942.10"` on CME `ES` 0.25 tick), `"NaN"`, `"inf"`, scientific notation (`"1e5"`), and empty strings without touching `f32`/`f64`.
   - Exact integer P&L and position accounting (`Position::apply_fill`) handles scale-ins, partial closes, and reversals through zero with weighted integer `i128` average prices.
2. **Deterministic OMS State Machine (`src/state.rs`, `src/oms.rs`):**
   - Explicit 12-state transition table (`IntentLogged`, `PendingNew`, `Accepted`, `PartiallyFilled`, `Filled`, `PendingCancel`, `Canceled`, `PendingReplace`, `Replaced`, `Rejected`, `Expired`, `UnknownPendingReconcile`) enforcing `cum_filled_qty + leaves_qty == order_qty` after every fill/replace.
   - UUIDv7 `ClientOrderId` idempotency and `exec_id` fill deduplication prevent duplicate orders and double fills.
   - Bracket/OCO coupling scales protective Take-Profit & Stop-Loss legs strictly to `entry.cum_filled_qty` in both `ProtectiveLegMode::BrokerNative` and `ProtectiveLegMode::ClientManagedWarning` modes, and atomically cancels the opposing OCO leg on fill.
3. **Pre-Trade Risk Gate, Sim-vs-Live Isolation & Kill-Switch (`src/risk.rs`, `src/oms.rs`):**
   - Compile-time live block (`allow-live-trading` feature disabled by default), boot-time `LIVE_ARMED = false`, disjoint host allowlist per `ExecutionEnv`, non-`Serialize` / `[REDACTED]` `ApiCredentials`.
   - Fixed-point pre-trade guards: max order qty, max projected net position (including working same-side qty), daily realized + unrealized loss limit (still permitting protective exits), integer-bps fat-finger price collar, duplicate-order throttle window, 1-second rate limiter, and CME Rule 534 correlated product-group anti-hedging (`ES`/`MES`).
   - 4-step atomic Kill-Switch: lock-free `AtomicBool` halt → bulk cancel + per-order stray fallback → verify `0` working orders → marketable flatten + verify `0` open positions + WAL audit record.
4. **SQLite WAL Write-Ahead Journal & Crash Reconciliation (`src/journal.rs`, `src/oms.rs`):**
   - `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = FULL`, `PRAGMA busy_timeout = 5000`.
   - Cold recovery (`OmsEngine::recover_from_wal`) boots directly into `RECONCILING` mode (rejecting new orders with `RiskError::OmsReconciling`), replays WAL events in strict `seq ASC` order, diffs against authoritative broker order + position snapshots, recovers missed offline fills/cancels, resolves `UnknownPendingReconcile` orders via `get_order_by_client_id`, and keeps `RECONCILING` latched if an unjournaled orphan working order is detected.
5. **Broker Abstraction & Compliance Denylist (`src/adapter/`, `src/mock_alpaca.rs`):**
   - Unified `ExecutionAdapter` trait exercised identically by `LocalPaperAdapter` and `AlpacaPaperAdapter`.
   - `AlpacaPaperAdapter` implements Alpaca Trading API v2 REST + `trade_updates` WebSocket with HTTP 429 `X-Retry-After-Ms` / `Retry-After` backoff, 5xx query-before-retry (`GET /v2/orders:by_client_order_id`), strict malformed-JSON/`NaN` rejection, and automatic WS reconnect reconciliation.
   - `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` hard-blocks `apex`, `apex_trader_funding`, `take_profit_trader`, `tpt`, `bulenox`, `elite_trader_funding`, `etf`, `rithmic`, and `cqg` at `OmsEngine::new`.

---

## 3. Test Matrix & Fault-Injection Results

Executed via `cargo test --release --manifest-path spikes/S06-oms-paper-execution/Cargo.toml -- --nocapture` (`7 passed; 0 failed; 0 ignored; finished in 0.39s`):

| Test Function | R04 Gate | Scenarios & Faults Verified | Result |
|---|---|---|---|
| `s06_t1_fixed_point_roundtrip_and_zero_float_source_audit` | **S06-T1** | `ESM26` (`0.25` tick, `$12.50`/tick) & `AAPL` (`0.01` tick) parse/format round-trip; rejects `5942.10`, `NaN`, `inf`, `1e5`, empty; scale-in, partial close, reverse-through-zero P&L; recursive AST/token scan of all `src/**/*.rs` confirming **0** non-comment `f32`/`f64` tokens | **PASS** |
| `s06_t2_local_state_machine_and_order_types` | **S06-T2** | Illegal transitions (`IntentLogged -> Filled`, `Filled -> Accepted`) rejected; Market + Native Bracket (TP fill auto-cancels SL, flat `net_qty == 0`, exact `+$10.00` realized P&L); Limit + `replace_order` (qty `5 -> 8`, price `185.00 -> 185.50`) + fill; TrailingStop (50-tick trail watermark & pullback fill); clean broker reconcile | **PASS** |
| `s06_t3_partial_fills_bracket_scaling_and_exec_id_dedup` | **S06-T3** | Client-managed bracket fallback (`ProtectiveLegMode::ClientManagedWarning`); 10-share limit filled in 3 chunks (`3 -> 7 -> 10`); TP & SL legs dynamically created at `3` and scaled to `7` then `10` (`protected_qty == cum_filled_qty` at every fill); duplicate `exec_id` fill dropped with 0 double-count; SL fill auto-cancels TP | **PASS** |
| `s06_t4_wal_crash_recovery_reconciliation_and_orphan_detection` | **S06-T4** | Confirmed SQLite `journal_mode=wal`; abrupt `OmsEngine` drop mid-flight with 1 filled, 2 resting, and 1 `UnknownPendingReconcile` order; offline venue fills & cancels executed while OMS down; cold `recover_from_wal` boots in `RECONCILING` (blocks new order with `OmsReconciling`); `reconcile_with_broker()` recovers 1 missed fill + resolves 1 unknown order + matches `net_qty == 15`; injected orphan working order flags `clean == false` and keeps `RECONCILING == true` | **PASS** |
| `s06_t2_t4_alpaca_wire_mock_lifecycle_faults_and_ws_reconnect` | **S06-T2, T3, T4** | End-to-end `AlpacaPaperAdapter` against local `axum` `MockAlpacaHandle` (REST v2 + `trade_updates` WS): account equity parse, native Bracket with partial fills `[3, 7]` + TP fill & SL OCO cancel, Limit + `PATCH` replace, Stop, TrailingStop; **24 HTTP fault runs** (`8x` HTTP 429 backoff, `8x` HTTP 503 before commit, `8x` HTTP 500 after commit + duplicate `client_order_id` resubmit -> **0 duplicate orders**); `MalformedJson` & `InvalidNumericField` (`"qty": "NaN"`) rejected as `MalformedPayload`; forced mid-session WS drop -> enters `RECONCILING` -> auto-reconnects & reconciles cleanly `< 3 s` | **PASS** |
| `s06_t5_pre_trade_risk_gate_and_kill_switch_50_orders` | **S06-T5** | All risk guards: `MaxOrderSizeExceeded`, `FatFingerCollarBreached`, `AntiHedgingViolation` (`ESM26` long vs `MESM26` short), `DuplicateOrderThrottled`, `DailyLossLimitBreached`; Panic Kill-Switch against **50 resting working orders + 5 open positions** -> `verified_flat == true`, `canceled_orders == 50`, `flattened_positions == 5`, `remaining_working_orders == 0`, halt `< 10 ms`, total `< 5 s`, post-halt order rejected with `OmsHalted` | **PASS** |
| `s06_t6_t7_sim_vs_live_isolation_secret_hygiene_and_do_not_build_denylist` | **S06-T6, T7** | Sandbox credentials reject `api.alpaca.markets` (HTTP/WS) and `api.tastyworks.com`; `AlpacaPaperAdapter::new` rejects live URLs & `BrokerLive` creds; `Debug`/`Display` emit `[REDACTED]`; `LIVE_ARMED` boots `false`; `arm_live()` and `BrokerLive` intents fail with `LiveTradingCompileDisabled`; raw SQLite + `-wal` file bytes contain zero secrets; all 9 `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` rejected by both `verify_adapter_allowed` and `OmsEngine::new` | **PASS** |

---

## 4. Measured Latency Benchmarks (`cargo run --release`)

All measurements collected in `--release` mode on Apple M2 (macOS 26.6.2, `rustc 1.99.1`), with SQLite WAL files strictly inside `/tmp/allegedly-s06-bench/`:

| Benchmark Workload | Sample Size | p50 | p95 | p99 | Max | R04 / Charter Target | Status |
|---|---|---|---|---|---|---|---|
| **[1] Fixed-Point Parse + Format + P&L Round-Trip** (`ESM26`) | 100,000 ops | — | — | — | `165 ns/op` (avg; `16.594 ms` total) | Zero floats; zero GC stalls | **PASS** |
| **[2] SQLite WAL Append** (`journal_mode=wal`, `synchronous=FULL`) | 500 appends | `119.75 µs` | `145.25 µs` | `348.95 µs` | `665.25 µs` | Sub-ms durable WAL intent log | **PASS** |
| **[3] Full OMS Submit Path** (Risk Gate + 3x WAL + `LocalPaperAdapter`) | 500 orders | `148.58 µs` | `416.50 µs` | `661.16 µs` | `764.25 µs` | Sub-ms local dispatch | **PASS** |
| **[4] Bracket Lifecycle** (Partial `[3, 7]` + OCO TP Fill & SL Cancel) | 100 cycles | `997.29 µs` | `3.336 ms` | `5.941 ms` | `7.463 ms` | Exact accounting, `final_pos = 0` | **PASS** |
| **[5A] Kill-Switch Halt Latency** (`LocalPaper`, 50 orders + 5 pos) | 20 trials | `41 ns` | `42 ns` | `42 ns` | `42 ns` | `< 10 ms` (`S06-T5`) | **PASS** (~238,000x margin) |
| **[5A] Kill-Switch Total Cancel+Flatten+Verify** (`LocalPaper`, 50 orders + 5 pos) | 20 trials | `7.043 ms` | `12.944 ms` | `12.944 ms` | `23.860 ms` | `< 5 s`, `0` stray working (`S06-T5`) | **PASS** (~386x margin) |
| **[5B] Kill-Switch Halt Latency** (`Alpaca` Wire-Mock HTTP, 50 orders + 5 pos) | 20 trials | `41 ns` | `42 ns` | `42 ns` | `83 ns` | `< 10 ms` (`S06-T5`) | **PASS** (~120,000x margin) |
| **[5B] Kill-Switch Total Cancel+Flatten+Verify** (`Alpaca` Wire-Mock HTTP, 50 orders + 5 pos) | 20 trials | `6.125 ms` | `8.251 ms` | `8.251 ms` | `75.694 ms` | `< 5 s`, `0` stray working (`S06-T5`) | **PASS** (~66x margin) |
| **[6] SQLite WAL Cold Crash Replay** (500 orders / 1,965 WAL events) | 1,965 events | — | — | — | `1.803 ms` | Fast cold boot (`< 2 s` app budget) | **PASS** |
| **[6] Post-Crash Broker Reconciliation** (20 offline fills + 5 unknown orders) | 500 orders | — | — | — | `4.345 ms` (`0` orphans, `0` pos mismatches, `clean = true`) | `< 3 s`, 100% deterministic match (`S06-T4`) | **PASS** |
| **[7] Alpaca Wire-Mock HTTP Fault Recovery** (`10x` 429 + `10x` 503 + `10x` 500) | 30 faults | — | — | — | `30/30` recovered, **`0` duplicates** | `0` duplicates across `>= 20` runs (`S06-T4`) | **PASS** |
| **[7] Alpaca Wire-Mock WS Disconnect → Reconnect + Reconcile** | 5 drops | `32.590 ms` | `32.593 ms` | `32.593 ms` | `32.702 ms` | `< 3 s` (`S06-T4`) | **PASS** (~91x margin) |

---

## 5. Pass/Fail Verdict Against `R04` Thresholds

| Test ID | R04 Pass Threshold | S06 Measured Outcome | Gate Verdict |
|---|---|---|---|
| **S06-T1** | 100% fixed-point round-trip; `0` `f32`/`f64` fields in OMS core | 100% integer tick/micros math (`165 ns/op`); static scan & `grep` confirm `0` non-comment `f32`/`f64` in `src/` | **PASS** |
| **S06-T2** | Market, Limit, Stop, native Bracket (OTO+OCO), TrailingStop + WS `trade_updates` == REST snapshot 100% | Passed 100% against both `LocalPaperAdapter` and wire-compatible local `axum` Alpaca v2 mock (`MockAlpacaHandle`). *Remote `paper-api.alpaca.markets/v2` internet smoke test intentionally excluded in Phase 2 per zero-external-network safety rail.* | **PASS (Local Wire-Mock)** *(Remote smoke deferred to user env opt-in)* |
| **S06-T3** | Partial fills preserve `cum_qty + leaves_qty == order_qty` and bracket exit qty tracks `cum_qty` | Verified for `[3, 7]` native bracket and `[3, 4, 3]` client-managed bracket fallback (`ProtectiveLegMode::ClientManagedWarning`) + `exec_id` deduplication | **PASS** |
| **S06-T4** | `>= 20` fault runs with `0` duplicates; reconnect reconcile `< 3 s`; orphan detection | 54 HTTP fault runs (`18x` 429, `18x` 503, `18x` 500) + local ambiguous drops + 500-order WAL crash recovery + 6 WS drops: **`0` duplicates**, WS reconcile `p99 = 32.593 ms`, orphan detection verified | **PASS** |
| **S06-T5** | Kill-switch halt `< 10 ms`, flatten+verify `< 5 s` with `>= 3` positions + `>= 5` working orders, no post-halt dispatch | Tested at 10x order scale (**50 working orders + 5 open positions**): halt `p99 = 42 ns`, total `p99 = 12.944 ms` (local) / `8.251 ms` (HTTP mock), `0` stray working orders, post-halt rejected with `OmsHalted` | **PASS** |
| **S06-T6** | Sandbox creds cannot target live hosts; `LIVE_ARMED` boots `false`; zero secrets on disk/logs | Enforced at compile time (`allow-live-trading` off), runtime URL allowlist, redacted `Debug`/`Display`, non-`Serialize` `ApiCredentials`, verified zero secret bytes in SQLite/WAL files | **PASS** |
| **S06-T7** | `$0.00` spend, zero live accounts/orders, DO-NOT-BUILD compliance | `$0.00` spend, zero live calls, all 9 `R04` `DO-NOT-BUILD` adapters (Apex, TPT, Bulenox, ETF, Rithmic, CQG) hard-blocked in `verify_adapter_allowed` | **PASS** |

---

## 6. Key Engineering Findings & Observed Nuances

1. **Per-Order WAL Transaction Batching Opportunity (Kill-Switch & macOS `F_FULLFSYNC`):**
   - In Benchmark `[5A]` (`LocalPaper`, 50 working orders), kill-switch total time (`p50 = 7.043 ms`) was dominated by 50 individual `transition_order` SQLite WAL inserts (~`120 µs` each), whereas the actual in-memory cancel + flatten took `< 100 µs`.
   - Furthermore, on macOS APFS, SQLite `PRAGMA synchronous = FULL` calls `fsync()`, not `F_FULLFSYNC` (true power-loss barrier requires `PRAGMA fullfsync = ON`, which costs ~2–5 ms per commit). Wrapping `(IntentLogged, BracketRegistered, PendingNew)` into a single SQLite transaction and batching Kill-Switch `Canceled` transitions into 1 WAL transaction will keep submit and kill-switch latency low even when `fullfsync = ON` is enabled for live accounts.
2. **Async WebSocket Event Ordering Around OCO Auto-Cancel:**
   - Under real async `trade_updates` streaming, a Take-Profit `fill` event flattens the position immediately on frame `N`, while the broker's OCO sibling `canceled` event arrives on frame `N+1`. The OMS correctly places the sibling in `PendingCancel` on frame `N` and resolves it to `Canceled` on frame `N+1` without double-canceling or leaking a stray working leg.
3. **`replace_order` Tick-Spec Lookup on Broker Adapters:**
   - In `AlpacaPaperAdapter::replace_order`, formatting `new_limit_price`/`new_stop_price` currently defaults to `0.01` equity ticks because `replace_order` takes only `broker_order_id`. In Phase 3, pass `&InstrumentSpec` (or `symbol`) into `ExecutionAdapter::replace_order` so non-penny tick instruments (CME futures `0.25`, Treasuries `1/32`, crypto `1e-8`) format replacements accurately.

---

## 7. Phase 3 ADR Recommendations

1. **ADR-OMS-01 — Adopt `allegedly-oms` Pure-Rust Fixed-Point Core Crate (`i64`/`i128` Only):**
   - Promote `types.rs`, `state.rs`, `risk.rs`, `journal.rs`, and `oms.rs` directly into `crates/allegedly-oms` with a CI lint/test gate banning `f32`/`f64` inside the crate.
2. **ADR-OMS-02 — Transactional SQLite WAL Event Store with Configurable `fullfsync`:**
   - Group multi-event order submissions and Kill-Switch fan-out transitions into single SQLite WAL transactions; default `synchronous=FULL` for Paper and enable `fullfsync=ON` (macOS) for Live accounts. Keep periodic WAL checkpointing off the hot order-submit path.
3. **ADR-OMS-03 — `ExecutionAdapter` Trait v1 & Phased Broker Rollout:**
   - Extend `replace_order` signature to include `symbol` / `&InstrumentSpec`.
   - Ship v0.1/v0.2 with `LocalPaperAdapter` ($0 offline core) + `AlpacaPaperAdapter` (add optional env-var-gated live-network paper CI/manual smoke test via `ALPACA_PAPER_KEY_ID` / `ALPACA_PAPER_SECRET_KEY`).
   - Add `tastytrade` Certification Sandbox OAuth2 + `orders/dry-run` adapter as the second broker to prove multi-broker trait generality before v0.3 retail futures (IBKR clean-room socket, tastytrade live) and `barter-rs` (MIT) crypto adapters.
4. **ADR-OMS-04 — Hard Sim-vs-Live Security Boundary & OS Keychain Storage:**
   - Retain compile-time feature gating + boot-time `LIVE_ARMED = false` + disjoint host allowlists + non-`Serialize` redacted credentials. Bind credential retrieval exclusively to OS Keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service) via Tauri backend commands so secrets never cross into WebView JS state or workspace files.
5. **ADR-OMS-05 — Compile-Time `DO-NOT-BUILD` Compliance Registry:**
   - Maintain the `R04` compliance denylist (`Apex`, `Take Profit Trader`, `Bulenox`, `Elite Trader Funding`, `Rithmic`, `CQG`) as an audited registry in `allegedly-oms`, alongside mandatory `ClientManagedWarning` UI badges whenever an adapter lacks server-held native brackets/trailing stops (e.g., future execution-only DTC adapters).
