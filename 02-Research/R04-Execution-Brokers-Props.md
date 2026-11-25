---
title: Broker Execution APIs, DTC Protocol & Prop-Firm Legality Matrix
track: R04
status: verified
owner: research-execution
updated: 2026-11-24
code_refs: []
---

# R04 — Broker Execution APIs, DTC Protocol & Prop-Firm Legality Matrix

> **Operating Boundary (`Constraints.md` §3):** Paper, sandbox, and public primary-documentation research **only**. Zero live orders placed, zero brokerage or prop-firm accounts created, zero commercial agreements signed, and zero credentials stored.

---

## Question

Which broker execution APIs, open wire protocols (specifically Sierra Chart's DTC protocol), crypto execution libraries, and futures prop-firm gateways are **legally usable, technically viable, and aligned with MotiveView's FOSS / $0-core / local-first non-negotiables**? Specifically:

1. What are the documented authentication models, sandbox availability, fees, Terms of Service (ToS) restrictions, and FOSS SDK licenses across Interactive Brokers, Alpaca, Tradier, tastytrade, Tradovate, ProjectX, Rithmic, CQG, Sierra Chart DTC, and major crypto FOSS execution stacks?
2. For all **8 named futures prop firms** (Topstep, Apex Trader Funding, Take Profit Trader, My Funded Futures, Tradeify, Bulenox, Lucid Trading, Elite Trader Funding), what execution gateways do they use, are custom/third-party API clients and automated strategies permitted, and which firms must be marked **`DO-NOT-BUILD`**?
3. What order semantics, state-machine invariants, fixed-point math, idempotency, sim-vs-live isolation, and kill-switch safety architecture must MotiveView enforce before routing any broker order?
4. Which sandbox broker and pre-declared pass/fail thresholds should govern **Phase 2 Spike S06**?

---

## Findings

> Per `01-Charter/Constraints.md` §2, verified primary-source **Facts** are presented in this section and in the tables below; derived conclusions appear strictly in **Inferences** and **Recommendation + Rationale**.

### 1. Broker & Gateway APIs (Verified Primary Facts)

#### 1.1 Interactive Brokers (TWS API, Client Portal / Web API, `ib_async`)
- **Transport & Auth:**
  - **TWS API:** Local TCP socket protocol connecting to Trader Workstation (default paper port `7497`) or IB Gateway (default paper port `4002`), supporting Python, Java, C++, C#, and Protobuf (`R04-S01`).
  - **Client Portal / Web API:** HTTP/REST + WebSocket via a locally hosted Java Client Portal Gateway for individual accounts (no onboarding approval required), or OAuth 1.0a/2.0 for commercial third-party vendors (`R04-S02`).
- **Sandbox / Paper Availability:**
  - **Paper Trading Account** ($1M simulated equity; supports TWS, IB Gateway, and Web API) requires an **approved live IBKR account** (and funding for live market data subscriptions to carry over). Paper fills simulate from top-of-book only and omit several order types (`R04-S01`).
  - **Free Trial / Demo Account** requires no live account, works with **TWS only** (IB Gateway rejects logins without an active account), and restricts data to delayed quotes without real-time subscription feeds (`R04-S01`).
- **Fees & Licensing / ToS:**
  - **$0 API access fee**, but real-time API market data requires paid exchange subscriptions (APIs are treated as off-platform under exchange rules), and redistributing market data to third parties without written approval is prohibited (`R04-S01`, `R04-S02`).
  - Official `ibapi` source code is distributed under IBKR's proprietary **IB API Non-Commercial License** or **Commercial License** (`R04-S01`) — incompatible with bundling inside MotiveView's FOSS core (`Constraints.md` §1.1).
  - Third-party Web API OAuth integration requires a business entity, live website, multi-tier IBKR Compliance onboarding, and an executed Web API Agreement (`R04-S02`).
- **FOSS SDK:** [`ib-api-reloaded/ib_async`](https://github.com/ib-api-reloaded/ib_async) is licensed under **BSD-2-Clause** (verified from `LICENSE`, 1,796 stars, pushed `2026-11-24`, active successor to archived `ib_insync`) (`R04-S03`, `R04-S04`). It speaks the TWS binary socket protocol directly without wrapping IBKR's proprietary `ibapi` package; end-user sessions remain governed by the user's IBKR account/data agreements.

#### 1.2 Alpaca (Trading API — Paper & Live REST/WebSocket)
- **Transport & Auth:**
  - REST v2: Live `https://api.alpaca.markets/v2`, Paper `https://paper-api.alpaca.markets/v2`; headers `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY` (`R04-S05`).
  - WebSocket streaming (`trade_updates`): `wss://api.alpaca.markets/stream` (live) and `wss://paper-api.alpaca.markets/stream` (paper) (`R04-S06`).
- **Sandbox / Paper Availability:**
  - **Free Paper-Only Account** requires only an email address — no brokerage application, KYC approval, or funding (`R04-S05`).
  - Starts with $100,000 simulated equity (accounts can be created/deleted from dashboard to reset), shares identical REST/WS schemas with live trading, includes free real-time **IEX** equities data and simulated crypto trading (`R04-S05`).
  - **Verified Simulation Fidelity:** Non-marketable limit orders fill only when marketable against real-time quotes; eligible fills receive **random partial fills 10% of the time** (valuable for testing partial-fill OMS logic). Does not model market impact, queue position, latency slippage, or NBBO size caps (`R04-S05`).
- **Order Semantics:** Native `client_order_id` idempotency, `order_class` supporting `simple`, `bracket`, `oco`, and `oto`, plus native `trailing_stop` (dollar or percentage trail with server-tracked high-water mark) (`R04-S07`).
- **Fees & ToS:** **$0 API fee**, $0 retail US equity/ETF/equity-option commission (regulatory pass-through fees apply; crypto has maker/taker fees; Basic IEX market data is $0; Algo Trader Plus SIP data is $99/mo). Users assume sole risk for API execution under the Alpaca Customer Agreement (`R04-S05`, `R04-S07`).
- **FOSS SDKs:** Official [`alpacahq/alpaca-py`](https://github.com/alpacahq/alpaca-py) (**Apache-2.0**, 1,603 stars, pushed `2026-11-24`) and [`alpacahq/alpaca-trade-api-js`](https://github.com/alpacahq/alpaca-trade-api-js) (**Apache-2.0**, 606 stars, pushed `2026-10-30`) (`R04-S08`, `R04-S04`).

#### 1.3 Tradier (Brokerage API — Sandbox & Live)
- **Transport & Auth:** REST v1 Live `https://api.tradier.com/v1/`, Sandbox `https://sandbox.tradier.com/v1/`. Static Bearer token for personal accounts; OAuth for approved Tradier Partners (`R04-S09`).
- **Sandbox / Paper Availability:** $100,000 paper sandbox available with no deposit required. **Critical Sandbox Limitations:** Market data is delayed 15 minutes (no index data or Greeks), and **WebSocket/HTTP streaming is NOT available in Sandbox** (`R04-S09`).
- **Fees & ToS:** **$0 API fee** across Lite ($0/mo; $0.35/equity trade & $0.35/option contract), Pro ($10/mo; $0 equity/options), and Pro Plus ($35/mo) (`R04-S10`). Individual API access is strictly for **personal use only**; distributing an application to other users requires formal **Tradier Partner** approval (`R04-S09`, `R04-S11`). Market data cannot be redistributed outside active Tradier accounts (`R04-S11`).

#### 1.4 tastytrade (Open API & Certification Sandbox)
- **Transport & Auth:**
  - Production REST `https://api.tastyworks.com` / Streamer `wss://streamer.tastyworks.com`; Certification Sandbox REST `https://api.cert.tastyworks.com` / Streamer `wss://streamer.cert.tastyworks.com` (`R04-S12`, `R04-S13`).
  - **OAuth2 mandatory** (legacy username/password `POST /sessions` was decommissioned in February 2026); personal grant refresh tokens mint 15-minute access tokens. Every request requires a `<product>/<version>` `User-Agent` header (`R04-S13`).
  - Supports equities, options, futures, futures options, crypto, complex orders (`OTO`/`OCO`/`OTOCO`), and `POST /accounts/{account_number}/orders/dry-run` pre-flight validation (`R04-S12`).
- **Sandbox / Paper Availability:** Free self-service certification sandbox with separate credentials and `/sandbox/*` management endpoints. **Verified Sandbox Limitations (`developer.tastytrade.com/docs/sandbox`):**
  - REST `/market-data` and `/market-metrics` return **HTTP 502** across all sandbox routes; streaming DXLink quotes require a quote token from a production session (`R04-S12`).
  - Orders route to internal simulators (`MARKET_SIMULATOR_A` / `MARKET_SIMULATOR_CME`), and tastytrade's own docs note that only equity fills have been reliably exercised and observed in sandbox (`R04-S12`).
- **Fees & ToS:** **$0 API fee**; standard live brokerage commissions apply in production ($0 stocks/ETFs; $1.00/contract futures, $0.75 micros). API ToS prohibits third-party integrators from storing customer login credentials directly (OAuth required) and bars market data redistribution (`R04-S13`).
- **FOSS SDKs:** Official [`tastytrade/tastytrade-api-js`](https://github.com/tastytrade/tastytrade-api-js) (**MIT**, 108 stars, pushed `2026-05-17`); official Python repo archived; active community Python SDK [`tastyware/tastytrade`](https://github.com/tastyware/tastytrade) (**MIT**, 261 stars, pushed `2026-08-07`) (`R04-S14`, `R04-S04`).

#### 1.5 Tradovate (REST & WebSocket API)
- **Transport & Auth:** REST + WebSocket JSON (`live.tradovateapi.com/v1` and `demo.tradovateapi.com/v1`), Bearer token auth via API key (CID + Secret) or Partner OAuth 2.0; dynamic rolling rate limits with penalty tickets (`p-tickets`) (`R04-S15`).
- **Hard Paywall & Prop-Firm Exclusion (Verified Verbatim, Updated 2026-09-16):**
  - *"To generate an API key, you must first have a live, funded Tradovate account with a minimum balance of $1,000. Additionally, your account must include an active subscription to the API Access Add-on [$25/month]."* (`R04-S15`).
  - *"Prop firm and evaluation accounts are not eligible for API access. A live, funded Tradovate brokerage account is required."* (`R04-S15`).
  - *"The Tradovate API Add-on does not provide access to real-time market data. ... To access real-time or historical market data websocket streaming through the Tradovate API, you must become a sub-vendor with the CME by signing the CME Information License Agreement (ILA)."* Execution-only / account-query use does **not** require the CME ILA (`R04-S15`).
- **Sandbox / Demo:** Demo endpoints exist, but **cannot** be accessed via personal API keys without first holding a $1,000+ funded live Tradovate account + $25/mo API subscription + signed risk attestation/digital API agreement (`R04-S15`).

#### 1.6 ProjectX Gateway (REST + SignalR — TopstepX Exclusive)
- **Transport & Auth:** HTTPS `POST` JSON REST (`https://api.topstepx.com`, OpenAPI/Swagger v1.0.0) + Microsoft SignalR WebSockets (`https://rtc.topstepx.com/hubs/user` and `/hubs/market`), authenticated with a 24-hour JWT (`POST /api/Auth/loginKey`) (`R04-S16`). Rate limits: 50 req/30s for `retrieveBars`, 200 req/60s for other endpoints (`R04-S16`).
- **2026 Exclusivity Change:** ProjectX discontinued licensing to third-party prop firms in early 2026 (confirmed by Tradeify's Help Center noting ProjectX dropped its external prop clients, and Bulenox removing ProjectX) and now operates exclusively as Topstep's TopstepX API (`R04-S17`, `R04-S29`, `R04-S30`).
- **Pricing, Sandbox & Restrictions:**
  - **$29/month** standard (**$14.50/month** ongoing with promo code `topstep`), billed separately by ProjectX Trading LLC (formerly Sim2Funded Solutions LLC); requires an active Topstep account (`R04-S17`, `R04-S18`).
  - **No dedicated sandbox:** *"No. There is currently no sandbox environment available. To test your strategy, use a Practice account instead — same endpoints and real-time hubs"* (`R04-S17`).
  - **SIM Only:** *"No, Live funded accounts are not allowed to trade through the ProjectX API. The API Gateway is built for the simulated environment and isn't available on Live."* (`R04-S17`).
  - **Personal Device Only (VPS/VPN Ban):** *"All trading activity must originate from your personal device. The use of VPS, VPNs, and remote servers is prohibited by Topstep's Terms of Use."* Private servers may only store data, backtest, log, or host read-only dashboards (`R04-S17`).

#### 1.7 Rithmic (`R|API+` & `R|Protocol API`)
- **Access & Licensing Reality:** Closed, agreement-gated institutional/ISV ecosystem (`R|API+` C++/.NET libraries; `R|Protocol API` WebSockets + Protobuf). Rithmic does **not** publish public wire specs, SDKs, or `.proto` files (`R04-S19`, `R04-S20`).
- **Mandatory Conformance & Application Identity:** Every production application must pass Rithmic conformance testing (monitored session logs across submit/modify/cancel/disconnect-recovery scenarios) to receive production URIs and an application-scoped four-character `app_name` prefix. Material updates can trigger re-certification (`R04-S20`).
- **Fees:** Exact direct Rithmic conformance fee is not publicly published (`UNVERIFIED` — see Open Questions). Retail futures FCMs pass through monthly API access fees (commonly ~$100/mo API + ~$25/mo base connection + ~$0.10/contract routing) plus exchange data fees (`R04-S19`).
- **FOSS Wrapper Legality:** Rithmic's Software System License Agreement restricts use, disclosure, reverse engineering, and redistribution. Bundling Rithmic `.proto` files, generated bindings, C++ headers/DLLs, or TLS cert files in a public FOSS repository exposes maintainers to breach-of-contract, copyright/DMCA takedowns, and access termination. Notably, **NautilusTrader closed RFC #3768** for an official Rithmic R|Protocol adapter specifically due to non-public `.proto` redistribution bans and incompatibility of per-application `app_name` conformance/re-certification with open-source development (`R04-S20`).

#### 1.8 CQG (`WebAPI` & `FIX Connect`)
- **Enterprise Gating (Verified Verbatim):** Both **CQG WebAPI** (Protobuf over TLS WebSockets) and **CQG FIX Connect** (FIX 4.2 order routing/drop copy; no market data) are **Enterprise APIs**. CQG's official *Enterprise API Questionnaire* states: *"These APIs serve enterprise customers. If you are not affiliated with a company and have questions about CQG API services for individual use, please submit the CQG Client API Questionnaire. ... Login credentials to CQG's API demo environment will only be issued after the CQG API Services Agreement is executed and application fee is received."* (`R04-S21`).
- **Conformance & Fees:** Mandatory 7-stage conformance testing with UTC-timestamped logs emailed to `apihelp@cqg.com` prior to production `client_app_id` issuance. Enterprise pricing is unlisted ("Contact us for pricing" — **`UNVERIFIED`** exact dollar tiers). Individual COM-based Client APIs require paid CQG Integrated Client + Trading + API add-on subscriptions (`R04-S21`).

#### 1.9 Sierra Chart DTC Protocol — Two-Part Legality & Feasibility Audit
A critical distinction separates the **DTC wire specification** from **Sierra Chart's proprietary DTC Server**:

1. **The DTC Wire Protocol Specification (`DTCProtocol.php`) — OPEN / PUBLIC DOMAIN:**
   - Verified verbatim from `#OpenSpecification`: *"The specifications for the DTC Protocol has no license and is in the public domain. ... Complete and open documentation for the DTC Protocol is found on the DTC Messages and Procedures page. It has no copyrights. ... Patent/License: This protocol has no patent or license. The protocol is in the public domain."* (`R04-S22`).
   - Supports Binary, Binary VLS, JSON, Compact JSON, and Protobuf over TCP or WebSockets. **Note:** Spec Principle #4 explicitly excludes managed order types like trailing stops from standard DTC (`R04-S22`).
   - **Implication:** MotiveView may legally implement a clean-room DTC client or server adapter under an open-source license with zero licensing/patent encumbrance.

2. **Sierra Chart's DTC Protocol Server & Denali Data (`DTCServer.php` + `LicenseAgreement.php`) — STRICT MARKET-DATA BLOCK & `DATA LICENSE` PROHIBITION:**
   - Verified verbatim from `DTCServer.php` (`#Restrictions`, last modified 2026-09-02): *"It is not possible to access real-time or historical data from the CME Group of exchanges, EUREX, NASDAQ, CBOE, US equities data originating from UTP or CTA, from the DTC Protocol server. Requests are rejected in these cases."* (`R04-S23`).
   - Verified verbatim from `LicenseAgreement.php` (`DATA LICENSE`): *"Additionally, any form or type of Data included with Sierra Chart software subscriptions, Data provided by or accessed with Sierra Chart, and website information and data, is to be used 100% within Sierra Chart. You agree that you will not use it in any way outside of the Sierra Chart software."* (`R04-S24`).
   - **Execution-Only Path:** Trading messages (`Allow Trading` enabled in Sierra Chart's DTC Server) remain supported for external clients (`R04-S23`), **but** only if the user already pays for Sierra Chart, obtains market data from a completely independent licensed provider, and complies with downstream broker/prop rules (note: **Bulenox** explicitly names *"DTC Protocol Bridge API"* abuse in its Terms of Use! `R04-S30`).

#### 1.10 Crypto Execution FOSS Ecosystem (Verified Licenses & Maintenance on 2026-11-24)
All four candidate libraries were verified directly via their repository `LICENSE` files and live GitHub API metadata on `2026-11-24` (`R04-S04`, `R04-S32`–`R04-S35`):

- **`ccxt/ccxt`** — **MIT** (`LICENSE.txt`), 44,977 stars, pushed `2026-11-24`, active. Unified REST + WebSocket execution across 100+ CEX/DEX venues (TS/JS, Python, Go, C#, PHP, Java, Rust bindings). Note: includes default exchange broker IDs / DEX builder fees, which can be inspected and overridden under MIT (`R04-S32`, `R04-S04`).
- **`barter-rs/barter-rs`** — **MIT** (`LICENSE`), 2,377 stars, pushed `2026-08-24`, active. Native Rust modular crates (`barter-execution`, `barter-data`, `barter-instrument`, `barter-integration`) with zero-GC statically linkable `ExecutionClient` traits (`R04-S33`, `R04-S04`).
- **`hummingbot/hummingbot`** — **Apache-2.0** (`LICENSE`), 21,388 stars, pushed `2026-11-24`, active. Python/Cython + Gateway middleware covering 140+ CEX/DEX connectors; heavy runtime footprint if embedded inside a `< 40 MB` native terminal, best used as an exchange-quirk reference (`R04-S34`, `R04-S04`).
- **`nautechsystems/nautilus_trader`** — **LGPL-3.0-only** (`LICENSE`), 31,788 stars, pushed `2026-11-24`, active. Rust core + Python bindings. **License Caution:** Statically linking LGPL-3.0 Rust crates into a distributed binary triggers LGPL-3.0 relinkability obligations (and modified library code must remain LGPL-3.0); also carries a Trademark Policy and upstream CLA (`R04-S35`, `R04-S04`). Strong architectural reference, unsuitable as a statically linked core dependency unless MotiveView itself adopts compatible copyleft/dynamic-linking hygiene.

---

### 2. Prop-Firm Legality Audit (All 8 Named Firms — Primary Rulebooks)

> **Critical Structural Finding:** Every futures prop firm below enforces strict anti-hedging rules (CME Rule 534 — opposing positions across accounts or correlated contracts such as `ES`/`MES` or `NQ`/`MNQ`), bans HFT and simulated-fill exploitation, and assigns 100% liability for software errors to the trader. Furthermore, **Tradovate explicitly excludes all prop-firm/evaluation accounts from personal API keys** (`R04-S15`), **ProjectX dropped external prop firms in 2026 to become Topstep-exclusive** (`R04-S17`, `R04-S29`, `R04-S30`), and **Rithmic/CQG require closed ISV conformance agreements** (`R04-S20`, `R04-S21`).

1. **Topstep** (`R04-S17`, `R04-S25`) — **Verdict: `PERMITTED-SANDBOX-FIRST` (Conditional: Practice/Combine/XFA Only, Paid API, Personal Device Only)**
   - *Gateways:* TopstepX / ProjectX Gateway API (REST + SignalR); Quantower native via ProjectX.
   - *Custom/3P API Clients:* Explicitly permitted on Practice, Trading Combine®, and Express Funded Account® via user's own paid ProjectX API subscription ($29/mo; $14.50/mo with code `topstep`), at trader's own risk. **Strictly prohibited on Live Funded Accounts (LFAs)** and **strictly prohibited via VPS, VPN, proxy, or remote servers** (order transmission must originate from the trader's personal device).
   - *Automation & Copy Trading:* Personal bots allowed on Combine/XFA (no HFT, no SIM-fill exploitation). Built-in Trade Copier allowed on Combine/XFA (max 5 XFAs; not LFA). Cross-user copying and hedging banned.
   - *Written Permission:* Not required for an individual user connecting their own local client via paid ProjectX API key; required only for official zero-fee native platform partnerships (e.g., Quantower).

2. **Apex Trader Funding** (`R04-S26`, `R04-S36`) — **Verdict: `DO-NOT-BUILD`**
   - *Gateways:* Rithmic, Tradovate, WealthCharts.
   - *Custom/3P API Clients:* **Prohibited for automated/API execution.** User Agreement prohibits *"Use of automation devices to automatically execute or mimic the manual placement of orders"* and *"Submission or modification of orders by any system without the User's personal, real-time review and approval at the time of the action."* Tradovate prop accounts cannot generate API keys; Rithmic is contract-gated.
   - *Automation & Copy Trading:* **Categorical ban** on all automation, bots, AI, scripts, and algorithms across Evaluation, PA, and Live Prop accounts (*Prohibited Activities*: *"No Automation or Algorithm Usage allowed"*). Personal copy trading permitted only across user's own accounts (max 20 PAs/household) from a manually traded Originating Account in the same direction (no group trading on Live Prop); external copy/signal services banned.
   - *Written Permission:* Apex encourages prior software approval, and automated/API execution is disallowed regardless.

3. **Take Profit Trader (TPT)** (`R04-S27`, `R04-S37`, `R04-S38`) — **Verdict: `DO-NOT-BUILD`**
   - *Gateways:* CQG (Tradovate, TradingView, NinjaTrader) and Rithmic (11 listed commercial platforms).
   - *Custom/3P API Clients:* **Prohibited for automated/API execution**; only listed CQG/Rithmic platforms are supported.
   - *Automation & Copy Trading:* **Categorical ban** under Universal Trading Policy #1: *"#1: No Trading Bots or Algos. Automated trading systems, bots, or algorithmic execution tools are not permitted."* All trades must be manually executed across Test, PRO, and PRO+. Trade copiers are restricted to a **strict allowlist** (Tradesyncer, TradeCopia, Affordable Indicators, Replikanto Flowbot Compliance Edition, or native platform copiers) for user's own accounts only.
   - *Written Permission:* Unlisted copiers/clients are unauthorized; bots/APIs are categorically banned.

4. **My Funded Futures (MFFU)** (`R04-S28`, `R04-S39`) — **Verdict: `CONDITIONAL-WRITTEN-APPROVAL`**
   - *Gateways:* Tradovate (Tradovate/NinjaTrader/TradingView), dxFeed/Volumetrica (Quantower, Volumetrica, DeepChart/DeepDOM, ATAS), Hyperprop.
   - *Custom/3P API Clients:* No native MFFU API; Tradovate prop accounts are ineligible for personal Tradovate API keys (`R04-S15`). Connecting an unapproved custom desktop client directly requires gateway + MFFU platform/partner authorization.
   - *Automation & Copy Trading:* *Fair Play Section 1* permits personal automated trading strategies tailored to the trader's own settings (no HFT, no SIM-fill exploitation; CME guidelines apply on live). Own-account copy trading permitted (Tradesyncer, Tradovate Group, or external copiers at trader's risk); copying other traders and device sharing banned.
   - *Written Permission:* Required for MotiveView to onboard as a supported third-party platform/partner (plus underlying gateway authorization). *Note:* Behind-login live-account API addendum terms are `UNVERIFIED` (see Open Questions).

5. **Tradeify** (`R04-S29`, `R04-S40`) — **Verdict: `CONDITIONAL-WRITTEN-APPROVAL`**
   - *Gateways:* Tradovate (Tradovate, NinjaTrader, TradingView), Rithmic (Tradesea, Quantower, Sierra Chart, R|Trader Pro), WealthCharts. *(ProjectX discontinued in 2026.)*
   - *Custom/3P API Clients:* Tradovate API is unavailable on Evaluation and Simulated Funded accounts (and Tradovate requires a $1,000+ personal live brokerage account for API keys); Rithmic requires Rithmic conformance.
   - *Automation & Copy Trading:* *Guidelines for Traders* (updated 2026-10-16) allow personal bots **only** under strict conditions: (a) **sole ownership** (no one else may access or use the bot — live video proof of enabling code on trader's PC may be required), (b) **exclusive use at Tradeify** (running the same bot across multiple prop firms is prohibited), and (c) no HFT + 10-second microscalping payout rule on funded accounts. Own-account copy trading allowed (same direction; no cross-product-group hedging).
   - *Written Permission:* Required for any direct third-party platform integration; sole-ownership + Tradeify-only rules also bar distributing shared FOSS strategy bots for Tradeify.

6. **Bulenox** (`R04-S30`, `R04-S41`) — **Verdict: `DO-NOT-BUILD`**
   - *Gateways:* Rithmic (primary, 20+ listed platforms), Tradovate. *(ProjectX discontinued in Feb 2026.)*
   - *Custom/3P API Clients:* **Explicitly restricted & fee-gated.** `Terms_of_Use.pdf` (Page 6, `ALGORITHMS AND AUTO TRADING`) explicitly cites **"DTC Protocol Bridge API"** alongside "scalping algorithms" and "automated discretional trading" as prohibited program abuse, mandates **prior review and approval by Bulenox management** for any third-party software/algorithm, and charges **$100/month** for Third-Party API / Trader Composite Software connectivity to Rithmic (which explicitly *"does not constitute approval of any specific algorithm, strategy, or software"*).
   - *Automation & Copy Trading:* Commercial, shared, rented, or publicly distributed bots/copiers are prohibited; only user-built personal tools subject to management approval are permitted; VPS/VPN banned.
   - *Written Permission:* Mandatory prior written management approval + $100/mo fee + Rithmic conformance.

7. **Lucid Trading (Lucid)** (`R04-S31`, `R04-S42`) — **Verdict: `CONDITIONAL-WRITTEN-APPROVAL`** *(with `UNVERIFIED` behind-login Plan Agreement clauses)*
   - *Gateways:* CQG (NinjaTrader, Tradovate, TradingView) and Rithmic (Quantower partner, Tradesea, MotiveWave, Sierra Chart, Jigsaw, Bookmap, ATAS, R|Trader Pro, MultiCharts).
   - *Custom/3P API Clients:* No proprietary Lucid API; all execution runs through CQG or Rithmic (closed gateways) or Tradovate prop logins (ineligible for personal API keys).
   - *Automation & Copy Trading:* Public Help Center (*Other Trading Activities*) explicitly states: *"Automated trading systems and trade copiers are permitted"* (no HFT, no microscalping where >50% of profit comes from ≤5s trades, no cross-account or cross-prop-firm hedging). However, historical signed plan agreements (e.g., LucidDirect Account Agreement) contained prior-written-approval clauses for custom automated software — current behind-login plan agreements are marked **`UNVERIFIED`**.
   - *Written Permission:* Required for official platform/gateway integration and to verify current Plan Agreement custom-client terms.

8. **Elite Trader Funding (ETF)** (`R04-S43`, `R04-S44`) — **Verdict: `DO-NOT-BUILD`**
   - *Gateways:* Tradovate, Rithmic ($45/mo feed fee reported on new accounts starting Jan 28, 2026), Tickblaze. *(LIVE ELITE accounts support Rithmic-compatible platforms only — Tradovate/NinjaTrader not supported in Live.)*
   - *Custom/3P API Clients:* **Prohibited without express written authorization.** `Terms of Service Section (ac)` prohibits any account that *"makes use of artificial intelligence (AI), bots, automated trading systems, trade copiers, or other automated trading strategies that are not expressly authorized in writing by ETF."* Unauthorized automated trades are excluded from "Genuine Activity."
   - *Automation & Copy Trading:* Bots, EAs, algos, and AI banned without express written authorization; ETF states the **only** currently authorized automated tools are its allowlisted trade copiers (Tradesyncer, Tradecopia, Affordable Indicators, Replikanto Flowbot PropFirm Compliance Edition, native platform copiers). Strict no-VPN/VPS/proxy rule (except approved partner IP ranges) and no-same-household rule.
   - *Written Permission:* Mandatory express written authorization under ToS §(ac).

---

### 3. Order Semantics & Execution Safety Architecture

Per `01-Charter/Constraints.md` §1.7 (**zero IEEE-754 binary floats for money, tick math, or order quantities**) and `01-Charter/Glossary.md`, MotiveView's Execution Engine (OMS) must enforce the following architecture across all brokers and local simulation:

1. **Fixed-Point Domain Types (Non-Negotiable #7):**
   - Represent all order prices as exact signed tick counts `PriceTicks(i64)` bound to an immutable `InstrumentSpec { venue, symbol, tick_size_num: i64, tick_size_den: i64, qty_scale: u32, currency }`, or exact fixed-scale decimal (`i128` scaled integers). Format to broker wire strings (`"5942.25"`) only at the adapter serialization boundary; parse broker fills directly from JSON strings into integer ticks without intermediate `f64`.
2. **Bracket Orders, OCO, Auto-Bracket Templates & Trailing Stops:**
   - **Broker-Native First:** Prefer server-held atomic brackets (`Alpaca order_class=bracket|oco|oto`, `tastytrade OTO/OCO/OTOCO`, `IBKR parentId + ocaGroup`, `Tradovate OSO`).
   - **Auto-Bracket Templates (vendor-neutral equivalent of "ATM strategies"):** Local workspace presets attaching protective stop-loss ticks + 1..N profit-target tiers + optional break-even move or trailing-stop rule upon entry submission.
   - **Synthetic/Client-Managed Fallback Warning:** Where a broker or protocol (e.g., standard DTC Principle #4, which omits trailing stops `R04-S22`) does not natively hold a stop/trail server-side, MotiveView must display a persistent warning badge (*"CLIENT-MANAGED PROTECTIVE LEG — INACTIVE IF DISCONNECTED"*) and never silently downgrade a server-held stop to a client-held stop.
3. **Partial Fills State Machine & Bracket Quantity Coupling:**
   - Canonical order states: `IntentLogged -> PendingNew -> Working -> PartiallyFilled -> Filled | PendingCancel -> Canceled | PendingReplace -> Replaced | Rejected | Expired`.
   - Track `(order_qty, cum_filled_qty, leaves_qty, avg_fill_price_ticks)` strictly in integer units. When a bracket entry receives a partial fill of `k < N` units (e.g., Alpaca Paper's 10% random partial-fill simulation `R04-S05`), client-managed or OTO protective legs MUST size to `k` and increment atomically as additional fills arrive — preventing over-hedged accidental position reversals.
4. **Sim vs. Live Hard Separation:**
   - Separate strongly typed environments (`ExecutionEnv::LocalPaper`, `ExecutionEnv::BrokerSandbox`, `ExecutionEnv::BrokerLive`) with disjoint host allowlists (e.g., `paper-api.alpaca.markets` vs `api.alpaca.markets`; `api.cert.tastyworks.com` vs `api.tastyworks.com`) so a sandbox credential can **never** serialize a request to a live host.
   - Credentials live exclusively in the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service) — never in workspace files, vault notes, or git.
   - Persistent visual chrome distinction (blue/amber workspace ribbon for Paper/Sandbox; high-contrast crimson frame + explicit confirmation dialog for Live) plus a per-session **`LIVE_ARMED`** switch that resets to `false` on every app launch.
5. **Reject Handling, Reconnect & `client_order_id` Idempotency:**
   - **Write-Ahead Intent Log (WAL):** Persist every order intent with a deterministic UUIDv7 `client_order_id` to local SQLite **before** transmitting over the network.
   - **No Blind Retries:** On HTTP timeout, 5xx, or socket drop, **never** blindly re-POST `POST /orders`. Instead, query broker state by `client_order_id` (`GET /v2/orders:by_client_order_id` on Alpaca, `order/list` / `reqOpenOrders` elsewhere) before marking failed or re-issuing.
   - **Reconnect Reconciliation:** On WebSocket disconnect, immediately transition the adapter to `RECONCILING` (blocking new order entry), re-establish stream, fetch authoritative REST snapshots of Open Orders + Positions + Recent Fills, diff against the local SQLite OMS ledger, resolve or flag any orphan orders/position drift with an explicit modal before re-enabling trading.
6. **Hard Kill-Switch & Flatten-All Sequence:**
   - Global remappable hotkey + always-visible panic button + automatic risk circuit-breakers (daily loss limit, max net position, runaway order-rate guard, cross-account anti-hedging guard).
   - **4-Step Atomic Protocol:**
     1. **HALT OMS:** Immediately freeze local dispatch queue and reject all pending UI/script order intents.
     2. **CANCEL ALL WORKING ORDERS:** Issue broker bulk cancel (e.g., `DELETE /v2/orders`) with parallel per-order cancel fallback.
     3. **VERIFY ZERO WORKING ORDERS:** Confirm no resting entries remain that could fill during liquidation.
     4. **MARKETABLE FLATTEN + VERIFY FLAT:** Submit broker close-all (`DELETE /v2/positions?cancel_orders=true`) or opposing marketable orders for every non-zero position, poll REST + WS until `all positions == 0`, and trigger a loud persistent alarm if unconfirmed after 5 seconds (directing the user to intervene via broker portal/phone).

---

### 4. Phase 2 Spike S06 Plan & Pre-Declared Pass/Fail Thresholds

- **Primary Sandbox Target:** **Alpaca Paper Trading API** (`https://paper-api.alpaca.markets/v2` + `wss://paper-api.alpaca.markets/stream`) alongside MotiveView's **Local Paper Simulator**.
- **Optional Secondary Target (Abstraction Proof):** **tastytrade Certification Sandbox** (`https://api.cert.tastyworks.com`) solely to verify OAuth2 refresh-token lifecycle and `orders/dry-run` behind the same `BrokerAdapter` trait (no REST market data dependency in sandbox due to documented HTTP 502s `R04-S12`).
- **Pre-Declared Pass/Fail Thresholds for Spike S06:**

| Test ID | Verification Gate | Pass Threshold | Fail Condition |
|---|---|---|---|
| **S06-T1** | Fixed-point round-trip & zero-float enforcement | 100% of prices, quantities, and P&L serialized/parsed via integer ticks/decimals; `0` `f32`/`f64` fields in OMS core types (verified by unit tests + static grep/lint) | Any binary float used in price/qty/risk calculation |
| **S06-T2** | End-to-end Alpaca Paper order lifecycle | Submit Market, Limit, Stop, native `bracket` (OTO+OCO), and `trailing_stop` via `paper-api.alpaca.markets/v2`; receive matching `trade_updates` WS events; local OMS state matches REST snapshot 100% | Any missed transition, unlinked OCO leg, or REST/WS state mismatch |
| **S06-T3** | Partial-fill handling | Inject / observe partial fills (leveraging Alpaca Paper's 10% partial-fill behavior + Local Paper Simulator deterministic partial fills); `cum_qty + leaves_qty == order_qty` holds across 100% of events and bracket exit qty tracks `cum_qty` | Over-sized protective exit or quantity accounting drift |
| **S06-T4** | `client_order_id` idempotency & drop recovery | Simulate TCP drop / HTTP timeout mid-submit and mid-session WS disconnect across ≥ 20 fault-injection runs; **0 duplicate orders** created and 100% state reconciliation within `< 3 s` of reconnect | Any duplicate fill/order or unflagged orphan order |
| **S06-T5** | Kill-Switch & Flatten-All SLA | Trigger panic flatten with ≥ 3 open positions + ≥ 5 resting bracket/limit orders; OMS halts dispatch in `< 10 ms`; all working orders canceled & positions flattened to `net == 0` verified within `< 5 s` (paper/network permitting) | Any post-halt order dispatched, lingering working order, or silent failure |
| **S06-T6** | Sim-vs-Live hard isolation (negative tests) | Automated tests prove (a) sandbox credentials cannot construct a live-host HTTP request, (b) `LIVE_ARMED` defaults to `false` at boot and rejects live intents, (c) zero secrets written to disk/logs | Any cross-environment dispatch or secret leakage |
| **S06-T7** | Zero-cost & safety compliance | Total spend `$0.00`, zero live accounts touched, zero live orders placed, reproducible with user-supplied paper env vars | Any paid requirement or live endpoint call |

---

## Broker & Prop-Firm Tables

### Table 1: Broker & Execution Gateway Matrix

| Broker / Gateway | Asset Classes (Per A02) | Transport & Auth | Sandbox / Paper Availability | API & Data Fees | Key ToS / Licensing Constraints | FOSS SDKs & Verified Licenses | MotiveView Fit |
|---|---|---|---|---|---|---|---|
| **Local Paper Simulator (Built-in)** | All (Futures, Crypto, Equities, FX) | In-process Rust OMS | Native, offline, deterministic | **$0** | 100% FOSS clean-room | First-party MotiveView crate | **Core v0.1/v0.2 (Required)** |
| **Alpaca** (`R04-S05`–`S08`) | US Equities, Options, Crypto | REST v2 + WS (`trade_updates`); API Key/Secret | **Best-in-class:** Free email-only Paper-Only account ($100k, IEX RT data, 10% partial fills) | **$0 API**; $0 Basic IEX; $99/mo SIP | User assumes API execution risk; standard broker disclosures | `alpacahq/alpaca-py` (**Apache-2.0**); `alpaca-trade-api-js` (**Apache-2.0**) | **Primary S06 Sandbox & v0.2 Adapter** |
| **tastytrade** (`R04-S12`–`S14`) | US Equities, Options, **CME Futures**, Crypto | REST + WS Streamer; **OAuth2 mandatory** + `User-Agent` | Free cert sandbox (`api.cert.tastyworks.com`), `dry-run`; **Caveat:** REST `/market-data` returns HTTP 502; only equity fills verified | **$0 API**; $0 live data on funded acct; live comms ($1/$0.75 futures) | No storing raw user passwords; no market data redistribution | `tastytrade-api-js` (**MIT**); `tastyware/tastytrade` (**MIT**) | **Secondary S06 / v0.2–v0.3 Adapter** |
| **Interactive Brokers** (`R04-S01`–`S04`) | **CME Futures**, Equities, Options, FX, Crypto | TWS TCP Socket (local TWS/IBGW) or Web API (local gateway / OAuth) | Paper ($1M) requires **approved live account**; Free Trial is TWS-only with delayed data | **$0 API**; paid exchange data subs required for RT API data | Official `ibapi` is proprietary Non-Commercial/Commercial; Web API 3P OAuth needs Compliance & Legal agreement; no data redistribution | `ib-api-reloaded/ib_async` (**BSD-2-Clause**, independent socket impl) | **v0.3 Optional Futures/Multi-Asset Plug-in** (clean-room socket) |
| **Tradier** (`R04-S09`–`S11`) | US Equities, Options (Tradier Futures separate) | REST v1 + WS (live only); Bearer token / Partner OAuth | $100k sandbox, no deposit; **No WS streaming & 15-min delayed data in sandbox** | **$0 API**; Lite $0/mo ($0.35), Pro $10/mo, Pro+ $35/mo | Individual API is **personal use only**; distributing to others requires Tradier Partner approval | Community REST wrappers (thin HTTP) | **v0.3+ Optional Plug-in** (weak sandbox due to no WS) |
| **Tradovate** (`R04-S15`) | **CME & EUREX Futures** | REST v1 + WS JSON; Bearer / Partner OAuth | Demo endpoints exist, **but require $1,000+ funded live account + $25/mo API add-on** | **$25/mo API add-on** + **$1,000 live balance min**; API market data requires CME Sub-Vendor ILA | **Prop/eval accounts explicitly ineligible** for personal API keys; digital API agreement + attestation required | Official C# samples only (no core FOSS SDK) | **v0.3+ Optional Paid-User Plug-in** (execution-only; live retail only) |
| **ProjectX Gateway** (`R04-S16`–`S18`) | **CME Futures (TopstepX Sim only)** | REST `POST` JSON + SignalR WS; 24h JWT | **No sandbox** (uses Practice account on prod hosts; requires active Topstep account) | **$29/mo** ($14.50/mo w/ `topstep` code) | **Topstep-exclusive (since 2026)**; **banned on Live Funded Accounts**; **VPS/VPN/remote execution banned** | Community wrappers (thin REST + SignalR) | **Optional Plug-in Only (Post-MVP)**; never $0 core |
| **Sierra Chart DTC** (`R04-S22`–`S24`) | **Execution-Only Bridge** (user's SC broker) | Open TCP/WS spec (Binary, JSON, Protobuf) | Local SC Trade Simulation Mode (requires paid SC license) | Spec: **$0 (Public Domain)**; SC Software: paid subscription | **DTC Spec = Public Domain**; **SC DTC Server blocks CME/EUREX/NASDAQ/CBOE/UTP/CTA data** & `DATA LICENSE` bans using SC/Denali data outside SC | Clean-room open spec (`DTCProtocol.proto` / JSON) | **Optional Execution-Only Wire Adapter** (never data; never Bulenox) |
| **Rithmic (`R|API+` / `R|Protocol`)** (`R04-S19`, `S20`) | **CME/Global Futures** | C++/.NET SDK or WS + Protobuf | `Rithmic Test` (no live data); production & paper live-data require conformance | ~$100/mo API + ~$25/mo conn + ~$0.10/ct via FCM; direct conformance fee **`UNVERIFIED`** | Closed NDA/Software System License; **no redistribution of `.proto`/SDK/certs**; per-app `app_name` conformance (rejected by NautilusTrader #3768) | Unofficial wrappers carry contract/DMCA risk | **DO-NOT-EMBED IN FOSS CORE** (ISV-only) |
| **CQG (`WebAPI` / `FIX Connect`)** (`R04-S21`) | **Global Futures & Fixed Income** | Protobuf over TLS WS (`WebAPI`) / FIX 4.2 (`FIX Connect`) | **Demo credentials gated behind signed Enterprise Agreement + application fee** | Unlisted Enterprise pricing (**`UNVERIFIED`**); individual COM Client API >$1,000/mo bundled | Enterprise entities only; 7-stage conformance; 3-day change notice; mandatory "Powered by CQG" branding | Official Protobuf/FIX docs behind enterprise onboarding | **DO-NOT-BUILD** (Enterprise paywall blocks FOSS) |

---

### Table 2: Crypto Execution FOSS Libraries Matrix (Verified `2026-11-24`)

| Library | GitHub Repo | Verified License (`LICENSE` file) | Stars & Last Push (`2026-11-24`) | Stack | Execution Scope | MotiveView Compatibility |
|---|---|---|---|---|---|---|
| **barter-rs** (`R04-S33`) | `barter-rs/barter-rs` | **MIT** | 2,377 · `2026-08-24` (Active) | Pure Rust | Modular `barter-execution` + `barter-data` + `barter-instrument` traits | **Best native Rust fit** — permissive, zero-GC, static-link safe |
| **CCXT** (`R04-S32`) | `ccxt/ccxt` | **MIT** | 44,977 · `2026-11-24` (Active) | TS/JS, Python, Go, C#, Rust | 100+ CEX & DEX unified REST + WS (ex-CCXT Pro merged into MIT) | High coverage; watch/override default broker IDs; heavier if JS/Py sidecar |
| **Hummingbot** (`R04-S34`) | `hummingbot/hummingbot` | **Apache-2.0** | 21,388 · `2026-11-24` (Active) | Python/Cython + Gateway | 140+ CEX & DEX connectors | Permissive license, but Python runtime violates lightweight `< 40 MB` core budget; use as reference |
| **NautilusTrader** (`R04-S35`) | `nautechsystems/nautilus_trader` | **LGPL-3.0-only** | 31,788 · `2026-11-24` (Active) | Rust core + Python | CEX/DEX + TradFi adapters | **Copyleft caution:** static Rust linking triggers LGPL-3.0 relinking obligations + Trademark Policy; reference only |

---

### Table 3: Prop-Firm Legality Matrix (All 8 Named Firms — Audited `2026-11-24`)

| Prop Firm | Execution Gateway(s) | 3P / Custom API Clients Permitted? | Automation / Bots & Copy-Trading Rules | Written Permission Needed? | Primary Rulebook / Help Center URL | Explicit Verdict |
|---|---|---|---|---|---|---|
| **Topstep** | TopstepX / ProjectX Gateway (REST + SignalR); Quantower via ProjectX | **Yes (Sim Only)** on Practice/Combine/XFA via user's paid ProjectX API ($14.50–$29/mo) from **personal device only**. **Banned on Live Funded Accounts & VPS/VPN.** | Bots allowed on Combine/XFA (no HFT, no SIM-fill exploitation). Built-in copier allowed on Combine/XFA (not LFA). Cross-user copy & CME 534 hedging banned. | **No** (for user's paid ProjectX key on Sim); **Yes** for official zero-fee platform partnership | [TopstepX API Access](https://help.topstep.com/en/articles/11187768-topstepx-api-access) · [Prohibited Conduct](https://help.topstep.com/en/articles/10296582-prohibited-conduct) (`R04-S17`, `R04-S25`) | **`PERMITTED-SANDBOX-FIRST`** *(Sim-only local plugin; paid API)* |
| **Apex Trader Funding** | Rithmic, Tradovate, WealthCharts | **No** for API/automated execution (manual order entry required; Tradovate prop keys ineligible; Rithmic contract-gated). | **All automation, bots, AI, scripts, and algorithms strictly prohibited** across Eval, PA, and Live Prop. Personal copy trading allowed only across own accounts (max 20 PAs/household) from manual Originating Account; no Live Prop group trading. | **Yes** (software approval encouraged, and automation/API execution is banned regardless) | [Prohibited Activities](https://apextraderfunding.com/help-center/getting-started/prohibited-activities/) · [User Agreement](https://dashboard.apextraderfunding.com/legal/user-agreement) (`R04-S26`, `R04-S36`) | **`DO-NOT-BUILD`** |
| **Take Profit Trader** | CQG (Tradovate, TradingView, NinjaTrader), Rithmic (11 listed platforms) | **No** for custom/API clients; only listed CQG/Rithmic platforms supported. | **UTP #1 bans all trading bots, algos, and automated execution tools** across Test, PRO, and PRO+. Copy trading restricted strictly to an **allowlist** (Tradesyncer, TradeCopia, Affordable Indicators, Replikanto Compliance Ed., native platform copiers) on own accounts only. | **Yes** (unlisted copiers/clients unauthorized; bots/APIs categorically banned) | [Universal Trading Policies (UTP)](https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/34431153546397-TakeProfitTrader-Universal-Trading-Policies-UTP) · [Trade Copier Policy](https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/34431176505245-Trade-Copier-Policy) (`R04-S27`, `R04-S37`, `R04-S38`) | **`DO-NOT-BUILD`** |
| **My Funded Futures (MFFU)** | Tradovate, dxFeed / Volumetrica (Quantower, Volumetrica, DeepChart, ATAS), Hyperprop | **No open API** (Tradovate prop accounts ineligible for personal API keys); requires official platform/partner onboarding. | Personal tailored automated strategies **permitted** (Fair Play §1; no HFT, no SIM-fill abuse; CME rules on live). Own-account copy trading allowed (Tradesyncer, Tradovate Group, external copiers at own risk); cross-user copy & device sharing banned. | **Yes** (MFFU + gateway partner approval; live API addendum **`UNVERIFIED`**) | [Fair Play & Prohibited Practices](https://help.myfundedfutures.com/en/articles/8444599-fair-play-and-prohibited-trading-practices) · [Copy Trading](https://help.myfundedfutures.com/en/articles/10771500-copy-trading-at-myfundedfutures) (`R04-S28`, `R04-S39`) | **`CONDITIONAL-WRITTEN-APPROVAL`** |
| **Tradeify** | Tradovate, Rithmic (Tradesea, Quantower, Sierra Chart, R\|Trader Pro), WealthCharts *(ProjectX dropped)* | **No on Eval/Sim** (Tradovate API unavailable on Eval/Sim; Tradovate personal keys need $1k+ live brokerage acct; Rithmic contract-gated). | Personal bots allowed **only** if sole-owned (live video proof on own PC may be demanded), **used exclusively at Tradeify** (multi-firm use banned), and non-HFT; 10s microscalping payout rule on funded. Own-account same-direction copy trading allowed. | **Yes** (for any 3P platform integration; sole-owner + Tradeify-exclusive rules bar shared FOSS bots) | [Guidelines for Traders](https://help.tradeify.co/en/articles/10468318-guidelines-for-traders) · [Supported Products / Rules](https://help.tradeify.co/en/articles/10468222-rules-supported-trading-products-assets) (`R04-S29`, `R04-S40`) | **`CONDITIONAL-WRITTEN-APPROVAL`** |
| **Bulenox** | Rithmic (primary), Tradovate *(ProjectX dropped)* | **Restricted & fee-gated:** Terms explicitly cite **"DTC Protocol Bridge API"** abuse, ban commercial/shared tools, and charge **$100/mo** for 3P Rithmic API/Composite software. | Commercial/shared/rented bots & copiers prohibited; only user-built personal tools subject to prior management approval; no HFT; no VPS/VPN. | **Yes (mandatory prior management review & approval + $100/mo fee)** | [Terms of Use PDF (p. 6)](https://bulenox.com/legal/Terms_of_Use.pdf) · [Qualification Help Center](https://bulenox.com/help-center/qualification) (`R04-S30`, `R04-S41`) | **`DO-NOT-BUILD`** |
| **Lucid Trading** | CQG (NinjaTrader, Tradovate, TradingView), Rithmic (Quantower, Sierra Chart, MotiveWave, etc.) | **No proprietary API**; all execution gated behind closed CQG/Rithmic or Tradovate prop logins (ineligible for personal API keys). | Public Help Center permits automated systems and trade copiers (no HFT, no ≤5s microscalping >50% profit, no cross-account/cross-firm hedging). Behind-login Plan Agreement custom-software clauses **`UNVERIFIED`**. | **Yes** (for official platform/gateway integration; current Plan Agreement clauses **`UNVERIFIED`**) | [Other Trading Activities](https://support.lucidtrading.com/en/articles/11404728-other-trading-activities) · [Supported Platforms](https://support.lucidtrading.com/en/articles/11404614-lucid-trading-supported-platforms) (`R04-S31`, `R04-S42`) | **`CONDITIONAL-WRITTEN-APPROVAL`** *(Plan Agmt `UNVERIFIED`)* |
| **Elite Trader Funding (ETF)** | Tradovate, Rithmic ($45/mo feed fee on new accts), Tickblaze *(LIVE ELITE = Rithmic-only)* | **No** without express written authorization (`ToS §(ac)`). | **AI, bots, EAs, algos, and unlisted trade copiers strictly prohibited without express written authorization.** Only allowlisted copiers permitted (Tradesyncer, Tradecopia, Affordable Indicators, Replikanto Compliance Ed., native platform copiers). No VPN/VPS/same-household accounts. | **Yes (mandatory express written authorization under ToS §(ac))** | [Terms of Service §(ac)](https://help.elitetraderfunding.com/help/terms-of-service) · [Trade Copier / EA Disclaimer](https://elitetraderfunding.app/help/trade-copier-disclaimer) (`R04-S43`, `R04-S44`) | **`DO-NOT-BUILD`** |

---

## Options Table

Weighted evaluation of **Phase 2 Spike S06 & v0.2 Execution Foundation** architectures (criteria aligned to `01-Charter/Constraints.md` and `Assumptions.md` A02–A05):

| Criterion (Weight) | Option A: Local Paper Sim + Alpaca Paper (Primary S06) + `barter-rs` Crypto (v0.2) + Optional Futures Plug-ins (v0.3) | Option B: tastytrade Cert Sandbox as Primary S06 + Futures-First | Option C: TopstepX / ProjectX API First (Prop-Firm First) | Option D: Sierra Chart DTC Bridge as Universal Adapter | Option E: Rithmic / CQG / Tradovate Direct Futures API First |
|---|---|---|---|---|---|
| **$0 Core & Free Sandbox Access (25%)** | **5/5** — Free email-only Alpaca Paper + $0 offline local sim + free crypto testnets | **3/5** — $0 API, but sandbox REST `/market-data` returns HTTP 502 & futures fills unverified | **1/5** — Requires paid Topstep account + $14.50–$29/mo ProjectX add-on; no sandbox | **1/5** — Requires paid Sierra Chart subscription + separate paid market data feed | **0/5** — Tradovate needs $1k live + $25/mo; CQG/Rithmic need enterprise fees/agreements |
| **FOSS License & Legal Cleanliness (25%)** | **5/5** — Apache-2.0 / MIT SDKs, clean-room OMS, zero NDA/proprietary blobs | **5/5** — MIT SDKs, open OpenAPI 3.1 + OAuth2 docs | **3/5** — Legal on Sim/local device, but banned on Live Funded Accounts & VPS; Topstep-only | **2/5** — DTC wire spec is public domain, but SC `DATA LICENSE` bans SC data export & Bulenox bans DTC bridge abuse | **0/5** — Rithmic `.proto` NDA & conformance; CQG enterprise contract; Tradovate prop ban |
| **Order-Semantics & Partial-Fill Testability (20%)** | **5/5** — Native brackets/OCO/OTO/trailing stops, `client_order_id`, WS `trade_updates`, 10% simulated partial fills | **3/5** — OTO/OCO/OTOCO & `dry-run`, but limited sandbox fill verification | **3/5** — Full futures order/position/SignalR endpoints on Practice account | **2/5** — Standard DTC omits managed trailing stops; depends on third-party SC install | **4/5** — Rich futures semantics once certified/paid |
| **CME Futures + Crypto Priority Alignment (A02) (15%)** | **4/5** — Local sim + crypto testnets immediately; tastytrade/IBKR/Tradovate/ProjectX futures plug-ins cleanly isolated behind `BrokerAdapter` trait | **4/5** — Supports CME futures in prod, weak crypto/sandbox market data | **3/5** — CME futures only, zero crypto/equities, Sim-only | **3/5** — Futures-oriented execution only; zero crypto | **4/5** — Strong CME futures in prod, zero crypto |
| **Lightweight & Cross-Platform (15%)** | **5/5** — Pure Rust REST/WS + `barter-rs` MIT; macOS/Linux/Windows native | **5/5** — Pure REST/WS OAuth2; cross-platform | **4/5** — REST + SignalR WS; cross-platform | **1/5** — Sierra Chart is Windows-native (Wine/VM required on macOS/Linux) | **2/5** — Rithmic/CQG desktop tools & COM APIs are Windows-heavy |
| **Weighted Total (out of 5.00)** | **4.85 / 5.00** | **3.95 / 5.00** | **2.60 / 5.00** | **1.75 / 5.00** | **1.60 / 5.00** |

---

## Recommendation + Rationale

1. **Adopt Option A — Pluggable `BrokerAdapter` Trait Architecture anchored by a $0 Local Paper Simulator + Alpaca Paper Trading API for Phase 2 Spike S06:**
   - **Alpaca Paper** is the only verified retail broker combining **$0 email-only sandbox provisioning**, **identical live/paper REST + WebSocket schemas**, **native Bracket/OCO/OTO/Trailing Stop semantics**, **`client_order_id` idempotency**, **Apache-2.0 official SDKs**, and **built-in 10% simulated partial fills** (`R04-S05`–`S08`).
   - Pairing Alpaca Paper with an optional **tastytrade Certification Sandbox** secondary check (`OAuth2` + `dry-run` `R04-S12`, `R04-S13`) ensures MotiveView's `BrokerAdapter` trait is genuinely broker-agnostic before v0.2 begins.
2. **Adopt `barter-rs` (MIT) or clean-room Rust REST/WS adapters for v0.2 Crypto Execution:**
   - Directly serves Assumption A02 Priority #2 (Crypto) with zero GC stalls, native Rust static linking, and MIT permissiveness (`R04-S33`), while avoiding `NautilusTrader`'s LGPL-3.0 static-linking copyleft (`R04-S35`) and `Hummingbot`'s Python runtime weight (`R04-S34`).
3. **Treat Retail Futures Brokers (IBKR socket, tastytrade live, Tradovate retail-only) & TopstepX/ProjectX strictly as Optional User-Configured Plug-ins (v0.3+):**
   - Clean-room TWS TCP socket adapter (referencing `ib_async` BSD-2-Clause protocol design, zero IBKR `ibapi` code) covers multi-asset + CME futures for users who already hold IBKR accounts (`R04-S03`).
   - Tradovate plug-in must display an explicit UI notice: *Requires a live funded Tradovate brokerage account (≥ \$1,000) + \$25/mo API Add-on; prop-firm accounts are ineligible* (`R04-S15`).
   - TopstepX/ProjectX plug-in (if built post-MVP) must enforce **local-device execution only**, disable itself for Live Funded Accounts, and ship with built-in anti-hedging and order-rate safety guards (`R04-S17`).
4. **Hard-Enforce `DO-NOT-BUILD` Boundaries:**
   - **Never ship connectors targeting Apex Trader Funding, Take Profit Trader, Bulenox, or Elite Trader Funding** unless their published rulebooks change or written authorization is obtained (`R04-S26`, `R04-S27`, `R04-S30`, `R04-S43`).
   - **Never bundle Rithmic `.proto`/SDK/cert assets or implement CQG Enterprise APIs** inside the FOSS core (`R04-S20`, `R04-S21`).
   - **Never extract Sierra Chart / Denali market data over DTC** (`R04-S23`, `R04-S24`). Keep public-domain DTC strictly as an optional **execution-only** open wire adapter for users with independent licensed market data (and explicitly warn against Bulenox DTC bridge restrictions).

---

## Inferences

- **Prop-Firm Ecosystem Structural Shift (2026):** ProjectX's 2026 retreat to Topstep exclusivity (`R04-S17`, `R04-S29`), Tradovate's hard exclusion of prop accounts from personal API keys (`R04-S15`), and widespread prop bans on bots/unapproved clients (4 of 8 audited firms are hard `DO-NOT-BUILD`) mean **independent FOSS terminals cannot treat futures prop firms as a reliable execution wedge**. MotiveView's futures value proposition should center on **charting + order-flow analysis (v0.1)**, **local deterministic paper trading ($0 core)**, and **compliant retail futures brokerage plug-ins (IBKR, tastytrade, retail Tradovate)**, while keeping any prop integration strictly opt-in, rulebook-gated, and explicitly labeled.
- **Local-First Architecture Is a Legal Advantage:** Topstep (`R04-S17`), Bulenox (`R04-S30`), and Elite Trader Funding (`R04-S43`) all prohibit trading from VPS/VPN/cloud servers. MotiveView's local-first desktop architecture naturally complies with personal-device execution mandates (unlike cloud webhook relay SaaS tools).
- **Fixed-Point OMS Eliminates Whole Classes of Order Rejects:** CME futures contracts with fractional/quarter-tick increments (`ES` 0.25, `ZB` 1/32, `GC` 0.10) routinely trigger broker price-increment rejections when formatted from `f64` arithmetic; integer `PriceTicks(i64)` guarantees tick-aligned wire formatting by construction.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Prop-firm rulebook volatility:** Prop firms frequently revise automation/copier/platform rules (e.g., ProjectX exclusivity shift in Feb 2026; ETF ToS updated Nov 2026). | **High** | Re-audit rulebook URLs before any prop plug-in release; never market MotiveView as "prop-firm approved"; default all `DO-NOT-BUILD` and `CONDITIONAL` firms to disabled. |
| **Accidental cross-account hedging (CME Rule 534):** Multi-account or correlated-contract orders (`ES` + `MES`, `NQ` + `MNQ`) cause instant non-appealable prop account termination (`R04-S25`, `R04-S28`, `R04-S29`). | **High** | Build a mandatory, configurable **Anti-Hedging & Correlated Product-Group Guard** inside the local OMS risk layer. |
| **Duplicate orders on network drops / partial-fill reverse positions:** Blind retries or unsynchronized OCO sizing can double-fill or flip positions. | **Critical** | Enforce WAL-persisted UUIDv7 `client_order_id`, query-before-retry reconciliation, and `cum_qty`-coupled bracket sizing — gated by Spike S06 tests `S06-T3` and `S06-T4`. |
| **Client-managed stop loss lost on crash/disconnect:** Using synthetic brackets/trailing stops on brokers lacking native support leaves open positions unprotected if MotiveView exits. | **Critical** | Default to broker-native server-held brackets; force explicit opt-in + permanent UI warning for any client-managed protective leg. |
| **Upstream FOSS license/DMCA taint:** Merging community Rithmic `.proto` bindings or IBKR `ibapi` code or statically linking LGPL-3.0 `nautilus_trader` crates would violate `Constraints.md` §1.1. | **High** | Enforce CI license-check gate (`cargo-deny`) allowing only MIT/Apache-2.0/BSD/ISC/MPL-2.0 in core; reject any PR containing proprietary SDK/protobuf artifacts. |

---

## Open Questions

### Items Marked `UNVERIFIED` (With Exact Human Verification Steps)

1. **`UNVERIFIED` — Lucid Trading behind-login Plan Agreement custom-software clauses:**
   - *Gap:* Public Help Center (`R04-S31`) permits automated trading systems and trade copiers, but historical LucidDirect agreements contained prior-written-approval language for custom automated software; current signed plan agreements (LucidFlex, LucidPro, LucidDirect, LucidDaily) are behind checkout/dashboard login.
   - *Exact Human Check Steps:* Log into Lucid Trading dashboard (or request current PDFs from `support@lucidtrading.com` via `https://support.lucidtrading.com/en/`), inspect the "Automated Trading / Third-Party Software" clause in each active plan agreement, and record exact section numbers/dates before changing Lucid's `CONDITIONAL-WRITTEN-APPROVAL` verdict.
2. **`UNVERIFIED` — My Funded Futures (MFFU) behind-login Live Funded Account API & Partner Agreement:**
   - *Gap:* Public *Fair Play* (`R04-S28`) covers automated trading protocols broadly, but exact live-account execution/partner API onboarding terms are not published publicly.
   - *Exact Human Check Steps:* Contact MFFU support via `https://help.myfundedfutures.com/` requesting their official third-party platform/ISV integration policy and current Live Funded Trader Agreement automation clause.
3. **`UNVERIFIED` — Rithmic direct conformance fee & timeline:**
   - *Gap:* `https://www.rithmic.com/apis` states conformance is required and refers developers to Rithmic + their FCM for commercial terms (`R04-S19`), without publishing fixed fees.
   - *Exact Human Check Steps:* Only if MotiveView ever forms a commercial entity/foundation pursuing official Rithmic ISV certification, email Rithmic API sales (contact via `https://www.rithmic.com/apis`) requesting the Software System License Agreement and current conformance fee schedule.
4. **`UNVERIFIED` — CQG Enterprise WebAPI / FIX Connect exact pricing & application fee:**
   - *Gap:* Official CQG Monthly Price Sheet lists both as "Contact us for pricing" and gates demo credentials behind an executed agreement + application fee (`R04-S21`).
   - *Exact Human Check Steps:* Only if institutional sponsorship funds CQG ISV onboarding, request the current Enterprise API fee schedule via `https://www.cqg.com/products/cqg-apis/cqg-enterprise-api-questionnaire`.
5. **`UNVERIFIED` — Apex Trader Funding full text of User Agreement copy-trading subclauses past char 31,402:**
   - *Gap:* Browser extraction of `https://dashboard.apextraderfunding.com/legal/user-agreement` captured the full prohibition on automation/bots/scripts verbatim (`R04-S36`), while the trailing copy-trading paragraph truncated mid-sentence in the automated read buffer.
   - *Exact Human Check Steps:* Open `https://dashboard.apextraderfunding.com/legal/user-agreement` in a desktop browser and read the full "Automated Copy Trading" subclause (this does not affect Apex's `DO-NOT-BUILD` verdict, which is already established verbatim by both `Prohibited Activities` and the verified automation ban in the User Agreement).

### Product / Charter Open Questions for Abel
- **Q-R04-1:** Does Abel already hold an Alpaca Paper-Only account (or wish to create one at Phase 2 S06 start, $0 email-only) to run live-network S06 sandbox verification, or should S06 run first against a deterministic local mock + Local Paper Simulator and gate live Alpaca Paper tests on an env-var opt-in?
- **Q-R04-2:** Given that TopstepX/ProjectX is the *only* audited prop firm with an open retail API (Sim-only, $14.50–$29/mo, personal-device only), should TopstepX remain strictly a **post-v1.0 community plug-in**, keeping v0.2–v1.0 focused on Local Paper Sim + Alpaca + Crypto (`barter-rs`) + Retail Futures (IBKR/tastytrade)?

---

## What Would Change This Decision

- **A Futures Broker Launches a $0 Free Sandbox REST/WS API:** If Tradovate removes its $1,000 live-balance + $25/mo API paywall for demo keys, or tastytrade resolves its certification sandbox `/market-data` HTTP 502s and formally verifies CME futures sandbox fills, **tastytrade or Tradovate** would become a co-primary futures target for S06/v0.2.
- **Prop Firms Open Compliant Retail Execution APIs:** If MFFU, Tradeify, or Lucid launch an official, publicly documented retail API (or grant MotiveView written ISV/partner approval without NDA-conflicting proprietary SDK blobs), their status can move from `CONDITIONAL-WRITTEN-APPROVAL` to `PERMITTED-SANDBOX-FIRST` as optional plug-ins.
- **Topstep Enables ProjectX API on Live Funded Accounts or Drops API Subscription Fee:** Would elevate TopstepX from a niche post-MVP Sim-only plug-in to a stronger optional futures plug-in (still gated behind Topstep's personal-device / anti-hedging rules).
- **Sierra Chart Relaxes DTC Market-Data Restrictions:** Extremely unlikely due to CME/EUREX/NASDAQ/CBOE exchange contracts; until `DTCServer.php` and `LicenseAgreement.php` change, DTC remains **execution-only** for Sierra Chart users.

---

## Sources

| Source ID | Track | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|---|
| `R04-S01` | R04 | IBKR TWS API Official Documentation & Paper/Trial Specifications | https://www.interactivebrokers.com/campus/ibkr-api-page/twsapi-doc/ | 2026-11-24 | Read primary docs | High |
| `R04-S02` | R04 | IBKR Client Portal / Web API Documentation | https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/ | 2026-11-24 | Read primary docs | High |
| `R04-S03` | R04 | `ib-api-reloaded/ib_async` Repository `LICENSE` (BSD-2-Clause) | https://raw.githubusercontent.com/ib-api-reloaded/ib_async/main/LICENSE | 2026-11-24 | Read repo `LICENSE` file | High |
| `R04-S04` | R04 | Live GitHub API Repo Metadata (stars, `pushed_at`, SPDX license, `archived`) | https://api.github.com/repos/ccxt/ccxt | 2026-11-24 | Live API call (queried all 9 repos) | High |
| `R04-S05` | R04 | Alpaca Paper Trading Official Documentation | https://docs.alpaca.markets/docs/paper-trading | 2026-11-24 | Read primary docs | High |
| `R04-S06` | R04 | Alpaca WebSocket Streaming Documentation | https://docs.alpaca.markets/docs/websocket-streaming | 2026-11-24 | Read primary docs | High |
| `R04-S07` | R04 | Alpaca Placing Orders, Bracket/OCO & Trailing Stops Documentation | https://docs.alpaca.markets/docs/orders-at-alpaca | 2026-11-24 | Read primary docs | High |
| `R04-S08` | R04 | `alpacahq/alpaca-py` Repository `LICENSE` (Apache-2.0) | https://raw.githubusercontent.com/alpacahq/alpaca-py/master/LICENSE | 2026-11-24 | Read repo `LICENSE` file | High |
| `R04-S09` | R04 | Tradier Developer Portal (Sandbox vs. Live, Auth & Limits) | https://docs.tradier.com/ | 2026-11-24 | Read primary docs | High |
| `R04-S10` | R04 | Tradier Pricing & Plans (Lite / Pro / Pro Plus) | https://tradier.com/pricing | 2026-11-24 | Read primary docs | High |
| `R04-S11` | R04 | Tradier Legal Policies & API Disclosures | https://tradier.com/legal | 2026-11-24 | Verified canonical URL & primary summary | Medium |
| `R04-S12` | R04 | tastytrade Developer Docs — Certification Sandbox | https://developer.tastytrade.com/docs/sandbox | 2026-11-24 | Read primary docs | High |
| `R04-S13` | R04 | tastytrade Developer Docs — OAuth2 Authentication | https://developer.tastytrade.com/docs/authentication/oauth2 | 2026-11-24 | Read primary docs | High |
| `R04-S14` | R04 | `tastyware/tastytrade` Repository `LICENSE` (MIT) | https://raw.githubusercontent.com/tastyware/tastytrade/master/LICENSE | 2026-11-24 | Read repo `LICENSE` file | High |
| `R04-S15` | R04 | Tradovate Help Center — Tradovate API Access (Updated 2026-09-16) | https://support.tradovate.com/s/article/Tradovate-API-Access | 2026-11-24 | Read primary docs via browser | High |
| `R04-S16` | R04 | ProjectX Gateway API Official Documentation | https://gateway.docs.projectx.com/docs/intro | 2026-11-24 | Read primary docs | High |
| `R04-S17` | R04 | Topstep Help Center — TopstepX™ API Access (Pricing, VPS Ban, LFA Exclusion) | https://help.topstep.com/en/articles/11187768-topstepx-api-access | 2026-11-24 | Read rulebook text | High |
| `R04-S18` | R04 | ProjectX Trading LLC — Terms of Use (Updated 2026-04-13) | https://www.projectx.com/terms | 2026-11-24 | Read primary docs | High |
| `R04-S19` | R04 | Rithmic Official APIs Portal (`R\|API+`, `R\|Protocol API`) | https://www.rithmic.com/apis | 2026-11-24 | Verified canonical URL & primary summary | High |
| `R04-S20` | R04 | NautilusTrader GitHub Issue #3768 — Rithmic R-Protocol Adapter RFC (Conformance & `.proto` Licensing) | https://github.com/nautechsystems/nautilus_trader/issues/3768 | 2026-11-24 | Read primary issue text | High |
| `R04-S21` | R04 | CQG Enterprise API Questionnaire (Enterprise Gating, Agreement & Demo Fee Prerequisite) | https://www.cqg.com/products/cqg-apis/cqg-enterprise-api-questionnaire | 2026-11-24 | Read primary docs via browser | High |
| `R04-S22` | R04 | Sierra Chart — DTC Protocol Open Specification (Public Domain Declaration) | https://www.sierrachart.com/index.php?page=doc/DTCProtocol.php | 2026-11-24 | Read primary docs | High |
| `R04-S23` | R04 | Sierra Chart — DTC Protocol Server Documentation (`#Restrictions`, Updated 2026-09-02) | https://www.sierrachart.com/index.php?page=doc/DTCServer.php | 2026-11-24 | Read primary docs | High |
| `R04-S24` | R04 | Sierra Chart — License Agreement (`DATA LICENSE` — 100% Within Sierra Chart) | https://www.sierrachart.com/index.php?page=doc/LicenseAgreement.php | 2026-11-24 | Read rulebook text | High |
| `R04-S25` | R04 | Topstep Help Center — Prohibited Conduct | https://help.topstep.com/en/articles/10296582-prohibited-conduct | 2026-11-24 | Read rulebook text | High |
| `R04-S26` | R04 | Apex Trader Funding — Prohibited Activities (No Automation / Algorithm Ban) | https://apextraderfunding.com/help-center/getting-started/prohibited-activities/ | 2026-11-24 | Read rulebook text via browser | High |
| `R04-S27` | R04 | Take Profit Trader — Universal Trading Policies (UTP #1: No Bots or Algos) | https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/34431153546397-TakeProfitTrader-Universal-Trading-Policies-UTP | 2026-11-24 | Read rulebook text via browser | High |
| `R04-S28` | R04 | My Funded Futures — Fair Play and Prohibited Trading Practices (§1 Automated Trading) | https://help.myfundedfutures.com/en/articles/8444599-fair-play-and-prohibited-trading-practices | 2026-11-24 | Read rulebook text | High |
| `R04-S29` | R04 | Tradeify Help Center — Guidelines for Traders (Updated 2026-10-16; Bots/Algo Ownership & Exclusivity) | https://help.tradeify.co/en/articles/10468318-guidelines-for-traders | 2026-11-24 | Read rulebook text via browser | High |
| `R04-S30` | R04 | Bulenox — Official Terms of Use PDF (Page 6: `ALGORITHMS AND AUTO TRADING`, DTC Bridge, $100/mo API Fee) | https://bulenox.com/legal/Terms_of_Use.pdf | 2026-11-24 | Downloaded & extracted official PDF text | High |
| `R04-S31` | R04 | Lucid Trading Help Center — Other Trading Activities (Automated Strategies & Copiers) | https://support.lucidtrading.com/en/articles/11404728-other-trading-activities | 2026-11-24 | Read rulebook text | High |
| `R04-S32` | R04 | `ccxt/ccxt` Repository `LICENSE.txt` (MIT) | https://raw.githubusercontent.com/ccxt/ccxt/master/LICENSE.txt | 2026-11-24 | Read repo `LICENSE` file | High |
| `R04-S33` | R04 | `barter-rs/barter-rs` Repository `LICENSE` (MIT) | https://raw.githubusercontent.com/barter-rs/barter-rs/main/LICENSE | 2026-11-24 | Read repo `LICENSE` file | High |
| `R04-S34` | R04 | `hummingbot/hummingbot` Repository `LICENSE` (Apache-2.0) | https://raw.githubusercontent.com/hummingbot/hummingbot/master/LICENSE | 2026-11-24 | Read repo `LICENSE` file | High |
| `R04-S35` | R04 | `nautechsystems/nautilus_trader` Repository `LICENSE` (LGPL-3.0-only) | https://raw.githubusercontent.com/nautechsystems/nautilus_trader/develop/LICENSE | 2026-11-24 | Read repo `LICENSE` file | High |
| `R04-S36` | R04 | Apex Trader Funding — User Agreement (Prohibited & Permitted Automation) | https://dashboard.apextraderfunding.com/legal/user-agreement | 2026-11-24 | Read rulebook text via browser (partial tail truncation noted in Open Questions) | High |
| `R04-S37` | R04 | Take Profit Trader — PRO Account Rules | https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15171769361053-PRO-Account-Rules | 2026-11-24 | Verified canonical URL & primary summary | Medium |
| `R04-S38` | R04 | Take Profit Trader — Trade Copier Policy (Allowlist) | https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/34431176505245-Trade-Copier-Policy | 2026-11-24 | Verified canonical URL & primary summary | Medium |
| `R04-S39` | R04 | My Funded Futures — Copy Trading at MyFundedFutures | https://help.myfundedfutures.com/en/articles/10771500-copy-trading-at-myfundedfutures | 2026-11-24 | Verified canonical URL & primary summary | High |
| `R04-S40` | R04 | Tradeify — Supported Trading Products / Assets & Rules | https://help.tradeify.co/en/articles/10468222-rules-supported-trading-products-assets | 2026-11-24 | Read primary docs via browser | High |
| `R04-S41` | R04 | Bulenox Help Center — Qualification Account ($100/mo 3P API / Trader Composite Software) | https://bulenox.com/help-center/qualification | 2026-11-24 | Read rulebook text | High |
| `R04-S42` | R04 | Lucid Trading Help Center — Supported Platforms (CQG & Rithmic) | https://support.lucidtrading.com/en/articles/11404614-lucid-trading-supported-platforms | 2026-11-24 | Read rulebook text | High |
| `R04-S43` | R04 | Elite Trader Funding — Terms of Service (§(ac) AI/Bots/Algos/Copiers Require Written Authorization) | https://help.elitetraderfunding.com/help/terms-of-service | 2026-11-24 | Read rulebook text | High |
| `R04-S44` | R04 | Elite Trader Funding — Trade Copier, EA & Algo Trading Disclaimer | https://elitetraderfunding.app/help/trade-copier-disclaimer | 2026-11-24 | Read rulebook text | High |
