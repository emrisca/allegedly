---
title: "ADR-0002: Desktop Shell, Platform Scope (macOS & Windows v1.0) & Binary IPC Architecture"
type: adr
status: proposed
phase: Phase 3
owner: architect
updated: 2026-11-24
code_refs:
  - spikes/S02-tauri-ipc-throughput/Cargo.toml
  - spikes/S02-tauri-ipc-throughput/src/tauri_bench.rs
  - spikes/S02-tauri-ipc-throughput/src/framing.rs
  - spikes/S02-tauri-ipc-throughput/bench-results.json
  - spikes/S02-tauri-ipc-throughput/tauri-bench-results.json
  - spikes/S03-dockview-multiwindow/src/
---

# ADR-0002: Desktop Shell, Platform Scope (macOS & Windows v1.0) & Binary IPC Architecture

- **Status:** Proposed (Draft for Red-Team Review)
- **Date:** `2026-11-24`
- **Owner:** Architect (Workstream A — Shell, Charting, GPU, IPC & UI)
- **Decides:** Desktop application shell, v0.1–v1.0 OS target matrix, Rust-to-UI binary IPC protocol, and multi-monitor pop-out mechanism.

---

## 1. Context

Allegedly (`Apache-2.0`, `$0` core, local-first) must deliver a lightweight desktop trading and order-flow terminal meeting the charter budgets in [[Constraints]] #5 and [[Principles]] (`SV-13`, `SV-20`): `<= 40 MB` compressed installer, `< 2.0 s` cold start to interactive chart, **`< 300 MB` idle RAM** (1 chart + 1 DOM), `< 50 ms` bulk `100k`-bar load, and `>= 50,000 msgs/s` live streaming throughput without blocking the `60 fps` render loop or leaking IEEE-754 floats across the financial boundary.

Research [[R02-Shell-UI-Stack]] narrowed the shell candidates to **Tauri v2**, **Electron**, **pure-Rust GUI frameworks** (`egui`/`iced`/`Dioxus`), and **Wails v3**, identifying two key Phase 2 risks:
1. Whether Tauri v2's IPC could push `100k` Bars in `< 50 ms` and sustain `50k+` ticks/sec without JSON serialization bottlenecks.
2. Linux `WebKitGTK` WebGL2/Wayland variance (`RK-01`).

Phase 2 Spike [[S02-Tauri-IPC-Throughput]] empirically tested native Tauri v2 (`tauri 2.12.7`, `wry 0.57.4`, `tao 0.37.3`) on macOS `26.6.2` (Apple M2) alongside a loopback WebSocket baseline (`tokio-tungstenite 0.26.2`), while project governance locked **macOS (Apple Silicon + Intel) and Windows 10/11** as the v0.1–v1.0 shipping platforms and explicitly **deferred Linux (X11/Wayland) to post-v1.0**.

---

## 2. Options & Weighted Criteria

