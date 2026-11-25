---
title: Phase 0 Questions for Abel (Design-Tree Frontier — Round 1)
type: decision-gate
status: awaiting-abel
round: 1
owner: orchestrator
updated: 2026-11-24
code_refs: []
---

# Phase 0 Questions for Abel — Round 1 Frontier

> Formatted per `grill-with-docs` (`grilling` skill). Every question is worded so **"yes"** accepts the recommended default.
> **Non-blocking:** All defaults are logged in [[Assumptions]] so Phase 1 research runs immediately; any override from you reshapes downstream tracks and Round 2 before Phase 3 architecture locks.

---

❓ **Q1** - **Primary OS & Cross-Platform Verification Path**: We verified your dev machine is **macOS 26.6.2 (Apple Silicon `arm64`)** with `git`, `node`, `pnpm`, `cargo`/`rustc`, `python3`, `uv`, and `gh` already installed. Should we treat **macOS Apple Silicon** as your primary daily-driver OS, while verifying **Linux (X11 + Wayland, incl. a non-Ubuntu distro)** and **Windows 10/11** via local VMs and GitHub Actions CI matrices?

➡️ **Resolved by Abel (`2026-11-24`):** Support **macOS** (primary dev OS) and **Windows 10/11** for now (`v0.1`–`v1.0`); defer **Linux** to a future post-v1.0 milestone.

---

❓ **Q2** - **Target Instruments & Priority Order**: Which asset classes matter most for Allegedly, and in what order should we optimize data pipelines, session calendars, and order-flow tools?
- **Option A (Recommended):** `1. Futures (CME index/metals/energy: ES/MES, NQ/MNQ, GC, CL)` + `2. Crypto (spot & perpetuals via free public tick + L2 WebSockets as our zero-cost full-depth reference feed)` → `3. US Equities` → `4. Spot FX`
- **Option B:** Crypto-first only (defer CME futures calendars & tick rules)
- **Option C:** US Equities + Options first

➡️ Yes — Option A: Futures + Crypto first (using free public Crypto L2/tick feeds to prove order-flow at $0 while designing the core engine around strict CME Futures tick/session rules), followed by US Equities and Spot FX.

---

❓ **Q3** - **Prop Firms, Funded Accounts & Existing Data Entitlements**: For [[R04-Execution-Brokers-Props]] and [[R03-Market-Data]], do you currently hold any funded/eval prop accounts or paid market-data feeds (e.g., Topstep/ProjectX, Apex/Tradovate/Rithmic, IBKR, Databento) that should be prioritized — or should we assume **zero existing paid entitlements** and audit all 8 listed prop firms strictly on published API/automation legality (paper/sandbox only)?

➡️ Yes — assume no paid entitlements are required for the plan, audit all 8 prop firms (Topstep, Apex, Take Profit Trader, My Funded Futures, Tradeify, Bulenox, Lucid, Elite Trader Funding) against primary rulebooks, and mark any firm that forbids custom/third-party clients as `DO-NOT-BUILD`.

---

❓ **Q4** - **Hard Budget Ceiling**: Non-negotiable #2 requires a **$0 core**. What is your personal hard budget ceiling for optional personal data feeds, dev infrastructure, or distribution costs (e.g., Apple Developer $99/yr for macOS notarization, or pay-as-you-go Databento credits for historical CME MBO/tick testing)?
- **Option A (Recommended):** **$0 strict** for core + development/research; optional BYO paid data feeds supported only as user-supplied plugins; document $0 vs paid code-signing options honestly in R02 without committing spend now.
- **Option B:** Small one-time/annual budget OK (e.g., up to $100–$200/yr for signing certs + Databento historical test data).

➡️ Yes — Option A: strictly $0 for all core, dev, and research phases; treat paid feeds and paid signing certificates as explicitly optional and documented with $0 alternatives.

---

❓ **Q5** - **v0.1 MVP Spine — Charting & Order-Flow First vs. Execution First**: For the v0.1 vertical slice, should we prove **Charting + Order-Flow first** (real tick/L2 ingest → 60fps candles + 1 order-flow study [Footprint or Volume Profile] + 1 drawing tool + 1 indicator + local save/load layout) and defer **Paper/Broker Order Execution** to v0.2?

➡️ Yes — Charting + Order-Flow first in v0.1 (prove rendering performance, tick fidelity, and local persistence end-to-end), then add paper/sandbox bracket & OCO execution in v0.2.

---

❓ **Q6** - **Your Coding Comfort Level, Weekly Time Budget & Build Model**: How hands-on do you plan to be during implementation? Should we size the Phase 4 roadmap assuming **AI coding agents implement single-session stories** while you spend **~5–10 hours/week** reviewing architecture, running local checks, and steering UX/trading accuracy?

➡️ Yes — design the roadmap for agent-executed, single-session stories with strict automated verification (unit + golden-file indicator diffs + replay + Playwright), with ~5–10 hrs/week of your review and trading-domain sign-off.

---

❓ **Q7** - **Open-Source Community Ambitions & Mobile/Tablet Scope**: Should we plan Allegedly as a **public FOSS project from day one** (clean-room discipline, strict license hygiene, trademark-safe rename options evaluated in R09) while keeping **v0.1–v1.0 strictly Desktop-only** (macOS, Windows, Linux — treating mobile/tablet as explicitly out-of-scope for v1.0)?

➡️ **Resolved by Abel (`2026-11-24`):** Public FOSS (`Apache-2.0`, `emrisca/allegedly`), Desktop-only (**macOS + Windows** through v1.0; Linux and mobile/tablet deferred to future milestones).

---

❓ **Q8** - **Vault/Repo Root & Spike Code Location**: Two environment details we verified on your Mac:
1. `/Users/abelmora/Documents/Obsidian/` currently holds `.obsidian/` (Obsidian is open on it right now), while `Allegedly/` is a subfolder inside it; Desktop & Documents iCloud sync is **OFF** (verified `0` `.icloud` files).
2. Prompt Section 0.1 puts spikes inside the repo at `spikes/S01-…/`, whereas Section 6 mentions `~/Documents/Projects/allegedly-spikes/`.

Should we: (a) keep the **Section 0.1 root layout** (`00-Start-Here.md`, `01-Charter/…99-Meta/` alongside `apps/`, `crates/`, `packages/`, `plugins/`), (b) keep runnable spikes **inside the repo at `spikes/S01-…/`** so one git history holds plan + spikes, and (c) keep `Allegedly` as a git repo inside `/Users/abelmora/Documents/Obsidian/Allegedly` (with Obsidian's `Excluded files` updated by you in Obsidian Settings)?

➡️ Yes — use the Section 0.1 co-located layout, keep runnable spikes inside `spikes/S01-…/` in the same git repo, and keep `/Users/abelmora/Documents/Obsidian/Allegedly` as the git root (adding build exclusions in Obsidian Settings before any `pnpm install` / `cargo build`).
