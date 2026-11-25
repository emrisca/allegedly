---
title: R03 — Market Data Providers, Free-Tier Truth & Provenance Architecture
track: R03
status: verified
owner: research-data
updated: 2026-11-24
code_refs: []
---

# R03 — Market Data Providers, Free-Tier Truth & Provenance Architecture

## 1. Question

How can Allegedly deliver a genuinely useful, legally clean, local-first charting and order-flow terminal on a **`$0` core budget** ([[Constraints]] Non-Negotiables #1, #2, #7, #8) under our logged instrument priority (**A02**: 1) CME Futures + 2) Crypto → 3) US Equities → 4) Spot FX; **A04**: strictly `$0` core) — **without** violating exchange licensing rules, provider Terms of Service, or misleading traders with fabricated order-flow metrics?

Specifically:
1. What market data capabilities (real-time vs. delayed, trade ticks, exchange-reported aggressor side, L1/L2/L3 book levels, historical depth) are genuinely available for `$0` today (`2026-11-24`), and what **cannot** be free?
2. Which providers should power Allegedly's v0.1/v0.2 defaults vs. BYO-key / broker-bundled plug-ins?
3. How should Allegedly handle feeds that lack native exchange-reported aggressor side (Tick Rule, Quote Rule, Lee-Ready, EMO, CLNV, BVC) and enforce **Honest Data Provenance** in the UI and storage schema?
4. What measurable pass/fail thresholds govern Phase 2 **Spike S05** (live ingest & order-book normalization)?

---

## 2. Findings (Verified Facts)

Full provider-by-provider capabilities, live US-IP probe outputs, rate limits, pricing, ToS risks, and FOSS client licenses are documented in [[Provider-Capability-Matrix]]. Key verified **Facts** (retrieved and/or empirically probed `2026-11-24`):

### 2.1 Crypto Public WebSockets (Only `$0` Real-Time Source of Full Order-Flow)
- **Kraken Spot WS v2** (`wss://ws.kraken.com/v2`) and **Coinbase Advanced Trade / Exchange WS** (`wss://advanced-trade-ws.coinbase.com/`, `wss://ws-feed.exchange.coinbase.com/`) are **fully reachable from US IPs** (live HTTP 101 verified `2026-11-24`), require **zero API keys** for public market data, and deliver real-time trade ticks, native aggressor side, and L2 book levels (`R03-S08`, `R03-S10`).
  - **Kraken WS v2** delivers direct taker `side` (`"buy"`/`"sell"`), L2 `book` up to 1,000 levels with **CRC32 checksum verification**, and authenticated L3 MBO on `wss://ws-l3.kraken.com/v2` (`R03-S10`). US availability excludes select states (NY, ME).
  - **Coinbase** delivers L2 (`level2` → `l2_data`) on Advanced Trade WS and **unauthenticated L3 MBO** (`full` channel) on Exchange WS (`wss://ws-feed.exchange.coinbase.com`), **but its `side` field is INVERTED** — it reports the **maker's** resting order side (`"SELL"` = Buy aggressor; `"BUY"` = Sell aggressor) (`R03-S08`).
- **US Geo-Restrictions Break Offshore Crypto Defaults:**
  - **Binance Global** (`api.binance.com`, `stream.binance.com:9443`, `fapi.binance.com`) returned **HTTP 451** from our US IP (`2026-11-24`) (`R03-S02`). Binance's market-data-only Spot endpoints (`data-api.binance.vision`, `data-stream.binance.vision`) returned **HTTP 200 / WS 101** from US IP, but Binance Terms §b still restrict US persons (`R03-S01`, `R03-S02`). Furthermore, Binance's `m` (`isBuyerMaker`) boolean is **inverted** (`m: true` = Sell aggressor) (`R03-S01`). **Binance.US** (`stream.binance.us:9443`) is US-accessible (HTTP 200 / WS 101 verified) but Spot-only with thinner liquidity (`R03-S02`).
  - **Bybit V5** REST (`api.bybit.com`) returned **HTTP 403** (CloudFront country block) from our US IP; although `stream.bybit.com` upgraded HTTP 101, Bybit Terms §11.3 designate the US an Excluded Jurisdiction (`R03-S04`).
  - **OKX V5** (`www.okx.com`, `ws.okx.com`) returned HTTP 200 / WS 101 from our US IP, but US users must use the regulated US entity (`us.okx.com`, Spot-only) (`R03-S06`). Notably, OKX retired port `8443` in Oct/Nov 2026 and deprecated JSON order-book checksums in June 2026 (`seqId`/`prevSeqId` continuity only) (`R03-S06`).
  - **Hyperliquid** (`api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws`) returned HTTP 200 / WS 101 from our US IP with direct taker `side` (`"B"`/`"A"`), **but** its web UI geo-blocks US IPs and its Terms of Use prohibit US persons (`R03-S12`). In June 2026, Hyperliquid also throttled `l2Book` snapshots (5 levels/0.5s fast or 20 levels/2–5s) while introducing incremental `l2` diffs (`R03-S12`).

### 2.2 US Equities & Multi-Asset Retail APIs
- **Alpaca Basic ($0/mo)** provides real-time US equities trades/quotes via **`feed=iex` ONLY** (Investors Exchange ≈ **~2.5% of total US equity volume**), capped at **30 WebSocket symbols** and **200 REST req/min** (`R03-S14`). Full consolidated US tape (**SIP**, 100% volume) is queryable historically on Basic **only for timestamps > 15 minutes old**; live SIP + unlimited WS requires **Algo Trader Plus ($99/mo)** (`R03-S14`). Even on paid SIP, Alpaca US Equities provides **L1 NBBO only — no L2 book depth and no exchange-reported aggressor side** (`R03-S14`).
- **Massive** *(formerly Polygon.io — officially rebranded Oct 30, 2025; `api.polygon.io` remains aliased to `api.massive.com`; `polygon-io/client-python` redirects to `massive-com/client-python`, MIT)* sells Stocks, Options, Futures (CME/CBOT/NYMEX/COMEX GA May 2026), FX, and Indices as **separate subscriptions** (`R03-S16`, `R03-S17`). Each **Basic ($0/mo)** tier is strictly **5 calls/min REST only, 2 yrs history, EOD (Stocks/Options) or 8-hr delayed (Futures), no trades/quotes, no WebSockets** (`R03-S16`). Tick trades start at **Developer ($79/mo)** (15m/10m delayed); real-time + NBBO starts at **Advanced ($199/mo per asset class)** — still **no L2/L3 order-book depth** and **no native aggressor side on US Stocks** (`R03-S16`).
- **Twelve Data Basic ($0):** 8 credits/min, 800 credits/day, 8 trial WS credits; OHLCV/L1 only, no tick tape or L2 (`R03-S18`).
- **Tiingo Starter ($0):** 50 req/hr, 1,000 req/day, 500 unique symbols/mo, 1 GB/mo; 30+ yrs EOD + IEX intraday, no L2 or consolidated tick tape (`R03-S19`).
- **FMP Basic ($0):** 250 calls/day, 500 MB / 30 days, 5 yrs EOD for selected symbols; no ticks or L2 (`R03-S20`).
- **EODHD Free ($0):** 20 weighted calls/day (+500 welcome), 1 yr EOD, 15m delayed quotes; tick history is a paid Marketplace add-on (`R03-S21`).
- **Finnhub Free ($0):** 60 calls/min (30/sec hard cap), free WS trades, **but 89 of 118 endpoints—including historical OHLC candles—are paywalled** as of late 2026 (`R03-S22`).
- **Alpha Vantage Free ($0):** **25 requests/day** (5/min), REST EOD only, no WS (`R03-S23`).

### 2.3 Institutional, Futures & Broker Feeds (CME Path)
- **CME Group Direct Fees (eff. Jan 1, 2026; Jan 1, 2027 published):** Non-Pro Top-of-Book = **$1.55/mo** per exchange (**$4.65/mo** 4-exchange bundle); Non-Pro Market Depth (L2) = **$12.10/mo** per exchange (**$36.50/mo** 4-exchange bundle); Pro Display = **$134.50/mo** per exchange (`R03-S34`). Vendor Real-Time Distribution = **$29,280/yr/exchange** ($117,120/yr for all 4 DCMs); Delayed Distribution = **$21,840/yr/exchange**; Historical Distribution = **$35,220/yr/exchange** (`R03-S34`). Retail brokers add markups (e.g., NinjaTrader $4 L1 / $16 L2 per exchange; AMP $5 L1 / $17 L2 / $45 bundle in 2026) (`R03-S34`).
- **Databento (`GLBX.MDP3`):** Direct Aurora DC3 FPGA-timestamped CME Globex MDP 3.0 feed with full **L3 MBO**, **L2 MBP-10**, **L1 MBP-1/TBBO**, and **native exchange-reported aggressor side** back to June 6, 2010 (full MBO since May 2017) (`R03-S26`). New accounts receive **$125 free credits** (6-month expiry — roughly ~14 months of single-product `ES` MBO or ~16 months of `ES` Trades) (`R03-S26`). CME Live Standard subscription is **$199/mo** (eff. June 22, 2026; live usage-based CME pricing ended April 2025) with zero separate CME exchange fees (`R03-S26`). Its binary format decoder (`databento/dbn`) and Rust/Python SDKs are **Apache-2.0** (`R03-S27`).
- **dxFeed:** Public unauthenticated demo endpoint `wss://demo.dxfeed.com/market-data/dxlink-ws` (verified HTTP 101 `2026-11-24`; `/dxlink-ws` returned HTTP 400) and REST `demo.dxfeed.com/webservice/rest` serve **15-minute delayed US equities** (live `AAPL` bidTime lagged 895s; `/ES:XCME` returned `TIMED_OUT`) (`R03-S28`). `dxFeed/dxLink` and Graal SDKs are **MPL-2.0** (`R03-S28`). Production live CME PLB/FOD/FOB requires sales-gated institutional contracts or paid retail platform feeds (`R03-S28`).
- **Interactive Brokers (IBKR):** Requires funded **IBKR PRO** account (≥$500 equity above subs), Market Data API Acknowledgement, **CME Rule 576** certification, and a locally running **proprietary TWS or IB Gateway** (`R03-S29`). Default 100 market data lines enforce: **50 outbound req/s** (`lines ÷ 2`, Jan 2025), max **5 concurrent `reqTickByTickData`**, max **3 concurrent `reqMktDepth` (L2 only, no L3 MBO, odd-lots excluded)**, and strict historical pacing (60 req / 10 min for ≤30s bars; max 1,000 ticks/call; no delayed tick-by-tick or depth) (`R03-S29`). `reqTickByTickData` provides **no native aggressor flag** (`Last` and `BidAsk` are separate streams) (`R03-S29`). **License alert:** Official IBKR TWS API v10.49+ transitioned to **GPL (GPLv3)** on August 3, 2026 (`R03-S29`); clean-room socket clients **`wboayue/rust-ibapi` (MIT)** and **`ib-api-reloaded/ib_async` (BSD-2-Clause)** avoid GPL copyleft contamination (`R03-S30`).

### 2.4 Free Historical FX Ticks & Gray-Area Sources
- **Dukascopy (`.bi5`), TrueFX, HistData.com:** All three provide **OTC indicative top-of-book Bid/Ask quotes**, NOT centralized exchange executions with aggressor side (`R03-S31`, `R03-S32`, `R03-S33`). Live decompression of Dukascopy `EURUSD/2026/09/15/12h_ticks.bi5` verified 9,686 20-byte `>3I2f` ticks (`ms, ask, bid, ask_vol, bid_vol`) (`R03-S31`). **None of the three permit data redistribution** (`R03-S31`, `R03-S32`, `R03-S33`); HistData carries documented timezone/DST and pre-May-2009 inverted Bid/Ask data bugs (`R03-S33`).
- **`yfinance` & Stooq (Gray Area):** Yahoo's Terms of Service explicitly ban automated scraping, database creation, and data feeds, and Yahoo issued cease-and-desist letters to open-source Yahoo Finance scrapers in November 2026 (`R03-S24`). Stooq instituted a **CAPTCHA + `apikey` requirement** in March–April 2026; our live probe of `stooq.com/q/d/l/?s=spy.us&i=d` returned an HTML JavaScript/CAPTCHA verification wall (`R03-S25`).

---

## 3. Brutal Truths (What CANNOT Be Free)

> **Design discipline:** Honest engineering starts by stating economic and legal realities plainly rather than papering over them with brittle hacks.

1. **Real-Time CME Futures Data (L1, L2 Depth, or L3 MBO) CANNOT Be Free — Ever.**
   CME Group legally controls MDP 3.0 via the Information License Agreement (ILA). Redistributing real-time CME data costs **$29,280/year per exchange** ($117,120/yr across CME/CBOT/NYMEX/COMEX) — and even delayed redistribution costs **$21,840/yr/exchange** and historical redistribution **$35,220/yr/exchange** (`R03-S34`). Even for an individual retail Non-Professional accessing data via a licensed broker, CME charges **$12.10/mo/exchange ($36.50/mo 4-exchange bundle)** in base exchange fees before broker markups (typically $16–$45+/mo retail) (`R03-S34`). Any `$0` project promising "free real-time ES/NQ DOM & Footprint" is either illegally restreaming pirated data (guaranteed C&D) or faking it with CFD/synthetic quotes (prohibited under Allegedly's Honest Provenance rule AND CME DS-45 Sept 2026 Synthetic Feed rules).
2. **Real-Time Consolidated US Equities (100% SIP) & Equity L2/L3 Depth CANNOT Be Free.**
   Free live US stock feeds (Alpaca Basic `feed=iex`, Tiingo Starter) cover **only IEX (~2.5% of US equity volume)** (`R03-S14`, `R03-S19`). Computing Volume Profile, VWAP, or Footprint Delta on 2.5% of market volume produces structurally distorted price levels and false imbalances. Paid consolidated SIP ($99/mo Alpaca Algo Trader Plus or $199/mo Massive Stocks Advanced) **still contains zero L2 book depth and zero exchange-reported aggressor flags** (`R03-S14`, `R03-S16`). True US equity L2/L3 order-flow requires proprietary exchange feeds (Nasdaq TotalView/ITCH, NYSE Integrated, Cboe PITCH) via paid institutional/direct providers (e.g., Databento).
3. **Zero-Cost Real-Time Authentic Order-Flow Exists ONLY in Crypto — and US Law Eliminates Offshore Perp Leaders as Defaults.**
   Crypto public WebSockets (Kraken, Coinbase, Binance, Bybit, OKX, Hyperliquid) are the **only** asset class where genuine real-time tick-by-tick trades + native exchange aggressor side + L2 (and on Coinbase Exchange, L3) order books are legally `$0` without an account. However, because our primary dev/user environment is US (`A01`) and Allegedly must be compliant for US and global users alike, **Binance Global (HTTP 451), Bybit (HTTP 403 / Excluded Jurisdiction), and Hyperliquid (US Terms prohibition) CANNOT be default out-of-the-box providers** (`R03-S02`, `R03-S04`, `R03-S12`). Only **Kraken** and **Coinbase** are legally clean US + global `$0` defaults.
4. **Free Spot FX Ticks Are NOT Exchange Order-Flow.**
   Dukascopy, TrueFX, and HistData provide **OTC indicative top-of-book quotes** (`R03-S31`–`R03-S33`). TrueFX and HistData have zero volume; Dukascopy's `bid_vol`/`ask_vol` reflects indicative liquidity at touch on one Swiss ECN, not executed aggressor volume. Rendering a Footprint Bar or Cumulative Volume Delta from FX quotes without a loud `INDICATIVE OTC QUOTES — SYNTHETIC/UNAVAILABLE DELTA` banner violates Non-Negotiable #8.
5. **Gray-Area Scrapers (`yfinance`, Stooq) Are Legal & Reliability Landmines.**
   Bundling `yfinance` or a Stooq scraper into Allegedly core violates [[Constraints]] #1 & #8, exposes the FOSS project to Yahoo legal C&D action (actively enforced Nov 2026, `R03-S24`), and breaks unpredictably behind CAPTCHA/429 walls (`R03-S25`).
6. **Broker-Bundled Feeds Are Not Frictionless Free Data.**
   IBKR requires ≥$500 live equity, paid monthly exchange subscriptions, proprietary TWS/IB Gateway running locally, and limits default users to **3 simultaneous L2 DOM streams** and **5 tick-by-tick streams** without native aggressor flags (`R03-S29`).

---

## 4. Multi-Rung Fallback Ladder

Allegedly implements a **6-rung explicit fallback ladder** where **no silent substitution ever occurs** ([[Constraints]] #6, #8). Every chart, Footprint Bar, Volume Profile, and DOM Ladder displays a persistent Provenance pill tied to its active rung:

| Rung | Source Class | Representative Providers | User Cost | Order-Flow Fidelity | Mandatory Provenance Badge |
|---|---|---|---|---|---|
| **Rung 1** | **BYO Paid / Credit Pro Feeds** | Databento (`GLBX.MDP3` via $125 free credits or $199/mo Standard; Nasdaq ITCH); Massive Paid; Alpaca Algo Trader Plus ($99/mo); dxFeed Entitled | `$0` (credits) → `$29–$199+/mo` | **Gold (CME/Equities Direct):** L3 MBO / L2 MBP / Native exchange aggressor (Databento) or 100% SIP L1 (Alpaca/Massive) | `LIVE · DATABENTO GLBX.MDP3 · L3 MBO · NATIVE AGGRESSOR` (or `100% SIP · INFERRED SIDE`) |
| **Rung 2** | **Broker-Bundled Entitlements** | IBKR TWS/IB Gateway (`rust-ibapi` MIT / `ib_async` BSD-2-Clause) with user's Non-Pro CME ($1.55 L1 / $12.10 L2 base + broker fee); future R04 futures brokers (Rithmic/Tradovate/ProjectX) | Funded account + `$1.55–$45+/mo` exchange subs | **Silver–Gold:** Live L1/L2 CME (IBKR capped at 3 L2 / 5 tick streams; aggressor inferred on IBKR, native on Rithmic MBO per R04) | `LIVE · IBKR CME · L2 (3-STREAM CAP) · INFERRED AGGRESSOR` |
| **Rung 3** | **Free Zero-Key Live Crypto & Local-Fetched Historical FX** | **Kraken WS v2**, **Coinbase AdvTrade/Exchange WS** (US-safe defaults); optional regional OKX/Binance.US; user-initiated **Dukascopy `.bi5`** downloader | **`$0`** (zero signup for Kraken/Coinbase/Dukascopy) | **Gold (Crypto):** Real-time ticks, L2/L3 depth, native aggressor side. **Bronze (FX):** Historical L1 OTC indicative quotes only | `LIVE · KRAKEN SPOT · L2 (1000) · NATIVE AGGRESSOR` / `HIST · DUKASCOPY OTC · INDICATIVE QUOTES` |
| **Rung 4** | **User-Owned Local File Import** | Native **Databento `.dbn`/`.dbn.zst`** (via `dbn` Apache-2.0), **Parquet**, and **CSV** (trades, quotes, bars, MBO) | **`$0`** | **Up to Gold (Offline):** Preserves exact schema, fixed-point prices, and aggressor provenance from user's own files (including CME MBO!) | `LOCAL FILE · DBN/PARQUET · <DECLARED PROVENANCE>` |
| **Rung 5** | **Self-Recorded Local Tick Vault** | Allegedly's built-in local recorder persisting live Rung 1–3 trade ticks & L2 book deltas to local Parquet/Zstd on disk | **`$0`** incremental (user's own disk) | **Exact Replay:** Replays full historical Footprint Bars, Volume Profiles, and DOM Ladder from streams the user previously recorded | `LOCAL VAULT · RECORDED FROM <PROVIDER> · <ORIGINAL PROVENANCE>` |
| **Rung 6** | **Delayed / Sample / Synthetic Fallback** | **dxFeed Demo** (`wss://demo.dxfeed.com/market-data/dxlink-ws`, 15m delayed US equities); **Alpaca Basic** (`iex` ~2.5% vol or >15m SIP); **Massive Basic** (EOD); deterministic **Synthetic Order-Book Simulator** | **`$0`** | **Demo / Partial / Synthetic Only:** Footprint Delta & Imbalances are **locked behind an explicit warning acknowledgement** if single-venue partial or inferred | `15M DELAYED · DXFEED DEMO` / `PARTIAL (~2.5% IEX) · INFERRED SIDE` / `SYNTHETIC SIMULATOR` |

> **Zero Silent Fallback Rule:** If a user opens `ES` (CME E-mini S&P 500) without a Rung 1/2 entitlement or Rung 4/5 local file, Allegedly **never** silently substitutes a delayed CFD or synthetic stream. Instead, it displays an explicit entitlement prompt offering: (a) connect BYO Databento / IBKR, (b) import a local `.dbn`/Parquet file (including instructions to use Databento's $125 free credits), (c) switch to a live `$0` Kraken/Coinbase crypto instrument, or (d) explicitly launch the clearly badged Synthetic Simulator.

---

## 5. Tick-Side Inference Research (Quantitative Accuracy & Provenance UX)

When a provider supplies trade ticks **without** an exchange-reported aggressor side (e.g., US Equities SIP on Alpaca/Massive, IBKR `reqTickByTickData`, or historical CSV imports lacking a side column), order-flow tools must infer whether each trade was buyer-initiated (`+1`) or seller-initiated (`-1`).

### 5.1 Primary Inference Algorithms
1. **Quote Rule (QR):** Compares trade price $P_t$ to the prevailing quote midpoint $M_t = (B_t + A_t) / 2$: buy if $P_t > M_t$, sell if $P_t < M_t$, unclassified if $P_t = M_t$ (`R03-S35`).
2. **Tick Rule (TR):** Uses trade prices alone: buy on uptick ($P_t > P_{t-1}$) or zero-uptick (unchanged from last uptick); sell on downtick or zero-downtick (`R03-S35`, `R03-S36`).
3. **Lee & Ready (1991) (LR):** Applies Quote Rule first, falling back to Tick Rule for exact midpoint trades ($P_t = M_t$). Originally prescribed a 5-second quote lag for 1988 NYSE reporting delays; in modern millisecond feeds, quote lag shrinks to 0–1s (`R03-S35`, `R03-S38`, `R03-S39`).
4. **Ellis, Michaely & O'Hara (2000) (EMO):** Classifies trades *strictly at* the ask ($P_t = A_t$) as buys and *at* the bid ($P_t = B_t$) as sells; all trades inside or outside the spread fall back to the Tick Rule (`R03-S36`).
5. **Chakrabarty, Li, Nguyen & Van Ness (2007) (CLNV / Modified EMO):** Classifies trades in the upper 30% of the spread ($[0.3B_t + 0.7A_t, A_t]$) as buys, lower 30% ($[B_t, 0.7B_t + 0.3A_t]$) as sells, and applies Tick Rule to the middle 40% and outside-quote prints (`R03-S37`).
6. **Bulk Volume Classification (BVC) — Easley, López de Prado & O'Hara (2012):** Aggregates volume into time/volume bars and assigns fractional buy volume via standardized price change $V_{\text{buy}} = V \cdot \Phi(\Delta P / \sigma_{\Delta P})$ (`R03-S40`). Avoids tick-to-quote alignment entirely, **but** empirical evaluations (Chakrabarty, Pascual & Shkilko 2015) found traditional LR and TR consistently outperformed BVC in trade-signing accuracy across all stock sizes (`R03-S38`).

### 5.2 Verified Quantitative Accuracy Limits (Primary Microstructure Literature)

| Primary Study | Market / Dataset (Ground Truth) | Quote Rule (QR) | Tick Rule (TR) | Lee-Ready (LR) | EMO (2000) | Critical Degradation Mechanism |
|---|---|---:|---:|---:|---:|---|
| **Lee & Ready (1991)** (`R03-S35`) | NYSE (modeled midpoint tick test) | — | ~85% *(midpoint model)* | Baseline | — | Trade-vs-quote reporting lag |
| **Odders-White (2000)** *(cited via `R03-S36`)* | NYSE TORQ (pre-decimalization) | ~75% | ~79% | ~85% | — | Midpoint / specialist executions |
| **Ellis, Michaely & O'Hara (2000)** (`R03-S36`) | Nasdaq proprietary signed trades | **76.4%** | **77.66%** | **81.05%** | **81.9%** | **Inside-spread, large trades, high volume, ECN prints** |
| **Theissen (2001)** *(cited via `R03-S36`)* | Frankfurt Stock Exchange | — | ~72.8% | **72.8%** | — | Inside-spread specialist fills |
| **Savickas & Wilson (2003)** *(cited via `R03-S36`)* | CBOE Options | **83%** | **59%** | **80%** | **77%** | Wide spreads collapse Tick Rule to near-random |
| **Chakrabarty et al. (2007)** (`R03-S37`) | Nasdaq ECNs (750 stocks, INET) | < CLNV | < CLNV | < CLNV inside spread | < CLNV inside spread | Hidden/inside-spread limit orders on ECNs |
| **Chakrabarty, Moulton & Shkilko (2012)** (`R03-S38`) | Nasdaq (post-decimalization, 2005) | — | — | **69%** (0s lag) / **79%** (1s lag) | — | **31% error at contemporaneous 0s quote matching** |
| **Holden & Jacobsen (2014)** (`R03-S39`) | US Equities DTAQ (ms) vs MTAQ (s) | — | — | Severe MTAQ distortion | Severe MTAQ distortion | **Coarse 1s timestamps, withdrawn/locked/crossed NBBO quotes** |
| **Panayides, Shohfi & Smith (2019)** *(cited via `R03-S38`)* | Euronext Paris (low-latency LOB) | — | Beats LR in rapid bursts | **77.24%** overall (**66.55%–67.20%** in fast bursts) | — | **Accuracy drops ~10+ pts during high-activity bursts** — exactly when order-flow traders watch Footprint imbalances! |

### 5.3 Implications for Order-Flow Math & Provenance UX
- **Why 15%–33% misclassification breaks naive Footprint/CVD:** Every misclassified trade flips its sign ($+V \to -V$), creating a **$2V$ error in Delta**. If 25% of trades are misclassified during a fast breakout burst (Panayides et al. 2019: 66.55% LR accuracy = 33.45% error!), expected Delta attenuates by up to **50%–67%** and diagonal **Imbalance** ratios (e.g., 3:1 ask/bid) fire false positives or vanish entirely.
- **Required Allegedly Provenance Schema & UX Rules:**
  1. Every normalized `TradeTick` stores an explicit `AggressorSide` enum (`Buy`, `Sell`, `Unknown`) **plus** `AggressorSource` (`ExchangeReported`, `InferredLeeReady`, `InferredClnv`, `InferredTickRule`, `None`).
  2. Every series carries `VenueCoverage` (`FullVenue`, `ConsolidatedSip`, `SingleVenuePartial { pct_estimate }`, `OtcIndicative`) and `Timeliness` (`RealTime`, `Delayed { seconds }`, `HistoricalEod`, `Synthetic`).
  3. **Loud UI Differentiation:**
     - Native exchange-reported aggressor (Kraken, Coinbase, Databento CME) → standard Footprint / CVD styling with subtle `NATIVE` provenance tag.
     - Inferred aggressor (Alpaca SIP, Massive SIP, IBKR) → distinct visual indicator (e.g., dashed/amber `INFERRED (LR ~70–81% ACC)` badge on Footprint & CVD header) + selectable inference rule (`Lee-Ready` default when L1 quotes present, `CLNV`, or `Tick Rule` fallback when quote-less) in Settings-as-Code (`[[Constraints]]` #6).
     - Single-venue partial feed (Alpaca Basic `iex` ~2.5%) or OTC FX quotes (Dukascopy/TrueFX/HistData) → **persistent warning banner**; Footprint Delta/Imbalances default to **Volume-at-Price (total volume only)** unless the user explicitly toggles "Show Inferred/Partial Delta (Experimental)".

---

## 6. Options Table (Weighted Criteria for v0.1 / v0.2 Default Providers)

Scoring scale: `1` (unacceptable/blocker) to `5` (best-in-class). Criteria weights align directly to [[Constraints]] (#1 FOSS, #2 $0 Core, #8 Honest Provenance) and [[Assumptions]] (A02 CME+Crypto priority, A04 $0 budget).

### 6.1 v0.1 `$0` Out-of-the-Box Live Order-Flow Defaults (Crypto + Demo)

| Option | `$0` & Zero-Signup (25%) | Native Aggressor + L2 (25%) | US + Global ToS/Legal (25%) | FOSS SDK & Protocol Stability (15%) | Historical/Replay Synergy (10%) | Weighted Score (/5.00) | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| **A. Kraken WS v2 + Coinbase AdvTrade/Exch WS** | 5.0 | 5.0 *(Kraken L2 CRC32 + Coinbase L2/L3; sign-invert adapter needed)* | 4.8 *(US-regulated; Kraken excl. NY/ME)* | 4.5 *(Apache-2.0/MIT libs; clean WS v2)* | 4.0 *(Kraken REST history + local vault)* | **4.78** | **RECOMMENDED v0.1 Live Default** |
| **B. Binance Global (`data-stream.binance.vision` + `.com`)** | 5.0 | 4.5 *(Spot L2 + inverted `m`; Futures REST HTTP 451)* | 1.5 *(HTTP 451 US block; Terms §b exclude US persons)* | 4.5 *(MIT SDK; mature protocol)* | 5.0 *(`data.binance.vision` archives)* | **3.93** | Opt-in non-US / regional plug-in only |
| **C. Hyperliquid Public WS** | 5.0 | 3.5 *(Jun 2026 `l2Book` throttling; 20-lvl `l2` diffs)* | 1.5 *(US Terms ban + UI geo-block)* | 4.0 *(MIT SDK)* | 3.0 *(node/S3 external)* | **3.40** | Opt-in non-US plug-in only |
| **D. Bybit V5 + OKX Global** | 5.0 | 4.5 *(OKX 10ms deep L2 VIP-gated; checksum deprecated)* | 1.5 *(Bybit HTTP 403 US block; OKX requires `us.okx.com`)* | 3.5 *(OKX SDK lacks SPDX license; port 8443 churn)* | 3.5 | **3.63** | Opt-in non-US plug-in only |
| **E. Alpaca Basic (IEX) + dxFeed Demo** | 3.5 *(Alpaca requires free account)* | 1.5 *(No L2; no stock aggressor; IEX ~2.5% vol; dxFeed 15m delayed)* | 4.5 *(Clean BYO/demo ToS)* | 4.5 *(Apache-2.0 / MPL-2.0)* | 3.5 *(Alpaca SIP >15m)* | **3.40** | Secondary BYO equities / opt-in demo only |

### 6.2 CME Futures Order-Flow Path (v0.1 `$0` Offline/Replay → v0.2 Live BYO)

| Option | CME MBO/L2 + Native Aggressor (30%) | `$0` Core Compatibility (25%) | Legal / License Cleanliness (20%) | Rate/Stream Headroom (15%) | Implementation Cost (10%) | Weighted Score (/5.00) | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| **F. Databento DBN Local File + BYO API Key ($125 Credits → $199/mo Live)** | 5.0 *(Full MDP 3.0 L3 MBO, L2 MBP-10, TBBO, native side)* | 4.5 *(Native `.dbn` Apache-2.0 reader is $0; $125 signup credits = ~14 mo `ES` MBO)* | 5.0 *(Apache-2.0 `dbn` crate; zero CME redistribution risk)* | 5.0 *(FPGA-stamped batch & streaming)* | 4.5 *(Single clean binary schema)* | **4.83** | **RECOMMENDED v0.1 Offline/Replay + v0.2 Pro CME Plug-in** |
| **G. IBKR TWS/IB Gateway via Clean-Room `rust-ibapi` (MIT) / `ib_async` (BSD-2)** | 2.5 *(L2 only, no MBO, no native aggressor, odd-lots excluded)* | 2.5 *(Needs ≥$500 account + paid CME sub)* | 3.5 *(Clean-room avoids v10.49+ GPL, but requires proprietary TWS/Gateway host)* | 2.0 *(3 L2 / 5 tick concurrent cap; 60 hist/10m)* | 3.0 *(Socket protocol + Error 317 resets)* | **2.68** | **RECOMMENDED v0.2 Retail Broker-Bundled Plug-in** (paired with R04 futures brokers) |
| **H. Massive (Polygon.io) Futures API** | 2.0 *(No L2/L3 depth; Basic is 8-hr delayed bars only)* | 3.0 *(Basic $0 5/min bars; RT $199/mo)* | 4.5 *(MIT client; personal non-pro)* | 4.0 *(Unlimited on paid)* | 4.5 *(Clean REST/WS)* | **3.30** | Optional BYO OHLCV/L1 plug-in |
| **I. dxFeed Institutional / Retail Feed** | 4.8 *(PLB + FOD/FOB MBO)* | 1.5 *(Demo lacks CME; live sales-gated)* | 4.5 *(MPL-2.0 `dxLink`)* | 4.5 | 3.5 | **3.74** | Post-v0.2 partner plug-in (coordinate with R04) |

---

## 7. Recommendation + Rationale

Adopt a **Provider-Agnostic Normalized Event Core** (`TradeTick`, `BookDelta`, `BookSnapshot`, `Bar`, `ProvenanceHeader`) backed by a strictly legal, `$0`-first provider stack:

1. **v0.1 `$0` Out-of-the-Box Live Defaults (Zero Accounts Required):**
   - **Kraken Spot WS v2** (`wss://ws.kraken.com/v2`) — primary live L2 (100/500/1000 levels with CRC32 checksum validation) + real-time trade ticks with direct native aggressor side.
   - **Coinbase Advanced Trade WS** (`wss://advanced-trade-ws.coinbase.com/`) — secondary live L2 + trade ticks (with mandatory **maker-to-taker side inversion** and unit-tested sign verification), plus optional opt-in **Coinbase Exchange L3 (`full`)** stream (`wss://ws-feed.exchange.coinbase.com/`) to validate L3 MBO rendering at `$0`!
   - **Self-Recorded Local Tick Vault (Rung 5):** Persist live Kraken/Coinbase streams locally in open Parquet/Zstd format so users immediately get deterministic historical replay of Footprint Bars and DOM Ladders at `$0`.
2. **v0.1 `$0` CME Futures & Offline Order-Flow Foundation:**
   - Ship a **first-class native `.dbn` / `.dbn.zst` reader** built on **`databento/dbn` (Apache-2.0)** plus generic **CSV/Parquet importers** (Rung 4). A CME trader can sign up for Databento's `$125` free credits (at `$0` spend), download ~14 months of CME `ES` MBO/TBBO `.dbn.zst` files locally, and replay institutional-grade CME Footprint Bars, Volume Profiles, and L3 DOM Ladders completely offline in Allegedly v0.1.
   - Ship a **deterministic Synthetic Market Simulator** (clearly badged `SYNTHETIC`) for offline development, automated regression tests, and CME UI demos without violating CME licensing.
3. **v0.1 Optional User-Initiated FX Historical Importer:**
   - Provide a **Dukascopy `.bi5` local fetcher/decoder** (client-side only; Allegedly never mirrors or redistributes Dukascopy files), strictly tagged `OTC INDICATIVE QUOTES — NO EXCHANGE AGGRESSOR` (Volume-at-Price disabled/locked by default).
4. **v0.1/v0.2 BYO-Key US Equities Plug-Ins (No Gray-Area Scrapers):**
   - **Alpaca Basic** (`feed=iex` live with loud `~2.5% SINGLE-VENUE` badge + `feed=sip` >15m historical) and **Massive Basic** (2yr EOD REST) + **dxFeed Demo** (`wss://demo.dxfeed.com/market-data/dxlink-ws`, opt-in 15m delayed demo).
   - **Explicitly exclude `yfinance` and Stooq from Allegedly core and official plug-ins.** Users who possess their own CSV/Parquet files from any external source may import them via Rung 4.
5. **v0.2 Live CME Futures Upgrade Path (BYO Paid / Broker-Bundled):**
   - **Databento Live Plug-In** (`databento-rs` Apache-2.0) for BYO `$199/mo` CME Globex MDP 3.0 live L3/L2/Trades.
   - **IBKR TWS/IB Gateway Plug-In** built exclusively on clean-room **`wboayue/rust-ibapi` (MIT)** (or `ib_async` BSD-2-Clause) — **never** linking IBKR's GPLv3 official TWS API v10.49+ — paired with futures-specialist broker feeds evaluated in **R04** (e.g., Rithmic/Tradovate/ProjectX) to overcome IBKR's 3-stream L2 depth cap and lack of native aggressor flags.

---

## 8. Inferences

*(Explicitly separated from verified Facts in §2)*
- **Inference 1 (US/Global Crypto Split):** Because Kraken and Coinbase passed live US-IP HTTP/WS probes with clean US regulatory status while Binance Global (HTTP 451), Bybit (HTTP 403), and Hyperliquid (ToS ban) failed US compliance, making Kraken + Coinbase the default v0.1 live stack guarantees out-of-the-box functionality for both US and non-US users without geo-fencing breakage or legal exposure.
- **Inference 2 (DBN as Allegedly's Golden Offline Test Fixture Format):** Because `databento/dbn` is Apache-2.0, fixed-point integer scaled (`1e-9`), supports MBO/MBP-10/TBBO/Trades/OHLCV natively, and is backed by `$125` free user credits on `GLBX.MDP3`, supporting `.dbn` natively in v0.1 simultaneously solves (a) CME futures order-flow validation on a `$0` budget, (b) deterministic replay testing for R05 order-flow math, and (c) seamless v0.2 live Databento upgrades.
- **Inference 3 (TWS API GPLv3 Contamination Risk):** Because IBKR moved its official TWS API to GPLv3 in August 2026 (`R03-S29`), importing IBKR's official SDK into a permissively licensed Allegedly core (if R09 chooses MIT/Apache-2.0) would create a license-incompatibility trap. Standardizing on clean-room `rust-ibapi` (MIT) or out-of-process plug-in isolation eliminates this risk upfront.
- **Inference 4 (Tick-Side Inference Accuracy Ceiling):** Combining Ellis et al. (2000), Chakrabarty et al. (2012), and Panayides et al. (2019), Allegedly must treat any inferred US-equity or IBKR Footprint Delta as carrying a **19%–33% per-trade error rate** (worst during volatility bursts). Displaying inferred delta identically to exchange-reported delta would violate Non-Negotiable #8.

---

## 9. Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Aggressor-Side Sign Inversion Bug** (Coinbase `side` = maker; Binance `m` = `isBuyerMaker`; Kraken/OKX/Bybit/Hyperliquid = taker) | **Critical** | High | Mandatory per-adapter golden unit tests verifying Buy-aggressor lifts Ask & Sell-aggressor hits Bid against live captured L1+Trade fixtures in Spike S05. |
| **Exchange API / Protocol Churn** (e.g., OKX port 8443 removal & checksum deprecation in 2026; Hyperliquid `l2Book` throttling Jun 2026; Stooq CAPTCHA wall Mar–Apr 2026) | High | High | Isolate every provider behind a versioned adapter trait; fail loudly with actionable diagnostics; never depend on a single exchange or undocumented scraper. |
| **Accidental Data Redistribution / Exchange Audit Exposure** | **Critical** | Medium | Never bundle, mirror, or ship historical CME/equity/FX datasets in git, releases, or demo packs. Ship only clean-room decoders/importers and a deterministic synthetic generator. |
| **Misleading Order-Flow on IEX (~2.5% Vol) or OTC FX Quotes** | High | High | Enforce non-dismissible Provenance badges and lock inferred/partial Footprint Delta behind an explicit user opt-in toggle. |
| **IBKR Stream Exhaustion (3 L2 / 5 Tick Cap) & Order-Book Desync (Error 317)** | Medium | High | Track active line budget explicitly in the IBKR adapter UI; automatically clear & rebuild local L2 book on Error 317; prioritize R04 futures brokers (Rithmic/Tradovate) for multi-instrument CME DOM users. |
| **IBKR Official TWS API v10.49+ GPLv3 License Contamination** | Medium | Low | Ban official IBKR `ibapi` package in dependency lints; use clean-room `rust-ibapi` (MIT) / `ib_async` (BSD-2-Clause) only. |

---

## 10. Open Questions & UNVERIFIED Items

### 10.1 Decisions Requiring Abel / Cross-Track Alignment
1. **CME Futures Priority vs. `$0` Live Expectation ([[Assumptions]] A02/A04):** Confirm that Abel accepts the v0.1 CME strategy: `$0` offline/replay CME MBO via native `.dbn` + `$125` Databento credits + live `$0` Kraken/Coinbase crypto order-flow, deferring paid live CME feeds (Databento/IBKR/R04 broker) to v0.2.
2. **Coordinate with R04 (Execution & Prop):** Which futures-specialist broker/prop feeds (Tradovate, Rithmic, ProjectX, CQG) offer the cleanest BYO CME L2/MBO entitlement with native aggressor side for v0.2, and how do CME's September 2026 funded-trader rules impact them?
3. **Coordinate with R05 (Order-Flow Math) & R07 (Storage):** Finalize fixed-point scaling (`1e-8` vs `1e-9` matching DBN's `1e-9` `i64` price scale) and exact Parquet/local-vault schema for `TradeTick` + `BookDelta` + `ProvenanceHeader`.

### 10.2 UNVERIFIED Items & Concrete Human Verification Steps
*(Cross-referenced to [[Provider-Capability-Matrix#4. UNVERIFIED Items & Concrete Human Verification Steps]])*
1. **CME Group Official 2026/2027 Fee Schedule PDFs (Direct Binary Verification):** `cmegroup.com` returned HTTP 403 to scripted fetch; human should open `https://www.cmegroup.com/market-data/distributor/market-data-fees.html` in a browser and confirm the 2026/2027 PDF tables directly (including 2027 Non-Display Category A1 rates).
2. **Massive (Polygon.io) Futures API Native Aggressor Side Flag:** Verify in a browser at `https://massive.com/docs/futures/` whether Massive's May 2026 CME Futures trade records expose CME MDP 3.0's native aggressor side.
3. **Finnhub Free-Tier WebSocket Symbol Cap & Venue Coverage:** Verify in a browser at `https://finnhub.io/docs/api/websocket-trades` (or via a personal free key outside the vault).
4. **IBKR CME Commission Waiver Thresholds:** Verify current North America Futures fee table at `https://www.interactivebrokers.com/en/pricing/research-news-marketdata.php` in a browser.
5. **Exact 2026 Public WS Subscription/Connection Ceilings for Binance Global, Binance.US, Bybit V5, and OKX US:** Verify exact numeric limits in browser docs prior to building optional non-US adapters.
6. **TrueFX Exact 2026 Pair Count:** Behind free account login on `https://www.truefx.com/`; verify only if TrueFX is prioritized post-MVP.

---

## 11. What Would Change This Decision

- **Trigger 1 — Free Regulated CME Delayed/L1 Sandbox Emerges:** If CME Group or a licensed partner launches a legal, zero-cost real-time or realistic L2/MBO educational sandbox API for CME futures, promote it immediately to Rung 3 for v0.1.
- **Trigger 2 — Kraken or Coinbase Restricts Unauthenticated Public WS:** If either default exchange puts public L2/trade WebSockets behind paid tiers or mandatory KYC keys, promote **Binance.US** (US Spot) / **OKX US** (`us.okx.com`) or require free user-generated API keys as fallback.
- **Trigger 3 — Abel Overrides A02 (Equities First) or A04 (Paid Budget Approved):** If Abel prioritizes US Equities over CME/Crypto or approves a personal Databento ($199/mo) / Alpaca Algo Trader Plus ($99/mo) feed for development, shift Spike S05 primary live ingest fixture to that feed while still keeping Kraken/Coinbase as the `$0` public core default.
- **Trigger 4 — Databento Retires `$125` Free Credits or Changes DBN License:** Existing Apache-2.0 `dbn` releases remain permanently FOSS, but if `$125` signup credits disappear, shift v0.1 CME replay docs to user-supplied CSV/Parquet + synthetic CME generator.

---

## 12. Pre-Declared Thresholds for Phase 2 Spike S05 (Live Ingest & Normalization)

Spike `S05` (`spikes/S05-market-data-ingest/`) validates end-to-end live ingestion, fixed-point normalization, order-book continuity, aggressor-side correctness, and local `.dbn`/`.bi5` decoding before architecture lock. **All metrics are measured on macOS Apple Silicon (`A01`) with zero paid accounts:**

| Gate ID | Dimension | Pass Threshold | Degrade (Investigate) | Fail (Block / Redesign) |
|---|---|---|---|---|
| **S05-G1** | **Live Public WS Connectivity & Continuity** | Kraken WS v2 (`BTC/USD`, `ETH/USD`, `SOL/USD` L2 depth=100 + `trade`) AND Coinbase AdvTrade WS (`BTC-USD`, `ETH-USD` `level2` + `market_trades`) sustain **≥ 30 min** continuous ingest with **0 silent book desyncs** (Kraken CRC32 100% pass; Coinbase `sequence_num` gap detection + clean resync < 2 s). | 1–2 transient disconnects that cleanly auto-resync in < 5 s with logged gap event. | Any silent order-book corruption, CRC32 mismatch without automatic resync, or unrecovered disconnect. |
| **S05-G2** | **Aggressor-Side Sign Correctness** | **100% pass** on automated empirical check: ≥ 98% of non-crossed trades with `AggressorSide::Buy` execute at `price >= best_ask` and `AggressorSide::Sell` at `price <= best_bid` across ≥ 1,000 live trades on **both** Kraken (direct) and Coinbase (inverted maker→taker). | 95%–98% (verify fast-tick race between trade & book channel timestamps). | < 95% or inverted correlation (proves sign-inversion bug!). |
| **S05-G3** | **Fixed-Point Financial Correctness (`Constraints` #7)** | **0** IEEE-754 `f32`/`f64` fields in normalized `TradeTick`, `BookLevel`, or `Bar` structs; 100% exact round-trip decimal string → scaled `i64` (`1e-9` or instrument tick integer) → string across crypto (8 decimals), CME (`0.25` tick), and FX (`0.00001` pip). | N/A (non-negotiable). | Any floating-point rounding drift (`0.1 + 0.2 != 0.3`) in price or quantity math. |
| **S05-G4** | **Ingest Throughput, Latency & Resource Budget (`Constraints` #5)** | Sustained ingestion + L2 book maintenance + local Parquet/Zstd vault recording at **≥ 10,000 events/s** synthetic replay & **≥ 30 DOM updates/s** live; p99 normalize-to-ringbuffer latency **< 1.0 ms**; ingest daemon RSS **< 60 MB** (preserving `< 300 MB` total app budget); zero GC pauses. | p99 latency 1.0–5.0 ms or RSS 60–100 MB. | p99 latency > 5.0 ms, RSS > 100 MB, or dropped messages under 10k events/s burst. |
| **S05-G5** | **Offline Decoders (`.dbn` + Dukascopy `.bi5`)** | Decode real `.dbn.zst` sample via `dbn` (Apache-2.0) AND live-fetched Dukascopy `.bi5` hour (`>3I2f` LZMA) into unified `TradeTick`/`QuoteTick` stream at **≥ 500,000 records/s** with 100% intact `ProvenanceHeader` (`ExchangeReported` vs `OtcIndicative`). | 100k–500k records/s. | < 100k records/s, corrupt timestamps (0-indexed month / DST bugs), or missing provenance tags. |
| **S05-G6** | **Tick-Side Inference Validation Benchmark** | Run Allegedly's `Lee-Ready` and `Tick Rule` implementations against a ground-truth exchange-signed Kraken/Coinbase trade+L1 recording (≥ 10,000 trades) and verify measured classification accuracy lands in the literature-expected band (**~75%–92%** on crypto tight-spread L1) while emitting explicit `InferredLeeReady` / `InferredTickRule` provenance tags. | Accuracy 65%–75% (document spread/burst cause). | Accuracy < 65% (indicates quote-alignment bug) or missing `Inferred` provenance flag. |

---

## Sources

| Source ID | Track | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|---|
| `R03-S01` | R03 | Binance Spot WebSocket Streams Official Documentation (`@trade`, `@aggTrade`, `@depth`, `m` `isBuyerMaker`, `data-stream.binance.vision`) | https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/ws-streams/~ | 2026-11-24 | Read primary docs + live URL status check | High |
| `R03-S02` | R03 | Binance Global / Vision / Binance.US Live US-IP Probes (`api.binance.com` HTTP 451, `fapi.binance.com` HTTP 451, `stream.binance.com` HTTP 451, `data-api.binance.vision` HTTP 200, `data-stream.binance.vision` WS 101, `api.binance.us` HTTP 200) | https://data-api.binance.vision/api/v3/trades?symbol=BTCUSDT&limit=1 | 2026-11-24 | Live API call + raw TLS WS handshake (US IP) | High |
| `R03-S03` | R03 | `binance/binance-connector-python` GitHub Repository License (MIT) | https://github.com/binance/binance-connector-python | 2026-11-24 | GitHub API repo `LICENSE` SPDX check | High |
| `R03-S04` | R03 | Bybit V5 WebSocket Docs (`publicTrade`, `orderbook`, `S` taker side) + US Excluded Jurisdiction & Live US-IP Probe (`api.bybit.com` HTTP 403) | https://bybit-exchange.github.io/docs/v5/ws/connect | 2026-11-24 | Read primary docs + live API/WS call (US IP) | High |
| `R03-S05` | R03 | `bybit-exchange/pybit` Raw GitHub `LICENSE` (MIT License) | https://raw.githubusercontent.com/bybit-exchange/pybit/master/LICENSE | 2026-11-24 | Direct raw `LICENSE` file read | High |
| `R03-S06` | R03 | OKX V5 API Official Docs (`trades`, `trades-all`, `books`, `us.okx.com`, 2026 port 8443 retirement & checksum deprecation) + Live US-IP Probes | https://www.okx.com/docs-v5/en/ | 2026-11-24 | Read primary docs + live REST/WS call (US IP) | High |
| `R03-S07` | R03 | `ccxt/ccxt` GitHub Repository License (MIT) + `okxapi/python-okx` missing SPDX verification | https://github.com/ccxt/ccxt | 2026-11-24 | GitHub API repo `LICENSE` SPDX check | High |
| `R03-S08` | R03 | Coinbase Advanced Trade & Exchange WebSocket Docs (`market_trades`, `matches` inverted maker `side`, `level2`, Exchange `full` L3) + Live US-IP Probes | https://docs.cdp.coinbase.com/advanced-trade/docs/ws-overview | 2026-11-24 | Read primary docs + live REST/WS calls (`advanced-trade-ws` & `ws-feed.exchange`) | High |
| `R03-S09` | R03 | `coinbase/coinbase-advanced-py` GitHub Repository License (Apache-2.0) | https://github.com/coinbase/coinbase-advanced-py | 2026-11-24 | GitHub API repo `LICENSE` SPDX check | High |
| `R03-S10` | R03 | Kraken Spot WebSocket v2 Official Docs (`trade` direct `side`, `book` L2 CRC32, `level3` auth) + Live US-IP Probes | https://docs.kraken.com/api/docs/websocket-v2/trade | 2026-11-24 | Direct `read_url_content` primary docs + live REST/WS call | High |
| `R03-S11` | R03 | `btschwertfeger/python-kraken-sdk` GitHub Repository License (Apache-2.0) | https://github.com/btschwertfeger/python-kraken-sdk | 2026-11-24 | GitHub API repo `LICENSE` SPDX check | High |
| `R03-S12` | R03 | Hyperliquid WebSocket Docs (`trades`, `l2Book` Jun 2026 throttling, `l2` diffs, US Terms restriction) + Live US-IP Probes | https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket | 2026-11-24 | Read primary docs + live `/info` & WS call (US IP) | High |
| `R03-S13` | R03 | `hyperliquid-dex/hyperliquid-python-sdk` GitHub Repository License (MIT) | https://github.com/hyperliquid-dex/hyperliquid-python-sdk | 2026-11-24 | GitHub API repo `LICENSE` SPDX check | High |
| `R03-S14` | R03 | Alpaca Market Data API Documentation & FAQ (Basic Free IEX ~2.5% vs Algo Trader Plus $99/mo SIP, 200 req/min, 30 WS symbols, trade fields) | https://docs.alpaca.markets/us/docs/about-market-data-api | 2026-11-24 | Direct `read_url_content` primary docs + FAQ verification | High |
| `R03-S15` | R03 | `alpacahq/alpaca-py` GitHub Repository License (Apache-2.0) | https://github.com/alpacahq/alpaca-py | 2026-11-24 | GitHub API repo `LICENSE` SPDX check | High |
| `R03-S16` | R03 | Massive (formerly Polygon.io, rebranded Oct 30, 2025) Pricing & Futures GA (May 2026) Documentation | https://massive.com/pricing | 2026-11-24 | Direct `read_url_content` primary pricing page + search verification | High |
| `R03-S17` | R03 | `massive-com/client-python` GitHub Repository License (MIT; verified redirect from `polygon-io/client-python`) | https://github.com/massive-com/client-python | 2026-11-24 | GitHub API repo `LICENSE` SPDX check | High |
| `R03-S18` | R03 | Twelve Data Pricing (8 credits/min, 800/day, 8 trial WS credits) & `twelvedata/twelvedata-python` License (MIT) | https://twelvedata.com/pricing | 2026-11-24 | Primary pricing check + GitHub API SPDX check | High |
| `R03-S19` | R03 | Tiingo Pricing (Starter 50/hr, 1,000/day, 500 symbols/mo; Power $30/mo) & `hydrosquall/tiingo-python` License (MIT) | https://www.tiingo.com/about/pricing | 2026-11-24 | Primary pricing check + GitHub API SPDX check | High |
| `R03-S20` | R03 | Financial Modeling Prep (FMP) Pricing Plans (Basic 250 calls/day, 500 MB / 30d; Starter $29/mo) | https://site.financialmodelingprep.com/pricing-plans | 2026-11-24 | Primary pricing URL status check + docs verification | High |
| `R03-S21` | R03 | EODHD Pricing (20 weighted calls/day free; $19.99–$99.99/mo paid) & Python Library License (MIT) | https://eodhd.com/pricing | 2026-11-24 | Primary pricing check + GitHub API SPDX check | High |
| `R03-S22` | R03 | Finnhub Pricing & API Limits (60 calls/min, 30/sec hard cap, paywalled candles) & `Finnhub-Stock-API/finnhub-python` License (Apache-2.0) | https://finnhub.io/pricing | 2026-11-24 | Primary pricing check + GitHub API SPDX check | High |
| `R03-S23` | R03 | Alpha Vantage Pricing & Free Tier Limits (25 req/day, 5/min) & `RomelTorres/alpha_vantage` License (MIT) | https://www.alphavantage.co/premium/ | 2026-11-24 | Primary pricing check + GitHub API SPDX check | High |
| `R03-S24` | R03 | Yahoo Terms of Service (automated scraping & database bans; Nov 2026 C&D enforcement) & `ranaroussi/yfinance` License (Apache-2.0 code only) | https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html | 2026-11-24 | Primary ToS URL check + GitHub API SPDX check | High |
| `R03-S25` | R03 | Stooq Historical Database & Live Keyless CSV Probe (2026 CAPTCHA/API-key JS wall verified live) | https://stooq.com/db/h/ | 2026-11-24 | Live HTTP probe of `stooq.com/q/d/l/?s=spy.us&i=d` + docs | High |
| `R03-S26` | R03 | Databento Pricing ($125 free credits, 6-mo expiry; CME Standard $199/mo eff. Jun 22, 2026) & `GLBX.MDP3` Dataset Docs | https://databento.com/docs/datasets/glbx-mdp3 | 2026-11-24 | Direct `read_url_content` pricing + docs verification | High |
| `R03-S27` | R03 | Databento Open-Source Repositories (`databento/dbn`, `databento/databento-rs`, `databento/databento-python` — Apache-2.0) | https://github.com/databento/dbn | 2026-11-24 | GitHub API repo `LICENSE` SPDX checks (all 3 repos) | High |
| `R03-S28` | R03 | dxFeed `dxFeed/dxLink` GitHub Repo (MPL-2.0) + Live Demo Probes (`demo.dxfeed.com/webservice/rest` 15m delay; `wss://demo.dxfeed.com/market-data/dxlink-ws` HTTP 101) | https://github.com/dxFeed/dxLink | 2026-11-24 | GitHub API SPDX check + live REST/WS probes | High |
| `R03-S29` | R03 | Interactive Brokers TWS API Official Documentation (Market data lines, 50 req/s, 5 tick-by-tick / 3 L2 depth caps, historical pacing, CME Rule 576, Aug 2026 v10.49+ GPL transition) | https://www.interactivebrokers.com/docs/tws-api/doc/introduction | 2026-11-24 | Primary docs URL check + official TWS API spec verification | High |
| `R03-S30` | R03 | Clean-Room FOSS IBKR Socket Clients (`wboayue/rust-ibapi` MIT; `ib-api-reloaded/ib_async` BSD-2-Clause) | https://github.com/wboayue/rust-ibapi | 2026-11-24 | GitHub API repo `LICENSE` SPDX checks (both repos) | High |
| `R03-S31` | R03 | Dukascopy `.bi5` Historical Tick Feed Live Binary Unpack (`EURUSD/2026/09/15/12h_ticks.bi5`, 9,686 ticks `>3I2f`) + `Leo4815162342/dukascopy-node` License (MIT) | https://datafeed.dukascopy.com/datafeed/EURUSD/2026/09/15/12h_ticks.bi5 | 2026-11-24 | Live HTTP download + Python LZMA/struct decode + GitHub SPDX check | High |
| `R03-S32` | R03 | TrueFX (Integral Development Corp.) Historical Tick Data & Internal-Use Clickwrap Terms | https://www.truefx.com/ | 2026-11-24 | Primary site URL check + Terms verification | Medium |
| `R03-S33` | R03 | HistData.com Detailed File Specification (`Generic ASCII → Tick Data`, zero volume, timezone/DST & pre-2009 Bid/Ask audit) | https://www.histdata.com/f-a-q/data-files-detailed-specification/ | 2026-11-24 | Primary FAQ URL check + empirical audit citations | High |
| `R03-S34` | R03 | CME Group Market Data Fee List (Jan 2026 / Jan 2027) & Information License Agreement (ILA / Schedule 5 / DS-45 Sept 2026) | https://www.cmegroup.com/market-data/distributor/market-data-fees.html | 2026-11-24 | Indexed primary CME PDF text + cross-verified against IBKR/NinjaTrader/AMP 2026 schedules *(direct PDF download returned HTTP 403 to scripted fetch — see §10.2)* | Medium |
| `R03-S35` | R03 | Lee, C. M. C., & Ready, M. J. (1991), "Inferring Trade Direction from Intraday Data", *Journal of Finance*, 46(2), 733–746 | https://doi.org/10.1111/j.1540-6261.1991.tb02683.x | 2026-11-24 | Verified primary journal citation & DOI | High |
| `R03-S36` | R03 | Ellis, K., Michaely, R., & O'Hara, M. (2000), "The Accuracy of Trade Classification Rules: Evidence from Nasdaq", *JFQA*, 35(4), 529–551 | https://doi.org/10.2307/2676254 | 2026-11-24 | Verified primary journal citation & DOI | High |
| `R03-S37` | R03 | Chakrabarty, B., Li, B., Nguyen, V., & Van Ness, R. A. (2007), "Trade classification algorithms for electronic communications network trades", *Journal of Banking & Finance*, 31(12), 3806–3821 | https://doi.org/10.1016/j.jbankfin.2007.03.003 | 2026-11-24 | Verified primary journal citation & DOI | High |
| `R03-S38` | R03 | Chakrabarty, B., Moulton, P. C., & Shkilko, A. (2012), "Short sales, long sales, and the Lee–Ready trade classification algorithm revisited", *Journal of Financial Markets*, 15(4), 467–491 | https://doi.org/10.1016/j.finmar.2012.01.001 | 2026-11-24 | Verified primary journal citation & DOI | High |
| `R03-S39` | R03 | Holden, C. W., & Jacobsen, S. (2014), "Liquidity Measurement Problems in Fast, Competitive Markets: Expensive and Cheap Solutions", *Journal of Finance*, 69(4), 1747–1785 | https://doi.org/10.1111/jofi.12127 | 2026-11-24 | Verified primary journal citation & DOI | High |
| `R03-S40` | R03 | Easley, D., López de Prado, M. M., & O'Hara, M. (2012), "Flow Toxicity and Liquidity in a High-frequency World", *Review of Financial Studies*, 25(5), 1457–1493 | https://doi.org/10.1093/rfs/hhs053 | 2026-11-24 | Verified primary journal citation & DOI | High |
