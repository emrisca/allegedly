---
title: "Red-Team Audit: Apple M2 Stage D Implementation (v0.1 Slices 1–5)"
type: review
status: complete
verdict: FAIL
reviewer: Allegedly Red Team
audited_commit: 809728e3bccd60146476d42fca32dbd7829195d2
initial_commit: 6726fbe4ed5b1ddda30fa85918dfe870e69d0c4c
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

> **Cycle 2 Re-Verification Verdict (Commit `809728e`):** **`FAIL`** (`16/17` original findings **CLOSED**; **`RTSD-11` REMAINS OPEN** + **1 new CI Blocker `RTSD-18`** proven live on GitHub Actions run `45668778630` where **5 of 6 PR CI jobs FAIL**)
> **Cycle 1 Initial Verdict (Commit `6726fbe`):** **`FAIL`** (`5` Blockers, `8` Majors, `4` Minor clusters)
> **Audited Commit:** `809728e3bccd60146476d42fca32dbd7829195d2` (`fix(stage-d): remediate all 17 Red-Team-StageD-M2 findings (RTSD-01..RTSD-17)`)

---

## 1. Cycle 2 Re-Verification Executive Summary (Commit `809728e`)

Every single finding from Cycle 1 (`RTSD-01` through `RTSD-17`) was independently audited at the source-code level and empirically tested against commit `809728e` with `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` (`0` `target/` directories inside the vault) plus live GitHub Actions inspection (`gh run view 45668778630`).

### What Passed (16/17 Original Findings Genuinely Closed)
The engineering remediation across the Rust workspace, Tauri shell, and TypeScript frontend is substantial and verified:
- All **5 original Blockers (`RTSD-01`–`RTSD-05`)** are fixed in the codebase and verified locally on Apple M2 (real `LocalPaperOms` + SQLite WAL + `RiskGate` in `src-tauri`, raw binary `tauri::ipc::Response` emitting all 7 `ALG2 v1` frame types over a single multiplexed pump, `serde_json` `arbitrary_precision` + hardened float guard, genuine stepped `O(batch)` bounded-bar streaming `SV-09` replay, and hardened `sandbox-exec` + double-rAF `report_ui_ready` bundle harness).
- **7 of 8 Majors (`RTSD-06`–`RTSD-10`, `RTSD-12`–`RTSD-13`)** and **all 4 Minor clusters (`RTSD-14`–`RTSD-17`)** are cleanly fixed and backed by passing unit/integration/a11y tests (`38` Rust tests + `1` `src-tauri` test + `24` TS/Vitest tests).

### Why Verdict Remains `FAIL` (Live CI Gate Failure on `809728e`)
Inspecting live GitHub Actions run **`45668778630`** (`CI PR Fast (macOS + Windows)` triggered by pushing `809728e` to `main`) proved that **5 of 6 CI jobs FAIL**, keeping **`RTSD-11` OPEN** and introducing a new CI Blocker **`RTSD-18`**:

| Finding | Severity | Status on `809728e` | Live Evidence |
| :--- | :---: | :---: | :--- |
| **`RTSD-11`** | **Major** | **OPEN (FAILED IN CI)** | 1) `cargo-deny` job `139398049542` fails **`bans FAILED`** (`error[wildcard]` on all 9 internal workspace crates because `deny.toml:23` has `wildcards = "deny"` without `allow-wildcard-paths = true`).<br>2) `Frontend & UV-01 A11y (windows-latest)` job `139398049005` fails `check-npm-policy.mjs` with `FAIL [SC-02]: pnpm-lock.yaml is missing at repo root` because `scripts/ci/check-npm-policy.mjs:6` uses `new URL(import.meta.url).pathname` (broken `/D:/...` path on Windows) instead of `fileURLToPath(import.meta.url)`. |
| **`RTSD-18`** | **Blocker (New)** | **OPEN (FAILED IN CI)** | 1) `Rust Workspace & Tauri Shell (windows-latest)` job `139398049721` fails `Clippy`: `apps/desktop/src-tauri/icons/icon.ico not found; required for generating a Windows Resource file during tauri-build`.<br>2) **Latent compile panic on clean checkouts (both Windows & macOS):** `apps/desktop/src-tauri/Cargo.toml:20` sets `default = ["custom-protocol"]` while `apps/desktop/dist/` is gitignored (`.gitignore:4`) and `.github/workflows/ci-pr-fast.yml:32-57` runs `rust-workspace` without building `apps/desktop/dist` (or passing `--no-default-features`) — causing `tauri-codegen-2.7.6/src/context.rs:185-191` to panic at compile time once `icon.ico` is added.<br>3) Both `macos-14` jobs (`139398049456`, `139398049499`) fail in 1 s: `The configuration 'macos-14-arm64-us-default' is not supported`. |

