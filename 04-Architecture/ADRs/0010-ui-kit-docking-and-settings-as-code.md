---
title: "ADR-0010: UI Component Kit (ui-sdk), Docking Workbench (Dockview MIT) & Settings-as-Code Sovereignty"
type: adr
status: proposed
phase: Phase 3
owner: architect
updated: 2026-11-24
code_refs:
  - AGENTS.md
  - spikes/S03-dockview-multiwindow/package.json
  - spikes/S03-dockview-multiwindow/src/
  - spikes/S03-dockview-multiwindow/bench-results.json
  - spikes/S04-css-layout-perf/package.json
---

# ADR-0010: UI Component Kit (`ui-sdk`), Docking Workbench (`Dockview` MIT) & Settings-as-Code Sovereignty

- **Status:** Proposed (Draft for Red-Team Review)
- **Date:** `2026-11-24`
- **Owner:** Architect (Workstream A — Shell, Charting, GPU, IPC & UI)
- **Decides:** Non-hot-path UI component system (`ui-sdk` with `shadcn/ui` + Radix fallback), multi-pane docking manager (`dockview` MIT-only + CI enterprise ban), 3-Tier Settings Compression, 5-level TOML/JSON cascade, Command Palette, Undo separation, and automated 20-rule Sovereignty Checklist (`SV-01`–`SV-20`).

---

## 1. Context

Institutional trading terminals frequently collapse under modal dialog sprawl, binary opaque layout files, inconsistent hotkeys, and DOM leaks when panels are opened and closed across multi-monitor desks (`[[R10-UX-Teardown-Control-Model]]`). Conversely, Allegedly's charter ([[Principles]] `P1–P8`, [[Constraints]] #1/#5/#6) mandates:
- **Permissive FOSS Only:** `MIT` / `Apache-2.0` / `ISC` / `OFL-1.1` across the entire UI dependency graph, with zero proprietary UI tiers (`dockview-enterprise` strictly forbidden).
- **UI Sovereignty & Anti-Bloat (`R10`, `Principles` §3):** Zero-network offline boot with zero telemetry/account walls (`SV-01`), every setting/action reachable via `Cmd/Ctrl+K` within `<= 3` keystrokes (`SV-02`), zero blocking configuration modal walls (`SV-03`), `<= 5` controls / `<= 36 px` Tier-1 micro-toolbars (`SV-04`), `>= 90%` canvas-to-chrome ratio (`SV-05`), Git-diffable TOML/JSON **Settings-as-Code** (`theme.toml`, `workspace.toml`, `template.toml`, `analysis.toml`, `SV-06`/`SV-07`), guarded price-axis zoom vs. trading (`SV-15`), strict Undo separation (`SV-16`), and WCAG AA `>= 4.5:1` + Okabe-Ito colorblind accessibility (`SV-19`).
- **Hot-Path Isolation (`S04`, `AGENTS.md`, `SV-14`):** React 19 UI chrome must stay completely isolated from `60 fps` chart/order-flow ticks and `30+ Hz` DOM Ladder / Time & Sales updates (`[[0004-orderflow-gpu-and-hotpath-renderer]]`).

Two key inputs locked this ADR:
1. **Workspace Engineering Directive (`AGENTS.md` & Team Decision):** Adopt **`ui-sdk`** (`@ui-sdk/react` and `@ui-sdk/core` pinned exactly to `0.1.0-beta.17`, `Apache-2.0`, `https://ui-sdk.dev/docs`, requires React 19+) + Tailwind CSS `4.3.5` + `lucide-react 1.79.0` (`ISC`) for non-hot-path UI chrome, retaining **`shadcn/ui` (`4.23.0`, `MIT`) + Radix Primitives (`MIT`)** as a concrete pre-approved fallback if `0.1.0-beta` APIs block a milestone.
2. **Phase 2 Spike [[S03-Dockview-Multiwindow]]:** Verified `dockview 8.9.1` (`MIT`) + `dockview-react 8.9.1` (`MIT`, React 19 peerDep) with **zero** `dockview-enterprise` packages: `68.40 ms` 9-panel mount, `2,376 B` workspace JSON (`0.10 ms` p50 / `0.20 ms` p95 `toJSON()`; `2.40 ms` p50 / `5.30 ms` p95 `fromJSON()`, `10/10` fidelity), and **`+0.109 MB` JS heap / `0` DOM node delta / `0` listener delta** across 20 heavy panel open/close cycles.

