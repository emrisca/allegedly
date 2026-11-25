---
title: "Allegedly Release Milestones & Delivery Roadmap (v0.1 – Post-v1.0)"
type: roadmap
status: active
phase: Phase 4
owner: spikes-ui
updated: 2026-11-25
code_refs: []
---

# Allegedly Release Milestones & Delivery Roadmap (`v0.1` – `Post-v1.0`)

> **Governance & Scope Alignment:** This roadmap translates Allegedly's locked Phase 3 architecture ([[0001-license-brand-and-platform-scope|ADR-0001]] through [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]], cleared by [[Red-Team-Phase3]] with Verdict `PASS`) into five canonical releases: **`v0.1`**, **`v0.2`**, **`v0.5`**, **`v1.0`**, and **`Post-v1.0`**.
>
> - **Platform Scope (Locked `2026-11-24`, [[Assumptions]] `A01`, [[0001-license-brand-and-platform-scope|ADR-0001]]):** **macOS (Apple Silicon `aarch64` + Intel `x86_64`)** and **Windows 10/11 (`x86_64`)** are Tier-1 targets for `v0.1`–`v1.0`. **Linux (X11/Wayland, `WebKitGTK`, `RK-01`)** is formally deferred to **`Post-v1.0`** while preserving a portable Rust core, WebGL2 shader baseline, `TransportAdapter` IPC boundary, and `keyring-rs` wrapper.
> - **License & Cost Invariant (`Constraints` #1–#3):** `Apache-2.0`, `$0` core, local-first, offline-capable (`updates.checkOnStartup = false`, `SV-01`), zero proprietary runtime dependencies (`dockview-enterprise`, official `GPL-3.0` IBKR TWS API `v10.49+`, Sierra Chart `.scid`/Denali DTC export, and 4 prop firms permanently banned).
> - **Canonical Release Boundary (`RT4-01`):** `v0.1.0` is an **unsigned/ad-hoc Alpha tag** (`SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`, `updates.checkOnStartup = false`, **not** publicly marketed/distributed); `ST-12` (`.dbn.zst`/`.bi5` + real `.dbn.zst` fixture), `ST-30` (native pop-outs), and `ST-41` (Developer ID / SignPath Authenticode signing, Minisign Ed25519 `.sig` `requireSignedVersion`, opt-in updater) land cleanly in **`v0.2`**; `ST-42` (CycloneDX 1.5 + SPDX 2.3 SBOMs, Sigstore Cosign OIDC, reproducible builds) and `RK-04` (formal attorney trademark clearance + CFTC Rule 4.41 disclaimers, mandatory prior to public binary marketing/distribution) close in **`v1.0`**.
> - **Evidence Discipline:** Every measured Phase 2 baseline (`S01`–`S08` on Apple M2) is explicitly distinguished from targets that remain **`UNVERIFIED`** until `v0.1` Implementation CI (post-Phase-5) and hardware/legal qualification close them.
> - **Companion Phase 4 Documents:** [[Epics-and-Stories]] · [[Sprint-Plan-v0.1]] · [[v0.1-Definition-of-Done]] · [[Roadmap.canvas]]

---

## 1. Executive Milestone Summary Table

| Milestone | Theme & Cadence | Target Platforms | Included Epics (`E01`–`E10`) | Included Stories (`ST-01`–`ST-42`) | Key Sovereignty & Quality Gates (`SV-*`) | Governing ADRs | Hard Exit Criteria |
|---|---|---|---|---|---|---|---|
| **`v0.1`** | **Local-First Sovereign Core & Order-Flow Alpha**<br>*(8 weeks / Sprints 1–4 · unsigned/ad-hoc Alpha tag, not publicly marketed)* | macOS (`arm64` + `x86_64`) + Windows 10/11 (`x86_64`) | `E01`, `E02`, `E03`, `E04`, `E05`, `E06`, `E07`, `E08` *(Native + Luau)*, `E09` *(Paper OMS)*, `E10` *(Diagnostics + Alpha Packaging)* | `ST-01`–`ST-03`, `ST-05`–`ST-11`, `ST-13`–`ST-15`, `ST-18`–`ST-20` *(core)*, `ST-22`–`ST-25` *(initial)*, `ST-26`–`ST-29`, `ST-31`–`ST-32`, `ST-35`–`ST-36`, `ST-39`–`ST-40` | All `20/20` `SV-01`–`SV-20` wired in CI (incl. `SV-06`/`SV-07` 5-level TOML cascade, `SV-08` zero-float lint, `SV-11` honest `L2` non-MBO + `[Est / Max]` DOM PIQ, `SV-13` Tier A `FootprintSlabArena < 60 MiB` + Tier B `< 300 MB` idle RAM, `SV-17` VP + single-session `u128` TPO snap, `SV-01` `updates.checkOnStartup = false`); legacy-prefix CI ban; `cargo-deny` + npm SPDX + exact `ui-sdk` `"0.1.0-beta.17"` pin | [[0001-license-brand-and-platform-scope\|ADR-0001]]–[[0010-ui-kit-docking-and-settings-as-code\|ADR-0010]] | Full 9-crate `allegedly-*` workspace (+ dev-only `allegedly-docgen`) green on macOS & Windows CI; `0.000 CSS px` LWC+WebGL2 sync; `60 fps` `5,000`-bar window & Canvas2D `DOM Ladder`; Kraken+Coinbase+Sim ingest with 5-tier provenance; `.atvault` + Parquet + `16`-ary VRVP; Luau `ByteView` Studies (`<= 64 MiB` pool); Paper OMS WAL crash recovery + Kill-Switch + Risk-Reduction Bypass; `allow-live-trading` compile-time OFF; unsigned/ad-hoc `.dmg`/`.msi` `< 40 MB` (`UNVERIFIED` until CI) + `SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`; `KC-07` 8-week spine met |
| **`v0.2`** | **Pro Historical Data, Multi-Window Pop-Outs & Sandbox Brokers**<br>*(6 weeks / Post-`v0.1`)* | macOS (`arm64` + `x86_64`) + Windows 10/11 (`x86_64`) | `E02` *(multi-window `state_rev`)*, `E03` *(DBN / `.bi5`)*, `E04` *(DuckDB sidecar)*, `E07` *(pop-outs)*, `E08` *(Wasmtime + WIT eval)*, `E09` *(Sandbox brokers)*, `E10` *(Signing + Opt-In Updater)* | `ST-08` *(pop-out broadcast)*, `ST-12`, `ST-16`, `ST-30`, `ST-33`, `ST-37`, `ST-41` | `SV-01` (zero-packet boot preserved with opt-in updater), `SV-06`, `SV-07`, `SV-09` (DBN/`.bi5` parity), `SV-10` (`OtcIndicative` badges), `SV-16`, `SV-20` | [[0002-desktop-shell-and-binary-ipc\|ADR-0002]], [[0005-study-runtime-and-scripting-language\|ADR-0005]], [[0006-tiered-storage-and-replay\|ADR-0006]], [[0007-backtest-engine-adopt-vs-build\|ADR-0007]], [[0008-market-data-provider-abstraction-and-provenance\|ADR-0008]], [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]], [[0010-ui-kit-docking-and-settings-as-code\|ADR-0010]] | `ST-12` Databento `.dbn.zst` (`dbn v0.75.0`, incl. real human `.dbn.zst` fixture) + Dukascopy `.bi5` pass parity; `ST-30` native Tauri pop-out `WebviewWindow` sync with monotonic `state_rev: u64` (`0` leaks / mixed-DPI verified); `ST-33` Wasmtime `v51.0.0` Study runtime + `.cwasm` cache live & WIT overhead decision recorded; `ST-37` opt-in Alpaca Paper & tastytrade Cert Sandbox pass live-network smokes (`keyring-rs` zero leak); `ST-16` optional out-of-process DuckDB (`MIT`) reads `<ALLEGEDLY_HOME>/vault/ticks/**/*.parquet`; `ST-41` Apple Developer ID notarization / Windows SignPath Authenticode + Minisign Ed25519 `.sig` (`requireSignedVersion`) + opt-in updater (`updates.checkOnStartup = false`) verified |
| **`v0.5`** | **Live Retail Execution, Advanced Profiles & Ecosystem**<br>*(8 weeks / Post-`v0.2`)* | macOS (`arm64` + `x86_64`) + Windows 10/11 (`x86_64`) | `E03`, `E04`, `E05`, `E06`, `E07`, `E08`, `E09`, `E10` | `ST-17`, `ST-20` *(Composite TPO + 24h `.atdepth` heatmap)*, `ST-21`, `ST-34`, `ST-38` *(live activation)* *(+ `E03`/`E06`/`E07`/`E10` extensions)* | `SV-08`, `SV-10` (Absorption blocked on `SYNTHETIC`), `SV-11` (L2 Iceberg/Pull heuristic detectors), `SV-13` (24h `.atdepth` heatmap `< 64 MB` RAM / `< 30 MB` disk), `SV-15` (price-axis zoom guard), `SV-16` (Undo isolation), `SV-17` (multi-day `CompositeTpoRow` magnet snap) | [[0001-license-brand-and-platform-scope\|ADR-0001]], [[0004-orderflow-gpu-and-hotpath-renderer\|ADR-0004]], [[0005-study-runtime-and-scripting-language\|ADR-0005]], [[0007-backtest-engine-adopt-vs-build\|ADR-0007]], [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]] | `ST-38` opt-in live retail execution for Alpaca, tastytrade, and IBKR Client Portal Web API (`0` `GPL-3.0` TWS links; `LIVE_ARMED = false` boot default; macOS APFS `PRAGMA fullfsync = ON` batched Kill-Switch verified); native & client-managed Bracket/OCO (`ProtectiveLegMode::ClientManagedWarning`); `ST-20`/`ST-21` multi-day `CompositeTpoRow` (`Vec<u64>`), 24h `.atdepth` heatmap (`SV-13`), provenance-gated Absorption/Unfinished Auction & L2 Iceberg/Pull heuristic detectors (`SV-10`/`SV-11`); `ST-17` optional out-of-process `nautilus_trader` (`LGPL-3.0-only`) Parquet/JSON-RPC sidecar (`[ATTORNEY REVIEW REQUIRED]`); `ST-34` Minisign-verified community Study packages & clean-room scripting docs live |
| **`v1.0`** | **Production Trading Terminal GA (macOS + Windows)**<br>*(6 weeks / GA Qualification & Public Launch)* | macOS (`arm64` + `x86_64`) + Windows 10/11 (`x86_64`) | `E01`–`E10` *(Hardening, Soaks, Legal, Reproducibility & A11y)* | `ST-25` *(GA)*, `ST-38` *(GA)*, `ST-42` *(+ `ST-01`–`ST-41` GA soak/budget certification)* | Full **`20/20` `SV-01`–`SV-20`** GA sign-off; `SV-12`, `SV-13` (incl. 24h `.atdepth` heatmap `UV-07` re-cert), `SV-14`, `SV-18`, `SV-19`, `SV-20` empirically closed on macOS & Windows | [[0001-license-brand-and-platform-scope\|ADR-0001]]–[[0010-ui-kit-docking-and-settings-as-code\|ADR-0010]] | All GA runtime budgets empirically **VERIFIED** on reference macOS (`arm64`/`x86_64`) & Windows 10/11 (`WebView2`): full OS process-tree idle RAM `< 300 MB`, signed cold start `< 2.0 s`, installer `< 40 MB`, 30-min peak-volatility dual-venue soak (`0` CRC32/sequence faults), 10-chart `FootprintSlabArena` soak & 24h `.atdepth` heatmap re-cert (`< 64 MB` RAM / `< 30 MB` disk, `UV-07`); `ST-42` reproducible builds + CycloneDX 1.5 / SPDX 2.3 SBOMs + Sigstore Cosign OIDC; `RK-04` formal attorney trademark clearance & CFTC Rule 4.41 disclaimers prior to public binary marketing/distribution; full WCAG AA (`>= 4.5:1`), Okabe-Ito, & `axe-core` a11y pass |
| **`Post-v1.0`** | **Deferred Platform & Optional Ecosystem Expansion**<br>*(Post-GA Milestones)* | **Linux (X11 + Wayland)** + macOS + Windows | `E01` *(Linux CI/packaging)*, `E06`/`E07` *(Linux WebView parity)*, `E09` *(Optional isolated futures sidecars)* | `ST-04` *(+ deferred Linux WebView & optional futures sidecars)* | `SV-01`–`SV-20` extended to Linux; `KC-01`, `KC-02`, `KC-03`, `KC-04` | [[0001-license-brand-and-platform-scope\|ADR-0001]], [[0002-desktop-shell-and-binary-ipc\|ADR-0002]], [[0009-oms-broker-and-prop-firm-strategy\|ADR-0009]] | `ST-04` Linux X11/Wayland (`WebKitGTK` or alternative Tauri runtime) clears `RK-01` (`>= 55 fps` WebGL2, zero NVIDIA Wayland `Error 71`/DMA-BUF SIGSEGV) with Flatpak/AppImage `< 40 MB`; any optional EULA-compliant futures gateway runs strictly as an isolated external sidecar while permanently upholding the 4 prop-firm `DO-NOT-BUILD` ban and Sierra `.scid`/DTC ban |

