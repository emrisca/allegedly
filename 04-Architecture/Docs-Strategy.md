---
title: "Allegedly Four-Audience Documentation & Knowledge Strategy"
type: architecture
status: draft-for-red-team
phase: Phase 3
owner: architect
updated: 2026-11-24
code_refs:
  - AGENTS.md
  - 01-Charter/Glossary.md
  - 01-Charter/Constraints.md
  - 01-Charter/Principles.md
---

# Documentation Strategy (Four-Audience System)

> **Core Rule:** Allegedly's documentation is **100% clean-room authored** (zero copied prose, screenshots, or API tables from TradingView, MotiveWave, or Sierra Chart — [[Constraints]] #1, [[Compliance-Notes]] §3), hosted at **`$0`** via static FOSS tooling, **accessible completely offline** inside the local terminal ([[Constraints]] #3, [[Principles]] P1), and anchored to canonical [[Glossary]] terminology. All CI automation gates below take effect in **`v0.1` Implementation CI (post-Phase-5)** (Charter Phases 0–5 are PLAN-ONLY).

---

## 1. Documentation Principles & `$0` Delivery Pipeline

1. **Docs-as-Code in the Same Repository:** All user guides, settings references, Study SDK manuals, and contributor ADRs live as plain Markdown/MDX files in `emrisca/allegedly` (`Apache-2.0`), versioned with the exact software release they describe.
2. **Dual-Target Zero-Cost Delivery (`$0`):**
   - **Public Web Site:** Static site built in GitHub Actions and deployed to **GitHub Pages (`$0`)** using a permissive FOSS static generator (**Astro Starlight**, `MIT`, or **VitePress**, `MIT` — zero proprietary doc SaaS, zero analytics trackers).
   - **Offline Local Bundle:** The same compiled static docs + offline search index (Pagefind, `MIT`) ship as an optional compressed local bundle (`~1–2 MB` target, excluded from hot memory until opened) so a trader in an isolated offline environment (`SV-01`) can open the full **Settings Reference**, **Order-Flow Math Formulas**, **Keyboard Shortcut Map**, and **Study SDK Docs** with zero internet access.
3. **Single Source of Truth for Generated Docs:** Settings tables, keyboard shortcut tables, typed error codes, and Luau/Wasmtime host API bindings are **auto-generated in `v0.1` Implementation CI** from Rust schemas and checked with `git diff --exit-code` so documentation can never drift behind code.
4. **Canonical Terminology Gate:** A lightweight CI lint checks user-facing docs for prohibited ambiguous terms listed in [[Glossary]] (e.g., flagging *Market Profile* when referring to **TPO Profile**, *ATM strategy* instead of **Bracket Order**, or unqualified *tick* where *price tick* vs. *trade tick* matters) and blocks vendor trademark misuse (`Pine Script®` nominative disclaimer enforced per [[Compliance-Notes]] §2).

---

## 2. The Four-Audience Documentation System

### Audience 1: Traders & End Users (Offline Local Help + `$0` Static Site)

Designed for active futures, crypto, equities, and FX traders who want transparent order-flow tooling without SaaS paywalls or black-box math.