---

## 2. Finding-by-Finding Re-Verification Matrix (`RTSD-01`–`RTSD-18`)

| ID | Orig. Sev | Cycle 2 Status | Exact Verification Evidence on Commit `809728e` |
| :--- | :---: | :---: | :--- |
| **`RTSD-01`** | Blocker | **CLOSED** *(CI execution tracked in `RTSD-18`)* | `apps/desktop/src-tauri/src/main.rs:1` adds `#![forbid(unsafe_code)]`; `DesktopState` delegates `get_paper_account`, `submit_paper_order`, and `kill_switch_cancel_all` to `AllegedlyRuntime` → `LocalPaperOms` + SQLite WAL (`paper_oms.sqlite` in OS app-data / `ALLEGEDLY_DATA_DIR`) + `RiskGate` + per-symbol mark pricing + strict enum/positive validation (`crates/allegedly-app/src/lib.rs:145-398`). `tauri_desktop_state_enforces_sv01_and_wal_persistence` and `rtsd01_runtime_oms_wal_persistence_risk_gate_and_symbol_mark_pricing` PASS. |
| **`RTSD-02`** | Blocker | **CLOSED** | `apps/desktop/src-tauri/src/main.rs:175-182` replaces JSON `Option<Vec<u8>>` with raw binary `tauri::ipc::Response::new(packed)` (`poll_binary_frames`). `crates/allegedly-app/src/lib.rs:413-539` (`step_sim_frames`) emits all 7 canonical `ALG2 v1` frame types and bounds `FootprintSlabArena` at `MAX_LIVE_FOOTPRINT_BARS = 5_000`. `packages/ipc-client/src/tauri-adapter.ts:24-160` adds strict `unpackRawFrameBatch`, single multiplexed `StreamPump` per `streamId`, and fail-closed `BookState.Disconnected` status emission on error. Verified by Rust `sv01_offline_default_boot_invariants_and_full_7_frame_pipeline` + 2 new Vitest tests. |
| **`RTSD-03`** | Blocker | **CLOSED** | Root `Cargo.toml:45` and `apps/desktop/src-tauri/Cargo.toml:15` enable `serde_json = { version = "1.0", features = ["arbitrary_precision", "raw_value"] }`. `crates/allegedly-ingest/src/ws_client.rs:48-55` (`json_exact_decimal_str`) & `live_soak.rs` preserve raw decimal strings without `f64`. `scripts/ci/check-no-floats.sh` scans all 9 financial/app/shell crates, catches `as_f64`/`to_f64`/`from_f64`/`_f32`/`_f64`, and verifies `arbitrary_precision` (PASS locally & in CI `Static Policy Guards`). |
| **`RTSD-04`** | Blocker | **CLOSED** | Removed unused `_speed` tautology in `crates/allegedly-replay/src/lib.rs`. Implemented `O(batch)` `IncrementalReplayEngine` with bounded `REPLAY_ARENA_MAX_BARS = 512` eviction, non-destructive `snapshot_digest()`, and disk-streaming `ReplaySource::AtVaultFile`. `sv09_bit_exact_cross_speed_stepped_replay_determinism` runs genuine stepped loops across `1x`/`5x`/`50x`/`max` (`steps1 > steps5 > steps50 > stepsmax`, bit-exact SHA-256) and `atvault_streaming_replay_session_preserves_sha256` passes. |
| **`RTSD-05`** | Blocker | **CLOSED** *(harness + artifacts verified; GUI launch not re-run in read-only audit)* | `apps/desktop/src-tauri/Cargo.toml:20` enables `default = ["custom-protocol"]` so release binary embeds `apps/desktop/dist`. `scripts/ci/measure-macos-bundle.mjs` packages `Allegedly.app` (`15M` verified in cache) + `Allegedly_0.1.0_aarch64.dmg` (`5.3M` via `hdiutil UDZO`), runs 3 isolated launches under macOS kernel `sandbox-exec` `(deny network-outbound (remote ip))`, waits for real React double-rAF `ALLEGEDLY_UI_READY_MS` via `report_ui_ready`, asserts `aliveAfterSettle` (`child.exitCode === null`), checks `paper_oms.sqlite` WAL creation, audits `lsof -nP -i` across main + `launchd`-parented WebKit XPC helpers, and enforces `< 300 MB` idle RAM. *(Note: minor packaging caveat remains — `.app` uses `mkdir`+`hdiutil` + `icon.png` rather than `tauri build` CLI + `.icns`.)* |
| **`RTSD-06`** | Major | **CLOSED** | `crates/allegedly-core/src/fixed.rs:76-175` returns `Ok(0)` immediately for zero mantissas (`"0e2000000000"` in `O(input.len())`), checks `scaled_msb_exp > 18` → `Overflow` / `< 0` → `Ok(0)`, bounds trailing scaling to `<= 18` multiplies (`O(1)`), and parses `"0.0000000000000000005e20"` → `50_000_000_000`. `rtsd06_parse_decimal_e9_dos_and_scientific_precision` PASS. |
| **`RTSD-07`** | Major | **CLOSED** | `crates/allegedly-studies/src/{luau_sandbox.rs,lib.rs}` enforces 1:1 `effective_cap` between `GlobalStudyMemoryPool::try_reserve` and `lua.set_memory_limit` (eliminating 4× bypass), adds RAII `InterruptGuard`, strips `math.random`/`math.randomseed` prior to `sandbox(true)`, exposes zero-copy `FloatSeriesView(Arc<[f64]>)` (`close`) + packed LE `close_bytes`, tracks `peak_reserved_bytes`, and `App.tsx` passes `buy_volumes`/`sell_volumes` for `cvd`/`footprint_delta`. Test PASS. |
| **`RTSD-08`** | Major | **CLOSED** | `apps/desktop/src/panels/chart-panel.tsx:354-480` replaces sibling canvases with synchronous Lightweight Charts v5 `OrderflowAndDrawingsPrimitive implements ISeriesPrimitive<Time>` (`attachPrimitive`/`detachPrimitive`). `webgl2-orderflow-overlay.ts:375-384` stores and deletes `quadBuf` in `dispose()`. BTC seed aligned to `$95,000`; `Number.isFinite(scaled)` guards `BigInt(Math.round(...))`. |
| **`RTSD-09`** | Major | **CLOSED** | `crates/allegedly-oms/src/{lib.rs,journal.rs}` makes `live_armed` private, rejects duplicate `client_order_id`, commits orders + `positions` table atomically in SQLite WAL *before* RAM mutation (`commit_order_and_position`, propagating `OmsError::Journal`), and unifies Kill-Switch (`PaperSim`: `Canceled` + flatten positions in WAL & RAM; `BrokerLive`: `PendingCancel` in WAL & RAM). `rtsd09_paper_kill_switch_crash_recovery_and_duplicate_idempotency` & `uv02` (`2.188 ms`) PASS. |
| **`RTSD-10`** | Major | **CLOSED** | `crates/allegedly-ingest/src/ws_client.rs` & `bin/live_soak.rs` implement real Kraken WS v2 (`trade` + `book` `depth=100` CRC32) and Coinbase AdvTrade (`events[].trades[]` + `sequence_num` gap detection), pure-integer `parse_rfc3339_utc_ns`, explicit `parse_errors`/`ring_drops` + `BookState::Stale` on SPSC saturation, and strict `ExitCode::FAILURE` in `live_soak.rs` on zero trades or any error/drop/mismatch/gap. |
| **`RTSD-11`** | Major | **OPEN (FAILED IN CI)** | `cargo-deny` added to `.github/workflows/ci-pr-fast.yml:24-30`, and `pnpm-lock.yaml` + exact pins (`@ui-sdk`, `dockview`, `lightweight-charts`) added to `scripts/ci/check-npm-policy.mjs` — **HOWEVER both fail in live CI run `45668778630`:** (a) `cargo-deny` fails `bans` due to `deny.toml:23` `wildcards = "deny"` lacking `allow-wildcard-paths = true`; (b) `check-npm-policy.mjs:6` fails on `windows-latest` (`new URL(import.meta.url).pathname` breaks Windows drive paths). |
| **`RTSD-12`** | Major | **CLOSED** | `crates/allegedly-storage/src/atvault.rs` authenticates `(count, comp_len, compressed)` in CRC32, enforces `MAX_BLOCK_TICKS = 1_000_000` & `MAX_BLOCK_COMP_BYTES = 128 MiB`, eliminates TOCTOU append, calls `sync_data()`, rejects trailing chunk remainders, and adds streaming `AtVaultBlockReader`. `parquet_vault.rs` eliminates all 11 `.unwrap()` panics (`StorageError::SchemaMismatch`), calls `file.sync_all()` before `fs::rename`, and prunes row groups via `ts_exchange_ns` min/max stats. `rtsd12_corrupt_header_and_parquet_pruning` PASS. |
| **`RTSD-13`** | Major | **CLOSED** | `crates/allegedly-orderflow/tests/slab_arena_10chart_rss.rs` removes `shrink_to_fit()` and measures real macOS `ps -o rss=` delta (`37.01 MiB` delta / `45.50 MiB` unshrunk capacity verified live). `08-Dashboards/Unverified-Claims.md` honestly downgrades `UV-04` to `PARTIAL (Arena OS RSS Bench Only; 10-Chart Full UI Pending)`. |
| **`RTSD-14`** | Minor | **CLOSED** | Rust `decode_header`/`decode_live_trade_batch`/`decode_stream_status` validate `FrameType` and `record_count == 1`; `FrameBatcher` caps `pending_trades` at `MAX_PENDING_TRADES = 65_536` (`VecDeque` drop-oldest + `dropped_overflow`). TS `decoder.ts` validates `byteOffset`, `VALID_FRAME_TYPES`, `wordsPerRow === 2`, `levelCount === recordCount`, and `recordCount === 1`. |
| **`RTSD-15`** | Minor | **CLOSED** | `crates/allegedly-orderflow/src/footprint.rs` handles `evict_oldest_bars(0)` cleanly without panicking and drops backwards `bucket < cur` ticks (`late_ticks_dropped += 1`) without rewinding `active_bar_ts_ns`. `rtsd15_evict_zero_and_out_of_order_tick_guard` PASS. |
| **`RTSD-16`** | Minor | **CLOSED** | `crates/allegedly-core/src/config.rs` locks `execution.mode` (`"\"paper_sim\""`), routes `set_instance_override` through `try_set_instance_override`, validates config keys, and escapes `\`, `"`, `\n`, `\r`, `\t`, and control chars in TOML serialization. `rtsd16_safety_lock_enforcement_and_toml_injection_escape` PASS. |
| **`RTSD-17`** | Minor | **CLOSED** | `WorkspaceHost` updates panel titles imperatively without tearing down Dockview; `StatusBar`/`PaperOmsPanel` color non-Live book states amber/rose and unify `T1..T5` provenance labels; `ChromeToolbar` wires `compactDensity`/`showProvenanceOverlay`; `PaperOmsPanel` adds `+ CVD`/`+ FP Delta` and arbitrary inline setting overrides; `App.tsx` derives passive limit prices from current symbol close; `DrawingEngine` fixes symbol-scoped `redo()` of `clear(symbol)`, `maxNumericId`, and TOML unescaping; `ui-chrome.test.ts` + 3 expanded `a11y.test.tsx` tests PASS. |
| **`RTSD-18`** | **Blocker (New)** | **OPEN (FAILED IN CI)** | **Live GitHub Actions PR CI (`45668778630`) is RED (5/6 jobs failed) on `809728e`:** (1) `apps/desktop/src-tauri/icons/icon.ico` missing → Windows `tauri-build` fails (`139398049721`); (2) `apps/desktop/src-tauri/Cargo.toml:20` `default = ["custom-protocol"]` panics in `tauri-codegen-2.7.6/src/context.rs:185-191` on any clean checkout without `apps/desktop/dist` (job `rust-workspace` never builds/stubs `dist` or passes `--no-default-features`); (3) `.github/workflows/ci-pr-fast.yml:37,63` runner `macos-14` rejected (`139398049456`, `139398049499`). |

