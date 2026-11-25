---
title: "Red-Team Audit: Apple M2 Stage D Implementation (v0.1 Slices 1–5)"
type: review
status: complete
verdict: FAIL
reviewer: Allegedly Red Team
audited_commit: 6726fbe4ed5b1ddda30fa85918dfe870e69d0c4c
audited_branch: main
host_platform: macOS arm64 (Apple M2)
updated: 2026-11-25
tags:
  - review
  - red-team
  - stage-d
  - v0.1
---

# Red-Team Audit — Stage D Implementation (Slices 1–5)

> **Verdict:** **`FAIL`**
> **Audited Commit:** `6726fbe4ed5b1ddda30fa85918dfe870e69d0c4c` (`feat(stage-d): Slice 5 macOS arm64 bundle telemetry (UV-05/SV-01) and live WS soak (UV-06)`)
> **Scope:** Independent adversarial code, architecture, invariant (`SV-01`–`SV-20`, `ADR-0001`–`ADR-0009`), IPC contract (`IPC-Contract.md` / `schemas/ipc-v1/ipc-contract.json`), build/CI hygiene, and verification-ledger audit across all 10 Rust crates, the Tauri v2 shell (`apps/desktop/src-tauri`), both TypeScript packages (`packages/ipc-client`, `packages/ui-chrome`), the desktop frontend (`apps/desktop`), CI workflows/scripts, and governance dashboards (`08-Dashboards/`, `README.md`, `99-Meta/Worklog.md`).

---

## 1. Executive Summary

The workspace builds cleanly, passes all 31 Rust workspace tests and 18 TypeScript/Vitest tests, has zero `unsafe` blocks in `crates/` and `apps/desktop/src-tauri/src`, keeps zero `target/` directories inside the Obsidian vault, and cleanly avoids banned dependencies (`dockview-enterprise`, `openssl-sys`, `nautilus`, `ibapi`, `rithmic`, `cqg`, `.scid`). The core binary wire format (`ALG2` v1 framing & Rust↔TS golden parity), fixed-point integer primitives (`PriceE9`, `QtyE9`, `VwapAccumulator`), and `UV-02` APFS `PRAGMA fullfsync=ON` batched commit benchmark (`4.024 ms` for 50 orders) are solid foundations.

However, adversarial inspection uncovered **5 Blockers**, **8 Majors**, and **4 Minor defect clusters** that invalidate Stage D completion claims:

1. **The actual Tauri desktop binary (`apps/desktop/src-tauri/src/main.rs`) bypasses `allegedly-oms` and `allegedly-storage` with a toy in-memory stub** (hardcoded `$95,000` fill price for every symbol, zero SQLite WAL persistence, zero `RiskGate`, no `#![forbid(unsafe_code)]`, and excluded from `ci-pr-fast.yml`).
2. **Native desktop binary IPC violates `ADR-0002` and leaves Chart/DOM/Status panels dead in `Allegedly.app`** (`poll_binary_frame` returns JSON-serialized `Option<Vec<u8>>` via 16 ms polling loops and only ever emits `LIVE_TRADE_BATCH`, never bars, footprints, profiles, L2 book, or stream status).
3. **A hidden `SV-08` zero-float violation exists in live Kraken ingestion (`live_soak.rs`)** because root `Cargo.toml` enables `serde_json` without `arbitrary_precision` (parsing JSON decimals through IEEE-754 `f64`), and `scripts/ci/check-no-floats.sh` has three blind spots that fail to catch it.
4. **`SV-09` cross-speed replay determinism is verification theater**: `replay_ticks_deterministic` takes `_speed: ReplaySpeed` and ignores it, so all four speed runs execute the identical unchunked loop.
5. **The `measure-macos-bundle.mjs` harness cannot substantiate `UV-05` or `SV-01` closure**: cold start only polls for *any* new `WebKit.WebContent` process (not app paint/hydration, and never checks if `Allegedly` crashed), and `SV-01` zero-network proof is a single point-in-time `lsof -nP -i` snapshot taken 1.5 s after launch (blind to transient startup DNS/TCP/TLS connections).

| Severity | Count | Summary |
| :--- | :---: | :--- |
| **Blocker** | **5** | Toy desktop OMS stub & unwired runtime (`RTSD-01`), broken native Tauri binary IPC (`RTSD-02`), hidden `f64` parse in `live_soak.rs` + float-guard holes (`RTSD-03`), `SV-09` unused `_speed` verification theater (`RTSD-04`), invalid `UV-05`/`SV-01` bundle harness (`RTSD-05`) |
| **Major** | **8** | `parse_decimal_e9` 2B-iteration CPU DoS & exponent truncation (`RTSD-06`), Luau 64 MiB pool 4× bypass + stale interrupt + non-deterministic `math.random` (`RTSD-07`), WebGL2 chart overlay violates `ADR-0004`/`S01` + GPU buffer leak (`RTSD-08`), `allegedly-oms` swallowed WAL write errors & kill-switch state divergence (`RTSD-09`), `ws_client.rs` & `live_soak.rs` wire-format/exit-0/silent-drop bugs (`RTSD-10`), missing `cargo-deny` CI gate & incomplete npm policy (`RTSD-11`), storage CRC/OOM/unwrap/fsync hazards (`RTSD-12`), `UV-04` dashboard overclaim (`RTSD-13`) |
| **Minor** | **4** | IPC decoder validation & unbounded batcher (`RTSD-14`), orderflow `evict_oldest_bars(0)` panic & out-of-order tick handling (`RTSD-15`), `ConfigCascade` safety bypass & TOML newline injection (`RTSD-16`), UI/Chrome/Drawing defects (`RTSD-17`) |

---

## 2. Empirical Verification Ledger

All commands below were executed directly against commit `6726fbe4ed5b1ddda30fa85918dfe870e69d0c4c` with `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` (read-only).

