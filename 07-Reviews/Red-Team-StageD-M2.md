---
title: "Red-Team Audit: Apple M2 Stage D Implementation (v0.1 Slices 1–5)"
type: review
status: complete
verdict: FAIL (Pending CI Completion)
reviewer: Allegedly Red Team
audited_commit: 3dda8d6b1e052c98d12d7924e8d68d1cd40f8b47
cycle2_commit: 809728e3bccd60146476d42fca32dbd7829195d2
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

> **Cycle 3 Re-Verification Verdict (Commit `3dda8d6`):** **`FAIL` — Pending CI Completion** (`17/18` findings **CLOSED** including **`RTSD-11` CLOSED** on live GitHub Actions; **`RTSD-18`** code/icon/workflow fixes verified with `0` regressions, awaiting completion of the final 3/6 jobs in GitHub Actions run `45671009080` — `3/6` already `success`, `2/6` `in_progress`, `1/6` `queued`, `0` failed at check time `2026-11-25 18:05:13 UTC`)
> **Cycle 2 Verdict (Commit `809728e`):** **`FAIL`** (`16/17` closed; `RTSD-11` open + new CI Blocker `RTSD-18` on run `45668778630`)
> **Cycle 1 Verdict (Commit `6726fbe`):** **`FAIL`** (`5` Blockers, `8` Majors, `4` Minor clusters)
> **Audited Commits (Cycle 3):** `e3b9687` (`fix(ci): resolve RTSD-11 and RTSD-18 cross-platform CI blockers`) + `3dda8d6b1e052c98d12d7924e8d68d1cd40f8b47` (`fix(ci): mark internal workspace crates publish = false for cargo-deny allow-wildcard-paths (RTSD-11)`)

---

## 1. Cycle 3 Re-Verification Executive Summary (Commits `e3b9687`..`3dda8d6`)

All 16 changed files between `809728e` and `3dda8d6` were audited line-by-line, local Rust/Tauri/TypeScript/policy suites were re-run with `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` (`0` in-vault `target/` directories), and live GitHub Actions run **`45671009080`** (`https://github.com/emrisca/allegedly/actions/runs/45671009080`) was checked once without polling.

### Code & Diff Audit (`809728e..3dda8d6`) — Zero Regressions, Zero Weakened Gates
1. **`deny.toml` + internal crate `publish = false` (`RTSD-11`):** Added `allow-wildcard-paths = true` under `[bans]` (`deny.toml:26`) and `publish = false` across all 9 remaining workspace crates (`crates/*/Cargo.toml`) + `apps/desktop/src-tauri/Cargo.toml`. Confirmed `wildcards = "deny"`, `openssl-sys` ban, `unknown-registry = "deny"`, `unknown-git = "deny"`, and the SPDX allowlist are completely unchanged.
2. **`scripts/ci/check-npm-policy.mjs` (`RTSD-11`):** Replaced `new URL(import.meta.url).pathname` with `fileURLToPath(import.meta.url)` from `node:url` (`scripts/ci/check-npm-policy.mjs:4,7`). No npm/SPDX/pin checks weakened.
3. **`apps/desktop/src-tauri/icons/icon.ico` (`RTSD-18`):** Verified valid Windows ICO binary (`4,286` bytes; `file` reports `MS Windows icon resource - 1 icon, 32x32, 32 bits/pixel`; header `reserved=0, type=1, count=1, entry=32x32, planes=1, bpp=32, img_size=4264, offset=22, end=4286`; DIB `size=40, w=32, h=64, planes=1, bpp=32, comp=0, raw_size=4096`).
4. **`.github/workflows/ci-pr-fast.yml` & `.github/workflows/ci-pre-release-soak.yml` (`RTSD-18`):**
   - `grep -rn "macos-14" .github/workflows/` returns **0 matches** (replaced with `macos-latest`).
   - Added clean-checkout placeholder `apps/desktop/dist/index.html` step (`shell: bash`) before `src-tauri` clippy/test in `rust-workspace`.
   - Verified `apps/desktop/src-tauri/Cargo.toml:23` retains `default = ["custom-protocol"]` and `serde_json` `["arbitrary_precision", "raw_value"]`, and all `fmt`/`clippy -D warnings`/`test` gates remain intact.

### Live GitHub Actions Run `45671009080` Snapshot (`2026-11-25 18:05:13 UTC`, commit `3dda8d6`)