| Section | Required Content | Key Constraints / Evidence Anchors |
|---|---|---|
| **`$0` Quickstart Guide** | 5-minute zero-signup onboarding: (1) install macOS `.dmg` (Homebrew Cask / `xattr` guide) or Windows `.msi` (SignPath-signed once public); (2) stream live `$0` **Kraken Spot WS v2** & **Coinbase Advanced Trade WS** with **Footprint Bars**, **Volume Profile**, and **DOM Ladder**; (3) record & replay locally via `.atvault` / Hive Parquet; (4) import offline CME `GLBX.MDP3` `.dbn.zst` files using Databento's `$125` free credits; (5) practice execution in the **Local Paper Simulator** (`v0.1` / `v0.2+`). | [[R03-Market-Data]] §4 & §7, [[S05-Live-Ingest-TickVault]], [[S06-OMS-Paper-Execution]] |
| **Honest Data Provenance Guide** | Plain-English explanation of Allegedly's **5-tier Provenance badges** (`EXACT: L3-MBO`, `EXACT: TICK-AGGR`, `ESTIMATED: L1-QUOTE`, `ESTIMATED: TICK-RULE`, `SYNTHETIC: 1m-INTRABAR`), why real-time CME & 100% US Equities SIP cannot be free (`R03` Brutal Truths), why Alpaca Basic (`feed=iex` ~2.5% volume) and Dukascopy OTC FX quotes lock Footprint Delta behind explicit opt-in, and published **Lee-Ready / Tick-Rule misclassification bounds** (`19%–33%` US equity/burst error; `12.3%–13.4%` even on tight-spread crypto in `S05`). | [[Constraints]] #8, [[Principles]] P5, [[R03-Market-Data]] §3 & §5, [[S05-Live-Ingest-TickVault]] §3.6 & §4 |
| **Order-Flow Math & Formula Reference** | Exact transparent integer (`i64`/`i128`) formulas for **Footprint Bar** bid/ask binning, diagonal **Imbalance** ratios (`Bps`), **Volume Profile** POC/VAH/VAL (`70%` value-area algorithm), `u128` / multi-word bitmask **TPO Profile** Initial Balance / single prints / splitting, `i128` centered session VWAP & `±σ` bands, and explicit false-positive disclosures for L2 **DOM Ladder** `HEURISTIC` PIQ (`[Est / Max]`), iceberg, and liquidity-pull markers (`SV-11`). | [[Principles]] P5 & P6, [[R05-Orderflow-Profile-Tooling]], [[S08-Storage-100M-Replay]] |
| **Keyboard-First & Control Guide** | Complete default shortcut map (`Cmd/Ctrl+K` Command Palette `@symbol`, `/study`, `>setting`, `#template`; `Alt+1..9` study templates; `Shift+X` / `Shift+F12` cancel/flatten), guarded price-axis scaling vs. modifier-key order staging (`SV-15`), domain-separated `Cmd/Ctrl+Z` undo (`SV-16`), and `keymap.toml` customization + conflict diagnostics (`SV-18`). | [[Principles]] P2 & P8, [[R10-UX-Teardown-Control-Model]] |
| **Troubleshooting & Zero-Telemetry Diagnostics** | How to read `BookState::Stale` (*"FEED STALE — RISK-REDUCING EXITS ONLY"*) / `RECONCILING` badges, verify OS Keychain storage, and use **Export Redacted Diagnostic Bundle (`.zip`)** when filing issues (see [[Error-Observability]]). | [[Error-Observability]] §3 |

---

### Audience 2: Schema-Generated Settings Reference (`Constraints` #6)

Per [[Constraints]] #6 (*"Every meaningful default is exposed, documented, overridable per-chart AND globally, scriptable, diffable, and version-controlled"*) and [[Principles]] P4 (*5-Level Property Cascade*), Allegedly never hand-maintains settings tables.

