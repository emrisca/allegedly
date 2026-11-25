---
title: "ADR-0001: License, Brand, and Platform Scope"
type: adr
status: accepted
phase: Phase 3
owner: architect
updated: 2026-11-25
code_refs:
  - LICENSE
  - README.md
  - AGENTS.md
  - 06-Risk/License-Registry.md
  - 06-Risk/Compliance-Notes.md
---

# ADR-0001: License, Brand, and Platform Scope

> [!IMPORTANT]
> Legal, licensing, and trademark notes in this ADR are **engineering research, not legal advice**. Items marked `[ATTORNEY REVIEW REQUIRED]` must be cleared by qualified intellectual-property counsel before public `v0.1` marketing, trademark filing, or optional sidecar integration.

---

## 1. Context

Allegedly (*"Allegedly a trading terminal."*) is a local-first, `$0`-core, order-flow and charting desktop trading terminal (`[[01-Charter/Constraints]]`). Three foundational governance and boundary decisions must be locked before `v0.1` implementation scaffolding begins (post-Phase-5) because reversing any of them after initial public release carries high legal, ecosystem, or engineering cost:

1. **Software License & Dependency Boundary:** Allegedly's charter mandates **FOSS or die** (OSI-approved license, zero proprietary runtime dependencies, zero telemetry, `$0` core) while supporting a rich ecosystem of third-party `Study` plugins (`Wasmtime` / `Luau`), `Provider` adapters, and `Broker` connectors. The dependency graph contains multiple historical license traps (`TradingView Charting Library` proprietary, `HQChart` contradicted `Apache-2.0`, `dockview-enterprise` proprietary, official IBKR TWS API `v10.49+` transitioned to `GPL-3.0-or-later` on `2026-08-03`, `PineTS` `AGPL-3.0`, `pineforge-codegen-oss` non-FOSS `PineForge Source License 1.2`, `nautilus_trader v1.231.0` `LGPL-3.0-only`, `ArcticDB` `BSL 1.1`, `TimescaleDB` `TSL`, `vectorbt` `Commons Clause v1.0`, `Slint` `GPLv3`/proprietary, and Sierra Chart `.scid` docs removed `2026-10-13`).
2. **Product Brand & Trademark Hygiene:** The early working names `MotiveView` and `MotiveScript` collided directly with active USPTO registrations `MOTIVEWAVE` (`Reg. #3937578`, Serial `#85093420`, Silver Bullet Solutions Inc., Class `009`, renewed `2021-04-28`) and `TRADINGVIEW` (`Reg. #5632149`, Serial `#87902086`, TradingView, Inc., Class `042`), as well as `Pine Script®` (`RK-04`). On `2026-11-24`, the project owner locked the product name **Allegedly** (`emrisca/allegedly`, `A09`).
3. **Target Operating Systems (`v0.1`–`v1.0`):** Cross-platform desktop WebView stacks exhibit a stark stability split. macOS (`WKWebView`) and Windows 10/11 (`WebView2` Chromium) support reliable WebGL2 rendering and `$0` distribution/signing paths, whereas Linux (`WebKitGTK 2.54.3`) still exhibits systemic desktop blockers: no WebGPU, `AllowWebGLInWorkers` disabled by default, Wayland/NVIDIA `Error 71` protocol crashes, and `WEBKIT_DISABLE_DMABUF_RENDERER=1` SIGSEGV regressions on `2.52+` (`RK-01`).

---

## 2. Options & Weighted Criteria

### 2.1 License Selection Matrix

Criteria and weights are drawn directly from `[[02-Research/R09-Legal-Licensing]]` (scored `1.0` = poor to `5.0` = optimal):

| Criterion | Weight | `Apache-2.0` | `MIT` (Baseline) | `GPL-3.0-or-later` | `AGPL-3.0-or-later` |
|---|---:|---:|---:|---:|---:|
| Dependency & Linkage Compatibility (`Tauri`, `LWC`, `Arrow`, `Wasmtime`, `mlua`, `rust-ibapi`) | 25% | 5.0 | 5.0 | 4.5 | 4.0 |
| Plugin / `Study` / `Broker` Ecosystem Ergonomics | 25% | 5.0 | 5.0 | 2.5 | 2.0 |
| Patent Protection & Contribution Governance (no CLA required; DCO 1.1) | 20% | 5.0 | 2.5 | 5.0 | 5.0 |
| Anti-Closed-Fork Protection | 15% | 2.5 | 2.0 | 5.0 | 5.0 |
| `$0` OSS Signing (`SignPath Foundation`) & Institutional / Prop-Desk Adoption | 15% | 5.0 | 5.0 | 3.5 | 2.0 |
| **Weighted Total (out of 5.00)** | **100%** | **4.63** | **4.05** | **4.03** | **3.55** |