| Job | Job ID | Status | Conclusion | Timing (UTC) | Duration |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `Static Policy Guards (SV-08, ADR-0001, SC-02)` | `139405941283` | `completed` | **`success`** | `18:02:30Z` → `18:02:50Z` | `20s` |
| `Cargo Deny License & Advisory Gate (SC-02)` | `139405941303` | `completed` | **`success`** | `18:02:30Z` → `18:02:52Z` | `22s` |
| `Frontend & UV-01 A11y (windows-latest)` | `139405941413` | `completed` | **`success`** | `18:02:30Z` → `18:03:21Z` | `51s` |
| `Rust Workspace & Tauri Shell (macos-latest)` | `139405941203` | `in_progress` | *(pending)* | started `18:02:29Z` | running |
| `Rust Workspace & Tauri Shell (windows-latest)` | `139405941233` | `in_progress` | *(pending)* | started `18:02:29Z` | running |
| `Frontend & UV-01 A11y (macos-latest)` | `139405940915` | `queued` | *(pending)* | created `18:02:27Z` | queued |

### Cycle 3 Status of the Final 2 Items
- **`RTSD-11` (Major) → `CLOSED`:** Both live CI failures (`Cargo Deny License & Advisory Gate` and `Frontend & UV-01 A11y (windows-latest)`) are now **empirically GREEN (`success`)** on run `45671009080`.
- **`RTSD-18` (Blocker) → `OPEN (PENDING CI COMPLETION)`:** All source/icon/workflow fixes are verified cleanly with `0` failures so far (`macos-latest` accepted and running), but per strict Red-Team verification discipline the overall verdict cannot flip from `FAIL` to `PASS` until the final 3 jobs (`139405941203`, `139405941233`, `139405940915`) finish **`success`** (6/6 green).

---

## 2. Finding-by-Finding Re-Verification Matrix (`RTSD-01`–`RTSD-18`)

