import { useState } from "react";
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
import { ChartSettingsDialog } from "./chart-settings-dialog";

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

const PRIMARY_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "D", "W"] as const;

const EXTRA_TIMEFRAME_GROUPS: readonly {
  heading: string;
  items: readonly string[];
}[] = [
  { heading: "Minutes", items: ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "45m"] },
  { heading: "Hours", items: ["1h", "2h", "4h", "12h"] },
  { heading: "Days & Higher", items: ["D", "3D", "W", "M"] },
];

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
}: ChromeToolbarProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [tfMenuOpen, setTfMenuOpen] = useState(false);
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

  useShortcut("mod+k", () => setCommandOpen((open) => !open), {
    description: "Open symbol search",
    allowInInput: true,
  });
  const paletteHint = useShortcutHint("mod+k");

  const resolvedTabs: readonly ChartTabItem[] =
    chartTabs && chartTabs.length > 0 ? chartTabs : [];
  const showTabStrip = resolvedTabs.length > 1;
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
    setFeedMenuOpen(false);
    setMoreMenuOpen(false);
  };

  const activeFeed = FEED_OPTIONS.find((f) => f.id === dataSource) ?? FEED_OPTIONS[0];
  const isLiveFeed = dataSource !== "paper_sim";

  return (
    <header className="flex shrink-0 flex-col bg-[#131722] text-xs text-[#d1d4dc] select-none">
      {(tfMenuOpen || feedMenuOpen || moreMenuOpen) && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30"
          onClick={closeAllMenus}
        />
      )}

      {/* Optional compact tab bar — only rendered when 2+ chart tabs are open */}
      {showTabStrip && (
        <div className="flex h-8 items-center gap-1 border-b border-[#2a2e39] bg-[#131722] px-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {resolvedTabs.map((tab) => {
              const isActive = tab.id === resolvedActiveTabId;
              return (
                <div
                  key={tab.id}
                  className={
                    isActive
                      ? "group flex h-6 shrink-0 items-center gap-1.5 rounded bg-[#1e222d] px-2 text-white"
                      : "group flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[#787b86] hover:bg-[#1e222d]/60 hover:text-[#d1d4dc]"
                  }
                >
                  <button
                    type="button"
                    aria-label={`Chart tab ${tab.symbol}`}
                    onClick={() => onSelectTab?.(tab.id)}
                    className="flex items-center gap-1.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                  >
                    <span>{tab.symbol}</span>
                    <span className="text-[10px] text-[#787b86]">{tab.timeframe}</span>
                  </button>
                  {onCloseTab && (
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
        </div>
      )}

      {/* Primary TradingView-style Single Toolbar (40px) */}
      <div className="flex h-10 items-center justify-between gap-2 border-b border-[#2a2e39] bg-[#131722] px-2">
        {/* Left Cluster: Symbol, Timeframes, Candles, Indicators, Alert, Replay, Undo/Redo */}
        <Toolbar
          aria-label="Primary chart controls"
          className="flex min-w-0 items-center gap-0.5"
        >
          {/* Symbol Search Trigger */}
          <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
            <DialogTrigger
              aria-label={`Symbol search (${symbol})`}
              title={`Search symbol (${paletteHint.text || "⌘K"})`}
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
            </DialogTrigger>
            <DialogBackdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
            <DialogContent className="fixed left-1/2 top-20 z-50 w-full max-w-md -translate-x-1/2 rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3 text-[#d1d4dc] shadow-2xl">
              <DialogTitle className="text-sm font-semibold text-white">
                Symbol Search
              </DialogTitle>
              <DialogDescription className="mb-2 text-xs text-[#787b86]">
                Switch active instrument or run a quick chart action.
              </DialogDescription>
              <Command aria-label="Symbol search and commands" className="flex flex-col gap-2">
                <CommandInput
                  placeholder="Type a symbol (e.g. BTC/USD, NQ1!, ES1!)..."
                  className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2.5 py-1.5 text-xs text-white placeholder-[#787b86] outline-none focus:border-[#2962ff]"
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

          {/* Timeframe Strip */}
          <div className="relative flex items-center gap-0.5">
            {PRIMARY_TIMEFRAMES.map((tf) => {
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
                      ? "flex h-7 items-center justify-center rounded px-2 text-[12px] font-medium text-[#2962ff] bg-[#2962ff]/12 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                      : "flex h-7 items-center justify-center rounded px-2 text-[12px] font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
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
                setTfMenuOpen((v) => !v);
              }}
              className="flex h-7 w-6 items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            >
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {tfMenuOpen && (
              <div
                role="menu"
                aria-label="All chart timeframes"
                className="absolute left-0 top-9 z-40 w-44 rounded-md border border-[#2a2e39] bg-[#1e222d] p-1.5 shadow-2xl"
              >
                {EXTRA_TIMEFRAME_GROUPS.map((group) => (
                  <div key={group.heading} className="mb-1.5 last:mb-0">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                      {group.heading}
                    </div>
                    <div className="grid grid-cols-4 gap-0.5">
                      {group.items.map((tf) => {
                        const active = timeframe === tf;
                        return (
                          <button
                            key={tf}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onTimeframeChange(tf);
                              setTfMenuOpen(false);
                            }}
                            className={
                              active
                                ? "rounded bg-[#2962ff]/15 px-1.5 py-1 text-[11px] font-semibold text-[#2962ff]"
                                : "rounded px-1.5 py-1 text-[11px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
                            }
                          >
                            {tf}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ToolbarSeparator className="mx-1.5 h-5 w-px bg-[#2a2e39]" />

          {/* Candle Style Toggle */}
          <ToolbarButton
            aria-label={`Candle style: ${candleStyle === "monochrome" ? "Monochrome" : "Classic"}`}
            title={
              candleStyle === "monochrome"
                ? "Monochrome candles (click for Classic green/red)"
                : "Classic green/red candles (click for Monochrome)"
            }
            onClick={() =>
              onCandleStyleChange?.(candleStyle === "monochrome" ? "classic" : "monochrome")
            }
            className="flex h-7 w-7 items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M5.5 3v2.5M5.5 11.5V15" strokeLinecap="round" />
              <rect x="3.8" y="5.5" width="3.4" height="6" rx="0.6" />
              <path d="M12.5 2.5v3.5M12.5 13v2.5" strokeLinecap="round" />
              <rect x="10.8" y="6" width="3.4" height="7" rx="0.6" fill="currentColor" fillOpacity="0.35" />
            </svg>
          </ToolbarButton>

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
              className="flex h-7 items-center gap-1.5 rounded border border-[#2a2e39] bg-[#1e222d] px-2.5 text-[11px] font-medium text-[#d1d4dc] hover:border-[#363a45] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
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
                className="absolute right-0 top-9 z-40 w-64 rounded-md border border-[#2a2e39] bg-[#1e222d] p-1 text-xs shadow-2xl"
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
                className="absolute right-0 top-9 z-40 w-52 rounded-md border border-[#2a2e39] bg-[#1e222d] p-1 text-xs text-[#d1d4dc] shadow-2xl"
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
