import { UiSelect } from "./primitives";
import { useEffect, useState } from "react";
import type { BootConfig } from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/react/command";
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { useShortcut, useShortcutHint } from "@ui-sdk/react/shortcuts";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/react/toolbar";
import {
  DEFAULT_CHART_SETTINGS,
  DEFAULT_CHART_TEMPLATES,
  type ChartSettings,
  type ChartSettingsTemplate,
} from "./chart-settings";
import {
  CHART_BAR_TYPE_GROUPS,
  ChartBarTypeIcon,
  getChartBarTypeLabel,
  type ChartBarType,
} from "./chart-bar-types";
import { ChartSettingsDialog } from "./chart-settings-dialog";
import { DEFAULT_APP_APPEARANCE, type AppAppearanceSettings } from "./app-appearance";
import { type MarketProviderConfigMap, type MarketProviderId } from "./market-providers";

export type CandleVisualStyle = "monochrome" | "classic";
export type WorkspaceLayoutMode = "focus" | "dockview";
export type MarketDataFeedId = "paper_sim" | "kraken_ws_v2" | "coinbase_ws";

export interface ChartTabItem {
  id: string;
  symbol: string;
  timeframe: string;
  shortLabel?: string;
  badgeColor?: string;
  badgeText?: string;
  priceText?: string;
  changePct?: number;
}

export interface ChromeToolbarProps {
  symbol: string;
  timeframe: string;
  bootConfig: BootConfig;
  stateRev: number;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: string) => void;
  onKillSwitch: () => void;
  onResetLayout: () => void;
  compactDensity?: boolean;
  onCompactDensityChange?: (next: boolean) => void;
  showProvenanceOverlay?: boolean;
  onShowProvenanceOverlayChange?: (next: boolean) => void;
  workspaceName?: string;
  candleStyle?: CandleVisualStyle;
  onCandleStyleChange?: (next: CandleVisualStyle) => void;
  barType?: ChartBarType;
  onBarTypeChange?: (next: ChartBarType) => void;
  replayOpen?: boolean;
  onToggleReplay?: () => void;
  studiesActiveCount?: number;
  onOpenStudies?: () => void;
  tradeOpen?: boolean;
  onToggleTrade?: () => void;
  layoutMode?: WorkspaceLayoutMode;
  onToggleLayoutMode?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExportWorkspace?: () => void;
  chartTabs?: readonly ChartTabItem[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onAddTab?: () => void;
  onCloseTab?: (tabId: string) => void;
  onAddAlert?: () => void;
  onTakeSnapshot?: () => void;
  onOpenProvenance?: () => void;
  alertsCount?: number;
  /** Optional real market data source control */
  dataSource?: MarketDataFeedId;
  dataSourceConnected?: boolean;
  dataSourceError?: string | null;
  onDataSourceChange?: (source: MarketDataFeedId) => void;
  /** Controlled full Chart Settings modal state */
  chartSettings?: ChartSettings;
  onChartSettingsChange?: (next: ChartSettings) => void;
  chartTemplates?: readonly ChartSettingsTemplate[];
  onApplyChartTemplate?: (template: ChartSettingsTemplate) => void;
  onSaveChartTemplate?: (name: string, settings: ChartSettings) => void;
  onApplyChartDefaults?: () => void;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  /** Optional custom symbol search handler (opens TradingView-style multi-provider search) */
  onOpenSymbolSearch?: () => void;
  /** Optional App Appearance (shell chrome outside chart) */
  appAppearance?: AppAppearanceSettings;
  onAppAppearanceChange?: (next: AppAppearanceSettings) => void;
  /** Market data provider configurations */
  providerConfigs?: MarketProviderConfigMap;
  onProviderConfigsChange?: (next: MarketProviderConfigMap) => void;
  /** Controlled initial tab & highlighted provider when opening Settings */
  settingsInitialTab?: string;
  highlightProviderId?: MarketProviderId | null;
  onOpenProviderSettings?: (providerId?: MarketProviderId) => void;
  /** Optional active provider badge shown next to top-bar symbol */
  activeProviderTag?: string;
}

const SYMBOLS = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "NQ1!",
  "MNQ1!",
  "ES1!",
  "GC1!",
  "CL1!",
  "VIX",
] as const;

const DEFAULT_FAVORITE_TIMEFRAMES: readonly string[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "D",
  "W",
  "M",
];

const FAVORITE_TF_STORAGE_KEY = "allegedly.favorite_timeframes.v1";
const CUSTOM_TF_STORAGE_KEY = "allegedly.custom_timeframes.v1";

type CustomIntervalUnit = "t" | "s" | "m" | "h" | "D" | "W" | "M";

interface TimeframeOptionItem {
  code: string;
  label: string;
  custom?: boolean;
}