---

## 2. Canonical Epic-to-Milestone Allocation (`E01`–`E10`)

Detailed stories (`ST-01`–`ST-42`) and binary acceptance criteria live in [[Epics-and-Stories]].

| Epic ID | Epic Name | `v0.1` (Alpha) | `v0.2` (Pro Data & Sandbox) | `v0.5` (Live Retail & Ecosystem) | `v1.0` (GA) | `Post-v1.0` (Deferred) |
|---|---|---|---|---|---|---|
| **`E01`** | Workspace, CI & Offline Boot | `ST-01`–`ST-03`: 9-crate workspace (+ `allegedly-docgen`), `SV-01` offline boot, CI gates (`cargo-deny`, npm SPDX, legacy-prefix ban) | Release signing pipeline CI (`SignPath` / Minisign / Developer ID) | Live-feature isolated build matrix | Reproducible builds & GA CI gates | `ST-04`: Linux X11/Wayland CI & Flatpak/AppImage |
| **`E02`** | Domain Model & Binary IPC | `ST-05`–`ST-08`: Fixed-point `i64`/`i128`, aligned binary wire framing (`40 B`/`32 B`/`24 B`/`16 B`), `16 ms` batched `Channel`, core `state_rev: u64` hub | `ST-08`: Monotonic `state_rev: u64` multi-window pop-out broadcast | Sidecar Parquet/JSON-RPC IPC bridge | Schema v1 freeze & cross-OS wire parity | Linux `TransportAdapter` verification |
| **`E03`** | Market Data Ingest & 5-Tier Provenance | `ST-09`–`ST-11`: Kraken WS v2 (`CRC32`), Coinbase WS (side inversion), Synthetic Sim, `rtrb` SPSC, 5-tier `ProvenanceTier`, `BookState`, `SV-11` honest `L2` non-MBO labeling | `ST-12`: Databento `.dbn.zst` (`dbn v0.75.0`, incl. real human fixture), Dukascopy `.bi5` (`OtcIndicative`), CSV/NT `.txt` | Provenance-gated alert stream contracts (`SV-10`, `SV-11`) | 30-min peak-volatility dual-venue soak (`ST-11`) | Optional EULA-compliant BYOK futures feeds (zero Sierra/Denali) |
| **`E04`** | `.atvault` Storage, Replay & 16-ary VRVP | `ST-13`–`ST-15`: `.atvault` Zstd-3+CRC32, Hive Parquet 2.0, `catalog.sqlite` WAL, `16`-ary Dyadic VRVP, `allegedly-replay` | `ST-16`: Optional DuckDB (`MIT`) out-of-process CLI/sidecar, `10M`-row L2 MBP Parquet bench | `ST-17`: Optional `nautilus_trader` (`LGPL-3.0-only`) out-of-process Parquet/JSON-RPC sidecar; 24h `.atdepth` persistence (`SV-13`) | 24h `.atdepth` heatmap GA re-cert (`UV-07`, `SV-13`) & cross-OS `SV-09` SHA-256 lock | — |
| **`E05`** | Order-Flow Engine | `ST-18`–`ST-20`: `FootprintSlabArena` (`< 60 MiB` Tier A, `SV-13`), `32 B` `FootprintCell`, `i128` Imbalance, Steidlmayer VA, single-session `u128` `TpoRow`, L2 queue realism | Pre-computed `footprints_1m` rollups & multi-session caching | `ST-20`/`ST-21`: Multi-day `CompositeTpoRow` (`Vec<u64>`), 24h `.atdepth` heatmap (`< 64 MB` RAM / `< 30 MB` disk, `SV-13`), Absorption/Unfinished Auction & L2 Iceberg/Pull heuristic detectors (`SV-11`) | 10-chart multi-timeframe RSS & `UV-07` GA re-certification | — |
| **`E06`** | LWC v5.3 + Viewport Windowing + WebGL2 | `ST-22`–`ST-25`: LWC `v5.3.0` + `5,000`/`6,000`-bar window, WebGL2 `ISeriesPrimitive` (`0.000 CSS px`), core Drawings + VP & single-session `u128` TPO `SV-17` magnet snap | Multi-window synchronized crosshair & linked symbol groups | `CompositeTpoRow` `SV-17` magnet snap & heatmap/alert overlay shaders | `ST-25`: Windows `WebView2` + macOS `WKWebView` `60 fps` GA sign-off (`SV-12`) | Linux WebGL2 verification (`RK-01`) |
| **`E07`** | Canvas2D DOM/T&S & Docked `ui-sdk` Shell | `ST-26`–`ST-29`: Canvas2D `DOM Ladder` (`SV-11` `[Est / Max]` PIQ badge, `SV-14`) & T&S, React 19 + `ui-sdk` `"0.1.0-beta.17"` + Tailwind v4 + MIT `dockview` `8.9.1`, `.atworkspace.toml`/`.atanalysis.toml`, 5-level cascade (`SV-06`, `SV-07`), 3-Tier Settings (`SV-03`–`SV-05`), `Cmd/Ctrl+K` (`SV-02`), Undo isolation (`SV-16`) | `ST-30`: Native Tauri `WebviewWindow` drag-to-detach pop-outs + mixed-DPI sync | Armed DOM & price-axis live Bracket/OCO order entry chrome (`SV-15`, `SV-17`) | Full WCAG AA `>= 4.5:1`, Okabe-Ito, `axe-core` & `keymap.toml` (`SV-18`, `SV-19`) | Linux windowing / HiDPI polish |
| **`E08`** | Study Runtime (Luau/Wasmtime) & `64 MiB` Pool | `ST-31`–`ST-32`: Native Rust built-ins + embedded Luau (`mlua v0.12.3`) flat SoA `ByteView`, `<= 64 MiB` global pool, `12/12` sandbox escapes, `TA-Lib` CI oracle | `ST-33`: Wasmtime `v51.0.0` (zero-WASI, `.cwasm` cache) + optional WIT size/latency evaluation | `ST-34`: Minisign-verified Study packages (`plugin.toml`), ABI SemVer negotiation & clean-room Pine-inspired DSL docs | Cross-runtime deterministic GA parity | — |
| **`E09`** | Paper OMS, WAL Recovery & Risk-Reduction Bypass | `ST-35`–`ST-36`: `LocalPaperAdapter`, 12-state `OrderState`, SQLite WAL crash recovery, Kill-Switch, Risk-Reduction Bypass, `allow-live-trading` OFF, 4 prop firms `DO-NOT-BUILD` | `ST-37`: Opt-in Alpaca Paper & tastytrade Cert Sandbox + `barter-rs` crypto paper + `keyring-rs` custody | `ST-38`: Opt-in Live Alpaca, tastytrade, IBKR Client Portal Web API (`0` `GPL-3.0` TWS), Bracket/OCO, macOS `fullfsync` | `ST-38`: Full OMS fault-injection & CFTC Rule 4.41 GA sign-off | Optional EULA-compliant futures sidecars (excluding 4 banned prop firms & Rithmic/CQG) |
| **`E10`** | Local Observability, Packaging, Signing & Opt-In Updates | `ST-39`–`ST-40`: Local ring-buffer diagnostics, Active 5-Tier Provenance Ledger, Tier B `< 300 MB` idle RAM (`SV-13`), unsigned/ad-hoc `< 40 MB` `.dmg`/`.msi` Alpha tag + `SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md` | `ST-41`: Apple Developer ID notarization, Windows SignPath Authenticode, Homebrew/Winget/Scoop, Minisign Ed25519 `.sig` (`requireSignedVersion`), opt-in `tauri-plugin-updater` (`updates.checkOnStartup = false`) | Signed Study verification UX & live-session update restart lock | `ST-42`: Reproducible builds, CycloneDX 1.5 / SPDX 2.3 SBOMs, Sigstore Cosign OIDC, `RK-04` Attorney Trademark clearance | Linux Flatpak / `.AppImage` / `.deb` / `.rpm` |

