---
title: "ADR-0007: Deterministic Replay & Backtest Engine — Build Core + Optional Sidecars"
type: adr
status: accepted
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - 01-Charter/Constraints.md
  - 01-Charter/Principles.md
  - 02-Research/R07-Storage-Replay-Backtest.md
  - 03-Spikes/S06-OMS-Paper-Execution.md
  - 03-Spikes/S07-Scripting-Sandbox.md
  - 03-Spikes/S08-Storage-100M-Replay.md
  - 04-Architecture/Adopt-Build-Fork.md
  - 04-Architecture/Data-Model.md
  - 04-Architecture/Plugin-ABI.md
  - 06-Risk/License-Registry.md
---

# ADR-0007: Deterministic Replay & Backtest Engine — Build Core + Optional Sidecars

- **Status:** `proposed`
- **Date:** `2026-11-24`
- **Owner:** `architect`
- **Scope:** Allegedly (`Apache-2.0`), macOS (Apple Silicon + Intel) & Windows 10/11 first *(Linux deferred post-v1.0)*

---

## 1. Context & Problem Statement

Traders using Allegedly require two distinct historical evaluation workflows:
1. **Interactive Visual Bar/Tick Replay & Strategy Backtesting Inside the Terminal:** Step through historical L1/L2/L3 order-flow captures at `1×`, `10×`, `50×`, or max-CPU batch speed with **bit-for-bit identical** Footprint cells, Volume/TPO profiles, study outputs, and fixed-point simulated fills (`P6`, `SV-09`), using the exact same `allegedly-studies`, `allegedly-orderflow`, and `allegedly-oms` paper simulator that run live.
2. **Institutional Multi-Asset Quantitative Research (Power Users):** Run large-scale Python/Rust/C# portfolio sweeps, parameter optimizations, or institutional venue simulations without duplicating tick data.

Phase 1 verification (`R07-Storage-Replay-Backtest.md`, `Adopt-Build-Fork.md` `B6b`, `License-Registry.md`) revealed why no existing FOSS engine can simply be embedded into Allegedly's `Apache-2.0` desktop core:
- **`nautilus_trader v1.231.0`** (`31,788★`) is licensed **`LGPL-3.0-only`** (`Cargo.toml` + `LICENSE`) with trademark restrictions (`TRADEMARK.md`)—**incompatible with static Rust linking** into an `Apache-2.0` core binary (`KC-04`).
- **`vectorbt v1.2.1`** carries **`Apache-2.0 WITH Commons Clause v1.0`** (non-FOSS, **DISQUALIFIED**).
- **`backtrader`**, **`pysystemtrade`**, **`freqtrade`**, and **`OctoBot`** are **`GPL-3.0`** (**DISQUALIFIED**).
- **`zipline-reloaded v3.2.1`** (`Apache-2.0`) is daily-bar US equities only (unusable for tick/L2 order-flow).
- **`QuantConnect/Lean`** (`Apache-2.0`) requires a heavyweight C#/.NET + Docker runtime (incompatible with `< 40 MB` native desktop installer).
- **`nkaz001/hftbacktest` (`rust-v0.9.4`, `MIT`, `5,137★`)** is an excellent permissive Rust reference for L2/L3 queue-position and feed/order latency modeling, but is single-author (`953/992` commits, last push `2025-12-23`), uses `f64` prices internally rather than Allegedly's zero-float `i64`/`i128` fixed-point domain, and is not integrated with Allegedly's `FootprintSlabArena`, Wasmtime/Luau studies, or `allegedly-oms`.

---

## 2. Decision

Adopt a **Hybrid Build-Core + Optional Out-of-Process Sidecar** architecture (`Adopt-Build-Fork.md` `B6b`):

