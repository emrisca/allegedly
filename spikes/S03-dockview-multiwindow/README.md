# Spike S03 — Dockview MIT Multi-Pane & Multi-Window / Pop-Out Lifecycle

Verifies `dockview@8.9.1` + `dockview-react@8.9.1` (MIT only — automated lockfile/node_modules audit blocks `dockview-enterprise`) with 9 docked trading panels, layout JSON serialize/restore fidelity, panel pop-out + cross-window state sync (`BroadcastChannel` vs local WebSocket state hub), and 20-cycle open/close memory leak testing.

## Run Commands

```bash
cd spikes/S03-dockview-multiwindow
pnpm install
pnpm build
pnpm bench
```