| ID | Orig. Sev | Cycle 3 Status | Exact Verification Evidence (Commits `809728e`..`3dda8d6`) |
| :--- | :---: | :---: | :--- |
| **`RTSD-01`** | Blocker | **CLOSED** *(CI Rust/Tauri jobs completing under `RTSD-18`)* | `apps/desktop/src-tauri/src/main.rs:1` adds `#![forbid(unsafe_code)]`; `DesktopState` delegates `get_paper_account`, `submit_paper_order`, and `kill_switch_cancel_all` to `AllegedlyRuntime` → `LocalPaperOms` + SQLite WAL (`paper_oms.sqlite` in OS app-data / `ALLEGEDLY_DATA_DIR`) + `RiskGate` + per-symbol mark pricing + strict enum/positive validation (`crates/allegedly-app/src/lib.rs:145-398`). Tests PASS on `3dda8d6`. |
| **`RTSD-02`** | Blocker | **CLOSED** | `apps/desktop/src-tauri/src/main.rs:175-182` returns raw binary `tauri::ipc::Response::new(packed)` (`poll_binary_frames`). `crates/allegedly-app/src/lib.rs:413-539` emits all 7 canonical `ALG2 v1` frame types and bounds `FootprintSlabArena` at `MAX_LIVE_FOOTPRINT_BARS = 5_000`. `packages/ipc-client/src/tauri-adapter.ts:24-160` adds strict `unpackRawFrameBatch`, single multiplexed `StreamPump` per `streamId`, and fail-closed `BookState.Disconnected` status emission on error. |
| **`RTSD-03`** | Blocker | **CLOSED** | Root `Cargo.toml:45` and `apps/desktop/src-tauri/Cargo.toml:15` enable `serde_json` `["arbitrary_precision", "raw_value"]`. `scripts/ci/check-no-floats.sh` scans all 9 financial/app/shell crates, catches `as_f64`/`to_f64`/`from_f64`/`_f32`/`_f64`, and verifies `arbitrary_precision` (PASS locally & in CI `139405941283`). |
| **`RTSD-04`** | Blocker | **CLOSED** | Removed unused `_speed` tautology in `crates/allegedly-replay/src/lib.rs`. Implemented `O(batch)` `IncrementalReplayEngine` with bounded `REPLAY_ARENA_MAX_BARS = 512` eviction, non-destructive `snapshot_digest()`, and disk-streaming `ReplaySource::AtVaultFile`. Genuine stepped cross-speed `SV-09` SHA-256 test PASS on `3dda8d6`. |
| **`RTSD-05`** | Blocker | **CLOSED** *(harness + artifacts verified; GUI launch not re-run in read-only audit)* | `apps/desktop/src-tauri/Cargo.toml:23` keeps `default = ["custom-protocol"]`. `scripts/ci/measure-macos-bundle.mjs` packages `Allegedly.app` (`15M`) + `Allegedly_0.1.0_aarch64.dmg` (`5.3M` via `hdiutil UDZO`), runs 3 launches under macOS kernel `sandbox-exec` `(deny network-outbound (remote ip))`, waits for real React double-rAF `ALLEGEDLY_UI_READY_MS` via `report_ui_ready`, asserts `aliveAfterSettle`, verifies `paper_oms.sqlite` WAL, audits `lsof -nP -i` across WebKit XPC helpers, and enforces `< 300 MB` idle RAM. *(Minor note: `.app` packaging uses `mkdir`+`hdiutil`+`icon.png` rather than `tauri build` CLI + `.icns`.)* |
| **`RTSD-06`** | Major | **CLOSED** | `crates/allegedly-core/src/fixed.rs:76-175` returns `Ok(0)` immediately for zero mantissas (`"0e2000000000"` in `O(input.len())`), bounds scaling to `<= 18` multiplies (`O(1)`), and parses `"0.0000000000000000005e20"` → `50_000_000_000`. Test PASS on `3dda8d6`. |
| **`RTSD-07`** | Major | **CLOSED** | `crates/allegedly-studies/src/{luau_sandbox.rs,lib.rs}` enforces 1:1 `effective_cap` with `lua.set_memory_limit`, RAII `InterruptGuard`, strips `math.random`/`math.randomseed`, exposes zero-copy `FloatSeriesView(Arc<[f64]>)` + `close_bytes`, tracks `peak_reserved_bytes`, and `App.tsx` passes `buy_volumes`/`sell_volumes`. Test PASS on `3dda8d6`. |
| **`RTSD-08`** | Major | **CLOSED** | `apps/desktop/src/panels/chart-panel.tsx:354-480` implements synchronous Lightweight Charts v5 `OrderflowAndDrawingsPrimitive implements ISeriesPrimitive<Time>`; `webgl2-orderflow-overlay.ts:375-384` deletes `quadBuf` in `dispose()`; `$95,000` BTC seed alignment; `Number.isFinite(scaled)` guard before `BigInt(Math.round(...))`. |
| **`RTSD-09`** | Major | **CLOSED** | Private `live_armed`, duplicate `client_order_id` rejection, atomic SQLite WAL `commit_order_and_position` before RAM mutation, unified Kill-Switch (`PaperSim` cancels + flattens positions in WAL & RAM; `BrokerLive` `PendingCancel`). Tests PASS on `3dda8d6`. |
| **`RTSD-10`** | Major | **CLOSED** | Real Kraken WS v2 (`trade` + `book` `depth=100` CRC32) & Coinbase AdvTrade (`events[].trades[]` + `sequence_num`), pure-integer RFC3339 parser, explicit `ring_drops`/`BookState::Stale`, strict `ExitCode::FAILURE` in `live_soak.rs`. Loopback fault tests PASS on `3dda8d6`. |
| **`RTSD-11`** | Major | **CLOSED** *(Cycle 3 — verified GREEN on live CI)* | `deny.toml:26` adds `allow-wildcard-paths = true` + `publish = false` on internal workspace crates (`3dda8d6`), and `scripts/ci/check-npm-policy.mjs:4,7` switches to `fileURLToPath(import.meta.url)` (`e3b9687`). **Live GitHub Actions run `45671009080`:** `Cargo Deny License & Advisory Gate` (`139405941303`) **`success` (22s)** and `Frontend & UV-01 A11y (windows-latest)` (`139405941413`) **`success` (51s)**. Zero weakened policy rules. |
| **`RTSD-12`** | Major | **CLOSED** | `.atvault` CRC32 covers `(count, comp_len, compressed)`, enforces `MAX_BLOCK_TICKS = 1_000_000` & `MAX_BLOCK_COMP_BYTES = 128 MiB`, TOCTOU-free append + `sync_data()`, streaming `AtVaultBlockReader`; Parquet zero `.unwrap()` (`StorageError::SchemaMismatch`), `file.sync_all()`, and `ts_exchange_ns` row-group pruning. Tests PASS on `3dda8d6`. |
| **`RTSD-13`** | Major | **CLOSED** | `slab_arena_10chart_rss.rs` removes `shrink_to_fit()` and measures real macOS `ps -o rss=` delta (`37.01 MiB` delta / `45.50 MiB` unshrunk capacity). `08-Dashboards/Unverified-Claims.md` honestly tracks `UV-04` as `PARTIAL (Arena OS RSS Bench Only; 10-Chart Full UI Pending)`. |
| **`RTSD-14`** | Minor | **CLOSED** | Hardened Rust/TS frame decoders & `MAX_PENDING_TRADES = 65_536` bounded `FrameBatcher` (`VecDeque` drop-oldest + `dropped_overflow`). Tests PASS on `3dda8d6`. |
| **`RTSD-15`** | Minor | **CLOSED** | `FootprintSlabArena` handles `evict_oldest_bars(0)` cleanly and drops backwards ticks (`late_ticks_dropped += 1`). Test PASS on `3dda8d6`. |
| **`RTSD-16`** | Minor | **CLOSED** | `execution.mode` locked, `set_instance_override` routed through `try_set_instance_override`, strict config key validation, full TOML string escaping. Test PASS on `3dda8d6`. |
| **`RTSD-17`** | Minor | **CLOSED** | `WorkspaceHost` imperative title updates, unified `T1..T5` provenance labels, non-Live book colors, wired display switches, CVD/FP Delta & arbitrary inline setting overrides, symbol-scoped `DrawingEngine` redo, `ui-chrome.test.ts` + 3 expanded `a11y.test.tsx` tests PASS on `3dda8d6`. |
| **`RTSD-18`** | **Blocker** | **OPEN (PENDING CI COMPLETION)** | Code/packaging/workflow fixes in `e3b9687`..`3dda8d6` verified cleanly: valid 32×32 32bpp Windows `icon.ico` (`4,286 B`), `0` `macos-14` refs in `.github/workflows/`, placeholder `apps/desktop/dist/index.html` step in `rust-workspace`, `default = ["custom-protocol"]` preserved. **Awaiting live completion of 3/6 jobs on run `45671009080`:** `Rust Workspace & Tauri Shell (macos-latest)` (`139405941203`, `in_progress`), `Rust Workspace & Tauri Shell (windows-latest)` (`139405941233`, `in_progress`), and `Frontend & UV-01 A11y (macos-latest)` (`139405940915`, `queued`). |

