---
title: R06 — Study Runtime, Scripting Language & Pine-Subset Engine
track: R06
status: verified
owner: research-scripting
updated: 2026-11-24
code_refs: []
---

# R06 — Study Runtime, Scripting Language & Pine-Subset Engine

## Question

How should Allegedly design a deterministic, local-first, sandboxed **Study** runtime and scripting engine that:
1. Executes built-in and user-authored studies (overlays, oscillators, order-flow calculators, alerts) with O(1) incremental bar/tick updates, multi-timeframe (MTF) lookahead-bias prevention, and zero GC stalls in the hot path ([[Constraints#1. Eight Design Non-Negotiables]]).
2. Respects the `< 40 MB` installer, `< 2 s` cold start, `< 300 MB` idle RAM, `$0` core, and strict FOSS/clean-room licensing constraints.
3. Provides a realistic, legally clean path toward a Pine-inspired scripting workflow (`MotiveScript`) without falling into copyleft/source-available license traps or multi-year compiler rabbit holes before v0.1 ships.

---

## Findings

> Per [[Constraints#2. Evidence Protocol (Strict Anti-Hallucination)]], this section reports verified **Facts** grounded in primary GitHub repositories, `LICENSE` files, package registries, and official documentation retrieved on `2026-11-24`. Synthesis and architectural judgments are separated into [[#Inferences]] and [[#Recommendation + Rationale]].

### 1. Study Runtime Architecture (Technical Specification)

To combine TradingView's concise series-oriented authoring model with MotiveWave's order-flow depth while obeying [[Constraints#1. Eight Design Non-Negotiables]] (fixed-point money/tick math, zero GC stalls, deterministic replay), Allegedly's Study Runtime should separate **execution semantics** from **front-end syntax** via a language-agnostic **Study Engine Core (Rust)**.

#### 1.1 Series & Bar-State Model
- **Canonical Numeric Boundary:** Market inputs (`open`, `high`, `low`, `close`, `price_tick`, `volume`, `bid_volume`, `ask_volume`, `delta`, book levels) enter the runtime as exact fixed-point integers (`i64` scaled to instrument `tick_size` or `1e-9` fixed-point units, never IEEE-754 floats for prices or quantities — see [[R07-Storage-Replay-Backtest]]). Statistical/transcendental study intermediates (e.g., EMA smoothing, RSI Wilder ratios, standard deviation, FFT/filters) compute in deterministic `f64` (IEEE-754 round-to-nearest-even, explicit `NaN`/`na` propagation) and convert back to exact `i64` price ticks when emitting price-anchored levels or alert thresholds.
- **Ring-Buffered Series Storage (`Series<T>`):** Each series variable allocates a fixed-capacity ring buffer sized statically from the script's declared/inferred maximum lookback (`max_bars_back`, default `500`, user-overridable up to configured ceiling). Indexing `s[0]` is current bar, `s[k]` is `k` bars back in O(1) with zero per-bar heap allocation.
- **Explicit Bar-State Machine (Verified against Pine v6 execution semantics, `R06-S01`, `R06-S02`):**
  - Historical replay phase: executes once per finalized historical **Bar** (`bar_index = 0..N-1`), committing state after each bar (`is_history = true`, `is_confirmed = true`, `is_new = true`).
  - Live/realtime phase: on each incoming **trade tick** or bar update on the rightmost open bar (`is_realtime = true`), the runtime snapshots committed bar-close state and executes an **intrabar rollback** before re-evaluating the open bar.
  - Exposed state flags: `bar_state.is_first`, `bar_state.is_last`, `bar_state.is_history`, `bar_state.is_realtime`, `bar_state.is_new`, `bar_state.is_confirmed`, `bar_state.is_last_confirmed_history`.
- **Persistence Semantics (`var` vs. `varip`):**
  - Regular series variable: recalculated every bar/tick; rolled back on intrabar ticks.
  - `var` (bar-persistent): initialized once on `bar_index == 0` (or first branch entry), carries forward across closed bars, **rolls back to last bar-close snapshot** on every live intrabar tick so live-bar flickering never corrupts committed bar state (`R06-S02`).
  - `varip` (intrabar-persistent): initialized once, **exempt from intrabar rollback**; retains mutations across live intrabar ticks (useful for live tick counters or first-touch latches). Because historical bars lack intrabar tick replay unless tick-backed replay is enabled, the runtime MUST emit a non-blocking **Repainting Diagnostic Warning** whenever a study uses `varip` on OHLCV-only history (`R06-S02`).

#### 1.2 Incremental O(1) vs. Vectorized Evaluation
- **Live & Replay Hot Path — Incremental O(1) State Machines:** Every built-in study (SMA via rolling sum + ring subtraction, EMA/RMA via recursive state, Welford variance/Bollinger, RSI via Wilder running avg gains/losses, ATR, VWAP/session-anchored VWAP, CVD, Footprint Imbalance, Volume Profile) MUST maintain O(1) state per bar/tick update with explicit `rollback()` / `commit()` support for open-bar intrabar ticks.
- **Historical Warmup / Batch Backfill — Vectorized / Chunked Pass:** When loading `100,000+` historical bars from Parquet ([[R07-Storage-Replay-Backtest]]), built-in Rust studies execute in tight contiguous-slice loops (LLVM auto-vectorized / SIMD-friendly columnar arrays of `i64`/`f64`) before handing off committed state structs to the live O(1) stream.
- **User Scripts:** Evaluated bar-by-bar over a pre-populated columnar window (or via compiled WASM batch entrypoint `eval_batch(start_idx, end_idx)` to amortize host↔guest crossings: 1 boundary call per 1,000 historical bars instead of 100,000 per-bar calls).

#### 1.3 Multi-Timeframe (MTF) & Cross-Instrument Calls (`request_series`) + Repainting Prevention
In TradingView Pine v5/v6, `request.security()` is the #1 source of accidental lookahead bias and repainting (`R06-S01`, `R06-S03`). TradingView's own Script Publishing Rules explicitly forbid publishing scripts with `barmerge.lookahead_on` on non-offset higher-timeframe (HTF) expressions (`R06-S03`).

Allegedly's Study Runtime enforces **safe-by-default MTF alignment**:
1. **Event-Time Close Alignment (Default = Non-Repainting):** A base chart bar with close time `t_base_close` may ONLY observe HTF bars whose `t_htf_close <= t_base_close`. This guarantees identical outputs on historical backfill, deterministic replay, and live feeds.
2. **Explicit Developing-Bar Mode (`mode = Developing`):** Opt-in only; exposes the currently forming HTF bar during live streaming and on tick-replayed history, and tags the study output with a visible UI **Repainting / Developing Badge** (honest data provenance, [[Constraints#1. Eight Design Non-Negotiables]] #8).
3. **Hard Prohibition on Future Lookahead:** `lookahead_on` without explicit historical shift is disallowed in normal study and backtest execution (only permitted under an explicit `research_lookahead_oracle` debug flag that stamps all outputs `NON-TRADABLE / LOOKAHEAD`).
4. **Lower-Timeframe Intrabar Access (`request_intrabar`):** Returns a bounded slice of lower-timeframe bars or trade ticks enclosed within `[t_base_open, t_base_close]` (required for order-flow studies like footprint delta, absorption, and intra-bar VWAP).

#### 1.4 Output Primitives, Error Isolation, Sandboxing & Performance Budget
- **Structured Declarative Output Buffers:** Studies emit typed render commands into pre-allocated per-study arenas (zero DOM/UI coupling):
  - `PlotLine` / `PlotHistogram` / `PlotShape` / `PlotChar` (aligned to `bar_index`)
  - `FillRegion` (between two plot IDs or price levels)
  - `Box` / `Line` / `Label` / `Polyline` (anchored to `(bar_index | timestamp_ns, price_tick_i64)`)
  - `TableOverlay` (fixed-grid HUD metrics, capped cell count e.g. `<= 256` cells)
  - `AlertEvent` (deterministic edge-triggered or per-bar signal payload with provenance metadata)
- **Error Isolation:** Every study instance runs in an isolated execution context (dedicated Wasmtime `Store` or Rhai `Scope` + engine instance). Runtime traps (divide-by-zero, OOB, fuel exhaustion, memory limit breach, NaN panic) disable ONLY the offending study instance, display a structured diagnostic banner with line/column + trap reason, and leave the chart, DOM ladder, and other studies completely unaffected.
- **Sandboxing (CPU Fuel & Memory Limits):**
  - **Wasmtime (`v51.0.0`, Apache-2.0 WITH LLVM-exception, `R06-S04`, `R06-S05`):** Supports deterministic `Config::consume_fuel` (instruction accounting; ~5–15% overhead on mixed workloads, up to ~2x on tight compute loops), `Config::epoch_interruption` (~10–14.4% overhead, wall-clock), newer MMU-based interruption (~2.8% overhead), and zero-hot-path-overhead `ResourceLimiter` / `StoreLimits` capping linear memory, tables, and instances (`R06-S05`). Default study budget: `64 MiB` linear memory cap, `5,000,000` fuel/bar (historical batch) or `5 ms` epoch deadline per live update, zero filesystem/network WASI capabilities by default.
  - **Rhai (`v1.27.0`, MIT OR Apache-2.0, `R06-S06`):** Built-in `Engine::set_max_operations` (deterministic op-count cap), `set_max_expr_depths`, `set_max_call_levels`, `set_max_string_size`, `set_max_array_size`, `set_max_map_size` — no OS/filesystem/network access unless explicitly registered as host functions.
- **Study Engine Performance Budget (derived from [[Constraints#1. Eight Design Non-Negotiables]] #5):**
  - Single built-in study over `100,000` bars (cold load): `< 15 ms`
  - Live tick/bar incremental update (10 active studies on 1 chart): `< 1.0 ms` total (`< 100 µs` / study) so 60 fps frame budget (`16.6 ms`) and 30+ updates/s DOM budget remain unobstructed
  - User WASM study batch evaluation (`100,000` bars, 1 batched crossing): `< 50 ms`
  - User embedded DSL (Rhai / MotiveScript) over `100,000` bars: `< 250 ms` (or `< 20 µs` per live bar update)
  - Host↔WASM transition latency: ~`30 ns` baseline (`R06-S05`), negligible when batched or per-bar.

---

### 2. Audit of Existing FOSS Pine Script Parsers, Transpilers & Runtimes (Verified 2026-11-24)

**Brutal Truth Finding:** Unlike 2023–2024 when almost no working FOSS Pine parsers existed, by late 2026 **several real Pine Script v5/v6 parsers, transpilers, and runtimes exist on GitHub** — **HOWEVER, almost every mature high-parity project carries a severe license trap (AGPL-3.0, GPL-3.0, LGPL-3.0, or non-FOSS source-available compiler) or targets a proprietary/JS/Python stack incompatible with a lightweight Rust core.**

| Repository | Lang | Stars | Last Push | Latest Release | Actual Verified `LICENSE` | Pine Coverage & Architecture | Allegedly Verdict |
|---|---|---|---|---|---|---|---|
| `alaa-eddine/PineTS` (`R06-S07`) | TypeScript | 974 | 2026-11-13 | `v0.14.0` | **AGPL-3.0** (dual commercial; backed by LuxAlgo) | Pine v5/v6 runtime for JS/TS/browser/Node; mature indicators & plots | **REJECT for core (License Trap):** AGPL-3.0 copyleft contamination incompatible with permissive/MIT/Apache core; JS-only runtime. |
| `PyneSys/pynecore` (`R06-S08`) | Python | 281 | 2026-11-23 | `v6.15.0` | **Apache-2.0** (runtime ONLY); **`PyneComp` compiler is closed-source hosted API** | Python AST-rewriting runtime validated against 1,000 TV scripts (99.771% bar match), but Pine→Python transpiler requires proprietary PyneSys API key | **REJECT (Proprietary Compiler + Python):** Violates `$0` local-first / FOSS-or-die because the actual Pine parser/compiler is closed-source cloud SaaS. |
| `pineforge-4pass/pineforge-engine` + `pineforge-codegen-oss` (`R06-S09`, `R06-S10`) | C++17 / Python | 215 / 10 | 2026-11-24 | `v1.14.0` | Engine: **Apache-2.0**; Transpiler (`codegen-oss`): **PineForge Source License 1.2 (NON-FOSS!)** | C++17 backtest engine w/ C ABI claiming 7,989 TV parity cases, BUT `pineforge-codegen-oss` explicitly prohibits prop-firm / funded-trader accounts as personal use and is NOT OSI FOSS | **REJECT (Source-Available License Trap):** Non-OSI compiler license directly violates [[Constraints#1. Eight Design Non-Negotiables]] #1 and blocks prop-firm users ([[Assumptions#A03]]). |
| `elbakramer/pynescript` (`R06-S11`) | Python | 102 | 2025-12-18 | `v0.3.0` | **LGPL-3.0** | ANTLR4 grammar + Python AST parser/unparser for Pine v5 ONLY; no execution runtime | **REJECT for core:** Parser-only, Python-only, LGPL-3.0, stale ~11 months, no v6 or runtime. |
| `be-thomas/OpenPineScript` (`R06-S12`) | TypeScript | 79 | 2026-11-13 | none (npm) | **GPL-3.0** | ANTLR-generated Pine v1–v6 → JS compiler + runtime + broker emulator (4,400+ tests; 741/763 TV docs corpus compile) | **REJECT for core (License Trap):** Strong GPL-3.0 copyleft; JS/Node-only. (Could only ever run as an optional external user-installed CLI sidecar, never linked into core.) |
| `Opus-Aether-AI/pine-transpiler` (`R06-S13`) | TypeScript | 37 | 2026-10-12 | `v0.4.11` | **MIT** | Zero-dep Pine v5/v6 → JS (`PineJS CustomIndicator`) transpiler; 95%+ test coverage | **NOT DIRECTLY USABLE:** Emits factories targeting TradingView's proprietary Charting Library `PineJS` API (README explicitly notes you must hold a TV Charting Library license to run output). Clean MIT parser architecture is informative as prior art only. |
| `ferranbt/pinecone` (`R06-S14`) | **Rust** | 29 | 2026-09-08 | `v0.2.6` | **MPL-2.0** | Native Rust Pine v4/v5 parser, interpreter, formatter, repainting linter, and LSP (`pine-lang` SDK) | **WATCH / SPIKE CANDIDATE (v0.4+):** Only real Rust FOSS Pine interpreter (`MPL-2.0`, file-level weak copyleft), includes repainting linter + LSP, but small community (29★), early `v0.2.6`, lacks Pine v6 & order-flow primitives. |
| `nullarch/resin` (`R06-S15`) | TypeScript | 14 | 2026-11-18 | none | **Apache-2.0** | Zero-dep Pine v5/v6 → plain JS module compiler + runtime (95 parity scenarios) | **TOO EARLY / JS-ONLY:** Permissive Apache-2.0 and active, but very young (14★, no release tag) and JS-runtime bound. |
| `MeridianAlgo/Pine-A-Script` (`R06-S16`) | JavaScript | 11 | 2026-06-30 | none | **MIT** | Pine v5 / early v6 → ESM JS transpiler | **TOO EARLY / LOW ADOPTION:** 11★, no release, JS-only. |
| `kvarenzn/tree-sitter-pine` (`R06-S17`) | JS (Tree-sitter) | 5 | 2024-05-21 | none | **NONE (All Rights Reserved)** | Tree-sitter Pine v5 grammar | **REJECT:** No license (legally unusable), abandoned >2 years. |
| `CHANGGELY/pine-script-compiler` (`R06-S18`) | TypeScript | 2 | 2026-09-30 | none | **NONE (All Rights Reserved)** | Early Pine v4/v5/v6 static analyzer | **REJECT:** No license, 2★. |

**Key Takeaway on Pine Parsers:** There is **no mature, permissively licensed (MIT/Apache-2.0), production-proven Rust Pine v5/v6 compiler/runtime** as of `2026-11-24`. The closest Rust candidate is `ferranbt/pinecone` (`MPL-2.0`, 29★, v4/v5 only). Building a clean-room `MotiveScript` front-end (lexer → parser → AST → typed IR → Study Engine eval) for a well-defined Pine-inspired subset in Rust is tractable in Phase 2/v0.4+, whereas trying to ship 100% Pine v6 parity in v0.1 would be a multi-year distraction.

---

### 3. Pine-Subset Compatibility Front-End Specification (`MotiveScript`)

If Allegedly ships a clean-room Pine-inspired front-end (`lexer → recursive-descent/Pratt parser → AST → typed series IR → bytecode/WASM or Rust evaluator`), the **feasible subset (~80% of real-world community studies)** vs. **explicit exclusions** must be frozen up front:

#### Feasible Clean-Room Subset (Target for Stage 3 — `MotiveScript v1`)
- **Declarations & Directives:** Script header (`study(...)` / compatibility alias `indicator(...)` with `overlay`, `shorttitle`, `precision`, `max_bars_back`), typed inputs (`input.int`, `input.float`, `input.bool`, `input.string`, `input.source`, `input.color`, `input.timeframe`).
- **Types & Qualifiers:** `const`, `simple`, `series` qualifiers; scalar types `int`, `float`, `bool`, `color`, `string`, `na` propagation; `array<T>` (bounded capacity) and `tuple` destructuring `[a, b] = fn()`.
- **Control Flow & Persistence:** Indentation-sensitive blocks (4-space/tab lexer `INDENT`/`DEDENT`), `if`/`else if`/`else` expressions, ternary `?:`, `for`/`while` loops (bounded by fuel), `switch`, user-defined functions (non-recursive or bounded depth), `var` (bar-persistent with intrabar rollback) and `varip` (with repaint warning).
- **Series & Indexing:** History reference operator `expr[n]` with static or bounded dynamic lookback; built-in OHLCV + order-flow extensions (`open`, `high`, `low`, `close`, `volume`, `time`, `bar_index`, plus Allegedly-native `delta`, `bid_vol`, `ask_vol`, `vwap`, `poc`, `vah`, `val`).
- **Core Built-in Namespaces:** `ta.*` (SMA, EMA, RMA, WMA, VWMA, RSI, MACD, ATR, TR, BB, Stoch, Highest, Lowest, Crossover, Crossunder, ValueWhen, BarsSince, Change, Stdev, Linreg, Pivots — ~50 core functions), `math.*`, `color.*`, `str.*`, `barstate.*`, `timeframe.*`, `syminfo.*`, `request.security()` (safe non-repainting default; explicit warning on developing mode).
- **Outputs:** `plot()`, `plotshape()`, `plotchar()`, `hline()`, `fill()`, `bgcolor()`, `barcolor()`, `alertcondition()`, `alert()`, basic `line.new()` / `box.new()` / `label.new()` / `table.new()`.

#### Explicit Exclusions (Not Supported in `MotiveScript v1` — Fail Fast with Clear Diagnostics)
- TradingView cloud-only features: `request.financial()`, `request.earnings()`, `request.dividends()`, `request.quandl()`, `request.seed()`, `import user/library/version` (TradingView proprietary library registry).
- Complex OOP/graphics edge cases in v1: User-Defined Types (`type` / `method` polymorphism — deferred to `v2`), `matrix<T>`, `map<K,V>`, `polyline` / `linefill` / `chart.point` complex canvas primitives, TradingView-specific `strategy.*` broker emulator semantics (Allegedly uses its own deterministic backtest/execution API in [[R07-Storage-Replay-Backtest]] rather than emulating TradingView's bar-magnifier quirks).
- Pine v1–v4 legacy syntax (`study()` legacy positional flags, implicit `security()` without namespace, mutable global rewrites without `:=`). Users are offered a clean diagnostic message pointing to v5/v6 syntax or `MotiveScript` equivalents.

---

### 4. Plugin & Scripting Runtime Comparison (Verified 2026-11-24)

| Runtime / Crate | Latest Version (Retrieved 2026-11-24) | Verified License | Binary Size Impact (Est. / Measured) | Execution Overhead & Hot-Path GC | Sandboxing (CPU / Memory) | Multi-Language & Debugging UX |
|---|---|---|---|---|---|---|
| **Wasmtime** (`bytecodealliance/wasmtime`, `R06-S04`, `R06-S05`) | `v51.0.0` (2026-11-20) | **Apache-2.0 WITH LLVM-exception** | C-API archive `11.6–15.2 MB` (`tar.xz`, macOS/Linux); Rust crate stripped est. `~6–10 MB` (**UNVERIFIED** until S07) | ~75–85% native speed; ~30 ns host↔guest call; **zero GC stalls** | **Best-in-class:** Deterministic fuel (`consume_fuel`), epoch/MMU interruption, zero-hot-path `ResourceLimiter` / `StoreLimits`, capability-based WASI (default none) | Supports Rust, C/C++, Zig, AssemblyScript, Go (TinyGo), MoonBit compiled to `.wasm`; DWARF backtraces; requires external compiler toolchain for plugin authors |
| **Extism** (`extism/extism`, `R06-S19`) | `v1.41.0` (2026-10-09) | **BSD-3-Clause** | Wraps `wasmtime` (same base footprint + thin PDK layer) | Adds linear-memory JSON/bytes copy per call unless bypassed; **zero GC** | Inherits Wasmtime memory/fuel/timeout limits + declarative manifest (`allowed_hosts`, `allowed_paths`) | Ergonomic PDKs in Rust, JS, Python, Go, C; great for coarse plugins/adapters, slightly heavier per-tick copy overhead than raw Wasmtime + WIT/shared ring buffer |
| **Rhai** (`rhaiscript/rhai`, `R06-S06`) | `v1.27.0` (2026-10-21) | **MIT OR Apache-2.0** | Pure Rust, tiny (`~1–2 MB` stripped, **UNVERIFIED** until S07) | Tree-walking AST interpreter (~20–80x slower than native Rust); **zero GC** (Rust ownership/Rc) | **Built-in:** `set_max_operations()`, `set_max_expr_depths()`, `set_max_string_size()`, `set_max_array_size()`, zero ambient OS access | Instant zero-toolchain edit→run inside Allegedly UI! Rust-like syntax; great error line/col; no JIT so bulk 100k-bar loops need native Rust `ta.*` host intrinsics |
| **Lua / Luau via `mlua`** (`mlua-rs/mlua` + `luau-lang/luau`, `R06-S20`, `R06-S21`) | `mlua v0.12.3` (2026-11-22); `luau 0.748` (2026-11-20) | **MIT** (`mlua` & `luau`) | Small C/C++ embed (`~1.5–3 MB`, **UNVERIFIED** until S07) | Luau bytecode VM is fast (~5–15x slower than native; faster than Rhai); **incremental GC** (must bound pauses or run off render thread) | **Luau** was purpose-built by Roblox for untrusted sandboxing: `set_memory_limit`, `set_interrupt` hook, strips `io`/`os`/`debug` libraries, gradual typing | Instant edit→run; huge trader familiarity (Lua used in Neovim/MPV/games); gradual type annotations in Luau improve IDE autocomplete; slight C++ build complexity (`luau`) |
| **JS — `rquickjs` + `quickjs-ng`** (`R06-S22`, `R06-S23`) | `rquickjs v0.14.0` (2026-09-18); `quickjs-ng v0.18.0` (2026-11-01) | **MIT** | Very small C embed (`~1–2 MB`) | Bytecode interpreter (~15–40x slower than native); reference-counted + cycle collector (low-pause, deterministic refcount) | `Runtime::set_memory_limit`, `set_max_stack_size`, `set_interrupt_handler` | Huge JS/TS ecosystem; natural target if running transpiled JS or sharing TS types with UI; IEEE-754 `number` default requires BigInt/wrapper discipline for `i64` tick prices |
| **JS — `boa_engine`** (`boa-dev/boa`, `R06-S24`) | `v0.22.0` (2026-08-28) | **Unlicense OR MIT** | Pure Rust (~4–6 MB) | Slower than QuickJS/V8; tracing GC (`boa_gc`) | Loop iteration limits, recursion limits | Pure Rust ES spec conformance, but slower and heavier GC than QuickJS/Luau/Rhai |
| **Python — `PyO3` / `Pyodide`** (`R06-S25`, `R06-S26`) | `pyo3 v0.30.1` (2026-10-14); `pyodide 314.0.8` (2026-11-13) | `PyO3`: **MIT OR Apache-2.0**; `Pyodide`: **MPL-2.0** | `PyO3` requires system/bundled CPython (`30–60+ MB` if bundled — **breaks `< 40 MB` budget!**); `Pyodide` is WebAssembly/browser-only (`~15–40 MB` wasm downloads) | CPython GIL/GC; fast only via NumPy/C extensions; poor per-tick latency | **Poor in-process sandboxing** for CPython (`PyO3` exposes full OS/filesystem/C-extensions); `Pyodide` is browser-sandboxed | Unmatched quant research ecosystem — best served via **out-of-process IPC/sidecar** ([[R07-Storage-Replay-Backtest]]), NOT embedded in the terminal hot path |

---

### 5. Indicator Libraries Audit (Verified 2026-11-24)

| Library & Primary Repo | Lang | Latest Version & Last Push | Actual Verified License | Streaming O(1) Support | Fixed-Point vs. Float / Numerical Accuracy | Maintenance Health & Allegedly Fit |
|---|---|---|---|---|---|---|
| **TA-Lib** (`TA-Lib/ta-lib`, `R06-S27`) | C (w/ official Rust/Python/Java/C# bindings) | `v0.8.3` (2026-10-25; pushed 2026-11-24) | **BSD-3-Clause** (C lib); `ta-lib-python` `v0.8.3.post1` is **BSD-2-Clause** (`R06-S28`) | **YES (new in modern TA-Lib!):** Official streaming API (`TA_SMA_Stream`, `ta-lib.org/api/stream/` + Rust streaming API) | `f64` arrays; industry reference benchmark for 200+ indicators & candlestick patterns; known EMA/RSI warmup seed conventions differ subtly from TradingView Wilder defaults in some modes | **HIGH / STRONG REFERENCE:** Actively revitalized (1,744★ C repo, OpenSSF Best Practices badge). Great as **golden numerical test oracle** and optional C-FFI/WASM bundle, though Allegedly's core built-ins in pure Rust avoid C build toolchain friction on Windows/macOS/Linux. |
| **Tulip Indicators** (`TulipCharts/tulipindicators`, `R06-S29`) | C | `v0.9.1` (2022-01-18; pushed 2024-02-02) | **LGPL-3.0** | Batch C array API (some stream variants in fork/wrappers) | `double` (`f64`), well-known reference values | **REJECT (License Trap + Stale):** LGPL-3.0 complicates static linking in Rust desktop binaries, and upstream has had no release since Jan 2022. |
| **`pandas-ta` / `pandas-ta-classic`** (`R06-S30`, `R06-S31`) | Python | Original `twopirllc/pandas-ta` GitHub repo **404 Not Found** (PyPI `0.4.71b0`, 2025-09-14); active fork `xgboosted/pandas-ta-classic` `v0.9.0` (2026-10-28, pushed 2026-11-19, 495★) | **MIT** (`pandas-ta-classic`) | Batch DataFrame only (not streaming O(1)) | Pandas/NumPy `f64`; historical bugs in a few edge-case indicators | **NOT FOR CORE:** Python/Pandas dependency unsuitable for Rust terminal hot path; `pandas-ta-classic` usable only in optional Python research sidecar. |
| **`talipp`** (`nardew/talipp`, `R06-S32`) | Python | `v2.7.0` (2025-09-09, 546★) | **MIT** | **YES — O(1) incremental + `update()` / `remove()` rollback** | Python `float` | **EXCELLENT ARCHITECTURAL REFERENCE (Python-only):** Its `add()` / `update()` (intrabar replace) / `remove()` design is the exact pattern Allegedly should mirror in pure Rust! |
| **`trading-signals`** (`bennycode/trading-signals`, `R06-S33`) | TypeScript | `v8.4.1` (2026-11-24, 1,008★) | **MIT** (`packages/trading-signals/package.json`) | **YES — `add()` streaming + replace mode** | Zero dependencies in v8 (`dependencies: None` — dropped `big.js`, now native JS `number` `f64`), cross-checked against Tulip reference data | **HEALTHY TS REFERENCE:** Great if UI ever needs lightweight client-side preview, though studies belong in Rust core. |
| **`technicalindicators`** (`anandanand84/technicalindicators`, `R06-S34`) | JS/TS | `v3.1.0` (npm) / `v2.0` GitHub tag (pushed 2022-11-03, 2,451★) | **MIT** | Partial generator mode | JS `number` | **REJECT (Unmaintained):** No GitHub commits in 4 years (since Nov 2022). |
| **`ta-rs`** (`greyblake/ta-rs`, `R06-S35`) | Rust | `v0.5.0` (crates.io 2021-06-26; last commit 2024-07-12, 878★) | **MIT** | **YES (`Next<T>` trait)** | `f64`, ~20 basic indicators, no intrabar rollback | **STALE:** No crates.io release since 2021; too narrow and lacks intrabar `replace()`/`rollback()` semantics. |
| **`yata`** (`amv-dev/yata`, `R06-S36`) | Rust | `v0.7.0` (crates.io 2024-03-07; last push 2024-09-19, 404★) | **Apache-2.0** | **YES (`IndicatorInstance::next`)** | `f64` (`ValueType`), ~45 indicators + MAs | **SEMI-STALE / PARTIAL FIT:** Clean Apache-2.0 Rust code, but inactive >2 years and lacks intrabar rollback (`update` vs `commit`) and order-flow/fixed-point support. |

**Key Takeaway on Indicator Libraries:** Because Allegedly requires **intrabar tick rollback (`preview` vs `commit`), fixed-point `i64` price/volume boundaries, deterministic `NaN`/`na` handling, order-flow studies (Footprint, Volume Profile, TPO, CVD, Anchored VWAP), and zero C-toolchain/LGPL friction**, Allegedly should implement its **own clean-room Rust `mv-studies` crate (~40–50 core studies)** modeled on `talipp`'s `push`/`replace`/`rollback` incremental state-machine trait, and **validate every formula numerically against `TA-Lib v0.8.3` (`BSD-3-Clause`)** in CI test fixtures.

---

### 6. Legal, Licensing & IP Hygiene (Flagged for [[R09-Legal-Licensing]])

1. **Clean-Room Syntax Compatibility:** Implementing a parser and runtime for a Pine-inspired DSL (`MotiveScript`) from scratch using only public language concepts and domain mathematics — with **zero copied TradingView source code, zero copied TradingView documentation text, and zero reverse-engineering of proprietary binaries** — follows established clean-room software interoperability practices. *However*, copyrightability of extensive standard-library signatures/taxonomy and potential Terms-of-Service claims if scraping TradingView docs remain legal nuance areas — **flagged as `UNVERIFIED` legal risk for [[R09-Legal-Licensing]]** (strict rule: never scrape or copy TradingView docs/built-in code into Allegedly repo or prompts).
2. **MPL-2.0 Published TradingView Scripts (`R06-S03`, `R06-S37`):**
   - Verified via TradingView's official Script Publishing Rules (`R06-S03`) and Mozilla Public License 2.0 (`R06-S37`): open-source scripts published on TradingView default to **MPL-2.0** (`// © AuthorUsername`), which is a **file-level weak copyleft** license permitting external reuse/modification provided modifications to those MPL-2.0 files are disclosed under MPL-2.0 and original copyright/attribution notices are preserved.
   - TradingView's House Rules govern publications *on TradingView* (and explicitly note that standard classic indicators like standard RSI are considered public domain for reuse on TradingView), but **Allegedly MUST NOT bundle third-party community TradingView scripts in the Allegedly distribution**. Instead, users may import/run their own scripts locally, and Allegedly's script header template / sharing UX should preserve SPDX license headers and author attribution.
3. **Naming & Trademark Hygiene:**
   - `"TradingView"` and `"Pine Script"` are registered trademarks of TradingView Inc. (`Pine Script®`, `R06-S01`, `R06-S13`). `"MotiveWave"` is a trademark of MotiveWave Software.
   - **Recommended Naming:** Name Allegedly's DSL **`MotiveScript`** and describe compatibility strictly via nominative/descriptive phrasing such as *"Pine-inspired syntax with optional clean-room compatibility mode for common Pine v5/v6 study patterns — independent project, not affiliated with or endorsed by TradingView Inc."*
   - **Flag for [[R09-Legal-Licensing]]:** Confirm whether the name `"Allegedly"` / `"MotiveScript"` carries trademark confusion risk with `"MotiveWave"` (already tracked in R09 trademark alternatives).

---

## Options Table (Weighted Criteria)

### Decision A: Primary Scripting & Plugin Execution Architecture

Criteria weights reflect [[Constraints#1. Eight Design Non-Negotiables]]:
- **Zero-GC Hot-Path Performance & Determinism** (25%)
- **Sandboxing & Crash/CPU/Memory Isolation** (20%)
- **Installer Footprint (`< 40 MB`) & Cross-Platform Simplicity** (20%)
- **Authoring UX (Instant Edit→Run + Pine-Inspired Ergonomics)** (20%)
- **FOSS License Cleanliness & Ecosystem Longevity** (15%)

| Option | Perf & Determ. (25%) | Sandboxing (20%) | Footprint & X-Plat (20%) | Authoring UX (20%) | License & Health (15%) | Weighted Score (/5.00) |
|---|---|---|---|---|---|---|
| **Option 1 (Recommended): Hybrid Core — Native Rust Built-ins + Wasmtime Plugins + Clean-Room `MotiveScript` Bytecode/IR (Staged)** | 5.0 | 5.0 | 4.0 | 4.5 | 5.0 | **4.75** |
| **Option 2: Native Rust Built-ins + Luau (`mlua`) Embedded Scripting Only** | 4.0 | 4.5 | 4.5 | 3.5 | 5.0 | **4.25** |
| **Option 3: Native Rust Built-ins + Rhai Embedded Scripting Only** | 3.0 | 4.5 | 5.0 | 3.5 | 5.0 | **4.10** |
| **Option 4: Native Rust Built-ins + QuickJS (`rquickjs`) + JS Pine Transpiler (`nullarch/resin`)** | 3.0 | 4.0 | 4.5 | 4.0 | 3.5 | **3.78** |
| **Option 5: Embed Existing Pine Runtime (`PineTS` AGPL-3.0 or `OpenPineScript` GPL-3.0 or `PyneCore` + PyneComp)** | 2.5 | 2.5 | 2.5 | 4.5 | 1.0 | **2.68 (DISQUALIFIED — License/FOSS Violation)** |
| **Option 6: Embedded CPython (`PyO3`) as Primary Study Runtime** | 2.0 | 1.5 | 1.5 | 4.5 | 4.5 | **2.68 (DISQUALIFIED — Size & Sandbox Violation)** |

*(Note: Option 1's footprint score is `4.0` rather than `5.0` specifically because Wasmtime's Cranelift JIT adds ~6–10 MB to the desktop binary and must pass the `< 40 MB` total installer gate in Spike S07; if S07 shows Wasmtime blows the budget, our fallback is Option 2 (`mlua`+Luau) or Option 3 (`Rhai`) for v0.1–v0.3 with Wasmtime as an opt-in plugin runtime or AOT-only Pulley interpreter.)*

---

## Recommendation + Rationale

### Verdict
Adopt a **3-Tier, Staged Study Runtime Architecture** anchored on a **pure-Rust Study Engine Core (`mv-studies`)**:
1. **Built-in Studies (v0.1):** Pure-Rust O(1) incremental + batch-vectorized state machines (`push` / `preview` / `rollback` / `commit`) operating on exact fixed-point `i64` price/volume inputs, validated numerically against `TA-Lib v0.8.3` (`BSD-3-Clause`) in CI. Zero external C/LGPL runtime dependencies.
2. **High-Performance User/Community Plugins (v0.2):** **Wasmtime (`v51.0.0`, Apache-2.0 WITH LLVM-exception)** with WIT Component Model host bindings, batched bar execution (`eval_batch`), `ResourceLimiter` (`64 MiB` cap), and deterministic fuel/epoch interruption. Allows power users to write custom studies in Rust, Zig, C++, or AssemblyScript at near-native speed with zero GC stalls. *(Fallback if S07 fails binary size: Wasmtime with `pulley` portable interpreter or `mlua`+Luau.)*
3. **Instant-Edit In-App Scripting (`MotiveScript`, v0.3–v0.4):**
   - **Stage 2a (v0.3 — Immediate Zero-Toolchain Scripting):** Embed **Rhai (`v1.27.0`, MIT/Apache-2.0)** or **Luau (`mlua`, MIT)** — finalized by Spike S07 — bound directly to the `mv-studies` native O(1) `ta.*` / `orderflow.*` host intrinsics so traders can write 5-line custom formulas and alerts inside the terminal with zero compiler installation.
   - **Stage 2b (v0.4+ — Clean-Room `MotiveScript` Pine-Inspired Front-End):** Build a dedicated clean-room Rust front-end (`lexer → parser → AST → typed series IR → bytecode VM` or WASM emitter) supporting the frozen Pine v5/v6-inspired subset in Section 3, with `ferranbt/pinecone` (`MPL-2.0`) evaluated as a reference/optional inspiration only if its architecture stays clean and license-compatible.

### Staged Language Roadmap

| Stage | Target Milestone | Deliverable | User Capability |
|---|---|---|---|
| **Stage 1** | v0.1 (MVP) | Pure-Rust `mv-studies` engine + 30–40 core studies (MAs, RSI, MACD, BB, ATR, VWAP, CVD, Footprint, Volume Profile, TPO) + JSON/TOML study parameter presets | Instant `60 fps` charting + order-flow studies, zero scripting complexity on critical path |
| **Stage 2** | v0.2 | Wasmtime sandboxed plugin ABI (WIT) + Rust/AS SDK template + deterministic fuel/memory caps + crash isolation | Third-party/power-user high-speed custom studies & order-flow calculators |
| **Stage 3** | v0.3 | Embedded zero-toolchain expression/script host (Rhai or Luau, chosen by S07) calling Rust `ta.*` intrinsics + in-app code editor | Write & hot-reload custom studies/alerts in seconds without installing Rust/toolchains |
| **Stage 4** | v0.4–v1.0 | Clean-room `MotiveScript` front-end (Pine v5/v6-inspired subset → Typed Series IR → bytecode/WASM) + built-in non-repainting MTF linter & LSP | Familiar series-oriented syntax (`close[1]`, `ta.ema`, `var`, `plot`) with Allegedly-native order-flow extensions |

### Pre-Declared Pass / Fail Thresholds for Phase 2 Spike `S07`

Spike `S07` (`spikes/S07-study-runtime/`) MUST build and benchmark a runnable Rust prototype comparing **Native Rust `mv-studies`**, **Wasmtime (`v51.0.0`)**, **Rhai (`v1.27.0`)**, and **`mlua` (Luau)** on identical `100,000`-bar OHLCV + `10,000`-tick live-replay fixtures on Apple Silicon macOS (and Linux CI).

| Metric | PASS Threshold | FAIL / Pivot Trigger |
|---|---|---|
| **Built-in Rust Study Batch (`100k` bars, EMA20 + RSI14 + BB20 + VWAP)** | `<= 15 ms` total | `> 30 ms` → profile/remove allocations, SIMD-optimize |
| **Wasmtime Batched Study (`100k` bars, 100-bar or 1k-bar chunks, fuel + `ResourceLimiter` ON)** | `<= 50 ms` total; host↔guest overhead `< 10%` | `> 100 ms` → test epoch/MMU interruption instead of fuel, or widen batch chunk size |
| **Live Tick Incremental Update (10 concurrent studies: 5 native + 3 WASM + 2 embedded script)** | p99 `<= 1.0 ms` (`<= 100 µs`/study), **0 allocations / 0 GC spikes > 0.5 ms** | p99 `> 2.5 ms` → disqualify GC-pausing embedded VM from hot path |
| **Sandbox Safety Test (Infinite loop + `256 MiB` allocation bomb + panic)** | Traps cleanly within `<= 5 ms` (or fuel budget), RSS returns to baseline, sibling studies uninterrupted | Host crash, hang `> 50 ms`, or OOM → FAIL runtime config |
| **MTF Non-Repainting Determinism Test (1m base + 15m HTF across historical load vs. tick-by-tick replay)** | **100% bit-identical** output series between batch load and live-simulated replay | Any 1-bar mismatch → FAIL MTF alignment engine |
| **Binary Size Delta (release, stripped, `opt-level = "z"`, LTO)** | `wasmtime` delta `<= 12 MB` compressed; `rhai`/`mlua` delta `<= 3 MB` compressed | `wasmtime` delta `> 15 MB` compressed (threatening `< 40 MB` total installer) → evaluate `wasmtime` Pulley-only / opt-in plugin pack or Luau-primary |
| **Numerical Parity vs. `TA-Lib v0.8.3`** | Max absolute error `<= 1e-9` on `f64` EMA/SMA/RSI/ATR/MACD/BB over 10k-bar fixture (after documented warmup seed alignment) | Divergence `> 1e-6` → fix formula or document intentional divergence |

---

## Inferences

1. **Why not adopt an existing Pine transpiler today?** Every high-parity Pine v5/v6 transpiler verified on `2026-11-24` fails at least one hard [[Constraints#1. Eight Design Non-Negotiables|Non-Negotiable]]: `PineTS` is `AGPL-3.0`, `OpenPineScript` is `GPL-3.0`, `pineforge-codegen-oss` is non-FOSS `PineForge Source License 1.2` (explicitly restricting prop-firm accounts), `PyneCore`'s compiler (`PyneComp`) is closed-source SaaS, and `pine-transpiler` targets TradingView's proprietary `PineJS` library. Meanwhile, permissive standalone alternatives (`nullarch/resin` at 14★, `ferranbt/pinecone` at 29★ `MPL-2.0`) are too young to stake v0.1's core architecture on.
2. **Decoupling Study Engine IR from surface syntax de-risks the entire roadmap:** By designing the Rust Study Engine around an explicit bar-state / rollback / MTF-safe / typed-output architecture first, both Wasmtime plugins (v0.2) and a clean-room `MotiveScript` compiler (v0.4+) target the exact same deterministic runtime without rewriting charting or replay integration.
3. **Fixed-point boundaries preserve financial correctness without crippling math studies:** Keeping OHLCV/tick/book prices and quantities as scaled `i64` in storage, series buffers, and order/alert outputs — while allowing `f64` inside statistical study kernels (RSI, Bollinger Bands, LinReg) — obeys [[Constraints#1. Eight Design Non-Negotiables]] #7 without incurring 10–50x `Decimal` slowdowns inside transcendental indicator math.
4. **Rhai vs. Luau (`mlua`) for Stage 3 cannot be chosen on theory alone:** Rhai is pure Rust with zero C++ build friction and deterministic op-counting, while Luau is significantly faster on tight loops and offers gradual typing, at the cost of a C++ build dependency and incremental GC tuning. Spike `S07` will settle this empirically.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Wasmtime binary size breaches `< 40 MB` installer budget** (especially combined with Tauri + DuckDB/Parquet in [[R07-Storage-Replay-Backtest]]) | High | Measure exact stripped/compressed delta in Spike S07 (`<= 12 MB` gate). Keep Wasmtime Cranelift features minimal (no WASI-HTTP/preview1 bloat) or deliver WASM JIT as an optional downloadable component if needed. |
| **Pine compatibility scope creep stalls v0.1–v0.3** | High | Hard-gate `MotiveScript` Pine-inspired front-end to Stage 4 (v0.4+), after charting, order-flow, storage, and native/WASM studies ship. Enforce the explicit exclusion list in Section 3. |
| **Subtle repainting / MTF lookahead bugs destroy trader trust** | High | Make closed-bar event-time alignment the *only* default; require explicit opt-in + UI badge for developing HTF bars and `varip`; enforce 100% batch-vs-replay equivalence in CI. |
| **Legal/IP challenge on Pine-inspired syntax or `MotiveScript` name** | Medium | Strict clean-room implementation (zero copied TradingView docs/code); clear non-affiliation disclaimers; refer trademark & API copyright review to [[R09-Legal-Licensing]]. |
| **GC pauses in Luau/QuickJS if run on the UI/render thread** | Medium | Always execute user scripts on a dedicated worker thread pool behind lock-free ring buffers ([[R07-Storage-Replay-Backtest]]), never on the UI render thread. |

---

## Open Questions

1. **Rhai vs. Luau (`mlua`) for Stage 3 zero-toolchain scripting:** **UNVERIFIED** — exact 100k-bar throughput, GC pause p99, and macOS/Linux/Windows cross-compile binary size delta require empirical measurement in Spike `S07`.
2. **Wasmtime (`v51.0.0`) exact stripped binary size inside Tauri Rust core:** **UNVERIFIED** — GitHub C-API release archives (`11.6–15.2 MB` `tar.xz`) include full C-API headers/symbols; actual Rust `wasmtime` crate delta with minimal Cargo features (`cranelift`, `runtime`, no `wasi-http`) must be measured in Spike `S07` on `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`, and `x86_64-pc-windows-msvc`.
3. **Should `ferranbt/pinecone` (`MPL-2.0`) be forked/adapted vs. clean-room written in Stage 4?** **UNVERIFIED** — requires code audit of `ferranbt/pinecone` AST/evaluator quality, `MPL-2.0` file-level boundary review by [[R09-Legal-Licensing]], and evaluation of whether `pinecone` remains actively maintained by the time Allegedly reaches v0.4.
4. **Trademark clearance for `"Allegedly"` / `"MotiveScript"` and clean-room Pine compatibility phrasing:** **UNVERIFIED** — delegated to [[R09-Legal-Licensing]] (human/legal review before public launch).
5. **User preference on Python studies:** Should Python studies be supported exclusively via the out-of-process research/backtest sidecar ([[R07-Storage-Replay-Backtest]]), or do users expect a local Python study bridge on live charts (accepting external system Python)? (Log for Round 2 grilling with Abel.)

---

## What Would Change This Decision

- **If Spike `S07` shows Wasmtime adds `> 15 MB` compressed to the installer:** Switch v0.2 plugin runtime to **Luau (`mlua`, MIT)** or **Wasmtime Pulley-only interpreter** (or deliver Cranelift JIT as an optional plugin pack) so the `< 40 MB` installer constraint is never violated.
- **If `ferranbt/pinecone` (or a new Apache-2.0/MIT Rust Pine v6 compiler) matures to `v1.0+` with strong test parity before v0.4:** Adopt/embed it as the Stage 4 front-end rather than writing a fresh Rust Pine-subset parser from scratch.
- **If Abel prioritizes immediate TradingView Pine script migration in v0.1 over order-flow depth:** Re-order Stage 4 ahead of Stage 2, acknowledging a +4–8 week delay to v0.1 and stricter scope cuts on order-flow studies.

---

## Sources

| Source ID | Track | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|---|
| `R06-S01` | R06 | TradingView Pine Script v6 Execution Model & `request.security()` Docs | https://www.tradingview.com/pine-script-docs/language/execution-model/ | 2026-11-24 | Read primary docs via search & official pages | High |
| `R06-S02` | R06 | TradingView Pine Script `var` / `varip` & `barstate.*` Reference | https://www.tradingview.com/pine-script-docs/language/variable-declarations/ | 2026-11-24 | Read primary docs | High |
| `R06-S03` | R06 | TradingView Script Publishing Rules (Lookahead Ban & Open-Source Reuse) | https://www.tradingview.com/support/solutions/43000590599-script-publishing-rules/ | 2026-11-24 | Direct HTTP fetch & full text inspection | High |
| `R06-S04` | R06 | Bytecode Alliance `wasmtime` (`v51.0.0`, Apache-2.0 WITH LLVM-exception) & release asset sizes | https://github.com/bytecodealliance/wasmtime | 2026-11-24 | GitHub API (`repos`, `releases/latest`, `license`) + crates.io API | High |
| `R06-S05` | R06 | Wasmtime Docs: Fuel, Epoch/MMU Interruption & `ResourceLimiter` Overhead | https://docs.wasmtime.dev/ | 2026-11-24 | Primary Wasmtime docs & Bytecode Alliance benchmarks | High |
| `R06-S06` | R06 | `rhaiscript/rhai` (`v1.27.0`, MIT OR Apache-2.0) | https://github.com/rhaiscript/rhai | 2026-11-24 | GitHub API (`repos`, `releases/latest`, `license`) + crates.io API | High |
| `R06-S07` | R06 | `alaa-eddine/PineTS` (`v0.14.0`, AGPL-3.0 / Commercial, LuxAlgo) | https://github.com/alaa-eddine/PineTS | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S08` | R06 | `PyneSys/pynecore` (`v6.15.0`, Apache-2.0 runtime; closed `PyneComp` compiler) | https://github.com/PyneSys/pynecore | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S09` | R06 | `pineforge-4pass/pineforge-engine` (`v1.14.0`, Apache-2.0 C++17 engine) | https://github.com/pineforge-4pass/pineforge-engine | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S10` | R06 | `pineforge-4pass/pineforge-codegen-oss` (PineForge Source License 1.2 — non-FOSS) | https://github.com/pineforge-4pass/pineforge-codegen-oss | 2026-11-24 | GitHub API (`repos`, `license` text inspected verbatim) | High |
| `R06-S11` | R06 | `elbakramer/pynescript` (`v0.3.0`, LGPL-3.0, Python ANTLR4 Pine v5 AST) | https://github.com/elbakramer/pynescript | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S12` | R06 | `be-thomas/OpenPineScript` (GPL-3.0, TS Pine v1–v6 compiler/runtime) | https://github.com/be-thomas/OpenPineScript | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S13` | R06 | `Opus-Aether-AI/pine-transpiler` (`v0.4.11`, MIT, Pine v5/v6 → PineJS) | https://github.com/Opus-Aether-AI/pine-transpiler | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S14` | R06 | `ferranbt/pinecone` (`v0.2.6`, MPL-2.0, Rust Pine v4/v5 interpreter/linter/LSP) | https://github.com/ferranbt/pinecone | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S15` | R06 | `nullarch/resin` (Apache-2.0, zero-dep TS Pine v5/v6 → JS compiler) | https://github.com/nullarch/resin | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S16` | R06 | `MeridianAlgo/Pine-A-Script` (MIT, JS Pine v5/v6 transpiler) | https://github.com/MeridianAlgo/Pine-A-Script | 2026-11-24 | GitHub API (`repos`) | High |
| `R06-S17` | R06 | `kvarenzn/tree-sitter-pine` (No license, stale 2024-05-21) | https://github.com/kvarenzn/tree-sitter-pine | 2026-11-24 | GitHub API (`repos`) | High |
| `R06-S18` | R06 | `CHANGGELY/pine-script-compiler` (No license, 2★) | https://github.com/CHANGGELY/pine-script-compiler | 2026-11-24 | GitHub API (`repos`) | High |
| `R06-S19` | R06 | `extism/extism` (`v1.41.0`, BSD-3-Clause) | https://github.com/extism/extism | 2026-11-24 | GitHub API (`repos`, `license`) + crates.io API | High |
| `R06-S20` | R06 | `mlua-rs/mlua` (`v0.12.3`, MIT, Lua 5.1–5.5/LuaJIT/Luau bindings) | https://github.com/mlua-rs/mlua | 2026-11-24 | GitHub API (`repos`, `license`) + crates.io API | High |
| `R06-S21` | R06 | `luau-lang/luau` (`0.748`, MIT, sandboxed gradually-typed Lua) | https://github.com/luau-lang/luau | 2026-11-24 | GitHub API (`repos`, `releases/latest`) | High |
| `R06-S22` | R06 | `DelSkayn/rquickjs` (`v0.14.0`, MIT) | https://github.com/DelSkayn/rquickjs | 2026-11-24 | GitHub API + crates.io API | High |
| `R06-S23` | R06 | `quickjs-ng/quickjs` (`v0.18.0`, MIT) | https://github.com/quickjs-ng/quickjs | 2026-11-24 | GitHub API (`repos`, `releases/latest`) | High |
| `R06-S24` | R06 | `boa-dev/boa` (`boa_engine v0.22.0`, Unlicense OR MIT) | https://github.com/boa-dev/boa | 2026-11-24 | GitHub API + crates.io API | High |
| `R06-S25` | R06 | `PyO3/pyo3` (`v0.30.1`, MIT OR Apache-2.0) | https://github.com/PyO3/pyo3 | 2026-11-24 | GitHub API + crates.io API | High |
| `R06-S26` | R06 | `pyodide/pyodide` (`314.0.8`, MPL-2.0) | https://github.com/pyodide/pyodide | 2026-11-24 | GitHub API (`repos`, `releases/latest`) | High |
| `R06-S27` | R06 | `TA-Lib/ta-lib` (`v0.8.3`, BSD-3-Clause, batch + streaming C & Rust API) | https://github.com/TA-Lib/ta-lib | 2026-11-24 | GitHub API (`repos`, `license`, `README.md`) | High |
| `R06-S28` | R06 | `TA-Lib/ta-lib-python` (`v0.8.3.post1`, BSD-2-Clause) | https://github.com/TA-Lib/ta-lib-python | 2026-11-24 | GitHub API + PyPI JSON API | High |
| `R06-S29` | R06 | `TulipCharts/tulipindicators` (`v0.9.1`, LGPL-3.0, last push 2024-02-02) | https://github.com/TulipCharts/tulipindicators | 2026-11-24 | GitHub API (`repos`, `license`) | High |
| `R06-S30` | R06 | `pandas-ta` PyPI (`0.4.71b0`) — original `twopirllc/pandas-ta` repo 404 | https://pypi.org/project/pandas-ta/ | 2026-11-24 | GitHub API (404 confirmed) + PyPI JSON API | High |
| `R06-S31` | R06 | `xgboosted/pandas-ta-classic` (`v0.9.0`, MIT, active fork) | https://github.com/xgboosted/pandas-ta-classic | 2026-11-24 | GitHub API + PyPI JSON API | High |
| `R06-S32` | R06 | `nardew/talipp` (`v2.7.0`, MIT, incremental O(1) Python indicators) | https://github.com/nardew/talipp | 2026-11-24 | GitHub API + PyPI JSON API | High |
| `R06-S33` | R06 | `bennycode/trading-signals` (`v8.4.1`, MIT, zero-dep TS streaming) | https://github.com/bennycode/trading-signals | 2026-11-24 | GitHub API (`packages/trading-signals/package.json`, `README.md`) + npm registry | High |
| `R06-S34` | R06 | `anandanand84/technicalindicators` (`v3.1.0` npm, MIT, stale since 2022-11-03) | https://github.com/anandanand84/technicalindicators | 2026-11-24 | GitHub API + npm registry | High |
| `R06-S35` | R06 | `greyblake/ta-rs` (`ta v0.5.0`, MIT, last crates.io release 2021-06-26) | https://github.com/greyblake/ta-rs | 2026-11-24 | GitHub API + crates.io API | High |
| `R06-S36` | R06 | `amv-dev/yata` (`v0.7.0`, Apache-2.0, last push 2024-09-19) | https://github.com/amv-dev/yata | 2026-11-24 | GitHub API + crates.io API | High |
| `R06-S37` | R06 | Mozilla Public License Version 2.0 (official text) | https://www.mozilla.org/en-US/MPL/2.0/ | 2026-11-24 | Primary license text & TradingView default script header reference | High |
