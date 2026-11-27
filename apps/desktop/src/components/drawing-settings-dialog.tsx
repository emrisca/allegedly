import { useEffect, useState } from "react";
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
import {
  DEFAULT_DRAWING_VISIBILITY,
  getDrawingToolMeta,
  type AnchorPoint,
  type DrawingLineStyle,
  type DrawingObject,
} from "../drawings/drawing-engine";
import {
  cloneVpConfig,
  DEFAULT_VOLUME_PROFILE_CONFIG,
  saveStoredVpDefaults,
  type VolumeProfileConfig,
  type VpPlacement,
  type VpRowsLayout,
  type VpVolumeMode,
} from "../drawings/volume-profile";

// Includes ICC trading palette: Indication (#2962ff), Correction (#ff9800), Continuation (#089981),
// plus POC red (#f13545) and VAH/VAL white (#ffffff).
export const DRAWING_PRESET_COLORS = [
  "#2962ff",
  "#ff9800",
  "#089981",
  "#f13545",
  "#ffffff",
  "#38bdf8",
  "#a855f7",
  "#eab308",
  "#ec4899",
  "#94a3b8",
] as const;

function VpInputsPanel({
  cfg,
  onChange,
}: {
  cfg: VolumeProfileConfig;
  onChange: (patch: Partial<VolumeProfileConfig>) => void;
}) {
  return (
    <div className="space-y-3.5 px-5 py-4 text-[12px]">
      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-rows-layout" className="text-[#b2b5be]">
          Rows Layout
        </label>
        <select
          id="vp-rows-layout"
          value={cfg.rowsLayout}
          onChange={(e) => onChange({ rowsLayout: e.target.value as VpRowsLayout })}
          className="h-8 rounded border border-[#2a2e39] bg-[#131722] px-2.5 text-[12px] text-white outline-none focus:border-[#2962ff]"
        >
          <option value="number_of_rows">Number Of Rows</option>
          <option value="ticks_per_row">Ticks Per Row</option>
        </select>
      </div>

      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-row-size" className="text-[#b2b5be]">
          Row Size
        </label>
        <input
          id="vp-row-size"
          type="number"
          min={cfg.rowsLayout === "number_of_rows" ? 8 : 1}
          max={2000}
          step={cfg.rowsLayout === "number_of_rows" ? 10 : 1}
          value={cfg.rowSize}
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              onChange({ rowSize: Math.min(2000, Math.max(1, parsed)) });
            }
          }}
          className="h-8 w-full rounded border border-[#2a2e39] bg-[#131722] px-2.5 font-mono text-[12px] text-white outline-none focus:border-[#2962ff]"
        />
      </div>

      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-volume-mode" className="text-[#b2b5be]">
          Volume
        </label>
        <select
          id="vp-volume-mode"
          value={cfg.volumeMode}
          onChange={(e) => onChange({ volumeMode: e.target.value as VpVolumeMode })}
          className="h-8 rounded border border-[#2a2e39] bg-[#131722] px-2.5 text-[12px] text-white outline-none focus:border-[#2962ff]"
        >
          <option value="up_down">Up/Down</option>
          <option value="total">Total</option>
          <option value="delta">Delta</option>
        </select>
      </div>

      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-va-percent" className="text-[#b2b5be]">
          Value Area Volume
        </label>
        <div className="flex items-center gap-2">
          <input
            id="vp-va-percent"
            type="number"
            min={10}
            max={100}
            step={1}
            value={cfg.valueAreaPercent}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(parsed)) {
                onChange({ valueAreaPercent: Math.min(100, Math.max(10, parsed)) });
              }
            }}
            className="h-8 w-full rounded border border-[#2a2e39] bg-[#131722] px-2.5 font-mono text-[12px] text-white outline-none focus:border-[#2962ff]"
          />
          <span className="font-mono text-[11px] text-[#787b86]">%</span>
        </div>
      </div>

      <div className="border-t border-[#2a2e39] pt-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-[#d1d4dc]">
          <input
            type="checkbox"
            checked={cfg.extendRight}
            onChange={(e) => onChange({ extendRight: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#2962ff]"
          />
          <span>Extend right</span>
        </label>
      </div>
    </div>
  );
}

function VpColorOpacityRow({
  label,
  color,
  opacity,
  checked,
  onCheckedChange,
  onColorChange,
  onOpacityChange,
}: {
  label: string;
  color: string;
  opacity: number;
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  onColorChange: (hex: string) => void;
  onOpacityChange: (op: number) => void;
}) {
  return (
    <div className="grid grid-cols-[155px_1fr] items-center gap-3">
      {typeof checked === "boolean" && onCheckedChange ? (
        <label className="flex cursor-pointer items-center gap-2 text-[#d1d4dc]">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#2962ff]"
          />
          <span>{label}</span>
        </label>
      ) : (
        <span className="text-[#b2b5be]">{label}</span>
      )}
      <div className="flex items-center gap-2.5">
        <ColorPickerButton
          ariaLabel={`${label} color`}
          value={color}
          opacity={opacity}
          onChange={onColorChange}
          onOpacityChange={onOpacityChange}
        />
        <input
          aria-label={`${label} opacity`}
          type="range"
          min={5}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
          className="h-1.5 flex-1 accent-[#2962ff]"
        />
        <span className="w-9 text-right font-mono text-[11px] text-[#9aa1b2]">
          {Math.round(opacity * 100)}%
        </span>
      </div>
    </div>
  );
}

function VpLineRow({
  label,
  checked,
  color,
  width,
  onCheckedChange,
  onColorChange,
  onWidthChange,
}: {
  label: string;
  checked: boolean;
  color: string;
  width?: 1 | 2 | 3 | 4;
  onCheckedChange: (v: boolean) => void;
  onColorChange: (hex: string) => void;
  onWidthChange?: (w: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div className="grid grid-cols-[155px_1fr] items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-[#d1d4dc]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-[#2962ff]"
        />
        <span>{label}</span>
      </label>
      <div className="flex items-center gap-2">
        <ColorPickerButton
          ariaLabel={`${label} color`}
          value={color}
          onChange={onColorChange}
        />
        {width !== undefined && onWidthChange && (
          <div className="flex items-center gap-1">
            {([1, 2, 3, 4] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`${label} width ${w}px`}
                onClick={() => onWidthChange(w)}
                className={`flex h-7 w-7 items-center justify-center rounded border text-[11px] font-mono ${
                  width === w
                    ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                    : "border-[#2a2e39] bg-[#131722] text-[#9aa1b2] hover:text-white"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VpStylePanel({
  cfg,
  onChange,
}: {
  cfg: VolumeProfileConfig;
  onChange: (patch: Partial<VolumeProfileConfig>) => void;
}) {
  return (
    <div className="max-h-[340px] space-y-2.5 overflow-y-auto px-5 py-4 text-[12px]">
      <div className="flex items-center gap-6 pb-1">
        <label className="flex cursor-pointer items-center gap-2 text-[#d1d4dc]">
          <input
            type="checkbox"
            checked={cfg.showProfile}
            onChange={(e) => onChange({ showProfile: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#2962ff]"
          />
          <span>Volume Profile</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[#d1d4dc]">
          <input
            type="checkbox"
            checked={cfg.showValues}
            onChange={(e) => onChange({ showValues: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#2962ff]"
          />
          <span>Values</span>
        </label>
      </div>

      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-width-pct" className="text-[#b2b5be]">
          Width (% of the box)
        </label>
        <input
          id="vp-width-pct"
          type="number"
          min={5}
          max={100}
          step={5}
          value={cfg.widthPercent}
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(parsed)) {
              onChange({ widthPercent: Math.min(100, Math.max(5, parsed)) });
            }
          }}
          className="h-8 w-full rounded border border-[#2a2e39] bg-[#131722] px-2.5 font-mono text-[12px] text-white outline-none focus:border-[#2962ff]"
        />
      </div>

      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-placement" className="text-[#b2b5be]">
          Placement
        </label>
        <select
          id="vp-placement"
          value={cfg.placement}
          onChange={(e) => onChange({ placement: e.target.value as VpPlacement })}
          className="h-8 rounded border border-[#2a2e39] bg-[#131722] px-2.5 text-[12px] text-white outline-none focus:border-[#2962ff]"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      <div className="space-y-2 border-t border-[#2a2e39]/70 pt-2.5">
        <VpColorOpacityRow
          label="Up Volume"
          color={cfg.upVolumeColor}
          opacity={cfg.upVolumeOpacity}
          onColorChange={(upVolumeColor) => onChange({ upVolumeColor })}
          onOpacityChange={(upVolumeOpacity) => onChange({ upVolumeOpacity })}
        />
        <VpColorOpacityRow
          label="Down Volume"
          color={cfg.downVolumeColor}
          opacity={cfg.downVolumeOpacity}
          onColorChange={(downVolumeColor) => onChange({ downVolumeColor })}
          onOpacityChange={(downVolumeOpacity) => onChange({ downVolumeOpacity })}
        />
        <VpColorOpacityRow
          label="Value Area Up"
          color={cfg.valueAreaUpColor}
          opacity={cfg.valueAreaUpOpacity}
          onColorChange={(valueAreaUpColor) => onChange({ valueAreaUpColor })}
          onOpacityChange={(valueAreaUpOpacity) => onChange({ valueAreaUpOpacity })}
        />
        <VpColorOpacityRow
          label="Value Area Down"
          color={cfg.valueAreaDownColor}
          opacity={cfg.valueAreaDownOpacity}
          onColorChange={(valueAreaDownColor) => onChange({ valueAreaDownColor })}
          onOpacityChange={(valueAreaDownOpacity) => onChange({ valueAreaDownOpacity })}
        />
      </div>

      <div className="space-y-2 border-t border-[#2a2e39]/70 pt-2.5">
        <VpLineRow
          label="VAH"
          checked={cfg.showVah}
          color={cfg.vahColor}
          width={cfg.vahWidth}
          onCheckedChange={(showVah) => onChange({ showVah })}
          onColorChange={(vahColor) => onChange({ vahColor })}
          onWidthChange={(vahWidth) => onChange({ vahWidth })}
        />
        <VpLineRow
          label="VAL"
          checked={cfg.showVal}
          color={cfg.valColor}
          width={cfg.valWidth}
          onCheckedChange={(showVal) => onChange({ showVal })}
          onColorChange={(valColor) => onChange({ valColor })}
          onWidthChange={(valWidth) => onChange({ valWidth })}
        />
        <VpLineRow
          label="POC"
          checked={cfg.showPoc}
          color={cfg.pocColor}
          width={cfg.pocWidth}
          onCheckedChange={(showPoc) => onChange({ showPoc })}
          onColorChange={(pocColor) => onChange({ pocColor })}
          onWidthChange={(pocWidth) => onChange({ pocWidth })}
        />
        <VpLineRow
          label="Developing PoC"
          checked={cfg.showDevelopingPoc}
          color={cfg.developingPocColor}
          onCheckedChange={(showDevelopingPoc) => onChange({ showDevelopingPoc })}
          onColorChange={(developingPocColor) => onChange({ developingPocColor })}
        />
        <VpLineRow
          label="Developing VA"
          checked={cfg.showDevelopingVa}
          color={cfg.developingVaColor}
          onCheckedChange={(showDevelopingVa) => onChange({ showDevelopingVa })}
          onColorChange={(developingVaColor) => onChange({ developingVaColor })}
        />
      </div>

      <div className="space-y-2 border-t border-[#2a2e39]/70 pt-2.5">
        <VpColorOpacityRow
          label="Histogram Box"
          checked={cfg.showHistogramBox}
          color={cfg.histogramBoxColor}
          opacity={cfg.histogramBoxOpacity}
          onCheckedChange={(showHistogramBox) => onChange({ showHistogramBox })}
          onColorChange={(histogramBoxColor) => onChange({ histogramBoxColor })}
          onOpacityChange={(histogramBoxOpacity) => onChange({ histogramBoxOpacity })}
        />
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-[#d1d4dc]">
          <input
            type="checkbox"
            checked={cfg.showHvnLvn}
            onChange={(e) => onChange({ showHvnLvn: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#2962ff]"
          />
          <span>Highlight HVN / LVN Nodes</span>
        </label>
      </div>
    </div>
  );
}

function unixSecToDateTimeLocal(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateTimeLocalToUnixSec(val: string, fallback: number): number {
  if (!val) return fallback;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : fallback;
}

function StrokePreviewLine({
  color,
  width,
  style,
}: {
  color: string;
  width: number;
  style: DrawingLineStyle;
}) {
  const dash = style === "dashed" ? "5 3" : style === "dotted" ? "2 3" : undefined;
  return (
    <svg aria-hidden="true" viewBox="0 0 36 10" className="h-2.5 w-9 shrink-0">
      <line
        x1="1"
        y1="5"
        x2="35"
        y2="5"
        stroke={color}
        strokeWidth={Math.min(3, Math.max(1.2, width))}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}


function TvModalCloseButton() {
  return (
    <DialogClose
      aria-label="Close"
      className="flex h-7 w-7 items-center justify-center rounded-md text-[#868993] transition-colors hover:bg-[#2a2e39] hover:text-[#f0f3fa]"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
      </svg>
    </DialogClose>
  );
}

function TvTemplateMenu({
  onReset,
  extraActionLabel,
  onExtraAction,
}: {
  onReset: () => void;
  extraActionLabel?: string;
  onExtraAction?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-[#363a45] bg-transparent px-3 text-[12px] font-medium text-[#d1d4dc] transition-colors hover:bg-[#2a2e39] hover:text-white"
      >
        <span>Template</span>
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 text-[#787b86]" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-44 rounded-lg border border-[#363a45] bg-[#1e222d] py-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
          >
            Apply defaults
          </button>
          {extraActionLabel && onExtraAction && (
            <button
              type="button"
              onClick={() => {
                onExtraAction();
                setOpen(false);
              }}
              className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
            >
              {extraActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface VolumeProfileSettingsDialogProps {
  open: boolean;
  title?: string;
  config: VolumeProfileConfig;
  onOpenChange: (open: boolean) => void;
  onSave: (config: VolumeProfileConfig) => void;
}

export function VolumeProfileSettingsDialog({
  open,
  title = "Session Volume Profile",
  config,
  onOpenChange,
  onSave,
}: VolumeProfileSettingsDialogProps) {
  const [draft, setDraft] = useState<VolumeProfileConfig>(() => cloneVpConfig(config));
  const [savedDefaultFlash, setSavedDefaultFlash] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneVpConfig(config));
    setSavedDefaultFlash(false);
  }, [open, config]);

  const patchDraft = (patch: Partial<VolumeProfileConfig>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
      <DialogContent
        aria-label={`${title} settings`}
        className="fixed left-1/2 top-1/2 z-50 flex w-[440px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[#2a2e39] bg-[#1e222d] text-[#d1d4dc] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em] text-[#f0f3fa]">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure volume profile inputs and visual style
          </DialogDescription>
          <TvModalCloseButton />
        </div>

        <Tabs defaultValue="inputs" className="flex flex-col">
          <TabsList className="flex gap-5 border-b border-[#2a2e39] px-5">
            <TabsTab
              value="inputs"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Inputs
            </TabsTab>
            <TabsTab
              value="style"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Style
            </TabsTab>
          </TabsList>

          <TabsPanel value="inputs">
            <VpInputsPanel cfg={draft} onChange={patchDraft} />
          </TabsPanel>
          <TabsPanel value="style">
            <VpStylePanel cfg={draft} onChange={patchDraft} />
          </TabsPanel>
        </Tabs>

        <div className="flex items-center justify-between border-t border-[#2a2e39] px-5 py-3.5">
          <TvTemplateMenu
            onReset={() => setDraft(cloneVpConfig(DEFAULT_VOLUME_PROFILE_CONFIG))}
            extraActionLabel={savedDefaultFlash ? "Saved as default" : "Save as default"}
            onExtraAction={() => {
              saveStoredVpDefaults(draft);
              setSavedDefaultFlash(true);
            }}
          />
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
              onClick={() => {
                onSave(cloneVpConfig(draft));
                onOpenChange(false);
              }}
              className="h-8 rounded-md bg-[#2962ff] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1e53e5]"
            >
              OK
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface DrawingSettingsDialogProps {
  open: boolean;
  drawing: DrawingObject | null;
  tickSizeE9: bigint;
  decimals: number;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: Partial<Omit<DrawingObject, "id" | "kind" | "symbol">>) => void;
}

export function DrawingSettingsDialog({
  open,
  drawing,
  tickSizeE9,
  decimals,
  onOpenChange,
  onSave,
}: DrawingSettingsDialogProps) {
  const [color, setColor] = useState("#2962ff");
  const [lineWidth, setLineWidth] = useState<1 | 2 | 3 | 4>(2);
  const [lineStyle, setLineStyle] = useState<DrawingLineStyle>("solid");
  const [fillColor, setFillColor] = useState("#2962ff");
  const [fillOpacity, setFillOpacity] = useState(0.16);
  const [fillEnabled, setFillEnabled] = useState(true);
  const [showMiddleLine, setShowMiddleLine] = useState(false);
  const [middleLineColor, setMiddleLineColor] = useState("#a855f7");
  const [middleLineStyle, setMiddleLineStyle] = useState<DrawingLineStyle>("dashed");
  const [extendLeft, setExtendLeft] = useState(false);
  const [extendRight, setExtendRight] = useState(false);
  const [label, setLabel] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [fontSize, setFontSize] = useState(12);
  const [textColor, setTextColor] = useState("#d1d4dc");
  const [locked, setLocked] = useState(false);
  const [visibility, setVisibility] = useState({ ...DEFAULT_DRAWING_VISIBILITY });
  const [anchorPrices, setAnchorPrices] = useState<string[]>([]);
  const [anchorTimes, setAnchorTimes] = useState<number[]>([]);
  const [vpConfig, setVpConfig] = useState<VolumeProfileConfig>(() =>
    cloneVpConfig(DEFAULT_VOLUME_PROFILE_CONFIG),
  );
  const [avwapShowBands, setAvwapShowBands] = useState(true);
  const [avwapBandMult, setAvwapBandMult] = useState(1);
  const [rrRatio, setRrRatio] = useState(2);
  const [savedDefaultFlash, setSavedDefaultFlash] = useState(false);

  const tickFloat = Math.max(1e-9, Number(tickSizeE9) / 1e9);

  useEffect(() => {
    if (!open || !drawing) return;
    setColor(drawing.color);
    setLineWidth(drawing.lineWidth ?? 2);
    setLineStyle(drawing.lineStyle ?? "solid");
    setFillColor(drawing.fillColor ?? drawing.color);
    setFillOpacity(drawing.fillOpacity ?? 0.16);
    setFillEnabled(drawing.fillEnabled !== false);
    setShowMiddleLine(Boolean(drawing.showMiddleLine));
    setMiddleLineColor(drawing.middleLineColor ?? "#a855f7");
    setMiddleLineStyle(drawing.middleLineStyle ?? "dashed");
    setExtendLeft(Boolean(drawing.extendLeft));
    setExtendRight(Boolean(drawing.extendRight));
    setLabel(drawing.label ?? "");
    setEditingTitle(false);
    setFontSize(drawing.fontSize ?? 12);
    setTextColor(drawing.textColor ?? "#d1d4dc");
    setLocked(Boolean(drawing.locked));
    setVisibility({ ...DEFAULT_DRAWING_VISIBILITY, ...(drawing.visibility ?? {}) });
    setAnchorPrices(
      drawing.anchors.map((a) => (Number(a.priceTick) * tickFloat).toFixed(decimals)),
    );
    setAnchorTimes(drawing.anchors.map((a) => a.timeSec));
    setVpConfig(cloneVpConfig(drawing.vpConfig));
    setAvwapShowBands(drawing.avwapShowBands !== false);
    setAvwapBandMult(drawing.avwapBandMult ?? 1);
    setRrRatio(drawing.rrRatio ?? 2);
    setSavedDefaultFlash(false);
  }, [open, drawing, tickFloat, decimals]);

  if (!drawing) return null;

  const meta = getDrawingToolMeta(drawing.kind);
  const isVolumeProfile =
    drawing.kind === "fixed_range_vp" || drawing.kind === "anchored_vp";
  const isAnchoredVwap = drawing.kind === "anchored_vwap";
  const isPositionTool =
    drawing.kind === "long_position" ||
    drawing.kind === "short_position" ||
    drawing.kind === "position_forecast";
  const isRectangle = drawing.kind === "box_zone" || drawing.kind === "rotated_rectangle";
  const supportsMiddleLine =
    drawing.kind === "box_zone" || drawing.kind === "fib_channel";
  const supportsFill =
    drawing.kind === "box_zone" ||
    drawing.kind === "rotated_rectangle" ||
    drawing.kind === "ellipse" ||
    drawing.kind === "triangle" ||
    drawing.kind === "fib_channel" ||
    drawing.kind === "fib_retracement" ||
    drawing.kind === "long_position" ||
    drawing.kind === "short_position";
  const supportsExtend =
    drawing.kind === "box_zone" ||
    drawing.kind === "trendline" ||
    drawing.kind === "ray" ||
    drawing.kind === "info_line" ||
    drawing.kind === "extended_line" ||
    drawing.kind === "fib_channel" ||
    drawing.kind === "fib_retracement" ||
    drawing.kind === "fib_extension";

  const extendMode =
    extendLeft && extendRight
      ? "both"
      : extendRight
        ? "right"
        : extendLeft
          ? "left"
          : "none";

  const handleExtendModeChange = (mode: string) => {
    setExtendLeft(mode === "left" || mode === "both");
    setExtendRight(mode === "right" || mode === "both");
  };

  const handleSave = () => {
    const nextAnchors: AnchorPoint[] = drawing.anchors.map((orig, idx) => {
      const parsedPrice = Number.parseFloat(anchorPrices[idx] ?? "");
      const priceTick =
        Number.isFinite(parsedPrice) && parsedPrice > 0
          ? BigInt(Math.round(parsedPrice / tickFloat))
          : orig.priceTick;
      const parsedTime = anchorTimes[idx];
      const timeSec =
        typeof parsedTime === "number" && Number.isFinite(parsedTime) && parsedTime > 0
          ? Math.round(parsedTime)
          : orig.timeSec;
      return { timeSec, priceTick };
    });

    onSave(drawing.id, {
      color,
      lineWidth,
      lineStyle,
      fillColor,
      fillOpacity,
      fillEnabled,
      showMiddleLine,
      middleLineColor,
      middleLineStyle,
      extendLeft,
      extendRight,
      label: label.trim() || undefined,
      fontSize,
      textColor,
      locked,
      visibility: { ...visibility },
      anchors: nextAnchors,
      ...(isVolumeProfile ? { vpConfig: cloneVpConfig(vpConfig) } : {}),
      ...(isAnchoredVwap ? { avwapShowBands, avwapBandMult } : {}),
      ...(isPositionTool ? { rrRatio } : {}),
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    setColor(meta.defaultColor);
    setLineWidth(2);
    setLineStyle("solid");
    setFillColor(meta.defaultColor);
    setFillOpacity(0.16);
    setFillEnabled(true);
    setShowMiddleLine(false);
    setMiddleLineColor("#a855f7");
    setMiddleLineStyle("dashed");
    setExtendLeft(false);
    setExtendRight(false);
    setFontSize(12);
    setTextColor("#d1d4dc");
    setLocked(false);
    setVisibility({ ...DEFAULT_DRAWING_VISIBILITY });
    if (isVolumeProfile) setVpConfig(cloneVpConfig(DEFAULT_VOLUME_PROFILE_CONFIG));
    if (isAnchoredVwap) {
      setAvwapShowBands(true);
      setAvwapBandMult(1);
    }
    if (isPositionTool) setRrRatio(2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
      <DialogContent
        aria-label={`${meta.label} settings`}
        className="fixed left-1/2 top-1/2 z-50 flex w-[420px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[#2a2e39] bg-[#1e222d] text-[#d1d4dc] shadow-2xl"
      >
        {/* Clean TradingView Header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            {editingTitle ? (
              <input
                type="text"
                autoFocus
                value={label}
                placeholder={meta.label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
                }}
                className="h-7 w-48 rounded border border-[#2962ff] bg-[#131722] px-2 text-[15px] font-semibold text-white outline-none"
              />
            ) : (
              <>
                <DialogTitle className="truncate text-[18px] font-semibold tracking-[-0.01em] text-[#f0f3fa]">
                  {label.trim() || meta.label}
                </DialogTitle>
                <button
                  type="button"
                  title="Rename drawing"
                  aria-label="Rename drawing"
                  onClick={() => setEditingTitle(true)}
                  className="flex h-6 w-6 items-center justify-center rounded text-[#868993] transition-colors hover:bg-[#2a2e39] hover:text-white"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M11.3 2.5a1.5 1.5 0 0 1 2.2 2.2L5.6 12.6l-3 .8.8-3 7.9-7.9Z" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
            <DialogDescription className="sr-only">
              Customize {meta.label} style, text, coordinates, and visibility
            </DialogDescription>
          </div>
          <TvModalCloseButton />
        </div>

        <Tabs
          key={drawing.id}
          defaultValue={isVolumeProfile ? "inputs" : "style"}
          className="flex flex-col"
        >
          <TabsList className="flex gap-5 border-b border-[#2a2e39] px-5">
            {isVolumeProfile && (
              <TabsTab
                value="inputs"
                className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#2962ff] data-[selected]:text-white"
              >
                Inputs
              </TabsTab>
            )}
            <TabsTab
              value="style"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Style
            </TabsTab>
            {!isVolumeProfile && (
              <TabsTab
                value="text"
                className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#2962ff] data-[selected]:text-white"
              >
                Text
              </TabsTab>
            )}
            <TabsTab
              value="coordinates"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Coordinates
            </TabsTab>
            <TabsTab
              value="visibility"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Visibility
            </TabsTab>
          </TabsList>

          {isVolumeProfile && (
            <TabsPanel value="inputs">
              <VpInputsPanel
                cfg={vpConfig}
                onChange={(patch) => setVpConfig((prev) => ({ ...prev, ...patch }))}
              />
            </TabsPanel>
          )}

          {/* STYLE TAB — Clean TradingView rows */}
          <TabsPanel value="style">
            {isVolumeProfile ? (
              <VpStylePanel
                cfg={vpConfig}
                onChange={(patch) => setVpConfig((prev) => ({ ...prev, ...patch }))}
              />
            ) : (
              <div className="space-y-3.5 px-5 py-5 text-[13px]">
                {supportsExtend && (
                  <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3">
                    <label htmlFor="drw-extend" className="text-[#d1d4dc]">
                      Extend
                    </label>
                    <select
                      id="drw-extend"
                      value={extendMode}
                      onChange={(e) => handleExtendModeChange(e.target.value)}
                      className="h-9 w-full rounded-md border border-[#363a45] bg-[#181c27] px-3 text-[13px] text-[#f0f3fa] outline-none transition-colors hover:border-[#4c5265] focus:border-[#2962ff]"
                    >
                      <option value="none">None</option>
                      <option value="left">Extend left</option>
                      <option value="right">Extend right</option>
                      <option value="both">Extend both</option>
                    </select>
                  </div>
                )}

                {/* Border / Line row */}
                <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3">
                  <span className="text-[#d1d4dc]">{isRectangle ? "Border" : "Line"}</span>
                  <div className="flex items-center gap-2">
                    <ColorPickerButton
                      ariaLabel={isRectangle ? "Border style" : "Line style"}
                      value={color}
                      onChange={setColor}
                      lineWidth={lineWidth}
                      onLineWidthChange={setLineWidth}
                      lineStyle={lineStyle}
                      onLineStyleChange={setLineStyle}
                      triggerClassName="flex h-9 items-center gap-2.5 rounded-md border border-[#363a45] bg-[#181c27] px-2.5 transition-colors hover:border-[#4c5265]"
                      renderTriggerContent={(hex) => (
                        <>
                          <span
                            className="h-5 w-5 rounded border border-white/15"
                            style={{ backgroundColor: hex }}
                          />
                          <StrokePreviewLine color={hex} width={lineWidth} style={lineStyle} />
                        </>
                      )}
                    />
                  </div>
                </div>

                {/* Middle line row (Rectangle / Channel) */}
                {supportsMiddleLine && (
                  <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2.5 text-[#d1d4dc]">
                      <input
                        type="checkbox"
                        checked={showMiddleLine}
                        onChange={(e) => setShowMiddleLine(e.target.checked)}
                        className="h-4 w-4 rounded border-[#363a45] bg-[#181c27] accent-[#f0f3fa]"
                      />
                      <span>Middle line</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <ColorPickerButton
                        ariaLabel="Middle line style"
                        value={middleLineColor}
                        onChange={(hex) => {
                          if (!showMiddleLine) setShowMiddleLine(true);
                          setMiddleLineColor(hex);
                        }}
                        lineStyle={middleLineStyle}
                        onLineStyleChange={(s) => {
                          if (!showMiddleLine) setShowMiddleLine(true);
                          setMiddleLineStyle(s);
                        }}
                        triggerClassName={`flex h-9 items-center gap-2.5 rounded-md border border-[#363a45] bg-[#181c27] px-2.5 transition-colors hover:border-[#4c5265] ${
                          showMiddleLine ? "opacity-100" : "opacity-60"
                        }`}
                        renderTriggerContent={(hex) => (
                          <>
                            <span
                              className="h-5 w-5 rounded border border-white/15"
                              style={{ backgroundColor: hex }}
                            />
                            <StrokePreviewLine
                              color={hex}
                              width={1.5}
                              style={middleLineStyle}
                            />
                          </>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* Background row */}
                {supportsFill && (
                  <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2.5 text-[#d1d4dc]">
                      <input
                        type="checkbox"
                        checked={fillEnabled}
                        onChange={(e) => setFillEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-[#363a45] bg-[#181c27] accent-[#f0f3fa]"
                      />
                      <span>Background</span>
                    </label>
                    <div className="flex items-center gap-2.5">
                      <ColorPickerButton
                        ariaLabel="Background fill color"
                        value={fillColor}
                        opacity={fillOpacity}
                        onChange={(hex) => {
                          if (!fillEnabled) setFillEnabled(true);
                          setFillColor(hex);
                        }}
                        onOpacityChange={(op) => {
                          if (!fillEnabled) setFillEnabled(true);
                          setFillOpacity(op);
                        }}
                        triggerClassName={`flex h-9 w-9 items-center justify-center rounded-md border border-[#363a45] bg-[#181c27] p-1.5 transition-colors hover:border-[#4c5265] ${
                          fillEnabled ? "opacity-100" : "opacity-50"
                        }`}
                      />
                      <span className="font-mono text-[11px] text-[#787b86]">
                        {fillEnabled ? `${Math.round(fillOpacity * 100)}%` : "Off"}
                      </span>
                    </div>
                  </div>
                )}

                {isPositionTool && (
                  <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3">
                    <label htmlFor="drw-rr" className="text-[#d1d4dc]">
                      Risk / Reward
                    </label>
                    <input
                      id="drw-rr"
                      type="number"
                      min={0.25}
                      max={20}
                      step={0.25}
                      value={rrRatio}
                      onChange={(e) => {
                        const parsed = Number.parseFloat(e.target.value);
                        if (Number.isFinite(parsed) && parsed > 0) setRrRatio(parsed);
                      }}
                      className="h-9 w-28 rounded-md border border-[#363a45] bg-[#181c27] px-3 font-mono text-[13px] text-white outline-none focus:border-[#2962ff]"
                    />
                  </div>
                )}

                {isAnchoredVwap && (
                  <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2.5 text-[#d1d4dc]">
                      <input
                        type="checkbox"
                        checked={avwapShowBands}
                        onChange={(e) => setAvwapShowBands(e.target.checked)}
                        className="h-4 w-4 accent-[#f0f3fa]"
                      />
                      <span>±StdDev Bands</span>
                    </label>
                    <input
                      aria-label="Anchored VWAP standard deviation multiplier"
                      type="number"
                      min={0.5}
                      max={4}
                      step={0.5}
                      value={avwapBandMult}
                      disabled={!avwapShowBands}
                      onChange={(e) => {
                        const parsed = Number.parseFloat(e.target.value);
                        if (Number.isFinite(parsed) && parsed > 0) setAvwapBandMult(parsed);
                      }}
                      className="h-9 w-24 rounded-md border border-[#363a45] bg-[#181c27] px-3 font-mono text-[13px] text-white outline-none focus:border-[#2962ff] disabled:opacity-40"
                    />
                  </div>
                )}

                <div className="pt-1">
                  <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#9aa1b2] hover:text-[#d1d4dc]">
                    <input
                      type="checkbox"
                      checked={locked}
                      onChange={(e) => setLocked(e.target.checked)}
                      className="h-4 w-4 rounded border-[#363a45] bg-[#181c27] accent-[#f0f3fa]"
                    />
                    <span>Lock position</span>
                  </label>
                </div>
              </div>
            )}
          </TabsPanel>

          {/* TEXT TAB */}
          {!isVolumeProfile && (
            <TabsPanel value="text" className="space-y-4 px-5 py-5 text-[13px]">
              <div className="space-y-1.5">
                <label htmlFor="drw-label" className="block text-[#d1d4dc]">
                  Label / Annotation Text
                </label>
                <textarea
                  id="drw-label"
                  rows={3}
                  placeholder="Add text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full resize-none rounded-md border border-[#363a45] bg-[#181c27] px-3 py-2 text-[13px] text-[#f0f3fa] placeholder-[#5d606b] outline-none focus:border-[#2962ff]"
                />
              </div>

              <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3">
                <label htmlFor="drw-font-size" className="text-[#d1d4dc]">
                  Text
                </label>
                <div className="flex items-center gap-2">
                  <ColorPickerButton
                    ariaLabel="Drawing text color"
                    value={textColor}
                    onChange={setTextColor}
                    triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#363a45] bg-[#181c27] p-1.5 transition-colors hover:border-[#4c5265]"
                  />
                  <select
                    id="drw-font-size"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="h-9 w-24 rounded-md border border-[#363a45] bg-[#181c27] px-2.5 text-[13px] text-[#f0f3fa] outline-none focus:border-[#2962ff]"
                  >
                    {[10, 11, 12, 14, 16, 18, 20, 24].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </TabsPanel>
          )}

          {/* COORDINATES TAB — Clean, overflow-free TradingView grid */}
          <TabsPanel value="coordinates" className="max-h-[280px] space-y-3 overflow-y-auto px-5 py-5 text-[13px]">
            <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1.35fr)] items-center gap-2.5 text-[11px] font-medium uppercase tracking-wider text-[#787b86]">
              <span />
              <span>Price</span>
              <span>Date / Time</span>
            </div>
            {drawing.anchors.slice(0, 8).map((_, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1.35fr)] items-center gap-2.5"
              >
                <span className="font-mono text-[12px] text-[#9aa1b2]">#{idx + 1}</span>
                <input
                  aria-label={`Point ${idx + 1} price`}
                  type="number"
                  step={tickFloat}
                  value={anchorPrices[idx] ?? ""}
                  onChange={(e) => {
                    const next = [...anchorPrices];
                    next[idx] = e.target.value;
                    setAnchorPrices(next);
                  }}
                  className="h-9 w-full min-w-0 rounded-md border border-[#363a45] bg-[#181c27] px-2.5 font-mono text-[12px] text-[#f0f3fa] outline-none focus:border-[#2962ff]"
                />
                <input
                  aria-label={`Point ${idx + 1} date and time`}
                  type="datetime-local"
                  value={unixSecToDateTimeLocal(anchorTimes[idx] ?? 0)}
                  onChange={(e) => {
                    const next = [...anchorTimes];
                    next[idx] = dateTimeLocalToUnixSec(e.target.value, anchorTimes[idx] ?? 0);
                    setAnchorTimes(next);
                  }}
                  className="h-9 w-full min-w-0 rounded-md border border-[#363a45] bg-[#181c27] px-2 font-mono text-[11px] text-[#f0f3fa] outline-none focus:border-[#2962ff]"
                />
              </div>
            ))}
          </TabsPanel>

          {/* VISIBILITY TAB — Simple TradingView checkbox rows */}
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
                  checked={visibility[key]}
                  onChange={(e) =>
                    setVisibility({ ...visibility, [key]: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[#363a45] bg-[#181c27] accent-[#f0f3fa]"
                />
                <span>{desc}</span>
              </label>
            ))}
          </TabsPanel>
        </Tabs>

        {/* Clean TradingView Footer */}
        <div className="flex items-center justify-between border-t border-[#2a2e39] px-5 py-3.5">
          <TvTemplateMenu
            onReset={handleReset}
            extraActionLabel={
              isVolumeProfile
                ? savedDefaultFlash
                  ? "Saved as default"
                  : "Save as default"
                : undefined
            }
            onExtraAction={
              isVolumeProfile
                ? () => {
                    saveStoredVpDefaults(vpConfig);
                    setSavedDefaultFlash(true);
                  }
                : undefined
            }
          />
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
              className="h-8 rounded-md bg-[#2962ff] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1e53e5]"
            >
              OK
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface DrawingQuickStyleBarProps {
  drawing: DrawingObject;
  onUpdate: (patch: Partial<Omit<DrawingObject, "id" | "kind" | "symbol">>) => void;
  onOpenSettings: () => void;
  onDelete: () => void;
}

export function DrawingQuickStyleBar({
  drawing,
  onUpdate,
  onOpenSettings,
  onDelete,
}: DrawingQuickStyleBarProps) {
  const currentWidth = drawing.lineWidth ?? 2;
  const currentStyle = drawing.lineStyle ?? "solid";
  const meta = getDrawingToolMeta(drawing.kind);
  const isVolumeProfile =
    drawing.kind === "fixed_range_vp" || drawing.kind === "anchored_vp";
  const vpCfg = isVolumeProfile ? cloneVpConfig(drawing.vpConfig) : null;

  return (
    <div
      data-testid="drawing-quick-style-bar"
      role="toolbar"
      aria-label={`Quick style toolbar for ${meta.label}`}
      className="pointer-events-auto absolute right-20 top-2 z-30 flex items-center gap-1 rounded-md border border-[#2a2e39] bg-[#1e222d]/95 px-2 py-1 text-[11px] text-[#d1d4dc] shadow-xl backdrop-blur-sm"
    >
      <span className="max-w-[110px] truncate pr-1 text-[11px] font-medium text-[#787b86]">
        {meta.shortLabel}
      </span>
      <span className="h-4 w-px bg-[#2a2e39]" />

      {isVolumeProfile && vpCfg ? (
        <>
          <button
            type="button"
            title="Toggle Extend Right (VAH / VAL / POC)"
            onClick={() =>
              onUpdate({
                extendRight: !vpCfg.extendRight,
                vpConfig: { ...vpCfg, extendRight: !vpCfg.extendRight },
              })
            }
            className={`flex h-6 items-center rounded px-1.5 text-[11px] hover:bg-[#2a2e39] ${
              vpCfg.extendRight ? "text-[#2962ff]" : "text-[#d1d4dc] hover:text-white"
            }`}
          >
            Extend →
          </button>
          <button
            type="button"
            title="Flip profile placement (Left / Right)"
            onClick={() =>
              onUpdate({
                vpConfig: {
                  ...vpCfg,
                  placement: vpCfg.placement === "left" ? "right" : "left",
                },
              })
            }
            className="flex h-6 items-center rounded px-1.5 capitalize text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
          >
            {vpCfg.placement}
          </button>
          <button
            type="button"
            title="Toggle HVN / LVN highlighting"
            onClick={() =>
              onUpdate({
                vpConfig: { ...vpCfg, showHvnLvn: !vpCfg.showHvnLvn },
              })
            }
            className={`flex h-6 items-center rounded px-1.5 text-[11px] hover:bg-[#2a2e39] ${
              vpCfg.showHvnLvn ? "text-[#2962ff]" : "text-[#d1d4dc] hover:text-white"
            }`}
          >
            HVN/LVN
          </button>
        </>
      ) : (
        <>
          {/* Color Swatch Popover */}
          <ColorPickerButton
            ariaLabel="Drawing quick color"
            value={drawing.color}
            onChange={(hex) => onUpdate({ color: hex, fillColor: hex })}
            triggerClassName="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2a2e39]"
            renderTriggerContent={(hex) => (
              <span
                className="h-3.5 w-3.5 rounded-sm border border-white/25"
                style={{ backgroundColor: hex }}
              />
            )}
          />

          {/* Line Width Cycle */}
          <button
            type="button"
            title="Cycle line width"
            aria-label={`Line width ${currentWidth}px`}
            onClick={() =>
              onUpdate({
                lineWidth: ((currentWidth % 4) + 1) as 1 | 2 | 3 | 4,
              })
            }
            className="flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[11px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
          >
            {currentWidth}px
          </button>

          {/* Line Style Cycle */}
          <button
            type="button"
            title="Cycle line style (Solid / Dashed / Dotted)"
            aria-label={`Line style ${currentStyle}`}
            onClick={() => {
              const order: DrawingLineStyle[] = ["solid", "dashed", "dotted"];
              const next = order[(order.indexOf(currentStyle) + 1) % order.length];
              onUpdate({ lineStyle: next });
            }}
            className="flex h-6 items-center rounded px-1.5 capitalize text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
          >
            {currentStyle}
          </button>
        </>
      )}

      <span className="h-4 w-px bg-[#2a2e39]" />

      {/* Full Settings Modal */}
      <button
        type="button"
        title="Drawing settings"
        aria-label="Open drawing settings"
        onClick={onOpenSettings}
        className="flex h-6 w-6 items-center justify-center rounded text-[#9aa1b2] hover:bg-[#2a2e39] hover:text-white"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 2.2v1.3M8 12.5v1.3M2.2 8h1.3M12.5 8h1.3M3.9 3.9l.9.9M11.2 11.2l.9.9M12.1 3.9l-.9.9M4.8 11.2l-.9.9" />
        </svg>
      </button>

      {/* Lock Toggle */}
      <button
        type="button"
        title={drawing.locked ? "Unlock drawing" : "Lock drawing"}
        aria-label={drawing.locked ? "Unlock drawing" : "Lock drawing"}
        onClick={() => onUpdate({ locked: !drawing.locked })}
        className={`flex h-6 w-6 items-center justify-center rounded hover:bg-[#2a2e39] ${
          drawing.locked ? "text-[#2962ff]" : "text-[#9aa1b2] hover:text-white"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
          {drawing.locked ? (
            <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
          ) : (
            <path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.8-1" />
          )}
        </svg>
      </button>

      {/* Delete */}
      <button
        type="button"
        title="Remove drawing (Delete)"
        aria-label="Remove selected drawing"
        onClick={onDelete}
        className="flex h-6 w-6 items-center justify-center rounded text-[#9aa1b2] hover:bg-[#2a2e39] hover:text-[#f23645]"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M3 4.5h10M6 4.5V3h4v1.5M5 4.5l.6 8.5h4.8L11 4.5" />
        </svg>
      </button>
    </div>
  );
}
