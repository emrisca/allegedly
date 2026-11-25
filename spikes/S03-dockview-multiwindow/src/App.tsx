import { useEffect, useRef, useState } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type SerializedDockview,
} from 'dockview-react';

interface PanelParams {
  kind: 'chart' | 'dom' | 'tape' | 'watchlist' | 'blotter' | 'inspector' | 'heavy';
  symbol: string;
  linkGroup: string;
}

interface SyncMessage {
  kind: 'SYMBOL_PING' | 'SYMBOL_PONG' | 'CROSSHAIR_PING' | 'CROSSHAIR_PONG';
  seq: number;
  sentAt: number;
  symbol: string;
  sourceId: string;
  transport: 'broadcast' | 'ws-hub';
}

const CHANNEL_NAME = 'allegedly-s03-workspace-sync';
const WS_HUB_URL = 'ws://127.0.0.1:4174';

// Global live counters to verify zero leaked listeners/rAF loops after panel close
const lifecycleStats = {
  mountedCount: 0,
  unmountedCount: 0,
  activeHeavyPanels: 0,
  activeChannels: 0,
};

function TradingPanel({ params, api }: IDockviewPanelProps<PanelParams>) {
  const [symbol, setSymbol] = useState(params.symbol);
  const [lastSeq, setLastSeq] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    lifecycleStats.mountedCount++;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    lifecycleStats.activeChannels++;

    const onMsg = (ev: MessageEvent<SyncMessage>) => {
      const m = ev.data;
      if (!m) return;
      if (m.kind === 'SYMBOL_PING') {
        setSymbol(m.symbol);
        setLastSeq(m.seq);
      }
    };
    ch.addEventListener('message', onMsg);

    return () => {
      ch.removeEventListener('message', onMsg);
      ch.close();
      lifecycleStats.activeChannels--;
      lifecycleStats.unmountedCount++;
    };
  }, [api.id]);

  // Heavy panel allocates canvas + 2MB typed buffer + ResizeObserver + rAF loop, then cleans up
  useEffect(() => {
    if (params.kind !== 'heavy' && params.kind !== 'chart') return;
    lifecycleStats.activeHeavyPanels++;
    const canvas = canvasRef.current;
    // 2 MB backing typed array for heavy panels to make any retention leak obvious
    let scratch: Float64Array | null =
      params.kind === 'heavy' ? new Float64Array(262_144) : new Float64Array(4096);
    scratch[0] = performance.now();

    let rafId = 0;
    let frame = 0;
    const draw = () => {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#38bdf8';
          ctx.beginPath();
          for (let x = 0; x < canvas.width; x += 8) {
            const y = canvas.height * 0.5 + Math.sin((x + frame * 3) * 0.04) * 35;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      frame++;
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    const ro = new ResizeObserver(() => {
      if (canvas && canvas.parentElement) {
        canvas.width = Math.max(100, canvas.parentElement.clientWidth);
        canvas.height = Math.max(80, canvas.parentElement.clientHeight - 28);
      }
    });
    if (canvas?.parentElement) ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      scratch = null;
      lifecycleStats.activeHeavyPanels--;
    };
  }, [params.kind]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 6,
        background: '#0f172a',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 11,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong>
          [{params.kind.toUpperCase()}] {symbol}
        </strong>
        <span style={{ color: '#94a3b8' }}>
          id={api.id} seq={lastSeq}
        </span>
      </div>
      {params.kind === 'chart' || params.kind === 'heavy' ? (
        <canvas ref={canvasRef} width={320} height={180} style={{ width: '100%', flex: 1 }} />
      ) : (
        <div style={{ color: '#94a3b8', lineHeight: 1.5 }}>
          <div>Link Group: {params.linkGroup}</div>
          <div>Panel Title: {api.title}</div>
          <div>Active Sync Seq: {lastSeq}</div>
        </div>
      )}
    </div>
  );
}

const COMPONENTS = {
  tradingPanel: TradingPanel,
};