---

## 3. Detailed Milestone Breakdown

---

### Milestone 1: `v0.1` — Local-First Sovereign Core & Order-Flow Alpha

- **Duration & Cadence:** **8 weeks (Sprints 1–4)** — detailed sprint sequencing in [[Sprint-Plan-v0.1]] and binary release gates in [[v0.1-Definition-of-Done]].
- **Release Classification (`RT4-01`):** **Unsigned/ad-hoc Alpha tag** (`SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`, `updates.checkOnStartup = false`, **not** publicly marketed or distributed via public storefronts).
- **Target Platforms:** macOS (Apple Silicon `aarch64-apple-darwin` + Intel `x86_64-apple-darwin`) and Windows 10/11 (`x86_64-pc-windows-msvc` with Evergreen WebView2 `embedBootstrapper`).
- **Included Stories (`30` stories):** `ST-01`–`ST-03`, `ST-05`–`ST-11`, `ST-13`–`ST-15`, `ST-18`–`ST-20` *(core)*, `ST-22`–`ST-25` *(initial)*, `ST-26`–`ST-29`, `ST-31`–`ST-32`, `ST-35`–`ST-36`, `ST-39`–`ST-40`.
- **Governing ADRs:** [[0001-license-brand-and-platform-scope|ADR-0001]] through [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]].

#### Scope In (`E01`–`E10`)
1. **9-Crate Rust Workspace & CI Guardrails (`E01`, `E02` · `ST-01`–`ST-03`, `ST-05`–`ST-08`):**
   - Scaffold canonical `Apache-2.0` workspace (`CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` outside Obsidian vault): `allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-studies`, `allegedly-replay`, `allegedly-oms`, `allegedly-ipc`, `allegedly-app` (plus dev-only `allegedly-docgen`, excluded from packaged releases).
   - Zero-float `i64`/`i128` (`1e-9`) fixed-point domain model (`PriceE9`, `QtyE9`, `TimestampNs`), aligned binary IPC (`40 B` trades, `32 B` footprints, `24 B` volume profiles, `16 B` status), `tauri::ipc::Response` bulk transfers, `16 ms` frame-coalesced `tauri::ipc::Channel`, and core authoritative `state_rev: u64` Workspace State Hub (`ADR-0002`, [[IPC-Contract]]).
   - Merge-blocking PR CI (`ci-pr-fast.yml`, `ci-bundle-mac-win.yml`, `ci-nightly.yml`): zero-float lint (`SV-08`), zero retired legacy crate/extension prefix grep lint (`ADR-0001` §3.2), `cargo-deny v0.22.1`, npm SPDX check (hard-blocking `dockview-enterprise`), exact `"0.1.0-beta.17"` pin validation for `@ui-sdk/react` and `@ui-sdk/core`, and `SV-01` zero-network offline boot test (`updates.checkOnStartup = false`).
2. **US-Legal `$0` Live Ingest & 5-Tier Provenance (`E03` · `ST-09`–`ST-11`):**
   - Kraken Spot WS v2 (`CRC32` top-10 checksum verified) + Coinbase Advanced Trade WS (mandatory maker→taker side inversion stamped `ExchangeReportedInverted`) + deterministic Synthetic Market Simulator (`ADR-0008`).
   - Strict per-provider `rtrb` SPSC ring buffers feeding a single-thread Dispatcher; canonical 5-tier `ProvenanceTier` (`ExactL3Mbo`, `ExactTickAggr`, `EstimatedL1Quote`, `EstimatedTickRule`, `SyntheticIntrabar` + `PartialVenue`/`OtcIndicative`/`Delayed` modifiers), fail-closed 5-state `BookState` (`Live`, `Stale`, `Rebuilding`, `Disconnected`, `Halted`), and **`SV-11` (`v0.1` scope)**: honest `L2` non-MBO labeling across all L2 streams (forbidding unlabeled MBO claims).
3. **Local-First `.atvault` Storage, Replay & Order-Flow Engine (`E04`, `E05` · `ST-13`–`ST-15`, `ST-18`–`ST-20`):**
   - Crash-safe `.atvault` Zstd-3 + `CRC32` live segments compacting into Hive-partitioned Parquet 2.0 (`DELTA_BINARY_PACKED` + Zstd-3) with `catalog.sqlite` WAL (`ADR-0006`).
   - `FootprintSlabArena` (`< 60 MiB` Tier A bound, `SV-13`; `32 B` `FootprintCell`), `i128` diagonal Imbalance (`300%`), `70%` Steidlmayer Value Area, `16`-ary Dyadic Segment Tree VRVP, single-session `u128` `TpoRow` bitmask (`ST-20` core), and deterministic `allegedly-replay` (`1×`/`50×`/max-CPU) with conservative L2 FIFO queue-position fills (`ADR-0007`).
4. **Dual-Layer Charting, Canvas2D DOM/T&S & Docked `ui-sdk` Workbench (`E06`, `E07` · `ST-22`–`ST-29`):**
   - Lightweight Charts `v5.3.0` (`Apache-2.0`, preserving `NOTICE`) + Rust-backed `5,000`-bar viewport windowing (`6,000`-bar hysteresis/idle trim + full-history Rust Study warmup) (`ADR-0003`).
   - Raw WebGL2 Footprint / Volume Profile / single-session `u128` `TPO Profile` renderer synchronized at `0.000 CSS px` drift via LWC `ISeriesPrimitive` (`useBitmapCoordinateSpace`) + clean-room core Drawing tools (Trendline, Ray, H/V Line, Rectangle, Fib, Anchored VP) with **`SV-17` (`v0.1` scope)**: exact `i64` magnet snap to both **Volume Profile POC/VAH/VAL and single-session `u128` `TPO Profile` POC/VAH/VAL** (`ST-23`, `ST-24`, `ADR-0004`).
   - Zero-React-reconciliation Canvas2D `DOM Ladder` & Time & Sales hot path (`SV-14`) displaying **`SV-11` (`v0.1` scope)**: `[Est / Max]` DOM PIQ queue-position badge (`ST-27`).
   - React `19.3.1` + `@ui-sdk/react` / `@ui-sdk/core` exact-pinned `"0.1.0-beta.17"` (`Apache-2.0`, wrapped inside `@allegedly/ui-chrome/primitives/` per `AGENTS.md`, without bypassing `pnpm` release-age policy) + Tailwind CSS `4.3.5` + MIT `dockview` `8.9.1` behind `WorkspaceHost` (`0` enterprise deps) (`ADR-0010`).
   - Settings-as-Code 5-level sorted-key TOML delta cascade (`.atworkspace.toml` / `workspace.toml`, `.atanalysis.toml` / `analysis.toml`, `template.toml`, `theme.toml`, `keymap.toml`) enforcing **`SV-06`** (deterministic SHA-256 round-trip & `<= 3`-line git diff) and **`SV-07`** (5-level cascade inheritance, `Modified Only` filter, & 1-click `Reset to Inherited` clearing instance delta `{}` to parent template), 3-Tier Settings Compression (zero blocking config modals `SV-03`, `<= 5` control / `<= 36 px` Tier-1 micro-toolbar `SV-04`, `>= 90.0%` canvas ratio `SV-05`), `Cmd/Ctrl+K` Command Palette (`SV-02`), `100%` remappable `keymap.toml` (`SV-18`), WCAG AA `>= 4.5:1` / Okabe-Ito (`SV-19`), price-axis zoom guard (`SV-15`), and strict UI Undo isolation (`SV-16`).
