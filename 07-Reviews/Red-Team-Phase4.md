---
title: "Phase 4 Roadmap & Delivery Plan Adversarial Red-Team Review"
type: review
status: active
phase: Phase 4
owner: red-team
updated: 2026-11-25
verdict: PASS
---

# Phase 4 Roadmap & Delivery Plan Adversarial Red-Team Review

> **Scope Audited:** All 5 Phase 4 deliverables — `05-Roadmap/Milestones.md`, `05-Roadmap/Epics-and-Stories.md`, `05-Roadmap/Sprint-Plan-v0.1.md`, `05-Roadmap/v0.1-Definition-of-Done.md`, and `90-Canvas/Roadmap.canvas` — cross-examined against `01-Charter/{Charter,Constraints,Principles,Assumptions,Glossary}.md`, `AGENTS.md`, `04-Architecture/*` & `04-Architecture/ADRs/0001`–`0010`, `06-Risk/{Risk-Register,Kill-Criteria,License-Registry,Compliance-Notes}.md`, `08-Dashboards/Unverified-Claims.md`, and `spikes/S06-oms-paper-execution/src/adapter/mod.rs`.
>
> **Re-Verification Update (`2026-11-25`):** **Final Gate Verdict: `PASS`** — All **12/12** findings (`RT4-01`–`RT4-12`: `2/2` Blockers, `5/5` Majors, `3/3` Minors, `2/2` Nits) have been independently re-verified against live workspace files and **CLOSED** (`0` open Blockers, `0` open Majors, `0` open Minors, `0` open Nits). See **§6 Re-Verification Pass (`2026-11-25`)** below for line-level evidence. Sections 1–5 are preserved unchanged as the original initial audit record.

---

## 1. Executive Verdict

**Verdict: `PASS-WITH-REQUIRED-FIXES` (Initial `2026-11-25` Audit — Superseded by `PASS` in §6 on `2026-11-25`)**

Phase 4 preserves Allegedly's Phase 3 architectural, licensing, safety, and anti-hallucination discipline remarkably well: there is **zero** retired `mv-*`/`.mv*` residue outside the explicit CI ban regex, **zero** prose `indicator` leaks, **zero** broken wikilinks, **100%** preservation of locked Phase 3 wire layouts, Charter budgets (`< 40 MB`, `< 2.0 s`, `< 300 MB`, `<= 64 MiB` Study pool, `60.0 fps`), `updates.checkOnStartup = false`, Risk-Reduction Bypass Rule, `ui-sdk` `"0.1.0-beta.17"` `pnpm` release-age policy, and all `10/10` post-Phase-3 `UNVERIFIED` items from `Unverified-Claims.md`.

However, because the 5 Phase 4 deliverables were authored in parallel across multiple owners (`spikes-ui`, `spikes-core`, `spikes-data`, `spikes-oms`), **severe cross-document contradictions** remain that prevent clean Stage D handoff:
1. **Unreconciled `v0.1` vs. `v0.2` vs. `v1.0` scope & release-gate collisions (`RT4-01`):** `v0.1-Definition-of-Done.md` Tier B hard-blocks the `v0.1.0` tag on artifacts (`ST-12` real Databento `.dbn.zst` fixture, `ST-41` Minisign/Cosign signing, `ST-42` SBOMs + `RK-04` trademark clearance) that `Milestones.md` and `Epics-and-Stories.md` explicitly defer to `v0.2` or `v1.0`, while `Sprint-Plan-v0.1.md` pulls `v0.2` features (`ST-30` native `WebviewWindow` pop-outs and `.dbn.zst`/`.bi5` importers) back into `v0.1` Sprints 2–3.
2. **Broken `SV-01`–`SV-20` ownership, staging & completeness (`RT4-02`):** `Epics-and-Stories.md` assigns `SV-04` (Tier-1 micro-toolbar) to `E02` binary IPC and assigns `SV-07` (5-level TOML cascade) + `SV-14` (`60 Hz` Canvas2D DOM Ladder) to `E04` Storage/Replay; `Milestones.md` omits `SV-07`; `Sprint-Plan-v0.1.md` omits `SV-12`; `v0.1-Definition-of-Done.md` references a non-existent `v0.3` milestone; and the 4 docs disagree 3 ways on when `SV-13` (24h `.atdepth` heatmap), `SV-11` (`[Est/Max]` PIQ & L2 heuristics), and `SV-17` (TPO magnet snap) gate release.
3. **Visual roadmap, traceability, and schedule defects (`RT4-03`–`RT4-07`):** `Roadmap.canvas` schedules `E06` (LWC + WebGL2) in Sprint 1 before `E05` (`allegedly-orderflow`) exists in Sprint 2; `Sprint-Plan-v0.1.md` and `v0.1-Definition-of-Done.md` contain `0` `ST-*` story references; `v0.1-Definition-of-Done.md` sets the `KC-07` check at non-existent `"Sprint 4 & Sprint 8"`; and the `v0.1` installer baseline double-counts deferred `v0.2` Wasmtime (`+1.74 MiB`) with a `2.20` vs `2.21 MiB` rounding mismatch.

All defects are cleanly patchable in documentation without revisiting Phase 3 ADRs. Close both **Blockers (`RT4-01`–`RT4-02`)** and all **5 Majors (`RT4-03`–`RT4-07`)** before opening Phase 5 / Stage D.

### Finding Counts by Severity

| Severity | Count | Gate Impact |
|---|---:|---|
| **Blocker** | **2** | **Blocks Phase 4 Gate sign-off** (`RT4-01`, `RT4-02`) |
| **Major** | **5** | **Must fix before Phase 4 Gate** (`RT4-03`–`RT4-07`) |
| **Minor** | **3** | Recommended pre-gate cleanup (`RT4-08`–`RT4-10`) |
| **Nit** | **2** | Optional polish (`RT4-11`, `RT4-12`) |
| **Total** | **12** | — |

---

## 2. Findings Summary Table

