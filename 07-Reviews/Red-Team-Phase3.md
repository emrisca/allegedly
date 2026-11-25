---
title: Phase 3 Architecture Adversarial Red-Team Review
type: review
status: active
phase: Phase 3
owner: red-team
updated: 2026-11-25
verdict: PASS
---

# Phase 3 Architecture Adversarial Red-Team Review

> **Scope Audited:** All 9 architecture specifications in `04-Architecture/`, all 10 ADRs (`04-Architecture/ADRs/0001`–`0010`), `90-Canvas/Architecture.canvas`, cross-checked against Charter baselines (`01-Charter/`), Risk/License/Compliance registers (`06-Risk/`), and Phase 2 spike reports & Rust source code (`03-Spikes/S01`–`S08`, `spikes/`).
>
> **Re-Verification Update (`2026-11-25`):** **Final Gate Verdict: `PASS`** — All **18/18** findings (`RT3-01`–`RT3-18`: `5/5` Blockers, `8/8` Majors, `4/4` Minors, `1/1` Nit) have been independently re-verified and **CLOSED**. See **§6 Re-Verification Pass (`2026-11-25`)** below for line-level evidence. Sections 1–5 are preserved unchanged as the original `2026-11-24` audit record.

---

## 1. Executive Verdict

**Verdict: `PASS-WITH-REQUIRED-FIXES` (Initial `2026-11-24` Audit — Superseded by `PASS` in §6 on `2026-11-25`)**

Allegedly's core architectural foundation is strong, clean-room, and unusually well anchored to Phase 2 empirical measurements (`S01`–`S08`), with disciplined copyleft/prop-firm quarantine and honest `UNVERIFIED` callouts for Windows `WebView2`, signing, and full process-tree RAM. However, the Phase 3 specification package currently fails gate sign-off due to **5 Blockers** and **8 Majors**: (1) binary IPC wire-format bugs (`i32` trade quantity overflow at `2.15` units, unaligned `u32` field at byte offset `34`, truncated `24 B` Footprint cells dropping `imbalance_flags`/`trade_count`, and missing `SYNTHETIC: 1m-INTRABAR`/`EXACT: L3-MBO` provenance variants); (2) a default-on startup update poll (`Release-Signing-Update.md`) that breaks `P1` and fails CI gate `SV-01` on first boot; (3) silent unauthorized inflation of the locked Charter idle RAM budget from `< 300 MB` to `<= 350 MB` in `C4-Architecture.md` and `ADR-0002`; (4) pervasive trademark-conflicting legacy `mv-*` crate names and `.mvanalysis.toml`/`.mvworkspace.toml` file extensions contradicting `ADR-0001` §3.2; and (5) an OMS live-trading safety trap where `BookState::Stale` / `RECONCILING` blocks order submission without exempting protective `reduce_only` exits, cancels, or Kill-Switch flatten. None of these require abandoning the selected stack or re-running Phase 2 — all are cleanly patchable specification defects that must be closed before entering Phase 4 Roadmap planning.

### Finding Counts by Severity

| Severity | Count | Gate Impact |
|---|---:|---|
| **Blocker** | **5** | **Blocks Phase 3 Gate sign-off** (`RT3-01`–`RT3-05`) |
| **Major** | **8** | **6 must fix before Phase 3 Gate** (`RT3-06`–`RT3-08`, `RT3-10`, `RT3-12`, `RT3-13`); 2 can close in parallel with Phase 4 kickoff (`RT3-09`, `RT3-11`) |
| **Minor** | **4** | Recommended pre-gate cleanup (`RT3-14`–`RT3-17`) |
| **Nit** | **1** | Optional polish (`RT3-18`) |
| **Total** | **18** | — |

---

## 2. Findings Summary Table

| ID | Severity | Area | Target Document(s) | Summary |
|---|---|---|---|---|
| **RT3-01** | **Blocker** | IPC Wire / Data Model | `IPC-Contract.md`, `Data-Model.md`, `Plugin-ABI.md` | `i32` qty overflow at `2.15` units, unaligned `u32` at offset `34`, `24 B` truncated Footprint cells, omitted `SYNTHETIC`/`L3-MBO` provenance & 3-way `BookState` drift |
| **RT3-02** | **Blocker** | Offline Sovereignty (`SV-01`) | `Release-Signing-Update.md` | Default-on `updates.checkOnStartup` fires outbound DNS/HTTPS on fresh boot, violating `P1` and failing CI gate `SV-01` |
| **RT3-03** | **Blocker** | Charter Budget Drift | `C4-Architecture.md`, `ADR-0002` | Silently inflates locked Charter idle RAM budget from `< 300 MB` to `<= 350 MB` and misquotes `Constraints.md` |
| **RT3-04** | **Blocker** | Brand / Naming (`RK-04`) | 11 Phase 3 docs (`C4`, `Data-Model`, `IPC`, `ADRs`, etc.) | Pervasive retired `mv-*` crate names, `.mvanalysis.toml`/`.mvworkspace.toml`/`.mvdepth` extensions, and 5 uncatalogued crate names contradicting `ADR-0001` §3.2 |
| **RT3-05** | **Blocker** | OMS Execution Safety | `IPC-Contract.md`, `ADR-0009`, `Data-Model.md` | `BookState::Stale` & `RECONCILING` lock live `oms.submit_order` without exempting `reduce_only` exits, `cancel_order`/`cancel_all`, or Panic Kill-Switch flatten |
| **RT3-06** | **Major** | Concurrency Architecture | `C4-Architecture.md` | Single `rtrb` **SPSC** ring wired to multi-venue producers and **2 simultaneous consumers** (`MvOrderflow` + `MvStorage`) |
| **RT3-07** | **Major** | Charter Traceability (`SV-*`) | `Testing-Strategy.md`, `ADR-0009`, `ADR-0010`, `IPC-Contract.md`, `Release-Signing-Update.md` | Scrambled `SV-01`–`SV-20` IDs across 5 docs, 8 `SV-*` IDs missing from test matrix, and citation to non-existent `Constraints #9` |
| **RT3-08** | **Major** | Study Sandbox / Determinism | `Plugin-ABI.md`, `ADR-0005`, `Data-Model.md` | WIT Component Model conflated with `S07` flat-memory benchmark; `f64`→`s64` cross-OS SHA-256 drift hole; no global multi-chart RAM cap (`10×10×32 MiB = 3.2 GiB`) |
| **RT3-09** | **Major** | Viewport Windowing / Multi-Window | `IPC-Contract.md`, `ADR-0003` | Live-tail `5,500`-bar trim triggers `80.7 ms` `setData()` freeze during live trading; missing Study warmup & multi-window conflict-resolution protocol |
| **RT3-10** | **Major** | OMS / TPO Schema Drift | `Testing-Strategy.md`, `Data-Model.md`, `IPC-Contract.md`, `ADR-0006`, `ADR-0009` | Invented OMS states (`PendingSubmit`/`Working`), contradictory macOS `PRAGMA fullfsync = ON` policy, and `u64` `TpoRow` truncating `> 64`-period TPO profiles |
| **RT3-11** | **Major** | Stale Phase 1/2 Matrix | `Adopt-Build-Fork.md` | Contradicts locked Phase 3 ADRs (`base-4` vs `16-ary` segment tree, `Rhai OR Luau`, conditional `DataFusion`, wrong `S04` Linux WebKitGTK citation) |
| **RT3-12** | **Major** | Traceability & Phase Scope | `ADR-0001`, `ADR-0002`, `ADR-0008`, `C4-Architecture.md`, `IPC-Contract.md` | 4 broken spike wikilinks, 5 fabricated `code_refs` paths, and Plan-Only Phase 4/5 conflated with production implementation/CI |
| **RT3-13** | **Major** | Architecture Canvas | `90-Canvas/Architecture.canvas` | Misclassifies in-process clean retail brokers (Alpaca/tastytrade/IBKR) as out-of-process sidecars; 4 orphan nodes; omits `ADR-0001` |
| **RT3-14** | **Minor** | License Registry & UI Beta | `License-Registry.md`, `Docs-Strategy.md`, `Error-Observability.md`, `ADR-0010` | 9 newly introduced permissive deps omitted from `License-Registry.md`; `ADR-0010` selects `4.61` beta over `4.85` fallback without explicit directive note |
| **RT3-15** | **Minor** | ADR Matrix Arithmetic | `ADR-0001`, `0002`, `0003`, `0005`, `0006`, `0008` | 13 weighted-total arithmetic mismatches across 6 ADRs (none change any winner) |
| **RT3-16** | **Minor** | Cross-Doc Parameter Drift | `ADR-0001`, `ADR-0008`, `IPC-Contract.md` | `ADR-0008` mislabels market-data risk as `RK-03` (should be `RK-02`), ring capacity `1024–4096` vs `16,384`, `ADR-0001` cites `Constraints #5` for `$0` `.dmg` |
| **RT3-17** | **Minor** | Byte-Size & Sum Rounding | `Data-Model.md`, `ADR-0002`, `ADR-0005`, `ADR-0006` | `NormalizedTick` field list sums to `69 B` vs `72 B` (omits `_pad: [u8; 3]`); `S07` combined `gzip-9` sum `+2.21 MiB` vs exact `+2.20 MiB` |
| **RT3-18** | **Nit** | Glossary & Crate Hygiene | `ADR-0005`, `Data-Model.md`, `Testing-Strategy.md`, `C4-Architecture.md`, `Docs-Strategy.md` | 3 uses of avoided term `indicator` instead of `Study`; `allegedly-runtime-wasm` and `allegedly-docgen` omitted from `C4-Architecture.md` crate inventory |

