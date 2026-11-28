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
import { DEFAULT_VWAP, type VwapSettings } from "../indicators/vwap-settings";
import { DEFAULT_VOLUME, type VolumeSettings } from "../indicators/volume-settings";
import { ColorPickerButton, UiInput, UiSelect, UiSwitch } from "@allegedly/ui-chrome";

export type IndicatorLineStyle = "solid" | "dashed" | "dotted";
export type IndicatorPriceSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";

export interface TimeframeVisibility {
  minutes: boolean;
  hours: boolean;
  days: boolean;
  weeks: boolean;
  months: boolean;
  ticks?: boolean;
  seconds?: boolean;
  ranges?: boolean;
  limits?: Partial<Record<"seconds" | "minutes" | "hours" | "days" | "weeks" | "months", [number, number]>>;
}

export const DEFAULT_TIMEFRAME_VISIBILITY: TimeframeVisibility = {
  minutes: true,
  hours: true,
  days: true,
  weeks: true,
  months: true,
  ticks: true, seconds: true, ranges: true,
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
  vwap?: VwapSettings;
  volume?: VolumeSettings;
  precision?: number;
  showStatusValue?: boolean;
  showStatusInputs?: boolean;
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

export function isTimeframeVisible(timeframe: string, vis?: TimeframeVisibility, barType?: string): boolean {
  if (!vis) return true;
  if (barType === "range") return vis.ranges !== false;
  const match = /^(\d*)([tTsSmMhHdDwW])$/.exec(timeframe.trim());
  if (!match) return true;
  const unit = match[2];
  if (unit.toLowerCase() === "t") return vis.ticks !== false;
  const units = { s: "seconds", m: "minutes", h: "hours", d: "days", w: "weeks", M: "months" } as const;
  const key = unit === "M" ? "months" : units[unit.toLowerCase() as keyof typeof units];
  const limits = vis.limits?.[key];
  const amount = Number(match[1]) || 1;
  return vis[key] !== false && (!limits || (amount >= limits[0] && amount <= limits[1]));
}

export function TimeframeVisibilityControls({ visibility, onChange, withLimits = true }: {
  visibility: TimeframeVisibility;
  onChange: (value: TimeframeVisibility) => void;
  withLimits?: boolean;
}) {
  return ([
    ["ticks", "Ticks", 0], ["seconds", "Seconds", 59], ["minutes", "Minutes", 59],
    ["hours", "Hours", 24], ["days", "Days", 366], ["weeks", "Weeks", 52],
    ["months", "Months", 12], ["ranges", "Ranges", 0],
  ] as const).map(([key, label, max]) => {
    const limits = key !== "ticks" && key !== "ranges" ? visibility.limits?.[key] ?? [1, max] : null;
    return <div key={key} className="grid grid-cols-[minmax(90px,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 py-0.5">
      <div className="flex items-center gap-2">
        <UiSwitch aria-label={label} checked={visibility[key] !== false}
          onCheckedChange={(value) => onChange({ ...visibility, [key]: value })} />
        <span>{label}</span>
      </div>
      {withLimits && limits && limits.map((value, index) => <UiInput key={index}
        aria-label={`${label} ${index ? "maximum" : "minimum"}`} type="number" min={1} max={max}
        value={value} disabled={visibility[key] === false}
        onChange={(e) => {
          const n = Math.max(1, Math.min(max, Math.round(Number(e.target.value))));
          const next: [number, number] = index === 0 ? [n, Math.max(n, limits[1])] : [Math.min(n, limits[0]), n];
          onChange({ ...visibility, limits: { ...visibility.limits, [key]: next } });
        }} />)}
    </div>;
  });
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

  const volume = draft.volume;
  const vwap = draft.builtin === "vwap" ? draft.vwap ?? DEFAULT_VWAP : undefined;
  const patchVwap = (settings: Partial<VwapSettings>) => {
    if (vwap) setDraft((current) => current && ({ ...current, vwap: { ...vwap, ...settings } }));
  };
  const patchBand = (index: number, change: Partial<VwapSettings["bands"][number]>) => {
    if (vwap) patchVwap({ bands: vwap.bands.map((band, i) => i === index ? { ...band, ...change } : band) });
  };
  const patchVolume = (settings: Partial<VolumeSettings>) => {
    if (volume) setDraft((current) => current && ({ ...current, volume: { ...volume, ...settings } }));
  };
  const row = (label: string, control: React.ReactNode) => (
    <div className="flex min-h-8 items-center justify-between gap-3"><span>{label}</span>{control}</div>
  );
  const toggle = (label: string, checked: boolean, change: (value: boolean) => void) =>
    row(label, <UiSwitch aria-label={label} checked={checked} onCheckedChange={change} />);

  const usesPeriod =
    !!volume || draft.builtin === "sma" || draft.builtin === "ema" || draft.builtin === "wilder_rsi";
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
            source: prev.builtin === "vwap" ? "hlc3" : "close",
            color: prev.volume || prev.builtin === "vwap" ? "#2962ff" : prev.color,
            vwap: prev.builtin === "vwap" ? DEFAULT_VWAP : undefined,
            volume: prev.volume ? DEFAULT_VOLUME : undefined,
            precision: undefined,
            showStatusValue: true,
            showStatusInputs: true,
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
    <Dialog open={open} onOpenChange={onOpenChange} closeOnOutsidePress={false}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <DialogContent
        aria-label={`Indicator settings for ${draft.label}`}
        className="fixed left-1/2 top-1/2 z-50 flex w-[440px] max-w-[94vw] max-h-[92vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] border border-white/[0.10] bg-[var(--app-surface-bg,#1e222d)] text-[#d1d4dc] shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#868993] transition-colors hover:bg-white/[0.06] hover:text-[#f0f3fa]"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
            </svg>
          </DialogClose>
        </div>

        <Tabs defaultValue="inputs" className="flex min-h-0 flex-col">
          <TabsList className="flex gap-5 border-b border-[#2a2e39] px-5">
            <TabsTab
              value="inputs"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
            >
              Inputs
            </TabsTab>
            <TabsTab
              value="style"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
            >
              Style
            </TabsTab>
            <TabsTab
              value="visibility"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
            >
              Visibility
            </TabsTab>
          </TabsList>

          <TabsPanel value="inputs" className="min-h-0 overflow-y-auto space-y-3.5 px-5 py-5 text-[13px]">
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
              <label htmlFor="ind-label" className="text-[#d1d4dc]">
                Name
              </label>
              <input
                id="ind-label"
                type="text"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                className="h-9 w-full min-w-0 rounded-md border border-[#363a45] bg-[#181c27] px-3 text-[13px] text-[#f0f3fa] outline-none focus:border-white/30"
              />
            </div>

            {usesPeriod && (
              <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
                <label htmlFor="ind-period" className="text-[#d1d4dc]">
                  {volume ? "MA Length" : "Length"}
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
                  className="h-9 w-28 rounded-md border border-[#363a45] bg-[#181c27] px-3 font-mono text-[13px] text-[#f0f3fa] outline-none focus:border-white/30"
                />
              </div>
            )}

            {volume && toggle("Color based on previous close", volume.previousClose, (previousClose) => patchVolume({ previousClose }))}
            {vwap && <>
              {toggle("Hide VWAP on 1D or above", vwap.hideOnDaily, (hideOnDaily) => patchVwap({ hideOnDaily }))}
              {row("Anchor period", <UiSelect aria-label="Anchor period" value={vwap.anchor} onChange={(e) => patchVwap({ anchor: e.target.value })}>
                <option value="D">Session</option><option value="W">Week</option><option value="M">Month</option>
              </UiSelect>)}
              {row("Offset", <UiInput aria-label="VWAP offset" className="max-w-28" type="number" min={-500} max={500} value={vwap.offset} onChange={(e) => patchVwap({ offset: Math.max(-500, Math.min(500, Math.round(Number(e.target.value)))) })} />)}
              {row("Bands calculation mode", <UiSelect aria-label="Bands calculation mode" value={vwap.mode} onChange={(e) => patchVwap({ mode: e.target.value })}>
                <option value="deviation">Standard deviation</option><option value="percent">Percentage</option>
              </UiSelect>)}
              {vwap.bands.map((band, i) => (
                <div className="flex items-center justify-between gap-3" key={i}>
                  {toggle(`Band multiplier ${i + 1}`, band.enabled, (enabled) => patchBand(i, { enabled }))}
                  <UiInput aria-label={`Band ${i + 1} multiplier`} type="number" className="max-w-24" min={0} step={0.1} value={band.multiplier} disabled={!band.enabled} onChange={(e) => patchBand(i, { multiplier: Math.max(0, Number(e.target.value)) })} />
                </div>
              ))}
              {row("Calculation timeframe", <UiSelect aria-label="Calculation timeframe" value={vwap.timeframe} onChange={(e) => patchVwap({ timeframe: e.target.value })}>
                <option value="">Chart</option><option value="30m">30 minutes</option><option value="1h">1 hour</option><option value="4h">4 hours</option><option value="D">1 day</option>
              </UiSelect>)}
              {toggle("Wait for timeframe closes", vwap.waitForClose, (waitForClose) => patchVwap({ waitForClose }))}
            </>}

            {usesSource && (
              <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
                <label htmlFor="ind-source" className="text-[#d1d4dc]">
                  Source
                </label>
                <UiSelect
                  id="ind-source"
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({ ...draft, source: e.target.value as IndicatorPriceSource })
                  }
                  className="h-9 w-full rounded-md border border-[#363a45] bg-[#181c27] px-3 text-[13px] text-[#f0f3fa] outline-none focus:border-white/30"
                >
                  <option value="close">Close</option>
                  <option value="open">Open</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="hl2">HL2</option>
                  <option value="hlc3">HLC3</option>
                  <option value="ohlc4">OHLC4</option>
                </UiSelect>
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
                  className="w-full rounded-md border border-[#363a45] bg-[#131722] p-2.5 font-mono text-[11px] text-[#d1d4dc] outline-none focus:border-white/30"
                />
              </div>
            )}

            {!usesPeriod && !usesSource && !draft.luauScript && (
              <p className="text-[12px] text-[#787b86]">No configurable inputs for this study.</p>
            )}
          </TabsPanel>

          <TabsPanel value="style" className="min-h-0 overflow-y-auto space-y-3.5 px-5 py-5 text-[13px]">
            {volume && <>
              {toggle("Volume bars", volume.showBars, (showBars) => patchVolume({ showBars }))}
              {(["upColor", "downColor"] as const).map((key) => <div key={key}>
                {row(key === "upColor" ? "Growing" : "Falling", <ColorPickerButton ariaLabel={key === "upColor" ? "Growing volume color" : "Falling volume color"} value={volume[key]} opacity={key === "upColor" ? volume.upOpacity : volume.downOpacity} onOpacityChange={(opacity) => patchVolume(key === "upColor" ? { upOpacity: opacity } : { downOpacity: opacity })} onChange={(color) => patchVolume({ [key]: color })} />)}
              </div>)}
              {toggle("Volume moving average", volume.showAverage, (showAverage) => patchVolume({ showAverage }))}
            </>}
            {vwap && <>
              {toggle("VWAP line", vwap.showLine, (showLine) => patchVwap({ showLine }))}
              {vwap.bands.map((band, i) => band.enabled && <div key={i} className="space-y-1">
                {(["upper", "lower", "fill"] as const).map((part) => <div key={part} className="flex items-center justify-between">
                  {toggle(`${part === "fill" ? "Band fill" : part === "upper" ? "Upper band" : "Lower band"} ${i + 1}`, band[part], (value) => patchBand(i, { [part]: value }))}
                  <ColorPickerButton ariaLabel={`${part} band ${i + 1} color`} value={band[`${part}Color`]} onChange={(value) => patchBand(i, { [`${part}Color`]: value })}
                    opacity={part === "fill" ? band.fillOpacity : undefined} onOpacityChange={part === "fill" ? (fillOpacity) => patchBand(i, { fillOpacity }) : undefined}
                    lineStyle={part === "fill" ? undefined : band[`${part}Style`]} onLineStyleChange={part === "fill" ? undefined : (value) => patchBand(i, { [`${part}Style`]: value })} />
                </div>)}
              </div>)}
            </>}
            {(volume || vwap) && <>
              {row("Precision", <UiSelect aria-label="Precision" value={draft.precision ?? ""} onChange={(e) => setDraft({ ...draft, precision: e.target.value === "" ? undefined : Number(e.target.value) })}>
                <option value="">Default</option>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </UiSelect>)}
              {toggle("Values in status line", draft.showStatusValue !== false, (showStatusValue) => setDraft({ ...draft, showStatusValue }))}
              {toggle("Inputs in status line", draft.showStatusInputs !== false, (showStatusInputs) => setDraft({ ...draft, showStatusInputs }))}
            </>}
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
              <span className="text-[#d1d4dc]">{volume ? "Average color" : vwap ? "VWAP color" : "Color"}</span>
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
                        ? "border-white/20 bg-white/[0.10] text-white"
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
                        ? "border-white/20 bg-white/[0.10] text-white"
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
                  className="flex-1 accent-[#e4e4e7]"
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

          <TabsPanel value="visibility" className="min-h-0 overflow-y-auto space-y-1.5 px-5 py-4 text-[13px]">
            <TimeframeVisibilityControls visibility={draft.visibility} onChange={(visibility) => setDraft({ ...draft, visibility })} />
          </TabsPanel>
        </Tabs>

        <div className="flex shrink-0 items-center justify-between border-t border-[#2a2e39] px-5 py-3.5">
          <Button
            type="button"
            onClick={handleReset}
            className="h-8 rounded-md border border-[#363a45] bg-transparent px-3 text-[12px] font-medium text-[#d1d4dc] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-md border border-[#363a45] bg-transparent px-4 text-[13px] font-medium text-[#d1d4dc] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="h-8 rounded-md bg-[#ededed] px-4 text-[13px] font-semibold text-[#0d0f12] transition-colors hover:bg-white"
            >
              OK
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
