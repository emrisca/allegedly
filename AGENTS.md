# AGENTS.md — Allegedly Engineering & UI Instructions

## UI Component System (`ui-sdk`)

For all future React UI development in Allegedly (requires **React 19 or newer**):

1. Install `@ui-sdk/react` and `@ui-sdk/core` (`Apache-2.0`, https://ui-sdk.dev/docs) with the project's package manager (`pnpm`). **If a release-age policy blocks the install, stop and ask the user instead of changing the policy.**
2. **Before using `ui-sdk`:** follow the `ui-sdk` skill if it is installed, and read `node_modules/@ui-sdk/react/docs/llms.txt`.
3. **To build a new component:** also search `node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.
4. **Skill installation (for agents supporting skills):**
   ```bash
   npx skills@latest add vercel-labs/ui --skill ui-sdk
   ```
5. **Hot-path performance rule:** Use `ui-sdk` + Tailwind CSS v4 for chrome, modals, command palette, toolbars, settings trees, popups, menus, selects, tabs, and forms. Keep React reconciliation strictly out of `60 fps` chart rendering (Lightweight Charts v5 + WebGL2) and `30+ Hz` DOM Ladder / Time & Sales hot paths (use Canvas2D or `requestAnimationFrame`-batched imperative refs fed by Zustand transient subscriptions).

## Core Repo Guardrails

- **Target Platforms:** **macOS** (Apple Silicon + Intel) and **Windows 10/11** for `v0.1`–`v1.0`; **Linux** is deferred to a future milestone (keep Rust + Web abstractions portable so Linux can be added cleanly later).
- **License:** `Apache-2.0`. Zero proprietary runtime dependencies. Hard-block `dockview-enterprise` (MIT `dockview` / `dockview-core` / `dockview-react` only).
- **Rust Build Cache Isolation:** Always set `export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` before any `cargo` command so no Rust `target/` directory is created inside this Obsidian vault.
- **Financial Correctness:** Prices, ticks, and quantities use fixed-point integers (`i64` / `i128`) — never IEEE-754 `f64` for money, tick math, or order quantities.
- **Execution Safety:** Zero live broker orders and zero real credentials in development, spikes, or tests. Paper/sandbox/local mocks only (`live_armed: false` default).