function PopoutPeerApp({ peerId }: { peerId: string }) {
  const [symbol, setSymbol] = useState('ES H26');
  const [bcCount, setBcCount] = useState(0);
  const [wsCount, setWsCount] = useState(0);

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    const onBc = (ev: MessageEvent<SyncMessage>) => {
      const m = ev.data;
      if (m && (m.kind === 'SYMBOL_PING' || m.kind === 'CROSSHAIR_PING') && m.sourceId !== peerId) {
        setSymbol(m.symbol);
        setBcCount((c) => c + 1);
        ch.postMessage({
          kind: m.kind === 'SYMBOL_PING' ? 'SYMBOL_PONG' : 'CROSSHAIR_PONG',
          seq: m.seq,
          sentAt: m.sentAt,
          symbol: m.symbol,
          sourceId: peerId,
          transport: 'broadcast',
        } satisfies SyncMessage);
      }
    };
    ch.addEventListener('message', onBc);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(WS_HUB_URL);
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as SyncMessage;
        if ((m.kind === 'SYMBOL_PING' || m.kind === 'CROSSHAIR_PING') && m.sourceId !== peerId) {
          setSymbol(m.symbol);
          setWsCount((c) => c + 1);
          ws?.send(
            JSON.stringify({
              kind: m.kind === 'SYMBOL_PING' ? 'SYMBOL_PONG' : 'CROSSHAIR_PONG',
              seq: m.seq,
              sentAt: m.sentAt,
              symbol: m.symbol,
              sourceId: peerId,
              transport: 'ws-hub',
            } satisfies SyncMessage),
          );
        }
      };
    } catch {}

    (window as any).__S03_PEER_READY__ = true;
    return () => {
      ch.removeEventListener('message', onBc);
      ch.close();
      ws?.close();
    };
  }, [peerId]);

  return (
    <div style={{ padding: 12, background: '#0b0e14', color: '#e2e8f0', height: '100vh' }}>
      <h3>Pop-Out Peer Window ({peerId})</h3>
      <div>Linked Symbol: {symbol}</div>
      <div>BroadcastChannel synced: {bcCount}</div>
      <div>State Hub WS synced: {wsCount}</div>
    </div>
  );
}

