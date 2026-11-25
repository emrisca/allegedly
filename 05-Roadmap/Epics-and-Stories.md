---
title: "Allegedly Epics & Vertical-Slice User Stories (E01–E10)"
type: roadmap
status: active
phase: Phase 4
owner: spikes-core
updated: 2026-11-25
---

# Allegedly — Epics & Vertical-Slice User Stories (`E01`–`E10`)

> **Governance & Scope Alignment:** This backlog decomposes **Allegedly** (*"Allegedly a trading terminal."*, `Apache-2.0`, `$0` core, local-first) into **10 canonical Epics (`E01`–`E10`)** and **42 vertical-slice User Stories (`ST-01`–`ST-42`)** aligned verbatim to Phase 3 architecture ([[C4-Architecture]], [[Data-Model]], [[IPC-Contract]], [[Plugin-ABI]], [[Error-Observability]], [[Release-Signing-Update]], [[Testing-Strategy]], and [[0001-license-brand-and-platform-scope|ADR-0001]]–[[0010-ui-kit-docking-and-settings-as-code|ADR-0010]]).
>
> - **Platform Scope (Locked `2026-11-24`, [[Assumptions]] `A01`, [[0001-license-brand-and-platform-scope|ADR-0001]]):** **macOS (Apple Silicon `aarch64` + Intel `x86_64`)** and **Windows 10/11 (`x86_64`)** are Tier-1 targets for `v0.1`–`v1.0`. **Linux (`X11`/`Wayland`, `RK-01`)** is explicitly deferred to **`Post-v1.0`** while keeping all Rust crates, WebGL2 shaders, `TransportAdapter`, and OS-keychain seams portable.
> - **Milestone Cadence:** **`v0.1`** (Sprints 1–4, 8 weeks), **`v0.2`**, **`v0.5`**, **`v1.0`**, and **`Post-v1.0`** (detailed in [[Milestones]], [[Sprint-Plan-v0.1]], and [[v0.1-Definition-of-Done]]).
> - **Canonical Naming & Zero Legacy Residue (`ADR-0001` §3.2):** Strictly uses the 9 production workspace crates (`allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-studies`, `allegedly-replay`, `allegedly-oms`, `allegedly-ipc`, `allegedly-app`) plus dev-only `allegedly-docgen`; local formats `.atvault`, `.atdepth`, `.atworkspace.toml`, `.atanalysis.toml`, `template.toml`, `theme.toml`, `keymap.toml`; and canonical domain terminology (`Study`, `Bar`, `Footprint Bar`, `Volume Profile`, `TPO Profile`, `DOM Ladder`, `Instrument`, `Venue`, `Provider`, `Broker`, `Provenance`, `Bracket Order` per [[Glossary]]).
> - **Anti-Hallucination Discipline:** Every unmeasured runtime target (including integrated macOS/Windows installer sizes, Windows `WebView2` benchmarks, full OS process-tree idle RAM, macOS APFS `PRAGMA fullfsync = ON` Kill-Switch commits, `TA-Lib` CI oracle runs, and 30-minute live soaks) is explicitly tagged **`UNVERIFIED`** until executed in `v0.1` Implementation CI (post-Phase-5) and tracked in [[Unverified-Claims]].
>
> **Companion Phase 4 & Verification Documents:** [[Milestones]] · [[Sprint-Plan-v0.1]] · [[v0.1-Definition-of-Done]] · [[Testing-Strategy]] · [[Unverified-Claims]]

---

## 1. Master Epic Matrix (`E01`–`E10`)

> **Traceability Convention:** The **Canonical `SV-*` IDs** column defines the canonical Phase 4 functional epic ownership mapping synchronized across [[Milestones]], [[Sprint-Plan-v0.1]], [[v0.1-Definition-of-Done]], [[Principles]], and [[Testing-Strategy]]. Section 3 provides the complete 20-row `SV-01`–`SV-20` matrix showing primary and supporting stories plus exact milestone staging for every Sovereignty Verification rule.

| Epic ID | Epic Title | Target Milestones | `v0.1` Sprint(s) | Owning Crate(s) / Surface | Governing ADRs | Canonical `SV-*` IDs | Stories |
|---|---|---|---|---|---|---|---|
| **`E01`** | **Workspace, Licensing, CI Guardrails & Offline Sovereign Boot** | `v0.1`, `v0.2`, `v1.0`, `Post-v1.0` | `Sprint 1` (Foundation), `Sprint 4` (Offline Boot & Release Gate) | `allegedly-core`, `allegedly-app`, `allegedly-docgen` *(dev-only)* | [[0001-license-brand-and-platform-scope\|ADR-0001]], [[0002-desktop-shell-and-binary-ipc\|ADR-0002]] | `SV-01`, `SV-02`, `SV-19`, `SV-20` *(co-enforces `SV-08`, `SV-18`)* | `ST-01`–`ST-04` |
| **`E02`** | **Fixed-Point Domain Model & Aligned Binary IPC** | `v0.1`, `v0.2`, `v1.0` | `Sprint 1` (Core & Wire Codec), `Sprint 2`–`3` (Stream Wiring) | `allegedly-core`, `allegedly-ipc`, `packages/ipc-client` | [[0002-desktop-shell-and-binary-ipc\|ADR-0002]] | `SV-08`, `SV-12` *(co-enforces `SV-06`, `SV-07`)* | `ST-05`–`ST-08` |
| **`E03`** | **Market Data Ingest, SPSC Dispatcher & 5-Tier Provenance** | `v0.1`, `v0.2`, `v0.5`, `v1.0` | `Sprint 2` (Live Ingest & FSM), `Sprint 4` (30-Min Soak) | `allegedly-ingest` | [[0008-market-data-provider-abstraction-and-provenance\|ADR-0008]] | `SV-09`, `SV-10`, `SV-11` *(co-enforces `SV-08`)* | `ST-09`–`ST-12` |
| **`E04`** | **Tiered Tick Vault (`.atvault`), Parquet Replay & 16-ary VRVP** | `v0.1`, `v0.2`, `v0.5`, `v1.0` | `Sprint 2` (`.atvault` & Parquet), `Sprint 4` (Replay Engine) | `allegedly-storage`, `allegedly-replay` | [[0006-tiered-storage-and-replay\|ADR-0006]], [[0007-backtest-engine-adopt-vs-build\|ADR-0007]] | `SV-06`, `SV-09` *(co-enforces `SV-12`, `SV-20`)* | `ST-13`–`ST-17` |
| **`E05`** | **Order-Flow Engine (`32 B` `FootprintCell`, Volume Profile, `u128` `TpoRow`, L2 Book)** | `v0.1`, `v0.2`, `v0.5`, `v1.0` | `Sprint 2` (Core Engine), `Sprint 3`–`4` (10-Chart RSS Proof) | `allegedly-orderflow` | [[0004-orderflow-gpu-and-hotpath-renderer\|ADR-0004]] | `SV-05`, `SV-10`, `SV-11`, `SV-13`, `SV-17` *(co-enforces `SV-08`, `SV-12`)* | `ST-18`–`ST-21` |
| **`E06`** | **Charting Base, `5,000`/`6,000`-Bar Viewport Windowing & WebGL2 Overlay** | `v0.1`, `v0.2`, `v0.5`, `v1.0`, `Post-v1.0` | `Sprint 3` (Chart + WebGL2 + Drawings), `Sprint 4` (Win `WebView2`) | `apps/desktop` (`packages/chart-engine`, `packages/orderflow-gl`) | [[0003-chart-base-and-viewport-windowing\|ADR-0003]], [[0004-orderflow-gpu-and-hotpath-renderer\|ADR-0004]] | `SV-03`, `SV-05`, `SV-12`, `SV-13`, `SV-17` *(co-enforces `SV-06`, `SV-19`)* | `ST-22`–`ST-25` |
| **`E07`** | **Canvas2D DOM Ladder, Time & Sales & Docked Shell (`ui-sdk` `"0.1.0-beta.17"` + MIT `dockview` `8.9.1`)** | `v0.1`, `v0.2`, `v0.5`, `v1.0`, `Post-v1.0` | `Sprint 1` (Shell), `Sprint 2` (TOML), `Sprint 3` (DOM/UX), `Sprint 4` (E2E) | `apps/desktop` (`packages/dom-canvas`, `packages/ui-chrome`) | [[0004-orderflow-gpu-and-hotpath-renderer\|ADR-0004]], [[0010-ui-kit-docking-and-settings-as-code\|ADR-0010]] | `SV-02`, `SV-03`, `SV-04`, `SV-06`, `SV-07`, `SV-14`, `SV-15`, `SV-16`, `SV-18`, `SV-19` *(co-enforces `SV-05`, `SV-08`, `SV-11`, `SV-13`)* | `ST-26`–`ST-30` |
| **`E08`** | **Deterministic Study Runtime (Luau `mlua` + Wasmtime) & `<= 64 MiB` Global Pool** | `v0.1`, `v0.2`, `v0.5`, `v1.0` | `Sprint 3` (Native + Luau + Pool), `Sprint 4` (Cross-OS Parity) | `allegedly-studies`, `plugins/` | [[0005-study-runtime-and-scripting-language\|ADR-0005]] | `SV-06`, `SV-09`, `SV-12` *(co-enforces `SV-13`)* | `ST-31`–`ST-34` |
| **`E09`** | **Paper OMS, SQLite WAL Crash Recovery, Kill-Switch & Risk-Reduction Bypass** | `v0.1`, `v0.2`, `v0.5`, `v1.0`, `Post-v1.0` | `Sprint 2` (Paper OMS + WAL + APFS Bench), `Sprint 4` (E2E) | `allegedly-oms` | [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]] | `SV-15`, `SV-16` *(co-enforces `SV-08`)* | `ST-35`–`ST-38` |
| **`E10`** | **Local Observability, Active 5-Tier Provenance Ledger, Packaging, Signing & Opt-In Updates** | `v0.1`, `v0.2`, `v0.5`, `v1.0`, `Post-v1.0` | `Sprint 4` (Diagnostics, Ledger, RSS Tree, Packaging) | `allegedly-app`, `allegedly-core`, `packages/ui-chrome` | [[0001-license-brand-and-platform-scope\|ADR-0001]], [[0002-desktop-shell-and-binary-ipc\|ADR-0002]] | `SV-01`, `SV-02`, `SV-13`, `SV-19`, `SV-20` *(co-enforces `SV-10`, `SV-11`)* | `ST-39`–`ST-42` |

---

## 2. Detailed Vertical-Slice Stories (`ST-01`–`ST-42`)

### Epic `E01` — Workspace, Licensing, CI Guardrails & Offline Sovereign Boot

