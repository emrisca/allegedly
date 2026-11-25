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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { useShortcut, useShortcutHint } from "@ui-sdk/react/shortcuts";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/react/toolbar";

export type CandleVisualStyle = "monochrome" | "classic";
export type WorkspaceLayoutMode = "focus" | "dockview";

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
  /** Optional extended controls for the institutional single-row terminal chrome */
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

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "D", "W"] as const;

/**
 * Institutional single-row top toolbar built with @ui-sdk/react ("0.1.0-beta.17").
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
}: ChromeToolbarProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localCompactDensity, setLocalCompactDensity] = useState(true);
  const [localShowProvenance, setLocalShowProvenance] = useState(true);

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

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-[#232733] bg-[#101217] px-2 text-xs text-[#e6e8ee] select-none">
      {/* Left: Symbol pill, Timeframe strip, Chart style, Indicators, Replay, Undo/Redo */}
      <Toolbar aria-label="Primary chart and terminal controls" className="flex items-center gap-1">
        {/* Symbol Search / Command Palette Trigger */}
        <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
          <DialogTrigger
            aria-label={`Command palette & symbol search (${symbol})`}
            aria-keyshortcuts={paletteHint.ariaKeyshortcuts}
            className="flex h-7 items-center gap-2 rounded-md bg-[#1a1d26] px-2.5 text-xs font-semibold tracking-tight text-[#f1f3f8] hover:bg-[#252a37] focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-[#8c93a4]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" strokeLinecap="round" />
            </svg>
            <span className="font-mono">{symbol}</span>
            <kbd className="hidden rounded bg-[#252a37] px-1 py-0.5 font-mono text-[10px] font-normal text-[#9aa1b2] sm:inline">
              {paletteHint.text}
            </kbd>
          </DialogTrigger>
          <DialogBackdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
          <DialogContent className="fixed left-1/2 top-20 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-[#2a2f3d] bg-[#14171f] p-3 shadow-2xl">
            <DialogTitle className="sr-only">Allegedly Symbol Search & Command Palette</DialogTitle>
            <DialogDescription className="sr-only">
              Switch instruments, timeframes, or run offline terminal commands.
            </DialogDescription>
            <Command aria-label="Symbol search and terminal commands" className="flex flex-col gap-2">
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
                    value="kill switch cancel all flatten"
                    onSelect={() => {
                      onKillSwitch();
                      setCommandOpen(false);
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-950/60 data-highlighted:bg-rose-950/60"
                  >
                    <span>Trigger Paper OMS Kill-Switch (Cancel All)</span>
                    <span className="font-mono text-[10px] text-rose-400">RISK-BYPASS</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>

        <ToolbarSeparator className="mx-1 h-4 w-px bg-[#232733]" />

        {/* Inline Timeframe Strip (matches screenshot's 1m 5m 15m 30m 1h 4h D W) */}
        <div role="group" aria-label="Chart timeframe" className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => {
            const active = timeframe === tf;
            return (
              <ToolbarButton
                key={tf}
                aria-label={`Timeframe ${tf}`}
                aria-pressed={active}
                onClick={() => onTimeframeChange(tf)}
                className={
                  active
                    ? "flex h-7 min-w-[26px] items-center justify-center rounded-md bg-[#292e3b] px-1.5 font-mono text-[11px] font-semibold text-[#ffffff] focus-visible:outline-2 focus-visible:outline-sky-400"
                    : "flex h-7 min-w-[26px] items-center justify-center rounded-md px-1.5 font-mono text-[11px] text-[#9aa1b2] hover:bg-[#1c202b] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-sky-400"
                }
              >
                {tf}
              </ToolbarButton>
            );
          })}
        </div>

        <ToolbarSeparator className="mx-1 h-4 w-px bg-[#232733]" />

        {/* Candle Style Toggle (Monochrome Institutional vs Classic Color) */}
        <ToolbarButton
          aria-label={`Candle style: ${candleStyle === "monochrome" ? "Monochrome" : "Classic"}`}
          title={
            candleStyle === "monochrome"
              ? "Switch to classic emerald/coral candles"
              : "Switch to monochrome institutional candles"
          }
          onClick={() =>
            onCandleStyleChange?.(candleStyle === "monochrome" ? "classic" : "monochrome")
          }
          className="flex h-7 items-center justify-center rounded-md px-2 text-[#b8becd] hover:bg-[#1c202b] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 18 18"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <path d="M5.5 2.5v13M12.5 3.5v11" strokeLinecap="round" />
            <rect
              x="3.75"
              y="5.5"
              width="3.5"
              height="6"
              rx="0.6"
              fill={candleStyle === "classic" ? "#26a69a" : "currentColor"}
              stroke={candleStyle === "classic" ? "#26a69a" : "currentColor"}
            />
            <rect
              x="10.75"
              y="7"
              width="3.5"
              height="5"
              rx="0.6"
              fill={candleStyle === "classic" ? "#ef5350" : "none"}
              stroke={candleStyle === "classic" ? "#ef5350" : "currentColor"}
            />
          </svg>
        </ToolbarButton>

        {/* Indicators / Studies Button */}
        <ToolbarButton
          aria-label="Open Indicators and Luau Studies"
          onClick={() => onOpenStudies?.()}
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-[#d1d5e0] hover:bg-[#1c202b] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 18 18"
            className="h-4 w-4 text-[#9aa1b2]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <path d="M2.5 13.5 6.5 9l3.2 2.8L15.5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12.5 5h3v3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Indicators</span>
          {studiesActiveCount > 0 && (
            <span className="rounded-full bg-[#292e3b] px-1.5 py-0.2 font-mono text-[10px] text-sky-300">
              {studiesActiveCount}
            </span>
          )}
        </ToolbarButton>

        <ToolbarSeparator className="mx-1 h-4 w-px bg-[#232733]" />

        {/* Replay Toggle Button */}
        <ToolbarButton
          aria-label="Toggle Replay Bar"
          aria-pressed={replayOpen}
          onClick={() => onToggleReplay?.()}
          className={
            replayOpen
              ? "flex h-7 items-center gap-1.5 rounded-md bg-[#292e3b] px-2.5 text-[12px] font-medium text-white focus-visible:outline-2 focus-visible:outline-sky-400"
              : "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-[#d1d5e0] hover:bg-[#1c202b] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M7.5 4 3.5 8l4 4M12.5 4l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Replay</span>
        </ToolbarButton>

        {/* Undo / Redo drawing icons */}
        <ToolbarButton
          aria-label="Undo chart drawing"
          disabled={!canUndo}
          onClick={() => onUndo?.()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#1c202b] hover:text-white disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5.5 4.5 2.5 7.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 7.5h6.5a3.5 3.5 0 0 1 0 7H7" strokeLinecap="round" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          aria-label="Redo chart drawing"
          disabled={!canRedo}
          onClick={() => onRedo?.()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#1c202b] hover:text-white disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10.5 4.5 13.5 7.5l-3 3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 7.5H6.5a3.5 3.5 0 0 0 0 7H9" strokeLinecap="round" />
          </svg>
        </ToolbarButton>
      </Toolbar>

      {/* Right: Layout Switcher, Workspace Mode/Safety Pills, Settings, Trade, Kill Switch */}
      <div className="flex items-center gap-1.5">
        {/* Focus vs Multi-Pane Dockview Toggle */}
        {onToggleLayoutMode && (
          <Button
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
                ? "flex h-7 w-7 items-center justify-center rounded-md bg-[#292e3b] text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                : "flex h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#1c202b] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            }
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
              {layoutMode === "dockview" ? (
                <path d="M8 2.5v11M8 8h6" />
              ) : (
                <path d="M10.5 2.5v11" />
              )}
            </svg>
          </Button>
        )}

        {/* Export TOML Workspace Snapshot */}
        {onExportWorkspace && (
          <Button
            aria-label="Export workspace TOML"
            title="Export .atworkspace.toml snapshot"
            onClick={onExportWorkspace}
            className="hidden h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#1c202b] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 md:flex"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3 10.5v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2M8 2.5v7.5M5.2 7.2 8 10l2.8-2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        )}

        {/* Settings Dialog Trigger (preserves @ui-sdk/react Dialog + Tabs + Switch a11y contract) */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger
            aria-label="Settings"
            title="Terminal & Safety Settings"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#9aa1b2] hover:bg-[#1c202b] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="9" cy="9" r="2.5" />
              <path d="M9 2.2v1.6M9 14.2v1.6M2.2 9h1.6M14.2 9h1.6M4.2 4.2l1.1 1.1M12.7 12.7l1.1 1.1M13.8 4.2l-1.1 1.1M5.3 12.7l-1.1 1.1" strokeLinecap="round" />
            </svg>
          </DialogTrigger>
          <DialogBackdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
          <DialogContent className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#2a2f3d] bg-[#14171f] p-4 shadow-2xl">
            <DialogTitle className="text-sm font-semibold text-[#f1f3f8]">
              Allegedly Terminal Settings
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-[#868c9b]">
              Local-first defaults verified for v0.1 offline startup (SV-01 / ADR-0010).
            </DialogDescription>

            <Tabs defaultValue="safety" className="mt-4">
              <TabsList
                aria-label="Settings categories"
                className="mb-3 flex gap-1 border-b border-[#232733] pb-2"
              >
                <TabsTab
                  value="safety"
                  className="rounded-md px-2.5 py-1 text-xs text-[#868c9b] data-selected:bg-[#252a37] data-selected:text-[#f1f3f8]"
                >
                  Safety & Offline Boot
                </TabsTab>
                <TabsTab
                  value="display"
                  className="rounded-md px-2.5 py-1 text-xs text-[#868c9b] data-selected:bg-[#252a37] data-selected:text-[#f1f3f8]"
                >
                  Workspace Display
                </TabsTab>
              </TabsList>

              <TabsPanel value="safety" className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-lg border border-[#232733] bg-[#101217] p-2.5">
                  <div>
                    <div className="font-medium text-[#e6e8ee]">updates.checkOnStartup</div>
                    <div className="text-[#868c9b]">
                      SV-01 / RT3-02: Locked false for zero-packet offline startup.
                    </div>
                  </div>
                  <span className="rounded bg-emerald-950/80 px-2 py-0.5 font-mono text-[11px] text-emerald-300 ring-1 ring-emerald-800/80">
                    {String(bootConfig.updates_check_on_startup)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#232733] bg-[#101217] p-2.5">
                  <div>
                    <div className="font-medium text-[#e6e8ee]">LIVE_ARMED Execution Lock</div>
                    <div className="text-[#868c9b]">
                      ADR-0009: v0.1 ships Paper/Sim only; live broker routing is disabled.
                    </div>
                  </div>
                  <span className="rounded bg-amber-950/80 px-2 py-0.5 font-mono text-[11px] text-amber-300 ring-1 ring-amber-800/80">
                    {String(bootConfig.live_armed)}
                  </span>
                </div>
              </TabsPanel>

              <TabsPanel value="display" className="space-y-2.5 text-xs">
                <label className="flex items-center justify-between rounded-lg border border-[#232733] bg-[#101217] p-2.5">
                  <span className="text-[#e6e8ee]">Compact Orderflow Table Density</span>
                  <Switch
                    checked={compactDensity}
                    onCheckedChange={setCompactDensity}
                    className="relative inline-flex h-5 w-9 items-center rounded-full bg-[#2a2f3d] data-checked:bg-sky-500"
                  >
                    <SwitchThumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white transition-transform data-checked:translate-x-5" />
                  </Switch>
                </label>
                <label className="flex items-center justify-between rounded-lg border border-[#232733] bg-[#101217] p-2.5">
                  <span className="text-[#e6e8ee]">Show Active 5-Tier Provenance Badge</span>
                  <Switch
                    checked={showProvenanceOverlay}
                    onCheckedChange={setShowProvenanceOverlay}
                    className="relative inline-flex h-5 w-9 items-center rounded-full bg-[#2a2f3d] data-checked:bg-sky-500"
                  >
                    <SwitchThumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white transition-transform data-checked:translate-x-5" />
                  </Switch>
                </label>
              </TabsPanel>
            </Tabs>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={onResetLayout}
                className="rounded-md border border-[#2a2f3d] bg-[#1a1d26] px-3 py-1.5 text-xs text-[#e6e8ee] hover:bg-[#252a37]"
              >
                Reset Layout
              </Button>
              <DialogClose className="rounded-md bg-[#e6e8ee] px-3 py-1.5 text-xs font-semibold text-[#0c0d11] hover:bg-white">
                Done
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>

        <span className="h-4 w-px bg-[#232733]" aria-hidden="true" />

        {/* Subtle Safety Badges (preserves mode-badge & live-armed-badge test contracts cleanly) */}
        <span
          data-testid="mode-badge"
          className="hidden rounded-full border border-[#2b3040] bg-[#171a23] px-2 py-0.5 font-mono text-[10px] font-medium text-[#b8becd] lg:inline"
        >
          PAPER / SIM
        </span>
        <span
          data-testid="live-armed-badge"
          className="hidden rounded-full border border-[#232733] bg-[#14171f] px-2 py-0.5 font-mono text-[10px] text-[#868c9b] xl:inline"
        >
          LIVE_ARMED = {String(bootConfig.live_armed)}
        </span>

        {/* Crisp Trade pill button (matches screenshot's rounded "Trade" button!) */}
        <Button
          aria-label="Toggle Trade and Paper OMS panel"
          aria-pressed={tradeOpen}
          onClick={() => onToggleTrade?.()}
          className={
            tradeOpen
              ? "h-7 rounded-full border border-sky-400/60 bg-sky-500/20 px-3 text-[12px] font-medium text-sky-200 hover:bg-sky-500/30 focus-visible:outline-2 focus-visible:outline-sky-400"
              : "h-7 rounded-full border border-[#343a4c] bg-[#171a23] px-3 text-[12px] font-medium text-[#f1f3f8] hover:border-[#4b5369] hover:bg-[#212533] focus-visible:outline-2 focus-visible:outline-sky-400"
          }
        >
          Trade
        </Button>

        {/* Compact Emergency Kill-Switch pill (always 1 click away, restrained institutional crimson) */}
        <Button
          aria-label="Kill Switch: cancel all working paper orders"
          onClick={onKillSwitch}
          className="h-7 rounded-full border border-rose-500/40 bg-rose-950/70 px-2.5 font-mono text-[11px] font-semibold text-rose-200 hover:bg-rose-900/80 focus-visible:outline-2 focus-visible:outline-rose-400"
        >
          KILL
        </Button>
      </div>
    </header>
  );
}