---

## 3. Cycle 2 Empirical Verification Ledger (Commit `809728e`)

All local commands were executed directly against `809728e3bccd60146476d42fca32dbd7829195d2` with `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target`.

| Check | Command | Observed Result | Status |
| :--- | :--- | :--- | :---: |
| Static float guard (`SV-08`) | `bash scripts/ci/check-no-floats.sh` | `PASS [SV-08]: 0 f32/f64 occurrences across all 9 financial/app/shell crates + serde_json arbitrary_precision verified.` | **PASS** |
| Legacy prefix guard (`ADR-0001`) | `bash scripts/ci/check-no-legacy-prefix.sh` | `PASS [ADR-0001]: 0 retired legacy prefixes/extensions in production tree.` | **PASS** |
| NPM policy guard (`SC-02`) | `node scripts/ci/check-npm-policy.mjs` | Local macOS: `PASS` (`4 package.json` + `pnpm-lock.yaml`, exact pins). **GitHub Actions `windows-latest` (`139398049005`): `FAIL [SC-02]: pnpm-lock.yaml is missing at repo root`** | **FAIL (Win CI)** |
| In-vault `target/` dirs | `find . -maxdepth 4 -name target -type d \| wc -l` | `0` | **PASS** |
| `unsafe` scan | `grep -rn "unsafe" crates apps/desktop/src-tauri/src` | Only `apps/desktop/src-tauri/src/main.rs:1:#![forbid(unsafe_code)]` (`0` unsafe blocks) | **PASS** |
| Rust fmt + clippy | `cargo fmt --all -- --check` + `clippy` (workspace + `src-tauri` `--all-targets -D warnings`) | Local macOS: exit `0`, `0` warnings. **CI `windows-latest` (`139398049721`): `FAIL` (missing `icon.ico`, plus latent missing `../dist`)** | **FAIL (CI)** |
| Rust workspace + Tauri tests | `cargo test --workspace --release` + `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --release` | **39/39 passed** (`allegedly-app` 2, `core` 8, `ingest` 4+3, `ipc` 4, `oms` 3, `orderflow` 4+1, `replay` 2, `storage` 2, `studies` 2+2, `src-tauri` 1) | **PASS (M2)** |
| `UV-02` APFS `fullfsync` | `cargo test -p allegedly-oms --release uv02 -- --nocapture` | `2188 us (2.188 ms)` for batched 50-order Kill-Switch + crash recovery (`<= 15 ms` target) | **PASS (M2)** |
| `UV-04` Arena OS RSS | `cargo test -p allegedly-orderflow --release --test slab_arena_10chart_rss -- --nocapture` | `capacity_bytes=47710208 (45.50 MiB)`, `os_rss_delta_bytes=38813696 (37.01 MiB)` (no `shrink_to_fit()`) | **PASS (Arena only; honestly PARTIAL)** |
| `KC-05` / `T09` ingest bench | `cargo test -p allegedly-ingest --release --test ws_fault_injection_and_spsc_bench -- --nocapture` | `51,109,066 ticks/s` (`500,000` ticks in `9,783 us`); Coinbase `16 ms` & Kraken CRC32 `17 ms` loopback resync | **PASS** |
| IPC schema parity | `diff -u schemas/ipc-v1/ipc-contract.json <(cargo run --quiet -p allegedly-docgen)` | `SCHEMA EXACT MATCH` | **PASS** |
| Frontend typecheck + tests + a11y | `pnpm typecheck && pnpm test && pnpm test:a11y` | Exit `0`; **24/24 tests passed** (`ipc-client`: 16, `ui-chrome`: 1, `desktop`: 7 including 3 `a11y.test.tsx`) | **PASS (M2)** |
| `cargo-deny` (`SC-02`) | GitHub Actions job `139398049542` (`EmbarkStudios/cargo-deny-action@v2`) | `advisories ok, bans FAILED, licenses ok, sources ok` (`error[wildcard]` on internal workspace crates; `cargo-deny` not installed locally) | **FAIL (CI)** |
| GitHub Actions `CI PR Fast` | `gh run view 45668778630` | **5/6 jobs FAILED** (`Static Policy Guards` passed; `cargo-deny`, `windows-latest` frontend, `windows-latest` Rust/Tauri, `macos-14` frontend, `macos-14` Rust/Tauri all failed) | **FAIL** |
| External bundle artifacts | `ls -lh /Users/abelmora/.cache/allegedly-target/{release/allegedly-desktop,bundle/}` | `allegedly-desktop` `14M`, `Allegedly.app` `15M`, `Allegedly_0.1.0_aarch64.dmg` `5.3M`, `Allegedly-macos-arm64.tar.gz` `4.7M` | **Present** |