| Check | Command | Observed Result | Audit Assessment |
| :--- | :--- | :--- | :--- |
| Static float guard | `bash scripts/ci/check-no-floats.sh` | `PASS [SV-08]: 0 f32/f64 occurrences in financial crates.` (exit 0) | **Incomplete guard** — misses `serde_json` `f64` parsing in `live_soak.rs`, `apps/desktop/src-tauri`, `allegedly-app`, `as_f64()` (`RTSD-03`) |
| Legacy prefix guard | `bash scripts/ci/check-no-legacy-prefix.sh` | `PASS [ADR-0001]: 0 retired legacy prefixes/extensions in production tree.` (exit 0) | **PASS** |
| NPM policy guard | `node scripts/ci/check-npm-policy.mjs` | `PASS [SC-02/AGENTS.md]: Checked 4 package.json file(s); 0 banned packages, exact @ui-sdk pins verified.` (exit 0) | **Partial** — does not check `pnpm-lock.yaml` transitive deps or pin `dockview`/`lightweight-charts` (`RTSD-11`) |
| In-vault `target/` dirs | `find . -maxdepth 4 -name target -type d \| wc -l` | `0` | **PASS** (external `CARGO_TARGET_DIR` respected) |
| Lockfile license/banned scan | `grep` on `pnpm-lock.yaml`, `Cargo.lock`, `apps/desktop/src-tauri/Cargo.lock` | `0` matches for `enterprise`, `openssl-sys`, `nautilus`, `ibapi`, `tws`, `rithmic`, `cqg`, `scid` | **PASS** (manual check; `cargo-deny` itself not installed/run) |
| `unsafe` audit | `grep -rn "unsafe" crates apps/desktop/src-tauri/src` | `0` occurrences | **PASS** in code, though `src-tauri` lacks `#![forbid(unsafe_code)]` (`RTSD-01`) |
| `cargo-deny` | `command -v cargo-deny` | Not installed locally; not present in `.github/workflows/ci-pr-fast.yml` | **GAP** (`RTSD-11`) |
| Rust formatting | `cargo fmt --all -- --check` | Exit 0 | **PASS** |
| Rust workspace clippy | `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0 (`0` warnings) | **PASS** |
| Tauri shell clippy | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings` | Exit 0 (`0` warnings) | **PASS** (not enforced in CI; `RTSD-01`) |
| Rust workspace tests | `cargo test --workspace --release` | **31/31 passed** (`allegedly-app` 1, `core` 6, `ingest` 4+3, `ipc` 3, `oms` 3, `orderflow` 3+1, `replay` 2, `storage` 1, `studies` 2+2) | **PASS** (with test-validity defects in `RTSD-04`, `RTSD-13`) |
| `UV-02` APFS `fullfsync` bench | `cargo test -p allegedly-oms --release uv02 -- --nocapture` | `[UV-02 MEASURED] BrokerLive PRAGMA fullfsync=ON batched 50-order Kill-Switch commit: 4024 us (4.024 ms)` | **PASS (Apple M2)**; Intel macOS remains open |
| `UV-04` slab arena bench | `cargo test -p allegedly-orderflow --release --test slab_arena_10chart_rss -- --nocapture` | `charts=10 bars=100000 cells=672961 total_bytes=29534752 (28.16 MiB)` | **Overclaimed as live RSS** — measures post-`shrink_to_fit()` struct estimate, not OS RSS (`RTSD-13`) |
| `KC-05` / `T09` SPSC & fault bench | `cargo test -p allegedly-ingest --release --test ws_fault_injection_and_spsc_bench -- --nocapture` | `49,573,666 ticks/s` (`500,000` ticks in `10,086 us`); Kraken CRC32 & Coinbase loopback resync `18 ms` | **PASS** (loopback synthetic harness; real `ws_client.rs` diverges, `RTSD-10`) |
| IPC schema parity | `diff -u schemas/ipc-v1/ipc-contract.json <(cargo run --quiet -p allegedly-docgen)` | `SCHEMA EXACT MATCH` (0 diff) | **PASS** |
| TS typecheck | `pnpm typecheck` (`pnpm -r typecheck`) | Exit 0 across 3 packages (`ipc-client`, `ui-chrome`, `desktop`) | **PASS** |
| TS unit tests | `pnpm test` (`pnpm -r test`) | **18/18 passed** (`ipc-client`: 14, `ui-chrome`: 0 test files, `desktop`: 4) | **PASS** (`ui-chrome` has 0 tests) |
| `UV-01` a11y test | `pnpm test:a11y` | **1/1 passed** (`jsdom` logs `HTMLCanvasElement.prototype.getContext` not implemented; `color-contrast` rule disabled) | **PASS with caveats** (static default view only; no open dialogs/selects/tabs) |
| Release artifacts in cache | `ls -lh /Users/abelmora/.cache/allegedly-target/{release/allegedly-desktop,bundle/Allegedly-macos-arm64.tar.gz}` | `allegedly-desktop`: `12M`; `Allegedly-macos-arm64.tar.gz`: `3.4M` | **Present** (hand-assembled `.tar.gz`, not `tauri build` `.dmg`; `RTSD-05`) |

---

## 3. Blockers (Must Fix Before Stage D Sign-Off)

### `RTSD-01` [Blocker] — Tauri Desktop Binary Bypasses `allegedly-oms` & `allegedly-storage` with a Toy In-Memory Stub and Is Excluded from CI
- **Locations:**
  - `apps/desktop/src-tauri/Cargo.toml:1-31`
  - `apps/desktop/src-tauri/src/main.rs:1-317` (specifically `DesktopState` at lines `60-90`, `submit_paper_order` at `127-172`, `kill_switch_cancel_all` at `175-184`)
  - `crates/allegedly-app/Cargo.toml:10-16` & `crates/allegedly-app/src/lib.rs:1-155`
  - `Cargo.toml:16` (`exclude = ["apps/desktop/src-tauri"]`)
  - `.github/workflows/ci-pr-fast.yml:27-68`
- **Violation:** `SV-03` (crash-safe SQLite WAL OMS), `SV-04` (RiskGate fail-closed on `BookState != Fresh`, `reduce_only`, `max_order_qty_e9`), `SV-05` (`live_armed = false` / `FORBIDDEN_DO_NOT_BUILD_ADAPTERS`), `SV-14` (`#![forbid(unsafe_code)]`), `Plan-of-Record.md` Slice 1–5 integration gate.
- **Root Cause & Evidence:**
  1. `apps/desktop/src-tauri/Cargo.toml` does **not** depend on `allegedly-oms`, `allegedly-storage`, or `allegedly-ingest`. Meanwhile `crates/allegedly-app/Cargo.toml` lists `allegedly-oms` and `allegedly-storage` as dependencies, yet `crates/allegedly-app/src/lib.rs` never imports or calls either crate.
  2. `apps/desktop/src-tauri/src/main.rs:60-184` reimplements paper trading as a throwaway in-memory `Vec<PaperOrderTicket>` + `BTreeMap<String, i128>`:
     - **Zero SQLite WAL persistence or crash recovery** — restarting `Allegedly.app` silently erases all orders and positions.
     - **Zero `RiskGate`** — `submit_paper_order` never checks `BookState`, `max_order_qty_e9`, `reduce_only`, or adapter blocklists.
     - **Hardcoded `$95,000` fill price for every symbol** (`main.rs:148`: `Some("95000000000000".to_string())`) — market orders on `ETH/USD` (`~$3,400`) or `SOL/USD` (`~$180`) fill at `$95,000`.
     - **Unvalidated `side` & `order_type`** (`main.rs:160-164`): `if payload.side == "buy" { *entry += qty; } else { *entry -= qty; }` turns any invalid string (e.g. `"BUY"`, `""`, `"typo"`) into a short sell; any non-`"market"` string becomes a `"working"` order without validating `limit_price_e9`.
     - **Unbounded `O(N)` `orders.insert(0, ticket)`** (`main.rs:169`) and `kill_switch_cancel_all` (`main.rs:175-184`) does not persist to WAL or flatten open positions.
  3. Because `apps/desktop/src-tauri` is excluded from the root Cargo workspace (`Cargo.toml:16`), it **does not inherit** `[workspace.lints.rust] unsafe_code = "forbid"`, has no `#![forbid(unsafe_code)]` attribute in `main.rs`, and `.github/workflows/ci-pr-fast.yml` **never compiles, clips, or tests `apps/desktop/src-tauri`**.
