import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookState,
  isTauriRuntime,
  OfflineSimTransportAdapter,
  TauriTransportAdapter,
  decodeFrameHeader,
  decodeStreamStatusFrame,
  FrameType,
  ProvenanceTier,
  type BootConfig,
  type BuiltinStudyKind,
  type PaperAccountSnapshot,
  type ReplayControlAction,
  type ReplayStatusSnapshot,
  type ResolvedSetting,
  type StudyRunRequest,
  type StudyRunResponse,
  type TransportAdapter,
  type WorkspacePatchResult,
  type WorkspaceState,
} from "@allegedly/ipc-client";
import { ChromeToolbar, StatusBar, WorkspaceHost } from "@allegedly/ui-chrome";
import { ReplayBar } from "./components/replay-bar";
import {
  ChartPanel,
  type ChartSeriesSnapshot,
  type StudyOverlaySeries,
} from "./panels/chart-panel";
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

const DEFAULT_REPLAY_STATUS: ReplayStatusSnapshot = {
  playing: false,
  speed: "1x",
  cursor: 0,
  total_ticks: 2000,
  bars_sealed: 0,
  final_vwap_e9: null,
  sha256_hex: "0".repeat(64),
  determinism_verified: false,
};

const SYMBOL_TICK_E9: Record<string, bigint> = {
  "BTC/USD": 500_000_000n, // $0.50
  "ETH/USD": 100_000_000n, // $0.10
  "SOL/USD": 10_000_000n, // $0.01
};

const SYMBOL_FALLBACK_PRICE: Record<string, number> = {
  "BTC/USD": 95_000,
  "ETH/USD": 3_500,
  "SOL/USD": 185,
};

const STUDY_COLORS: Record<string, string> = {
  sma: "#38bdf8",
  ema: "#f59e0b",
  vwap: "#a78bfa",
  wilder_rsi: "#34d399",
  cvd: "#22d3ee",
  footprint_delta: "#e879f9",
  luau: "#fb7185",
};

export interface AppProps {
  transport?: TransportAdapter;
}