---

## 2. Options & Weighted Criteria

### 2A. Non-Hot-Path UI Component System

Weights: **Permissive License & React 19 Fit (25%)**, **Token-Driven Theming & Tailwind v4 Ergonomics (25%)**, **Accessibility & Keyboard-First UX (20%)**, **Bundle Size & Zero Runtime Bloat (15%)**, **Maturity & Fallback Safety (15%)**.

| Option | License & React 19 (25%) | Token / Tailwind v4 (25%) | A11y & Keyboard (20%) | Bundle Size (15%) | Maturity / Fallback (15%) | Weighted Score (/5.0) |
|---|---:|---:|---:|---:|---:|---:|
| **A1. `ui-sdk` (`@ui-sdk/react` + `@ui-sdk/core` pinned `0.1.0-beta.17`, `Apache-2.0`) + Tailwind CSS `4.3.5` + `lucide-react 1.79.0`** *(Selected per Charter/User Directive; `A2` pre-approved fallback)* | **5.0** (`Apache-2.0`, built natively for React 19+) | **4.8** (Clean headless/composable token model with Tailwind v4) | **4.5** (Composable primitives; verify focus traps in `v0.1` Implementation CI) | **4.8** (Lightweight, zero CSS-in-JS runtime) | **3.6** (`0.1.0-beta.17` early beta — mitigated by exact pin, `@allegedly/ui-chrome` wrapper, & `A2` fallback) | **4.61** *(Selected per Charter/User Directive; `A2` pre-approved fallback)* |
| **A2. `shadcn/ui 4.23.0` + Radix Primitives (`MIT`) + Tailwind CSS `4.3.5`** *(Pre-Approved Fallback)* | **5.0** (`MIT`, React 19 compatible) | **4.8** (Copy-owned Tailwind components) | **4.9** (Battle-tested WAI-ARIA Radix primitives) | **4.6** | **4.9** (`128,991★`, broad production track record) | **4.85** *(fallback if `ui-sdk` beta blocks)* |
| **A3. MUI / Ant Design / BlueprintJS** *(Rejected)* | **4.2** (`MIT`/`Apache-2.0`, heavier React 19 lag) | **2.2** (Fights Tailwind v4 & TOML semantic tokens) | **4.2** | **2.0** (Heavy runtime CSS-in-JS & bundle overhead) | **4.5** | **3.42** |

*Why A1 is selected despite A2's higher maturity score (`RT3-14`):* Project governance (`AGENTS.md` + Team Memory) explicitly selected **`ui-sdk` (`Apache-2.0`)** per Charter/User Directive as Allegedly's primary UI kit to standardize on an `Apache-2.0` React 19+ primitive architecture aligned with Allegedly's own `Apache-2.0` license. To neutralize beta volatility without ignoring the numeric maturity gap, `@ui-sdk/react` and `@ui-sdk/core` are **exact-version pinned (`"0.1.0-beta.17"`, no `^` caret)** behind `@allegedly/ui-chrome/primitives/` so `A2` (`shadcn/ui + Radix`, `MIT`) remains a zero-rewrite, pre-approved fallback if beta churn impacts a milestone.

### 2B. Docking & Multi-Pane Workspace Manager