declare global {
  interface Window {
    __S03__?: {
      ready: boolean;
      getLayoutSnapshot: () => {
        panelIds: string[];
        groupCount: number;
        jsonBytes: number;
        mountMs: number;
        lifecycleStats: typeof lifecycleStats;
      };
      benchmarkSerializeRestore: (iterations: number) => Promise<{
        iterations: number;
        serializeMsP50: number;
        serializeMsP95: number;
        restoreMsP50: number;
        restoreMsP95: number;
        fidelityAllPassed: boolean;
        panelCountBefore: number;
        panelCountAfter: number;
        jsonBytes: number;
      }>;
      tryDockviewPopout: () => Promise<{
        supported: boolean;
        popoutWindowOpened: boolean;
        popoutGroupCount: number;
        error: string | null;
      }>;
      benchmarkCrossWindowSync: (
        transport: 'broadcast' | 'ws-hub',
        count: number,
      ) => Promise<{
        transport: string;
        sent: number;
        received: number;
        rttMsP50: number;
        rttMsP95: number;
        rttMsP99: number;
        rttMsMax: number;
        oneWayEstP95: number;
      }>;
      openHeavyPanel: (id: string) => void;
      closePanel: (id: string) => void;
      getLifecycleStats: () => typeof lifecycleStats;
    };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function buildInitialWorkspace(api: DockviewApi): void {
  const pChartEs = api.addPanel<PanelParams>({
    id: 'chart-es',
    component: 'tradingPanel',
    title: 'ES H26 Chart',
    params: { kind: 'chart', symbol: 'ES H26', linkGroup: 'A' },
  });
  api.addPanel<PanelParams>({
    id: 'chart-nq',
    component: 'tradingPanel',
    title: 'NQ H26 Chart',
    params: { kind: 'chart', symbol: 'NQ H26', linkGroup: 'A' },
    position: { referencePanel: pChartEs, direction: 'right' },
  });
  const pChartCl = api.addPanel<PanelParams>({
    id: 'chart-cl',
    component: 'tradingPanel',
    title: 'CL H26 Chart',
    params: { kind: 'chart', symbol: 'CL H26', linkGroup: 'B' },
    position: { referencePanel: pChartEs, direction: 'below' },
  });
  api.addPanel<PanelParams>({
    id: 'chart-btc',
    component: 'tradingPanel',
    title: 'BTC-USD Chart',
    params: { kind: 'chart', symbol: 'BTC-USD', linkGroup: 'B' },
    position: { referencePanel: pChartCl, direction: 'within' },
  });
  const pDom = api.addPanel<PanelParams>({
    id: 'dom-es',
    component: 'tradingPanel',
    title: 'ES DOM Ladder',
    params: { kind: 'dom', symbol: 'ES H26', linkGroup: 'A' },
    position: { referencePanel: 'chart-nq', direction: 'right' },
  });
  api.addPanel<PanelParams>({
    id: 'tape-es',
    component: 'tradingPanel',
    title: 'ES Time & Sales',
    params: { kind: 'tape', symbol: 'ES H26', linkGroup: 'A' },
    position: { referencePanel: pDom, direction: 'below' },
  });
  const pWatch = api.addPanel<PanelParams>({
    id: 'watchlist',
    component: 'tradingPanel',
    title: 'Watchlist',
    params: { kind: 'watchlist', symbol: 'ALL', linkGroup: 'A' },
    position: { referencePanel: pChartEs, direction: 'left' },
  });
  api.addPanel<PanelParams>({
    id: 'blotter',
    component: 'tradingPanel',
    title: 'Order Blotter',
    params: { kind: 'blotter', symbol: 'ALL', linkGroup: 'A' },
    position: { referencePanel: pChartCl, direction: 'right' },
  });
  api.addPanel<PanelParams>({
    id: 'inspector',
    component: 'tradingPanel',
    title: 'Study Inspector',
    params: { kind: 'inspector', symbol: 'ES H26', linkGroup: 'A' },
    position: { referencePanel: pWatch, direction: 'below' },
  });
}

export function App() {
  const search = new URLSearchParams(window.location.search);
  if (search.get('mode') === 'peer') {
    return <PopoutPeerApp peerId={search.get('peerId') || 'popout-1'} />;
  }

  const apiRef = useRef<DockviewApi | null>(null);
  const mountStartRef = useRef(performance.now());
  const mountMsRef = useRef(0);

  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    buildInitialWorkspace(api);
    mountMsRef.current = performance.now() - mountStartRef.current;

    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    window.__S03__ = {
      ready: true,
      getLayoutSnapshot: () => {
        const json = api.toJSON();
        const serialized = JSON.stringify(json);
        return {
          panelIds: api.panels.map((p) => p.id).sort(),
          groupCount: api.groups.length,
          jsonBytes: serialized.length,
          mountMs: mountMsRef.current,
          lifecycleStats: { ...lifecycleStats },
        };
      },
      benchmarkSerializeRestore: async (iterations: number) => {
        const serTimes: number[] = [];
        const resTimes: number[] = [];
        const origIds = api.panels.map((p) => p.id).sort();
        const origGroupCount = api.groups.length;
        let fidelityAllPassed = true;
        let lastJsonBytes = 0;

        for (let i = 0; i < iterations; i++) {
          const ts0 = performance.now();
          const layoutObj: SerializedDockview = api.toJSON();
          const jsonStr = JSON.stringify(layoutObj);
          serTimes.push(performance.now() - ts0);
          lastJsonBytes = jsonStr.length;

          api.clear();
          await nextFrame();

          const tr0 = performance.now();
          const parsed = JSON.parse(jsonStr) as SerializedDockview;
          api.fromJSON(parsed);
          resTimes.push(performance.now() - tr0);
          await nextFrame();

          const restoredIds = api.panels.map((p) => p.id).sort();
          if (
            restoredIds.length !== origIds.length ||
            api.groups.length !== origGroupCount ||
            restoredIds.some((id, idx) => id !== origIds[idx])
          ) {
            fidelityAllPassed = false;
          }
        }

        serTimes.sort((a, b) => a - b);
        resTimes.sort((a, b) => a - b);
        return {
          iterations,
          serializeMsP50: percentile(serTimes, 50),
          serializeMsP95: percentile(serTimes, 95),
          restoreMsP50: percentile(resTimes, 50),
          restoreMsP95: percentile(resTimes, 95),
          fidelityAllPassed,
          panelCountBefore: origIds.length,
          panelCountAfter: api.panels.length,
          jsonBytes: lastJsonBytes,
        };
      },
      tryDockviewPopout: async () => {
        try {
          const domPanel = api.getPanel('dom-es');
          if (!domPanel) {
            return { supported: false, popoutWindowOpened: false, popoutGroupCount: 0, error: 'dom-es panel missing' };
          }
          const ok = await api.addPopoutGroup(domPanel.group, {
            position: { width: 420, height: 520, left: 60, top: 60 },
          });
          await new Promise((r) => setTimeout(r, 250));
          const popGroups = api.groups.filter((g) => g.api.location.type === 'popout').length;
          // Move panel back to main window if popped out cleanly
          return {
            supported: true,
            popoutWindowOpened: Boolean(ok),
            popoutGroupCount: popGroups,
            error: null,
          };
        } catch (err) {
          return {
            supported: false,
            popoutWindowOpened: false,
            popoutGroupCount: 0,
            error: String(err),
          };
        }
      },
      benchmarkCrossWindowSync: async (transport, count) => {
        const rtts: number[] = [];
        const symbols = ['ES H26', 'NQ H26', 'CL H26', 'GC H26', 'BTC-USD'];

        if (transport === 'broadcast') {
          const ch = new BroadcastChannel(CHANNEL_NAME);
          for (let seq = 1; seq <= count; seq++) {
            const sym = symbols[seq % symbols.length];
            const sentAt = performance.now();
            const rtt = await new Promise<number | null>((resolve) => {
              const timer = setTimeout(() => {
                ch.removeEventListener('message', onPong);
                resolve(null);
              }, 1000);
              const onPong = (ev: MessageEvent<SyncMessage>) => {
                const m = ev.data;
                if (m && m.kind === 'SYMBOL_PONG' && m.seq === seq && m.transport === 'broadcast') {
                  clearTimeout(timer);
                  ch.removeEventListener('message', onPong);
                  resolve(performance.now() - sentAt);
                }
              };
              ch.addEventListener('message', onPong);
              ch.postMessage({
                kind: 'SYMBOL_PING',
                seq,
                sentAt,
                symbol: sym,
                sourceId: 'main',
                transport: 'broadcast',
              } satisfies SyncMessage);
            });
            if (rtt !== null) rtts.push(rtt);
          }
          ch.close();
        } else {
          const ws = new WebSocket(WS_HUB_URL);
          await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = (e) => reject(e);
          });
          for (let seq = 1; seq <= count; seq++) {
            const sym = symbols[seq % symbols.length];
            const sentAt = performance.now();
            const rtt = await new Promise<number | null>((resolve) => {
              const timer = setTimeout(() => resolve(null), 1000);
              ws.onmessage = (ev) => {
                const m = JSON.parse(String(ev.data)) as SyncMessage;
                if (m && m.kind === 'SYMBOL_PONG' && m.seq === seq && m.transport === 'ws-hub') {
                  clearTimeout(timer);
                  resolve(performance.now() - sentAt);
                }
              };
              ws.send(
                JSON.stringify({
                  kind: 'SYMBOL_PING',
                  seq,
                  sentAt,
                  symbol: sym,
                  sourceId: 'main',
                  transport: 'ws-hub',
                } satisfies SyncMessage),
              );
            });
            if (rtt !== null) rtts.push(rtt);
          }
          ws.close();
        }

        rtts.sort((a, b) => a - b);
        return {
          transport,
          sent: count,
          received: rtts.length,
          rttMsP50: percentile(rtts, 50),
          rttMsP95: percentile(rtts, 95),
          rttMsP99: percentile(rtts, 99),
          rttMsMax: rtts.length ? rtts[rtts.length - 1] : 0,
          oneWayEstP95: percentile(rtts, 95) / 2,
        };
      },
      openHeavyPanel: (id: string) => {
        api.addPanel<PanelParams>({
          id,
          component: 'tradingPanel',
          title: `Heavy ${id}`,
          params: { kind: 'heavy', symbol: 'ES H26', linkGroup: 'A' },
          position: { referencePanel: 'chart-es', direction: 'within' },
        });
      },
      closePanel: (id: string) => {
        const panel = api.getPanel(id);
        if (panel) api.removePanel(panel);
      },
      getLifecycleStats: () => ({ ...lifecycleStats }),
    };
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <DockviewReact
        className="dockview-theme-abyss"
        components={COMPONENTS}
        onReady={onReady}
      />
    </div>
  );
}