Key differentiators:
- **`Apache-2.0` (`4.63`, exact `4.625`)** matches the 100%-permissive core dependency tree, provides an explicit §3 patent grant with defensive patent retaliation (which `MIT` lacks), preserves clean DCO 1.1 onboarding without a heavy CLA, qualifies for `$0` Windows OV HSM code signing via the SignPath Foundation (`R02-S15`), and lets traders keep private alpha `Study` scripts and broker adapters confidential. Notably, `OpenBB` V5 reverted from `AGPL-3.0-only` back to `Apache-2.0` on `2026-09-29` (`commit #7489`, `R08-S02`/`R08-S03`) after copyleft adoption friction.
- **`MIT` (`4.05`)** is functionally compatible with all dependencies but drops `2.5` points on Patent & Governance due to the absence of an explicit patent grant and retaliation clause.
- **`GPL-3.0-or-later` (`4.03`, exact `4.025`)** chills third-party `Broker` adapters and proprietary user `Study` extensions (`2.5`), complicates macOS/Windows store and prop-desk legal review (`3.5`), and forces copyleft boundary policing around plugins.
- **`AGPL-3.0-or-later` (`3.55`, REJECTED)** solves a SaaS network-use loophole that a local-first desktop terminal does not have while triggering enterprise and prop-desk license blacklists (`2.0`).

### 2.2 Platform Scope Matrix (`v0.1`–`v1.0`)

| Criterion | Weight | Option A: macOS + Windows Only (`v0.1`–`v1.0`), Linux Post-`v1.0` | Option B: macOS + Windows + Linux Day-1 (`WebKitGTK`) | Option C: Single-OS (macOS Only) |
|---|---:|---:|---:|---:|
| Active Retail Trader Addressable Reach | 30% | 4.8 | 5.0 | 2.0 |
| WebView & WebGL2 Rendering Stability (`S02`, `RK-01`) | 30% | 4.8 | 2.0 | 5.0 |
| Solo/Small-Team Release, CI & `$0` Signing Feasibility | 25% | 4.7 | 2.5 | 5.0 |
| Future Cross-Platform Portability Cost | 15% | 4.5 | 5.0 | 3.0 |
| **Weighted Total (out of 5.00)** | **100%** | **4.73** | **3.48** | **3.80** |

### 2.3 Brand Resolution Summary

| Candidate | USPTO Class `009`/`042` Status | Domain / Market Conflicts | Verdict |
|---|---|---|---|
| `MotiveView` / `MotiveScript` (retired) | Direct collision with `MOTIVEWAVE` (`Reg. #3937578`, Class `009`) & `TRADINGVIEW` (`Reg. #5632149`, Class `042`); `Pine Script®` conflict (`RK-04`) | High likelihood of confusion in identical trading-software channels | **REJECTED / RETIRED** |
| **`Allegedly`** (`emrisca/allegedly`) | Preliminary `2026-11-24` public-index check: `0` active USPTO registrations/applications in Class `009` or `042`; `0` real trading terminals | 3 adjacent uses logged for counsel: `allegedly.market` (iOS parody meme-maker explicitly disclaiming being a trading platform), `allegedlyapp.com` (workplace feedback), `kyscott18/allegedly` (GitHub Solidity compiler) | **LOCKED (Owner Decision `A09`, pending `[ATTORNEY REVIEW REQUIRED]`)** |
| Clean-room R09 fallbacks (`Ordlith`, `Rungcraft`, `Cairntape`, `Tallyrung`, `Tickkiln`) | Preliminary clean-room screening in `[[02-Research/R09-Legal-Licensing]]` | Reserved only if counsel rejects `Allegedly` | **STANDBY FALLBACK** |

---

## 3. Decision

### 3.1 License, Governance, and Dependency Policy

