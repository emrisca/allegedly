---
title: Allegedly — Plan of Record
type: plan-of-record
status: active
phase: Phase 5
owner: orchestrator
updated: 2026-11-25
---

# Allegedly — Plan of Record

> *"Allegedly a trading terminal."* — **Decision-grade engineering Plan of Record consolidating Phases 0–4 (Charter, Verified Research `R01`–`R10`, Verified Apple M2 Spikes `S01`–`S08`, Locked Architecture & ADRs `0001`–`0010`, and Roadmap `v0.1`–`v1.0` + `Post-v1.0`) prior to `v0.1` Production Implementation.**

---

## 1. Executive Summary & Mission Lock

**Allegedly** is a fast, local-first, **`Apache-2.0`** open-source desktop trading terminal targeting **macOS (Apple Silicon + Intel) and Windows 10/11** for `v0.1`–`v1.0` (**Linux X11/Wayland deferred to `Post-v1.0`**, preserving portable Rust, WebGL2, and `TransportAdapter` boundaries per [[0001-license-brand-and-platform-scope|ADR-0001]]).

It combines TradingView-grade charting, clean-room deterministic scripting, and ergonomic workspace ergonomics with MotiveWave-grade order-flow, Footprint Bars, Volume & TPO Profiles, Canvas2D DOM Ladder execution, and 100M-tick deterministic local replay — without cloud lock-in, mandatory subscriptions (`$0` core), telemetry, or copyleft contamination.

### Non-Negotiable Charter Budgets & Guardrails ([[Constraints]], [[Principles]])
| Guardrail | Locked Threshold | Current Status |
|---|---|---|
| **License & Clean-Room Brand** | `Apache-2.0`; canonical `allegedly-*` crates, `.atvault` / `.atdepth` / `.atworkspace.toml` / `.atanalysis.toml` / `template.toml`; zero retired legacy crate-prefix or file-extension residue | **LOCKED** (`ADR-0001`; `RK-04` formal trademark counsel review **`UNVERIFIED`** prior to public distribution) |
| **Platform Scope (`v0.1`–`v1.0`)** | Tier-1: macOS (`aarch64` + `x86_64`) & Windows 10/11 (`x86_64`). Linux (`WebKitGTK`, `RK-01`) deferred to `Post-v1.0` | **LOCKED** (`ADR-0001`; Windows `WebView2` CI **`UNVERIFIED`**) |
| **Installer Footprint (`BG-01`)** | `< 40.0 MB` packaged `.dmg` / `.msi` | `v0.1` core stripped `gzip-9` sum **`~6.2 MB`** (`S02 2.68 MB` + `S07 Luau +0.47 MiB` + `S08 storage +2.91 MiB`; `v0.2` adds Wasmtime `+1.74 MiB` → `~8.0 MB`, combined `S07 = 2.21 MiB rounded / +2.20 MiB exact byte sum`); packaged `.dmg`/`.msi` **`UNVERIFIED`** |
| **Cold Start & Offline Boot (`SV-01`)** | `< 2.0 s` interactive cold start; **`0` outbound packets** on fresh boot (`updates.checkOnStartup = false`) | Packaged async-hydrated cold start **`UNVERIFIED`** (`S02` eager `200k`-bar spike measured `2.33 s`, motivating mandatory async post-paint hydration) |
| **Idle RAM (`Constraints #5`, `SV-13`)** | **`< 300 MB`** full OS process-tree idle RAM (including macOS `WKWebView` XPC helpers & Windows `WebView2` child processes) | Full OS process-tree idle RAM & 10-chart `FootprintSlabArena < 60 MiB` RSS **`UNVERIFIED`** |
| **Hot-Path Rendering (`SV-14`, `BG-04`)** | `60.0 fps` (`<= 16.67 ms` p99), `0.000 CSS px` WebGL2 sync drift, `0.00 ms` DOM Layout/RecalcStyle on `60 Hz` Canvas2D `DOM Ladder` & Time & Sales | **MEASURED** on Apple M2 (`S01`, `S04`); Windows `WebView2` & native `WKWebView` parity **`UNVERIFIED`** |
| **Zero-Float Core (`SV-08`)** | All financial prices (`PriceE9`), quantities (`QtyE9`), balances (`MoneyMicros`), ticks, and OMS accounting use exact `i64`/`i128` fixed-point math (`0` `f32`/`f64`) | **VERIFIED** in `S05`/`S06`/`S08` (`28/28` release tests); enforced via CI `check-no-floats.sh` |
| **Sovereignty & `$0` Core** | Zero telemetry, zero phone-home, zero mandatory paid feeds/brokers, zero live orders or real credentials in repo/CI | **LOCKED** (`P1`–`P10`, `SV-01`–`SV-20`) |
| **Supply-Chain & Legal Red Lines** | `0` GPL/AGPL/LGPL linked into Rust core (`cargo-deny`); `0` `dockview-enterprise`; `0` Sierra `.scid`/DTC export; `0` `GPL-3.0` IBKR TWS API; 4 prop firms (`Apex`, `TPT`, `Bulenox`, `ETF`) + `Rithmic`/`CQG` permanently `DO-NOT-BUILD` | **LOCKED** (`License-Registry`, `Compliance-Notes`, `FORBIDDEN_DO_NOT_BUILD_ADAPTERS`) |

