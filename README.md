# Allegedly

> *"Allegedly a trading terminal."*
>
> **Free, open-source (`Apache-2.0`), local-first desktop trading terminal** for **macOS (`arm64` + `x86_64`) & Windows 10/11 (`x86_64`)** (Linux deferred to `Post-v1.0`) — pairing TradingView's uncluttered charting ergonomics with MotiveWave's institutional order-flow, profile, and execution depth. **Zero subscription fees, zero Study limits, zero cloud lock-in, zero telemetry.**

- **Canonical Plan of Record:** [`Plan-of-Record.md`](./Plan-of-Record.md) *(Phases 0–5 Complete)*
- **Current Status:** **Stage D `v0.1` Alpha Implemented & Verified on Apple M2 (`darwin-arm64`)** — 9 production Rust crates + dev-only `allegedly-docgen`, React 19 + `@ui-sdk/react` + MIT `dockview` + Lightweight Charts v5.3 + WebGL2 orderflow overlay + clean-room Drawing Engine + sandboxed Luau Study runtime + interactive `SV-09` deterministic Replay + 5-level TOML Settings-as-Code + Tauri v2 `custom-protocol` desktop bundle (`15.07 MB` `.app` / `5.26 MB` `.dmg`, `969 ms` UI paint-ready p95, `278.09 MB` full OS process-tree idle RAM, `sandbox-exec` verified `0` outbound packets on offline boot). Windows 10/11 validation (`UV-03`, `UV-05` Windows) and signed release certificates remain open.
- **Obsidian Vault:** Open this repository root directly as an Obsidian vault and start at [`00-Start-Here.md`](./00-Start-Here.md).
- **AI / Contributor Guidelines:** See [`AGENTS.md`](./AGENTS.md) for frontend UI kit policy (`@ui-sdk/react` & `@ui-sdk/core` `"0.1.0-beta.17"`, `Apache-2.0`) and safety rails.

## Quick Start (macOS `arm64` / Local Development)

> Always point `CARGO_TARGET_DIR` outside this directory if opening the repo as an Obsidian vault so Rust build artifacts never bloat the vault index.

```bash
export CARGO_TARGET_DIR="$HOME/.cache/allegedly-target"

# 1. Static CI safety guards (SV-08 zero-float, ADR-0001 prefix, SC-02 npm policy)
bash scripts/ci/check-no-floats.sh
bash scripts/ci/check-no-legacy-prefix.sh
node scripts/ci/check-npm-policy.mjs

# 2. Rust workspace + Tauri v2 shell verification
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --release
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings

# 3. Frontend workspace (React 19 + @ui-sdk/react + dockview + LWC v5.3 + WebGL2)
pnpm install
pnpm typecheck
pnpm test
pnpm test:a11y
pnpm build

# 4. Build & empirically measure macOS .app bundle (UV-05 process-tree RAM & SV-01 zero-network)
cargo build --release --manifest-path apps/desktop/src-tauri/Cargo.toml
node scripts/ci/measure-macos-bundle.mjs

# 5. Optional public read-only market-data soak (0 credentials, 0 trading)
cargo run --release -p allegedly-ingest --bin live_soak -- --duration-secs 45
```

## Repository & Vault Structure

| Folder / File | Purpose | Status |
|---|---|---|
| `crates/allegedly-*` | 9 production Rust crates (`core`, `ipc`, `ingest`, `orderflow`, `storage`, `replay`, `studies`, `oms`, `app`) + dev-only `docgen` | **Implemented & Verified** |
| `packages/ipc-client` & `packages/ui-chrome` | Aligned `ALG2` `v1` binary decoder/encoders (`4/4` Rust golden fixture parity) + MIT `dockview` & `@ui-sdk/react` shell | **Implemented & Verified** |
| `apps/desktop` & `apps/desktop/src-tauri` | React 19 + LWC v5.3 + WebGL2 orderflow overlay + Drawing Engine + ReplayBar + Tauri v2 desktop binary (`15.07 MB` `.app` / `5.26 MB` `.dmg`) | **Implemented & Verified (M2)** |
| `schemas/ipc-v1/ipc-contract.json` | Generated Rust→TS binary wire schema & golden fixture bytes (`allegedly-docgen`) | **Verified (`0` byte mismatches)** |
| [`Plan-of-Record.md`](./Plan-of-Record.md) | Consolidated executive Plan of Record & Stage D `v0.1` kickoff guide | **Complete (Phase 5)** |
| `01-Charter/` – `06-Risk/` | Charter, Research `R01`–`R10`, Spikes `S01`–`S08`, ADRs `0001`–`0010`, Roadmap, Risk Register | **Complete & Synchronized** |
| `07-Reviews/` | Adversarial Red-Team Audits (`Red-Team-Phase3`–`5`, `Red-Team-StageD-M2`) | **Active** |
| `08-Dashboards/` & `99-Meta/` | Live Dataview dashboards (`Unverified-Claims`, `Blocked-Items`, `ADR-Status`) & Worklog | **Active & Synchronized** |

## Locked Architecture Summary

- **Desktop Shell & UI:** Tauri v2 (`15.07 MB` packaged `.app` / `5.26 MB` `.dmg`, `< 40 MB` budget; `969 ms` UI paint-ready p95; `278.09 MB` max macOS process-tree idle RAM incl. `WKWebView` XPC helpers, `< 300 MB` budget) + React 19 + TypeScript + Tailwind CSS v4 + `@ui-sdk/react` & `@ui-sdk/core` (`"0.1.0-beta.17"`, `Apache-2.0`) + MIT `dockview` (`8.9.1`, zero `dockview-enterprise`).
- **Charting & Order-Flow Rendering:** TradingView `lightweight-charts` (`v5.3.0`, `Apache-2.0`, `5,000`/`6,000`-bar hysteresis) + synchronous **`ISeriesPrimitive` WebGL2** instanced-quad overlay (Footprint, VRVP, `u128` TPO, 0.000 CSS px drag drift) + clean-room 6-tool Drawing Engine (`SV-17` exact integer magnet snap, `.atanalysis.toml`) + **Canvas2D `60 Hz` DOM Ladder & T&S**.
- **Rust Core Engine:** Zero-float fixed-point (`i64`/`i128`: `PriceE9`, `QtyE9`, `PriceTicks`, `LotQty`, `MoneyMicros`, `TimestampNs`), per-provider `rtrb` SPSC (`52.98M ticks/s` measured `KC-05`) → single-threaded Dispatcher → `StorageRing`, aligned binary IPC (`24 B` `ALG2` `v1` header), `FootprintSlabArena` (`45.50 MiB` unshrunk capacity / `35.48 MiB` OS RSS delta across 10 arenas × 10k bars; `UV-04` partial pending 10-chart mounted UI), 16-ary Dyadic VRVP, and 5-tier loud `ProvenanceTier`.
- **Local-First Storage & Replay:** Hybrid **SQLite WAL** (`PRAGMA fullfsync = ON` batched 50-order Kill-Switch commit measured at `3.961 ms` on Apple M2 APFS, `UV-02`) + **Apache Parquet / Arrow Zstd** (`.atvault` Zstd-3 + `CRC32`, `SV-09` bit-exact cross-speed `SHA-256` replay).
- **Study Runtime & Execution Safety:** Native clean-room Studies + sandboxed **Luau (`mlua`, `<= 64 MiB` global pool)**; Paper/Sim OMS only in `v0.1` (`live_armed = false`, `updates.checkOnStartup = false`, `0` outbound packets on offline boot, `9/9` `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` enforced).
