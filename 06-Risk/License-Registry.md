---
title: "Allegedly Dependency License & Linkage Registry"
type: risk-registry
status: verified
owner: legal-licensing
updated: 2026-11-24
code_refs: []
---

# Dependency License & Linkage Registry

> **Chosen Core App License:** **`Apache-2.0`** (established in `[[02-Research/R09-Legal-Licensing]]` and locked in `[[04-Architecture/ADRs/0001-license-brand-and-platform-scope]]`).
> **Verification Protocol:** Every license below was verified directly from the upstream repository's verbatim `LICENSE` / `LICENCE.md` / `Cargo.toml` / `NOTICE` file or official legal documentation on **`2026-11-24`**. No dependency may be added to `Cargo.toml` or `package.json` without first clearing this registry and passing automated `v0.1` Implementation CI (post-Phase-5) gates (`cargo-deny` + npm SPDX audit).
> **Not Legal Advice:** Engineering license-compliance ledger; flag edge cases (e.g., LGPLv3 IPC sidecar boundaries) to qualified OSS counsel.

---

## 1. Complete Dependency License & Linkage Compatibility Table

### 1A. Approved Core Dependencies (Statically / Bundled Linked into Allegedly Core)

| Dependency | License (Verified from `LICENSE` / `Cargo.toml`) | Linkage / Scope | Obligations | Compatibility Verdict (with `Apache-2.0`) | Source ID |
|---|---|---|---|---|---|
| **`tauri-apps/tauri` (`v2.12.7`)** & `tauri-plugin-updater` (`v2.14.1`) | **`Apache-2.0 OR MIT`** | Static (Rust) + Bundled JS (`@tauri-apps/api`, Runtime) | Retain copyright & license notice in `THIRD_PARTY_NOTICES.md` | **COMPATIBLE (APPROVED)** | `R02-S01`, `R08-S17` |
| **`tradingview/lightweight-charts` (`v5.3.0`)** | **`Apache-2.0`** + mandatory **`NOTICE`** | Bundled JS (WebView, Runtime) | Preserve `LICENSE` + verbatim `NOTICE` (`Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/`) & visible attribution link/About notice | **COMPATIBLE (APPROVED — Attribution Mandatory)** | `R01-S01`, `R01-S02`, `R09-S04` |
| **`klinecharts/KLineChart` (`v10.1.1`)** *(Fallback 1)* | **`Apache-2.0`** | Bundled JS (WebView, Fallback) | Retain `LICENSE` & copyright notice | **COMPATIBLE (APPROVED FALLBACK)** | `R01-S09`, `R08-S17` |
| **`facebook/react` (`v19.3.1`)** | **`MIT`** | Bundled JS (Runtime) | Retain copyright & MIT notice | **COMPATIBLE (APPROVED)** | `R02-S20`, `R08-S17` |
| **`mathuo/dockview` (`v8.9.1`)** — **`dockview`, `dockview-core`, `dockview-react` ONLY** | **`MIT`** *(strictly excludes proprietary `dockview-enterprise`)* | Bundled JS (Runtime) | Retain MIT notice; **hard-block `dockview-enterprise`** in `package.json` & CI | **COMPATIBLE (APPROVED — Enterprise Package BANNED)** | `R02-S23`, `R09-S09` |
| **`caplin/FlexLayout` (`v0.11.2`)** *(Fallback)* | **`MIT`** | Bundled JS (Fallback) | Retain MIT notice | **COMPATIBLE (APPROVED FALLBACK)** | `R02-S24`, `R08-S17` |
| **`vercel-labs/ui` (`@ui-sdk/react` & `@ui-sdk/core` `0.1.0-beta.17`)** | **`Apache-2.0`** | Bundled JS (React 19+, Runtime) | Retain Apache-2.0 notice; exact-pin `0.1.0-beta.17` & track public-beta API stability | **COMPATIBLE (APPROVED — Primary UI SDK)** | `R02-S30`, `ADR-0010` |
| **`tailwindlabs/tailwindcss` (`v4.3.5`)** + *(fallback: `shadcn-ui/ui` `4.23.0` / `radix-ui/primitives`)* | **`MIT`** | Bundled CSS / Fallback source-copied JS (Runtime) | Retain MIT notices | **COMPATIBLE (APPROVED)** | `R02-S26`, `R08-S17` |
| **`pmndrs/zustand` (`v5.1.0`)** + **`@tanstack/table` (`9.3.1`)** + **`@tanstack/virtual` (`3.14.28`)** + **`@tanstack/query` (`5.108.4`)** | **`MIT`** | Bundled JS (Runtime) | Retain MIT notices | **COMPATIBLE (APPROVED)** | `R02-S27`, `R02-S28`, `R08-S17` |
| **`lucide-icons/lucide` (`lucide-react` `v1.79.0`)** | **`ISC`** (`LICENSE` verbatim) | Bundled JS/SVG (Runtime UI icons) | Retain ISC copyright & permission notice | **COMPATIBLE (APPROVED)** | `R02-S26`, `R08-S17` |
| **`JetBrains/JetBrainsMono` (`v2.304`)** & **`rsms/inter` (`v4.1`)** | **`OFL-1.1`** (SIL Open Font License 1.1) | Bundled font assets (`.woff2`, Runtime) | Retain OFL-1.1 license text; never sell fonts standalone; do not use Reserved Font Names if modified | **COMPATIBLE (APPROVED)** | `R02-S29`, `R08-S17` |
| **`Chlumsky/msdfgen` (`v1.13.1`)** / **`mapbox/tiny-sdf` (`v2.3.0`)** *(optional glyph build)* | **`MIT`** / **`BSD-2-Clause`** | Dev/build-time or Bundled JS | Retain MIT / BSD-2-Clause notices | **COMPATIBLE (APPROVED)** | `R01-S25`, `R01-S26`, `R08-S17` |
| **`mgeier/rtrb` (`v0.4.1`)** / **`agerasev/ringbuf` (`v0.4.0`)** | **`Apache-2.0 OR MIT`** | Static (Rust, Runtime) | Retain copyright & license notice | **COMPATIBLE (APPROVED)** | `R07`, `R08-S17` |
| **`rusqlite/rusqlite` (`v0.43.0`)** (+ bundled SQLite) | **`MIT`** (SQLite C source = **Public Domain**) | Static (Rust + C amalgamation, Runtime) | Retain `rusqlite` MIT notice | **COMPATIBLE (APPROVED)** | `R07`, `R08-S17` |
| **`apache/arrow-rs` / `parquet` (`v60.2.0`)** | **`Apache-2.0`** | Static (Rust, Runtime) | Retain `LICENSE` & Apache `NOTICE` | **COMPATIBLE (APPROVED)** | `R07-S05`, `R08-S17` |
| **`apache/datafusion` (`v56.0.0`)** | **`Apache-2.0`** | Not linked *(rejected in `ADR-0006` on binary budget)* | Retain `LICENSE` & Apache `NOTICE` if ever reconsidered | **COMPATIBLE (PERMISSIVE — REJECTED ON FIT IN `ADR-0006`)** | `R07-S06`, `R08-S17`, `ADR-0006` |
| **`databento/dbn` (`v0.75.0`)** | **`Apache-2.0`** | Static (Rust, Runtime) | Retain `LICENSE` & copyright notice | **COMPATIBLE (APPROVED)** | `R03-S27`, `R08-S17` |
| **`bytecodealliance/wasmtime` (`v51.0.0`)** | **`Apache-2.0 WITH LLVM-exception`** | Static (Rust, Runtime) | Retain `LICENSE` & `NOTICE` (LLVM-exception adds extra compatibility, zero extra burden) | **COMPATIBLE (APPROVED — Passed `S07`, `+1.74 MiB` gzip-9)** | `R06-S04`, `R08-S17`, `ADR-0005` |
| **`rhaiscript/rhai` (`v1.27.0`)** | **`MIT OR Apache-2.0`** | Not linked *(rejected in `S07`/`ADR-0005` on perf & bus factor)* | Retain copyright & license notice if ever reconsidered | **COMPATIBLE (PERMISSIVE — REJECTED ON FIT IN `ADR-0005`)** | `R06-S06`, `R08-S17`, `ADR-0005` |
| **`mlua-rs/mlua` (`v0.12.3`)** + **`luau-lang/luau` (`0.748`)** | **`MIT`** (`LICENSE` verbatim) | Static (Rust + C++ vendored, Runtime) | Retain MIT notices for both `mlua` and `luau` | **COMPATIBLE (APPROVED — Selected in `S07`/`ADR-0005`, `+0.47 MiB` gzip-9)** | `R06-S20`, `R06-S21`, `R08-S17`, `ADR-0005` |
| **`dtolnay/thiserror` (`v2.0.21`)** | **`MIT OR Apache-2.0`** *(verified `Cargo.toml` `2026-11-24`)* | Static (Rust proc-macro / Runtime typed error enums across `allegedly-*`) | Retain copyright & license notice in `THIRD_PARTY_NOTICES.md` | **COMPATIBLE (APPROVED — Runtime/Core)** | `Error-Observability` |
| **`tokio-rs/tracing` (`tracing`)** | **`MIT`** *(verified `Cargo.toml` `2026-11-24`)* | Static (Rust, Runtime structured diagnostics instrumentation) | Retain MIT notice | **COMPATIBLE (APPROVED — Runtime/Observability)** | `Error-Observability` |
| **`tokio-rs/tracing` (`tracing-subscriber`)** | **`MIT`** *(verified `Cargo.toml` `2026-11-24`)* | Static (Rust, Runtime subscriber/layer pipeline: `RedactingLayer` + `rtrb` ring) | Retain MIT notice | **COMPATIBLE (APPROVED — Runtime/Observability)** | `Error-Observability` |
| **`tokio-rs/tracing` (`tracing-appender`)** | **`MIT`** *(verified `Cargo.toml` `2026-11-24`)* | Static (Rust, Runtime non-blocking rotating JSONL file appender) | Retain MIT notice | **COMPATIBLE (APPROVED — Runtime/Observability)** | `Error-Observability` |
| **`GREsau/schemars` (`v1.2.3`)** | **`MIT`** *(verified `Cargo.toml` `2026-11-24`)* | Static (Rust, Runtime/Schema JSON Schema derive for Settings-as-Code & `allegedly-docgen`) | Retain MIT notice | **COMPATIBLE (APPROVED — Runtime/Schema)** | `Docs-Strategy`, `ADR-0010` |
| **`open-source-cooperative/keyring-rs` (`v4.2.0`)** (`keyring-core`) | **`MIT OR Apache-2.0`** | Static (Rust, Runtime) + OS dynamic system libs (Security.framework / Win32) | Retain notice; uses OS system libraries under standard platform exception | **COMPATIBLE (APPROVED)** | `R08-S12` |
| **`barter-rs/barter-rs` (`v0.2.1`)** *(v0.2 crypto exec)* | **`MIT`** | Static (Rust, Runtime) | Retain MIT notice | **COMPATIBLE (APPROVED)** | `R04-S33`, `R08-S17` |
| **`wboayue/rust-ibapi` (`v5.7.0`)** *(optional future plugin; `v0.5` uses IBKR Client Portal Web API)* | **`MIT`** | Static (Rust, optional Cargo feature, Runtime) | Retain MIT notice; clean-room socket client (zero IBKR GPL code) | **COMPATIBLE (APPROVED — Optional Plugin)** | `R03-S30`, `R08-S17` |
| **`Sierra Chart DTC Wire Spec`** (`DTCProtocol.php`) | **Public Domain** (no patent/copyright) | Clean-room Rust implementation (Runtime) | **Execution-only wire protocol**; NEVER extract Sierra Chart/Denali market data | **COMPATIBLE (Execution-Only; Data BANNED)** | `R04-S22`, `R04-S23` |

