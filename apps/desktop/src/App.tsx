import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookState,
  decodeFrameHeader,
  decodeStreamStatusFrame,
  FrameType,
  isTauriRuntime,
  OfflineSimTransportAdapter,
  ProvenanceTier,
  TauriTransportAdapter,
  type BootConfig,
  type PaperAccountSnapshot,
  type TransportAdapter,
  type WorkspacePatchResult,
  type WorkspaceState,
} from "@allegedly/ipc-client";
import { ChromeToolbar, StatusBar, WorkspaceHost } from "@allegedly/ui-chrome";
import { ChartPanel } from "./panels/chart-panel";
import { DomLadderPanel } from "./panels/dom-ladder-panel";
import { PaperOmsPanel } from "./panels/paper-oms-panel";

const DEFAULT_BOOT_CONFIG: BootConfig = {
  updates_check_on_startup: false,
  live_armed: false,
  offline_mode: true,
};

const DEFAULT_PAPER_ACCOUNT: PaperAccountSnapshot = {
  mode: "PAPER / SIM",
  live_armed: false,
  net_position_e9: {},
  orders: [],
};

const SYMBOL_TICK_E9: Record<string, bigint> = {
  "BTC/USD": 500_000_000n,
  "ETH/USD": 100_000_000n,
  "SOL/USD": 10_000_000n,
};

export function App() {
  const transport = useMemo<TransportAdapter>(
    () => (isTauriRuntime() ? new TauriTransportAdapter() : new OfflineSimTransportAdapter()),
    [],
  );

  const [bootConfig, setBootConfig] = useState<BootConfig>(DEFAULT_BOOT_CONFIG);
  const [symbol, setSymbol] = useState<string>("BTC/USD");
  const [timeframe, setTimeframe] = useState<string>("1m");
  const [stateRev, setStateRev] = useState<number>(0);
  const [layoutEpoch, setLayoutEpoch] = useState<number>(0);
  const [bookState, setBookState] = useState<number>(BookState.Live);
  const [provenanceTier, setProvenanceTier] = useState<number>(ProvenanceTier.ExactTickAggr);
  const [droppedTotal, setDroppedTotal] = useState<number>(0);
  const [account, setAccount] = useState<PaperAccountSnapshot>(DEFAULT_PAPER_ACCOUNT);

  // Async post-paint initialization (SV-01: zero blocking network I/O on startup)
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [cfg, ws, acct] = await Promise.all([
          transport.invokeJson<Record<string, never>, BootConfig>("get_boot_config", {}),
          transport.invokeJson<Record<string, never>, WorkspaceState>("get_workspace_snapshot", {}),
          transport.invokeJson<Record<string, never>, PaperAccountSnapshot>("get_paper_account", {}),
        ]);
        if (!mounted) return;
        setBootConfig(cfg);
        setStateRev(ws.state_rev);
        if (ws.link_group_symbols.A) setSymbol(ws.link_group_symbols.A);
        setAccount(acct);
      } catch {
        // Keep safe offline defaults (updates_check_on_startup=false, live_armed=false)
      }
    })();

    const unsub = transport.subscribeBinary(1, (buf) => {
      try {
        const hdr = decodeFrameHeader(buf);
        if (hdr.frameType === FrameType.STREAM_STATUS_FRAME) {
          const { status } = decodeStreamStatusFrame(buf);
          setBookState(status.bookState);
          setProvenanceTier(status.provenanceTier);
          setDroppedTotal(status.droppedTotal);
        }
      } catch {
        // Ignore non-status frames
      }
    });

    return () => {
      mounted = false;
      unsub();
      transport.dispose?.();
    };
  }, [transport]);

  const handleSymbolChange = useCallback(
    (nextSymbol: string) => {
      setSymbol(nextSymbol);
      void transport
        .invokeJson<unknown, WorkspacePatchResult>("apply_workspace_patch", {
          observed_rev: stateRev,
          set_link_symbol: ["A", nextSymbol],
        })
        .then((res) => {
          setStateRev(res.current_rev);
        })
        .catch(() => {});
    },
    [transport, stateRev],
  );

  const handleSubmitOrder = useCallback(
    (side: "buy" | "sell", orderType: "market" | "limit") => {
      const limitPrice =
        orderType === "limit"
          ? ((SYMBOL_TICK_E9[symbol] ?? 10_000_000n) * 190_000n).toString()
          : undefined;
      void transport
        .invokeJson<unknown, PaperAccountSnapshot>("submit_paper_order", {
          symbol,
          side,
          order_type: orderType,
          qty_e9: "500000000", // 0.50 units exact fixed-point
          limit_price_e9: limitPrice,
        })
        .then(setAccount)
        .catch(() => {});
    },
    [transport, symbol],
  );

  const handleKillSwitch = useCallback(() => {
    void transport
      .invokeJson<Record<string, never>, PaperAccountSnapshot>("kill_switch_cancel_all", {})
      .then(setAccount)
      .catch(() => {});
  }, [transport]);

  const handleResetLayout = useCallback(() => {
    setLayoutEpoch((e) => e + 1);
  }, []);

  const tickSizeE9 = SYMBOL_TICK_E9[symbol] ?? 500_000_000n;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <ChromeToolbar
        symbol={symbol}
        timeframe={timeframe}
        bootConfig={bootConfig}
        stateRev={stateRev}
        onSymbolChange={handleSymbolChange}
        onTimeframeChange={setTimeframe}
        onKillSwitch={handleKillSwitch}
        onResetLayout={handleResetLayout}
      />
      <main className="flex min-h-0 flex-1 flex-col">
        <WorkspaceHost
          key={layoutEpoch}
          chartPanel={{
            id: "chart-main",
            title: `${symbol} · ${timeframe} Chart`,
            render: () => (
              <ChartPanel
                transport={transport}
                symbol={symbol}
                timeframe={timeframe}
                tickSizeE9={tickSizeE9}
              />
            ),
          }}
          domPanel={{
            id: "dom-ladder",
            title: "DOM Ladder & Tape",
            render: () => <DomLadderPanel transport={transport} symbol={symbol} />,
          }}
          executionPanel={{
            id: "paper-oms",
            title: "Paper Execution & Provenance",
            render: () => (
              <PaperOmsPanel
                symbol={symbol}
                account={account}
                bookState={bookState}
                provenanceTier={provenanceTier}
                onSubmitOrder={handleSubmitOrder}
                onKillSwitch={handleKillSwitch}
              />
            ),
          }}
        />
      </main>
      <StatusBar
        transportKind={transport.kind}
        bootConfig={bootConfig}
        bookState={bookState}
        provenanceTier={provenanceTier}
        stateRev={stateRev}
        droppedTotal={droppedTotal}
      />
    </div>
  );
}
