---
title: "ADR-0009: OMS Architecture, Retail Broker Adapters & Prop-Firm Execution Strategy"
type: adr
status: proposed
phase: Phase 3
owner: architect
updated: 2026-11-24
code_refs:
  - spikes/S06-oms-paper-execution
---

# ADR-0009: OMS Architecture, Retail Broker Adapters & Prop-Firm Execution Strategy

- **Status:** `proposed` *(red-team remediated)*
- **Date:** `2026-11-24`
- **Owner:** `architect` (Workstream D — Execution, OMS & Release)
- **Decides:** Core `allegedly-oms` state machine, durability & safety invariants, retail `Broker` adapter roadmap, and prop-firm / closed-ISV execution policy (`KC-03`, `KC-04`, `RK-03`, `RK-05`, `RK-06`, `Principles` `P1`/`P6`/`P8`, `SV-01`, `SV-08`, `SV-15`, `SV-16`).

---

## 1. Context

Allegedly is an `Apache-2.0`, local-first trading terminal targeting macOS and Windows (`v0.1`–`v1.0`, [[Assumptions]] `A01`). Unlike charting or historical replay, order execution directly puts real trader capital and broker/prop accounts at legal and financial risk. Phase 1 primary-source research ([[R04-Execution-Brokers-Props]], [[Compliance-Notes]], [[License-Registry]]) and Phase 2 Spike `S06` ([[S06-OMS-Paper-Execution]]) established four non-negotiable realities:

1. **Zero-Float Determinism & Crash Safety Are Mandatory (`Constraints` #7, `Principles` P6 & P8, `SV-08`, `SV-16`):** Any IEEE-754 floating-point drift in prices, ticks, quantities, or `Bracket Order` OCO offsets, any duplicate order on HTTP retry, or any silent orphan after a mid-flight crash or WebSocket drop is unacceptable.
2. **Retail Broker Licensing Trap (`R03-S29`, `R09-S11`, `RK-05`):** Interactive Brokers' official TWS API (`v10.49+`, August 2026) switched to **`GPL-3.0-or-later`**, making it legally incompatible with Allegedly's `Apache-2.0` core. Similarly, `nautilus_trader` is **`LGPL-3.0-only`** and cannot be statically linked into core.
3. **Prop-Firm & Closed-ISV Legal Reality (`KC-03`, `RK-03`, `R04`):** Primary rulebook audits of 8 major futures prop firms proved that **4 categorically forbid third-party/custom API clients or automation** (**Apex Trader Funding, Take Profit Trader, Bulenox, Elite Trader Funding**); **3 lack open third-party APIs or require unverified behind-login / written approval** (**My Funded Futures, Tradeify, Lucid**); and only **1 (Topstep)** offers a paid `$14.50–$29/mo` ProjectX API — strictly limited to personal-device Sim/Practice/Combine/XFA accounts (Live Funded Accounts [LFA] and VPS/VPN are banned). Closed futures ISV gateways (**Rithmic**, **CQG**) require commercial ISV NDAs/fees incompatible with an open-source `$0` core.
4. **Sierra Chart / DTC Legal Boundary (`RK-06`, `Compliance-Notes`):** While the DTC protocol specification itself is public domain, Sierra Chart permanently removed its `.scid` file format doc on `2026-10-13` with a License Agreement warning and forbids exporting Sierra/Denali market data over DTC to external applications.

---

## 2. Options & Weighted Criteria

### Candidate Options
- **Option A — First-Party Zero-Float Rust `allegedly-oms` + Clean Retail Broker Plugins + Hard `DO-NOT-BUILD` Prop/ISV Ban *(Selected)*:** Build a lean, zero-float `i64`/`i128` `allegedly-oms` crate backed by append-only SQLite WAL, UUIDv7 idempotency, `< 10 ms` Panic Kill-Switch, compile-time `allow-live-trading` off, and `keyring-rs` OS keychain storage. Ship `LocalPaperAdapter` in `v0.1`, clean retail broker adapters in `v0.2`–`v0.3+` (Alpaca, `barter-rs` MIT crypto, tastytrade, clean-room IBKR `rust-ibapi`/Client Portal/FIX, execution-only public-domain DTC), enforce a code-level `DO-NOT-BUILD` denylist for banned prop firms & Rithmic/CQG, and allow TopstepX strictly as an optional post-MVP local-device Sim-only plugin.
- **Option B — Embed `nautilus_trader` (`LGPL-3.0-only`) In-Process as Core OMS:** Adopt `nautilus_trader` directly inside the Tauri Rust binary for OMS and broker connectivity.
- **Option C — Build Custom Prop-Firm / Rithmic / CQG / Web-Bridge Adapters:** Attempt to support Apex, Take Profit Trader, Bulenox, ETF, Rithmic, or CQG directly in Allegedly to maximize futures prop-trader appeal.
- **Option D — Charting & Local Paper Simulator Only (Zero Live Broker Adapters Forever):** Never build retail broker adapters; stay permanently offline/paper-only.

### Weighted Decision Matrix (`1` = Poor/Disqualified, `5` = Excellent)

| Criterion | Weight | Option A (`allegedly-oms` + Clean Retail + `DO-NOT-BUILD`) | Option B (Embed `nautilus_trader` In-Process) | Option C (Build Banned Prop / ISV Adapters) | Option D (Paper-Only Forever) |
|---|---:|---:|---:|---:|---:|
| **Legal, License & ToS Safety (`KC-03`, `KC-04`)** | `30%` | **5** (`1.50`) | **1** (`0.30`) *(DQ: `LGPL-3.0` static link conflict)* | **1** (`0.30`) *(DQ: `KC-03` prop ToS & ISV NDA violation)* | **5** (`1.50`) |
| **Execution Safety, Determinism & Recovery (`Principles` P6 & P8, `SV-08`, `SV-15`, `SV-16`)** | `25%` | **5** (`1.25`) | **4** (`1.00`) | **2** (`0.50`) | **4** (`1.00`) |
| **Sovereignty, `$0` Core & Local-First (`Constraints` #2 & #3, `Principles` P1, `SV-01`)** | `20%` | **5** (`1.00`) | **3** (`0.60`) | **1** (`0.20`) | **5** (`1.00`) |
| **Bundle Budget (`< 40 MB`) & Maintainability** | `15%` | **5** (`0.75`) | **2** (`0.30`) | **2** (`0.30`) | **5** (`0.75`) |
| **Real Trader Utility & Roadmap Reach** | `10%` | **4** (`0.40`) | **4** (`0.40`) | **3** (`0.30`) | **2** (`0.20`) |
| **Weighted Total (`max 5.00`)** | **`100%`** | **`4.90` (WINNER)** | **`2.60` (DISQUALIFIED)** | **`1.60` (DISQUALIFIED)** | **`4.45` (FALLBACK)** |

---

## 3. Decision

We adopt **Option A** and lock the following six architectural decisions, empirically verified in [[S06-OMS-Paper-Execution]]:

### D1. Zero-Float Fixed-Point Core `allegedly-oms` (`Constraints` #7, `SV-08`)
- All prices, quantities, tick sizes, order limits, and realized/unrealized P&L inside `allegedly-oms` use strictly **`i64` / `i128` fixed-point integers (`1e-9` scale)**.
- **Zero `f32` or `f64`** types or arithmetic are permitted in non-test `allegedly-oms` source files, enforced by CI lint (`S06` verified `0` non-comment floats and **`165 ns/op`** for `ESM26` fixed-point round-trip + P&L across `100,000` ops = `16.594 ms`).

### D2. Idempotent State Machine, `Bracket Order` OCO & Append-Only SQLite WAL Intent Ledger
- **Idempotency:** Every `Order` submission generates a monotonic **UUIDv7 `client_order_id`** persisted to SQLite WAL *before* any broker network call; every execution report deduplicates on `exec_id`. `S06` verified **`54` injected HTTP faults** (`18× 429`, `18× 503`, `18× 500`) produced **`0` duplicate orders**, while malformed JSON and `"qty": "NaN"` payloads were cleanly rejected.
- **`Bracket Order` & OCO Handling:** Native server-side OCO brackets are preferred (`S06` verified `[3, 7]` partial fills + OCO TP fill & SL cancel in **`997.29 µs` p50 / `5.941 ms` p99**, `final_pos == 0`). For brokers lacking native brackets, `allegedly-oms` supports client-managed legs (`S06` verified `[3, 4, 3]` partial fills) strictly tagged **`ProtectiveLegMode::ClientManagedWarning`**, surfacing a non-dismissible UI warning that protection stops if the client disconnects.
- **SQLite WAL Durability & macOS `PRAGMA fullfsync = ON` Policy:** `allegedly-oms` writes all order intents, canonical 12-state `OrderState` transitions (`IntentLogged` through `UnknownPendingReconcile`, [[Data-Model]] §3.3), and fills to an append-only SQLite ledger (`journal_mode = WAL`, `synchronous = FULL`):
  - `S06` measured WAL append at **`119.75 µs` p50 / `145.25 µs` p95 / `348.95 µs` p99** (`n = 500`) and full OMS submit path at **`148.58 µs` p50 / `416.50 µs` p95 / `661.16 µs` p99**.
  - `S06` crash-recovery test (`500` orders / `1,965` WAL events, `20` offline fills, `5` `UnknownPendingReconcile` intents) replayed WAL in **`1.803 ms`** and reconciled against the broker in **`4.345 ms`** with **`0` orphans**, **`0` position mismatches**, and `clean = true`.
  - **Mandatory macOS `BrokerLive` `PRAGMA fullfsync = ON` + Batched Kill-Switch Transactions (`RT3-10`):** On macOS APFS, `PRAGMA fullfsync = ON` (`F_FULLFSYNC`) is **mandatory whenever `ExecutionEnv::BrokerLive` is armed** (unified with [[Data-Model]] §4.4 and `ADR-0006`) so committed live order intents survive sudden power loss. To prevent write-amplification latency spikes during a 50-order Kill-Switch cancel storm, `allegedly-oms` commits correlated Kill-Switch cancel/flatten WAL transitions inside a **single batched SQLite transaction** (issuing **1 `F_FULLFSYNC` per 50-order cancel wave** rather than 50 sequential flushes), gated by an explicit **`v0.1` Implementation CI (post-Phase-5)** macOS APFS benchmark (**`UNVERIFIED`** until measured on reference macOS hardware). `LocalPaper` and `BrokerPaper` use standard `synchronous = FULL`.

### D3. Panic Kill-Switch, `RECONCILING` Safety Latch & Risk-Reduction Bypass (`Principles` P8, `SV-15`, `SV-16`)
- **4-Step Panic Kill-Switch (Flatten All):** (1) Atomic local order-intake halt (`< 10 ms` SLA; `S06` measured **`41 ns` p50 / `42 ns` p99 / `83 ns` max**), (2) cancel all working `Order`s, (3) market-flatten all open positions, (4) verify `0` working / `0` open. `S06` completed `50` working orders + `5` open positions in **`7.043 ms` p50** (`LocalPaperAdapter`) and **`6.125 ms` p50** (`AlpacaPaperAdapter` wire-mock) with **`0` stray working orders**.
- **Mandatory `RECONCILING` Latch:** Any WebSocket disconnect, sequence break, or unknown orphan broker order immediately sets **`RECONCILING = true`** until automatic REST/WS reconciliation finishes cleanly (`S06` measured forced-disconnect recovery in **`32.590 ms` p50 / `32.702 ms` max** vs. `< 3 s` SLA) or the operator explicitly resolves an injected orphan.
- **Risk-Reduction Bypass Rule (`RT3-05`, Non-Negotiable Safety Invariant):** Whenever **`BookState != Live`** OR **`RECONCILING == true`**:
  1. **Risk-increasing entries (`new position` or `increase position`) MUST be blocked** both in the UI and authoritatively inside Rust `allegedly-oms`.
  2. **Risk-reducing and emergency exits MUST ALWAYS remain permitted**, bypassing `BookState::Stale` and `RECONCILING` locks: specifically **`oms.cancel_order`**, **`oms.cancel_all`**, **`oms.trigger_kill_switch`** (`flatten_all`), and explicit **`reduce_only: true`** closing orders (verified authoritatively against current net position in `allegedly-oms` so a closing order cannot flip into an opposite risk-increasing position).
  3. While any affected stream is stale or reconciling, the UI displays a persistent, non-dismissible high-contrast red banner: ***"FEED STALE — RISK-REDUCING EXITS ONLY"*** (or `RECONCILING — RISK-REDUCING EXITS ONLY`) so traders are never trapped inside an open leveraged position during a flash crash or feed drop.

### D4. Sim-vs-Live Isolation, OS Keychain Secrets & UI Undo Separation (`Principles` P1 & P8, `SV-01`, `SV-15`, `SV-16`)
- **Compile-Time & Boot Isolation:** Cargo feature **`allow-live-trading` is OFF by default** (and disabled in all `v0.1` releases). Even when compiled in for `v0.2+`, boot invariant **`LIVE_ARMED = false`** is enforced, Paper vs. Live endpoints live in **disjoint host allowlists**, and arming live routing requires an explicit multi-step user confirmation dialog with a persistent visual warning banner.
- **Secret Custody:** API keys and OAuth2 refresh tokens are stored exclusively in the OS Keychain via **`open-source-cooperative/keyring-rs` (`v4.2.0`, `MIT OR Apache-2.0`)** and wiped from RAM via **`zeroize`**. `ApiCredentials` never derives `Serialize`, prints `[REDACTED]` in `Debug`, and is CI-verified to leave **`0` raw secret bytes** in SQLite `.db`/`.db-wal` files or logs (`S06-T6`).
- **UI Undo Separation (`SV-16`) & Price-Axis Guard (`SV-15`):** Chart `Drawing` and `Layout` undo (`Cmd/Ctrl+Z`) operates on an isolated UI command stack that can **never** cancel, modify, or resubmit an `OMS` `Order`. Unmodified drag on the price axis always scales price and never submits orders (`SV-15`).

### D5. Phased `BrokerAdapter` Roadmap (Clean Retail & Paper Only)

| Milestone | Adapter(s) | License & Implementation Basis | Execution Mode / Notes |
|---|---|---|---|
| **`v0.1`** | **`LocalPaperAdapter`** | First-party `Apache-2.0` (`allegedly-oms`) | Local deterministic paper simulator sharing `allegedly-replay`'s conservative L2 FIFO queue-position fill logic (`S08`); zero external broker calls; `allow-live-trading` off |
| **`v0.2`** | **`AlpacaPaperAdapter`** (+ opt-in Live) & **Crypto (`barter-rs`)** | First-party `Apache-2.0` REST/WS (`alpacahq` ref) + **`barter-rs v0.2.1` (`MIT`)** | `$0` Alpaca Paper (`paper-api.alpaca.markets/v2`); `barter-rs` traits/adapters for spot/perp paper & opt-in live crypto |
| **`v0.3+` (Optional Plugins)** | **tastytrade**, **Clean-Room IBKR**, **Execution-Only DTC** | tastytrade OAuth2 (`tastyware` ref, `MIT`); IBKR via **`wboayue/rust-ibapi v5.7.0` (`MIT`)** or Client Portal REST / FIX; DTC spec (**Public Domain**) | **HARD BAN:** Never link official IBKR TWS API `v10.49+` (`GPL-3.0-or-later`). **HARD BAN:** DTC adapter is strictly execution-only — never export Sierra Chart `.scid` or Denali market data (`RK-06`) |
| **External Sidecar Only** | **`nautilus_trader`** (Optional Advanced Backtest/Exec Bridge) | **`LGPL-3.0-only`** (`[ATTORNEY REVIEW REQUIRED]`) | Strictly out-of-process sidecar communicating over Parquet/JSON-RPC; never statically or dynamically linked into Allegedly core |

### D6. Prop-Firm & Closed-ISV Policy (Enforced in Code via `S06-T7`)

| Firm / Gateway | Audited Verdict (`R04`) | Architectural Enforcement in Allegedly |
|---|---|---|
| **Apex Trader Funding** | **`DO-NOT-BUILD`** (Permanent) | Hard-blocked in `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` (`apex`, `apex_trader_funding`) — `S06-T7` CI test |
| **Take Profit Trader** | **`DO-NOT-BUILD`** (Permanent) | Hard-blocked in `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` (`take_profit_trader`, `tpt`) — `S06-T7` CI test |
| **Bulenox** | **`DO-NOT-BUILD`** (Permanent) | Hard-blocked in `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` (`bulenox`) — `S06-T7` CI test |
| **Elite Trader Funding** | **`DO-NOT-BUILD`** (Permanent) | Hard-blocked in `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` (`elite_trader_funding`, `etf`) — `S06-T7` CI test |
| **Rithmic / CQG (Closed ISV)** | **`DO-NOT-BUILD` / `DO-NOT-EMBED`** | Hard-blocked in `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` (`rithmic`, `cqg`); incompatible with `$0` open-source core |
| **My Funded Futures (MFFU), Tradeify, Lucid** | **`CONDITIONAL-WRITTEN-APPROVAL`** *(behind-login agreements `UNVERIFIED`)* | Not built; permanently gated behind verifiable public API documentation or explicit written authorization |
| **Topstep (ProjectX API)** | **`PERMITTED-SANDBOX-FIRST`** *(Post-MVP Optional External Plugin Only)* | Never bundled in `$0` core (requires user-paid `$14.50–$29/mo` ProjectX API). If built post-MVP as an external plugin, must hard-enforce **Sim/Practice/Combine/XFA ONLY on user's local personal device** and block Live Funded Accounts (LFA) and VPS/VPN execution |

---

## 4. Consequences

### Positive
- **Clean `Apache-2.0` Core & Zero Legal Landmines:** Completely avoids IBKR `v10.49+` `GPL-3.0`, `nautilus_trader` `LGPL-3.0` static linkage, Sierra Chart `.scid`/Denali license conflicts, and prop-firm ToS violations that would get users' funded accounts terminated.
- **Proven Sub-Millisecond Execution Safety:** Measured `41 ns` kill-switch halt, `119.75 µs` SQLite WAL append, `1.80 ms` 500-order crash replay, `32.59 ms` WS disconnect reconciliation, and `0` duplicate orders across `54` injected HTTP faults (`S06`), while preserving trader exit safety under stale feeds via the Risk-Reduction Bypass Rule.
- **Lean Core Binary:** `S06` unstripped release binary is `9.9 MB` (and stripped core OMS delta fits comfortably inside Allegedly's `< 40 MB` installer budget).

### Negative & Mitigations
- **No Native Prop-Firm Execution at Launch:** Futures prop traders on Apex/TPT/Bulenox/ETF/Rithmic cannot route live orders from Allegedly. *Mitigation:* Allegedly delivers full order-flow charting, local `Footprint Bar` / `DOM Ladder` / replay, and `LocalPaperAdapter` practice for all traders while keeping retail execution clean on Alpaca, tastytrade, and clean-room IBKR.
- **Bus-Factor Risk on `wboayue/rust-ibapi` (`v5.7.0`, MIT) & `barter-rs` (`v0.2.1`, MIT):** Both crates have concentrated primary maintainers (`[[Adopt-Build-Fork]]`). *Mitigation:* Isolate every broker behind Allegedly's internal `BrokerAdapter` trait so IBKR can fall back to Client Portal REST / FIX or a clean-room TWS socket referencing `ib_async` (`BSD-2-Clause`), and crypto can fall back to thin REST/WS adapters referencing `ccxt` (`MIT`).
- **Remote Live-Network Paper Smokes & macOS `fullfsync` Benchmark Still `UNVERIFIED`:** `S06` verified `AlpacaPaperAdapter` thoroughly against a local `axum` wire-mock, leaving live-internet smoke tests against `paper-api.alpaca.markets/v2`, tastytrade cert sandbox OAuth2 `dry-run`, and the macOS APFS batched `PRAGMA fullfsync = ON` Kill-Switch benchmark as mandatory **`v0.1` Implementation CI (post-Phase-5)** / opt-in human verification steps (`[[Testing-Strategy]]` §5).

---

## 5. Reversal Cost

| Sub-Decision | Reversal Cost | Rationale |
|---|---|---|
| **Swap or add a retail `BrokerAdapter` (e.g., `rust-ibapi` → Client Portal REST)** | **Low** (`1–2` weeks) | Isolated strictly behind the `BrokerAdapter` trait; zero changes to `allegedly-oms`, SQLite WAL, or UI. |
| **Change SQLite WAL `synchronous` / `fullfsync` batching policy** | **Low** (`1–3` days) | Encapsulated inside `allegedly-oms`'s WAL repository module; schema remains append-only compatible. |
| **Replace first-party `allegedly-oms` core with an external engine** | **High** (`4–8` weeks + license risk) | Tightly coupled to Allegedly's `1e-9` `i64` types, `Bracket Order` OCO semantics, Risk-Reduction Bypass Rule, and `RECONCILING` UI contract. |
| **Lift a `DO-NOT-BUILD` prop-firm ban** | **Legally Blocked** *(Low code effort, Non-Technical Gate)* | Removing an entry from `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` is a 1-line code change, but is **forbidden** unless primary official rulebook evidence proves third-party API clients are explicitly permitted. |

---

## 6. Revisit Trigger

Reopen this ADR if **any** of the following occur:
1. **Prop-Firm Policy Change (`KC-03`):** Any `DO-NOT-BUILD` or `CONDITIONAL` prop firm publishes an official, written, third-party retail API program (with verifiable primary URL) permitting open-source desktop clients.
2. **IBKR or `barter-rs` Dependency Health:** `wboayue/rust-ibapi` or `barter-rs` breaks against broker wire changes with no upstream fix for `> 30` days — trigger fallback to Client Portal REST / FIX (`ib_async` reference) or thin clean-room crypto REST/WS adapters.
3. **Remote Paper Smoke Wire Divergence:** `v0.1` Implementation (post-Phase-5) opt-in human verification against `paper-api.alpaca.markets/v2` or tastytrade cert sandbox uncovers order-lifecycle or OCO partial-fill semantics differing from our local `axum` wire-mock.
4. **macOS APFS `PRAGMA fullfsync = ON` Batched Kill-Switch Benchmark Regression (`RT3-10`):** The mandatory `v0.1` Implementation CI (post-Phase-5) macOS APFS benchmark shows that mandatory `PRAGMA fullfsync = ON` for `BrokerLive` with single-transaction batched Kill-Switch WAL commits (1 `F_FULLFSYNC` per 50-order cancel wave) exceeds `25 ms` total local WAL latency.
5. **Attorney Clearance on `nautilus_trader` Sidecar:** Legal review clarifies boundaries for optional out-of-process `LGPL-3.0-only` execution/backtest bridging.

---

## 7. Evidence Links

- [[R04-Execution-Brokers-Props]] — Primary-source audit of retail broker APIs, DTC ToS, and all 8 prop-firm rulebooks (`R04-S01`+).
- [[S06-OMS-Paper-Execution]] — Phase 2 empirical measurements (`7/7` tests, `41 ns` halt, `6.13–7.04 ms` 50-order flatten, `119.75 µs` WAL append, `1.80 ms` 500-order crash replay, `32.59 ms` disconnect reconcile, `54` HTTP faults → `0` duplicates, `S06-T7` denylist).
- [[Compliance-Notes]] — Legal boundaries on Sierra Chart `.scid`/DTC (`RK-06`), prop firms (`RK-03`), IBKR `v10.49+` GPLv3 (`RK-05`), and trademark clearance (`RK-04`).
- [[License-Registry]] — Verified SPDX matrix (`Apache-2.0`, `MIT`, `BSD-3-Clause`, `LGPL-3.0-only` sidecar rule, `GPL-3.0` ban).
- [[Constraints]], [[Principles]] (`P1`, `P6`, `P8`, `SV-01`, `SV-08`, `SV-15`, `SV-16`), [[Kill-Criteria]] (`KC-03`, `KC-04`), [[Risk-Register]] (`RK-03`, `RK-05`, `RK-06`, `RK-09`).
- [[Data-Model]] (§3.3 canonical 12-state `OrderState` & §4.4 macOS `fullfsync`), [[Testing-Strategy]] (Layer 1/2 automated verification gates enforcing this ADR in `v0.1` Implementation CI).
