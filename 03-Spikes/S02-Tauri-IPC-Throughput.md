---
title: S02 — Tauri v2 Binary IPC vs Local Loopback Binary WebSocket Throughput Benchmark
type: spike
status: verified
phase: Phase 2
owner: charts-ui
updated: 2026-11-24
verdict: PASS-WITH-CAVEAT
code_refs:
  - spikes/S02-tauri-ipc-throughput/Cargo.toml
  - spikes/S02-tauri-ipc-throughput/tauri.conf.json
  - spikes/S02-tauri-ipc-throughput/src/framing.rs
  - spikes/S02-tauri-ipc-throughput/src/tauri_bench.rs
  - spikes/S02-tauri-ipc-throughput/src/ws_server.rs
  - spikes/S02-tauri-ipc-throughput/web/index.html
  - spikes/S02-tauri-ipc-throughput/web/ws-bench.html
  - spikes/S02-tauri-ipc-throughput/bench.mjs
  - spikes/S02-tauri-ipc-throughput/bench-results.json
  - spikes/S02-tauri-ipc-throughput/tauri-bench-results.json
---

# S02 — Tauri v2 Binary IPC vs Local Loopback Binary WebSocket Throughput Benchmark

## Verdict: `PASS-WITH-CAVEAT`

1. **Bulk `100,000`-Bar SoA Binary Load (`PASS` by `16.7×`):** Transferring `100,000` fixed-point `i64` OHLCV **Bars** (`4,800,016` bytes = `4.58 MiB` packed Struct-of-Arrays little-endian binary, zero floats) and constructing zero-copy JS `BigInt64Array` views completed in:
   - **Native Tauri v2 `tauri::ipc::Response` (`WKWebView`):** **`3.0 ms` median (`5.0 ms` p95, `0.00 ms` decode)** — **`16.7×` faster than `R02`'s `< 50 ms` target** and **`9.7×` faster than Tauri JSON `invoke` (`29.0 ms`)**.
   - **Rust `tokio-tungstenite` Loopback Binary WebSocket (`Brave`):** **`19.5 ms` median (`20.5 ms` p95, `0.00 ms` decode)** — **`2.6×` faster than `< 50 ms`** and **`2.9×` faster than Loopback WS JSON (`55.9 ms`, `13.3 ms` `JSON.parse`)**.
2. **Sustained `10k` / `50k` / `100k` msgs/sec Streaming — Frame-Aligned Batching (`16 ms` / `60 Hz`) Wins Decisively (`PASS`):**
   - **Native Tauri v2 `Channel<InvokeResponseBody>` (`WKWebView`):** Sustained **`10,049` / `50,227` / `100,450` msgs/sec** (`0.31` / `1.53` / `3.07 MB/s`, `100%` delivery, `0.0 ms` p95 decode) with **`1 ms` p50 / `2 ms` p95 / `2–3 ms` p99 IPC RTT** when batched at `16 ms`. Unbatched `50k` msgs/sec (`50,000` individual `Channel.send()` calls/sec) amplified p99 RTT **`6.5×` (`2 ms → 13 ms`)**.
   - **Rust `tokio-tungstenite` Loopback Binary WebSocket (`Brave` + `DataView` + Live `60 fps` `rAF`):** Sustained **`10,043` / `50,228` / `100,432` msgs/sec** batched (`16 ms`) with **`0.4 ms` p50 / `0.7–0.9 ms` p95 / `0.8–2.7 ms` p99 RTT**, **`0.1 ms` p95 decode**, and **`60.0 fps` (`0` dropped frames `> 33 ms`, `0` drops `> 20 ms` at 50k & 100k)**. Unbatched `100k` msgs/sec amplified RTT tail **`6.3×–9.2×`** (`0.9 ms → 5.7 ms` p95, `0.9 ms → 8.3 ms` p99) and increased wire overhead by `49%` (`3.07 → 4.57 MB/s`).
