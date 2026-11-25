---
title: Allegedly Worklog
type: meta
owner: orchestrator
updated: 2026-11-24
---

# Allegedly Worklog

## 2026-11-24 — Phase 0 Execution & Environment Audit
- **Skills imported:** Imported Matt Pocock's `grill-with-docs` plus its two required skills `grilling` and `domain-modeling` (`GLOSSARY-FORMAT.md`, `ADR-FORMAT.md`) and recorded Abel's standing workflow preference in long-term memory.
- **Host environment verified:** macOS 26.6.2 (`arm64` Apple Silicon). Installed tools verified: `git`, `node`, `pnpm`, `npm`, `cargo`, `rustc`, `python3`, `uv`, `gh`. Missing locally: `duckdb` CLI (will be addressed via Rust `duckdb` crate / Python `duckdb` or Homebrew if needed in Phase 2 `S08`).
- **Vault hygiene & iCloud check (Section 0.2):**
  - Verified `FXICloudDriveDocuments = 0` and `FXICloudDriveDesktop = 0` via `defaults read com.apple.finder`; `~/Library/Mobile Documents/com~apple~CloudDocs/Documents` contains only `.localized`; zero `.icloud` placeholder files found under `/Users/abelmora/Documents/Obsidian`. **Result: iCloud Drive Documents sync is OFF (safe).**
  - Observed `/Users/abelmora/Documents/Obsidian/.obsidian/` is the active Obsidian vault config (`"sync": false`, no `obsidian-git`, community plugins: `omnisearch`, `unicode-search`, `obsidian-icon-folder`; core `bases: true`, `dataview` not installed).
  - Obsidian process (`PID 4799`) is currently running; therefore `.obsidian/app.json` was **not** modified on disk to avoid overwrite. Action item logged for Abel in [[Blocked-Items]] to add `userIgnoreFilters` (`node_modules`, `target`, `dist`, `build`, `.git`, `.venv`, `spikes/*/node_modules`) and disable "Detect all file extensions" in Obsidian Settings before any `pnpm install` or `cargo build`.
  - **Honest tradeoff note (Section 0.2.6):** Obsidian's `userIgnoreFilters` reduces search/graph noise but does not eliminate all filesystem watching overhead. If vault startup degrades past ~3s once spikes or workspace builds begin, move Rust build artifacts outside the vault (`CARGO_TARGET_DIR=~/.cache/allegedly-target`) and record the before/after startup measurements here.
- **Vault skeleton & git initialized:** Created directories `01-Charter` through `99-Meta` + `spikes/`, `.gitignore`, `00-Start-Here.md`, Charter suite, `Questions-For-Abel.md` (8 batched `grilling`-formatted questions), `Assumptions.md`, `Glossary.md`, `_Sources.md`, `Risk-Register.md`, `Kill-Criteria.md`, `08-Dashboards/*`, `90-Canvas/*.canvas`, and `99-Meta/*`.
- **Team assembled & Phase 1 dispatched:** Created 8 Allegedly specialist bots (`gemini-4-neon` / `gemini-4-argon`) and dispatched parallel Phase 1 research tracks `R01`–`R10` on logged defaults.

## 2026-11-24 — Phase 1 Gate Passed
- **All 10 research tracks (`R01`–`R10`) + 5 companion deliverables verified on disk:** `Principles.md`, `Provider-Capability-Matrix.md`, `Adopt-Build-Fork.md`, `License-Registry.md`, `Compliance-Notes.md`.
- **Master bibliography consolidated:** `02-Research/_Sources.md` populated with **279 verified primary sources** (zero broken wikilinks across vault).
- **Risk register & dashboards updated:** Folded in all critical Phase 1 catches (Linux WebKitGTK `Error 71`, US geo-blocking on Binance/Bybit, IBKR TWS API GPLv3 transition, 4 `DO-NOT-BUILD` prop firms, DuckDB `18.4–26.9 MB` size constraint, Sierra Chart `2026-10-13` `.scid` doc removal, `nautilus_trader` `LGPL-3.0-only` static-link ban, `Allegedly` USPTO collisions with `MOTIVEWAVE` & `TRADINGVIEW`).
- **Pre-Phase 2 Hygiene Hold:** Checked `/Users/abelmora/Documents/Obsidian/.obsidian/app.json` — `userIgnoreFilters` is still not set while Obsidian (`PID 4799`) is running. Per Section 0.2 (*"do this BEFORE any `pnpm install` or `cargo build`"*), holding Phase 2 spike installs until Abel either updates Obsidian Settings or confirms external spike/target directories.

## 2026-11-24 — Rename to Allegedly, Vault Hygiene Applied & Phase 2 Launch
- **Brand rename:** Renamed project to **Allegedly** (*"Allegedly a trading terminal."*) and moved vault/repo root from `/Users/abelmora/Documents/Obsidian/MotiveView` to `/Users/abelmora/Documents/Obsidian/Allegedly`. Preserved historical `"MotiveView"` trademark audit trail in `R09-Legal-Licensing.md` and `Compliance-Notes.md`, and logged `2026-11-24` screening of `"Allegedly"` (0 USPTO Class `009`/`042` hits; `allegedly.market` parody iOS app & `allegedlyapp.com` noted for future attorney review).
- **Obsidian hygiene applied safely:** Verified Obsidian was closed (`NOT_RUNNING`) and wrote `userIgnoreFilters` (`node_modules`, `target`, `dist`, `build`, `.git`, `.venv`, `spikes/*/node_modules`) + `"showUnsupportedFiles": false` into `/Users/abelmora/Documents/Obsidian/.obsidian/app.json`. All Rust spike builds additionally isolate `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` outside the vault.
- **Limit-reset continuation armed:** Gemini 5-hour quota checked at `76.4%` (resets `2026-11-25T05:07:37Z` / 9:07 PM Pacific). Created one-shot `limit_reset` continuation automation so Phase 2 resumes automatically if quota exhausts.
- **Phase 2 Spikes (`S01`–`S08`) dispatched** across all 4 spike-owning specialists.
