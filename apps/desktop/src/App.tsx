import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";
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
import { ChartPanel, type StudyOverlaySeries } from "./panels/chart-panel";
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
  cursor: 64,
  total_ticks: 2000,
  bars_sealed: 1,
  final_vwap_e9: null,
  sha256_hex: "0000000000000000000000000000000000000000000000000000000000000000",
  determinism_verified: false,
};

const SYMBOL_TICK_E9: Record<string, bigint> = {
  "BTC/USD": 500_000_000n,
  "ETH/USD": 100_000_000n,
  "SOL/USD": 10_000_000n,
};

const STUDY_COLORS: Record<string, string> = {
  sma: "#38bdf8",
  ema: "#f59e0b",
  vwap: "#a78bfa",
  luau: "#34d399",
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
  const [replayStatus, setReplayStatus] = useState<ReplayStatusSnapshot>(DEFAULT_REPLAY_STATUS);
  const [activeStudies, setActiveStudies] = useState<StudyRunResponse[]>([]);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ResolvedSetting[]>([]);
  const [exportedToml, setExportedToml] = useState<string | null>(null);

  const seriesSnapshotRef = useRef<{
    times: UTCTimestamp[];
    closes: number[];
    volumes: number[];
  }>({ times: [], closes: [], volumes: [] });

  // Async post-paint initialization (SV-01: zero blocking network I/O on startup)
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [cfg, ws, acct, rep, cfgCascade] = await Promise.all([
          transport.invokeJson<Record<string, never>, BootConfig>("get_boot_config", {}),
          transport.invokeJson<Record<string, never>, WorkspaceState>("get_workspace_snapshot", {}),
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
            render: () => <DomLadderPanel transport={transport} symbol={symbol} />,
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
      />
    </div>
  );
}