---

## 2. Phase 1 Research Findings (`R01`–`R10`, All Verified)

All 10 research tracks (`[[R01-Charting-Rendering]]` through `[[R10-UX-Teardown-Control-Model]]`) grounded the architecture in primary-source legal, protocol, and market-data truths:
1. **Charting & Shell (`R01`, `R02`):** Lightweight Charts `v5.3.0` (`Apache-2.0`) paired with a raw WebGL2 `ISeriesPrimitive` overlay avoids TradingView's proprietary Charting Library while guaranteeing exact coordinate sync. Tauri v2 (`MIT`/`Apache-2.0`) with React 19, `@ui-sdk/react` + `@ui-sdk/core` (`Apache-2.0`, pinned `"0.1.0-beta.17"` per `AGENTS.md`), Tailwind v4, and MIT-only `dockview` `8.9.1` (`0` enterprise packages) keeps React completely out of `60 fps` chart and `60 Hz` `DOM Ladder` hot paths.
2. **Market Data Brutal Truths (`R03`, [[Provider-Capability-Matrix]]):** Real-time CME futures (`$29,280/yr` vendor / `$12.10/mo+` Non-Pro) and consolidated US Equities SIP cannot be free, and Binance Global (`451`) / Bybit (`403`) geo-block US IPs (`RK-02`). Allegedly therefore ships US-verified `$0` keyless **Kraken Spot WS v2** + **Coinbase Advanced Trade WS** (with mandatory maker→taker aggressor inversion) + deterministic **Synthetic Sim** in `v0.1`, plus user-brought **Databento `.dbn.zst`** (`$125` free credits) and **Dukascopy `.bi5`** in `v0.2` — stamped with a loud **5-tier `ProvenanceTier`** (`SV-10`).
3. **Execution & Prop-Firm Legality (`R04`, [[Compliance-Notes]]):** Four audited prop firms (`Apex`, `Take Profit Trader`, `Bulenox`, `Elite Trader Funding`) plus `Rithmic`/`CQG` are permanently **`DO-NOT-BUILD`** (`RK-03`, `KC-03`), Sierra `.scid` / Denali DTC data export is banned (`RK-06`), and IBKR TWS API `v10.49+` (`GPL-3.0`, Aug 2026) is banned (`RK-05`). `v0.1` ships a zero-float local Paper OMS (`LocalPaperAdapter`); `v0.2` adds opt-in Alpaca Paper & tastytrade Cert Sandbox; `v0.5` adds live clean retail brokers (Alpaca, tastytrade, IBKR Client Portal Web API) in-process.
4. **Order-Flow, Scripting, Storage & Sovereignty (`R05`–`R10`):** Exact `i64`/`i128` order-flow formulas, 3-tier UI settings compression + 5-level TOML delta cascade (`SV-07`), clean-room domain naming (`Study` instead of vendor terms, 6 clean-room Drawings), and the 20-rule Sovereignty Verification Checklist (`SV-01`–`SV-20`) anchor every downstream spec.

---

## 3. Phase 2 Proof-of-Concept Spike Baselines (`S01`–`S08`, Verified on Apple M2)

Every core architectural risk was empirically tested on Apple M2 (`macOS 26.6.2`, `rustc 1.99.1`, `Brave 157.1.99.57`) with **`28/28` Rust release tests passing** across `S05`–`S08`:

| Spike | Verdict | Exact Measured Results (Apple M2) | Key Architectural Lock |
|---|---|---|---|
| [[S01-Chart-WebGL-Sync\|S01]] | `PASS-WITH-CAVEAT` | `ISeriesPrimitive` sync drift **`0.000 CSS px`** (vs. `54–557 px` rAF drift); WebGL2 draw **`0.30–0.40 ms`**; `5,000`-bar window sustains **`60.0 fps`** | Locked `ISeriesPrimitive` + Rust `5,000`/`6,000`-bar hysteresis viewport window (`ADR-0003`, `ADR-0004`) |
| [[S02-Tauri-IPC-Throughput\|S02]] | `PASS-WITH-CAVEAT` | `tauri::ipc::Response` `100k` bars in **`3.0 ms`**; `16 ms`-batched `Channel` **`100,450 msgs/s`**; release binary **`2.68 MB`** gzip-9; eager `200k`-bar `main()` cold start `2.33 s` | Locked binary IPC framing + `16 ms` coalescing + mandatory async post-paint hydration (`ADR-0002`) |
| [[S03-Dockview-Multiwindow\|S03]] | `PASS-WITH-CAVEAT` | MIT-only `dockview` + `dockview-react` `8.9.1` (`0` enterprise deps); **`0.60 ms` p95** pop-out sync; **`0`** DOM/listener leaks over 20 cycles | Locked MIT `dockview` `8.9.1` + Rust `state_rev: u64` Workspace State Hub (`ADR-0010`) |
| [[S04-CSS-Layout-Perf\|S04]] | `PASS` | Canvas2D `DOM Ladder` + Tape at `60 Hz` / `2,000` deltas/s: **`60.2 fps`**, **`0` stalls `> 20 ms`**, **`0.00 ms` Layout/RecalcStyle** (`4.9×–5.3×` less CPU than DOM) | Locked zero-alloc Canvas2D `DOM Ladder` & Time & Sales (`ADR-0004`, `SV-14`) |
| [[S05-Live-Ingest-TickVault\|S05]] | `PASS-WITH-CAVEAT` | Live 60s Kraken + Coinbase soak: **`100.00%`** Kraken CRC32, **`6.1×`** Coinbase maker→taker inversion proof; **`17.73M events/s`** ingest (`886×` `KC-05`); `dbn v0.75.0` **`18.43M rec/s`**; **`14/14`** release tests | Locked per-provider `rtrb` SPSC → Dispatcher, fail-closed `BookState::Stale`, 5-tier `ProvenanceTier` (`ADR-0008`) |
| [[S06-OMS-Paper-Execution\|S06]] | `PASS-WITH-CAVEAT` | Zero-float `i64` OMS; SQLite WAL append **`119.75 µs` p50**; 50-order Kill-Switch **`6.13–7.04 ms` p50** (`0` stray orders); 500-order WAL crash reconcile **`6.15 ms`**; **`54`** HTTP faults (`0` duplicates); **`7/7`** release tests | Locked 12-state `OrderState`, SQLite WAL crash recovery, Risk-Reduction Bypass Rule (`ADR-0009`) |
| [[S07-Scripting-Sandbox\|S07]] | `PASS-WITH-CAVEAT` | **Luau (`mlua`, `+0.47 MiB` gzip-9)** beat Rhai by **`10.05×` batch / `19.41×` live p99**; **Wasmtime (`+1.74 MiB` gzip-9)** **`+3.32%`** vs Native Rust (`1.679 ms` flat-memory batch); **`12/12`** hostile escapes blocked; **`3/3`** release tests | Adopted **Luau** (`v0.1`) + **Wasmtime** (`v0.2`), rejected Rhai; flat SoA `ByteView` ABI (`ADR-0005`) |
| [[S08-Storage-100M-Replay\|S08]] | `PASS-WITH-CAVEAT` | 100M-tick Hive Parquet write **`22.51M ticks/s`** (**`4.26 B/tick`**); streaming replay **`102.55M ticks/s`** at **`34.44 MiB` peak RSS**; cold 1h seek **`5.22 ms` p50**; 16-ary Dyadic VRVP **`0.0271 ms` p99** (`9.2×` faster than `0.25 ms`); **`+2.91 MiB`** gzip-9; **`4/4`** release tests | Locked `.atvault` + Hive Parquet 2.0 + 16-ary Dyadic Segment Tree VRVP (`ADR-0006`, `ADR-0007`) |

---

## 4. Phase 3 Locked Architecture & ADRs (`Red-Team PASS: 18/18 Closed`)

