import { useEffect, useState } from "react";
import type { BuiltinStudyKind } from "@allegedly/ipc-client";
import { Button } from "@ui-sdk/react/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { ColorPickerButton } from "@allegedly/ui-chrome";

export type IndicatorLineStyle = "solid" | "dashed" | "dotted";
export type IndicatorPriceSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";

export interface TimeframeVisibility {
  minutes: boolean;
  hours: boolean;
  days: boolean;
  weeks: boolean;
  months: boolean;
}

export const DEFAULT_TIMEFRAME_VISIBILITY: TimeframeVisibility = {
  minutes: true,
  hours: true,
  days: true,
  weeks: true,
  months: true,
};

export interface IndicatorConfig {
  id: string;
  label: string;
  builtin?: BuiltinStudyKind | null;
  period: number;
  source: IndicatorPriceSource;
  luauScript?: string | null;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: IndicatorLineStyle;
  opacity: number;
  showPriceLabel: boolean;
  showPriceLine: boolean;
  visibility: TimeframeVisibility;
}

export const INDICATOR_PRESET_COLORS = [
  "#2962ff",
  "#f59e0b",
  "#089981",
  "#f23645",
  "#a855f7",
  "#38bdf8",
  "#ec4899",
  "#eab308",
  "#94a3b8",
  "#ffffff",
] as const;

export function isTimeframeVisible(timeframe: string, vis?: TimeframeVisibility): boolean {
  if (!vis) return true;
  const tf = timeframe.trim().toUpperCase();
  if (tf.endsWith("M") && !tf.endsWith("MIN")) {
    // '1M', '3M' or 'M' could be Month vs minute; in Allegedly timeframes are '1m','5m','15m','1h','4h','D','W','M'
    if (timeframe === "M" || timeframe === "1M" || timeframe === "MO") return vis.months;
    return vis.minutes;
  }
  if (timeframe.endsWith("m") || tf.endsWith("S")) return vis.minutes;
  if (timeframe.endsWith("h") || tf.endsWith("H")) return vis.hours;
  if (tf === "D" || tf.endsWith("D")) return vis.days;
  if (tf === "W" || tf.endsWith("W")) return vis.weeks;
  return true;
}