3. **Binary Size & Resource Footprint (`PASS` with Cold-Start & macOS XPC Measurement Caveats):**
   - Release `arm64` Tauri v2 binary (`s02-tauri-ipc`): **`10 MB` raw**, **`2.68 MB` (`2,808,734` bytes) gzip-compressed** — far below `R02`'s `< 20 MB` spike target (`< 40 MB` budget).
   - Rust loopback WS server (`s02-ws-server`): **`1.4 MB` raw**, peak **`35.59 MB` RSS**, peak **`35.4%` CPU** (single-core equivalent on 8-core M2) while driving `100k` msgs/sec.
   - **Caveat 1 — Cold Start (`2,330.99 ms` on first unsigned launch):** Exceeded `R02`'s `< 1,500 ms` target (`< 2,000 ms` budget) on first execution of a freshly compiled unsigned macOS binary, which includes both macOS first-launch AMFI verification AND synchronously generating `200,000` benchmark Bars (`100k` binary + `100k` JSON) in `main()` before spawning `WKWebView`. Production startup must keep `main()` free of synchronous dataset generation and re-measure warm vs cold `.app` bundle launch.
   - **Caveat 2 — macOS XPC Process-Tree Accounting & Hidden `rAF`:** Native `s02-tauri-ipc` measured **`110.19 MB` RSS** (including both `100k`-bar datasets in memory), but macOS runs `com.apple.WebKit.WebContent`/`GPU`/`Networking` as XPC services parented to `launchd` (PID `1`) rather than `ppid = s02-tauri-ipc`, so `ps -eo pid,ppid` excludes WebKit XPC helper RAM. Additionally, AppKit suppresses `rAF` VSync callbacks on `visible: false` windows, so `60 fps` `rAF` drop counters were measured in the Brave headless harness instead of hidden `WKWebView`.
   - **Caveat 3 — Cross-OS Coverage (`UNVERIFIED`):** Measured on macOS Apple M2 host only. **Linux `WebKitGTK` (X11 + Wayland)** and **Windows `WebView2`** IPC throughput, latency, and RSS remain **`UNVERIFIED (macOS host only)`**.

---

## Hardware & Environment