---

## 3. Detailed Findings

### Blockers

#### `RT3-01` — Binary IPC Wire-Format Overflow (`i32` Qty), Unaligned Struct Offset, Dropped Order-Flow Columns & Broken Provenance Enum
- **Severity:** `Blocker`
- **Citations:**
  - `04-Architecture/IPC-Contract.md` §3.2 L113–L126 (`OHLCV_BARS_SOA`, `FOOTPRINT_SLAB_SOA`, `VOLUME_PROFILE_SOA`, `LIVE_TRADE_BATCH`, `LIVE_BAR_UPDATE_BATCH`, `LIVE_FOOTPRINT_DELTA`, `STREAM_STATUS_FRAME`, `ProvenanceKind`)
  - `04-Architecture/IPC-Contract.md` §6 L191–L198 (`BookState`)
  - `04-Architecture/Data-Model.md` §1 L37, §3.1 L106–L118, §3.2 L122–L126
  - `04-Architecture/Plugin-ABI.md` §3.1 L126, L160, L182
- **Failure Scenarios:**
  1. **Silent Quantity Overflow (`LIVE_TRADE_BATCH` `0x0101`, L117):** `qty` is typed `i32`, whereas `Data-Model.md` locks canonical quantities to `QtyE9(i64)` (`1e-9` fixed-point). `i32::MAX` (`2,147,483,647`) overflows at **`2.147483647` units** — any Kraken/Coinbase trade `>= 2.15` BTC/ETH or any `>= 3`-share equity print wraps negative or saturates, corrupting Time & Sales and CVD. Meanwhile `LIVE_L2_BOOK_BATCH` (`0x0102`, L118) uses `qty: i64`.
  2. **Value-Area Delta Overflow & Price-Unit Ambiguity (`VOLUME_PROFILE_SOA` `0x0003`, L115):** `vah_tick: i32_delta` and `val_tick: i32_delta` overflow if `price_tick` carries `PriceE9` (`$2.15+` value-area width exceeds `i32::MAX`). `IPC-Contract.md` §1/§3 mixes `price_scale_exp` (`1e-9`) and `price_tick` without locking whether binary frames carry `PriceE9` or integer `PriceTicks`.
  3. **Unaligned `u32` Field (`STREAM_STATUS_FRAME` `0x0201`, L121):** After the `24 B` header, `seq: u64` (`8 B`) + `book_state: u8` (`1 B`) + `provenance: u8` (`1 B`) places `dropped_total: u32` at **byte offset `34`** (`34 % 4 != 0`), violating `IPC-Contract.md` §1 #2's alignment invariant and breaking zero-copy typed-array / `#[repr(C)]` deserialization.
  4. **Dropped Order-Flow Fields (`0x0002`, `0x0104`, `0x0001`, `0x0103`):** `Data-Model.md:126` locks `FootprintCell` as **`32 B`** (`price_tick`, `bid_vol`, `ask_vol`, `trade_count: u32`, `imbalance_flags: u8`, `_pad: [u8; 3]`). `IPC-Contract.md:114,120` truncates Footprint cells to **`24 B`**, stripping `trade_count` and `imbalance_flags` (`BIT_BUY_IMBAL`, `BIT_SELL_IMBAL`, `BIT_POC`, `BIT_UNFINISHED`) so the WebGL2 renderer cannot render diagonal imbalances, POC highlights, or unfinished auctions without recomputing order-flow math in JS. Similarly, `OHLCV_BARS_SOA` (`0x0001`, L113) and `LIVE_BAR_UPDATE_BATCH` (`0x0103`, L119) drop `buy_volume`, `sell_volume`, `delta`, and `is_closed` from `Data-Model.md:122` `Bar`.
  5. **Broken Provenance & `BookState` Enums:** `IPC-Contract.md:125` `ProvenanceKind` (`0..5`: `Native | InferredLeeReady | InferredTickRule | PartialIex | OtcIndicative | Delayed`) omits **`SYNTHETIC: 1m-INTRABAR`** and **`EXACT: L3-MBO`** from `Data-Model.md:106` & `Plugin-ABI.md:182` (`ProvenanceTier`), making `P5` / `SV-10` non-enforceable over IPC. `BookState` diverges three ways across `IPC-Contract.md:191-198`, `Data-Model.md:118`, and `Plugin-ABI.md:160`.
- **Minimal Concrete Fix:**
  - Change `LIVE_TRADE_BATCH` (`0x0101`) to **`40 B` stride** (`seq: u64`, `ts_ns: i64`, `price_e9: i64`, `qty_e9: i64`, `flags: u32`, `_pad: u32`) and lock price/qty scaling explicitly (`price_e9` vs `price_ticks`) per frame type in §3.1.
  - Change `VOLUME_PROFILE_SOA` (`0x0003`) summary to `24 B` (`poc_price: i64`, `vah_price: i64`, `val_price: i64`).
  - Align `STREAM_STATUS_FRAME` (`0x0201`) to `16 B` (`seq: u64`, `dropped_total: u32`, `reason_code: u16`, `book_state: u8`, `provenance_tier: u8`).
  - Expand `FOOTPRINT_SLAB_SOA` & `LIVE_FOOTPRINT_DELTA` cells to the canonical **`32 B`** `FootprintCell` (`Data-Model.md:126`), and add `buy_vol`, `sell_vol`, `flags` (`is_closed` bit) to bar frames (or add a dedicated `BAR_DELTA_SOA` companion).
  - Unify `ProvenanceTier` (bits `2..4` encoding all 5 canonical tiers: `0=ExactL3Mbo`, `1=ExactTickAggr`, `2=EstimatedL1Quote`, `3=EstimatedTickRule`, `4=SyntheticIntrabar`, plus separate bits for `PartialVenue` / `OtcIndicative` / `Delayed`) and one canonical `BookState` enum across `Data-Model.md`, `IPC-Contract.md`, and `Plugin-ABI.md`.

---

#### `RT3-02` — Default-On Startup Auto-Update Poll Violates `P1` and Fails CI Gate `SV-01`
- **Severity:** `Blocker`
- **Citations:**
  - `04-Architecture/Release-Signing-Update.md` §3.2 L57
  - `01-Charter/Principles.md` `P1` & `SV-01` (Zero-Network Offline Boot)
  - `04-Architecture/Error-Observability.md` §2.2 L54
  - `04-Architecture/Testing-Strategy.md` §4 L190
