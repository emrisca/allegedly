# Repository Agent Guidelines (`AGENTS.md`)

## Mandatory UI Kit & Design Rules

1. **Single Authoritative UI Spec:**
   - **Follow [`docs/UI-SYSTEM.md`](./docs/UI-SYSTEM.md) for all frontend UI work.**
   - Every control, modal, dialog, toggle, input, select, button, and color picker must use the shared primitives in `@allegedly/ui-chrome` ([`packages/ui-chrome/src/primitives.tsx`](./packages/ui-chrome/src/primitives.tsx)). Follow the corresponding [`https://www.shadcn.io/ui`](https://www.shadcn.io/ui) pattern.

2. **Headless Accessibility Primitives (`@ui-sdk/react` & `@ui-sdk/core`):**
   - Keep `@ui-sdk/react` and `@ui-sdk/core` (`Apache-2.0`, https://ui-sdk.dev/docs) installed via `pnpm`. **If a release-age policy blocks an install, stop and ask the user instead of changing the policy.**
   - Before adding a new `@ui-sdk/react` component: read `node_modules/@ui-sdk/react/docs/llms.txt` (and `core.md` + `rendering.md` when building new primitives).
   - **CRITICAL CSS Reset Invariant (`apps/desktop/src/styles.css`):** `@ui-sdk/core/dist/web.css` ships opinionated default styles (such as white borders, fixed dimensions, and `margin-inline-start: auto` on `switch-thumb`) that **will collide** with Tailwind / shadcn utilities. Before you adopt a new `@ui-sdk/react` `[data-slot="..."]` primitive, inspect `node_modules/@ui-sdk/core/dist/web.css`. Neutralize its cosmetic defaults inside `@layer components` in `apps/desktop/src/styles.css` first.

3. **Visual Consistency & Mandatory Screenshot QA:**
   - All chrome outside the chart canvas MUST use the shared App Appearance CSS variables (`--app-chrome-bg`, `--app-panel-bg`, `--app-surface-bg`, `--app-border`, `--app-accent`) with fallbacks. Settings -> Appearance then skins every panel, bar, and modal uniformly without changing the chart canvas.
   - Keep the interface TradingView-clean with zero clutter. Use uniform radii (`rounded-md` controls, `rounded-lg` cards, `rounded-xl` modals), heights (`h-7`, `h-8`, `h-9`), and focus rings (`--app-accent`).
   - **Never ship a UI change without inspecting it rendered live.** Screenshot each new or edited control in ON, OFF, hover, and open states to check alignment and contrast.

4. **Hot-Path Performance Rule:**
   - Use `@allegedly/ui-chrome` primitives (`shadcn.io/ui` + `@ui-sdk/react` + Tailwind CSS v4) for chrome, modals, command palette, toolbars, settings, popups, menus, selects, tabs, and forms.
   - Keep React reconciliation strictly out of `60 fps` chart rendering (Lightweight Charts v5 + Canvas2D/WebGL2) and `30+ Hz` DOM Ladder / Time & Sales hot paths.

## Core Repo Guardrails

- **Target Platforms:** **macOS** (Apple Silicon + Intel) and **Windows 10/11** for `v0.1`-`v1.0`. The roadmap defers **Linux** to a future milestone, so keep Rust and Web abstractions portable.
- **License:** `Apache-2.0`. Zero proprietary runtime dependencies. Hard-block `dockview-enterprise` (MIT `dockview` / `dockview-core` / `dockview-react` only).
- **Rust Build Cache Isolation:** Always set `export CARGO_TARGET_DIR=$HOME/.cache/allegedly-target` before any `cargo` command so `cargo` never creates a `target/` directory inside this Obsidian vault.
- **Financial Correctness:** Prices, ticks, and quantities use fixed-point integers (`i64` / `i128`). Never use IEEE-754 `f64` for money, tick math, or order quantities.
- **Execution Safety:** Zero live broker orders and zero real credentials in development, spikes, or tests. Use paper/sandbox/local mocks only (`live_armed: false` default).

## Icons (`shadcn.io/icons` & Finance Tag)

- Use [`https://www.shadcn.io/icons/tag/finance`](https://www.shadcn.io/icons/tag/finance) and the broader [`https://www.shadcn.io/icons`](https://www.shadcn.io/icons) (Lucide / Tabler) catalog for all finance, trading, and UI chrome icons.
- Always use `<SettingsCogIcon />` from `@allegedly/ui-chrome` for Settings buttons (never sun-ray or plain hexagon icons).
