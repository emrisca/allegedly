# Spike S04 — High-Frequency DOM Ladder & Time & Sales UI Layout Thrash / Paint Budget

Stress-tests a 100-level fixed-point DOM Ladder + 50-row Time & Sales tape at 30 Hz (500 book deltas/s) and 60 Hz (2,000 book deltas/s), comparing:
1. `react-state`: Standard React state re-rendering
2. `imperative-dom-contained`: Zustand transient subscription + rAF-batched direct refs + Tailwind v4 + CSS `contain: strict` / `transform: scaleX()`
3. `canvas2d`: Pure DPR-aware Canvas2D ladder + tape

## Run Commands

```bash
cd spikes/S04-css-layout-perf
pnpm install
pnpm build
pnpm bench
```