1. **Build Pure-Rust In-Core `allegedly-replay` (`Apache-2.0`):**
   - Streams directly from Allegedly's Hive Parquet 2.0 cold vault (`S08`: `102.55M ticks/s` streaming at `34.44 MiB` RSS) and `.atvault` / `.dbn.zst` captures through the **exact same `allegedly-orderflow`, `allegedly-studies` (Native/Wasmtime/Luau), and `allegedly-oms` (`LocalPaperAdapter` + risk gates + fixed-point `i128` P&L)** code paths used in live trading.
   - Implements **three staged fill-fidelity tiers** informed by `nkaz001/hftbacktest`'s documented queue-position and latency mathematics (clean-room integer `i64`/`i128`, zero `f32`/`f64`, zero `HashMap` nondeterminism):
     - **Fidelity Tier A (v0.1–v0.2 — L1 Trade/BBO Replay):** Exact spread crossing + configurable fixed-tick slippage + deterministic order-entry/feed latency queues (`feed_latency_ns`, `order_latency_ns`).
     - **Fidelity Tier B (v0.2 — L2 MBP Conservative Queue-Position Fill Model):** Tracks resting queue ahead of a simulated limit order; forbids unrealistic immediate fill on touch unless traded volume at/through price clears the conservative queue bound (`S08` verified: 100-lot resting queue vs. 10-lot touch does not fill prematurely).
     - **Fidelity Tier C (v0.3+ — L3 MBO FIFO Queue Model):** Exact order-by-order queue tracking on `MboOrderEvent` archives (e.g., Databento CME `GLBX.MDP3`).
   - Emits a signed/hashed `ReplayRunManifest` (`Plugin-ABI.md` §5) pinning `vault_manifest_sha256`, `artifact_sha256` of every active study, canonical TOML parameters, fill-model configuration, and final `output_state_sha256` to enforce `SV-09` cross-speed bit-identity (`1× == 50× == max-cpu-batch`).
2. **Adopt Optional Tier-4 Out-of-Process Sidecars (`nautilus_trader` `LGPL-3.0-only` & `QuantConnect/Lean` `Apache-2.0`):**
   - For advanced multi-asset portfolio research beyond single-terminal replay, Allegedly exposes a **Tier-4 Sidecar Bridge** (`Plugin-ABI.md` §1): users install and launch `nautilus_trader` or `Lean` externally as a separate OS process reading the exact same read-only Hive Parquet vault and returning trade/equity/fill Parquet artifacts + JSON-RPC progress events to Allegedly's chart & report panels.
   - **Hard Legal Boundary (`KC-04`, `License-Registry.md`):** Zero `nautilus-*` crates may ever appear in Allegedly's `Cargo.toml` (enforced by `cargo-deny v0.22.1` CI hard-fail); Allegedly never statically or dynamically links `LGPL-3.0-only` code and complies with `nautilus_trader`'s `TRADEMARK.md` (`[ATTORNEY REVIEW REQUIRED]` prior to shipping an official sidecar bridge).

---

## 3. Empirical Evidence Summary (`S06`, `S07`, `S08`)

| Capability Validated | Measured Phase 2 Proof | Source |
|---|---|---|
| **Sequential 100M-Tick Parquet Replay Throughput** | **`102,551,314 ticks/s`** (`0.975 s` for `100,000,000` ticks) at **`34.44 MiB` peak RSS** | `S08` |
| **Bit-Exact Replay Determinism (`SV-09`)** | `5,000,000`-tick dual-run Footprint replay **`100%` SHA-256 identical** (`f8b52b2e...6a0`, `0` drift) | `S08` |
| **Study Execution Throughput Inside Backtest** | Native Rust **`1.625 ms`**, Wasmtime **`1.679 ms`** (`+3.32%`), Luau **`94.962 ms`** per `100,000` bars (`0.000e0` err, exact `6,607` trades); MTF + intrabar rollback = **`0` bit mismatches** | `S07` |
| **Fixed-Point Paper OMS & Bracket Fill Accounting** | `165 ns/op` fixed-point round-trip (`0` floats); `LocalPaperAdapter` + Bracket/OCO + partial fills + scale-in/reverse-through-zero P&L **`7/7` tests PASS** | `S06` |
| **L2 Conservative Queue-Position Fill Realism** | Unit test verified resting 100-lot bid queue rejects premature 10-lot touch fill, filling only on `>= 100` lots or trade-through | `S08` |
| **Zero Extra Installer Bloat** | `allegedly-replay` reuses `allegedly-orderflow`, `allegedly-studies`, `allegedly-oms`, and `parquet` (`+0 MiB` third-party runtime dependency) | `S06`–`S08` |

---

## 4. Weighted Decision Matrix