All 9 specifications (`[[C4-Architecture]]`, `[[Data-Model]]`, `[[IPC-Contract]]`, `[[Plugin-ABI]]`, `[[Error-Observability]]`, `[[Testing-Strategy]]`, `[[Release-Signing-Update]]`, `[[Docs-Strategy]]`, `[[Adopt-Build-Fork]]`), all 10 ADRs (`0001`–`0010`), and `[[Architecture.canvas]]` passed adversarial re-verification in `[[Red-Team-Phase3]]` (**`verdict: PASS`**, `18/18` closed).

### 4.1 Canonical Crate Workspace (`9` Production Crates + Dev-Only `allegedly-docgen`)
| Crate | Responsibility | Core Phase 3 Invariants |
|---|---|---|
| `allegedly-core` | Fixed-point primitives (`PriceE9`, `QtyE9`, `PriceTicks`, `LotQty`, `MoneyMicros`, `TimestampNs`), `Instrument`, `Venue`, `Session`, 5-tier `ProvenanceTier`, 5-state `BookState`, 5-level TOML config cascade | `0` floats (`SV-08`); canonical enums shared verbatim across IPC & Plugin ABI |
| `allegedly-ipc` | `24 B` `ALG2` `v1` header, aligned binary frames, `16 ms` coalescing batcher, authoritative `state_rev: u64` Workspace State Hub | `40 B` `LIVE_TRADE_BATCH` (`qty_e9: i64`), `32 B` `FootprintCell`, `24 B` `VOLUME_PROFILE_SOA` / `LIVE_L2_BOOK_BATCH`, `16 B` `STREAM_STATUS_FRAME`, `72 B` `NormalizedTick` / `LIVE_BAR_UPDATE_BATCH` |
| `allegedly-ingest` | Provider adapters (Kraken WS v2, Coinbase WS, Synthetic Sim in `v0.1`; DBN/`.bi5` in `v0.2`), strict per-provider `rtrb` SPSC (`cap = 16,384`) → single-threaded Core Event Dispatcher → `StorageRing` | Mandatory Coinbase maker→taker inversion; Kraken CRC32 check; fail-closed `BookState::Stale` on gap/drop/saturation |
| `allegedly-storage` | Crash-safe `.atvault` Zstd-3 + CRC32 recorder, Hive Parquet 2.0 compactor (`200k` row groups), SQLite WAL `catalog.sqlite` | `<= 5 B/tick` compressed; cold 1h seek `p99 <= 100 ms`; strict vault/cache path guard |
| `allegedly-orderflow` | `FootprintSlabArena` (`32 B` `FootprintCell`), `16`-ary Dyadic Segment Tree VRVP (`0.0271 ms` p99), `u128` `TpoRow` (`>= 96` brackets) + `CompositeTpoRow`, L2 MBP book | `FootprintSlabArena < 60 MiB` bound (`SV-13`); `SYNTHETIC: 1m-INTRABAR` auto-disables Absorption & Unfinished Auction triggers (`SV-10`) |
| `allegedly-studies` | Deterministic built-in Rust Studies + **Luau (`mlua`)** (`v0.1`) & **Wasmtime** (`v0.2`) sandboxes over flat SoA `ByteView` ABI | Global terminal-wide **`<= 64 MiB`** Study memory pool; cross-OS IEEE-754/`libm`/Cranelift determinism (`SV-09`, `SV-12`); full-history Rust warmup before viewport slicing |
| `allegedly-replay` | Deterministic streaming tick replay controller & in-process backtest engine (`allegedly-replay`); optional out-of-process DuckDB (`MIT`) / `nautilus_trader` (`LGPL-3.0-only`) Parquet/IPC sidecars | Streaming `>= 10M ticks/s` at `< 64 MiB` RSS; zero copyleft linked into core |
| `allegedly-oms` | Zero-float 12-state `OrderState` OMS, `LocalPaperAdapter`, Bracket/OCO, SQLite WAL journals (`PRAGMA fullfsync = ON` on macOS for live WAL), `keyring-rs v4.2.0 (keyring-core)` + `zeroize` | **Risk-Reduction Bypass Rule:** during `BookState != Live` or `RECONCILING`, risk-increasing entries FAIL-CLOSED while `reduce_only: true`, `cancel_order`, `cancel_all`, `trigger_kill_switch` (`flatten_all`), and `reconcile_now` ALWAYS SUCCEED; `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` enforced |
| `allegedly-app` | Tauri v2 host binary, async post-paint initialization, local ring-buffer diagnostics, Active 5-Tier Provenance Ledger, opt-in updater (`updates.checkOnStartup = false`) | Zero outbound network packets on fresh boot (`SV-01`); `allow-live-trading` OFF & `LIVE_ARMED = false` by default |
| `allegedly-docgen` *(dev-only)* | Offline API/schema/ADR doc generator (`Docs-Strategy.md`) | Excluded from release binary |

