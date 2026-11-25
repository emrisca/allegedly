---
title: "Allegedly Plugin ABI, Capability Sandbox & Extension Point Specification"
type: architecture
status: verified
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - 01-Charter/Constraints.md
  - 01-Charter/Glossary.md
  - 01-Charter/Principles.md
  - 03-Spikes/S05-Live-Ingest-TickVault.md
  - 03-Spikes/S06-OMS-Paper-Execution.md
  - 03-Spikes/S07-Scripting-Sandbox.md
  - 04-Architecture/Adopt-Build-Fork.md
  - 06-Risk/License-Registry.md
  - spikes/S06-oms-paper-execution/src/adapter/mod.rs
  - spikes/S07-scripting-sandbox/src/wasmtime_runner.rs
  - spikes/S07-scripting-sandbox/src/luau_runner.rs
  - spikes/S07-scripting-sandbox/guest-wasm/src/lib.rs
---

# Plugin ABI, Capability Sandbox & Extension Point Specification

> **Purpose:** Defines Allegedly's five stable extension points (`DataProvider`, `Study`, `BrokerAdapter`, `DrawingTool`, `Panel`), its fail-closed `plugin.toml` capability manifest, its four sandboxing tiers grounded in Spike `S07` measurements, ABI SemVer negotiation, deterministic replay float/hash-pinning boundaries, and the hard `DO-NOT-BUILD` broker/prop-firm compliance boundary (`S06`, `R04`, `R09`).
> **Core Principle (`Constraints` #1, #2, #3):** Paid data feeds, broker connectors, and third-party studies are strictly optional plugins—never load-bearing for Allegedly's `$0` offline core.
> **Canonical Workspace Crates:** `allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-studies`, `allegedly-replay`, `allegedly-oms`, `allegedly-ipc`, `allegedly-app`.

---

## 1. The Four Execution & Sandboxing Tiers

Allegedly isolates code strictly according to **trust level**, **latency budget**, and **license compatibility** (`License-Registry.md`, `S07`):

| Tier | Runtime & License | Allowed Extension Points | Isolation Mechanism | S07 Verified Performance & Footprint | Target Rollout |
|---|---|---|---|---|---|
| **Tier 1: Native Core** | Compiled Rust (`Apache-2.0` workspace crates) | Built-in `DataProvider`, `Study`, `BrokerAdapter`, `DrawingTool` | Rust memory safety + CI zero-float (`SV-08`) + `cargo-deny` license gate | **`1.625 ms`** 100k batch · **`0.083 µs`** live p99 · `+0.09 MiB` RSS | **v0.1** |
| **Tier 2: Sandboxed WASM Plugins** | **Wasmtime `v51.0.0`** (`Apache-2.0 WITH LLVM-exception`, `cranelift`/`runtime`/`std`, **zero WASI**) inside `allegedly-studies` using a **flat SoA linear-memory / `ByteView` batch ABI** *(WIT `wasmtime::component` gated on `v0.1` spike)* | Community/Pro `Study`, `DataProvider` parsers/normalizers, `DrawingTool` geometry | Memory-safe linear memory + `StoreLimits` (`32 MiB` default, `64 MiB` instance ceiling) + **global `<= 64 MiB` terminal-wide study memory pool** + instruction **fuel metering** + **zero ambient WASI imports** | **`1.679 ms`** 100k flat-buffer batch (**`+3.32%`** vs Native) · **`0.084 µs`** live p99 · **`+1.74 MiB`** gzip-9 / **`+1.28 MiB`** xz-6 · hostile traps **`0.242–1.778 ms`** | **v0.2** |
| **Tier 3: Zero-Toolchain Scripts** | **Embedded Luau** (`mlua v0.12.3` + `luau0-src v0.24.1+luau748`, `MIT`) inside `allegedly-studies` | In-app user `Study` scripts & alerts (plus v0.4+ Pine-inspired DSL target) | `lua.sandbox(true)` (read-only base globals, `io`/`os`/`package`/`require` nilled) + per-instance `set_memory_limit(16–32 MiB)` + **global `<= 64 MiB` terminal-wide study memory pool** + instruction interrupt hook (`10k`-op budget/tick) | **`94.962 ms`** 100k batch · **`1.333 µs`** live p99 · **`2.75 µs`** 10-study mix p99 (`27.50 µs` max) · **`+0.47 MiB`** gzip-9 / **`+0.34 MiB`** xz-6 | **v0.3** |
| **Tier 4: Out-of-Process Sidecars** | Independent OS process communicating via localhost JSON-RPC / stdio / Arrow IPC + read-only Hive Parquet vault | External backtesters (**`nautilus_trader` `LGPL-3.0-only`**, `QuantConnect/Lean` `Apache-2.0`), SQL analytics (**`DuckDB v2.0.1` `MIT`**), Python/C++ quant bridges (`OpenBB V5+` `Apache-2.0`) | OS process address-space boundary + explicit user launch + zero static/dynamic linking into Allegedly core binary (satisfies `KC-04` copyleft isolation; `[ATTORNEY REVIEW REQUIRED]` on LGPL boundary) | Zero core binary overhead (`+0 B`); zero core crash coupling | **v0.2+ (Optional)** |

### Mandatory Hostile-Plugin & Memory-Pool Invariants (Verified `12 / 12` in `S07`)

1. **Infinite Loop Termination:** Every `Study` evaluation tick is metered (Wasmtime fuel budget per bar/tick; Luau interrupt callback every `N` VM instructions). Exceeding budget traps the offending instance cleanly without stalling the `60 fps` UI or sibling studies (S07 verified: Wasmtime `0.242 ms`, Luau `0.526 ms`).
2. **Per-Instance & Global Terminal-Wide Study Memory Pool Containment:**
   - **Per-Instance Cap:** `StoreLimits` (Wasmtime) and `set_memory_limit` (Luau) enforce `16–32 MiB` defaults (`32 MiB` standard, `64 MiB` hard per-instance ceiling) paired with fuel/interrupt budgets so worst-case OOM traps stay `< 5 ms` (S07 measured `1.778 ms` Wasmtime at 64 MiB; `18.712 ms` Luau allocating 64 × 1 MiB strings sequentially before 64 MiB cap).
   - **Global Terminal-Wide Study Memory Pool (`<= 64 MiB`):** `allegedly-studies` tracks cumulative live RSS across **all** active WASM + Luau `Study` instances across every open chart, pane, and pop-out window under a strict **`<= 64 MiB` global pool cap** (preventing a `10` charts × `10` studies multi-chart DoS from allocating `3.2 GiB` and violating `< 300 MB` idle RAM). Before rejecting a foreground allocation, the pool **LRU-evicts study runtime state from hidden/background tabs** (preserving canonical params for instant re-hydration on tab focus); if visible foreground studies alone exceed `64 MiB`, newly attached studies fail cleanly with `StudyPoolExhausted` rather than OOM-killing the terminal.
3. **Zero Ambient Authority:** Plugins receive **zero** default filesystem, network, environment variable, clock-mutation, or process-spawn capabilities. Any capability not explicitly declared in `plugin.toml` and approved by the user is omitted from the host linker (Wasmtime rejects undeclared imports at instantiation in `0.718 ms`; Luau `sandbox(true)` nulls ambient globals in `0.105 ms`).
4. **Sibling Isolation:** Trapping or panicking plugin instance `A` transitions `A` to `PluginState::Faulted(FaultReason)` with a visible study-legend badge while leaving sibling studies `B..Z`, live ingest, and OMS execution 100% unaffected (`S07` verified).

---

## 2. Capability Manifest (`plugin.toml`)

Every Tier 2 (WASM), Tier 3 (packaged Luau), Tier 4 (Sidecar), and UI `Panel` plugin **must** ship a root `plugin.toml` validated strictly against Allegedly's manifest schema before loading:

```toml
schema_version = 1

[plugin]
id = "org.example.cvd-divergence"           # Reverse-DNS unique identifier
name = "CVD Divergence Study"
version = "1.2.0"                           # SemVer
abi_version = "^1.0.0"                      # Required Allegedly Plugin ABI SemVer range
extension_point = "study"                   # data_provider | study | broker_adapter | drawing_tool | panel
runtime = "wasm"                            # wasm | luau | sidecar | web_panel
entrypoint = "study.wasm"                   # Relative path inside plugin bundle (no '..')
license = "Apache-2.0"                      # Valid SPDX expression
artifact_sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

[signature]
# Optional for local user scripts (triggers explicit "Local Unsigned" badge);
# Required for curated registry distribution.
algorithm = "ed25519"
publisher_key_id = "allegedly-community-2026"
sig_base64 = ""

[resources]
max_memory_mib = 32                         # Clamped to per-instance ceiling (64 MiB) & global pool (<= 64 MiB total)
max_fuel_per_tick = 250_000                 # Wasmtime fuel or Luau VM op budget
max_cold_start_ms = 250

[determinism]
pure_replay_safe = true                     # Must be true to run inside deterministic backtests
uses_wall_clock = false                     # Host denies wall-clock API when false
uses_rng = false                            # Host provides seeded deterministic PRNG only if declared

[capabilities.network]
enabled = false                             # Default: false (ZERO ambient network!)
allowed_hosts = []                          # Exact hostname:port allowlist (e.g. ["wss://ws.kraken.com:443"])
allow_private_lan = false                   # Blocks SSRF to 127.0.0.1/RFC1918 unless explicitly opted in

[capabilities.storage]
fs_read = "none"                            # none | plugin_data_dir | user_picked_file
fs_write = "none"                           # none | plugin_data_dir (NEVER vault/ or oms/)

[capabilities.secrets]
keychain_scopes = []                        # Only allowed for DataProvider / BrokerAdapter; NEVER Study/Panel

[capabilities.execution]
allowed = false                             # ONLY true for extension_point = "broker_adapter"
supported_envs = []                         # ["broker_paper"] or ["broker_paper", "broker_live"]
```

**Fail-Closed Policy Enforcement Rules:**
- A `Study` or `DrawingTool` declaring `capabilities.execution.allowed = true` or non-empty `capabilities.secrets.keychain_scopes` is **hard-rejected at manifest load time** (`Glossary` invariant: a `Study` never places orders).
- A `Panel` (WebView UI widget) **never** receives raw keychain secrets or direct broker execution handles; all order actions flow exclusively through guarded Tauri IPC commands into `allegedly-oms`.
- Any `BrokerAdapter` whose `plugin.id`, `name`, or target endpoints match `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` is **hard-rejected at load time** (§6).

---

## 3. The Five Extension Points & ABI Contracts

All numeric fields crossing the ABI use **exact fixed-point integers (`i64` / `i128`)** (`Constraints` #7). Tier 1 native crates implement the canonical Rust traits directly. For Tier 2 WASM `Study` hot paths, Allegedly locks a **flat Structure-of-Arrays (SoA) linear-memory / `ByteView` batch ABI** (`§3.2`) matching Spike `S07`'s verified zero-copy layout; optional WIT Component Model (`wasmtime::component`) wrappers for low-frequency metadata/lifecycle calls remain explicitly gated on a `v0.1` Implementation CI (post-Phase-5) size + latency spike (`§7`).

### 3.1 Extension Point 1: `DataProvider`

Supplies historical archives or live tick/quote/book streams into `allegedly-ingest`.

- **Canonical `BookState` Enum** *(unified verbatim with `Data-Model.md` & `IPC-Contract.md`)*:
  - `0 = Live`, `1 = Stale`, `2 = Rebuilding`, `3 = Disconnected`, `4 = Halted` (accompanied by diagnostic `reason_code: u16` for sequence gap, CRC32 checksum mismatch, socket drop, or backpressure drop).
- **Canonical 5-Tier `ProvenanceTier` & Flag Bits** *(unified verbatim with `Data-Model.md` & `IPC-Contract.md`)*:
  - Bits `2..4` encode `0 = ExactL3Mbo` (`EXACT: L3-MBO`), `1 = ExactTickAggr` (`EXACT: TICK-AGGR`), `2 = EstimatedL1Quote` (`ESTIMATED: L1-QUOTE`), `3 = EstimatedTickRule` (`ESTIMATED: TICK-RULE`), `4 = SyntheticIntrabar` (`SYNTHETIC: 1m-INTRABAR`), plus orthogonal flag bits for `PartialVenue`, `OtcIndicative`, and `Delayed`.

```rust
// Canonical DataProvider ABI Types (Tier 1 Rust & Tier 2 flat-buffer layout parity)
#[repr(u8)]
pub enum BookState {
    Live = 0,
    Stale = 1,
    Rebuilding = 2,
    Disconnected = 3,
    Halted = 4,
}

#[repr(u8)]
pub enum ProvenanceTier {
    ExactL3Mbo = 0,        // EXACT: L3-MBO
    ExactTickAggr = 1,     // EXACT: TICK-AGGR
    EstimatedL1Quote = 2,  // ESTIMATED: L1-QUOTE
    EstimatedTickRule = 3, // ESTIMATED: TICK-RULE
    SyntheticIntrabar = 4, // SYNTHETIC: 1m-INTRABAR
}

#[repr(C)]
pub struct NormalizedTickAbi {
    pub ts_exchange_ns: i64,
    pub ts_recv_ns: i64,
    pub price_e9: i64,
    pub qty_e9: i64,
    pub trade_id: u64,
    pub seq: u64,
    pub best_bid_e9: i64,
    pub best_ask_e9: i64,
    pub symbol_id: u16,
    pub venue: u8,
    pub aggressor_side: u8,   // 0=Unknown, 1=Buy, 2=Sell
    pub aggressor_source: u8, // 0=None, 1=ExchangeReported, 2=ExchangeReportedInverted, 3=InferredLeeReady, 4=InferredTickRule
    pub _pad: [u8; 3],        // 72 B exact
}
```

- **Host-Enforced Invariants (`S05`):**
  - Host verifies `ProvenanceHeader` (including `ProvenanceTier` + `PartialVenue` / `OtcIndicative` / `Delayed` flags) before accepting any tick into `rtrb` or `.atvault`.
  - Adapter **must** transition immediately to `BookState::Stale` (with `reason_code`), `BookState::Rebuilding`, `BookState::Disconnected`, or `BookState::Halted` on sequence gap, checksum mismatch (e.g., Kraken top-10 CRC32), socket drop, or bounded-channel backpressure—never silently carry forward stale BBO/DOM levels.
  - Exchange-reported maker sides (e.g., Coinbase Advanced Trade `market_trades`) must be inverted inside the adapter and stamped `ExchangeReportedInverted`; Lee-Ready/Tick-Rule inference runs only on feeds lacking native aggressor side (`AggressorSource::None`).

### 3.2 Extension Point 2: `Study` (Flat SoA Linear-Memory Batch ABI)

Deterministic computation over bar, tick, or order-flow series producing plots, zones, table rows, or alert signals—**zero order submission**.

**Why Flat SoA Linear-Memory (`ByteView`) Is Locked Over Nested WIT Lists:**
Spike `S07`'s verified **`1.679 ms` / `100,000`-bar** (`+3.32%` vs Native) and **`+1.74 MiB` `gzip-9`** measurements were achieved using core WASM flat linear-memory buffers (`guest-wasm`) with `component-model` disabled. Passing `100,000` nested WIT records (`list<study-output>` containing `list<option<s64>>`) would incur canonical-ABI per-bar reallocations and invalidate both the latency and binary-size proofs. Therefore, `v1.0` locks a **flat contiguous SoA linear-memory / `ByteView` ABI** for all Tier 2 WASM studies (any future `wasmtime::component` wrapper is strictly gated on a `v0.1` Implementation CI size + latency spike and never replaces flat SoA buffers on the `100k`-bar batch path):

```rust
// Tier 2 Core WASM Exports (Flat SoA Linear-Memory / ByteView ABI — matches S07 benchmark model)
// Memory layout allocated once per study instance inside guest linear memory:
//   Input SoA arrays (each N * 8 B, 8-byte aligned):
//     bar_index_ptr: *const u64, ts_open_ptr: *const i64, ts_close_ptr: *const i64,
//     open_tick_ptr: *const i64, high_tick_ptr: *const i64, low_tick_ptr: *const i64,
//     close_tick_ptr: *const i64, volume_ptr: *const i64, buy_vol_ptr: *const i64,
//     sell_vol_ptr: *const i64, session_id_ptr: *const u32,
//     flags_ptr: *const u8 (bit 0 = is_closed, bits 2..4 = ProvenanceTier, bits 5..7 = Partial/OTC/Delayed)
//   Output SoA buffers (P plots * N * 8 B, 8-byte aligned):
//     plot_values_e9_ptr: *mut i64  (sentinel i64::MIN == None / NaN)
//     alert_flags_ptr: *mut u32     (N * 4 B)

extern "C" {
    /// Returns pointer/len to UTF-8 JSON Schema (2020-12) for Tier-1/2 Inspector.
    fn study_describe_schema(out_ptr: *mut u32, out_len: *mut u32) -> i32;
    /// Initializes study from canonical sorted-key JSON params & fixed-point tick_size_e9.
    fn study_init(params_ptr: u32, params_len: u32, tick_size_e9: i64) -> i32;
    /// Zero-copy SoA batch warmup over N closed historical bars (S07 flat-memory model: 1.679 ms / 100k bars).
    fn study_on_bars_batch_soa(in_desc_ptr: u32, out_desc_ptr: u32, count: u32) -> i32;
    /// Single incremental tick/bar evaluation (S07: 0.084 us p99).
    fn study_on_bar(in_bar_ptr: u32, out_bar_ptr: u32) -> i32;
    /// Deterministic state checkpoint & rollback for non-repainting intrabar preview (S07 verified).
    fn study_snapshot_state(dst_ptr: u32, dst_cap: u32) -> i32;
    fn study_restore_state(src_ptr: u32, src_len: u32) -> i32;
}
```

- **Non-Repainting & MTF Guarantee (`S07`):**
  - Higher-timeframe (`HTF`) series requests expose **only closed HTF bars** (`bar.ts_close_ns <= base_bar.ts_close_ns`) by default (`lookahead = off`).
  - During live forming-bar ticks, the host invokes `study_snapshot_state()` at bar open, evaluates intrabar previews, and calls `study_restore_state()` before applying the next intrabar tick or final bar close—guaranteeing `0`-bit divergence between live streaming and historical replay (`S07`: `0` mismatches across `15,000` MTF bars + `500` intrabar rollbacks).
- **Wasmtime Pre-Compiled Module Cache:** Compiled `.wasm` artifacts are cached to `plugins/cache/cwasm/<artifact_sha256>-<wasmtime_ver>-<target_triple>.cwasm`, eliminating the `31.651 ms` cold Cranelift JIT compile cost on repeat launches (`S07`).

### 3.3 Extension Point 3: `BrokerAdapter`

Execution transport strictly subordinated to `allegedly-oms` (never bypasses pre-trade risk gates, SQLite WAL intent logging, Risk-Reduction Bypass rules, or Kill-Switch). Based directly on Spike `S06`'s `ExecutionAdapter` trait plus the `S06` §6 `replace_order` refinement:

```rust
// Canonical Rust Trait (Tier 1 native & Tier 4 sidecar RPC parity; S06 validated)
pub trait BrokerAdapter: Send + Sync {
    fn adapter_id(&self) -> &'static str; // Checked against FORBIDDEN_DO_NOT_BUILD_ADAPTERS
    fn execution_env(&self) -> ExecutionEnv; // LocalPaper | BrokerPaper | BrokerLive
    fn protective_leg_mode(&self) -> ProtectiveLegMode; // BrokerNative | ClientManagedWarning
    fn allowed_hosts(&self) -> &'static [&'static str];

    async fn submit_order(&self, intent: &OrderIntent, spec: &InstrumentSpec) -> Result<BrokerAck, AdapterError>;
    async fn replace_order(&self, req: &ReplaceOrderReq, spec: &InstrumentSpec) -> Result<BrokerAck, AdapterError>;
    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), AdapterError>;
    async fn cancel_all(&self) -> Result<usize, AdapterError>;
    async fn get_order_by_client_id(&self, cid: &ClientOrderId) -> Result<Option<BrokerOrderSnapshot>, AdapterError>;
    async fn list_open_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError>;
    async fn list_positions(&self) -> Result<Vec<BrokerPositionSnapshot>, AdapterError>;
}
```

- **Key Phase 3 Refinement (`S06` §6.3):** `replace_order` explicitly accepts `&InstrumentSpec` so non-penny instruments (CME futures `0.25`, Treasuries `1/32`, crypto `1e-8`) format price strings with exact integer tick math.
- **Credential Isolation (`S06-T6`):** `allegedly-oms` injects `ApiCredentials` (non-`Serialize`, `[REDACTED]` on `Debug`/`Display`) directly from OS Keychain (`keyring-core`) into the adapter at connect time; credentials never touch disk, WAL logs, or WebView JS.

### 3.4 Extension Point 4: `DrawingTool`

Interactive geometric or analytical chart annotations anchored to `(ts_ns: i64, price_tick: i64)` coordinates (`P7`, `SV-17`):
- Declares anchor count (`1..N`), hit-test geometry, POC/VAH/VAL/OHLC magnet-snap behavior (`0` sub-tick float error, `SV-17`), Tier-1 micro-toolbar controls (`<= 5` controls, `SV-04`), and canonical `analysis.toml` delta schema.
- Renders through Lightweight Charts `ISeriesPrimitive` hooks or the synchronized WebGL2 overlay; all state mutations flow through the UI undo/redo command bus (strictly isolated from OMS execution per `P8` / `SV-16`).

### 3.5 Extension Point 5: `Panel`

Docked workspace panels hosted inside Allegedly's thin `WorkspaceHost` adapter over MIT `dockview-react` (`v8.9.1`) and built with React 19 + `@ui-sdk/react` (`Apache-2.0`) for non-hot-path UI chrome (Watchlists, Order Tickets, Account/Positions tables via TanStack Table/Virtual, Alerts, Backtest Reports):
- **Hot-Path Boundary Rule:** `60 fps` charts, Footprint/Heatmap WebGL2 overlays, and `60 Hz` DOM Ladders bypass React reconciliation entirely (binary typed-array / ring-buffer updates directly to canvas/WebGL2 per `P2`, `SV-14`).
- **IPC Sandbox:** Panels communicate with Rust core exclusively via typed, schema-validated Tauri v2 IPC commands; zero direct filesystem or keychain access.

---

## 4. ABI Versioning & SemVer Negotiation

1. **Canonical ABI Version:** `ALLEGEDLY_PLUGIN_ABI = "1.0.0"` (tracks the flat SoA linear-memory `Study` ABI and canonical Rust trait contracts).
2. **Negotiation Protocol at Plugin Load:**
   - Host parses `[plugin].abi_version` (SemVer requirement) and verifies `abi_req.matches(&HOST_ABI_VERSION)`.
   - **Major version mismatch (`2.x` vs `1.x`):** **Fail-closed** — plugin is refused with a clear upgrade diagnostic; never silently loaded with mismatched memory layout.
   - **Minor version compatibility (`1.0` plugin on `1.2` host):** Allowed; host gates optional `1.2` capabilities behind feature probing so older plugins keep working.
   - **Host older than plugin (`1.2` plugin on `1.0` host):** Fail-closed with `"Requires Allegedly ABI >= 1.2.0"`.
3. **Deprecation Window:** Once `v1.0.0` ships, breaking ABI changes require a major version bump and at least one minor release deprecation notice.

---

## 5. Deterministic Replay, Float Boundaries & Hash Pinning (`SV-09`)

### 5.1 Cross-OS Deterministic Float-to-Fixed-Point Rules (`arm64` macOS ↔ `x86_64` Windows)

Because core market-data/OMS types are 100% fixed-point integers (`i64`/`i128`) while `Study` internals (e.g., DSP studies inside WASM or Tier-3 Luau scripts whose sole numeric type is `f64`) may compute intermediate IEEE-754 `f64` values before emitting `plot_values_e9: i64`, `allegedly-studies` enforces four strict determinism rules:

1. **Wasmtime / Cranelift Determinism Flags:** Configure Wasmtime's `Config` with **`cranelift_nan_canonicalization(true)`** and **FMA contraction disabled** (`opt_level` without relaxed SIMD / non-deterministic FMA fusion) so `aarch64` (`FMLA`) and `x86_64` (`FMA3`) execute identical IEEE-754 rounded arithmetic.
2. **Canonical `f64 -> i64` Quantization at ABI Output Boundary:** Every float study output exported to `plot_values_e9: i64` passes through one shared Rust/guest helper enforcing:
   - `NaN` → sentinel `i64::MIN` (`None`)
   - `+Inf` / `> MAX_PLOT_E9` → clamp to `i64::MAX` (`-Inf` / `< MIN_PLOT_E9` → clamp to `i64::MIN + 1`)
   - Finite values → **IEEE-754 round-ties-to-even** (`round_ties_even()`) after scaling by `1e9`.
3. **Pure-Software Deterministic `libm`:** Tier-1 Rust studies and Tier-2 WASM guests link a pure-software deterministic `libm` crate (e.g., `libm`, `MIT OR Apache-2.0`) rather than platform OS `libm` so transcendental functions (`sqrt`, `ln`, `exp`, `sin`, `cos`) cannot vary by 1 ULP between Apple `libSystem` and Windows `ucrtbase.dll`.
4. **Scoped Tier-3 Luau `SV-09` Contract:** Because vendored `luau0-src` calls host C++ `cmath` for transcendentals by default, **`SV-09` cross-OS bit-exact SHA-256 parity on Tier-3 Luau scripts is explicitly scoped to deterministic non-transcendental (`+`, `-`, `*`, `/`, integer, and `sqrt` via IEEE-754 hardware `fsqrt`/`sqrtsd`) outputs** until a pure-software deterministic `libm` shim is linked into `luau0-src` (or the script is compiled to Tier-2 WASM).

### 5.2 `ReplayRunManifest` Hash Pinning

Every deterministic replay or backtest run writes a `ReplayRunManifest` pinning the exact executable identity of every active plugin alongside dataset hashes:

```toml
[replay_manifest]
allegedly_version = "0.2.0"
abi_version = "1.0.0"
vault_manifest_sha256 = "f80c3225def6ef40afc589dfdeb63d723c907962e3c5f62b60b01a811e31436b"
output_state_sha256 = "f8b52b2ebab234bcc06319c59747493f822f48c19065d483c97ef6764d0ea6a0"

[[pinned_studies]]
plugin_id = "org.allegedly.builtin.ema-rsi-vwap"
plugin_version = "0.2.0"
runtime = "wasm"
artifact_sha256 = "<sha256 of .wasm or .luau bytes>"
params_canonical_sha256 = "<sha256 of sorted-key TOML params>"
```

- Re-running a saved backtest verifies every `artifact_sha256` and `vault_manifest_sha256` before execution. If a plugin binary or script changed, Allegedly warns the user loudly (`"Study artifact modified since baseline run"`) rather than silently invalidating historical comparisons.
- Plugins with `[determinism].pure_replay_safe = false` (e.g., scripts requesting external wall-clock time or unseeded randomness) are **blocked** from deterministic backtest runs.

---

## 6. Hard `DO-NOT-BUILD` Broker, Prop-Firm & Data Compliance Policy (`KC-03`, `KC-04`, `S06-T7`)

To uphold `Constraints` #1, `Kill-Criteria` `KC-03`/`KC-04`, `R04`, and `R09`, Allegedly enforces a **compile-time and load-time denylist** (`FORBIDDEN_DO_NOT_BUILD_ADAPTERS`, verified `9/9` blocked in `S06-T7`):

| Category | Hard-Blocked Targets | Legal / Rulebook Reason | Enforcement Mechanism |
|---|---|---|---|
| **Prop Firms Prohibiting Custom Clients (`KC-03`)** | `apex`, `apex_trader_funding`, `take_profit_trader`, `tpt`, `bulenox`, `elite_trader_funding`, `etf` | Published prop-firm rules prohibit unauthorized third-party/custom execution clients or require unavailable vendor certification (`R04`) | Rejected in `verify_adapter_allowed()` at `OmsEngine::new` & plugin manifest load |
| **Closed NDA / Commercial ISV Feeds (`Constraints` #1)** | `rithmic`, `cqg` | Closed enterprise NDA `.proto`/SDK agreements; non-redistributable in FOSS (`R04-S20`, `R04-S21`) | Rejected in `verify_adapter_allowed()` & `cargo-deny` |
| **Proprietary Data Extraction (`R07`, `R09`)** | Sierra Chart `.scid` parser, Sierra Chart/Denali market-data extraction, MotiveWave binary/SDK decompilation, `yfinance`/Stooq scrapers | Sierra Chart `"100% within Sierra Chart"` license + `2026-10-13` `.scid` doc removal (`R07-S19`); MotiveWave EULA §9(c) (`R09-S06`) | Banned in architecture & PR review; DTC wire spec (`Public Domain`) is **execution-only** with mandatory `ClientManagedWarning` badge |
| **Copyleft / Non-FOSS Static Dependencies (`KC-04`)** | `nautilus-*` crates (`LGPL-3.0-only`), official IBKR TWS API `v10.49+` (`GPL-3.0`), `flowsurface-*` (`GPL-3.0`), `PineTS` (`AGPL-3.0`), `pineforge-codegen-oss` (non-FOSS), `dockview-enterprise` (proprietary), `ArcticDB` (`BSL 1.1`), `TimescaleDB` (`TSL`), `vectorbt` (Commons Clause) | Incompatible with Allegedly's `Apache-2.0` core (`License-Registry.md`) | Automated CI hard-fail via `cargo-deny v0.22.1` + npm SPDX denylist; `nautilus_trader` permitted **strictly as Tier-4 out-of-process sidecar** |
| **Live Execution Safety Rail (`S06-T6`)** | Any live broker order dispatch on boot | Prevents accidental real-money order routing | Compile-time `allow-live-trading` gate (off by default in dev/spikes) + boot-time `LIVE_ARMED = false` + disjoint `ExecutionEnv` host allowlists |

---

## 7. Open Items & `UNVERIFIED` Gaps

1. **`UNVERIFIED` — Optional WIT Component Model (`wasmtime::component`) Size & Latency Spike:** Spike `S07` verified Wasmtime `v51.0.0` performance (`1.679 ms` / 100k bars, `+3.32%` vs native, `+1.74 MiB` gzip-9) using core WASM flat linear-memory exports (`guest-wasm`). Therefore, `v1.0` locks the flat SoA linear-memory / `ByteView` ABI (§3.2). Enabling `wasmtime::component` for optional high-level plugin metadata/lifecycle WIT bindings is strictly gated on a `v0.1` Implementation CI (post-Phase-5) spike proving compressed size delta and call overhead stay within budget.
2. **`UNVERIFIED` — Tier-4 `LGPL-3.0-only` Sidecar Boundary Legal Sign-Off:** Process-isolated IPC/Parquet communication with `nautilus_trader` is designed to avoid static/dynamic linking obligations, but remains flagged **`[ATTORNEY REVIEW REQUIRED]`** (`License-Registry.md` §1B) before shipping an official sidecar adapter.
3. **`UNVERIFIED` — Windows MSVC & Cross-Platform Luau Build / Size Matrix:** `S07` measured Wasmtime and Luau stripped sizes on `aarch64-apple-darwin`; verifying `luau0-src` C++17 compilation, stripped installer deltas, and `arm64` macOS ↔ `x86_64` Windows SHA-256 determinism on `x86_64-pc-windows-msvc` (first-class v0.1 platform) is a `v0.1` Implementation CI (post-Phase-5) gate.