| ID | Severity | Area | Target Document(s) | Summary |
|---|---|---|---|---|
| **RT4-01** | **Blocker** | `v0.1` Scope & Tier B Gate Conflict | `Milestones.md`, `Epics-and-Stories.md`, `Sprint-Plan-v0.1.md`, `v0.1-Definition-of-Done.md` | 4-way scope collision on `v0.1` vs `v0.2`/`v1.0` for Pop-Out `WebviewWindow` (`ST-30`), Databento `.dbn.zst`/`.bi5` (`ST-12`), Release Signing/Minisign/SBOMs (`ST-41`/`ST-42`), and Trademark Clearance (`RK-04`) |
| **RT4-02** | **Blocker** | `SV-01`–`SV-20` Ownership & Staging | All 4 Roadmap Docs | Misattributed `SV-04`/`SV-07`/`SV-14` epic ownership in `Epics-and-Stories.md`; `Milestones.md` omits `SV-07`; `Sprint-Plan-v0.1.md` omits `SV-12`; phantom `v0.3` milestone; 3-way conflict on `SV-11`/`SV-13`/`SV-17` staging |
| **RT4-03** | **Major** | Canvas & `v0.5` Epic Drift | `90-Canvas/Roadmap.canvas`, `Milestones.md`, `Epics-and-Stories.md` | `Roadmap.canvas` puts `E06` WebGL2 in Sprint 1 (before `E05` Sprint 2), drops `E06`/`E04`/`E10` from Sprints 3–4, mismatches `v0.5` epics (`E03`/`E06`/`E07`), and routes edge `ef-s-sp1` to `sp3` |
| **RT4-04** | **Major** | Story & Epic Traceability | `Sprint-Plan-v0.1.md`, `v0.1-Definition-of-Done.md`, `Milestones.md` | `0` `ST-*` story IDs referenced in `Sprint-Plan-v0.1.md`, `v0.1-Definition-of-Done.md`, or `Milestones.md`; `0` `E01`–`E10` epic IDs in `v0.1-Definition-of-Done.md` |
| **RT4-05** | **Major** | Critical-Path DAG & Risk Buffer | `Sprint-Plan-v0.1.md`, `Unverified-Claims.md`, `Milestones.md` | Mermaid DAG omits `STUDIES --> CHART` (`ST-22` full-history warmup) and `IPCCLI --> CHART/DOMUI`; `T10` bundles 2 unrelated epics (`E04` + `E09`); `UV-03`/`UV-04`/`UV-05` pushed to Sprint 4 leave `0` buffer sprints for `KC-01`/`KC-02` pivot |
| **RT4-06** | **Major** | `KC-07` Checkpoint Typo | `v0.1-Definition-of-Done.md` | `KC-07` monitor says `"Check at Sprint 4 & Sprint 8"` on a 4-sprint plan, dropping the Sprint 2 (Week 4) scope-cut gate |
| **RT4-07** | **Major** | Installer & IPC Budget Drift | `Milestones.md`, `v0.1-Definition-of-Done.md`, `Epics-and-Stories.md`, `Sprint-Plan-v0.1.md` | `v0.1` installer baseline double-counts deferred `v0.2` Wasmtime (`+1.74 MiB`), repeats `2.20` vs `2.21 MiB` sum mismatch, and drifts `< 15 ms` vs `p95 <= 16.0 ms` on `100k`-bar IPC load |
| **RT4-08** | **Minor** | Invalid Rust Identifier | `Sprint-Plan-v0.1.md` | Writes `FORBIDDEN_DO-NOT-BUILD_ADAPTERS` with hyphens (`L38`, `L169`, `L177`), which cannot compile in Rust (canonical: `FORBIDDEN_DO_NOT_BUILD_ADAPTERS`) |
| **RT4-09** | **Minor** | Config Extension Drift | `v0.1-Definition-of-Done.md` | Introduces `.attemplate.toml` (`L95`, `L168`) while `Data-Model.md`, `ADR-0010`, and the other 3 roadmap docs use `template.toml` |
| **RT4-10** | **Minor** | Tier A Sign-Off Omissions | `v0.1-Definition-of-Done.md` | Tier A `v0.1-dev` checklist (`L205`) omits `SV-11` and `SV-13` without clarifying which sub-checks are Tier A vs Tier B |
| **RT4-11** | **Nit** | Crate/Label Precision | `Sprint-Plan-v0.1.md`, `Roadmap.canvas` | `Sprint-Plan-v0.1.md:177` writes `keyring-core` without noting parent `keyring-rs v4.2.0`; `Roadmap.canvas` omits dev-only `allegedly-docgen` alongside `9-crate allegedly-*` |
| **RT4-12** | **Nit** | Canvas Edge Routing | `90-Canvas/Roadmap.canvas` | `f-epics` has no vertical link to the sprint row; `sp4` → `m-v01` edge crosses diagonally across the full canvas width |

---

## 3. Detailed Findings Breakdown

### Blockers

#### `RT4-01` — Direct Cross-Document Scope Contradictions on `v0.1` Deliverables & Tier B Release Gates
- **Severity:** `Blocker`
- **Citations:**
  - **Pop-Out `WebviewWindow`:** `05-Roadmap/Milestones.md:91, 138-139, 312` (`v0.2` only, explicit `v0.1` Non-Goal) & `05-Roadmap/Epics-and-Stories.md:142, 413-414` (`ST-30` in `v0.2`) **vs.** `05-Roadmap/Sprint-Plan-v0.1.md:193, 201, 206, 243` (built in `v0.1` Sprint 3 and gated in `v0.1` `UV-03`).
  - **Databento `.dbn.zst` & Dukascopy `.bi5` Importers:** `05-Roadmap/Milestones.md:92, 135-136, 311` (`v0.2` only, explicit `v0.1` Non-Goal) & `05-Roadmap/Epics-and-Stories.md:193-194` (`ST-12` in `v0.2`) **vs.** `05-Roadmap/Sprint-Plan-v0.1.md:175` (implemented in `v0.1` Sprint 2 at `crates/allegedly-storage/src/importers/`) & `05-Roadmap/v0.1-Definition-of-Done.md:62, 222` (real user-downloaded `.dbn.zst` fixture is a **HARD BLOCKER** for `v0.1.0` tag).
  - **Code Signing, Minisign Ed25519 `requireSignedVersion`, SBOMs & Cosign OIDC:** `05-Roadmap/Milestones.md:83, 93, 148-150, 248` (`v0.1` ships unsigned/ad-hoc `.dmg`/`.msi`; signing + `tauri-plugin-updater` `requireSignedVersion` in `v0.2`; CycloneDX/SPDX SBOMs & reproducible builds in `v1.0`) & `05-Roadmap/Epics-and-Stories.md:552-571` (`ST-41` in `v0.2`, `ST-42` in `v1.0`) **vs.** `05-Roadmap/Sprint-Plan-v0.1.md:12, 213` (*"signed, cross-platform `v0.1` release"* / *"signed, reproducible `v0.1` candidate"*) & `05-Roadmap/v0.1-Definition-of-Done.md:50, 221` (mandates CycloneDX 1.5 + SPDX 2.3 SBOMs, `SHA256SUMS.txt`, Sigstore Cosign OIDC, and Minisign `.sig` with `requireSignedVersion` as Tier B **HARD BLOCKERS** for `v0.1.0` tag).
  - **Formal Trademark Clearance (`RK-04`):** `05-Roadmap/Milestones.md:245, 261, 315` & `05-Roadmap/Epics-and-Stories.md:562, 571` (`ST-42` defers attorney trademark clearance to `v1.0` GA) **vs.** `05-Roadmap/v0.1-Definition-of-Done.md:50, 62, 222` (echoing `04-Architecture/Release-Signing-Update.md:107`, makes formal trademark clearance a **HARD BLOCKER** for public `v0.1.0` tag).