#### `ST-01` — 9-Crate `Apache-2.0` Cargo Workspace, `CARGO_TARGET_DIR` Isolation & `cargo-deny` Policy
- **Milestone / Sprint:** `v0.1` · `Sprint 1` (Weeks 1–2)
- **Crate(s) / Surface:** Workspace root `Cargo.toml`, `deny.toml`, `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `allegedly-core`, `allegedly-app`, `allegedly-docgen` *(dev-only)*
- **Dependencies:** Phase 3 Architecture Freeze (`[[C4-Architecture]]` §7)
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-08`, `SV-20`, `KC-04`, `RK-05`, `RK-10`
- **User Story:** As a maintainer, I want a clean `Apache-2.0` Cargo workspace defining the 9 canonical production `allegedly-*` crates (plus dev-only `allegedly-docgen`) with build outputs strictly isolated outside the Obsidian vault and automated license enforcement so zero copyleft or non-FOSS dependencies can enter core.
- **Binary Acceptance Criteria:**
  1. Workspace `Cargo.toml` registers exactly 9 production crates (`allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-studies`, `allegedly-replay`, `allegedly-oms`, `allegedly-ipc`, `allegedly-app`) plus dev-only `crates/tools/allegedly-docgen` (verified excluded from release bundles).
  2. Root `LICENSE` (`Apache-2.0`), `NOTICE`, and `THIRD_PARTY_NOTICES.md` (preserving verbatim TradingView Lightweight Charts `NOTICE` and SIL `OFL-1.1` font notices) exist and pass CI presence checks.
  3. `deny.toml` (`cargo-deny v0.22.1`) allows strictly permissive SPDX licenses (`Apache-2.0`, `Apache-2.0 WITH LLVM-exception`, `MIT`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Zlib`, `Unicode-3.0`, `BSL-1.0`, `CC0-1.0`, `Unlicense`) and hard-fails on `GPL-*`, `AGPL-*`, `LGPL-*` (including `nautilus-*`), `BSL-1.1`, `TSL`, `Commons-Clause`, and `NOASSERTION`.
  4. `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target cargo check --workspace && cargo deny check licenses advisories bans sources` exits `0` with `0` `target/` artifacts created inside `/Users/abelmora/Documents/Obsidian/Allegedly`.

#### `ST-02` — Merge-Blocking Static CI Guards & Dual-OS `ci-pr-fast.yml` Matrix
- **Milestone / Sprint:** `v0.1` · `Sprint 1` (Weeks 1–2)
- **Crate(s) / Surface:** `scripts/ci/`, `.github/workflows/ci-pr-fast.yml`, `allegedly-core`, `allegedly-app`
- **Dependencies:** `ST-01`
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-08`, `SV-18`, `SV-19`, `KC-04`, `RK-04`
- **User Story:** As a contributor, I want every pull request on macOS and Windows to enforce zero-float financial math, zero retired legacy brand/extension tokens, npm SPDX hygiene, and exact `@ui-sdk` version pinning automatically so regressions fail fast before merge.
- **Binary Acceptance Criteria:**
  1. `scripts/ci/check-no-floats.sh` + Clippy/AST lint scans all non-test source files in `allegedly-core`, `allegedly-ingest`, `allegedly-orderflow`, `allegedly-oms`, and `allegedly-replay` and fails if any `f32`/`f64` token appears outside explicitly marked `#[allow(allegedly_ingress_float_parse)]` legacy ingress converters (`SV-08`).
  2. `scripts/ci/check-no-legacy-prefix.sh` scans `Cargo.toml`, `crates/**`, `apps/**`, `packages/**`, and `schemas/**` and hard-fails on any retired legacy crate prefix or file extension (`ADR-0001` §3.2); negative self-test proves a seeded violation returns non-zero.
  3. `scripts/ci/check-npm-policy.mjs` hard-blocks `dockview-enterprise`, `@tradingview/charting_library`, `hqchart`, `PineTS`, and non-OSI JS licenses; verifies exact pinning of `@ui-sdk/react` and `@ui-sdk/core` to `"0.1.0-beta.17"` (rejecting `^` or `~` ranges); and asserts `pnpm` release-age policy is never disabled or bypassed.
  4. `.github/workflows/ci-pr-fast.yml` executes on both `macos-14` (`aarch64-apple-darwin`) and `windows-latest` (`x86_64-pc-windows-msvc`) under `$0` public-repo runner limits (`< 8 min` budget, **`UNVERIFIED`** until first Windows CI run).

#### `ST-03` — Zero-Network Offline Sovereign Boot & Async Post-Paint Hydration
- **Milestone / Sprint:** `v0.1` · `Sprint 4` (Weeks 7–8; async `main()` skeleton landed in `Sprint 1`)
- **Crate(s) / Surface:** `allegedly-app`, `allegedly-core`, `apps/desktop/src-tauri/`
- **Dependencies:** `ST-01`, `ST-26`, `ST-39`
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-01`, `SV-02`, `SV-20`, `Principles` P1
- **User Story:** As a privacy-conscious trader working offline, I want Allegedly to cold-start into an interactive `60 fps` Footprint + `DOM Ladder` workspace in under `2.0 s` with zero outbound network packets and zero account or login walls.
- **Binary Acceptance Criteria:**
  1. Default configuration locks `updates.checkOnStartup = false` and disables all remote data/broker auto-connect on a fresh profile.
  2. All catalog scanning, fixture hydration, and secondary panel loading execute asynchronously on background Tokio tasks after first window paint (resolving the `S02` `2,330.99 ms` synchronous `main()` bottleneck).
  3. Launching the packaged binary inside an isolated zero-network sandbox/firewall namespace emits **`0` outbound DNS/TCP/UDP packets**, **`0` error modals**, and reaches interactive `60 fps` canvas in **`< 2,000 ms` p95** on reference macOS and Windows hardware (`SV-01`, `SV-20`, **`UNVERIFIED`** until packaged CI).
  4. Command Palette (`Cmd/Ctrl+K`) is immediately operational on first paint within `<= 3` keystrokes without network access (`SV-02`).

#### `ST-04` — Linux (`X11` + `Wayland`) CI Matrix & Portable Packaging *(Deferred Post-`v1.0`)*
- **Milestone / Sprint:** `Post-v1.0` (Explicitly deferred; non-blocking for `v0.1`–`v1.0`)
- **Crate(s) / Surface:** `.github/workflows/`, `allegedly-app`
- **Dependencies:** `v1.0` GA Sign-Off
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-01`, `SV-20`, `RK-01`, `KC-01`, `KC-02`
- **User Story:** As a Linux desktop trader post-`v1.0`, I want first-class `X11`/`Wayland` builds with verified WebGL2 performance and `< 40 MB` Flatpak/AppImage installers without compromising macOS/Windows portability.
- **Binary Acceptance Criteria:**
  1. `ubuntu-24.04` (`x86_64-unknown-linux-gnu`) joins PR and nightly CI with `libwebkit2gtk-4.1-dev` (`2.54.3+`) and `libsecret-1-dev` (`keyring-rs` Secret Service).
  2. CI enforces `__NV_DISABLE_EXPLICIT_SYNC=1` and `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` while linting against `WEBKIT_DISABLE_DMABUF_RENDERER=1` (`WebKitGTK 2.52+` SIGSEGV guard, [[Testing-Strategy]] §3.3).
  3. Packaged Flatpak/AppImage is **`< 40 MB`**, passes `SV-01`–`SV-20`, and clears `KC-01`/`KC-02` (`>= 55 fps` WebGL2, **`UNVERIFIED`** until `Post-v1.0`).

---

### Epic `E02` — Fixed-Point Domain Model & Aligned Binary IPC

#### `ST-05` — Zero-Float Fixed-Point Primitives, Domain Entities & Canonical Enums
- **Milestone / Sprint:** `v0.1` · `Sprint 1` (Weeks 1–2)
- **Crate(s) / Surface:** `allegedly-core`
- **Dependencies:** `ST-01`
- **Traceability:** [[0002-desktop-shell-and-binary-ipc|ADR-0002]], [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]] · `SV-08` *(primary)*, `SV-07` *(core config primitives)*, `Constraints` #7, [[Data-Model]] §1–§3
- **User Story:** As a core engineer, I want one canonical, zero-float fixed-point Rust type library shared across ingest, storage, order-flow, replay, OMS, and IPC so financial math never suffers IEEE-754 drift or inconsistent enum encodings.
- **Binary Acceptance Criteria:**
  1. `allegedly-core` exports `PriceE9(i64)`, `QtyE9(i64)` (`1e-9` scale matching Databento `FIXED_PRICE_SCALE = 1_000_000_000`), `PriceTicks(i64)`, `LotQty(i64)`, `MoneyMicros(i128)`, `Bps(i32)`, `TimestampNs(i64)`, `Instrument`, `Venue`, `Session`, and `ProvenanceHeader`.
  2. Canonical 5-tier `ProvenanceTier` (`#[repr(u8)]`: `ExactL3Mbo = 0`, `ExactTickAggr = 1`, `EstimatedL1Quote = 2`, `EstimatedTickRule = 3`, `SyntheticIntrabar = 4`), orthogonal `ProvenanceModifiers` (`PartialVenue`, `OtcIndicative`, `Delayed`), and canonical 5-state `BookState` (`#[repr(u8)]`: `Live = 0`, `Stale = 1`, `Rebuilding = 2`, `Disconnected = 3`, `Halted = 4`) match [[Data-Model]], [[IPC-Contract]], and [[Plugin-ABI]] verbatim.
  3. Direct decimal-string / `serde_json::value::RawValue` parser passes `proptest` round-trips across crypto satoshis (`0.00000001`), CME `0.25` ticks, and 5-decimal FX pips (`parse("0.1") + parse("0.2") == parse("0.3")`), strictly returning `Err(PrecisionLoss | Overflow)` instead of silently truncating.
  4. Zero `f32`/`f64` tokens and zero `std::collections::HashMap` in deterministic domain/serialization structs (`SV-08`, `SV-09`).

#### `ST-06` — Aligned `v1` Binary IPC Framing & Mandatory `16 ms` Coalescing Batcher
- **Milestone / Sprint:** `v0.1` · `Sprint 1` (Weeks 1–2)
- **Crate(s) / Surface:** `allegedly-ipc`, `schemas/ipc-v1/`
- **Dependencies:** `ST-05`
- **Traceability:** [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-12`, [[IPC-Contract]] §3 & §6
- **User Story:** As a high-frequency chart and DOM consumer, I want every Rust-to-WebView binary frame 8-byte-aligned with exact fixed-point integer strides and `16 ms` coalesced streaming so `100k`-bar loads transfer in milliseconds and live ticks never saturate the WebView.
- **Binary Acceptance Criteria:**
  1. Common `24 B` LE header (`magic = 0x414C4732` `"ALG2"`, `version = 1`, `frame_type: u16`, `stream_id: u32`, `record_count: u32`, `send_ns: u64`) guarantees 8-byte alignment at payload offset `24`.
  2. Compile-time `size_of` and `offset_of` assertions enforce exact wire layouts verbatim to [[IPC-Contract]] §3.2:
     - `0x0001` `OHLCV_BARS_SOA`: `8 × N × 8 B` `i64` (`ts_open_ns`, `open/high/low/close_tick`, `volume_e9`, `buy_vol_e9`, `sell_vol_e9`) + padded `N × 4 B` `bar_flags: u32`.
     - `0x0002` `FOOTPRINT_SLAB_SOA`: `N × 16 B` bar index table + `M × 32 B` `FootprintCell`.
     - `0x0003` `VOLUME_PROFILE_SOA`: **`24 B`** summary (`poc_price`, `vah_price`, `val_price`) + `M × 24 B` bins.
     - `0x0004` `TPO_PROFILE_BITMASK`: `8 B` header (`words_per_row: u16 = 2` default for `u128`) + `M × 24 B` default rows.
     - `0x0101` `LIVE_TRADE_BATCH`: **`N × 40 B`** (`seq: u64`, `ts_ns: i64`, `price_e9: i64`, `qty_e9: i64`, `flags: u32`, `_pad: u32`), capped at `MAX_TRADES_PER_FRAME = 4,096`.
     - `0x0102` `LIVE_L2_BOOK_BATCH`: `16 B` header + `M × 24 B` levels (coalesced per `16 ms` via dirty-price `BTreeMap`).
     - `0x0103` `LIVE_BAR_UPDATE_BATCH`: `N × 72 B`; `0x0104` `LIVE_FOOTPRINT_DELTA`: `M × 32 B` `FootprintCell`.
     - `0x0201` `STREAM_STATUS_FRAME`: **`16 B` aligned** (`seq: u64`, `dropped_total: u32`, `reason_code: u16`, `book_state: u8`, `provenance_tier: u8`), emitted **immediately** (bypassing the `16 ms` batch timer).
  3. Live channel coalescer enforces `16 ms` default batching (`8 ms` minimum on `120 Hz` displays; `0 ms` unbatched rejected in production config).
  4. Native Tauri bulk `100k`-bar transfer passes `p95 <= 16.0 ms` (`S02` macOS baseline: `3.0 ms` p50 / `5.0 ms` p95) and streaming passes `>= 20,000 msgs/s` (`p99 <= 10.0 ms`, `S02` baseline: `100,450 msgs/s`; Windows `WebView2` **`UNVERIFIED`** until Sprint 4 CI).

#### `ST-07` — Shell-Agnostic TypeScript `TransportAdapter` & Zero-Copy `BigInt64Array` Decoders
- **Milestone / Sprint:** `v0.1` · `Sprint 1` (Weeks 1–2)
- **Crate(s) / Surface:** `packages/ipc-client`
- **Dependencies:** `ST-06`
- **Traceability:** [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-12`, [[IPC-Contract]] §2
- **User Story:** As a frontend engineer, I want all UI packages to talk to Rust exclusively through a shell-agnostic `TransportAdapter` with zero-copy `BigInt64Array`/`DataView` decoders so Playwright headless benchmarks work identically to native Tauri and shell portability is preserved.
- **Binary Acceptance Criteria:**
  1. `packages/ipc-client` implements `TransportAdapter` (`TauriTransportAdapter` over `tauri::ipc::Response` + `Channel<InvokeResponseBody>` and `LoopbackWsTransportAdapter` over `ws://127.0.0.1:<ephemeral>` with session nonce).
  2. ESLint / import-boundary check guarantees zero direct imports of `@tauri-apps/api/core` outside `packages/ipc-client`.
  3. Zero-copy decoders validate `magic === 0x414C4732` and `version === 1` (fail-closed on mismatch without out-of-bounds reads), decode all 9 `v1` frame types into typed views with `0` float money fields and `0.00 ms`-class JS parse overhead (`vitest` golden fixture round-trip against Rust `allegedly-ipc`).
  4. Rolling `p50`/`p95`/`p99` IPC delivery latency is tracked via a zero-allocation `Float64Array(256)` ring using frame `send_ns: u64`.

#### `ST-08` — Authoritative Rust Multi-Window Workspace State Hub (`state_rev: u64`)
- **Milestone / Sprint:** `v0.1` (`Sprint 1` core hub) · `v0.2` (multi-window pop-out broadcast)
- **Crate(s) / Surface:** `allegedly-ipc`, `packages/ipc-client`
- **Dependencies:** `ST-06`, `ST-07`
- **Traceability:** [[0002-desktop-shell-and-binary-ipc|ADR-0002]], [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]] · `SV-06`, [[IPC-Contract]] §7
- **User Story:** As a multi-monitor trader, I want an authoritative Rust workspace state hub guarded by a strictly monotonic `state_rev: u64` counter so concurrent edits from primary and detached windows never silently overwrite newer state.
- **Binary Acceptance Criteria:**
  1. `allegedly-ipc` owns canonical `WorkspaceState` (active `Instrument` per link group `A–H`, active `Layout`, theme token ID, `live_armed`, selected `Study`/`Drawing` ID) stamped with monotonic `state_rev: u64`.
  2. `workspace.publish_event` rejects any patch where `patch.state_rev < current_rev`, returning `{ accepted: false, currentRev }` without mutating state; accepted patches increment `state_rev` and fan out to all registered windows.
  3. Cross-window state sync RTT meets `p95 <= 8.0 ms` (`S03` loopback baseline: `0.20 ms` p50 / `0.60 ms` p95; Windows `WebView2` **`UNVERIFIED`** until `v0.2` E2E).