---

## 3. Cycle 3 Empirical Verification Ledger (Commit `3dda8d6`)

All local commands were executed directly against `3dda8d6b1e052c98d12d7924e8d68d1cd40f8b47` with `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target`.

| Check | Command | Observed Result | Status |
| :--- | :--- | :--- | :---: |
| Static float guard (`SV-08`) | `bash scripts/ci/check-no-floats.sh` | `PASS [SV-08]: 0 f32/f64 occurrences across all 9 financial/app/shell crates + serde_json arbitrary_precision verified.` | **PASS** |
| Legacy prefix guard (`ADR-0001`) | `bash scripts/ci/check-no-legacy-prefix.sh` | `PASS [ADR-0001]: 0 retired legacy prefixes/extensions in production tree.` | **PASS** |
| NPM policy guard (`SC-02`) | `node scripts/ci/check-npm-policy.mjs` + CI `139405941413` | Local macOS: `PASS` (`4 package.json` + `pnpm-lock.yaml`). **Live GitHub Actions `windows-latest` (`139405941413`): `success` (`51s`)** | **PASS (macOS + Win CI)** |
| `icon.ico` binary validation | `file` + Python ICO/DIB struct parser | `MS Windows icon resource - 1 icon, 32x32, 32 bits/pixel` (`4,286 B`, `offset+img_size=4286`, DIB `40 B`, `32x64`, `32bpp`, `comp=0`) | **PASS** |
| Retired `macos-14` check | `grep -rn "macos-14" .github/workflows/` | `0` matches | **PASS** |
| In-vault `target/` dirs | `find . -maxdepth 4 -name target -type d \| wc -l` | `0` | **PASS** |
| Rust fmt + clippy | `cargo fmt --all -- --check` + `clippy` (workspace + `src-tauri` `--all-targets -D warnings`) | Exit `0`, `0` warnings on Apple M2 (`default = ["custom-protocol"]` active) | **PASS (M2)** |
| Rust workspace + Tauri tests | `cargo test --workspace --release` + `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --release` | **39/39 passed** (`allegedly-app` 2, `core` 8, `ingest` 4+3, `ipc` 4, `oms` 3, `orderflow` 4+1, `replay` 2, `storage` 2, `studies` 2+2, `src-tauri` 1) | **PASS (M2)** |
| Frontend typecheck + tests + a11y | `pnpm typecheck && pnpm test && pnpm test:a11y` | Exit `0`; **24/24 tests passed** (`ipc-client`: 16, `ui-chrome`: 1, `desktop`: 7 including 3 `a11y.test.tsx`) | **PASS (M2 + Win CI)** |
| `cargo-deny` (`SC-02`) | Live GitHub Actions job `139405941303` (`EmbarkStudios/cargo-deny-action@v2`) | **`success` (`22s`)** — `advisories`, `bans`, `licenses`, `sources` all GREEN | **PASS (CI)** |
| GitHub Actions `CI PR Fast` | `gh run view 45671009080 --repo emrisca/allegedly` (checked `18:05:13 UTC`) | **3/6 `success`**, **2/6 `in_progress`** (`Rust Workspace & Tauri Shell` on `macos-latest` & `windows-latest`), **1/6 `queued`** (`Frontend & UV-01 A11y` on `macos-latest`), **`0` failed** | **IN PROGRESS** |

