---
title: R02 — Desktop Shell & UI Stack Research
track: R02
status: verified
owner: research-shell-ui
updated: 2026-11-24
code_refs: []
---

# R02 — Desktop Shell & UI Stack Research

## Question

Which FOSS desktop shell, IPC transport, packaging/signing/updater pipeline, and UI/docking stack best satisfies MotiveView's non-negotiables (`[[Constraints]]`: installer `< 40 MB`, cold start `< 2 s`, idle RAM `< 300 MB`, smooth **DOM Ladder** at `30+` updates/s, zero GC stalls on the hot path, `$0` core, local-first, and first-class macOS Apple Silicon + Windows 10/11 + Linux X11/Wayland multi-distro support under `[[Assumptions]]` A01/A04/A07)?

---

## Findings (Facts)

### 1. Desktop Shell Comparison — Primary-Source Audit

All versions, licenses, star counts, and maintenance dates below were verified directly via GitHub API, crates.io API, npm registry, repository `LICENSE` files, and official documentation on `2026-11-24`.

| Shell | Latest Stable (2026-11-24) | Verified License | Backend / Renderer | Realistic Installer Size | Idle RAM & Cold Start (Measured Benchmarks) | Multi-Window & Desktop Fit |
|---|---|---|---|---|---|---|
| **Tauri v2** | `tauri 2.12.7` / `tauri-cli 2.12.6` / `wry 0.57.3` / `@tauri-apps/api 2.12.5` [R02-S01] | **MIT OR Apache-2.0** (`LICENSE-MIT`, `LICENSE-APACHE-2.0`) [R02-S01] | **Rust** + OS WebView (`WKWebView` / `WebView2` / `WebKitGTK`) [R02-S01] | **~1–15 MB** compressed (default `downloadBootstrapper`; +~1.8 MB with `embedBootstrapper`) [R02-S02], [R02-S03] | **Idle RAM (full tree):** ~60–110 MB (macOS), ~142 MB (Win 11); ~172 MB across 6 macOS windows.<br>**Cold start:** ~310–380 ms baseline [R02-S03] | Native Rust core (zero GC stalls); native multi-window (`WebviewWindow`); WebKitGTK Linux quirks must be engineered around [R02-S04]. |
| **Electron** | `v45.5.0` (`2026-11-24`) [R02-S05] | **MIT** [R02-S05] | Node.js (+ optional Rust N-API sidecar) + **bundled Chromium** [R02-S05] | **~80–150 MB** compressed (`150–370+ MB` on disk) — **violates `< 40 MB` budget by 2×–3.75×** [R02-S03] | **Idle RAM (full tree):** ~86–128 MB (macOS), ~149 MB (Win 11); ~409 MB across 6 macOS windows.<br>**Cold start:** ~270–330 ms baseline, often 1–3 s in complex apps [R02-S03] | Uniform Blink/V8/WebGL2 across OSes (eliminates WebKitGTK bugs), at high bundle & multi-window RAM cost. |
| **Wails** | `v3.1.0` (`2026-11-01`; `v3.2.0-nightly` active) [R02-S06] | **MIT** [R02-S06] | **Go** + OS WebView (`WKWebView` / `WebView2` / `WebKitGTK`) [R02-S06] | ~10–20 MB (UNVERIFIED exact v3.1 size with our stack — inherits OS WebView) | Same WebView helper RAM as Tauri; Go runtime adds GC | Same Linux WebKitGTK surface as Tauri, but splits language stack if core engine/storage is Rust. |
| **Dioxus** | `v0.7.10` (`0.8.0-alpha.3` pre-release) [R02-S07] | **MIT OR Apache-2.0** (`LICENSE-MIT`, `LICENSE-APACHE`) [R02-S07] | Rust + **WRY WebView** (native Blitz renderer still maturing) [R02-S07] | Similar to Tauri (~5–15 MB) | Similar to Tauri when using WRY | Desktop still relies on WRY/WebKitGTK; RSX UI forfeits turnkey JS charting (`Lightweight Charts`), `Dockview`, and `shadcn/ui`. |
| **egui** | `v0.37.0` (`2026-10-15`) [R02-S08] | **MIT OR Apache-2.0** (`LICENSE-MIT`, `LICENSE-APACHE`) [R02-S08] | Pure Rust immediate-mode GPU (`egui-wgpu` / `egui_glow`) [R02-S08] | ~5–15 MB | Very low idle RAM & fast start | Includes optional **AccessKit** screen-reader support [R02-S08], but immediate-mode layout lacks rich HTML/CSS/ARIA chrome, IME polish, and forces 100% build-from-scratch charts & docking. |
| **Slint** | `v1.19.1` (`2026-11-24`) [R02-S09] | **TRIPLE-LICENSED: GPLv3 / Royalty-free 2.0 (proprietary, no embedded) / Commercial** [R02-S09] | Rust/C++ retained-mode GPU/SW renderer (`.slint` DSL) [R02-S09] | ~5–15 MB | Very low idle RAM & fast start | **License constraint:** FOSS use requires **GPLv3** copyleft (Royalty-free 2.0 is non-OSI proprietary) [R02-S09]; lacks turnkey financial chart & docking ecosystem. |
| **Avalonia** | `v12.2.0` (`2026-11-23`) [R02-S10] | **MIT** (core framework; XPF is separate commercial) [R02-S10] | C# / .NET + Skia [R02-S10] | ~25–60 MB (depends on NativeAOT vs self-contained .NET runtime) | Moderate (.NET GC heap) | Strong desktop feel, but requires C#/.NET (diverges from Rust hot-path core) and no ready FOSS financial chart ecosystem. |
| **Flutter** | `v3.50.1` (`2026-11-19`, Dart `3.14.0`) [R02-S11] | **BSD-3-Clause** [R02-S11] | Dart + **Impeller** (Metal/Vulkan default on desktop since `3.47`) [R02-S11] | ~20–40 MB | Moderate (Dart VM + Impeller) | **Desktop multi-window is still experimental in `3.50`**; Intel macOS x64 testing deprecated; requires Dart-to-Rust FFI + 100% custom chart/docking build [R02-S11]. |