- **Failure Scenario:** `Release-Signing-Update.md:57` specifies: *"On startup (unless disabled via `updates.checkOnStartup = false`), the app checks `latest.json` asynchronously in the background."* Because `updates.checkOnStartup` defaults to `true`, launching a fresh profile with no live Provider or Broker enabled immediately performs an outbound DNS lookup and HTTPS `GET` to `github.com`. This directly violates `P1` (zero unsolicited network calls) and automatically fails the `SV-01` CI gate (`0` outbound DNS/TCP/UDP packets in an isolated network namespace) on Day 1.
- **Minimal Concrete Fix:** Flip the default in `Release-Signing-Update.md` §3.2 L57 to **`updates.checkOnStartup = false`** (opt-in toggle in Settings or explicit manual *"Check for Updates"* action via Command Palette). Document that fresh profiles emit `0` packets until the user explicitly enables update checks or connects a live feed.

---

#### `RT3-03` — Unauthorized Charter Idle RAM Budget Inflation (`< 300 MB` Silently Raised to `<= 350 MB`)
- **Severity:** `Blocker`
- **Citations:**
  - `04-Architecture/C4-Architecture.md` §6 L212 (`<= 350 MB`)
  - `04-Architecture/ADRs/0002-desktop-shell-and-binary-ipc.md` L28, L41, L85, L100, L112 (`<= 350 MB`, falsely citing `[[Constraints]]` as `RAM (<= 350 MB)`)
  - Contradicts: `01-Charter/Constraints.md` #5 (`< 300 MB`), `01-Charter/Principles.md` `SV-13` (`< 300 MB`), `04-Architecture/Testing-Strategy.md` L134 & L196 (`< 300 MB`), `04-Architecture/Data-Model.md`, `04-Architecture/Error-Observability.md`, `04-Architecture/ADRs/0006-tiered-storage-and-replay.md`.
- **Failure Scenario:** Two foundational architecture documents silently relax a locked Charter NFR by `+50 MB` (`+16.7%`) and misattribute `<= 350 MB` to `Constraints.md`. Downstream Phase 4 milestones and CI thresholds will conflict between `< 300 MB` (`Testing-Strategy.md`) and `<= 350 MB` (`C4-Architecture.md` / `ADR-0002`), masking full OS process-tree (`WKWebView`/`WebView2` helper) RAM regressions.
- **Minimal Concrete Fix:** Restore **`< 300 MB`** in `C4-Architecture.md:212` and `ADR-0002` (L28, L41, L85, L100, L112) so every spec matches `Constraints.md` #5 and `SV-13` (or obtain an explicit user-approved revision to `Constraints.md` #5 and `SV-13` — never silently inflate a Charter constraint inside an ADR).

---

#### `RT3-04` — Pervasive Retired Trademark Prefix (`mv-*` Crates & `.mv*` File Extensions) Contradicting `ADR-0001` §3.2 & `RK-04`
- **Severity:** `Blocker`
- **Citations:**
  - `04-Architecture/ADRs/0001-license-brand-and-platform-scope.md` §3.2 L90 (*"Zero Legacy Residue: Never use `MotiveView`, `MotiveScript`, or `Pine` in product UI, crate names, CLI flags, bundle identifiers, or marketing copy."*)
  - `mv-*` crate names still appear in **11 Phase 3 docs** (`C4-Architecture.md`, `IPC-Contract.md`, `Error-Observability.md`, `Testing-Strategy.md`, `Release-Signing-Update.md`, `Docs-Strategy.md`, `Adopt-Build-Fork.md`, `ADR-0002`, `ADR-0003`, `ADR-0008`, `ADR-0009`), alongside **`allegedly-*`** in **7 Phase 3 docs** (`Data-Model.md`, `Plugin-ABI.md`, `ADR-0005`, `ADR-0006`, `ADR-0007`, etc.) — plus **3 uncatalogued legacy crate names** (`mv-types` in `Testing-Strategy.md:44`; `mv-broker` and `mv-app` in `Error-Observability.md:45–46`).
  - Retired **`.mvanalysis.toml`**, **`.mvworkspace.toml`**, **`.mvtemplate.toml`**, and **`.mvdepth`** file extensions appear in **7 Phase 3 docs** (`C4-Architecture.md`, `Data-Model.md:145,148,293,320`, `Plugin-ABI.md`, `Testing-Strategy.md:86`, `Adopt-Build-Fork.md:25,62`, `ADR-0003`, `ADR-0010:90,137`).
- **Failure Scenario:** Shipping Cargo crates named `mv-*` and user-facing `.mvanalysis.toml`/`.mvworkspace.toml` files embeds the retired `MotiveView` (`mv`) trademark prefix directly into permanent on-disk formats and public GitHub crates, contradicting `ADR-0001` §3.2 and reopening `RK-04` brand-collision risk, while breaking cross-crate naming consistency between docs (`allegedly-oms` vs `mv-oms` vs `mv-broker`).
- **Minimal Concrete Fix:** Standardize 100% of Phase 3 docs on canonical **`allegedly-*`** Cargo crate names (`allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-studies`, `allegedly-replay`, `allegedly-oms`, `allegedly-ipc`, `allegedly-app`) and Allegedly-branded extensions (e.g., `.allegedly.toml` / `analysis.toml`, `workspace.toml`, `template.toml`, `.atdepth` matching `.atvault`). Add a `CI` grep check blocking `mv-` and `.mv` in new code/schemas.

---

#### `RT3-05` — Live-Trading Safety Trap: `BookState::Stale` / `RECONCILING` Blocks Exits & Missing Reduce-Only / Kill-Switch Exemption
- **Severity:** `Blocker`
- **Citations:**
  - `04-Architecture/IPC-Contract.md` §4 L142 (`oms.submit_order` *"rejects live broker routing unless `live_armed === true` AND `book_state === \"Live\"`"*), §6 L208 (*"Click-to-trade submission on DOM Ladder and Price Axis is automatically locked until `BookState::Live` resumes (checked both in UI and authoritatively in Rust `mv-oms`)."*)
  - `04-Architecture/ADRs/0009-oms-broker-and-prop-firm-strategy.md` §3 D3 L70–L71
  - `spikes/S06-oms-paper-execution/src/oms.rs` L319, L1018–L1053 (`trigger_kill_switch` correctly bypasses `is_reconciling()`, but the Phase 3 spec does not codify this invariant!)
- **Failure Scenario:** A trader holds an open leveraged futures/crypto position during a violent market spike. The market-data WebSocket suffers a sequence gap or bounded-ring drop, flipping `book_state` to `BookState::Stale` (or the broker WS reconnects and triggers `RECONCILING`). Under `IPC-Contract.md:142,208`, `oms.submit_order` unconditionally rejects live routing when `book_state !== "Live"`, and `oms.*` lacks an explicit `oms.cancel_all` / `oms.trigger_kill_switch` vs `oms.flatten_all` bypass contract. The trader is locked out of closing or reducing their live exposure precisely during a flash crash!
- **Minimal Concrete Fix:** Amend `IPC-Contract.md` §4 L142 & §6 L208, `Data-Model.md` §3.3, and `ADR-0009` §3 D3 to lock an explicit **Risk-Reduction Bypass Rule**:
  1. `BookState::Stale` and `RECONCILING` **MUST block** all risk-increasing entries (`new position` / `increase position`), while **ALWAYS permitting** `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch` (`flatten_all`), and explicit `reduce_only: true` market/limit closing orders (with a loud red warning banner: *"FEED STALE — RISK-REDUCING EXITS ONLY"*).
  2. Add `oms.cancel_all`, `oms.trigger_kill_switch`, and `oms.reconcile_now` explicitly to `IPC-Contract.md` §4 `oms.*`.

---

### Majors