const BUILTIN_TIMEFRAME_GROUPS: readonly {
  id: string;
  heading: string;
  items: readonly TimeframeOptionItem[];
}[] = [
  {
    id: "ticks",
    heading: "TICKS",
    items: [
      { code: "1t", label: "1 tick" },
      { code: "10t", label: "10 ticks" },
      { code: "100t", label: "100 ticks" },
      { code: "1000t", label: "1000 ticks" },
    ],
  },
  {
    id: "seconds",
    heading: "SECONDS",
    items: [
      { code: "1s", label: "1 second" },
      { code: "5s", label: "5 seconds" },
      { code: "10s", label: "10 seconds" },
      { code: "15s", label: "15 seconds" },
      { code: "30s", label: "30 seconds" },
      { code: "45s", label: "45 seconds" },
    ],
  },
  {
    id: "minutes",
    heading: "MINUTES",
    items: [
      { code: "1m", label: "1 minute" },
      { code: "2m", label: "2 minutes" },
      { code: "3m", label: "3 minutes" },
      { code: "5m", label: "5 minutes" },
      { code: "10m", label: "10 minutes" },
      { code: "15m", label: "15 minutes" },
      { code: "30m", label: "30 minutes" },
      { code: "45m", label: "45 minutes" },
    ],
  },
  {
    id: "hours",
    heading: "HOURS",
    items: [
      { code: "1h", label: "1 hour" },
      { code: "2h", label: "2 hours" },
      { code: "3h", label: "3 hours" },
      { code: "4h", label: "4 hours" },
    ],
  },
  {
    id: "days",
    heading: "DAYS",
    items: [
      { code: "D", label: "1 day" },
      { code: "W", label: "1 week" },
      { code: "M", label: "1 month" },
    ],
  },
];

function formatCustomIntervalLabel(code: string): string {
  if (code === "D") return "1 day";
  if (code === "W") return "1 week";
  if (code === "M") return "1 month";
  const m = /^(\d+)([tsmhDWM])$/.exec(code);
  if (!m) return code;
  const n = Number.parseInt(m[1], 10);
  const unitNames: Record<CustomIntervalUnit, [string, string]> = {
    t: ["tick", "ticks"],
    s: ["second", "seconds"],
    m: ["minute", "minutes"],
    h: ["hour", "hours"],
    D: ["day", "days"],
    W: ["week", "weeks"],
    M: ["month", "months"],
  };
  const [sing, plur] = unitNames[m[2] as CustomIntervalUnit] ?? [m[2], m[2]];
  return `${n} ${n === 1 ? sing : plur}`;
}

function loadStoredStringArray(key: string, fallback: readonly string[]): string[] {
  if (typeof window === "undefined") return [...fallback];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [...fallback];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallback];
    const filtered = parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return filtered.length > 0 || fallback.length === 0 ? filtered : [...fallback];
  } catch {
    return [...fallback];
  }
}

const FEED_OPTIONS: ReadonlyArray<{ id: MarketDataFeedId; label: string; desc: string }> = [
  { id: "paper_sim", label: "Sim", desc: "Offline deterministic simulator" },
  { id: "kraken_ws_v2", label: "Kraken Live", desc: "Public real-time Spot WS v2 (BTC/ETH/SOL)" },
  { id: "coinbase_ws", label: "Coinbase Live", desc: "Public real-time Adv Trade WS (BTC/ETH/SOL)" },
];

/**
 * Clean single-row TradingView-style top chart toolbar built with @ui-sdk/react.
 * Zero duplicate controls, zero debug badges, consistent #131722 / #2a2e39 / #2962ff tokens.
 */