---

## 4. Detailed Root Cause & Exact Fixes Required to Reach `PASS`

Only **4 surgical CI/packaging fixes** (covering `RTSD-11` and `RTSD-18`) stand between `809728e` and a clean **`PASS`**:

1. **`deny.toml:23` (`RTSD-11`):** Add `allow-wildcard-paths = true` under `[bans]` so `cargo deny check advisories bans licenses sources` permits internal workspace path dependencies (`allegedly-core.workspace = true`, etc.) while still denying external registry wildcards.
2. **`scripts/ci/check-npm-policy.mjs:6` (`RTSD-11`):** Replace `path.dirname(new URL(import.meta.url).pathname)` with `path.dirname(fileURLToPath(import.meta.url))` (from `node:url`) or `import.meta.dirname` so `repoRoot` resolves cleanly on Windows (`windows-latest`).
3. **`apps/desktop/src-tauri/icons/icon.ico` + `.github/workflows/ci-pr-fast.yml:46-57` (`RTSD-18`):**
   - Generate and commit a valid Windows `apps/desktop/src-tauri/icons/icon.ico` (and `icon.icns` for macOS) alongside `icon.png`.
   - In `.github/workflows/ci-pr-fast.yml` job `rust-workspace`, either run `cargo clippy/test --manifest-path apps/desktop/src-tauri/Cargo.toml --no-default-features` (recommended for clean Rust-only CI without Node/Vite) OR ensure `apps/desktop/dist` is built before `cargo clippy/test` so `tauri::generate_context!()` does not panic on missing `../dist` when `default = ["custom-protocol"]` is active.