- **Failure Scenario:** An autonomous or human engineering team executing `v0.1` from `Milestones.md` + `Epics-and-Stories.md` will omit `ST-12`, `ST-30`, `ST-41`, and `ST-42` from Sprints 1–4 — and will then **automatically FAIL** `v0.1-Definition-of-Done.md` Tier B at release tag time because Tier B demands Minisign `.sig`, SBOMs, Cosign OIDC, a real `.dbn.zst` fixture test, and trademark clearance. Conversely, following `Sprint-Plan-v0.1.md` adds `ST-12` (`.dbn.zst`/`.bi5`) and `ST-30` (native pop-outs) into Sprints 2–3 without story IDs or budget room, threatening the 8-week `KC-07` ceiling.
- **Minimal Concrete Fix:** Pick one canonical `v0.1` boundary and synchronize all 4 files verbatim (recommended minimal-risk `v0.1` split that protects the 8-week `KC-07` spine):
  1. **Pop-Out `WebviewWindow` (`ST-30`) → `v0.2`:** Remove native pop-out `windows.rs` / `packages/ui-chrome/src/popout/` and Windows pop-out RTT from `Sprint-Plan-v0.1.md:193, 201, 206, 243` (keep the Rust `state_rev: u64` hub in `v0.1` Sprint 1 per `ST-08`).
  2. **Databento `.dbn.zst` & Dukascopy `.bi5` (`ST-12`) → `v0.2`:** Remove `importers/` (`.dbn.zst`/`.bi5`) from `Sprint-Plan-v0.1.md:175` and move the real `.dbn.zst` human fixture gate in `v0.1-Definition-of-Done.md:62, 222` to `v0.2` (or explicitly move `ST-12` CLI decode into `v0.1` across `Milestones.md` & `Epics-and-Stories.md` if required for `v0.1`).
  3. **Release Signing / SBOMs / Minisign (`ST-41`/`ST-42`) & Trademark (`RK-04`):** Decide whether `v0.1.0` is an **internal/unsigned alpha tag** (aligning `Sprint-Plan-v0.1.md:12, 213` and `v0.1-Definition-of-Done.md:50, 62, 221-222` to `Milestones.md:83, 93` — keeping `SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md` in `v0.1`, Minisign/Cosign/SignPath in `v0.2`, SBOMs/reproducible builds in `v1.0`, and trademark clearance strictly pre-public-distribution) **OR** pull `ST-41`/`ST-42` SBOM/Cosign/Minisign generation into `v0.1` Sprint 4 in `Milestones.md` & `Epics-and-Stories.md` (matching `Release-Signing-Update.md:107, 121`). All 4 documents must state the exact same rule.

---

#### `RT4-02` — Broken `SV-01`–`SV-20` Traceability: Misattributed Epic Ownership, Omitted Rules (`SV-07`/`SV-12`), Phantom `v0.3` Milestone & 3-Way Staging Conflicts
- **Severity:** `Blocker`
- **Citations:**
  - **Misattributed Epic Ownership in `05-Roadmap/Epics-and-Stories.md`:**
    - `L30, L113, L145, L584`: Assigns **`SV-04`** (Tier-1 Micro-Toolbar `<= 5` controls / `<= 36 px` height) to **`E02`** (`ST-06` Binary IPC framing & `ST-08` Workspace State Hub) instead of `E07` (`ST-28`).
    - `L32, L224, L236, L587, L594`: Assigns **`SV-07`** (5-Level TOML Cascade Inheritance & Reset) and **`SV-14`** (`60 Hz` Canvas2D DOM Ladder zero-allocation hot path) to **`E04`** (`ST-14` SQLite WAL Catalog & `ST-15` Streaming Replay) instead of `E07` (`ST-28` / `ST-27`).
    - `L29, L62, L598`: Assigns **`SV-18`** (`keymap.toml`) as primary on `E01` (`ST-02` Static CI Guards); `L35, L369` makes **`SV-08`** primary on `E07` (`ST-27` TypeScript Canvas2D DOM) while `E02` (`allegedly-core`) only *"co-enforces `SV-08`"*.
    - `L25`: Incorrectly claims this `Canonical SV-* IDs` column *"preserves the shared Phase 4 epic ownership mapping verbatim across `Milestones`, `Sprint-Plan-v0.1`, and `v0.1-Definition-of-Done`"* — none of those 3 docs contain that mapping.
  - **Omitted `SV-*` Rules:**
    - `05-Roadmap/Milestones.md`: Completely omits **`SV-07`** across the entire file (`19/20` rules).
    - `05-Roadmap/Sprint-Plan-v0.1.md`: Completely omits **`SV-12`** by ID across the entire file (`19/20` rules; Sprint 3 `L192, L198-199` omit the `SV-12` tag).
  - **Phantom `v0.3` Milestone:** `05-Roadmap/v0.1-Definition-of-Done.md:86, 99` cites **`v0.3`** (`v0.2 / v0.3 / v0.5`, `staged v0.2/v0.3`), which does not exist in Allegedly's 5 canonical milestones (`v0.1`, `v0.2`, `v0.5`, `v1.0`, `Post-v1.0`).
  - **3-Way Conflicting Staging for `SV-13`, `SV-11`, and `SV-17`:**
    - **`SV-13` (24h `.atdepth` Heatmap `< 64 MB` RAM / `< 30 MB` disk):** Required in **`v0.1` Sprint 4** by `Sprint-Plan-v0.1.md:218, 226, 247` (`UV-07`) and `Epics-and-Stories.md:293, 301` (`ST-20`), **deferred to `v0.2 / v0.5`** by `v0.1-Definition-of-Done.md:102`, and assigned to **`v1.0` GA** by `Milestones.md:29, 241, 314`.
    - **`SV-11` (`[Est / Max]` DOM PIQ & L2 Heuristic Badges):** Built in **`v0.1` Sprints 3–4** by `Sprint-Plan-v0.1.md:200, 224` and `Epics-and-Stories.md:382` (`ST-27`), **assigned to `v0.2` (PIQ) / `v0.5` (detectors)** by `Epics-and-Stories.md:306` (`ST-21`), and **deferred to `v0.2 / v0.5`** by `v0.1-Definition-of-Done.md:100`.
    - **`SV-17` (`TPO Profile` Magnet Snap):** `u128` `TpoRow` + WebGL2 TPO rendering ship in **`v0.1`** (`Milestones.md:73, 76`, `Epics-and-Stories.md:293, 337`, `Sprint-Plan-v0.1.md:168, 176, 199`), yet `Epics-and-Stories.md:349, 597` and `v0.1-Definition-of-Done.md:106` defer `TPO Profile` magnet snap to **`v0.2`**.
