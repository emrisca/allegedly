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
| **A01** | [[Questions-For-Abel\|Q1]] | Primary dev/trading OS: macOS Apple Silicon (`arm64`, verified macOS 26.6.2); Linux (X11/Wayland, multi-distro) & Windows 10/11 validated via local VMs + CI. | `accepted-default` | Spike S01/S04 test harness setup; CI runner selection |
| **A02** | [[Questions-For-Abel\|Q2]] | Instrument priority: 1) CME Futures + 2) Crypto (spot/perps free L2/tick WS) → 3) US Equities → 4) Spot FX. | `accepted-default` | R03/R04 provider ranking, R05 order-flow defaults, session calendar priority |
| **A03** | [[Questions-For-Abel\|Q3]] | Zero pre-existing paid entitlements assumed; audit all 8 prop firms strictly on primary rulebooks; paper/sandbox only. | `accepted-default` | R04 broker/prop priority order, S06 sandbox broker selection |
| **A04** | [[Questions-For-Abel\|Q4]] | Strictly `$0` budget for core, research, and dev; paid feeds & signing certs documented as optional with `$0` alternatives. | `accepted-default` | R02 signing/update plan, R03 free-tier fallback ladder |
| **A05** | [[Questions-For-Abel\|Q5]] | v0.1 vertical slice is Charting + Order-Flow first; paper/broker execution begins in v0.2. | `accepted-default` | Phase 4 MVP epic ordering & critical path |
| **A06** | [[Questions-For-Abel\|Q6]] | AI-agent execution of single-session stories with ~5–10 hrs/week of Abel's review & domain sign-off. | `accepted-default` | Phase 4 story granularity, automated test harness investment |
| **A07** | [[Questions-For-Abel\|Q7]] | Public FOSS standards from day one; Desktop-only through v1.0 (mobile/tablet out of scope for v1.0). | `accepted-default` | R02 mobile weightings, R09 license & trademark rigor |
| **A08** | [[Questions-For-Abel\|Q8]] | Section 0.1 co-located repo layout at `/Users/abelmora/Documents/Obsidian/Allegedly`; spikes kept in-repo at `spikes/S01-…/`. | `accepted-default` | Vault hygiene exclusions, git repo layout, Phase 2 spike paths |
| **A09** | Brand / [[R09-Legal-Licensing]] | Project renamed to **Allegedly** (*"Allegedly a trading terminal."*), vault/repo root at `/Users/abelmora/Documents/Obsidian/Allegedly`; formal trademark clearance deferred to pre-public release. | `locked-by-abel` | Brand assets, crate/package names, public repo slug |