1. **Primary License:** License Allegedly under **`Apache-2.0`** (`SPDX-License-Identifier: Apache-2.0`) with a root `LICENSE` and `NOTICE` file.
2. **Contributor Governance:** Use **Developer Certificate of Origin (`DCO 1.1`)** via `Signed-off-by:` trailers enforced in `v0.1` Implementation CI (post-Phase-5); do **not** require a Contributor License Agreement (CLA).
3. **Permissive Core Dependency Graph:** All statically linked Rust crates and bundled JavaScript/CSS/font assets in the core binary must use OSI-approved permissive licenses (`Apache-2.0`, `MIT`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Zlib`, `Unicode-3.0`, `OFL-1.1` for fonts, Public Domain SQLite). Verified core stack (`[[06-Risk/License-Registry]]`):
   - Shell & UI: `tauri v2.12.7` (`Apache-2.0 OR MIT`), `lightweight-charts v5.3.0` (`Apache-2.0`, preserving mandatory `NOTICE`: `TradingView Lightweight Charts™ · Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/`), `react v19.3.1` (`MIT`), `@ui-sdk/react` & `@ui-sdk/core` `0.1.0-beta.17` (`Apache-2.0`), `dockview` / `dockview-core` / `dockview-react` `v8.9.1` (`MIT`), `tailwindcss v4.3.5` (`MIT`), `zustand v5.1.0` (`MIT`), `lucide-react v1.79.0` (`ISC`), `JetBrains Mono v2.304` & `Inter v4.1` (`OFL-1.1`).
   - Core Engine, Storage, Sandbox, Observability & Connectivity: `rtrb v0.4.1` (`Apache-2.0 OR MIT`), `rusqlite v0.43.0` (`MIT` + Public Domain SQLite), `arrow-rs` / `parquet v60.2.0` (`Apache-2.0`), `databento/dbn v0.75.0` (`Apache-2.0`), `wasmtime v51.0.0` (`Apache-2.0 WITH LLVM-exception`), `mlua v0.12.3` + `luau0-src` (`MIT`), `keyring-rs v4.2.0` (`MIT OR Apache-2.0`), `barter-rs v0.2.1` (`MIT`), `wboayue/rust-ibapi v5.7.0` (`MIT`), `thiserror v2.0.21` (`MIT OR Apache-2.0`), `tracing` / `tracing-subscriber` / `tracing-appender` (`MIT`), `schemars v1.2.3` (`MIT`), `cargo-deny v0.22.1` (`MIT OR Apache-2.0`), and `TA-Lib v0.8.3` (`BSD-3-Clause`, CI parity oracle only).
4. **Hard-Disqualified Dependencies (`RK-05`, `KC-04`):** Permanently block in `v0.1` Implementation CI (post-Phase-5) (`deny.toml` + npm SPDX allowlist): `TradingView Charting Library` (proprietary), `HQChart` (`Apache-2.0` contradicted by `用户协议.txt`), `dockview-enterprise` (proprietary), `Slint` (`GPLv3`/proprietary), official IBKR TWS API `v10.49+` (`GPL-3.0-or-later`), `flowsurface` (`GPL-3.0-or-later`), `PineTS` (`AGPL-3.0`), `OpenPineScript` (`GPL-3.0`), `pineforge-codegen-oss` (`PineForge Source License 1.2` banning prop-firm accounts), `ArcticDB` (`BSL 1.1`), `TimescaleDB` (`TSL`), `vectorbt` (`Commons Clause v1.0`), `StockSharp` (proprietary), and Sierra Chart `.scid` reverse-engineered parsers.
5. **LGPLv3 Sidecar Isolation Rule:** `nautilus_trader v1.231.0` (`LGPL-3.0-only`, verified in upstream `Cargo.toml`) is **BANNED from static Rust linking** in Allegedly. If optional event-driven backtesting integration is added later, it may communicate **only** as an optional, user-installed out-of-process sidecar over local Parquet files and JSON-RPC/Arrow IPC (`[ATTORNEY REVIEW REQUIRED]` before shipping any sidecar launcher).
6. **Automated Compliance Gates (`v0.1` Implementation CI, post-Phase-5):** Run `cargo-deny v0.22.1` (`deny.toml`) and an npm SPDX license allowlist check on every PR, and auto-generate `THIRD_PARTY_NOTICES.md` from `cargo-about` + npm license metadata on every release build (preserving TradingView LWC attribution and OFL font notices).

### 3.2 Brand & Trademark Governance

1. **Canonical Name:** Adopt **Allegedly** with tagline *"Allegedly a trading terminal."* and public repository `emrisca/allegedly` (`A09`).
2. **Zero Legacy Residue & CI Enforcement (`RT3-04`):** Never use `MotiveView`, `MotiveScript`, `Pine`, legacy `mv-*` crate prefixes, or `.mv*` file extensions in product UI, Cargo crate names, schemas, CLI flags, bundle identifiers, or marketing copy. Canonical workspace crates are strictly `allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, `allegedly-studies`, `allegedly-replay`, `allegedly-oms`, `allegedly-ipc`, `allegedly-app` (plus dev-only `allegedly-docgen`), and canonical user/data file extensions are `analysis.toml`, `workspace.toml`, `template.toml`, `.atvault`, and `.atdepth`. **`v0.1` Implementation CI (post-Phase-5)** enforces a repository grep gate that fails any PR introducing `mv-` crate names or `.mv*` file extensions in new code or schemas.
3. **Pre-Release Legal Gate:** Treat formal USPTO TSDR, EUIPO, WIPO Madrid, and common-law clearance—specifically evaluating `allegedly.market`, `allegedlyapp.com`, and `kyscott18/allegedly`—as **`[ATTORNEY REVIEW REQUIRED]` / `UNVERIFIED`** prior to public `v0.1` launch marketing or trademark registration. Keep R09's five screened fallback names (`Ordlith`, `Rungcraft`, `Cairntape`, `Tallyrung`, `Tickkiln`) on standby until counsel clears `Allegedly`.

### 3.3 Platform Scope (`v0.1`–`v1.0`) & Distribution

1. **Supported Tier-1 Targets (`v0.1`–`v1.0`, `A01`, `A07`):**
   - **macOS (Apple Silicon `aarch64` + Intel `x86_64`, `WKWebView`):** `$0` ad-hoc signed `.dmg` + Homebrew Cask distribution (`Constraints` #2, #4). (Apple Developer ID notarization remains optional post-`v0.1` only if sponsored/funded outside `$0` core.)
   - **Windows 10/11 (`x86_64`, `WebView2` Chromium with `embedBootstrapper`):** `$0` Open-Source OV HSM code signing via **SignPath Foundation** (`R02-S15`) + Winget and Scoop manifests.
2. **Deferred Target:** **Linux (X11 + Wayland)** is formally deferred to a post-`v1.0` milestone (`RK-01` = `Deferred (Post-v1.0)`). No Linux packaging, `WebKitGTK` workarounds, or Linux CI sign-off block `v0.1`–`v1.0`.
3. **Portability Invariant:** Even while Linux is deferred, Allegedly must keep its Rust workspace, WebGL2-only shader baseline, `TransportAdapter` IPC boundary, and `keyring-rs` OS-keychain wrapper platform-neutral so Linux (via future `WebKitGTK` fixes or `Servo`/`CEF` Tauri runtime) can be enabled post-`v1.0` without rewriting core subsystems.
4. **Measured Bundle Budget Headroom (`RK-07`):** Combined stripped `gzip-9` macOS `arm64` artifacts measured across Phase 2 spikes total **`~7.8 MB`** (`2.68 MB` Tauri shell from `S02` + `+2.20 MiB` exact combined minimal Wasmtime `+1.74 MiB` & Luau `+0.47 MiB` from `S07` + `+2.91 MiB` Parquet/SQLite from `S08`), giving **`~5×` headroom** under the `< 40 MB` installer budget (`Constraints` #5).

---

## 4. Consequences

### Positive
- **Zero license friction across the entire stack:** Every core Rust crate and frontend package is verified permissive; `Apache-2.0` explicit patent protection shields contributors and institutional users without blocking private `Study` or `Broker` plugins.
- **`$0` release pipeline unlocked:** `Apache-2.0` + public GitHub repository satisfies SignPath Foundation's free OSS Windows code-signing eligibility, eliminating Windows SmartScreen blocks at `$0` cost.
- **Schedule de-risked:** Deferring Linux removes `WebKitGTK 2.54.3` WebGL/Wayland/DMA-BUF defects (`RK-01`) from the `v0.1`–`v1.0` critical path while keeping the core codebase portable.
- **Trademark collision eliminated early:** Retiring `MotiveView`/`MotiveScript` (plus `mv-*`/`.mv*` prefixes) before `v0.1` implementation (post-Phase-5) prevents costly post-launch rebranding and cease-and-desist exposure (`RK-04`).

### Negative
- **Permissive commercial forks allowed:** Under `Apache-2.0`, third parties may build closed-source commercial derivatives without contributing improvements back (accepted trade-off vs copyleft ecosystem friction).
- **Linux traders excluded until post-`v1.0`:** Linux-native quant/trading desktop users cannot run official Allegedly binaries during `v0.1`–`v1.0` unless they build experimentally from source.
- **macOS Gatekeeper friction on `$0` ad-hoc builds:** Until optional Apple Developer ID notarization is funded, macOS users downloading `.dmg` directly see a Gatekeeper prompt (mitigated by Homebrew Cask instructions and transparent docs).

### Risks
- **Unverified `Allegedly` clearance (`RK-04`):** If trademark counsel identifies an unacceptable conflict with `allegedly.market` or another mark in Class `009`/`042`, a pre-launch rename to one of the R09 fallback names is required.
- **Transitive license drift (`RK-05`):** A transitive crate update could silently introduce a `GPL`/`AGPL`/`BSL` dependency if CI `cargo-deny` or npm allowlist checks are bypassed or misconfigured.
- **Windows `WebView2` memory accounting (`UNVERIFIED`):** Phase 2 `S02` measured macOS `WKWebView`; Windows `WebView2` multi-process RSS under multi-pane `Dockview` load still requires `v0.1` Implementation CI (post-Phase-5) Windows profiling.

---

## 5. Reversal Cost

- **Changing License (`Apache-2.0` → `GPL`/`AGPL`):** **Very High / Practically Irreversible** once external contributors merge commits under `Apache-2.0` + DCO 1.1 (no CLA means relicensing requires written consent from every copyright holder).
- **Changing Brand (`Allegedly` → fallback name):** **Low before `v0.1` public launch** (automated rename across repo, bundle IDs, docs); **High after `v0.1` launch** (domain, Homebrew/Winget manifests, user configs, community recognition).
- **Adding Linux Support Earlier (`v0.2`–`v1.0`):** **Medium** — core Rust and WebGL2 layers stay portable by policy, so cost is bounded to Linux CI runners, `WebKitGTK`/alternative-runtime validation, and AppImage/Flatpak packaging.

---

## 6. Revisit Trigger

Reopen this ADR if any of the following occurs:
1. IP counsel (`[ATTORNEY REVIEW REQUIRED]`) flags a blocking trademark conflict for **Allegedly** in USPTO Class `009`/`042`, EUIPO, or WIPO Madrid, requiring activation of the R09 fallback list.
2. SignPath Foundation changes its `$0` OSS Windows OV signing eligibility criteria or declines Allegedly's application.
3. Upstream `WebKitGTK` resolves Wayland/NVIDIA `Error 71` and DMA-BUF SIGSEGV regressions (or Tauri v2 ships a production-stable `Servo`/`CEF` Linux runtime) **and** contributor/user demand justifies adding Linux CI runners before `v1.0`.
4. A critical required dependency changes license to a non-permissive or source-available license (e.g., `BSL`, `SSPL`, `GPL`, `AGPL`).
5. Product strategy introduces an optional `nautilus_trader` (`LGPL-3.0-only`) sidecar launcher, triggering formal attorney sign-off on the out-of-process IPC boundary.

---

## 7. Evidence Links

- `[[01-Charter/Constraints]]` — FOSS-or-die, `$0` core (`#2`), macOS/Windows `v0.1`–`v1.0` scope (`#4`), `< 40 MB` bundle budget (`#5`), no telemetry.
- `[[01-Charter/Assumptions]]` — Owner decisions `A01` (macOS + Windows `v0.1`–`v1.0`), `A07` (Linux post-`v1.0`), `A09` (`Allegedly` brand lock, `2026-11-24`).
- `[[02-Research/R09-Legal-Licensing]]` — License scoring matrix (`Apache-2.0` `4.63` vs `MIT` `4.05` vs `GPL-3.0` `4.03` vs `AGPL-3.0` `3.55`), USPTO collisions (`MOTIVEWAVE` `#3937578`, `TRADINGVIEW` `#5632149`), `OpenBB` V5 `Apache-2.0` reversion (`2026-09-29`), clean-room fallback names.
- `[[02-Research/R02-Shell-UI-Stack]]` — SignPath Foundation `$0` Windows OV signing (`R02-S15`), `WebKitGTK 2.54.3` Linux defects (`RK-01`).
- `[[06-Risk/License-Registry]]` — Verified SPDX registry for every core crate and frontend package, plus hard-disqualified traps and `nautilus_trader v1.231.0` `LGPL-3.0-only` sidecar rule.
- `[[06-Risk/Compliance-Notes]]` — Preliminary `Allegedly` screening (`0` USPTO `009`/`042` conflicts; 3 adjacent uses logged), `TradingView Lightweight Charts™` mandatory `NOTICE`, attorney review checklist.
- `[[06-Risk/Risk-Register]]` — `RK-01` (Deferred Post-`v1.0`), `RK-04`, `RK-05`, `RK-07` (`~7.8 MB` measured core total).
- `[[03-Spikes/S02-Tauri-IPC-Throughput]]` — `2.68 MB` gzip-9 Tauri shell footprint.
- `[[03-Spikes/S07-Scripting-Sandbox]]` — `+1.74 MiB` minimal `Wasmtime v51.0.0` + `+0.47 MiB` `Luau` (`mlua v0.12.3`) (`+2.20 MiB` exact combined) footprint.
- `[[03-Spikes/S08-Storage-100M-Replay]]` — `+2.91 MiB` Parquet/SQLite storage footprint.