---

### 1B. Approved Optional Sidecars, Protocol References & Conditional Fallbacks

| Dependency | License (Verified from `LICENSE`) | Linkage / Scope | Obligations | Compatibility Verdict (with `Apache-2.0`) | Source ID |
|---|---|---|---|---|---|
| **`duckdb/duckdb` (`v2.0.1`)** | **`MIT`** | **Process-sidecar** (or optional dynamic plugin; avoids `18.4–26.9 MB` core bloat) | Retain MIT notice if distributed; zero obligation if user brings own DuckDB CLI | **COMPATIBLE (APPROVED AS OPTIONAL SIDECAR)** | `R07-S07`, `R08-S17` |
| **`nautechsystems/nautilus_trader` (`v1.231.0`)** | **`LGPL-3.0-only`** (`Cargo.toml` + `LICENSE`) + **`TRADEMARK.md`** + **`CLA.md`** | **Process-sidecar ONLY** (shared Parquet vault + JSON-RPC/Arrow IPC; **NEVER statically link crates**) | Never statically link into Allegedly binary; never use `NautilusTrader` mark as prefix/package name; keep process boundary cleanly decoupled `[ATTORNEY REVIEW REQUIRED]` | **COMPATIBLE ONLY AS OUT-OF-PROCESS SIDECAR (STATIC LINK BANNED)** | `R04-S35`, `R07-S20`, `R08-S05` |
| **`QuantConnect/Lean`** | **`Apache-2.0`** | **Process-sidecar** (external Docker/.NET CLI over Parquet) | Retain notice if integration adapter ships | **COMPATIBLE (OPTIONAL SIDECAR)** | `R07-S22`, `R08-S04` |
| **`nkaz001/hftbacktest` (`rust-v0.9.4`)** | **`MIT`** | Reference / optional Static Rust crate | Retain MIT notice if crate or adapted code is used | **COMPATIBLE (APPROVED REFERENCE / OPTIONAL CRATE)** | `R07-S21`, `R08-S17` |
| **`electron/electron` (`v45.5.0`)** *(Fallback if `KC-02` trips)* | **`MIT`** (Chromium components BSD/MIT/Apache/LGPL-dynamic) | Shell fallback | Retain Electron/Chromium third-party notices if pivoted | **COMPATIBLE (FALLBACK SHELL)** | `R02-S05`, `R08-S17` |
| **`emilk/egui` (`v0.37.0`)** + **`gfx-rs/wgpu` (`v30.0.2`)** *(Native fallback)* | **`MIT OR Apache-2.0`** | Static (Rust, fallback only) | Retain notices | **COMPATIBLE (FALLBACK RENDERER)** | `R01-S23`, `R02-S08`, `R08-S17` |
| **`ferranbt/pinecone` (`v0.2.6`)** *(v0.4+ watchlist)* | **`MPL-2.0`** | Conditional Static (file-level weak copyleft) | Under MPL-2.0 §3.3, any edits to `pinecone`'s own files must remain MPL-2.0 & source made available; rest of Allegedly remains `Apache-2.0` | **COMPATIBLE (CONDITIONAL WATCHLIST — Keep Files Isolated)** | `R06-S14`, `R09-S03` |
| **`dxFeed/dxLink`** *(Post-v0.2 partner plugin)* | **`MPL-2.0`** | Conditional Static/Bundled | Same MPL-2.0 §3.3 file-level obligation | **COMPATIBLE (OPTIONAL PLUGIN)** | `R03-S28`, `R09-S03` |
| **`OpenBB-finance/OpenBB` (`V5 ODP`)** | **`Apache-2.0`** *(since `2026-09-29`; V4 & `openbb-forecast` remain `AGPL-3.0`!)* | Optional external Python sidecar / reference | **Pin strictly to V5+ (`>= 5.0.0`)**; never pull V4 `AGPL-3.0` packages | **COMPATIBLE (V5+ SIDECAR ONLY; V4 BANNED)** | `R08-S02`, `R08-S03` |
| **`ccxt/ccxt` (`v4.5.94`)**, **`hummingbot/hummingbot` (`v2.18.0`)**, **`alpacahq/alpaca-py`**, **`alpacahq/alpaca-trade-api-js`**, **`tastyware/tastytrade`**, **`tastytrade-api-js`**, **`massive-com/client-python`**, **`ib-api-reloaded/ib_async`** | `MIT` / `Apache-2.0` / `BSD-2-Clause` | Protocol reference / optional external scripts | Retain notices if adapted; inspect & strip default exchange broker IDs if referencing `ccxt` | **COMPATIBLE (APPROVED REFERENCES)** | `R03-S30`, `R04-S32`–`S34`, `R08-S17` |
| **`questdb/questdb` (`v10.2.0`)** & **`ClickHouse/ClickHouse`** | **`Apache-2.0`** (QuestDB OSS core; Enterprise is Commercial) | Optional external user-hosted DB connector (wire protocol only) | Do not bundle server daemons; do not depend on QuestDB Enterprise `#XNYS` calendars | **COMPATIBLE (EXTERNAL CONNECTOR ONLY)** | `R07-S09`–`S11`, `R08-S17` |
| **`apache/echarts` (`v6.1.0`)**, **`pixijs/pixijs` (`v8.23.0`)**, **`zipline-reloaded` (`v3.2.1`)**, **`jesse-ai/jesse`** | `Apache-2.0` / `MIT` | Optional (ECharts for equity curves) / Rejected (domain fit) | Standard permissive notices if ECharts used for backtest reports | **COMPATIBLE (ECharts OK for BI Charts; Others Rejected on Fit)** | `R01-S15`, `R01-S21`, `R07-S25`, `R08-S07` |