Criteria weights reflect [[Constraints]] and [[R02-Shell-UI-Stack]]:
- **Installer & Memory Footprint (25%)** — Staying inside `<= 40 MB` installer and **`< 300 MB` idle RAM** budgets (`Constraints` #5, `SV-13`).
- **IPC Throughput & Latency (25%)** — `< 50 ms` bulk `100k` Bars and `>= 50k msgs/s` live stream at `60 fps`.
- **Rust Core Integration & Safety (20%)** — Zero-FFI-friction access to `allegedly-core`, `allegedly-ingest`, `allegedly-storage`, `allegedly-orderflow`, and `allegedly-oms`.
- **UI & Chart Ecosystem Velocity (20%)** — Native compatibility with `Lightweight Charts v5.3.0`, WebGL2, React 19, `ui-sdk`, and Dockview `8.9.1`.
- **Cross-Platform Maintenance (macOS & Windows v1.0, Linux post-v1.0) (10%)** — Packaging, auto-updater, multi-monitor pop-outs.

| Option | Installer & RAM (25%) | IPC Perf (25%) | Rust Integration (20%) | UI Ecosystem (20%) | Platform & Packaging (10%) | Weighted Score (/5.0) |
|---|---:|---:|---:|---:|---:|---:|
| **A. Tauri v2 (`2.12.7`) + Binary SoA/Channel IPC + `TransportAdapter`** *(Selected)* | **4.6** (`2.68 MB` gzip core binary; OS WebView) | **5.0** (`3.0 ms` bulk `100k` Bars; `100,450 msgs/s` @ `3 ms` p99) | **5.0** (Single native Rust process, zero C/N-API glue) | **4.6** (Full WebView DOM/WebGL2/Canvas2D + React 19/`ui-sdk`) | **4.2** (Signed `.dmg`/`.msi` + Minisign updater; `WebView2` `UNVERIFIED`) | **4.74** |
| **B. Electron (`v45.5.0`, MIT) + Rust `napi-rs`/Sidecar** *(Pre-approved Fallback)* | **2.0** (Bundled Chromium `~90–120+ MB` installer; higher idle RAM) | **4.4** (`Loopback WS` / `napi-rs` proven fast; IPC boundary extra hop) | **3.2** (Requires `napi-rs` ABI bridge or child process management) | **5.0** (Identical Chromium engine on macOS/Windows/Linux) | **4.6** (Mature multi-window + auto-update) | **3.70** |
| **C. Pure Rust Immediate/Retained GUI (`egui v0.37` / `iced` / `Dioxus v0.7`)** | **5.0** (Smallest binary & lowest RAM) | **5.0** (In-process zero-IPC memory access) | **5.0** (100% Rust) | **1.8** (No `Lightweight Charts`, no `ui-sdk`, no mature MIT docking/text/a11y parity) | **3.5** (Custom IME/accessibility/screen-reader work on macOS/Win) | **4.21** |
| **D. Wails v3 (`v3.1.0`, Go)** | **4.0** (OS WebView) | **3.8** (Requires CGO bridge into Rust core) | **1.5** (Go host fighting Rust core crates) | **4.6** (WebView ecosystem) | **3.8** (Less mature Rust tooling) | **3.55** |

*Why Option A beats Option C despite Option C's raw RAM score:* Building a full institutional charting engine, drawing suite, docking workbench, accessible Command Palette, and WCAG AA property inspector from scratch in `egui`/`iced` would violate Allegedly's Adopt-First charter (`[[Adopt-Build-Fork]]`) and add `12–18+` months to v0.1.

---

## 3. Decision

1. **Adopt Tauri v2 (`tauri 2.12.7`, `wry 0.57.4`, `tao 0.37.3`, `Apache-2.0 OR MIT`)** as Allegedly's single-process desktop shell (`allegedly-app`), paired with its opt-in signed Minisign Ed25519 GitHub Releases auto-updater (`tauri-plugin-updater`).
2. **Lock Platform Scope for `v0.1`–`v1.0` to macOS (`arm64` + `x86_64`, `WKWebView`) and Windows 10/11 (`x86_64`, `WebView2`).** Explicitly **defer Linux (X11/Wayland `WebKitGTK`) to post-v1.0** (`RK-01` → Deferred Post-v1.0). All Rust crates, WebGL2 shaders, and `TransportAdapter` interfaces remain OS-portable so Linux support can be enabled post-v1.0 without an architectural rewrite.
3. **Mandate Zero-Float Binary IPC (`IPC Contract v1`) Behind `TransportAdapter`:**
   - **Bulk Historical Reads:** Use `tauri::ipc::Response` carrying little-endian `i64` Structure-of-Arrays (SoA) binary payloads (`24 B` 8-byte-aligned header, `MAGIC_ALG2 = 0x414C4732`), decoded via zero-copy `BigInt64Array` views (`S02`: **`3.0 ms` median / `5.0 ms` p95 / `0.00 ms` JS decode** for `100,000` Bars = `4,800,016 B` — **`9.7×`** faster than Tauri JSON `invoke` at `29.0 ms`).
   - **Live Streaming Data:** Use `tauri::ipc::Channel<InvokeResponseBody>` (`InvokeResponseBody::Raw(Vec<u8>)`) with **mandatory `16 ms` (`60 Hz`) frame batching** (`S02`: **`100,450 msgs/s`**, `3.07 MB/s`, `1/2/3 ms` p50/p95/p99 RTT, `100%` delivery, `0.00 ms` decode). Unbatched (`0 ms`) streaming is prohibited in production due to `6.3×–9.2×` p99 latency spikes (`13 ms` at `50k msgs/s` on Tauri; `8.3 ms` + `+49%` wire overhead on WS).
   - **Shell Portability:** Keep `LoopbackWsTransportAdapter` (`tokio-tungstenite 0.26.2`) maintained as a first-class secondary adapter for headless Playwright CI benchmarks and as the zero-rewrite escape hatch to Electron (`v45.x`, `MIT`) if `WebView2` hits a blocker.
4. **Use Native Tauri `WebviewWindow` + Rust Workspace State Hub for Multi-Monitor Pop-Outs:** Do not rely on browser `window.open()` for detached trading panels (`S03` flagged Tauri v2 `window.open()` IPC capability inheritance across `WKWebView`/`WebView2` as `UNVERIFIED`). Native `WebviewWindow` instances receive explicit Tauri v2 capability scopes (`capabilities/`) and sync via the Rust hub in `allegedly-ipc` (`0.20 ms` p50 / `0.60 ms` p95 RTT measured in `S03`, protected by `state_rev: u64`), with `BroadcastChannel` (`0.30 ms` p50 / `0.60 ms` p95 RTT) as an optional same-origin transient crosshair accelerator.

---

## 4. Consequences

### Positive
- **Charter Installer Budget Headroom:** `s02-tauri-ipc` release binary measured `10 MB` raw / **`2.68 MB` (`2,808,734 B`) gzip** on `arm64` macOS; combined with `S08` Parquet/SQLite (`+2.91 MiB` gzip) and `S07` Wasmtime + Luau (`+2.20 MiB` exact combined gzip-9: `1,821,553 + 490,473 = 2,312,026 B`), the core Rust footprint stays near `~7.8 MB` gzipped, leaving massive margin under `<= 40 MB`.
- **Sub-5 ms Bulk Loads & `100k+ msgs/s` Headroom:** Clears `< 50 ms` bulk target by **`16.7×`** (`3.0 ms`) and `>= 50k msgs/s` streaming target by **`2.0×`** (`100,450 msgs/s`) with `0.00 ms` JS decode overhead.
- **Single-Process Fault & Secret Isolation:** OS Keychain (`keyring-core`) stays strictly inside Rust; WebView crashes or window reloads never drop live exchange sockets, L2 order books, tick-vault writes, or OMS risk guards.
- **Focused v1.0 QA Matrix:** Deferring Linux `WebKitGTK` eliminates the highest-variance WebView graphics/Wayland surface (`RK-01`) during v0.1–v1.0 delivery.

### Negative
- **Dual WebView Engine Testing (`WKWebView` vs `WebView2`):** Unlike Electron's single Chromium engine, WebGL2 shaders, font metrics, and binary IPC must be verified in CI on both Apple `WKWebView` and Microsoft `WebView2` (Chromium).
- **Custom Multi-Window Bridge:** Spawning native `WebviewWindow` panels requires a thin Rust state-hub bridge rather than pure DOM `window.open()` pop-outs.

### Risks & Explicit `UNVERIFIED` Gaps
1. **Windows `WebView2` Binary IPC & WebGL2 (`UNVERIFIED`):** All `S02` measurements ran on macOS `26.6.2` `WKWebView` (`Apple M2`). Windows 10/11 `WebView2` binary `tauri::ipc::Response` / `Channel<InvokeResponseBody>` throughput, RTT, and ANGLE D3D11 WebGL2 latency remain **`UNVERIFIED`** until `v0.1` Implementation CI (post-Phase-5) executes the Windows S01/S02 harness.
2. **Packaged Cold Start (`UNVERIFIED`):** `S02`'s unsigned dev binary took `2,330.99 ms` on first launch, skewed by synchronous `200k`-bar fixture generation inside `main()` and macOS first-run AMFI verification. Signed `.app`/`.msi` cold start with async lazy vault loading must be measured in `v0.1` Implementation CI (post-Phase-5) to verify `< 2.0 s`.
3. **Full OS Process-Tree RAM (`UNVERIFIED`):** `S02` measured the Rust PID at `110.19 MB` RSS, which excludes `launchd`-parented macOS `com.apple.WebKit.WebContent` / `GPU` XPC helper processes. `v0.1` Implementation CI (post-Phase-5) must measure full process-tree RSS on both macOS (including XPC helpers) and Windows (`msedgewebview2.exe` child tree) against the locked **`< 300 MB`** Charter budget (`Constraints` #5, `SV-13`).

---

## 5. Reversal Cost

- **Medium (2–3 Engineering Weeks) to Pivot to Electron (`v45.x`, `MIT`):** Because all UI code communicates strictly through `TransportAdapter` (and `LoopbackWsTransportAdapter` is already implemented and benchmarked at `19.5 ms` bulk / `100,432 msgs/s` @ `60.0 fps` in `S02`), moving the shell from Tauri v2 to Electron requires replacing only `apps/desktop/src-tauri` with an Electron main process spawning the unchanged Rust core binary as a local authenticated loopback daemon (or `napi-rs` native module). All Rust crates (`allegedly-*`) and React/LWC/WebGL2/Canvas2D packages remain untouched.
- **High (Months) to Pivot to Pure-Rust GUI (`egui`/`iced`):** Would require discarding the entire WebView UI, `Lightweight Charts`, `ui-sdk`, and `Dockview`.

---

## 6. Revisit Trigger

Reopen this ADR and evaluate the pre-approved **Electron + Rust Loopback/N-API** fallback if any of the following fail during `v0.1` Implementation CI (post-Phase-5, macOS + Windows):
1. **Windows `WebView2` IPC Regression:** Bulk `100k`-bar binary `invokeBinary` p95 exceeds **`25 ms`** (half the `50 ms` charter cap) or `16 ms`-batched `Channel` throughput drops below **`50,000 msgs/s`** or exceeds **`10 ms` p99 RTT**.
2. **Cold-Start or Full-Tree RAM Breach:** Signed packaged cold start exceeds **`2.0 s`** after moving all data loading off `main()`, or verified 1-chart + 1-DOM full process-tree idle RSS exceeds **`300 MB`** (`Constraints` #5, `SV-13`) due to unfixable WebView memory overhead.
3. **Multi-Monitor Pop-Out Blocker:** Native Tauri `WebviewWindow` displays broken DPI scaling, focus stealing, or `> 10 ms` p95 cross-window sync latency on Windows `WebView2` or macOS `WKWebView` multi-monitor setups.

---

## 7. Evidence Links

- [[R02-Shell-UI-Stack]] — Desktop shell evaluation, Tauri v2 vs Electron vs pure-Rust trade-offs, license audit.
- [[S02-Tauri-IPC-Throughput]] — Empirical macOS `WKWebView` & loopback WS benchmarks (`3.0 ms` bulk, `100,450 msgs/s` batched, `2.68 MB` gzip binary).
- [[S03-Dockview-Multiwindow]] — Cross-window sync latency (`0.20–0.30 ms` p50 / `0.60 ms` p95) and native Tauri pop-out recommendation.
- [[IPC-Contract]] — Full `v1` binary framing specification and `TransportAdapter` interface.
- [[C4-Architecture]] — Process topology and charter resource budget rollup.
- [[Constraints]] — Charter installer (`<= 40 MB`), cold start (`< 2.0 s`), idle RAM (`< 300 MB`), and fixed-point mandates.