- **Required Fix:**
  - Wire `LocalPaperOms` (backed by a real `OmsWalJournal` in the OS app-data directory, respecting `SV-01`) and `RiskGate` inside `AllegedlyRuntime` (`allegedly-app`), and delegate `submit_paper_order`, `get_paper_account`, and `kill_switch_cancel_all` from `src-tauri/src/main.rs` directly to `AllegedlyRuntime`.
  - Validate `side`/`order_type`/`limit_price_e9` via typed Rust enums (`OrderSide`, `OrderType`) and price market fills from the symbol's live/sim top-of-book.
  - Add `#![forbid(unsafe_code)]` at line 1 of `apps/desktop/src-tauri/src/main.rs` and add `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings` (plus unit tests) to `.github/workflows/ci-pr-fast.yml`.

---

### `RTSD-02` [Blocker] — Native Tauri Binary IPC Violates `ADR-0002` and Leaves Chart/DOM/Status Streams Dead in `Allegedly.app`
- **Locations:**
  - `apps/desktop/src-tauri/src/main.rs:254-258` (`poll_binary_frame`)
  - `crates/allegedly-app/src/lib.rs:64-84` (`step_sim_batch`)
  - `packages/ipc-client/src/tauri-adapter.ts:32-57` (`subscribeBinary`)
  - `apps/desktop/src/App.tsx:107-117`, `apps/desktop/src/panels/chart-panel.tsx:480-555`, `apps/desktop/src/panels/dom-ladder-panel.tsx:140-175`
- **Violation:** `ADR-0002` (raw binary `tauri::ipc::Response` / `Channel<InvokeResponseBody::Raw>`, zero per-tick JSON serialization), `IPC-Contract.md` §2–§3, bounded memory (`SV-13`).
- **Root Cause & Evidence:**
  1. **JSON array serialization instead of raw binary:** `poll_binary_frame` (`main.rs:255`) returns `Option<Vec<u8>>`. In Tauri v2, `Vec<u8>` is serialized by `serde_json` as a JSON array of decimal integers (`[65,76,71,50,...]`), violating `ADR-0002`'s core raw-binary requirement (`tauri::ipc::Response` or `tauri::ipc::Channel<InvokeResponseBody::Raw>`). `tauri-adapter.ts:43-44` then allocates a `Uint8Array.from(bytes)` *and* copies it a second time (`new Uint8Array(u8.byteLength); copy.set(u8)`).
  2. **Three competing polling loops & silent error swallowing:** `App.tsx`, `ChartPanel`, and `DomLadderPanel` each call `transport.subscribeBinary(...)`, spawning **three independent `setTimeout(..., 16)` invoke loops** racing on the same `DesktopState.runtime` mutex. Meanwhile `tauri-adapter.ts:46-48` swallows all IPC failures (`catch {}`) without ever emitting a `STREAM_STATUS_FRAME` despite its comment.
  3. **Dead Chart/DOM/Status UI inside the native binary:** `poll_binary_frame` calls `rt.step_sim_batch(8, now_ns())` (`crates/allegedly-app/src/lib.rs:64-84`), which **only ever emits `LIVE_TRADE_BATCH` (`0x0101`)**. It never emits `LIVE_BAR_UPDATE_BATCH` (`0x0106`), `LIVE_FOOTPRINT_DELTA` (`0x0102`), `VOLUME_PROFILE_SOA` (`0x0103`), `TPO_PROFILE_BITMASK` (`0x0104`), `LIVE_L2_BOOK_BATCH` (`0x0105`), or `STREAM_STATUS_FRAME` (`0x0201`). By contrast, `OfflineSimTransportAdapter` (used only in browser/Vite dev mode) emits all 7 frame types! Thus, in the actual native `Allegedly.app` binary:
     - `ChartPanel` receives zero bar, footprint, VRVP, or TPO updates (permanently frozen on static seed bars);
     - `DomLadderPanel` receives zero L2 book frames (permanently empty ladder);
     - `App.tsx` never receives a `STREAM_STATUS_FRAME` (status bar never updates from backend).
  4. **Unbounded memory leak in `AllegedlyRuntime::step_sim_batch`:** `crates/allegedly-app/src/lib.rs:73` pushes every tick into `self.footprint.ingest_tick(&tick)` indefinitely and **never** calls `evict_oldest_bars()`, causing unbounded RSS growth during long sessions.
- **Required Fix:**
  - Replace `poll_binary_frame -> Option<Vec<u8>>` with a Tauri v2 `tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>` pushing `InvokeResponseBody::Raw(bytes)` (or `tauri::ipc::Response::new(bytes)`) from a single multiplexed fan-out subscription in `TauriTransportAdapter`.
  - Have `AllegedlyRuntime` emit the full binary frame set (`LIVE_TRADE_BATCH`, `LIVE_BAR_UPDATE_BATCH`, `LIVE_FOOTPRINT_DELTA`, `VOLUME_PROFILE_SOA`, `TPO_PROFILE_BITMASK`, `LIVE_L2_BOOK_BATCH`, `STREAM_STATUS_FRAME`) and bound `self.footprint` via `evict_oldest_bars(max_bars)`.
  - On transport errors, synthesize and dispatch a `STREAM_STATUS_FRAME` (`Disconnected`/`Stale`) instead of silently catching.

---

### `RTSD-03` [Blocker] — Hidden `SV-08` Zero-Float Violation in `live_soak.rs` & Blind Spots in `check-no-floats.sh`
- **Locations:**
  - `Cargo.toml:34` (`serde_json = "1.0"` — missing `features = ["arbitrary_precision"]`)
  - `crates/allegedly-ingest/src/bin/live_soak.rs:34-41, 77-86`
  - `scripts/ci/check-no-floats.sh:1-28`
