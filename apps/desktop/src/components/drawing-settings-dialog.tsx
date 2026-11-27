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
import {
  DEFAULT_DRAWING_VISIBILITY,
  getDrawingToolMeta,
  type AnchorPoint,
  type DrawingLineStyle,
  type DrawingObject,
} from "../drawings/drawing-engine";

export const DRAWING_PRESET_COLORS = [
  "#2962ff",
  "#38bdf8",
  "#089981",
  "#f23645",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#eab308",
  "#94a3b8",
  "#ffffff",
] as const;

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
  const [extendLeft, setExtendLeft] = useState(false);
  const [extendRight, setExtendRight] = useState(false);
  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState("");
  const [fontSize, setFontSize] = useState(12);
  const [textColor, setTextColor] = useState("#d1d4dc");
  const [anchorPrices, setAnchorPrices] = useState<string[]>([]);
  const [anchorTimes, setAnchorTimes] = useState<number[]>([]);
  const [visibility, setVisibility] = useState({ ...DEFAULT_DRAWING_VISIBILITY });

  const tickFloat = Number(tickSizeE9) / 1e9;

  useEffect(() => {
    if (!open || !drawing) return;
    setColor(drawing.color);
    setLineWidth(drawing.lineWidth ?? 2);
    setLineStyle(drawing.lineStyle ?? "solid");
    setFillColor(drawing.fillColor ?? drawing.color);
    setFillOpacity(drawing.fillOpacity ?? 0.16);
    setExtendLeft(Boolean(drawing.extendLeft));
    setExtendRight(Boolean(drawing.extendRight));
    setLocked(Boolean(drawing.locked));
    setLabel(drawing.label ?? "");
    setFontSize(drawing.fontSize ?? 12);
    setTextColor(drawing.textColor ?? drawing.color);
    setAnchorPrices(
      drawing.anchors.map((a) => (Number(a.priceTick) * tickFloat).toFixed(decimals)),
    );
    setAnchorTimes(drawing.anchors.map((a) => a.timeSec));
    setVisibility({ ...DEFAULT_DRAWING_VISIBILITY, ...(drawing.visibility ?? {}) });
  }, [open, drawing, tickFloat, decimals]);

  if (!drawing) return null;

  const meta = getDrawingToolMeta(drawing.kind);
  const supportsExtend =
    drawing.kind === "trendline" || drawing.kind === "ray" || drawing.kind === "extended_line";
  const supportsFill =
    drawing.kind === "box_zone" ||
    drawing.kind === "circle" ||
    drawing.kind === "ellipse" ||
    drawing.kind === "triangle" ||
    drawing.kind === "fib_retracement" ||
    drawing.kind === "long_position" ||
    drawing.kind === "short_position";

  const handleReset = () => {
    const defColor = meta.defaultColor ?? "#2962ff";
    setColor(defColor);
    setLineWidth(2);
    setLineStyle("solid");
    setFillColor(defColor);
    setFillOpacity(0.16);
    setExtendLeft(false);
    setExtendRight(false);
    setLocked(false);
    setFontSize(12);
    setTextColor(defColor);
    setVisibility({ ...DEFAULT_DRAWING_VISIBILITY });
  };

  const handleSave = () => {
    const nextAnchors: AnchorPoint[] = drawing.anchors.map((orig, idx) => {
      const parsedPrice = Number.parseFloat(anchorPrices[idx] ?? "");
      const priceTick =
        Number.isFinite(parsedPrice) && tickFloat > 0
          ? BigInt(Math.max(1, Math.round(parsedPrice / tickFloat)))
          : orig.priceTick;
      const timeSec =
        typeof anchorTimes[idx] === "number" && Number.isFinite(anchorTimes[idx])
          ? Math.round(anchorTimes[idx])
          : orig.timeSec;
      return { timeSec, priceTick };
    });

    onSave(drawing.id, {
      color,
      lineWidth,
      lineStyle,
      fillColor,
      fillOpacity,
      extendLeft,
      extendRight,
      locked,
      label: label.trim() ? label : undefined,
      fontSize,
      textColor,
      anchors: nextAnchors,
      visibility: { ...visibility },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
      <DialogContent
        aria-label={`Drawing settings for ${meta.label}`}
        className="fixed left-1/2 top-1/2 z-50 flex w-[470px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] text-[#d1d4dc] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#2a2e39] px-5 py-3.5">
          <div>
            <DialogTitle className="text-[15px] font-semibold text-white">
              {meta.label}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[#787b86]">
              Customize drawing style, text label, anchor coordinates, and visibility
            </DialogDescription>
          </div>
          <DialogClose className="flex h-7 w-7 items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white">
            ×
          </DialogClose>
        </div>

        <Tabs defaultValue="style" className="flex flex-col">
          <TabsList className="flex gap-1 border-b border-[#2a2e39] px-5 pt-1">
            <TabsTab
              value="style"
              className="border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[#787b86] hover:text-white data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Style
            </TabsTab>
            <TabsTab
              value="text"
              className="border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[#787b86] hover:text-white data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Text
            </TabsTab>
            <TabsTab
              value="coordinates"
              className="border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[#787b86] hover:text-white data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Coordinates
            </TabsTab>
            <TabsTab
              value="visibility"
              className="border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-[#787b86] hover:text-white data-[selected]:border-[#2962ff] data-[selected]:text-white"
            >
              Visibility
            </TabsTab>
          </TabsList>

          <TabsPanel value="style" className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-[120px_1fr] items-start gap-3">
              <span className="pt-1 text-[12px] text-[#b2b5be]">Line Color</span>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Drawing stroke color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border border-[#2a2e39] bg-[#131722]"
                  />
                  <span className="font-mono text-[11px] uppercase text-[#9aa1b2]">{color}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DRAWING_PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Select drawing color ${hex}`}
                      onClick={() => setColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`h-5 w-5 rounded border ${
                        color.toLowerCase() === hex.toLowerCase()
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
                    onClick={() => setLineWidth(w)}
                    className={`h-7 w-10 rounded border text-[11px] ${
                      lineWidth === w
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
                {(["solid", "dashed", "dotted"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setLineStyle(st)}
                    className={`h-7 rounded border px-3 text-[11px] capitalize ${
                      lineStyle === st
                        ? "border-[#2962ff] bg-[#2962ff]/20 text-white"
                        : "border-[#2a2e39] bg-[#131722] text-[#9aa1b2] hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {supportsFill && (
              <div className="space-y-3 border-t border-[#2a2e39] pt-3">
                <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                  <span className="text-[12px] text-[#b2b5be]">Background</span>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Drawing fill color"
                      type="color"
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-[#2a2e39] bg-[#131722]"
                    />
                    <span className="font-mono text-[11px] text-[#9aa1b2]">
                      {Math.round(fillOpacity * 100)}%
                    </span>
                    <input
                      aria-label="Background opacity"
                      type="range"
                      min={0}
                      max={80}
                      step={4}
                      value={Math.round(fillOpacity * 100)}
                      onChange={(e) => setFillOpacity(Number(e.target.value) / 100)}
                      className="flex-1 accent-[#2962ff]"
                    />
                  </div>
                </div>
              </div>
            )}

            {supportsExtend && (
              <div className="flex items-center gap-5 border-t border-[#2a2e39] pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#d1d4dc]">
                  <input
                    type="checkbox"
                    checked={extendLeft}
                    onChange={(e) => setExtendLeft(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#2962ff]"
                  />
                  Extend left
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#d1d4dc]">
                  <input
                    type="checkbox"
                    checked={extendRight}
                    onChange={(e) => setExtendRight(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#2962ff]"
                  />
                  Extend right
                </label>
              </div>
            )}

            <div className="border-t border-[#2a2e39] pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#d1d4dc]">
                <input
                  type="checkbox"
                  checked={locked}
                  onChange={(e) => setLocked(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#2962ff]"
                />
                Lock drawing position
              </label>
            </div>
          </TabsPanel>

          <TabsPanel value="text" className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <label htmlFor="drw-label" className="block text-[12px] text-[#b2b5be]">
                Label / Annotation Text
              </label>
              <input
                id="drw-label"
                type="text"
                placeholder="Optional label displayed on chart"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 w-full rounded border border-[#2a2e39] bg-[#131722] px-2.5 text-[12px] text-white placeholder-[#5d606b] outline-none focus:border-[#2962ff]"
              />
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label htmlFor="drw-font-size" className="text-[12px] text-[#b2b5be]">
                Font Size
              </label>
              <select
                id="drw-font-size"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="h-8 w-28 rounded border border-[#2a2e39] bg-[#131722] px-2 text-[12px] text-white outline-none focus:border-[#2962ff]"
              >
                {[10, 11, 12, 14, 16, 18, 20, 24].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz} px
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="text-[12px] text-[#b2b5be]">Text Color</span>
              <div className="flex items-center gap-2">
                <input
                  aria-label="Drawing text color"
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border border-[#2a2e39] bg-[#131722]"
                />
                <span className="font-mono text-[11px] uppercase text-[#9aa1b2]">{textColor}</span>
              </div>
            </div>
          </TabsPanel>

          <TabsPanel value="coordinates" className="max-h-[260px] space-y-3 overflow-y-auto px-5 py-4">
            <p className="text-[11px] text-[#787b86]">
              Exact fixed-point anchor prices (snapped to instrument tick size) and timestamps.
            </p>
            {drawing.anchors.slice(0, 8).map((_, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[64px_1fr_1fr] items-center gap-2 rounded border border-[#2a2e39]/70 bg-[#131722] px-3 py-2"
              >
                <span className="text-[11px] font-medium text-[#9aa1b2]">Point #{idx + 1}</span>
                <label className="flex flex-col gap-0.5 text-[10px] text-[#787b86]">
                  Price
                  <input
                    type="number"
                    step={tickFloat}
                    value={anchorPrices[idx] ?? ""}
                    onChange={(e) => {
                      const next = [...anchorPrices];
                      next[idx] = e.target.value;
                      setAnchorPrices(next);
                    }}
                    className="h-7 rounded border border-[#2a2e39] bg-[#1e222d] px-2 font-mono text-[11px] text-white outline-none focus:border-[#2962ff]"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] text-[#787b86]">
                  Unix Time (s)
                  <input
                    type="number"
                    value={anchorTimes[idx] ?? 0}
                    onChange={(e) => {
                      const next = [...anchorTimes];
                      next[idx] = Number(e.target.value);
                      setAnchorTimes(next);
                    }}
                    className="h-7 rounded border border-[#2a2e39] bg-[#1e222d] px-2 font-mono text-[11px] text-white outline-none focus:border-[#2962ff]"
                  />
                </label>
              </div>
            ))}
          </TabsPanel>

          <TabsPanel value="visibility" className="space-y-2.5 px-5 py-4">
            <p className="mb-2 text-[11px] text-[#787b86]">
              Choose which timeframe groups display this drawing.
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
                  checked={visibility[key]}
                  onChange={(e) =>
                    setVisibility({ ...visibility, [key]: e.target.checked })
                  }
                  className="h-3.5 w-3.5 accent-[#2962ff]"
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
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const currentWidth = drawing.lineWidth ?? 2;
  const currentStyle = drawing.lineStyle ?? "solid";
  const meta = getDrawingToolMeta(drawing.kind);

  return (
    <div
      data-testid="drawing-quick-style-bar"
      role="toolbar"
      aria-label={`Quick style toolbar for ${meta.label}`}
      className="pointer-events-auto absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-[#2a2e39] bg-[#1e222d]/95 px-2 py-1 text-[11px] text-[#d1d4dc] shadow-xl backdrop-blur-sm"
    >
      <span className="max-w-[110px] truncate pr-1 text-[11px] font-medium text-[#787b86]">
        {meta.shortLabel}
      </span>
      <span className="h-4 w-px bg-[#2a2e39]" />

      {/* Color Swatch Popover */}
      <div className="relative">
        <button
          type="button"
          title="Line color"
          aria-label="Drawing quick color"
          onClick={() => setColorMenuOpen((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2a2e39]"
        >
          <span
            className="h-3.5 w-3.5 rounded-sm border border-white/25"
            style={{ backgroundColor: drawing.color }}
          />
        </button>
        {colorMenuOpen && (
          <div className="absolute left-0 top-full z-40 mt-1.5 grid w-[144px] grid-cols-5 gap-1.5 rounded-md border border-[#2a2e39] bg-[#1e222d] p-2 shadow-2xl">
            {DRAWING_PRESET_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Quick color ${hex}`}
                onClick={() => {
                  onUpdate({ color: hex, fillColor: hex });
                  setColorMenuOpen(false);
                }}
                style={{ backgroundColor: hex }}
                className={`h-5 w-5 rounded border ${
                  drawing.color.toLowerCase() === hex.toLowerCase()
                    ? "border-white ring-1 ring-[#2962ff]"
                    : "border-[#2a2e39]"
                }`}
              />
            ))}
          </div>
        )}
      </div>

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