---

### 2. Platform-Specific Engineering Reality (Linux, Windows, Signing, Updates, IPC)

#### 2.1 Linux WebKitGTK (`2.54.3`) Parity & Known Issues
- **Latest upstream stable:** `webkitgtk-2.54.3` (verified directly on `webkitgtk.org/releases/`) [R02-S12].
- **Canvas & WebGL2:** Standard `<canvas>` 2D and `<canvas>.getContext('webgl2')` work on hardware EGL and Mesa `llvmpipe` software fallback, **but**:
  1. **No WebGPU:** WebKitGTK does **not** ship stable WebGPU (`UNSTABLE` flag only) [R02-S12], [R01-S20].
  2. **`OffscreenCanvas` WebGL2 disabled by default:** WebKitGTK disables `AllowWebGLInWorkers`, causing `OffscreenCanvas.getContext('webgl2')` to return `null`; enabling it on NVIDIA + Wayland has triggered UI-process `Error 71 (Protocol error)` crashes [R01-S27].
  3. **DMA-BUF / NVIDIA / Wayland bugs:** Tracked actively in Tauri (`tauri#9304`, `tauri#14924`, `tauri#16226`): explicit-sync `Error 71` kills on Hyprland/KWin with NVIDIA drivers, GBM buffer creation failures in AppImages, and visual artifacts on transparent windows [R02-S04].
  4. **Critical 2026 regression:** Setting the older blanket workaround `WEBKIT_DISABLE_DMABUF_RENDERER=1` causes a **SIGSEGV** in `AcceleratedBackingStore` on WebKitGTK `2.52+`! Safer targeted mitigations are `__NV_DISABLE_EXPLICIT_SYNC=1` (first choice for NVIDIA + Wayland `Error 71`) and `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` (shared-memory fallback without SIGSEGV) [R02-S04].
  5. **Fingerprinting mask:** WebKitGTK masks `WEBGL_debug_renderer_info` as `"Apple GPU"` on Linux and silently degrades to software GL, requiring a MotiveView frame-time watchdog and user-facing `Auto / WebGL2 / Canvas2D` render setting [R01-S27].
- **Rule for MotiveView:** Never use transparent window chrome on Linux, never blindly inject `WEBKIT_DISABLE_DMABUF_RENDERER=1`, and detect NVIDIA+Wayland cleanly at startup (or expose a CLI flag/setting for SHM fallback).

#### 2.2 Windows WebView2 Runtime Distribution
- Windows 10 (version 1803+) and Windows 11 ship the **Evergreen WebView2** runtime managed and security-patched by Microsoft; **Tauri 2.12** dropped Windows 7 support (matching our Windows 10/11 target) [R02-S02].
- Verified Tauri v2 `bundle.windows.webviewInstallMode` modes (`v2.tauri.app/distribute/windows-installer/`) [R02-S02]:
  - `downloadBootstrapper` *(default)*: `~0 MB` size impact, downloads Evergreen bootstrapper silently if missing (requires internet).
  - `embedBootstrapper`: **+`~1.8 MB`**, embeds bootstrapper in `.msi`/NSIS installer — **recommended default** for MotiveView Windows releases (stays well under `< 40 MB` budget).
  - `offlineInstaller`: **+`~127 MB`** (required only if publishing to Microsoft Store).
  - `fixedRuntime`: **+`~180 MB`** (breaks `< 40 MB` budget; loses Microsoft auto-security patches).