4. **`.github/workflows/ci-pr-fast.yml:37,63` (`RTSD-18`):** Replace unsupported `macos-14` with a supported macOS runner label on this GitHub Actions tier (e.g., `macos-latest` or `macos-15`) and confirm all 6 jobs in `CI PR Fast (macOS + Windows)` turn **GREEN**.

---

## 5. What Remains Unverified Outside Apple M2 Scope
- **Live GUI re-execution of `measure-macos-bundle.mjs`:** Harness code (`sandbox-exec` + `report_ui_ready` + `hdiutil`) and built `.app`/`.dmg` artifacts were audited directly; the GUI app was not re-launched in this read-only review pass to avoid disrupting the host desktop.
- **Live 30-minute exchange soak (`UV-06` full gate) & `.dbn.zst` CME fixture:** Code and strict exit logic in `live_soak.rs` verified; live network soak was not re-executed in this pass (`08-Dashboards/Unverified-Claims.md` honestly tracks full 30m + `.dbn.zst` as pending).
- **10-chart full mounted UI RSS (`UV-04` full UI), Windows 11 native WebView2 runtime (`UV-03`/`UV-05` Windows), Intel macOS APFS (`UV-02` Intel):** Honestly kept open/partial in `08-Dashboards/Unverified-Claims.md`.

---

## Appendix — Cycle 1 Historical Audit Record (Commit `6726fbe`)

Cycle 1 (`2026-11-25`, commit `6726fbe4ed5b1ddda30fa85918dfe870e69d0c4c`) returned **`FAIL`** with 5 Blockers (`RTSD-01`–`RTSD-05`), 8 Majors (`RTSD-06`–`RTSD-13`), and 4 Minor clusters (`RTSD-14`–`RTSD-17`). All 16 non-CI findings were remediated in `809728e` as documented in Section 2 above; `RTSD-11` remains open and `RTSD-18` was opened upon live GitHub Actions verification of `809728e`.