- **Violation:** `SV-08` ("Zero `f32`/`f64` for prices, quantities, balances, fees, or PnL in Rust financial crates; integer fixed-point `10^9` scaling only").
- **Root Cause & Evidence:**
  1. `crates/allegedly-ingest/src/bin/live_soak.rs:77` parses live Kraken WebSocket v2 trade JSON with `serde_json::from_str::<Value>(&txt)`, and `json_val_to_decimal_str` (`live_soak.rs:34-41`) extracts numeric prices/quantities via `v.as_number().map(ToString::to_string)`.
  2. Because root `Cargo.toml:34` specifies `serde_json = "1.0"` **without `features = ["arbitrary_precision"]`**, `serde_json::Value` deserializes every JSON decimal number (`"price": 95123.45`, `"qty": 0.000123456`) directly into an **IEEE-754 `f64`** (`serde_json::number::N::Float(f64)`), then formats that `f64` back to a string via `ryu` before passing it to `parse_decimal_e9`. Every live Kraken trade in the `UV-06` soak binary therefore round-trips through `f64`.
  3. `scripts/ci/check-no-floats.sh` fails to detect this and has three additional blind spots:
     - **Omitted crates:** Checks only 6 paths (`allegedly-core`, `allegedly-ipc`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-oms`, `allegedly-replay` — wait: `allegedly-app/src` and `apps/desktop/src-tauri/src` are **not scanned**, and all `tests/` directories are skipped).
     - **Regex hole:** Pattern `(^|[^[:alnum:]_])(f32|f64)([^[:alnum:]_]|$)` misses `as_f64()`, `to_f64()`, `from_f64()` because `_` is in `[:alnum:]_`.
     - **Untyped float literals:** Does not detect bare float literals (`1.0`, `0.5`) or `serde_json` without `arbitrary_precision`.
- **Required Fix:**
  - Enable `serde_json = { version = "1.0", features = ["arbitrary_precision"] }` (or parse Kraken JSON with `serde_json::value::RawValue` / custom zero-float deserializer) so raw ASCII decimal tokens pass directly to `parse_decimal_e9` without ever touching `f64`.
  - Expand `scripts/ci/check-no-floats.sh` to cover `crates/allegedly-app/src` and `apps/desktop/src-tauri/src`, flag `as_f64`/`to_f64`/`from_f64`, and verify `arbitrary_precision` (or `RawValue`) when `serde_json` is used in financial crates.

---

### `RTSD-04` [Blocker] — `SV-09` Cross-Speed Replay Determinism Is Verification Theater (Unused `_speed` Parameter) + Non-Streaming `O(N^2)` RAM Architecture
- **Locations:**
  - `crates/allegedly-replay/src/lib.rs:60-74` (`replay_ticks_deterministic`), `115-193` (`ReplaySession`), `285-307` (`sv09_bit_exact_cross_speed_replay_determinism`)
- **Violation:** `SV-09` (bit-exact deterministic replay across `1x`, `5x`, `50x`, `max` speeds) & streaming replay memory budget (`< 64 MiB` RSS for 100M-tick sessions).
- **Root Cause & Evidence:**
  1. **Verification theater:** Look at `crates/allegedly-replay/src/lib.rs:60-74`:
     ```rust
     pub fn replay_ticks_deterministic(
         ticks: &[NormalizedTick],
         bar_interval_ns: i64,
         tick_size_e9: i64,
         _speed: ReplaySpeed,
     ) -> ReplayDigest {
         ...
         for t in ticks { ... }
     }
     ```
     `_speed` is **completely unused**! Both `ReplaySession::verify_cross_speed_determinism` (`lib.rs:161-193`) and unit test `sv09_bit_exact_cross_speed_replay_determinism` (`lib.rs:285-307`) call this exact function four times with different ignored arguments and assert `d1 == d5 == d50 == dmax`. That test is a tautology (`f(x) == f(x)`) and proves zero invariance across chunked stepping (`batch_step` 8 vs 40 vs 400 vs 2,000), bar-seal boundaries, or incremental seek/resume state.
  2. **Non-streaming RAM blowup & `O(N^2)` recompute:** `ReplaySession` loads the entire tick dataset into `ticks: Vec<NormalizedTick>` (`lib.rs:116`, `72 B/tick` → `~7.2 GB` for 100M ticks). Worse, `recompute()` (`lib.rs:147-159`) re-ingests `&self.ticks[..self.cursor]` from tick `0` on every `Play`, `Step`, `Seek`, and `SetSpeed` action — making stepped replay `O(N^2)`.
- **Required Fix:**
  - Drive replay incrementally through a true streaming cursor/chunker (`batch_step()` chunks emitted per tick/frame with incremental state transitions, periodic snapshots for seek, and bounded disk streaming from `.atvault`/Parquet).
  - Have `sv09_bit_exact_cross_speed_replay_determinism` execute the *actual* stepped `ReplaySession` loop at `1x`, `5x`, `50x`, and `max` (each taking a different number of `Step` calls and intermediate snapshot flushes) and assert byte-identical final SHA-256 digests and bar/VWAP states.

---

### `RTSD-05` [Blocker] — `measure-macos-bundle.mjs` Measurement Flaws Invalidate `UV-05` & `SV-01` Closure Claims
- **Locations:**
  - `scripts/ci/measure-macos-bundle.mjs:48-183` (specifically `openSocketsForPids` at `105-118`, cold-start loop at `129-143`, RSS sampling at `145-159`, verdict at `174-183`)
  - `08-Dashboards/Unverified-Claims.md` (`UV-05` row), `README.md`, `99-Meta/Worklog.md`
- **Violation:** `SV-01` (verifiable zero unsolicited outbound network calls on cold start), `UV-05` (real packaged bundle cold start `< 1.5 s`, idle RSS `< 300 MiB`, `< 45 MB` installer).
- **Root Cause & Evidence:**
  1. **Invalid `SV-01` zero-network proof:** `measure-macos-bundle.mjs:158` invokes `lsof -nP -i` **exactly once, ~1.5 seconds after spawning the app** (`setTimeout(1500)`). Any outbound DNS query, update check, telemetry POST, or TLS handshake that completes or fails during the first 1,500 ms has already closed its socket and is **100% invisible** to a single delayed `lsof` snapshot.
  2. **Cold-start readiness measures OS process spawn, not UI readiness:** Lines `129-143` stop the timer (`readyMs`) the moment *any* new `com.apple.WebKit.WebContent` PID appears in `ps -eo pid,ppid,rss,comm`. This neither verifies that the HTML/JS bundle loaded, hydrated, or painted first frame, nor isolates the PID to `Allegedly`'s process tree (because `WebKit.WebContent` is spawned by `launchd` with `PPID=1`, any unrelated macOS app like Safari, Mail, or QuickLook spawning a WebKit helper during the window contaminates both `readyMs` and RSS).
  3. **Missing crash/exit-code check:** The script never checks `child.exitCode === null` before declaring PASS. If `Allegedly` crashes after spawning a WebKit helper, the harness can still observe `maxRssMb > 0 && maxRssMb < 300` and report `PASS`.
  4. **Hand-assembled `.tar.gz` instead of `tauri build` `.dmg`:** Lines `48-96` manually `mkdir` a `.app` bundle with a handwritten `Info.plist`, raw binary, and `icon.png` (not `.icns`), then `tar -czf` it. While `Worklog.md` notes this is a `.tar.gz`, `UV-05` requires measuring the actual distributable Tauri bundle (`.dmg`/`.app` built by `tauri build`).
- **Required Fix:**
  - Emit a deterministic readiness sentinel from the frontend *after* React mount + first `requestAnimationFrame` paint (e.g., via a Tauri command `report_ui_ready` writing a timestamp/stdout marker when an env flag like `ALLEGEDLY_BENCH_READY=1` is set), assert `child.exitCode === null` throughout the run, and track only PIDs associated with the launched app.
  - Prove `SV-01` zero-network across the entire boot window using continuous packet/socket capture (e.g., `nettop`, `pf`/`tcpdump` loopback+external filter, or a `Proxy`/sandboxed network namespace denying outbound traffic and logging any attempt) rather than a single post-hoc `lsof` snapshot.
  - Build and measure a real `tauri build` `.app`/`.dmg` artifact.

---

## 4. Majors (High-Severity Architectural, Security, Correctness & Governance Defects)

### `RTSD-06` [Major] — `parse_decimal_e9` Single-Message CPU-Hang DoS & Scientific-Notation Precision Bug
- **Location:** `crates/allegedly-core/src/fixed.rs:64-142` (specifically lines `107-113` and `123-139`)
- **Root Cause & Exploit:**
  1. **2-Billion-Iteration CPU DoS:** When `digits_val == 0` and a positive exponent is supplied (e.g., `"0e2000000000"` or `"0.0e999999999"`), `shift = 9 + exp = 2_000_000_009`. Line `129` executes:
     ```rust
     for _ in 0..shift {
         v = v.checked_mul(10).ok_or(FixedPointError::Overflow)?;
     }
     ```
     Because `0_i128.checked_mul(10)` returns `Some(0)` forever and never overflows, a single malformed exchange/import string hangs the ingest thread for seconds/minutes on CPU. There is no early `if digits_val == 0 { return Ok(0); }` check.
  2. **Silent zeroing on small mantissa + positive exponent:** Lines `107-113` drop all fractional digits after the 18th fractional digit *before* applying `exp`. Input `"0.0000000000000000005e20"` mathematically equals `50.0` (`50_000_000_000`), but is silently truncated to `0`. Conversely, strings with >38 digits and negative exponent overflow `i128` prematurely instead of rounding/scaling.
- **Required Fix:** Return `Ok(0)` immediately when all significant digits are zero; strip leading/trailing zeros before exponent adjustment; reject exponents outside a sane bound (e.g., `|exp| > 38`) in `O(1)` time without unbounded loops. Add unit tests for `"0e2000000000"` and `"0.0000000000000000005e20"`.

---

### `RTSD-07` [Major] — Luau Global 64 MiB Study Pool 4× Bypass, Stale Interrupt on Error, Non-Deterministic `math.random` & Missing Flat `ByteView` ABI
- **Locations:**
  - `crates/allegedly-studies/src/lib.rs:54-69` (`evaluate_study_request`)
  - `crates/allegedly-studies/src/luau_sandbox.rs:78-132` (`LuauStudyRunner`)
- **Violation:** `ADR-0005` / `SV-13` (strict `<= 64 MiB` global study memory pool, deterministic sandbox, flat SoA `ByteView`/Luau `buffer` ABI).
- **Root Cause & Evidence:**
  1. **4× Global Cap Bypass:** `evaluate_study_request` (`lib.rs:56-59`) creates each VM with `PER_STUDY_DEFAULT_CAP_BYTES = 8 MiB` (`lua.set_memory_limit(8 MiB)`), but reserves only **`2 * 1024 * 1024` (2 MiB)** in `GlobalStudyMemoryPool`. Up to 32 concurrent studies can pass the 64 MiB pool gate while actually allocating **256 MiB** (`32 × 8 MiB`) across VMs.
  2. **Stale interrupt hook on error:** In `luau_sandbox.rs:116`, `let fn_val: Function = self.lua.load(script).eval()?;` returns early via `?` before `self.lua.remove_interrupt()` at line `125` runs, leaving an exhausted interrupt hook attached if a runner is reused.
  3. **Non-deterministic `math.random`:** `sandbox(true)` enables Luau's standard `math` library including unseeded `math.random`, breaking `SV-09` deterministic replay for user Luau studies.
  4. **Per-bar Lua table copy instead of flat `ByteView`/buffer ABI:** Lines `111-114` allocate a 1-indexed Lua `Table` copying every element of `closes` on every call instead of `ADR-0005`'s zero-copy flat SoA `ByteView`/Luau `buffer`.
  5. **Always-zero UI pool telemetry:** Because `eval_study_series` releases its `MemoryReservation` guard before returning (`lib.rs:59-67`), `memory_pool_reserved_bytes` in `StudyRunResponse` is always `0`, making the UI's pool indicator misleading. Also, `App.tsx:196-203` omits `buy_volumes`/`sell_volumes` when invoking `cvd` or `footprint_delta`, causing both built-in studies to return empty `[]` from the UI.
- **Required Fix:** Reserve the exact `vm_cap_bytes` (or set `lua.set_memory_limit(reserve_bytes)`) in `GlobalStudyMemoryPool`; clean up `remove_interrupt()` via an RAII drop guard; remove or deterministically seed `math.random`; adopt Luau `buffer` / flat `ByteView` per `ADR-0005`; report peak/active pool reservation accurately; pass `buy_volumes`/`sell_volumes` from `App.tsx`.

---

### `RTSD-08` [Major] — Chart WebGL2 Overlay Violates `ADR-0004` / `S01` (`ISeriesPrimitive` Sync Lock) + GPU Buffer Leak + `$45,000` Seed Jump
- **Locations:**
  - `apps/desktop/src/panels/chart-panel.tsx:163, 467-478, 520, 571-583`
  - `apps/desktop/src/render/webgl2-orderflow-overlay.ts:115, 275-284`
- **Violation:** `ADR-0004` & Spike `S01` (mandates Lightweight Charts v5 `ISeriesPrimitive` canvas pane integration with `0.000 CSS px` pan/zoom drag drift).
- **Root Cause & Evidence:**
  1. **Sibling `<canvas>` anti-pattern:** `chart-panel.tsx:467-478, 571-583` mounts detached sibling `<canvas>` elements on top of the Lightweight Charts container and schedules repaints asynchronously via `subscribeVisibleLogicalRangeChange` + `requestAnimationFrame`. That is the exact architecture Spike `S01` rejected after measuring `54–557 CSS px` pan/zoom drag drift.
  2. **WebGL2 GPU buffer leak:** `webgl2-orderflow-overlay.ts:115` allocates `quadBuf = gl.createBuffer()` in `initGl()`, binds it, and never stores a reference to it; `dispose()` (`lines 275-284`) deletes only `instanceBuf` and `program`, leaking a GPU buffer on every symbol/timeframe switch or panel remount.
  3. **`$45,000` chart scale discontinuity:** `chart-panel.tsx:163` seeds `BTC/USD` initial candles at `$50,000`, while `OfflineSimTransportAdapter` (`offline-sim-adapter.ts:122`) starts `BTC/USD` at `$95,000`, causing an instant vertical cliff on the first live bar update.
  4. **Uncaught `BigInt` `RangeError`:** `chart-panel.tsx:520` executes `BigInt(Math.round(Number(rawPrice) / tickFloat))` without `Number.isFinite` guarding, crashing the chart event handler on non-finite coordinate conversions.
- **Required Fix:** Attach orderflow/drawing overlays through Lightweight Charts v5 `ISeriesPrimitive` (`paneViews` / `priceAxisViews`), store and `gl.deleteBuffer(this.quadBuf)` in `dispose()`, align seed price with sim/live instrument price, and guard `BigInt(...)` with `Number.isFinite(...)`.

---

### `RTSD-09` [Major] — `allegedly-oms` Swallows SQLite WAL Write Errors & Diverges Kill-Switch In-Memory vs. WAL State
- **Locations:**
  - `crates/allegedly-oms/src/lib.rs:24, 69, 74-90`
  - `crates/allegedly-oms/src/journal.rs:90-108`
- **Violation:** `SV-03` (crash-safe SQLite WAL journal), `SV-05` (fail-safe Kill-Switch & live-arming guards).
- **Root Cause & Evidence:**
  1. **Silent WAL persistence failure:** `LocalPaperOms::submit_order` (`lib.rs:69`) executes `let _ = self.journal.upsert_order(&rec);` — silently discarding disk-full, lock, or I/O errors while returning `Ok(rec)` to the caller!
  2. **Pre- vs. post-crash Kill-Switch state divergence:** `trigger_kill_switch` (`lib.rs:74-90`) persists `PendingCancel` to SQLite (`journal.rs:95`), then sets in-memory order status to `Canceled` (`lib.rs:84`). If the process crashes immediately afterward, recovery reloads `PendingCancel` instead of `Canceled`. Furthermore, `trigger_kill_switch` does not flatten `positions_e9`, and `submit_order` has no duplicate `client_order_id` idempotency check.
  3. **Public mutable `live_armed` flag:** `LocalPaperOms::live_armed` (`lib.rs:24`) is `pub live_armed: bool`, allowing any caller to bypass constructor/config invariants directly (`oms.live_armed = true`).
- **Required Fix:** Propagate `Result<_, OmsError>` on every WAL write (write-ahead *before* mutating in-memory state); unify Kill-Switch state transition in a single atomic transaction (`PendingCancel` → `Canceled` in paper mode, with explicit flatten semantics); make `live_armed` private behind an audited accessor; enforce `client_order_id` uniqueness.

---

### `RTSD-10` [Major] — Ingest `ws_client.rs` & `live_soak.rs` Wire-Format Mismatches, Silent Error/Drop Swallowing & Unfailing CI Exit Code
- **Locations:**
  - `crates/allegedly-ingest/src/ws_client.rs:41-109`
  - `crates/allegedly-ingest/src/bin/live_soak.rs:146-307`
  - `.github/workflows/ci-pre-release-soak.yml:22-50`
- **Violation:** `SV-04` (fail-closed `BookState::Stale` on sequence gaps / saturation), `UV-06` (30-minute live Kraken v2 `trade` + `book` `depth=100` CRC32 & Coinbase soak).
- **Root Cause & Evidence:**
  1. **`ws_client.rs` cannot talk to real Kraken v2 or Coinbase Advanced Trade:** `KrakenItem` (`ws_client.rs:41-47`) expects a synthetic string-tuple format rather than Kraken WS v2's object schema (`{"channel":"trade","data":[{"symbol":...,"price":...}]}`), `CoinbaseEnvelope` (`ws_client.rs:49-57`) expects flat top-level fields rather than `events[].trades[]`, and neither function sends any WebSocket subscribe frame.
  2. **Silent drops & fake fallback timestamps:** `ws_client.rs:84, 104` execute `let _ = producer.push(tick);` — silently dropping ticks when the SPSC ring is full without routing through `ProviderIngress` or marking `BookState::Stale`. Parse errors are silently ignored, and invalid timestamps silently fall back to a hardcoded constant `1_732_500_000_000_000_000` (`ws_client.rs:64`).
  3. **`live_soak.rs` ALWAYS exits `0`:** Lines `289-307` print a JSON report and return `Ok(())` unconditionally — even when `trades == 0`, the WebSocket fails to connect, `parse_errors > 0`, `seq_gaps > 0`, or `storage_drops > 0`! Thus `.github/workflows/ci-pre-release-soak.yml` can **never** catch a soak regression. Additionally, `live_soak.rs` ignores `producer.push(tick)` ring-full drops, does not subscribe to Kraken `book` (`depth=100`) for live CRC32 verification (`UV-06`), and has no reconnect loop.
- **Required Fix:** Unify Kraken v2 (`trade` + `book` `depth=100` with CRC32) and Coinbase Advanced Trade parsers with real protocol subscribe/reconnect flows; surface SPSC saturation into `BookState::Stale` and `storage_drops`; reject invalid timestamps instead of fabricating constants; exit non-zero in `live_soak.rs` when `trades == 0`, `parse_errors > 0`, `storage_drops > 0`, or unrecovered `seq_gaps > 0`.

---

### `RTSD-11` [Major] — Missing `cargo-deny` CI Gate & Incomplete Supply-Chain Enforcement (`check-npm-policy.mjs`)
- **Locations:**
  - `.github/workflows/ci-pr-fast.yml:1-87`
  - `deny.toml`
  - `scripts/ci/check-npm-policy.mjs:1-60`
- **Violation:** `ADR-0006` / `SC-02` / `Plan-of-Record.md` (automated license/advisory/ban enforcement in PR CI).
- **Root Cause & Evidence:**
  1. `deny.toml` is well-configured (banning `openssl-sys`, `nautilus*`, `ibapi`, GPL/AGPL), yet `.github/workflows/ci-pr-fast.yml` **never invokes `cargo deny check`** (and `cargo-deny` is not installed on the local M2 audit host).
  2. `scripts/ci/check-npm-policy.mjs` only scans direct `package.json` dependencies (never `pnpm-lock.yaml`, so a transitive banned package like `dockview-enterprise` would slip through) and only enforces exact pins for `@ui-sdk/core` and `@ui-sdk/react`, omitting exact-pin verification for `dockview` (`8.9.1`) and `lightweight-charts` (`5.3.0`).
- **Required Fix:** Add `cargo deny check advisories bans licenses sources` to `.github/workflows/ci-pr-fast.yml`; extend `check-npm-policy.mjs` to scan `pnpm-lock.yaml` for banned patterns (`enterprise`, `dockview-enterprise`, etc.) and verify exact version pins for all locked core UI dependencies.

---

### `RTSD-12` [Major] — Storage Crash-Recovery, OOM & Panic Hazards (`.atvault` & Parquet)
- **Locations:**
  - `crates/allegedly-storage/src/atvault.rs:42-115`
  - `crates/allegedly-storage/src/parquet_vault.rs:44-131`
- **Violation:** `SV-03` (crash-safe storage), `SV-14` (no panics on untrusted/corrupted input).
- **Root Cause & Evidence:**
  1. **`.atvault` header unauthenticated & OOM abort vector:** `atvault.rs:78-115` computes CRC32 over `comp_slice` only, **not** over the 8-byte `(count, comp_len)` header. A single flipped bit in `count` causes `zstd::bulk::decompress(comp_slice, count * 72)` (`atvault.rs:94`) to request gigabytes of allocation and abort the process. Additionally, `path.exists()` before `OpenOptions::append` (`atvault.rs:51`) is a TOCTOU race, and trailing bytes from `as_chunks::<72>()` (`atvault.rs:101`) are silently discarded without error.
  2. **Parquet 11 unchecked `.unwrap()` panics + missing `sync_all()` + no row-group pruning:** `parquet_vault.rs:80-131` performs 11 `.unwrap()` calls on Arrow column `downcast_ref`s — opening a Parquet file with a mismatched column type crashes the desktop app. `write_parquet_atomic` (`parquet_vault.rs:59-64`) renames the temp file without calling `file.sync_all()` (losing crash durability on power loss), and `read_parquet_range` scans all row groups without min/max predicate pruning.
- **Required Fix:** Authenticate `(count, comp_len)` in the `.atvault` CRC32 and cap `count` per block before decompressing; reject non-zero chunk remainders; replace all `.unwrap()` in `parquet_vault.rs` with typed `StorageError::SchemaMismatch`; call `sync_all()` before atomic rename; implement Parquet row-group statistics pruning on `ts_exchange_ns`.

---

### `RTSD-13` [Major] — `UV-04` Dashboard Overclaim (`08-Dashboards/Unverified-Claims.md` & `README.md`)
- **Locations:**
  - `08-Dashboards/Unverified-Claims.md` (`UV-04` marked `VERIFIED (CLOSED)`)
  - `crates/allegedly-orderflow/tests/slab_arena_10chart_rss.rs:1-60`
  - `README.md`
- **Violation:** `AGENTS.md` honesty rule ("Never claim PASS without empirical proof; keep unverified items open").
- **Root Cause & Evidence:**
  - While `Unverified-Claims.md` honestly keeps `UV-03`, `UV-05` (Windows), `UV-02` (Intel macOS), `UV-06` (full 30m & `.dbn.zst`), and `UV-07`–`UV-10` open/partial, it marks **`UV-04` `VERIFIED (CLOSED)`** citing "live RSS footprint `< 60 MiB` (`28.16 MiB`)".
  - Inspecting `slab_arena_10chart_rss.rs` reveals it does **not** measure live OS RSS (`mach_task_basic_info` / `getrusage`) and does **not** run inside a 10-chart UI runtime; it sums a struct-field formula (`estimated_heap_bytes()`) **after** explicitly calling `shrink_to_fit()`, excluding allocator fragmentation, HashMap buckets, WebGL2 textures, Lightweight Charts buffers, and IPC frames.
- **Required Fix:** Downgrade `UV-04` to `PARTIAL (ARENA UNIT BENCH ONLY)` until real OS process RSS (including allocator + 10 mounted charts) is measured without manual `shrink_to_fit()`.

---

## 5. Minor Findings (Edge Cases, Validation & UI Defects)

### `RTSD-14` [Minor] — IPC Decoder Validation Gaps & Unbounded `FrameBatcher`
- **Locations:** `crates/allegedly-ipc/src/framing.rs:236, 322`; `crates/allegedly-ipc/src/batcher.rs:23`; `packages/ipc-client/src/decoder.ts:180, 276, 315, 340`
- **Findings:**
  - Rust `decode_live_trade_batch` (`framing.rs:236`) and `decode_stream_status` (`framing.rs:322`) never assert `hdr.frame_type` matches the expected frame tag (or `record_count == 1` for status frames).
  - TypeScript `decodeFrameHeader` (`decoder.ts:180`) does not validate `byteOffset >= 0` or `FrameType` enum membership; `decodeLiveL2BookBatch` does not check `bookHeader.levelCount === header.recordCount`; `decodeTpoProfileBitmask` does not verify `wordsPerRow === 2`; `decodeStreamStatusFrame` does not verify `recordCount === 1`.
  - `FrameBatcher::pending_trades` (`batcher.rs:23`) grows unboundedly if a consumer stalls without flushing.

### `RTSD-15` [Minor] — Orderflow `evict_oldest_bars(0)` Panic & Out-of-Order Tick Corruption
- **Location:** `crates/allegedly-orderflow/src/footprint.rs:52-75, 145-160`
- **Findings:**
  - Calling `evict_oldest_bars(0)` (`footprint.rs:151`) computes `remove_count = self.bars.len()` and indexes `self.bars[remove_count]`, causing an immediate index-out-of-bounds panic.
  - In `ingest_tick` (`footprint.rs:52-65`), an out-of-order tick (`bucket < cur`) overwrites `active_bar_ts_ns` backwards without sealing the current bar or rejecting late ticks, corrupting subsequent bar-seal transitions.

### `RTSD-16` [Minor] — `ConfigCascade` Safety-Lock Bypass & TOML Newline Injection
- **Location:** `crates/allegedly-core/src/config.rs:76-85, 138-152, 195-215`
- **Findings:**
  - Public `set_instance_override` (`config.rs:138`) does not call `is_safety_locked_key` (only `set_workspace_override` does).
  - `execution.mode` is missing from `is_safety_locked_key` (`config.rs:76-85`), permitting a workspace override to flip execution mode from `"paper"` to `"live"` without triggering the safety lock.
  - `export_atworkspace_toml` (`config.rs:195-215`) escapes `"` but not `\n` or `\r`, allowing TOML section/key injection via workspace names or values.

### `RTSD-17` [Minor] — UI / Chrome / Drawing Engine Defects
- **Locations:**
  - `apps/desktop/src/panels/paper-oms-panel.tsx:194, 209, 326` & `packages/ipc-client/src/decoder.ts:47-53`
  - `packages/ui-chrome/src/status-bar.tsx:31`, `workspace-host.tsx:76`, `chrome-toolbar.tsx:48-49`
  - `apps/desktop/src/drawings/drawing-engine.ts:172, 232, 250`
  - `apps/desktop/src/App.tsx:148`, `apps/desktop/src/a11y.test.tsx:1-75`
- **Findings:**
  1. **Provenance Tier off-by-one contradiction on the same screen:** `paper-oms-panel.tsx:209` renders `T0..T4` while `PROVENANCE_TIER_LABELS` (`decoder.ts:47-53`) renders `T1..T5`.
  2. **Dangerous green status styling:** `status-bar.tsx:31` and `paper-oms-panel.tsx:194` render `BOOK: STALE`, `DISCONNECTED`, and `HALTED` in bright emerald green (`text-emerald-400` / `bg-emerald-400`) instead of warning/error color tokens.
  3. **Dockview layout teardown on symbol change:** `workspace-host.tsx:76` includes `chartPanel.title` (which embeds `${symbol} · ${timeframe}`) in `useEffect` dependencies, destroying and recreating the entire Dockview layout on every symbol or timeframe switch.
  4. **Dead toolbar controls & hardcoded limit price:** `chrome-toolbar.tsx:48-49` `compactDensity` and `showProvenanceOverlay` toggles mutate local unused state; `paper-oms-panel.tsx:326` Override only handles 2 hardcoded keys; `App.tsx:148` computes limit price as `tick * 190_000n` (`$19,000` for ETH, `$1,900` for SOL).
  5. **Drawing engine undo/redo & TOML parser bugs:** `drawing-engine.ts:172` `redo()` of `clear(symbol)` wipes *all* symbols (`this.drawings = []`); `loadFromAtAnalysisToml` resets `idCounter = parsed.length` (causing duplicate IDs after deletions); `matchTomlStr` does not unescape `\"` or `\\`.
  6. **Limited `UV-01` a11y test coverage:** `a11y.test.tsx` runs in `jsdom` with `color-contrast` disabled and never tests open Dialogs, Select popovers, or non-default tabs (and `packages/ui-chrome` has 0 test files).

---

## 6. Unverified Claims & Honest-Status Audit (`UV-01`–`UV-10`)

| ID | Dashboard Claim (`08-Dashboards/Unverified-Claims.md`) | Independent Red-Team Assessment |
| :--- | :--- | :--- |
| `UV-01` | Partial / `jsdom` axe-core pass (real browser contrast open) | **Honestly tracked** (caveat: no open modals/selects/tabs tested yet; `RTSD-17`) |
| `UV-02` | Apple M2 verified (`4.024 ms` reproduced); Intel macOS open | **Verified on M2**, honestly open on Intel macOS |
| `UV-03` | Open (Windows 11 / WebView2 hardware pending) | **Honestly open** |
| `UV-04` | Marked **`VERIFIED (CLOSED)`** (`28.16 MiB`) | **OVERCLAIMED** — struct-size estimate post-`shrink_to_fit()`, not OS RSS (`RTSD-13`) |
| `UV-05` | Apple M2 marked verified; Windows open | **INVALIDATED on M2** — broken `WebKit.WebContent` timing, no crash check, post-hoc `lsof`, hand-tarred `.tar.gz` (`RTSD-05`) |
| `UV-06` | Partial (60 s Kraken/Coinbase trade soak; 30m + `.dbn.zst` open) | **Compromised** — `live_soak.rs` uses `f64` JSON parsing (`RTSD-03`), always exits `0`, skips `book` `depth=100` CRC32 (`RTSD-10`) |
| `UV-07`–`UV-10` | Open / deferred to post-v0.1 | **Honestly open** |

### What Remains Unverified in This Audit
- **Windows 11 / WebView2 (`UV-03`, `UV-05` Windows)** and **Intel macOS (`UV-02` Intel)**: hardware not present.
- **`cargo-deny` execution**: binary not installed on host and not wired into CI.
- **Interactive GUI launch of `Allegedly.app`**: static binary artifact inspection + code audit performed; live visual launch / 30-minute live exchange soak not executed during this read-only audit.

---

## 7. Gate Criteria to Upgrade Verdict from `FAIL` → `PASS`

All 5 Blockers (`RTSD-01`–`RTSD-05`) and high-impact Majors (`RTSD-06`–`RTSD-13`) must be resolved and re-verified:
1. **`RTSD-01`:** `apps/desktop/src-tauri/src/main.rs` delegates OMS/Risk/WAL to `allegedly-oms` + `allegedly-storage` via `AllegedlyRuntime`, adds `#![forbid(unsafe_code)]`, and runs in `ci-pr-fast.yml`.
2. **`RTSD-02`:** Native Tauri binary IPC uses raw binary `Channel`/`Response` (`ADR-0002`), streams all 7 frame types (`LIVE_TRADE_BATCH`, `LIVE_BAR_UPDATE_BATCH`, `LIVE_FOOTPRINT_DELTA`, `VOLUME_PROFILE_SOA`, `TPO_PROFILE_BITMASK`, `LIVE_L2_BOOK_BATCH`, `STREAM_STATUS_FRAME`), and bounds `FootprintSlabArena` bar history.
3. **`RTSD-03`:** Zero `f64` round-tripping in `live_soak.rs` (`serde_json` `arbitrary_precision` or `RawValue`) and hardened `check-no-floats.sh` covering all Rust financial/shell crates.
4. **`RTSD-04`:** True stepped/chunked streaming replay tested across `1x`/`5x`/`50x`/`max` (removing unused `_speed` tautology).
5. **`RTSD-05`:** `measure-macos-bundle.mjs` measures genuine frontend painted-ready signal, asserts non-crash exit state, proves `SV-01` continuously across boot (not single delayed `lsof`), and packages via `tauri build`.
6. **`RTSD-06`–`RTSD-13`:** Fix `parse_decimal_e9` DoS, Luau 4× pool cap bypass & `ByteView`/buffer ABI, `ISeriesPrimitive` sync & GPU buffer leak, OMS WAL error propagation & Kill-Switch consistency, `live_soak.rs` non-zero exit & `book` CRC32, `cargo-deny` CI gate, storage CRC/unwrap/fsync hardening, and downgrade `UV-04` until real OS RSS is measured.