export function App({ transport: providedTransport }: AppProps) {
  const transport = useMemo<TransportAdapter>(
    () => providedTransport ?? (isTauriRuntime() ? new TauriTransportAdapter() : new OfflineSimTransportAdapter()),
    [providedTransport],
  );

  const [bootConfig, setBootConfig] = useState<BootConfig>(DEFAULT_BOOT_CONFIG);
  const [symbol, setSymbol] = useState<string>("BTC/USD");
  const [timeframe, setTimeframe] = useState<string>("1m");
  const [stateRev, setStateRev] = useState<number>(0);
  const [bookState, setBookState] = useState<number>(BookState.Live);
  const [provenanceTier, setProvenanceTier] = useState<number>(ProvenanceTier.ExactTickAggr);
  const [droppedTotal, setDroppedTotal] = useState<number>(0);
  const [account, setAccount] = useState<PaperAccountSnapshot>(DEFAULT_PAPER_ACCOUNT);
  const [replayStatus, setReplayStatus] = useState<ReplayStatusSnapshot>(DEFAULT_REPLAY_STATUS);
  const [activeStudies, setActiveStudies] = useState<StudyRunResponse[]>([]);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ResolvedSetting[]>([]);
  const [exportedToml, setExportedToml] = useState<string | null>(null);
  const [layoutEpoch, setLayoutEpoch] = useState<number>(0);
  const [compactDensity, setCompactDensity] = useState<boolean>(true);
  const [showProvenanceOverlay, setShowProvenanceOverlay] = useState<boolean>(true);

  const seriesSnapshotRef = useRef<ChartSeriesSnapshot>({
    times: [],
    closes: [],
    volumes: [],
    buyVolumes: [],
    sellVolumes: [],
  });

  // Notify Tauri desktop host after genuine React mount + first animation frame paint (RTSD-05)
  useEffect(() => {
    if (transport.kind !== "tauri") return;
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        const firstPaintMs = Math.max(0, Math.round(performance.now()));
        void transport
          .invokeJson<{ first_paint_ms: number }, void>("report_ui_ready", {
            first_paint_ms: firstPaintMs,
          })
          .catch(() => {});
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2 !== 0) cancelAnimationFrame(raf2);
    };
  }, [transport]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [cfg, ws, acct, rep, cfgCascade] = await Promise.all([
          transport.invokeJson<Record<string, never>, BootConfig>("get_boot_config", {}),
          transport.invokeJson<Record<string, never>, WorkspaceState>("get_workspace_state", {}),
          transport.invokeJson<Record<string, never>, PaperAccountSnapshot>("get_paper_account", {}),
          transport.invokeJson<Record<string, never>, ReplayStatusSnapshot>("get_replay_status", {}),
          transport.invokeJson<Record<string, never>, ResolvedSetting[]>("get_settings_cascade", {}),
        ]);
        if (!mounted) return;
        setBootConfig(cfg);
        setStateRev(ws.state_rev);
        if (ws.link_group_symbols.A) setSymbol(ws.link_group_symbols.A);
        setAccount(acct);
        setReplayStatus(rep);
        setSettings(cfgCascade);
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
      let limitPrice: string | undefined;
      if (orderType === "limit") {
        const tickE9 = SYMBOL_TICK_E9[symbol] ?? 500_000_000n;
        const closes = seriesSnapshotRef.current.closes;
        const lastClose =
          closes.length > 0 && Number.isFinite(closes[closes.length - 1])
            ? closes[closes.length - 1]
            : (SYMBOL_FALLBACK_PRICE[symbol] ?? 95_000);
        const tickFloat = Number(tickE9) / 1e9;
        const baseTicks = BigInt(Math.max(1, Math.round(lastClose / tickFloat)));
        // Place resting limit slightly passive (2 ticks inside bid/ask)
        const offsetTicks = side === "buy" ? -2n : 2n;
        const limitTicks = baseTicks + offsetTicks > 0n ? baseTicks + offsetTicks : 1n;
        limitPrice = (limitTicks * tickE9).toString();
      }
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

  const handleReplayControl = useCallback(
    (action: ReplayControlAction) => {
      void transport
        .invokeJson<ReplayControlAction, ReplayStatusSnapshot>("control_replay", action)
        .then(setReplayStatus)
        .catch(() => {});
    },
    [transport],
  );

  const handleRunBuiltinStudy = useCallback(
    (kind: BuiltinStudyKind, period: number) => {
      setStudyError(null);
      const snap = seriesSnapshotRef.current;
      const id = `${kind}-${period}`;
      const req: StudyRunRequest = {
        id,
        builtin: kind,
        period,
        closes: snap.closes,
        volumes: snap.volumes,
        buy_volumes: snap.buyVolumes,
        sell_volumes: snap.sellVolumes,
      };
      void transport
        .invokeJson<StudyRunRequest, StudyRunResponse>("run_study", req)
        .then((res) => {
          setActiveStudies((prev) => [...prev.filter((s) => s.id !== res.id), res]);
        })
        .catch((err: unknown) => {
          setStudyError(err instanceof Error ? err.message : String(err));
        });
    },
    [transport],
  );

  const handleRunLuauStudy = useCallback(
    (script: string) => {
      setStudyError(null);
      const snap = seriesSnapshotRef.current;
      const req: StudyRunRequest = {
        id: "luau-custom",
        luau_script: script,
        closes: snap.closes,
        volumes: snap.volumes,
        buy_volumes: snap.buyVolumes,
        sell_volumes: snap.sellVolumes,
      };
      void transport
        .invokeJson<StudyRunRequest, StudyRunResponse>("run_study", req)
        .then((res) => {
          setActiveStudies((prev) => [...prev.filter((s) => s.id !== res.id), res]);
        })
        .catch((err: unknown) => {
          setStudyError(err instanceof Error ? err.message : String(err));
        });
    },
    [transport],
  );

  const handleClearStudies = useCallback(() => {
    setActiveStudies([]);
    setStudyError(null);
  }, []);

  const handleUpdateSetting = useCallback(
    (key: string, value: string) => {
      void transport
        .invokeJson<{ key: string; value: string }, ResolvedSetting[]>(
          "update_setting_override",
          { key, value },
        )
        .then(setSettings)
        .catch(() => {});
    },
    [transport],
  );

  const handleResetSetting = useCallback(
    (key: string) => {
      void transport
        .invokeJson<{ key: string }, ResolvedSetting[]>("reset_setting_override", { key })
        .then(setSettings)
        .catch(() => {});
    },
    [transport],
  );

  const handleExportWorkspaceToml = useCallback(() => {
    void transport
      .invokeJson<{ name: string; symbol: string; timeframe: string }, string>(
        "export_workspace_toml",
        { name: "Default Desk", symbol, timeframe },
      )
      .then(setExportedToml)
      .catch(() => {});
  }, [transport, symbol, timeframe]);

  const handleResetLayout = useCallback(() => {
    setLayoutEpoch((e) => e + 1);
  }, []);

  const studyOverlays = useMemo<StudyOverlaySeries[]>(
    () =>
      activeStudies
        .filter((s) => s.overlay)
        .map((s) => ({
          id: s.id,
          label: s.label,
          color:
            STUDY_COLORS[s.id.split("-")[0]] ??
            (s.id.startsWith("luau") ? STUDY_COLORS.luau : "#38bdf8"),
          values: s.values,
        })),
    [activeStudies],
  );

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
        compactDensity={compactDensity}
        onCompactDensityChange={setCompactDensity}
        showProvenanceOverlay={showProvenanceOverlay}
        onShowProvenanceOverlayChange={setShowProvenanceOverlay}
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
                studyOverlays={studyOverlays}
                seriesSnapshotRef={seriesSnapshotRef}
              />
            ),
          }}
          domPanel={{
            id: "dom-ladder",
            title: "DOM Ladder & Tape",
            render: () => (
              <DomLadderPanel
                transport={transport}
                symbol={symbol}
                compactDensity={compactDensity}
              />
            ),
          }}
          executionPanel={{
            id: "paper-oms",
            title: "Paper OMS · Studies · Provenance",
            render: () => (
              <PaperOmsPanel
                symbol={symbol}
                account={account}
                bookState={bookState}
                provenanceTier={provenanceTier}
                activeStudies={activeStudies}
                studyError={studyError}
                settings={settings}
                exportedToml={exportedToml}
                onSubmitOrder={handleSubmitOrder}
                onKillSwitch={handleKillSwitch}
                onRunBuiltinStudy={handleRunBuiltinStudy}
                onRunLuauStudy={handleRunLuauStudy}
                onClearStudies={handleClearStudies}
                onUpdateSetting={handleUpdateSetting}
                onResetSetting={handleResetSetting}
                onExportWorkspaceToml={handleExportWorkspaceToml}
              />
            ),
          }}
        />
      </main>
      <ReplayBar status={replayStatus} onControl={handleReplayControl} />
      <StatusBar
        transportKind={transport.kind}
        bootConfig={bootConfig}
        bookState={bookState}
        provenanceTier={provenanceTier}
        stateRev={stateRev}
        droppedTotal={droppedTotal}
        showProvenance={showProvenanceOverlay}
      />
    </div>
  );
}