---

### Epic `E03` — Market Data Ingest, SPSC Dispatcher & 5-Tier Provenance

#### `ST-09` — `$0` Live Ingest Adapters (Kraken WS v2, Coinbase AdvTrade WS & Synthetic Sim)
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4)
- **Crate(s) / Surface:** `allegedly-ingest`
- **Dependencies:** `ST-05`
- **Traceability:** [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]] · `SV-09`, `SV-10`, `Constraints` #2 & #8
- **User Story:** As a `$0`-core trader, I want zero-key US-legal live crypto feeds and a deterministic synthetic simulator out of the box with exact exchange-verified order books and truthful aggressor sides so Footprint Bars and DOM Ladders are accurate on day one.
- **Binary Acceptance Criteria:**
  1. **Kraken Spot WS v2 (`wss://ws.kraken.com/v2`):** Parses prices/quantities directly from `serde_json::value::RawValue` into `PriceE9`/`QtyE9`, verifies IEEE-802.3 `CRC32` over top-10 asks + top-10 bids on every book delta, and stamps `AggressorSource::ExchangeReported` (`ProvenanceTier::ExactTickAggr`).
  2. **Coinbase Advanced Trade WS (`wss://advanced-trade-ws.coinbase.com/`):** Enforces strict monotonic `sequence_num` checking on every frame, **inverts** `market_trades` maker side (`"SELL"` → `Buy`, `"BUY"` → `Sell`) stamped `AggressorSource::ExchangeReportedInverted` (`ProvenanceTier::ExactTickAggr`), never overwrites inverted exchange side with L2 quote-matching, and exposes the `~50 ms` cross-channel L2 coalescing tooltip metadata.
  3. **Deterministic Synthetic Simulator:** Generates seeded fixed-point L1/L2/trade streams stamped `Timeliness::Synthetic` for offline `SV-01` demos and CI testing.
  4. Zero geo-blocked offshore defaults (`Binance Global`, `Bybit`, `Hyperliquid`) and zero scrapers (`yfinance`, `Stooq`).

#### `ST-10` — Per-Provider `rtrb` SPSC Rings, Single-Threaded Core Event Dispatcher & Fail-Closed `BookState` FSM
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4)
- **Crate(s) / Surface:** `allegedly-ingest`, `allegedly-ipc`
- **Dependencies:** `ST-06`, `ST-09`
- **Traceability:** [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]] · `SV-09`, `SV-10`, `KC-05`, [[C4-Architecture]] §4A
- **User Story:** As a trader relying on live L2 depth, I want each exchange WebSocket isolated on its own wait-free `rtrb` SPSC ring drained by a single-threaded dispatcher that fails closed into `BookState::Stale` on any gap, checksum failure, disconnect, or ring drop so stale depth is never shown as live.
- **Binary Acceptance Criteria:**
  1. Each active `Provider` task owns a dedicated `rtrb v0.4.1` SPSC ring (`cap = 16,384` production; stress-tested at `cap = 1,024`) drained by a single-threaded Core Event Dispatcher (respecting `rtrb`'s `!Clone` SPSC ownership) which updates `allegedly-orderflow` inline and pushes batched ticks into a dedicated `StorageRing`.
  2. Loopback TCP/WS fault-injection suite (`127.0.0.1`) verifies:
     - Injected sequence gap or Kraken CRC32 mismatch clears local `L2OrderBook`, transitions immediately to `BookState::Stale`, rejects poisoned deltas, emits an immediate `16 B` `STREAM_STATUS_FRAME`, and recovers clean snapshot in `< 2,000 ms` (`S05` baseline: `7.41 ms`).
     - Abrupt TCP drop triggers equal-jitter exponential backoff (`20 ms` base, `30 s` cap) and clean resync `< 2,000 ms` (`S05` baseline: `129.68 ms`).
     - Ring saturation (`100,000` ticks into slow consumer) maintains flat RSS, increments `dropped_total`, and immediately emits `BookState::Stale(BackpressureDrop)` with **`0` silent corruptions** (`KC-05`).
  3. Synthetic SPSC handoff sustains **`>= 250k ticks/s`** (`KC-05` floor `>= 20k ticks/s`) with `p99 <= 500 µs` (`S08` baseline: `67.65M ticks/s` saturation / `11.25 µs` p99 at `500k/s`).

#### `ST-11` — Aggressor Inference Fallbacks, Honest L2 Non-MBO Labeling & 30-Minute Live Endurance Soak
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (classifier) & `Sprint 4` (30-min soak gate)
- **Crate(s) / Surface:** `allegedly-ingest`, `.github/workflows/ci-pre-release-soak.yml`
- **Dependencies:** `ST-09`, `ST-10`
- **Traceability:** [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]] · `SV-10`, `SV-11`, [[Testing-Strategy]] §2.3
- **User Story:** As a trader analyzing diverse feeds, I want feeds without exchange aggressor flags to classify via Lee-Ready or Tick-Rule strictly stamped as `ESTIMATED`, and I want a 30-minute unattended peak-volatility live soak proving zero book corruption before `v0.1` ships.
- **Binary Acceptance Criteria:**
  1. Feeds with `AggressorSource::None` fall back to Quote-Rule / Lee-Ready (`ProvenanceTier::EstimatedL1Quote`) when synchronized BBO exists, or Tick-Rule (`ProvenanceTier::EstimatedTickRule`) otherwise, and OHLCV-only data stamps `ProvenanceTier::SyntheticIntrabar` (never masquerading as `ExactTickAggr` or `ExactL3Mbo`, `SV-10`).
  2. L2 MBP streams explicitly expose non-MBO capability flags so downstream UI enforces honest `L2` labeling and forbids unlabeled MBO/heuristic claims (`SV-11`).
  3. Scheduled `ci-pre-release-soak.yml` runs a **30-minute unattended US-session (`13:30–16:00 UTC`) soak** against Kraken Spot WS v2 (`depth=100`) + Coinbase AdvTrade WS (`BTC/USD`, `ETH/USD`, `SOL/USD`) passing `>= 1,000` live trades/venue, `0` Kraken CRC32 mismatches, `0` unrecovered `sequence_num` gaps, `0` parse errors, `0` channel drops, and flat RSS `< 60 MB` (**`UNVERIFIED`** until Sprint 4 pre-release CI).