- **Failure Scenario:** CI gate builders wiring `SV-01`–`SV-20` into `E01`–`E10` test suites will attach UI micro-toolbar and Canvas2D DOM assertions to Rust IPC/SQLite crates (`E02`/`E04`), skip `SV-07` or `SV-12` in milestone/sprint exit checklists, and fail to agree on whether `SV-11`/`SV-13`/`SV-17` block `v0.1.0`, `v0.2`, `v0.5`, or `v1.0`.
- **Minimal Concrete Fix:**
  1. Fix `Epics-and-Stories.md` §1 (`L25-L38`), story Traceability lines (`L113`, `L145`, `L224`, `L236`), and §3 (`L581-L600`) so primary epic ownership matches Charter semantics (`SV-04` → `E07`; `SV-07` → `E07`; `SV-08` → `E01`/`E02`/`E09`; `SV-14` → `E07`; `SV-18` → `E07`).
  2. Add explicit `SV-07` coverage to `Milestones.md` (`v0.1` §1/§3) and explicit `SV-12` tags to `Sprint-Plan-v0.1.md` (Sprint 2 VRVP + Sprint 3 LWC/WebGL2 + Sprint 4 gate).
  3. Delete all `v0.3` references in `v0.1-Definition-of-Done.md:86, 99` (replace with `v0.2 / v0.5`).
  4. Lock a single canonical staging table across all 4 docs for `SV-11` (`v0.1`: honest L2 non-MBO labeling + `[Est/Max]` PIQ display; `v0.5`: L2 Iceberg/Pull heuristic detectors), `SV-13` (`v0.1`: `< 300 MB` idle RAM + Rust `.atdepth` ring unit bound; `v0.5`/`v1.0`: full 24h UI heatmap soak), and `SV-17` (`v0.1`: Volume Profile + `u128` TPO POC/VAH/VAL snap since `u128` TPO already ships in `v0.1`, or explicitly defer TPO WebGL2 rendering to `v0.2`).

---

### Majors

#### `RT4-03` — `90-Canvas/Roadmap.canvas` Misaligns Sprint 1–4 Epics (Schedules `E06` WebGL2 in Sprint 1 Before `E05` Exists) & Drops `v0.5` Epics
- **Severity:** `Major`
- **Citations:**
  - `90-Canvas/Roadmap.canvas:46` (`sp1` Sprint 1): Lists `LWC v5.3 + 5,000-bar window + WebGL2 ISeriesPrimitive (0.000 px)` and `Epics: E01, E02, E06, E07` — contradicting `Sprint-Plan-v0.1.md:62, 127, 198-199` and `Epics-and-Stories.md:34, 318-352` (`E06` is **Sprint 3**, depending on `E05` built in Sprint 2).
  - `90-Canvas/Roadmap.canvas:66` (`sp3` Sprint 3): Omits `E06` completely and lists `Settings-as-Code` + `Epics: E07, E08, E09, E10` — contradicting `Sprint-Plan-v0.1.md:122-131` (Sprint 3 primaries are `E06`, `E07`, `E08`; TOML cascade is Sprint 2; `E09` is Sprint 2; `E10` is Sprint 4).
  - `90-Canvas/Roadmap.canvas:76` (`sp4` Sprint 4): Omits Sprint 4's core implementation deliverables `E04` (`allegedly-replay` streaming replay, `ST-15`) and `E10` (Active Provenance Ledger & diagnostics ring, `ST-39`).
  - `90-Canvas/Roadmap.canvas:106` (`m-v05`) & `05-Roadmap/Milestones.md:28`: Both list `v0.5` Epics as `E04, E05, E08, E09, E10`, contradicting `Milestones.md:42, 45, 46, 191` (which also assign `v0.5` work to `E03`, `E06`, and `E07`) and `Epics-and-Stories.md:31, 35` (which assign `v0.5` to `E03` and `E07`).
  - `90-Canvas/Roadmap.canvas:162-168`: Edge `ef-s-sp1` connects `f-sprints` to `sp3` (`toNode: "sp3"`) despite its ID naming `sp1`.
- **Failure Scenario:** Anyone using `Roadmap.canvas` as the executive execution map will attempt to build `E06` WebGL2 Order-Flow overlays in Sprint 1 against a non-existent `allegedly-orderflow` crate and miss `E04` Replay and `E10` Diagnostics in Sprint 4.
- **Minimal Concrete Fix:** Update `sp1`–`sp4` in `90-Canvas/Roadmap.canvas` to mirror `Sprint-Plan-v0.1.md` §3–§4 verbatim (`sp1`: `E01, E02, E07` Shell; `sp2`: `E03, E04` Vault, `E05`, `E07` TOML, `E09` + `KC-07`; `sp3`: `E06`, `E07` DOM/Chrome, `E08`; `sp4`: `E04` Replay, `E10`, `E01`–`E10` Qualification), align `v0.5` Epics consistently across `Milestones.md:28`, `Milestones.md` §2, `Epics-and-Stories.md` §1, and `Roadmap.canvas:106`, and rename/retarget edge `ef-s-sp1`.

