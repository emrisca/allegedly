---
title: "ADR-0005: Study Runtime Architecture & Embedded Scripting Language"
type: adr
status: accepted
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - 01-Charter/Constraints.md
  - 01-Charter/Glossary.md
  - 02-Research/R06-Scripting-Indicator-Engine.md
  - 03-Spikes/S07-Scripting-Sandbox.md
  - 04-Architecture/Adopt-Build-Fork.md
  - 04-Architecture/Plugin-ABI.md
  - 06-Risk/License-Registry.md
  - spikes/S07-scripting-sandbox/Cargo.toml
  - spikes/S07-scripting-sandbox/src/wasmtime_runner.rs
  - spikes/S07-scripting-sandbox/src/luau_runner.rs
  - spikes/S07-scripting-sandbox/src/rhai_runner.rs
  - spikes/S07-scripting-sandbox/src/mtf_test.rs
---

# ADR-0005: Study Runtime Architecture & Embedded Scripting Language

- **Status:** `proposed`
- **Date:** `2026-11-24`
- **Owner:** `architect`
- **Scope:** Allegedly (`Apache-2.0`), macOS (Apple Silicon + Intel) & Windows 10/11 first *(Linux deferred post-v1.0)*

---

## 1. Context & Problem Statement

Allegedly must deliver institutional-grade `Study` execution (`EMA`, `RSI`, `VWAP`, Footprint/TPO/Volume Profile overlays, and custom user scripts) that satisfies four competing constraints simultaneously:
1. **Hard Latency & Frame Budget (`Constraints` #5, `R06`, `KC-06`):** `100,000`-bar historical recalculation in `<= 50 ms` for compiled plugins, `10` concurrent live studies at `p99 <= 1,000 µs` with zero GC stalls `> 500 µs`, and `0` bit divergence across live intrabar ticks and multi-timeframe (`MTF`) replay.
2. **Strict Installer & License Budgets (`Constraints` #1, #5, `KC-04`):** Total desktop installer `< 40 MB` on macOS & Windows; strictly permissive `Apache-2.0`-compatible licenses (zero `GPL`/`AGPL`/`LGPL` static links, zero non-FOSS source-available licenses).
3. **Hostile-Plugin Safety & Global Memory Containment (`Plugin-ABI.md`):** Untrusted community studies must never hang the terminal, exhaust RAM across multi-chart workspaces, or access the local filesystem, network, or broker keychain.
4. **Pine Script® Reality (`R06`, `License-Registry.md`):** Direct verification on `2026-11-24` proved that **no permissive FOSS Pine v5/v6 parser or runtime exists** (`PineTS` is `AGPL-3.0`, `OpenPineScript` is `GPL-3.0`, `pynescript` is `LGPL-3.0`/stale, `pineforge-codegen-oss` is non-FOSS `PineForge Source License 1.2` banning prop-firm users, `PyneComp` is closed SaaS, `tree-sitter-pine` has no license, and `ferranbt/pinecone` is early `v0.2.6` `MPL-2.0` v4/v5-only).

Phase 2 Spike `S07` (`03-Spikes/S07-Scripting-Sandbox.md`, verdict `PASS-WITH-CAVEAT`) ran a head-to-head shootout of **Native Rust**, **Wasmtime `v51.0.0`**, **Luau (`mlua v0.12.3` + `luau0-src`)**, and **Rhai `v1.27.0`** on an identical `EMA-20 + RSI-14 Wilder + Session VWAP (±2σ) + Stateful Crossover` workload over `100,000` bars + `10,000` live ticks, plus `12` hostile-script escape tests and stripped binary size probes.

---

## 2. Decision

Adopt a **staged 3-tier Study runtime architecture** hosted cleanly inside the single canonical crate **`allegedly-studies`**, plus a **CI-only `TA-Lib` numerical oracle**:

1. **Tier 1 (v0.1): Native Rust (`allegedly-studies`, `Apache-2.0`)** for all built-in `O(1)` incremental technical and order-flow studies (`1.625 ms` / 100k bars; `0.083 µs` live p99).
2. **Tier 2 (v0.2): Wasmtime `v51.0.0` (`Apache-2.0 WITH LLVM-exception`)** with minimal Cargo features (`default-features = false`, `cranelift`, `runtime`, `std`, **zero WASI**), a **flat SoA linear-memory / `ByteView` batch ABI** (`Plugin-ABI.md` §3.2 — optional `wasmtime::component` nested WIT lists are explicitly gated on a `v0.1` Implementation CI size + latency spike), instruction fuel metering, `cranelift_nan_canonicalization(true)` + disabled FMA contraction, `StoreLimits` (`16–32 MiB` default, `64 MiB` instance ceiling), and pre-compiled `.cwasm` caching.
3. **Tier 3 (v0.3): Embedded Luau (`mlua v0.12.3` + `luau0-src v0.24.1+luau748`, `MIT`)** with `lua.sandbox(true)`, per-instance `set_memory_limit(16–32 MiB)`, and VM instruction interrupt hooks for zero-toolchain in-app scripting—**decisively chosen over Rhai `v1.27.0`**.
4. **Global Terminal-Wide Study Memory Pool & Deterministic Float Boundary (`Plugin-ABI.md` §1 & §5):**
   - Enforce a **`<= 64 MiB` global terminal-wide study memory pool** across all open charts/panes (LRU-evicting hidden-tab study state before OOM) so multi-chart workspaces cannot breach `< 300 MB` idle RAM.
   - Enforce canonical IEEE-754 round-ties-to-even `f64 -> s64` quantization with explicit `NaN -> None` (`i64::MIN`) / `±Inf` clamping, pure-software deterministic `libm` for Tier 1/2, and scope `SV-09` cross-OS bit-exact SHA-256 guarantees on Tier-3 Luau scripts to deterministic non-transcendental outputs until deterministic `libm` is linked into `luau0-src`.
5. **Tier 3 Front-End (v0.4+, Staged):** Build a clean-room, permissively licensed **Pine-inspired series DSL** (avoiding TradingView®/Pine Script® trademarks) that compiles directly to **Luau** (instant editor feedback) or **WASM** (near-native batch speed), re-evaluating `ferranbt/pinecone` (`MPL-2.0`) only if it reaches mature `v1.0+` before v0.4.
6. **Dev-Only Numerical Oracle (`v0.1` Implementation CI):** Adopt **`TA-Lib v0.8.3` (`BSD-3-Clause`)** exclusively in automated CI parity tests (never bundled in the desktop binary).

---

## 3. Empirical Evidence Summary (`S07` Verified on Apple M2, macOS 26.6.2, `rustc 1.99.1`)

*(Identical `100,000` historical bars + `10,000` live ticks; `0.000e0` max float err and exact `6,607` trades across all 4 runtimes; `3/3` release tests passed in `0.08 s`; `12/12` hostile-script tests trapped cleanly.)*

| Runtime | License | Cold Start (ms) | 100k Flat Batch (ms) | Live p99 (µs) | 10-Study Mix p99 / Max (µs) | Stripped Binary Δ (`gzip-9` / `xz-6`) | Global Mem Cap | Hostile Traps (`Loop / OOM / Sandbox / Stack`) |
|---|---|---:|---:|---:|---:|---:|---|---|
| **Native Rust** | `Apache-2.0` | `0.000` | **`1.625`** | **`0.083`** | — *(5 of 10)* | Baseline (`0.14 / 0.11 MiB`) | N/A | Trusted core |
| **Wasmtime `v51.0.0`** | `Apache-2.0 WITH LLVM-exception` | `31.651` *(cached via `.cwasm`)* | **`1.679`** (`+3.32%`, flat linear mem) | **`0.084`** | — *(3 of 10)* | **`+1.74 MiB` / `+1.28 MiB`** (`+1,821,553 B` gzip-9) | Hard `StoreLimits` (`64 MiB` cap → `63.81 MiB`) | `0.242 / 1.778 / 0.718 / 0.340 ms` (**4/4 PASS**) |
| **Luau (`mlua v0.12.3`)** | `MIT` | `1.477` | **`94.962`** (`10.05×` faster than Rhai) | **`1.333`** (`19.41×` faster than Rhai) | **`2.75 µs` / `27.50 µs`** (`0` spikes `> 0.5 ms`) | **`+0.47 MiB` / `+0.34 MiB`** (`+490,473 B` gzip-9) | True global `set_memory_limit` | `0.526 / 18.712 / 0.105 / 0.562 ms` (**4/4 PASS**) |
| **Rhai `v1.27.0`** | `MIT OR Apache-2.0` | `1.296` | `954.424` | `25.875` | `57.96 µs` / **`4,767.54 µs`** (`4.77 ms` spike) | `+0.53 MiB` / `+0.40 MiB` | Per-object caps only (no global heap cap) | `1.969 / 35.818 / 0.852 / 0.033 ms` (**4/4 PASS**) |

- **Combined S07 Tier 2 + Tier 3 Compressed Binary Cost:** Exact byte sum `1,821,553 + 490,473 = 2,312,026 B` = **`+2.20 MiB` (`gzip-9`)** / `1,346,932 + 356,388 = 1,703,320 B` = **`+1.62 MiB` (`xz-6`)** — consuming only `~5.5%` of the `< 40 MB` installer budget.
- **MTF & Intrabar Determinism (`S07`):** `15,000` bars (`1m + 15m` HTF closed-bar alignment) + `500` bars noisy intrabar preview/rollback = **`0` bit mismatches** (`u64::to_bits`).

---

## 4. Weighted Decision Matrix

| Criterion | Weight | **Native + Wasmtime + Luau (Chosen)** | Native + Wasmtime + Rhai | Native + Wasmtime Only (No Embedded Script) | QuickJS / V8 (JS Embedded) | PyO3 / Embedded CPython | External Pine Engine (`PineTS`/`OpenPineScript`/`pineforge`) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Batch & Live Tail Latency (`p99` & `max`)** | `25%` | **5** (`1.68 ms` flat WASM, `95 ms` Luau, `27.5 µs` mix max) | **2** (`954 ms` Rhai, `4.77 ms` tail spike) | **5** (`1.68 ms`, zero script tier) | **3** (GC pause risk in QuickJS/V8) | **1** (GIL + GC + slow interpreter) | **1** (Node/JS or unverified perf) |
| **Security & Hard Resource Sandboxing** | `25%` | **5** (12/12 traps, true global mem cap + `<= 64 MiB` pool) | **3** (per-object caps only in Rhai) | **5** (WASM `StoreLimits` + fuel) | **3** (harder deterministic fuel/OOM) | **1** (cannot safely sandbox CPython) | **1** (ambient Node/Python or closed SaaS) |
| **Binary Size & Installer Budget (`< 40 MB`)** | `20%` | **5** (`+2.20 MiB` gzip-9 / `+1.62 MiB` xz-6) | **4** (`+2.27 MiB` gzip-9) | **5** (`+1.74 MiB` gzip-9) | **3** (QuickJS lean; V8 `> 15 MB` fails) | **1** (`> 25–40 MB` runtime blows budget) | **2** (Node runtime / transpiler bloat) |
| **License & FOSS Compliance (`Apache-2.0`)** | `15%` | **5** (`Apache-2.0 WITH LLVM-exception` + `MIT`) | **5** (`Apache-2.0` + `MIT`) | **5** (`Apache-2.0 WITH LLVM-exception`) | **4** (`MIT` QuickJS / `BSD-3` V8) | **4** (`PSF-2.0`) | **0** (**DISQUALIFIED**: `AGPL-3.0`/`GPL-3.0`/non-FOSS) |
| **Zero-Toolchain Authoring Ergonomics & Typing** | `15%` | **5** (instant edit-run + Luau gradual static typing + clean DSL target) | **3** (dynamic typing, Rust-like syntax unfamiliar to traders) | **1** (requires Rust/C toolchain for every 10-line Study) | **4** (familiar JS, TypeScript needs transpile) | **4** (familiar to quants, broken for sandbox) | **3** (familiar Pine syntax, legally blocked) |
| **Weighted Score (Max 5.00)** | **`100%`** | **`5.00`** | **`3.25`** | **`4.40`** | **`3.30`** | **`1.90`** | **`1.35` (DQ)** |

---

## 5. Consequences

### Positive
- **Eliminates the Installer Budget Risk:** Stripping Wasmtime to `cranelift`+`runtime`+`std` (zero WASI) kept the combined Tier 2 + Tier 3 compressed footprint to `+2.20 MiB` gzip-9 (`+1.62 MiB` xz-6), leaving massive headroom under `< 40 MB`.
- **Order-of-Magnitude Better Script Responsiveness:** Selecting Luau over Rhai delivers `10.05×` faster 100k-bar recalculation, `19.41×` faster live p99, `173×` cleaner 10-study tail max (`27.5 µs` vs `4.77 ms`), true global memory capping, and gradual static typing for IDE autocomplete/diagnostics.
- **Strict Non-Repainting & Multi-Chart RAM Safety:** Snapshot/rollback intrabar previews, closed-bar MTF alignment, Cranelift NaN canonicalization, and the `<= 64 MiB` global study memory pool with hidden-tab LRU eviction are enforced centrally in `allegedly-studies`.

### Negative & Trade-Offs
- **C++17 Build Dependency for Luau:** `luau0-src` compiles Roblox's vendored C++17 Luau VM via the `cc` crate (unlike pure-Rust Rhai), requiring working Xcode CLT (`clang++`) on macOS and MSVC Build Tools (`cl.exe`) on Windows CI runners.
- **Two Sandboxed Runtimes to Maintain:** Maintaining both Wasmtime (Tier 2) and Luau (Tier 3) host bindings inside `allegedly-studies` adds modest glue code (`~1–2k` LOC), mitigated by sharing a single canonical flat-buffer `BarInput` / `StudyOutput` Rust host adapter.
- **Deferred Pine-Style Syntax:** Traders expecting immediate copy-paste Pine Script® compatibility must wait until v0.4+ (and even then, Allegedly ships a clean-room Pine-inspired subset rather than claiming 100% proprietary Pine v6 parity).

### Operational
- Pre-compile downloaded/local `.wasm` modules into `plugins/cache/cwasm/` keyed by `(artifact_sha256, wasmtime_version, target_triple)` to avoid `31.651 ms` cold Cranelift compilation on every startup.
- Default Luau per-study memory limit to `16–32 MiB` (configurable up to `64 MiB` ceiling, subject to the `<= 64 MiB` global pool cap) paired with per-tick instruction interrupts so worst-case memory bombs trap in `< 5 ms` (`S07` Caveat #3).

---

## 6. Reversal Cost

- **Tier 2 (Wasmtime) Reversal Cost: Medium (`2–4` weeks).** Because `Study` plugins speak a clean fixed-point flat SoA ABI (`Plugin-ABI.md`), switching the WASM engine backend (e.g., to Wasmtime's `Pulley` interpreter or `wasmi`) requires changing only the WASM host module inside `allegedly-studies` without breaking plugin `.wasm` binaries.
- **Tier 3 (Luau → Rhai / QuickJS) Reversal Cost: High after v0.3 public release (Low before v0.3).** Once users write and share `.luau` studies, replacing the embedded language breaks community scripts; pre-v0.3 reversal is trivial (`< 3` days, since `rhai_runner.rs` already exists in `S07`).

---

## 7. Revisit Triggers

Re-open ADR-0005 if any of the following measurable conditions occurs:
1. **Windows MSVC Build or Binary Bloat Failure:** `luau0-src` fails clean compilation on `x86_64-pc-windows-msvc` or combined Wasmtime + Luau stripped delta exceeds `6 MiB` compressed (`gzip-9`) on Windows.
2. **Optional WIT Component Model Regression:** Enabling `wasmtime::component` in a `v0.1` Implementation CI spike adds `> 5 MiB` compressed binary size or degrades `100k`-bar batch execution beyond `10 ms` (`> 6×` native), in which case keep the core flat SoA linear-memory ABI permanently.
3. **Permissive FOSS Pine Compiler Emerges:** A maintained `Apache-2.0`/`MIT` (or `v1.0+` `MPL-2.0` `pinecone`) Pine v5/v6 front-end matures before v0.4, reducing custom DSL compiler scope.
4. **Numerical Divergence (`KC-06`):** Any built-in `Study` diverges from `TA-Lib v0.8.3` beyond agreed fixed-point tolerance on `v0.1` Implementation CI golden datasets.

---

## 8. Evidence Links & `UNVERIFIED` Items

- **Primary Evidence:** [`03-Spikes/S07-Scripting-Sandbox.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/03-Spikes/S07-Scripting-Sandbox.md), [`02-Research/R06-Scripting-Indicator-Engine.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R06-Scripting-Indicator-Engine.md), [`04-Architecture/Adopt-Build-Fork.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/04-Architecture/Adopt-Build-Fork.md), [`06-Risk/License-Registry.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/06-Risk/License-Registry.md), [`04-Architecture/Plugin-ABI.md`](file:///Users/abelmora/Documents/Obsidian/Allegedly/04-Architecture/Plugin-ABI.md).
- **`UNVERIFIED` Item 1 — `TA-Lib v0.8.3` C Library Parity:** S07 verified `0.000e0` parity across Native Rust, Wasmtime, Luau, and Rhai, but cross-checking against the external `TA-Lib v0.8.3` (`BSD-3-Clause`) C oracle remains a `v0.1` Implementation CI (post-Phase-5) test task.
- **`UNVERIFIED` Item 2 — Windows `x86_64-pc-windows-msvc` Stripped Size, Luau MSVC Build & Cross-OS SHA-256 Parity:** S07 size probes were verified on `aarch64-apple-darwin`; Windows MSVC verification is mandatory in `v0.1` Implementation CI (post-Phase-5) before v0.2/v0.3 lock.