#### `ST-12` — Pro Historical Offline Importers (Databento `.dbn.zst`, Dukascopy `.bi5`, CSV / NinjaTrader `.txt`)
- **Milestone / Sprint:** `v0.2`
- **Crate(s) / Surface:** `allegedly-ingest`, `allegedly-storage`
- **Dependencies:** `ST-10`, `ST-13`
- **Traceability:** [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]], [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-08`, `SV-09`, `SV-10`
- **User Story:** As a futures and FX trader with my own historical files, I want `$0` native offline importers for Databento `.dbn.zst`, Dukascopy `.bi5`, and NinjaTrader `.txt`/CSV with strict provenance stamping so I can replay CME L3 MBO and FX ticks locally without vendor lock-in.
- **Binary Acceptance Criteria:**
  1. `databento/dbn v0.75.0` (`Apache-2.0`) decodes `TradeMsg`, `Mbp10Msg`, `MboMsg`, and `InstrumentDefMsg` directly at `1e-9` `i64` with zero rescaling (`>= 500k rec/s`; `S05` synthetic baseline `18.43M`/`5.67M rec/s`; real user-downloaded CME `.dbn.zst` sample **`UNVERIFIED`** until human fixture check).
  2. Dukascopy `.bi5` importer (`lzma-rs v0.3`) converts big-endian `f32` volume exclusively inside `#[allow(allegedly_ingress_float_parse)]` and stamps `VenueCoverage::OtcIndicative` + `AggressorSource::None` (`SV-08`, `SV-10`).
  3. Zero Sierra Chart `.scid` parsing code or Denali data extraction (`KC-04`, `RK-06`).

---

### Epic `E04` — Tiered Tick Vault (`.atvault`), Parquet Replay & 16-ary VRVP

#### `ST-13` — Crash-Safe `.atvault` Live Capture & Atomic Hive Parquet 2.0 Compactor
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4)
- **Crate(s) / Surface:** `allegedly-storage`
- **Dependencies:** `ST-05`, `ST-10`
- **Traceability:** [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-06`, `SV-09`, [[Data-Model]] §4.1–§4.2
- **User Story:** As a local-first trader, I want live ticks recorded sequentially into crash-safe `.atvault` segments and compacted atomically into open Hive-partitioned Apache Parquet 2.0 files so my market history is compact, durable, and queryable by any open tool.
- **Binary Acceptance Criteria:**
  1. `.atvault` recorder writes `[ALGDTV01][u32 ver=1][u32 hdr_len][JSON VaultHeader][Zstd-3 stream of 72 B packed LE NormalizedTick][u64 record_count][u32 CRC32][TVEND001]` and rotates on `1,000,000` ticks, `15 MiB` compressed, or `1 hour` UTC boundary.
  2. Background compactor writes Hive Parquet 2.0 (`vault/ticks/venue=<V>/symbol=<S>/date=<YYYY-MM-DD>/part-*.parquet`) using `WriterVersion::PARQUET_2_0`, `max_row_group_row_count = 200_000`, `EnabledStatistics::Chunk`, `DELTA_BINARY_PACKED` on `ts_event`/`price_fp`, `RLE_DICTIONARY` on `qty_fp`/`aggressor_side`/`flags`, `ZSTD(3)`, and embedded `allegedly.provenance_json` + `allegedly.content_sha256` file metadata.
  3. Atomic temp-file rename + SQLite catalog transaction guarantees zero half-written partitions; `.atvault` → Parquet round-trip test proves **`0` lost ticks**, **`0` field mismatches**, and `<= 5 B/tick` trade compression (`S08` baseline: `4.26 B/tick` = `406.24 MiB` for `100M` ticks).
  4. Runtime test-harness path guard asserts `!path.contains("/Documents/Obsidian/")` and isolates multi-GB scratch under `/tmp/allegedly-*-test/` (`RK-10`).

#### `ST-14` — SQLite WAL Catalog (`catalog.sqlite`) & 2-Stage Row-Group Pruned Cold Seek
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4)
- **Crate(s) / Surface:** `allegedly-storage`
- **Dependencies:** `ST-13`
- **Traceability:** [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-09`, `SV-12`, [[Data-Model]] §4.3
- **User Story:** As a trader scrubbing months of tick history, I want 2-stage partition and Parquet row-group pruning backed by a tiny SQLite WAL catalog so cold 1-hour seeks across `100M` ticks finish in well under `100 ms`.
- **Binary Acceptance Criteria:**
  1. `catalog.sqlite` (`rusqlite v0.43.0`, `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;`) stores `instruments` and `partitions` (`ts_min_ns`, `ts_max_ns`, `row_count`, `byte_size`, `provenance_json`, `sha256_hex`) indexed on `(venue, symbol, dataset_kind, ts_min_ns, ts_max_ns)`.
  2. Two-stage seek prunes non-overlapping Parquet files via SQLite index and non-overlapping row groups via Parquet chunk `min`/`max` stats (`>= 99%` row-group pruning on 1-hour queries over 20-day / `100M`-tick vault; `S08` baseline: `99.58%`).
  3. Cold (`F_NOCACHE` / uncached) 1-hour seek latency passes **`p99 <= 100 ms`** (`S08` macOS M2 baseline: `5.22 ms` p50 / `8.79 ms` p99; Windows NTFS/SSD **`UNVERIFIED`** until Sprint 4 CI).

#### `ST-15` — Deterministic Streaming Replay Engine (`allegedly-replay`), `ReplayRunManifest` & L2 Queue-Position Fills
- **Milestone / Sprint:** `v0.1` · `Sprint 4` (Weeks 7–8)
- **Crate(s) / Surface:** `allegedly-replay`, `packages/ui-chrome/src/replay/`
- **Dependencies:** `ST-14`, `ST-18`, `ST-31`, `ST-35`
- **Traceability:** [[0006-tiered-storage-and-replay|ADR-0006]], [[0007-backtest-engine-adopt-vs-build|ADR-0007]] · `SV-09`, [[Plugin-ABI]] §5.2
- **User Story:** As a discretionary and systematic trader, I want to replay `100M`-tick archives at `1×`, `50×`, or max-CPU batch speed through the exact live order-flow, `Study`, and paper OMS pipeline with realistic queue-position fills and bit-identical hashes across macOS and Windows.
- **Binary Acceptance Criteria:**
  1. `allegedly-replay` streams Hive Parquet 2.0 and `.atvault` partitions directly through `allegedly-orderflow`, `allegedly-studies`, and `allegedly-oms` (`LocalPaperAdapter`) at `1×`, `50×`, and max-CPU batch speeds (`<= 250 ms` per `1M` ticks, peak RSS `<= 200 MB`; `S08` baseline: `0.975 s` for `100M` ticks at `34.44 MiB` RSS).
  2. Every replay emits a deterministic `ReplayRunManifest` pinning `vault_manifest_sha256`, per-`Study` `artifact_sha256`, canonical TOML params hash, and `output_state_sha256`; plugins with `pure_replay_safe = false` are blocked.
  3. Conservative L2 queue-position fill model verifies that a `10`-lot touch behind a `100`-lot resting queue does **not** fill prematurely; fills occur only after cumulative depletion `>= 100` lots or trade-through (`ADR-0007` Fidelity Tier B).
  4. Nightly CI verifies **`100%` bit-identical SHA-256** across `1×`, `50×`, and max-CPU batch runs on a `5,000,000`-tick Day-1 Parquet partition across `macos-14` (`arm64`), Intel macOS (`x86_64`), and `windows-latest` (`x86_64`) (`SV-09`; cross-OS Intel macOS & Windows parity **`UNVERIFIED`** until Sprint 4 CI).

#### `ST-16` — Optional Out-of-Process DuckDB (`MIT`) Sidecar & `10M`-Row L2 MBP Parquet Qualification
- **Milestone / Sprint:** `v0.2`
- **Crate(s) / Surface:** `allegedly-storage`, `docs/`
- **Dependencies:** `ST-13`, `ST-14`
- **Traceability:** [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-06`, `SV-20`
- **User Story:** As a quantitative researcher, I want to run ad-hoc SQL queries directly over my local Hive Parquet vault using an external DuckDB CLI/sidecar without adding `20+ MB` of embedded SQL engine bloat to the desktop installer, plus opt-in L2 MBP Parquet recording with disk quotas.
- **Binary Acceptance Criteria:**
  1. Zero embedded `duckdb` or `datafusion` crates in `Cargo.toml` (`+0 B` core installer delta); documented read-only DuckDB `v2.0.1` (`MIT`) sidecar command queries `<ALLEGEDLY_HOME>/vault/ticks/**/*.parquet` directly with zero ETL.
  2. Opt-in `l2_mbp` Parquet recording enforces per-instrument retention quotas (bytes / days) to prevent SSD exhaustion; `10M`-row L2 MBP compression ratio and cold seek (`<= 100 ms`) are benchmarked and recorded (**`UNVERIFIED`** until `v0.2` benchmark).
  3. Pre-computed `footprints_1m` Parquet rollups accelerate multi-month chart boot without re-scanning raw ticks.

#### `ST-17` — Optional Tier-4 Out-of-Process `nautilus_trader` / `Lean` Backtest Sidecar Bridge
- **Milestone / Sprint:** `v0.5` (`[ATTORNEY REVIEW REQUIRED]` on `LGPL-3.0-only` boundary)
- **Crate(s) / Surface:** `allegedly-replay`, `allegedly-ipc`
- **Dependencies:** `ST-15`, legal sign-off on `LGPL-3.0-only` process isolation (`UV-10`)
- **Traceability:** [[0007-backtest-engine-adopt-vs-build|ADR-0007]], [[0001-license-brand-and-platform-scope|ADR-0001]] · `SV-09`, `KC-04`
- **User Story:** As an institutional quant, I want to launch user-installed `nautilus_trader` or `QuantConnect/Lean` out-of-process over my local Parquet vault and view the returned trade/equity Parquet artifacts inside Allegedly without contaminating Allegedly's `Apache-2.0` binary.
- **Binary Acceptance Criteria:**
  1. Zero `nautilus-*` crates linked in `Cargo.toml` (enforced by `cargo-deny` hard-fail); communication uses strictly read-only Parquet files + localhost JSON-RPC progress events across an OS process boundary.
  2. Returned trade/fill/equity Parquet artifacts render on Allegedly charts with verified `ReplayRunManifest` provenance and CFTC Rule 4.41 notice.
  3. Formal `[ATTORNEY REVIEW REQUIRED]` sign-off for `LGPL-3.0-only` IPC boundary and `nautilus_trader` `TRADEMARK.md` compliance is recorded prior to public shipping (**`UNVERIFIED`** until counsel review).

---

### Epic `E05` — Order-Flow Engine (`32 B` `FootprintCell`, Volume Profile, `u128` `TpoRow`, L2 Book)

#### `ST-18` — Flat Contiguous `FootprintSlabArena` (`32 B` `FootprintCell`), `i128` Imbalances & Steidlmayer Value Area
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4; 10-chart RSS proof in `Sprint 3`–`4`)
- **Crate(s) / Surface:** `allegedly-orderflow`
- **Dependencies:** `ST-05`
- **Traceability:** [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]], [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-05`, `SV-08`, `SV-13`, [[Data-Model]] §3.2
- **User Story:** As an order-flow trader running multi-chart layouts, I want Footprint Bars stored in a flat contiguous `32 B` `FootprintCell` slab arena with exact `i128` imbalance and Value Area math so `100k`-bar history stays well inside our `< 300 MB` idle RAM budget with zero rounding drift.
- **Binary Acceptance Criteria:**
  1. `#[repr(C)] struct FootprintCell` (`price_tick: i64`, `bid_vol: i64`, `ask_vol: i64`, `trade_count: u32`, `imbalance_flags: u8`, `_pad: [u8; 3]`) passes compile-time `size_of::<FootprintCell>() == 32`, stored inside contiguous `FootprintSlabArena` indexed by `64 B` `FootprintBarHeader` (`cell_offset: u32`, `cell_len: u16`) with zero per-bar `Vec` allocations.
  2. Zero-drift property tests prove `Σ(bid_vol + ask_vol) == bar_volume`, `Σ(ask_vol - bid_vol) == bar_delta`, exact `i128` cross-multiplied diagonal imbalance (`300%` = `30000 bps` default), and `70%` (`7000 bps`) Steidlmayer Value Area (`POC`, `VAH`, `VAL`) across `100,000+` ticks.
  3. `FootprintSlabArena` `100k`-bar memory footprint measures `< 60 MiB` (remediating `S08`'s `260.77 MiB` per-bar `Vec` RSS) and 10-chart concurrent multi-timeframe soak stays within `< 300 MB` total terminal RAM (`SV-13`, **`UNVERIFIED`** until Sprint 3–4 profiler).

#### `ST-19` — 16-ary Dyadic Segment Tree VRVP & Exact `i64` POC/VAH/VAL Coordinates
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4)
- **Crate(s) / Surface:** `allegedly-orderflow`
- **Dependencies:** `ST-18`
- **Traceability:** [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]], [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-12`, `SV-17`
- **User Story:** As a trader panning rapidly across `100,000` bars, I want Visible-Range Volume Profile (VRVP) to recompute in microseconds with exact integer `POC`/`VAH`/`VAL` tick coordinates so pan/zoom stays locked at `60 fps` and magnet snapping is exact.
- **Binary Acceptance Criteria:**
  1. 4-level base-16 Dyadic Segment Tree (`16^0=1`, `16^1=16`, `16^2=256`, `16^3=4,096` bars/node) indexes `FootprintSlabArena` and outputs `24 B`-summary + `M × 24 B`-bin `VOLUME_PROFILE_SOA` frames (`0x0003`).
  2. Property test over `10,000` random viewport ranges (`500..50,000` bars on `100,000`-bar dataset) proves **`100%` exact integer parity** against brute-force level summation.
  3. VRVP recomputation latency meets CI gate **`p99 < 250 µs`** (Charter `SV-12` `< 500 µs`; `S08` macOS baseline: `9.041 µs` p50 / `27.084 µs` p99; Windows **`UNVERIFIED`** until Sprint 4 CI).
  4. Exports exact `PriceTicks(i64)` coordinates for `POC`, `VAH`, `VAL`, and Naked POCs directly for Drawing/Order magnet snap (`SV-17`).

#### `ST-20` — `u128` `TpoRow` Bitmasks, Multi-Day Composite TPO & Bounded 24h `.atdepth` Heatmap Ring
- **Milestone / Sprint:** `v0.1` (`Sprint 2`: single-session `u128` `TpoRow` bitmask & `SV-17` TPO magnet coordinates) · `v0.5` (+ `v1.0` GA re-certification: multi-day `CompositeTpoRow` & 24h `.atdepth` Liquidity Heatmap `< 64 MB` RAM / `< 30 MB` disk)
- **Crate(s) / Surface:** `allegedly-orderflow`, `allegedly-storage`
- **Dependencies:** `ST-18`
- **Traceability:** [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]], [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-13`, `SV-17`, [[Data-Model]] §3.2
- **User Story:** As a Market Profile and heatmap trader, I want `u128` TPO bitmasks that cover 15-minute 24-hour sessions without truncation and a memory-bounded 24-hour liquidity heatmap ring so extended sessions never overflow brackets or exhaust RAM.
- **Binary Acceptance Criteria:**
  1. **`v0.1` (`Sprint 2`):** `TpoRow` uses `bracket_mask: u128` (`128` brackets — natively supporting 30m 24h = 48, CME Globex = 46, and 15m 24h = 96 periods), `count_ones()` `O(1)` TPO counts, exact bitwise split/merge identity (`left | (right << k) == orig`), Initial Balance, single prints, poor highs/lows, exact `PriceTicks(i64)` POC/VAH/VAL coordinates for `v0.1` `SV-17` magnet snapping, and `< 200 ns/tick` update (`S08` `u64` prototype: `2.10 ns/tick`; `u128` bench **`UNVERIFIED`** until Sprint 2).
  2. **`v0.5`:** `CompositeTpoRow` (`bracket_words: Vec<u64>`) supports multi-day/weekly composites exceeding `128` brackets (`words_per_row > 2` in `0x0004` `TPO_PROFILE_BITMASK`) and extends `SV-17` magnet snapping to multi-day composite POC/VAH/VAL levels.
  3. **`v0.5` (+ `v1.0` GA re-certification, `UV-07`):** Bounded 24-hour L2 Liquidity Heatmap ring (`864,000` slices at `10 Hz` × `200` levels around mid) holds resident heatmap RAM **`< 64 MB`** and Zstd-compressed `.atdepth` disk chunks **`< 30 MB`** (`SV-13`, **`UNVERIFIED`** until `v0.5` soak & `v1.0` GA re-certification).

#### `ST-21` — Provenance-Gated Absorption / Unfinished Auction & Honest L2 Heuristic Detectors
- **Milestone / Sprint:** `v0.5` (Absorption, Unfinished Auction & L2 Iceberg/Pull heuristic detectors; `[Est / Max]` DOM PIQ badge ships in `v0.1` `ST-27`)
- **Crate(s) / Surface:** `allegedly-orderflow`, `packages/ui-chrome`
- **Dependencies:** `ST-11`, `ST-18`, `ST-39`
- **Traceability:** [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]], [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]] · `SV-10`, `SV-11`, `Principles` P5
- **User Story:** As an order-flow trader, I want Absorption and Unfinished Auction triggers automatically disabled on synthetic intrabar data and L2 Iceberg/Pull signals clearly labeled as heuristics with `[Est / Max]` queue bounds so I never act on fabricated precision.
- **Binary Acceptance Criteria:**
  1. Any `Bar` or segment stamped `ProvenanceTier::SyntheticIntrabar` (`SYNTHETIC: 1m-INTRABAR`) hard-disables Absorption and Unfinished Auction trigger emission in `allegedly-orderflow` and displays the disabled reason in UI (`SV-10`).
  2. Building on `v0.1`'s honest `L2` non-MBO labeling (`ST-11`) and `[Est / Max]` DOM PIQ badge (`ST-27`), on `L2_MBP` feeds lacking `L3_MBO` order IDs `v0.5` Iceberg and Spoof/Pull detectors stamp non-dismissible `HEURISTIC: L2-ICEBERG` / `HEURISTIC: L2-PULL` legend/tooltip labels and expose `dwell_ms` and `conflation_guard_ms` sliders in the Right Property Inspector (`SV-11`).

---

### Epic `E06` — Charting Base, `5,000`/`6,000`-Bar Viewport Windowing & WebGL2 Overlay

#### `ST-22` — `Lightweight Charts v5.3.0` Host & `5,000`/`6,000`-Bar Rust Viewport Windowing Controller
- **Milestone / Sprint:** `v0.1` · `Sprint 3` (Weeks 5–6)
- **Crate(s) / Surface:** `packages/chart-engine`, `allegedly-ipc`
- **Dependencies:** `ST-07`, `ST-18`, `ST-19`
- **Traceability:** [[0003-chart-base-and-viewport-windowing|ADR-0003]] · `SV-05`, `SV-12`, `SV-13`, [[IPC-Contract]] §5
- **User Story:** As an active scalper, I want charts backed by a `5,000`-bar Rust sliding window with `6,000`-bar idle-trim hysteresis and full-history Rust `Study` warmup so live `60 Hz` updates stay locked at `60 fps` instead of hitting LWC's `100k`-bar `update()` cliff.
- **Binary Acceptance Criteria:**
  1. `ChartViewportController` maintains active LWC v5.3.0 series at `W_ACTIVE = 5,000` bars (`~340 KB` `OHLCV_BARS_SOA`), triggers asynchronous `viewport.prefetch_window` (`W_STRIDE = 2,500`, `50%` overlap) within `W_MARGIN = 750` bars of either edge, and restores visible range via timestamp anchor.
  2. Live-tail growth buffers up to **`W_MAX = 6,000` bars** (`1,000`-bar hysteresis band) before scheduling a front trim back to `5,000` strictly via `requestIdleCallback` between bar closes (never mid-tick or during an active pointer drag).
  3. All `Study` warmups (e.g., `200`-bar EMA, Session VWAP, CVD) compute over full lookback history in Rust `allegedly-studies` before slicing the `<= 5,000`-bar window for IPC (never computing warmup over truncated JS arrays).
  4. Sustains **`60.0 fps`** (`P99 <= 16.6 ms`, `>= 55 fps` `KC-01` floor, `0` stalls `> 33 ms`, `0` React commits) at `60 Hz` live ticks with VRVP + Footprint + CVD active (`S01` macOS Brave baseline verified; native `WKWebView` & Windows `WebView2` **`UNVERIFIED`** until Sprint 4 CI).