export function ChromeToolbar({
  symbol,
  timeframe,
  bootConfig,
  onSymbolChange,
  onTimeframeChange,
  onResetLayout,
  compactDensity: controlledCompactDensity,
  onCompactDensityChange,
  showProvenanceOverlay: controlledShowProvenance,
  onShowProvenanceOverlayChange,
  candleStyle = "classic",
  onCandleStyleChange,
  barType = "candles",
  onBarTypeChange,
  replayOpen = false,
  onToggleReplay,
  studiesActiveCount = 0,
  onOpenStudies,
  layoutMode = "focus",
  onToggleLayoutMode,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onExportWorkspace,
  chartTabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onAddAlert,
  onTakeSnapshot,
  onOpenProvenance,
  alertsCount = 0,
  dataSource = "paper_sim",
  dataSourceConnected = false,
  dataSourceError = null,
  onDataSourceChange,
  chartSettings: controlledChartSettings,
  onChartSettingsChange,
  chartTemplates = DEFAULT_CHART_TEMPLATES,
  onApplyChartTemplate,
  onSaveChartTemplate,
  onApplyChartDefaults,
  settingsOpen: controlledSettingsOpen,
  onSettingsOpenChange,
  onOpenSymbolSearch,
  appAppearance = DEFAULT_APP_APPEARANCE,
  onAppAppearanceChange,
  providerConfigs = {},
  onProviderConfigsChange,
  settingsInitialTab = "symbol",
  highlightProviderId = null,
  onOpenProviderSettings,
  activeProviderTag,
}: ChromeToolbarProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [tfMenuOpen, setTfMenuOpen] = useState(false);
  const [favoriteTimeframes, setFavoriteTimeframes] = useState<string[]>(() =>
    loadStoredStringArray(FAVORITE_TF_STORAGE_KEY, DEFAULT_FAVORITE_TIMEFRAMES),
  );
  const [customTimeframes, setCustomTimeframes] = useState<string[]>(() =>
    loadStoredStringArray(CUSTOM_TF_STORAGE_KEY, []),
  );
  const [addingCustomTf, setAddingCustomTf] = useState(false);
  const [customTfValue, setCustomTfValue] = useState("2");
  const [customTfUnit, setCustomTfUnit] = useState<CustomIntervalUnit>("m");
  const [collapsedTfGroups, setCollapsedTfGroups] = useState<Record<string, boolean>>({});

  const toggleFavoriteTimeframe = (code: string) => {
    setFavoriteTimeframes((prev) => {
      const exists = prev.includes(code);
      const next = exists ? prev.filter((x) => x !== code) : [...prev, code];
      const safeNext = next.length > 0 ? next : [code];
      try {
        window.localStorage.setItem(FAVORITE_TF_STORAGE_KEY, JSON.stringify(safeNext));
      } catch {
        // ignore
      }
      return safeNext;
    });
  };

  const handleAddCustomInterval = () => {
    const n = Math.max(1, Math.min(9999, Math.round(Number.parseInt(customTfValue, 10) || 1)));
    const code =
      n === 1 && (customTfUnit === "D" || customTfUnit === "W" || customTfUnit === "M")
        ? customTfUnit
        : `${n}${customTfUnit}`;
    const isBuiltin = BUILTIN_TIMEFRAME_GROUPS.some((g) => g.items.some((it) => it.code === code));
    if (!isBuiltin) {
      setCustomTimeframes((prev) => {
        const next = prev.includes(code) ? prev : [...prev, code];
        try {
          window.localStorage.setItem(CUSTOM_TF_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
    setFavoriteTimeframes((prev) => {
      const next = prev.includes(code) ? prev : [...prev, code];
      try {
        window.localStorage.setItem(FAVORITE_TF_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    onTimeframeChange(code);
    setAddingCustomTf(false);
    setTfMenuOpen(false);
  };

  const handleRemoveCustomInterval = (code: string) => {
    setCustomTimeframes((prev) => {
      const next = prev.filter((x) => x !== code);
      try {
        window.localStorage.setItem(CUSTOM_TF_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setFavoriteTimeframes((prev) => {
      const next = prev.filter((x) => x !== code);
      const safe = next.length > 0 ? next : ["15m"];
      try {
        window.localStorage.setItem(FAVORITE_TF_STORAGE_KEY, JSON.stringify(safe));
      } catch {
        // ignore
      }
      return safe;
    });
  };

  const visibleBarTimeframes = favoriteTimeframes.includes(timeframe)
    ? favoriteTimeframes
    : [...favoriteTimeframes, timeframe];
  const [barTypeMenuOpen, setBarTypeMenuOpen] = useState(false);
  const [feedMenuOpen, setFeedMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
  const [localChartSettings, setLocalChartSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [localCompactDensity, setLocalCompactDensity] = useState(true);
  const [localShowProvenance, setLocalShowProvenance] = useState(true);

  const settingsOpen = controlledSettingsOpen ?? localSettingsOpen;
  const setSettingsOpen = (next: boolean) => {
    setLocalSettingsOpen(next);
    onSettingsOpenChange?.(next);
  };

  const chartSettings = controlledChartSettings ?? localChartSettings;
  const setChartSettings = (next: ChartSettings) => {
    setLocalChartSettings(next);
    onChartSettingsChange?.(next);
  };

  const compactDensity = controlledCompactDensity ?? localCompactDensity;
  const setCompactDensity = (next: boolean) => {
    setLocalCompactDensity(next);
    onCompactDensityChange?.(next);
  };

  const showProvenanceOverlay = controlledShowProvenance ?? localShowProvenance;
  const setShowProvenanceOverlay = (next: boolean) => {
    setLocalShowProvenance(next);
    onShowProvenanceOverlayChange?.(next);
  };

  useShortcut("mod+k", () => {
    if (onOpenSymbolSearch) {
      onOpenSymbolSearch();
    } else {
      setCommandOpen((open) => !open);
    }
  }, {
    description: "Open symbol search",
    allowInInput: true,
  });
  const paletteHint = useShortcutHint("mod+k");

  const isMacDesktop =
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window &&
    typeof navigator !== "undefined" &&
    /Mac/i.test(navigator.platform || navigator.userAgent);
  const resolvedTabs: readonly ChartTabItem[] =
    chartTabs && chartTabs.length > 0
      ? chartTabs
      : [{ id: "tab-default", symbol, timeframe }];
  const showTabStrip = isMacDesktop || resolvedTabs.length > 1;
  const resolvedActiveTabId = activeTabId ?? resolvedTabs[0]?.id ?? "tab-default";

  const handleToggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  const closeAllMenus = () => {
    setTfMenuOpen(false);
    setBarTypeMenuOpen(false);
    setFeedMenuOpen(false);
    setMoreMenuOpen(false);
  };

  const anyMenuOpen = tfMenuOpen || barTypeMenuOpen || feedMenuOpen || moreMenuOpen;
  useEffect(() => {
    if (!anyMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAllMenus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyMenuOpen]);

  const activeFeed = FEED_OPTIONS.find((f) => f.id === dataSource) ?? FEED_OPTIONS[0];
  const isLiveFeed = dataSource !== "paper_sim";

  return (
    <header className="flex shrink-0 flex-col bg-[#131722] text-xs text-[#d1d4dc] select-none">
      {(tfMenuOpen || barTypeMenuOpen || feedMenuOpen || moreMenuOpen) && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30"
          onClick={closeAllMenus}
        />
      )}

      {/* Seamless macOS Overlay titlebar & tab strip (merges traffic lights inline with app) */}
      {showTabStrip && (
        <div
          data-tauri-drag-region
          style={{ paddingLeft: isMacDesktop ? 82 : 8 }}
          className="flex h-[38px] items-center gap-1 border-b border-[#2a2e39]/90 bg-[#131722] pr-2"
        >
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {resolvedTabs.map((tab) => {
              const isActive = tab.id === resolvedActiveTabId;
              const isUp = typeof tab.changePct === "number" ? tab.changePct >= 0 : true;
              return (
                <div
                  key={tab.id}
                  className={
                    isActive
                      ? "group flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-[#1e222d] px-2.5 text-white"
                      : "group flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[#787b86] hover:bg-[#1e222d]/60 hover:text-[#d1d4dc]"
                  }
                >
                  <button
                    type="button"
                    aria-label={`Chart tab ${tab.symbol}`}
                    onClick={() => onSelectTab?.(tab.id)}
                    className="flex items-center gap-1.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                  >
                    {tab.badgeColor && (
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: tab.badgeColor }}
                        className="h-2 w-2 rounded-full"
                      />
                    )}
                    <span className="font-semibold">{tab.symbol}</span>
                    {tab.priceText && (
                      <span className="font-mono text-[11px] tabular-nums text-[#d1d4dc]">
                        {tab.priceText}
                      </span>
                    )}
                    {typeof tab.changePct === "number" && (
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          isUp ? "text-[#089981]" : "text-[#f23645]"
                        }`}
                      >
                        {isUp ? "+" : ""}
                        {tab.changePct.toFixed(2)}%
                      </span>
                    )}
                    <span className="text-[10px] text-[#787b86]">{tab.timeframe}</span>
                  </button>
                  {onCloseTab && resolvedTabs.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Close ${tab.symbol} tab`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className="flex h-4 w-4 items-center justify-center rounded text-[10px] text-[#787b86] hover:bg-[#2a2e39] hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {onAddTab && (
              <button
                type="button"
                aria-label="New chart tab"
                title="Open new chart tab"
                onClick={onAddTab}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white"
              >
                +
              </button>
            )}
          </div>
          {/* Empty draggable titlebar region */}
          <div data-tauri-drag-region className="h-full min-w-[48px] flex-1" />
        </div>
      )}

      {/* Primary TradingView-style Single Toolbar (40px) */}
      <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2">
        {/* Left Cluster: Symbol, Timeframes, Candles, Indicators, Alert, Replay, Undo/Redo */}
        <Toolbar
          aria-label="Primary chart controls"
          className="flex min-w-0 items-center gap-0.5"
        >
          {/* Symbol Search Trigger */}
          <Dialog
            open={commandOpen}
            onOpenChange={(next) => {
              if (next && onOpenSymbolSearch) {
                onOpenSymbolSearch();
                return;
              }
              setCommandOpen(next);
            }}
          >
            <DialogTrigger
              aria-label={`Symbol search (${symbol})`}
              title={`Search symbol (${paletteHint.text || "⌘K"} or start typing)`}
              className="flex h-7 items-center gap-1.5 rounded px-2 text-[13px] font-semibold text-white hover:bg-[#2a2e39] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 18 18"
                className="h-3.5 w-3.5 text-[#787b86]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="8" cy="8" r="5" />
                <path d="m11.8 11.8 3.2 3.2" strokeLinecap="round" />
              </svg>
              <span>{symbol}</span>
              {activeProviderTag && (
                <span className="rounded bg-[#252a36] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-[#9598a1]">
                  {activeProviderTag}
                </span>
              )}
            </DialogTrigger>
            <DialogBackdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
            <DialogContent className="fixed left-1/2 top-20 z-50 flex w-full max-w-[460px] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] text-[#d1d4dc] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#2a2e39] px-4 py-3">
                <DialogTitle className="text-[16px] font-semibold tracking-[-0.01em] text-[#f0f3fa]">
                  Symbol Search
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Switch active instrument or run a quick chart action.
                </DialogDescription>
                <button
                  type="button"
                  aria-label="Close symbol search"
                  onClick={() => setCommandOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#868993] transition-colors hover:bg-[#2a2e39] hover:text-[#f0f3fa]"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <Command aria-label="Symbol search and commands" className="flex flex-col gap-2.5 p-3.5">
                <CommandInput
                  placeholder="Type a symbol (BTC/USD, ETH/USD, NQ1!, ES1!)..."
                  className="h-9 w-full rounded-md border border-[#363a45] bg-[#131722] px-3 text-[13px] text-[#f0f3fa] placeholder-[#787b86] outline-none focus:border-[#2962ff]"
                />
                <CommandList className="max-h-72 overflow-y-auto rounded border border-[#2a2e39] bg-[#131722] p-1">
                  <CommandEmpty className="p-3 text-center text-xs text-[#787b86]">
                    No matching symbol.
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandGroupLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                      Instruments
                    </CommandGroupLabel>
                    {SYMBOLS.map((sym) => (
                      <CommandItem
                        key={sym}
                        value={`symbol ${sym}`}
                        onSelect={() => {
                          onSymbolChange(sym);
                          setCommandOpen(false);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] hover:bg-[#2a2e39] data-active:bg-[#2962ff]/20 data-active:text-white"
                      >
                        <span className="font-medium">{sym}</span>
                        <span className="text-[10px] text-[#787b86]">
                          {sym.includes("/USD") ? "Crypto Spot" : "Futures / Index"}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup>
                    <CommandGroupLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                      Quick Actions
                    </CommandGroupLabel>
                    {onOpenStudies && (
                      <CommandItem
                        value="indicators studies"
                        onSelect={() => {
                          onOpenStudies();
                          setCommandOpen(false);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] hover:bg-[#2a2e39] data-active:bg-[#2962ff]/20 data-active:text-white"
                      >
                        <span>Open Indicators</span>
                        <span className="text-[10px] text-[#787b86]">Unlimited</span>
                      </CommandItem>
                    )}
                    {onAddAlert && (
                      <CommandItem
                        value="alert price"
                        onSelect={() => {
                          onAddAlert();
                          setCommandOpen(false);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] hover:bg-[#2a2e39] data-active:bg-[#2962ff]/20 data-active:text-white"
                      >
                        <span>Add Alert on {symbol}</span>
                        <span className="text-[10px] text-[#787b86]">⌥A</span>
                      </CommandItem>
                    )}
                    {onToggleReplay && (
                      <CommandItem
                        value="replay bar"
                        onSelect={() => {
                          onToggleReplay();
                          setCommandOpen(false);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] hover:bg-[#2a2e39] data-active:bg-[#2962ff]/20 data-active:text-white"
                      >
                        <span>Toggle Bar Replay</span>
                        <span className="text-[10px] text-[#787b86]">Replay</span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </DialogContent>
          </Dialog>

          <ToolbarSeparator className="mx-1.5 h-5 w-px bg-[#2a2e39]" />

          {/* Timeframe Strip (Favorited + Active Timeframes, plus Custom Interval & Favorites Menu) */}
          <div className="relative flex items-center gap-0.5">
            {visibleBarTimeframes.map((tf) => {
              const active = timeframe === tf;
              return (
                <ToolbarButton
                  key={tf}
                  onClick={() => {
                    onTimeframeChange(tf);
                    setTfMenuOpen(false);
                  }}
                  aria-label={`Timeframe ${tf}`}
                  aria-pressed={active}
                  className={
                    active
                      ? "flex h-7 items-center justify-center rounded-md bg-[#2a2e39] px-2 text-[12px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                      : "flex h-7 items-center justify-center rounded-md px-2 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                  }
                >
                  {tf}
                </ToolbarButton>
              );
            })}
            <button
              type="button"
              aria-label="More timeframes"
              aria-expanded={tfMenuOpen}
              onClick={() => {
                setFeedMenuOpen(false);
                setMoreMenuOpen(false);
                setBarTypeMenuOpen(false);
                setTfMenuOpen((v) => !v);
              }}
              className="flex h-7 w-6 items-center justify-center rounded-md text-[#868993] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            >
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {tfMenuOpen && (
              <div
                role="menu"
                aria-label="All chart timeframes"
                style={{ maxHeight: "calc(100vh - 84px)" }}
                className="absolute left-0 top-9 z-50 flex w-[244px] flex-col overflow-hidden rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#16181f)] shadow-[0_20px_56px_rgba(0,0,0,0.75)]"
              >
                {/* + Add custom interval... */}
                <div className="shrink-0 border-b border-[var(--app-border,#262a34)] p-1.5">
                  {!addingCustomTf ? (
                    <button
                      type="button"
                      onClick={() => setAddingCustomTf(true)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[#e6e8ee] hover:bg-[#242834]"
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 text-[#b2b5be]" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                      </svg>
                      <span>Add custom interval…</span>
                    </button>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddCustomInterval();
                      }}
                      className="space-y-2 rounded-md bg-[#111318] p-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          aria-label="Custom interval value"
                          value={customTfValue}
                          onChange={(e) => setCustomTfValue(e.target.value)}
                          autoFocus
                          className="h-7 w-16 rounded-md border border-[#323642] bg-[#181b24] px-2 font-mono text-[12px] text-white focus:border-[#2962ff] focus:outline-none"
                        />
                        <UiSelect
                          aria-label="Custom interval unit"
                          value={customTfUnit}
                          onChange={(e) => setCustomTfUnit(e.target.value as CustomIntervalUnit)}
                          className="h-7 flex-1 rounded-md border border-[#323642] bg-[#181b24] px-2 text-[12px] text-[#e6e8ee] focus:border-[#2962ff] focus:outline-none"
                        >
                          <option value="t">Ticks</option>
                          <option value="s">Seconds</option>
                          <option value="m">Minutes</option>
                          <option value="h">Hours</option>
                          <option value="D">Days</option>
                          <option value="W">Weeks</option>
                          <option value="M">Months</option>
                        </UiSelect>
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAddingCustomTf(false)}
                          className="h-6 rounded px-2 text-[11px] text-[#9aa1b2] hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="h-6 rounded bg-[var(--app-accent,#2962ff)] px-2.5 text-[11px] font-semibold text-white hover:bg-[#1e53e5]"
                        >
                          Add
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Collapsible Interval Groups with Star Favorites */}
                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  {[
                    ...(customTimeframes.length > 0
                      ? [
                          {
                            id: "custom",
                            heading: "CUSTOM",
                            items: customTimeframes.map((code) => ({
                              code,
                              label: formatCustomIntervalLabel(code),
                              custom: true,
                            })),
                          },
                        ]
                      : []),
                    ...BUILTIN_TIMEFRAME_GROUPS,
                  ].map((group, gi) => {
                    const collapsed = Boolean(collapsedTfGroups[group.id]);
                    return (
                      <div
                        key={group.id}
                        className={gi > 0 ? "border-t border-[var(--app-border,#232632)] pt-1" : ""}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedTfGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                          }
                          className="flex w-full items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86] hover:text-[#b2b5be]"
                        >
                          <span>{group.heading}</span>
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 12 12"
                            className={`h-3 w-3 transition-transform ${collapsed ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          >
                            <path d="M3 7.5 6 4.5 9 7.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {!collapsed && (
                          <div className="px-1.5 pb-1">
                            {group.items.map((item) => {
                              const active = timeframe === item.code;
                              const starred = favoriteTimeframes.includes(item.code);
                              return (
                                <div
                                  key={item.code}
                                  className={
                                    active
                                      ? "group/tf flex items-center justify-between rounded-md bg-[#f0f3fa] px-2.5 py-1.5 text-[12.5px] font-medium text-[#111318]"
                                      : "group/tf flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] text-[#d1d4dc] hover:bg-[#242834] hover:text-white"
                                  }
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      onTimeframeChange(item.code);
                                      setTfMenuOpen(false);
                                    }}
                                    className="flex-1 text-left"
                                  >
                                    {item.label}
                                  </button>

                                  <div className="flex items-center gap-1">
                                    {"custom" in item && item.custom && (
                                      <button
                                        type="button"
                                        title={`Delete custom ${item.label}`}
                                        aria-label={`Delete custom ${item.label}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveCustomInterval(item.code);
                                        }}
                                        className={
                                          active
                                            ? "rounded px-1 text-[12px] text-[#4b5563] hover:text-rose-600"
                                            : "hidden rounded px-1 text-[12px] text-[#787b86] hover:text-rose-400 group-hover/tf:inline-flex"
                                        }
                                      >
                                        ×
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      title={starred ? `Remove ${item.label} from top bar` : `Add ${item.label} to top bar`}
                                      aria-label={starred ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}
                                      aria-pressed={starred}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavoriteTimeframe(item.code);
                                      }}
                                      className={
                                        starred
                                          ? active
                                            ? "flex h-5 w-5 items-center justify-center text-[#111318]"
                                            : "flex h-5 w-5 items-center justify-center text-[#f0f3fa] hover:text-amber-300"
                                          : active
                                            ? "flex h-5 w-5 items-center justify-center text-[#6b7280] hover:text-[#111318]"
                                            : "flex h-5 w-5 items-center justify-center text-[#5c6270] opacity-0 transition-opacity hover:text-amber-300 group-hover/tf:opacity-100 focus-visible:opacity-100"
                                      }
                                    >
                                      <svg
                                        aria-hidden="true"
                                        viewBox="0 0 16 16"
                                        className="h-3.5 w-3.5"
                                        fill={starred ? "currentColor" : "none"}
                                        stroke="currentColor"
                                        strokeWidth="1.4"
                                      >
                                        <path d="M8 2.2 9.8 5.9l4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6L8 2.2Z" strokeLinejoin="round" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <ToolbarSeparator className="mx-1.5 h-5 w-px bg-[#2a2e39]" />

          {/* Chart / Bar Type Selector (All 21 TradingView Bar Types) */}
          <div className="relative">
            <ToolbarButton
              aria-label={`Chart bar type: ${getChartBarTypeLabel(barType)}`}
              aria-expanded={barTypeMenuOpen}
              aria-haspopup="menu"
              title={`Chart style: ${getChartBarTypeLabel(barType)}`}
              onClick={() => {
                setTfMenuOpen(false);
                setFeedMenuOpen(false);
                setMoreMenuOpen(false);
                setBarTypeMenuOpen((v) => !v);
              }}
              className={`flex h-7 items-center gap-0.5 rounded px-1.5 hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff] ${
                barTypeMenuOpen ? "bg-[#2a2e39] text-white" : "text-[#d1d4dc]"
              }`}
            >
              <ChartBarTypeIcon type={barType} />
              <svg aria-hidden="true" viewBox="0 0 10 10" className="h-2.5 w-2.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M2.5 4 5 6.5 7.5 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ToolbarButton>
            {barTypeMenuOpen && (
              <div
                role="menu"
                aria-label="Chart bar types"
                style={{ maxHeight: "calc(100vh - 88px)" }}
                className="absolute left-0 top-9 z-50 w-[236px] overflow-y-auto rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] py-1.5 shadow-2xl"
              >
                {CHART_BAR_TYPE_GROUPS.map((group, gi) => (
                  <div
                    key={gi}
                    className={gi > 0 ? "mt-1 border-t border-[#2a2e39] pt-1" : ""}
                  >
                    {group.map((item) => {
                      const active = barType === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            onBarTypeChange?.(item.id);
                            setBarTypeMenuOpen(false);
                          }}
                          className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                            active
                              ? "bg-[#f1f3f8] font-medium text-[#131722]"
                              : "text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
                          }`}
                        >
                          <ChartBarTypeIcon type={item.id} className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {onCandleStyleChange && (
                  <div className="mt-1 border-t border-[#2a2e39] px-3 pb-1 pt-2">
                    <div className="flex items-center justify-between text-[11px] text-[#787b86]">
                      <span>Palette</span>
                      <button
                        type="button"
                        onClick={() =>
                          onCandleStyleChange(
                            candleStyle === "monochrome" ? "classic" : "monochrome",
                          )
                        }
                        className="rounded border border-[#2a2e39] bg-[#131722] px-2 py-0.5 text-[11px] font-medium text-[#d1d4dc] hover:border-[#2962ff] hover:text-white"
                      >
                        {candleStyle === "monochrome" ? "Monochrome" : "Classic Green/Red"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <ToolbarSeparator className="mx-1.5 h-5 w-px bg-[#2a2e39]" />

          {/* Indicators Button (Unlimited) */}
          <ToolbarButton
            aria-label="Open Indicators"
            title="Indicators & Strategies (unlimited)"
            onClick={() => onOpenStudies?.()}
            className="flex h-7 items-center gap-1.5 rounded px-2 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 text-[#787b86]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 13 7 8.5l3 2.5 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Indicators</span>
            {studiesActiveCount > 0 && (
              <span className="rounded bg-[#2962ff]/18 px-1.5 text-[10px] font-semibold tabular-nums text-[#2962ff]">
                {studiesActiveCount}
              </span>
            )}
          </ToolbarButton>

          {/* Alert Button */}
          <ToolbarButton
            aria-label="Add price alert"
            title="Add price alert (⌥A)"
            onClick={() => onAddAlert?.()}
            className="flex h-7 items-center gap-1.5 rounded px-2 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 text-[#787b86]" fill="none" stroke="currentColor" strokeWidth="1.45">
              <circle cx="9" cy="9.8" r="5" />
              <path d="M9 7.2v2.8l1.8 1.2M4.3 4.8 6 3.3M13.7 4.8 12 3.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Alert</span>
            {alertsCount > 0 && (
              <span className="rounded bg-[#2962ff]/18 px-1.5 text-[10px] font-semibold tabular-nums text-[#2962ff]">
                {alertsCount}
              </span>
            )}
          </ToolbarButton>

          {/* Replay Button */}
          <ToolbarButton
            aria-label="Toggle Bar Replay"
            aria-pressed={replayOpen}
            title="Bar Replay"
            onClick={() => onToggleReplay?.()}
            className={
              replayOpen
                ? "flex h-7 items-center gap-1.5 rounded bg-[#2962ff]/15 px-2 text-[12px] font-medium text-[#2962ff] focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                : "flex h-7 items-center gap-1.5 rounded px-2 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            }
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8.5 5.2 4.5 9l4 3.8M13.5 5.2 9.5 9l4 3.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Replay</span>
          </ToolbarButton>

          <ToolbarSeparator className="mx-1.5 h-5 w-px bg-[#2a2e39]" />

          {/* Undo / Redo */}
          <ToolbarButton
            aria-label="Undo drawing"
            title="Undo (⌘Z)"
            disabled={!canUndo}
            onClick={() => onUndo?.()}
            className="flex h-7 w-7 items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.45">
              <path d="M6.5 6H4v2.5M4.5 6.5A5.5 5.5 0 1 1 6 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            aria-label="Redo drawing"
            title="Redo (⇧⌘Z)"
            disabled={!canRedo}
            onClick={() => onRedo?.()}
            className="flex h-7 w-7 items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.45">
              <path d="M11.5 6H14v2.5M13.5 6.5A5.5 5.5 0 1 0 12 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolbarButton>
        </Toolbar>

        {/* Right Cluster: Market Data Feed Switcher, Settings, Fullscreen, Snapshot, Workspace Menu */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Clean Market Data Source Pill */}
          <div className="relative">
            <button
              type="button"
              data-testid="market-data-feed-trigger"
              aria-label={`Market data source: ${activeFeed.label}`}
              aria-expanded={feedMenuOpen}
              title={dataSourceError ? `Feed notice: ${dataSourceError}` : activeFeed.desc}
              onClick={() => {
                setTfMenuOpen(false);
                setMoreMenuOpen(false);
                setFeedMenuOpen((v) => !v);
              }}
              className="flex h-7 items-center gap-1.5 rounded border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] px-2.5 text-[11px] font-medium text-[#d1d4dc] hover:border-[#363a45] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            >
              <span
                aria-hidden="true"
                className={
                  isLiveFeed
                    ? dataSourceConnected
                      ? "h-1.5 w-1.5 rounded-full bg-[#089981]"
                      : "h-1.5 w-1.5 rounded-full bg-amber-400"
                    : "h-1.5 w-1.5 rounded-full bg-[#787b86]"
                }
              />
              <span>{activeFeed.label}</span>
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 text-[#787b86]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {feedMenuOpen && (
              <div
                role="menu"
                aria-label="Market data sources"
                className="absolute right-0 top-9 z-40 w-64 rounded-md border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] p-1 text-xs shadow-2xl"
              >
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                  Market Data Feed
                </div>
                {FEED_OPTIONS.map((opt) => {
                  const selected = opt.id === dataSource;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        onDataSourceChange?.(opt.id);
                        setFeedMenuOpen(false);
                      }}
                      className={
                        selected
                          ? "flex w-full flex-col rounded bg-[#2962ff]/15 px-2.5 py-1.5 text-left text-white"
                          : "flex w-full flex-col rounded px-2.5 py-1.5 text-left text-[#d1d4dc] hover:bg-[#2a2e39]"
                      }
                    >
                      <span className="flex items-center justify-between font-medium">
                        <span>{opt.label}</span>
                        {selected && <span className="text-[10px] text-[#2962ff]">Active</span>}
                      </span>
                      <span className="text-[10px] text-[#787b86]">{opt.desc}</span>
                    </button>
                  );
                })}
                {dataSourceError && (
                  <div className="mt-1 rounded bg-[#f23645]/12 px-2.5 py-1.5 text-[10px] text-[#f23645]">
                    {dataSourceError}
                  </div>
                )}
                <div className="my-1 h-px bg-[#2a2e39]" aria-hidden="true" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setFeedMenuOpen(false);
                    if (onOpenProviderSettings) {
                      onOpenProviderSettings();
                    } else {
                      setSettingsOpen(true);
                    }
                  }}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[11px] font-medium text-[#5b9cf6] hover:bg-[#2a2e39] hover:text-white"
                >
                  <span>Configure Data Providers &amp; Keys…</span>
                  <span>→</span>
                </button>
              </div>
            )}
          </div>

          <span className="mx-1 h-5 w-px bg-[#2a2e39]" aria-hidden="true" />

          {/* Settings Modal Trigger */}
          <ChartSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={chartSettings}
            onSettingsChange={setChartSettings}
            templates={chartTemplates}
            onApplyTemplate={onApplyChartTemplate}
            onSaveTemplate={onSaveChartTemplate}
            onApplyDefaults={onApplyChartDefaults}
            bootConfig={bootConfig}
            compactDensity={compactDensity}
            onCompactDensityChange={setCompactDensity}
            showProvenanceOverlay={showProvenanceOverlay}
            onShowProvenanceOverlayChange={setShowProvenanceOverlay}
            appAppearance={appAppearance}
            onAppAppearanceChange={onAppAppearanceChange}
            providerConfigs={providerConfigs}
            onProviderConfigsChange={onProviderConfigsChange}
            initialTab={settingsInitialTab}
            highlightProviderId={highlightProviderId}
          />

          {/* Fullscreen */}
          <Button
            aria-label="Toggle fullscreen mode"
            title="Fullscreen"
            onClick={handleToggleFullscreen}
            className="hidden h-7 w-7 items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff] md:flex"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3.2 6.5V3.8a.6.6 0 0 1 .6-.6h2.7M14.8 6.5V3.8a.6.6 0 0 0-.6-.6h-2.7M3.2 11.5v2.7a.6.6 0 0 0 .6.6h2.7M14.8 11.5v2.7a.6.6 0 0 1-.6.6h-2.7" strokeLinecap="round" />
            </svg>
          </Button>

          {/* Snapshot */}
          <Button
            aria-label="Take chart snapshot"
            title="Save chart image"
            onClick={() => onTakeSnapshot?.()}
            className="hidden h-7 w-7 items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff] md:flex"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3 6.2a1.4 1.4 0 0 1 1.4-1.4h1.7l1-1.4h3.8l1 1.4h1.7A1.4 1.4 0 0 1 15 6.2v6.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 12.8V6.2Z" />
              <circle cx="9" cy="9.4" r="2.3" />
            </svg>
          </Button>

          {/* Single Clean Workspace Menu (replaces 5 duplicate icons) */}
          <div className="relative">
            <Button
              aria-label="Workspace menu"
              aria-expanded={moreMenuOpen}
              title="Workspace & layout"
              onClick={() => {
                setTfMenuOpen(false);
                setFeedMenuOpen(false);
                setMoreMenuOpen((v) => !v);
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                <circle cx="3.5" cy="8" r="1.2" />
                <circle cx="8" cy="8" r="1.2" />
                <circle cx="12.5" cy="8" r="1.2" />
              </svg>
            </Button>

            {moreMenuOpen && (
              <div
                role="menu"
                aria-label="Workspace actions"
                className="absolute right-0 top-9 z-40 w-52 rounded-md border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] p-1 text-xs text-[#d1d4dc] shadow-2xl"
              >
                {onAddTab && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddTab();
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-[#2a2e39] hover:text-white"
                  >
                    <span>New Chart Tab</span>
                  </button>
                )}
                {onToggleLayoutMode && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleLayoutMode();
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-[#2a2e39] hover:text-white"
                  >
                    <span>{layoutMode === "focus" ? "Multi-Pane Layout" : "Single Chart Layout"}</span>
                  </button>
                )}
                {onExportWorkspace && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onExportWorkspace();
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-[#2a2e39] hover:text-white"
                  >
                    <span>Export Workspace (.toml)</span>
                  </button>
                )}
                {onOpenProvenance && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenProvenance();
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-[#2a2e39] hover:text-white"
                  >
                    <span>Data & System Info</span>
                  </button>
                )}
                <div className="my-1 h-px bg-[#2a2e39]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResetLayout();
                    setMoreMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-[#2a2e39] hover:text-white"
                >
                  <span>Reset Layout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