#### `RT3-06` — SPSC Concurrency Bug: Single `rtrb` Ring Wired to Multi-Venue Producers and 2 Consumers
- **Severity:** `Major`
- **Citations:** `04-Architecture/C4-Architecture.md` §3 L124, L133–L135 (`HotRing["Lock-Free SPSC Ring (rtrb v0.4.1)"]` with edges `MvIngest --> HotRing`, `HotRing --> MvOrderflow`, `HotRing --> MvStorage`).
- **Failure Scenario:** `rtrb` is strictly **Single-Producer, Single-Consumer** (`Producer<T>` and `Consumer<T>` are `!Clone`). It cannot simultaneously receive pushes from multiple concurrent exchange WS tasks (Kraken + Coinbase + Databento) AND be drained independently by both `MvOrderflow` and `MvStorage` without unsafe splitting or data loss (each consumer would steal half the ticks!).
- **Minimal Concrete Fix:** Replace the broken 1-ring fan-out in `C4-Architecture.md` §3 with an explicit **per-provider SPSC ring (`rtrb`) → single-threaded Core Event Dispatcher** (which feeds `allegedly-orderflow` inline and pushes batched records into a dedicated second `rtrb` SPSC ring drained by `allegedly-storage`).

---

#### `RT3-07` — Massively Scrambled `SV-01`–`SV-20` Charter Traceability & Citation to Non-Existent `Constraints #9`
- **Severity:** `Major`
- **Citations:**
  - Canonical source: `01-Charter/Principles.md` §3 (`SV-01`..`SV-20`) & `01-Charter/Constraints.md` (`#1`–`#8` only).
  - `04-Architecture/Testing-Strategy.md` L23 (cites non-existent `[[Constraints]] #9`), L76 (`SV-05` ≠ sandbox escape), L98 (`SV-07` ≠ replay), L154 (`SV-09` ≠ provenance, `SV-17` ≠ Kill-Switch), §4 L190–L196 (scrambles `SV-02`, `SV-05`, `SV-07`, `SV-09`, `SV-14`, `SV-17` and omits `SV-03`, `SV-04`, `SV-06`, `SV-10`, `SV-12`, `SV-13`, `SV-18`, `SV-19`).
  - `04-Architecture/ADRs/0010-ui-kit-docking-and-settings-as-code.md` L29, L82 (`SV-01` used for `SV-03`), L91 (`SV-07` used for `SV-02`), L29 (`SV-15` for perf HUD, `SV-20` for telemetry).
  - `04-Architecture/ADRs/0009-oms-broker-and-prop-firm-strategy.md` L25, L45, L46, L69 (`SV-17` used for Kill-Switch — actually Magnet Snap; `SV-02` for local-first — actually Command Palette).
  - `04-Architecture/IPC-Contract.md` L226 (`SV-15` used for Performance HUD — actually Price-Axis Safety Guard).
  - `04-Architecture/Release-Signing-Update.md` L23, L54 (`SV-02` used for zero-telemetry).
- **Failure Scenario:** Phase 4 test-gate mapping and Phase 5 `Plan-of-Record.md` verification will check off the wrong Charter invariants, leaving 8 mandatory UX/performance gates (`SV-03`, `SV-04`, `SV-06`, `SV-10`, `SV-12`, `SV-13`, `SV-18`, `SV-19`) completely unmapped in `Testing-Strategy.md`.
- **Minimal Concrete Fix:** Rebuild `Testing-Strategy.md` §4 with a complete 20-row `SV-01`–`SV-20` table verbatim-aligned to `01-Charter/Principles.md` §3, fix `Constraints #9` → `Constraints #8` / `ADR-0009` in `Testing-Strategy.md:23`, and correct all misnumbered `SV-*` citations in `ADR-0009`, `ADR-0010`, `IPC-Contract.md`, and `Release-Signing-Update.md`.

---

#### `RT3-08` — Study Sandbox Holes: Unmeasured WIT Component-Model Perf, Float-to-`s64` Cross-OS Determinism Gap & Missing Global RAM Cap
- **Severity:** `Major`
- **Citations:**
  - `04-Architecture/Plugin-ABI.md` §1 L37–L44, §2 L76, §3.2 L182–L193, §6 L299
  - `04-Architecture/ADRs/0005-study-runtime-and-scripting-language.md` §3–§4
  - `04-Architecture/Data-Model.md` §1 L46–L48
- **Failure Scenarios:**
  1. **Benchmark-to-ABI Mismatch:** `Plugin-ABI.md:193` attaches `S07`'s `1.679 ms / 100k bars` measurement directly to a **WIT Component Model** signature (`list<bar-input>` → `list<study-output>` containing nested `list<option<s64>>`), even though §6 L299 admits `S07` ran flat core linear-memory `f64` pointers with `component-model` **disabled**. Per-bar nested-list canonical-ABI marshaling over `100,000` bars will invalidate the `1.679 ms` latency and `+1.74 MiB` binary budget.
  2. **Cross-OS SHA-256 Determinism Contradiction (`SV-09`):** `Data-Model.md:48` allows `f64` math inside `allegedly-studies`, and Luau's only numeric type is IEEE-754 `f64`. Yet `Plugin-ABI.md` & `ADR-0005` promise 100% bit-identical cross-OS (`arm64` macOS vs `x86_64` Windows) SHA-256 replay into `plot-values-e9: list<option<s64>>` (`Plugin-ABI.md:186`) without specifying: (a) deterministic `f64 -> s64` rounding mode and `NaN`/`±Inf` clamping, (b) Cranelift `cranelift_nan_canonicalization(true)` and FMA contraction disablement, or (c) pure-software `libm` for transcendental functions (`sqrt` in `±2σ` VWAP bands) so OS `libm` ULP differences cannot break SHA-256 parity.
  3. **Multi-Chart Memory DoS:** `Plugin-ABI.md:44,76` caps memory per study instance (`32 MiB` default, `64 MiB` ceiling) with **zero global terminal-wide study memory pool cap**. A workspace with `10` charts × `10` studies (`100` instances × `32 MiB`) can legally allocate **`3.2 GiB`**, exceeding the `< 300 MB` RAM budget by `> 10×`.
- **Minimal Concrete Fix:**
  - Lock a flat SoA linear-memory / `ByteView` batch ABI for `100k`-bar study warmups (or gate `wasmtime::component` on a mandatory `v0.1` size+latency spike before adopting nested WIT lists).
  - Specify deterministic float boundaries in `Plugin-ABI.md` §5: `cranelift_nan_canonicalization(true)`, IEEE-754 round-ties-to-even `f64 -> s64` with explicit `NaN -> None`, and fixed software `libm` (or restrict SHA-256 bit-exact `SV-09` claims on Tier-3 Luau scripts to deterministic pure-integer/non-transcendental outputs unless Luau links deterministic `libm`).
  - Add a **global terminal-wide study memory budget** (e.g., `<= 64 MiB` total active across all charts/panes, LRU-evicting background hidden-tab study state before OOM).

---

#### `RT3-09` — Live-Tail `5,500`-Bar Trim Freezes Live Charts (`80.7 ms`) & Missing Study Warmup / Multi-Window Conflict Protocol
- **Severity:** `Major`
- **Citations:**
  - `04-Architecture/IPC-Contract.md` §5 L148, L178–L182, §7 L213–L219
  - `04-Architecture/ADRs/0003-chart-base-and-viewport-windowing.md` §4 (claims `80.7 ms` seam hitch is *"completely absent during live trading"*)
- **Failure Scenarios:**
  1. `IPC-Contract.md:182` silently trims the oldest `500` bars when the live tail exceeds `5,500` bars. In `Lightweight Charts v5.3.0`, trimming front bars requires calling `series.setData(new5000)`, which `S01` measured at **`80.7 ms`** (~5 dropped frames). On a `1s` bar chart that stutters every `8.3` minutes; on a `100`-tick chart during NY open it stutters every few seconds — directly contradicting `ADR-0003` §4.
  2. §5 does not specify how **Study warmup** (e.g., `200`-bar EMA or Session VWAP anchored `> 5,000` bars ago) stays accurate when LWC only holds `5,000` bars, nor how **historical jump-to-date** / weekend-gap windows behave.
  3. §7 uses dual channels (Rust Hub + `BroadcastChannel`) with no monotonic workspace revision number or single-writer conflict policy if two pop-out windows mutate a Layout/Drawing concurrently.