5. **Study Runtime & `64 MiB` Global Pool (`E08` · `ST-31`–`ST-32`):**
   - Tier-1 Native Rust built-in Studies (`EMA`, `SMA`, `RSI`, `ATR`, `MACD`, `VWAP`, Bollinger Bands, CVD) + embedded **Luau (`mlua v0.12.3` + `luau0-src`, `MIT`)** running over the flat SoA `ByteView` ABI (`ADR-0005`, [[Plugin-ABI]]).
   - `<= 64 MiB` global terminal-wide Study memory pool with hidden-tab LRU eviction, `lua.sandbox(true)` + VM interrupt traps (`12/12` hostile escapes blocked), MTF non-repainting & intrabar rollback (`0` `u64::to_bits` mismatches), and dev-only `TA-Lib v0.8.3` (`BSD-3-Clause`) CI parity oracle.
6. **Zero-Float Paper OMS, Diagnostics & Unsigned Alpha Packaging (`E09`, `E10` · `ST-35`–`ST-36`, `ST-39`–`ST-40`):**
   - `LocalPaperAdapter` only (`allow-live-trading` Cargo feature compile-time **OFF**; `LIVE_ARMED = false` boot invariant; `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` CI test enforcing permanent ban on Apex Trader Funding, Take Profit Trader, Bulenox, Elite Trader Funding, Rithmic, CQG) (`ADR-0009`).
   - Canonical 12-state `OrderState` machine (`IntentLogged` through `UnknownPendingReconcile`), UUIDv7 `client_order_id` idempotency, SQLite WAL crash recovery, Panic Kill-Switch, and non-negotiable **Risk-Reduction Bypass Rule** (stale/reconciling feeds block risk-increasing entries while always permitting `oms.cancel_order`, `oms.cancel_all`, `oms.trigger_kill_switch`, and verified `reduce_only: true` exits).
   - Local-only ring-buffer diagnostics + Active 5-Tier Provenance Ledger ([[Error-Observability]]), Tier B full OS process-tree `< 300 MB` idle RAM probe (`SV-13`), and **unsigned/ad-hoc Alpha `.dmg` + `.msi` CI packaging (`< 40 MB`, `SV-20`)** with `SHA256SUMS.txt` and `THIRD_PARTY_NOTICES.md`.

#### Explicit Non-Goals / Scope Out (`v0.1`)
- **Zero live broker routing or real brokerage credentials** (`allow-live-trading` compiled out); no remote Alpaca/tastytrade/IBKR network broker connections yet (`v0.2`/`v0.5`).
- **No Wasmtime Study runtime or WIT component loader yet** (`ST-33` → `v0.2`; flat SoA `ByteView` ABI is locked in `v0.1` so Wasmtime plugs in cleanly without breaking Studies).
- **No native multi-window pop-out `WebviewWindow` drag-to-detach yet** (`ST-30` → `v0.2`; single-window Dockview multi-pane + core `state_rev: u64` hub ships in `v0.1`).
- **No Databento `.dbn.zst` / Dukascopy `.bi5` importers or real `.dbn.zst` human fixture gate yet** (`ST-12` → `v0.2`), and **no DuckDB/Nautilus sidecars yet** (`ST-16` → `v0.2`, `ST-17` → `v0.5`).
- **No L2 spoofing/iceberg heuristic detectors, multi-day `CompositeTpoRow` magnet snap, or 24h `.atdepth` heatmap UI yet** (`ST-20`/`ST-21` → `v0.5`).
- **No Apple Developer ID notarization, SignPath Authenticode, Minisign Ed25519 `.sig` `requireSignedVersion`, or opt-in updater yet** (`ST-41` → `v0.2`; `updates.checkOnStartup = false` always).
- **No CycloneDX/SPDX SBOMs, Sigstore Cosign OIDC, reproducible builds, or formal trademark clearance / public marketing yet** (`ST-42` & `RK-04` → `v1.0` prior to public binary distribution).
- **No Linux builds or `WebKitGTK` support** (`ST-04` → `Post-v1.0`).
- **No prop-firm adapters (4 banned firms), Rithmic/CQG, Sierra Chart `.scid`/Denali DTC export, or `GPL-3.0` IBKR TWS API** (permanent).

#### Budget & Sovereignty Targets (`v0.1`)

