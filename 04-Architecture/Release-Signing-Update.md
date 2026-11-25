---
title: "Allegedly Release, Code Signing, Distribution & Auto-Update Architecture"
type: architecture
status: draft-for-red-team
phase: Phase 3
owner: architect
updated: 2026-11-24
code_refs:
  - spikes/S02-tauri-ipc-throughput
  - spikes/S07-scripting-sandbox
  - spikes/S08-storage-100m-replay
---

# Allegedly Release, Code Signing, Distribution & Auto-Update Architecture

> **Scope & Operating Mandate:** This document locks Allegedly's **`$0` core release, code signing, distribution, SBOM, and cryptographic auto-update pipeline** for **`v0.1`–`v1.0` on macOS (Apple Silicon + Intel) and Windows 10/11** (per [[Assumptions]] `A01`), executed by **`v0.1` Implementation CI (post-Phase-5)** (Phases 0–5 remain strictly PLAN-ONLY), with Linux documented in §7 as a ready-to-activate post-v1.0 blueprint. Every tool version, license, binary measurement, and signing option is verified directly from [[R02-Shell-UI-Stack]], [[License-Registry]], [[Compliance-Notes]], [[S02-Tauri-IPC-Throughput]], [[S07-Scripting-Sandbox]], and [[S08-Storage-100M-Replay]].

---

## 1. Release Principles & `$0` Infrastructure Model