export function hexWithOpacity(color: string, opacity = 1): string {
  const clamped = Math.max(0.05, Math.min(1, opacity));
  if (clamped >= 0.999) return color;
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const intVal = Number.parseInt(m[1], 16);
  const r = (intVal >> 16) & 255;
  const g = (intVal >> 8) & 255;
  const b = intVal & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamped.toFixed(2)})`;
}

export interface IndicatorSettingsDialogProps {
  open: boolean;
  config: IndicatorConfig | null;
  onOpenChange: (open: boolean) => void;
  onSave: (next: IndicatorConfig) => void;
  onResetDefaults?: (id: string) => IndicatorConfig | null;
}

export function IndicatorSettingsDialog({
  open,
  config,
  onOpenChange,
  onSave,
  onResetDefaults,
}: IndicatorSettingsDialogProps) {
  const [draft, setDraft] = useState<IndicatorConfig | null>(config);

  useEffect(() => {
    if (open && config) {
      setDraft({
        ...config,
        visibility: { ...DEFAULT_TIMEFRAME_VISIBILITY, ...config.visibility },
      });
    }
  }, [open, config]);

  if (!draft) return null;

  const usesPeriod =
    draft.builtin === "sma" || draft.builtin === "ema" || draft.builtin === "wilder_rsi";
  const usesSource =
    draft.builtin === "sma" ||
    draft.builtin === "ema" ||
    draft.builtin === "wilder_rsi" ||
    draft.builtin === "vwap";

  const handleSave = () => {
    const cleanPeriod = Math.max(1, Math.min(500, Math.round(draft.period || 14)));
    onSave({
      ...draft,
      period: cleanPeriod,
      label: draft.label.trim() || draft.id,
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    if (onResetDefaults) {
      const def = onResetDefaults(draft.id);
      if (def) {
        setDraft(def);
        return;
      }
    }
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            period: prev.builtin === "ema" ? 9 : prev.builtin === "wilder_rsi" ? 14 : 20,
            source: "close",
            lineWidth: 2,
            lineStyle: "solid",
            opacity: 1,
            showPriceLabel: true,
            showPriceLine: false,
            visibility: { ...DEFAULT_TIMEFRAME_VISIBILITY },
          }
        : prev,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
      <DialogContent
        aria-label={`Indicator settings for ${draft.label}`}
        className="fixed left-1/2 top-1/2 z-50 flex w-[420px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[#2a2e39] bg-[#1e222d] text-[#d1d4dc] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <DialogTitle className="truncate text-[18px] font-semibold tracking-[-0.01em] text-[#f0f3fa]">
            {draft.label}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Customize indicator calculation inputs, style, and visibility
          </DialogDescription>
          <DialogClose
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#868993] transition-colors hover:bg-[#2a2e39] hover:text-[#f0f3fa]"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
            </svg>
          </DialogClose>
        </div>

        <Tabs defaultValue="inputs" className="flex flex-col">
          <TabsList className="flex gap-5 border-b border-[#2a2e39] px-5">
            <TabsTab
              value="inputs"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f0f3fa] data-[selected]:text-[#f0f3fa]"
            >
              Inputs
            </TabsTab>
            <TabsTab
              value="style"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f0f3fa] data-[selected]:text-[#f0f3fa]"
            >
              Style
            </TabsTab>
            <TabsTab
              value="visibility"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f0f3fa] data-[selected]:text-[#f0f3fa]"
            >
              Visibility
            </TabsTab>
          </TabsList>

          <TabsPanel value="inputs" className="space-y-3.5 px-5 py-5 text-[13px]">
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
              <label htmlFor="ind-label" className="text-[#d1d4dc]">
                Name
              </label>
              <input
                id="ind-label"
                type="text"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                className="h-9 w-full min-w-0 rounded-md border border-[#363a45] bg-[#181c27] px-3 text-[13px] text-[#f0f3fa] outline-none focus:border-[#2962ff]"
              />
            </div>

            {usesPeriod && (
              <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
                <label htmlFor="ind-period" className="text-[#d1d4dc]">
                  Length
                </label>
                <input
                  id="ind-period"
                  type="number"
                  min={1}
                  max={500}
                  value={draft.period}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      period: Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                    })
                  }
                  className="h-9 w-28 rounded-md border border-[#363a45] bg-[#181c27] px-3 font-mono text-[13px] text-[#f0f3fa] outline-none focus:border-[#2962ff]"
                />
              </div>
            )}

            {usesSource && (
              <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
                <label htmlFor="ind-source" className="text-[#d1d4dc]">
                  Source
                </label>
                <select
                  id="ind-source"
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({ ...draft, source: e.target.value as IndicatorPriceSource })
                  }
                  className="h-9 w-full rounded-md border border-[#363a45] bg-[#181c27] px-3 text-[13px] text-[#f0f3fa] outline-none focus:border-[#2962ff]"
                >
                  <option value="close">Close</option>
                  <option value="open">Open</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="hl2">HL2</option>
                  <option value="hlc3">HLC3</option>
                  <option value="ohlc4">OHLC4</option>
                </select>
              </div>
            )}

            {draft.luauScript && (
              <div className="space-y-1.5">
                <label htmlFor="ind-script" className="block text-[#d1d4dc]">
                  Script
                </label>
                <textarea
                  id="ind-script"
                  rows={5}
                  value={draft.luauScript}
                  onChange={(e) => setDraft({ ...draft, luauScript: e.target.value })}
                  className="w-full rounded-md border border-[#363a45] bg-[#131722] p-2.5 font-mono text-[11px] text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                />
              </div>
            )}

            {!usesPeriod && !usesSource && !draft.luauScript && (
              <p className="text-[12px] text-[#787b86]">No configurable inputs for this study.</p>
            )}
          </TabsPanel>

          <TabsPanel value="style" className="space-y-3.5 px-5 py-5 text-[13px]">
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
              <span className="text-[#d1d4dc]">Color</span>
              <div className="flex items-center gap-2.5">
                <ColorPickerButton
                  ariaLabel="Indicator color"
                  value={draft.color}
                  opacity={draft.opacity}
                  onChange={(hex) => setDraft({ ...draft, color: hex })}
                  onOpacityChange={(op) => setDraft({ ...draft, opacity: Math.max(0.1, op) })}
                  triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#363a45] bg-[#181c27] p-1.5 transition-colors hover:border-[#4c5265]"
                />
                <span className="font-mono text-[11px] uppercase text-[#868993]">
                  {draft.color}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
              <span className="text-[#d1d4dc]">Line width</span>
              <div className="flex items-center gap-1.5">
                {([1, 2, 3, 4] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setDraft({ ...draft, lineWidth: w })}
                    className={`flex h-8 flex-1 items-center justify-center rounded-md border font-mono text-[12px] ${
                      draft.lineWidth === w
                        ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                        : "border-[#363a45] bg-[#181c27] text-[#868993] hover:text-white"
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
              <span className="text-[#d1d4dc]">Line style</span>
              <div className="flex items-center gap-1.5">
                {(["solid", "dashed", "dotted"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setDraft({ ...draft, lineStyle: style })}
                    className={`h-8 flex-1 rounded-md border text-[12px] capitalize ${
                      draft.lineStyle === style
                        ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                        : "border-[#363a45] bg-[#181c27] text-[#868993] hover:text-white"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
              <label htmlFor="ind-opacity" className="text-[#d1d4dc]">
                Opacity
              </label>
              <div className="flex items-center gap-2.5">
                <input
                  id="ind-opacity"
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round(draft.opacity * 100)}
                  onChange={(e) =>
                    setDraft({ ...draft, opacity: Math.max(0.1, Number(e.target.value) / 100) })
                  }
                  className="flex-1 accent-[#2962ff]"
                />
                <span className="w-9 text-right font-mono text-[11px] text-[#9aa1b2]">
                  {Math.round(draft.opacity * 100)}%
                </span>
              </div>
            </div>

            <div className="space-y-2 border-t border-[#2a2e39] pt-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-[#d1d4dc]">
                <input
                  type="checkbox"
                  checked={draft.showPriceLabel}
                  onChange={(e) => setDraft({ ...draft, showPriceLabel: e.target.checked })}
                  className="h-4 w-4 rounded border-[#363a45] bg-[#181c27] accent-[#f0f3fa]"
                />
                <span>Labels on price scale</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[#d1d4dc]">
                <input
                  type="checkbox"
                  checked={draft.showPriceLine}
                  onChange={(e) => setDraft({ ...draft, showPriceLine: e.target.checked })}
                  className="h-4 w-4 rounded border-[#363a45] bg-[#181c27] accent-[#f0f3fa]"
                />
                <span>Price line</span>
              </label>
            </div>
          </TabsPanel>

          <TabsPanel value="visibility" className="space-y-1.5 px-5 py-4 text-[13px]">
            {(
              [
                ["minutes", "Minutes"],
                ["hours", "Hours"],
                ["days", "Days"],
                ["weeks", "Weeks"],
                ["months", "Months"],
              ] as const
            ).map(([key, desc]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-md px-1.5 py-1.5 text-[#d1d4dc] transition-colors hover:bg-[#2a2e39]/40"
              >
                <input
                  type="checkbox"
                  checked={draft.visibility[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      visibility: { ...draft.visibility, [key]: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-[#363a45] bg-[#181c27] accent-[#f0f3fa]"
                />
                <span>{desc}</span>
              </label>
            ))}
          </TabsPanel>
        </Tabs>

        <div className="flex items-center justify-between border-t border-[#2a2e39] px-5 py-3.5">
          <Button
            type="button"
            onClick={handleReset}
            className="h-8 rounded-md border border-[#363a45] bg-transparent px-3 text-[12px] font-medium text-[#d1d4dc] transition-colors hover:bg-[#2a2e39] hover:text-white"
          >
            Defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-md border border-[#363a45] bg-transparent px-4 text-[13px] font-medium text-[#d1d4dc] transition-colors hover:bg-[#2a2e39] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="h-8 rounded-md bg-[#f0f3fa] px-4 text-[13px] font-semibold text-[#131722] transition-colors hover:bg-white"
            >
              OK
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