- **Minimal Concrete Fix:**
  - Explicitly document the `80.7 ms` live-tail trim cost in `ADR-0003` §4 and schedule trims **only between bars on an idle frame** (`requestIdleCallback` with `max_window = 6,000` hysteresis, or evaluate LWC `v5.3` `pop()`/tail-trim APIs) so high-frequency tick charts don't thrash.
  - Lock in `IPC-Contract.md` §5 that **Rust (`allegedly-studies`) always computes studies over full session/lookback history** and only ships the windowed `<= 5,000`-bar plot values over IPC.
  - Add a monotonic `state_rev: u64` owned by Rust `allegedly-ipc` to `WorkspaceSyncEvent` (§7) with last-writer-wins rejection of stale client patches.

---

#### `RT3-10` — OMS State-Machine Contradiction, Conflicting `PRAGMA fullfsync = ON` Policy & `TpoRow` `u64` 64-Period Truncation
- **Severity:** `Major`
- **Citations:**
  - `04-Architecture/Testing-Strategy.md` §2.1 L59 vs `04-Architecture/Data-Model.md` §3.3 L151 (`S06`)
  - `04-Architecture/Data-Model.md` §4.4 L248, L348 & `ADR-0006` vs `ADR-0009` §3 D2 L67, §6 L132
  - `04-Architecture/Data-Model.md` §3.2 L134 (`TpoRow.bracket_mask: u64`) & `04-Architecture/IPC-Contract.md` §3.2 L116 (`TPO_PROFILE_BITMASK` `period_mask: u64`)
- **Failure Scenarios:**
  1. `Testing-Strategy.md:59` defines OMS transitions starting with `PendingSubmit → Working → ...`, contradicting the canonical 12-state machine (`IntentLogged`, `PendingNew`, `Accepted`, `PartiallyFilled`, `Filled`, `PendingCancel`, `Canceled`, `PendingReplace`, `Replaced`, `Rejected`, `Expired`, `UnknownPendingReconcile`) verified in `S06` and locked in `Data-Model.md:151`.
  2. `Data-Model.md:248` & `ADR-0006` mandate `PRAGMA fullfsync = ON` unconditionally on macOS when `BrokerLive` is armed, whereas `ADR-0009:67,132` makes it configurable/batched and warns of unverified `2–5 ms` kill-switch write-amplification spikes on macOS APFS.
  3. `TpoRow.bracket_mask: u64` (`Data-Model.md:134`, `IPC-Contract.md:116`) silently overflows/truncates at **`64` periods**. While 30m 24h Crypto (`48` periods) and CME Globex (`46` periods) fit, a **15-minute 24h TPO profile (`96` periods)** or a **5-day/weekly composite TPO (`240–336` periods)** overflows `u64`.
- **Minimal Concrete Fix:**
  - Align `Testing-Strategy.md:59` verbatim to `Data-Model.md:151`'s 12-state `OrderState` enum.
  - Unify macOS `PRAGMA fullfsync = ON` policy across `Data-Model.md`, `ADR-0006`, and `ADR-0009`: mandate `fullfsync = ON` for `BrokerLive` **paired with single-transaction batched Kill-Switch WAL commits** (1 `F_FULLFSYNC` per 50-order cancel wave instead of 50), gated by an explicit macOS APFS `v0.1` benchmark.
  - Upgrade `TpoRow` / `TPO_PROFILE_BITMASK` from `u64` to **`u128`** (covers up to 128 brackets = 15m 24h sessions natively in 2 registers) plus a variable-word bitset for multi-day composites.

---

#### `RT3-11` — Stale `Adopt-Build-Fork.md` Contradicts Locked Phase 2/3 Decisions
- **Severity:** `Major`
- **Citations:** `04-Architecture/Adopt-Build-Fork.md` L20, L25–L27, L33, L62–L72.
- **Failure Scenario:** `Adopt-Build-Fork.md` was never reconciled after Phase 2 spikes and Phase 3 ADRs. It still states:
  - Row 1 (L20): *"if Linux WebKitGTK fails Spike `S04` (`KC-02`)"* — wrong spike (`S04` was DOM CSS perf) and Linux is deferred post-`v1.0` (`ADR-0001`).
  - Row 7 (L26) & `B3` (L65): **"base-4 dyadic segment trees"** — contradicts `S08`, `C4-Architecture.md`, `Data-Model.md`, and `ADR-0006`, which lock **16-ary** dyadic segment trees.
  - Row 8 (L27): *"Embed `DataFusion` if Spike `S08` proves binary delta `<= 12 MB`"* — already rejected in `ADR-0006`.
  - Row 14 (L33) & `B6a` (L71): *"Rhai OR Luau"* / *"S07 chooses Rhai vs Luau"* — already locked to **Luau** (and Rhai rejected) in `S07` & `ADR-0005`.
  - Multiple rows retain `mv-*` and `.mvanalysis.toml`.
- **Minimal Concrete Fix:** Reconcile `Adopt-Build-Fork.md` rows 1, 6, 7, 8, 10, 13, 14, 15, 16 and §3 `B2`–`B6` to reflect locked Phase 3 decisions (`ADR-0001`–`0010`), `16-ary` trees, `Luau`, rejected `DataFusion`/`Rhai`, `allegedly-*` crates, and post-`v1.0` Linux scope.

---

#### `RT3-12` — Broken Wikilinks (`4`), Fabricated `code_refs` (`5`), & Charter Phase-Scope Conflation
- **Severity:** `Major`
- **Citations:**
  - **4 broken Obsidian wikilinks:**
    - `04-Architecture/ADRs/0001-license-brand-and-platform-scope.md` L152–L154: `[[03-Spikes/S02-Tauri-IPC-WebGL-MultiPane]]`, `[[03-Spikes/S07-Study-Sandbox-Benchmark]]`, `[[03-Spikes/S08-Parquet-SQLite-Vault-Bench]]`
    - `04-Architecture/ADRs/0008-market-data-provider-abstraction-and-provenance.md` L192: `[[03-Spikes/S08-Parquet-SQLite-Vault-Bench]]`
  - **5 non-existent `code_refs` frontmatter paths:**
    - `spikes/S02-tauri-ipc-throughput/src-tauri/src/main.rs` (`C4-Architecture.md:10`, `IPC-Contract.md:10`, `ADR-0002:10` — actual file: `spikes/S02-tauri-ipc-throughput/src/tauri_bench.rs`)
    - `spikes/S02-tauri-ipc-throughput/src/protocol.rs` (`IPC-Contract.md:11`, `ADR-0002:11` — actual file: `spikes/S02-tauri-ipc-throughput/src/framing.rs`)
  - **Phase-Scope Conflation:** `01-Charter/Charter.md` §2–§3 locks Phases 0–5 as **PLAN-ONLY** (Phase 4 = Roadmap planning, Phase 5 = Red-Team & `Plan-of-Record.md`). Yet `ADR-0001:110,120` and `ADR-0008:161,178` refer to *"Phase 5 production code / Windows CI / 30-min soak"*, and 10+ docs label implementation CI gates *"Phase 4 CI / Phase 4 PR"*.
- **Failure Scenario:** Violates Charter Definition of Done (*zero broken wikilinks*), breaks automated `code_refs` validation, and blurs the non-negotiable Charter boundary between **Planning Phases 0–5** and **Post-Plan Execution (`v0.1`–`v1.0`)**.
- **Minimal Concrete Fix:** Fix the 4 spike wikilinks to actual filenames (`S02-Tauri-IPC-Throughput`, `S07-Scripting-Sandbox`, `S08-Storage-100M-Replay`), update the 5 `code_refs` to `tauri_bench.rs` and `framing.rs`, and replace *"Phase 4 CI / Phase 5 scaffolding"* with **`v0.1` Implementation CI (post-Phase-5)** across Phase 3 docs.

---

