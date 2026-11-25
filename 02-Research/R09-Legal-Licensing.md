---
title: "R09 — Legal, Licensing, IP Boundaries & Trademark Risk Analysis"
track: R09
status: verified
owner: legal-licensing
updated: 2026-11-24
code_refs: []
---

# R09 — Legal, Licensing, IP Boundaries & Trademark Risk Analysis

> **Brand Decision Resolved (`2026-11-24`):** Abel officially retired the working title `"MotiveView"` and named the project **Allegedly** — *"Allegedly a trading terminal."* (vault/repo moved to `/Users/abelmora/Documents/Obsidian/Allegedly`). Preliminary `2026-11-24` screening of **ALLEGEDLY**: 0 USPTO active registrations/applications in Classes `009` or `042` found in public indexes and 0 real trading terminals; two existing software/adjacent uses logged for future attorney review: `allegedly.market` (iOS parody meme-maker styled as fake prediction-market cards, explicitly disclaims being a trading platform) and `allegedlyapp.com` (workplace feedback), plus `kyscott18/allegedly` (GitHub Solidity compiler). Formal USPTO TSDR / EUIPO / common-law clearance remains `[ATTORNEY REVIEW REQUIRED]` before public release. Historical analysis of the retired `"MotiveView"` working title is preserved below for audit trail.

> [!CAUTION]
> **NOT LEGAL ADVICE:** This document is an engineering, licensing-hygiene, and compliance risk assessment prepared for planning purposes only. It is **not** formal legal advice and does **not** create an attorney–client relationship. Every item marked **`[ATTORNEY REVIEW REQUIRED]`** below and in [[Compliance-Notes]] MUST be reviewed by a qualified intellectual-property, open-source, trademark, or financial-regulatory attorney before public release, commercial partnership, or trademark filing.

---

## Question

1. **App License First:** Which OSI-approved open-source license (**`Apache-2.0`** vs. **`GPL-3.0-or-later`** vs. **`AGPL-3.0-or-later`**) should govern MotiveView's core repository given our exact Rust/Tauri/WebView dependency graph, third-party plugin/scripting ecosystem, and `$0` FOSS distribution strategy?
2. **Dependency & Linkage Hygiene:** Which candidate libraries from `R01`–`R08` are legally compatible with the chosen app license, which require strict out-of-process sidecar isolation, and which carry fatal license traps?
3. **IP, EULA, Data & Trademark Boundaries:** What hard legal guardrails govern TradingView Charting Library / Pine Script®, MotiveWave EULA, Sierra Chart DTC / `.scid`, CME/exchange data redistribution, broker/prop-firm ToS, OS keychain secrets, and the trademark risk of the working name **`"MotiveView"`** (and **`"MotiveScript"`**)?

---

## Findings

### 1. App License Selection First (`Apache-2.0` vs. `GPL-3.0-or-later` vs. `AGPL-3.0-or-later`)

All license compatibility rules below are verified directly against the official Apache License 2.0 text [`R09-S01`], GNU GPLv3 / LGPLv3 / AGPLv3 texts, and the Free Software Foundation's License Compatibility List [`R09-S02`], cross-checked against MotiveView's verified dependency graph ([[License-Registry]]):