### 4.2 Locked ADR Index (`0001`–`0010`)
- [[0001-license-brand-and-platform-scope|ADR-0001]]: `Apache-2.0`, **Allegedly** brand, macOS + Windows `v0.1`–`v1.0` (Linux `Post-v1.0`)
- [[0002-desktop-shell-and-binary-ipc|ADR-0002]]: Tauri v2 + Rust core + binary IPC (`Response` + `16 ms` batched `Channel`)
- [[0003-chart-base-and-viewport-windowing|ADR-0003]]: Lightweight Charts `v5.3.0` + Rust `5,000`/`6,000`-bar hysteresis viewport windowing
- [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]]: Raw WebGL2 `ISeriesPrimitive` order-flow overlays + `60 Hz` Canvas2D `DOM Ladder` & Tape
- [[0005-study-runtime-and-scripting-language|ADR-0005]]: Adopt **Luau** (`mlua`, `v0.1`) + **Wasmtime** (`v0.2`), reject Rhai; flat SoA `ByteView` ABI & `<= 64 MiB` pool
- [[0006-tiered-storage-and-replay|ADR-0006]]: `.atvault` + Hive Parquet 2.0 + SQLite WAL + `16`-ary Dyadic Segment Tree VRVP
- [[0007-backtest-engine-adopt-vs-build|ADR-0007]]: In-process Rust replay/backtest + optional out-of-process DuckDB / `nautilus_trader` sidecars
- [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]]: Provider-agnostic `allegedly-ingest`, per-provider `rtrb` SPSC → Dispatcher, 5-tier `ProvenanceTier`, fail-closed `BookState`
- [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]]: Zero-float 12-state OMS, WAL crash reconciliation, Kill-Switch, Risk-Reduction Bypass Rule, 4 prop firms `DO-NOT-BUILD`
- [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]]: React 19 + `@ui-sdk/react` / `@ui-sdk/core` (`"0.1.0-beta.17"` via `pnpm`, per `AGENTS.md`) + Tailwind v4 + MIT `dockview` `8.9.1` + 3-tier UI settings compression + 5-level TOML cascade

---

## 5. Phase 4 Roadmap, Milestones & Release Boundaries (`Red-Team PASS: 12/12 Closed`)

All 5 Phase 4 deliverables (`[[Milestones]]`, `[[Epics-and-Stories]]`, `[[Sprint-Plan-v0.1]]`, `[[v0.1-Definition-of-Done]]`, `[[Roadmap.canvas]]`) passed adversarial re-verification in `[[Red-Team-Phase4]]` (**`verdict: PASS`**, `12/12` closed).

