# Allegedly UI System (`shadcn.io/ui` + `@ui-sdk/react`)

This document is the single source of truth for UI consistency across **Allegedly**. Every new dialog, panel, toolbar, toggle, or button must follow these rules so controls never drift or clip.

## 1. Reference Architecture

- **Visual Pattern & Component Reference:** [`https://www.shadcn.io/ui`](https://www.shadcn.io/ui)
  - Inspect the corresponding `shadcn.io/ui/<component>` spec (Switch, Button, Dialog, Tabs, Input, Select, Checkbox, Command, Popover, Sidebar, Table) before implementing or editing any UI control.
- **Accessibility & Behavior Engine:** `@ui-sdk/react` (`0.1.0-beta.17`) + `@ui-sdk/core` (`0.1.0-beta.17`).
- **Shared Implementation:** `packages/ui-chrome/src/primitives.tsx` (re-exported from `@allegedly/ui-chrome`).

## 2. Shared Primitives (Always Use These)

| Primitive | Import | Usage | Exact Geometry & States |
| --- | --- | --- | --- |
| `UiSwitch` | `@allegedly/ui-chrome` | Instant on/off settings toggles | `default`: track `36×20px` (`h-[20px] w-[36px] p-[2px]`), thumb `16×16px` translating `0 → 16px` (`translate-x-0` → `data-checked:translate-x-[16px]`). `sm`: track `32×18px`, thumb `14×14px` (`0 → 14px`). Track off `#2d3240`, on `var(--app-accent,#2962ff)`. Zero outer track border. |
| `UiButton` | `@allegedly/ui-chrome` | All modal/form/action buttons | Variants: `default`, `secondary`, `outline`, `ghost`, `destructive`. Sizes: `xs` (`h-7`), `sm` (`h-8`), `md` (`h-9`), `icon` (`h-8 w-8`), `icon-sm` (`h-7 w-7`). |
| `UiInput` | `@allegedly/ui-chrome` | Text, number, and secret inputs | `h-8 rounded-md border bg-[#111318] px-2.5 text-[12px]`, accent focus border + subtle ring. |
| `UiSelect` | `@allegedly/ui-chrome` | Dropdown selects in settings | `h-8 rounded-md border bg-[#111318] px-2.5 text-[12px]`. |
| `UiSettingRow` | `@allegedly/ui-chrome` | Label + optional subtitle + right control | `rounded-lg border bg-[var(--app-panel-bg,#181a20)] px-3.5 py-2.5`. |
| `ColorPickerButton` | `@allegedly/ui-chrome` | Color swatches in settings | TradingView-style swatch + popover palette + hex input. |

## 3. Theme Tokens (App Chrome vs. Chart Canvas)

The app shell and chart canvas are **strictly separated**:

- **App Shell (Settings → Appearance):**
  - `--app-chrome-bg` (default `#131722`): top bar, left rail, watchlist, right rail, status bar
  - `--app-panel-bg` (default `#181c27`): sidebar nav, setting rows, nested cards
  - `--app-surface-bg` (default `#1e222d`): modals, popovers, dropdown menus
  - `--app-border` (default `#2a2e39`): hairline borders & dividers
  - `--app-accent` (default `#2962ff`): active highlights, checked switches, primary buttons
- **Chart Canvas (Settings → Canvas):** Controlled exclusively by `chartSettings.canvas`.

## 4. Preventing `@ui-sdk/core/web.css` Collisions

`apps/desktop/src/styles.css` imports `@ui-sdk/core/web.css` in `@layer components` and neutralizes its cosmetic defaults for every used `[data-slot="..."]`.

**Rule:** Before using any `@ui-sdk/react` primitive that isn't already reset in `apps/desktop/src/styles.css`:
1. Search `node_modules/@ui-sdk/core/dist/web.css` for its `[data-slot="..."]` rules.
2. Add a clean reset inside `@layer components` in `apps/desktop/src/styles.css` (e.g., clearing stock `border`, `width`, `height`, `padding`, `margin-inline-start`).
3. Wrap it once in `packages/ui-chrome/src/primitives.tsx` modeled on `https://www.shadcn.io/ui`.

## 5. Mandatory Pre-Done Visual QA Checklist

Before reporting any UI change complete:
1. Run `pnpm typecheck`, `pnpm test` (including `axe-core` WCAG AA), and `pnpm build`.
2. Render the modified screen live in the browser/app and **inspect a real screenshot** of every changed control in:
   - Default / OFF state
   - Checked / ON / Active state
   - Open modal / popover state
3. Check that thumbs sit centered inside tracks with symmetric `2px` inset, text never clips, and buttons align cleanly across rows and modal footers.

## Icons (`shadcn.io/icons` & Finance Tag)

- Use [`https://www.shadcn.io/icons/tag/finance`](https://www.shadcn.io/icons/tag/finance) and the broader [`https://www.shadcn.io/icons`](https://www.shadcn.io/icons) (Lucide / Tabler) catalog for all finance, trading, and UI chrome icons.
- Always use `<SettingsCogIcon />` from `@allegedly/ui-chrome` for Settings buttons (never sun-ray or plain hexagon icons).
