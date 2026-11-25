---
title: "Allegedly Legal, IP, ToS, Security & Trademark Compliance Notes"
type: compliance-guide
status: verified
owner: legal-licensing
updated: 2026-11-25
code_refs: []
---

# Legal, IP, ToS, Security & Trademark Compliance Notes

> **Brand Decision Resolved (`2026-11-24`):** Abel officially retired the working title `"MotiveView"` and named the project **Allegedly** — *"Allegedly a trading terminal."* (vault/repo moved to `/Users/abelmora/Documents/Obsidian/Allegedly`). Preliminary `2026-11-24` screening of **ALLEGEDLY**: 0 USPTO active registrations/applications in Classes `009` or `042` found in public indexes and 0 real trading terminals; two existing software/adjacent uses logged for future attorney review: `allegedly.market` (iOS parody meme-maker styled as fake prediction-market cards, explicitly disclaims being a trading platform) and `allegedlyapp.com` (workplace feedback), plus `kyscott18/allegedly` (GitHub Solidity compiler). Formal USPTO TSDR / EUIPO / common-law clearance remains `[ATTORNEY REVIEW REQUIRED]` before public release. Historical analysis of the retired `"MotiveView"` working title is preserved below for audit trail.

> [!CAUTION]
> **NOT LEGAL ADVICE:** This compliance playbook documents verified primary-source contract restrictions, license obligations, clean-room engineering hygiene, security practices, and trademark risks for Allegedly (`Apache-2.0` per [[R09-Legal-Licensing]]). It is **not** legal advice. Every topic flagged **`[ATTORNEY REVIEW REQUIRED]`** MUST be reviewed by qualified legal counsel before public launch or commercial/partner activity.

---

## Master Attorney-Review Escalation Checklist

| # | Area | Exact Question for Qualified Counsel | Target Gate |
|---|---|---|---|
| **1** | **Trademark Clearance** | Run full USPTO TSDR, EUIPO, WIPO, and common-law clearance across Classes `009`, `036`, and `042` on the selected clean-room name replacing `"MotiveView"` / `"MotiveScript"` (`Ordlith`, `Rungcraft`, `Cairntape`, `Tallyrung`, or `Tickkiln`). | **Before public `v0.1` repo/domain/release** |
| **2** | **Pine-Inspired DSL & Nominative Fair Use** | Review clean-room specification wall, non-affiliation notices, and standard-library function-name compatibility (`ta.*`) for the staged v0.4+ Pine-inspired DSL. | **Before Stage 4 (`v0.4`) implementation** |
| **3** | **`LGPL-3.0-only` Sidecar Boundary** | Confirm that Allegedly's out-of-process Parquet + JSON-RPC/Arrow IPC bridge to user-installed `nautilus_trader` does not create a combined/derivative work under LGPLv3. | **Before shipping `v0.4` Nautilus sidecar bridge** |
| **4** | **Financial / CFTC Rule 4.41 & Execution Disclaimers** | Draft final wording for "Not Investment Advice", "AS IS" execution liability waiver, and CFTC Rule 4.41 hypothetical backtest disclaimers. | **Before public `v0.1` release & `v0.2` broker execution** |
| **5** | **Prop-Firm Partner Agreements** | Review non-public live account agreements (MFFU live API addendum, Lucid Plan Agreement) and any future official broker/gateway partner contracts (Tradovate, Topstep, Tradeify). | **Before building any post-MVP prop/partner connector** |

---

## 1. TradingView Charting Library Restrictions & Lightweight Charts Attribution

- **Hard Ban on TradingView Charting Library (`Advanced Charts` / `Trading Platform`):**
  - Primary docs (`R01-S08`) and GitHub API (`tradingview/charting_library` HTTP 404, `R01-S07`) confirm this SDK is **proprietary, private, and non-redistributable**.
  - Free *Advanced Charts* is restricted to **public websites** (not private, paywalled, or offline local-first desktop apps), and terminal features (multi-chart layouts, Session Volume Profile, DOM, order tickets) require a paid commercial *Trading Platform* agreement.
  - **Rule:** Never link, wrap, bundle, download, or copy code, icons, CSS, or chart assets from TradingView Advanced Charts or Trading Platform.