1. **Zero Recurring Infrastructure Cost (`$0` Core):** Public repository `emrisca/allegedly` (`Apache-2.0`) builds, signs, attests, and distributes installers and static update manifests exclusively via **GitHub Actions** (`tauri-apps/tauri-action`) and **GitHub Releases** — zero paid SaaS CDNs, zero paid signing subscriptions required to ship `v0.1`–`v1.0`, and zero custom update servers.
2. **Sovereign, Local-First & Zero-Network Offline Boot (`Principles` P1, `SV-01`):** Updates are **strictly opt-in and user-controlled** (`updates.checkOnStartup = false` by default). Fresh profiles emit **`0` outbound DNS/TCP/UDP packets** until the user explicitly enables background update checks in Settings, runs *"Check for Updates"* manually via Command Palette (`SV-02`), or connects a live Provider/Broker feed. Zero silent auto-execution, zero forced restarts during an active trading `Session`, and zero telemetry or device IDs sent when checks are enabled.
3. **Strict `< 40 MB` Packaged Installer Budget (`Constraints` #5, `SV-20`, `RK-07`):** Enforced automatically by `v0.1` Implementation CI on every release artifact across macOS and Windows.
4. **Reproducible Provenance & Permissive Compliance (`KC-04`, `RK-05`):** Every release ships CycloneDX + SPDX SBOMs, `SHA256SUMS.txt`, Sigstore Cosign keyless OIDC build provenance attestations, and an audited `THIRD_PARTY_NOTICES.md`.

---

## 2. Platform Packaging & Signing Matrix (`v0.1`–`v1.0` Active Targets)

| Target Platform (`A01`) | Artifacts Built (`tauri 2.12.7` / `cli 2.12.6`) | `$0` Signing & Provenance (`v0.1`–`v1.0`) | Primary `$0` Distribution Channels | Optional Future Paid Upgrade (Explicit User Approval Only) |
|---|---|---|---|---|
| **macOS Apple Silicon (`aarch64-apple-darwin`) & Intel (`x86_64-apple-darwin`)** | `.dmg` (installer) + `.app.tar.gz` & `.sig` (updater bundle) | Ad-hoc Mach-O signature (`codesign --force --deep --sign -`) + Minisign Ed25519 updater `.sig` + `SHA256SUMS.txt` + Sigstore Cosign OIDC attestation (`R02-S13`) | **Homebrew Cask** (`brew install --cask allegedly --no-quarantine`, avoids Gatekeeper prompt) + GitHub Releases `.dmg` with documented `xattr -dr com.apple.quarantine /Applications/Allegedly.app` | Apple Developer Program (`$99/yr`) Developer ID Application cert + `notarytool` notarization & stapling (removes Gatekeeper prompt on raw `.dmg`) |
| **Windows 10/11 (`x86_64-pc-windows-msvc`)** | `.msi` (WiX) & NSIS `.exe` with **`embedBootstrapper`** (`+~1.8 MB` Evergreen WebView2) + `.sig` | **Day-1:** `SHA256SUMS.txt` + Minisign `.sig` + Sigstore Cosign OIDC attestation.<br>**Public `v0.1`+:** Apply to **SignPath Foundation** (`$0` OSI Open Source OV HSM cert via GitHub Actions provenance, `R02-S15`) | **Winget** + **Scoop** manifests + GitHub Releases `.msi`/`.exe` | Commercial EV/OV signing or Microsoft Azure Artifact Signing *(live USD pricing **`UNVERIFIED`** per `R02`; not budgeted in `$0` core)* |

### 2.1 Windows WebView2 Distribution Mode (`R02-S02`)
- **Locked Default:** `embedBootstrapper` (`+~1.8 MB` payload). On Windows 10/11 machines that already have Evergreen Microsoft Edge WebView2 (virtually all updated systems), installation is instant and offline; on unpatched Windows 10 hosts, the embedded bootstrapper fetches Evergreen WebView2 cleanly.
- **Rejected Modes:** `offlineInstaller` (`+127 MB`) and `fixedRuntime` (`+180 MB`) are **banned** because they breach Allegedly's `< 40 MB` installer budget (`Constraints` #5). `downloadBootstrapper` (`~0 MB`) remains a clean fallback if further size reduction is ever needed.
- **SmartScreen Honesty Note:** Until SignPath Foundation OV signing is active and builds SmartScreen reputation, unsigned Windows `.msi`/`.exe` builds will trigger a Windows SmartScreen prompt. Release notes must state this transparently and publish exact `SHA256SUMS.txt` and Cosign verification commands.

### 2.2 macOS Gatekeeper Honesty Note (`R02-S13`)
- Without a `$99/yr` Apple Developer ID certificate, macOS Gatekeeper flags browser-downloaded `.dmg` files with `com.apple.quarantine`.
- Shipping an official **Homebrew Cask** (`brew install --cask allegedly --no-quarantine`) as the primary macOS install command provides a clean `$0` UX, backed by Cosign attestation and SHA-256 verification inside the Cask formula. Raw `.dmg` release notes explicitly document `xattr -dr com.apple.quarantine /Applications/Allegedly.app`.

---

## 3. Cryptographic Auto-Update Architecture (`tauri-plugin-updater v2.14.1`, `$0`)

### 3.1 Signing & Anti-Downgrade Pipeline
- **Plugin & Verifier:** `tauri-plugin-updater v2.14.1` (`Apache-2.0 OR MIT`) verifying **Minisign Ed25519** detached signatures (`minisign-verify 0.3`) against the public key compiled into `src-tauri/tauri.conf.json`.
- **Mandatory Anti-Downgrade Flag:** Enable **`requireSignedVersion`** (`tauri-cli 2.12+`) so the updater cryptographically binds the semantic version string inside the signed artifact payload and rejects downgrade or version-mismatch substitution attacks.
- **Static Manifest (`$0` Hosting):** `tauri-apps/tauri-action` uploads platform bundles + `.sig` files and publishes a single static `latest.json` endpoint on GitHub Releases:
  `https://github.com/emrisca/allegedly/releases/latest/download/latest.json`
- **Zero Telemetry Guarantee (`Principles` P1, `SV-01`):** When the user explicitly opts in or triggers a manual check, the client performs a plain HTTPS `GET` to `latest.json` with standard user-agent headers — zero unique client IDs, zero account/broker metadata, and zero analytics.

### 3.2 User-Controlled Update UX & Package-Manager Guard (`RT3-02`)
1. **Default-Off Startup Polling (`updates.checkOnStartup = false`) — Strict `P1` / `SV-01` Compliance:** By default, **`updates.checkOnStartup = false`**. A fresh Allegedly profile emits **`0` outbound DNS/TCP/UDP packets (`P1` / `SV-01`)** until the user explicitly opts in via Settings (*"Check for updates on startup"*) or invokes manual ***"Check for Updates"*** from the Command Palette (`Cmd/Ctrl+K`, `SV-02`), or connects a live Provider/Broker feed. Even when opted in or triggered manually, if a newer signed version exists, a non-intrusive status-bar badge notifies the user with changelog link and explicit **"Download & Verify"** → **"Restart to Apply"** actions (never auto-executes).
2. **Active-Order / Live-Session Safety Guard:** If `allegedly-oms` has any working `Order`, open position, or `LIVE_ARMED == true` state, the **"Restart to Apply"** button is disabled with a clear warning until the user flattens/closes or manually confirms exit.
3. **Package-Manager Conflict Guard:** Builds distributed via **Homebrew Cask**, **Winget**, or **Scoop** (and post-v1.0 Flatpak/apt/dnf) detect a managed-install sentinel or compile-time `package-managed` flag and **disable in-app binary self-replacement**, instead displaying the exact upgrade command (e.g., `brew upgrade --cask allegedly` or `winget upgrade emrisca.Allegedly`).

### 3.3 Minisign Private Key Custody & Rotation
- **Storage:** Generate the Minisign Ed25519 keypair offline on an encrypted local volume; store an encrypted offline recovery copy outside the repository; upload `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` strictly to a **GitHub Actions Protected Environment (`release`)** requiring explicit maintainer approval before any workflow can access secrets.
- **Key Rotation Runbook:** Never silently swap keys. To rotate, ship a bridge release `vX.Y.Z` signed with Key A that embeds Key B's public key (or dual verification support), verify adoption, and sign `vX.(Y+1).0` with Key B. If Key A is ever compromised, immediately revoke GitHub Release `latest.json`, publish a security advisory, and instruct users to reinstall cleanly via verified package manager / SHA-256 checksum.

---

## 4. Bundle Size Accounting vs. `< 40 MB` Budget (`RK-07`, `SV-20`)

Phase 2 stripped `gzip-9` measurements on Apple M2 (`aarch64-apple-darwin`, `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`) eliminated the `< 40 MB` bundle-size risk (`RK-07`):

| Component | Measured / Estimated Compressed Size | Source & Verification Status |
|---|---:|---|
| **Tauri v2 Shell Binary** (`tauri 2.12.7` / `wry 0.57.4` / `tao 0.37.3`) | **`2.68 MB`** (`2,808,734 B` gzip; `10 MB` raw) | **VERIFIED** (`S02` arm64 release build) |
| **Wasmtime `v51.0.0` Minimal** (`cranelift`, `runtime`, `std`, zero WASI) | **`+1.74 MiB`** `gzip-9` (`+1.28 MiB` `xz-6`) | **VERIFIED** (`S07` stripped size probe) |
| **Luau VM** (`mlua v0.12.3` + `luau0-src`, MIT) | **`+0.47 MiB`** `gzip-9` (`+0.34 MiB` `xz-6`) | **VERIFIED** (`S07` stripped size probe) |
| **Storage & Order-Flow Core** (`arrow`/`parquet v60.2.0`, `zstd`, `rusqlite v0.43.0`, `rtrb`, `sha2`) | **`+2.91 MiB`** `gzip-9` (`+1.98 MiB` `xz-6`) | **VERIFIED** (`S08` stripped release binary) |
| **Subtotal — Verified Measured Rust Core (`S02` + `S07` + `S08`)** | **`~7.8 MB`** | **VERIFIED (`5.1×` below `< 40 MB` ceiling)** |
| **Additional Rust Crates (`dbn v0.75.0`, `allegedly-ingest`, `allegedly-oms`, `keyring-rs`, `tauri-plugin-updater`)** | `~2.0–4.0 MB` *(projected budget)* | `UNVERIFIED` until `v0.1` Implementation CI (post-Phase-5) integrated binary |
| **Frontend Assets (`lightweight-charts 5.3.0`, `dockview 8.9.1`, React 19, `@ui-sdk/react` `0.1.0-beta.17`, Lucide, `JetBrains Mono` / `Inter` WOFF2 subsets)** | `~1.5–3.0 MB` *(projected budget)* | `UNVERIFIED` until `v0.1` Implementation CI (post-Phase-5) Vite prod bundle |
| **Windows WebView2 `embedBootstrapper` (Windows installers only)** | **`+~1.8 MB`** | **VERIFIED** (`R02-S02` Microsoft/Tauri docs) |
| **Excluded Heavy Engines (Strictly Sidecar / Out-of-Core)** | **`0 MB`** (`DuckDB v2.0.1` & `DataFusion v56.0.0` excluded) | **LOCKED** (`S08`, `RK-07`) |
| **Hard CI Failure Gate (`ci-bundle-mac-win.yml`)** | **`< 40.0 MB`** (target `< 20.0 MB`) | **Enforced on every `.dmg`, `.msi`, NSIS `.exe`** |

> **Platform Size Verification Note (`UNVERIFIED`):** Final packaged `.dmg` (`aarch64` & `x86_64`) and Windows `.msi`/NSIS (`x86_64-pc-windows-msvc`) sizes are marked **`UNVERIFIED`** until the first integrated **`v0.1` Implementation CI (post-Phase-5)** `ci-bundle-mac-win.yml` run produces real installers.

---

## 5. SBOM, Supply-Chain Attestation & Legal Compliance Gates

Every tagged release workflow automatically generates and attaches the following compliance artifacts to the GitHub Release:

1. **Software Bill of Materials (SBOM):**
   - `allegedly-vX.Y.Z-sbom.cdx.json` (CycloneDX 1.5) and `allegedly-vX.Y.Z-sbom.spdx.json` (SPDX 2.3), covering both `Cargo.lock` and `pnpm-lock.yaml`.
2. **Build Provenance & Checksums:**
   - `SHA256SUMS.txt` covering all installers, updater tarballs, and SBOM files.
   - GitHub Artifact Attestation (`actions/attest-build-provenance`, SLSA Build Provenance) + Sigstore Cosign OIDC keyless signature over `SHA256SUMS.txt`.
3. **Mandatory `THIRD_PARTY_NOTICES.md` (Embedded in App + Attached to Release):**
   - Auto-generated via `cargo-about` (`MIT OR Apache-2.0`) + npm SPDX aggregator, and verified by CI to include:
     - Verbatim **TradingView Lightweight Charts `Apache-2.0` `NOTICE`** attribution (`R01`, `License-Registry`).
     - **SIL Open Font License 1.1 (`OFL-1.1`)** notices for **JetBrains Mono** (`v2.304`) and **Inter** (`v4.1`).
     - Permissive license texts for `dockview` / `dockview-react` (`MIT`), `lucide-react` (`ISC`), `wasmtime` (`Apache-2.0 WITH LLVM-exception`), `mlua` / `luau0-src` (`MIT`), `arrow`/`parquet`/`dbn` (`Apache-2.0`), `rusqlite` (`MIT`), and `keyring-rs` (`MIT OR Apache-2.0`).
4. **Hard Compliance & Safety Release Gates (`KC-04`, `RK-04`, `RK-05`, `S06`):**
   - `cargo deny check` (`v0.22.1`) passes with `0` disallowed licenses or unacknowledged advisories.
   - npm SPDX gate confirms **`0` `dockview-enterprise`**, `@tradingview/charting_library`, `hqchart`, or copyleft/non-OSI packages.
   - Compile-time check confirms `allow-live-trading` Cargo feature is **off** for `v0.1` (`LIVE_ARMED = false` at boot) and `FORBIDDEN_DO_NOT_BUILD_ADAPTERS` denylist tests pass (`S06-T7`).
   - **Pre-Public Human Legal Checkpoint (`RK-04`, `Compliance-Notes`):** Confirm formal trademark clearance for **`Allegedly`** (ensuring clean separation from retired `MotiveView`/`MotiveScript` USPTO conflicts) prior to opening public `v0.1` distribution.

---

## 6. Release Checklist & Rollback Runbook

### 6.1 Step-by-Step Release Checklist (`vX.Y.Z`)
1. **Pre-Flight Quality Gates (`v0.1` Implementation CI, post-Phase-5):**
   - `ci-pr-fast.yml`, `ci-bundle-mac-win.yml`, and `ci-nightly.yml` green on target commit (`macos-14` + `windows-latest`).
   - `ci-pre-release-soak.yml` (30-min live Kraken+Coinbase soak) passed within 7 days of release tag.
   - `CHANGELOG.md` updated with user-visible changes, breaking `Layout`/schema notes, and verified hashes.
2. **Release Candidate Tag (`vX.Y.Z-rc.1`):**
   - Push signed git tag `vX.Y.Z-rc.1` → triggers `release.yml` in draft pre-release mode (does **not** overwrite stable `latest.json`).
   - Maintainer manually approves the protected `release` GitHub Environment so Minisign signing executes.
   - Verify installer sizes `< 40 MB`, cold start `< 2.0 s`, idle RAM `< 300 MB`, `SV-01` zero-packet offline boot (`updates.checkOnStartup = false`), `THIRD_PARTY_NOTICES.md` presence, and manual updater verification on clean macOS & Windows test machines.
3. **Production Publish (`vX.Y.Z`):**
   - Push signed tag `vX.Y.Z` → approve `release` environment → inspect draft GitHub Release artifacts (`.dmg`, `.msi`, NSIS `.exe`, `.app.tar.gz`, `.sig`, `latest.json`, SBOMs, `SHA256SUMS.txt`, Cosign bundle) → click **Publish Release**.
   - Open automated/templated PRs updating **Homebrew Cask**, **Winget**, and **Scoop** manifests with the exact `SHA256SUMS.txt` hashes.

### 6.2 Emergency Rollback & Anti-Downgrade Runbook
If a published release `vX.Y.Z` exhibits a critical regression (crash on startup, data corruption, OMS safety defect):
1. **Contain New Downloads Immediately (`< 5 min`):**
   - Convert GitHub Release `vX.Y.Z` to **Pre-release** (or delete `latest.json` from `vX.Y.Z`) so GitHub's `/releases/latest/download/latest.json` immediately resolves back to the prior healthy release `vX.Y.(Z-1)` for all users still on `<= vX.Y.(Z-1)`.
   - Post a pinned warning at the top of the `vX.Y.Z` release notes and pause/revert pending Homebrew/Winget/Scoop manifest PRs.
2. **Heal Already-Upgraded Users (Respecting `requireSignedVersion`):**
   - Because `tauri-plugin-updater` with `requireSignedVersion` **strictly blocks version downgrades** (a deliberate security invariant), users who already installed `vX.Y.Z` will **not** auto-downgrade to `vX.Y.(Z-1)`.
   - Cut a clean **forward revert patch release `vX.Y.(Z+1)`** (`git revert` of the offending commit(s)), run `ci-pr-fast.yml` + `ci-bundle-mac-win.yml`, sign with Minisign, and publish `vX.Y.(Z+1)` as `latest.json` so affected users upgrade cleanly forward without disabling signature or anti-downgrade verification.
3. **Post-Incident Regression Lock:** Add a permanent Layer 1/2/5 CI test reproducing the defect before resuming normal feature merges.

---

## 7. Post-v1.0 Linux Distribution Blueprint (Deferred per `A01`, `RK-01`)

Linux is **not shipped in `v0.1`–`v1.0`**, but the core Rust workspace, WebGL2-only renderer, Canvas2D `DOM Ladder`, `TransportAdapter`, and `keyring-rs` remain Linux-portable so post-v1.0 launch requires zero architectural rewrite:
- **Primary `$0` Channels:** **Flathub (Flatpak)** OSTree (sandboxed desktop standard, `$0` Flathub signing), GPG-signed `.deb` & `.rpm` packages, AppImage (for portable distros), and community AUR `PKGBUILD`.
- **Mandatory `WebKitGTK 2.54.3+` Launch Wrapper Guardrails (`R02`, `RK-01`):**
  - Export `__NV_DISABLE_EXPLICIT_SYNC=1` on NVIDIA Wayland sessions and `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` where DMA-BUF compositor errors occur.
  - **NEVER** set `WEBKIT_DISABLE_DMABUF_RENDERER=1` (triggers `SIGSEGV` in `WebKitGTK 2.52+`).
  - Disable window transparency (`"transparent": false`) across all Linux `WebviewWindow` definitions.
- **Secret Storage & Self-Update:** Link `libsecret-1` (freedesktop Secret Service) via `keyring-rs v4.2.0` (with encrypted Argon2id + ChaCha20-Poly1305 fallback strictly for headless Linux lacking Secret Service), and disable in-app `tauri-plugin-updater` for Flatpak/apt/dnf installs while keeping Minisign active only for standalone AppImages.
