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
  /** Extended controls for the institutional two-tier obsidian terminal chrome */
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
  /** Chart tabs & quick actions */
  chartTabs?: readonly ChartTabItem[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onAddTab?: () => void;
  onCloseTab?: (tabId: string) => void;
  onAddAlert?: () => void;
  onTakeSnapshot?: () => void;
  onOpenProvenance?: () => void;
  alertsCount?: number;
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
  "NQ1!",
  "MNQ1!",
  "ES1!",
  "GC1!",
  "CL1!",
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "VIX",
] as const;

const PRIMARY_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "D", "W", "M"] as const;

const EXTRA_TIMEFRAME_GROUPS: readonly {
  heading: string;
  items: readonly string[];
}[] = [
  { heading: "Minutes", items: ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "45m"] },
  { heading: "Hours", items: ["1h", "2h", "4h", "12h"] },
  { heading: "Days & Higher", items: ["D", "3D", "W", "M"] },
];

/**
 * Two-tier obsidian top chrome built with @ui-sdk/react ("0.1.0-beta.17"):
 * - Top slim chart-tab strip (active symbol live ticker + multi-tab + safety strip)
 * - Primary timeframe & execution toolbar matching the sleek obsidian layout
 */
export function ChromeToolbar({
  symbol,
  timeframe,
  bootConfig,
  stateRev,
  onSymbolChange,
  onTimeframeChange,
  onKillSwitch,
  onResetLayout,
  compactDensity: controlledCompactDensity,
  onCompactDensityChange,
  showProvenanceOverlay: controlledShowProvenance,
  onShowProvenanceOverlayChange,
  workspaceName = "DESK",
  candleStyle = "monochrome",
  onCandleStyleChange,
  replayOpen = false,
  onToggleReplay,
  studiesActiveCount = 0,
  onOpenStudies,
  tradeOpen = false,
  onToggleTrade,
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
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
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
    description: "Open command palette",
    allowInInput: true,
  });
  const paletteHint = useShortcutHint("mod+k");

  const resolvedTabs: readonly ChartTabItem[] =
    chartTabs && chartTabs.length > 0
      ? chartTabs
      : [
          {
            id: "tab-default",
            symbol,
            timeframe,
            shortLabel: symbol.slice(0, 3),
            badgeColor: "#2563eb",
            badgeText: "#ffffff",
          },
        ];

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
    setWorkspaceMenuOpen(false);
    setMoreMenuOpen(false);
  };

  return (
    <header className="flex shrink-0 flex-col bg-[#0f1014] text-xs text-[#e6e8ee] select-none">
      {/* Backdrop for lightweight toolbar popovers */}
      {(tfMenuOpen || workspaceMenuOpen || moreMenuOpen) && (
        <div
          className="fixed inset-0 z-30"
          onClick={closeAllMenus}
          aria-hidden="true"
        />
      )}

      {/* Tier 1: Slim Desktop Chart Tab Strip */}
      <div className="flex h-8 items-end justify-between border-b border-[#1c1e26] bg-[#181a20] px-2 pt-1">
        <div className="flex min-w-0 items-end gap-1 overflow-x-auto">
          {resolvedTabs.map((tab) => {
            const isActive = tab.id === resolvedActiveTabId;
            const isNeg = typeof tab.changePct === "number" && tab.changePct < 0;
            const pctStr =
              typeof tab.changePct === "number"
                ? `${tab.changePct >= 0 ? "+" : ""}${tab.changePct.toFixed(2)}%`
                : null;
            return (
              <div
                key={tab.id}
                className={
                  isActive
                    ? "group relative z-10 -mb-px flex h-7 shrink-0 items-center gap-1.5 rounded-t-[8px] border-x border-t border-[#262a35] border-b border-b-[#0f1014] bg-[#0f1014] px-2.5 text-[11px] text-[#f0f2f7]"
                    : "group flex h-6 shrink-0 items-center gap-1.5 rounded-t-[7px] px-2.5 text-[11px] text-[#959baa] hover:bg-[#20232c] hover:text-[#e6e8ee]"
                }
              >
                <button
                  type="button"
                  aria-label={`Chart tab ${tab.symbol}`}
                  onClick={() => onSelectTab?.(tab.id)}
                  className="flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  <span
                    aria-hidden="true"
                    style={{
                      backgroundColor: tab.badgeColor ?? "#2563eb",
                      color: tab.badgeText ?? "#ffffff",
                    }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                  >
                    {(tab.shortLabel ?? tab.symbol).slice(0, 3)}
                  </span>
                  <span className="font-semibold tracking-tight">{tab.symbol}</span>
                  {tab.priceText && (
                    <>
                      <span
                        aria-hidden="true"
                        className={
                          isNeg ? "text-[9px] text-rose-400" : "text-[9px] text-emerald-400"
                        }
                      >
                        {isNeg ? "▼" : "▲"}
                      </span>
                      <span className="font-mono tabular-nums text-[#d8dce6]">
                        {tab.priceText}
                      </span>
                    </>
                  )}
                  {pctStr && (
                    <span
                      className={
                        isNeg
                          ? "font-mono tabular-nums text-rose-400"
                          : "font-mono tabular-nums text-emerald-400"
                      }
                    >
                      {pctStr}
                    </span>
                  )}
                  <span className="hidden text-[#6f7687] sm:inline">/</span>
                  <span className="hidden font-mono text-[10px] text-[#8d93a3] sm:inline">
                    {workspaceName}
                  </span>
                </button>

                {resolvedTabs.length > 1 && onCloseTab && (
                  <button
                    type="button"
                    aria-label={`Close ${tab.symbol} tab`}
                    onClick={() => onCloseTab(tab.id)}
                    className="ml-0.5 rounded px-0.5 text-[11px] text-[#8b92a3] hover:bg-[#2a2e39] hover:text-white"
                  >
                    ×
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
              className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#959baa] hover:bg-[#232733] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Top-Right Compact Safety + Split Layout + More Menu */}
        <div className="mb-0.5 flex shrink-0 items-center gap-1.5">
          <span
            data-testid="live-armed-badge"
            className="rounded border border-[#292d38] bg-[#12141a] px-2 py-0.5 font-mono text-[10px] text-[#a3a9b8]"
          >
            LIVE_ARMED = {String(bootConfig.live_armed)}
          </span>

          <Button
            aria-label="Kill Switch: cancel all working paper orders"
            onClick={onKillSwitch}
            className="h-5 rounded border border-rose-500/45 bg-rose-950/75 px-2 font-mono text-[10px] font-semibold text-rose-200 hover:bg-rose-900/85 focus-visible:outline-2 focus-visible:outline-rose-400"
          >
            KILL
          </Button>

          <span className="h-3.5 w-px bg-[#2a2e39]" aria-hidden="true" />

          {onToggleLayoutMode && (
            <button
              type="button"
              aria-label={
                layoutMode === "focus"
                  ? "Switch to multi-pane Dockview layout"
                  : "Switch to focused chart layout"
              }
              title={
                layoutMode === "focus"
                  ? "Multi-pane Dockview workspace (Chart + DOM + OMS)"
                  : "Focused full-bleed chart workspace"
              }
              onClick={onToggleLayoutMode}
              className={
                layoutMode === "dockview"
                  ? "flex h-6 w-6 items-center justify-center rounded bg-[#2a2e39] text-white"
                  : "flex h-6 w-6 items-center justify-center rounded text-[#959baa] hover:bg-[#232733] hover:text-white"
              }
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.35"
              >
                <rect x="2" y="3" width="12" height="10" rx="1.2" />
                <path d="M2 6.5h12M8 6.5V13" />
              </svg>
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              aria-label="Workspace actions menu"
              aria-expanded={moreMenuOpen}
              onClick={() => {
                setTfMenuOpen(false);
                setWorkspaceMenuOpen(false);
                setMoreMenuOpen((o) => !o);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[#959baa] hover:bg-[#232733] hover:text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                <circle cx="3.5" cy="8" r="1.2" />
                <circle cx="8" cy="8" r="1.2" />
                <circle cx="12.5" cy="8" r="1.2" />
              </svg>
            </button>

            {moreMenuOpen && (
              <div
                role="menu"
                aria-label="Workspace menu"
                className="absolute right-0 top-7 z-40 w-48 rounded-lg border border-[#2a2e39] bg-[#15171e] py-1 text-[12px] text-[#d6dae6] shadow-2xl"
              >
                {onExportWorkspace && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onExportWorkspace();
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#232631] hover:text-white"
                  >
                    <span>Export Workspace TOML</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResetLayout();
                    setMoreMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#232631] hover:text-white"
                >
                  <span>Reset Layout</span>
                  <span className="font-mono text-[10px] text-[#868c9b]">rev {stateRev}</span>
                </button>
                <div className="my-1 h-px bg-[#252834]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#232631] hover:text-white"
                >
                  <span>Chart Settings...</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tier 2: Main Obsidian Timeframe & Chart Toolbar (exact replica layout) */}
      <div className="flex h-10 items-center justify-between gap-2 border-b border-[#22252e] bg-[#0f1014] px-2">
        {/* Left Cluster: Monogram, Symbol Pill, +, Timeframes + chevron, Candles, Indicators, Alert, Replay, Undo/Redo */}
        <Toolbar
          aria-label="Primary chart and terminal controls"
          className="flex min-w-0 items-center gap-0.5"
        >
          {/* Allegedly Monogram Badge */}
          <ToolbarButton
            aria-label="Allegedly terminal status and provenance"
            title="Allegedly Offline Terminal · Click for Provenance & TOML"
            onClick={() => onOpenProvenance?.()}
            className="relative mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#2c303d] bg-[#1a1c23] font-mono text-[11px] font-bold text-[#d8dce6] hover:border-[#414759] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <span>A</span>
            {alertsCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[9px] font-bold text-white">
                {alertsCount}
              </span>
            )}
          </ToolbarButton>

          {/* Rounded Symbol Search Pill (NQ1! + mini circular candle icon) */}
          <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
            <DialogTrigger
              aria-label={`Command palette & symbol search (${symbol})`}
              aria-keyshortcuts={paletteHint.ariaKeyshortcuts}
              className="flex h-7 shrink-0 items-center gap-2 rounded-full border border-[#262a35] bg-[#1b1d24] pl-3 pr-1 text-[12px] font-semibold tracking-tight text-[#e8ebf2] hover:border-[#393f4f] hover:bg-[#232630] focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <span className="font-mono">{symbol}</span>
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-[#3a3f4f] bg-[#13151b] text-[#a5abb8]"
              >
                <svg
                  viewBox="0 0 14 14"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  <path d="M4.5 2.5v9M9.5 2.5v9" strokeLinecap="round" />
                  <rect x="3.2" y="4.5" width="2.6" height="4.2" rx="0.4" fill="currentColor" />
                  <rect x="8.2" y="5.2" width="2.6" height="3.8" rx="0.4" />
                </svg>
              </span>
            </DialogTrigger>

            <DialogBackdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
            <DialogContent className="fixed left-1/2 top-20 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-[#2a2f3d] bg-[#14171f] p-3 shadow-2xl">
              <DialogTitle className="sr-only">
                Allegedly Symbol Search & Command Palette
              </DialogTitle>
              <DialogDescription className="sr-only">
                Switch instruments, timeframes, or run offline terminal commands.
              </DialogDescription>
              <Command
                aria-label="Symbol search and terminal commands"
                className="flex flex-col gap-2"
              >
                <CommandInput
                  placeholder="Type a symbol or command (NQ1!, ES1!, BTC/USD, Kill Switch)..."
                  className="w-full rounded-lg border border-[#2a2f3d] bg-[#0e1016] px-3 py-2 text-xs text-[#f1f3f8] placeholder-[#6f7687] outline-none focus:border-sky-500"
                />
                <CommandList className="max-h-72 overflow-y-auto">
                  <CommandEmpty className="py-6 text-center text-xs text-[#868c9b]">
                    No matching instruments or commands.
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandGroupLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#6f7687]">
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
                        className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-[#e6e8ee] hover:bg-[#222633] data-highlighted:bg-[#222633]"
                      >
                        <span className="font-mono font-semibold">{sym}</span>
                        <span className="text-[11px] text-[#868c9b]">Switch chart</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup>
                    <CommandGroupLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#6f7687]">
                      Terminal Actions
                    </CommandGroupLabel>
                    <CommandItem
                      value="add alert at current price"
                      onSelect={() => {
                        onAddAlert?.();
                        setCommandOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-[#e6e8ee] hover:bg-[#222633] data-highlighted:bg-[#222633]"
                    >
                      <span>Add Alert on {symbol}</span>
                      <span className="font-mono text-[10px] text-[#868c9b]">⌥A</span>
                    </CommandItem>
                    <CommandItem
                      value="toggle replay bar sv-09"
                      onSelect={() => {
                        onToggleReplay?.();
                        setCommandOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-[#e6e8ee] hover:bg-[#222633] data-highlighted:bg-[#222633]"
                    >
                      <span>Toggle Deterministic Replay Bar (SV-09)</span>
                    </CommandItem>
                    <CommandItem
                      value="open indicators studies luau"
                      onSelect={() => {
                        onOpenStudies?.();
                        setCommandOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-[#e6e8ee] hover:bg-[#222633] data-highlighted:bg-[#222633]"
                    >
                      <span>Open Indicators & Luau Study Engine</span>
                    </CommandItem>
                    <CommandItem
                      value="reset workspace layout"
                      onSelect={() => {
                        onResetLayout();
                        setCommandOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-[#e6e8ee] hover:bg-[#222633] data-highlighted:bg-[#222633]"
                    >
                      <span>Reset Workspace Layout</span>
                      <span className="font-mono text-[10px] text-[#868c9b]">rev {stateRev}</span>
                    </CommandItem>
                    <CommandItem
                      value="kill switch cancel all orders"
                      onSelect={() => {
                        onKillSwitch();
                        setCommandOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-950/60 data-highlighted:bg-rose-950/60"
                    >
                      <span>Kill Switch: Cancel All Working Paper Orders</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </DialogContent>
          </Dialog>

          {/* Compare / Add Symbol (+) Circle Icon */}
          <ToolbarButton
            aria-label="Compare or add symbol"
            title="Compare or switch symbol (⌘K)"
            onClick={() => setCommandOpen(true)}
            className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca2b2] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <circle cx="9" cy="9" r="6.5" />
              <path d="M9 5.8v6.4M5.8 9h6.4" strokeLinecap="round" />
            </svg>
          </ToolbarButton>

          <ToolbarSeparator className="mx-1.5 h-4 w-px bg-[#242833]" />

          {/* Favorite Timeframe Strip: 1m 5m 15m 30m 1h 4h D W M + chevron */}
          <div className="flex items-center gap-0.5">
            {PRIMARY_TIMEFRAMES.map((tf) => {
              const active = timeframe === tf;
              return (
                <ToolbarButton
                  key={tf}
                  aria-label={`Timeframe ${tf}`}
                  aria-pressed={active}
                  onClick={() => onTimeframeChange(tf)}
                  className={
                    active
                      ? "flex h-7 min-w-[26px] items-center justify-center rounded-[6px] bg-[#2a2e39] px-1.5 text-[12px] font-medium text-[#f4f6fa] focus-visible:outline-2 focus-visible:outline-sky-400"
                      : "flex h-7 min-w-[26px] items-center justify-center rounded-[6px] px-1.5 text-[12px] font-medium text-[#959baa] hover:bg-[#1b1e27] hover:text-[#e8ebf2] focus-visible:outline-2 focus-visible:outline-sky-400"
                  }
                >
                  {tf}
                </ToolbarButton>
              );
            })}

            {/* Timeframes dropdown chevron */}
            <div className="relative">
              <ToolbarButton
                aria-label="More timeframes"
                aria-expanded={tfMenuOpen}
                onClick={() => {
                  setWorkspaceMenuOpen(false);
                  setMoreMenuOpen(false);
                  setTfMenuOpen((o) => !o);
                }}
                className="flex h-7 w-5 items-center justify-center rounded-[6px] text-[#959baa] hover:bg-[#1b1e27] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </ToolbarButton>

              {tfMenuOpen && (
                <div
                  role="menu"
                  aria-label="All chart timeframes"
                  className="absolute left-0 top-8 z-40 w-44 rounded-lg border border-[#2a2e39] bg-[#15171e] py-1.5 text-[12px] text-[#d6dae6] shadow-2xl"
                >
                  {EXTRA_TIMEFRAME_GROUPS.map((grp, idx) => (
                    <div key={grp.heading}>
                      {idx > 0 && <div className="my-1 h-px bg-[#252834]" />}
                      <div className="px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#787f91]">
                        {grp.heading}
                      </div>
                      <div className="grid grid-cols-4 gap-0.5 px-2 py-0.5">
                        {grp.items.map((item) => {
                          const isCurrent = timeframe === item;
                          return (
                            <button
                              key={item}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onTimeframeChange(item);
                                setTfMenuOpen(false);
                              }}
                              className={
                                isCurrent
                                  ? "rounded bg-[#2a2e39] py-1 text-center font-mono text-[11px] font-semibold text-white"
                                  : "rounded py-1 text-center font-mono text-[11px] text-[#b4bac8] hover:bg-[#222632] hover:text-white"
                              }
                            >
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <ToolbarSeparator className="mx-1.5 h-4 w-px bg-[#242833]" />

          {/* Candle Style Icon */}
          <ToolbarButton
            aria-label={`Candle style: ${candleStyle === "monochrome" ? "Monochrome" : "Classic"}`}
            title={
              candleStyle === "monochrome"
                ? "Candles: Monochrome (click for Classic)"
                : "Candles: Classic (click for Monochrome)"
            }
            onClick={() =>
              onCandleStyleChange?.(candleStyle === "monochrome" ? "classic" : "monochrome")
            }
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca2b2] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <path d="M5.5 2.5v13M12.5 2.5v13" strokeLinecap="round" />
              <rect x="3.8" y="5" width="3.4" height="6" rx="0.6" fill="currentColor" />
              <rect x="10.8" y="6.2" width="3.4" height="5.8" rx="0.6" />
            </svg>
          </ToolbarButton>

          <ToolbarSeparator className="mx-1.5 h-4 w-px bg-[#242833]" />

          {/* Indicators + Chevron */}
          <ToolbarButton
            aria-label="Open Indicators and Luau Studies"
            onClick={() => onOpenStudies?.()}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[#c5cad6] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-4 w-4 text-[#9ca2b2]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <path d="M2.5 11.5 6.2 7.8l3 2.7L14.5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3.5 14.5v-1.2M7 14.5v-2.8M10.5 14.5v-2M14 14.5v-4.2" strokeLinecap="round" />
            </svg>
            <span>Indicators</span>
            {studiesActiveCount > 0 && (
              <span className="rounded-full bg-[#2a2e39] px-1.5 font-mono text-[10px] text-sky-300">
                {studiesActiveCount}
              </span>
            )}
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className="ml-0.5 h-2.5 w-2.5 text-[#868c9b]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolbarButton>

          <ToolbarSeparator className="mx-1.5 h-4 w-px bg-[#242833]" />

          {/* Alert Button (adds price alert on active symbol) */}
          <ToolbarButton
            aria-label="Add price alert"
            title="Add price alert on active symbol (⌥A)"
            onClick={() => onAddAlert?.()}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[#c5cad6] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-4 w-4 text-[#9ca2b2]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <circle cx="9" cy="9.5" r="5.3" />
              <path d="M9 6.8v2.8l1.8 1.2M3.2 4.3 5.2 2.8M14.8 4.3 12.8 2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Alert</span>
          </ToolbarButton>

          {/* Replay Toggle Button */}
          <ToolbarButton
            aria-label="Toggle Replay Bar"
            aria-pressed={replayOpen}
            onClick={() => onToggleReplay?.()}
            className={
              replayOpen
                ? "flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-[#2a2e39] px-2 text-[12px] font-medium text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                : "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[#c5cad6] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            }
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-4 w-4 text-[#9ca2b2]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <path d="M8.5 5 4.2 9l4.3 4V5ZM14 5 9.7 9l4.3 4V5Z" strokeLinejoin="round" />
            </svg>
            <span>Replay</span>
          </ToolbarButton>

          <ToolbarSeparator className="mx-1.5 h-4 w-px bg-[#242833]" />

          {/* Undo / Redo drawing arrows */}
          <ToolbarButton
            aria-label="Undo chart drawing"
            disabled={!canUndo}
            onClick={() => onUndo?.()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.45"
            >
              <path d="M5.5 4.5 2.5 7.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 7.5h6.5a3.5 3.5 0 0 1 0 7H7" strokeLinecap="round" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            aria-label="Redo chart drawing"
            disabled={!canRedo}
            onClick={() => onRedo?.()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.45"
            >
              <path d="M10.5 4.5 13.5 7.5l-3 3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 7.5H6.5a3.5 3.5 0 0 0 0 7H9" strokeLinecap="round" />
            </svg>
          </ToolbarButton>
        </Toolbar>

        {/* Right Cluster: Pane Layout, Workspace Selector, Divider, Quick Search, Hex Settings, Fullscreen, Camera, Provenance, Trade Pill, PAPER / SIM Hero Pill */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Single / Multi-Pane Square Icon */}
          {onToggleLayoutMode && (
            <Button
              aria-label="Toggle workspace pane layout"
              title={
                layoutMode === "focus"
                  ? "Single-chart Focus layout (click for Multi-pane Dockview)"
                  : "Multi-pane Dockview layout (click for Focus chart)"
              }
              onClick={onToggleLayoutMode}
              className={
                layoutMode === "dockview"
                  ? "flex h-7 w-7 items-center justify-center rounded-md bg-[#2a2e39] text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                  : "flex h-7 w-7 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
              }
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 18 18"
                className="h-[17px] w-[17px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.35"
              >
                <rect x="2.8" y="3.2" width="12.4" height="11.6" rx="1.6" />
                {layoutMode === "dockview" && <path d="M9 3.2v11.6M9 9h6.2" />}
              </svg>
            </Button>
          )}

          {/* Workspace Preset Flag + Name + Chevron */}
          <div className="relative">
            <button
              type="button"
              aria-label={`Workspace profile ${workspaceName}`}
              aria-expanded={workspaceMenuOpen}
              onClick={() => {
                setTfMenuOpen(false);
                setMoreMenuOpen(false);
                setWorkspaceMenuOpen((o) => !o);
              }}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[#b8becd] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5 text-[#9ca2b2]"
                fill="currentColor"
              >
                <path d="M3.5 2.5h8.2l-1.4 3.2 1.4 3.2H4.7v4.6H3.5V2.5Z" />
              </svg>
              <span className="tracking-wide">{workspaceName}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                className="h-2.5 w-2.5 text-[#868c9b]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {workspaceMenuOpen && (
              <div
                role="menu"
                aria-label="Workspace profile options"
                className="absolute right-0 top-8 z-40 w-52 rounded-lg border border-[#2a2e39] bg-[#15171e] py-1 text-[12px] text-[#d6dae6] shadow-2xl"
              >
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#787f91]">
                  Allegedly Workspace · rev {stateRev}
                </div>
                {onToggleLayoutMode && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleLayoutMode();
                      setWorkspaceMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#232631] hover:text-white"
                  >
                    <span>
                      {layoutMode === "focus" ? "Switch to Multi-Pane Dockview" : "Switch to Focus Chart"}
                    </span>
                  </button>
                )}
                {onExportWorkspace && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onExportWorkspace();
                      setWorkspaceMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#232631] hover:text-white"
                  >
                    <span>Export .atworkspace.toml</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResetLayout();
                    setWorkspaceMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#232631] hover:text-white"
                >
                  <span>Reset Workspace Layout</span>
                </button>
              </div>
            )}
          </div>

          {/* Compact Desk Profile / Simulation Indicator Circle (matches screenshot right-cluster avatar slot) */}
          <button
            type="button"
            aria-label="Simulation desk status"
            title={`Paper Simulation Desk · ${bootConfig.live_armed ? "Armed" : "Safe Offline"} · rev ${stateRev}`}
            onClick={() => onOpenProvenance?.()}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[#323746] bg-[#1a1d26] text-[#c9cdd8] hover:border-[#4b5266] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <span className="h-3.5 w-3.5 rounded-full bg-gradient-to-b from-[#d9dde6] to-[#6a7182]" />
          </button>

          <span className="mx-1 h-4 w-px bg-[#242833]" aria-hidden="true" />

          {/* Quick Search (magnifying-glass + spark icon) */}
          <Button
            aria-label="Quick search"
            title="Quick search (⌘K)"
            onClick={() => setCommandOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <circle cx="8" cy="8" r="4.8" />
              <path d="m11.6 11.6 3.2 3.2M8.4 5.5 6.8 8.3h2.1l-.9 2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>

          {/* Hexagonal Settings Gear Modal Trigger */}
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

          {/* Fullscreen Mode Icon */}
          <Button
            aria-label="Toggle fullscreen mode"
            title="Fullscreen mode"
            onClick={handleToggleFullscreen}
            className="hidden h-7 w-7 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 md:flex"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <path
                d="M3.2 6.5V3.8a.6.6 0 0 1 .6-.6h2.7M14.8 6.5V3.8a.6.6 0 0 0-.6-.6h-2.7M3.2 11.5v2.7a.6.6 0 0 0 .6.6h2.7M14.8 11.5v2.7a.6.6 0 0 1-.6.6h-2.7"
                strokeLinecap="round"
              />
            </svg>
          </Button>

          {/* Snapshot Camera Icon */}
          <Button
            aria-label="Take chart snapshot"
            title="Capture chart PNG snapshot"
            onClick={() => onTakeSnapshot?.()}
            className="hidden h-7 w-7 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 md:flex"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <path d="M3 6.2a1.4 1.4 0 0 1 1.4-1.4h1.7l1-1.4h3.8l1 1.4h1.7A1.4 1.4 0 0 1 15 6.2v6.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 12.8V6.2Z" />
              <circle cx="9" cy="9.4" r="2.3" />
            </svg>
          </Button>

          {/* Export / Provenance Icon (matches screenshot's lightbulb-plus icon slot) */}
          <Button
            aria-label="Open Provenance and TOML configuration"
            title="Provenance Tiers & .atworkspace.toml"
            onClick={() => onOpenProvenance?.()}
            className="hidden h-7 w-7 items-center justify-center rounded-md text-[#959baa] hover:bg-[#1c1f28] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 lg:flex"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
            >
              <path d="M9 2.8a4.7 4.7 0 0 0-2.8 8.5c.5.4.8 1 .8 1.6v.4h4v-.4c0-.6.3-1.2.8-1.6A4.7 4.7 0 0 0 9 2.8Z" />
              <path d="M7.3 15.2h3.4M9 6.3v3M7.5 7.8h3" strokeLinecap="round" />
            </svg>
          </Button>

          {/* Crisp Rounded "Trade" Pill Button */}
          <Button
            aria-label="Toggle Trade and Paper OMS panel"
            aria-pressed={tradeOpen}
            onClick={() => onToggleTrade?.()}
            className={
              tradeOpen
                ? "ml-0.5 h-7 rounded-full border border-sky-400/60 bg-sky-500/20 px-3.5 text-[12px] font-medium text-sky-200 hover:bg-sky-500/30 focus-visible:outline-2 focus-visible:outline-sky-400"
                : "ml-0.5 h-7 rounded-full border border-[#3a3f4e] bg-[#14161c] px-3.5 text-[12px] font-medium text-[#e8ebf2] hover:border-[#535a70] hover:bg-[#20232d] focus-visible:outline-2 focus-visible:outline-sky-400"
            }
          >
            Trade
          </Button>

          {/* Rightmost High-Contrast Monochrome Pill (replaces promo pill with Allegedly's PAPER / SIM mode badge) */}
          <Button
            data-testid="mode-badge"
            aria-label="Paper simulation mode active"
            title="Offline Paper / Sim Mode · Zero live broker orders"
            onClick={() => onToggleTrade?.()}
            className="h-7 rounded-full bg-[#c9cdd6] px-3.5 text-[11px] font-semibold tracking-tight text-[#111318] hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            PAPER / SIM
          </Button>
        </div>
      </div>
    </header>
  );
}
