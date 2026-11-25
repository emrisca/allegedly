---
title: "Allegedly Error Taxonomy, Local-First Zero-Telemetry Observability & Live Diagnostics Architecture"
type: architecture
status: verified
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - spikes/S05-live-ingest-tickvault/src/model.rs
  - spikes/S05-live-ingest-tickvault/src/resilience.rs
  - spikes/S06-oms-paper-execution/src/risk.rs
  - spikes/S06-oms-paper-execution/src/oms.rs
  - spikes/S07-scripting-sandbox/src/wasmtime_runner.rs
  - spikes/S07-scripting-sandbox/src/luau_runner.rs
  - spikes/S02-tauri-ipc-throughput/src/framing.rs
---

# Error Taxonomy, Local-First Zero-Telemetry Observability & Live Diagnostics

> **Architectural Invariant:** Allegedly is a local-first, sovereign trading terminal ([[Constraints]] #3, #7, #8; [[Principles]] P1, P5, P6, P8). Errors must **fail closed** (never silently corrupting a **DOM Ladder**, **Footprint Bar**, or **Broker** position), observability must generate **zero outbound telemetry packets**, and secrets must be **structurally incapable** of reaching logs, write-ahead logs, diagnostic exports, or the WebView JavaScript heap.

---

## 1. Unified Typed Rust Error Taxonomy

Every Rust subsystem crate exposes a strongly typed error enum (via `thiserror`, `MIT OR Apache-2.0`) that maps deterministically to a single **User-Facing Severity Tier** and an **Automated Recovery Action**. Strings or opaque `anyhow::Error` values are forbidden across subsystem boundaries and IPC responses.

### 1.1 Four User-Facing Severity Tiers

| Tier | Name | Visual & Operational Semantics | Allowed Automation | Examples |
|---|---|---|---|---|
| **T1** | **Silent Retry (Logged)** | No modal, no banner; increments diagnostic counter and emits `DEBUG`/`INFO` structured span. | Bounded equal-jitter exponential backoff (`S05`: `20 ms` base, `30 s` cap) or HTTP `Retry-After` respect (`S06`). | Single transient HTTP `429`/`503` before order commit; clean WebSocket ping/pong jitter; expected EOF on idle socket before reconnect. |
| **T2** | **Degraded Banner (Non-Blocking)** | Non-blocking amber strip in the affected pane header or status bar; unaffected panes stay interactive at `60 fps` (`Principles` P2, `SV-03`). | Automatic clear on clean recovery, or user 1-click retry/dismiss where safe. | Sandboxed **Study** trapped (`FuelExhausted` / `MemoryLimitExceeded`); **Provider** fallback to `ESTIMATED` **Provenance**; stale historical cache; single-pane IPC slow-consumer frame drop; non-fatal malformed CSV row on import. |
| **T3** | **Hard Latch (`BookState::Stale` or `RECONCILING` / `HALTED`)** | High-contrast red/amber non-dismissible state badge (*"FEED STALE — RISK-REDUCING EXITS ONLY"*); **blocks dependent order-flow rendering and risk-increasing order entries** while always permitting cancels, Kill-Switch flatten, and `reduce_only: true` exits until verified resync/reconciliation succeeds. Zero silent interpolation. | Automated snapshot resync (`S05`: `< 2 s` target; measured `7.41 ms` gap / `129.68 ms` TCP drop) or broker reconciliation (`S06`: measured `4.345 ms`); **manual operator unlock** required if orphan **Broker** orders or Kill-Switch halt occur. | Kraken L2 CRC32 mismatch; Coinbase `sequence_num` gap; bounded ingest channel drop; OMS cold boot or WS drop (`RECONCILING`); unjournaled orphan working order; Kill-Switch `OmsHalted`. |
| **T4** | **Fatal Process Crash / Panic Trap** | Rust panic hook flushes ring-buffered JSONL log, syncs SQLite WAL (`PRAGMA synchronous = FULL`), writes local redacted crash report to disk, and exits cleanly with actionable recovery screen on next boot. | Zero automatic phone-home upload. Next launch boots OMS in `RECONCILING` (`S06`) and restores last valid **Workspace** `.toml`. | Corrupted local disk/ENOSPC on OMS WAL write; unrecoverable OS WebView/GPU context loss; internal invariant panic. |

### 1.2 Six Core Rust Error Domains & Tier Mapping

| Rust Error Enum (Crate) | Representative Typed Variants | Severity Tier | Deterministic System Response | Spike / Research Anchor |
|---|---|---|---|---|
| **`IngestError`** (`allegedly-ingest`) | `SequenceGap { venue, symbol, expected, got }`<br>`ChecksumMismatch { venue, symbol, expected, computed }`<br>`WsDisconnected { venue, reason }`<br>`BackpressureDrop { venue, dropped_count }`<br>`FixedPointParse { raw, kind }` (`PrecisionLoss` / `Overflow`)<br>`MalformedFrame { venue, channel }` | **T3** (`BookState::Stale`) for gap, CRC32 mismatch, disconnect, backpressure drop.<br>**T2** for isolated malformed non-book frame or fixed-point parse error (frame rejected, counter incremented).<br>**T1** during initial reconnect backoff before stale timeout expires. | Immediately clear local `L2OrderBook` bids/asks, transition to `BookState::Stale(StaleReason)`, emit stale state to UI **DOM Ladder** / **Footprint Bar**, reconnect with equal-jitter backoff (`S05`), and return to `BookState::Live` **only** after a clean full snapshot + verified checksum/sequence. | [[S05-Live-Ingest-TickVault]] (`0` silent corruptions; `7.41 ms` gap resync; `129.68 ms` TCP-drop recovery) |
| **`StorageError`** (`allegedly-storage`) | `VaultMagicOrVersionInvalid`<br>`VaultCrcMismatch { expected, computed }`<br>`ParquetSchemaMismatch`<br>`SqliteWalBusy { timeout_ms }`<br>`DiskFull { path, required_bytes }`<br>`OfflineDecoderError` (`Dbn` / `Bi5` / `Csv`) | **T1** for transient `SqliteWalBusy` (within `5,000 ms` `busy_timeout`).<br>**T2** for corrupt single imported `.dbn`/`.bi5`/CSV file (abort import, preserve existing vault).<br>**T3** for `.atvault` recorder segment CRC/write failure (pause recording badge, keep live UI running).<br>**T4** for unrecoverable `DiskFull` / I/O error on OMS WAL. | Never silently skip corrupt records or serve half-written Parquet partitions. `.atvault` trailer checks `record_count` + `CRC32` + `TVEND001` (`S05`); Hive Parquet commits atomically via temp-file rename + SQLite catalog transaction (`S08`). | [[S05-Live-Ingest-TickVault]], [[S08-Storage-100M-Replay]] (`PRAGMA journal_mode = WAL`, `0` lost ticks) |
| **`StudySandboxError`** (`allegedly-studies`) | `WasmFuelExhausted { study_id, fuel_limit }`<br>`WasmMemoryLimitExceeded { study_id, limit_bytes }`<br>`LuauInstructionLimit { study_id }`<br>`LuauMemoryLimitExceeded { study_id, limit_bytes }`<br>`StackOverflow { study_id }`<br>`CapabilityDenied { study_id, capability }`<br>`CompileError { study_id, line, msg }` | **T2** (isolated per-**Study** fault — **never** T3 or T4 for the host terminal). | Immediately terminate and quarantine the offending **Study** instance, mark its legend badge `HALTED (SANDBOX TRAP)` with exact reason + line/fuel metric, and guarantee sibling **Studies**, chart `60 fps` loop, and OMS remain **100% uncorrupted**. | [[S07-Scripting-Sandbox]] (`12/12` hostile traps passed; Wasmtime traps in `0.24–1.78 ms`, Luau OOM cap `18.71 ms`, siblings verified intact) |
| **`OmsError`** (`allegedly-oms`) | `RiskRejected(RiskError)` (`MaxOrderSizeExceeded`, `MaxPositionExceeded`, `DailyLossLimitBreached`, `FatFingerCollarBreached`, `AntiHedgingViolation`, `DuplicateOrderThrottled`, `RateLimitExceeded`)<br>`InvalidStateTransition { from, to }`<br>`OmsReconciling`<br>`OmsHalted`<br>`LiveTradingCompileDisabled`<br>`LiveNotArmed`<br>`ForbiddenAdapter(String)` (`DO-NOT-BUILD`) | **T2** for pre-trade `RiskRejected` (order never leaves OMS; toast + audit log with exact fixed-point limit).<br>**T3** for `OmsReconciling` (cold boot / WS drop / orphan order) and `OmsHalted` (Kill-Switch active; `41–42 ns` atomic halt in `S06`).<br>**T3/Blocked** for `LiveNotArmed`, `LiveTradingCompileDisabled`, and `ForbiddenAdapter` (`9` denylisted strings in `S06`). | All order intents persist to SQLite WAL (`synchronous = FULL`, plus mandatory `PRAGMA fullfsync = ON` on macOS for `BrokerLive` with batched Kill-Switch commits) before network dispatch. Reject risk-increasing entries while `BookState != Live`, `RECONCILING`, or `HALTED`; always allow `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch`, and `reduce_only: true` closing orders (`ADR-0009` §3 D3). | [[S06-OMS-Paper-Execution]] (`7/7` fault suites passed, `41–42 ns` halt, `0` duplicates across `54` injected faults) |
| **`BrokerError`** (`allegedly-oms` broker adapters) | `HttpRateLimited { retry_after_ms }`<br>`Transient5xxBeforeCommit`<br>`Ambiguous5xxOrTimeout { client_order_id }`<br>`MalformedPayload { field, raw }`<br>`HostAllowlistViolation { env, host }`<br>`AuthExpiredOrInvalid`<br>`TradeStreamDisconnected` | **T1** for `HttpRateLimited` (honors `X-Retry-After-Ms` / `Retry-After`) and `Transient5xxBeforeCommit`.<br>**T3** for `Ambiguous5xxOrTimeout` (transitions order to `UnknownPendingReconcile` and queries `by_client_order_id` before any retry — **never blind-resubmit!**), `TradeStreamDisconnected` (enters `RECONCILING`), `HostAllowlistViolation`, `MalformedPayload` (`NaN`/`inf` rejected).<br>**T2/T3** for `AuthExpiredOrInvalid` (halts live routing, prompts OS keychain re-auth). | Disjoint compile-time/runtime host allowlists per `ExecutionEnv` prevent sandbox credentials from touching live endpoints (`S06-T6`). Malformed payloads never trigger `f64` fallback. | [[S06-OMS-Paper-Execution]] (`24` HTTP 429/503/500 runs → `0` duplicate orders; WS drop reconcile `< 3 s`) |
| **`IpcError`** (`allegedly-app` / `allegedly-ipc`) | `ChannelClosed { stream_id }`<br>`FrameMagicInvalid { got }`<br>`SlowConsumerCoalesced { dropped_frames }`<br>`SerializationFailed`<br>`WindowDetached { window_id }`<br>`CommandRejected { code, domain_error }` | **T1** for `SlowConsumerCoalesced` (chart/DOM coalesces to latest `16 ms` / `60 Hz` binary snapshot, logs counter).<br>**T2** for `WindowDetached` or `CommandRejected` (forwards typed Rust domain error to UI).<br>**T3** for `ChannelClosed` on live market/OMS channel (triggers snapshot resync + stale banner on affected panels). | Packed binary framing (`magic = 0x414C4732` in `S02`) validates header before `BigInt64Array`/`DataView` projection. Coalescing at `16 ms` (`60 Hz`) prevents WebView queue buildup (`S02`: `100,450 msgs/s` at `1–3 ms` RTT). | [[S02-Tauri-IPC-Throughput]] (`16 ms` batching eliminates `6.5×–9.2×` unbatched tail latency) |

---

## 2. Local-First Zero-Telemetry Observability (`Constraints` #3)

### 2.1 Zero-Network Telemetry Invariant
- **Zero Phone-Home:** Allegedly includes **no** Sentry, Datadog, PostHog, OpenTelemetry SaaS exporters, Google Analytics, crash-upload daemons, or default-on startup update pings (`updates.checkOnStartup = false` per [[Release-Signing-Update]] §3.2) that transmit user metrics or machine identifiers.
- **Verified by `v0.1` Implementation CI Gate (`SV-01`):** Launching Allegedly in an isolated network namespace with no active **Provider** or **Broker** must emit **`0` outbound DNS/TCP/UDP packets** (`Principles` §3).
- **Explicit User-Controlled Export Only:** Diagnostics leave the user's machine **only** when the user explicitly clicks **Export Redacted Diagnostic Bundle (`.zip`)** and manually shares the resulting local file.

### 2.2 Structured Local Tracing & Rotating JSONL Ring Buffer
All Rust crates instrument hot and cold paths using **`tracing`** (`MIT`) + **`tracing-subscriber`** (`MIT`), routed through two strictly separated sinks so disk I/O **never** touches `60 fps` or `100k+ ticks/s` hot paths:

1. **In-Memory Lock-Free Diagnostics Ring (`rtrb`, `Apache-2.0 OR MIT`):**
   - Stores the last **`8,192`** structured log events (`WARN`/`INFO`/`ERROR`, plus toggleable `DEBUG`) and per-second rolling metric snapshots (`ws_rtt_us`, `parse_latency_us`, `ipc_batch_ms`, `frame_time_ms`, `vrvp_us`, `rss_mb`) in fixed-capacity ring buffers with **zero heap allocation per tick** (`SV-14`).
   - Feeds the in-app **Live Operational Diagnostics** panel directly on a `250 ms` (`4 Hz`) UI poll cadence.
2. **Asynchronous Rotating Local JSONL Disk Sink:**
   - Dedicated background writer thread (`tracing-appender` non-blocking worker) writes newline-delimited JSON (`JSONL`) to the user's local app data directory:
     - **macOS:** `~/Library/Application Support/Allegedly/logs/`
     - **Windows:** `%LOCALAPPDATA%\Allegedly\logs\`
   - **Strict Local Disk Cap:** Daily or size-based rotation at **`10 MiB` per file**, keeping at most **`5` active files (`<= 50 MiB` total ceiling)** so unattended multi-day recording can never fill a trader's SSD.
   - **Canonical JSONL Schema:** Every line carries `ts_utc_ns` (`i64`), `level`, `target` (`allegedly_ingest` / `allegedly_oms` / `allegedly_studies` / `allegedly_storage` / `allegedly_ipc`), `span_id`, `correlation_id` (e.g., `client_order_id` or `stream_id`), `error_code` (typed enum variant), `severity_tier` (`T1`–`T4`), and structured key-value fields.
3. **OMS Audit Log Separation:**
   - Execution audit events (`IntentLogged`, `RiskRejected`, `OrderSubmitted`, `FillApplied`, `KillSwitchTriggered`, `ReconciliationCompleted`) are **not** merely logs — they live durably inside the **SQLite WAL** (`PRAGMA synchronous = FULL`, `S06`: `119.75 µs` p50 append) and are mirrored into `tracing` solely as redacted structured summaries.

### 2.3 Mandatory Secret-Redaction Filter (`S06` & `Compliance-Notes` §9 Invariant)

Secrets are protected by **three defense-in-depth layers** so credentials can never leak into logs, SQLite WALs, `.atvault` headers, diagnostic `.zip` bundles, or WebView JavaScript:

1. **Type-System Redaction (Compile-Time Primary Defense):**
   - All API keys, secrets, OAuth2 bearer/refresh tokens, and passphrases are wrapped in opaque `SecretString` / `ApiCredentials` structs backed by **`zeroize`** (`Apache-2.0 OR MIT`) and stored exclusively in OS-native credential vaults via **`keyring-core` / `keyring-rs`** (`v4.2.0`, `MIT OR Apache-2.0`, macOS Keychain & Windows Credential Manager) ([[Compliance-Notes]] §9).
   - `Debug` and `Display` implementations unconditionally emit `"[REDACTED]"` (verified in `S06-T6`), and `serde::Serialize` is **not implemented** on credential types so accidental `serde_json::to_string` is a compile error.
2. **Tracing & Exporter Scrubbing Layer (Runtime Second Defense):**
   - A custom `RedactingLayer` sits in front of both the in-memory ring and the JSONL file appender, plus runs a second pass during `.zip` bundle export.
   - Automatically scrubs:
     - Known HTTP/WS header keys (`Authorization`, `APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`, `X-API-Key`, `Cookie`, `Set-Cookie`, `token`, `secret`, `password`, `api_key`, `refresh_token`, `access_token`).
     - High-entropy token regex patterns (JWT `eyJ...`, Bearer strings, Alpaca `PK...`/`AK...` keys, base64/hex secrets `>= 24` chars in query parameters).
     - User home directory prefixes (`/Users/<username>/`, `C:\Users\<username>\`) replaced with `<HOME>` in exported diagnostic bundles to protect user privacy.
3. **Automated `v0.1` Implementation CI Leak Assertions (`S06-T6` Pattern):**
   - Every integration test suite injects synthetic canary secrets (`CANARY_SECRET_S06_DO_NOT_LEAK`) and asserts **zero byte occurrences** across: (a) raw SQLite DB + `-wal` + `-shm` bytes, (b) rotating JSONL log output, (c) generated diagnostic `.zip` contents, and (d) Tauri IPC payloads sent to the WebView.

---

## 3. Live Operational Diagnostics UI

Built with **`@ui-sdk/react`** (`Apache-2.0`) + Tailwind CSS v4 inside a non-blocking Dockview drawer/tab (reachable in `<= 3` keystrokes via `Cmd/Ctrl+K >diagnostics`, obeying `Principles` P2 & `SV-02`/`SV-03`), polling Rust's diagnostics ring at `4 Hz` (zero impact on `60 fps` chart hot paths):

### 3.1 Panel Sections & Exact Telemetry Signals

| Diagnostics Section | Live Metrics Displayed | Source Subsystem | Alert / Visual Trigger |
|---|---|---|---|
| **1. Provider & Book Health Table** | Per-**Provider** & **Instrument**: WS status (`Connected` / `Reconnecting (attempt N, backoff ms)`), WS exchange-to-recv RTT (`p50`/`p99 ms`), parse latency (`p99 µs`), `sequence_num` gaps, Kraken CRC32 pass/fail ratio, `BookState` (`Live` / `Stale(Reason)` / `Resyncing`), live ticks/sec & L2 deltas/sec. | `allegedly-ingest` (`S05`) | Green when `BookState::Live` & `0` gaps; **Red/Amber `STALE`** badge immediately on CRC32 fail, sequence gap, or backpressure drop. |
| **2. Active 5-Tier Provenance Ledger** | Every open chart, **Footprint Bar**, **Volume Profile**, and **DOM Ladder** lists its active **Provenance** badge (`EXACT: L3-MBO`, `EXACT: TICK-AGGR`, `ESTIMATED: L1-QUOTE`, `ESTIMATED: TICK-RULE`, `SYNTHETIC: 1m-INTRABAR`), **Venue** coverage (`FullVenue` / `ConsolidatedSip` / `SingleVenuePartial` / `OtcIndicative`), timeliness (`RealTime` / `Delayed Ns`), and aggressor source (`ExchangeReported` / `ExchangeReportedInverted` / `Inferred*`). | `allegedly-ingest` + `allegedly-orderflow` (`R03`, `Principles` P5, `S05`) | High-contrast amber on `ESTIMATED` or `SingleVenuePartial`; orange hatched warning on `SYNTHETIC` or `OtcIndicative`. |
| **3. Render, IPC & Compute Sparklines** | Rolling 60-second sparklines (Canvas2D lightweight strip, tabular `JetBrains Mono` numerals): WebGL2/LWC frame time (`p50`/`p99 ms` vs `16.6 ms` budget), IPC `16 ms` batch RTT (`p95 ms`, `S02`), Dyadic VRVP recompute time (`µs` vs `250 µs` budget, `S08`), active **Study** runtime latency per study (`Native`/`Wasmtime`/`Luau`, `S07`), and total process RSS (`MB` vs `< 300 MB` budget). | `allegedly-app` + `allegedly-studies` + WebView perf observer (`S01`, `S02`, `S07`, `S08`) | Amber if frame p99 `> 16.6 ms`, IPC p95 `> 10 ms`, or RSS `> 250 MB`. |
| **4. Storage & OMS Health** | Local `.atvault` recorder status (ticks buffered, bytes/tick, CRC status), Hive Parquet vault disk footprint, SQLite WAL checkpoint lag; OMS state (`Paper` / `Sandbox` / `RECONCILING` / `HALTED`), `LIVE_ARMED` status (`false` default), and **Broker** heartbeat/RTT (`v0.2+`). | `allegedly-storage` (`S05`/`S08`) + `allegedly-oms` (`S06`) | Red banner on `RECONCILING` or `HALTED` with 1-click jump to Reconciliation Diff view. |
| **5. Live Log Tail & Filter** | Virtualized `@tanstack/virtual` tail of the `8,192`-entry ring buffer with filter pills (`T1`–`T4`, subsystem target, `correlation_id` search). | `tracing` ring | Instant filter with zero WebView DOM bloat. |

### 3.2 One-Click "Export Redacted Diagnostic Bundle (`.zip`)"
Clicking **Export Redacted Diagnostic Bundle** runs a deterministic local Rust command (`export_diagnostic_bundle`) that writes `allegedly-diag-YYYYMMDD-HHMMSS.zip` to a user-chosen path containing:
1. `system_summary.json` — OS version, CPU arch, RAM total, app version/git SHA, active GPU WebGL2 renderer string, binary feature flags (`allow-live-trading: false`).
2. `metrics_snapshot.json` — Last 60 s of provider health, latency percentiles, **Provenance** table, and RSS counters.
3. `logs_redacted.jsonl` — Last `5 MiB` of rotated JSONL logs passed through a second mandatory `RedactingLayer` verification pass.
4. `workspace_schema_sanitized.toml` — Active **Layout** & **Study** config deltas with all account IDs, custom notes, and file paths stripped/anonymized.
5. `redaction_manifest.json` — Counts of redacted tokens/paths and a SHA-256 checksum of every bundled file, previewed in a non-blocking confirmation summary so the user can inspect the exact archive contents before sharing in a GitHub issue.

---

## 4. Open Items & `v0.1` Implementation CI Verification Gates (post-Phase-5)

1. **Windows `WebView2` Memory Accounting (`UNVERIFIED`):** As noted in [[S02-Tauri-IPC-Throughput]], macOS runs WebKit helper processes as `launchd`-parented XPC services while Windows spawns `msedgewebview2.exe` child processes. **`v0.1` Implementation (post-Phase-5)** must implement OS-specific process-tree RSS attribution (`proc_pidinfo` / WebKit XPC grouping on macOS; Job Object / parent-PID aggregation on Windows) so the Diagnostics UI reports truthful total RAM against the `< 300 MB` budget (`SV-13`).
2. **Crash-Report Symbolication Without Phone-Home:** Ship minimal panic backtraces (function names + crate versions) in local crash files while keeping stripped release installers `< 40 MB` (`SV-20`).
