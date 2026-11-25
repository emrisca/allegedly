---
title: Logged Assumptions & Defaults
type: charter
status: active
owner: orchestrator
updated: 2026-11-24
code_refs: []
---

# Logged Assumptions & Phase 0 Defaults

> Work never stalls waiting on Round 1 answers. Every active default below is tied to a question in [[Questions-For-Abel]]. If Abel overrides any row, update status to `overridden`, record the delta, and propagate to affected research tracks.

| ID | Linked Question | Logged Default | Status | Blast Radius if Changed |
|---|---|---|---|---|
| **A01** | [[Questions-For-Abel\|Q1]] | **Platform Scope (`2026-11-24`, Abel):** Support **macOS (Apple Silicon + Intel)** and **Windows 10/11** for `v0.1`–`v1.0` (macOS Apple Silicon primary dev OS, Windows validated via CI/VM); **Linux (X11/Wayland) deferred to future post-v1.0 milestone**. | `locked-by-abel` | Removes Linux WebKitGTK (`RK-01`) as v1.0 blocker; simplifies CI & packaging to macOS `.dmg` + Windows `.msi`/NSIS (`WebView2`) |
| **A02** | [[Questions-For-Abel\|Q2]] | Instrument priority: 1) CME Futures + 2) Crypto (spot/perps free L2/tick WS) → 3) US Equities → 4) Spot FX. | `accepted-default` | R03/R04 provider ranking, R05 order-flow defaults, session calendar priority |
| **A03** | [[Questions-For-Abel\|Q3]] | Zero pre-existing paid entitlements assumed; audit all 8 prop firms strictly on primary rulebooks; paper/sandbox only. | `accepted-default` | R04 broker/prop priority order, S06 sandbox broker selection |
| **A04** | [[Questions-For-Abel\|Q4]] | Strictly `$0` budget for core, research, and dev; paid feeds & signing certs documented as optional with `$0` alternatives. | `accepted-default` | R02 signing/update plan, R03 free-tier fallback ladder |
| **A05** | [[Questions-For-Abel\|Q5]] | v0.1 vertical slice is Charting + Order-Flow first; paper/broker execution begins in v0.2. | `accepted-default` | Phase 4 MVP epic ordering & critical path |
| **A06** | [[Questions-For-Abel\|Q6]] | AI-agent execution of single-session stories with ~5–10 hrs/week of Abel's review & domain sign-off. | `accepted-default` | Phase 4 story granularity, automated test harness investment |
| **A07** | [[Questions-For-Abel\|Q7]] | Public FOSS (`Apache-2.0`, `emrisca/allegedly`); Desktop-only through v1.0 (**macOS + Windows first**; Linux & mobile/tablet deferred to post-v1.0). | `locked-by-abel` | R02 platform/CI matrix, R09 license & trademark rigor |
| **A08** | [[Questions-For-Abel\|Q8]] | Section 0.1 co-located repo layout at `/Users/abelmora/Documents/Obsidian/Allegedly`; spikes kept in-repo at `spikes/S01-…/`. | `accepted-default` | Vault hygiene exclusions, git repo layout, Phase 2 spike paths |
| **A09** | Brand / [[R09-Legal-Licensing]] | Project renamed to **Allegedly** (*"Allegedly a trading terminal."*), vault/repo root at `/Users/abelmora/Documents/Obsidian/Allegedly`; formal trademark clearance deferred to pre-public release. | `locked-by-abel` | Brand assets, crate/package names, public repo slug |
| **A10** | UI Stack / [[R02-Shell-UI-Stack]] | Adopt **`ui-sdk`** (`@ui-sdk/react` & `@ui-sdk/core`, `Apache-2.0`, https://ui-sdk.dev/docs, React 19+) per root `AGENTS.md` for future React UI development (shadcn/Radix retained as beta fallback). | `locked-by-abel` | Phase 3 UI architecture & Phase 4 frontend stories |
