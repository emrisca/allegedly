import { DEFAULT_VWAP } from "./indicators/vwap-settings";
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
  LIVE_MARKET_DATA_SYMBOLS,
  type BootConfig,
  type BuiltinStudyKind,
  type MarketDataSourceId,
  type MarketDataSourceRequest,
  type MarketDataStatusDto,
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
import {
  ChromeToolbar,
  cloneChartSettings,
  DEFAULT_CHART_SETTINGS,
  DEFAULT_CHART_TEMPLATES,
  StatusBar,
  WorkspaceHost,
  type CandleVisualStyle,
  type ChartBarType,
  type ChartSettings,
  type ChartTabItem,
  type ChartSettingsTemplate,
  type MarketDataFeedId,
  type QuickRangePreset,
  applyAppAppearanceToDocument,
  getMarketProviderMeta,
  getSystemAppAppearance,
  hasStoredAppAppearance,
  isProviderConfigured,
  loadStoredAppAppearance,
  loadStoredProviderConfigs,
  saveStoredAppAppearance,
  saveStoredProviderConfigs,
  type AppAppearanceSettings,
  type MarketProviderConfigMap,
  type MarketProviderId,
  type WorkspaceLayoutMode,
} from "@allegedly/ui-chrome";
import {
  DEFAULT_TIMEFRAME_VISIBILITY,
  IndicatorSettingsDialog,
  type IndicatorConfig,
  type IndicatorPriceSource,
} from "./components/indicator-settings-dialog";
import {
  IndicatorsDialog,
  type IndicatorLayerState,
} from "./components/indicators-dialog";
import { LeftDrawingRail } from "./components/left-drawing-rail";
import { ReplayBar } from "./components/replay-bar";
import {
  createDefaultAlertDraft,
  evaluateAlertsOnPrice,
  loadStoredAlertLogs,
  loadStoredAlerts,
  playAlertChime,
  saveStoredAlertLogs,
  saveStoredAlerts,
  type AlertLogEntry,
  type ChartAlert,
} from "./alerts/alert-engine";
import { AlertDialog } from "./components/alert-dialog";
import { AlertsPanel } from "./components/alerts-panel";
import {
  ObjectTreePanel,
  type DataWindowSnapshot,
  type DrawingGroupNode,
  type ObjectTreeIndicatorItem,
} from "./components/object-tree-panel";
import { RightIconRail, type RightDrawerTab } from "./components/right-icon-rail";
import { getSymbolMeta, WATCHLIST_SYMBOLS } from "./data/symbols";
import {
  loadStoredFavorites,
  saveStoredFavorites,
  type DrawingObject,
  type DrawingToolKind,
  type PlacedDrawingKind,
} from "./drawings/drawing-engine";
import {
  ChartPanel,
  type ChartHistoryActions,
  type ChartSeriesSnapshot,
  type StudyOverlaySeries,
} from "./panels/chart-panel";
import { DomLadderPanel } from "./panels/dom-ladder-panel";
import { PaperOmsPanel } from "./panels/paper-oms-panel";
import { SymbolSearchDialog, type SymbolSearchMode } from "./components/symbol-search-dialog";
import { WatchlistPanel, type WatchlistItemEntry } from "./panels/watchlist-panel";
import type { OverlayVisibility } from "./render/webgl2-orderflow-overlay";

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

const STUDY_COLORS: Record<string, string> = {
  sma: "#38bdf8",
  ema: "#f59e0b",
  vwap: "#2962ff",
  wilder_rsi: "#34d399",
  cvd: "#22d3ee",
  footprint_delta: "#e879f9",
  luau: "#fb7185",
};

const CHART_SETTINGS_STORAGE_KEY = "allegedly.chartSettings.v1";
const CHART_TEMPLATES_STORAGE_KEY = "allegedly.chartTemplates.v1";
const RIGHT_DRAWER_WIDTH_STORAGE_KEY = "allegedly.rightDrawerWidth.v1";
const DEFAULT_RIGHT_DRAWER_WIDTH = 312;
// Minimum width where all Watchlist columns (Symbol/Provider, Last, Chg, Chg%),
// flag ribbon, padding, and active symbol detail footer fit without clipping.
const MIN_RIGHT_DRAWER_WIDTH = 308;
const MAX_RIGHT_DRAWER_WIDTH = 520;

function getMaxRightDrawerWidth(): number {
  if (typeof window === "undefined") return MAX_RIGHT_DRAWER_WIDTH;
  return Math.max(
    MIN_RIGHT_DRAWER_WIDTH,
    Math.min(MAX_RIGHT_DRAWER_WIDTH, Math.floor(window.innerWidth * 0.45)),
  );
}

function clampRightDrawerWidth(width: number): number {
  return Math.min(getMaxRightDrawerWidth(), Math.max(MIN_RIGHT_DRAWER_WIDTH, Math.round(width)));
}

function loadStoredRightDrawerWidth(): number {
  if (typeof window === "undefined") return DEFAULT_RIGHT_DRAWER_WIDTH;
  try {
    const raw = window.localStorage.getItem(RIGHT_DRAWER_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_RIGHT_DRAWER_WIDTH;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_RIGHT_DRAWER_WIDTH;
    return clampRightDrawerWidth(parsed);
  } catch {
    return DEFAULT_RIGHT_DRAWER_WIDTH;
  }
}

function loadStoredChartSettings(): ChartSettings {
  if (typeof window === "undefined") return cloneChartSettings(DEFAULT_CHART_SETTINGS);
  try {
    const raw = window.localStorage.getItem(CHART_SETTINGS_STORAGE_KEY);
    const bidAskReviewed = window.localStorage.getItem("allegedly.bidAskOptIn.v1") === "1";
    window.localStorage.setItem("allegedly.bidAskOptIn.v1", "1");
    if (!raw) return cloneChartSettings(DEFAULT_CHART_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<ChartSettings>;
    return {
      symbol: { ...DEFAULT_CHART_SETTINGS.symbol, ...(parsed.symbol ?? {}) },
      statusLine: { ...DEFAULT_CHART_SETTINGS.statusLine, ...(parsed.statusLine ?? {}) },
      scales: { ...DEFAULT_CHART_SETTINGS.scales, ...(parsed.scales ?? {}), bidAndAsk: bidAskReviewed ? parsed.scales?.bidAndAsk ?? "hidden" : "hidden" },
      canvas: { ...DEFAULT_CHART_SETTINGS.canvas, ...(parsed.canvas ?? {}) },
      trading: { ...DEFAULT_CHART_SETTINGS.trading, ...(parsed.trading ?? {}) },
      alerts: { ...DEFAULT_CHART_SETTINGS.alerts, ...(parsed.alerts ?? {}) },
      events: { ...DEFAULT_CHART_SETTINGS.events, ...(parsed.events ?? {}) },
    };
  } catch {
    return cloneChartSettings(DEFAULT_CHART_SETTINGS);
  }
}

function loadStoredChartTemplates(): ChartSettingsTemplate[] {
  if (typeof window === "undefined") {
    return DEFAULT_CHART_TEMPLATES.map((t) => ({
      ...t,
      settings: cloneChartSettings(t.settings),
    }));
  }
  try {
    const raw = window.localStorage.getItem(CHART_TEMPLATES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_TEMPLATES.map((t) => ({
        ...t,
        settings: cloneChartSettings(t.settings),
      }));
    }
    const parsed = JSON.parse(raw) as ChartSettingsTemplate[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_CHART_TEMPLATES.map((t) => ({
        ...t,
        settings: cloneChartSettings(t.settings),
      }));
    }
    return parsed.map((t) => ({
      id: String(t.id),
      name: String(t.name),
      settings: {
        symbol: { ...DEFAULT_CHART_SETTINGS.symbol, ...(t.settings?.symbol ?? {}) },
        statusLine: { ...DEFAULT_CHART_SETTINGS.statusLine, ...(t.settings?.statusLine ?? {}) },
        scales: { ...DEFAULT_CHART_SETTINGS.scales, ...(t.settings?.scales ?? {}) },
        canvas: { ...DEFAULT_CHART_SETTINGS.canvas, ...(t.settings?.canvas ?? {}) },
        trading: { ...DEFAULT_CHART_SETTINGS.trading, ...(t.settings?.trading ?? {}) },
        alerts: { ...DEFAULT_CHART_SETTINGS.alerts, ...(t.settings?.alerts ?? {}) },
        events: { ...DEFAULT_CHART_SETTINGS.events, ...(t.settings?.events ?? {}) },
      },
    }));
  } catch {
    return DEFAULT_CHART_TEMPLATES.map((t) => ({
      ...t,
      settings: cloneChartSettings(t.settings),
    }));
  }
}


function extractPriceSource(snap: ChartSeriesSnapshot, source: IndicatorPriceSource): number[] {
  const closes = snap.closes;
  if (source === "close") return closes;
  const opens = snap.opens ?? closes;
  const highs = snap.highs ?? closes;
  const lows = snap.lows ?? closes;
  const n = closes.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const o = opens[i] ?? closes[i];
    const h = highs[i] ?? closes[i];
    const l = lows[i] ?? closes[i];
    const c = closes[i];
    if (source === "open") out[i] = o;
    else if (source === "high") out[i] = h;
    else if (source === "low") out[i] = l;
    else if (source === "hl2") out[i] = (h + l) / 2;
    else if (source === "hlc3") out[i] = (h + l + c) / 3;
    else out[i] = (o + h + l + c) / 4;
  }
  return out;
}

export interface AppProps {
  transport?: TransportAdapter;
}


const WATCHLIST_STORAGE_KEY = "allegedly.watchlist.v1";

function loadStoredWatchlist(): WatchlistItemEntry[] {
  const defaults: WatchlistItemEntry[] = WATCHLIST_SYMBOLS.map((m) => ({
    symbol: m.symbol,
    providerId: m.defaultProvider,
    flag: null,
  }));
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as WatchlistItemEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaults;
    return parsed
      .filter((x) => x && typeof x.symbol === "string")
      .map((x) => ({
        symbol: x.symbol,
        providerId: x.providerId ?? getSymbolMeta(x.symbol).defaultProvider,
        flag: x.flag ?? null,
      }));
  } catch {
    return defaults;
  }
}