Weights: **Permissive MIT License Hygiene (30%)**, **Deterministic JSON Layout Serialization (25%)**, **Zero-Leak Panel Lifecycle (20%)**, **Multi-Window Ergonomics (15%)**, **Maintenance & Bus-Factor Resilience (10%)**.

| Option | License Hygiene (30%) | JSON Fidelity (25%) | Zero-Leak Lifecycle (20%) | Multi-Window (15%) | Bus-Factor Resilience (10%) | Weighted Score (/5.0) |
|---|---:|---:|---:|---:|---:|---:|
| **B1. `dockview 8.9.1` + `dockview-react 8.9.1` (`MIT`) Behind `WorkspaceHost` Adapter + Native Tauri Pop-Outs** *(Selected)* | **5.0** (`MIT` core/react; CI hard-bans `dockview-enterprise`) | **5.0** (`2,376 B`, `0.10 ms` save, `2.40 ms` restore, `10/10` fidelity `S03`) | **5.0** (`+0.109 MB`, `0` DOM / `0` listener leaks over 20 cycles `S03`) | **4.5** (Native Tauri `WebviewWindow` + Rust state hub `0.60 ms` p95 `S03`) | **3.2** (Single top maintainer `3,549/3,727` commits — mitigated by `WorkspaceHost` seam) | **4.75** |
| **B2. `caplin/FlexLayout v0.11.2` (`MIT`)** *(Pre-Approved Fallback)* | **5.0** (`MIT`) | **4.6** (JSON model) | **4.2** (`UNVERIFIED` in Phase 2) | **4.2** (Pair with native Tauri `WebviewWindow`) | **4.0** (Mature, lower churn) | **4.52** |
| **B3. `Golden Layout`** *(Disqualified)* | **4.5** (`MIT`) | **3.5** | **2.5** | **3.0** | **1.5** (Stagnant maintenance `[[Adopt-Build-Fork]]`) | **3.33** |

---

## 3. Decision

### 3.1 UI Component Kit, Typography & Mandatory `ui-sdk` Workflow
1. **Adopt `ui-sdk` (`@ui-sdk/react` & `@ui-sdk/core` exact-pinned to `"0.1.0-beta.17"` — no `^` or `~` ranges, `Apache-2.0`, `https://ui-sdk.dev/docs`)** paired with **React `19.3.1` (`MIT`)**, **Tailwind CSS `4.3.5` (`MIT`)**, **Zustand `5.1.0` (`MIT`)**, **TanStack Table (`MIT`)** for non-hot-path tables (order history, alert log, watchlists), **`lucide-react 1.79.0` (`ISC`)** for icons, and **`JetBrains Mono v2.304` + `Inter v4.1` (`OFL-1.1`)** for tabular-numeral and UI typography (`font-variant-numeric: tabular-nums` enforced globally on all numeric fields).
2. **Mandatory `AGENTS.md` Engineering Rules for `ui-sdk`:**
   - Install `@ui-sdk/react` and `@ui-sdk/core` exclusively via **`pnpm`** with exact version pins (`"0.1.0-beta.17"`, no `^` caret); if pnpm's release-age security policy blocks a freshly published beta version, stop and ask the user before overriding.
   - Follow the `ui-sdk` skill if installed in the workspace toolchain.
   - Always read `node_modules/@ui-sdk/react/docs/llms.txt` before consuming `ui-sdk` APIs; search `core.md` and read `rendering.md` before building new components.
   - Wrap all `ui-sdk` primitives inside `@allegedly/ui-chrome/primitives/` so no feature package imports `@ui-sdk/*` directly.
   - **Strict Hot-Path Boundary (`SV-14`):** `ui-sdk` and React state are strictly confined to non-hot-path UI chrome; zero React reconciliations are permitted in `60 fps` charts or `30+ Hz` DOM Ladder / Time & Sales panels (`[[0004-orderflow-gpu-and-hotpath-renderer]]`).