| Milestone | Scope Summary | Platforms | Included Epics / Stories | Release Posture |
|---|---|---|---|---|
| **`v0.1` Alpha** *(8 wks, Sprints 1–4)* | 9-crate Rust core, binary IPC, Kraken WS v2 + Coinbase WS + Synthetic Sim, `.atvault` + Parquet + 16-ary VRVP + streaming replay, Footprint/VP/single-session `u128` TPO, LWC `v5.3` + WebGL2 + Canvas2D DOM (`[Est/Max]` PIQ), React 19 + `ui-sdk` + MIT `dockview`, Luau `mlua` studies (`<= 64 MiB`), Paper OMS + WAL + Kill-Switch + Risk-Reduction Bypass, Active 5-Tier Provenance Ledger | macOS + Windows | `E01`–`E10` (`ST-01`–`ST-03`, `ST-05`–`ST-11`, `ST-13`–`ST-15`, `ST-18`–`ST-20` base, `ST-22`–`ST-29`, `ST-31`–`ST-32`, `ST-35`–`ST-36`, `ST-39`–`ST-40`) | **Unsigned/ad-hoc Alpha tag** (`SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`, `updates.checkOnStartup = false`; Tier A local + Tier B cross-OS CI) |
| **`v0.2` Beta** | Databento `.dbn.zst` + Dukascopy `.bi5` offline importers (`ST-12`), native Pop-Out `WebviewWindow` (`ST-30`), Wasmtime study runtime + WIT evaluation (`ST-33`), opt-in Alpaca Paper & tastytrade Cert Sandbox (`ST-37`), optional DuckDB sidecar (`ST-16`), Developer ID / SignPath Authenticode / Minisign Ed25519 `requireSignedVersion` + opt-in updater (`ST-41`) | macOS + Windows | `E02`, `E03`, `E04`, `E07`, `E08`, `E09`, `E10` (`ST-08` pop-out broadcast, `ST-12`, `ST-16`, `ST-30`, `ST-33`, `ST-37`, `ST-41`) | Signed Beta with opt-in Minisign-verified updates |
| **`v0.5` RC** | Live retail execution (Alpaca, tastytrade, IBKR Client Portal Web API, `ST-38`), L2 Iceberg/Spoof heuristic detectors (`SV-11`, `ST-21`), 24h `.atdepth` Liquidity Heatmap (`SV-13`, `ST-20`), multi-day `CompositeTpoRow` magnet snap (`SV-17`), provenance-gated Absorption/Unfinished Auction alerts (`SV-10`), optional `nautilus_trader` (`LGPL-3.0-only`) out-of-process sidecar (`ST-17`), signed study packages (`ST-34`) | macOS + Windows | `E03`–`E10` (`ST-17`, `ST-20` ext, `ST-21`, `ST-23`/`ST-24` ext, `ST-34`, `ST-38`) | Signed Release Candidate |
| **`v1.0` GA** | Full macOS + Windows GA qualification (`< 300 MB` full tree idle RAM, `< 2.0 s` signed cold start, `< 40 MB` installer, 30-min peak-volatility & 24h `.atdepth` soaks), CycloneDX 1.5 / SPDX 2.3 SBOMs, Sigstore Cosign OIDC, reproducible builds, WCAG AA / `Okabe-Ito` a11y audit, formal attorney trademark clearance & CFTC Rule 4.41 disclaimers (`ST-42`, `RK-04`) | macOS + Windows | `E01`–`E10` (`ST-42`) | Public Signed GA |
| **`Post-v1.0`** | Linux X11/Wayland (`WebKitGTK`, `RK-01`, `ST-04`) + optional EULA-compliant futures sidecars (never the 4 `DO-NOT-BUILD` prop firms or Sierra `.scid`) | macOS + Windows + Linux | `E01` (`ST-04`) + future sidecars | Post-GA Expansion |

### 5.1 `v0.1` Critical-Path Sprints & `KC-07` Checkpoints ([[Sprint-Plan-v0.1]])
- **Sprint 1 (Weeks 1–2):** `E01` Workspace/CI/Guards (`T01`–`T03`), `E02` Domain/Binary IPC/Workspace Hub (`T05`–`T07`), `E07` `apps/desktop` Tauri v2 + React 19 + `ui-sdk` `"0.1.0-beta.17"` (`pnpm`, no release-age bypass) + MIT `dockview` `8.9.1` (`T04`, `T08`).
- **Sprint 2 (Weeks 3–4) + `KC-07` Mid-Flight Checkpoint (Week 4):** `E03` Kraken/Coinbase/Sim SPSC ingest (`T09`), `E04` `.atvault` + Hive Parquet + `catalog.sqlite` (`T10a`), `E05` `FootprintSlabArena` + 16-ary VRVP + `u128` TPO, `E07` 5-level TOML cascade, `E09` 12-state Paper OMS + WAL + Risk-Reduction Bypass + macOS APFS `PRAGMA fullfsync = ON` bench (`T10b`).
- **Sprint 3 (Weeks 5–6) + Early `UV-03` Windows `WebView2` Smoke (Week 5):** `E06` LWC `v5.3` `5,000`/`6,000` hysteresis + WebGL2 overlays + 6 clean-room Drawings, `E07` `60 Hz` Canvas2D `DOM Ladder` & Time & Sales + `SV-15`/`SV-16` guards, `E08` Luau `mlua` flat SoA `ByteView` sandbox + `<= 64 MiB` global pool + IEEE-754/`libm` determinism.
- **Sprint 4 (Weeks 7–8) + `KC-07` Final Gate (Week 8):** `E04` Streaming 100M-tick Replay UI, `E10` Active 5-Tier Provenance Ledger + Local Diagnostics + `SV-01` zero-network offline boot + Tier B cross-OS macOS/Windows `v0.1.0` qualification.

---

## 6. Master `UNVERIFIED` Register (`UV-01`–`UV-10`, Zero Silent Promotions)