---

#### `RT4-04` — Zero `ST-*` Story Traceability Across `Sprint-Plan-v0.1.md`, `v0.1-Definition-of-Done.md` & `Milestones.md` (and Zero Epic IDs in DoD)
- **Severity:** `Major`
- **Citations:**
  - `05-Roadmap/Epics-and-Stories.md`: Defines 42 stories (`ST-01`–`ST-42`).
  - `05-Roadmap/Sprint-Plan-v0.1.md`: Contains **`0` `ST-*` references** across all 4 Sprint tables (`L147-L227`) and `T01`–`T10` (`L259-L269`).
  - `05-Roadmap/v0.1-Definition-of-Done.md`: Contains **`0` `ST-*` references** and **`0` `E01`–`E10` Epic references**.
  - `05-Roadmap/Milestones.md`: Contains **`0` `ST-*` references** in §1–§3.
- **Failure Scenario:** Engineers picking up `T01`–`T10` or verifying Sprint 1–4 exit criteria cannot mechanically trace which `ST-*` acceptance criteria are closed by each Sprint row or DoD gate, allowing stories (e.g., `ST-14` SQLite WAL catalog seek, `ST-24` 6 clean-room Drawings) to fall through the cracks during Stage D execution.
- **Minimal Concrete Fix:** Add an explicit `Stories (ST-*)` column (or inline `(ST-XX)` tags) to the Sprint 1–4 tables and `T01`–`T10` in `Sprint-Plan-v0.1.md`, add `Owning Epic(s) / Stories` to §2–§3 of `v0.1-Definition-of-Done.md`, and list included `ST-*` ranges per milestone in `Milestones.md` §1.

---