#### `RT3-13` — `Architecture.canvas` Misclassifies In-Process Retail Brokers as Sidecars & Has 4 Disconnected Orphan Nodes
- **Severity:** `Major`
- **Citations:** `90-Canvas/Architecture.canvas` (nodes `n-sidecars`, `n-charter`, `n-constraints`, `n-c4`, `n-ops`).
- **Failure Scenario:**
  1. `n-sidecars` (*"Optional Out-of-Process Sidecars"*) lists `Clean Retail Brokers (Alpaca / tastytrade / IBKR)` alongside `NautilusTrader` (`LGPL-3.0-only`) and `DuckDB` — directly contradicting `C4-Architecture.md`, `Plugin-ABI.md`, and `ADR-0009` where Alpaca, tastytrade, and `rust-ibapi` are **in-process Rust `BrokerAdapter`s**, NOT out-of-process sidecars.
  2. 4 of 11 nodes (`n-charter`, `n-constraints`, `n-c4`, `n-ops`) are disconnected floating islands with zero edges.
  3. **`ADR-0001`** is missing from the entire canvas (ADRs `0002`–`0010` are referenced).
- **Minimal Concrete Fix:** Move `Clean Retail Brokers (Alpaca / tastytrade / IBKR)` out of `n-sidecars` into `n-core` (or a dedicated connected `External Venues & Brokers` node), wire edges from `n-charter`/`n-constraints`/`n-c4` and `n-ops` to the architecture graph, reference `ADR-0001`, and link `n-ops` to `Error-Observability.md`, `Testing-Strategy.md`, `Release-Signing-Update.md`, and `Docs-Strategy.md`.

---

### Minors

#### `RT3-14` — 9 New Phase 3 Dependencies Omitted from `License-Registry.md` & `ADR-0010` Beta Score Inversion
- **Severity:** `Minor`
- **Citations:**
  - `06-Risk/License-Registry.md` (policy: *"No dependency may be added to `Cargo.toml` or `package.json` without first clearing this registry"*)
  - Unregistered deps introduced in `Docs-Strategy.md`, `Error-Observability.md`, `Adopt-Build-Fork.md`, `ADR-0010`: `schemars`, `thiserror`, `tracing`, `tracing-subscriber`, `tracing-appender`, `lucide-react` (`ISC`), `Astro Starlight`, `VitePress`, `Pagefind`.
  - `04-Architecture/ADRs/0010-ui-kit-docking-and-settings-as-code.md` L46–L47 (`A1 ui-sdk` selected at **`4.61`** vs `A2 shadcn/ui + Radix` fallback at **`4.85`**).
- **Failure Scenario:** All 9 unregistered deps are permissive (`MIT`/`Apache-2.0`/`ISC`), so there is zero copyleft risk, but leaving them off `License-Registry.md` breaks the project's own pre-adoption registry rule. Separately, `ADR-0010` selects a lower-scoring `0.1.0-beta.17` kit (`4.61` vs `4.85`) without explicitly noting the user-directive override in the matrix, and `Testing-Strategy.md` doesn't specify exact-version pinning (`0.1.0-beta.17`, no `^` caret) or `pnpm` minimum-release-age handling (`AGENTS.md`).
- **Minimal Concrete Fix:** Add all 9 permissive packages to `06-Risk/License-Registry.md` in Phase 4 kickoff; add an explicit *"Selected per Charter/User Directive; `A2` pre-approved fallback"* note to `ADR-0010` L46 and lock exact version pinning (`0.1.0-beta.17`) in `Testing-Strategy.md`.

---

#### `RT3-15` — Weighted Decision-Matrix Arithmetic Mismatches Across 6 of 10 ADRs
- **Severity:** `Minor`
- **Citations:**
  - `ADR-0001:46`: `MIT` calc `4.05` vs stated `4.13`; `GPL-3.0` calc `4.03` (`4.025`) vs `3.93`; `AGPL-3.0` calc `3.55` vs `3.45`.
  - `ADR-0002:49`: Option A calc `4.74` vs stated `4.75`.
  - `ADR-0003:47`: Option A calc `4.83` vs stated `4.81`.
  - `ADR-0005:81`: `PyO3` calc `1.90` vs stated `1.85`; `PineTS` calc `1.35` vs stated `1.20`.
  - `ADR-0006:94`: External DB calc `2.90` vs stated `3.05`; `ArcticDB` calc `1.75` vs stated `1.85`.
  - `ADR-0008:48,60`: `Binance Global` calc `3.81` vs `3.93`; `Bybit+OKX` calc `3.59` vs `3.63`; `Hyperliquid` calc `3.35` vs `3.40`; `Massive Futures` calc `3.26` vs `3.30`.
- **Failure Scenario:** None of the 13 arithmetic slips alter any winning option, so no decision is invalidated, but inconsistent totals undermine audit credibility.
- **Minimal Concrete Fix:** Recalculate and correct the 13 weighted totals in `ADR-0001`, `0002`, `0003`, `0005`, `0006`, and `0008`.

---

#### `RT3-16` — Cross-Doc Risk-ID, Ring-Capacity & Constraint-Number Drift
- **Severity:** `Minor`
- **Citations:**
  - `04-Architecture/ADRs/0008-market-data-provider-abstraction-and-provenance.md` L160 cites **`RK-03`** (Legal/Prop Firms) for public WS rate-limit changes (should be **`RK-02`** Market Data).
  - `ADR-0008` L96 specifies bounded ingest channel capacity `1024–4096` frames, while `IPC-Contract.md` L201 specifies `default cap = 16,384` (and `S08` recommends `4,096–16,384`).
  - `ADR-0001` L96 cites `Constraints #5` (performance budgets) for `$0` ad-hoc macOS `.dmg` + Homebrew Cask instead of `Constraints #2` (`$0` core) & `#4` (platform scope).
- **Minimal Concrete Fix:** Fix `RK-03` → `RK-02` in `ADR-0008:160`, lock `16,384` production / `1,024` backpressure-test ring capacity in `ADR-0008:96`, and fix `Constraints #5` → `#2, #4` in `ADR-0001:96`.

---

#### `RT3-17` — Minor Struct-Padding & `S07` Binary-Sum Rounding Precision Slips
- **Severity:** `Minor`
- **Citations:**
  - `04-Architecture/Data-Model.md` §3.1 L113 & §4.2 L197 vs `spikes/S05-live-ingest-tickvault/src/vault.rs` L19, L62.
  - `04-Architecture/ADRs/0002`, `0005` L78, `0006`.
- **Failure Scenario:** `Data-Model.md:113` declares `NormalizedTick` as `72 B packed LE` (matching `S05` `vault.rs:19` `RECORD_SIZE_BYTES = 72`), but omits `_pad: [u8; 3]` (`vault.rs:62`) so the listed fields sum to `69 B`. Separately, `ADR-0002`/`0005`/`0006` add rounded `S07` deltas (`1.74 + 0.47 = +2.21 MiB`), whereas the exact combined byte sum (`1,821,553 + 490,473 = 2,312,026 B`) rounds to **`+2.20 MiB`**.
- **Minimal Concrete Fix:** Add `_pad: [u8; 3]` explicitly to `NormalizedTick` in `Data-Model.md:113` and align the combined `S07` `gzip-9` sum to `+2.20 MiB`.

---

### Nits

#### `RT3-18` — Glossary `Avoid:` Term Leaks (`indicator`) & Uncatalogued Utility Crates
- **Severity:** `Nit`
- **Citations:**
  - `01-Charter/Glossary.md` (`Study`, avoid `indicator`) vs `ADR-0005:80`, `Data-Model.md:48`, `Testing-Strategy.md:45`, `Adopt-Build-Fork.md:34`.
  - `04-Architecture/C4-Architecture.md` §3 vs `ADR-0005:105` (`allegedly-runtime-wasm`) and `Docs-Strategy.md:53` (`allegedly-docgen`).
- **Minimal Concrete Fix:** Replace `indicator` with `Study` in the 4 cited lines (zero occurrences of avoided `candle`/`ticker` were found, and `Docs-Strategy.md:28` appropriately cites `Market Profile`/`ATM` only as negative lint examples), and either fold `allegedly-runtime-wasm` into `allegedly-studies` or list `allegedly-docgen` as a dev-only workspace tool in `C4-Architecture.md` §3.

---

## 4. Confirmed Strengths