#### `ST-23` — Synchronous `ISeriesPrimitive` Raw WebGL2 Instanced Order-Flow Renderer & Canvas2D Fallback
- **Milestone / Sprint:** `v0.1` · `Sprint 3` (Weeks 5–6: Footprint, Volume Profile & single-session `u128` TPO overlays) · `v0.5` (24h `.atdepth` Liquidity Heatmap, Absorption/Unfinished Auction & multi-day `CompositeTpoRow` shaders)
- **Crate(s) / Surface:** `packages/orderflow-gl`
- **Dependencies:** `ST-18`, `ST-19`, `ST-22`
- **Traceability:** [[0003-chart-base-and-viewport-windowing|ADR-0003]], [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]] · `SV-05`, `SV-12`, `SV-19`, `RK-08`
- **User Story:** As an order-flow trader, I want Footprint cells, Volume Profiles, and TPO brackets rendered via raw WebGL2 instancing inside LWC's synchronous paint callback so overlays have zero visual lag during rapid panning, zooming, resizing, and DPI switches.
- **Binary Acceptance Criteria:**
  1. All chart-aligned GPU rendering executes strictly inside LWC's `ISeriesPrimitive` `useBitmapCoordinateSpace` callback (decoupled `rAF` / `subscribeVisibleLogicalRangeChange` loops prohibited by lint/review).
  2. Renders `32 B` `FootprintCell` slabs (`imbalance_flags`, bid/ask bars, POC outline), `VOLUME_PROFILE_SOA` histograms, and `u128` `TPO_PROFILE_BITMASK` brackets via `gl.drawArraysInstanced` plus a DPR-aware `JetBrains Mono` bitmap glyph atlas consuming semantic `theme.toml` tokens (`>= 4.5:1` WCAG AA contrast, `SV-19`).
  3. Pixel-centroid sync harness verifies **`<= 0.5 CSS px` drift (`0.000 CSS px` target)** and **`0` lagging frames** across pan, zoom, resize, and `2× → 1×` DPR switches, with WebGL2 draw time **`p95 <= 4.0 ms`** (`S01` macOS baseline: `0.000 px`, `0.30–0.40 ms` p50; `WKWebView`/`WebView2` **`UNVERIFIED`** until Sprint 4 CI).
  4. Enforces per-window WebGL2 context cap, calls `loseContext()` on panel unmount, and gracefully falls back to a decimated Canvas2D Footprint/Profile renderer with a non-blocking status badge on `webglcontextlost`.

#### `ST-24` — Clean-Room `ISeriesPrimitive` Drawing Suite & Exact `i64` POC/VAH/VAL Magnet Snap
- **Milestone / Sprint:** `v0.1` · `Sprint 3` (Weeks 5–6) · `v0.5` (multi-day `CompositeTpoRow` magnet snap extension)
- **Crate(s) / Surface:** `packages/chart-engine`, `packages/ui-chrome`
- **Dependencies:** `ST-19`, `ST-22`, `ST-28`
- **Traceability:** [[0003-chart-base-and-viewport-windowing|ADR-0003]], [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]] · `SV-03`, `SV-06`, `SV-17`, `Principles` P7
- **User Story:** As a chart analyst, I want clean-room Drawing tools anchored to integer `(ts_ns, price_tick)` coordinates with exact `i64` magnet snapping to Volume/TPO POC, VAH, and VAL levels, persisted cleanly in `.atanalysis.toml`.
- **Binary Acceptance Criteria:**
  1. Ships 6 clean-room `ISeriesPrimitive` core `Drawing` tools for `v0.1`: Trendline, Horizontal Ray, Horizontal/Vertical Line, Rectangle, Fibonacci Retracement, and Anchored Volume Profile (zero copied TradingView/MotiveWave icons or code).
  2. Holding `Ctrl/Cmd` (or enabling `POC-Snap Magnet`) while dragging a Horizontal Ray or Limit Order within `12 px` of a `Volume Profile` or single-session `u128` `TPO Profile` POC, VAH, or VAL (`v0.1`) — extended to multi-day `CompositeTpoRow` levels in `v0.5` — snaps to the **exact `PriceTicks(i64)` index** with **`0` sub-tick float error** (`SV-17`).
  3. All `Drawing`s persist delta-only inside sorted-key `.atanalysis.toml` Analysis Layers with drag-and-drop Z-order, lock/visibility toggles, and timeframe visibility masks (`SV-06`, `SV-03`).

#### `ST-25` — Cross-Platform `WKWebView` & Windows `WebView2` GPU & Multi-Chart Qualification
- **Milestone / Sprint:** `v0.1` (`Sprint 4` initial gate) · `v1.0` (GA sign-off)
- **Crate(s) / Surface:** `apps/desktop`, `.github/workflows/ci-nightly.yml`
- **Dependencies:** `ST-22`, `ST-23`, `ST-24`
- **Traceability:** [[0003-chart-base-and-viewport-windowing|ADR-0003]], [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]] · `SV-12`, `SV-13`, `KC-01`, `KC-02`
- **User Story:** As a Windows 10/11 and macOS trader, I want empirically verified `60 fps` WebGL2 sync and `< 300 MB` idle memory on both native OS WebViews so Windows is never a second-class experience.
- **Binary Acceptance Criteria:**
  1. `ci-nightly.yml` runs the `S01` WebGL2 sync/pan/zoom harness and `S04` Canvas2D stress harness on both `macos-14` (`WKWebView`) and `windows-latest` (`WebView2` ANGLE D3D11).
  2. Both OSes pass `>= 55 fps` (`60 fps` / `P99 <= 16.6 ms` target), `<= 0.5 CSS px` drift (`0.000 px` target), `0` stalls `> 33 ms`, and `< 2×` frame-time variance between macOS and Windows (`KC-01`, `KC-02`, **`UNVERIFIED`** until Sprint 4 CI).
  3. Default `1920x1080` single-chart workspace confirms active chart/data canvas area **`>= 90.0%`** (`>= 1,866,240` of `2,073,600` pixels, `SV-05`, **`UNVERIFIED`** until packaged E2E).

---

### Epic `E07` — Canvas2D DOM Ladder, Time & Sales & Docked Shell (`ui-sdk` + MIT `dockview`)

#### `ST-26` — Tauri v2 + React 19 + Exact-Pinned `ui-sdk` (`"0.1.0-beta.17"`) + MIT `dockview` `8.9.1` Shell
- **Milestone / Sprint:** `v0.1` · `Sprint 1` (Shell Skeleton) & `Sprint 3` (Full Wiring)
- **Crate(s) / Surface:** `apps/desktop`, `packages/ui-chrome`
- **Dependencies:** `ST-01`, `ST-02`, `ST-07`
- **Traceability:** [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]] · `SV-03`, `SV-05`, `SV-13`, `AGENTS.md`
- **User Story:** As a trader customizing multi-pane workspaces, I want a leak-free MIT Dockview workbench styled with React 19, Tailwind CSS v4, and `ui-sdk` primitives wrapped behind clean internal adapters so layouts save/restore cleanly with zero proprietary UI dependencies.
- **Binary Acceptance Criteria:**
  1. Installs `@ui-sdk/react` and `@ui-sdk/core` via `pnpm` pinned strictly to `"0.1.0-beta.17"` (no `^`/`~`) **without bypassing or weakening `pnpm` release-age policy** (escalate to Abel if blocked per `AGENTS.md`), reads `node_modules/@ui-sdk/react/docs/llms.txt` + `core.md`/`rendering.md`, and wraps all `ui-sdk` primitives behind `packages/ui-chrome/primitives/` (preserving `shadcn/ui + Radix` fallback seam).
  2. Wraps MIT `dockview` / `dockview-react` `8.9.1` behind `WorkspaceHost` with **`0` occurrences of `dockview-enterprise`** in `package.json`, `pnpm-lock.yaml`, and `node_modules/.pnpm`.
  3. 9-panel Dockview mount `<= 250 ms` (`S03`: `68.40 ms`), `fromJSON` restore `<= 25 ms` with `100%` fidelity (`S03`: `2.40 ms` p50), and 20-cycle panel create/destroy leak audit passes `< +2.0 MB` heap delta, **`0` leaked DOM nodes**, and **`0` leaked listeners** (`S03`: `+0.109 MB`, `0`/`0`; integrated `ui-sdk` app **`UNVERIFIED`** until Sprint 1/3 CI).
  4. `vitest` + Testing Library + `axe-core` passes with `0` critical/serious accessibility violations (**`UNVERIFIED`** until Sprint 1 clean install).

#### `ST-27` — Zero-Allocation `60 Hz` Canvas2D `DOM Ladder` & Time-and-Sales Renderer
- **Milestone / Sprint:** `v0.1` · `Sprint 3` (Weeks 5–6)
- **Crate(s) / Surface:** `packages/dom-canvas`
- **Dependencies:** `ST-07`, `ST-26`
- **Traceability:** [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]], [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]] · `SV-08`, `SV-11`, `SV-14`, `SV-19`, `KC-02`
- **User Story:** As a DOM scalper, I want a 21-column `DOM Ladder` and Time & Sales tape rendered directly on Canvas2D from zero-copy binary IPC buffers so `5,000` book updates/sec run at a locked `60 fps` with zero layout thrash and zero React commits.
- **Binary Acceptance Criteria:**
  1. Consumes `16 ms`-coalesced `LIVE_L2_BOOK_BATCH` (`0x0102`) and `40 B` `LIVE_TRADE_BATCH` (`0x0101`) directly into pre-allocated typed ring buffers without float price conversion outside pixel-row projection (`SV-08`).
  2. Streaming `5,000` L2/MBO updates/sec at `60 Hz` into the 21-column Canvas2D `DOM Ladder` verifies **`0` hot-path heap allocations/tick**, **`0.00 ms` Layout**, **`0.00 ms` RecalcStyle**, **`0` React Profiler commits**, **`0` stalls `> 20 ms`**, and locked **`60 fps`** (`SV-14`; `S04` macOS Brave baseline verified; integrated `WKWebView`/`WebView2` **`UNVERIFIED`** until Sprint 3–4 CI).
  3. Deterministic `O(1)` pixel-to-`PriceTicks(i64)` hit-testing supports click-to-stage, center-on-last, working-order display, and non-dismissible `[Est / Max]` DOM PIQ badge (`SV-11` `v0.1` gate), paired with a keyboard-focusable ARIA summary region exposing symbol, best bid, best ask, spread, and working-order count.
  4. All tabular numerals (`JetBrains Mono`) meet **`>= 4.5:1` WCAG AA contrast** across dark, light, and `Okabe-Ito` themes (`SV-19`).

#### `ST-28` — 3-Tier Settings Compression, 5-Level Deterministic TOML Cascade, `Cmd/Ctrl+K` Palette & `keymap.toml`
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (TOML cascade) & `Sprint 3` (UI Chrome)
- **Crate(s) / Surface:** `packages/ui-chrome`, `allegedly-core`, `schemas/config/`
- **Dependencies:** `ST-05`, `ST-26`
- **Traceability:** [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]] · `SV-02`, `SV-03`, `SV-04`, `SV-06`, `SV-07`, `SV-18`, `SV-19`, `Principles` P2–P4
- **User Story:** As a power user managing configurations in Git, I want every setting reachable in `<= 3` keystrokes without blocking modals, organized by a 5-level delta TOML cascade and 100% remappable `keymap.toml` so changes are fast, reversible, and cleanly diffable.
- **Binary Acceptance Criteria:**
  1. **Command Palette (`SV-02`):** `Cmd/Ctrl+K` (`@symbol`, `/study`, `>setting`, `#template`) reaches and mutates `100%` of registered settings/actions within **`<= 3` keystrokes** inline without spawning a modal.
  2. **Zero Blocking Config Modals (`SV-03`) & Tier-1 Micro-Toolbar (`SV-04`):** Editing any `Study`, `Drawing`, `DOM Ladder`, chart, or theme property uses either the floating Tier-1 micro-toolbar (**`<= 5` controls**, **`<= 36 px` height**) or the non-blocking `320 px` 4-tab Right Property Inspector (`Parameters | Style | Timeframes & Session | Alerts` + `Modified Only` filter), with **`0` modal backdrop overlays** blocking canvas pan/zoom or DOM clicks.
  3. **Deterministic TOML Round-Trip (`SV-06`) & 5-Level Cascade (`SV-07`):** Sorted-key `BTreeMap` serialization across `Global Defaults → .atworkspace.toml → template.toml → Chart Pane → .atanalysis.toml` guarantees `SHA-256(export_1) == SHA-256(export_2)`, `<= 3` `git diff` lines per 1-param edit, and 1-click `Reset to Inherited` clearing the child delta to `{}` (e.g., `imbalance_ratio_bps = 40000` reverting to parent `30000 bps`).
  4. **`keymap.toml` (`SV-18`) & `theme.toml` (`SV-19`):** All `40+` shortcuts remap cleanly via `keymap.toml` executing in **`< 1 ms`** with exact line + binding conflict highlighting in UI and CLI; semantic `theme.toml` tokens pass `>= 4.5:1` WCAG AA contrast and `Okabe-Ito` `ΔE2000 >= 20` colorblind simulation.