| Criterion | Weight | **Build `allegedly-replay` (`hftbacktest`-informed) + Optional Sidecars (Chosen)** | Statically Link `nautilus_trader` (`LGPL-3.0-only`) | Embed `nkaz001/hftbacktest` Crate Directly as Core | Adopt `barter-rs` (`v0.2.1`) as Full Backtester | Require `QuantConnect/Lean` (`Apache-2.0`) | Embed Python (`vectorbt` / `backtrader` / `zipline`) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Live-vs-Replay Code Parity (`SV-09`)** | `25%` | **5** (100% shared `orderflow`, `studies`, `oms`, `i64`/`i128`) | **2** (separate engine, different study/data types) | **2** (`f64` internals, separate from OMS/studies) | **2** (crypto-centric, lacks futures/footprint/WAL OMS) | **1** (C#/.NET silo, zero Rust study parity) | **1** (Python silo, float math) |
| **License & Legal Cleanliness (`Apache-2.0`, `KC-04`)** | `25%` | **5** (`Apache-2.0` core; strict process boundary + `cargo-deny` for optional `LGPL-3.0-only` sidecar) | **0** (**DISQUALIFIED**: static `LGPL-3.0-only` contamination) | **5** (`MIT`) | **5** (`MIT`) | **5** (`Apache-2.0`) | **0** (**DISQUALIFIED**: Commons Clause / `GPL-3.0`, or daily-only `zipline`) |
| **Order-Flow / L2 / L3 Fill Realism & Speed** | `20%` | **5** (`102.5M ticks/s`, L1→L2 queue→L3 FIFO, zero-float) | **5** (institutional L2/L3 Rust core) | **5** (gold-standard L2/L3 queue & latency math) | **2** (basic L1/crypto fills) | **3** (broad asset classes, heavier tick overhead) | **1** (bar/daily oriented) |
| **Installer Budget (`< 40 MB`) & Local-First Zero-Ops** | `15%` | **5** (`~0` extra binary weight, offline instant boot) | **2** (heavy Python/Cython/Rust stack) | **4** (lean Rust crate) | **4** (lean Rust crate) | **1** (requires .NET SDK / Docker) | **1** (Python venv / C extensions) |
| **Maintainability & Bus-Factor Resilience** | `15%` | **4** (first-party Rust owned by team; small focused scope) | **4** (active commercial steward, complex API churn) | **2** (solo author `953/992`, no push since `2025-12-23`) | **2** (solo author `483/499`, early `v0.2.1`) | **4** (mature org, heavyweight C# stack) | **1** (`backtrader` unmaintained) |
| **Weighted Score (Max 5.00)** | **`100%`** | **`4.85`** | **`2.40` (DQ)** | **`3.65`** | **`3.05`** | **`2.85`** | **`0.75` (DQ)** |

---

## 5. Consequences

### Positive
- **Zero Live-vs-Backtest Drift:** Because `allegedly-replay` drives the exact same `allegedly-orderflow`, `allegedly-studies`, and `allegedly-oms` state machines as live trading, bugs like lookahead bias, float rounding drift, or mismatched OCO/bracket partial-fill behavior cannot silently diverge between replay and paper/live execution.
- **Zero Copyleft Contamination (`KC-04`):** Core remains `100%` `Apache-2.0` while still letting institutional users leverage `nautilus_trader` or `QuantConnect/Lean` over Allegedly's shared Hive Parquet vault.
- **Unmatched Desktop Speed:** Replaying `100,000,000` ticks in `< 1 s` (`34.44 MiB` RSS) makes multi-week order-flow parameter sweeps practical on an 8 GiB laptop with zero cloud compute.

### Negative & Trade-Offs
- **First-Party Maintenance of Queue-Fill Simulator:** Building `allegedly-replay` in-house requires rigorous unit/property testing of L2 queue estimation, L3 MBO FIFO matching, margin/commission schedules, and corporate actions/futures rolls (rather than inheriting `nautilus_trader`'s existing venue simulators out of the box).
- **Sidecar UX Friction for Multi-Asset Portfolio Quants:** Running `nautilus_trader` or `Lean` requires the user to install those external toolchains separately; Allegedly ships only the lightweight Parquet/JSON-RPC adapter.
- **Futures Roll & Portfolio Margin Deferred:** Multi-contract continuous futures back-adjustment and cross-margin portfolio simulation are scoped post-v0.2 so v0.1–v0.2 stays focused on single/multi-chart order-flow replay (`KC-07`).

### Operational
- Enforce `cargo-deny` rules banning `LGPL-*`, `GPL-*`, `AGPL-*`, and `Commons-Clause` crates in `v0.1` Implementation CI (post-Phase-5) so no contributor accidentally adds `nautilus-*` to `Cargo.toml`.
- Display clear fill-model provenance badges on every backtest report (`SIM-L1-SPREAD`, `SIM-L2-QUEUE-CONSERVATIVE`, `SIM-L3-MBO-FIFO`) alongside slippage and latency assumptions so users never mistake optimistic L1 bar fills for L3 queue-realistic execution.

---

## 6. Reversal Cost

- **Integrating `hftbacktest` Directly as an Optional L2/L3 Matching Library: Low (`1–2` weeks)** if `nkaz001/hftbacktest` (`MIT`) resumes active maintenance and adds fixed-point support—only the internal matching engine behind `allegedly-replay`'s `SimExchange` trait would change.
- **Promoting a Sidecar to Mandatory Core: Very High (Blocked by `Constraints` #1 & #5)** unless Allegedly changes its `Apache-2.0` license or `< 40 MB` installer charter.

---

## 7. Revisit Triggers

Re-open ADR-0007 if any of the following occurs:
1. **Legal Counsel Flags Tier-4 `LGPL-3.0-only` IPC Coupling:** If OSS counsel determines that a tightly coupled JSON-RPC sidecar protocol with `nautilus_trader` creates `LGPL-3.0` combined-work risk, restrict interoperability strictly to documented offline Parquet file import/export (zero direct process invocation or custom RPC protocol).
2. **`allegedly-replay` Scope Creep Threatens `KC-07`:** If L2/L3 queue simulation delays v0.2 beyond schedule, ship v0.2 with Fidelity Tier A (L1 spread + deterministic latency/slippage) + Tier B (L2 conservative queue) and defer Tier C (L3 MBO FIFO) to v0.3.
3. **Permissive Rust L3 Matching Engine Matures:** If an `Apache-2.0`/`MIT` multi-maintainer Rust fixed-point L3 backtester emerges with active CME pro-rata + FIFO support, evaluate adopting it beneath `allegedly-replay`.

---

## 8. Evidence Links & `UNVERIFIED` Items

- **Primary Evidence:** [`02-Research/R07-Storage-Replay-Backtest.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R07-Storage-Replay-Backtest.md), [`03-Spikes/S06-OMS-Paper-Execution.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/03-Spikes/S06-OMS-Paper-Execution.md), [`03-Spikes/S07-Scripting-Sandbox.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/03-Spikes/S07-Scripting-Sandbox.md), [`03-Spikes/S08-Storage-100M-Replay.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/03-Spikes/S08-Storage-100M-Replay.md), [`04-Architecture/Adopt-Build-Fork.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/04-Architecture/Adopt-Build-Fork.md), [`06-Risk/License-Registry.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/06-Risk/License-Registry.md).
- **`UNVERIFIED` Item 1 — L3 MBO FIFO / Pro-Rata Fill Accuracy Against Live CME MDP 3.0 Captures:** S08 verified the conservative L2 queue-position invariant in a unit test, but full L3 MBO FIFO queue replay against a real CME Globex `.dbn.zst` capture remains unverified until `v0.1` Implementation CI / v0.3 L3 verification (`S05` / `S08`).
- **`UNVERIFIED` Item 2 — Tier-4 `nautilus_trader` Sidecar Legal Review & IPC Overhead:** Process-isolated Parquet + JSON-RPC bridge design is flagged **`[ATTORNEY REVIEW REQUIRED]`** (`License-Registry.md`) and has not yet been benchmarked for round-trip report latency.
- **`UNVERIFIED` Item 3 — Multi-Asset Portfolio Margin & Continuous Futures Roll Accounting:** Single-instrument fixed-point P&L is verified in `S06`; cross-margin portfolio simulation and roll-adjusted continuous contracts remain unimplemented and unverified pending v0.3+ design.
