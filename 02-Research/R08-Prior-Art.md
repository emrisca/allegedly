---
title: "R08 — FOSS Prior-Art Survey & Adopt/Build/Fork Strategy"
track: R08
status: verified
owner: research-priorart
updated: 2026-11-24
code_refs: []
---

# R08 — FOSS Prior-Art Survey & Adopt/Build/Fork Strategy

## Question

Which existing open-source trading terminals, charting engines, order-flow apps, execution frameworks, scripting runtimes, and backtesting/storage engines can MotiveView **Adopt** or **Fork** directly (versus where targeted clean-room **Build** is strictly justified because no suitable FOSS candidate exists), while satisfying all eight [[Constraints#1. Eight Design Non-Negotiables|Design Non-Negotiables]] (`FOSS or die`, `$0 core`, `local-first`, `macOS/Windows/Linux parity`, `< 40 MB` installer, `< 300 MB` idle RAM, `60 fps` charts, fixed-point financial math, honest data provenance)?

---

## Findings

All repositories, star counts, last-push dates, release tags, open issue counts, contributor concentrations (bus factor), and verbatim `LICENSE` files below were independently verified directly via the GitHub API (`repos`, `license`, `releases/latest`, `contributors`, `Cargo.toml`) and official vendor documentation on `2026-11-24`.

### 1. Whole-Application FOSS Prior-Art Terminals & Trading Platforms

| Project (`owner/repo`) | Stack & Scope | Stars (`2026-11-24`) | Last Push / Latest Release | Verified `LICENSE` (Verbatim) | Bus Factor & Health | Why Adopt / Fork / Reject for MotiveView |
|---|---|---|---|---|---|---|
| **Flowsurface** (`flowsurface-rs/flowsurface`) [`R08-S01`] | Pure Rust desktop crypto order-flow terminal (`iced 0.14.0` + `wgpu`): Time & Sales, DOM Ladder, Liquidity Heatmap, Footprint Bars, Volume Profiles, Arrow IPC (`arrow-ipc 59.1`), `.ind` scripting | 1,839 | `2026-11-18` / `v0.9.0` (`2026-10-27`) | **Split workspace:** App + `flowsurface-data` = **`GPL-3.0-or-later`**; `flowsurface-indicator-engine` = **`Apache-2.0`**; `flowsurface-exchange` = **`MIT`** [`R08-S01`] | **High bus-factor risk:** `akenshaw` accounts for `519/537` top-5 commits (`96.6%`); `7` open issues (very active solo author) | **Closest architectural prior art in FOSS, but REJECT as fork base:** (1) App core & data crates are `GPL-3.0-or-later` (incompatible with MotiveView's `Apache-2.0` license — [[R09-Legal-Licensing]]); (2) built on `iced` (forfeits Lightweight Charts, Dockview, Radix/shadcn a11y, and drawing ecosystem from [[R01-Charting-Rendering]] & [[R02-Shell-UI-Stack]]); (3) crypto-only (Binance/Bybit/Hyperliquid/OKX/MEXC — zero US-safe Kraken/Coinbase defaults, zero CME futures, zero broker OMS, zero replay/backtest). **Use strictly as clean-room UX/architecture benchmark** (or inspect MIT `flowsurface-exchange` / Apache-2.0 `flowsurface-indicator-engine` independently if ever needed). |
| **OpenBB / Open Data Platform (ODP)** (`OpenBB-finance/OpenBB`) [`R08-S02`] | Python multi-provider financial data aggregation platform + FastAPI + CLI + MCP server; OpenBB Workspace transitioned to FINOS (Linux Foundation) | 75,709 | `2026-11-18` / `ODP` (`2026-09-30`) | **`Apache-2.0`** (verified verbatim in `LICENSE`! **Switched from `AGPL-3.0-only` to `Apache-2.0` on `2026-09-29` in V5 PR `#7489`/`#7677`** after OpenBB Inc. wound down; V4 & legacy repos like `openbb-forecast` remain `AGPL-3.0`) [`R08-S02`], [`R08-S03`] | Multi-maintainer (`1,035/3,105` top-1); stewardship transitioning to **OpenBQ** (`openbq-org`) & **FINOS**; `134` open issues | **REJECT as core / OPTIONAL research reference:** Now permissively `Apache-2.0` (eliminating prior AGPL risk), **but** Python-heavy fundamental/equity research architecture with zero tick/L2/L3 order-flow engine, zero native desktop chart/DOM rendering, and heavy runtime footprint violating `< 40 MB` / zero-GC budgets. |
| **QuantConnect Lean** (`QuantConnect/Lean`) [`R08-S04`] | C# (.NET) + Python algorithmic trading & multi-asset backtest engine | 22,693 | `2026-11-24` / rolling Docker/NuGet (GH tag `v2.4.0.1` stale since `2017-08-08`) | **`Apache-2.0`** [`R08-S04`] | Strong team (`2,554/9,353` top-1); `335` open issues; daily commits | **ADOPT ONLY AS OPTIONAL EXTERNAL SIDECAR (v0.4+):** Clean `Apache-2.0`, but `.NET` runtime + Docker (`> 200 MB`) is incompatible with lightweight desktop core, and lacks native L3 MBO order-flow UI/queue fidelity. |
| **NautilusTrader** (`nautechsystems/nautilus_trader`) [`R08-S05`] | Rust core + Python/Cython institutional event-driven trading & L1/L2/L3 backtest platform (Databento DBN native, Parquet catalog) | 31,788 | `2026-11-25` / `v1.231.0` (`2026-08-02`) | **`LGPL-3.0-only`** (verified verbatim in root `Cargo.toml` + `LICENSE`, resolving [[R04-Execution-Brokers-Props]] vs [[R07-Storage-Replay-Backtest]]) + **`TRADEMARK.md`** + **`CLA.md`** [`R08-S05`] | `cjdsellers` `20,049/21,194` top-5 commits; commercial backing (Nautech Systems); `129` open issues | **ADOPT STRICTLY AS OPTIONAL OUT-OF-PROCESS SIDECAR (v0.4+):** Static Rust linking of `LGPL-3.0-only` crates into an `Apache-2.0` binary triggers LGPL §4(d) relinking/object-file obligations; also has no desktop charting UI. Running externally over shared Parquet + JSON-RPC/Arrow IPC gives institutional backtest interoperability with zero license contamination or installer bloat. |
| **Freqtrade** (`freqtrade/freqtrade`) [`R08-S06`] | Python crypto trading bot, FreqUI web dashboard, Hyperopt, FreqAI | 57,236 | `2026-11-24` / `2026.10` (`2026-10-30`) | **`GPL-3.0`** [`R08-S06`] | Strong community (`19,951/25,533` top-1); `27` open issues | **REJECT for core (GPL-3.0 + Python bot):** Strong copyleft (`GPL-3.0`), crypto-bar bot architecture (no L2/L3 DOM, Footprint, or CME futures). Architectural reference only. |
| **Jesse** (`jesse-ai/jesse`) [`R08-S07`] | Python crypto backtesting & live-trading framework | 8,832 | `2026-11-23` / no GH releases (PyPI releases) | **`MIT`** (core repo; live-trading plugin is commercial) [`R08-S07`] | `saleh-mir` `2,307/3,307` top-5; `11` open issues | **REJECT:** Python-only, crypto-candle focused (no L2/L3 order flow or CME futures), live execution is commercial add-on. |
| **Superalgos** (`Superalgos/Superalgos`) [`R08-S08`] | Node.js/JS visual crypto bot designer & charting UI | 5,821 | `2026-11-14` / `v1.6.1` (`2024-11-02`) | **`Apache-2.0`** [`R08-S08`] | Slowing release cadence (`2+` yrs since release); `107` open issues | **REJECT:** Heavy Node.js workspace, crypto-only, no native desktop order-flow performance or CME futures support. |
| **OctoBot** (`Drakkar-Software/OctoBot`) [`R08-S09`] | Python crypto automated trading bot + web UI | 6,983 | `2026-11-24` / `3.0.0-beta3` (`2026-10-08`) | **`GPL-3.0`** [`R08-S09`] | Active (`1,544/2,607` top-1); `197` open issues | **REJECT:** `GPL-3.0` copyleft + Python crypto bot (no tick/order-flow charting terminal). |
| **StockSharp** (`StockSharp/StockSharp`) [`R08-S10`] | C# (.NET) multi-broker trading platform & connectors | 11,157 | `2026-11-22` / `5.0.0` (`2020-03-27`) | **PROPRIETARY CUSTOM LICENSE** (`LICENSE` verbatim: *"This repository is not licensed under a general-purpose open source license... permitted only under the StockSharp EULA"*) [`R08-S10`] | Single primary author (`11,042/12,298`) | **HARD DISQUALIFIED:** Non-FOSS proprietary EULA directly violates [[Constraints#1. Eight Design Non-Negotiables]] #1. |
| **Shioaji Pro / OpenTerminalUI / Superior-Trade** [`R08-S11`] | Niche web/Python/AI terminals (`407`–`1,102` stars) | 407–1,102 | `2026-11-21`–`24` | `AGPL-3.0` (`shioaji-pro-app`), `MIT` (`OpenTerminalUI`), `Apache-2.0` (`Superior-Trade`) [`R08-S11`] | Young/single-venue (Taiwan TWSE, Hyperliquid AI, Python equity screener) | **REJECT:** Venue-specific or web/Python AI wrappers; none provide cross-platform local-first CME + crypto order-flow terminals. |

**Key Whole-App Finding:** **No existing FOSS project** combines cross-platform local-first desktop execution (`< 40 MB`), multi-asset CME futures + crypto order-flow (Footprint, Volume/TPO Profile, DOM Ladder, Liquidity Heatmap), clean-room scripting, and permissive (`Apache-2.0`/`MIT`) licensing. The single closest FOSS desktop order-flow app — **`flowsurface-rs/flowsurface`** — is `GPL-3.0-or-later`, single-author (`96.6%` commits), crypto-only, `iced`-bound, and lacks CME futures, broker execution, replay, and backtesting.

---

### 2. Component-Level FOSS Prior-Art Synthesis (Cross-Verified Against R01–R07)

To obey our **hard bias toward FOSS adoption**, MotiveView decomposes the terminal into 18 discrete subsystems (detailed in [[Adopt-Build-Fork]]) and **adopts battle-tested permissive FOSS** for every commodity infrastructure layer:

1. **Desktop Shell & Updater (`R02`):** **Adopt `tauri-apps/tauri` (`v2.12.7`, `Apache-2.0 OR MIT`, `113,116★`, pushed `2026-11-24`)** + `tauri-plugin-updater` (`v2.14.1`, Minisign Ed25519). Reject `slint-ui/slint` (GPLv3 or proprietary Royalty-free 2.0) and keep `electron/electron` (`v45.5.0`, MIT, `124,074★`) strictly as Linux WebKitGTK kill-criterion fallback (`KC-02`).
2. **Base Financial Charting (`R01`):** **Adopt `tradingview/lightweight-charts` (`v5.3.0`, `Apache-2.0` + `NOTICE`, `17,978★`, pushed `2026-11-18`)** with `klinecharts/KLineChart` (`v10.1.1`, `Apache-2.0`, `4,332★`) as Fallback 1. Hard-disqualify TradingView Charting Library (proprietary) and `jones2000/HQChart` (`Apache-2.0` contradicted by unilateral-termination Chinese `用户协议.txt`).
3. **UI Chrome, Docking, Virtualization, Icons & Fonts (`R02`):** **Adopt** `facebook/react` (`19.3.1`, MIT), `mathuo/dockview` (`v8.9.1`, **MIT `dockview`/`dockview-core`/`dockview-react` ONLY** — hard-block proprietary `dockview-enterprise`), `shadcn/ui` + `radix-ui/primitives` + `tailwindcss` (`MIT`), `pmndrs/zustand` (`MIT`), `@tanstack/table` + `@tanstack/virtual` + `@tanstack/query` (`MIT`), `lucide-icons/lucide` (`ISC`, `25,985★`), `JetBrains/JetBrainsMono` & `rsms/inter` (`OFL-1.1`).
4. **Market Data & Broker Adapters (`R03`, `R04`):** **Adopt** `databento/dbn` (`v0.75.0`, `Apache-2.0`, pushed `2026-11-24`), `barter-rs/barter-rs` (`v0.2.1`, `MIT`, `2,377★`), `wboayue/rust-ibapi` (`v5.7.0`, `MIT`, `405★`, pushed `2026-11-25`) — avoiding IBKR's official TWS API v10.49+ `GPL-3.0` transition (`2026-08-03`) — plus reference `ib-api-reloaded/ib_async` (`BSD-2-Clause`, `1,796★`), `alpacahq/alpaca-py` (`Apache-2.0`), `tastyware/tastytrade` (`MIT`), `massive-com/client-python` (`MIT`), and `ccxt/ccxt` (`MIT`, `44,977★`) as exchange-quirk references.
5. **Storage, Ring Buffers & Serialization (`R07`):** **Adopt** `mgeier/rtrb` (`v0.4.1`, `Apache-2.0 OR MIT`) or `agerasev/ringbuf` (`v0.4.0`, `Apache-2.0 OR MIT`), `rusqlite/rusqlite` (`v0.43.0`, `MIT`, `4,512★`), `apache/arrow-rs` (`parquet v60.2.0`, `Apache-2.0`, `3,678★`), optional `apache/datafusion` (`v56.0.0`, `Apache-2.0`, `9,657★` — pending S08 size gate), and optional out-of-process `duckdb/duckdb` (`v2.0.1`, `MIT`, `43,302★`). Disqualify `ArcticDB` (`BSL 1.1`) and `TimescaleDB` (`TSL`).
6. **Plugin / Scripting Runtimes & Indicator Parity (`R06`):** **Adopt** `bytecodealliance/wasmtime` (`v51.0.0`, `Apache-2.0 WITH LLVM-exception`, `18,892★`), `rhaiscript/rhai` (`v1.27.0`, `MIT OR Apache-2.0`, `5,831★`) OR `mlua-rs/mlua` (`v0.12.3`, `MIT`) + `luau-lang/luau` (`0.748`, `MIT`, `6,146★`) (decided by S07), and `TA-Lib/ta-lib` (`v0.8.3`, `BSD-3-Clause`) as CI numerical-parity oracle. Disqualify `PineTS` (`AGPL-3.0`), `OpenPineScript` (`GPL-3.0`), `pineforge-codegen-oss` (`PineForge Source License 1.2` non-FOSS), and `tulipindicators` (`LGPL-3.0`, stagnant since `2024-02-02`).
7. **Secrets & CI License Governance (New in R08/R09):** **Adopt** `open-source-cooperative/keyring-rs` (`v4.2.0`, `MIT OR Apache-2.0`, `785★`, pushed `2026-11-19`, native macOS Keychain / Windows Credential Manager / Linux Secret Service + heap leak test + Tauri v2 demo) [`R08-S12`] and `EmbarkStudios/cargo-deny` (`v0.22.1`, `MIT OR Apache-2.0`, `2,509★`, pushed `2026-11-24`) [`R08-S13`].
8. **Backtest Microstructure Reference (`R07`):** **Adopt (patterns/optional crate)** `nkaz001/hftbacktest` (`rust-v0.9.4`, `MIT`, `5,137★`) for L2/L3 queue-position & latency math; **Adopt as optional out-of-process sidecar** `nautechsystems/nautilus_trader` (`v1.231.0`, `LGPL-3.0-only`). Disqualify `vectorbt` (`Apache-2.0` + non-OSI `Commons Clause v1.0`), `backtrader` (`GPL-3.0`, dormant), and `pysystemtrade` (`GPL-3.0`, daily-only).

---

### 3. Proprietary Crypto Order-Flow UIs (UX-Study-Only — Zero Code Reuse)

Per [[Constraints#1. Eight Design Non-Negotiables]] #1, proprietary order-flow UIs are strictly **UX-study-only** (public screenshots, docs, and workflow ergonomics only; **zero** code, asset, shader, or reverse-engineering reuse). Verified operational status as of `2026-11-24`:

| Platform | 2026 Operational Status | License / Commercial Model | Order-Flow UX Strengths Worth Studying (Clean-Room Only) | Hard Boundary |
|---|---|---|---|---|
| **Exocharts** (`exocharts.com`, UAB Reaktyvinės idėjos) [`R08-S14`] | **Active** (Web + Windows/macOS Desktop) | **Proprietary** (Free limited; Web €23–€28/mo; Desktop Pro €38–€49/mo + VAT; separate dxFeed CME sub; EULA + Trading Risk Notice) | Clean executed-volume footprint ergonomics, Open Interest profiles, merged perpetual/spot contracts, 1-click replay UX, unified crypto + CME (dxFeed/Rithmic) workflow | **PROPRIETARY — UX-STUDY-ONLY / ZERO CODE OR ASSET REUSE** |
| **TradingLite** (`tradinglite.com`) [`R08-S15`] | **Shut Down (2026)** — last live archive `2026-01-24`; proprietary tech stack (Svelte/TS + Go + LitScript + GPU heatmap) listed for private NDA acquisition | **Proprietary** (formerly ~$14.95–$24.95/mo; discontinued) | Historically best-in-class browser GPU liquidity heatmap color-grading, low-clutter dark theme, compact footprint cluster legibility | **PROPRIETARY — UX-STUDY-ONLY / ZERO CODE OR ASSET REUSE** *(also cautionary tale proving why local-first FOSS sovereignty matters!)* |
| **TensorCharts** (`tensorcharts.com`) [`R08-S16`] | **Offline / Unreachable (Late 2026)** — Cloudflare HTTP 523 since mid-2026; last working archive `2026-06-16`; social/changelog dormant since 2018–2021 | **Proprietary** (formerly freemium ~$8–$30/mo) | Early pioneer of combined resting-book heatmap + executed-trades heatmap + volume counters in a single viewport | **PROPRIETARY — UX-STUDY-ONLY / ZERO CODE OR ASSET REUSE** *(further validates local-first FOSS vs fragile SaaS!)* |

---

## Options Table (Weighted Criteria)

Strategic build posture for MotiveView's architecture (`1` = poor / disqualified, `5` = optimal), weighted directly against [[Constraints#1. Eight Design Non-Negotiables]]:

| Strategic Option | FOSS & License Purity (`Apache-2.0` Core) (25%) | Time-to-MVP & Maintenance Velocity (25%) | Order-Flow + Fixed-Point Perf (`60fps`, `<40MB`, `<300MB`) (25%) | Multi-Asset (CME + Crypto) & Plugin Extensibility (15%) | Bus-Factor & Ecosystem Resilience (10%) | Weighted Score (`/5.00`) | Verdict |
|---|---|---|---|---|---|---|---|
| **Option A: Modular Adopt-First Hybrid** (Adopt Tauri v2 + LWC v5 + React/Dockview/shadcn + `arrow-rs`/`rusqlite`/`dbn`/`wasmtime`/`keyring-rs`; targeted clean-room **Build** ONLY for 6 genuinely missing domain cores) | **5.0** *(100% permissive core; zero copyleft/BSL traps)* | **4.6** *(reuses 80%+ commodity plumbing; focuses dev effort on order-flow differentiators)* | **4.8** *(Rust hot-path + raw WebGL2 order-flow layer + `<15 MB` Tauri base)* | **5.0** *(provider-agnostic fixed-point core; Wasmtime + Parquet sidecar bridge)* | **4.8** *(all core deps backed by large multi-maintainer foundations)* | **4.83** | **RECOMMENDED** |
| **Option B: Fork `flowsurface-rs/flowsurface` (`v0.9.0`)** | **2.0** *(app & data crates are `GPL-3.0-or-later`; forces full GPLv3 pivot)* | **3.2** *(fast crypto heatmap demo, but massive rewrite for CME, drawings, OMS, backtest, a11y)* | **4.8** *(native Rust `iced`/`wgpu`)* | **2.5** *(crypto-only; `iced` lacks turnkey chart/drawing/docking/ARIA ecosystem)* | **2.0** *(96.6% single-author bus factor)* | **3.08** | **REJECT** (Clean-room benchmark only) |
| **Option C: Fork `OpenBB` V5 (`Apache-2.0`) / FINOS Workspace** | **5.0** *(V5 is `Apache-2.0`)* | **2.5** *(Python + web BI architecture; must still build entire tick/order-flow/OMS/GPU engine)* | **1.8** *(Python + server stack breaks `<40 MB` & zero-GC hot path)* | **3.5** *(strong equity/macro data connectors, weak L2/L3 microstructure)* | **3.5** *(post-wind-down stewardship transition to OpenBQ/FINOS)* | **3.18** | **REJECT** |
| **Option D: Fork `QuantConnect/Lean` or `nautilus_trader` + Build UI** | **2.5** *(Nautilus is `LGPL-3.0-only` + Trademark; Lean is `Apache-2.0`)* | **2.4** *(heavy backend frameworks with zero desktop chart/DOM UI)* | **2.2** *(.NET/Python runtimes violate `<40 MB` desktop budget)* | **4.5** *(institutional multi-asset engines)* | **4.0** | **2.85** | **REJECT for core** (Adopt as optional sidecars only) |
| **Option E: Pure Ground-Up Build (Custom Native Rust UI + Chart + Storage + Scripting)** | **5.0** *(100% owned)* | **1.2** *(multi-year scope trap — directly triggers `RK-06` & `KC-07`)* | **5.0** | **4.5** | **3.0** | **3.78** | **REJECT** (Violates Adopt-First principle) |

---

## Recommendation + Rationale

**Adopt Option A (Modular Adopt-First Hybrid Architecture)** — documented subsystem-by-subsystem in [[Adopt-Build-Fork]]:

1. **Adopt permissive FOSS for 12 of 18 subsystems (~75–80% of total engineering surface):** Desktop shell (`Tauri v2`), base charting (`Lightweight Charts v5.3.0`), workspace docking (`Dockview` MIT packages), UI/a11y/tables/virtualization (`React 19` + `shadcn/Radix` + `Tailwind 4` + `Zustand` + `TanStack`), icons/fonts (`Lucide` ISC, `JetBrains Mono` / `Inter` OFL-1.1), warm/cold storage (`rusqlite`, `arrow-rs`/`parquet`, `rtrb`), CME binary ingest (`databento/dbn`), IBKR clean-room socket (`wboayue/rust-ibapi`), crypto execution traits (`barter-rs`), sandboxed plugins & scripting (`Wasmtime`, `Rhai`/`Luau`), OS credential storage (`keyring-rs`), and CI license enforcement (`cargo-deny`).
2. **Zero `Fork` verdicts at v0.1:** Forking whole trading apps (`flowsurface`, `OpenBB`, `Lean`) drags in either `GPL-3.0` copyleft, single-author bus factors, non-order-flow Python/.NET runtimes, or `iced` UI lock-in. The sole watch-list conditional fork/reference candidate is `ferranbt/pinecone` (`MPL-2.0`, 29★) in **v0.4+ only** if it matures to `v1.0+`.
3. **Restrict `Build` verdicts strictly to the 6 domain-differentiating subsystems where NO suitable permissive FOSS exists** (full written justifications in [[Adopt-Build-Fork#3. Mandatory Written Justifications for Every `Build` Verdict]]):
   - `B1` Synchronized Raw WebGL2 Order-Flow Layer (Footprint Bars, Liquidity Heatmap, TPO Profiles)
   - `B2` Clean-Room Drawing, Magnet-Snap & `.mvanalysis.toml` Workspace Layer
   - `B3` Fixed-Point `i64` Order-Flow Math, Segment-Tree Profiles & Bitmask TPO Core (`mv-orderflow`)
   - `B4` Provider-Agnostic Market-Data Normalizer & Provenance Engine (`mv-ingest`)
   - `B5` Fixed-Point Order Management System (OMS), Risk Kill-Switch & Local Paper Simulator (`mv-oms`)
   - `B6` Deterministic `mv-studies` Engine, Replay/L2-Queue Simulator (`mv-replay`), & Staged Clean-Room Pine-Inspired DSL Front-End (v0.4+)
4. **Market Validation from Proprietary Shutdowns:** Both **TradingLite** (shut down `2026`, IP up for sale) and **TensorCharts** (offline HTTP 523 in late `2026`) collapsed as closed SaaS businesses in 2026 — proving the urgent demand for a **local-first, sovereign, `Apache-2.0` FOSS order-flow terminal** whose users can never lose their tools, layouts, or historical tick vaults to a vendor shutdown.

---

## Inferences

1. **The OpenBB V5 license switch (`2026-09-29`) is a major strategic signal for MotiveView's own license (`R09`):** Even the largest FOSS finance community (`75k+` stars) moved off `AGPL-3.0` to `Apache-2.0` to unlock broad institutional and Linux Foundation (FINOS) adoption.
2. **`flowsurface-rs/flowsurface` proves Rust + `wgpu` + Arrow IPC is viable for desktop order-flow** — which directly de-risks MotiveView's fallback path (`KC-01`/`KC-02`) if WebKitGTK WebGL2 fails Phase 2 Spike `S02`/`S04`, while simultaneously demonstrating why a single-author `GPL-3.0` crypto-only `iced` app cannot serve as MotiveView's multi-asset foundation.
3. **Splitting hot-path Rust libraries from optional out-of-process sidecars (`DuckDB`, `NautilusTrader`, `QuantConnect Lean`) unlocks institutional power at `$0` installer cost** without crossing LGPL-3.0 or binary-size kill criteria.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Upstream single-maintainer bus factor on niche Rust crates** (`wboayue/rust-ibapi` 85% top-1, `barter-rs` 97% top-1, `nkaz001/hftbacktest` last push `2025-12-23`, `mathuo/dockview` 95% top-1) | High | Wrap every third-party crate behind thin internal MotiveView traits (`BrokerAdapter`, `MarketDataProvider`, `LayoutHost`) so any stalled dependency can be swapped or forked cleanly under MIT/Apache-2.0 without touching core domain math. |
| **Accidental license contamination when borrowing ideas from `flowsurface` (`GPL-3.0`) or `PineTS` (`AGPL-3.0`)** | Critical | Enforce the strict Clean-Room Procedure in [[Compliance-Notes#3. Clean-Room Reimplementation Procedure]]: never copy source files from GPL/AGPL repos; enforce `cargo-deny` in CI (`[[License-Registry]]`). |
| **Scope creep in the 6 `Build` subsystems (`RK-06` / `KC-07`)** | High | Gate `B1`–`B6` into vertical-slice milestones (v0.1 ships 1 live `$0` crypto feed + DBN replay + 1 order-flow renderer + 1 drawing tool; OMS execution starts v0.2; clean-room Pine-subset DSL deferred to v0.4+). |

---

## Open Questions

1. **`flowsurface-exchange` (`MIT`) & `flowsurface-indicator-engine` (`Apache-2.0`) sub-crate reuse:** Because Flowsurface's workspace root is `GPL-3.0-or-later` while those two sub-crates declare permissive SPDX tags in their `Cargo.toml`, should MotiveView avoid importing them entirely to maintain zero copyright/provenance ambiguity? **Recommendation:** Avoid importing them; treat the entire `flowsurface-rs` repository as clean-room UX/architecture study only (zero code copied).
2. **`OpenBB` V5 (`Apache-2.0`) optional research connector (`UNVERIFIED` maintenance trajectory post-wind-down):** Monitor `openbq-org` commit velocity through Q1 2027 before investing in any optional OpenBB data bridge. **Human verification step:** Inspect `https://github.com/openbq-org` and `OpenBB-finance/OpenBB` commit activity before v0.4 planning.
3. **`nkaz001/hftbacktest` (`MIT`) maintenance status (`UNVERIFIED` 2026 roadmap):** Last push was `2025-12-23`. **Human verification step:** Check `nkaz001/hftbacktest` commit log and Rust MSRV compatibility before deciding whether to import its crate vs. implement clean-room queue math directly in `mv-replay`.

---

## What Would Change This Decision

- **If Phase 2 Spikes `S01`/`S02`/`S04` fail WebKitGTK WebGL2 performance (`KC-01`/`KC-02`):** Pivot the chart/shell Adopt choices to either **Electron (`v45.x`, MIT) + LWC/WebGL2** (revising installer budget via ADR) or a **pure-Rust `egui`/`wgpu` renderer** (using Flowsurface's `wgpu` architecture as a clean-room performance benchmark, never copying GPL code).
- **If a permissively licensed (`Apache-2.0`/`MIT`) Rust Pine v6 compiler/runtime matures to `v1.0+` with strong parity before v0.4:** Flip `B6` (Pine-inspired DSL front-end) from `Build` to `Adopt`.
- **If `mathuo/dockview` shifts future releases out of MIT or breaks WebKitGTK:** Immediately invoke the pre-planned fallback to **`caplin/FlexLayout` (`v0.11.2`, MIT)** (`R02-S24`).

---

## Sources

| Source ID | Track | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|---|
| `R08-S01` | R08 | `flowsurface-rs/flowsurface` (`v0.9.0`, `GPL-3.0-or-later` app/data, `Apache-2.0` indicator-engine, `MIT` exchange) | https://github.com/flowsurface-rs/flowsurface | 2026-11-24 | GitHub API (`repos`, `license`, `releases/latest`, `contributors`, `README.md`, workspace & sub-crate `Cargo.toml`) | High |
| `R08-S02` | R08 | `OpenBB-finance/OpenBB` (`ODP` V5, `Apache-2.0` verbatim `LICENSE`, commit `#7489` `2026-09-29`) | https://github.com/OpenBB-finance/OpenBB | 2026-11-24 | GitHub API (`repos`, `license` verbatim text, `commits?path=LICENSE`, `contributors`) | High |
| `R08-S03` | R08 | OpenBB V5 Relicensing Announcement (`AGPL-3.0` → `Apache-2.0`) & OpenBQ/FINOS Stewardship | https://openbb.co/ | 2026-11-24 | Web search cross-verified against GitHub `LICENSE` commit history (`2024-05-14` AGPL → `2026-09-29` Apache-2.0) | High |
| `R08-S04` | R08 | `QuantConnect/Lean` (`Apache-2.0`, 22,693★) | https://github.com/QuantConnect/Lean | 2026-11-24 | GitHub API (`repos`, `license` verbatim, `contributors`) | High |
| `R08-S05` | R08 | `nautechsystems/nautilus_trader` (`v1.231.0`, `LGPL-3.0-only`, `TRADEMARK.md`, `CLA.md`) | https://github.com/nautechsystems/nautilus_trader | 2026-11-24 | GitHub API (`repos`, `license`, root `Cargo.toml`, `TRADEMARK.md`, `contributors`) | High |
| `R08-S06` | R08 | `freqtrade/freqtrade` (`2026.10`, `GPL-3.0`, 57,236★) | https://github.com/freqtrade/freqtrade | 2026-11-24 | GitHub API (`repos`, `license` verbatim, `releases/latest`, `contributors`) | High |
| `R08-S07` | R08 | `jesse-ai/jesse` (`MIT` core, 8,832★) | https://github.com/jesse-ai/jesse | 2026-11-24 | GitHub API (`repos`, `license` verbatim, `contributors`) | High |
| `R08-S08` | R08 | `Superalgos/Superalgos` (`v1.6.1`, `Apache-2.0`, 5,821★) | https://github.com/Superalgos/Superalgos | 2026-11-24 | GitHub API (`repos`, `releases/latest`, `contributors`) | High |
| `R08-S09` | R08 | `Drakkar-Software/OctoBot` (`3.0.0-beta3`, `GPL-3.0`, 6,983★) | https://github.com/Drakkar-Software/OctoBot | 2026-11-24 | GitHub API (`repos`, `releases/latest`, `contributors`) | High |
| `R08-S10` | R08 | `StockSharp/StockSharp` (Proprietary Custom License Notice / EULA — non-FOSS) | https://github.com/StockSharp/StockSharp | 2026-11-24 | GitHub API (`repos`, `license` verbatim text read directly) | High |
| `R08-S11` | R08 | GitHub FOSS Terminal Search (`Superior-Trade/trading-terminal`, `Sinotrade/shioaji-pro-app`, `Hitheshkaranth/OpenTerminalUI`) | https://api.github.com/search/repositories | 2026-11-24 | Live GitHub search API query | High |
| `R08-S12` | R08 | `open-source-cooperative/keyring-rs` (`v4.2.0`, `MIT OR Apache-2.0`, OS native keychain + Tauri v2 demo + leak tests) | https://github.com/open-source-cooperative/keyring-rs | 2026-11-24 | GitHub API (`repos`, `license`, `Cargo.toml`, `README.md`) | High |
| `R08-S13` | R08 | `EmbarkStudios/cargo-deny` (`v0.22.1`, `MIT OR Apache-2.0`, Rust CI license/advisory gate) | https://github.com/EmbarkStudios/cargo-deny | 2026-11-24 | GitHub API (`repos`, `releases/latest`, `Cargo.toml`) | High |
| `R08-S14` | R08 | Exocharts Pricing, EULA & Order-Flow Features (Active proprietary platform) | https://exocharts.com/ | 2026-11-24 | Web search on primary `exocharts.com` pricing, EULA, and trading ToS pages | High |
| `R08-S15` | R08 | TradingLite Shutdown Notice & Proprietary Stack Asset Sale (2026) | https://tradinglite.com/ | 2026-11-24 | Web search on `tradinglite.com` shutdown & acquisition notice | High |
| `R08-S16` | R08 | TensorCharts Offline Status (HTTP 523, late 2026) & Historical Feature Docs | https://tensorcharts.com/ | 2026-11-24 | Web search cross-checking late-2026 reachability & docs | Medium |
| `R08-S17` | R08 | Cross-Track Component Verifications (`lightweight-charts`, `KLineChart`, `HQChart`, `tauri`, `electron`, `slint`, `dockview`, `lucide`, `JetBrainsMono`, `inter`, `dbn`, `rust-ibapi`, `ib_async`, `barter-rs`, `ccxt`, `hummingbot`, `wasmtime`, `rhai`, `mlua`, `luau`, `TA-Lib`, `tulipindicators`, `PineTS`, `OpenPineScript`, `pineforge-codegen-oss`, `pinecone`, `rusqlite`, `arrow-rs`, `datafusion`, `duckdb`, `questdb`, `ClickHouse`, `ArcticDB`, `timescaledb`, `hftbacktest`, `vectorbt`, `backtrader`, `pysystemtrade`, `zipline-reloaded`, `rtrb`, `ringbuf`) | https://github.com/ *(per-repo URLs in [[License-Registry]])* | 2026-11-24 | Direct GitHub API batch verification (`repos`, `license`, `releases/latest`, `contributors`) + cross-check with `R01`–`R07` | High |
