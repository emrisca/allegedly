# Spike S01 — Lightweight Charts v5.3 + Synchronized WebGL2 Order-Flow Canvas

Verifies dual-canvas pixel-lock synchronization and sustained 60–120 fps performance between `lightweight-charts@5.3.0` (100,000 OHLCV bars across 3 panes) and a raw WebGL2 instanced overlay rendering 500 visible footprint bars (20 price levels/bar = 10,000 cells + visible Volume Profile histogram + dynamic delta bars and DPR-snapped bitmap glyph digits).

## Run Commands

```bash
cd spikes/S01-chart-webgl-sync
pnpm install
pnpm build
pnpm bench
```

Interactive preview (manual inspection):

```bash
pnpm preview
```