---

### 1C. Dev-Only, CI & Docs/Build Tooling (Not Linked into App Core Binary)

| Dependency | License (Verified) | Linkage / Scope | Obligations | Compatibility Verdict (with `Apache-2.0`) | Source ID |
|---|---|---|---|---|---|
| **`TA-Lib/ta-lib` (`v0.8.3`)** | **`BSD-3-Clause`** | **Dev-only / CI test oracle** | Not shipped in runtime binary; retain BSD-3-Clause notice in test suite | **COMPATIBLE (APPROVED CI ORACLE)** | `R06-S27`, `R08-S17` |
| **`EmbarkStudios/cargo-deny` (`v0.22.1`)** | **`MIT OR Apache-2.0`** | **Dev-only / CI gate** | None for distributed binary | **COMPATIBLE (APPROVED CI TOOL)** | `R08-S13` |
| **`withastro/starlight` (`Astro Starlight`)** | **`MIT`** *(verified GitHub `LICENSE` `2026-11-24`)* | **Docs/Build-Only** (static site generator for GitHub Pages + offline local docs bundle; not linked into app binary) | Retain MIT notice in docs repo / generated docs bundle | **COMPATIBLE (APPROVED — Docs/Build-Only)** | `Docs-Strategy` |
| **`vuejs/vitepress` (`VitePress`)** | **`MIT`** *(verified GitHub `LICENSE` `2026-11-24`)* | **Docs/Build-Only** (alternative static docs generator to Astro Starlight; not linked into app binary) | Retain MIT notice in docs repo if selected | **COMPATIBLE (APPROVED — Docs/Build-Only)** | `Docs-Strategy` |
| **`Pagefind/pagefind` (`Pagefind`)** | **`MIT`** *(verified GitHub `LICENSE` `2026-11-24`)* | **Docs/Build-Only** (static search indexer + bundled JS/WASM inside optional offline local docs bundle; not linked into Rust core) | Retain MIT notice in generated docs bundle | **COMPATIBLE (APPROVED — Docs/Build-Only)** | `Docs-Strategy` |