#### `ST-29` — Price-Axis Zoom Safety Guard & Strict UI/OMS Undo Stack Isolation
- **Milestone / Sprint:** `v0.1` · `Sprint 3` (Weeks 5–6)
- **Crate(s) / Surface:** `packages/chart-engine`, `packages/ui-chrome`, `allegedly-oms`
- **Dependencies:** `ST-22`, `ST-28`, `ST-35`
- **Traceability:** [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]], [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]] · `SV-15`, `SV-16`, `Principles` P8
- **User Story:** As a live-market trader, I want unmodified dragging on the price scale to always zoom without ever staging an order, and I want `Cmd/Ctrl+Z` to undo drawings and study edits without ever touching my working orders.
- **Binary Acceptance Criteria:**
  1. Automated E2E test executing **`1,000` rapid unmodified `Click+Drag` vertical scale gestures** across the full price axis while connected to `LocalPaperAdapter` emits **`0` staged or submitted OMS orders** unless `Arm Axis Trading` + required modifier (`Shift`/`Ctrl`/`Alt`) or `+` quick pill is explicitly invoked (`SV-15`).
  2. Placing `3` `Drawing`s, submitting `1` paper Limit `Order`, modifying `1` `Study` parameter, and pressing `Cmd/Ctrl+Z` twice reverts the `Study` parameter and last `Drawing` while the working Limit `Order` remains **`100%` untouched** in `allegedly-oms` (`SV-16`).

#### `ST-30` — Native Tauri `WebviewWindow` Drag-to-Detach Pop-Outs & Mixed-DPI Sync
- **Milestone / Sprint:** `v0.2`
- **Crate(s) / Surface:** `apps/desktop/src-tauri/src/windows.rs`, `packages/ui-chrome/src/popout/`, `allegedly-ipc`
- **Dependencies:** `ST-08`, `ST-26`
- **Traceability:** [[0002-desktop-shell-and-binary-ipc|ADR-0002]], [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]] · `SV-03`, `SV-13`, `S03`
- **User Story:** As a multi-monitor trader, I want to drag any Dockview chart or `DOM Ladder` tab onto a second monitor as a native Tauri `WebviewWindow` with conflict-free `state_rev` synchronization and clean resource teardown.
- **Binary Acceptance Criteria:**
  1. Detaching a panel spawns a native Tauri `WebviewWindow` with explicit `capabilities/` scope (zero reliance on unverified `window.open()` IPC inheritance).
  2. Linked symbol groups, theme updates, and selection sync through `allegedly-ipc`'s `state_rev: u64` hub (`p95 <= 8.0 ms`); transient `60 Hz` crosshairs optionally accelerate via same-origin `BroadcastChannel("allegedly-cursor-v1")`.
  3. Closing a detached window calls `transport.unsubscribeStream()`, disposes WebGL2/Canvas2D resources, and leaves `0` orphaned WebViews across macOS and Windows mixed-DPI displays (**`UNVERIFIED`** until `v0.2` E2E).

---

### Epic `E08` — Deterministic Study Runtime (Luau `mlua` + Wasmtime) & `<= 64 MiB` Global Pool

#### `ST-31` — Tier-1 Native `O(1)` Built-In `Studies`, Pure-Software `libm`, MTF Non-Repainting & `TA-Lib` CI Oracle
- **Milestone / Sprint:** `v0.1` · `Sprint 3` (Weeks 5–6)
- **Crate(s) / Surface:** `allegedly-studies`
- **Dependencies:** `ST-05`, `ST-18`
- **Traceability:** [[0005-study-runtime-and-scripting-language|ADR-0005]] · `SV-06`, `SV-09`, `SV-12`, `KC-06`, [[Plugin-ABI]] §3.2 & §5
- **User Story:** As a trader using built-in technical and order-flow `Studies`, I want zero-overhead native Rust `Studies` with deterministic math, non-repainting multi-timeframe alignment, and automated `TA-Lib` CI numerical verification so chart plots match historical replay bit-for-bit.
- **Binary Acceptance Criteria:**
  1. Ships Tier-1 Native `O(1)` built-in `Studies` (`EMA`, `SMA`, `RSI`, `ATR`, `MACD`, `Bollinger Bands`, `Session VWAP ±σ`, `CVD`) consuming fixed-point `i64` inputs over the flat SoA `ByteView` model and exporting canonical `plot_values_e9: i64` (`NaN → i64::MIN`, `±Inf` clamped, finite values via IEEE-754 `round_ties_even()`).
  2. Links pure-software deterministic `libm` (`MIT OR Apache-2.0`) rather than OS `libSystem`/`ucrtbase.dll` so transcendentals match across macOS `arm64` and Windows `x86_64`.
  3. Higher-timeframe (`HTF`) series expose strictly closed bars (`bar.ts_close_ns <= base_bar.ts_close_ns`, `lookahead = off`), and live intrabar previews use `commit_snapshot()`/`rollback()` with **`0` `u64::to_bits` mismatches** across `15,000` MTF bars + `500` noisy intrabar rollbacks (`S07` baseline).
  4. Dev-only CI job (`--features dev-talib-oracle`, strictly excluded from release binaries) verifies `<= 1e-9` absolute parity against `TA-Lib v0.8.3` (`BSD-3-Clause`) (**`UNVERIFIED`** until Sprint 3 CI).

#### `ST-32` — Tier-3 Embedded Luau (`mlua`) Flat SoA Sandbox, `<= 64 MiB` Global Study Pool & `12/12` Hostile Escape Traps
- **Milestone / Sprint:** `v0.1` · `Sprint 3` (Weeks 5–6)
- **Crate(s) / Surface:** `allegedly-studies`, `plugins/examples/`
- **Dependencies:** `ST-31`
- **Traceability:** [[0005-study-runtime-and-scripting-language|ADR-0005]] · `SV-12`, `SV-13`, `KC-06`, [[Plugin-ABI]] §1
- **User Story:** As a trader writing custom zero-toolchain `Study` scripts, I want an embedded Luau runtime isolated by strict memory, instruction, and capability caps under a terminal-wide `<= 64 MiB` global pool so a buggy or hostile script can never hang or OOM my terminal.
- **Binary Acceptance Criteria:**
  1. Integrates `mlua v0.12.3` + `luau0-src` (`MIT`) inside `allegedly-studies` over the flat SoA `ByteView` ABI (`lua.sandbox(true)`, ambient `io`/`os`/`package`/`dofile`/`loadfile`/`require` nilled, `10k`-op interrupt hook/tick, `16–32 MiB` default per-instance `set_memory_limit`).
  2. Enforces the **global terminal-wide `<= 64 MiB` `Study` memory pool** across all open charts, panes, and windows: LRU-evicts hidden/background-tab `Study` runtime state (retaining canonical TOML params for instant re-hydration) and fails cleanly with `StudyPoolExhausted` if visible foreground studies exceed `64 MiB` (`SV-13`, **`UNVERIFIED`** pool coordinator until Sprint 3).
  3. Passes all hostile escape vectors (infinite loop, memory bomb `< 50 ms` ceiling / `< 5 ms` target at `32 MiB` cap, ambient FS/net/env escape, infinite stack recursion) and proves sibling studies match Native Rust within `<= 1e-9` immediately after every trap; `10`-study live tick mix meets **`p99 <= 1,000 µs`** with `0` spikes `> 500 µs` (`S07` macOS baseline: `2.75 µs` p99 / `27.50 µs` max).
  4. Compiles cleanly on both macOS Clang and Windows MSVC (`x86_64-pc-windows-msvc` `luau0-src` C++17 build **`UNVERIFIED`** until Sprint 3 CI); `SV-09` cross-OS Luau parity explicitly scoped to deterministic non-transcendental ops per [[Plugin-ABI]] §5.1.

#### `ST-33` — Tier-2 Wasmtime `v51.0.0` Sandbox, `.cwasm` Disk Cache & Optional WIT Evaluation Spike
- **Milestone / Sprint:** `v0.2`
- **Crate(s) / Surface:** `allegedly-studies`, `plugins/wit/`, `plugins/examples/`
- **Dependencies:** `ST-31`, `ST-32`
- **Traceability:** [[0005-study-runtime-and-scripting-language|ADR-0005]] · `SV-09`, `SV-12`, `KC-06`, [[Plugin-ABI]] §1, §3.2, §5, §7
- **User Story:** As a quantitative developer distributing high-speed community `Studies`, I want near-native Wasmtime WASM plugins running over the flat SoA linear-memory ABI with pre-compiled `.cwasm` caching and deterministic Cranelift flags so `100k`-bar batch runs finish in milliseconds.
- **Binary Acceptance Criteria:**
  1. Integrates `wasmtime v51.0.0` (`Apache-2.0 WITH LLVM-exception`, `default-features = false`, `cranelift`, `runtime`, `std`, **zero WASI**) inside `allegedly-studies` with fuel metering, `StoreLimits` sharing the `<= 64 MiB` global pool, `cranelift_nan_canonicalization(true)`, disabled FMA contraction, and flat SoA linear-memory exports (`100k` batch `<= 50 ms` / `< 10%` overhead vs Native; `S07` baseline: `1.679 ms`, `+3.32%`).
  2. Pre-compiled `.cwasm` cache (`plugins/cache/cwasm/<sha256>-<ver>-<triple>.cwasm`) targets warm `Module::deserialize_file < 1 ms` (**`UNVERIFIED`** until `v0.2` bench; cold compile `31.651 ms` in `S07`).
  3. Passes all `4/4` Wasmtime hostile traps (infinite loop, `StoreLimits` OOM, zero-WASI link rejection, stack overflow) and `0.000e0` parity with Native Rust & Luau.
  4. Executes dedicated `wasmtime::component` (WIT) evaluation spike; retains flat SoA linear-memory `ByteView` as primary hot-path ABI unless WIT gzip delta `<= +1.0 MiB` and 100k-bar overhead `< 10%` (**`UNVERIFIED`** until `v0.2`).

#### `ST-34` — Signed `plugin.toml` Verification, ABI SemVer Negotiation & Clean-Room Pine-Inspired DSL Front-End
- **Milestone / Sprint:** `v0.5`
- **Crate(s) / Surface:** `allegedly-studies`, `plugins/`
- **Dependencies:** `ST-32`, `ST-33`
- **Traceability:** [[0005-study-runtime-and-scripting-language|ADR-0005]] · `SV-06`, `SV-09`, [[Plugin-ABI]] §2 & §4
- **User Story:** As a trader installing community `Studies` or migrating series-style scripts, I want fail-closed `plugin.toml` capability/signature checks and a clean-room series DSL compiling to Luau or WASM so third-party extensions are trustworthy and ergonomic without copyleft or trademark traps.
- **Binary Acceptance Criteria:**
  1. Loader validates `plugin.toml` (`schema_version = 1`, `abi_version` SemVer negotiation fail-closed on major mismatch, `artifact_sha256`, Ed25519 signature or explicit `"Local Unsigned"` badge) and hard-rejects any `Study` declaring `capabilities.execution.allowed = true` or non-empty `keychain_scopes`.
  2. Clean-room series DSL (zero TradingView® / Pine Script® trademarks; zero `AGPL`/`GPL`/non-FOSS parsers) compiles deterministically to Tier-3 Luau (instant editor loop) or Tier-2 WASM (near-native batch speed).

---

### Epic `E09` — Paper OMS, SQLite WAL Crash Recovery, Kill-Switch & Risk-Reduction Bypass

#### `ST-35` — Canonical 12-State `OrderState` Machine, Fixed-Point `LocalPaperAdapter`, Bracket OCO & `DO-NOT-BUILD` Denylist
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4)
- **Crate(s) / Surface:** `allegedly-oms`
- **Dependencies:** `ST-05`
- **Traceability:** [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]] · `SV-08`, `SV-15`, `SV-16`, `KC-03`, [[Data-Model]] §3.3
- **User Story:** As a trader practicing execution and testing strategies, I want an exact fixed-point Paper OMS enforcing the canonical 12-state order lifecycle, idempotent order submission, atomic `Bracket Order` OCO legs, and hard prop-firm compliance guardrails.
- **Binary Acceptance Criteria:**
  1. Implements zero-float `i64`/`i128` accounting (`MoneyMicros`, `PriceTicks`, `LotQty`, `cum_filled_qty + leaves_qty == order_qty`, scale-in / partial-close / reverse-through-zero exact P&L) and all **12 canonical `OrderState` variants** (`IntentLogged`, `PendingNew`, `Accepted`, `PartiallyFilled`, `Filled`, `PendingCancel`, `Canceled`, `PendingReplace`, `Replaced`, `Rejected`, `Expired`, `UnknownPendingReconcile`).
  2. Generates monotonic UUIDv7 `client_order_id` idempotency keys, deduplicates fills on `exec_id`, supports both `BrokerNative` and `ClientManagedWarning` `Bracket Order` OCO partial fills (`protected_qty == entry.cum_filled_qty`, `final_pos == 0` on OCO close), and enforces CME Rule 534 `product_group` anti-hedging plus pre-trade fat-finger / daily-loss risk gates.
  3. Compile-time Cargo feature `allow-live-trading` is **OFF by default**, boot invariant `LIVE_ARMED == false` is asserted in CI, and `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` (`9/9`: `apex`, `apex_trader_funding`, `take_profit_trader`, `tpt`, `bulenox`, `elite_trader_funding`, `etf`, `rithmic`, `cqg`) fails closed at `OmsEngine::new` and plugin load (`KC-03`, `S06-T7`).