export function App({ transport: providedTransport }: AppProps) {
  const transport = useMemo<TransportAdapter>(
    () =>
      providedTransport ??
      (isTauriRuntime() ? new TauriTransportAdapter() : new OfflineSimTransportAdapter()),
    [providedTransport],
  );

  const [bootConfig, setBootConfig] = useState<BootConfig>(DEFAULT_BOOT_CONFIG);
  const [symbol, setSymbol] = useState<string>("BTC/USD");
  const [timeframe, setTimeframe] = useState<string>("D");
  const [tabs, setTabs] = useState<Array<{ id: string; symbol: string; timeframe: string }>>([
    { id: "tab-1", symbol: "BTC/USD", timeframe: "D" },
  ]);
  const sourceRequestRef = useRef(0);
  const [marketStreamReady, setMarketStreamReady] = useState(true);
  const [dataSource, setDataSource] = useState<MarketDataFeedId>("paper_sim");
  const [dataSourceConnected, setDataSourceConnected] = useState<boolean>(true);
  const [dataSourceError, setDataSourceError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");
  const [alerts, setAlerts] = useState<ChartAlert[]>(() => loadStoredAlerts());
  const [alertLogs, setAlertLogs] = useState<AlertLogEntry[]>(() => loadStoredAlertLogs());
  const [alertDialogState, setAlertDialogState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    alert: ChartAlert | null;
  }>({ open: false, mode: "create", alert: null });
  const alertsRef = useRef<ChartAlert[]>(alerts);
  alertsRef.current = alerts;
  const prevPriceBySymbolRef = useRef<Map<string, number>>(new Map());
  const [alertsCount, setAlertsCount] = useState<number>(() =>
    loadStoredAlerts().filter((a) => a.status === "active").length,
  );
  const [objectTreeSubTab, setObjectTreeSubTab] = useState<"tree" | "data">("tree");
  const [drawingGroups, setDrawingGroups] = useState<DrawingGroupNode[]>(() => {
    if (typeof window === "undefined" || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem("allegedly.drawing_groups.v1");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as DrawingGroupNode[]) : [];
    } catch {
      return [];
    }
  });
  const [drawingsSnapshot, setDrawingsSnapshot] = useState<readonly DrawingObject[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [indicatorHiddenState, setIndicatorHiddenState] = useState<{
    hiddenStudyIds: ReadonlySet<string>;
    hiddenOrderflowLayers: ReadonlySet<keyof OverlayVisibility>;
    volumeHidden: boolean;
  }>({
    hiddenStudyIds: new Set(),
    hiddenOrderflowLayers: new Set(),
    volumeHidden: false,
  });
  const [dataWindowSnapshot, setDataWindowSnapshot] = useState<DataWindowSnapshot | null>(null);
  const [stateRev, setStateRev] = useState<number>(0);
  const [bookState, setBookState] = useState<number>(BookState.Live);
  const [provenanceTier, setProvenanceTier] = useState<number>(ProvenanceTier.ExactTickAggr);
  const [droppedTotal, setDroppedTotal] = useState<number>(0);
  const [account, setAccount] = useState<PaperAccountSnapshot>(DEFAULT_PAPER_ACCOUNT);
  const [replayStatus, setReplayStatus] = useState<ReplayStatusSnapshot>(DEFAULT_REPLAY_STATUS);
  const [activeStudies, setActiveStudies] = useState<StudyRunResponse[]>([]);
  const [studyConfigs, setStudyConfigs] = useState<Record<string, IndicatorConfig>>({});
  const [editingStudyId, setEditingStudyId] = useState<string | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ResolvedSetting[]>([]);
  const [exportedToml, setExportedToml] = useState<string | null>(null);
  const [layoutEpoch, setLayoutEpoch] = useState<number>(0);
  const [compactDensity, setCompactDensity] = useState<boolean>(true);
  const [showProvenanceOverlay, setShowProvenanceOverlay] = useState<boolean>(true);

  // Institutional layout & chart chrome state
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>("focus");
  const [rightTab, setRightTab] = useState<RightDrawerTab>("watchlist");
  const [rightDrawerWidth, setRightDrawerWidth] = useState<number>(loadStoredRightDrawerWidth);
  const [isResizingRightDrawer, setIsResizingRightDrawer] = useState<boolean>(false);
  const rightResizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(RIGHT_DRAWER_WIDTH_STORAGE_KEY, String(rightDrawerWidth));
    } catch {
      // ignore storage failures
    }
  }, [rightDrawerWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      setRightDrawerWidth((curr) => clampRightDrawerWidth(curr));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const handleRightResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      rightResizeDragRef.current = { startX: e.clientX, startWidth: rightDrawerWidth };
      setIsResizingRightDrawer(true);
    },
    [rightDrawerWidth],
  );

  const handleRightResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = rightResizeDragRef.current;
    if (!drag) return;
    const delta = drag.startX - e.clientX;
    setRightDrawerWidth(clampRightDrawerWidth(drag.startWidth + delta));
  }, []);

  const handleRightResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!rightResizeDragRef.current) return;
    rightResizeDragRef.current = null;
    setIsResizingRightDrawer(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleRightResizeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 24 : 12;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setRightDrawerWidth((curr) => clampRightDrawerWidth(curr + step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setRightDrawerWidth((curr) => clampRightDrawerWidth(curr - step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setRightDrawerWidth(DEFAULT_RIGHT_DRAWER_WIDTH);
    }
  }, []);
  const [replayOpen, setReplayOpen] = useState<boolean>(false);
  const [chartSettings, setChartSettings] = useState<ChartSettings>(loadStoredChartSettings);
  const [chartTemplates, setChartTemplates] = useState<ChartSettingsTemplate[]>(
    loadStoredChartTemplates,
  );
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>("symbol");
  const [highlightProviderId, setHighlightProviderId] = useState<MarketProviderId | null>(null);
  const [appAppearance, setAppAppearance] = useState<AppAppearanceSettings>(loadStoredAppAppearance);
  const appearanceIsExplicitRef = useRef(hasStoredAppAppearance());
  const [providerConfigs, setProviderConfigs] = useState<MarketProviderConfigMap>(
    loadStoredProviderConfigs,
  );
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItemEntry[]>(loadStoredWatchlist);
  const [activeProviderId, setActiveProviderId] = useState<MarketProviderId>("paper_sim");
  const [symbolSearchOpen, setSymbolSearchOpen] = useState<boolean>(false);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>("");
  const [symbolSearchMode, setSymbolSearchMode] = useState<SymbolSearchMode>("switch");

  useEffect(() => {
    applyAppAppearanceToDocument(appAppearance);
  }, [appAppearance]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemAppearance = () => {
      if (!appearanceIsExplicitRef.current) setAppAppearance(getSystemAppAppearance());
    };
    media.addEventListener("change", syncSystemAppearance);
    return () => media.removeEventListener("change", syncSystemAppearance);
  }, []);

  const handleAppAppearanceChange = useCallback((next: AppAppearanceSettings) => {
    appearanceIsExplicitRef.current = true;
    setAppAppearance(next);
    saveStoredAppAppearance(next);
  }, []);

  const handleProviderConfigsChange = useCallback((next: MarketProviderConfigMap) => {
    setProviderConfigs(next);
    saveStoredProviderConfigs(next);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistItems));
    } catch {
      // ignore storage quota errors
    }
  }, [watchlistItems]);

  const openSettingsAtTab = useCallback((tab: string, providerId?: MarketProviderId) => {
    setSettingsInitialTab(tab);
    setHighlightProviderId(providerId ?? null);
    setSettingsOpen(true);
  }, []);
  const [indicatorsOpen, setIndicatorsOpen] = useState<boolean>(false);
  const [overlayVisibility, setOverlayVisibility] = useState<OverlayVisibility>({
    footprint: false,
    vrvp: false,
    tpo: false,
    marketStructure: false,
    vwapKeyLevels: false,
    tradingSessions: false,
  });
  const [showVolume, setShowVolume] = useState<boolean>(() => chartSettings.statusLine.volume);
  const [candleStyle, setCandleStyle] = useState<CandleVisualStyle>("monochrome");
  const [barType, setBarType] = useState<ChartBarType>("candles");

  const handleBarTypeChange = useCallback((next: ChartBarType) => {
    setBarType(next);
    if (next === "volume_footprint") {
      setOverlayVisibility((prev) => ({ ...prev, footprint: true }));
    } else if (next === "tpo") {
      setOverlayVisibility((prev) => ({ ...prev, tpo: true }));
    } else if (next === "session_vp") {
      setOverlayVisibility((prev) => ({ ...prev, vrvp: true }));
    }
  }, []);
  const [activeTool, setActiveTool] = useState<DrawingToolKind>("cursor");
  const [magnetEnabled, setMagnetEnabled] = useState<boolean>(false);
  const [cmdHeld, setCmdHeld] = useState<boolean>(false);
  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>      target instanceof HTMLInputElement ||      target instanceof HTMLTextAreaElement ||      target instanceof HTMLSelectElement ||      (target instanceof HTMLElement && target.isContentEditable);
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.key === "Meta" || e.key === "Control") setCmdHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") setCmdHeld(false);
    };
    const onBlur = () => setCmdHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const [showFloatingBar, setShowFloatingBar] = useState<boolean>(true);
  const [stayInDrawingMode, setStayInDrawingMode] = useState<boolean>(false);
  const [drawingsLocked, setDrawingsLocked] = useState<boolean>(false);
  const [drawingsHidden, setDrawingsHidden] = useState<boolean>(false);
  const [favoriteTools, setFavoriteTools] = useState<PlacedDrawingKind[]>(loadStoredFavorites);
  const [activeIconStamp, setActiveIconStamp] = useState<string>("★");
  const [activeRange, setActiveRange] = useState<QuickRangePreset>("1Y");
  const [autoScale, setAutoScale] = useState<boolean>(true);
  const [logScale, setLogScale] = useState<boolean>(false);
  const [historyMeta, setHistoryMeta] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    count: number;
  }>({ canUndo: false, canRedo: false, count: 0 });
  const [livePrices, setLivePrices] = useState<
    Record<string, { last: number; change: number; changePct: number }>
  >({});

  const chartHistoryActionsRef = useRef<ChartHistoryActions | null>(null);
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
        if (ws.state_rev > 0 && ws.link_group_symbols.A) {
          setSymbol(ws.link_group_symbols.A);
        }
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

  useEffect(() => {
    if (dataSource === "paper_sim") return;
    let alive = true;
    const pollStatus = () => {
      void transport
        .invokeJson<Record<string, never>, MarketDataStatusDto>("get_market_data_status", {})
        .then((st) => {
          if (!alive) return;
          setDataSourceConnected(st.connected);
          setDataSourceError(st.last_error);
        })
        .catch(() => {});
    };
    pollStatus();
    const handle = setInterval(pollStatus, 1500);
    return () => {
      alive = false;
      clearInterval(handle);
    };
  }, [transport, dataSource]);

  const applyMarketDataSource = useCallback(
    (nextSource: MarketDataFeedId, targetSymbol: string) => {
      const liveSupported = (LIVE_MARKET_DATA_SYMBOLS as readonly string[]).includes(targetSymbol);
      const resolvedSymbol =
        nextSource !== "paper_sim" && !liveSupported ? LIVE_MARKET_DATA_SYMBOLS[0] : targetSymbol;

      if (resolvedSymbol !== targetSymbol) {
        setSymbol(resolvedSymbol);
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, symbol: resolvedSymbol } : t)),
        );
      }

      const request = ++sourceRequestRef.current;
      setMarketStreamReady(false);
      setDataSource(nextSource);
      setDataSourceError(null);
      setDataSourceConnected(nextSource === "paper_sim");

      void transport
        .invokeJson<MarketDataSourceRequest, MarketDataStatusDto>("set_market_data_source", {
          source: nextSource as MarketDataSourceId,
          symbol: resolvedSymbol,
        })
        .then((st) => {
          if (request !== sourceRequestRef.current) return;
          setMarketStreamReady(st.symbol === resolvedSymbol && st.source === nextSource);
          setDataSource(st.source);
          setDataSourceConnected(st.connected);
          setDataSourceError(st.last_error);
        })
        .catch((err: unknown) => {
          if (request !== sourceRequestRef.current) return;
          setDataSourceConnected(false);
          setDataSourceError(err instanceof Error ? err.message : String(err));
        });
    },
    [transport, activeTabId],
  );

  const handleDataSourceChange = useCallback(
    (nextSource: MarketDataFeedId) => {
      applyMarketDataSource(nextSource, symbol);
    },
    [applyMarketDataSource, symbol],
  );

  const handleSymbolChange = useCallback(
    (nextSymbol: string) => {
      setSymbol(nextSymbol);
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, symbol: nextSymbol } : t)),
      );
      if (dataSource !== "paper_sim") {
        const liveSupported = (LIVE_MARKET_DATA_SYMBOLS as readonly string[]).includes(nextSymbol);
        applyMarketDataSource(liveSupported ? dataSource : "paper_sim", nextSymbol);
      }
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
    [transport, stateRev, activeTabId, dataSource, applyMarketDataSource],
  );

  const handleTimeframeChange = useCallback(
    (nextTf: string) => {
      setTimeframe(nextTf);
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, timeframe: nextTf } : t)),
      );
    },
    [activeTabId],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const target = tabs.find((t) => t.id === tabId);
      if (!target) return;
      setActiveTabId(tabId);
      setSymbol(target.symbol);
      setTimeframe(target.timeframe);
    },
    [tabs],
  );

  const handleAddTab = useCallback(() => {
    const used = new Set(tabs.map((t) => t.symbol));
    const candidate =
      WATCHLIST_SYMBOLS.find((m) => !used.has(m.symbol))?.symbol ??
      WATCHLIST_SYMBOLS[tabs.length % WATCHLIST_SYMBOLS.length]?.symbol ??
      "ES1!";
    const nextId = `tab-${Date.now()}`;
    setTabs((prev) => [...prev, { id: nextId, symbol: candidate, timeframe }]);
    setActiveTabId(nextId);
    setSymbol(candidate);
  }, [tabs, timeframe]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (tabs.length <= 1) return;
      const idx = tabs.findIndex((t) => t.id === tabId);
      const nextTabs = tabs.filter((t) => t.id !== tabId);
      setTabs(nextTabs);
      if (tabId === activeTabId) {
        const fallback = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
        if (fallback) {
          setActiveTabId(fallback.id);
          setSymbol(fallback.symbol);
          setTimeframe(fallback.timeframe);
        }
      }
    },
    [tabs, activeTabId],
  );

  useEffect(() => {
    saveStoredAlerts(alerts);
    setAlertsCount(alerts.filter((a) => a.status === "active").length);
  }, [alerts]);

  useEffect(() => {
    saveStoredAlertLogs(alertLogs);
  }, [alertLogs]);

  useEffect(() => {
    try {
      window.localStorage.setItem("allegedly.drawing_groups.v1", JSON.stringify(drawingGroups));
    } catch {
      // ignore storage quota errors
    }
  }, [drawingGroups]);

  const handleLivePriceSample = useCallback((sym: string, last: number, previousClose?: number | null) => {
    const meta = getSymbolMeta(sym);
    const openRef = previousClose === undefined ? Math.max(0.01, meta.basePrice - meta.seedChange) : (previousClose ?? NaN);
    const change = last - openRef;
    const changePct = (change / openRef) * 100;
    setLivePrices((prev) => ({
      ...prev,
      [sym]: { last, change, changePct },
    }));

    const prevPrice = prevPriceBySymbolRef.current.get(sym) ?? null;
    prevPriceBySymbolRef.current.set(sym, last);
    if (alertsRef.current.length > 0 && Number.isFinite(last)) {
      const nowMs = Date.now();
      const barTimeSec = Math.floor(nowMs / 60_000) * 60;
      const result = evaluateAlertsOnPrice({
        alerts: alertsRef.current,
        symbol: sym,
        prevPrice,
        nextPrice: last,
        barTimeSec,
        nowMs,
      });
      if (result.changed) {
        setAlerts(result.alerts);
      }
      if (result.triggered.length > 0) {
        setAlertLogs((prev) => [...result.triggered, ...prev].slice(0, 100));
        const firstLog = result.triggered[0];
        const firstAlert = result.alerts.find((al) => al.id === firstLog.alertId);
        if (firstAlert) {
          if (firstAlert.notifications.toasts) {
            chartHistoryActionsRef.current?.showToast?.(
              `Alert triggered: ${firstLog.message}`,
            );
          }
          if (firstAlert.notifications.sound) {
            playAlertChime();
          }
        }
      }
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHART_SETTINGS_STORAGE_KEY, JSON.stringify(chartSettings));
    } catch {
      // Ignore storage quota errors in restricted sandboxes
    }
  }, [chartSettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHART_TEMPLATES_STORAGE_KEY, JSON.stringify(chartTemplates));
    } catch {
      // Ignore storage quota errors in restricted sandboxes
    }
  }, [chartTemplates]);

  const handleCandleStyleChange = useCallback((next: CandleVisualStyle) => {
    setCandleStyle(next);
    setChartSettings((prev) => ({
      ...prev,
      symbol:
        next === "monochrome"
          ? {
              ...prev.symbol,
              bodyUpColor: DEFAULT_CHART_SETTINGS.symbol.bodyUpColor,
              bodyDownColor: DEFAULT_CHART_SETTINGS.symbol.bodyDownColor,
              borderUpColor: DEFAULT_CHART_SETTINGS.symbol.borderUpColor,
              borderDownColor: DEFAULT_CHART_SETTINGS.symbol.borderDownColor,
              wickUpColor: DEFAULT_CHART_SETTINGS.symbol.wickUpColor,
              wickDownColor: DEFAULT_CHART_SETTINGS.symbol.wickDownColor,
            }
          : {
              ...prev.symbol,
              bodyUpColor: "#089981",
              bodyDownColor: "#f23645",
              borderUpColor: "#089981",
              borderDownColor: "#f23645",
              wickUpColor: "#089981",
              wickDownColor: "#f23645",
            },
    }));
  }, []);

  const handleApplyChartTemplate = useCallback((tpl: ChartSettingsTemplate) => {
    setChartSettings(cloneChartSettings(tpl.settings));
    setCandleStyle(
      tpl.settings.symbol.bodyUpColor.toLowerCase() ===
        DEFAULT_CHART_SETTINGS.symbol.bodyUpColor.toLowerCase()
        ? "monochrome"
        : "classic",
    );
  }, []);

  const handleSaveChartTemplate = useCallback((name: string, nextSettings: ChartSettings) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setChartTemplates((prev) => {
      const existingIdx = prev.findIndex((t) => t.name.toLowerCase() === trimmed.toLowerCase());
      const nextEntry: ChartSettingsTemplate = {
        id: existingIdx >= 0 ? prev[existingIdx].id : `tpl-${Date.now()}`,
        name: trimmed,
        settings: cloneChartSettings(nextSettings),
      };
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = nextEntry;
        return copy;
      }
      return [...prev, nextEntry];
    });
  }, []);

  const handleApplyChartDefaults = useCallback(() => {
    setChartSettings(cloneChartSettings(DEFAULT_CHART_SETTINGS));
    setCandleStyle("monochrome");
  }, []);

  const handleSubmitOrder = useCallback(
    (side: "buy" | "sell", orderType: "market" | "limit", explicitPrice?: number, qty?: number) => {
      let limitPrice: string | undefined;
      if (orderType === "limit") {
        const meta = getSymbolMeta(symbol);
        const tickE9 = meta.tickSizeE9;
        const tickFloat = Number(tickE9) / 1e9;
        if (typeof explicitPrice === "number" && Number.isFinite(explicitPrice) && explicitPrice > 0) {
          const snappedTicks = BigInt(Math.max(1, Math.round(explicitPrice / tickFloat)));
          limitPrice = (snappedTicks * tickE9).toString();
        } else {
          const closes = seriesSnapshotRef.current.closes;
          const lastClose =
            closes.length > 0 && Number.isFinite(closes[closes.length - 1])
              ? closes[closes.length - 1]
              : meta.basePrice;
          const baseTicks = BigInt(Math.max(1, Math.round(lastClose / tickFloat)));
          const offsetTicks = side === "buy" ? -2n : 2n;
          const limitTicks = baseTicks + offsetTicks > 0n ? baseTicks + offsetTicks : 1n;
          limitPrice = (limitTicks * tickE9).toString();
        }
      }
      void transport
        .invokeJson<unknown, PaperAccountSnapshot>("submit_paper_order", {
          symbol,
          side,
          order_type: orderType,
          qty_e9: BigInt(Math.max(1, Math.round((qty ?? 0.5) * 1e9))).toString(),
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
          setStudyConfigs((prev) => {
            if (prev[res.id]) return prev;
            return {
              ...prev,
              [res.id]: {
                id: res.id,
                label: res.label,
                builtin: kind,
                period,
                source: kind === "vwap" ? "hlc3" : "close",
                luauScript: null,
                color: STUDY_COLORS[kind] ?? "#38bdf8",
                lineWidth: 2,
                lineStyle: "solid",
                opacity: 1,
                showPriceLabel: true,
                showPriceLine: false,
                visibility: { ...DEFAULT_TIMEFRAME_VISIBILITY },
              },
            };
          });
        })
        .catch((err: unknown) => {
          setStudyError(err instanceof Error ? err.message : String(err));
        });
    },
    [transport],
  );

  const handleRunLuauStudy = useCallback(
    (script: string, id = "luau-custom", customLabel?: string) => {
      setStudyError(null);
      const snap = seriesSnapshotRef.current;
      const req: StudyRunRequest = {
        id,
        luau_script: script,
        closes: snap.closes,
        volumes: snap.volumes,
        buy_volumes: snap.buyVolumes,
        sell_volumes: snap.sellVolumes,
      };
      void transport
        .invokeJson<StudyRunRequest, StudyRunResponse>("run_study", req)
        .then((res) => {
          const labeled: StudyRunResponse = customLabel
            ? { ...res, label: customLabel }
            : res;
          setActiveStudies((prev) => [...prev.filter((s) => s.id !== labeled.id), labeled]);
          setStudyConfigs((prev) => ({
            ...prev,
            [labeled.id]: prev[labeled.id]
              ? { ...prev[labeled.id], label: labeled.label, luauScript: script }
              : {
                  id: labeled.id,
                  label: labeled.label,
                  builtin: null,
                  period: 14,
                  source: "close",
                  luauScript: script,
                  color: STUDY_COLORS.luau,
                  lineWidth: 2,
                  lineStyle: "solid",
                  opacity: 1,
                  showPriceLabel: true,
                  showPriceLine: false,
                  visibility: { ...DEFAULT_TIMEFRAME_VISIBILITY },
                },
          }));
        })
        .catch((err: unknown) => {
          setStudyError(err instanceof Error ? err.message : String(err));
        });
    },
    [transport],
  );

  const handleSaveStudyConfig = useCallback(
    (nextCfg: IndicatorConfig) => {
      setStudyConfigs((prev) => ({ ...prev, [nextCfg.id]: nextCfg }));
      const snap = seriesSnapshotRef.current;
      const sourceSeries = extractPriceSource(snap, nextCfg.source);
      const req: StudyRunRequest = nextCfg.luauScript
        ? {
            id: nextCfg.id,
            luau_script: nextCfg.luauScript,
            closes: sourceSeries,
            volumes: snap.volumes,
            buy_volumes: snap.buyVolumes,
            sell_volumes: snap.sellVolumes,
          }
        : {
            id: nextCfg.id,
            builtin: nextCfg.builtin ?? "sma",
            period: nextCfg.period,
            closes: sourceSeries,
            volumes: snap.volumes,
            buy_volumes: snap.buyVolumes,
            sell_volumes: snap.sellVolumes,
          };
      void transport
        .invokeJson<StudyRunRequest, StudyRunResponse>("run_study", req)
        .then((res) => {
          const updated: StudyRunResponse = { ...res, label: nextCfg.label };
          setActiveStudies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        })
        .catch((err: unknown) => {
          setStudyError(err instanceof Error ? err.message : String(err));
        });
    },
    [transport],
  );

  const handleToggleOverlayLayer = useCallback((layer: keyof IndicatorLayerState) => {
    if (layer === "volume") {
      setShowVolume((prev) => !prev);
      return;
    }
    setOverlayVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const handleClearStudies = useCallback(() => {
    setActiveStudies([]);
    setStudyError(null);
  }, []);

  const handleRemoveStudy = useCallback((id: string) => {
    setActiveStudies((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const activeStudiesRef = useRef(activeStudies);
  activeStudiesRef.current = activeStudies;
  const studyConfigsRef = useRef(studyConfigs);
  studyConfigsRef.current = studyConfigs;

  const handleSeriesUpdated = useCallback(() => {
    const studies = activeStudiesRef.current;
    if (studies.length === 0) return;
    const snap = seriesSnapshotRef.current;
    if (snap.closes.length === 0) return;
    const configs = studyConfigsRef.current;
    for (const st of studies) {
      const cfg = configs[st.id];
      const sourceSeries = extractPriceSource(snap, cfg?.source ?? "close");
      const kindPrefix = st.id.split("-")[0] as BuiltinStudyKind;
      const parsedPeriod = Number.parseInt(st.id.split("-")[1] ?? "14", 10);
      const req: StudyRunRequest = cfg?.luauScript
        ? {
            id: st.id,
            luau_script: cfg.luauScript,
            closes: sourceSeries,
            volumes: snap.volumes,
            buy_volumes: snap.buyVolumes,
            sell_volumes: snap.sellVolumes,
          }
        : {
            id: st.id,
            builtin: cfg?.builtin ?? kindPrefix,
            period: cfg?.period ?? (Number.isFinite(parsedPeriod) ? parsedPeriod : 14),
            closes: sourceSeries,
            volumes: snap.volumes,
            buy_volumes: snap.buyVolumes,
            sell_volumes: snap.sellVolumes,
          };
      void transport
        .invokeJson<StudyRunRequest, StudyRunResponse>("run_study", req)
        .then((res) => {
          const updated: StudyRunResponse = cfg?.label ? { ...res, label: cfg.label } : res;
          setActiveStudies((prev) =>
            prev.some((x) => x.id === updated.id)
              ? prev.map((x) => (x.id === updated.id ? updated : x))
              : prev,
          );
        })
        .catch(() => {
          // Non-fatal during rapid live bar updates
        });
    }
  }, [transport]);

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
      .then((toml) => {
        setExportedToml(toml);
        setRightTab("provenance");
      })
      .catch(() => {});
  }, [transport, symbol, timeframe]);

  const handleResetLayout = useCallback(() => {
    setLayoutMode("focus");
    setRightTab("watchlist");
    setReplayOpen(false);
    setLayoutEpoch((e) => e + 1);
  }, []);

  // TradingView-style type-anywhere symbol search: typing any letter or digit on the chart
  // immediately opens the Symbol Search popup pre-filled with what you started typing.
  useEffect(() => {
    const onGlobalType = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (symbolSearchOpen || settingsOpen || indicatorsOpen || editingStudyId !== null) return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest('[role="dialog"], [role="alertdialog"]')))
      ) {
        return;
      }
      if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
        e.preventDefault();
        setSymbolSearchMode("switch");
        setSymbolSearchQuery(e.key.toUpperCase());
        setSymbolSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onGlobalType);
    return () => window.removeEventListener("keydown", onGlobalType);
  }, [symbolSearchOpen, settingsOpen, indicatorsOpen, editingStudyId]);

  const handleSelectSymbolWithProvider = useCallback(
    (nextSym: string, providerId: MarketProviderId) => {
      setActiveProviderId(providerId);
      handleSymbolChange(nextSym);
      const meta = getMarketProviderMeta(providerId);
      if (meta.nativeFeedId && (LIVE_MARKET_DATA_SYMBOLS as readonly string[]).includes(nextSym)) {
        handleDataSourceChange(meta.nativeFeedId);
      } else if (providerId === "paper_sim") {
        handleDataSourceChange("paper_sim");
      } else if (!isProviderConfigured(providerId, providerConfigs)) {
        // Stay on offline paper sim until user enters subscription API key
        handleDataSourceChange("paper_sim");
      }
    },
    [handleSymbolChange, handleDataSourceChange, providerConfigs],
  );

  const handleToggleWatchlistSymbol = useCallback(
    (sym: string, providerId: MarketProviderId) => {
      setWatchlistItems((prev) => {
        const exists = prev.some((it) => it.symbol === sym);
        if (exists) {
          return prev.length > 1 ? prev.filter((it) => it.symbol !== sym) : prev;
        }
        return [...prev, { symbol: sym, providerId, flag: null }];
      });
    },
    [],
  );

  const handleRemoveWatchlistSymbol = useCallback((sym: string) => {
    setWatchlistItems((prev) => (prev.length > 1 ? prev.filter((it) => it.symbol !== sym) : prev));
  }, []);

  const handleCycleWatchlistFlag = useCallback((sym: string) => {
    const order: (WatchlistItemEntry["flag"])[] = [null, "red", "blue", "green", "orange"];
    setWatchlistItems((prev) =>
      prev.map((it) => {
        if (it.symbol !== sym) return it;
        const idx = order.indexOf(it.flag ?? null);
        return { ...it, flag: order[(idx + 1) % order.length] };
      }),
    );
  }, []);

  const handleToggleRightTab = useCallback((tab: Exclude<RightDrawerTab, null>) => {
    setRightTab((curr) => (curr === tab ? null : tab));
  }, []);

  const handleToggleFavoriteTool = useCallback((tool: PlacedDrawingKind) => {
    setFavoriteTools((prev) => {
      const exists = prev.includes(tool);
      const next = exists ? prev.filter((k) => k !== tool) : [...prev, tool];
      saveStoredFavorites(next);
      return next;
    });
  }, []);

  const studyOverlays = useMemo<StudyOverlaySeries[]>(
    () =>
      activeStudies.map((s) => {
        const cfg = studyConfigs[s.id];
        return {
          id: s.id,
          label: cfg?.label ?? s.label,
          overlay: s.overlay,
          color:
            cfg?.color ??
            STUDY_COLORS[s.id.split("-")[0]] ??
            (s.id.startsWith("luau") ? STUDY_COLORS.luau : "#38bdf8"),
          values: s.values,
          lineWidth: cfg?.lineWidth ?? 2,
          lineStyle: cfg?.lineStyle ?? "solid",
          opacity: cfg?.opacity ?? 1,
          showPriceLabel: cfg?.showPriceLabel ?? true,
          showPriceLine: cfg?.showPriceLine ?? false,
          visibility: cfg?.visibility,
          vwap: s.id.startsWith("vwap-") || cfg?.builtin === "vwap" ? cfg?.vwap ?? DEFAULT_VWAP : undefined,
          source: cfg?.source,
          precision: cfg?.precision,
          showStatusValue: cfg?.showStatusValue,
          showStatusInputs: cfg?.showStatusInputs,
        };
      }),
    [activeStudies, studyConfigs],
  );

  const resolvedChartTabs = useMemo<ChartTabItem[]>(
    () =>
      tabs.map((t) => {
        const meta = getSymbolMeta(t.symbol);
        const live = livePrices[t.symbol];
        const last = live?.last ?? meta.basePrice;
        const changePct = live?.changePct ?? meta.seedChangePct;
        return {
          id: t.id,
          symbol: t.symbol,
          timeframe: t.timeframe,
          shortLabel: meta.shortLabel,
          badgeColor: meta.badgeColor,
          badgeText: meta.badgeText,
          priceText: last.toLocaleString("en-US", {
            minimumFractionDigits: meta.decimals,
            maximumFractionDigits: meta.decimals,
          }),
          changePct: Number.isFinite(changePct) ? changePct : undefined,
        };
      }),
    [tabs, livePrices],
  );

  const symbolMeta = getSymbolMeta(symbol);
  const tickSizeE9 = symbolMeta.tickSizeE9;

  const handleRequestCreateAlert = useCallback(
    (explicitPrice?: number) => {
      const fallbackPrice =
        explicitPrice ??
        chartHistoryActionsRef.current?.getCurrentPrice?.() ??
        livePrices[symbol]?.last ??
        symbolMeta.basePrice;
      const draft = createDefaultAlertDraft({
        symbol,
        timeframe,
        price: fallbackPrice,
        decimals: symbolMeta.decimals,
        color: chartSettings.alerts.alertLineColor,
      });
      setAlertDialogState({ open: true, mode: "create", alert: draft });
    },
    [symbol, symbolMeta.basePrice, symbolMeta.decimals, livePrices, chartSettings.alerts.alertLineColor],
  );

  const handleOpenEditAlert = useCallback((al: ChartAlert) => {
    setAlertDialogState({ open: true, mode: "edit", alert: al });
  }, []);

  const handleSaveAlert = useCallback((saved: ChartAlert) => {
    setAlerts((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setAlertDialogState({ open: false, mode: "create", alert: null });
    chartHistoryActionsRef.current?.showToast?.(
      `Alert saved: ${saved.message || saved.symbol}`,
    );
  }, []);

  const handleMoveAlert = useCallback((alertId: string, price: number) => {
    setAlerts((previous) => previous.map((alert) => {
      if (alert.id !== alertId) return alert;
      const index = alert.conditions.findIndex((condition) => condition.valueType === "value" && Number.isFinite(condition.value));
      if (index < 0) return alert;
      return {
        ...alert,
        conditions: alert.conditions.map((condition, i) => i === index ? { ...condition, value: price } : condition),
      };
    }));
  }, []);

  const handleDeleteAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    setAlertDialogState((curr) =>
      curr.alert?.id === alertId ? { open: false, mode: "create", alert: null } : curr,
    );
    chartHistoryActionsRef.current?.showToast?.("Alert deleted");
  }, []);

  const handleTogglePauseAlert = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id !== alertId) return a;
        const nextStatus = a.status === "active" ? "paused" : "active";
        return { ...a, status: nextStatus };
      }),
    );
  }, []);

  const handleDrawingsSnapshotChange = useCallback(
    (drawings: readonly DrawingObject[], selId: string | null) => {
      setDrawingsSnapshot(drawings);
      setSelectedDrawingId(selId);
    },
    [],
  );

  const handleCreateDrawingGroup = useCallback(() => {
    setDrawingGroups((prev) => [
      ...prev,
      {
        id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Group ${prev.length + 1}`,
        hidden: false,
        locked: false,
        collapsed: false,
      },
    ]);
  }, []);

  const handleRenameDrawingGroup = useCallback((groupId: string, name: string) => {
    setDrawingGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g)),
    );
  }, []);

  const handleToggleGroupCollapsed = useCallback((groupId: string) => {
    setDrawingGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)),
    );
  }, []);

  const handleToggleGroupHidden = useCallback(
    (groupId: string) => {
      const target = drawingGroups.find((g) => g.id === groupId);
      if (!target) return;
      const nextHidden = !target.hidden;
      setDrawingGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, hidden: nextHidden } : g)),
      );
      for (const d of drawingsSnapshot) {
        if (d.groupId === groupId) {
          chartHistoryActionsRef.current?.updateDrawing?.(d.id, { hidden: nextHidden });
        }
      }
    },
    [drawingGroups, drawingsSnapshot],
  );

  const handleToggleGroupLocked = useCallback(
    (groupId: string) => {
      const target = drawingGroups.find((g) => g.id === groupId);
      if (!target) return;
      const nextLocked = !target.locked;
      setDrawingGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, locked: nextLocked } : g)),
      );
      for (const d of drawingsSnapshot) {
        if (d.groupId === groupId) {
          chartHistoryActionsRef.current?.updateDrawing?.(d.id, { locked: nextLocked });
        }
      }
    },
    [drawingGroups, drawingsSnapshot],
  );

  const handleDeleteDrawingGroup = useCallback(
    (groupId: string) => {
      for (const d of drawingsSnapshot) {
        if (d.groupId === groupId) {
          chartHistoryActionsRef.current?.updateDrawing?.(d.id, { groupId: null });
        }
      }
      setDrawingGroups((prev) => prev.filter((g) => g.id !== groupId));
    },
    [drawingsSnapshot],
  );

  const objectTreeIndicators: ObjectTreeIndicatorItem[] = useMemo(() => {
    const items: ObjectTreeIndicatorItem[] = [];
    if (overlayVisibility.vwapKeyLevels) {
      items.push({
        id: "vwapKeyLevels",
        label: "VWAP Key Levels",
        kind: "orderflow",
        hidden: indicatorHiddenState.hiddenOrderflowLayers.has("vwapKeyLevels"),
        color: "#f59e0b",
      });
    }
    if (showVolume) {
      items.push({
        id: "volume",
        label: "Vol",
        kind: "volume",
        hidden: indicatorHiddenState.volumeHidden,
        color: "#26a69a",
      });
    }
    if (overlayVisibility.vrvp) {
      items.push({
        id: "vrvp",
        label: "Session Volume Profile",
        kind: "orderflow",
        hidden: indicatorHiddenState.hiddenOrderflowLayers.has("vrvp"),
        color: "#38bdf8",
      });
    }
    if (overlayVisibility.footprint) {
      items.push({
        id: "footprint",
        label: "Footprint Bid/Ask",
        kind: "orderflow",
        hidden: indicatorHiddenState.hiddenOrderflowLayers.has("footprint"),
        color: "#34d399",
      });
    }
    if (overlayVisibility.tpo) {
      items.push({
        id: "tpo",
        label: "TPO Market Profile",
        kind: "orderflow",
        hidden: indicatorHiddenState.hiddenOrderflowLayers.has("tpo"),
        color: "#f59e0b",
      });
    }
    if (overlayVisibility.marketStructure) {
      items.push({
        id: "marketStructure",
        label: "Market Structure",
        kind: "orderflow",
        hidden: indicatorHiddenState.hiddenOrderflowLayers.has("marketStructure"),
        color: "#089981",
      });
    }
    if (overlayVisibility.tradingSessions) {
      items.push({
        id: "tradingSessions",
        label: "Trading Sessions",
        kind: "orderflow",
        hidden: indicatorHiddenState.hiddenOrderflowLayers.has("tradingSessions"),
        color: "#60a5fa",
      });
    }
    for (const st of activeStudies) {
      items.push({
        id: st.id,
        label: st.label,
        kind: "study",
        hidden: indicatorHiddenState.hiddenStudyIds.has(st.id),
        color: studyConfigs[st.id]?.color ?? "#2962ff",
      });
    }
    return items;
  }, [overlayVisibility, showVolume, activeStudies, studyConfigs, indicatorHiddenState]);

  const activeAlertSourceLabels = useMemo(
    () => objectTreeIndicators.map((it) => it.label),
    [objectTreeIndicators],
  );

  const statusBarNode = (
    <StatusBar
      transportKind={transport.kind}
      bootConfig={bootConfig}
      bookState={bookState}
      provenanceTier={provenanceTier}
      stateRev={stateRev}
      droppedTotal={droppedTotal}
      showProvenance={showProvenanceOverlay}
      activeRange={activeRange}
      onSelectRange={setActiveRange}
      autoScale={autoScale}
      onToggleAutoScale={() => setAutoScale((v) => !v)}
      logScale={logScale}
      onToggleLogScale={() => setLogScale((v) => !v)}
    />
  );

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-[var(--app-chrome-bg,#131722)] text-[#d1d4dc] ${isResizingRightDrawer ? "select-none cursor-col-resize" : ""}`}
    >
      <ChromeToolbar
        symbol={symbol}
        timeframe={timeframe}
        bootConfig={bootConfig}
        stateRev={stateRev}
        workspaceName="DESK"
        chartTabs={resolvedChartTabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onAddTab={handleAddTab}
        onCloseTab={handleCloseTab}
        alertsCount={alertsCount}
        onAddAlert={() => handleRequestCreateAlert()}
        onTakeSnapshot={() => chartHistoryActionsRef.current?.takeSnapshot?.()}
        onOpenProvenance={() => {
          setLayoutMode("focus");
          setRightTab((curr) => (curr === "provenance" ? null : "provenance"));
        }}
        onSymbolChange={handleSymbolChange}
        onTimeframeChange={handleTimeframeChange}
        onKillSwitch={handleKillSwitch}
        onResetLayout={handleResetLayout}
        compactDensity={compactDensity}
        onCompactDensityChange={setCompactDensity}
        showProvenanceOverlay={showProvenanceOverlay}
        onShowProvenanceOverlayChange={setShowProvenanceOverlay}
        candleStyle={candleStyle}
        onCandleStyleChange={handleCandleStyleChange}
        barType={barType}
        onBarTypeChange={handleBarTypeChange}
        chartSettings={chartSettings}
        onChartSettingsChange={setChartSettings}
        chartTemplates={chartTemplates}
        onApplyChartTemplate={handleApplyChartTemplate}
        onSaveChartTemplate={handleSaveChartTemplate}
        onApplyChartDefaults={handleApplyChartDefaults}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) {
            setSettingsInitialTab("symbol");
            setHighlightProviderId(null);
          }
        }}
        replayOpen={replayOpen}
        onToggleReplay={() => setReplayOpen((v) => !v)}
        studiesActiveCount={
          activeStudies.length +
          Number(overlayVisibility.vrvp) +
          Number(overlayVisibility.footprint) +
          Number(overlayVisibility.tpo) +
          Number(Boolean(overlayVisibility.marketStructure)) +
          Number(Boolean(overlayVisibility.vwapKeyLevels)) +
          Number(Boolean(overlayVisibility.tradingSessions))
        }
        onOpenStudies={() => setIndicatorsOpen(true)}
        tradeOpen={rightTab === "trade"}
        onToggleTrade={() => {
          setLayoutMode("focus");
          setRightTab((curr) => (curr === "trade" ? null : "trade"));
        }}
        layoutMode={layoutMode}
        onToggleLayoutMode={() =>
          setLayoutMode((curr) => (curr === "focus" ? "dockview" : "focus"))
        }
        canUndo={historyMeta.canUndo}
        canRedo={historyMeta.canRedo}
        onUndo={() => chartHistoryActionsRef.current?.undo()}
        onRedo={() => chartHistoryActionsRef.current?.redo()}
        onExportWorkspace={handleExportWorkspaceToml}
        dataSource={dataSource}
        dataSourceConnected={dataSourceConnected}
        dataSourceError={dataSourceError}
        onDataSourceChange={(src) => {
          setActiveProviderId(src);
          handleDataSourceChange(src);
        }}
        onOpenSymbolSearch={() => {
          setSymbolSearchMode("switch");
          setSymbolSearchQuery("");
          setSymbolSearchOpen(true);
        }}
        appAppearance={appAppearance}
        onAppAppearanceChange={handleAppAppearanceChange}
        providerConfigs={providerConfigs}
        onProviderConfigsChange={handleProviderConfigsChange}
        settingsInitialTab={settingsInitialTab}
        highlightProviderId={highlightProviderId}
        onOpenProviderSettings={(pid) => openSettingsAtTab("providers", pid)}
        activeProviderTag={getMarketProviderMeta(activeProviderId).shortTag}
      />

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {layoutMode === "focus" ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <LeftDrawingRail
              activeTool={activeTool}
              magnetEnabled={magnetEnabled !== cmdHeld}
              showFloatingBar={showFloatingBar}
              stayInDrawingMode={stayInDrawingMode}
              drawingsLocked={drawingsLocked}
              drawingsHidden={drawingsHidden}
              favoriteTools={favoriteTools}
              activeIconStamp={activeIconStamp}
              drawingCount={historyMeta.count}
              onSelectTool={setActiveTool}
              onToggleMagnet={() => setMagnetEnabled((v) => !v)}
              onToggleFloatingBar={() => setShowFloatingBar((v) => !v)}
              onToggleStayInDrawingMode={() => setStayInDrawingMode((v) => !v)}
              onToggleDrawingsLocked={() => setDrawingsLocked((v) => !v)}
              onToggleDrawingsHidden={() => setDrawingsHidden((v) => !v)}
              onToggleFavoriteTool={handleToggleFavoriteTool}
              onSelectIconStamp={setActiveIconStamp}
              onResetZoom={() => chartHistoryActionsRef.current?.resetZoom?.()}
              onClearDrawings={() => chartHistoryActionsRef.current?.clear()}
            />

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div
                style={{ backgroundColor: chartSettings.canvas.backgroundColor }}
                className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
              >
                <ChartPanel
                transport={transport}
                symbol={symbol}
                timeframe={timeframe}
                tickSizeE9={tickSizeE9}
                studyOverlays={studyOverlays}
                seriesSnapshotRef={seriesSnapshotRef}
                activeTool={activeTool}
                onSelectTool={setActiveTool}
                magnetEnabled={magnetEnabled}
                onToggleMagnet={() => setMagnetEnabled((v) => !v)}
                showFloatingBar={showFloatingBar}
                stayInDrawingMode={stayInDrawingMode}
                drawingsLocked={drawingsLocked}
                drawingsHidden={drawingsHidden}
                favoriteTools={favoriteTools}
                activeIconStamp={activeIconStamp}
                candleStyle={candleStyle}
                barType={barType}
                autoScale={autoScale}
                onAutoScaleChange={setAutoScale}
                logScale={logScale}
                onLogScaleChange={setLogScale}
                rangePreset={activeRange}
                historyActionsRef={chartHistoryActionsRef}
                onHistoryMetaChange={setHistoryMeta}
                onRemoveStudy={handleRemoveStudy}
                onOpenStudySettings={setEditingStudyId}
                onLivePriceSample={handleLivePriceSample}
                chartSettings={chartSettings}
                replayOpen={replayOpen}
                chartTemplates={chartTemplates}
                onApplyChartTemplate={handleApplyChartTemplate}
                onApplyChartDefaults={handleApplyChartDefaults}
                onOpenSettings={() => setSettingsOpen(true)}
                onSubmitOrderAtPrice={handleSubmitOrder}
                onOpenOrderTicket={() => {
                  setLayoutMode("focus");
                  setRightTab("trade");
                }}
                onClearAllStudies={handleClearStudies}
                onOpenObjectTree={() => {
                  setLayoutMode("focus");
                  setRightTab("object_tree");
                  setObjectTreeSubTab("tree");
                }}
                activeOrders={account.orders}
                alerts={alerts}
                onRequestCreateAlert={handleRequestCreateAlert}
                onEditAlert={handleOpenEditAlert}
                onDeleteAlert={handleDeleteAlert}
                onMoveAlert={handleMoveAlert}
                onAlertsCountChange={setAlertsCount}
                onDrawingsSnapshotChange={handleDrawingsSnapshotChange}
                onIndicatorHiddenStateChange={setIndicatorHiddenState}
                dataWindowActive={rightTab === "object_tree" && objectTreeSubTab === "data"}
                onDataWindowSnapshot={setDataWindowSnapshot}
                overlayVisibility={overlayVisibility}
                onToggleOverlayVisibility={(key) =>
                  setOverlayVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                showVolume={showVolume}
                onShowVolumeChange={setShowVolume}
                dataSource={dataSource}
                marketStreamReady={marketStreamReady}
                onSeriesUpdated={handleSeriesUpdated}
              />
              </div>

              {statusBarNode}
            </div>

            {rightTab !== null && (
              <div
                style={{ width: `${rightDrawerWidth}px` }}
                className="relative flex shrink-0 flex-col border-l border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)]"
              >
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize side panel"
                  aria-valuemin={MIN_RIGHT_DRAWER_WIDTH}
                  aria-valuemax={MAX_RIGHT_DRAWER_WIDTH}
                  aria-valuenow={rightDrawerWidth}
                  tabIndex={0}
                  title="Drag to resize panel (double-click to reset)"
                  onPointerDown={handleRightResizePointerDown}
                  onPointerMove={handleRightResizePointerMove}
                  onPointerUp={handleRightResizePointerUp}
                  onPointerCancel={handleRightResizePointerUp}
                  onDoubleClick={() => setRightDrawerWidth(DEFAULT_RIGHT_DRAWER_WIDTH)}
                  onKeyDown={handleRightResizeKeyDown}
                  className="group/resize absolute inset-y-0 -left-[3px] z-30 flex w-[6px] cursor-col-resize items-stretch justify-center focus:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={`h-full w-[2px] transition-colors ${
                      isResizingRightDrawer
                        ? "bg-[#2962ff]"
                        : "bg-transparent group-hover/resize:bg-[#2962ff]/80 group-focus-visible/resize:bg-[#2962ff]"
                    }`}
                  />
                </div>
                {rightTab === "watchlist" && (
                  <WatchlistPanel
                    items={watchlistItems}
                    activeSymbol={symbol}
                    activeProviderId={activeProviderId}
                    livePrices={livePrices}
                    providerConfigs={providerConfigs}
                    onSelectSymbol={handleSelectSymbolWithProvider}
                    onAddSymbolClick={() => {
                      setSymbolSearchMode("watchlist");
                      setSymbolSearchQuery("");
                      setSymbolSearchOpen(true);
                    }}
                    onRemoveSymbol={handleRemoveWatchlistSymbol}
                    onCycleFlag={handleCycleWatchlistFlag}
                    onConfigureProvider={(pid) => openSettingsAtTab("providers", pid)}
                    onCollapse={() => setRightTab(null)}
                  />
                )}
                {rightTab === "alerts" && (
                  <AlertsPanel
                    activeSymbol={symbol}
                    alerts={alerts}
                    logs={alertLogs}
                    onCreateAlert={() => handleRequestCreateAlert()}
                    onEditAlert={handleOpenEditAlert}
                    onTogglePauseAlert={handleTogglePauseAlert}
                    onDeleteAlert={handleDeleteAlert}
                    onClearLogs={() => setAlertLogs([])}
                    onSelectSymbol={(sym) =>
                      handleSelectSymbolWithProvider(sym, activeProviderId)
                    }
                    onCollapse={() => setRightTab(null)}
                  />
                )}
                {rightTab === "object_tree" && (
                  <ObjectTreePanel
                    symbol={symbol}
                    providerTag={getMarketProviderMeta(activeProviderId).shortTag}
                    timeframe={timeframe}
                    activeSubTab={objectTreeSubTab}
                    onSubTabChange={setObjectTreeSubTab}
                    indicators={objectTreeIndicators}
                    drawings={drawingsSnapshot}
                    groups={drawingGroups}
                    selectedDrawingId={selectedDrawingId}
                    allDrawingsHidden={drawingsHidden}
                    dataWindow={dataWindowSnapshot}
                    onToggleAllDrawingsHidden={() => setDrawingsHidden((v) => !v)}
                    onCreateGroup={handleCreateDrawingGroup}
                    onRenameGroup={handleRenameDrawingGroup}
                    onToggleGroupCollapsed={handleToggleGroupCollapsed}
                    onToggleGroupHidden={handleToggleGroupHidden}
                    onToggleGroupLocked={handleToggleGroupLocked}
                    onDeleteGroup={handleDeleteDrawingGroup}
                    onToggleIndicatorHidden={(item) => {
                      if (item.kind === "volume") {
                        chartHistoryActionsRef.current?.toggleVolumeHidden?.();
                      } else if (item.kind === "orderflow") {
                        chartHistoryActionsRef.current?.toggleOrderflowHidden?.(
                          item.id as keyof OverlayVisibility,
                        );
                      } else {
                        chartHistoryActionsRef.current?.toggleStudyHidden?.(item.id);
                      }
                    }}
                    onOpenIndicatorSettings={(item) => {
                      if (item.kind === "volume") {
                        chartHistoryActionsRef.current?.openVolumeSettings?.();
                      } else if (item.kind === "orderflow") {
                        chartHistoryActionsRef.current?.openOrderflowSettings?.(
                          item.id as keyof OverlayVisibility,
                        );
                      } else {
                        setEditingStudyId(item.id);
                      }
                    }}
                    onRemoveIndicator={(item) => {
                      if (item.kind === "volume") {
                        setShowVolume(false);
                      } else if (item.kind === "orderflow") {
                        const key = item.id as keyof OverlayVisibility;
                        setOverlayVisibility((prev) => ({ ...prev, [key]: false }));
                      } else {
                        handleRemoveStudy(item.id);
                      }
                    }}
                    onSelectDrawing={(id) =>
                      chartHistoryActionsRef.current?.selectDrawing?.(id)
                    }
                    onToggleDrawingHidden={(id) => {
                      const d = drawingsSnapshot.find((item) => item.id === id);
                      if (d) {
                        chartHistoryActionsRef.current?.updateDrawing?.(id, {
                          hidden: !d.hidden,
                        });
                      }
                    }}
                    onToggleDrawingLocked={(id) => {
                      const d = drawingsSnapshot.find((item) => item.id === id);
                      if (d) {
                        chartHistoryActionsRef.current?.updateDrawing?.(id, {
                          locked: !d.locked,
                        });
                      }
                    }}
                    onOpenDrawingSettings={(id) =>
                      chartHistoryActionsRef.current?.openDrawingSettings?.(id)
                    }
                    onRemoveDrawing={(id) =>
                      chartHistoryActionsRef.current?.deleteDrawing?.(id)
                    }
                    onAssignDrawingGroup={(drawingId, groupId) =>
                      chartHistoryActionsRef.current?.updateDrawing?.(drawingId, { groupId })
                    }
                    onReorderDrawing={(drawingId, targetId) =>
                      chartHistoryActionsRef.current?.reorderDrawing?.(drawingId, targetId)
                    }
                    onCollapse={() => setRightTab(null)}
                  />
                )}
                {rightTab === "dom" && (
                  <div data-order-book-panel className="flex h-full flex-col">
                    <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[#f0f3fa]">{symbol}</span>
                        <span className="rounded bg-white/[0.10] px-1.5 py-0.5 text-[10px] font-semibold text-[#9598a1]">
                          DOM
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Close right drawer"
                        onClick={() => setRightTab(null)}
                        className="flex h-6 w-6 items-center justify-center rounded text-[#9ca3af] hover:bg-white/[0.06] hover:text-[#f0f3fa]"
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    <div className="shrink-0 px-3 pt-2.5 pb-2">
                      <div className="grid grid-cols-2 rounded-lg bg-white/[0.04] p-0.5">
                        <button
                          type="button"
                          onClick={() => setRightTab("trade")}
                          className="h-7 rounded-md text-[12px] font-medium text-[#9ca3af] transition-colors hover:bg-white/[0.06] hover:text-[#f4f4f5] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50"
                        >
                          Order
                        </button>
                        <button
                          type="button"
                          className="h-7 rounded-md bg-white/[0.10] text-[12px] font-medium text-[#f4f4f5] shadow-sm"
                        >
                          DOM
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1">
                      <DomLadderPanel
                        transport={transport}
                        symbol={symbol}
                        compactDensity={compactDensity}
                      />
                    </div>
                  </div>
                )}
                {(rightTab === "trade" ||
                  rightTab === "studies" ||
                  rightTab === "provenance") && (
                  <PaperOmsPanel
                    key={rightTab}
                    panelMode={rightTab === "trade" ? "trade" : "system"}
                    defaultTab={
                      rightTab === "studies"
                        ? "studies"
                        : rightTab === "provenance"
                          ? exportedToml
                            ? "settings"
                            : "provenance"
                          : "ticket"
                    }
                    symbol={symbol}
                    livePrice={livePrices[symbol]?.last ?? symbolMeta.basePrice}
                    tickSize={Number(tickSizeE9) / 1e9}
                    account={account}
                    bookState={bookState}
                    provenanceTier={provenanceTier}
                    activeStudies={activeStudies}
                    studyError={studyError}
                    settings={settings}
                    exportedToml={exportedToml}
                    onSubmitOrder={handleSubmitOrder}
                    onKillSwitch={handleKillSwitch}
                    onSwitchToDom={() => setRightTab("dom")}
                    onCollapse={() => setRightTab(null)}
                    onRunBuiltinStudy={handleRunBuiltinStudy}
                    onRunLuauStudy={handleRunLuauStudy}
                    onClearStudies={handleClearStudies}
                    onUpdateSetting={handleUpdateSetting}
                    onResetSetting={handleResetSetting}
                    onExportWorkspaceToml={handleExportWorkspaceToml}
                  />
                )}
              </div>
            )}

            <RightIconRail
              activeTab={rightTab}
              onSelectTab={handleToggleRightTab}
              studiesCount={activeStudies.length}
              openOrdersCount={account.orders.length}
              alertsCount={alertsCount}
            />
          </div>
        ) : (
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
                  activeTool={activeTool}
                  onSelectTool={setActiveTool}
                  magnetEnabled={magnetEnabled}
                  onToggleMagnet={() => setMagnetEnabled((v) => !v)}
                  showFloatingBar={showFloatingBar}
                  stayInDrawingMode={stayInDrawingMode}
                  drawingsLocked={drawingsLocked}
                  drawingsHidden={drawingsHidden}
                  favoriteTools={favoriteTools}
                  activeIconStamp={activeIconStamp}
                  candleStyle={candleStyle}
                  barType={barType}
                  autoScale={autoScale}
                  onAutoScaleChange={setAutoScale}
                  logScale={logScale}
                  onLogScaleChange={setLogScale}
                  rangePreset={activeRange}
                  historyActionsRef={chartHistoryActionsRef}
                  onHistoryMetaChange={setHistoryMeta}
                  onRemoveStudy={handleRemoveStudy}
                  onOpenStudySettings={setEditingStudyId}
                  onLivePriceSample={handleLivePriceSample}
                  chartSettings={chartSettings}
                  replayOpen={replayOpen}
                  chartTemplates={chartTemplates}
                  onApplyChartTemplate={handleApplyChartTemplate}
                  onApplyChartDefaults={handleApplyChartDefaults}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onSubmitOrderAtPrice={handleSubmitOrder}
                  onOpenOrderTicket={() => {
                    setLayoutMode("focus");
                    setRightTab("trade");
                  }}
                  onClearAllStudies={handleClearStudies}
                  onOpenObjectTree={() => {
                    setLayoutMode("focus");
                    setRightTab("object_tree");
                    setObjectTreeSubTab("tree");
                  }}
                  activeOrders={account.orders}
                  alerts={alerts}
                  onRequestCreateAlert={handleRequestCreateAlert}
                  onEditAlert={handleOpenEditAlert}
                  onDeleteAlert={handleDeleteAlert}
                  onMoveAlert={handleMoveAlert}
                  onAlertsCountChange={setAlertsCount}
                  onDrawingsSnapshotChange={handleDrawingsSnapshotChange}
                  onIndicatorHiddenStateChange={setIndicatorHiddenState}
                  dataWindowActive={false}
                  onDataWindowSnapshot={setDataWindowSnapshot}
                  overlayVisibility={overlayVisibility}
                  onToggleOverlayVisibility={(key) =>
                    setOverlayVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                  showVolume={showVolume}
                  onShowVolumeChange={setShowVolume}
                  dataSource={dataSource}
                  marketStreamReady={marketStreamReady}
                  onSeriesUpdated={handleSeriesUpdated}
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
        )}
      </main>

      {replayOpen && (
        <ReplayBar
          status={replayStatus}
          onControl={handleReplayControl}
          onClose={() => setReplayOpen(false)}
        />
      )}

      <IndicatorsDialog
        open={indicatorsOpen}
        onOpenChange={setIndicatorsOpen}
        activeStudies={activeStudies}
        studyError={studyError}
        layerState={{
          volume: showVolume,
          vrvp: overlayVisibility.vrvp,
          footprint: overlayVisibility.footprint,
          tpo: overlayVisibility.tpo,
          marketStructure: Boolean(overlayVisibility.marketStructure),
          vwapKeyLevels: Boolean(overlayVisibility.vwapKeyLevels),
          tradingSessions: Boolean(overlayVisibility.tradingSessions),
        }}
        onRunBuiltinStudy={handleRunBuiltinStudy}
        onRemoveStudy={handleRemoveStudy}
        onRunLuauStudy={handleRunLuauStudy}
        onClearStudies={handleClearStudies}
        onToggleLayer={handleToggleOverlayLayer}
      />

      <IndicatorSettingsDialog
        open={editingStudyId !== null}
        config={
          editingStudyId
            ? (studyConfigs[editingStudyId] ??
              (() => {
                const st = activeStudies.find((s) => s.id === editingStudyId);
                if (!st) return null;
                const kindPrefix = st.id.split("-")[0] as BuiltinStudyKind;
                const parsedPeriod = Number.parseInt(st.id.split("-")[1] ?? "14", 10);
                return {
                  id: st.id,
                  label: st.label,
                  builtin: st.id.startsWith("luau") ? null : kindPrefix,
                  period: Number.isFinite(parsedPeriod) ? parsedPeriod : 14,
                  source: "close" as const,
                  luauScript: null,
                  color: STUDY_COLORS[kindPrefix] ?? STUDY_COLORS.luau,
                  lineWidth: 2 as const,
                  lineStyle: "solid" as const,
                  opacity: 1,
                  showPriceLabel: true,
                  showPriceLine: false,
                  visibility: { ...DEFAULT_TIMEFRAME_VISIBILITY },
                };
              })())
            : null
        }
        onOpenChange={(open) => {
          if (!open) setEditingStudyId(null);
        }}
        onSave={handleSaveStudyConfig}
      />

      <SymbolSearchDialog
        open={symbolSearchOpen}
        initialQuery={symbolSearchQuery}
        mode={symbolSearchMode}
        watchlistSymbols={watchlistItems.map((it) => it.symbol)}
        providerConfigs={providerConfigs}
        onOpenChange={setSymbolSearchOpen}
        onSelectSymbol={handleSelectSymbolWithProvider}
        onToggleWatchlist={handleToggleWatchlistSymbol}
        onConfigureProvider={(pid) => openSettingsAtTab("providers", pid)}
      />

      <AlertDialog
        open={alertDialogState.open}
        mode={alertDialogState.mode}
        initialAlert={alertDialogState.alert}
        availableSymbols={watchlistItems.map((it) => it.symbol)}
        availableSources={activeAlertSourceLabels}
        decimals={symbolMeta.decimals}
        onOpenChange={(open) => {
          if (!open) setAlertDialogState((curr) => ({ ...curr, open: false }));
        }}
        onSave={handleSaveAlert}
        onDelete={handleDeleteAlert}
      />

      {layoutMode !== "focus" && statusBarNode}

    </div>
  );
}
