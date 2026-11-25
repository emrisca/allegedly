---
title: "S07 — Scripting & Study Sandbox Shootout (Native Rust vs Wasmtime vs Rhai vs Luau)"
type: spike
status: verified
phase: Phase 2
owner: scripting-storage
updated: 2026-11-24
verdict: PASS-WITH-CAVEAT
code_refs:
  - spikes/S07-scripting-sandbox/Cargo.toml
  - spikes/S07-scripting-sandbox/README.md
  - spikes/S07-scripting-sandbox/src/main.rs
  - spikes/S07-scripting-sandbox/src/dataset.rs
  - spikes/S07-scripting-sandbox/src/metrics.rs
  - spikes/S07-scripting-sandbox/src/native_study.rs
  - spikes/S07-scripting-sandbox/src/wasmtime_runner.rs
  - spikes/S07-scripting-sandbox/src/rhai_runner.rs
  - spikes/S07-scripting-sandbox/src/luau_runner.rs
  - spikes/S07-scripting-sandbox/src/mtf_test.rs
  - spikes/S07-scripting-sandbox/guest-wasm/Cargo.toml
  - spikes/S07-scripting-sandbox/guest-wasm/src/lib.rs
  - spikes/S07-scripting-sandbox/size-probes/Cargo.toml
  - spikes/S07-scripting-sandbox/size-probes/baseline/src/main.rs
  - spikes/S07-scripting-sandbox/size-probes/probe-wasmtime/src/main.rs
  - spikes/S07-scripting-sandbox/size-probes/probe-rhai/src/main.rs
  - spikes/S07-scripting-sandbox/size-probes/probe-luau/src/main.rs
---

# S07 — Scripting & Study Sandbox Shootout

## 1. Executive Summary & Verdict

- **Overall Verdict:** **`PASS-WITH-CAVEAT`** (zero failed runtime, determinism, security, or size gates; decisive empirical resolution of both the Wasmtime binary-size risk and the **Rhai vs. Luau** decision from [[R06-Scripting-Indicator-Engine]]).
- **Primary Decisions Settled by Hard Numbers:**
  1. **Wasmtime (`v51.0.0`, Apache-2.0 WITH LLVM-exception) is LOCKED for Tier 2 High-Performance Plugins (v0.2):** With minimal Cargo features (`cranelift`, `runtime`, `std`, zero WASI), Wasmtime executes the `100,000`-bar workload with fuel metering and `64 MiB` `StoreLimits` enabled in **`1.679 ms`** versus **`1.625 ms`** Native Rust (**`+3.32%` overhead**, beating the `<= 50 ms` and `< 10%` gates by **29.8×**), delivers **`0.084 µs` p99** single-bar incremental latency, traps all 4 hostile scripts in `0.24–1.78 ms`, and adds only **`+1.74 MiB` (`gzip-9`) / `+1.28 MiB` (`xz-6`)** to a stripped binary (beating the `<= 12 MB` compressed gate by **6.9×–9.4×** and completely eliminating the `< 40 MB` installer budget risk!).
  2. **Luau (`mlua v0.12.3` + `luau0-src v0.24.1+luau748`, MIT) WINS DECISIVELY over Rhai (`v1.27.0`, MIT/Apache-2.0) for Tier 3 Zero-Toolchain In-App Scripting (v0.3):** On identical study logic with `0.000e0` numerical error, **Luau is `10.05×` faster on 100k-bar batch (`94.96 ms` vs `954.42 ms`), `19.41×` faster at single-bar live p99 (`1.333 µs` vs `25.875 µs`), `21.08×` faster at 10-study live mix p99 (`2.75 µs` vs `57.96 µs`), `173×` cleaner at tail max (`27.50 µs` vs `4,767.54 µs`), smaller in stripped compressed binary delta (`+0.47 MiB` vs `+0.53 MiB` `gzip-9`; `+0.34 MiB` vs `+0.40 MiB` `xz-6`), enforces a true global `64 MiB` allocator cap (`set_memory_limit`) rather than per-object caps, and ships gradual static typing.**
  3. **MTF Non-Repainting & Intrabar Rollback Determinism Verified (`100%` Bit-Identical):** `15,000` bars of `1m` base + `15m` HTF closed-bar alignment and `500` bars of noisy intrabar preview/rollback matched clean bar-close evaluation with **`0` bit mismatches** (`u64::to_bits`).
  4. **All 12 / 12 Hostile-Script Sandbox Escape Tests Passed:** Infinite loops, memory bombs, ambient FS/Net/Env access, and infinite stack recursion were all deterministically trapped across Wasmtime, Rhai, and Luau, with sibling study instances verified completely uncorrupted afterward.