---

### 1D. Hard-Disqualified Dependencies & License Traps (`DO NOT LINK / DO NOT EMBED`)

| Dependency | Actual Verified License / Restriction | Linkage Status | Why Disqualified Under `Apache-2.0` & `[[01-Charter/Constraints]]` #1 | Compatibility Verdict | Source ID |
|---|---|---|---|---|---|
| **TradingView Charting Library (`Advanced Charts` / `Trading Platform`)** | **Proprietary** (private repo; public-website-only or paid commercial; non-redistributable) | **DISQUALIFIED** | Violates FOSS-or-die, `$0` core, local-first offline desktop; strictly banned from public FOSS repos | **INCOMPATIBLE — BANNED** | `R01-S07`, `R01-S08` |
| **`jones2000/HQChart`** | `Apache-2.0` file **contradicted by custom Chinese `用户协议.txt`** (unilateral termination without notice; PRC field-of-use limits; paid modules) | **DISQUALIFIED** | Non-OSI contradictory terms; revocable license | **INCOMPATIBLE — BANNED** | `R01-S17`, `R01-S18` |
| **`dockview-enterprise`** (inside `mathuo/dockview`) | **Proprietary commercial license** (`packages/dockview-enterprise/LICENCE.md`) | **DISQUALIFIED** | Proprietary enterprise package inside MIT monorepo | **INCOMPATIBLE — BANNED** | `R02-S23`, `R09-S09` |
| **`slint-ui/slint` (`v1.19.1`)** | Triple: **`GPL-3.0`** / **Proprietary `Royalty-free 2.0`** / **Commercial** | **DISQUALIFIED** | Cannot statically link into `Apache-2.0` app without triggering GPLv3 copyleft or accepting non-OSI proprietary terms | **INCOMPATIBLE WITH `Apache-2.0`** | `R02-S09`, `R09-S10` |
| **IBKR Official TWS API (`v10.49+`, Aug 2026)** | **`GPL-3.0-or-later`** (pre-`10.49` was proprietary Non-Commercial) | **DISQUALIFIED** | Strong copyleft contamination on static/direct linkage; clean-room `rust-ibapi` (`MIT`) solves completely | **INCOMPATIBLE WITH `Apache-2.0`** | `R03-S29`, `R09-S11` |
| **`flowsurface-rs/flowsurface`** (`flowsurface`, `flowsurface-data`) | **`GPL-3.0-or-later`** | **DISQUALIFIED** | Strong copyleft (`GPL-3.0`) incompatible with `Apache-2.0` core; clean-room UX study only | **INCOMPATIBLE WITH `Apache-2.0`** | `R08-S01` |
| **`alaa-eddine/PineTS` (`v0.14.0`)** | **`AGPL-3.0`** (dual commercial, LuxAlgo) | **DISQUALIFIED** | Strong network copyleft incompatible with `Apache-2.0` | **INCOMPATIBLE — BANNED** | `R06-S07`, `R08-S17` |
| **`be-thomas/OpenPineScript`** | **`GPL-3.0`** | **DISQUALIFIED** (core) | Strong copyleft incompatible with `Apache-2.0` core | **INCOMPATIBLE WITH `Apache-2.0`** | `R06-S12`, `R08-S17` |
| **`pineforge-4pass/pineforge-codegen-oss` (`v1.14.0`)** | **`PineForge Source License 1.2`** (`2026-10-05` — **NON-FOSS**, bans prop-firm/funded accounts as personal use!) | **DISQUALIFIED** | Non-OSI source-available trap + explicitly harms prop-firm users (`A03`) | **INCOMPATIBLE — BANNED** | `R06-S10`, `R09-S12` |
| **`elbakramer/pynescript`** & **`TulipCharts/tulipindicators`** | **`LGPL-3.0`** (both stagnant/stale) | **DISQUALIFIED** | Static linking triggers LGPL-3.0 relinking; unmaintained | **INCOMPATIBLE (Static Link)** | `R06-S11`, `R06-S29`, `R08-S17` |
| **`man-group/ArcticDB` (`v7.0.0`)** | **`Business Source License 1.1` (`BSL 1.1`)** | **DISQUALIFIED** | Non-OSI source-available (prohibits Database Service use) | **INCOMPATIBLE — BANNED** | `R07-S12`, `R09-S13` |
| **`timescale/timescaledb` (`v2.32.1`)** | Dual: `Apache-2.0` + **non-OSI `Timescale License (TSL)`** (`tsl/` compression & continuous aggregates) | **DISQUALIFIED** | Core time-series features are non-OSI `TSL` | **INCOMPATIBLE — BANNED** | `R07-S13`, `R09-S13` |
| **`polakowo/vectorbt` (`v1.2.1`)** | **`Apache-2.0` WITH `Commons Clause v1.0`** | **DISQUALIFIED** | Non-OSI restriction prohibiting selling/commercializing software | **INCOMPATIBLE — BANNED** | `R07-S24`, `R09-S13` |
| **`mementum/backtrader`**, **`robcarver17/pysystemtrade`**, **`freqtrade/freqtrade`**, **`Drakkar-Software/OctoBot`** | **`GPL-3.0`** | **DISQUALIFIED** (core) | Strong copyleft incompatible with `Apache-2.0` core | **INCOMPATIBLE WITH `Apache-2.0`** | `R07-S26`, `R07-S27`, `R08-S06`, `R08-S09` |
| **`StockSharp/StockSharp`** | **StockSharp Custom Proprietary License / EULA** | **DISQUALIFIED** | Explicitly non-FOSS proprietary | **INCOMPATIBLE — BANNED** | `R08-S10` |
| **`kvarenzn/tree-sitter-pine`**, **`CHANGGELY/pine-script-compiler`** | **NO LICENSE (All Rights Reserved)** | **DISQUALIFIED** | Default copyright prohibits any copying, modification, or redistribution | **INCOMPATIBLE — BANNED** | `R06-S17`, `R06-S18` |
| **Rithmic SDK / `.proto`**, **CQG Enterprise SDK** | **Closed NDA / Enterprise Commercial Contracts** | **DISQUALIFIED** | Non-redistributable NDA assets; violates FOSS-or-die & `$0` core | **INCOMPATIBLE — BANNED** | `R04-S20`, `R04-S21` |