#### `RT4-05` — Critical-Path DAG Omissions, Overloaded `T10` Kickoff Task & Zero-Buffer Windows `WebView2` `KC-01`/`KC-02` Risk Window
- **Severity:** `Major`
- **Citations:**
  - `05-Roadmap/Sprint-Plan-v0.1.md:72-97` (Mermaid DAG): Omits **`STUDIES --> CHART`** even though `Sprint-Plan-v0.1.md:192, 198` and `Epics-and-Stories.md:325` (`ST-22` AC #3) mandate full-history Rust `Study` warmup in `allegedly-studies` before slicing the `5,000`-bar window. Also omits **`IPCCLI --> CHART`** and **`IPCCLI --> DOMUI`** even though `ST-22` and `ST-27` depend directly on `ST-07` (`packages/ipc-client`).
  - `05-Roadmap/Sprint-Plan-v0.1.md:269` (`T10`): Bundles two completely independent crates/epics (`E04` `allegedly-storage` `.atvault` + Hive Parquet 2.0 + `catalog.sqlite` AND `E09` `allegedly-oms` 12-state machine + WAL + Risk-Reduction Bypass + macOS APFS `fullfsync` bench) into a single "atomic" kickoff task, unlike single-crate `T01`–`T09`.
  - `05-Roadmap/Sprint-Plan-v0.1.md:243-245` (`UV-03`, `UV-04`, `UV-05`) **vs.** `08-Dashboards/Unverified-Claims.md:20-24` & `05-Roadmap/Milestones.md:303-306`: `Unverified-Claims.md` and `Milestones.md` schedule Windows `WebView2` CI (`UV-03`), 10-chart `FootprintSlabArena` RSS (`UV-04`), and Full OS Process-Tree Idle RAM (`UV-05`) for **Sprints 2–3**, whereas `Sprint-Plan-v0.1.md` pushes final Windows `WebView2` WebGL2/IPC/packaged verification to **Sprint 4 (Weeks 7–8)** — leaving **`0` buffer sprints** to execute a `KC-01`/`KC-02` pivot inside the 8-week `KC-07` cap!
- **Failure Scenario:** If Windows `WebView2` ANGLE D3D11 trips `KC-01`/`KC-02` on its first full E2E run in Week 7–8 (Sprint 4), the 8-week `KC-07` deadline is guaranteed to blow. Meanwhile, missing `STUDIES --> CHART` in the DAG allows `E06` to ship truncated JS warmup instead of full-history Rust warmup.
- **Minimal Concrete Fix:**
  1. Add `STUDIES --> CHART`, `IPCCLI --> CHART`, and `IPCCLI --> DOMUI` to the Mermaid DAG in `Sprint-Plan-v0.1.md:72-97`.
  2. Split `T10` into **`T10a`** (`E04` `allegedly-storage`) and **`T10b`** (`E09` `allegedly-oms` + APFS bench) — or make `T09`–`T10` explicitly parallel single-crate tasks (`ST-13` and `ST-35`/`ST-36`).
  3. Pull the initial Windows `WebView2` headless WebGL2/IPC smoke (`UV-03` early gate) into **Sprint 3 Week 5** (`ci-nightly.yml` on `windows-latest`) so any `KC-01`/`KC-02` failure still leaves 3 weeks of remediation runway before Sprint 4 tag freeze.

---

#### `RT4-06` — `KC-07` Checkpoint Typo (`"Check at Sprint 4 & Sprint 8"`) Eliminates Mid-Flight Scope-Cut Guardrail
- **Severity:** `Major`
- **Citations:**
  - `05-Roadmap/v0.1-Definition-of-Done.md:197`: `ACTIVE MONITOR (Check at Sprint 4 & Sprint 8)`
  - Contradicts: `05-Roadmap/Milestones.md:26, 118` (`v0.1` is **4 two-week sprints = 8 weeks**; `KC-07` checkpoint is **End of Sprint 2 / Week 4**), `05-Roadmap/Sprint-Plan-v0.1.md:12` (**4 two-week Sprints**), and `90-Canvas/Roadmap.canvas:56` (`KC-07 Checkpoint` in **Sprint 2**).
- **Failure Scenario:** Conflating **weeks 4 & 8** with **Sprints 4 & 8** creates a reference to a non-existent Sprint 8 and delays the first `KC-07` check to Sprint 4 (Week 8), when cutting breadth to protect the 8-week vertical-slice ceiling is already impossible.
- **Minimal Concrete Fix:** Change `v0.1-Definition-of-Done.md:197` to **`ACTIVE MONITOR (Check at Sprint 2 / Week 4 & Sprint 4 / Week 8)`**.

---

#### `RT4-07` — `v0.1` Installer Size Baseline Double-Counts Deferred `v0.2` Wasmtime (`+1.74 MiB`), Regresses `2.20` vs `2.21 MiB` Arithmetic & Drifts IPC Bulk Gate (`< 15 ms` vs `<= 16.0 ms`)
- **Severity:** `Major`
- **Citations:**
  - **Wasmtime Double-Count & Sum Mismatch:** `05-Roadmap/Milestones.md:90` explicitly excludes Wasmtime from `v0.1` (deferred to `v0.2`), yet `05-Roadmap/Milestones.md:101` (`v0.1` Budget Table) cites `Core stripped gzip-9 sum ~7.8 MB (S02 2.68 MB + S07 +2.20 MiB + S08 +2.91 MiB)` and `05-Roadmap/v0.1-Definition-of-Done.md:72` (`BG-01`) expands that as `S02 2.68 MB + S07 +1.74 MiB Wasmtime + +0.47 MiB Luau + S08 +2.91 MiB storage` — AND then `Milestones.md:160` (`v0.2`) states *"after adding Wasmtime (`+1.74 MiB` `S07` gzip-9)"*. Furthermore, `1.74 + 0.47 = 2.21 MiB` (not `2.20 MiB` — regressing `RT3-17`), and `2.68 MB + 2.21 MiB + 2.91 MiB` mixes decimal `MB` and binary `MiB` (`2.68 + 2.32 + 3.05 = 8.05 MB` decimal / `~7.80` raw sum).
  - **IPC Bulk Load Threshold Drift:** `05-Roadmap/Milestones.md:108` sets the `v0.1` `100k`-bar IPC bulk transfer gate at **`< 15 ms`**, whereas `04-Architecture/Testing-Strategy.md:130`, `05-Roadmap/Epics-and-Stories.md:127` (`ST-06`), and `05-Roadmap/Sprint-Plan-v0.1.md:243` (`UV-03`) lock it at **`p95 <= 16.0 ms`**.
- **Failure Scenario:** Automated CI threshold parsers or engineers comparing `Milestones.md` against `v0.1-Definition-of-Done.md` and `Testing-Strategy.md` will flag inconsistent `15 ms` vs `16.0 ms` IPC failures and miscompute expected `v0.1` vs `v0.2` binary growth deltas.
- **Minimal Concrete Fix:**
  1. In `Milestones.md:101` and `v0.1-Definition-of-Done.md:72`, report the **`v0.1` core baseline without Wasmtime** (`S02 2.68 MB` + `S07 Luau +0.47 MiB` + `S08 storage +2.91 MiB` ≈ **`~6.2 MB`** / **`~8.0 MB`** with `v0.2` Wasmtime `+1.74 MiB`, noting `1.74 + 0.47 = 2.21 MiB` combined `S07` sum).
  2. Change `Milestones.md:108` from `< 15 ms` to **`p95 <= 16.0 ms`** (matching `Testing-Strategy.md:130`, `Epics-and-Stories.md:127`, and `Sprint-Plan-v0.1.md:243`).

---

### Minors

#### `RT4-08` — Invalid Rust Identifier `FORBIDDEN_DO-NOT-BUILD_ADAPTERS` (Hyphens) in `Sprint-Plan-v0.1.md`
- **Severity:** `Minor`
- **Citations:** `05-Roadmap/Sprint-Plan-v0.1.md:38, 169, 177` (writes `FORBIDDEN_DO-NOT-BUILD_ADAPTERS` with hyphens) **vs.** canonical Rust constant `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` in `spikes/S06-oms-paper-execution/src/adapter/mod.rs:29`, `04-Architecture/ADRs/0009-oms-broker-and-prop-firm-strategy.md:95-99`, `05-Roadmap/Milestones.md:84, 116`, `05-Roadmap/Epics-and-Stories.md:487`, and `05-Roadmap/v0.1-Definition-of-Done.md:169`.
- **Failure Scenario:** Hyphens are illegal in Rust identifiers; any CI grep script or code template copied from `Sprint-Plan-v0.1.md` will fail to compile or fail to match the real constant.
- **Minimal Concrete Fix:** Replace all 3 occurrences of `FORBIDDEN_DO-NOT-BUILD_ADAPTERS` in `Sprint-Plan-v0.1.md:38, 169, 177` with **`FORBIDDEN_DO_NOT_BUILD_ADAPTERS`**.

---

#### `RT4-09` — Template File Extension Drift (`.attemplate.toml` vs. `template.toml`)
- **Severity:** `Minor`
- **Citations:** `05-Roadmap/v0.1-Definition-of-Done.md:95, 168` (uses `.attemplate.toml`) **vs.** `04-Architecture/Data-Model.md:305, 334`, `04-Architecture/ADRs/0010-ui-kit-docking-and-settings-as-code.md:87, 104`, `05-Roadmap/Milestones.md:79`, `05-Roadmap/Epics-and-Stories.md:16, 400, 586`, and `05-Roadmap/Sprint-Plan-v0.1.md:24` (all standardize on `template.toml` / `<name>.template.toml`).
- **Failure Scenario:** Serialization tests for `SV-06` and file-association/glob patterns in `allegedly-core` will diverge on whether Study templates end in `.attemplate.toml` or `template.toml`.
- **Minimal Concrete Fix:** Standardize `v0.1-Definition-of-Done.md:95, 168` to **`template.toml`** (or document `.attemplate.toml` explicitly as an alias if intentionally chosen across all 4 docs and `Data-Model.md`).

---

#### `RT4-10` — Tier A Sign-Off Checklist Silently Omits `SV-11` & `SV-13`
- **Severity:** `Minor`
- **Citations:** `05-Roadmap/v0.1-Definition-of-Done.md:205` (Tier A `v0.1-dev` sign-off lists `SV-01`–`SV-10`, `SV-12`, `SV-14`–`SV-19`) **vs.** `v0.1-Definition-of-Done.md:100, 102` (which make honest `L2` non-MBO labeling under `SV-11` and `< 300 MB` idle RAM under `SV-13` mandatory for `v0.1`).
- **Failure Scenario:** Local `v0.1-dev` checkpoints skip validating honest `L2` non-MBO labeling (`SV-11`) and local `FootprintSlabArena` `< 60 MiB` memory bounds (`SV-13`), allowing regressions to accumulate until Tier B.
- **Minimal Concrete Fix:** Update `v0.1-Definition-of-Done.md:205` to include **`SV-11` (`v0.1` honest `L2` non-MBO labeling)** and note **`SV-13` (Rust `FootprintSlabArena` `< 60 MiB` bound in Tier A; full OS process-tree `< 300 MB` & `SV-20` packaged checks in Tier B)**.

---

### Nits

#### `RT4-11` — Minor Crate & Inventory Precision (`keyring-core` & `allegedly-docgen`)
- **Severity:** `Nit`
- **Citations:** `05-Roadmap/Sprint-Plan-v0.1.md:177` (cites `keyring-core` without noting it is the sub-crate of `keyring-rs v4.2.0` per `06-Risk/License-Registry.md:49`); `90-Canvas/Roadmap.canvas:46, 86` (cites `9-crate allegedly-*` without noting dev-only `allegedly-docgen`).
- **Minimal Concrete Fix:** Write `keyring-rs v4.2.0 (keyring-core)` in `Sprint-Plan-v0.1.md:177` and `+ dev-only allegedly-docgen` in `Roadmap.canvas` `sp1`.

---

#### `RT4-12` — Visual Edge Routing Polish in `90-Canvas/Roadmap.canvas`
- **Severity:** `Nit`
- **Citations:** `90-Canvas/Roadmap.canvas:13-37, 176-182` (`f-epics` has no vertical outgoing edge to the sprint row; edge `esp4-v01` routes diagonally right-to-left from `sp4` at `x=620` back to `m-v01` at `x=-460`, crossing the canvas).
- **Minimal Concrete Fix:** Add a vertical link from `f-epics` to the sprint band (or group the 4 sprint cards inside a `v0.1 Sprints 1–4` canvas group and connect that group cleanly to `m-v01`).

---

## 4. Confirmed Strengths (Verified Clean)

1. **Zero Naming, Glossary, or Wikilink Regressions:** Automated full-text scan confirmed **`0` retired `mv-*`/`.mv*` leaks** outside the single permitted CI ban regex in `v0.1-Definition-of-Done.md:174-179`, **`0` prose `indicator` leaks** (100% canonical `Study` vocabulary), **`0` broken wikilinks** across all 5 files, valid Mermaid syntax in `Sprint-Plan-v0.1.md`, and valid JSON with `0` orphan nodes, `0` broken file references, and `0` geometric node overlaps in `90-Canvas/Roadmap.canvas`.
2. **High Phase 3 Architecture & Safety Fidelity:** All 9 production `allegedly-*` crates + dev-only `allegedly-docgen`, `CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` isolation (`RK-10`), exact binary IPC wire strides (`40 B` trade, `32 B` `FootprintCell`, `24 B` `VOLUME_PROFILE_SOA`, `16 B` `STREAM_STATUS_FRAME`, `72 B` `NormalizedTick`, `u128` `TpoRow`, `state_rev: u64`), `updates.checkOnStartup = false` (`SV-01`), 5-tier `ProvenanceTier`, 5-state `BookState`, 12-state `OrderState`, and the full 8-row **Risk-Reduction Bypass Rule** proof matrix (`v0.1-Definition-of-Done.md` §4.2) are faithfully carried forward without silent relaxation.
3. **Licensing, `ui-sdk` & Platform Discipline Intact:** All 4 docs preserve `macOS + Windows` Tier-1 (`v0.1`–`v1.0`) with `Linux` (`RK-01`) deferred to `Post-v1.0`, exact-pinned `@ui-sdk/react` & `@ui-sdk/core` `"0.1.0-beta.17"` via `pnpm` with explicit prohibition against bypassing release-age policy (`AGENTS.md`), MIT `dockview` `8.9.1` (`0` `dockview-enterprise`), `0` copyleft in Rust core (`cargo-deny v0.22.1`), and permanent bans on the 4 prop firms, Rithmic/CQG, Sierra `.scid`/Denali DTC, and `GPL-3.0` IBKR TWS API.
4. **Honest `UNVERIFIED` Accounting:** All `10/10` post-Phase-3 entries from `08-Dashboards/Unverified-Claims.md` (`UV-01`–`UV-10`) are tracked explicitly with test commands, pass thresholds, and fallback plans — **zero** unmeasured targets were silently promoted to `VERIFIED`.

---

## 5. Phase 4 Gate Recommendation

**Recommendation (Initial Audit — Superseded by §6 `PASS`):** `HOLD` Phase 4 Gate until `RT4-01`–`RT4-07` (`2` Blockers + `5` Majors) are closed, then re-verify (`PASS`) before Phase 5 Synthesis & Stage D Kickoff.

---

## 6. Re-Verification Pass (`2026-11-25`)

**Final Phase 4 Gate Verdict: `PASS`** — All **12/12** findings (`2/2` Blockers, `5/5` Majors, `3/3` Minors, `2/2` Nits) verified **CLOSED** against live workspace files with zero regressions (`0` broken wikilinks, `0` retired `mv-*`/`.mv*` residue outside the explicit CI ban regex, `0` prose `indicator` leaks, valid JSON with `0` orphan nodes and `0` geometric overlaps in `90-Canvas/Roadmap.canvas`).

| ID | Original Severity | Re-Verification Status | Exact Line-Level Evidence (`2026-11-25`) |
|---|---|---|---|
| **RT4-01** | **Blocker** | **CLOSED** | Canonical **`v0.1.0` unsigned/ad-hoc Alpha tag** (`SHA256SUMS.txt` + `THIRD_PARTY_NOTICES.md`) locked across `v0.1-Definition-of-Done.md:44-68, 221-227` and `Sprint-Plan-v0.1.md:12, 40, 226-231`; `ST-30` (pop-out `WebviewWindow`), `ST-12` (`.dbn.zst`/`.bi5` + real fixture), and `ST-41` (code signing, Minisign, opt-in updater) cleanly deferred to `v0.2` (`Sprint-Plan-v0.1.md:40, 133-141`; `v0.1-Definition-of-Done.md:62-67`); `ST-42` (SBOMs, Cosign, reproducible builds) & `RK-04` (attorney trademark clearance) cleanly in `v1.0` (`v0.1-Definition-of-Done.md:68`; `Sprint-Plan-v0.1.md:141, 263`). |
| **RT4-02** | **Blocker** | **CLOSED** | All 4 roadmap docs now cover **`20/20`** `SV-01`–`SV-20` (`0` missing in `Milestones.md`, `Epics-and-Stories.md`, `Sprint-Plan-v0.1.md`, `v0.1-Definition-of-Done.md`); **`0`** phantom `v0.3` milestone references (`lzma-rs v0.3` crate version only); primary epic ownership corrected in `Epics-and-Stories.md:25-38, 584-598` (`SV-04` → `E07`, `SV-07` → `E07`, `SV-08` → `E02` primary, `SV-14` → `E07`, `SV-18` → `E07` primary); `SV-11`, `SV-13`, and `SV-17` staging unified verbatim across `Epics-and-Stories.md:591, 593, 597`, `v0.1-Definition-of-Done.md:106, 108, 112`, and `Sprint-Plan-v0.1.md:43, 212`. |
| **RT4-03** | **Major** | **CLOSED** | `90-Canvas/Roadmap.canvas` `sp1`–`sp4` now match `Sprint-Plan-v0.1.md` verbatim (`sp1`: `E01, E02, E07` Shell; `sp2`: `E03, E04` Vault, `E05, E07` TOML, `E09` + `KC-07` W4; `sp3`: `E06, E07` DOM/Chrome, `E08` + Early `UV-03` W5; `sp4`: `E04` Replay, `E10`, `E01`–`E10` Qualification + `KC-07` W8); `v0.5` epics aligned as `E03`–`E10` across `Milestones.md:29`, `Epics-and-Stories.md:31-38`, and `Roadmap.canvas` `m-v05`; edge `ef-s-sp1` connects `f-sprints(bottom) -> sp1(top)`. |
| **RT4-04** | **Major** | **CLOSED** | Full epic (`10/10` `E01`–`E10`) and story (`ST-01`–`ST-42`) traceability verified across all 4 markdown docs: `Epics-and-Stories.md` (`42` unique `ST-*`), `Sprint-Plan-v0.1.md` (`42` unique `ST-*` across §3–§6 & `T01`–`T10b`), `v0.1-Definition-of-Done.md` (`42` unique `ST-*` & `10/10` epics across §1–§6), and `Milestones.md` (`35` explicit `ST-*` IDs & milestone ranges covering `ST-01`–`ST-42`). |
| **RT4-05** | **Major** | **CLOSED** | `Sprint-Plan-v0.1.md` Mermaid DAG now includes `IPCCLI --> CHART` (`L90`), `IPCCLI --> DOMUI` (`L91`), and `STUDIES --> CHART` (`L105`); kickoff task `T10` cleanly split into **`T10a`** (`E04` `ST-13`/`ST-14`, `L282`) and **`T10b`** (`E09` `ST-35`/`ST-36`, `L283`); early Windows `WebView2` WebGL2/IPC smoke (`UV-03`, `ST-25`) pulled into **Sprint 3 Week 5** (`L123, L206, L215, L220`) restoring 3-week `KC-01`/`KC-02` remediation runway. |
| **RT4-06** | **Major** | **CLOSED** | `05-Roadmap/v0.1-Definition-of-Done.md:203, 214` fixed to **`Sprint 2 / Week 4 & Sprint 4 / Week 8`** (`0` references to non-existent `Sprint 8`). |
| **RT4-07** | **Major** | **CLOSED** | `Milestones.md:106, 167` and `v0.1-Definition-of-Done.md:78` (`BG-01`) report `v0.1` core baseline without deferred `v0.2` Wasmtime (`S02 2.68 MB + S07 Luau +0.47 MiB + S08 storage +2.91 MiB ≈ ~6.2 MB`; `v0.2` adds Wasmtime `+1.74 MiB` → `~8.0 MB`, noting exact `1.74 + 0.47 = 2.21 MiB` combined `S07` sum); `100k`-bar IPC bulk gate harmonized to **`p95 <= 16.0 ms`** in `Milestones.md:113, 316` and `v0.1-Definition-of-Done.md:85` (`BG-08`). |
| **RT4-08** | **Minor** | **CLOSED** | `0` hyphenated `FORBIDDEN_DO-NOT-BUILD` occurrences remain across all 5 Phase 4 files; `Sprint-Plan-v0.1.md` uses valid Rust constant **`FORBIDDEN_DO_NOT_BUILD_ADAPTERS`** (`4` verified occurrences). |
| **RT4-09** | **Minor** | **CLOSED** | `0` `.attemplate.toml` occurrences remain across all 5 Phase 4 files; standardized on `template.toml` verbatim to `Data-Model.md` and `ADR-0010`. |
| **RT4-10** | **Minor** | **CLOSED** | `v0.1-Definition-of-Done.md:211` (Tier A sign-off) explicitly includes **`SV-11`** (`v0.1` honest `L2` non-MBO labeling + `[Est / Max]` DOM PIQ badge) and **`SV-13`** (Tier A Rust `FootprintSlabArena < 60 MiB` & `<= 64 MiB` Study pool bounds; Tier B full OS process-tree `< 300 MB`). |
| **RT4-11** | **Nit** | **CLOSED** | `Sprint-Plan-v0.1.md:179, 188, 283` writes **`keyring-rs v4.2.0 (keyring-core)`**; `90-Canvas/Roadmap.canvas:36, 86` explicitly notes **`+ dev-only allegedly-docgen`** alongside the 9 production `allegedly-*` crates. |
| **RT4-12** | **Nit** | **CLOSED** | `90-Canvas/Roadmap.canvas` re-laid out cleanly (`13` nodes, `14` edges, `0` orphans, `0` overlaps): `f-sprints` (`x=-460`) → `sp1`, `f-epics` (`x=-100`) → `sp2`, `f-dod` (`x=620`) → `sp4`, `sp4` (`x=620`) straight down → `m-v01` (`x=620`), `f-milestones` (`x=260`) → `m-v01`, and `m-v01` → `m-v02` → `m-v05` → `m-v10` → `m-post` left-to-right with zero crossing edges. |

**Phase 4 Gate Clearance:** **APPROVED (`PASS`)** — Clear to proceed to **Phase 5 Synthesis** (keeping all `UV-01`–`UV-10` items explicitly `UNVERIFIED` until post-Phase-5 Stage D Implementation CI).