1. **Zero Copyleft Required by Core Dependencies:** Every single recommended core dependency across `R01`–`R08` is permissively licensed (`MIT`, `Apache-2.0`, `MIT OR Apache-2.0`, `Apache-2.0 WITH LLVM-exception`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `OFL-1.1`). Specifically: `Tauri v2`, `Lightweight Charts v5.3.0`, `KLineChart v10.1.1`, `React 19`, `Dockview` (MIT packages only), `shadcn/Radix`, `Tailwind`, `Zustand`, `TanStack`, `Lucide`, `JetBrains Mono`/`Inter`, `databento/dbn`, `wboayue/rust-ibapi`, `barter-rs`, `Wasmtime`, `Rhai`/`mlua`+`Luau`, `rusqlite`, `arrow-rs`/`parquet`, `DataFusion`, `rtrb`, `keyring-rs`, and `cargo-deny`.
2. **File-Level Weak Copyleft (`MPL-2.0`) Compatibility:** Optional candidates under `MPL-2.0` (`dxFeed/dxLink`, watchlist `ferranbt/pinecone`) are **explicitly compatible** with an `Apache-2.0` Larger Work under MPL-2.0 §3.3 (only modifications to the MPL-covered source files themselves must remain MPL-2.0) [`R09-S03`].
3. **Rust Static-Linking Copyleft Mechanics (`LGPL-3.0` / `GPL-3.0`):** Rust compiles dependencies via **static linking** (`rlib`) by default. Statically linking an **`LGPL-3.0-only`** crate (such as `nautechsystems/nautilus_trader`) into a non-GPL distributed binary triggers **LGPL-3.0 §4(d)** obligations requiring the distributor to ship relinkable object files/build instructions or switch to dynamic linking (`cdylib`) [`R09-S02`]. Communicating with `nautilus_trader` over an **out-of-process sidecar boundary** (shared Parquet files + JSON-RPC/Arrow IPC) avoids linking altogether — cleanly separating licenses under FSF's "mere aggregation / separate programs communicating at arms length" boundary *(flagged `[ATTORNEY REVIEW REQUIRED]` for tight IPC schemas)* [`R09-S02`].
4. **Why `Apache-2.0` Beats `MIT`, `GPL-3.0`, and `AGPL-3.0` for MotiveView:**
   - **Explicit Patent Grant & Retaliation (`Apache-2.0 §3`) vs. `MIT`:** Financial charting, DOM ladders, and order-routing UIs sit in a historically litigious patent domain. `Apache-2.0 §3` grants users an explicit royalty-free contributor patent license with automatic patent-litigation termination — protection `MIT` lacks [`R09-S01`].
   - **Plugin, Strategy & Broker-Partner Ecosystem:** Traders will **never** open-source proprietary alpha scripts or custom WASM execution plugins; commercial brokers and data providers (e.g., future certified MFFU/Tradeify/Tradovate/dxFeed adapters) routinely refuse to contribute to or integrate with strong-copyleft (`GPL`/`AGPL`) hosts due to derivative-work ambiguity over plugin ABIs. `Apache-2.0` lets users keep private strategies/plugins proprietary while keeping MotiveView's core 100% open and free.
   - **Real-World Precedent (`OpenBB` V5, `2026-09-29`):** OpenBB Inc. switched its `75k★` Open Data Platform from **`AGPL-3.0-only`** (adopted May 2024) back to **`Apache-2.0`** in V5 (`2026-09-29`, commit `#7489`), enabling FINOS (Linux Foundation) adoption and broad ecosystem reuse [`R08-S02`], [`R08-S03`].
   - **Why `AGPL-3.0` Is a Structural Mismatch:** `AGPL-3.0 §13` targets **hosted SaaS / network servers** to close the cloud loophole. MotiveView is a **local-first desktop terminal** (`[[Constraints]]` #3). Choosing `AGPL-3.0` triggers enterprise legal blacklists (Google, major prop desks, institutional contributors) while solving a SaaS problem MotiveView does not have.
   - **`$0` Windows Code Signing (`SignPath Foundation`):** `Apache-2.0` is an OSI-approved license explicitly qualifying for SignPath Foundation's `$0` OSS OV HSM code-signing program (`R02-S15`).
   - **One-Way GPLv3 Interoperability:** FSF confirms `Apache-2.0` is **compatible with `GPL-3.0`** (Apache-2.0 code can be combined into GPLv3 projects, though not GPLv2) [`R09-S02`].

---

### 2. Independent Verification & Reconciliation of Cross-Track License Catches (`R01`–`R08`)

Every license catch flagged by `R01`–`R07` and `R08` was independently re-verified against verbatim repository `LICENSE` / `LICENCE.md` / `Cargo.toml` / `NOTICE` files on `2026-11-24`. **Three critical upstream corrections/resolutions were uncovered:**

| Finding / Catch | Source Track(s) | Independent Primary Verification (`2026-11-24`) | Disposition Under `Apache-2.0` |
|---|---|---|---|
| **`OpenBB-finance/OpenBB` license transition** | Prompt / Prior-art | **CORRECTION VERIFIED:** `LICENSE` verbatim is now **`Apache-2.0`** (switched from `AGPL-3.0-only` on `2026-09-29` in V5 commit `#7489`). V4 releases and unmigrated repos (`openbb-forecast`) remain `AGPL-3.0` [`R08-S02`], [`R08-S03`]. | Compatible (`Apache-2.0` in V5+), though rejected for core due to Python/non-orderflow architecture. |
| **`nautechsystems/nautilus_trader` SPDX discrepancy** | `R04` (`LGPL-3.0-only`) vs. `R07` (`LGPL-3.0-or-later`) | **DISCREPANCY RESOLVED:** Root `Cargo.toml` verbatim states **`license = "LGPL-3.0-only"`**; repo also contains **`TRADEMARK.md`** (reserving `NautilusTrader` / `nautilus_trader`) and **`CLA.md`** [`R08-S05`]. | **NEVER statically link** into Rust core; **ALLOWED ONLY as optional out-of-process sidecar** over Parquet/IPC. |
| **`flowsurface-rs/flowsurface` split workspace license** | `R08` | **VERIFIED VERBATIM:** App crate `flowsurface` + `flowsurface-data` = **`GPL-3.0-or-later`**; `flowsurface-indicator-engine` = **`Apache-2.0`**; `flowsurface-exchange` = **`MIT`** [`R08-S01`]. | **DO NOT FORK OR LINK** app/data crates (`GPL-3.0`); treat entire repo as clean-room prior-art study only to avoid provenance ambiguity. |
| **`StockSharp/StockSharp` custom proprietary license** | `R08` | **VERIFIED VERBATIM:** `LICENSE` states *"not licensed under a general-purpose open source license... permitted only under the StockSharp EULA"* [`R08-S10`]. | **HARD DISQUALIFIED.** |
| **TradingView Lightweight Charts vs. Charting Library** | `R01` | **VERIFIED:** `lightweight-charts v5.3.0` is **`Apache-2.0`** + `NOTICE` (`Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/`) [`R09-S04`]. `charting_library` is private proprietary / public-website-only [`R01-S07`], [`R01-S08`]. | **ADOPT `lightweight-charts`** (retain `NOTICE` + attribution link); **BAN Charting Library**. |
| **`jones2000/HQChart` license conflict** | `R01` | **VERIFIED:** `LICENSE` is `Apache-2.0`, **contradicted** by `README.md` binding custom Chinese `用户协议.txt` (unilateral termination without notice + field-of-use bans) [`R01-S17`], [`R01-S18`]. | **HARD DISQUALIFIED** (non-OSI conflict). |
| **`mathuo/dockview` enterprise split** | `R02` | **VERIFIED VERBATIM (`LICENCE.md`):** `dockview-core`, `dockview`, `dockview-react`, `dockview-vue`, `dockview-angular` = **`MIT`**; `dockview-enterprise` = **Proprietary commercial** [`R09-S09`]. | **ADOPT MIT packages ONLY**; hard-block `dockview-enterprise` in CI. |
| **`slint-ui/slint` triple license** | `R02` | **VERIFIED VERBATIM (`LICENSE.md`):** Triple-licensed: `GPLv3` / proprietary `Royalty-free 2.0` / Commercial [`R09-S10`]. | **REJECT** (cannot use under `Apache-2.0` without GPLv3 copyleft or proprietary license). |
| **IBKR TWS API v10.49+ GPLv3 transition (Aug 2026)** | `R03`, `R04` | **VERIFIED:** Official TWS API `v10.49+` (`2026-08-03`) transitioned from proprietary Non-Commercial to **GNU GPL (`GPL-3.0-or-later`)** [`R09-S11`]. Clean-room **`wboayue/rust-ibapi` (`MIT`)** & **`ib-api-reloaded/ib_async` (`BSD-2-Clause`)** avoid GPL completely [`R08-S17`]. | **BAN official IBKR TWS API** from core; **ADOPT `rust-ibapi` (`MIT`)**. |
| **Pine parsers & indicator traps** | `R06` | **VERIFIED VERBATIM:** `PineTS` = **`AGPL-3.0`**, `OpenPineScript` = **`GPL-3.0`**, `pynescript` = **`LGPL-3.0`**, `tulipindicators` = **`LGPL-3.0`**, `pineforge-codegen-oss` = **non-FOSS `PineForge Source License 1.2`** (explicitly disqualifies prop-firm/funded accounts!), `ferranbt/pinecone` = **`MPL-2.0`**, `TA-Lib` = **`BSD-3-Clause`** [`R08-S17`], [`R09-S12`]. | **DISQUALIFY** AGPL/GPL/LGPL/non-FOSS Pine repos; **ADOPT `TA-Lib` (`BSD-3-Clause`, CI oracle)**; keep `pinecone` (`MPL-2.0`) watchlist-only. |
| **Database & Backtest traps** | `R07` | **VERIFIED VERBATIM:** `ArcticDB` = **`BSL 1.1`** (non-OSI), `TimescaleDB` = **Dual `Apache-2.0` + non-OSI `TSL`** (`tsl/` compression & continuous aggregates), `vectorbt` = **`Apache-2.0` + non-OSI `Commons Clause v1.0`**, `backtrader` & `pysystemtrade` = **`GPL-3.0`**, `QuestDB` = **`Apache-2.0`** OSS core (enterprise paywalls exchange calendars `#XNYS`), `ClickHouse` = **`Apache-2.0`**, `zipline-reloaded` = **`Apache-2.0`**, `hftbacktest` = **`MIT`** [`R08-S17`], [`R09-S13`]. | **DISQUALIFY** ArcticDB, TimescaleDB, vectorbt, backtrader, pysystemtrade; **ADOPT** `rusqlite` (`MIT`) + `arrow-rs`/`parquet` (`Apache-2.0`) + optional `DuckDB` (`MIT`) / `Lean` (`Apache-2.0`) / `Nautilus` (`LGPL-3.0-only` sidecar). |

Full 50+ dependency verification matrix with linkage rules and obligations lives in [[License-Registry]].

---

### 3. Summary of Vendor EULAs, Data Redistribution & Prop-Firm Legal Boundaries

Detailed operational procedures, exact contract citations, and engineering checklists live in [[Compliance-Notes]]. Key verified legal boundaries:

1. **MotiveWave EULA (`§9(c)`):** Explicitly prohibits reverse engineering, decompiling, or disassembling MotiveWave in whole or in part, requires corporate licensees to use "best efforts" to prevent contractors/employees from doing so, and triggers **automatic license termination** on violation [`R09-S06`]. MotiveView enforces a strict **zero-binary/zero-JAR/zero-SDK clean-room wall** ([[Compliance-Notes#3. Clean-Room Reimplementation Procedure]]).
2. **Sierra Chart DTC vs. Data / `.scid` Ban:** While `DTCProtocol.php` is **Public Domain** (`R04-S22`), `DTCServer.php` blocks CME/EUREX/NASDAQ/CBOE/UTP/CTA data (`R04-S23`), `LicenseAgreement.php` (modified `2026-10-13`) mandates all Sierra Chart/Denali data be used **"100% within Sierra Chart"** [`R09-S08`], and **`IntradayDataFileFormat.html` (`.scid`) was permanently removed on `2026-10-13`** citing the License Agreement [`R09-S08`]. MotiveView **MUST NOT** build a `.scid` importer or extract Sierra Chart data.
3. **CME & Exchange Data Redistribution:** CME vendor redistribution costs `$29,280/yr/exchange` real-time, `$21,840/yr/exchange` delayed, and `$35,220/yr/exchange` historical (`R03-S34`). MotiveView avoids vendor/redistributor status strictly via **100% client-side BYO credentials** (zero central relay/proxy servers), banning `yfinance`/Stooq scrapers, and shipping US-legal `$0` crypto defaults (**Kraken** + **Coinbase**) while excluding geo-blocked offshore venues from defaults.
4. **Prop-Firm `DO-NOT-BUILD` Boundaries (`R04`):** Four of eight audited firms (**Apex Trader Funding**, **Take Profit Trader**, **Bulenox**, **Elite Trader Funding**) explicitly prohibit unauthorized third-party API/automated clients and are permanently marked **`DO-NOT-BUILD`**. Three (**MFFU**, **Tradeify**, **Lucid**) require written partner/gateway approval; only **Topstep** permits local Sim-only execution via a user's paid ProjectX API key (banned on Live Funded Accounts and VPS/VPN).
5. **OS Keychain Secret Storage:** Broker/provider API keys and OAuth2 tokens MUST be stored exclusively in OS-native credential stores (**macOS Keychain**, **Windows Credential Manager**, **Linux Secret Service / kernel keyutils**) via **`keyring-core` / `keyring-rs` (`v4.2.0`, `MIT OR Apache-2.0`)** [`R08-S12`], never in plaintext `.toml`/JSON/SQLite/vault files or exposed to WebView JS.

---

### 4. Trademark Risk Assessment: `"MotiveView"` & `"MotiveScript"` `[ATTORNEY REVIEW REQUIRED]`

Live public trademark records verified on `2026-11-24` confirm **SEVERE, HIGH-PROBABILITY TRADEMARK CONFLICT RISK** for both working names:

1. **`MOTIVEWAVE` — Active Federal U.S. Registration:**
   - **Owner:** Silver Bullet Solutions Inc.
   - **USPTO Reg. No. `3937578`** (Serial No. `85093420`, registered `2011-03-29`, **renewed** `2021-04-28`, first use `2010-02-05`).
   - **International Class `009`:** *"Computer programs and computer software for electronically trading securities."* [`R09-S07`]
2. **`TRADINGVIEW` — Active Federal U.S. Registration:**
   - **Owner:** TradingView, Inc.
   - **USPTO Reg. No. `5632149`** (Serial No. `87902086`, registered `2018-12-18`).
   - **International Class `042`:** Online financial charts (stocks, futures, options, FX), technical analysis software, embeddable market data widgets [`R09-S07`].
3. **`Pine Script®` — Active Registered Trademark of TradingView, Inc.** [`R09-S05`].

#### Likelihood-of-Confusion Risk Analysis (*Polaroid* / *Sleekcraft* Factors — Engineering Risk View, Not Legal Advice)
- **Portmanteau Combination:** **`"MotiveView"`** fuses the distinctive leading element of **`MOTIVEWAVE`** (`Motive-`) directly with the suffix of **`TRADINGVIEW`** (`-View`) — for a product explicitly inspired by combining *MotiveWave*'s order-flow tooling with *TradingView*'s charting ergonomics!
- **Identical Goods & Trade Channels:** Both incumbents and MotiveView operate in **identical International Classes (`009` downloadable trading software / `042` financial charting software)** targeting identical retail futures, crypto, and equities traders.
- **Intent / Bad-Faith Inference Risk:** Publicly documented design history comparing MotiveWave and TradingView makes a portmanteau name an immediate magnet for a **cease-and-desist letter, UDRP domain dispute, GitHub trademark takedown, or Lanham Act §32 / §43(a) infringement and dilution claim** from *either* or *both* registrants.
- **`"MotiveScript"` Risk:** Carries the exact same **`MOTIVE-`** prefix collision with **`MOTIVEWAVE`** (`Reg. #3937578`) in Class `009` financial trading software, especially given MotiveWave's own Java Study SDK.

#### Verdict on Naming
- **Keep `"MotiveView"` strictly as an internal Phase 0–3 planning codename ONLY** (never register domains, publish crates/npm packages, launch public GitHub orgs, or market externally under `"MotiveView"` or `"MotiveScript"`).
- **Mandatory Rename Gate before Public `v0.1` Launch:** Rename to a **clean-room, distinctive mark** after formal clearance by a qualified trademark attorney.

#### 5 Clean-Room, Distinctive Alternative Names (Preliminary Screening Verified `2026-11-24`)

All 5 candidates below were screened live via GitHub repository search (`in:name`) AND public web/trademark search on `2026-11-24` (after rejecting 11 earlier candidates — `TapeForge`, `Plumbline`, `Tickwright`, `Graticule`, `Bookloom`, `Tickloom`, `Brimtick`, `Tallydeck`, `Cairnbook`, `StrataLoom`, `Kallidex` — that showed software, finance, or phonetic conflicts [`R09-S14`]):

| Rank | Clean-Room App Name | Paired DSL Name | Abercrombie Distinctiveness Tier | Semantic Rationale | Live Preliminary Screening (`2026-11-24`) |
|---|---|---|---|---|---|
| **1 (Top Pick)** | **`Ordlith`** | `LithScript` | **Fanciful / Coined** *(strongest legal protection)* | Order-book + *lith* (carved stone: local-first permanence, deterministic tick integrity) | **0** exact GitHub repos; **0** exact web/software/trademark matches [`R09-S14`] |
| **2** | **`Rungcraft`** | `RungScript` | **Suggestive** *(strong)* | DOM price-ladder *rungs* + precision *craft* (studies, footprints, user control) | **0** exact GitHub repos; **0** exact web/software/trademark matches [`R09-S14`] |
| **3** | **`Cairntape`** | `CairnScript` | **Suggestive** *(strong)* | Stacked Volume/TPO Profile *cairns* + live executed trade *tape* | **0** exact GitHub repos; **0** exact web/software/trademark matches [`R09-S14`] |
| **4** | **`Tallyrung`** | `TallyScript` | **Suggestive** *(strong)* | Deterministic fixed-point volume *tallies* across DOM price *rungs* | **0** exact GitHub repos; **0** exact web/software/trademark matches [`R09-S14`] |
| **5** | **`Tickkiln`** | `KilnScript` | **Suggestive** *(strong)* | High-speed tick & order-flow forging/compilation (*kiln*) | **0** exact GitHub repos; **0** exact web/software/trademark matches [`R09-S14`] |

> [!IMPORTANT]
> **`[ATTORNEY REVIEW REQUIRED]` — Preliminary Screening Is `UNVERIFIED` for Legal Clearance:** Live GitHub and web searches DO NOT inspect official **USPTO TSDR**, **EUIPO**, **WIPO Global Brand Database**, state registries, common-law usage, or phonetic/foreign-equivalent collisions across Classes `009`, `036`, and `042`. Formal clearance by a trademark attorney is mandatory prior to public launch.

---

## Options Table (Weighted Criteria)

Weighted evaluation of **MotiveView's App License** (`1` = poor, `5` = optimal):

| App License Option | Dependency & Linkage Compatibility (`R01`–`R08`) (25%) | Plugin / Proprietary Strategy & Broker Ecosystem Fit (25%) | Patent Protection & Contributor Governance (20%) | Protection Against Closed Commercial Hijacking (15%) | `$0` OSS Signing (`SignPath`) & Institutional Adoption (15%) | Weighted Score (`/5.00`) | Verdict |
|---|---|---|---|---|---|---|---|
| **`Apache-2.0`** | **5.0** *(100% compatible with entire MIT/Apache/BSD/ISC/OFL/MPL-2.0 core; isolates LGPL/GPL via sidecars)* | **5.0** *(traders keep alpha/WASM plugins private; zero friction for commercial broker/data partners)* | **5.0** *(explicit §3 patent grant + retaliation; clean DCO/CLA-free contribution)* | **2.5** *(allows proprietary forks, mitigated by trademark ownership & community velocity)* | **5.0** *(Tier-1 SignPath, FINOS/ASF standard; validated by OpenBB V5 switch)* | **4.63** | **RECOMMENDED** |
| **`GPL-3.0-or-later`** | **4.5** *(compatible with all MIT/Apache-2.0/MPL-2.0 core deps; would allow linking `flowsurface` / IBKR TWS API, though we don't need them)* | **2.5** *(chills commercial broker partnerships & creates WASM/plugin ABI derivative-work anxiety for alpha authors)* | **4.5** *(strong GPLv3 §11 patent grant)* | **5.0** *(forces all distributed forks to stay open-source)* | **3.5** *(SignPath-eligible, but restricted at many financial institutions & prop desks)* | **3.93** | **Runner-Up (if anti-fork copyleft overrides ecosystem growth)** |
| **`AGPL-3.0-or-later`** | **4.5** *(same as GPL-3.0)* | **1.5** *(severe enterprise/corporate blacklists; network-copyleft clause adds friction with zero benefit for a local-first desktop app)* | **4.5** | **5.0** | **2.0** *(widely banned by corporate legal teams; OpenBB explicitly abandoned AGPL-3.0 in Sept 2026)* | **3.45** | **REJECT** |
| **`MIT`** *(Reference Baseline)* | **5.0** | **5.0** | **2.5** *(no explicit patent grant or retaliation clause)* | **2.5** | **5.0** | **4.13** | **Inferior to `Apache-2.0`** |

---

## Recommendation + Rationale

1. **Adopt `Apache-2.0` as MotiveView's Core App License** (with standard `NOTICE` file + automated `THIRD_PARTY_NOTICES.md` generation + Developer Certificate of Origin (`DCO`) sign-off on PRs — avoiding heavy corporate CLAs that deter FOSS contributors).
2. **Enforce Automated CI License Gates from Day 1:** Check `deny.toml` (`EmbarkStudios/cargo-deny v0.22.1`) and an npm SPDX license gate into the repo root on Commit #1 so no `GPL`, `AGPL`, `LGPL`, `BSL-1.1`, `TSL`, `Commons Clause`, `PineForge`, or proprietary package (`dockview-enterprise`, `HQChart`, `charting_library`) can ever enter the core dependency tree ([[License-Registry#2. Automated CI License Enforcement Policy]]).
3. **Isolate Copyleft Research Engines Strictly Out-of-Process:** Run `nautilus_trader` (`LGPL-3.0-only`) and any optional external tools solely as user-installed **out-of-process sidecars** exchanging open Apache Parquet files and clean JSON-RPC/Arrow IPC messages.
4. **Commit to Renaming Before Public `v0.1` Launch:** Treat `"MotiveView"` / `"MotiveScript"` as internal planning codenames only; select **`Ordlith`** (`LithScript`) or **`Rungcraft`** (`RungScript`) — or another of the 5 clean-room candidates — and complete formal USPTO/EUIPO/WIPO clearance with trademark counsel before creating public GitHub orgs, crates, domains, or binaries.

---

## Inferences

1. **Apache-2.0 + Clean-Room Trademark Ownership is the modern FOSS sweet spot:** While Apache-2.0 permits forks, owning a distinctive registered clean-room trademark (like `Ordlith` or `Rungcraft`) prevents parasitic clones from impersonating the official terminal without chilling broker integrations, WASM plugin developers, or institutional contributors.
2. **Checking actual `LICENSE` files catches silent traps that GitHub badges miss:** Both `jones2000/HQChart` (`Apache-2.0` file contradicted by `用户协议.txt`) and `OpenBB` (widely remembered as `AGPL-3.0`, actually `Apache-2.0` since `2026-09-29`) prove that automated CI checks MUST be paired with human inspection of `README`, `NOTICE`, and `NOASSERTION` licenses whenever adding a new dependency.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Trademark cease-and-desist or takedown over `"MotiveView"` / `"MotiveScript"` (`RK-04`)** | Critical | Never publish publicly under `"MotiveView"` / `"MotiveScript"`; rename to attorney-cleared clean-room mark prior to `v0.1` public release. |
| **Accidental GPL/LGPL/BSL/proprietary crate contamination (`RK-05`, `KC-04`)** | Critical | Enforce `cargo-deny` + npm SPDX allowlist in CI; ban `NOASSERTION` without explicit maintainer review in [[License-Registry]]. |
| **Contaminated contributor PR copying TradingView/MotiveWave/Flowsurface code** | High | Require DCO + clean-room contribution checklist in `CONTRIBUTING.md` ([[Compliance-Notes#3. Clean-Room Reimplementation Procedure]]). |
| **Misrepresentation as financial advice or broker-dealer / market-data vendor** | High | Embed attorney-reviewed disclaimers, strict client-side BYO data keys (zero proxy servers), and hard `DO-NOT-BUILD` prop-firm blocks ([[Compliance-Notes]]). |

---

## Open Questions

### Items Requiring a Qualified Attorney (`[ATTORNEY REVIEW REQUIRED]` / `UNVERIFIED`)
1. **Formal Trademark Clearance (USPTO TSDR, EUIPO, WIPO, Common Law) for Top Candidate Name (`Ordlith` / `Rungcraft` / etc.):** **`UNVERIFIED` (Legal Clearance)** — *Human verification step:* Engage a trademark attorney to run a full knock-out + comprehensive clearance search across International Classes `009`, `036`, and `042` before registering domains or publishing public repos.
2. **Clean-Room Pine-Inspired Syntax & Nominative Fair Use Phrasing (v0.4+):** **`UNVERIFIED` (Legal Opinion)** — *Human verification step:* Have IP counsel review the exact clean-room spec wall, compatibility disclaimer wording (*"Pine-inspired syntax... not affiliated with TradingView, Inc."*), and whether any `ta.*` standard-library signature mirroring raises copyright questions post-*Google v. Oracle*.
3. **Out-of-Process Sidecar Boundary for `nautilus_trader` (`LGPL-3.0-only`):** **`UNVERIFIED` (Legal Sign-Off)** — *Human verification step:* Confirm with OSS counsel that MotiveView's Parquet-file + JSON-RPC sidecar protocol constitutes independent programs communicating at arms length (no derivative work under LGPLv3).
4. **CFTC Rule 4.41 Hypothetical Performance & Execution Liability Disclaimer Wording:** **`UNVERIFIED` (Legal Drafting)** — *Human verification step:* Have financial-regulatory / commercial counsel draft final disclaimer text for README, first-run modal, Live-Armed dialog, and backtest PDF/HTML exports.
5. **Behind-Login Prop-Firm Plan Agreements (MFFU live API addendum, Lucid Plan Agreement):** **`UNVERIFIED`** (carried over from `R04`) — *Human verification step:* Inspect actual signed account agreements before any post-MVP partnership outreach.

### Product Decision for Abel
- Confirm whether Abel endorses **`Apache-2.0`** (over `GPL-3.0-or-later`) and pick a preferred clean-room codename successor from the top 5 (`Ordlith`, `Rungcraft`, `Cairntape`, `Tallyrung`, `Tickkiln`) for Phase 3/v0.1 branding.

---

## What Would Change This Decision

- **If Abel decides preventing closed-source commercial forks is a higher priority than commercial broker partnerships and frictionless plugin licensing:** Switch App License from `Apache-2.0` to **`GPL-3.0-or-later`** (with an explicit Classpath/WASM plugin boundary exception drafted by OSS counsel). Still reject `AGPL-3.0`.
- **If trademark counsel identifies a phonetic or regional conflict on the chosen candidate name:** Move to the next cleared candidate in the top-5 list (or coin a fresh fanciful mark).

---

## Sources

| Source ID | Track | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|---|
| `R09-S01` | R09 | Apache License, Version 2.0 (Official Full Text, incl. §3 Patent License) | https://www.apache.org/licenses/LICENSE-2.0 | 2026-11-24 | Primary license text cross-verified in multiple Apache-2.0 repo `LICENSE` files | High |
| `R09-S02` | R09 | GNU / FSF License List & GPLv3 / LGPLv3 / Apache-2.0 Compatibility Rules | https://www.gnu.org/licenses/license-list.html | 2026-11-24 | Official FSF/GNU license compatibility principles + verbatim GPL-3.0 / LGPL-3.0 texts | High |
| `R09-S03` | R09 | Mozilla Public License Version 2.0 (`MPL-2.0`, §3.3 Larger Works) | https://www.mozilla.org/en-US/MPL/2.0/ | 2026-11-24 | Verbatim `LICENSE` inspected in `dxFeed/dxLink` & `ferranbt/pinecone` | High |
| `R09-S04` | R09 | `tradingview/lightweight-charts` `LICENSE` (`Apache-2.0`) & `NOTICE` (Verbatim) | https://github.com/tradingview/lightweight-charts/blob/master/NOTICE | 2026-11-24 | Direct GitHub API read of `LICENSE` and `NOTICE` | High |
| `R09-S05` | R09 | TradingView Terms of Use, House Rules, Script Publishing Rules & `Pine Script®` MPL-2.0 Default | https://www.tradingview.com/policies/ | 2026-11-24 | Web search verifying TradingView Terms §3/§23, Pine Script® trademark, MPL-2.0 default & House Rules preemption | High |
| `R09-S06` | R09 | MotiveWave Software Terms of Service Agreement (EULA, Section 9(c) Anti-Reverse-Engineering) | https://www.motivewave.com/eula.htm | 2026-11-24 | Web search quoting verbatim Section 9(a)–(d) of MotiveWave Software Terms of Service Agreement | High |
| `R09-S07` | R09 | USPTO Federal Registrations: `MOTIVEWAVE` (Reg. #3937578, Silver Bullet Solutions Inc., Class 009) & `TRADINGVIEW` (Reg. #5632149, TradingView, Inc., Class 042) | https://tmsearch.uspto.gov/ | 2026-11-24 | Web search of indexed USPTO/Justia registration records (Serial #85093420 & #87902086) | High |
| `R09-S08` | R09 | Sierra Chart `LicenseAgreement.php` (`DATA LICENSE` — *"100% within Sierra Chart"*) & `IntradayDataFileFormat.html` (`.scid` permanently removed `2026-10-13`) | https://www.sierrachart.com/index.php?page=doc/LicenseAgreement.php | 2026-11-24 | Direct HTTP fetch & verbatim text read of both primary Sierra Chart pages | High |
| `R09-S09` | R09 | `mathuo/dockview` `LICENCE.md` (MIT packages vs. Proprietary `dockview-enterprise`) | https://github.com/mathuo/dockview/blob/master/LICENCE.md | 2026-11-24 | Direct GitHub API read of `LICENCE.md` verbatim | High |
| `R09-S10` | R09 | `slint-ui/slint` `LICENSE.md` (Triple license: GPLv3 / Proprietary Royalty-free 2.0 / Commercial) | https://github.com/slint-ui/slint/blob/master/LICENSE.md | 2026-11-24 | Direct GitHub API read of `LICENSE.md` verbatim | High |
| `R09-S11` | R09 | Interactive Brokers TWS API `v10.49+` GPL (`GPL-3.0-or-later`) Transition (`2026-08-03`) & New Installer Portal (`2026-10-05`) | https://download2.interactivebrokers.com/installers/tws-api/index.html | 2026-11-24 | Web search verifying IBKR 2026 TWS API Production Release Notes (`v10.49`–`v10.52`) | High |
| `R09-S12` | R09 | `pineforge-4pass/pineforge-codegen-oss` `LICENSE` (`PineForge Source License 1.2`, `2026-10-05` — Non-FOSS prop-firm exclusion) | https://github.com/pineforge-4pass/pineforge-codegen-oss/blob/main/LICENSE | 2026-11-24 | Direct GitHub API read of `LICENSE` verbatim | High |
| `R09-S13` | R09 | Non-OSI / Source-Available Traps (`man-group/ArcticDB` `BSL 1.1`, `timescale/timescaledb` `TSL`, `polakowo/vectorbt` `Commons Clause v1.0`) | https://github.com/polakowo/vectorbt/blob/master/LICENSE.md | 2026-11-24 | Direct GitHub API read of verbatim `LICENSE` / `LICENSE.txt` / `LICENSE.md` for all three repos | High |
| `R09-S14` | R09 | Preliminary GitHub & Web Name-Collision Screening for 16 Clean-Room Candidates (`Ordlith`, `Rungcraft`, `Cairntape`, `Tallyrung`, `Tickkiln` verified 0 exact hits) | https://api.github.com/search/repositories | 2026-11-24 | Live GitHub API exact-name search + multi-query web/trademark screening | Medium *(preliminary only; formal USPTO/EUIPO/WIPO clearance required)* |