What held up cleanly under adversarial review:
1. **Zero Copyleft / Prop-Firm Leakage:** Every copyleft trap (`flowsurface-data` `GPL-3.0`, IBKR TWS `v10.49+` `GPL-3.0`, `PineTS` `AGPL-3.0`, `nautilus_trader` `LGPL-3.0-only`, `dockview-enterprise` proprietary, `ArcticDB` `BSL 1.1`, `HQChart` `用户协议.txt`, Sierra `.scid`, `yfinance`/`Stooq`, and all 4 banned prop firms / Rithmic / CQG) is cleanly quarantined or hard-banned via `cargo-deny` / `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` (`ADR-0001`, `ADR-0007`, `ADR-0009`).
2. **Honest `UNVERIFIED` Discipline:** Across `C4-Architecture.md`, `IPC-Contract.md`, `Plugin-ABI.md`, `Data-Model.md`, `Release-Signing-Update.md`, `Testing-Strategy.md`, and `ADR-0001`–`0010`, every unmeasured target — Windows `WebView2` IPC/RAM, full OS process-tree idle RAM, signed cold-start `< 2.0 s`, macOS `PRAGMA fullfsync = ON` batched latency, WIT `wasmtime::component` overhead, `ui-sdk 0.1.0-beta.17` React 19 compatibility, and 30-min peak-volatility soaks — is explicitly tagged `UNVERIFIED` rather than fabricated.
3. **Strong Empirical Anchoring to Phase 2 Spikes:** Measured baselines (`S01` `0.000 CSS px` drift & `60.0 fps` @ `5k` window; `S02` `3.0 ms` bulk IPC & `100,450 msgs/s`; `S03` `0` DOM/listener leaks; `S04` `0.00 ms` Canvas2D Layout/Style; `S05` `17.73M events/s` & `BookState::Stale`; `S06` `41 ns` kill-switch halt & `1.80 ms` 500-order WAL recovery; `S07` `12/12` hostile traps & `1.679 ms` WASM / `94.96 ms` Luau; `S08` `102.55M ticks/s`, `5.22 ms` cold seek, `9.04 µs` 16-ary VRVP, and flat `FootprintSlabArena` RSS fix) are accurately carried into Phase 3 specs.
4. **Mermaid Diagram Hygiene:** All 7 Mermaid diagrams across `C4-Architecture.md` (4), `Data-Model.md` (1), and `IPC-Contract.md` (2) use valid syntax with zero raw HTML tags or unquoted label bracket errors.
5. **Realistic `$0` Signing & Distribution Strategy:** `Release-Signing-Update.md` honestly documents SignPath Foundation OSS Windows signing eligibility, macOS `$0` ad-hoc `.dmg` + Homebrew Cask Gatekeeper caveats, and Ed25519 Minisign verification without hidden recurring costs.

---

## 5. Phase 3 Gate Recommendation

### Required Before Phase 3 Gate Sign-Off (Mandatory Fix Pass)
1. **All 5 Blockers (`RT3-01`–`RT3-05`):**
   - Fix binary IPC wire layouts (`qty_e9: i64`, aligned `STREAM_STATUS_FRAME`, `32 B` `FootprintCell`, unified 5-tier `ProvenanceTier` & `BookState`) in `IPC-Contract.md` (`RT3-01`).
   - Set `updates.checkOnStartup = false` by default in `Release-Signing-Update.md` (`RT3-02`).
   - Restore `< 300 MB` Charter Idle RAM in `C4-Architecture.md` & `ADR-0002` (`RT3-03`).
   - Purge all retired `mv-*` crate names and `.mv*` file extensions across Phase 3 docs (`RT3-04`).
   - Codify the `BookState::Stale` / `RECONCILING` **Risk-Reduction Bypass Rule** (`reduce_only`, `cancel_order`, `cancel_all`, `trigger_kill_switch` / `flatten_all`) in `IPC-Contract.md`, `Data-Model.md`, and `ADR-0009` (`RT3-05`).
2. **6 High-Impact Majors (`RT3-06`, `RT3-07`, `RT3-08`, `RT3-10`, `RT3-12`, `RT3-13`):**
   - Fix the broken single-`rtrb` 2-consumer SPSC diagram in `C4-Architecture.md` (`RT3-06`).
   - Repair `SV-01`–`SV-20` traceability across all 5 affected docs and remove `Constraints #9` (`RT3-07`).
   - Lock flat-buffer study ABI, deterministic `f64 -> s64`/Cranelift rules, and a global study memory cap in `Plugin-ABI.md` (`RT3-08`).
   - Fix `Testing-Strategy.md` OMS state names, unify macOS `fullfsync` policy, and widen `TpoRow` from `u64` to `u128` (`RT3-10`).
   - Repair the 4 broken wikilinks, 5 broken `code_refs`, and Plan-Only Phase 4/5 wording (`RT3-12`).
   - Fix `90-Canvas/Architecture.canvas` broker misclassification, orphan nodes, and missing `ADR-0001` (`RT3-13`).

### Deferrable to Phase 4 Kickoff / Cleanup Pass
- Reconciling `Adopt-Build-Fork.md` (`RT3-11`) and clarifying live-tail trim hysteresis + `state_rev` conflict handling (`RT3-09`) — can land in the same patch pass or at the opening of Phase 4 before milestone specs reference them.
- Updating `06-Risk/License-Registry.md` with the 9 new permissive deps + `ADR-0010` override note (`RT3-14`), fixing the 13 ADR matrix arithmetic totals (`RT3-15`), aligning minor cross-doc parameter/risk-ID/rounding slips (`RT3-16`, `RT3-17`), and cleaning `indicator` / utility-crate nits (`RT3-18`).

---

## 6. Re-Verification Pass (`2026-11-25`)

**Final Phase 3 Gate Verdict: `PASS`** (`0` Open Blockers, `0` Open Majors, `0` Open Minors, `0` Open Nits — **18/18 CLOSED**).

Independent automated and line-by-line inspection across all 19 Phase 3 markdown files in `04-Architecture/`, `06-Risk/License-Registry.md`, and `90-Canvas/Architecture.canvas` confirmed every required fix landed cleanly without introducing regressions. Phase 3 is cleared for Gate Sign-Off and Phase 4 Roadmap planning.