---

## 2. Automated CI License Enforcement Policy (`v0.1` Implementation CI, post-Phase-5)

To enforce `[[06-Risk/Kill-Criteria]]` (`KC-04`) automatically on every pull request:

1. **Rust Workspace (`EmbarkStudios/cargo-deny v0.22.1` — `deny.toml`):**
   - `allow = ["Apache-2.0", "Apache-2.0 WITH LLVM-exception", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Zlib", "Unicode-3.0", "BSL-1.0", "CC0-1.0", "Unlicense"]`
   - `MPL-2.0` permitted **only** via explicit per-crate `exceptions` (verifying file-level isolation).
   - **Hard CI Failure** on any transitive dependency carrying `GPL-*`, `AGPL-*`, `LGPL-*`, `BUSL-1.1`, `Commons-Clause`, `SSPL-*`, `Proprietary`, or `NOASSERTION` / unlicensed crates.
2. **Frontend Workspace (`package.json` + SPDX CI Check):**
   - Allowlist strictly `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `OFL-1.1`, `CC0-1.0`, `0BSD`.
   - Explicit package denylist blocking **`dockview-enterprise`**, **`hqchart`**, and any **`@tradingview/charting_library`** package name.
3. **Mandatory Attribution Artifacts Built into Every Release:**
   - Generate `THIRD_PARTY_NOTICES.md` automatically in CI (via `cargo-about` + frontend license bundler) and embed it inside the installer and the in-app **Help → About & Legal Notices** view.
   - Explicitly render the verbatim **TradingView Lightweight Charts `NOTICE`** (`TradingView Lightweight Charts™ · Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/`) and **SIL OFL-1.1** notices for `JetBrains Mono` and `Inter`.
