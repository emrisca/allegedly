import { TimeframeVisibilityControls } from "./indicator-settings-dialog";
import { formatFixedE9 } from "@allegedly/ipc-client";
import {
  DEFAULT_POSITION_SETTINGS,
  POSITION_STAT_OPTIONS,
  positionDecimalE9,
  positionDistances,
  resolvePositionStatsFields,
  savePositionTemplate,
  type PositionStatField,
} from "../drawings/position-settings";
import { useEffect, useRef, useState } from "react";
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
import { ColorPickerButton, SettingsCogIcon, UiInput, UiSelect, UiSwitch } from "@allegedly/ui-chrome";
import {
  DEFAULT_DRAWING_VISIBILITY,
  getDrawingToolMeta,
  type AnchorPoint,
  type DrawingLineStyle,
  type DrawingObject,
} from "../drawings/drawing-engine";
import {
  cloneAvpConfig,
  cloneVpConfig,
  DEFAULT_ANCHORED_VP_CONFIG,
  DEFAULT_VOLUME_PROFILE_CONFIG,
  saveStoredAvpDefaults,
  saveStoredVpDefaults,
  type VolumeProfileConfig,
  type VpLineStyle,
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
  showExtendRight = true,
}: {
  cfg: VolumeProfileConfig;
  onChange: (patch: Partial<VolumeProfileConfig>) => void;
  showExtendRight?: boolean;
}) {
  return (
    <div className="space-y-3.5 px-5 py-4 text-[12px]">
      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-rows-layout" className="text-[#b2b5be]">
          Rows Layout
        </label>
        <UiSelect
          id="vp-rows-layout"
          value={cfg.rowsLayout}
          onChange={(e) => onChange({ rowsLayout: e.target.value as VpRowsLayout })}
          className="h-8 rounded border border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2.5 text-[12px] text-white outline-none focus:border-white/30"
        >
          <option value="number_of_rows">Number Of Rows</option>
          <option value="ticks_per_row">Ticks Per Row</option>
        </UiSelect>
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
          className="h-8 w-full rounded border border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2.5 font-mono text-[12px] text-white outline-none focus:border-white/30"
        />
      </div>

      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-volume-mode" className="text-[#b2b5be]">
          Volume
        </label>
        <UiSelect
          id="vp-volume-mode"
          value={cfg.volumeMode}
          onChange={(e) => onChange({ volumeMode: e.target.value as VpVolumeMode })}
          className="h-8 rounded border border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2.5 text-[12px] text-white outline-none focus:border-white/30"
        >
          <option value="up_down">Up/Down</option>
          <option value="total">Total</option>
          <option value="delta">Delta</option>
        </UiSelect>
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
            className="h-8 w-full rounded border border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2.5 font-mono text-[12px] text-white outline-none focus:border-white/30"
          />
          <span className="font-mono text-[11px] text-[#787b86]">%</span>
        </div>
      </div>

      {showExtendRight && (
        <div className="border-t border-[#2a2e39] pt-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[#d1d4dc]">
            <input
              type="checkbox"
              checked={cfg.extendRight}
              onChange={(e) => onChange({ extendRight: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#e4e4e7]"
            />
            <span>Extend right</span>
          </label>
        </div>
      )}
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
            className="h-3.5 w-3.5 accent-[#e4e4e7]"
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
          className="h-1.5 flex-1 accent-[#e4e4e7]"
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
  lineStyle,
  onCheckedChange,
  onColorChange,
  onWidthChange,
  onLineStyleChange,
}: {
  label: string;
  checked: boolean;
  color: string;
  width?: 1 | 2 | 3 | 4;
  lineStyle?: VpLineStyle;
  onCheckedChange: (v: boolean) => void;
  onColorChange: (hex: string) => void;
  onWidthChange?: (w: 1 | 2 | 3 | 4) => void;
  onLineStyleChange?: (s: VpLineStyle) => void;
}) {
  return (
    <div className="grid grid-cols-[155px_1fr] items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-[#d1d4dc]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-[#e4e4e7]"
        />
        <span>{label}</span>
      </label>
      <div className="flex items-center gap-2">
        <ColorPickerButton
          ariaLabel={`${label} color`}
          value={color}
          onChange={onColorChange}
          lineWidth={width}
          onLineWidthChange={onWidthChange}
          lineStyle={lineStyle}
          onLineStyleChange={onLineStyleChange}
          triggerClassName="flex h-8 items-center gap-2 rounded-md border border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2 transition-colors hover:border-[#4c5265]"
          renderTriggerContent={(hex) => (
            <>
              <span
                className="h-4 w-4 rounded-sm border border-white/15"
                style={{ backgroundColor: hex }}
              />
              <StrokePreviewLine color={hex} width={width ?? 1} style={lineStyle ?? "solid"} />
            </>
          )}
        />
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
      <div className="space-y-2 pb-1">
        <label className="flex cursor-pointer items-center gap-2 text-[#d1d4dc]">
          <input
            type="checkbox"
            checked={cfg.showProfile}
            onChange={(e) => onChange({ showProfile: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#e4e4e7]"
          />
          <span>Volume profile</span>
        </label>
        <div className="grid grid-cols-[155px_1fr] items-center gap-3 pl-4">
          <label className="flex cursor-pointer items-center gap-2 text-[#d1d4dc]">
            <input
              type="checkbox"
              checked={cfg.showValues}
              onChange={(e) => onChange({ showValues: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#e4e4e7]"
            />
            <span>Values</span>
          </label>
          <ColorPickerButton
            ariaLabel="Values text color"
            value={cfg.valuesColor || "#d1d4dc"}
            onChange={(valuesColor) => onChange({ valuesColor })}
          />
        </div>
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
          className="h-8 w-full rounded border border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2.5 font-mono text-[12px] text-white outline-none focus:border-white/30"
        />
      </div>

      <div className="grid grid-cols-[155px_1fr] items-center gap-3">
        <label htmlFor="vp-placement" className="text-[#b2b5be]">
          Placement
        </label>
        <UiSelect
          id="vp-placement"
          value={cfg.placement}
          onChange={(e) => onChange({ placement: e.target.value as VpPlacement })}
          className="h-8 rounded border border-[var(--app-border,#2a2e39)] bg-[var(--app-chrome-bg,#131722)] px-2.5 text-[12px] text-white outline-none focus:border-white/30"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </UiSelect>
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
          lineStyle={cfg.vahLineStyle}
          onCheckedChange={(showVah) => onChange({ showVah })}
          onColorChange={(vahColor) => onChange({ vahColor })}
          onWidthChange={(vahWidth) => onChange({ vahWidth })}
          onLineStyleChange={(vahLineStyle) => onChange({ vahLineStyle })}
        />
        <VpLineRow
          label="VAL"
          checked={cfg.showVal}
          color={cfg.valColor}
          width={cfg.valWidth}
          lineStyle={cfg.valLineStyle}
          onCheckedChange={(showVal) => onChange({ showVal })}
          onColorChange={(valColor) => onChange({ valColor })}
          onWidthChange={(valWidth) => onChange({ valWidth })}
          onLineStyleChange={(valLineStyle) => onChange({ valLineStyle })}
        />
        <VpLineRow
          label="POC"
          checked={cfg.showPoc}
          color={cfg.pocColor}
          width={cfg.pocWidth}
          lineStyle={cfg.pocLineStyle}
          onCheckedChange={(showPoc) => onChange({ showPoc })}
          onColorChange={(pocColor) => onChange({ pocColor })}
          onWidthChange={(pocWidth) => onChange({ pocWidth })}
          onLineStyleChange={(pocLineStyle) => onChange({ pocLineStyle })}
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
            checked={cfg.showPriceScaleLabels}
            onChange={(e) => onChange({ showPriceScaleLabels: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#e4e4e7]"
          />
          <span>Labels on price scale</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-[#d1d4dc]">
          <input
            type="checkbox"
            checked={cfg.showHvnLvn}
            onChange={(e) => onChange({ showHvnLvn: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#e4e4e7]"
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
      className="flex h-7 w-7 items-center justify-center rounded-md text-[#868993] transition-colors hover:bg-white/[0.06] hover:text-[#f0f3fa]"
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
        className="flex h-8 items-center gap-1.5 rounded-md border border-[#363a45] bg-transparent px-3 text-[12px] font-medium text-[#d1d4dc] transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <span>Template</span>
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 text-[#787b86]" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-44 rounded-lg border border-[#363a45] bg-[#1e222d] py-1 shadow-[0_20px_50px_rgba(0,0,0,0.65)]">
          <button
            type="button"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
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
              className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
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
    <Dialog open={open} onOpenChange={onOpenChange} closeOnOutsidePress={false}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <DialogContent
        aria-label={`${title} settings`}
        className="fixed left-1/2 top-1/2 z-50 flex w-[440px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] border border-white/[0.10] bg-[var(--app-surface-bg,#1e222d)] text-[#d1d4dc] shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
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
          </TabsList>

          <TabsPanel value="inputs">
            <VpInputsPanel cfg={draft} onChange={patchDraft} />
          </TabsPanel>
          <TabsPanel value="style">
            <VpStylePanel cfg={draft} onChange={patchDraft} />
          </TabsPanel>
        </Tabs>

        <div className="flex shrink-0 items-center justify-between border-t border-[#2a2e39] px-5 py-3.5">
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
              className="h-8 rounded-md border border-[#363a45] bg-transparent px-4 text-[13px] font-medium text-[#d1d4dc] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(cloneVpConfig(draft));
                onOpenChange(false);
              }}
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

function PositionStatsMultiSelect({
  selected,
  onChange,
}: {
  selected: PositionStatField[];
  onChange: (next: PositionStatField[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const selectedSet = new Set(selected);
  const summaryText =
    selected.length === 0
      ? "None"
      : POSITION_STAT_OPTIONS.filter((o) => selectedSet.has(o.id))
          .map((o) => o.label)
          .join(", ");

  const toggleField = (id: PositionStatField) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(POSITION_STAT_OPTIONS.map((o) => o.id).filter((fid) => next.has(fid)));
  };

  return (
    <div ref={containerRef} className="relative w-52">
      <button
        type="button"
        aria-label="Position stats"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-[var(--app-border,#2a2e39)] bg-[#111318] px-2.5 text-left text-[12px] text-[#f0f3fa] transition-colors hover:border-[#4c5265] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent,#2962ff)]"
      >
        <span className="min-w-0 truncate">{summaryText}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3.5 w-3.5 shrink-0 text-[#868993] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Position stats options"
          className="absolute bottom-full right-0 z-50 mb-1.5 max-h-72 w-56 overflow-y-auto rounded-lg border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
        >
          {POSITION_STAT_OPTIONS.map((opt) => {
            const checked = selectedSet.has(opt.id);
            return (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] text-[#e6e8ee] transition-colors hover:bg-white/[0.06]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(opt.id)}
                  className="h-3.5 w-3.5 rounded border-[#4c5265] bg-[#111318] accent-[var(--app-accent,#2962ff)]"
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface DrawingSettingsDialogProps {
  open: boolean;
  drawing: DrawingObject | null;
  tickSizeE9: bigint;
  decimals: number;
  barTimes?: readonly number[];
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: Partial<Omit<DrawingObject, "id" | "kind" | "symbol">>) => void;
}

export function DrawingSettingsDialog({
  open,
  drawing,
  tickSizeE9,
  decimals,
  barTimes,
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
  const [position, setPosition] = useState(DEFAULT_POSITION_SETTINGS);
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
    setVpConfig(drawing.kind === "anchored_vp" ? cloneAvpConfig(drawing.vpConfig) : cloneVpConfig(drawing.vpConfig));
    setAvwapShowBands(drawing.avwapShowBands !== false);
    setAvwapBandMult(drawing.avwapBandMult ?? 1);
    setRrRatio(drawing.rrRatio ?? 2);
    setPosition({ ...DEFAULT_POSITION_SETTINGS, ...drawing.position, statsFields: resolvePositionStatsFields(drawing.position) });
    setSavedDefaultFlash(false);
  }, [open, drawing, tickFloat, decimals]);

  if (!drawing) return null;

  const meta = getDrawingToolMeta(drawing.kind);
  const isAnchoredVp = drawing.kind === "anchored_vp";
  const isVolumeProfile =
    drawing.kind === "fixed_range_vp" || isAnchoredVp;
  const isAnchoredVwap = drawing.kind === "anchored_vwap";
  const isPositionTool =
    drawing.kind === "long_position" ||
    drawing.kind === "short_position" ||
    drawing.kind === "position_forecast";
  const isTradePosition = drawing.kind === "long_position" || drawing.kind === "short_position";
  const direction = drawing.kind === "short_position" ? -1n : 1n;
  const toTicks = (value: string) => (positionDecimalE9(value) + tickSizeE9 / 2n) / tickSizeE9;
  const entry = toTicks(anchorPrices[0] ?? "");
  const target = toTicks(anchorPrices[1] ?? "");
  const distances = positionDistances(entry, target, position, rrRatio);
  const priceText = (ticks: bigint) => formatFixedE9(ticks * tickSizeE9, Math.max(decimals, (tickSizeE9 % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "").length));
  const positionRow = (label: string, control: React.ReactNode) =>
    <div className="flex min-h-8 items-center justify-between gap-3"><span>{label}</span>{control}</div>;
  const changeAnchorPrice = (index: number, value: string) =>
    setAnchorPrices((prices) => prices.map((price, i) => i === index ? value : price));
  const isRectangle = drawing.kind === "box_zone" || drawing.kind === "rotated_rectangle";
  const supportsMiddleLine =
    drawing.kind === "box_zone" || drawing.kind === "fib_channel";
  const supportsFill =
    drawing.kind === "box_zone" ||
    drawing.kind === "rotated_rectangle" ||
    drawing.kind === "ellipse" ||
    drawing.kind === "triangle" ||
    drawing.kind === "fib_channel" ||
    drawing.kind === "fib_retracement";
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
      const exactPositionPrice = isTradePosition ? toTicks(anchorPrices[idx] ?? "") : 0n;
      const priceTick = isTradePosition ? (exactPositionPrice > 0n ? exactPositionPrice : orig.priceTick) :
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
      ...(isVolumeProfile ? { vpConfig: isAnchoredVp ? cloneAvpConfig(vpConfig) : cloneVpConfig(vpConfig) } : {}),
      ...(isAnchoredVwap ? { avwapShowBands, avwapBandMult } : {}),
      ...(isPositionTool ? { rrRatio } : {}),
      ...(isTradePosition ? { position } : {}),
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
    if (isVolumeProfile) setVpConfig(isAnchoredVp ? cloneAvpConfig(DEFAULT_ANCHORED_VP_CONFIG) : cloneVpConfig(DEFAULT_VOLUME_PROFILE_CONFIG));
    if (isAnchoredVwap) {
      setAvwapShowBands(true);
      setAvwapBandMult(1);
    }
    if (isPositionTool) setRrRatio(2);
    if (isTradePosition) setPosition(DEFAULT_POSITION_SETTINGS);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} closeOnOutsidePress={false}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <DialogContent
        aria-label={`${meta.label} settings`}
        className="fixed left-1/2 top-1/2 z-50 flex w-[440px] max-w-[94vw] max-h-[92vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] border border-white/[0.10] bg-[var(--app-surface-bg,#1e222d)] text-[#d1d4dc] shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
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
                className="h-7 w-48 rounded border border-white/30 bg-[#0d0f14] px-2 text-[15px] font-semibold text-white outline-none"
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
                  className="flex h-6 w-6 items-center justify-center rounded text-[#868993] transition-colors hover:bg-white/[0.06] hover:text-white"
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
          defaultValue={isVolumeProfile || isTradePosition ? "inputs" : "style"}
          className="flex min-h-0 flex-col overflow-y-auto"
        >
          <TabsList className="flex gap-5 border-b border-[#2a2e39] px-5">
            {(isVolumeProfile || isTradePosition) && (
              <TabsTab
                value="inputs"
                className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
              >
                Inputs
              </TabsTab>
            )}
            <TabsTab
              value="style"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
            >
              Style
            </TabsTab>
            {!isVolumeProfile && (
              <TabsTab
                value="text"
                className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
              >
                Text
              </TabsTab>
            )}
            <TabsTab
              value="coordinates"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
            >
              Coordinates
            </TabsTab>
            <TabsTab
              value="visibility"
              className="border-b-2 border-transparent pb-2.5 pt-1 text-[13px] font-medium text-[#868993] transition-colors hover:text-[#f0f3fa] data-[selected]:border-[#f4f4f5] data-[selected]:text-white"
            >
              Visibility
            </TabsTab>
          </TabsList>

          {isTradePosition && (
            <TabsPanel value="inputs" className="space-y-2 px-5 py-4 text-[13px]">
              {(["accountSize", "lotSize", "risk", "leverage"] as const).map((key) => {
                const labels = { accountSize: "Account size", lotSize: "Lot size", risk: "Risk", leverage: "Leverage" };
                return <div key={key}>{positionRow(labels[key], <div className="flex items-center gap-1.5">
                  <UiInput aria-label={labels[key]} type="number" min={0} step="any" className="max-w-28"
                    value={position[key]} onChange={(e) => setPosition({ ...position, [key]: e.target.value })} />
                  {key === "accountSize" && <span className="text-xs">USD</span>}
                  {key === "risk" && <UiSelect aria-label="Risk unit" value={position.riskUnit}
                    onChange={(e) => setPosition({ ...position, riskUnit: e.target.value as "USD" | "%" })}>
                    <option value="USD">USD</option><option value="%">%</option>
                  </UiSelect>}
                </div>)}</div>;
              })}
              {positionRow("Entry price", <UiInput aria-label="Entry price" className="max-w-32" type="number" step={tickFloat}
                value={anchorPrices[0] ?? ""} onChange={(e) => changeAnchorPrice(0, e.target.value)} />)}
              <div className="border-t border-[var(--app-border,#2a2e39)] pt-2">Profit level</div>
              {positionRow("Ticks", <UiInput aria-label="Profit level ticks" className="max-w-32" type="number" min={1} value={String(distances.targetTicks)}
                onChange={(e) => { if (/^\d{1,24}$/.test(e.target.value)) changeAnchorPrice(1, priceText(entry + direction * BigInt(e.target.value))); }} />)}
              {positionRow("Price", <UiInput aria-label="Profit level price" className="max-w-32" type="number" step={tickFloat}
                value={anchorPrices[1] ?? ""} onChange={(e) => changeAnchorPrice(1, e.target.value)} />)}
              <div className="border-t border-[var(--app-border,#2a2e39)] pt-2">Stop level</div>
              {positionRow("Ticks", <UiInput aria-label="Stop level ticks" className="max-w-32" type="number" min={1} value={position.stopTicks || String(distances.stopTicks)}
                onChange={(e) => setPosition({ ...position, stopTicks: e.target.value })} />)}
              {positionRow("Price", <UiInput aria-label="Stop level price" className="max-w-32" key={`stop-${entry}-${distances.stopTicks}`}
                defaultValue={priceText(entry - direction * distances.stopTicks)} type="number" step={tickFloat} onBlur={(e) => {
                  const price = toTicks(e.target.value);
                  const distance = direction * (entry - price);
                  if (price > 0n && distance > 0n) setPosition({ ...position, stopTicks: String(distance) });
                }} />)}
              {positionRow("Quantity precision", <UiSelect aria-label="Quantity precision" value={position.quantityPrecision}
                onChange={(e) => setPosition({ ...position, quantityPrecision: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value} decimals</option>)}
              </UiSelect>)}
            </TabsPanel>
          )}
          {isVolumeProfile && (
            <TabsPanel value="inputs">
              <VpInputsPanel
                cfg={vpConfig}
                showExtendRight={!isAnchoredVp}
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
                    <UiSelect
                      id="drw-extend"
                      value={extendMode}
                      onChange={(e) => handleExtendModeChange(e.target.value)}
                      className="h-9 w-full rounded-md border border-[#363a45] bg-[#181c27] px-3 text-[13px] text-[#f0f3fa] outline-none transition-colors hover:border-[#4c5265] focus:border-white/30"
                    >
                      <option value="none">None</option>
                      <option value="left">Extend left</option>
                      <option value="right">Extend right</option>
                      <option value="both">Extend both</option>
                    </UiSelect>
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

                {isTradePosition && <div className="space-y-2">
                  {(["stop", "target"] as const).map((zone) => <div key={zone}>
                    {positionRow(zone === "stop" ? "Stop color" : "Target color", <ColorPickerButton ariaLabel={`${zone} zone color`}
                      value={position[`${zone}Color`]} opacity={position[`${zone}Opacity`]}
                      onChange={(color) => setPosition({ ...position, [`${zone}Color`]: color })}
                      onOpacityChange={(opacity) => setPosition({ ...position, [`${zone}Opacity`]: opacity })} />)}
                  </div>)}
                  {positionRow("Text", <div className="flex gap-2">
                    <ColorPickerButton ariaLabel="Position text color" value={textColor} onChange={setTextColor} />
                    <UiSelect aria-label="Position font size" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
                      {[10, 11, 12, 14, 16, 18, 20, 24].map((size) => <option key={size} value={size}>{size}</option>)}
                    </UiSelect>
                  </div>)}
                  {positionRow("Price labels", <UiSwitch aria-label="Price labels" checked={position.priceLabels}
                    onCheckedChange={(checked) => setPosition({ ...position, priceLabels: checked })} />)}
                  <div className="border-t border-[var(--app-border,#2a2e39)] pt-2 text-[11px] font-medium uppercase tracking-wider text-[#787b86]">
                    Info
                  </div>
                  {positionRow("Stats", <PositionStatsMultiSelect
                    selected={resolvePositionStatsFields(position)}
                    onChange={(statsFields) =>
                      setPosition({
                        ...position,
                        statsFields,
                        stats: statsFields.length === 0 ? "none" : "summary",
                      })
                    }
                  />)}
                  {(["compact", "alwaysShowStats"] as const).map((key) => {
                    const labels = { compact: "Compact stats", alwaysShowStats: "Always show stats" };
                    return <div key={key}>{positionRow(labels[key], <UiSwitch aria-label={labels[key]} checked={position[key]}
                      onCheckedChange={(checked) => setPosition({ ...position, [key]: checked })} />)}</div>;
                  })}
                </div>}
                {isPositionTool && !isTradePosition && (
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
                      className="h-9 w-28 rounded-md border border-[#363a45] bg-[#181c27] px-3 font-mono text-[13px] text-white outline-none focus:border-white/30"
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
                      className="h-9 w-24 rounded-md border border-[#363a45] bg-[#181c27] px-3 font-mono text-[13px] text-white outline-none focus:border-white/30 disabled:opacity-40"
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
                  className="w-full resize-none rounded-md border border-[#363a45] bg-[#181c27] px-3 py-2 text-[13px] text-[#f0f3fa] placeholder-[#5d606b] outline-none focus:border-white/30"
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
                  <UiSelect
                    id="drw-font-size"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="h-9 w-24 rounded-md border border-[#363a45] bg-[#181c27] px-2.5 text-[13px] text-[#f0f3fa] outline-none focus:border-white/30"
                  >
                    {[10, 11, 12, 14, 16, 18, 20, 24].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </UiSelect>
                </div>
              </div>
            </TabsPanel>
          )}

          {/* COORDINATES TAB — Clean, overflow-free TradingView grid */}
          <TabsPanel value="coordinates" className="max-h-[280px] space-y-3 overflow-y-auto px-5 py-5 text-[13px]">
            {isAnchoredVp && barTimes && barTimes.length > 0 ? (() => {
              const targetSec = anchorTimes[0] ?? 0;
              let nearestIdx = 0;
              let bestDiff = Infinity;
              for (let i = 0; i < barTimes.length; i++) {
                const diff = Math.abs(barTimes[i] - targetSec);
                if (diff < bestDiff) {
                  bestDiff = diff;
                  nearestIdx = i;
                }
              }
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-[110px_140px_minmax(0,1fr)] items-center gap-3">
                    <label htmlFor="avp-bar-index" className="text-[#d1d4dc]">
                      #1 (bar)
                    </label>
                    <UiInput
                      id="avp-bar-index"
                      aria-label="Anchor bar index"
                      type="number"
                      min={0}
                      max={Math.max(0, barTimes.length - 1)}
                      value={nearestIdx}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(parsed)) {
                          const clamped = Math.max(0, Math.min(barTimes.length - 1, parsed));
                          setAnchorTimes([barTimes[clamped]]);
                        }
                      }}
                    />
                    <span className="truncate font-mono text-[11px] text-[#787b86]">
                      {unixSecToDateTimeLocal(anchorTimes[0] ?? 0).replace("T", " ")}
                    </span>
                  </div>
                </div>
              );
            })() : (
            <>
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
                  className="h-9 w-full min-w-0 rounded-md border border-[#363a45] bg-[#181c27] px-2.5 font-mono text-[12px] text-[#f0f3fa] outline-none focus:border-white/30"
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
                  className="h-9 w-full min-w-0 rounded-md border border-[#363a45] bg-[#181c27] px-2 font-mono text-[11px] text-[#f0f3fa] outline-none focus:border-white/30"
                />
              </div>
            ))}
            </>
            )}
          </TabsPanel>

          {/* VISIBILITY TAB — Simple TradingView checkbox rows */}
          <TabsPanel value="visibility" className="space-y-1.5 px-5 py-4 text-[13px]">
            <TimeframeVisibilityControls visibility={visibility} onChange={setVisibility} />
          </TabsPanel>
        </Tabs>

        {/* Clean TradingView Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-[#2a2e39] px-5 py-3.5">
          <TvTemplateMenu
            onReset={handleReset}
            extraActionLabel={
              isVolumeProfile || isTradePosition
                ? savedDefaultFlash
                  ? "Saved as default"
                  : "Save as default"
                : undefined
            }
            onExtraAction={
              isVolumeProfile
                ? () => {
                    if (isAnchoredVp) saveStoredAvpDefaults(vpConfig);
                    else saveStoredVpDefaults(vpConfig);
                    setSavedDefaultFlash(true);
                  }
                : isTradePosition ? () => {
                    savePositionTemplate(drawing.kind, { position, color, lineStyle, lineWidth, textColor, fontSize });
                    setSavedDefaultFlash(true);
                  } : undefined
            }
          />
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
  const isAnchoredVp = drawing.kind === "anchored_vp";
  const isVolumeProfile =
    drawing.kind === "fixed_range_vp" || isAnchoredVp;
  const vpCfg = isVolumeProfile
    ? (isAnchoredVp ? cloneAvpConfig(drawing.vpConfig) : cloneVpConfig(drawing.vpConfig))
    : null;

  return (
    <div
      data-testid="drawing-quick-style-bar"
      role="toolbar"
      aria-label={`Quick style toolbar for ${meta.label}`}
      className="pointer-events-auto absolute right-20 top-2 z-30 flex items-center gap-1 rounded-md border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#1e222d)]/95 px-2 py-1 text-[11px] text-[#d1d4dc] shadow-xl backdrop-blur-sm"
    >
      <span className="max-w-[110px] truncate pr-1 text-[11px] font-medium text-[#787b86]">
        {meta.shortLabel}
      </span>
      <span className="h-4 w-px bg-white/[0.06]" />

      {isVolumeProfile && vpCfg ? (
        <>
          {!isAnchoredVp && (
            <button
              type="button"
              title="Toggle Extend Right (VAH / VAL / POC)"
              onClick={() =>
                onUpdate({
                  extendRight: !vpCfg.extendRight,
                  vpConfig: { ...vpCfg, extendRight: !vpCfg.extendRight },
                })
              }
              className={`flex h-6 items-center rounded px-1.5 text-[11px] hover:bg-white/[0.06] ${
                vpCfg.extendRight ? "text-[#f4f4f5]" : "text-[#d1d4dc] hover:text-white"
              }`}
            >
              Extend →
            </button>
          )}
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
            className="flex h-6 items-center rounded px-1.5 capitalize text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
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
            className={`flex h-6 items-center rounded px-1.5 text-[11px] hover:bg-white/[0.06] ${
              vpCfg.showHvnLvn ? "text-[#f4f4f5]" : "text-[#d1d4dc] hover:text-white"
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
            triggerClassName="flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.06]"
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
            className="flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[11px] text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
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
            className="flex h-6 items-center rounded px-1.5 capitalize text-[#d1d4dc] hover:bg-white/[0.06] hover:text-white"
          >
            {currentStyle}
          </button>
        </>
      )}

      <span className="h-4 w-px bg-white/[0.06]" />

      {/* Full Settings Modal */}
      <button
        type="button"
        title="Drawing settings"
        aria-label="Open drawing settings"
        onClick={onOpenSettings}
        className="flex h-6 w-6 items-center justify-center rounded text-[#9aa1b2] hover:bg-white/[0.06] hover:text-white"
      >
        <SettingsCogIcon className="h-3.5 w-3.5" />
      </button>

      {/* Lock Toggle */}
      <button
        type="button"
        title={drawing.locked ? "Unlock drawing" : "Lock drawing"}
        aria-label={drawing.locked ? "Unlock drawing" : "Lock drawing"}
        onClick={() => onUpdate({ locked: !drawing.locked })}
        className={`flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.06] ${
          drawing.locked ? "text-[#f4f4f5]" : "text-[#9aa1b2] hover:text-white"
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
        className="flex h-6 w-6 items-center justify-center rounded text-[#9aa1b2] hover:bg-white/[0.06] hover:text-[#f23645]"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M3 4.5h10M6 4.5V3h4v1.5M5 4.5l.6 8.5h4.8L11 4.5" />
        </svg>
      </button>
    </div>
  );
}
