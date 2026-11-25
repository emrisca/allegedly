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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { useShortcut, useShortcutHint } from "@ui-sdk/react/shortcuts";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/react/toolbar";

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
}

const SYMBOLS = ["BTC/USD", "ETH/USD", "SOL/USD"] as const;
const TIMEFRAMES = ["1m", "5m", "15m"] as const;

/**
 * Top terminal chrome built strictly with @ui-sdk/react ("0.1.0-beta.17") per AGENTS.md.
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
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-100">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 font-mono text-[11px] font-bold text-amber-400 ring-1 ring-amber-500/40"
          >
            A
          </span>
          <span className="font-semibold tracking-tight text-zinc-100">Allegedly</span>
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 ring-1 ring-zinc-800">
            v0.1-alpha
          </span>
        </div>

        <Toolbar aria-label="Workspace controls" className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Select
              value={symbol}
              onValueChange={(next) => {
                if (typeof next === "string" && next.length > 0) onSymbolChange(next);
              }}
            >
              <SelectLabel className="sr-only">Active Instrument</SelectLabel>
              <SelectTrigger
                aria-label="Active Instrument"
                className="flex h-7 min-w-[116px] items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-xs text-zinc-100 hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <SelectValue />
                <span aria-hidden="true" className="ml-2 text-zinc-500">▾</span>
              </SelectTrigger>
              <SelectContent className="z-50 rounded border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                {SYMBOLS.map((sym) => (
                  <SelectItem
                    key={sym}
                    value={sym}
                    className="cursor-pointer rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 data-highlighted:bg-zinc-800 data-selected:text-amber-400"
                  >
                    {sym}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              value={timeframe}
              onValueChange={(next) => {
                if (typeof next === "string" && next.length > 0) onTimeframeChange(next);
              }}
            >
              <SelectLabel className="sr-only">Chart Timeframe</SelectLabel>
              <SelectTrigger
                aria-label="Chart Timeframe"
                className="flex h-7 min-w-[68px] items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-xs text-zinc-100 hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <SelectValue />
                <span aria-hidden="true" className="ml-1.5 text-zinc-500">▾</span>
              </SelectTrigger>
              <SelectContent className="z-50 rounded border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                {TIMEFRAMES.map((tf) => (
                  <SelectItem
                    key={tf}
                    value={tf}
                    className="cursor-pointer rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 data-highlighted:bg-zinc-800 data-selected:text-amber-400"
                  >
                    {tf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ToolbarSeparator className="mx-1 h-4 w-px bg-zinc-800" />

          <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
            <DialogTrigger
              aria-keyshortcuts={paletteHint.ariaKeyshortcuts}
              className="flex h-7 items-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <span>Command Palette</span>
              <kbd
                aria-hidden="true"
                className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-400"
              >
                {paletteHint.text}
              </kbd>
            </DialogTrigger>
            <DialogBackdrop className="fixed inset-0 z-40 bg-black/70" />
            <DialogContent className="fixed left-1/2 top-20 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-2xl">
              <DialogTitle className="sr-only">Command Palette</DialogTitle>
              <DialogDescription className="sr-only">
                Switch instruments, reset layout, or run safety actions.
              </DialogDescription>
              <Command>
                <CommandInput
                  aria-label="Search terminal commands"
                  placeholder="Type a symbol or command…"
                  className="mb-2 w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-2 focus:outline-amber-400"
                />
                <CommandEmpty className="py-4 text-center text-xs text-zinc-500">
                  No matching terminal commands.
                </CommandEmpty>
                <CommandList className="max-h-64 overflow-y-auto">
                  <CommandGroup>
                    <CommandGroupLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Instruments (Offline Sim)
                    </CommandGroupLabel>
                    {SYMBOLS.map((sym) => (
                      <CommandItem
                        key={sym}
                        value={`switch-${sym}`}
                        onSelect={() => {
                          onSymbolChange(sym);
                          setCommandOpen(false);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 font-mono text-xs text-zinc-200 data-highlighted:bg-zinc-800"
                      >
                        <span>Switch to {sym}</span>
                        <span className="text-[10px] text-zinc-500">Link Group A</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup>
                    <CommandGroupLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Workspace & Safety
                    </CommandGroupLabel>
                    <CommandItem
                      value="reset-layout"
                      onSelect={() => {
                        onResetLayout();
                        setCommandOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs text-zinc-200 data-highlighted:bg-zinc-800"
                    >
                      <span>Reset 3-Panel Dockview Layout</span>
                    </CommandItem>
                    <CommandItem
                      value="kill-switch"
                      onSelect={() => {
                        onKillSwitch();
                        setCommandOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs text-rose-300 data-highlighted:bg-rose-950/60"
                    >
                      <span>Kill-Switch: Cancel All Working Paper Orders</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
              <div className="mt-2 flex justify-end border-t border-zinc-800 pt-2">
                <DialogClose className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
                  Close
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger className="flex h-7 items-center rounded border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-amber-400">
              Settings
            </DialogTrigger>
            <DialogBackdrop className="fixed inset-0 z-40 bg-black/70" />
            <DialogContent className="fixed left-1/2 top-20 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <DialogTitle className="text-sm font-semibold text-zinc-100">
                    Terminal Settings (3-Tier Compression)
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400">
                    Local-first workspace invariants and UI preferences (state_rev={stateRev}).
                  </DialogDescription>
                </div>
                <DialogClose
                  aria-label="Close settings"
                  className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  ✕
                </DialogClose>
              </div>

              <Tabs defaultValue="safety">
                <TabsList
                  aria-label="Settings categories"
                  className="mb-3 flex gap-1 border-b border-zinc-800 pb-2"
                >
                  <TabsTab
                    value="safety"
                    className="rounded px-2.5 py-1 text-xs text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
                  >
                    Safety & Offline Boot
                  </TabsTab>
                  <TabsTab
                    value="display"
                    className="rounded px-2.5 py-1 text-xs text-zinc-400 data-selected:bg-zinc-800 data-selected:text-zinc-100"
                  >
                    Workspace Display
                  </TabsTab>
                </TabsList>

                <TabsPanel value="safety" className="space-y-3 text-xs">
                  <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                    <div>
                      <div className="font-medium text-zinc-100">updates.checkOnStartup</div>
                      <div className="text-zinc-400">
                        SV-01 / RT3-02: Locked false for zero-packet offline startup.
                      </div>
                    </div>
                    <span className="rounded bg-emerald-950 px-2 py-0.5 font-mono text-[11px] text-emerald-300 ring-1 ring-emerald-800">
                      {String(bootConfig.updates_check_on_startup)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                    <div>
                      <div className="font-medium text-zinc-100">LIVE_ARMED Execution Lock</div>
                      <div className="text-zinc-400">
                        ADR-0009: v0.1 ships Paper/Sim only; live broker routing is disabled.
                      </div>
                    </div>
                    <span className="rounded bg-amber-950 px-2 py-0.5 font-mono text-[11px] text-amber-300 ring-1 ring-amber-800">
                      {String(bootConfig.live_armed)}
                    </span>
                  </div>
                </TabsPanel>

                <TabsPanel value="display" className="space-y-3 text-xs">
                  <label className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                    <span className="text-zinc-200">Compact Orderflow Table Density</span>
                    <Switch
                      checked={compactDensity}
                      onCheckedChange={setCompactDensity}
                      className="relative inline-flex h-5 w-9 items-center rounded-full bg-zinc-700 data-checked:bg-amber-500"
                    >
                      <SwitchThumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white transition-transform data-checked:translate-x-5" />
                    </Switch>
                  </label>
                  <label className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                    <span className="text-zinc-200">Show Active 5-Tier Provenance Badge</span>
                    <Switch
                      checked={showProvenanceOverlay}
                      onCheckedChange={setShowProvenanceOverlay}
                      className="relative inline-flex h-5 w-9 items-center rounded-full bg-zinc-700 data-checked:bg-amber-500"
                    >
                      <SwitchThumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white transition-transform data-checked:translate-x-5" />
                    </Switch>
                  </label>
                </TabsPanel>
              </Tabs>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  onClick={onResetLayout}
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  Reset Layout
                </Button>
                <DialogClose className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400">
                  Done
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>

          <ToolbarButton
            onClick={onResetLayout}
            className="flex h-7 items-center rounded border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Reset Layout
          </ToolbarButton>
        </Toolbar>
      </div>

      <div className="flex items-center gap-2">
        <span
          data-testid="mode-badge"
          className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300"
        >
          PAPER / SIM
        </span>
        <span
          data-testid="live-armed-badge"
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300"
        >
          LIVE_ARMED = {String(bootConfig.live_armed)}
        </span>
        <Button
          onClick={onKillSwitch}
          className="h-7 rounded border border-rose-500/50 bg-rose-950/80 px-2.5 font-mono text-[11px] font-semibold text-rose-200 hover:bg-rose-900 focus-visible:outline-2 focus-visible:outline-rose-400"
        >
          KILL SWITCH
        </Button>
      </div>
    </header>
  );
}