| Metric / Target | Phase 2/3 Verified Baseline (Apple M2) | `v0.1` Acceptance Gate | Verification Status |
|---|---|---|---|
| **Packaged Installer Size (`.dmg` / `.msi`)** | **`v0.1` core (without Wasmtime):** `S02` `2.68 MB` + `S07` Luau `+0.47 MiB` + `S08` storage `+2.91 MiB` ≈ **`~6.2 MB`** stripped `gzip-9` *(adds `+1.74 MiB` Wasmtime in `v0.2` → **`~8.0 MB`**, `S07` combined `1.74 + 0.47 = 2.21 MiB`)*; Windows `+~1.8 MB` `embedBootstrapper` | **`< 40 MB`** (`SV-20`, `Constraints` #5) | **`UNVERIFIED`** for integrated macOS `.dmg` & Windows `.msi` until `ci-bundle-mac-win.yml` |
| **Cold Start to Interactive Canvas** | `S02` unsigned sync-200k-init hit `2,330.99 ms` *(async hydration required)* | **`< 2.0 s`** (`p95`, `SV-01`, `SV-20`) | **`UNVERIFIED`** (async hydration on macOS & Windows) |
| **Full OS Process-Tree Idle RAM & Arena (`SV-13`)** | `S08` Rust replay RSS **`34.44 MiB`**; `S03` JS heap `+0.109 MB` | **Tier A:** `FootprintSlabArena < 60 MiB` (`E05`/`E06`); **Tier B:** **`< 300 MB`** full OS process-tree idle RAM (`E10`, `Constraints` #5) | **`UNVERIFIED`** (incl. macOS `WKWebView` XPC helpers & Windows `WebView2` child procs + 10-chart `FootprintSlabArena`) |
| **Offline Boot Network Isolation (`SV-01`)** | Architecture locked (`updates.checkOnStartup = false`) | **`0` outbound DNS/TCP/UDP packets**, `0` modals | **`UNVERIFIED`** until `ci-pr-fast.yml` namespace test |
| **LWC + WebGL2 Sync & `5,000`-Bar Pan/Zoom (`SV-12`)** | **`0.000 CSS px` drift**, `0.30–0.40 ms` draw, **`60.0 fps`** (`S01`) | `<= 0.5 CSS px` drift, `>= 60 fps` (`P99 <= 16.6 ms`) | macOS **VERIFIED** (`S01`); Windows `WebView2` **`UNVERIFIED`** |
| **16-ary Dyadic VRVP Recomputation (`SV-12`)** | **`9.04 µs` p50 / `27.08 µs` p99** (`S08`) | **`< 0.25 ms` (`250 µs`)** (`100%` integer parity) | macOS **VERIFIED** (`S08`); Windows **`UNVERIFIED`** |
| **Canvas2D DOM Ladder & Time & Sales (`SV-14`)** | **`60.2 fps`**, **`0.00 ms`** Layout/RecalcStyle (`S04`) | `>= 60 fps`, `0` hot-path allocations/tick | macOS **VERIFIED** (`S04`); Windows `WebView2` **`UNVERIFIED`** |
| **Binary IPC Throughput (`S02`)** | **`3.0 ms` p50 / `5.0 ms` p95** `100k`-bar transfer; **`100,450 msgs/s`** `16 ms` channel | **`p95 <= 16.0 ms`** `100k`-bar load ([[Testing-Strategy]] §2.4); `>= 20,000 msgs/s`, `p99 <= 10.0 ms` | macOS **VERIFIED** (`S02`); Windows `WebView2` **`UNVERIFIED`** |
| **Ingest, Replay & Cold Seek (`KC-05`, `SV-09`)** | `17.73M/s` ingest (`S05`); `102.55M/s` replay, `5.22 ms` cold 1h seek (`S08`) | `>= 20k` ticks/s bounded backpressure; `< 100 ms` seek; cross-OS SHA-256 match | macOS **VERIFIED** (`S05`/`S08`); Windows/Intel cross-OS SHA-256 **`UNVERIFIED`** |
| **Luau Study Engine & Sandbox (`KC-06`)** | `94.96 ms`/100k bars, `1.33 µs` live p99, `12/12` traps (`S07`) | `<= 1 ms` 10-study live p99; `<= 64 MiB` global pool; `TA-Lib v0.8.3` `<= 1e-9` | macOS Luau **VERIFIED** (`S07`); MSVC `luau0-src` build & `TA-Lib` oracle **`UNVERIFIED`** |
| **Paper OMS WAL & Kill-Switch (`SV-15`, `SV-16`)** | `119.75 µs` WAL append, `41 ns` intake halt, `6.13–7.04 ms` 50-order Kill-Switch (`S06`) | `< 10 ms` halt; `0` orphans/duplicates; `54` HTTP wire-mock faults; batched `fullfsync <= 25 ms` | Wire-mock & `synchronous=FULL` **VERIFIED** (`S06`); macOS APFS batched `PRAGMA fullfsync = ON` **`UNVERIFIED`** |
| **`ui-sdk` `"0.1.0-beta.17"` Compile, TOML Cascade & A11y (`SV-02`–`SV-07`, `SV-18`, `SV-19`)** | Spec locked (`AGENTS.md`, `ADR-0010`) | Clean `pnpm install` (respecting release-age policy), Vite build, `SV-06`/`SV-07` TOML cascade reset, `axe-core` `0` critical/serious | **`UNVERIFIED`** until Sprint 1 clean `pnpm install` + Playwright/Vitest |

#### Risk & Kill-Criteria Checkpoints (`v0.1`)
- **`KC-01` / `KC-02` (Early Windows `WebView2` Parity Gate — Sprint 3 Week 5 `UV-03` Smoke):** First `windows-latest` CI WebGL2/IPC smoke executes in **Sprint 3 Week 5** (leaving 3 weeks of remediation runway before Sprint 4 tag freeze) and MUST verify WebGL2 `>= 55 fps` (target `60 fps`), `0.000 CSS px` sync, and `< 2×` frame-time parity vs macOS `WKWebView`; otherwise trigger `KC-01`/`KC-02` fallback evaluation.
- **`KC-03` / `KC-04` (License & Legal Gate — Sprint 1):** `cargo-deny v0.22.1`, npm SPDX (`0` `dockview-enterprise`), legacy-prefix grep lint, and `S06-T7` `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` pass on PR #1.
- **`KC-05` / `KC-06` (Ingest & Study Gate — Sprint 2–3):** `rtrb` bounded backpressure (`>= 20k` ticks/s, `BookState::Stale(BackpressureDrop)`), `12/12` hostile Luau escapes, and `TA-Lib v0.8.3` parity pass in CI.
- **`KC-07` (8-Week Vertical-Slice Guardrail — Sprint 2 / Week 4 Checkpoint & Sprint 4 / Week 8 Final Gate):** If `v0.1` tracks past 8 weeks at Week 4, cut breadth cleanly (retain 1 exchange [Kraken], 1 order-flow tool [Footprint + VRVP], 1 drawing tool [Horizontal Ray], 1 built-in Study [VWAP]) until the full sovereign spine ships.
- **`RK-01`–`RK-10`:** `RK-01` remains `Deferred (Post-v1.0)`; `RK-02` mitigated via Kraken+Coinbase+Sim; `RK-05`/`RK-06` enforced in CI; `RK-07`/`RK-08` re-verified on Windows; `RK-09` enforced via `SV-10`/`SV-11`/`SV-15`/`SV-16`; `RK-10` enforced via `CARGO_TARGET_DIR`.

#### Hard Exit Criteria (`v0.1`)
- All Tier A (`v0.1-dev`) and Tier B (`v0.1.0` unsigned/ad-hoc Alpha tag) items in [[v0.1-Definition-of-Done]] pass on both `macos-14` (`arm64` + `x86_64` check) and `windows-latest` (`x86_64`).
- All `20/20` `SV-01`–`SV-20` CI checks are wired and green for their canonical `v0.1` scope (with `v0.2`/`v0.5`/`v1.0` extensions explicitly tracked in Section 4).

---

### Milestone 2: `v0.2` — Pro Historical Data, Multi-Window Pop-Outs & Sandbox Brokers

- **Duration & Cadence:** **6 weeks** (post-`v0.1` Alpha).
- **Target Platforms:** macOS (`aarch64` + `x86_64`) + Windows 10/11 (`x86_64`).
- **Included Stories (`7` stories):** `ST-08` *(multi-window pop-out broadcast)*, `ST-12`, `ST-16`, `ST-30`, `ST-33`, `ST-37`, `ST-41`.
- **Governing ADRs:** [[0002-desktop-shell-and-binary-ipc|ADR-0002]], [[0005-study-runtime-and-scripting-language|ADR-0005]], [[0006-tiered-storage-and-replay|ADR-0006]], [[0007-backtest-engine-adopt-vs-build|ADR-0007]], [[0008-market-data-provider-abstraction-and-provenance|ADR-0008]], [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]], [[0010-ui-kit-docking-and-settings-as-code|ADR-0010]].

#### Scope In
1. **Pro Historical Offline Importers (`E03` · `ST-12`):**
   - **Databento `.dbn.zst` user importer (`databento/dbn v0.75.0`, `Apache-2.0`):** Supports `TradeMsg`, `Mbp10Msg`, `MboMsg`, and `InstrumentDefMsg` (`$0` BYOK / user `$125` Databento credits; never redistributes CME data), validated against both golden fixtures and a **real user-downloaded CME Globex `.dbn.zst` human fixture**.
   - **Dukascopy `.bi5` importer (`lzma-rs v0.3`):** User-initiated FX tick import strictly stamped `VenueCoverage::OtcIndicative` + `AggressorSource::None` (`SV-10`), using isolated `#[allow(allegedly_ingress_float_parse)]` ingress conversion to `1e-9` `i64`.
   - **NinjaTrader `.txt` / CSV / Parquet** local user file importers + pre-computed `footprints_1m` Parquet rollups.
2. **Multi-Monitor Native Pop-Out Windows (`E02`, `E07` · `ST-08`, `ST-30`):**
   - Drag-to-detach Dockview panels into native Tauri `WebviewWindow` instances coordinated by the Rust Workspace State Hub with monotonic **`state_rev: u64`** conflict protection (preventing stale pop-out writes from clobbering newer layout/drawing mutations, [[IPC-Contract]]).
   - Cross-window linked crosshair, symbol-group broadcast, and mixed-DPI verification on macOS & Windows.
3. **Wasmtime Study Runtime & Optional WIT Evaluation (`E08` · `ST-33`):**
   - Activate Tier-2 **Wasmtime `v51.0.0` (`Apache-2.0 WITH LLVM-exception`)** with minimal features (`default-features = false`, `cranelift`, `runtime`, `std`, zero WASI), `cranelift_nan_canonicalization(true)`, `StoreLimits` within the shared `<= 64 MiB` global pool, flat SoA `ByteView` ABI, and pre-compiled `.cwasm` disk caching.
   - Execute dedicated benchmark evaluating optional **`wasmtime::component` (WIT)** binary size delta and batch call overhead vs. flat linear-memory core modules (`UNVERIFIED` until measured; retain flat `ByteView` as primary ABI unless WIT stays within size & `< 5%` latency bounds).
4. **Opt-In Paper/Sandbox Retail Brokers & OS Keychain Custody (`E09` · `ST-37`):**
   - **`AlpacaPaperAdapter`** (`paper-api.alpaca.markets/v2`, first-party `Apache-2.0` REST/WS), **`tastytrade` Certification Sandbox** (OAuth2 `dry-run`), and **`barter-rs v0.2.1` (`MIT`)** crypto paper adapters — strictly opt-in with user credentials stored in OS Keychain via **`keyring-rs v4.2.0` + `zeroize`** (`0` plaintext bytes in SQLite/logs/TOML).
   - `allow-live-trading` remains **OFF** by default in `v0.2` builds.
5. **Optional Out-of-Process DuckDB Sidecar (`E04` · `ST-16`):**
   - Zero-ETL **DuckDB `v2.0.1` (`MIT`)** read-only external CLI/sidecar bridge pointing directly at `<ALLEGEDLY_HOME>/vault/ticks/**/*.parquet` for ad-hoc SQL queries (`0 MB` added to core installer) + `10M`-row L2 MBP Parquet compression & seek qualification.
6. **Code Signing, Package Managers & Opt-In Cryptographic Updater (`E10` · `ST-41`):**
   - Windows `$0` OV HSM Authenticode signing via **SignPath Foundation** (`R02-S15`) + Winget & Scoop manifests; macOS Homebrew Cask (`--no-quarantine`) + Apple Developer ID notarization (when configured/funded outside `$0` core).
   - **`tauri-plugin-updater v2.14.1`** with Minisign Ed25519 `.sig` + mandatory **`requireSignedVersion`** anti-downgrade flag, package-manager conflict guard, active-order restart lock, and strict **`updates.checkOnStartup = false`** default (`SV-01`, [[Release-Signing-Update]]).

#### Explicit Non-Goals / Scope Out (`v0.2`)
- **Zero live-money broker order routing** (`ST-38` → `v0.5`).
- **No `nautilus_trader` sidecar, L2 spoofing/iceberg detectors, 24h `.atdepth` heatmap UI, or signed community Study packages** (`ST-17`, `ST-20`/`ST-21`, `ST-34` → `v0.5`).
- **No CycloneDX/SPDX SBOMs, Sigstore Cosign OIDC, reproducible builds, or formal trademark clearance / public marketing** (`ST-42` & `RK-04` → `v1.0`).
- **No Sierra Chart `.scid` importer or Denali DTC feed export** (permanently banned, `RK-06`).
- **No Linux packaging** (`ST-04` → `Post-v1.0`).

#### Budget & Sovereignty Targets (`v0.2`)
- **Installer Budget:** Still **`< 40 MB`** after adding Wasmtime (`+1.74 MiB` `S07` gzip-9 → core baseline **`~8.0 MB`**, `S07` combined `1.74 + 0.47 = 2.21 MiB`), `dbn v0.75.0`, `keyring-rs`, and `tauri-plugin-updater` (**`UNVERIFIED`** until `v0.2` macOS/Windows CI build).
- **Wasmtime Performance:** `100k`-bar flat batch **`1.679 ms`** (`+3.32%` vs Native) and `0.084 µs` live p99 verified on Apple M2 (`S07`); **`.cwasm` warm cache cold start (`< 1 ms` target)** and **optional WIT size/latency overhead** are **`UNVERIFIED`** until measured in `v0.2`.
- **Pop-Out Multi-Window Sync:** `S03` verified `0.60 ms` p95 Rust hub sync & `0` leaks over 20 cycles on macOS; **mixed-DPI drag-to-detach on Windows `WebView2` + macOS** is **`UNVERIFIED`** until `v0.2` E2E.
- **Offline Data & L2 Benchmarks:** Synthetic DBN verified (`18.43M` Trade / `5.67M` Mbp10 rec/s, `S05`); **real user-downloaded CME Globex `.dbn.zst`** and **`10M`-row L2 MBP Parquet compression & seek** are **`UNVERIFIED`** until `v0.2` verification.
- **Remote Sandbox Broker Smokes:** **Live-network smokes against `paper-api.alpaca.markets/v2` and tastytrade Cert Sandbox** are **`UNVERIFIED`** (opt-in human/scheduled verification; never in PR CI).
- **Zero-Network Offline Boot (`SV-01`):** Opt-in updater MUST emit **`0` outbound packets** on fresh install (`updates.checkOnStartup = false`).

#### Risk & Kill-Criteria Checkpoints (`v0.2`)
- **`RK-02` (CME/Equities Data Cost):** Mitigated via BYOK Databento `.dbn.zst` (`$125` free user credits) + zero exchange redistribution.
- **`RK-05` / `KC-04` (License Hygiene):** DuckDB stays strictly out-of-process; `dbn` (`Apache-2.0`), `wasmtime` (`Apache-2.0 WITH LLVM-exception`), `barter-rs` (`MIT`), `keyring-rs` (`MIT OR Apache-2.0`) verified by `cargo-deny`.
- **`RK-07` (Installer Size):** Confirm Wasmtime + updater + DBN combined packaged `.dmg`/`.msi` stays `< 25 MB` (hard gate `< 40 MB`).

#### Hard Exit Criteria (`v0.2`)
- `ST-12` real user `.dbn.zst` + `.bi5` golden fixtures decode with `0` tick/provenance errors and bit-exact replay (`SV-09`, `SV-10`).
- `ST-30` multi-window pop-outs pass 20-cycle open/close leak audit (`0` leaks) and `state_rev: u64` conflict tests on macOS & Windows.
- `ST-33` Wasmtime Study parity matches Native Rust (`0.000e0` max diff) + `4/4` hostile escapes trapped + written WIT go/no-go benchmark recorded.
- `ST-37` opt-in Alpaca Paper & tastytrade Cert Sandbox pass live-network smokes with `0` leaked credential bytes (`keyring-rs`).
- `ST-41` signed builds install cleanly via Homebrew Cask / Winget / Scoop with verified Minisign `requireSignedVersion` update check and `0` packets on default boot (`SV-01`).

---

### Milestone 3: `v0.5` — Live Retail Execution, Advanced Profiles & Ecosystem

- **Duration & Cadence:** **8 weeks** (post-`v0.2`).
- **Target Platforms:** macOS (`aarch64` + `x86_64`) + Windows 10/11 (`x86_64`).
- **Included Epics (`E03`–`E10`):** `E03`, `E04`, `E05`, `E06`, `E07`, `E08`, `E09`, `E10`.
- **Included Stories:** `ST-17`, `ST-20` *(Composite TPO + 24h `.atdepth` heatmap)*, `ST-21`, `ST-34`, `ST-38` *(live activation)* *(plus `E03`/`E06`/`E07`/`E10` extensions)*.
- **Governing ADRs:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0004-orderflow-gpu-and-hotpath-renderer|ADR-0004]], [[0005-study-runtime-and-scripting-language|ADR-0005]], [[0007-backtest-engine-adopt-vs-build|ADR-0007]], [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]].

