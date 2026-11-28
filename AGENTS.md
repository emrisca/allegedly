# AGENTS.md — Allegedly Engineering & UI Instructions

## UI Component System (`shadcn.io/ui` + `@ui-sdk/react`)

For **all** React UI development in Allegedly (requires **React 19 or newer**):

1. **Design & Component Reference (`https://www.shadcn.io/ui`):**
   - Always consult **`https://www.shadcn.io/ui`** (component catalog, visual specs, variants, sizes, spacing, states, and MCP/patterns) when building or modifying any control (Button, Switch, Checkbox, Input, Select, Dialog, Tabs, Popover, Command, Sidebar, Table, Badge).
   - **Never hand-roll ad-hoc one-off switch/button/input styling** directly inside feature files. Reuse and extend the shared primitives in `packages/ui-chrome/src/primitives.tsx` (`UiSwitch`, `UiButton`, `UiInput`, `UiSelect`, `UiSettingRow`) and `packages/ui-chrome/src/color-picker.tsx` (`ColorPickerButton`).
   - Full component tokens, sizes, states, and checklist live in `docs/UI-SYSTEM.md`. Read it before any UI change.

2. **Headless Accessibility Primitives (`@ui-sdk/react` & `@ui-sdk/core`):**
   - Keep `@ui-sdk/react` and `@ui-sdk/core` (`Apache-2.0`, https://ui-sdk.dev/docs) installed via `pnpm`. **If a release-age policy blocks an install, stop and ask the user instead of changing the policy.**
   - Before adding a new `@ui-sdk/react` component: read `node_modules/@ui-sdk/react/docs/llms.txt` (and `core.md` + `rendering.md` when building new primitives).
   - **CRITICAL CSS Reset Invariant (`apps/desktop/src/styles.css`):** `@ui-sdk/core/dist/web.css` ships opinionated default styles (e.g., white borders, fixed dimensions, `margin-inline-start: auto` on `switch-thumb`) that **will collide** with Tailwind / shadcn utilities. Whenever you adopt a new `@ui-sdk/react` `[data-slot="..."]` primitive, inspect `node_modules/@ui-sdk/core/dist/web.css` and neutralize its cosmetic defaults inside `@layer components` in `apps/desktop/src/styles.css` first!

3. **Visual Consistency & Mandatory Screenshot QA:**
   - All chrome outside the chart canvas MUST use the shared App Appearance CSS variables (`--app-chrome-bg`, `--app-panel-bg`, `--app-surface-bg`, `--app-border`, `--app-accent`) with fallbacks so Settings → Appearance skins every panel, bar, and modal uniformly without touching the chart canvas.
   - Keep the interface TradingView-clean: zero clutter, uniform radii (`rounded-md` for controls, `rounded-lg` for cards/rows, `rounded-xl` for modals), uniform heights (`h-7` compact / `h-8` standard / `h-9` primary), and consistent focus rings (`focus-visible:ring-2 focus-visible:ring-[var(--app-accent,#2962ff)]`).
   - **Never ship a UI change without visually inspecting it rendered live** (screenshot every new/edited control in its ON, OFF, hover, and open states to verify alignment, spacing, and contrast).

4. **Hot-Path Performance Rule:**
   - Use `@allegedly/ui-chrome` primitives (`shadcn.io/ui` + `@ui-sdk/react` + Tailwind CSS v4) for chrome, modals, command palette, toolbars, settings, popups, menus, selects, tabs, and forms.
   - Keep React reconciliation strictly out of `60 fps` chart rendering (Lightweight Charts v5 + Canvas2D/WebGL2) and `30+ Hz` DOM Ladder / Time & Sales hot paths.

## Core Repo Guardrails

- **Target Platforms:** **macOS** (Apple Silicon + Intel) and **Windows 10/11** for `v0.1`–`v1.0`; **Linux** is deferred to a future milestone (keep Rust + Web abstractions portable so Linux can be added cleanly later).
- **License:** `Apache-2.0`. Zero proprietary runtime dependencies. Hard-block `dockview-enterprise` (MIT `dockview` / `dockview-core` / `dockview-react` only).
- **Rust Build Cache Isolation:** Always set `export CARGO_TARGET_DIR=/Users/abelmora/.cache/allegedly-target` before any `cargo` command so no Rust `target/` directory is created inside this Obsidian vault.
- **Financial Correctness:** Prices, ticks, and quantities use fixed-point integers (`i64` / `i128`) — never IEEE-754 `f64` for money, tick math, or order quantities.
- **Execution Safety:** Zero live broker orders and zero real credentials in development, spikes, or tests. Paper/sandbox/local mocks only (`live_armed: false` default).

## Icons (`shadcn.io/icons` & Finance Tag)

- Use [`https://www.shadcn.io/icons/tag/finance`](https://www.shadcn.io/icons/tag/finance) and the broader [`https://www.shadcn.io/icons`](https://www.shadcn.io/icons) (Lucide / Tabler) catalog for all finance, trading, and UI chrome icons.
- Always use `<SettingsCogIcon />` from `@allegedly/ui-chrome` for Settings buttons (never sun-ray or plain hexagon icons).