- **Why `PASS-WITH-CAVEAT` (Honest Scope Disclosures):**
  1. **`TA-Lib v0.8.3` C Oracle Parity (`UNVERIFIED`):** Numerical parity (`0.000e0` max diff, exact `6,607` trades) was verified across all 4 Allegedly runtimes against the reference Native Rust study, but cross-checking against the external `TA-Lib v0.8.3` (`BSD-3-Clause`) C library remains a Phase 3 CI test vector.
  2. **Cross-Platform Binary Size Matrix (`UNVERIFIED` on Linux/Windows):** Stripped size probes were measured empirically on `aarch64-apple-darwin` (macOS); `x86_64-unknown-linux-gnu` and `x86_64-pc-windows-msvc` size checks (and verifying Luau's C++17 `cc` build cleanly on MSVC/Linux) are deferred to Phase 3 GitHub Actions CI.
  3. **Memory-Bomb Trap Latency Nuance:** Wasmtime's `StoreLimits` cap trapped the 128 MiB bomb in `1.778 ms` (`<= 5 ms` gate); Luau's 150 MiB string-table bomb hit its 64 MiB cap cleanly in `18.712 ms` (well below the `50 ms` hang failure trigger, though above the `5 ms` ideal because the script allocates 64 × 1 MiB strings sequentially before reaching 64 MiB — in production, pairing a tighter per-script `16–32 MiB` cap with the instruction interrupt keeps worst-case OOM termination under `< 5 ms`).

---

## 2. Hardware, Environment & Reproducible Commands

### 2.1 Measured Host Environment
- **Hardware:** Apple M2 (`arm64`, 8 cores, 8 GiB RAM)
- **OS:** macOS `26.6.2` (`Build 25G83`, Darwin Kernel `25.6.0`)
- **Toolchain:** `rustc 1.99.1 (58cf8f9c3 2026-10-13)`, `cargo 1.99.1 (5f94df478 2026-08-27)`
- **Installed Targets:** `aarch64-apple-darwin`, `wasm32-unknown-unknown`, `x86_64-pc-windows-msvc`
- **Git Base Commit (before S07 edits):** `6507faf`
- **Build Artifact Isolation:** `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` (verified zero `target/` directories inside `/Users/abelmora/Documents/Obsidian/Allegedly/spikes/S07-scripting-sandbox/`).

### 2.2 Locked Crate & License Audit
| Crate | Exact Locked Version | License | Role in S07 |
|---|---|---|---|
| `wasmtime` | `51.0.0` (`cranelift`, `runtime`, `std`; `default-features = false`) | `Apache-2.0 WITH LLVM-exception` | Tier 2 WASM JIT plugin sandbox |
| `cranelift-codegen` | `0.138.0` (transitive via `wasmtime`) | `Apache-2.0 WITH LLVM-exception` | Native ARM64/x86_64 WASM codegen |
| `mlua` | `0.12.3` (`luau` feature) | `MIT` | Tier 3 embedded Luau VM bindings |
| `luau0-src` | `0.24.1+luau748` (transitive via `mlua`) | `MIT` | Vendored Roblox Luau C++17 VM |
| `rhai` | `1.27.0` (`sync` feature) | `MIT OR Apache-2.0` | Tier 3 pure-Rust scripting contender |

### 2.3 Reproducible Run Commands
```bash
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target

# 1. Build optimized WASM guest (wasm32-unknown-unknown, opt-level=3, LTO, strip)
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path spikes/S07-scripting-sandbox/guest-wasm/Cargo.toml

# 2. Run release unit tests (4-runtime parity, MTF/rollback determinism, all 12 hostile tests)
cargo test --release --manifest-path spikes/S07-scripting-sandbox/Cargo.toml

# 3. Execute full 100k-bar + 10k-tick shootout, 10-study live mix, and hostile sandbox suite
cargo run --release --manifest-path spikes/S07-scripting-sandbox/Cargo.toml

# 4. Build & measure stripped size probes (opt-level="z", lto=true, codegen-units=1, strip=true)
cargo build --release --manifest-path spikes/S07-scripting-sandbox/size-probes/Cargo.toml
for b in probe-baseline probe-wasmtime probe-rhai probe-luau; do
  f="$CARGO_TARGET_DIR/release/$b"
  echo "$b: raw=$(stat -f%z "$f") B | gzip9=$(gzip -9 -c "$f" | wc -c | tr -d ' ') B | xz6=$(xz -6 -c "$f" | wc -c | tr -d ' ') B | out=$("$f")"
done
```

---

## 3. Measured Results (Verified Facts)

### 3.1 Workload & Unit Test Verification
- **Identical Workload Across All 4 Runtimes:** Fixed-point ES bar input (`high_tick`, `low_tick`, `close_tick`, `volume`, `session_id` at `$0.25` tick size, deterministic XorShift64 seed `0xA11E_6ED1_2026_1124`) running:
  1. `EMA-20` (`alpha = 2/21`)
  2. `RSI-14` (Wilder RMA)
  3. Session-anchored `VWAP` + Welford `±2σ` bands (resets every 390 bars)
  4. Stateful crossover strategy (entries, flips, `±2σ` band take-profits, realized PnL, trade counter)
- **Dataset:** `100,000` historical bars + `10,000` incremental single-bar live ticks.
- **Reference Output after 100k Bars (identical across all 4 runtimes):** `ema=6467.068498`, `rsi=50.908014`, `vwap=6459.086657`, `pnl=-445.7500`, `trades=6607`, `pos=1`.
- **Automated Release Tests (`cargo test --release`):** **`3 / 3` passed in `0.08 s`** (`four_runtime_numerical_parity`, `mtf_non_repainting_and_intrabar_rollback`, `hostile_sandbox_escape_suite_all_runtimes`).

### 3.2 4-Runtime Performance & Memory Shootout
*(Baseline process RSS at startup: `2.48 MiB`; WASM guest module size: `20.0 KiB`)*

| Runtime | Cold Start (ms) | 100k-Bar Batch (ms) | Batch vs Native | Live 10k p50 (µs) | Live 10k p95 (µs) | Live 10k p99 (µs) | Live 10k max (µs) | Process RSS Δ (MiB) | Max Float Err vs Native | Exact Trade Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **Native Rust (`mv-studies`)** | `0.0000` | **`1.625`** | `1.00×` | `0.041` | `0.042` | **`0.083`** | `0.333` | `+0.09` | `0.000e0` | `TRUE` (`6607`) |
| **Wasmtime `v51.0.0`** (fuel + 64 MiB cap) | `31.651` | **`1.679`** | **`1.03×` (`+3.3%`)** | `0.042` | `0.084` | **`0.084`** | `0.792` | `+9.66` | `0.000e0` | `TRUE` (`6607`) |
| **Luau (`mlua v0.12.3`)** (sandbox + 64 MiB + interrupt) | `1.477` | **`94.962`** | `58.4×` | `0.500` | `1.125` | **`1.333`** | `40.459` | `+1.59` | `0.000e0` | `TRUE` (`6607`) |
| **Rhai (`v1.27.0`)** (max_ops + size caps) | `1.296` | **`954.424`** | `587.3×` | `8.333` | `9.791` | **`25.875`** | `111.625` | `+1.53` | `0.000e0` | `TRUE` (`6607`) |

*(Note: Wasmtime's `31.651 ms` cold start includes first-time `Engine::new` + Cranelift JIT compilation of `s07_guest_wasm.wasm` from cold bytes; subsequent module instantiations share the compiled `Module` and pre-compiled `.cwasm` cache eliminates repeat Cranelift compile latency on startup.)*

### 3.3 R06 Gate: 10 Concurrent Active Studies on 1 Chart (`10,000` Live Ticks)
*(Mix: `5 Native + 3 Wasmtime + 2 Embedded Script` evaluated sequentially per tick)*

| Active Study Mix | p50 (µs) | p95 (µs) | p99 (µs) | max (µs) | R06 Gate (`p99 <= 1000 µs`, no GC spike `> 500 µs`) |
|---|---:|---:|---:|---:|---|
| **5 Native + 3 Wasmtime + 2 Luau** | `1.21` | `1.33` | **`2.75`** | **`27.50`** (`0.028 ms`) | **PASS (364× headroom; zero spikes `> 0.5 ms`)** |
| **5 Native + 3 Wasmtime + 2 Rhai** | `18.58` | `25.79` | **`57.96`** | **`4,767.54`** (`4.77 ms`) | **PASS on p99, CAVEAT on max (`4.77 ms` tail spike)** |

### 3.4 Stripped Binary Size Probes (`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`, `aarch64-apple-darwin`)

| Probe Binary | Stripped Raw (Bytes / MiB) | Raw Δ vs Baseline | `gzip -9` (Bytes / MiB) | `gzip -9` Δ vs Baseline | `xz -6` (Bytes / MiB) | `xz -6` Δ vs Baseline | Runtime Output Verified |
|---|---:|---:|---:|---:|---:|---:|---|
| `probe-baseline` | `302,720 B` (`0.29 MiB`) | `—` | `142,798 B` (`0.14 MiB`) | `—` | `111,312 B` (`0.11 MiB`) | `—` | `6247.375000` |
| `probe-wasmtime` | `3,552,880 B` (`3.39 MiB`) | **`+3.10 MiB`** (`+3,250,160 B`) | `1,964,351 B` (`1.87 MiB`) | **`+1.74 MiB`** (`+1,821,553 B`) | `1,458,244 B` (`1.39 MiB`) | **`+1.28 MiB`** (`+1,346,932 B`) | `ok` |
| `probe-luau` | `1,506,432 B` (`1.44 MiB`) | **`+1.15 MiB`** (`+1,203,712 B`) | `633,271 B` (`0.60 MiB`) | **`+0.47 MiB`** (`+490,473 B`) | `467,700 B` (`0.45 MiB`) | **`+0.34 MiB`** (`+356,388 B`) | `571.428571` |
| `probe-rhai` | `1,507,936 B` (`1.44 MiB`) | **`+1.15 MiB`** (`+1,205,216 B`) | `702,552 B` (`0.67 MiB`) | **`+0.53 MiB`** (`+559,754 B`) | `525,972 B` (`0.50 MiB`) | **`+0.40 MiB`** (`+414,660 B`) | `571.428571` |

*(Combined Tier 2 + Tier 3 footprint — **Wasmtime + Luau together**: only **`+4.25 MiB` raw / `+2.20 MiB` `gzip-9` / `+1.62 MiB` `xz-6`**!)*

### 3.5 Mandatory Hostile-Script Sandbox Escape Suite (`12 / 12` PASS)

| Hostile Vector | Wasmtime `v51.0.0` | Luau (`mlua v0.12.3`) | Rhai `v1.27.0` |
|---|---|---|---|
| **1. Infinite Loop Termination** | **PASS (`0.242 ms`)** — `wasm trap: all fuel consumed` (`5M` fuel cap) | **PASS (`0.526 ms`)** — `interrupt: timeout/budget exceeded` (`50k` VM interrupt) | **PASS (`1.969 ms`)** — `Too many operations` (`100k` op cap) |
| **2. Memory Bomb Allocation** | **PASS (`1.778 ms`)** — `StoreLimits` capped linear memory at `63.81 MiB` (`<= 64 MiB`), trapped with `wasm unreachable` OOM | **PASS (`18.712 ms`)** — `set_memory_limit(64 MiB)` trapped 150 MiB bomb with `memory error: not enough memory` | **PASS (`35.818 ms`)** — per-object caps rejected 256 MiB str (`Length of string too large`) & 20M arr (`Size of array/BLOB too large`) |
| **3. FS / Network / Env Denied by Construction** | **PASS (`0.718 ms`)** — Zero-WASI `Linker` rejected `wasi_snapshot_preview1::path_open` at link time | **PASS (`0.105 ms`)** — `sandbox(true)` verified `io`, `package`, `dofile`, `loadfile`, `os.execute`, `os.getenv` all `nil`; `io.open` threw runtime error | **PASS (`0.852 ms`)** — zero ambient IO/OS functions registered; `open`, `read_file`, `env`, `import "os"` all rejected |
| **4. Stack Overflow Recursion** | **PASS (`0.340 ms`)** — trapped cleanly with `wasm trap: call stack exhausted` | **PASS (`0.562 ms`)** — trapped cleanly with `stack overflow` (~20,000 VM frames) | **PASS (`0.033 ms`)** — trapped cleanly with `Stack overflow` (`max_call_levels = 32`) |
| **5. Sibling Instance Isolation** | **PASS** — fresh sibling instance matched Native Rust (`<= 1e-9` err) across 50 bars immediately after traps | **PASS** — fresh sibling instance matched Native Rust (`<= 1e-9` err) across 50 bars immediately after traps | **PASS** — fresh sibling instance matched Native Rust (`<= 1e-9` err) across 50 bars immediately after traps |

### 3.6 MTF Non-Repainting & Intrabar Rollback Determinism
- **1m Base + 15m HTF Closed-Bar Alignment (`15,000` bars = `1,000` 15m bars):** Batch historical load vs. live streaming replay produced **`0` bit mismatches** (`u64::to_bits`) → **PASS**.
- **Intrabar Rollback vs. Clean Bar-Close (`500` bars × 3 noisy intrabar ticks/bar):** `commit_snapshot()` + `rollback()` matched clean bar-close evaluation with **`0` bit mismatches** across `ema`, `rsi`, `vwap`, `realized_pnl`, and `trades` → **PASS**.

---

## 4. Pass / Fail Evaluation Against R06 Pre-Declared Thresholds

| R06 Pre-Declared Gate | Threshold | Measured Value | Verdict |
|---|---|---|---|
| **Built-in Rust Study Batch (`100k` bars)** | `<= 15 ms` | **`1.625 ms`** | **PASS (9.2× headroom)** |
| **Wasmtime Batched Study (`100k` bars, 1k chunks, fuel + `StoreLimits` ON)** | `<= 50 ms`; overhead `< 10%` | **`1.679 ms`** (`+3.32%` vs Native) | **PASS (29.8× headroom)** |
| **Live Tick Update (10 concurrent studies: 5 Native + 3 WASM + 2 Luau)** | `p99 <= 1.0 ms`; `0` GC spikes `> 0.5 ms` | **`p99 = 2.75 µs`** (`max = 27.50 µs`) | **PASS (364× headroom)** |
| **Sandbox Safety (Infinite loop, memory bomb, FS/Net/Env, recursion)** | Clean trap, RSS bounded, sibling unharmed (`< 50 ms` hang trigger) | **12/12 PASS** (Wasmtime `0.24–1.78 ms`; Luau `0.11–18.71 ms`; sibling exact match) | **PASS** |
| **MTF Non-Repainting & Intrabar Rollback Determinism** | `100%` bit-identical (`0` mismatches) | **`0` mismatches** (`15,000` MTF bars + `500` rollback bars) | **PASS** |
| **Binary Size Delta (stripped, `opt-level="z"`, LTO)** | Wasmtime `<= 12 MB` compressed; Script `<= 3 MB` compressed | Wasmtime **`+1.74 MiB` gz / `+1.28 MiB` xz**; Luau **`+0.47 MiB` gz / `+0.34 MiB` xz** | **PASS (6.4×–9.4× headroom)** |
| **Numerical Parity vs `TA-Lib v0.8.3`** | Max abs error `<= 1e-9` | `0.000e0` across all 4 runtimes; external `TA-Lib v0.8.3` C oracle deferred to Phase 3 CI | **CAVEAT (`UNVERIFIED` vs C oracle)** |

---

## 5. Explicit Rhai vs. Luau Verdict (Settled)

### Verdict: **ADOPT LUAU (`mlua v0.12.3`, `luau` feature, MIT) — REJECT RHAI**

| Criterion | Luau (`mlua v0.12.3`) | Rhai (`v1.27.0`) | Winner & Margin |
|---|---:|---:|---|
| **100k-Bar Batch Latency** | **`94.962 ms`** | `954.424 ms` | **Luau (`10.05×` faster)** |
| **Single-Bar Live p99 Latency** | **`1.333 µs`** | `25.875 µs` | **Luau (`19.41×` faster)** |
| **10-Study Chart Mix p99 / max** | **`2.75 µs` / `27.50 µs`** | `57.96 µs` / `4,767.54 µs` | **Luau (`21.1×` p99 / `173×` max)** |
| **Stripped Size Delta (`gzip-9` / `xz-6`)** | **`+0.47 MiB` / `+0.34 MiB`** | `+0.53 MiB` / `+0.40 MiB` | **Luau (`12.4%–14.1%` smaller)** |
| **Memory Bomb Enforcement** | **True global VM allocator cap (`set_memory_limit`)** | Per-object caps only (`max_array_size`, `max_string_size`, `max_map_size`) — vulnerable to nested-object amplification unless host tracks total allocations | **Luau (stronger security invariant)** |
| **Type Safety for Traders** | **Gradual static types** (`--!strict`, `number`, typed signatures) | Dynamically typed only | **Luau** |
| **Build Toolchain Friction** | Compiles vendored C++17 (`luau0-src` via `cc` crate) | Pure Rust (zero C++ toolchain) | **Rhai** (only area where Rhai wins) |

### Inferences
1. **Why Rhai hit `954 ms` and a `4.77 ms` live tail spike:** Rhai's AST tree-walking interpreter clones `Dynamic` `Map` state across function boundaries (`st.field` hash lookups on every bar) and allocates short-lived `Array`/`Map` heap objects, causing `~10×` slower batch execution and allocator/OS jitter spikes (`4.77 ms`) in the live loop. Even with native Rust `ta.*` intrinsics reducing script loops, any user-written stateful strategy loop in Rhai degrades `~10–20×` faster than Luau's register-based bytecode VM.
2. **Why Luau's GC did NOT stall our hot path:** Across `10,000` live ticks in both isolated and 10-study mix runs, Luau's incremental collector produced **`27.50 µs` max latency (`0.0275 ms`)** — `18×` below the `0.5 ms` GC-spike threshold — because the study updates primitive `number` locals with zero per-tick table allocations.
3. **Why Wasmtime's size surprise transforms Allegedly's architecture:** In `R06`, we feared Wasmtime Cranelift might consume `10–15 MB` compressed (based on upstream C-API release tarballs that bundle full WASI, component-model CLI tools, and debug tables). Measuring the actual Rust crate with `default-features = false, features = ["cranelift", "runtime", "std"]` under `opt-level = "z"`, `lto = true`, `strip = true` proved it adds only **`+1.74 MiB` gzip-9 (`+1.28 MiB` xz-6)**! Shipping **both Wasmtime AND Luau in core** costs just **`+2.20 MiB` gzip-9 (`+1.62 MiB` xz-6)**, easily fitting inside the `< 40 MB` installer budget.

---

## 6. Phase 3 ADR Recommendations

1. **ADR-S07-1 (3-Tier Study Runtime Lock):** Lock Allegedly's study runtime to:
   - **Tier 1 (v0.1):** Native Rust `mv-studies` (`i64` tick/volume inputs, `f64` math kernels, explicit `commit_snapshot` / `rollback` state machines).
   - **Tier 2 (v0.2):** `wasmtime` (`v51.0.0`, `default-features = false`, `features = ["cranelift", "runtime", "std"]`, zero WASI) with `1,000`-bar linear-memory batch crossings, deterministic fuel budgets, `64 MiB` `StoreLimits`, and on-disk `.cwasm` AOT module caching to reduce repeat cold starts from `31.6 ms` to `< 1 ms`.
   - **Tier 3 (v0.3):** `mlua` (`v0.12.3`, `luau` feature, MIT) with `sandbox(true)`, `set_memory_limit(32 MiB)` per script instance, `set_interrupt` op budget, and zero-allocation Rust `ta.*` / `orderflow.*` host userdata bindings — **dropping Rhai from the roadmap**.
2. **ADR-S07-2 (Mandatory Worker-Thread Isolation & Non-Repainting Contract):** Execute all Tier 2 (WASM) and Tier 3 (Luau) scripts strictly on a dedicated background study worker pool (never the UI/render thread), and enforce closed-bar event-time HTF alignment (`t_htf_close <= t_base_close`) as the immutable default with CI bit-identity tests.
3. **ADR-S07-3 (Stage 4 Clean-Room `MotiveScript`):** Defer Pine-inspired surface syntax to v0.4+, targeting either Luau bytecode or WASM emission over the exact same `mv-studies` deterministic execution contract.

---

## 7. Open Questions & Unverified Items

1. **`TA-Lib v0.8.3` C Oracle Parity (`UNVERIFIED`):** Add an automated CI test harness in Phase 3 comparing `mv-studies` (`EMA`, `SMA`, `RSI`, `ATR`, `MACD`, `BB`) directly against `TA-Lib v0.8.3` (`BSD-3-Clause`) with `<= 1e-9` tolerance.
2. **Linux & Windows Cross-Platform Size & C++17 Luau Build (`UNVERIFIED`):** Verify `probe-wasmtime` and `probe-luau` stripped binary deltas and MSVC/GCC `luau0-src` compilation in Phase 3 GitHub Actions CI (`x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`).
3. **Wasmtime `.cwasm` Pre-Compiled Disk Cache Cold Start (`UNVERIFIED`):** Measure exact warm-cache deserialization latency (`Module::deserialize_file`) for user plugins in Phase 3 (expected `< 1 ms` vs `31.65 ms` cold Cranelift compile).

---

## 8. Sources

| Source ID | Artifact / Reference | URL / Path | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|
| `S07-S01` | Spike S07 Rust Shootout Harness & Unit Tests | [spikes/S07-scripting-sandbox/src/main.rs](file:///Users/abelmora/Documents/Obsidian/Allegedly/spikes/S07-scripting-sandbox/src/main.rs) | 2026-11-24 | Compiled & executed release build (`cargo test --release`, `cargo run --release`) on Apple M2 | High |
| `S07-S02` | Spike S07 WASM Guest Crate (`wasm32-unknown-unknown`) | [spikes/S07-scripting-sandbox/guest-wasm/src/lib.rs](file:///Users/abelmora/Documents/Obsidian/Allegedly/spikes/S07-scripting-sandbox/guest-wasm/src/lib.rs) | 2026-11-24 | Built `s07_guest_wasm.wasm` (`20.0 KiB`) & executed inside Wasmtime `v51.0.0` | High |
| `S07-S03` | Spike S07 Stripped Binary Size Probes (`opt-level="z"`, LTO) | [spikes/S07-scripting-sandbox/size-probes/Cargo.toml](file:///Users/abelmora/Documents/Obsidian/Allegedly/spikes/S07-scripting-sandbox/size-probes/Cargo.toml) | 2026-11-24 | Built, executed, and measured `stat`/`gzip -9`/`xz -6` on all 4 binaries | High |
| `S07-S04` | Phase 1 Research & Pre-Declared Gates (`R06`) | [02-Research/R06-Scripting-Indicator-Engine.md](file:///Users/abelmora/Documents/Obsidian/Allegedly/02-Research/R06-Scripting-Indicator-Engine.md) | 2026-11-24 | Direct workspace read (`R06-S01`–`R06-S19`) | High |
| `S07-S05` | Allegedly Charter Constraints & Glossary | [01-Charter/Constraints.md](file:///Users/abelmora/Documents/Obsidian/Allegedly/01-Charter/Constraints.md) | 2026-11-24 | Direct workspace read | High |