3. **Pre-Approved Fallback:** If `ui-sdk` `0.1.0-beta` API breaks or lacks a required accessible primitive (e.g., nested context menu, focus-trapped popover, virtualized combobox) blocking a milestone, swap the affected primitives inside `@allegedly/ui-chrome/primitives/` to **`shadcn/ui 4.23.0` + Radix Primitives (`MIT`)**.

### 3.2 Docking Workbench & Hard CI License Ban
1. **Adopt `dockview 8.9.1` + `dockview-react 8.9.1` (`MIT`)** wrapped behind a thin `WorkspaceHost` TypeScript interface inside `@allegedly/ui-chrome` (isolating Allegedly from Dockview's single-maintainer bus factor and enabling drop-in replacement by `caplin/FlexLayout v0.11.2` `MIT`).
2. **Hard CI Ban on `dockview-enterprise`:** `v0.1` Implementation CI (post-Phase-5) runs an automated check on every PR asserting zero occurrences of `dockview-enterprise` in `package.json`, `pnpm-lock.yaml`, and `node_modules/.pnpm` (proven clean in `S03`).
3. **Multi-Monitor Pop-Outs:** Detached panels spawn native Tauri `WebviewWindow` instances coordinated by the Rust Workspace State Hub (`state_rev: u64`, `[[0002-desktop-shell-and-binary-ipc]]`, `[[IPC-Contract]]`), rather than unverified `window.open()` pop-outs.

### 3.3 3-Tier Settings Compression, 5-Level Cascade & Sovereignty Checklist (`R10`, `Principles` §3)
1. **3-Tier Settings Compression (Zero Blocking Configuration Modals — `SV-03`):**
   - **Tier 1 (Contextual Floating Micro-Toolbar — `SV-04`):** `<= 5` high-frequency controls (`<= 36 px` height) docked near a selected **Drawing** or **Study** (color, line style, lock, hide, delete/gear), preserving **`>= 90.0%` active canvas-to-chrome area (`SV-05`)**.
   - **Tier 2 (Non-Blocking `320 px` Right Property Inspector — `SV-03`, `SV-07`):** Docked side inspector with **4 invariant tabs** (`Parameters | Style | Timeframes & Session | Alerts`), instant substring search, a `Modified Only` toggle showing only non-default overrides, and 1-click `Reset to Inherited`.
   - **Tier 3 (Semantic Theme Tokens — `theme.toml`, `SV-19`):** All visual colors resolve through semantic CSS/GPU tokens (never hardcoded hex per component), supporting Dark, Light, and WCAG AA `>= 4.5:1` **Okabe-Ito colorblind-safe** palettes (`Delta E_2000 >= 20`).
2. **5-Level TOML/JSON Delta Cascade (`SV-06`, `SV-07`, `Constraints` #6):**
   - `1. Global Defaults` → `2. Workspace (workspace.toml + Dockview JSON)` → `3. Study / Layout Template (template.toml)` → `4. Chart Pane` → `5. Study / Drawing Instance (analysis.toml)`.
   - Only deltas from the parent level are written using sorted-key deterministic TOML/JSON (`SHA-256` round-trip identical; 1-parameter change produces `<= 3` `git diff` lines per `SV-06`).
3. **Unified Layer & Object Tree + `Cmd/Ctrl+K` Command Palette (`R10`, `SV-02`, `SV-18`):**
   - Every pane's **Studies**, **Drawings**, order-flow layers, and price alerts appear in one unified Layer & Object Tree persisted cleanly to `analysis.toml`.
   - Global `Cmd/Ctrl+K` Command Palette reaches any Instrument (`@`), Study/Timeframe (`/`), Action/Settings (`>`), or Layout/Template (`#`) within **`<= 3` keystrokes** (`SV-02`) without spawning a modal dialog; all `40+` shortcuts are 100% remappable via `keymap.toml` with conflict detection (`SV-18`).
4. **Execution Guards & Strict Undo Domain Separation (`SV-15`, `SV-16`, `SV-17`):**
   - Unmodified `Click+Drag` on the price axis ALWAYS zooms/scales (`0` accidental orders, `SV-15`); direct price-axis and DOM order staging is gated by explicit `live_armed` state (`false` by default), `BookState::Live` verification (with the Risk-Reduction Bypass Rule for `reduce_only: true`, cancels, and Kill-Switch), and modifier/confirm preferences. POC/VAH/VAL magnet snap locks to exact `i64` tick indices (`SV-17`).
   - **Strict Undo Separation (`SV-16`):** Chart analysis undo (`Cmd/Ctrl+Z` for Drawings, Study params, Layout edits) is physically isolated from Order Management — `Cmd/Ctrl+Z` **never** submits, modifies, or cancels a live or paper order.
5. **Automated 20-Rule Sovereignty Checklist (`SV-01`–`SV-20`):** All 20 UX sovereignty rules from [[Principles]] §3 (including `SV-01` zero-network offline boot & zero telemetry/account walls, `SV-02` `<= 3` keystroke Command Palette, `SV-03` zero blocking configuration modals, `SV-04` Tier-1 micro-toolbar bounds, `SV-05` `>= 90%` canvas ratio, `SV-06`/`SV-07` deterministic TOML & 5-level cascade, `SV-15` price-axis zoom safety guard, `SV-16` undo separation, `SV-17` magnet snap, `SV-18` remappable `keymap.toml`, `SV-19` WCAG AA `>= 4.5:1` + Okabe-Ito theme, and `SV-20` `< 40 MB` installer & `< 2.0 s` cold start) are encoded as `v0.1` Implementation CI (post-Phase-5) Playwright/Rust acceptance gates.

---

## 4. Consequences

### Positive
- **Clean License & Attribution Posture:** Entire UI stack is strictly `Apache-2.0`, `MIT`, `ISC`, and `OFL-1.1`, with automated CI blocking of `dockview-enterprise` and retired legacy crate/extension prefixes (`ADR-0001` §3.2), plus third-party font/icon notices generated in `THIRD_PARTY_NOTICES.md`.
- **Verified Zero-Leak Workbench:** `S03` proved Dockview `8.9.1` maintains `0` DOM node leaks, `0` listener leaks, `+0.109 MB` heap stability across 20 panel cycles, and `2.40 ms` p50 layout restores.
- **Git-Friendly Institutional Ergonomics:** 5-level sorted-key TOML/JSON cascade (`workspace.toml`, `template.toml`, `analysis.toml`, `theme.toml`, `keymap.toml`) + 3-Tier Settings Compression eliminates MotiveWave/Sierra-style dialog fatigue while preserving full institutional power.
- **Protected Hot Paths:** Decoupling `ui-sdk`/React chrome from WebGL2 and Canvas2D keeps chart and DOM frame times flat (`S01`, `S04`).

### Negative
- **`ui-sdk` Beta API Volatility Risk:** `@ui-sdk/react` `"0.1.0-beta.17"` is pre-1.0 software; minor releases may introduce breaking prop or styling changes prior to `1.0` (mitigated via exact version pinning).
- **Thin Adapter Boilerplate:** Wrapping both `ui-sdk` (`@allegedly/ui-chrome/primitives/`) and `Dockview` (`WorkspaceHost`) adds modest upfront abstraction code to guarantee clean fallbacks.

### Risks & Explicit `UNVERIFIED` Gaps
1. **`ui-sdk` Runtime & Bundle Benchmark (`UNVERIFIED`):** `ui-sdk` (`"0.1.0-beta.17"`) was not yet compiled into a Phase 2 spike (`S03`/`S04` used plain React `19.3.1` + Tailwind `4.3.5`). The first `v0.1` implementation PR (post-Phase-5) installing `@ui-sdk/react` + `@ui-sdk/core` via `pnpm` (exact pin, no `^`) must verify bundle delta, React 19.3 compatibility, WAI-ARIA keyboard navigation, and zero release-age policy conflicts.
2. **Dockview Single-Maintainer Bus Factor (`R08`, `Adopt-Build-Fork`):** `3,549/3,727` commits by one author. Mitigated by pinning `dockview`/`dockview-react` versions, keeping all code behind `WorkspaceHost`, and retaining `caplin/FlexLayout v0.11.2` (`MIT`) as fallback.
3. **Native Tauri Pop-Out Drag-to-Detach Ergonomics (`UNVERIFIED`):** Dragging a Dockview tab out of the main window to spawn a native Tauri `WebviewWindow` on a second monitor (macOS + Windows mixed-DPI) requires `v0.1` Implementation CI (post-Phase-5) integration testing.

---

## 5. Reversal Cost

- **Low (3–5 Engineering Days) to Swap `ui-sdk` → `shadcn/ui + Radix`:** Because all UI kit calls live inside `@allegedly/ui-chrome/primitives/` and share Tailwind CSS `4.3.5` + semantic `theme.toml` CSS variables, swapping individual or all primitives to `shadcn/ui 4.23.0` + Radix (`MIT`) leaves all domain views and Rust crates untouched.
- **Medium (1–2 Engineering Weeks) to Swap `Dockview` → `caplin/FlexLayout`:** Confined to the `WorkspaceHost` adapter and a versioned Layout JSON migration helper (`schema_version` field in `workspace.toml`).

---

## 6. Revisit Trigger

Reopen this ADR if any of the following occur:
1. **`ui-sdk` Beta Blocker:** `@ui-sdk/react` / `@ui-sdk/core` fails `pnpm` installation/build on React `19.3+`, breaks WAI-ARIA keyboard focus traps in Command Palette / Property Inspector (`SV-02`, `SV-03`, `SV-19`), or ships breaking beta churn costing `> 2` days/sprint — trigger immediate swap of affected primitives to `shadcn/ui + Radix`.
2. **Dockview License Shift or Leak Regression:** Upstream `dockview`/`dockview-react` moves features behind `dockview-enterprise`, changes its `MIT` license, or introduces a panel unmount leak exceeding `0` DOM nodes / `1 MB` heap across 20 cycles — trigger swap to `caplin/FlexLayout v0.11.2` (`MIT`).
3. **Sovereignty Checklist Failure:** Any core workflow violates `SV-01`–`SV-20` (e.g., `> 3` keystrokes for Command Palette actions `SV-02`, blocking configuration modals `SV-03`, or WCAG AA contrast `< 4.5:1` `SV-19`).

---

## 7. Evidence Links

- [[R02-Shell-UI-Stack]] — UI framework, docking manager, icon, and typography evaluation.
- [[R10-UX-Teardown-Control-Model]] — 3-Tier Settings Compression, 5-Level Cascade, `analysis.toml`, Command Palette, and Sovereignty Checklist (`SV-01`–`SV-20`).
- [[Principles]] — `P1–P8` design principles and canonical `SV-01`–`SV-20` assertions (§3).
- [[S03-Dockview-Multiwindow]] — Empirical Dockview `8.9.1` (`MIT`) serialization (`0.10 ms`/`2.40 ms`), zero-leak audit (`+0.109 MB`, `0` DOM/listener leaks), and `dockview-enterprise` absence check.
- [[S04-CSS-Layout-Perf]] — Empirical proof of why React/`ui-sdk` must remain off `30–60 Hz` DOM Ladder hot paths (`SV-14`).
- [[Adopt-Build-Fork]] — Ledger items #4 (`React + ui-sdk + Dockview MIT`) and #5 (`Lucide + JetBrains Mono + Inter`).
- `AGENTS.md` — Locked `ui-sdk` adoption workflow (`pnpm`, exact pin, `llms.txt`, `core.md`, `rendering.md`, hot-path isolation).