#### `ST-36` — SQLite WAL Crash Recovery, Batched macOS `PRAGMA fullfsync = ON` Kill-Switch, Risk-Reduction Bypass & Keychain Hygiene
- **Milestone / Sprint:** `v0.1` · `Sprint 2` (Weeks 3–4)
- **Crate(s) / Surface:** `allegedly-oms`
- **Dependencies:** `ST-35`
- **Traceability:** [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]], [[0006-tiered-storage-and-replay|ADR-0006]] · `SV-15`, `SV-16`, `Principles` P1 & P8
- **User Story:** As a trader facing a sudden crash, feed drop, or market shock, I want write-ahead order durability, a sub-10 ms Panic Kill-Switch, zero secret leaks, and an unbreakable Risk-Reduction Bypass Rule so I am never left with orphaned orders or trapped inside live exposure.
- **Binary Acceptance Criteria:**
  1. Physically separates `paper_journal.sqlite` (`synchronous = FULL`) from `live_journal.sqlite` (mandating `PRAGMA fullfsync = ON` on macOS for `ExecutionEnv::BrokerLive` with **single-transaction batched Kill-Switch WAL commits** — 1 `F_FULLFSYNC` per 50-order cancel wave; macOS APFS bench `<= 15 ms` target / `<= 25 ms` CI ceiling, **`UNVERIFIED`** until Sprint 2 APFS run).
  2. Crash-recovery test (`500` orders / `1,965` WAL events, `20` offline fills, `5` `UnknownPendingReconcile` intents) recovers `100%` of state with `0` orphans and `0` position mismatches; `axum` wire-mock fault injection (`54` HTTP `429`/`503`/`500` faults + malformed `NaN` payloads) produces **`0` duplicate orders**; forced WS drop enters `RECONCILING` and reconciles in `< 3 s` (`S06` baseline: `32.59 ms`).
  3. 4-step Panic Kill-Switch halts local order intake in **`< 10 ms`** (`S06`: `41 ns` p50) and flattens `50` working orders + `5` positions with `0` stray orders (`< 500 ms` local/mock SLA).
  4. **Risk-Reduction Bypass Rule:** Whenever `BookState != Live` OR `RECONCILING == true`, `allegedly-oms` authoritatively rejects all risk-increasing entries while **ALWAYS permitting** `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch` (`flatten_all`), `oms.reconcile_now`, and verified `reduce_only: true` closing orders (`order_qty <= abs(position.net_qty)`), driving the non-dismissible red banner *"FEED STALE — RISK-REDUCING EXITS ONLY"*.
  5. `ApiCredentials` (`keyring-rs v4.2.0` + `zeroize`) never derives `Serialize`, prints `[REDACTED]` on `Debug`/`Display`, and passes canary leak tests (`0` raw secret bytes in SQLite `.db`/`.db-wal`, logs, TOML, or IPC).

#### `ST-37` — Opt-In Paper/Sandbox Retail `BrokerAdapter`s (`AlpacaPaperAdapter`, `tastytrade` Cert, `barter-rs` Crypto)
- **Milestone / Sprint:** `v0.2`
- **Crate(s) / Surface:** `allegedly-oms`
- **Dependencies:** `ST-35`, `ST-36`
- **Traceability:** [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]] · `SV-01`, `SV-16`, [[Plugin-ABI]] §3.3
- **User Story:** As a trader validating strategies against realistic broker sandboxes, I want opt-in paper adapters for Alpaca, tastytrade Certification Sandbox, and `barter-rs` crypto venues backed by OS Keychain credentials and strict paper-only host allowlists.
- **Binary Acceptance Criteria:**
  1. Implements `BrokerAdapter` (with `&InstrumentSpec` on `replace_order` for exact non-penny tick formatting) for `AlpacaPaperAdapter` (`paper-api.alpaca.markets`), `tastytrade` Cert Sandbox (OAuth2 `dry-run`), and `barter-rs v0.2.1` (`MIT`) crypto paper.
  2. Enforces disjoint compile-time/runtime host allowlists per `ExecutionEnv` so paper credentials can never reach live endpoints; `allow-live-trading` remains OFF by default.
  3. Manual opt-in `workflow_dispatch` live-network paper smoke (zero secrets in repo or PR CI) verifies `0` duplicate orders, `< 3 s` WS-drop reconcile, and OCO bracket closure (**`UNVERIFIED`** until `v0.2` human-triggered smoke).

#### `ST-38` — Opt-In Live Retail Execution (`Alpaca`, `tastytrade`, Clean-Room IBKR Client Portal) & CFTC Rule 4.41 Compliance
- **Milestone / Sprint:** `v0.5` (Activation) · `v1.0` (GA Sign-Off)
- **Crate(s) / Surface:** `allegedly-oms`, `packages/ui-chrome`
- **Dependencies:** `ST-36`, `ST-37`, macOS APFS `fullfsync` pass (`UV-02`)
- **Traceability:** [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]] · `SV-15`, `SV-16`, `KC-04`, `RK-05`
- **User Story:** As a retail trader choosing to route live orders, I want opt-in live execution for Alpaca, tastytrade, and clean-room IBKR Client Portal Web API gated behind explicit multi-step arming and mandatory live durability without any `GPL-3.0` TWS linking.
- **Binary Acceptance Criteria:**
  1. Clean-room IBKR connectivity uses IBKR Client Portal Web API / `wboayue/rust-ibapi` (`MIT`) with **`0` links to official `GPL-3.0` IBKR TWS API `v10.49+`** (`cargo-deny` enforced).
  2. Live routing requires explicit multi-step user arming (`LIVE_ARMED` defaults `false` on every boot), displays a persistent high-contrast live-account warning strip, enforces `PRAGMA fullfsync = ON` on macOS APFS (`live_journal.sqlite`), and surfaces `ProtectiveLegMode::ClientManagedWarning` whenever a broker lacks native OCO brackets.
  3. CFTC Rule 4.41 hypothetical/simulated performance disclaimers display on all paper and replay/backtest views (`[ATTORNEY REVIEW REQUIRED]` final copy check before `v1.0` GA, **`UNVERIFIED`**).

---

### Epic `E10` — Local Observability, Active 5-Tier Provenance Ledger, Packaging, Signing & Opt-In Updates

#### `ST-39` — Local Zero-Telemetry Diagnostics Ring, Active 5-Tier Provenance Ledger & Redacted Diagnostic `.zip` Exporter
- **Milestone / Sprint:** `v0.1` · `Sprint 4` (Weeks 7–8)
- **Crate(s) / Surface:** `allegedly-core`, `allegedly-app`, `packages/ui-chrome/src/diagnostics/`
- **Dependencies:** `ST-10`, `ST-28`, `ST-36`
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-01`, `SV-02`, `SV-10`, `SV-11`, [[Error-Observability]] §2–§3
- **User Story:** As a trader diagnosing feed latency, book health, or provenance without cloud telemetry, I want a local-only Live Operational Diagnostics panel with an Active 5-Tier Provenance Ledger and 1-click Redacted Diagnostic `.zip` export.
- **Binary Acceptance Criteria:**
  1. Lock-free `rtrb` diagnostics ring (`8,192` structured `tracing` events + rolling `ws_rtt_us`, `parse_latency_us`, `ipc_batch_ms`, `frame_time_ms`, `vrvp_us`, `rss_mb` snapshots, `0` allocs/tick) feeds a non-blocking Dockview Diagnostics panel reachable via `Cmd/Ctrl+K >diagnostics` (`SV-02`, `4 Hz` poll with `0` chart frame-rate regression).
  2. Async rotating JSONL sink writes to OS local app data capped strictly at `5 × 10 MiB = <= 50 MiB` total disk; zero remote telemetry SDKs or beacons (`SV-01`).
  3. **Active 5-Tier Provenance Ledger** lists every open chart, `Footprint Bar`, `Volume Profile`, and `DOM Ladder` with its live machine-verified `ProvenanceTier` badge (`EXACT: L3-MBO`, `EXACT: TICK-AGGR`, `ESTIMATED: L1-QUOTE`, `ESTIMATED: TICK-RULE`, `SYNTHETIC: 1m-INTRABAR`), coverage/timeliness modifiers, and `HEURISTIC` disclosures (`SV-10`, `SV-11`).
  4. One-click `export_diagnostic_bundle` writes `allegedly-diag-YYYYMMDD-HHMMSS.zip` (`system_summary.json`, `metrics_snapshot.json`, `logs_redacted.jsonl`, `workspace_schema_sanitized.toml`, `redaction_manifest.json`) passed through the 3-layer `RedactingLayer`; canary secret test proves **`0` leaked secret bytes** and `<HOME>` path scrubbing.

#### `ST-40` — OS Process-Tree RSS Accounting & `< 40 MB` macOS/Windows Packaged CI Gate
- **Milestone / Sprint:** `v0.1` · `Sprint 4` (Weeks 7–8)
- **Crate(s) / Surface:** `allegedly-app`, `.github/workflows/ci-bundle-mac-win.yml`, `.github/workflows/ci-nightly.yml`
- **Dependencies:** `ST-03`, `ST-25`, `ST-39`
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-13`, `SV-19`, `SV-20`, [[Release-Signing-Update]] §4
- **User Story:** As a user downloading Allegedly on macOS or Windows, I want truthful OS process-tree RAM reporting and stripped packaged installers strictly under `40 MB` so the terminal remains lightweight and fast to install.
- **Binary Acceptance Criteria:**
  1. Implements OS-specific full process-tree RSS attribution (`proc_pidinfo` + `launchd`-parented WebKit XPC helper grouping on macOS; Job Object / parent-PID `msedgewebview2.exe` aggregation on Windows) surfaced in Diagnostics and asserted **`< 300 MB` idle RAM** (1 Chart + 1 DOM) in `ci-nightly.yml` (`SV-13`, **`UNVERIFIED`** until packaged CI).
  2. `ci-bundle-mac-win.yml` compiles stripped LTO release builds (`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`) for macOS (`aarch64-apple-darwin` + `x86_64-apple-darwin`) and Windows (`x86_64-pc-windows-msvc` with WebView2 `embedBootstrapper`, banning `offlineInstaller`/`fixedRuntime`), failing CI if any `.dmg`, `.msi`, or NSIS `.exe` is **`>= 40.0 MB`** (`v0.1` core baseline excludes deferred `v0.2` Wasmtime: `S02 2.68 MB` + `S07 Luau +0.47 MiB` + `S08 storage +2.91 MiB` ≈ `~6.2 MB`, vs `~8.0 MB` after adding `v0.2` Wasmtime `+1.74 MiB`; `SV-20`, **`UNVERIFIED`** until integrated CI).
  3. Ships `v0.1.0` explicitly as an **unsigned/ad-hoc alpha tag** accompanied by `SHA256SUMS.txt` and audited `THIRD_PARTY_NOTICES.md` embedded in both the app About dialog (passing WCAG AA contrast `SV-19`) and release archive (`$0` code signing / Minisign Ed25519 `requireSignedVersion` / opt-in updater deferred to `v0.2` `ST-41`; CycloneDX/SPDX SBOMs, Sigstore Cosign OIDC, reproducible builds, and `RK-04` trademark clearance deferred to `v1.0` `ST-42`).

#### `ST-41` — `$0` Code Signing, Package-Manager Channels & Opt-In Cryptographic Updater (`tauri-plugin-updater`)
- **Milestone / Sprint:** `v0.2`
- **Crate(s) / Surface:** `allegedly-app`, `.github/workflows/release.yml`
- **Dependencies:** `ST-40`
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · `SV-01`, `SV-02`, `SV-20`, [[Release-Signing-Update]] §2–§3
- **User Story:** As a security-minded trader, I want signed releases via Homebrew, Winget, and Scoop plus an opt-in Ed25519 updater that refuses downgrades and never restarts while I have open orders.
- **Binary Acceptance Criteria:**
  1. Integrates `tauri-plugin-updater v2.14.1` verifying Minisign Ed25519 `.sig` payloads against `latest.json` on GitHub Releases with mandatory **`requireSignedVersion`** anti-downgrade protection and protected `release` GitHub Environment key custody.
  2. Preserves **`updates.checkOnStartup = false`** default (`SV-01` zero-packet offline boot) with manual `Cmd/Ctrl+K >Check for Updates` trigger (`SV-02`), disables *"Restart to Apply"* whenever `allegedly-oms` holds working orders/positions or `LIVE_ARMED == true`, and disables in-app self-replacement on package-managed builds (Homebrew Cask `--no-quarantine`, Winget, Scoop).
  3. Applies to **SignPath Foundation** (`$0` OSI Open-Source OV HSM cert) for Windows `.msi`/`.exe` signing and publishes `SHA256SUMS.txt` alongside Minisign `.sig` payloads (Sigstore Cosign OIDC, CycloneDX/SPDX SBOMs, and reproducible builds staged to `v1.0` `ST-42`; **`UNVERIFIED`** until `v0.2` release).

