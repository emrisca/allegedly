# S02 — Tauri v2 Binary IPC vs Local Loopback Binary WebSocket Throughput Spike

Measures end-to-end Rust → JS binary framing throughput, latency, memory footprint, and 60 fps UI impact on macOS Apple Silicon:

1. **Native Tauri v2 (`tauri 2.12.7`, macOS `WKWebView`):**
   - Bulk `100,000` fixed-point OHLCV bars (`4.8 MB` Struct-of-Arrays little-endian binary via `tauri::ipc::Response` vs JSON `invoke`).
   - Streaming `tauri::ipc::Channel<InvokeResponseBody>` packed binary frames at `10k`, `50k`, and `100k` msgs/sec (batched 16 ms / 60 Hz vs unbatched).
   - Cold start to JS ready + full native process tree RSS (`s02-tauri-ipc` + WebKit helpers).
2. **Rust `tokio-tungstenite` Loopback Binary WebSocket (`ws://127.0.0.1`) + Headless Brave:**
   - Bulk `100,000` OHLCV bars binary SoA vs JSON.
   - Streaming `10k`, `50k`, `100k` msgs/sec (batched 16 ms vs unbatched 0 ms) in binary + JSON baselines, with JS `ArrayBuffer`/`DataView` zero-object-allocation decoding and concurrent `60 fps` `requestAnimationFrame` drop monitoring.

## Reproducible Run Commands

```bash
cd spikes/S02-tauri-ipc-throughput
pnpm install
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target
cargo build --release
pnpm bench
```

Outputs `bench-results.json` and `tauri-bench-results.json`.