Every runtime, cross-OS, and legal item not yet empirically measured remains explicitly **`UNVERIFIED`** (mirroring [[Unverified-Claims]] and [[Sprint-Plan-v0.1]] §5):

| ID | Unverified Item | Verification Gate & Target |
|---|---|---|
| **`UV-01`** | `@ui-sdk/react` & `@ui-sdk/core` (`"0.1.0-beta.17"`) clean `pnpm` install (without bypassing release-age policy per `AGENTS.md`), React 19 compile, `axe-core` WCAG AA a11y | `v0.1` Sprint 1 (`T04`, `T08`); stop & ask Abel if `pnpm` release-age blocks install |
| **`UV-02`** | macOS APFS **`PRAGMA fullfsync = ON`** latency under batched 50-order Kill-Switch cancel wave (`<= 15 ms` target / `<= 25 ms` CI ceiling) | `v0.1` Sprint 2 (`T10b`, `allegedly-oms` bench) |
| **`UV-03`** | **Windows 10/11 (`WebView2` + `x86_64-pc-windows-msvc`)** live WebGL2 `60 fps`, `100k`-bar IPC `p95 <= 16.0 ms`, `luau0-src` C++17 build, packaged `.msi < 40 MB` | Early smoke **`v0.1` Sprint 3 Week 5** (`windows-latest` CI); full Tier B Sprint 4 |
| **`UV-04`** | `FootprintSlabArena` live RSS (`< 60 MiB`) across 10 concurrent multi-timeframe charts (`SV-13`) | `v0.1` Sprint 3 (`E05`/`E06` memory profiler) |
| **`UV-05`** | Full OS process-tree **Idle RAM `< 300 MB`** (macOS `WKWebView` XPC + Windows `WebView2` helpers) & signed/async **Cold Start `< 2.0 s`** (`SV-01`, `SV-13`) | `v0.1` Sprint 4 Tier B packaged `.app`/`.msi` harness |
| **`UV-06`** | 30-minute unattended peak-volatility Kraken+Coinbase live soak (`SOL/USD`, depth=100, `>= 1,000` trades/venue) + real user-downloaded Databento `.dbn.zst` CME sample | 30-min soak `v0.1` Sprint 4; real `.dbn.zst` fixture **`v0.2`** (`ST-12`) |
| **`UV-07`** | `TA-Lib v0.8.3` dev-only C oracle parity (`KC-06`), `10M`-row L2 MBP Parquet archive seek, and 24h `.atdepth` Liquidity Heatmap (`< 64 MB` RAM / `< 30 MB` disk, `SV-13`) | `TA-Lib` oracle `v0.1` Sprint 3; L2 archive `v0.2`; 24h `.atdepth` heatmap **`v0.5`** & `v1.0` GA |
| **`UV-08`** | Optional `wasmtime::component` (WIT) binary delta & batch overhead vs. `S07` flat-memory core (`+3.32%` vs Native), plus `.cwasm` warm cache | **`v0.2`** (`ST-33`) |
| **`UV-09`** | Live-network opt-in smoke tests against `paper-api.alpaca.markets/v2` & tastytrade Certification Sandbox | **`v0.2`** (`ST-37`, opt-in user credentials only) |
| **`UV-10`** | Formal IP/securities attorney clearance for **"Allegedly"** trademark (`RK-04`), clean-room scripting spec, `LGPL-3.0-only` `nautilus_trader` sidecar boundary, CFTC Rule 4.41 disclaimers | **`v1.0`** Pre-Public Release (`ST-42`) |

---

## 7. Governance: Risks (`RK-01`–`RK-10`), Kill Criteria (`KC-01`–`KC-07`) & First Executable Kickoff Tasks (`T01`–`T10a`/`T10b`)