#### 2.3 Code Signing, Notarization Costs & `$0` FOSS Alternatives (`[[Assumptions]]` A04)
| Platform | Paid Standard Path (Verified Cost) | `$0` FOSS Core Strategy (Day-One Plan) | Trade-off / User UX on `$0` Path |
|---|---|---|---|
| **macOS** | **Apple Developer Program: `$99 USD / year`** (required for Developer ID certificates & macOS notarization; Enterprise `$299/yr`; fee waivers restricted to nonprofits, schools, and governments — **not** individual OSS devs) [R02-S13] | 1) Ad-hoc signed `.dmg` / `.app` on GitHub Releases + SHA-256 & Sigstore Cosign attestations.<br>2) **Homebrew Cask** distribution (`brew install --cask motiveview --no-quarantine`).<br>3) Documented 1-line Gatekeeper clearing (`xattr -dr com.apple.quarantine /Applications/MotiveView.app`) + reproducible build-from-source. | Without `$99/yr` notarization, direct `.dmg` download triggers macOS Gatekeeper quarantine prompt; Homebrew Cask + clear docs keep `$0` core viable until/unless sponsorships fund a `$99/yr` cert. |
| **Windows** | **Azure Artifact Signing** *(formerly Trusted Signing)*: Basic SKU & Premium SKU verified on Microsoft Learn [R02-S14] *(web-reported `$9.99/mo` Basic / `$99.99/mo` Premium, individual public trust limited to US & Canada — exact live USD price marked `UNVERIFIED` below due to dynamic JS pricing widget)*. Traditional OV/EV HSM certs cost more. | 1) **SignPath Foundation (`$0`)**: Free OV HSM code signing for qualifying OSI-licensed public OSS projects via automated GitHub Actions CI provenance (certificate displays **"SignPath Foundation"** as verified publisher; eliminates SmartScreen "Unknown Publisher" warnings once approved) [R02-S15].<br>2) Pre-approval / fallback: **Winget**, **Scoop**, GitHub Releases + SHA-256 & Sigstore. | SignPath requires an active, already-released, pure-OSI repo with documented signing policy (apply immediately at `v0.1` public release; zero proprietary code allowed — aligns 100% with Non-Negotiable #1) [R02-S15]. |
| **Linux** | `$0` (no commercial CA gatekeeping) | GPG-signed `.deb` / `.rpm`, **Flathub (Flatpak)** signed OSTree repo, signed **AppImage**, and **AUR** `PKGBUILD`. | First-class native `$0` trust chain across Ubuntu/Debian, Fedora, and Arch. |

#### 2.4 Auto-Update Mechanisms
- **`tauri-plugin-updater` (`v2.14.1`)** [R02-S01], [R02-S16]:
  - Mandatory cryptographic verification via **Minisign / Ed25519** (`minisign-verify 0.3` rejects non-canonical Ed25519 `S` values) [R02-S16].
  - **`requireSignedVersion`** (`tauri-cli 2.12+`): Embeds app SemVer into the Minisign trusted comment so a compromised manifest cannot downgrade or spoof versions [R02-S16].
  - **Hosting cost `$0`:** Static `latest.json` hosted directly on **GitHub Releases**, auto-generated by `tauri-apps/tauri-action` [R02-S16].
  - **Package-manager hygiene:** Compile-time or runtime build flag disables in-app self-update when installed via Flatpak, Homebrew, Winget, `.deb`, or `.rpm` so OS package managers remain authoritative.

#### 2.5 IPC Throughput Options (Rust Core ↔ WebView UI)
Verified from Tauri v2 official IPC guides (`v2.tauri.app/develop/calling-rust/`, `v2.tauri.app/develop/calling-frontend/`) [R02-S17], [R02-S18]:
1. **Standard JSON `invoke()` & Tauri Events:** Serializes every message as JSON strings (and Events evaluate JS directly). Unsuitable above a few KB or at `30+ Hz` — causes JSON parse latency and JS GC stalls [R02-S17], [R02-S18].
2. **Tauri v2 `Channel<tauri::ipc::Response>` (Raw Binary Streaming → JS `ArrayBuffer`):** Ordered Rust-to-JS streaming bypassing JSON serialization completely (`tauri::ipc::Response::new(bytes)` → `Channel<ArrayBuffer>` in `@tauri-apps/api/core`) [R02-S18]. **Ideal for live `30–60 Hz` DOM Ladder Book Level deltas, trade ticks, and Footprint updates.**
3. **Tauri v2 `invoke` returning `tauri::ipc::Response` (Raw Binary Request/Response):** Zero-JSON `ArrayBuffer` return for `100k`-bar historical viewport loads [R02-S17].
4. **Custom Asynchronous URI Protocol (`register_asynchronous_uri_scheme_protocol`):** Streams binary responses via `fetch('motiveview://bars/...')` with zero extra `NSData` buffer copy on macOS in modern `wry` [R02-S17].
5. **Local WebSocket (`ws://127.0.0.1`) / Unix Domain Socket:** Portable fallback that keeps frontend 100% shell-agnostic (works identically in Electron or browser dev mode), but requires per-session random bearer token validation to prevent local cross-origin access.
6. **Wire Format — Packed Struct-of-Arrays (SoA) Binary vs Apache Arrow IPC (`arrow-ipc 60.2.0` / `apache-arrow 21.2.0`) [R02-S19] vs JSON:**
   - **Hot path (DOM Ladder 30–60 Hz, live ticks, Footprint viewport):** Fixed-layout little-endian **packed SoA binary buffers** viewed directly via JS `BigInt64Array`/`Int32Array`/`Float64Array`/`Uint32Array` — zero parser allocations, zero GC pressure, zero library weight.
   - **Bulk analytics/tables (`100k+` bars, backtest results):** Either packed SoA binary (lightest) or **Apache Arrow IPC** if R07 adopts DuckDB/Polars zero-copy Arrow pipelines (benchmark both in Spike S04 against `apache-arrow` JS bundle size).

---

### 3. Frontend UI, Docking, Virtualization, State & Typography Evaluation

All versions and licenses verified directly via GitHub API, `LICENSE`/`LICENCE.md` files, and npm registry on `2026-11-24`.

#### 3.1 UI Frameworks
- **React (`v19.3.1`, MIT, 252,872 stars)** [R02-S20]: Unmatched ecosystem — first-party official packages for **Dockview** (`dockview` / `dockview-react`), **FlexLayout** (`flexlayout-react`), **shadcn/ui** (`shadcn 4.23.0`), **Radix Primitives**, **TanStack Query/Table/Virtual**, **Zustand/Jotai**, and **Lucide (`lucide-react`)**. *Performance rule:* Keep React reconciliation strictly out of the `60 fps` chart and `30+ Hz` **DOM Ladder** cell hot paths (use Canvas2D or `requestAnimationFrame`-batched imperative ref updates fed by Zustand transient subscriptions).
- **SolidJS (`v2.0.3`, MIT, 36,952 stars)** [R02-S21]: Fine-grained signals eliminate VDOM overhead (natively great for high-frequency DOM grids) with `Kobalte` (`@kobalte/core 0.13.14`, MIT) [R02-S21], but lacks first-party Dockview/FlexLayout bindings and has a smaller ecosystem & AI-agent codegen surface.
- **Svelte (`v5.59.1`, MIT, 89,845 stars)** [R02-S22]: Clean compiled runes reactivity and strong `shadcn-svelte` (9,265 stars, MIT) [R02-S22], but also lacks first-party Dockview/FlexLayout bindings and requires manual wrappers for complex docking portals.

#### 3.2 Docking & Layout Managers
- **Dockview (`v8.9.1`, `2026-11-17`, 3,548 stars)** [R02-S23]: Zero dependencies; supports tabs, splitviews, gridviews, floating panels, **popout windows**, and full JSON layout serialization (`toJSON()`/`fromJSON()`) — directly enabling MotiveView **Layouts** & **Workspaces** (`[[Glossary]]`). **CRITICAL LICENSE FINDING:** Inspected `LICENCE.md` directly — `dockview-core`, `dockview`, `dockview-react`, `dockview-vue`, and `dockview-angular` are **MIT**, whereas `dockview-enterprise` is **Proprietary (commercial license)** [R02-S23]. MotiveView MUST strictly depend only on the MIT `dockview` / `dockview-core` packages and explicitly block `dockview-enterprise` in CI license checks.
- **FlexLayout (`flexlayout-react v0.11.2`, `2026-11-16`, MIT, 1,390 stars)** [R02-S24]: Actively maintained React tabset/border docking with popout windows; solid fallback if Dockview exhibits any WebKitGTK drag/drop quirks.
- **Golden Layout (`v2.6.0`, `2022-09-26`, MIT, 6,722 stars)** [R02-S25]: Effectively stagnant (no release in 4+ years), awkward React 19 integration. **Disqualified.**

#### 3.3 Components, Styling, Icons, Tables, Virtualization & State
- **shadcn/ui (`shadcn 4.23.0`, MIT, 128,990 stars) + Radix Primitives (MIT, 19,569 stars) + Tailwind CSS (`v4.3.5`, MIT, 98,779 stars) + Lucide (`lucide-react 1.79.0`, ISC, 25,985 stars)** [R02-S26]: Copy-owned component source (zero proprietary UI lock-in), WAI-ARIA keyboard navigation & focus traps from Radix, CSS-first Tailwind v4, and clean ISC icons with zero TradingView/MotiveWave asset risk (`[[Constraints]]` #1).
- **TanStack Suite:** `@tanstack/react-query` (`5.108.4`, MIT) for async metadata/instrument queries, `@tanstack/react-table` (`9.3.1`, MIT) + `@tanstack/react-virtual` (`3.14.28`, MIT) for virtualized trade blotters, Time & Sales, watchlists, and **virtualized schema-driven Settings Trees** (rendering 500+ searchable JSON/TOML settings nodes with instant diff/reset per `[[Constraints]]` #6) [R02-S27].
- **State Management:** **Zustand (`v5.1.0`, MIT, 58,988 stars)** as primary state store (supports transient `store.subscribe()` outside React's render cycle for zero-allocation rAF updates + clean undo/redo middleware for Drawings & Layouts); **Jotai (`v3.0.2`, MIT, 21,347 stars)** optional only if atomic fine-grained Study-parameter graphs prove cleaner [R02-S28].

#### 3.4 Accessibility (a11y), HiDPI & Tabular-Numeral FOSS Fonts
- **Accessibility:** Radix Primitives provide WAI-ARIA roles, roving tabindex, and focus restoration; MotiveView adds a global command palette (`Cmd/Ctrl+K`), remappable keyboard shortcuts persisted in TOML/JSON, WCAG AA high-contrast themes, and `prefers-reduced-motion` support.
- **HiDPI / Fractional Scaling:** Handle macOS `2×` Retina, Windows `125%/150%`, and Linux Wayland fractional scaling via `window.devicePixelRatio` + `ResizeObserver` (`devicePixelContentBoxSize` with DPR fallback) so hairline borders, **DOM Ladder** rows, and canvas backing stores stay pixel-aligned.
- **Tabular-Numeral FOSS Fonts (all verified `OFL-1.1`):**
  - **Numeric / DOM Ladder / Footprint / Monospace:** **JetBrains Mono (`v2.304`, OFL-1.1)** [R02-S29] (alternatives: **IBM Plex Mono**, OFL-1.1, or **Geist Mono `v1.9.2`**, OFL-1.1) — guarantees identical glyph advance width so rapid `30+ Hz` price/size updates never jitter horizontally.
  - **UI Chrome / Labels / Tables:** **Inter (`v4.1`, OFL-1.1)** [R02-S29] with CSS `font-variant-numeric: tabular-nums` (`tnum`) for compact tabular readouts in toolbars, headers, and blotters.

---

## Options Table (Weighted Criteria)

### Table 1: Desktop Shell Selection

| Option | FOSS & License Purity (20%) | Budgets: `<40MB` / `<2s` / `<300MB` (25%) | Cross-Platform Parity: macOS/Win/Linux (20%) | Rust Core + Chart/UI Ecosystem Fit (20%) | Packaging / Updater / Maturity (15%) | Weighted Score |
|---|---|---|---|---|---|---|
| **1. Tauri v2 (`2.12.x`) + Rust Core** | **5.0** *(MIT/Apache-2.0)* | **4.8** *(3–15 MB installer, fast start, low multi-window RAM)* | 3.7 *(Linux WebKitGTK quirks need explicit guardrails)* | **5.0** *(Native Rust + full Web/LWC/React/Dockview stack)* | **4.8** *(Minisign Ed25519 updater + GitHub Releases `$0`)* | **4.66** |
| **2. Electron (`v45.x`) + Rust N-API / Sidecar** | **5.0** *(MIT)* | 2.1 *(80–150 MB installer fails `<40MB`; heavy multi-window RAM)* | **4.9** *(Identical Chromium WebGL2 across all OSes)* | 4.3 *(Needs Node↔Rust bridge)* | **4.8** *(Mature `electron-updater`)* | **4.09** |
| **3. Wails (`v3.1.x`, Go)** | **5.0** *(MIT)* | 4.5 *(~10–20 MB)* | 3.7 *(Same WebKitGTK quirks)* | 3.2 *(Go backend splits Rust core)* | 3.8 *(v3 recently stabilized)* | **4.08** |
| **4. Dioxus (`v0.7.x`, Rust)** | **5.0** *(MIT/Apache-2.0)* | 4.5 | 3.6 *(Still uses WRY/WebKitGTK)* | 2.5 *(No LWC/Dockview/shadcn native fit)* | 3.0 | **3.80** |
| **5. egui (`v0.37.x`, Rust GPU)** | **5.0** *(MIT/Apache-2.0)* | **5.0** | 4.4 *(Consistent GPU, weaker IME/a11y)* | 2.2 *(100% custom chart & UI build)* | 3.0 *(DIY updater/bundling)* | **4.02** |
| **6. Avalonia (`v12.2`, C#)** | **5.0** *(MIT core)* | 3.6 | 4.4 | 2.2 *(C#/.NET diverges from Rust core)* | 3.8 | **3.79** |
| **7. Flutter (`v3.50`, Dart)** | **5.0** *(BSD-3-Clause)* | 3.8 | 3.4 *(Multi-window experimental; Intel Mac deprecated)* | 2.0 *(Dart FFI + 0 FOSS trading chart base)* | 3.6 | **3.57** |
| **8. Slint (`v1.19`)** | **2.5** *(GPLv3 copyleft or non-OSI Royalty-free)* | **5.0** | 4.3 | 2.0 *(No chart/docking ecosystem)* | 3.0 | **3.46** |

### Table 2: UI Framework & Docking Stack (Inside WebView Shell)

| Option | Ecosystem & Docking Fit (30%) | High-Frequency UI Perf (`30+ Hz` DOM) (25%) | a11y & Settings-as-Code Ergonomics (20%) | AI-Agent & Contributor Velocity (15%) | License & Longevity (10%) | Weighted Score |
|---|---|---|---|---|---|---|
| **A. React `19.3` + Dockview `8.9` (MIT) + shadcn/Radix + Tailwind `4.3` + Zustand `5.1` + TanStack** | **5.0** *(1st-party Dockview, shadcn, TanStack)* | 4.4 *(Canvas2D or rAF-ref DOM Ladder bypasses VDOM)* | **4.9** *(Radix WAI-ARIA + virtualized JSON schema tree)* | **5.0** *(Best AI codegen & contributor pool)* | **4.9** *(MIT/ISC; block `dockview-enterprise`)* | **4.82** |
| **B. SolidJS `2.0` + `dockview-core` + Kobalte + Tailwind** | 3.4 *(Manual docking wrapper; smaller component ecosystem)* | **5.0** *(Fine-grained signals, no VDOM)* | 4.2 *(Kobalte ARIA)* | 3.4 | 4.5 | **4.07** |
| **C. Svelte `5.59` + `dockview-core` + shadcn-svelte + Tailwind** | 3.6 *(Manual docking wrapper)* | 4.7 *(Compiled runes)* | 4.4 *(shadcn-svelte + Bits UI)* | 3.8 | 4.6 | **4.17** |

---

## Recommendation + Rationale

### Primary Stack Recommendation
- **Desktop Shell & Backend:** **Tauri v2 (`2.12.x`) + Rust Core** (MIT/Apache-2.0) with `embedBootstrapper` (`+1.8 MB`) for Windows WebView2 and `tauri-plugin-updater` (`v2.14.1`, Minisign Ed25519 + `requireSignedVersion`) hosted on GitHub Releases (`$0`).
- **IPC Contract (Hot vs Cold Path):**
  - **Hot streaming (`30–60 Hz` DOM Ladder, trade ticks, Footprint updates):** `tauri::ipc::Channel<tauri::ipc::Response>` carrying **packed little-endian SoA binary frames** (fixed-point `i64` ticks & quantities → `ArrayBuffer`, zero JSON, zero per-tick object churn).
  - **Bulk reads (`100k` historical bars, Volume/TPO profiles):** `invoke` returning `tauri::ipc::Response` (or custom async URI scheme `motiveview://`) with packed SoA binary (or Arrow IPC if aligned with R07).
  - **Abstraction Rule:** Wrap all IPC behind a thin TypeScript `TransportAdapter` interface so the UI never couples directly to `@tauri-apps/api` internals — preserving a clean pivot path to Electron if needed.
- **UI & Workspace Layer:** **React `19.3` + TypeScript + Vite + Tailwind CSS `v4.3` + shadcn/ui (Radix Primitives) + Lucide (`ISC`) + Dockview (`dockview` MIT only) + Zustand `v5.1` + TanStack Table/Virtual/Query + JetBrains Mono & Inter (`OFL-1.1`)**.
- **DOM Ladder Architecture:** Render the `30+ Hz` **DOM Ladder** via a **Canvas2D widget** (or rAF-batched imperative cell refs inside a virtualized viewport) subscribed directly to Zustand's non-React transient listener — guaranteeing zero React VDOM re-renders per Book Level update and `0` GC stalls.
- **Signing & Distribution (`$0` Core):**
  - Linux: GPG-signed `.deb`/`.rpm`, **Flathub (Flatpak)**, AppImage, AUR (`$0`).
  - Windows: **SignPath Foundation** (`$0` OSI OSS OV HSM cert once `v0.1` is public) + Winget/Scoop + GitHub Releases SHA-256/Sigstore.
  - macOS: Ad-hoc signed `.dmg` + **Homebrew Cask** (`--no-quarantine`) + documented `xattr` instructions (`$0`); optional `$99/yr` Apple Developer ID notarization documented as a future community-funded milestone.

### Concrete Fallbacks
- **Fallback 1 (Desktop Shell Pivot — Triggered if Spike S04 fails Linux WebKitGTK stability or WebGL2 performance gates on X11/Wayland):** Pivot to **Electron (`v45.x`, MIT) + Rust native sidecar/N-API (`napi-rs`)** over the exact same `TransportAdapter` binary protocol. Requires an explicit Phase 3 ADR revising the `< 40 MB` installer budget to `< 130 MB` in exchange for uniform Chromium WebGL2/WebGPU parity on Linux.
- **Fallback 2 (Docking & Popout Pivot):** If Dockview's browser `window.open()` popout windows conflict with Tauri WebView IPC scopes across platforms, replace popouts with native Tauri `WebviewWindow` instances coordinated via Rust workspace state, or swap Dockview for **FlexLayout (`v0.11.2`, MIT)**.
- **Fallback 3 (DOM Ladder UI Pivot):** If DOM-node rAF updates show layout thrash on Linux WebKitGTK at `60 updates/s`, lock the DOM Ladder exclusively to a pure **Canvas2D** component (zero DOM mutation per tick).

---

## Pre-Declared Phase 2 Spike S04 Hypotheses & Pass/Fail Thresholds (`spikes/S04-shell-ipc-dom/`)

- **Hypothesis:** A Tauri v2 (`2.12.x`) + React `19.3` + Dockview `8.9` + Rust mock feed application can transfer `100,000` packed binary OHLCV bars in `< 50 ms`, stream a live `200`-level **DOM Ladder** at `60 updates/s` (`2×` the `30/s` requirement) at `>= 60 fps` with zero GC stalls, and meet all `[[Constraints]]` #5 resource budgets across macOS Apple Silicon, Linux (X11 + Wayland), and Windows 10/11.
- **Benchmarks Measured:**
  1. **Bundle Size:** Release `.dmg` (macOS), `.msi`/NSIS with `embedBootstrapper` (Windows), and `.deb`/AppImage (Linux) including JetBrains Mono + Inter font subsets.
  2. **Cold Start & Full-Process-Tree Idle RAM:** Measure **entire process tree** (main Rust binary + all WebView/GPU/network helper processes!) — never just the main process PID.
  3. **IPC Throughput:** Compare (a) JSON `invoke`, (b) `tauri::ipc::Response` raw packed SoA binary, (c) custom URI protocol (`motiveview://`), and (d) `Channel<tauri::ipc::Response>` streaming `60 Hz` DOM deltas (plus optional Arrow IPC comparison).
  4. **DOM Ladder Stress Test:** Compare rAF-batched imperative DOM cells vs Canvas2D DOM Ladder at `30 Hz` and `60 Hz` for 5 minutes.
  5. **Linux WebKitGTK Multi-Distro / Compositor Smoke Test:** Test X11 + Wayland (and NVIDIA/Mesa if available) for `Error 71`, resize glitches, and `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` fallback behavior.
- **Pass Thresholds:**
  - Compressed release installer: **`< 20 MB`** (budget `< 40 MB`, leaving `>= 20 MB` headroom for DuckDB/scripting engine).
  - Cold start to interactive first paint: **`< 1.5 s`** (budget `< 2.0 s`).
  - Idle full-process-tree RAM (1 Chart pane + 1 DOM Ladder docked): **`< 250 MB`** (budget `< 300 MB`).
  - `100,000` OHLCV bars (`~4.8 MB` SoA binary) IPC round-trip + JS TypedArray view ready: **`< 50 ms`**.
  - DOM Ladder at `60 updates/s`: **`p95 frame time <= 16.6 ms`** (`>= 60 fps`), **`0` GC stalls `> 20 ms`** over 5 minutes.
  - Linux stability: **`0` crashes / `0` Wayland `Error 71`** across 50 window resize/maximize cycles and live updates.
- **Pivot Trigger:** If Tauri fails Linux WebKitGTK stability or WebGL2 rendering without unacceptably degrading Linux UX -> trigger **Fallback 1 (Electron + Rust sidecar)** with formal budget ADR. If imperative DOM Ladder exceeds `16.6 ms` p95 -> trigger **Fallback 3 (Canvas2D DOM Ladder)**.

---

## Inferences

- **Real-world RAM parity nuance:** 2025–2026 full-process-tree benchmarks show Tauri v2 and Electron are nearly tied on single-window Windows idle RAM (`~142 MB` vs `~149 MB`) because both run Chromium/WebView2 [R02-S03]. Tauri's decisive advantages for MotiveView are (1) **`10×–30×` smaller installers** (easily meeting `< 40 MB`), (2) **`~58%` lower multi-window RAM on macOS** (crucial for multi-monitor trading layouts), and (3) **native Rust backend execution** with zero Node.js heap or JS-bridge overhead for order-book/storage/scripting engines.
- **React + non-VDOM hot path:** Combining React (for Dockview layouts, Radix modals, command palette, virtualized settings trees, and blotters) with imperative/Canvas hot-path widgets (Charts + DOM Ladder) delivers both top-tier UI velocity and zero-GC trading latency.

---

## Risks

1. **Linux WebKitGTK Graphics Fragility (High Impact / High Likelihood):** Wayland + NVIDIA DMA-BUF crashes (`Error 71`), `WEBKIT_DISABLE_DMABUF_RENDERER=1` SIGSEGVs on `2.52+`, and silent software GL fallback threaten "no second-class platform" (`[[Constraints]]` #4) [R02-S04]. *Mitigation:* Gate Linux validation inside Spike S04, avoid transparent window chrome, apply targeted `__NV_DISABLE_EXPLICIT_SYNC=1` / `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` detection only when needed, and preserve the `TransportAdapter` escape hatch to Electron.
2. **Dockview Popout Windows vs Tauri Multi-Window Isolation (Medium Impact / Medium Likelihood):** Dockview's web `window.open()` popouts may behave differently across WKWebView, WebView2, and WebKitGTK (especially Tauri IPC permissions). *Mitigation:* Test multi-window / popout behavior in Spike S04; fallback to native Tauri `WebviewWindow` panels synced via Rust.
3. **Accidental `dockview-enterprise` Contamination (High Impact / Low Likelihood):** Same monorepo contains MIT core and proprietary enterprise packages [R02-S23]. *Mitigation:* Pin MIT packages (`dockview`, `dockview-core`) and enforce automated SPDX license allowlist in CI (`cargo-deny` + npm license checker).
4. **macOS Gatekeeper Friction on `$0` Core (Medium Impact / High Likelihood):** Unsigned/ad-hoc `.dmg` builds trigger scary Gatekeeper blocks on modern macOS (`macOS 26`). *Mitigation:* Ship Homebrew Cask (`--no-quarantine`) as primary macOS install path alongside clear docs; keep optional `$99/yr` notarization decoupled from core builds.

---

## Open Questions

1. **UNVERIFIED — Exact live Azure Artifact Signing USD tier pricing & geographic rules as of `2026-11-24`:** Microsoft's pricing page (`https://azure.microsoft.com/en-us/pricing/details/artifact-signing/`) loads SKU dollar figures via client-side JavaScript (Basic & Premium SKUs confirmed directly on Microsoft Learn; web search corroborated `$9.99/mo` Basic / `$99.99/mo` Premium + `$0.005` overage and US/Canada individual limit). **Human Verification:** Open `https://azure.microsoft.com/en-us/pricing/details/artifact-signing/` in a JS-enabled browser to confirm exact current USD rates if paid Windows signing is ever considered over SignPath (`$0`).
2. **UNVERIFIED — Exact `tauri::ipc::Channel<Response>` vs custom URI protocol throughput on macOS `WKWebView` (`macOS 26.6.2`) & Linux `WebKitGTK` (`2.54+`):** `v2.tauri.app` publishes qualitative guidance rather than numerical MB/s benchmarks [R02-S17]. **Human/Spike Verification:** Measure exact MB/s and p95 latency in `spikes/S04-shell-ipc-dom/`.
3. **UNVERIFIED — Multi-monitor popout window IPC ergonomics in Tauri v2 (`2.12.x`) + Dockview (`8.9.x`):** Does `window.open()` inherit Tauri capabilities cleanly on all 3 OSes, or should detached panels always spawn native `WebviewWindow`s? **Human/Spike Verification:** Validate in Spike S04.

---

## What Would Change This Decision

- **Pivot to Electron (`v45+`) + Rust N-API/Sidecar (Fallback 1):** If Spike S04 demonstrates unresolved WebKitGTK crashes, unacceptable software-GL degradation on standard Linux desktops, or broken multi-window charting on X11/Wayland that violates `[[Constraints]]` #4.
- **Pivot UI Framework to SolidJS:** Only if Spike S04 shows React + imperative/Canvas DOM Ladder cannot maintain `<= 16.6 ms` p95 frame time at `60 updates/s` (unlikely once hot-path cells bypass React reconciliation).
- **Add Paid Signing Certs:** If Abel or future project sponsors opt to fund `$99/yr` Apple Developer notarization (only affects release CI, zero code changes).

---

## Sources

| Source ID | Title / Primary Artifact | URL | Retrieved | How Verified | Confidence |
|---|---|---|---|---|---|
| `R02-S01` | `tauri-apps/tauri` (`tauri 2.12.7`, `tauri-cli 2.12.6`, `wry 0.57.3`, `@tauri-apps/api 2.12.5`, MIT/Apache-2.0) | https://github.com/tauri-apps/tauri | 2026-11-24 | GitHub API (`repos`, root license files, releases) + crates.io + npm | High |
| `R02-S02` | Tauri v2 Windows Installer & WebView2 Distribution Modes (`webviewInstallMode`) | https://v2.tauri.app/distribute/windows-installer/ | 2026-11-24 | Read primary docs (`read_url_content`) + search verification | High |
| `R02-S03` | Independent 2025–2026 Tauri v2 vs Electron Benchmarks (Dawloom Oct 2026, Woliński Nov 2026, Better Stack Jul 2026, Hopp Apr 2025) | https://v2.tauri.app/ | 2026-11-24 | Web search benchmark synthesis (to be locally re-measured in Spike S04) | Medium |
| `R02-S04` | Tauri Linux/NVIDIA/Wayland WebKitGTK Issues (`tauri#9304`, `tauri#14924`, `tauri#16226`) & `WEBKIT_DMABUF_RENDERER_FORCE_SHM` | https://github.com/tauri-apps/tauri/issues/14924 | 2026-11-24 | GitHub API issue search + WebKitGTK/Tauri Linux docs search | High |
| `R02-S05` | `electron/electron` (`v45.5.0`, MIT, 124,074 stars) | https://github.com/electron/electron | 2026-11-24 | GitHub API (`repos`, releases) + npm registry | High |
| `R02-S06` | `wailsapp/wails` (`v3.1.0`, MIT, 37,190 stars) | https://github.com/wailsapp/wails | 2026-11-24 | GitHub API (`repos`, `v3.1.0` release notes) | High |
| `R02-S07` | `DioxusLabs/dioxus` (`v0.7.10`, MIT/Apache-2.0, 39,902 stars) | https://github.com/DioxusLabs/dioxus | 2026-11-24 | GitHub API (`repos`, `LICENSE-MIT`, `LICENSE-APACHE`) + crates.io | High |
| `R02-S08` | `emilk/egui` (`v0.37.0`, MIT/Apache-2.0, AccessKit, 32,470 stars) | https://github.com/emilk/egui | 2026-11-24 | GitHub API (`repos`, `LICENSE-MIT`, `LICENSE-APACHE`, `README.md`) + crates.io | High |
| `R02-S09` | `slint-ui/slint` (`v1.19.1`, Triple License: GPLv3 / Royalty-free 2.0 / Commercial) | https://github.com/slint-ui/slint/blob/master/LICENSE.md | 2026-11-24 | Read `LICENSE.md` via GitHub API + crates.io | High |
| `R02-S10` | `AvaloniaUI/Avalonia` (`v12.2.0`, MIT, 31,869 stars) | https://github.com/AvaloniaUI/Avalonia | 2026-11-24 | GitHub API (`repos`, releases) | High |
| `R02-S11` | Flutter Release Notes (`v3.50.0`/`3.50.1`, BSD-3-Clause, Impeller desktop default, experimental multi-window) | https://docs.flutter.dev/release/release-notes | 2026-11-24 | Read primary docs (`read_url_content`) + GitHub API + official 3.50/3.47 notes | High |
| `R02-S12` | WebKitGTK Official Releases (`webkitgtk-2.54.3`) | https://webkitgtk.org/releases/ | 2026-11-24 | Read primary releases index (`read_url_content`) | High |
| `R02-S13` | Apple Developer Program (`$99/yr` membership, Enterprise `$299/yr`, fee waivers policy) | https://developer.apple.com/programs/ | 2026-11-24 | Read primary Apple page (`read_url_content`) + `compare-memberships` | High |
| `R02-S14` | Microsoft Azure Artifact Signing Overview & Pricing Page (Basic / Premium SKUs) | https://learn.microsoft.com/en-us/azure/artifact-signing/overview | 2026-11-24 | Read primary Microsoft Learn + Azure pricing page (`read_url_content`; dynamic USD numbers noted as `UNVERIFIED`) | Medium |
| `R02-S15` | SignPath Foundation Free Code Signing for Open Source & Terms | https://signpath.org/terms | 2026-11-24 | Read primary homepage & `/terms` (`read_url_content`) | High |
| `R02-S16` | Tauri v2 Updater Plugin (`tauri-plugin-updater 2.14.1`, Minisign Ed25519, `requireSignedVersion`, GitHub Releases) | https://v2.tauri.app/plugin/updater/ | 2026-11-24 | Read primary docs (`read_url_content`) + crates.io + changelog search | High |
| `R02-S17` | Tauri v2 Calling Rust from Frontend (`tauri::ipc::Response` raw bytes, `Request`, custom URI protocol) | https://v2.tauri.app/develop/calling-rust/ | 2026-11-24 | Read primary docs (`read_url_content`) | High |
| `R02-S18` | Tauri v2 Calling Frontend from Rust (`Channel<Response>` streaming vs JSON Events) | https://v2.tauri.app/develop/calling-frontend/ | 2026-11-24 | Read primary docs (`read_url_content`) | High |
| `R02-S19` | Apache Arrow IPC (`arrow-ipc 60.2.0` crate & `apache-arrow 21.2.0` npm, Apache-2.0) | https://crates.io/crates/arrow-ipc | 2026-11-24 | crates.io API + npm registry | High |
| `R02-S20` | `facebook/react` (`v19.3.1`, MIT, 252,872 stars) | https://github.com/facebook/react | 2026-11-24 | GitHub API + npm registry | High |
| `R02-S21` | `solidjs/solid` (`v2.0.3`, MIT) & `kobaltedev/kobalte` (`0.13.14`, MIT) | https://github.com/solidjs/solid | 2026-11-24 | GitHub API + npm registry | High |
| `R02-S22` | `sveltejs/svelte` (`v5.59.1`, MIT) & `huntabyte/shadcn-svelte` (MIT) | https://github.com/sveltejs/svelte | 2026-11-24 | GitHub API + npm registry | High |
| `R02-S23` | `mathuo/dockview` (`v8.9.1`) & `LICENCE.md` (MIT core/react vs proprietary `dockview-enterprise`) | https://github.com/mathuo/dockview/blob/master/LICENCE.md | 2026-11-24 | Read `LICENCE.md` & `README.md` via GitHub API + npm registry | High |
| `R02-S24` | `caplin/FlexLayout` (`flexlayout-react 0.11.2`, MIT) | https://github.com/caplin/FlexLayout | 2026-11-24 | GitHub API (`repos`, `README.md`, releases) + npm registry | High |
| `R02-S25` | `golden-layout/golden-layout` (`v2.6.0`, MIT, last release 2022) | https://github.com/golden-layout/golden-layout | 2026-11-24 | GitHub API (`repos`, `README.md`, releases) + npm registry | High |
| `R02-S26` | `shadcn-ui/ui` (`4.23.0`, MIT), `radix-ui/primitives` (MIT), `tailwindlabs/tailwindcss` (`v4.3.5`, MIT), `lucide-icons/lucide` (`1.79.0`, ISC) | https://github.com/shadcn-ui/ui | 2026-11-24 | GitHub API (`repos`, `LICENSE` files, releases) + npm registry | High |
| `R02-S27` | TanStack Suite: `@tanstack/react-query` (`5.108.4`), `@tanstack/react-table` (`9.3.1`), `@tanstack/react-virtual` (`3.14.28`) (all MIT) | https://github.com/TanStack/table | 2026-11-24 | GitHub API + npm registry | High |
| `R02-S28` | `pmndrs/zustand` (`v5.1.0`, MIT) & `pmndrs/jotai` (`v3.0.2`, MIT) | https://github.com/pmndrs/zustand | 2026-11-24 | GitHub API + npm registry | High |
| `R02-S29` | Tabular-Numeral FOSS Fonts: `JetBrains/JetBrainsMono` (`v2.304`, OFL-1.1), `rsms/inter` (`v4.1`, OFL-1.1), `IBM/plex` (OFL-1.1), `vercel/geist-font` (`v1.9.2`, OFL-1.1) | https://github.com/JetBrains/JetBrainsMono | 2026-11-24 | GitHub API (`repos`, license SPDX, releases) | High |