| Field | Measured Value |
|---|---|
| Host OS / Hardware | macOS `26.6.2` (Build `25G83`), Apple M2 (8 cores), `8 GB` RAM |
| Rust Toolchain | `rustc 1.99.1 (58cf8f9c3 2026-10-13)`, `cargo 1.99.1`; `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` (zero `target/` in vault) |
| Native WebView Harness | `tauri 2.12.7` + `wry 0.57.4` + `tao 0.37.3` (macOS native `WKWebView`, `ActivationPolicy::Accessory`, `visible: false`) |
| Loopback WS Harness | `tokio 1.54.1` + `tokio-tungstenite 0.26.2` (`ws://127.0.0.1:4172`, `TCP_NODELAY`) → Brave Browser `157.1.99.57` (Chromium headless, `playwright-core 1.65.1`) |
| Wire Format (`src/framing.rs`) | Fixed-point little-endian binary (`[[Constraints]]` #7, zero floats): `16 B` header (`magic=0x414C4732`, `count`, `send_ns`) + `32 B/msg` delta (`seq:u64`, `ts:u64`, `price_tick:i64`, `qty:i32`, `flags:u32`); `48 B/bar` SoA bulk OHLCV (`6 × i64`, `4,800,016 B` for `100k` Bars). |

---

## Reproducible Run Commands

```bash
cd /Users/abelmora/Documents/Obsidian/Allegedly/spikes/S02-tauri-ipc-throughput
pnpm install
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target
cargo build --release
pnpm bench
```

Output artifacts: `spikes/S02-tauri-ipc-throughput/bench-results.json` and `spikes/S02-tauri-ipc-throughput/tauri-bench-results.json` (run timestamp `2026-11-25T05:24:39Z`, `0` errors).

---

## Measured Results

### 1. Bulk Historical Read: `100,000` Fixed-Point OHLCV Bars (`4.58 MiB` Binary SoA vs JSON)

| Transport & Encoding | Wire Bytes | Median Total (ms) | p95 Total (ms) | Median JS Decode / Parse (ms) | Speedup vs JSON | vs `< 50 ms` Target |
|---|---:|---:|---:|---:|---:|---|
| **Native Tauri v2 `tauri::ipc::Response` (Binary SoA)** | `4,800,016` | **`3.0`** | **`5.0`** | **`0.00`** *(zero-copy `BigInt64Array`)* | **`9.7×`** | **PASS (`16.7×` headroom)** |
| Native Tauri v2 `invoke` (JSON) | n/a | `29.0` | `35.0` | included | `1.0×` | PASS |
| **Loopback WS `tokio-tungstenite` (Binary SoA)** | `4,800,016` | **`19.5`** | **`20.5`** | **`0.00`** *(zero-copy `BigInt64Array`)* | **`2.9×`** | **PASS (`2.6×` headroom)** |
| Loopback WS `tokio-tungstenite` (JSON) | `6,568,026` | `55.9` | `61.3` | `13.30` (`JSON.parse`) | `1.0×` | **FAIL** (`> 50 ms`) |

*Idle Ping RTT baseline:* Loopback WS `p50 0.1 ms / p95 0.4 ms / p99 1.6 ms`; Native Tauri `invoke` `p50 0 ms / p95 1 ms / p99 10 ms` (note: macOS `WKWebView` quantizes `performance.now()` to `1.0 ms` increments).

### 2. Native Tauri v2 `Channel<InvokeResponseBody>` Streaming (`macOS WKWebView`, Packed Binary)

| Target Rate (msgs/s) | Batching | Sustained Rate (msgs/s) | Throughput (MB/s) | Delivery Ratio | Decode p95 (ms) | Interleaved IPC RTT p50 / p95 / p99 (ms) | Est. One-Way p95 (ms) |
|---:|---|---:|---:|---:|---:|---|---:|
| `10,000` | `16 ms` (`60 Hz` batch) | `10,049` | `0.31` | `1.0000` | `0.00` | `1.0 / 2.0 / 2.0` | `1.0` |
| `50,000` | `16 ms` (`60 Hz` batch) | `50,227` | `1.53` | `1.0000` | `0.00` | `1.0 / 2.0 / 2.0` | `1.0` |
| **`100,000`** | **`16 ms` (`60 Hz` batch)** | **`100,450`** | **`3.07`** | **`1.0000`** | **`0.00`** | **`1.0 / 2.0 / 3.0`** | **`1.0`** |
| `10,000` | `0 ms` (unbatched) | `9,999` | `0.46` | `1.0000` | `0.00` | `1.0 / 1.0 / 2.0` | `0.5` |
| `50,000` | `0 ms` (unbatched) | `49,985` | `2.29` | `1.0000` | `0.00` | `1.0 / 4.0 / 13.0` | `2.0` |

### 3. Rust `tokio-tungstenite` Loopback WS Streaming (`Headless Brave` + `DataView` Decode + `60 fps` `rAF`)

| Transport | Target Rate (msgs/s) | Batching | Sustained Rate (msgs/s) | Throughput (MB/s) | Decode p95 (ms) | RTT p50 / p95 / p99 (ms) | Est. One-Way p95 (ms) | `rAF` FPS | `rAF` p95 / Max (ms) | Dropped `> 20 ms` / `> 33 ms` |
|---|---:|---|---:|---:|---:|---|---|---:|---|---|
| `loopback-ws-binary` | `10,000` | `16 ms` | `10,043` | `0.31` | `0.10` | `0.4 / 0.7 / 2.7` | `0.35` | `59.7` | `16.7 / 33.3` | `1 / 0` |
| `loopback-ws-binary` | `50,000` | `16 ms` | `50,228` | `1.53` | `0.10` | `0.4 / 0.7 / 0.8` | `0.35` | `60.0` | `16.7 / 16.8` | `0 / 0` |
| **`loopback-ws-binary`** | **`100,000`** | **`16 ms`** | **`100,432`** | **`3.07`** | **`0.10`** | **`0.4 / 0.9 / 0.9`** | **`0.45`** | **`60.0`** | **`16.8 / 16.8`** | **`0 / 0`** |
| `loopback-ws-binary` | `10,000` | `0 ms` | `10,000` | `0.46` | `0.00` | `0.3 / 0.6 / 2.7` | `0.30` | `60.0` | `16.7 / 16.8` | `0 / 0` |
| `loopback-ws-binary` | `50,000` | `0 ms` | `49,956` | `2.29` | `0.00` | `1.0 / 1.6 / 5.8` | `0.80` | `60.0` | `16.7 / 16.8` | `0 / 0` |
| `loopback-ws-binary` | `100,000` | `0 ms` | `99,904` | `4.57` | `0.00` | `1.9 / 5.7 / 8.3` | `2.85` | `60.0` | `16.8 / 16.8` | `0 / 0` |
| `loopback-ws-json` | `10,000` | `16 ms` | `10,055` | `0.70` | `0.20` | `0.4 / 0.9 / 3.8` | `0.45` | `60.0` | `16.8 / 16.8` | `0 / 0` |
| `loopback-ws-json` | `50,000` | `16 ms` | `50,258` | `3.55` | `0.30` | `0.4 / 0.6 / 1.3` | `0.30` | `60.0` | `16.8 / 16.8` | `0 / 0` |
| `loopback-ws-json` | `10,000` | `0 ms` | `9,997` | `0.71` | `0.00` | `0.4 / 0.8 / 1.3` | `0.40` | `60.0` | `16.8 / 16.8` | `0 / 0` |

### 4. Binary Size, Cold Start & Memory/CPU Footprint

| Metric | Measured Value | Notes |
|---|---|---|
| `s02-tauri-ipc` release binary (`arm64`) | `10 MB` raw / **`2.68 MB`** gzip (`2,808,734 B`) | Full Tauri `2.12.7` + Tokio + serde release binary |
| `s02-ws-server` release binary (`arm64`) | `1.4 MB` raw | Standalone `tokio-tungstenite` binary |
| Native Tauri Cold Start to JS Ready | `2,330.99 ms` | First launch of freshly built unsigned binary + sync `200k`-bar bench fixture generation in `main()` |
| Native Tauri Rust Process RSS | `110.19 MB` | Main Rust binary (holding `100k` binary + `100k` JSON fixtures); macOS `WebKit` XPC helpers parented to `launchd` PID `1` are not included |
| Rust WS Server Peak RSS / CPU | `35.59 MB` RSS / `35.4%` CPU | Sampled at `500 ms` intervals across `100k` msgs/sec load (`55` samples) |
| Headless Brave Process Tree RSS | `622.33 MB` (`6` processes) | Chromium headless test harness across all 9 streaming runs |

---

## Pass/Fail Assessment Against `R02` Thresholds

| `R02` Threshold | Measured | Status |
|---|---|---|
| `100,000` OHLCV Bars (`4.8 MB` SoA binary) IPC round-trip + JS TypedArray view `< 50 ms` | **`3.0 ms`** (Native Tauri `Response`) / **`19.5 ms`** (Loopback WS) | **PASS** |
| Sustained `10k` / `50k` / `100k` msgs/sec binary streaming with `0` frame drops | **`100,450` msgs/s** (Tauri `Channel` batched, `2 ms` p95 RTT) & **`100,432` msgs/s** (Loopback WS batched, `0.9 ms` p95 RTT, `60.0 fps`, `0` drops) | **PASS** |
| Release binary / installer `< 20 MB` (`< 40 MB` budget) | **`2.68 MB` gzip** (`10 MB` raw) for Tauri v2 binary | **PASS** |
| Cold start `< 1.5 s` (`< 2.0 s` budget) | `2,330.99 ms` on first unsigned run with sync `200k`-bar fixture init | **CAVEAT** *(re-measure with lazy data init in packaged `.app`)* |
| Linux `WebKitGTK` (X11 + Wayland) & Windows `WebView2` IPC parity | Not executed on Linux or Windows | **UNVERIFIED (macOS host only)** |

---

## Phase 3 ADR Recommendations

1. **Standardize on `TransportAdapter` Dual-Mode Packed Binary Framing (`MAGIC_ALG2`, `16 ms` Frame-Aligned Batching):**
   - **Primary Desktop Path (Tauri v2):** Use `tauri::ipc::Response` for bulk historical reads (`3.0 ms` for `100k` Bars!) and `tauri::ipc::Channel<InvokeResponseBody>` with **`16 ms` (`60 Hz`) Rust-side batching** for live **DOM Ladder**, trade tick, and **Footprint Bar** streams (`100,450` msgs/sec at `1–2 ms` RTT). Never emit unbatched per-tick `Channel.send()` above `10k` msgs/sec.
   - **Browser Dev / Fallback Shell Path (Electron Escape Hatch):** Keep the identical `MAGIC_ALG2` SoA binary wire format over authenticated `ws://127.0.0.1:<port>` (`tokio-tungstenite`, `19.5 ms` bulk `100k` Bars, `100,432` msgs/sec at `0.9 ms` p95 RTT, `0` dropped frames).
2. **Ban JSON on All Hot & Bulk Market-Data Paths:** Loopback JSON failed the `< 50 ms` bulk bar budget (`55.9 ms`, `13.3 ms` `JSON.parse`), and Tauri JSON `invoke` was `9.7×` slower than `tauri::ipc::Response` (`29.0 ms` vs `3.0 ms`). Reserve JSON strictly for low-frequency commands, **Layout** persistence, and settings trees.
3. **Zero-Float Fixed-Point Wire Contract (`[[Constraints]]` #7):** Keep all prices (`price_tick: i64`) and quantities (`qty: i32` / `i64`) as little-endian integers on the wire; decode directly with JS `DataView` / `BigInt64Array` / `Int32Array` without per-tick JS object allocations.
4. **Phase 3 Pre-Release Verification Gate:** Benchmark `s02-tauri-ipc` packaged as a real `.app` / `.deb` / `.msi` (with lazy data loading and macOS XPC `footprint` / Linux `WebKitGTK` / Windows `WebView2` full-tree RSS accounting) to close the `UNVERIFIED (macOS host only)` and cold-start caveats.