#### Scope In
1. **Opt-In Live Retail Broker Execution (`E07`, `E09`, `E10` · `ST-38`):**
   - Enable `allow-live-trading` behind explicit user opt-in with **disjoint Paper vs. Live host allowlists**, immutable **`LIVE_ARMED = false`** boot default, multi-step confirmation dialog, persistent red `LIVE ARMED` warning banner, live-session update restart lock (`E10`), and mandatory macOS APFS **`PRAGMA fullfsync = ON`** (batched single-transaction Kill-Switch WAL commits) (`ADR-0009`).
   - Retail broker adapters: **Alpaca Live**, **tastytrade Live**, and **IBKR Client Portal Web API** (plus optional clean-room `wboayue/rust-ibapi v5.7.0` `MIT` / FIX behind `BrokerAdapter` trait — **zero `GPL-3.0` official IBKR TWS API `v10.49+`**).
   - Native server-side & client-managed **Bracket Orders / OCO** (`ProtectiveLegMode::ClientManagedWarning` non-dismissible banner when client-managed), armed DOM Ladder direct order entry (`E07`), and armed price-axis staging with exact `i64` POC/VAH/VAL magnet snap (`SV-15`, `SV-17`).
2. **Advanced Order-Flow Profiles, 24h `.atdepth` Heatmap & Provenance-Gated Alerts (`E03`, `E04`, `E05`, `E06` · `ST-20`, `ST-21`):**
   - Multi-day **`CompositeTpoRow`** backed by variable-word `Vec<u64>` bitsets (supporting arbitrary multi-week/15m-24h bracket counts with zero-rescan bitwise split/merge) and **`SV-17` (`v0.5` extension)**: magnet snap extended to multi-day `CompositeTpoRow` POC/VAH/VAL (`E05`/`E06`).
   - **24-Hour `.atdepth` Liquidity Heatmap (`SV-13` `v0.5` scope, `E04`/`E05`/`E06`):** `864,000` slices (10 Hz × 200 levels) staying **`< 64 MB` heatmap RAM** and **`< 30 MB` Zstd `.atdepth` disk** (`UV-07`, re-certified at `v1.0` GA).
   - Provenance-gated **Absorption** and **Unfinished Auction** alerts (`E03`/`E05`): `SV-10` hard-disables Absorption triggers on `SYNTHETIC: 1m-INTRABAR` data, while **`SV-11` (`v0.5` extension, `ST-21`)** adds spoofing/pulling and iceberg heuristic detectors (`HEURISTIC: L2-ICEBERG` / `HEURISTIC: L2-PULL` labels + `dwell_ms`/`conflation_guard_ms` sliders on L2 MBP feeds).
3. **Optional `nautilus_trader` (`LGPL-3.0-only`) Out-of-Process Sidecar (`E04`, `E09` · `ST-17`):**
   - Strictly isolated external sidecar launcher exchanging local Parquet 2.0 vaults and JSON-RPC/Arrow IPC messages — **`0` static or dynamic linkage** into any `allegedly-*` crate (`ADR-0001` §3.1, `ADR-0007`). Gated on **`[ATTORNEY REVIEW REQUIRED]`** before shipping any bundled sidecar launcher.
4. **Ecosystem: Signed Study Packages & Clean-Room Scripting Docs (`E08`, `E10` · `ST-34`):**
   - Minisign Ed25519 signature verification (`plugin.toml`) and ABI SemVer negotiation for portable community `.wasm` / `.luau` Study packages executing inside the `<= 64 MiB` global sandbox pool.
   - Clean-room scripting documentation generated via `allegedly-docgen` ([[Docs-Strategy]]) + staged clean-room Pine-inspired series DSL compiler targeting Luau/WASM (zero TradingView® / Pine Script® trademark or copied code usage).