- **Risks (`[[Risk-Register]]`):** `RK-01` (Linux `WebKitGTK`) deferred post-v1.0; `RK-07` (bundle size) & `RK-08` (WebGL2 sync) empirically mitigated in Phase 2; `RK-02`, `RK-03`, `RK-05`, `RK-06`, `RK-09`, `RK-10` mitigated in architecture/hygiene (`CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target`, `Allegedly Prompt.md` untracked); `RK-04` (trademark counsel) tracked for pre-public distribution.
- **Kill Criteria (`[[Kill-Criteria]]`):** `KC-01`–`KC-06` cleared on Apple M2 (Windows `WebView2` `KC-01`/`KC-02` early gate in Sprint 3 Week 5; `TA-Lib` `KC-06` oracle in Sprint 3); **`KC-07`** actively monitored at **Sprint 2 / Week 4** and **Sprint 4 / Week 8**.
- **Immediate Stage D Executable Tasks (`T01`–`T10a`/`T10b`, full specs in [[Sprint-Plan-v0.1]] §6):**
  1. **`T01`** (`E01`/`ST-01`): Cargo workspace (`9` production `allegedly-*` crates + dev-only `allegedly-docgen`), `Apache-2.0` `LICENSE`/`NOTICE`/`THIRD_PARTY_NOTICES.md`, `deny.toml` (`cargo-deny v0.22.1`), `CARGO_TARGET_DIR` external.
  2. **`T02`** (`E01`/`ST-02`): Static CI guard scripts (`check-no-floats.sh`, `check-no-legacy-prefix.sh`, `check-npm-policy.mjs`).
  3. **`T03`** (`E01`/`ST-02`): `.github/workflows/ci-pr-fast.yml` (`macos-14` + `windows-latest`).
  4. **`T04`** (`E07`/`ST-26`): `pnpm` workspace + `apps/desktop` (Tauri v2, React 19, Tailwind v4, exact `@ui-sdk/react` & `@ui-sdk/core` `"0.1.0-beta.17"` without bypassing release-age policy, MIT `dockview` `8.9.1`).
  5. **`T05`** (`E02`/`ST-05`): `allegedly-core` fixed-point types (`PriceE9`, `QtyE9`, `TimestampNs`), `ProvenanceTier`, `BookState`, `Instrument`, `Venue`, `Session`, TOML cascade.
  6. **`T06`** (`E02`/`ST-06`, `ST-08`): `allegedly-ipc` aligned `v1` binary framing (`40 B`/`32 B`/`24 B`/`16 B`/`72 B`), `16 ms` coalescer, `state_rev: u64` Workspace State Hub.
  7. **`T07`** (`E02`/`ST-07`): `packages/ipc-client` (`TransportAdapter`, `TauriTransportAdapter`, `LoopbackWsTransportAdapter`, zero-copy `DataView`/`BigInt64Array` decoders).
  8. **`T08`** (`E07`/`ST-26`, `ST-03`): Minimal single-window `apps/desktop` shell (`dockview` 3-panel layout, `PAPER / SIM`, `LIVE_ARMED = false`, `updates.checkOnStartup = false`, `SV-01`).
  9. **`T09`** (`E03`/`ST-09`–`ST-11`): `allegedly-ingest` per-provider `rtrb` SPSC → Dispatcher → `StorageRing` (Kraken WS v2, Coinbase WS w/ inversion, Synthetic Sim, fail-closed `BookState::Stale`).
  10. **`T10a`** (`E04`/`ST-13`–`ST-14`) & **`T10b`** (`E09`/`ST-35`–`ST-36`) in parallel: `allegedly-storage` (`.atvault` + Hive Parquet + `catalog.sqlite`) and `allegedly-oms` (12-state `OrderState`, WAL crash recovery, Risk-Reduction Bypass Rule, `FORBIDDEN_DO_NOT_BUILD_ADAPTERS`, macOS APFS `PRAGMA fullfsync = ON` bench).

---

## 8. Vault Navigation & Phase Audit Trail

- **Home & Trackers:** [[00-Start-Here]] | [[ADR-Status]] | [[Unverified-Claims]] | [[Blocked-Items]] | [[Worklog]]
- **Charter:** [[Charter]] | [[Constraints]] | [[Principles]] | [[Assumptions]] | [[Glossary]]
- **Architecture:** [[C4-Architecture]] | [[Data-Model]] | [[IPC-Contract]] | [[Plugin-ABI]] | [[Error-Observability]] | [[Testing-Strategy]] | [[Release-Signing-Update]] | [[Docs-Strategy]] | [[Adopt-Build-Fork]] | [[Architecture.canvas]]
- **Roadmap:** [[Milestones]] | [[Epics-and-Stories]] | [[Sprint-Plan-v0.1]] | [[v0.1-Definition-of-Done]] | [[Roadmap.canvas]]
- **Adversarial Reviews:** [[Red-Team-Phase3]] (**`PASS`**, `18/18` closed) | [[Red-Team-Phase4]] (**`PASS`**, `12/12` closed) | [[Red-Team-Phase5]] *(Final Holistic Audit)*