- **Single Source of Truth:** Rust configuration structs (`GlobalConfig`, `WorkspaceConfig`, `TemplateConfig`, `PaneConfig`, `StudyConfig`, `KeymapConfig`, `ThemeConfig`) derive `schemars::JsonSchema` (`MIT`) with doc-comments and custom metadata attributes (`#[setting(tier = 1|2|3, cascade = "...", blast_radius = "...")]`).
- **Automated CI Generator (`allegedly-docgen`, dev-only workspace tool — excluded from production runtime binaries):**
  1. Emits canonical versioned **JSON Schema** files (`schemas/v1/workspace.schema.json`, `analysis.schema.json`, `template.schema.json`, `keymap.schema.json`, `theme.schema.json`) enabling IDE autocomplete/validation for users editing `workspace.toml`, `analysis.toml`, `template.toml`, `keymap.toml`, and `theme.toml` directly in VS Code or Neovim.
  2. Drives the in-app **Right Property Inspector** (`320 px`, 4 invariant tabs, `Modified Only` pill, 1-click `Reset to Inherited`) and `@tanstack/virtual` searchable **Settings Tree**.
  3. Renders complete **Markdown Settings Reference** pages listing every key's:
     - Canonical TOML path (e.g., `studies.footprint.imbalance_ratio_bps`)
     - Exact type & unit (`i32` basis points, `i64` price ticks — zero ambiguous floats)
     - Default value & valid range
     - **5-Level Cascade Scope** (`Global Defaults → Workspace → Template → Chart Pane → Study/Drawing Instance`)
     - **UI Disclosure Tier** (`Tier 1` micro-toolbar `<= 5` controls, `Tier 2` Inspector, or `Tier 3` `theme.toml` token)
     - **Blast Radius** (e.g., *visual repaint only*, *triggers VRVP segment-tree rebuild*, *requires Provider reconnect*, *modifies OMS pre-trade risk limit*).

---

### Audience 3: Study & Plugin Authors (`Luau` + `Wasmtime` SDK Guide)

Backed directly by [[S07-Scripting-Sandbox]] empirical verdicts:

1. **Three-Tier Study Architecture Guide:**
   - **Tier 1 — Native Rust (`allegedly-studies`, `v0.1`):** For built-in zero-overhead **Studies** (`1.625 ms` / `100k` bars, `0.083 µs` live p99 in `S07`), tested against `TA-Lib v0.8.3` (`BSD-3-Clause`) CI golden vectors.
   - **Tier 2 — Wasmtime WASM Plugins (`wasmtime v51.0.0`, `v0.2`):** For high-performance community/proprietary plugins written in Rust, Zig, AssemblyScript, or C/C++ compiled to `wasm32-unknown-unknown` (`1.679 ms` / `100k` bars = `+3.32%` vs native, `0.084 µs` live p99). Documents the host ABI, fixed-point `i64` bar/tick structs, fuel budgets, and `64 MiB` `StoreLimits` ceiling.
   - **Tier 3 — Zero-Toolchain In-App Luau Scripting (`mlua v0.12.3` + `luau0-src`, `v0.3`):** For instant edit-and-run user scripts inside the terminal (`1.48 ms` cold start, `1.33 µs` live p99, `10.05×` faster than Rhai in `S07`). Documents Luau gradual static type annotations, standard `ta.*` math helpers, and sandbox caps (`16–32 MiB` recommended production per-script cap + instruction interrupt).
2. **Sandbox Security & Determinism Contract:**
   - Explicitly documents **zero ambient capabilities** (no filesystem, no network, no environment variables, no wall-clock nondeterminism — verified across `12/12` hostile tests in `S07`).
   - Documents **MTF Non-Repainting & Intrabar Rollback Rules:** Higher-timeframe series expose only strictly closed bars (`htf_close_ts <= base_bar_ts`), and intrabar live ticks execute against a snapshotted state rolled back cleanly before bar close (`100%` bit-identical across `15,000` MTF bars + `500` noisy rollback bars in `S07`).
   - Documents **100% Replay Determinism (`SV-09`):** How **Studies** consume integer tick/lot inputs so `1×`, `10×`, and batch replays match SHA-256 bit-for-bit (`S08`).
3. **Clean-Room Pine-Inspired Migration Notes (`v0.4+`):**
   - Explains conceptual equivalents between series-oriented **Study** scripting and Allegedly's Luau / clean-room DSL **without** copying any TradingView Pine Script® documentation prose, built-in source code, or examples.
   - Carries the mandatory factual nominative disclaimer ([[Compliance-Notes]] §2): *"Clean-room series-oriented scripting — independent open-source project, not affiliated with or endorsed by TradingView, Inc. Pine Script® is a registered trademark of TradingView, Inc."*
   - States clearly that under Allegedly's **`Apache-2.0`** license, authors retain **100% ownership** of their private **Studies** and WASM plugins (no copyleft requirement to publish proprietary alpha).

