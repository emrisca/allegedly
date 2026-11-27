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
        className="fixed left-1/2 top-1/2 z-50 flex w-[460px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] text-[#d1d4dc] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#2a2e39] px-5 py-3.5">
          <div>
            <DialogTitle className="text-[15px] font-semibold text-white">
              {draft.label}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[#787b86]">
              Customize calculation inputs, visual style, and timeframe visibility
            </DialogDescription>
          </div>
          <DialogClose className="flex h-7 w-7 items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white">
            ×
          </DialogClose>
        </div>

        <Tabs defaultValue="inputs" className="flex flex-col">
          <TabsList className="flex gap-1 border-b border-[#2a2e39] px-5 pt-1">
            <TabsTab
              value="inputs"
              className="border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[#787b86] hover:text-white data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Inputs
            </TabsTab>
            <TabsTab
              value="style"
              className="border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[#787b86] hover:text-white data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Style
            </TabsTab>
            <TabsTab
              value="visibility"
              className="border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[#787b86] hover:text-white data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Visibility
            </TabsTab>
          </TabsList>

          <TabsPanel value="inputs" className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label htmlFor="ind-label" className="text-[12px] text-[#b2b5be]">
                Display Name
              </label>
              <input
                id="ind-label"
                type="text"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                className="h-8 rounded border border-[#2a2e39] bg-[#131722] px-2.5 text-[12px] text-white outline-none focus:border-[#2962ff]"
              />
            </div>

            {usesPeriod && (
              <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                <label htmlFor="ind-period" className="text-[12px] text-[#b2b5be]">
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
                  className="h-8 w-28 rounded border border-[#2a2e39] bg-[#131722] px-2.5 font-mono text-[12px] text-white outline-none focus:border-[#2962ff]"
                />
              </div>
            )}

            {usesSource && (
              <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                <label htmlFor="ind-source" className="text-[12px] text-[#b2b5be]">
                  Source
                </label>
                <select
                  id="ind-source"
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({ ...draft, source: e.target.value as IndicatorPriceSource })
                  }
                  className="h-8 w-44 rounded border border-[#2a2e39] bg-[#131722] px-2.5 text-[12px] text-white outline-none focus:border-[#2962ff]"
                >
                  <option value="close">Close</option>
                  <option value="open">Open</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="hl2">HL2 (High+Low)/2</option>
                  <option value="hlc3">HLC3 (H+L+C)/3</option>
                  <option value="ohlc4">OHLC4 (O+H+L+C)/4</option>
                </select>
              </div>
            )}

            {draft.luauScript !== undefined && draft.luauScript !== null && (
              <div className="space-y-1.5">
                <label htmlFor="ind-luau" className="block text-[12px] text-[#b2b5be]">
                  Luau Script
                </label>
                <textarea
                  id="ind-luau"
                  rows={5}
                  value={draft.luauScript}
                  onChange={(e) => setDraft({ ...draft, luauScript: e.target.value })}
                  className="w-full rounded border border-[#2a2e39] bg-[#131722] p-2.5 font-mono text-[11px] text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                />
              </div>
            )}

            {!usesPeriod && !usesSource && !draft.luauScript && (
              <p className="text-[12px] text-[#787b86]">
                Computed directly from bar buy/sell trade delta. Use Style or Visibility tabs to customize appearance.
              </p>
            )}
          </TabsPanel>

          <TabsPanel value="style" className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-[120px_1fr] items-start gap-3">
              <span className="pt-1 text-[12px] text-[#b2b5be]">Color</span>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Indicator custom color"
                    type="color"
                    value={draft.color}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    className="h-7 w-9 cursor-pointer rounded border border-[#2a2e39] bg-[#131722]"
                  />
                  <span className="font-mono text-[11px] uppercase text-[#9aa1b2]">
                    {draft.color}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INDICATOR_PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Select color ${hex}`}
                      onClick={() => setDraft({ ...draft, color: hex })}
                      style={{ backgroundColor: hex }}
                      className={`h-5 w-5 rounded border ${
                        draft.color.toLowerCase() === hex.toLowerCase()
                          ? "border-white ring-2 ring-[#2962ff]"
                          : "border-[#2a2e39]"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#b2b5be]">Line Width</span>
              <div className="flex items-center gap-1.5">
                {([1, 2, 3, 4] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setDraft({ ...draft, lineWidth: w })}
                    className={`flex h-7 w-10 items-center justify-center rounded border text-[11px] ${
                      draft.lineWidth === w
                        ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                        : "border-[#2a2e39] bg-[#131722] text-[#9aa1b2] hover:text-white"
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#b2b5be]">Line Style</span>
              <div className="flex items-center gap-1.5">
                {(["solid", "dashed", "dotted"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setDraft({ ...draft, lineStyle: style })}
                    className={`h-7 rounded border px-3 text-[11px] capitalize ${
                      draft.lineStyle === style
                        ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                        : "border-[#2a2e39] bg-[#131722] text-[#9aa1b2] hover:text-white"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label htmlFor="ind-opacity" className="text-[12px] text-[#b2b5be]">
                Opacity ({Math.round(draft.opacity * 100)}%)
              </label>
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
                className="w-full accent-[#2962ff]"
              />
            </div>

            <div className="space-y-2 border-t border-[#2a2e39] pt-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-[#d1d4dc]">
                <input
                  type="checkbox"
                  checked={draft.showPriceLabel}
                  onChange={(e) => setDraft({ ...draft, showPriceLabel: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-[#2962ff]"
                />
                Show last value on price scale
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-[#d1d4dc]">
                <input
                  type="checkbox"
                  checked={draft.showPriceLine}
                  onChange={(e) => setDraft({ ...draft, showPriceLine: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-[#2962ff]"
                />
                Show horizontal price line
              </label>
            </div>
          </TabsPanel>

          <TabsPanel value="visibility" className="space-y-2.5 px-5 py-4">
            <p className="mb-2 text-[11px] text-[#787b86]">
              Choose which chart timeframe groups display this indicator.
            </p>
            {(
              [
                ["minutes", "Minutes (1m, 5m, 15m, 30m)"],
                ["hours", "Hours (1h, 4h)"],
                ["days", "Days (D)"],
                ["weeks", "Weeks (W)"],
                ["months", "Months (M)"],
              ] as const
            ).map(([key, desc]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded border border-[#2a2e39]/70 bg-[#131722] px-3 py-2 text-[12px] text-[#d1d4dc]"
              >
                <span>{desc}</span>
                <input
                  type="checkbox"
                  checked={draft.visibility[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      visibility: { ...draft.visibility, [key]: e.target.checked },
                    })
                  }
                  className="h-3.5 w-3.5 rounded accent-[#2962ff]"
                />
              </label>
            ))}
          </TabsPanel>
        </Tabs>

        <div className="flex items-center justify-between border-t border-[#2a2e39] px-5 py-3">
          <Button
            type="button"
            onClick={handleReset}
            className="h-8 rounded border border-[#2a2e39] bg-transparent px-3 text-[12px] text-[#9aa1b2] hover:bg-[#2a2e39] hover:text-white"
          >
            Reset defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded border border-[#2a2e39] bg-transparent px-4 text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="h-8 rounded bg-[#2962ff] px-4 text-[12px] font-medium text-white hover:bg-[#1e53e5]"
            >
              OK
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
