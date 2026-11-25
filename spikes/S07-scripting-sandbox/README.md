# Allegedly Phase 2 Spike S07: Scripting & Study Sandbox Shootout

Runnable Rust shootout comparing **4 study execution runtimes** on an identical fixed-point bar workload (`EMA-20 + RSI-14 Wilder + Session-Anchored VWAP ±2σ + Stateful Crossover Strategy` over `100,000` historical bars + `10,000` single-bar live ticks):

1. **Native Rust (`mv-studies`)** — zero-allocation O(1) baseline with `commit_snapshot` / `rollback` semantics.
2. **Wasmtime (`v51.0.0`)** — Cranelift JIT guest (`guest-wasm`, `wasm32-unknown-unknown`) with fuel metering, `64 MiB` `StoreLimits`, and zero WASI/FS/Net imports.
3. **Rhai (`v1.27.0`)** — pure-Rust embedded scripting engine with `max_operations`, call-depth, string/array/map caps.
4. **Luau (`mlua v0.12.3`, `luau` feature)** — gradual-typed Lua derivative with `sandbox(true)`, `64 MiB` memory limit, and VM instruction interrupt callback.

## Layout

- `src/main.rs` — Benchmark harness, 10-study live tick mix gate, MTF/rollback determinism check, hostile sandbox escape suite, and `#[cfg(test)]` unit tests.
- `src/dataset.rs` — Deterministic XorShift64 fixed-point ES bar generator.
- `src/native_study.rs` — Native Rust reference study with intrabar rollback.
- `src/wasmtime_runner.rs`, `src/rhai_runner.rs`, `src/luau_runner.rs` — Runtime runners & hostile-script escape tests.
- `src/mtf_test.rs` — 1m + 15m HTF non-repainting batch-vs-live and intrabar rollback determinism tests.
- `guest-wasm/` — `cdylib` `wasm32-unknown-unknown` study & hostile entrypoint crate.
- `size-probes/` — Isolated stripped `opt-level = "z"`, `lto = true`, `strip = true` binaries (`probe-baseline`, `probe-wasmtime`, `probe-rhai`, `probe-luau`) to measure exact binary size delta.

## Reproducible Commands

Always keep build artifacts outside the Obsidian vault:

```bash
export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target

# 1. Build WASM guest
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path spikes/S07-scripting-sandbox/guest-wasm/Cargo.toml

# 2. Run unit tests (4-runtime parity, MTF/rollback determinism, all 12 hostile sandbox tests)
cargo test --release --manifest-path spikes/S07-scripting-sandbox/Cargo.toml

# 3. Run full 100k-bar + 10k-tick shootout & hostile suite
cargo run --release --manifest-path spikes/S07-scripting-sandbox/Cargo.toml

# 4. Build & measure stripped size probes
cargo build --release --manifest-path spikes/S07-scripting-sandbox/size-probes/Cargo.toml
for b in probe-baseline probe-wasmtime probe-rhai probe-luau; do
  f="$CARGO_TARGET_DIR/release/$b"
  echo "$b: raw=$(stat -f%z "$f") B | gzip9=$(gzip -9 -c "$f" | wc -c | tr -d ' ') B | xz6=$(xz -6 -c "$f" | wc -c | tr -d ' ') B"
done
```

See `03-Spikes/S07-Scripting-Sandbox.md` for full measured results, Rhai vs Luau decision, and Phase 3 ADR recommendations.