---

### Audience 4: Contributors & AI Agents (Repo Governance & Guardrails)

Designed so both human engineers and coding agents land clean, compliant PRs on the first attempt:

| Artifact | Location | Purpose & Mandatory Contents |
|---|---|---|
| **Root Agent & Contributor Contract** | `AGENTS.md` | Authoritative machine- and human-readable rules: (1) **`ui-sdk` rules** (`@ui-sdk/react` & `@ui-sdk/core` exact-pinned `0.1.0-beta.17`, `Apache-2.0`, React 19+, install via `pnpm` — stop and ask if release-age policy blocks it; follow `ui-sdk` skill; read `node_modules/@ui-sdk/react/docs/llms.txt` before use; search `core.md` + read `rendering.md` when building new components; keep React out of `60 fps` charts & `30+ Hz` DOM hot paths); (2) **Platform scope** (macOS + Windows `v0.1`–`v1.0`, Linux future); (3) **`CARGO_TARGET_DIR` cache isolation** outside the Obsidian vault; (4) **Fixed-point `i64`/`i128` financial correctness** (zero floats); (5) **Execution safety** (`live_armed: false` default, zero live keys/orders in dev/tests). |
| **Canonical Domain Glossary** | `01-Charter/Glossary.md` | Single vocabulary source (`domain-modeling`) for crate names (`allegedly-*`), struct fields, IPC messages, UI labels, and docs. |
| **Numbered Architecture Decision Records** | `04-Architecture/ADRs/0001-*.md` … | Immutable decision trail with weighted matrices, reversal costs, revisit triggers, and spike evidence links so neither humans nor agents re-litigate locked decisions (`Apache-2.0`, `Allegedly`, macOS+Windows first, Tauri v2, LWC+WebGL2, Kraken+Coinbase+DBN, Wasmtime+Luau, Hive Parquet+SQLite). |
| **Clean-Room & License Compliance Guide** | `CONTRIBUTING.md` (derived from `06-Risk/Compliance-Notes.md` & `06-Risk/License-Registry.md`) | Mandatory **DCO 1.1 (`Signed-off-by:`)** sign-off, clean-room PR checklist (banning MotiveWave/TradingView/Sierra Chart reverse engineering or GPL/AGPL/BSL/TSL/proprietary code), `DO-NOT-BUILD` prop-firm denylist (`Apex`, `Take Profit Trader`, `Bulenox`, `Elite Trader Funding`, `Rithmic`, `CQG`), and Day-1 CI commands (`cargo-deny`, npm SPDX check, zero-float AST check, zero legacy `mv-`/`.mv` check). |

---

## 3. Documentation Maintenance & `v0.1` Implementation CI Gates (post-Phase-5)

| CI Gate | Trigger (`v0.1` Implementation CI, post-Phase-5) | Assertion |
|---|---|---|
| **`doc-schema-sync`** | Every PR touching `crates/*/src/config*` | Runs dev-only `allegedly-docgen` to regenerate JSON Schemas & Markdown Settings Reference; fails if unchecked diff exists. |
| **`doc-glossary-lint`** | Every PR touching `docs/**` or `04-Architecture/**` | Flags prohibited legacy names (`MotiveView`, `MotiveScript`, `mv-*`, `.mv*`) outside historical audit/lint-example sections and checks canonical [[Glossary]] terms. |
| **`doc-links-build`** | Every PR touching `docs/**` | Builds static FOSS docs site with strict broken-link failure (`0` dead internal links) and verifies offline bundle size stays `< 2 MB` compressed. |
| **`doc-license-notices`** | Release pipeline | Auto-generates `THIRD_PARTY_NOTICES.md` (`cargo-about` + npm SPDX bundler), verifying verbatim inclusion of TradingView Lightweight Charts `NOTICE` and SIL `OFL-1.1` font notices ([[License-Registry]] §2). |