#### Explicit Non-Goals / Scope Out (`v0.5`)
- **Zero prop-firm execution for the 4 banned firms** (Apex Trader Funding, Take Profit Trader, Bulenox, Elite Trader Funding) and **zero Rithmic/CQG closed-ISV embedding** (`KC-03`, `RK-03`).
- **Zero official `GPL-3.0` IBKR TWS API linkage** (`RK-05`).
- **Zero Sierra Chart `.scid` / Denali DTC market-data export** (`RK-06`).
- **Zero cloud accounts, hosted telemetry, or SaaS strategy marketplace** (`Constraints` #2, #3).
- **No Linux release** (`ST-04` → `Post-v1.0`).

#### Budget & Sovereignty Targets (`v0.5`)
- **macOS APFS `BrokerLive` `PRAGMA fullfsync = ON` Batched Kill-Switch:** **`<= 15–25 ms`** for a 50-order cancel wave inside 1 SQLite transaction (`UNVERIFIED` until macOS APFS hardware bench closes it).
- **24h `.atdepth` Heatmap Bound (`SV-13`):** **`< 64 MB` heatmap RAM** and **`< 30 MB` Zstd `.atdepth` disk** (`UNVERIFIED`, `UV-07`, re-certified at `v1.0` GA).
- **Bracket / OCO Latency:** `S06` baseline `997.29 µs` p50 / `5.941 ms` p99 (`final_pos == 0`); live broker round-trip telemetry recorded locally only (`Error-Observability`).
- **Safety Invariants (`SV-10`, `SV-11`, `SV-15`, `SV-16`, `SV-17`):** `0` accidental orders across `1,000` unmodified price-axis zoom drags; `Cmd/Ctrl+Z` leaves `100%` of live orders untouched; Risk-Reduction Bypass always permits cancels, Kill-Switch, and verified `reduce_only: true` exits during stale/reconciling states.
- **Installer Budget:** Still **`< 40 MB`** (`nautilus_trader` is never bundled in core).

#### Risk & Kill-Criteria Checkpoints (`v0.5`)
- **`RK-03` / `KC-03` (Prop-Firm Legal Wall):** `S06-T7` denylist test enforces zero prohibited adapters in every build.
- **`RK-05` / `KC-04` (LGPL/GPL Isolation):** `cargo-deny` hard-blocks `nautilus_trader` (`LGPL-3.0-only`) and official IBKR TWS (`GPL-3.0-or-later`) from `Cargo.lock`; `[ATTORNEY REVIEW REQUIRED]` gate on optional `nautilus_trader` sidecar launcher.
- **`RK-09` (Execution UX Safety):** Mandatory Playwright E2E gate on `SV-10`, `SV-11`, `SV-15`, `SV-16`, `SV-17`, and `ProtectiveLegMode::ClientManagedWarning`.

#### Hard Exit Criteria (`v0.5`)
- `ST-38` live retail broker adapters (Alpaca, tastytrade, IBKR Client Portal Web API) pass wire-mock fault suites (`0` duplicate orders, `< 3 s` reconnect reconcile) plus opt-in paper/micro-lot operator sign-off with `LIVE_ARMED = false` boot invariant intact.
- macOS APFS `PRAGMA fullfsync = ON` batched 50-order Kill-Switch benchmark empirically **VERIFIED** (`<= 25 ms`).
- `ST-20`/`ST-21` multi-day `CompositeTpoRow` (`> 128` brackets + `SV-17` magnet snap), 24h `.atdepth` heatmap (`SV-13`), and provenance-gated Absorption/Unfinished Auction & L2 Iceberg/Pull heuristic alerts pass deterministic unit + `SV-10`/`SV-11` E2E tests.
- `ST-34` clean-room Study package signing & docs pass `allegedly-docgen` schema/build checks with zero trademark violations.

---

### Milestone 4: `v1.0` — Production Trading Terminal GA (macOS + Windows)

- **Duration & Cadence:** **6 weeks** (GA hardening, endurance qualification, legal sign-off, reproducible builds, and accessibility polish).
- **Target Platforms:** **macOS (Apple Silicon `aarch64` + Intel `x86_64`)** and **Windows 10/11 (`x86_64`)** — full production General Availability & public distribution.
- **Included Stories:** `ST-25` *(GA)*, `ST-38` *(GA)*, `ST-42` *(+ full GA soak/budget certification of `ST-01`–`ST-41`)*.
- **Governing ADRs:** All 10 ADRs ([[0001-license-brand-and-platform-scope|ADR-0001]]–[[0010-ui-kit-docking-and-settings-as-code|ADR-0010]]) frozen at GA schema `v1`.

#### Scope In
1. **Full GA Performance, Memory & Endurance Qualification (`E01`–`E10` · `ST-25`, `ST-42`):**
   - Empirically close **every remaining `UNVERIFIED` runtime budget** on reference macOS (`arm64` & `x86_64`) and Windows 10/11 (`WebView2`) hardware:
     - Full OS process-tree idle RAM **`< 300 MB`** (explicitly summing macOS `launchd`-parented `WKWebView` XPC helpers and Windows `WebView2` child processes, `SV-13`).
     - Signed, async-hydrated cold start to interactive canvas **`< 2.0 s`** (`p95`, `SV-01`, `SV-20`).
     - Packaged installer **`< 40 MB`** (`.dmg`, `.msi`, NSIS `.exe` incl. WebView2 `embedBootstrapper`).
     - **30-minute unattended peak-volatility dual-venue soak** (`Kraken` + `Coinbase`, `BTC`/`ETH`/`SOL`, depth=100, `>= 1,000` trades/venue, `0` CRC32 mismatches, `0` unrecovered sequence gaps, flat RSS).
     - **10-chart concurrent multi-timeframe `FootprintSlabArena` endurance soak** within `< 300 MB` idle/working budget.
     - **24-hour L2 liquidity heatmap GA re-certification (`SV-13`, `UV-07`):** `864,000` slices (10 Hz × 200 levels) staying `< 64 MB` heatmap RAM and `< 30 MB` Zstd `.atdepth` disk.
     - **Cross-OS `SV-09` SHA-256 bit-identical replay lock** across `aarch64-apple-darwin`, `x86_64-apple-darwin`, and `x86_64-pc-windows-msvc`.
2. **Formal Legal & Regulatory Sign-Off (`RK-04`, `ST-38`, `ST-42`, [[Compliance-Notes]]):**
   - **Mandatory prior to public binary marketing/distribution:** Attorney-cleared **Allegedly** trademark clearance (`USPTO` Class `009`/`042`, `EUIPO`/`WIPO`, evaluating `allegedly.market`, `allegedlyapp.com`, `kyscott18/allegedly`) — or clean execution of pre-screened R09 fallback rename.
   - Attorney-reviewed **CFTC Rule 4.41** hypothetical/simulated performance disclaimers embedded cleanly in Paper/Replay/Backtest exports and UI footers, plus verified Pine clean-room spec boundary.
3. **Reproducible Builds & Supply-Chain Provenance (`E10` · `ST-42`):**
   - Deterministic, reproducible release builds with **CycloneDX 1.5** + **SPDX 2.3** SBOMs, `SHA256SUMS.txt`, GitHub SLSA Build Provenance + **Sigstore Cosign OIDC** keyless signatures, and CI-audited `THIRD_PARTY_NOTICES.md` (preserving LWC `NOTICE` & `OFL-1.1` font notices).
4. **Full Keyboard-First & Accessibility Polish (`E07` · `ST-42`, `SV-02`, `SV-18`, `SV-19`):**
   - `100%` remappable `40+` shortcuts via `keymap.toml` with `< 1 ms` dispatch and inline/CLI conflict diagnostics (`SV-18`).
   - Full WAI-ARIA keyboard/focus traversal (`axe-core` `0` critical/serious across all `ui-sdk` chrome — or pre-approved `shadcn/ui + Radix` swap if any `0.1.0-beta` primitive fails GA a11y), Canvas2D ARIA live summaries, **`>= 4.5:1` WCAG AA** tabular numeral contrast, and **Okabe-Ito** colorblind palette (`Delta E_2000 >= 20`, `SV-19`).

#### Explicit Non-Goals / Scope Out (`v1.0`)
- **No Linux official binaries** (`ST-04` → `Post-v1.0`).
- **No proprietary cloud sync, subscription paywalls, or opt-out telemetry** (`Constraints` #1–#3).
- **No banned prop firms, Rithmic/CQG, Sierra `.scid`/DTC export, or `GPL-3.0` TWS** (permanent).

#### Budget & Sovereignty Targets (`v1.0`)
- **Zero `UNVERIFIED` GA runtime claims remaining** for macOS and Windows: all `20/20` rules (`SV-01`–`SV-20`) empirically **VERIFIED** on reference hardware.

#### Risk & Kill-Criteria Checkpoints (`v1.0`)
- **`RK-04` (Trademark Clearance):** Hard stop before public GA binary marketing/distribution until counsel signs off.
- **`RK-05` / `RK-07` / `RK-08` / `RK-09`:** Final pre-GA red-team audit confirms zero license regressions, zero sync drift, and zero UX execution hazards.

#### Hard Exit Criteria (`v1.0`)
- `20/20` `SV-01`–`SV-20` gates **VERIFIED** green on macOS (`arm64` + `x86_64`) and Windows 10/11 (`x86_64`).
- All endurance soaks (30-min live dual-venue, 10-chart `FootprintSlabArena`, 24-hour `.atdepth` heatmap `UV-07` re-cert) pass with zero crashes, leaks, or data drift.
- Trademark counsel clearance (`RK-04`) & CFTC Rule 4.41 disclaimers signed off.
- `ST-42` reproducible release artifacts, CycloneDX 1.5 / SPDX 2.3 SBOMs, Sigstore Cosign OIDC attestations, and `THIRD_PARTY_NOTICES.md` verified from a clean user install on macOS & Windows.

---

### Milestone 5: `Post-v1.0` (Deferred) — Linux Support & Optional EULA-Compliant Futures Sidecars

- **Cadence:** Scheduled after `v1.0` GA stabilization on macOS + Windows.
- **Target Platforms:** **Linux (X11 + Wayland, `x86_64` + `arm64`)** added alongside macOS + Windows.
- **Included Stories:** `ST-04` *(plus deferred Linux `E06`/`E07` parity & optional isolated futures sidecars)*.
- **Governing ADRs:** [[0001-license-brand-and-platform-scope|ADR-0001]], [[0002-desktop-shell-and-binary-ipc|ADR-0002]], [[0009-oms-broker-and-prop-firm-strategy|ADR-0009]].

#### Scope In
1. **Linux X11 + Wayland Activation (`E01`, `E06`, `E07` · `ST-04`, `RK-01`):**
   - Enable Allegedly's portable Rust core, WebGL2 baseline, `TransportAdapter` IPC layer, and `keyring-rs` Secret Service / KWallet backend on Linux once `WebKitGTK` Wayland/NVIDIA `Error 71` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` SIGSEGV regressions are resolved upstream (or via an alternative Tauri runtime such as `Servo`/`CEF`).
   - Run full `S01`–`S08` & `SV-01`–`SV-20` qualification on Linux X11 & Wayland (NVIDIA + AMD + Intel GPUs) and ship Flatpak / `.AppImage` / `.deb` / `.rpm` packages under `< 40 MB` (`UNVERIFIED` until Linux CI runs).
2. **Optional EULA-Compliant Futures Execution Sidecars (`E09`):**
   - Strictly isolated, user-installed external sidecar plugins over Allegedly's process boundary for legally permitted futures venues (e.g., public-domain **execution-only DTC** never touching Sierra/Denali market data, or an optional external **Topstep ProjectX** plugin strictly restricted to user-paid personal-device Sim/Practice/Combine/XFA accounts blocking Live Funded Accounts & VPS/VPN per `ADR-0009` D6).

#### Explicit Non-Goals / Permanent Bans (`Post-v1.0`)
- **Permanent `DO-NOT-BUILD` Prop-Firm Ban (`KC-03`, `RK-03`):** Apex Trader Funding, Take Profit Trader, Bulenox, and Elite Trader Funding remain permanently excluded unless written, public official API programs open.
- **Permanent Closed-ISV Ban:** Rithmic and CQG remain excluded from `$0` open-source core.
- **Permanent Sierra Chart Ban (`RK-06`):** Zero `.scid` file parsing and zero Sierra/Denali market-data export over DTC.
- **Permanent `GPL-3.0` IBKR TWS Ban (`RK-05`):** Zero linkage to official IBKR TWS API `v10.49+`.

#### Risk & Kill-Criteria Checkpoints (`Post-v1.0`)
- **`RK-01` / `KC-01` / `KC-02`:** Linux ships only if WebGL2 holds `>= 55 fps` (target `60 fps`), `0.000 CSS px` sync drift, and zero Wayland/NVIDIA compositor crashes across `SV-12`/`SV-14`.
- **`KC-03` / `KC-04`:** Every optional sidecar passes legal/ToS review and remains completely decoupled from `allegedly-*` core crates.

---

## 4. Consolidated `UNVERIFIED` Verification Schedule

Every unmeasured target from [[Unverified-Claims]] and [[Testing-Strategy]] §5 is assigned a concrete closure milestone below:

| `UNVERIFIED` Target | Current Baseline / Gap | Closure Milestone | Verification Gate |
|---|---|---|---|
| **Windows 10/11 (`WebView2`) WebGL2, IPC (`p95 <= 16.0 ms`), `luau0-src` MSVC build & `.msi` `< 40 MB`** | Phase 2 spikes ran on Apple M2 only | **`v0.1`** (Early smoke Sprint 3 W5 `UV-03`, full gate Sprint 4) | `ci-bundle-mac-win.yml` & `ci-nightly.yml` (`windows-latest`) |
| **`@ui-sdk/react` & `@ui-sdk/core` (`"0.1.0-beta.17"`) `pnpm` install, React 19 compile & `axe-core` a11y** | Not yet compiled in Phase 2 (`S03`/`S04` used plain React 19 + Tailwind 4) | **`v0.1`** (Sprint 1) | Clean `pnpm install` (no release-age bypass) + Vitest / Playwright `axe-core` |
| **Full OS Process-Tree Idle RAM `< 300 MB` (Tier B) & `FootprintSlabArena < 60 MiB` (Tier A) / 10-Chart RSS (`SV-13`)** | Rust replay RSS `34.44 MiB` (`S08`); XPC/`WebView2` helper tree unmeasured | **`v0.1`** (Sprint 3–4) → **`v1.0`** GA lock | Packaged `.app`/`.msi` full process-tree profiler (`SV-13`) |
| **Async-Hydrated Cold Start `< 2.0 s` (unsigned `v0.1`, signed `v0.2`/`v1.0`)** | `S02` unsigned sync-200k-init hit `2,330.99 ms` | **`v0.1`** (Sprint 4) → **`v1.0`** GA lock | Packaged cold-start harness (`SV-01`, `SV-20`) |
| **macOS APFS Batched `PRAGMA fullfsync = ON` Kill-Switch (`<= 15–25 ms`)** | `S06` measured `synchronous=FULL` (`6.13–7.04 ms`) | **`v0.1`** (Sprint 2) → **`v0.5`** Live lock | macOS APFS `allegedly-oms` batched WAL bench (`ADR-0009`) |
| **`TA-Lib v0.8.3` (`BSD-3-Clause`) C Oracle Parity (`<= 1e-9`)** | Internal 4-runtime parity verified (`0.000e0`, `S07`) | **`v0.1`** (Sprint 3) | Dev-only CI golden parity test (`KC-06`) |
| **Cross-OS `SV-09` SHA-256 Replay Identity (Intel macOS + Windows)** | Verified on Apple M2 `aarch64` (`S08`) | **`v0.1`** (Sprint 4) → **`v1.0`** GA lock | `ci-nightly.yml` `5M`-tick SHA-256 check |
| **30-Min Peak-Volatility Live Dual-Venue Soak (`ST-11`)** | 60-sec soak verified (`S05`) | **`v0.1`** (Sprint 4) → **`v1.0`** GA lock | `ci-pre-release-soak.yml` (`BTC`/`ETH`/`SOL`, `depth=100`) |
| **Optional `wasmtime::component` (WIT) Size & Batch-Call Overhead + `.cwasm` Warm Cache (`< 1 ms`, `ST-33`)** | Flat linear memory `+3.32%` & cold `31.65 ms` measured (`S07`) | **`v0.2`** | Dedicated Wasmtime/WIT benchmark (`ADR-0005`) |
| **Real User Databento `.dbn.zst` CME Human Fixture (`ST-12`) & `10M`-Row L2 MBP Parquet Seek (`ST-16`)** | Synthetic DBN (`S05`) & `100M` trades (`S08`) verified | **`v0.2`** | Human `$125`-credit `.dbn.zst` fixture + L2 archive bench |
| **Native Pop-Out Drag-to-Detach Mixed-DPI Sync (`ST-30`, macOS + Windows)** | Single-OS `0.60 ms` hub sync verified (`S03`) | **`v0.2`** | Multi-window Playwright / `tauri-driver` E2E |
| **Live-Network Remote Paper Broker Smokes (`ST-37`: Alpaca Paper & tastytrade Cert)** | `54`-fault local `axum` wire-mock verified (`S06`) | **`v0.2`** (Opt-in) | Opt-in credential smoke outside PR CI |
| **24h `.atdepth` Liquidity Heatmap Soak (`< 64 MB` RAM / `< 30 MB` disk, `SV-13`, `UV-07`)** | Ring architecture locked; 24h UI soak unmeasured | **`v0.5`** (`ST-20`) → **`v1.0`** GA re-cert | 24h `.atdepth` soak profiler (`E04`/`E05`) |
| **Attorney Trademark Clearance (`Allegedly`, `RK-04`), CFTC Rule 4.41 & LGPL Sidecar Boundary** | Preliminary public-index check only (`2026-11-24`) | **`v0.5`** (LGPL `ST-17`) / **`v1.0`** (GA Trademark `ST-42` prior to public launch) | Qualified IP/securities counsel sign-off ([[Compliance-Notes]]) |
| **Linux X11/Wayland (`WebKitGTK`, `RK-01`, `ST-04`) Frame Times & Packaging** | Deferred per `A01` | **`Post-v1.0`** | Linux GPU/Wayland CI matrix (`KC-01`, `KC-02`) |

---

## 5. Cross-Links & Traceability

- **Phase 4 Roadmap Suite:** [[Epics-and-Stories]] · [[Sprint-Plan-v0.1]] · [[v0.1-Definition-of-Done]] · [[Roadmap.canvas]]
- **Charter & Governance:** [[Charter]] · [[Constraints]] · [[Principles]] · [[Assumptions]] · [[Glossary]]
- **Architecture & ADRs:** [[C4-Architecture]] · [[Data-Model]] · [[IPC-Contract]] · [[Plugin-ABI]] · [[Error-Observability]] · [[Testing-Strategy]] · [[Release-Signing-Update]] · [[Docs-Strategy]] · [[Adopt-Build-Fork]] · [[ADR-Status]]
- **Risk, Compliance & Evidence:** [[Risk-Register]] · [[Kill-Criteria]] · [[License-Registry]] · [[Compliance-Notes]] · [[Unverified-Claims]] · [[Red-Team-Phase3]] · [[Red-Team-Phase4]]
