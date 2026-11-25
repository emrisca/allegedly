# Allegedly

> *"Allegedly a trading terminal."*
>
> **Free, open-source (`Apache-2.0`), local-first desktop trading terminal** for **macOS (`arm64` + `x86_64`) & Windows 10/11 (`x86_64`)** (Linux deferred to `Post-v1.0`) — pairing TradingView's uncluttered charting ergonomics with MotiveWave's institutional order-flow, profile, and execution depth. **Zero subscription fees, zero Study limits, zero cloud lock-in, zero telemetry.**

- **Canonical Plan of Record:** [`Plan-of-Record.md`](./Plan-of-Record.md) *(Phases 0–5 Complete — Ready for Stage D `v0.1` Implementation)*
- **Current Status:** **Phase 5 Complete** (Research `R01`–`R10`, Benchmark Spikes `S01`–`S08`, Phase 3 Architecture & ADRs `0001`–`0010`, Phase 4 Roadmap & `v0.1` Sprint Plan, and Plan of Record).
- **Obsidian Vault:** Open this repository root directly as an Obsidian vault and start at [`00-Start-Here.md`](./00-Start-Here.md).
- **AI / Contributor Guidelines:** See [`AGENTS.md`](./AGENTS.md) for frontend UI kit policy (`@ui-sdk/react` & `@ui-sdk/core` `"0.1.0-beta.17"`, `Apache-2.0`) and safety rails.

## Vault Structure

| Folder / File | Purpose | Status |
|---|---|---|
| [`Plan-of-Record.md`](./Plan-of-Record.md) | Consolidated executive Plan of Record & Stage D `v0.1` kickoff guide | **Complete (Phase 5)** |
| `01-Charter/` | Mission, constraints, UX principles (`SV-01`–`SV-20`), assumptions, glossary | **Complete (Phase 0)** |
| `02-Research/` | Evidence-backed tracks `R01`–`R10` + Provider Capability Matrix | **Complete (Phase 1)** |
| `03-Spikes/` | Hardware-measured benchmark spikes `S01`–`S08` (`28/28` release tests) | **Complete (Phase 2)** |
| `04-Architecture/` | C4, Data Model, Binary IPC, Plugin ABI, Testing, Release, Docs, ADRs `0001`–`0010` | **Complete (Phase 3 — Red-Team `PASS`)** |
| `05-Roadmap/` | Milestones (`v0.1`–`Post-v1.0`), `E01`–`E10` (`ST-01`–`ST-42`), `v0.1` Sprint Plan & DoD | **Complete (Phase 4 — Red-Team `PASS`)** |
| `06-Risk/` | Risk Register (`RK-01`–`RK-10`), Kill Criteria (`KC-01`–`KC-07`), License Registry, Compliance | **Active & Synchronized** |
| `07-Reviews/` | Adversarial Red-Team Audits (`Red-Team-Phase3`, `Red-Team-Phase4`, `Red-Team-Phase5`) | **Complete (Phases 3–5)** |
| `08-Dashboards/` & `90-Canvas/` | Live Dataview dashboards (`ADR-Status`, `Unverified-Claims`, `Blocked-Items`) & Obsidian Canvases | **Active** |

## Locked Architecture Summary (Phases 2–5)

- **Desktop Shell & UI:** Tauri v2 (`2.68 MB` measured `S02` baseline, `< 40 MB` installer budget, `< 300 MB` idle RAM target) + React 19 + TypeScript + Tailwind CSS v4 + `@ui-sdk/react` & `@ui-sdk/core` (`"0.1.0-beta.17"`, `Apache-2.0`) + MIT `dockview` (`8.9.1`, zero `dockview-enterprise`).
- **Charting & Order-Flow Rendering:** TradingView `lightweight-charts` (`v5.3.0`, `Apache-2.0`, `5,000`/`6,000`-bar hysteresis windowing) + synchronized main-thread **WebGL2** overlay (`0.000 CSS px` drift) for Footprint, Volume Profile, `u128` TPO Profile, Liquidity Heatmap, and CVD + **Canvas2D `60 Hz` zero-alloc DOM Ladder & T&S**.
- **Rust Core Engine (9 Production Crates + Dev-Only `allegedly-docgen`):** Zero-float fixed-point (`i64`/`i128`: `PriceE9`, `QtyE9`, `PriceTicks`, `LotQty`, `MoneyMicros`, `TimestampNs`), per-provider `rtrb` SPSC → single-threaded Dispatcher → `StorageRing`, aligned binary IPC (`24 B` `ALG2` `v1` header, `40 B` trades, `32 B` `FootprintCell`, `24 B` VP/L2, `16 B` status, `72 B` ticks/bars), 16-ary Dyadic Segment Tree VRVP, and 5-tier loud `ProvenanceTier`.
- **Local-First Storage & Replay:** Hybrid **SQLite WAL** (metadata, settings, OMS ledger with `PRAGMA fullfsync = ON` batched Kill-Switch commits) + **Apache Parquet / Arrow Zstd** (`.atvault` tick archives, `100M`-tick deterministic streaming replay, `4.26 B/tick`, `34.44 MiB` RSS).
- **Study Runtime & Scripting:** `allegedly-studies` — Native Rust built-ins + **Luau (`mlua`, flat SoA `ByteView`, `<= 64 MiB` global pool)** in `v0.1`, plus **Wasmtime** (`v0.2`) and optional clean-room series DSL (`v0.5+`).
- **Execution & Safety:** `allegedly-oms` 12-state `OrderState` + **Risk-Reduction Bypass Rule** + local Paper/Sim OMS (`v0.1`, `allow-live-trading` OFF), opt-in sandbox retail brokers (`v0.2`), and hard `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` denylist for banned prop firms & restricted feeds.
- **License & Privacy:** `Apache-2.0`; `$0` core; `updates.checkOnStartup = false` (`SV-01` zero-packet offline boot); zero GPL/AGPL/LGPL statically linked into Rust core (`cargo-deny v0.22.1`).