- **Compliance for `tradingview/lightweight-charts` (`v5.3.0`, `Apache-2.0`):**
  - Verified `LICENSE` (`Apache-2.0`) and `NOTICE` (`R09-S04`):
    ```text
    TradingView Lightweight Charts™
    Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
    ```
  - **Mandatory Engineering Obligations:**
    1. Ship verbatim `LICENSE` and `NOTICE` in `THIRD_PARTY_NOTICES.md` and in the in-app **About & Legal Notices** dialog.
    2. Preserve a visible attribution notice and clickable link to `https://www.tradingview.com/` (either via LWC's built-in `attributionLogo` or a clean, permanently accessible attribution entry in the terminal UI/About page per `NOTICE` & `README.md`).

---

## 2. Pine Script® IP Boundaries, MPL-2.0 Community Scripts & Clean-Room DSL Rules `[ATTORNEY REVIEW REQUIRED]`

- **Registered Trademark:** **`Pine Script®`** and **`TRADINGVIEW`** are registered trademarks of TradingView, Inc. (`R09-S05`, `R09-S07`). Under TradingView Terms of Use §3, all copyrights and trademarks in TradingView's documentation, built-in closed-source scripts, and services belong exclusively to TradingView, Inc. (`R09-S05`).
- **MPL-2.0 Default vs. House Rules Preemption:**
  - Open-source scripts published on TradingView without an explicit alternate license default to **`MPL-2.0`** (`R09-S05`).
  - However, TradingView's **House Rules / Script Publishing Rules** explicitly **preempt** open-source licenses *for republishing on TradingView* (requiring credit, meaningful modification, and prohibiting reuse inside closed/invite-only scripts).
  - **Off-Platform Boundary for Allegedly:**
    1. Allegedly MUST **never** scrape, mirror, bundle, or ship third-party TradingView community scripts inside the repository or installer.
    2. If an individual user runs their own lawfully obtained `MPL-2.0` script locally on their own machine, MPL-2.0 does not restrict private execution — and Allegedly itself remains strictly `Apache-2.0` (never copying MPL-2.0 script source into core).
    3. Allegedly's built-in v0.1 studies (`allegedly-studies`) MUST be written 100% from public textbook/mathematical definitions (Wilder RSI, Appel MACD, Bollinger Bands, standard VWAP) and validated numerically against `TA-Lib` (`BSD-3-Clause`), **never** by copying TradingView built-in Pine code or docs.
- **Clean-Room DSL Naming & Disclaimers (v0.4+):**
  - **Do NOT name the language `"Pine"`, `"OpenPine"`, `"PineView"`, or `"MotiveScript"`** (see Section 10). Use a clean-room name paired with the renamed app (e.g., **`LithScript`** or **`RungScript`**).
  - Describe optional syntax compatibility strictly via factual nominative phrasing: *"Clean-room series-oriented scripting language supporting common Pine-inspired study patterns — independent open-source project, not affiliated with or endorsed by TradingView, Inc. Pine Script® is a registered trademark of TradingView, Inc."*

---

## 3. Clean-Room Reimplementation Procedure

Per [[Constraints#1. Eight Design Non-Negotiables]] #1, every clean-room reimplementation of financial math, order-flow UX, or scripting semantics follows a strict **Specification Wall**:

1. **Allowed Inputs (Public & Lawful):**
   - Peer-reviewed market microstructure & technical-analysis textbooks/papers (e.g., Lee & Ready 1991, Ellis et al. 2000, Steidlmayer Market Profile / TPO math, standard CME Globex matching rules).
   - Publicly published vendor user manuals, public marketing screenshots, and public API/protocol specifications (e.g., public-domain `DTCProtocol.php`, Databento DBN spec, Kraken/Coinbase/Alpaca/tastytrade public API docs).
   - Permissively licensed (`MIT`/`Apache-2.0`/`BSD`) reference libraries explicitly approved in [[License-Registry]] (with proper attribution).
2. **Strictly Banned Inputs (Hard Prohibition):**
   - Decompiling, disassembling, inspecting bytecode/JARs/minified JS, hooking memory, or packet-sniffing proprietary binaries (**MotiveWave**, **Sierra Chart**, **TradingView Charting Library**, **Bookmap**, **Quantower**, **Exocharts**, **Rithmic**, **CQG**).
   - Copying, translating, or adapting source files from `GPL`, `AGPL`, `LGPL` (core), `BSL`, `TSL`, `Commons Clause`, `PineForge`, or unlicensed GitHub repos (`flowsurface`, `PineTS`, `OpenPineScript`, `vectorbt`, `StockSharp`, `HQChart`).
   - Copying vendor icons, sound files, color-theme JSON dumps verbatim, or documentation prose.
3. **Contributor & PR Governance:**
   - Require **Developer Certificate of Origin (`DCO 1.1`, `Signed-off-by:`)** on every commit.
   - Include a mandatory PR checklist item attesting: *"This PR contains zero code, assets, or prose copied from proprietary platforms or incompatible-license repositories, and was implemented clean-room from public domain math or approved specs."*

---

## 4. MotiveWave EULA Compliance

Verified verbatim from **MotiveWave Software Terms of Service Agreement, Section 9(c)** (`R09-S06`):

> *"9.c. Prohibition on Reverse Engineering, Decompilation, and Disassembly. User may not reverse engineer, decompile, or disassemble Software. User agrees not to attempt, and if User is a corporation, User will use their best efforts to prevent User's employees and contractors from attempting to reverse compile, modify, translate or disassemble the Software in whole or in part. Any failure to comply with the above or any other terms and conditions contained herein will result in the automatic termination of this license and the reversion of the rights granted hereunder to Company."*

- **Mandatory Allegedly Rules:**
  1. **Zero inspection of MotiveWave installations, `.jar` files, Study SDK binaries, or private config formats.**
  2. Any feature parity with MotiveWave (e.g., Footprint Bars, TPO Profiles, DOM modifier-key execution, Auto-Bracket templates per `R05`/`R10`) MUST derive exclusively from domain mathematics and public product feature descriptions, implemented 100% clean-room in Rust/TypeScript.
  3. **Zero MotiveWave branding, Study SDK compatibility shims, or `"Motive*"` naming** (see Section 10).

---

## 5. Sierra Chart DTC Protocol & `.scid` File Boundaries

Verified directly from primary Sierra Chart legal pages on `2026-11-24` (`R04-S22`–`S24`, `R09-S08`):

| Artifact | Verified Legal Status (`2026-11-24`) | Allegedly Policy |
|---|---|---|
| **`DTCProtocol.php`** (Wire Protocol Spec) | **Public Domain** (*"no patent or license. The protocol is in the public domain."*) | **ALLOWED strictly as an optional execution-only wire adapter** (never for market data; warn users against Bulenox's explicit DTC bridge ban). |
| **`DTCServer.php`** (`#Restrictions`, mod. `2026-09-02`) | Explicitly blocks CME, EUREX, NASDAQ, CBOE, UTP, and CTA real-time/historical data over DTC. | **NEVER attempt to circumvent or request blocked exchange data over DTC.** |
| **`LicenseAgreement.php`** (`DATA LICENSE`, mod. `2026-10-13`) | Verbatim: *"Data included with Sierra Chart software subscriptions, Data provided by or accessed with Sierra Chart... is to be used **100% within Sierra Chart**. You agree that you will not use it in any way outside of the Sierra Chart software... All of this also applies to any data that may have been retained after your Sierra Chart subscription ends."* | **HARD BAN on ingesting, reading, or converting Sierra Chart / Denali data outside Sierra Chart.** |
| **`IntradayDataFileFormat.html` (`.scid` format)** | **Permanently removed on `2026-10-13`:** *"This documentation has been permanently removed and will not be restored. Please refer to the Sierra Chart License Agreement."* | **HARD BAN — DO NOT BUILD a `.scid` parser/importer** (even from archived docs) without explicit written legal clearance. Use Databento `.dbn` (`Apache-2.0`), Parquet, and CSV instead. |

---

## 6. Exchange Data Redistribution & Market-Data ToS Boundaries

1. **CME Group Information License Agreement (ILA) & Zero-Redistribution Architecture (`R03-S34`):**
   - Verified 2026 CME vendor fees: `$29,280/yr/exchange` real-time (`$117,120/yr` all 4 DCMs), `$21,840/yr/exchange` delayed, `$35,220/yr/exchange` historical.
   - **Rule:** Allegedly is strictly a **local client-side BYO-key / local-file software tool**. The project MUST **never** host central market-data relay servers, shared historical tick mirrors, or community tick downloads for CME, US equities SIP, or licensed feeds — nor distribute synthetic/CFD proxies disguised as CME futures (violates both `Constraints` #8 and CME DS-45 Sept 2026 rules).
2. **Gray-Area Scrapers Permanently Banned (`R03-S24`, `R03-S25`):**
   - **`yfinance` / Yahoo Finance:** Yahoo ToS bans scraping/feeds and Yahoo actively issued cease-and-desist letters to OSS scrapers in November 2026. **BANNED from core & official plugins.**
   - **Stooq:** Behind CAPTCHA + `apikey` wall since March–April 2026. **BANNED from core & official plugins.**
3. **Crypto Jurisdiction Compliance (`R03`):**
   - Out-of-the-box `$0` defaults MUST be **US-compliant regulated venues** (**Kraken Spot WS v2** + **Coinbase Advanced Trade / Exchange WS**).
   - Offshore venues with US blocks or ToS bans (**Binance Global** HTTP 451, **Bybit** HTTP 403, **Hyperliquid** US Terms prohibition) MUST NOT be enabled by default; any opt-in regional adapter requires explicit user selection and a jurisdiction-compliance notice.
4. **OTC FX Data (`Dukascopy .bi5`, `TrueFX`, `HistData`) (`R03-S31`–`S33`):**
   - None permit redistribution; Allegedly may provide only a **user-initiated local fetcher/parser** (never mirroring files) stamped loudly as `INDICATIVE OTC QUOTES — NO EXCHANGE AGGRESSOR`.

---

## 7. Broker & Prop-Firm ToS Boundaries (Aligned with `R04`)

- **Permanent `DO-NOT-BUILD` Prop Firms (4 of 8 — Enforce via `KC-03`):**
  1. **Apex Trader Funding** — categorical ban on automation/bots/APIs without personal real-time manual review (`R04-S26`, `R04-S36`).
  2. **Take Profit Trader (TPT)** — UTP #1 bans all bots/algos/custom API clients; strict copier allowlist (`R04-S27`, `R04-S37`, `R04-S38`).
  3. **Bulenox** — Terms p. 6 explicitly bans `"DTC Protocol Bridge API"` abuse & shared/commercial tools; requires prior management approval + `$100/mo` fee (`R04-S30`, `R04-S41`).
  4. **Elite Trader Funding (ETF)** — ToS §(ac) bans AI/bots/algos/unlisted copiers without express written authorization (`R04-S43`, `R04-S44`).
- **`CONDITIONAL-WRITTEN-APPROVAL` Prop Firms (3 of 8 — Do Not Build Without Written Partner Onboarding):**
  - **My Funded Futures (MFFU)**, **Tradeify** (also note sole-ownership & Tradeify-exclusive bot rules bar distributing shared FOSS bots), and **Lucid Trading** (behind-login Plan Agreement `UNVERIFIED`).
- **`PERMITTED-SANDBOX-FIRST` (1 of 8 — Strictly Sim/Local Only, Post-MVP):**
  - **Topstep** via user's own paid ProjectX Gateway API (`$14.50–$29/mo`) on **Practice / Combine / XFA ONLY** from the user's **personal local device** — Allegedly MUST programmatically warn/block Live Funded Accounts (LFA) and VPS/VPN execution if a TopstepX plugin is ever added (`R04-S17`).
- **Retail Broker Guardrails (`R04`):**
  - **Tradovate:** Explicitly excludes all prop-firm/evaluation accounts from personal API keys; requires `$1,000+` funded live brokerage account + `$25/mo` API add-on (`R04-S15`). Display mandatory eligibility notice in any future plugin.
  - **Interactive Brokers:** Use clean-room `wboayue/rust-ibapi` (`MIT`), never IBKR's GPLv3 TWS API `v10.49+`; user connects to their own local TWS/IB Gateway under their own CME Rule 576 & Market Data API acknowledgements (`R03-S29`, `R04-S03`).
  - **Rithmic & CQG:** Closed ISV NDA/Enterprise conformance paywalls (`R04-S20`, `R04-S21`) — **DO NOT EMBED** proprietary `.proto`/SDK/cert assets in FOSS core.

---

## 8. "Not Investment Advice", Execution Liability & Hypothetical Performance Disclaimers `[ATTORNEY REVIEW REQUIRED]`

Allegedly is **open-source analytical and order-routing software**, NOT a registered broker-dealer, investment adviser (RIA), commodity trading advisor (CTA), or introducing broker (IB). Required disclaimer placements (exact legal text to be finalized by counsel):

1. **`README.md` & `NOTICE`:** Prominent non-advisory notice + `Apache-2.0` §7–§8 *AS-IS / Limitation of Liability* disclaimer covering market-data inaccuracies, latency, software bugs, and financial loss.
2. **First-Run Onboarding Modal (One-Time Local Acknowledgement, Stored in Local Config):** Confirms user understands Allegedly is local-first FOSS software providing zero investment advice, zero execution guarantees, and zero broker/exchange affiliation.
3. **Per-Session `LIVE_ARMED` Confirmation Gate (v0.2+):** Every launch defaults to `LIVE_ARMED = false` (Paper/Sandbox). Arming live routing requires explicit confirmation accepting 100% user responsibility for orders, partial fills, disconnect behavior, and client-managed protective legs (where broker-native brackets are unavailable).
4. **Backtest & Replay Report Footer (CFTC Rule 4.41 Alignment Guidance):** Every exported backtest report, equity curve, or strategy summary must stamp: (a) **Fill Fidelity Tier** (`L3-FIFO` / `L2-Queue` / `L1-TradeThrough` / `Bar-Close`), (b) **Data Provenance** (`Native` vs. `Inferred` vs. `Synthetic`), and (c) standard **Hypothetical Performance Disclaimer** noting that simulated/hypothetical results have inherent limitations and do not represent actual trading or guarantee future results *(exact wording `[ATTORNEY REVIEW REQUIRED]`)*.

---

## 9. OS Keychain Secret Storage & Credential Security Hygiene

Per [[Constraints#3. Safety Rails]] and [[R04-Execution-Brokers-Props]] §3.4:

1. **Mandatory Native OS Credential Store (`open-source-cooperative/keyring-rs` `v4.2.0` / `keyring-core`, `MIT OR Apache-2.0`) [`R08-S12`]:**
   - **macOS:** Native **macOS Keychain** (`Security.framework`, per-service/per-account ACLs).
   - **Windows 10/11:** Native **Windows Credential Manager** (`CredReadW` / `CredWriteW` DPAPI-backed store).
   - **Linux:** Native **Secret Service API** (`org.freedesktop.secrets` via `libsecret` / GNOME Keyring / KWallet) with `keyutils` kernel keyring fallback; if running on a minimal headless distro without Secret Service, require explicit user opt-in to an Argon2id + ChaCha20-Poly1305 passphrase-locked local vault (never silently fall back to plaintext!).
2. **Zero-Plaintext & Zero-WebView-Exposure Architecture:**
   - **Never** write API keys, OAuth refresh tokens, or passwords to `.toml`/`.json` workspace files, SQLite databases, Obsidian vault files, crash dumps, structured logs, or git.
   - **Never** pass raw broker/provider API secrets across Tauri IPC into the WebView JavaScript heap. All HTTP/WebSocket signing and OAuth2 token refresh execute strictly inside the Rust backend process; the UI only receives opaque `CredentialRefId` handles and masked labels (`****7f2a`).
3. **Disjoint Sim-vs-Live Credential Namespaces:**
   - Store credentials under mutually exclusive service namespaces (e.g., `<app>.broker.sandbox.<provider>` vs. `<app>.broker.live.<provider>`) paired with compile-time typed host allowlists (`R04` §3.4) so a sandbox key can never authenticate to a live broker endpoint.
4. **Memory Hygiene:**
   - Use `zeroize` (`Apache-2.0 OR MIT`) on secret buffers in Rust and run `keyring-rs`'s built-in heap **Leak Test** (`R08-S12`) in CI to verify dropped secrets do not linger in process memory.

---

## 10. Trademark Risk Assessment: `"MotiveView"` & `"MotiveScript"` + 5 Clean-Room Alternative Names `[ATTORNEY REVIEW REQUIRED]`

### 10.1 Verified Trademark Exposure of Current Working Names

| Working Name | Conflicting Active Federal Marks (`2026-11-24`) | Conflict Mechanism | Risk Rating | Action Required |
|---|---|---|---|---|
| **`MotiveView`** | 1. **`MOTIVEWAVE`** — USPTO Reg. **`#3937578`** (Serial `#85093420`, Silver Bullet Solutions Inc., renewed `2021-04-28`, **Class `009`**: *"Computer programs and computer software for electronically trading securities"*) [`R09-S07`]<br>2. **`TRADINGVIEW`** — USPTO Reg. **`#5632149`** (Serial `#87902086`, TradingView, Inc., reg. `2018-12-18`, **Class `042`**: financial charting software & widgets) [`R09-S07`] | Direct portmanteau combining `Motive-` + `-View` in identical software classes (`009`/`042`) for identical retail traders, with public documentation comparing both incumbents. High risk of C&D, GitHub trademark takedown, domain UDRP, and Lanham Act confusion claims. | **CRITICAL / HIGH** | **Retire before public `v0.1` launch.** Keep as internal planning codename only. |
| **`MotiveScript`** | **`MOTIVEWAVE`** — USPTO Reg. **`#3937578`** (Class `009`) + MotiveWave Java Study SDK | Reuses exact distinctive `Motive-` prefix in identical trading-software class. | **HIGH** | **Retire before public launch.** Pair DSL name with chosen clean-room brand. |

### 10.2 Five Clean-Room, Distinctive Alternative Names (Preliminary Screening `2026-11-24`)

Every candidate below avoids all substrings of `MotiveWave`, `TradingView`, `Pine`, `Sierra`, `Bookmap`, `Quantower`, `Flowsurface`, `Exocharts`, `TensorCharts`, `TradingLite`, and `OpenBB`, and passed live exact-name GitHub + web/trademark screening with **zero exact hits** on `2026-11-24` (`R09-S14`):

| Option | App Name | Paired DSL Name | Distinctiveness Tier | Brand Positioning | Preliminary Screening (`2026-11-24`) |
|---|---|---|---|---|---|
| **1 (Recommended)** | **`Ordlith`** | `LithScript` | **Fanciful / Coined** *(strongest)* | Order-book + *lith* (stone): local-first permanence, rock-solid deterministic fixed-point engine | `0` GitHub exact repos; `0` exact web/software/trademark matches |
| **2** | **`Rungcraft`** | `RungScript` | **Suggestive** | DOM price-ladder *rungs* + craftsman-grade control over studies, profiles, and settings | `0` GitHub exact repos; `0` exact web/software/trademark matches |
| **3** | **`Cairntape`** | `CairnScript` | **Suggestive** | Stacked Volume/TPO Profile *cairns* anchored to the live executed *tape* | `0` GitHub exact repos; `0` exact web/software/trademark matches |
| **4** | **`Tallyrung`** | `TallyScript` | **Suggestive** | Exact integer volume *tallies* mapped across DOM price *rungs* | `0` GitHub exact repos; `0` exact web/software/trademark matches |
| **5** | **`Tickkiln`** | `KilnScript` | **Suggestive** | High-throughput tick ingestion & compiled WASM/order-flow forging | `0` GitHub exact repos; `0` exact web/software/trademark matches |

### 10.3 Mandatory Pre-Launch Trademark Clearance Steps (`UNVERIFIED` Until Completed by Counsel)
1. Select primary choice (and 1 backup) from the 5 candidates above.
2. Retain a trademark attorney to run a comprehensive **USPTO TSDR + EUIPO + WIPO Global Brand Database + state/common-law phonetic & conceptual clearance search** across **Classes `009`, `036`, and `042`** (including both App Name and Paired DSL Name).
3. Only after written attorney clearance: register domain(s), GitHub organization, crates.io / npm namespaces, and consider filing a Class `009` trademark application (or documenting first-use common-law priority + defensive Trademark Policy modeled on clean FOSS norms).
