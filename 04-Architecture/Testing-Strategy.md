---
title: "Allegedly Testing & Verification Strategy"
type: architecture
status: verified
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - spikes/S01-chart-webgl-sync
  - spikes/S02-tauri-ipc-throughput
  - spikes/S03-dockview-multiwindow
  - spikes/S04-css-layout-perf
  - spikes/S05-live-ingest-tickvault
  - spikes/S06-oms-paper-execution
  - spikes/S07-scripting-sandbox
  - spikes/S08-storage-100m-replay
---

# Allegedly Testing & Verification Strategy

> **Scope & Operating Mandate:** This architecture defines Allegedly's five-layer automated verification pyramid for **`v0.1` Implementation CI (post-Phase-5)** (noting that Charter Phases 0–5 are strictly **PLAN-ONLY** per `01-Charter/Charter.md`), anchored to quantitative Phase 2 spike baselines (`S01`–`S08`), a `$0` GitHub Actions CI matrix for **`v0.1`–`v1.0` (macOS Apple Silicon + Intel and Windows 10/11; Linux deferred to post-v1.0 per [[Assumptions]] `A01`)**, and verbatim 20-row traceability to [[Constraints]] (`#1`–`#8`), [[Principles]] (`SV-01`–`SV-20`), [[Kill-Criteria]] (`KC-01`–`KC-07`), [[Risk-Register]] (`RK-01`–`RK-10`), and [[License-Registry]].
>
> **Safety Rail (Non-Negotiable):** Automated tests and CI execute **strictly in paper, local-simulator, or loopback wire-mock mode** — **zero live orders**, **zero real broker credentials**, **zero paid accounts**, and **zero commercial data agreements** (`[[Constraints]]` #1, #2, #8, `[[Constraints]]` §3 Safety Rails, and `[[0009-oms-broker-and-prop-firm-strategy|ADR-0009]]`).

---

## 1. Five-Layer Verification Pyramid

| Layer | Primary Focus | Trigger Cadence (`v0.1` Implementation CI, post-Phase-5) | Core Tooling (`$0` FOSS) | Hard Failure Policy |
|---|---|---|---|---|
| **Layer 1 — Unit, Property & Static-Invariant Tests** | Fixed-point `i64`/`i128` math, zero-float lint, zero legacy `mv-`/`.mv` prefix lint, `Footprint Bar` / VRVP / TPO invariants, canonical 12-state `OMS`, `Bracket Order` OCO, MTF non-repainting, `TA-Lib` CI oracle | Every PR & local pre-push (`< 2 min`) | `cargo test --release`, `proptest`, zero-float & legacy-prefix AST/grep lints, `TA-Lib v0.8.3` (`BSD-3-Clause`, dev-only), `vitest` | Merge-blocking |
| **Layer 2 — Contract, Fault-Injection, Sandbox & License Security** | Local `axum`/WS broker fault injection, Kraken CRC32 & Coinbase `sequence_num` / side inversion, SQLite WAL crash recovery, Risk-Reduction Bypass & Panic Kill-Switch SLA, `12/12` hostile script escapes, `keyring-rs` secret-leak test, `SV-01` zero-network offline boot, `cargo-deny` + npm SPDX + exact `@ui-sdk` pin gates | Every PR (`< 5 min`) | `axum` + `tokio-tungstenite` loopback mocks, `wasmtime v51.0.0`, `mlua v0.12.3` (Luau), `keyring-rs v4.2.0` + `zeroize`, `cargo-deny v0.22.1`, npm SPDX & pin checker | Merge-blocking |
| **Layer 3 — Deterministic Replay, Golden-File & Live Endurance Soaks** | Cross-OS SHA-256 bit-identical replay (`SV-09`), `.atvault` Zstd-3 + CRC32 ↔ Parquet 2.0 round-trip, `.dbn.zst` & `.bi5` golden fixtures, 30-minute unattended Kraken+Coinbase soak | Nightly CI (replay/golden) & Pre-Release Scheduled (30-min live soak) | `arrow`/`parquet v60.2.0`, `dbn v0.75.0`, `lzma-rs v0.3`, `sha2 v0.10.9`, live public WS soak harness | Blocks nightly green / blocks release tag |
| **Layer 4 — Performance, Sync Drift, Memory & Bundle Regression Gates** | `0.000 px` LWC + WebGL2 sync, `60 fps` `5,000`-bar window & Canvas2D `DOM Ladder` (`SV-12`, `SV-14`), `100k` IPC throughput, cold seek `< 100 ms`, VRVP `< 0.25 ms`, `10`-study tick `< 1 ms`, 24h heatmap RAM `< 64 MB` (`SV-13`), cold start `< 2.0 s`, idle RAM `< 300 MB`, installer `< 40 MB` (`SV-20`) | PR (size + micro-benches) & Nightly (full GPU/WebView & 100M-tick suite) | Headless Chromium CDP + Tauri WebView harness (`WKWebView` / `WebView2`), `criterion`/custom release benches, bundle size gate script | Merge-blocking on size/hot-path; blocks release on GPU/cold-start |
| **Layer 5 — UI E2E, `ui-sdk` Accessibility & Multi-Window Interaction** | `@ui-sdk/react` (`0.1.0-beta.17`, exact-pinned, `Apache-2.0`) keyboard/focus/ARIA a11y, `SV-02`–`SV-07`, `SV-10`, `SV-11`, `SV-15`–`SV-19` UX/safety/contrast assertions, `Workspace`/`Layout` `fromJSON` & TOML round-trip, native `WebviewWindow` pop-out sync, Canvas2D ARIA summary | PR (component/a11y) & Nightly (Tauri E2E macOS + Windows) | `vitest` + Testing Library + `axe-core` (a11y), Playwright / `tauri-driver` (`WebView2` / `WKWebView`), Dockview `8.9.1` leak harness | Merge-blocking on a11y & UX safety; blocks release on E2E |

---

## 2. Layer-by-Layer Technical Specification

### 2.1 Layer 1 — Unit, Property & Static-Invariant Tests

1. **Zero-Float Financial & Domain Lint (`Constraints` #7, `SV-08`):**
   - A workspace CI check (`scripts/ci/check-no-floats.sh` + Rust clippy/AST lint) scans all non-test source files in financial and domain crates (`allegedly-core`, `allegedly-ingest`, `allegedly-orderflow`, `allegedly-oms`, `allegedly-replay`) and fails the build if any `f32` or `f64` type appears in structs, fields, function signatures, or arithmetic.
   - **Boundary exception:** Ingress adapters whose upstream wire protocol mandates IEEE floats (specifically Dukascopy `.bi5` big-endian `f32` indicative volume, `S05`) must convert immediately into `1e-9` scaled `i64` inside a dedicated `#[allow(allegedly_ingress_float_parse)]` module and stamp `VenueCoverage::OtcIndicative`. **Study** math kernels inside `allegedly-studies` (`EMA`, `RSI`, `VWAP` standard deviation) may use `f64` strictly for dimensionless **Study** outputs while consuming fixed-point `i64` bar inputs (`S07`).
2. **Zero Legacy Brand Prefix & Extension Gate (`ADR-0001` §3.2, `RK-04`, `RT3-04`):**
   - A merge-blocking CI grep gate (`scripts/ci/check-no-legacy-prefix.sh`) scans all Rust crates (`Cargo.toml`, `crates/**`), TypeScript sources, Tauri configs, and JSON/TOML schemas and fails the build if any retired `mv-`, `mv_`, `.mv` file extension (e.g., `.mvanalysis.toml`, `.mvworkspace.toml`, `.mvtemplate.toml`, `.mvdepth`), `MotiveView`, or `MotiveScript` token appears in new code or schemas. Canonical crates are strictly `allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-studies`, `allegedly-replay`, `allegedly-oms`, `allegedly-ipc`, `allegedly-app` (plus dev-only `allegedly-docgen`), and canonical local formats are `analysis.toml`, `workspace.toml`, `template.toml`, `.atvault`, and `.atdepth`.
3. **Fixed-Point Canonical Representation & Struct Layout (`S05`, `S06`, `S08`):**
   - Verify exact decimal string → `i64` (`1e-9` scale) → string round-trips across crypto satoshis (`0.00000001`), CME futures ticks (`0.25`), and FX pips (`1.12074`), including `parse("0.1") + parse("0.2") == parse("0.3")`, scientific notation, Kraken `serde_json::value::RawValue` unquoted numeric parsing, and strict rejection (never silent truncation) on `PrecisionLoss` or `i64` overflow.
   - Compile-time / unit assertions lock `size_of::<TickEvent>() == 32` and `size_of::<FootprintCell>() == 32` (`S08`).
4. **Order-Flow & Profile Math Invariants (`S08`, `R05`):**
   - **Footprint Bar Zero-Drift:** Sum of cell bid+ask volume equals bar total volume; sum of `(ask - bid)` equals bar delta; `i128` cross-multiplied diagonal imbalances (`300%` threshold) and `70%` Steidlmayer Value Area match exact integer reference across `100,000+` ticks.
   - **16-ary Dyadic Profile Segment Tree VRVP:** Property test comparing `10,000` random viewport ranges (`500..50,000` bars) against brute-force level summation — **`100%` exact integer parity required** (`S08`).
   - **TPO Bitmask (`u128` / multi-word composite, `RT3-10`):** Verify `popcnt`, Value Area, Initial Balance, and zero-rescan bitwise split/merge identity (`left | (right << k) == original`) across both standard 30m (`<= 48` periods) and 15m 24h (`96` periods) sessions.
   - **Conservative L2 Queue-Position Fill Realism:** Verify that a `10`-lot touch at the best bid behind a `100`-lot resting queue does **not** trigger a simulated fill; fills occur only after cumulative depletion `>= 100` lots or trade-through (`S08`, `R07`).
5. **Study Runtime Parity, MTF Non-Repainting & `TA-Lib` CI Oracle (`S07`, `KC-06`):**
   - **Multi-Runtime Bit-Identity:** Native Rust (`allegedly-studies`), Wasmtime (`v51.0.0`), and Luau (`mlua v0.12.3`) must produce `0.000e0` max diff and identical trade counts across `100,000` historical `Bar`s + `10,000` live ticks (`S07` verified `6,607` trades, `0.000e0` diff).
   - **MTF Non-Repainting & Intrabar Rollback:** Batch load vs. streaming replay on `15,000` `1m` base bars + `15m` HTF bars (`t_htf_close <= t_base_close`) and `500` noisy intrabar tick sequences using `commit_snapshot()`/`rollback()` must produce **`0` `u64::to_bits` mismatches**.
   - **Dev-Only `TA-Lib v0.8.3` (`BSD-3-Clause`) CI Oracle (`[UNVERIFIED — v0.1 Implementation CI target]`):** A dedicated `dev-dependencies` / CI-only crate validates `allegedly-studies` built-ins (`EMA`, `SMA`, `RSI`, `ATR`, `MACD`, `Bollinger Bands`) against `TA-Lib v0.8.3` within `<= 1e-9` absolute tolerance. `TA-Lib` is strictly prohibited from shipping in production release binaries (`[[License-Registry]]`).
6. **OMS Canonical 12-State Machine, `Bracket Order` OCO & Safety Invariants (`S06`, `Data-Model` §3.3, `ADR-0009`):**
   - Verify all monotonic state transitions across the canonical 12-state `OrderState` enum (`[[Data-Model]]` §3.3): **`IntentLogged`**, **`PendingNew`**, **`Accepted`**, **`PartiallyFilled`**, **`Filled`**, **`PendingCancel`**, **`Canceled`**, **`PendingReplace`**, **`Replaced`**, **`Rejected`**, **`Expired`**, and **`UnknownPendingReconcile`**.
   - Verify UUIDv7 `client_order_id` idempotency, `exec_id` fill deduplication, native & client-managed `Bracket Order` partial fills (`[3, 7]` and `[3, 4, 3]` with `ProtectiveLegMode::ClientManagedWarning`), `final_pos == 0` invariant on OCO completion, and the **Risk-Reduction Bypass Rule** (`BookState != Live` or `RECONCILING` blocks risk-increasing entries while always permitting `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch`, and `reduce_only: true` closing orders).
   - Compile-time feature test proving `allow-live-trading` is **off** in default builds (`S06-T6`), boot invariant `LIVE_ARMED == false`, and `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` rejection (`S06-T7`: `apex`, `apex_trader_funding`, `take_profit_trader`, `tpt`, `bulenox`, `elite_trader_funding`, `etf`, `rithmic`, `cqg`).

---

### 2.2 Layer 2 — Contract, Fault-Injection, Sandbox & License Security Tests

1. **Zero-Network Offline Boot Isolation Test (`SV-01`, `Principles` P1):**
   - Launch packaged Allegedly inside a zero-network sandbox/firewall namespace with a fresh profile (`updates.checkOnStartup = false` default per `[[Release-Signing-Update]]` §3.2) and assert **`0` outbound DNS/TCP/UDP packets**, **`0` error modals**, and interactive canvas `< 2,000 ms`.
2. **Market-Data Protocol & Resilience Harness (`S05`):**
   - **Protocol Correctness:** Official Kraken WS v2 CRC32 top-10 book checksum vector + depth-trimming touch preservation; Coinbase Advanced Trade `sequence_num` monotonicity + mandatory maker→taker inversion (`"SELL"` maker → `Buy` aggressor, `"BUY"` maker → `Sell` aggressor, stamped `ExchangeReportedInverted`).
   - **Loopback TCP/WS Fault Injection (`127.0.0.1`):**
     - Injected sequence gap carrying poisoned price delta → immediate `BookState::Stale(SequenceGap)`, poisoned delta rejected, clean snapshot resync `< 2,000 ms` (`S05` measured **`7.41 ms`**).
     - Abrupt TCP drop without WS Close frame + 2 failed handshakes → `BookState::Stale(Disconnected)`, equal-jitter exponential backoff, clean snapshot resync `< 2,000 ms` (`S05` measured **`129.68 ms`**).
     - Bounded channel saturation (`100,000` ticks into `mpsc(1024)` with slow consumer) → flat memory, deterministic drop, immediate `BookState::Stale(BackpressureDrop)`, **`0` silent corruptions** (`KC-05`).
3. **Broker Execution Wire-Mock & Crash-Recovery Harness (`S06`, `ADR-0009`):**
   - **Alpaca Wire-Mock Fault Injection (Local `axum` + WS, Zero External Network):** Inject HTTP `429`, `503`, `500` across order submit/cancel loops (`S06` verified `54` injected faults → **`0` duplicate orders** via `client_order_id`), malformed JSON & `"qty": "NaN"` payloads (cleanly rejected), and forced WS disconnect → immediate `RECONCILING = true` latch → auto-reconnect & full REST open-order/position reconciliation in **`< 3 s`** (`S06` measured **`32.590 ms` p50 / `32.702 ms` max**).
   - **SQLite WAL Crash Recovery (`journal_mode=WAL`, `synchronous=FULL` + mandatory `PRAGMA fullfsync = ON` for `BrokerLive` on macOS):** Seed `500` orders (`1,965` WAL events), simulate abrupt kill mid-flight with `20` offline fills and `5` `UnknownPendingReconcile` intents → reboot replay + broker reconcile must recover `100%` of state with `0` orphans and `0` position mismatches (`S06` measured `1.803 ms` WAL replay + `4.345 ms` reconcile). Separate negative test injects an unknown broker order and asserts `RECONCILING = true` remains **latched**, blocking risk-increasing entries while permitting `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch`, and `reduce_only: true` exits.
   - **Panic Kill-Switch SLA:** Seed `50` working orders + `5` open positions across `LocalPaperAdapter` and `AlpacaPaperAdapter` wire-mock → assert local intake halt **`< 10 ms`** (`S06` measured **`41 ns` p50**) and full cancel + flatten completion with **`0` stray working orders** (`S06` measured **`6.125–7.043 ms` p50**). In `v0.1` Implementation CI on macOS APFS, also benchmark single-transaction batched Kill-Switch WAL commits with `PRAGMA fullfsync = ON` (`<= 25 ms` target, **`UNVERIFIED`**).
4. **Mandatory Hostile-Script Sandbox Escape Suite (`S07`, `KC-06`):**
   - Every PR touching `allegedly-studies` or scripting bindings runs all hostile vectors against **both Wasmtime (`v51.0.0`) and Luau (`mlua v0.12.3`)**:
     1. **Infinite loop:** Wasmtime fuel trap (`S07`: `0.242 ms`), Luau VM interrupt (`S07`: `0.526 ms`).
     2. **Memory bomb:** Wasmtime `StoreLimits(64 MiB)` (`S07`: `1.778 ms`), Luau `set_memory_limit(32 MiB)` (tightened from S07's `64 MiB` / `18.712 ms` probe to drive worst-case OOM trap toward `< 5 ms`, hard ceiling `< 50 ms`).
     3. **Ambient FS / Network / Env escape:** Wasmtime zero-WASI `Linker` link-time rejection (`0.718 ms`); Luau `sandbox(true)` verifying `io`, `package`, `dofile`, `loadfile`, `os.execute`, `os.getenv` are `nil` (`0.105 ms`).
     4. **Infinite stack recursion:** Clean stack-exhaustion trap (`0.340 ms` Wasmtime, `0.562 ms` Luau).
     5. **Sibling study isolation:** Immediately after all traps, a fresh sibling study instance matches Native Rust within `<= 1e-9` across `50` bars.
5. **OS Keychain Secret Hygiene & Memory-Leak Test (`Principles` P1, `R08-S12`, `S06`):**
   - Integration test against `open-source-cooperative/keyring-rs` (`v4.2.0`, `MIT OR Apache-2.0`) mock/platform store + `zeroize` (`Apache-2.0 OR MIT`) verifies:
     - `ApiCredentials` never derives `Serialize` and outputs `[REDACTED]` in `Debug`/`Display`.
     - Zero raw secret substrings appear in SQLite `.db`/`.db-wal` bytes, structured logs, or workspace `analysis.toml` / `workspace.toml` / Dockview JSON snapshots (`S06-T6`).
     - Heap leak test (modeled on `keyring-rs`'s built-in leak suite) verifies zeroized buffers leave zero plaintext credential residue after drop.
6. **Automated License, Supply-Chain, Exact-Pin & Denylist CI Gates (`KC-04`, `RK-05`, `RT3-14`, `License-Registry`):**
   - **Rust (`EmbarkStudios/cargo-deny v0.22.1`):** Runs `cargo deny check licenses advisories bans sources` on every PR against repo-root `deny.toml`:
     - **Allowed SPDX expressions:** `Apache-2.0`, `Apache-2.0 WITH LLVM-exception`, `MIT`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Zlib`, `Unicode-3.0`, `BSL-1.0`, `CC0-1.0`, `Unlicense` (plus `MPL-2.0` strictly by explicit per-crate exception only).
     - **Hard-blocked:** `GPL-*`, `AGPL-*`, `LGPL-*` (in-process), `BSL-1.1`, `TSL`, `Commons-Clause`, `NOASSERTION`, and `nautilus_trader` (must stay strictly out-of-process sidecar).
   - **TypeScript / npm (`pnpm` SPDX & Pin Check):**
     - Hard-blocks `dockview-enterprise` (permits `dockview`, `dockview-core`, `dockview-react` `MIT` only), `@tradingview/charting_library`, `hqchart`, `PineTS`, and any non-OSI/copyleft license.
     - Validates **exact-version pinning** for `@ui-sdk/react` and `@ui-sdk/core` (`"0.1.0-beta.17"` — **no `^` caret or `~` tilde** range permitted on pre-1.0 beta UI packages, `RT3-14`) and enforces `AGENTS.md` `pnpm` minimum-release-age hygiene (never bypass or weaken release-age policy in CI or local scripts; stop and escalate to Abel if an install is blocked).
     - Validates that `lightweight-charts` `NOTICE` attribution remains intact in `THIRD_PARTY_NOTICES.md`.

---

### 2.3 Layer 3 — Deterministic Replay, Golden-File & Endurance Soak Tests

1. **Cross-OS Bit-Identical Replay Proof (`S08`, `SV-09`):**
   - Nightly `v0.1` Implementation CI runs `verify_deterministic_replay_sha256` across a deterministic `5,000,000`-tick Day-1 Parquet partition (`1,380` 1-minute `Footprint Bar`s) at `1×`, `50×`, and max-CPU batch speeds on **macOS (`aarch64-apple-darwin`, `x86_64-apple-darwin`) and Windows (`x86_64-pc-windows-msvc`)** and asserts exact byte-for-byte SHA-256 identity against the canonical digest (`f8b52b2ebab234bcc06319c59747493f822f48c19065d483c97ef6764d0ea6a0` on S08 baseline; updated only with explicit fixture version bump).
   - **Status:** Verified on Apple M2 `aarch64-apple-darwin` (`S08`); Windows & Intel macOS cross-OS parity is **`UNVERIFIED`** until first `v0.1` Implementation CI (post-Phase-5) execution.
2. **Two-Tier Vault Compaction & Offline Importer Golden Fixtures (`S05`, `S08`):**
   - Verify `.atvault` (Zstd-3 + `CRC32` + `ProvenanceHeader`) zero-loss capture → compaction into Hive-partitioned Parquet 2.0 (`DELTA_BINARY_PACKED` + Zstd-3) → exact replay parity (`0` lost ticks, `0` field mismatches).
   - Verify `dbn v0.75.0` (`Apache-2.0`) against checked-in synthetic CME `GLBX.MDP3` `TradeMsg` and `Mbp10Msg` `.dbn.zst` golden fixtures (`18.43M` / `5.67M` rec/s in `S05`), plus Dukascopy `.bi5` golden fixture asserting `VenueCoverage::OtcIndicative` + `AggressorSource::None`.
   - **Human Pre-v0.1 Verification (`UNVERIFIED`):** Run `DbnDecoder` once against a real user-downloaded CME Globex `.dbn.zst` file (from Databento's `$125` free user credits) to verify `InstrumentDefMsg` tick sizes and live exchange flags.
3. **30-Minute Unattended Live Dual-Venue Endurance Soak (`S05-G1`, `S05-G2`):**
   - Scheduled / pre-release workflow (not run on every PR to avoid flakiness/rate-limits) executes an unattended **30-minute** soak during US session hours (`13:30–16:00 UTC`) against public `$0` Kraken Spot WS v2 (`BTC/USD`, `ETH/USD`, `SOL/USD`, depth=100) + Coinbase Advanced Trade WS (`BTC-USD`, `ETH-USD`, `SOL-USD`).
   - **Pass Criteria:** `>= 1,000` live trades/venue, `0` Kraken CRC32 mismatches, `0` unrecovered Coinbase `sequence_num` gaps, `0` parse errors, `0` channel drops, RSS `< 60 MB` with flat memory slope.
   - **Status:** 60-second soak (`BTC/USD`, `ETH/USD`, depth=25) verified in `S05`; full 30-minute peak-volatility soak is **`UNVERIFIED`** until `v0.1` Implementation CI (post-Phase-5) pre-release gate.

---

### 2.4 Layer 4 — Performance, Sync Drift, Memory & Bundle Regression Gates

All thresholds below are anchored directly to **measured Phase 2 spike baselines (`S01`–`S08`)**, [[Constraints]] #5, and `SV-12`/`SV-13`/`SV-14`/`SV-20`. Any PR or nightly run regressing past the CI Gate fails automatically.

| Subsystem & Metric | Spike Source | Phase 2 Measured Baseline (Apple M2) | CI Hard Gate (`v0.1`–`v1.0`) | Charter / Risk Ref |
|---|---|---|---|---|
| **LWC v5 + WebGL2 Overlay Sync Drift** | `S01` | **`0.000 CSS px` / `0.000 physical px`** (`0/90` lagging frames) | `<= 0.5 CSS px`, `0` lagging frames across pan/zoom/resize/DPR | `KC-01`, `RK-08` |
| **Chart Frame Rate (`5,000`-bar sliding window @ `60 Hz`)** | `S01` | **`60.0 fps`** (`p50 16.6–16.8 ms`, `p99 20.4–20.7 ms`, `0` stalls `> 33 ms`) | `>= 55 fps` (target `60 fps` / `P99 <= 16.6 ms` pan/zoom), `0` stalls `> 33 ms` | `KC-01`, `SV-12` |
| **WebGL2 Order-Flow Draw Time (~10.6k quads + ~210 glyphs)** | `S01` | **`0.30–0.40 ms` p50** (`0.40–0.80 ms` p95) | `p95 <= 4.0 ms` | `KC-01`, `SV-12` |
| **Canvas2D `DOM Ladder` + Time & Sales (`60 Hz`, `2k`–`5k` deltas/s)** | `S04` | **`60.2 fps`**, **`0.00 ms` Layout/Style**, `0` React commits, `0` stalls `> 20 ms`, `36` DOM nodes | `60 fps`, `0` hot-path heap allocs/tick, `0.00 ms` Layout/Style, `0` stalls `> 20 ms` | `KC-02`, `SV-14` |
| **Tauri IPC `100k` `Bar` Bulk Load (SoA Binary)** | `S02` | **`3.0 ms` p50 / `5.0 ms` p95** (`0.00 ms` decode) | `p95 <= 16.0 ms` | `KC-02` |
| **Tauri IPC / Loopback WS Streaming (`16 ms` coalesced)** | `S02` | **`100,450` msgs/s** (`3.0 ms` p99 Channel / `0.9 ms` p99 WS) | `>= 20,000` msgs/s, `p99 <= 10.0 ms`, `0` drops `> 20 ms` | `KC-02`, `KC-05` |
| **Dockview `8.9.1` 9-Panel Mount & `fromJSON` Restore** | `S03` | Mount `68.40 ms`; `fromJSON` `2.40 ms` p50 / `5.30 ms` p95 (`10/10` fidelity) | Mount `<= 250 ms`; `fromJSON <= 25 ms`, `100%` fidelity | `SV-06` |
| **Dockview 20-Cycle Panel Create/Destroy Leak Audit** | `S03` | `+0.109 MB` heap, **`0` leaked DOM nodes**, **`0` leaked listeners** | Heap delta `< +2.0 MB`, `0` leaked DOM nodes, `0` leaked listeners | `SV-13` |
| **Cross-Window Symbol/Crosshair Sync RTT** | `S03` | `0.20–0.30 ms` p50 / `0.60 ms` p95 | `p95 <= 8.0 ms` | `R02` |
| **Live Ingest Synthetic Throughput & `rtrb` SPSC Handoff** | `S05` / `S08` | `17.73M` events/s (`S05`); `67.65M` ticks/s & **`11.25 µs` p99** @ `500k/s` (`S08`) | `>= 250k` ticks/s (`KC-05` `>= 20k`), `p99 <= 500 µs` | `KC-05` |
| **Cold Time-Range Seek (`F_NOCACHE`, `100M`-tick Vault)** | `S08` | **`5.22 ms` p50 / `8.79 ms` p99** (`99.58%` RG pruned) | `p99 <= 100 ms` | `R07` |
| **`100M`-Tick Sequential Streaming Replay & RSS** | `S08` | **`0.975 s`** (`102.55M` ticks/s), **`34.44 MiB` RSS** | `<= 250 ms` per `1M` equiv., peak RSS `<= 200 MB` | `R07` |
| **100k-Bar 16-ary Dyadic VRVP Query & TPO Update** | `S08` | VRVP **`27.08 µs` p99** (`139.5 µs` max); TPO **`2.10 ns/tick`** | VRVP `p99 < 250 µs` (`SV-12` `< 500 µs`); TPO `< 200 ns/tick` | `R05`, `SV-12` |
| **24-Hour L2 Liquidity Heatmap Bound (`864k` slices, `.atdepth`)** | `R05` | `UNVERIFIED` until `v0.1` Implementation CI | Heatmap RAM `< 64 MB`, Zstd `.atdepth` disk `< 30 MB`, idle app RAM `< 300 MB` | `SV-13` |
| **Study Batch (`100k` bars) & `10`-Study Live Tick Mix** | `S07` | Native `1.625 ms`; Wasmtime `1.679 ms` (`+3.32%`); `10`-study **`2.75 µs` p99** (`27.5 µs` max) | Wasmtime `<= 50 ms` (`< 10%` overhead); `10`-study `p99 <= 1,000 µs`, `0` spikes `> 500 µs` | `KC-06` |
| **OMS WAL Append, Batched `fullfsync` & Panic Kill-Switch** | `S06` | WAL `119.75 µs` p50; Halt **`41 ns` p50**; Flatten `6.13–7.04 ms` p50 (`50` orders) | Halt `< 10 ms`; Flatten `< 500 ms` local/mock, `0` stray orders; macOS `BrokerLive` batched `fullfsync <= 25 ms` (`UNVERIFIED`) | `Principles` P8, `ADR-0009` |
| **App Cold Start (Signed/Cached Launch, Async Hydration)** | `S02` *(caveat)* | `S02` unsigned sync-200k-init hit `2,330.99 ms` *(must be fixed via async hydration)* | **`< 2.0 s`** to interactive first frame (`p95`) | `Constraints` #5, `SV-01`, `SV-20` |
| **Full Process-Tree Idle RAM (macOS + Windows)** | `S04` / `S08` | `263.13 MB` headless Brave (`S04`); `S08` flat-arena refactor targets `< 60 MiB` order-flow | **`< 300 MB`** full Tauri + WebView process tree RSS | `Constraints` #5, `SV-13` |
| **Packaged Installer Size (`.dmg` / `.msi` / NSIS)** | `S02`/`S07`/`S08` | Core stripped `gzip-9` sum **`~7.8 MB`** (`2.68 + 1.74 + 0.47 + 2.91`) | **`< 40 MB`** (incl. Windows `embedBootstrapper` `+~1.8 MB`) | `Constraints` #5, `RK-07`, `SV-20` |

> **`v0.1` Implementation (post-Phase-5) Memory & Cold-Start Guardrails:**
> 1. **`S02` Cold-Start Remediation:** Move fixture/catalog hydration completely off `main()` onto a background Tokio task post-window-show so cold start stays strictly `< 2.0 s` on both macOS `WKWebView` and Windows `WebView2`.
> 2. **`S08` Order-Flow Arena Remediation:** Replace per-bar `Vec<FootprintCell>` allocations (`260.77 MiB` RSS for `100k` bars in `S08`) with a flat contiguous `FootprintSlabArena` indexed by `(cell_offset: u32, cell_len: u16)` and gate CI on `< 300 MB` full-app idle RSS (`SV-13`).

---

### 2.5 Layer 5 — UI E2E, `ui-sdk` Accessibility & Multi-Window Interaction Tests

1. **`ui-sdk` Component, Accessibility & Sovereignty Layout Suite (`AGENTS.md`, `A10`, `SV-02`–`SV-07`, `SV-18`, `SV-19`):**
   - All chrome UI (`@ui-sdk/react` & `@ui-sdk/core` exact-pinned `0.1.0-beta.17`, `Apache-2.0`, React 19+) — command palette, toolbars, right property inspector, settings trees, account/instrument pickers, blotters, order tickets — must pass `vitest` + Testing Library + `axe-core` tests verifying:
     - Full keyboard operability (`Tab`, `Shift+Tab`, `Escape`, arrow navigation, `Enter`/`Space`), visible focus rings, `Cmd/Ctrl+K` `<= 3` keystroke reachability (`SV-02`), `0` blocking configuration modals (`SV-03`), Tier-1 micro-toolbar `<= 5` controls & `<= 36 px` height (`SV-04`), `>= 90.0%` active canvas area at `1920x1080` (`SV-05`), deterministic TOML round-trip `SHA-256` & `<= 3`-line diff (`SV-06`), 5-level cascade override + `Reset to Inherited` (`SV-07`), `keymap.toml` `100%` remapping (`< 1 ms`) + conflict highlighting (`SV-18`), and `>= 4.5:1` WCAG AA contrast + `Okabe-Ito` `ΔE2000 >= 20` colorblind audit (`SV-19`).
     - **Strict Hot-Path Boundary Assertion:** React Profiler test verifies **`0` React commits** in chart or `DOM Ladder` / Time & Sales containers during a `60 Hz` synthetic tick burst (`S04`, `AGENTS.md`).
   - **Canvas2D Accessibility:** Because `DOM Ladder` and Time & Sales render via Canvas2D (`S04`), E2E tests verify an accompanying keyboard-focusable ARIA summary region exposing best bid, best ask, spread, active resting order count, and `Instrument` symbol.
2. **UX, Provenance & Execution Safety Invariants (`RK-09`, `SV-10`, `SV-11`, `SV-15`, `SV-16`, `SV-17`, `ADR-0009`):**
   - **Price-Axis Scaling (`SV-15`):** `1,000` rapid unmodified `Click+Drag` gestures across the price axis emit **`0`** `OMS` orders unless `Arm Axis Trading` + required modifier key or `+` quick pill is explicitly invoked.
   - **Undo Stack Separation (`SV-16`):** Place 3 `Drawing`s, submit 1 paper `Order`, modify 1 `Study` parameter, press `Cmd/Ctrl+Z` twice → verify the `Study` and last `Drawing` revert while the working `Order` remains `100%` untouched.
   - **POC / VAH / VAL Magnet Snap Precision (`SV-17`):** Drag a Horizontal Ray or Limit Order within `12 px` of a Volume/TPO Profile POC, VAH, or VAL with `Ctrl/Cmd` (or `POC-Snap Magnet`) → verify snap to exact `i64` tick index with `0` sub-tick float error.
   - **Loud Provenance, Heuristic & Risk-Reduction Banners (`SV-10`, `SV-11`, `RT3-05`):** Verify non-dismissible badges render for `SYNTHETIC: 1m-INTRABAR` (disabling Absorption triggers), `ESTIMATED: TICK-RULE`, `EXACT: L3-MBO`, `OtcIndicative` FX quotes, `HEURISTIC: L2-ICEBERG`/`L2-PULL`, `[Est / Max]` PIQ bounds with `dwell_ms`/`conflation_guard_ms` sliders, `PAPER / SIM` boot mode (`LIVE_ARMED = false`), and the red ***"FEED STALE — RISK-REDUCING EXITS ONLY"*** / `RECONCILING` banner (blocking risk-increasing entries while keeping `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch`, and `reduce_only: true` closing orders active).
3. **Tauri v2 Cross-Window & WebView Smoke (`S03`, macOS + Windows):**
   - Boot real packaged Tauri v2 app on `macos-14` (`WKWebView`) and `windows-latest` (`WebView2`), verify `< 2.0 s` first paint, `Layout` `toJSON()`/`fromJSON()` round-trip across restart, native `WebviewWindow` pop-out creation, cross-window `Instrument`/crosshair sync (`<= 8 ms`), and clean pop-out teardown with `0` orphaned WebViews.

---

## 3. `$0` GitHub Actions CI Matrix (`v0.1` Implementation CI, post-Phase-5 — macOS + Windows)

Because Allegedly is a public `Apache-2.0` repository (`emrisca/allegedly`), standard GitHub-hosted runners are **`$0`**. Per [[Assumptions]] `A01`, **`v0.1`–`v1.0` CI enforces macOS (Apple Silicon + Intel) and Windows 10/11**. Linux is documented below strictly as a post-v1.0 blueprint.

### 3.1 Active `v0.1`–`v1.0` Implementation CI Matrix

| Workflow | Trigger | Runners (`$0` Public Repo) | Executed Suites | Target Budget |
|---|---|---|---|---|
| **`ci-pr-fast.yml`** | Every PR & push to `main` | `macos-14` (`aarch64-apple-darwin`), `windows-latest` (`x86_64-pc-windows-msvc`) | Zero-float lint (`SV-08`); zero legacy `mv-`/`.mv` grep lint (`RT3-04`); `cargo fmt --check`; `cargo clippy -D warnings`; `cargo deny check`; npm SPDX + exact `@ui-sdk` `0.1.0-beta.17` pin check (`dockview-enterprise` hard-block); Layer 1 Rust + TS unit tests; Layer 2 `SV-01` offline boot, wire-mock OMS & Risk-Reduction Bypass, resilience, `12/12` hostile sandbox, `keyring-rs` leak test; `ui-sdk` unit + `axe-core` a11y; TypeScript `tsc --noEmit` | `< 8 min` |
| **`ci-bundle-mac-win.yml`** | PR touching `Cargo.toml`/`package.json`/Tauri config & every `main` push | `macos-14` (arm64 + cross-target `x86_64-apple-darwin` universal check), `windows-latest` (`x86_64-pc-windows-msvc` + WebView2 `embedBootstrapper`) | Release stripped build (`opt-level="z"`, LTO); installer size gate (`< 40 MB`, `SV-20`); `luau0-src` C++17 MSVC + Clang compile check; `THIRD_PARTY_NOTICES.md` & LWC `NOTICE` verification | `< 15 min` |
| **`ci-nightly.yml`** | Daily `04:00 UTC` + manual dispatch | `macos-14`, `macos-15-intel` *(or Intel runner when available)*, `windows-latest` | Layer 3 cross-OS `5M`-tick SHA-256 replay identity (`SV-09`); Layer 4 `S01` WebGL2 sync (`0.000 px`), `S04` Canvas2D `DOM Ladder` (`60 fps`, `SV-14`), `S03` 20-cycle leak audit, `S08` cold seek (`< 100 ms`) & Dyadic VRVP (`< 250 µs`, `SV-12`), 24h heatmap RAM/disk (`SV-13`), macOS `BrokerLive` batched `fullfsync` bench; `TA-Lib v0.8.3` C oracle parity; Layer 5 Tauri E2E (`WKWebView` & `WebView2`, `SV-02`–`SV-07`, `SV-10`–`SV-19`) + `< 2.0 s` cold-start & `< 300 MB` RSS gates | `< 35 min` |
| **`ci-pre-release-soak.yml`** | Manual dispatch before `v0.x` tag (`13:30–16:00 UTC`) | `macos-14`, `windows-latest` | 30-min live `$0` Kraken WS v2 (`depth=100`, 3 pairs) + Coinbase WS soak (`>= 1,000` trades/venue, `0` CRC32/seq faults, RSS `< 60 MB`); optional human-triggered remote `paper-api.alpaca.markets/v2` smoke (opt-in secret only, never on PRs) | `~40 min` |

### 3.2 Local Developer Test Hygiene (`AGENTS.md` & `RK-10`)
- Always export `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` before any local `cargo` invocation so zero `target/` artifacts enter the Obsidian vault.
- Never store temporary multi-hundred-MB replay/Parquet test artifacts inside the repo or vault; isolate them under `/tmp/allegedly-*-test/` with runtime path assertions (`!path.contains("/Documents/Obsidian/")`) and automatic post-test cleanup (`S08`).
- Respect `pnpm` minimum-release-age policy (`AGENTS.md`, `RT3-14`): never bypass or disable it in CI or local scripts; stop and ask Abel if a package install is blocked by release age. Pin `@ui-sdk/react` and `@ui-sdk/core` strictly to exact version `"0.1.0-beta.17"` (no `^`/`~`).

### 3.3 Post-v1.0 Linux CI Blueprint (Deferred — Not Active in `v0.1`–`v1.0`)
When the post-v1.0 Linux milestone opens (`A01`, `RK-01`), add `ubuntu-24.04` (`x86_64-unknown-linux-gnu`) to `ci-pr-fast.yml` and `ci-nightly.yml` with:
- System libs: `libwebkit2gtk-4.1-dev` (`WebKitGTK 2.54.3+`), `libappindicator3-dev`, `librsvg2-dev`, `libsecret-1-dev` (for `keyring-rs` Secret Service).
- Mandatory env guardrails in WebView E2E (`R02`): `__NV_DISABLE_EXPLICIT_SYNC=1` and `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` (explicit CI lint **forbidding** `WEBKIT_DISABLE_DMABUF_RENDERER=1` due to `WebKitGTK 2.52+` SIGSEGV; no transparent windows).
- Verify `luau0-src` GCC C++17 build, cross-OS SHA-256 replay identity, and WebGL2 + Canvas2D frame-time parity (`KC-01`, `KC-02`).

---

## 4. Charter Traceability (`SV-01`–`SV-20` & `KC-01`–`KC-07`)

### 4.1 Complete 20-Row Sovereignty Checklist Traceability (Verbatim Aligned to `01-Charter/Principles.md` §3)

| Check ID | Charter Category (`Principles.md` §3) | Measurable Pass / Fail Assertion | Verification Layer & CI Gate |
|---|---|---|---|
| **`SV-01`** | **Zero-Network Offline Boot** | Cold start `< 2,000 ms`, **`0` outbound DNS/TCP/UDP packets** (`updates.checkOnStartup = false`), `0` error modals in isolated network namespace | Layer 2 (`ci-pr-fast.yml` offline-boot namespace test) + Layer 4 (`ci-nightly.yml`) |
| **`SV-02`** | **Command Palette Keystroke Bound** | `100%` of settings/actions filterable via `Cmd/Ctrl+K` within `<= 3` keystrokes and mutate inline without spawning a modal | Layer 5 (`ci-pr-fast.yml` `ui-sdk` keyboard/Command Palette suite) |
| **`SV-03`** | **Zero Blocking Configuration Modals** | `0` modal backdrop overlays block canvas pan/zoom or DOM order clicks while editing any `Study`, `Drawing`, `DOM Ladder`, chart, or theme property | Layer 5 (`ci-pr-fast.yml` UI tree assertion) |
| **`SV-04`** | **Tier-1 Micro-Toolbar Constraint** | Every floating contextual micro-toolbar contains `<= 5` top-level interactive controls and `<= 36 px` height | Layer 5 (`ci-pr-fast.yml` accessibility-tree geometry scan) |
| **`SV-05`** | **Canvas-to-Chrome Screen Ratio** | Active chart/data canvas area is `>= 90.0%` of total `1920x1080` window area (`>= 1,866,240` of `2,073,600` px) | Layer 5 (`ci-nightly.yml` Tauri E2E viewport layout check) |
| **`SV-06`** | **Deterministic TOML Round-Trip & Git Diff** | `SHA-256(export_1) == SHA-256(export_2)` across Workspace + 3 Analysis Layers + 8 Studies (`workspace.toml`/`analysis.toml`); 1 param edit yields `<= 3`-line diff | Layer 1/5 (`ci-pr-fast.yml` TOML round-trip + Dockview `fromJSON` fidelity) |
| **`SV-07`** | **5-Level Cascade Inheritance & Reset** | Override `imbalance_ratio_bps = 40000`, verify `Modified Only` count = `1`, click `Reset to Inherited` → empty delta `{}` and parent template value (`30000 bps`) | Layer 1/5 (`ci-pr-fast.yml` cascade resolver + Inspector E2E) |
| **`SV-08`** | **Zero Binary Float Static Analysis Gate** | `0` occurrences of `f32`/`f64` in financial/domain structs, traits, accumulators, or schemas outside GPU viewport projection & isolated ingress/Study math | Layer 1 (`ci-pr-fast.yml` `check-no-floats.sh` + Clippy AST lint) |
| **`SV-09`** | **Bit-Exact Cross-Speed Replay Determinism** | `1,000,000+`-tick CME ES MBO/L2 replay at `1×`, `50×`, and max-CPU batch produces `100%` bit-identical state hashes across all 8 tools | Layer 3 (`ci-nightly.yml` cross-OS macOS + Windows SHA-256 replay) |
| **`SV-10`** | **Loud Provenance Badge Enforcement** | Distinct non-dismissible badges (`SYNTHETIC: 1m-INTRABAR`, `ESTIMATED: TICK-RULE`, `EXACT: L3-MBO`) on mixed segments; Absorption disabled on `SYNTHETIC` | Layer 1 (`ProvenanceHeader` contract) + Layer 5 (`ci-pr-fast.yml` badge E2E) |
| **`SV-11`** | **Honest L2 Heuristic Guardrail** | `HEURISTIC: L2-ICEBERG` / `HEURISTIC: L2-PULL` labels, `[Est / Max]` DOM PIQ bounds, and `dwell_ms` / `conflation_guard_ms` sliders visible on L2 MBP feeds | Layer 5 (`ci-pr-fast.yml` L2 heuristic & PIQ UI audit) |
| **`SV-12`** | **60 FPS Pan/Zoom with Active VRVP on 100k Bars** | `P99 <= 16.6 ms` (`>= 60 fps`) pan/zoom on `100k` bars with VRVP, Footprint & CVD active; Dyadic VRVP recompute `< 0.50 ms` (`S08` measured `27.08 µs` p99) | Layer 4 (`ci-nightly.yml` `S01` WebGL2 + `S08` Dyadic VRVP benchmarks) |
| **`SV-13`** | **24-Hour L2 Liquidity Heatmap Memory Bound** | `864,000` slices (10 Hz × 200 levels) stay `< 64 MB` heatmap RAM, `< 30 MB` Zstd `.atdepth` disk, and total idle app RAM `< 300 MB` | Layer 4 (`ci-nightly.yml` 24h heatmap soak + full process-tree RSS gate) |
| **`SV-14`** | **60 Hz DOM Ladder Zero-Allocation Hot Path** | `5,000` L2/MBO updates/sec into 21-column Canvas2D `DOM Ladder` with `0` heap allocations/tick and locked `60 fps` (`S04`: `0.00 ms` layout/style) | Layer 4 (`ci-nightly.yml` `S04` Canvas2D & allocation-counter bench) |
| **`SV-15`** | **Price-Axis Zoom vs. Trade Safety Guard** | `1,000` rapid unmodified `Click+Drag` vertical scale gestures emit `0` staged/submitted orders unless armed + modifier or `+` quick pill | Layer 5 (`ci-pr-fast.yml` & `ci-nightly.yml` price-axis safety E2E) |
| **`SV-16`** | **Undo/Redo Stack Execution Isolation** | `Cmd/Ctrl+Z` reverts Drawings and Study edits while working `OMS` Limit Order remains `100%` untouched in broker order book | Layer 1/5 (`ci-pr-fast.yml` UI command-bus isolation E2E) |
| **`SV-17`** | **POC / VAH / VAL Magnet Snap Precision** | Dragging Horizontal Ray or Limit Order within `12 px` of Volume/TPO POC/VAH/VAL with magnet snaps to exact `i64` tick (`0` sub-tick float error) | Layer 1/5 (`ci-pr-fast.yml` magnet-snap `i64` precision E2E) |
| **`SV-18`** | **100% Remappable Keyboard Map & Conflict Check** | Custom `keymap.toml` remapping all `40+` shortcuts executes `< 1 ms`; duplicate keybinding highlights exact conflicting line & binding in UI and CLI | Layer 1/5 (`ci-pr-fast.yml` `keymap.toml` conflict & latency test) |
| **`SV-19`** | **WCAG AA Tabular Numeral Contrast & Colorblind Audit** | `>= 4.5:1` WCAG AA contrast on all Footprint cells, DOM rows & Heatmap LUTs; `ΔE2000 >= 20` buy/sell separation under `Okabe-Ito` palette | Layer 5 (`ci-pr-fast.yml` luminance contrast + CVD simulation audit) |
| **`SV-20`** | **Installer & Cold-Start Budget Compliance** | Packaged installer `< 40 MB` and cold start to interactive canvas `< 2.0 s` on reference macOS & Windows hardware | Layer 4 (`ci-bundle-mac-win.yml` size gate + `ci-nightly.yml` cold-start gate) |

### 4.2 Kill-Criteria Traceability (`KC-01`–`KC-06`)

| Governance ID | Requirement Summary | Primary Verification Layer & Gate |
|---|---|---|
| **`KC-01` / `KC-02`** | `>= 55 fps` chart + Tauri macOS/Windows WebGL2/IPC parity | Layer 4 (`S01`, `S02`, `S04` harnesses on `macos-14` & `windows-latest`) |
| **`KC-03` / `KC-04`** | Prop-firm `DO-NOT-BUILD` & clean permissive licensing | Layer 1 (`S06-T7` denylist test) + Layer 2 (`cargo-deny v0.22.1` + npm SPDX) |
| **`KC-05` / `KC-06`** | `>= 20k` ticks/s bounded backpressure & study parity/latency/sandbox | Layer 2/4 (`S05`/`S08` backpressure & `rtrb`, `S07` `12/12` hostile traps + `TA-Lib` oracle) |

---

## 5. Explicitly `UNVERIFIED` Items (Tracked for `v0.1` Implementation CI, post-Phase-5)

In accordance with Allegedly's anti-hallucination evidence protocol, the following test targets are **not yet empirically executed** and remain mandatory **`v0.1` Implementation CI (post-Phase-5)** activation gates:

1. **Windows `WebView2` (`x86_64-pc-windows-msvc`) & Intel macOS (`x86_64-apple-darwin`) Performance, Sync & Size Matrix (`UNVERIFIED`):** All Phase 2 benchmarks (`S01`–`S08`) ran on Apple M2 `aarch64-apple-darwin`. Windows WebGL2/Canvas2D frame times, `luau0-src` MSVC C++17 build, `x86_64` stripped binary deltas, and cross-OS SHA-256 replay identity must pass on `windows-latest` and Intel macOS in `v0.1` Implementation CI.
2. **macOS APFS `PRAGMA fullfsync = ON` Batched Kill-Switch WAL Benchmark (`UNVERIFIED`, `RT3-10`):** Validate that mandatory `BrokerLive` `PRAGMA fullfsync = ON` paired with single-transaction batched Kill-Switch WAL commits (1 `F_FULLFSYNC` per 50-order cancel wave) stays `<= 25 ms` on macOS APFS hardware in `v0.1` Implementation CI.
3. **`TA-Lib v0.8.3` (`BSD-3-Clause`) C Oracle Parity (`UNVERIFIED`):** 4-runtime internal parity (`0.000e0`) is verified (`S07`); external C library cross-check (`<= 1e-9`) opens in `v0.1` Implementation CI.
4. **30-Minute Peak-Volatility Live Dual-Venue Soak (`UNVERIFIED`):** 60-second soak passed (`S05`); 30-minute unattended soak (`depth=100`, `SOL/USD`, `>= 1,000` trades/venue) gates `v0.1` release.
5. **Real Databento Portal `.dbn.zst`, `10M`-Row L2 MBP Parquet & 24h Heatmap Benchmarks (`UNVERIFIED`):** Synthetic `.dbn.zst` (`S05`) and `100M` trades (`S08`) passed; human verification on a `$125`-credit real CME Globex `.dbn.zst` archive, `10M`-row L2 MBP seek, and 24-hour `.atdepth` heatmap RAM/disk (`SV-13`) remain open for `v0.1` Implementation CI.
6. **Wasmtime `.cwasm` Pre-Compiled Disk Cache Cold Start (`UNVERIFIED`):** Cold Cranelift compile measured `31.651 ms` (`S07`); warm `Module::deserialize_file` (`< 1 ms` target) will be measured in `v0.1` Implementation CI.
7. **Live-Network Remote Paper Broker Smoke (`UNVERIFIED`):** Local `axum` wire-mock verified `54` faults (`S06`); optional human-triggered smoke against `paper-api.alpaca.markets/v2` and tastytrade cert sandbox OAuth2 `dry-run` remains opt-in outside PR CI.