---

## 4. Exact Remaining Gate to Flip Verdict to `PASS`

Zero code edits are currently needed unless one of the 3 running/queued jobs fails. To close **`RTSD-18`** and upgrade the Stage D (Apple M2) verdict to **`PASS`**:
- Re-check GitHub Actions run **`45671009080`** once completed and verify all **6/6 jobs** conclude **`success`**:
  - `Rust Workspace & Tauri Shell (macos-latest)` (`139405941203`)
  - `Rust Workspace & Tauri Shell (windows-latest)` (`139405941233`)
  - `Frontend & UV-01 A11y (macos-latest)` (`139405940915`)

---

## 5. What Remains Unverified Outside Apple M2 Scope (Honest Caveats Retained Even on `PASS`)
- **Live GUI re-execution of `measure-macos-bundle.mjs`:** Harness code (`sandbox-exec` + `report_ui_ready` + `hdiutil`) and built `.app`/`.dmg` artifacts were audited directly; the GUI app was not re-launched during read-only Red-Team audits to avoid disrupting the host desktop.
- **Live 30-minute exchange soak (`UV-06` full gate) & `.dbn.zst` CME fixture:** Code and strict exit logic in `live_soak.rs` verified; full 30m soak & `.dbn.zst` fixture remain pending in `08-Dashboards/Unverified-Claims.md`.
- **10-chart full mounted UI RSS (`UV-04` PARTIAL):** Arena OS RSS benchmark (`37.01 MiB` delta / `45.50 MiB` unshrunk capacity) is verified; full 10-chart mounted WebView2/WKWebView UI RSS remains pending.
- **Windows 11 native WebView2 runtime (`UV-03`/`UV-05` Windows), Intel macOS APFS (`UV-02` Intel), and TA-Lib reference parity (`UV-07`):** Honestly tracked as pending/deferred outside Apple M2 Stage D scope in `08-Dashboards/Unverified-Claims.md`.

---

## Appendix — Prior Audit Cycles

- **Cycle 2 (`2026-11-25`, commit `809728e3bccd60146476d42fca32dbd7829195d2`):** **`FAIL`** — 16/17 original findings closed locally; live GitHub Actions run `45668778630` failed 5/6 jobs, keeping `RTSD-11` open and opening `RTSD-18`.
- **Cycle 1 (`2026-11-25`, commit `6726fbe4ed5b1ddda30fa85918dfe870e69d0c4c`):** **`FAIL`** — 5 Blockers (`RTSD-01`–`RTSD-05`), 8 Majors (`RTSD-06`–`RTSD-13`), and 4 Minor clusters (`RTSD-14`–`RTSD-17`).