| ID | Severity | Status | Re-Verification Proof (`file:line`) |
|---|---|---|---|
| **RT3-01** | Blocker | **CLOSED** | `IPC-Contract.md:143-165` locks `40 B` `LIVE_TRADE_BATCH` (`qty_e9: i64`), `24 B` `VOLUME_PROFILE_SOA` summary (`i64`), `16 B` aligned `STREAM_STATUS_FRAME` (`dropped_total: u32` @ `+8`), `32 B` `FootprintCell` (`0x0002`, `0x0104`), and bar `buy_vol_e9`/`sell_vol_e9`/`is_closed` (`0x0001`, `0x0103`); unified 5-tier `ProvenanceTier` & 5-state `BookState` match verbatim across `IPC-Contract.md:38,154-165`, `Data-Model.md:107-126`, and `Plugin-ABI.md:120-143`. |
| **RT3-02** | Blocker | **CLOSED** | `Release-Signing-Update.md:23,54,57,120` flips default to `updates.checkOnStartup = false` (strictly opt-in/manual check; `0` outbound packets on fresh boot), aligned with `Error-Observability.md:53` and `Testing-Strategy.md:70,201` (`SV-01`). |
| **RT3-03** | Blocker | **CLOSED** | Zero `350 MB` hits anywhere in `04-Architecture/`; locked Charter `< 300 MB` idle RAM budget (`Constraints` #5, `SV-13`) restored in `C4-Architecture.md:232` and `04-Architecture/ADRs/0002-desktop-shell-and-binary-ipc.md:28,41,85,100,112`. |
| **RT3-04** | Blocker | **CLOSED** | Zero retired `mv-*` crate names or `.mv*` file extensions across `04-Architecture/` and `90-Canvas/Architecture.canvas`; sole match (`Testing-Strategy.md:47`) is explicitly the merge-blocking CI ban-pattern gate (`scripts/ci/check-no-legacy-prefix.sh`). |
| **RT3-05** | Blocker | **CLOSED** | Risk-Reduction Bypass Rule codified across `IPC-Contract.md:184,229,251-255`, `Data-Model.md:164-168`, and `ADR-0009:69,72-75`: `BookState != Live` / `RECONCILING` blocks risk-increasing entries while ALWAYS permitting `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch` (`flatten_all`), and position-verified `reduce_only: true` exits, with explicit `oms.reconcile_now` and non-dismissible red banner (`FEED STALE — RISK-REDUCING EXITS ONLY`). |
| **RT3-06** | Major | **CLOSED** | `C4-Architecture.md:118-149` enforces strict per-provider `rtrb` SPSC rings (`RingA`/`RingB`, `cap=16384`) → single-threaded Core Event Dispatcher → inline `allegedly-orderflow` update + dedicated second `StorageRing` (`rtrb` SPSC) drained asynchronously by `allegedly-storage`. |
| **RT3-07** | Major | **CLOSED** | Zero phantom `Constraints #9` hits (`Testing-Strategy.md:23` fixed); complete 20-row `SV-01`–`SV-20` matrix in `Testing-Strategy.md:201-220` verbatim-aligned to `01-Charter/Principles.md` §3; misnumbered `SV-*` refs fixed in `ADR-0009:25,45-46,57,69,77,80,147`, `ADR-0010:29-30,73,82-95,130,138,140`, `IPC-Contract.md:25,38,273`, and `Release-Signing-Update.md:23-24,54,57,67,120`. |
| **RT3-08** | Major | **CLOSED** | `Plugin-ABI.md:172-193,313` & `ADR-0005:49,66,117` lock flat SoA linear-memory (`ByteView`) ABI for `S07`'s `1.679 ms` baseline and mark optional WIT `wasmtime::component` as `UNVERIFIED`; `Plugin-ABI.md:265-271`, `ADR-0005:53,93`, `Data-Model.md:49` specify `cranelift_nan_canonicalization(true)`, FMA off, `round_ties_even()`, `NaN -> None`, software `libm`, and scoped Tier-3 Luau `SV-09` rules; `Plugin-ABI.md:46-47,79` & `ADR-0005:52,80,102` add `<= 64 MiB` global study memory pool with LRU eviction. |
| **RT3-09** | Major | **CLOSED** | `IPC-Contract.md:188-225` & `ADR-0003:20,59-61,78,82,110` document the `~80.7 ms` live-tail trim cost, add `W_MAX = 6,000` hysteresis + idle-frame trim scheduling, lock full-history Rust `allegedly-studies` warmup (`IPC-Contract.md:225`), and add Rust-owned monotonic `state_rev: u64` conflict resolution (`IPC-Contract.md:103,181,264`). |
| **RT3-10** | Major | **CLOSED** | Zero `PendingSubmit`/`Working` states remain (`Testing-Strategy.md:61` matches `Data-Model.md:160` 12-state `OrderState`); unified macOS `BrokerLive` `PRAGMA fullfsync = ON` + single-transaction batched Kill-Switch WAL policy (`UNVERIFIED` pending `v0.1` APFS bench) across `Data-Model.md:278-280,364`, `ADR-0006:55,136`, `ADR-0009:64,67,115,136`, `Testing-Strategy.md:79`; `TpoRow`/`TPO_PROFILE_BITMASK` widened to `u128` (`128` brackets) + variable-word composite bitsets (`Data-Model.md:141-143`, `IPC-Contract.md:146`, `ADR-0006:51,76`). |
| **RT3-11** | Major | **CLOSED** | `Adopt-Build-Fork.md:21,27-28,34,62-73` reconciled with locked Phase 3 ADRs: macOS/Windows `v0.1`–`v1.0` scope (`L21,62`), `16-ary` dyadic segment tree (`L27,66`), `Luau` adopted & `Rhai` rejected (`L34,72`), `DataFusion` rejected / `DuckDB` optional sidecar (`L28`), and zero stale `base-4`/`mv-`/`.mv*` references. |
| **RT3-12** | Major | **CLOSED** | `0` broken Obsidian wikilinks (`ADR-0001:152-154`, `ADR-0008:192` fixed to `S02-Tauri-IPC-Throughput`, `S07-Scripting-Sandbox`, `S08-Storage-100M-Replay`; `Plugin-ABI.md:284` `[[pinned_studies]]` verified as TOML code syntax), `0` broken `code_refs` frontmatter paths, `0` broken `file://` links, and `0` Phase 4/5 implementation-conflation hits (`v0.1` Implementation CI (post-Phase-5) applied cleanly). |
| **RT3-13** | Major | **CLOSED** | `90-Canvas/Architecture.canvas` parses as valid JSON with `13` nodes, `14` edges, and `0` orphan nodes; includes `n-adr0001` (`ADR-0001`), separates in-process retail brokers (`n-brokers`) from out-of-process sidecars (`n-sidecars`: NautilusTrader + DuckDB), and connects `n-ops` to all 4 ops/quality docs. |
| **RT3-14** | Minor | **CLOSED** | All 9 newly introduced permissive deps registered in `06-Risk/License-Registry.md` (`lucide-react`:L33, `thiserror`:L44, `tracing`:L45, `tracing-subscriber`:L46, `tracing-appender`:L47, `schemars`:L48, `Astro Starlight`:L81-82, `VitePress`:L82, `Pagefind`:L83); `ADR-0010:33,46,50,67,69,74` explicitly documents the user-directive override (`A1` `4.61` vs `A2` `4.85` fallback) and exact `"0.1.0-beta.17"` pin, mirrored with `pnpm` release-age enforcement in `Testing-Strategy.md:35,99,185`. |
| **RT3-15** | Minor | **CLOSED** | All 13 weighted decision-matrix totals independently recomputed and verified exact (2 d.p. standard rounding): `ADR-0001:46` (`4.63/4.05/4.03/3.55`), `ADR-0002:49` (`4.74`), `ADR-0003:47` (`4.83`), `ADR-0005:84` (`1.90/1.35`), `ADR-0006:94` (`2.90/1.75`), `ADR-0008:48,60` (`3.81/3.59/3.35` & `3.26`). |
| **RT3-16** | Minor | **CLOSED** | `ADR-0008:160` fixed `RK-03` → `RK-02`; `ADR-0008:96,193` & `C4-Architecture.md:170` align production ring cap to `16,384` (`1,024` backpressure stress test); `ADR-0001:96,145` fixed `Constraints #5` → `#2, #4`. |
| **RT3-17** | Minor | **CLOSED** | `Data-Model.md:116,211` explicitly adds `_pad: [u8; 3]` (`3 B`), making `NormalizedTick` sum to exact `72 B`; zero `+2.21 MiB` hits remain (`ADR-0001:153`, `ADR-0005:70,81`, `ADR-0006:81` all report exact `+2.20 MiB` = `2,312,026 B`). |
| **RT3-18** | Nit | **CLOSED** | Zero prose occurrences of avoided term `indicator` in `04-Architecture/` (only exact filename links to `02-Research/R06-Scripting-Indicator-Engine.md` at `ADR-0005:11,125`); `C4-Architecture.md:166-167,265` catalogs the 9 production workspace crates (WASM runtime folded into `allegedly-studies`) + dev-only `allegedly-docgen`. |

### Remaining Open Items
- **None.** (`0` Blockers, `0` Majors, `0` Minors, `0` Nits open.)
- **Tracked Post-Phase-5 `UNVERIFIED` Items (Appropriately Tagged & Gated for `v0.1` Implementation CI):** Windows `WebView2` IPC/RAM, full OS process-tree idle RAM (`< 300 MB`), signed cold-start `< 2.0 s`, macOS APFS `PRAGMA fullfsync = ON` batched Kill-Switch WAL latency, optional `wasmtime::component` overhead, `FootprintSlabArena` RSS delta, `ui-sdk 0.1.0-beta.17` React 19 bundle/a11y compile check, and 30-minute live peak-volatility endurance soaks.