#### `ST-42` — Reproducible GA Builds, CycloneDX/SPDX SBOMs, Full A11y Audit & Trademark Clearance Gate
- **Milestone / Sprint:** `v1.0` (GA Qualification)
- **Crate(s) / Surface:** `allegedly-app`, `.github/workflows/release.yml`, `packages/ui-chrome`
- **Dependencies:** `ST-25`, `ST-38`, `ST-41`
- **Traceability:** [[0001-license-brand-and-platform-scope|ADR-0001]] · `SV-01`, `SV-19`, `SV-20`, `RK-04`, [[Release-Signing-Update]] §5
- **User Story:** As a trader adopting Allegedly `v1.0` for daily production use, I want reproducible builds with SBOMs, verified WCAG AA + colorblind accessibility across every visual surface, and cleared trademark hygiene before public GA launch.
- **Binary Acceptance Criteria:**
  1. Every tagged `v1.0` release attaches `allegedly-vX.Y.Z-sbom.cdx.json` (CycloneDX 1.5), `allegedly-vX.Y.Z-sbom.spdx.json` (SPDX 2.3), `SHA256SUMS.txt`, SLSA build provenance (`actions/attest-build-provenance`), and Sigstore Cosign OIDC keyless signatures (**`UNVERIFIED`** until `v1.0` release workflow).
  2. Automated luminance contrast (`>= 4.5:1` WCAG AA) and Deuteranopia/Protanopia/Tritanopia simulation (`ΔE2000 >= 20` on `Okabe-Ito`) pass across `100%` of `Footprint Bar` cells, `DOM Ladder` rows, and Heatmap LUTs (`SV-19`, **`UNVERIFIED`** full-surface GA audit).
  3. Formal IP counsel trademark clearance for **Allegedly** (`allegedly.market`, `allegedlyapp.com`, `kyscott18/allegedly`, `RK-04`, `[ATTORNEY REVIEW REQUIRED]`) is signed off prior to public GA launch (**`UNVERIFIED`** human legal gate).

---

## 3. Complete 20-Row `SV-01`–`SV-20` Story Coverage Table

Every Sovereignty Verification rule from [[Principles]] §3 and [[Testing-Strategy]] §4.1 maps below to at least one `v0.1` or explicitly staged vertical-slice story with verbatim pass/fail thresholds:

| Check ID | Charter Sovereignty Rule (`Principles.md` §3) | Primary Epic(s) | Covering Stories (`v0.1` Mandatory vs. Staged) | Measurable Binary Acceptance Gate | Current Status |
|---|---|---|---|---|---|
| **`SV-01`** | **Zero-Network Offline Boot** | `E01`, `E10` | **`v0.1`:** `ST-03`, `ST-39` · **Staged:** `ST-41` (`v0.2`), `ST-42` (`v1.0`), `ST-04` (`Post-v1.0`) | `< 2,000 ms` cold start, **`0` outbound DNS/TCP/UDP packets** (`updates.checkOnStartup = false`), `0` error modals in isolated network namespace | `UNVERIFIED` |
| **`SV-02`** | **Command Palette Keystroke Bound** | `E01`, `E07`, `E10` | **`v0.1`:** `ST-03`, `ST-28`, `ST-39` · **Staged:** `ST-41` (`v0.2`) | `100%` of settings/actions reachable via `Cmd/Ctrl+K` within **`<= 3` keystrokes** and mutated inline without spawning a modal | `UNVERIFIED` |
| **`SV-03`** | **Zero Blocking Configuration Modals** | `E06`, `E07` | **`v0.1`:** `ST-24`, `ST-26`, `ST-28` · **Staged:** `ST-30` (`v0.2`) | **`0` modal backdrop overlays** block canvas pan/zoom or `DOM Ladder` clicks during any property edit | `UNVERIFIED` |
| **`SV-04`** | **Tier-1 Micro-Toolbar Constraint** | `E07` | **`v0.1`:** `ST-28` | Every contextual floating micro-toolbar has **`<= 5` top-level controls** and **`<= 36 px` height** | `UNVERIFIED` |
| **`SV-05`** | **Canvas-to-Chrome Screen Ratio** | `E05`, `E06` *(co-enforced: `E07`)* | **`v0.1`:** `ST-18`, `ST-22`, `ST-23`, `ST-25`, `ST-26` | Active chart/data canvas area **`>= 90.0%`** (`>= 1,866,240` of `2,073,600` px) in default `1920x1080` workspace | `UNVERIFIED` |
| **`SV-06`** | **Deterministic TOML Round-Trip & Git Diff** | `E04`, `E07`, `E08` *(co-enforced: `E02`, `E06`)* | **`v0.1`:** `ST-08`, `ST-13`, `ST-24`, `ST-28`, `ST-31` · **Staged:** `ST-16` (`v0.2`), `ST-34` (`v0.5`) | `SHA-256(export_1) == SHA-256(export_2)` across `.atworkspace.toml`/`.atanalysis.toml`/`template.toml`; `<= 3`-line `git diff` per 1-param edit | `UNVERIFIED` |
| **`SV-07`** | **5-Level Cascade Inheritance & Reset** | `E07` *(co-enforced: `E02`)* | **`v0.1`:** `ST-28` *(supported by `E02` `ST-05` core config primitives)* | Override `imbalance_ratio_bps = 40000` (`Modified Only = 1`), click `Reset to Inherited` → empty delta `{}` and parent `30000 bps` | `UNVERIFIED` |
| **`SV-08`** | **Zero Binary Float Static Analysis Gate** | `E02` *(co-enforced: `E01`, `E03`, `E05`, `E07`, `E09`)* | **`v0.1`:** `ST-05` *(primary)*, `ST-01`, `ST-02` *(CI lint)*, `ST-18`, `ST-27`, `ST-35` · **Staged:** `ST-12` (`v0.2`) | **`0` `f32`/`f64` occurrences** in financial/domain structs, accumulators, or schemas outside GPU projection, isolated ingress, & `allegedly-studies` DSP | `UNVERIFIED` *(verified `0` in `S05`/`S06`/`S08`)* |
| **`SV-09`** | **Bit-Exact Cross-Speed Replay Determinism** | `E03`, `E04`, `E08` | **`v0.1`:** `ST-09`, `ST-10`, `ST-13`, `ST-15`, `ST-31` · **Staged:** `ST-12`/`ST-33` (`v0.2`), `ST-17`/`ST-34` (`v0.5`) | `100%` bit-identical `SHA-256` across `1×`, `50×`, and max-CPU batch replay on macOS (`arm64`+`x86_64`) & Windows (`x86_64`) | `UNVERIFIED` *(macOS `arm64` verified in `S08`)* |
| **`SV-10`** | **Loud Provenance Badge Enforcement** | `E03`, `E05` *(co-enforced: `E10`)* | **`v0.1`:** `ST-09`, `ST-10`, `ST-11`, `ST-39` · **Staged:** `ST-12` (`v0.2`), `ST-21` (`v0.5`) | Non-dismissible 5-tier badges (`EXACT: L3-MBO`..`SYNTHETIC: 1m-INTRABAR`) on mixed segments; Absorption & Unfinished Auction disabled on `SYNTHETIC` | `UNVERIFIED` |
| **`SV-11`** | **Honest L2 Heuristic Guardrail** | `E03`, `E05` *(co-enforced: `E07`, `E10`)* | **`v0.1`:** `ST-11`, `ST-27`, `ST-39` *(honest `L2` non-MBO labeling + `[Est / Max]` DOM PIQ badge + Provenance Ledger)* · **Staged:** `ST-21` (`v0.5` L2 Iceberg & Spoof/Pull heuristic detectors) | `v0.1`: Honest `L2` non-MBO labeling + `[Est / Max]` DOM PIQ badge; `v0.5`: `HEURISTIC: L2-ICEBERG` / `HEURISTIC: L2-PULL` labels & `dwell_ms` / `conflation_guard_ms` sliders | `UNVERIFIED` |
| **`SV-12`** | **60 FPS Pan/Zoom with Active VRVP on 100k Bars** | `E02`, `E06`, `E08` *(co-enforced: `E04`, `E05`)* | **`v0.1`:** `ST-06`, `ST-07`, `ST-14`, `ST-19`, `ST-22`, `ST-23`, `ST-25`, `ST-31`, `ST-32` · **Staged:** `ST-33` (`v0.2`) | `P99 <= 16.6 ms` (`>= 60 fps`) pan/zoom on `100k` bars (`5,000`/`6,000`-bar window) + 16-ary Dyadic VRVP **`< 0.50 ms`** (`p99 < 250 µs` CI gate) | `UNVERIFIED` *(macOS Brave/Rust verified in `S01`/`S08`)* |
| **`SV-13`** | **24-Hour L2 Liquidity Heatmap & Idle RAM Bound** | `E05`, `E06`, `E10` *(co-enforced: `E07`, `E08`)* | **`v0.1`:** Tier A `ST-18`, `ST-22`, `ST-26`, `ST-32` (`FootprintSlabArena < 60 MiB`, `<= 64 MiB` Study pool); Tier B `ST-25`, `ST-40` (`< 300 MB` OS idle RAM) · **Staged:** `ST-30` (`v0.2`), `ST-20` (`v0.5` + `v1.0` GA, `UV-07`: 24h `.atdepth` heatmap) | `v0.1`: Tier A `FootprintSlabArena < 60 MiB` & Tier B full OS process-tree idle RAM **`< 300 MB`**; `v0.5` (+ `v1.0` GA, `UV-07`): 24h (`864k` slices) `.atdepth` heatmap RAM **`< 64 MB`** / Zstd disk **`< 30 MB`** | `UNVERIFIED` |
| **`SV-14`** | **60 Hz DOM Ladder Zero-Allocation Hot Path** | `E07` | **`v0.1`:** `ST-27` | `5,000` L2/MBO updates/s into 21-column Canvas2D `DOM Ladder` with **`0` heap allocs/tick**, `0.00 ms` Layout/Style, `0` React commits, locked `60 fps` | `UNVERIFIED` *(macOS Brave verified in `S04`)* |
| **`SV-15`** | **Price-Axis Zoom vs. Trade Safety Guard** | `E07`, `E09` | **`v0.1`:** `ST-29`, `ST-35`, `ST-36` · **Staged:** `ST-38` (`v0.5`) | `1,000` rapid unmodified `Click+Drag` price-axis gestures emit **`0` orders** unless armed + modifier or `+` quick pill | `UNVERIFIED` |
| **`SV-16`** | **Undo/Redo Stack Execution Isolation** | `E07`, `E09` | **`v0.1`:** `ST-29`, `ST-35`, `ST-36` · **Staged:** `ST-37` (`v0.2`), `ST-38` (`v0.5`) | `Cmd/Ctrl+Z` reverts `Drawing`s and `Study` edits while working `OMS` Limit `Order` remains **`100%` untouched** | `UNVERIFIED` |
| **`SV-17`** | **POC / VAH / VAL Magnet Snap Precision** | `E05`, `E06` | **`v0.1`:** `ST-19`, `ST-20`, `ST-23`, `ST-24` *(Volume Profile + single-session `u128` `TPO Profile` snap)* · **Staged:** `ST-20`, `ST-24` (`v0.5` multi-day `CompositeTpoRow` snap) | Dragging Horizontal Ray or Limit `Order` within `12 px` of Volume Profile or single-session `u128` `TPO Profile` (`v0.1`) / multi-day `CompositeTpoRow` (`v0.5`) POC/VAH/VAL snaps to **exact `i64` tick index** (`0` sub-tick float error) | `UNVERIFIED` |
| **`SV-18`** | **100% Remappable Keyboard Map & Conflict Check** | `E07` *(co-enforced: `E01`)* | **`v0.1`:** `ST-28` *(primary `keymap.toml`)*, `ST-02` *(CI schema/lint check)* | Custom `keymap.toml` remapping `40+` shortcuts executes in **`< 1 ms`**; duplicate binding highlights exact conflicting line & key in UI and CLI | `UNVERIFIED` |
| **`SV-19`** | **WCAG AA Tabular Numeral Contrast & Colorblind Audit** | `E01`, `E07`, `E10` *(co-enforced: `E06`)* | **`v0.1`:** `ST-02`, `ST-23`, `ST-27`, `ST-28`, `ST-40` · **Staged:** `ST-42` (`v1.0` full Heatmap LUT audit) | **`>= 4.5:1` WCAG AA** numeric text contrast across Footprint/DOM/Heatmap LUTs and **`ΔE2000 >= 20`** buy/sell separation on `Okabe-Ito` | `UNVERIFIED` |
| **`SV-20`** | **Installer & Cold-Start Budget Compliance** | `E01`, `E10` *(co-enforced: `E04`)* | **`v0.1`:** `ST-01`, `ST-03`, `ST-40` · **Staged:** `ST-16`/`ST-41` (`v0.2`), `ST-42` (`v1.0`), `ST-04` (`Post-v1.0`) | Packaged `.dmg`/`.msi`/NSIS installer **`< 40 MB`** and cold start to interactive canvas **`< 2.0 s`** on reference macOS & Windows hardware | `UNVERIFIED` |

---

## 4. Cross-References & Governance Traceability

- **Phase 4 Sibling Roadmap Docs:** [[Milestones]] · [[Sprint-Plan-v0.1]] · [[v0.1-Definition-of-Done]]
- **Phase 3 Architecture & Verification Specs:** [[C4-Architecture]] · [[Data-Model]] · [[IPC-Contract]] · [[Plugin-ABI]] · [[Error-Observability]] · [[Release-Signing-Update]] · [[Testing-Strategy]] · [[Adopt-Build-Fork]]
- **Architecture Decision Records:** [[0001-license-brand-and-platform-scope|ADR-0001]] · [[0002-desktop-shell-and-binary-ipc|ADR-0002]] · [[0003-chart-base-and-viewport-windowing|ADR-0003]] · [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]] · [[0005-study-runtime-and-scripting-language|ADR-0005]] · [[0006-tiered-storage-and-replay|ADR-0006]] · [[0007-backtest-engine-adopt-vs-build|ADR-0007]] · [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]] · [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]] · [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]]
- **Charter, Risk & Verification Dashboards:** [[Constraints]] · [[Principles]] · [[Glossary]] · [[Assumptions]] · [[Kill-Criteria]] · [[Risk-Register]] · [[License-Registry]] · [[Unverified-Claims]] · [[Red-Team-Phase3]]
