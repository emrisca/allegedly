import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type LineData,
  type PrimitivePaneViewZOrder,
  type SeriesAttachedParameter,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  DEFAULT_CHART_SETTINGS,
  DEFAULT_CHART_TEMPLATES,
  type ChartSettings,
  type ChartSettingsTemplate,
} from "@allegedly/ui-chrome";
import { Button } from "@ui-sdk/react/button";
import { Toggle } from "@ui-sdk/react/toggle";
import { Toolbar } from "@ui-sdk/react/toolbar";
import {
  decodeFootprintDelta,
  decodeFrameHeader,
  decodeLiveBarUpdateBatch,
  decodeTpoProfileBitmask,
  decodeVolumeProfile,
  FrameType,
  type FootprintCell,
  type TpoRow128,
  type TransportAdapter,
  type VolumeProfileBin,
  type VolumeProfileSummary,
} from "@allegedly/ipc-client";
import {
  DRAWING_TOOL_META,
  DrawingEngine,
  FIB_LEVELS,
  snapTickToMagnet,
  type AnchorPoint,
  type DrawingObject,
  type DrawingToolKind,
  type MagnetTarget,
  type PlacedDrawingKind,
} from "../drawings/drawing-engine";
import { getSymbolMeta } from "../data/symbols";
import {
  ChartContextMenu,
  type ChartContextMenuState,
} from "../components/chart-context-menu";
import { applyBarHysteresis } from "../render/hysteresis";
import {
  WebGl2OrderflowOverlay,
  type CoordinateBridge,
  type OverlayRenderData,
  type OverlayVisibility,
} from "../render/webgl2-orderflow-overlay";

export interface StudyOverlaySeries {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

export interface ChartSeriesSnapshot {
  times: UTCTimestamp[];
  closes: number[];
  volumes: number[];
  buyVolumes: number[];
  sellVolumes: number[];
}

export interface ChartHistoryActions {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  addAlert?: () => void;
  takeSnapshot?: () => void;
}

export interface ChartOrderOverlay {
  order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  qty_e9: string;
  limit_price_e9?: string | null;
  status: string;
}

export interface ChartPanelProps {
  transport: TransportAdapter;
  symbol: string;
  timeframe: string;
  tickSizeE9: bigint;
  studyOverlays?: readonly StudyOverlaySeries[];
  seriesSnapshotRef?: { current: ChartSeriesSnapshot };
  /** Controlled chrome state from institutional shell */
  activeTool?: DrawingToolKind;
  onSelectTool?: (tool: DrawingToolKind) => void;
  magnetEnabled?: boolean;
  onToggleMagnet?: () => void;
  showFloatingBar?: boolean;
  candleStyle?: "monochrome" | "classic";
  autoScale?: boolean;
  onAutoScaleChange?: (auto: boolean) => void;
  logScale?: boolean;
  onLogScaleChange?: (log: boolean) => void;
  rangePreset?: "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";
  historyActionsRef?: { current: ChartHistoryActions | null };
  onHistoryMetaChange?: (meta: { canUndo: boolean; canRedo: boolean; count: number }) => void;
  onRemoveStudy?: (id: string) => void;
  onLivePriceSample?: (symbol: string, last: number) => void;
  /** Live Chart Settings + Templates + Context Menu actions */
  chartSettings?: ChartSettings;
  replayOpen?: boolean;
  chartTemplates?: readonly ChartSettingsTemplate[];
  onApplyChartTemplate?: (template: ChartSettingsTemplate) => void;
  onApplyChartDefaults?: () => void;
  onOpenSettings?: () => void;
  onSubmitOrderAtPrice?: (
    side: "buy" | "sell",
    orderType: "market" | "limit",
    explicitPrice?: number,
  ) => void;
  onOpenOrderTicket?: () => void;
  onClearAllStudies?: () => void;
  onOpenObjectTree?: () => void;
  activeOrders?: readonly ChartOrderOverlay[];
  onAlertsCountChange?: (count: number) => void;
  /** Render legacy inline toolbar when used standalone */
  showInlineToolbar?: boolean;
}

function getPrecisionDigits(cfg: ChartSettings, defaultDecimals: number): number {
  switch (cfg.symbol.precision) {
    case "1/100":
      return 2;
    case "1/1000":
      return 3;
    case "1/10000":
      return 4;
    default:
      return defaultDecimals;
  }
}

function formatChartTimestamp(time: Time, cfg: ChartSettings): string {
  const sec = typeof time === "number" ? time : 0;
  if (!Number.isFinite(sec) || sec <= 0) return String(time);
  const date = new Date(sec * 1000);
  const tz = cfg.symbol.timezone || "America/Los_Angeles";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const weekday = get("weekday");
    const day = get("day");
    const month = get("month");
    const year2 = get("year");
    const year4 = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
    }).format(date);
    const monthNum = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "2-digit",
    }).format(date);

    const dowPrefix = cfg.scales.dayOfWeekOnLabels ? `${weekday} ` : "";
    switch (cfg.scales.dateFormat) {
      case "yyyy-MM-dd":
        return `${dowPrefix}${year4}-${monthNum}-${day}`;
      case "MM/dd/yyyy":
        return `${dowPrefix}${monthNum}/${day}/${year4}`;
      case "dd MMM 'yy":
        return `${dowPrefix}${day} ${month} '${year2}`;
      case "ddd dd MMM 'yy":
      default:
        return `${dowPrefix}${day} ${month} '${year2}`;
    }
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function getTimeframeDurationSec(tf: string): number {
  switch (tf) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "1h":
      return 3600;
    case "4h":
      return 14400;
    case "W":
      return 7 * 86400;
    case "D":
    default:
      return 86400;
  }
}

function formatCountdownClock(remainingSec: number): string {
  const s = Math.max(0, Math.floor(remainingSec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return `rgba(31, 34, 44, ${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return `rgba(31, 34, 44, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ChartOverlayToolbarProps {
  visibility: OverlayVisibility;
  activeTool: DrawingToolKind;
  magnetEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  drawingCount: number;
  rendererLabel: string;
  onToggleVisibility: (key: keyof OverlayVisibility) => void;
  onSelectTool: (tool: DrawingToolKind) => void;
  onToggleMagnet: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearDrawings: () => void;
}

export function ChartOverlayToolbar({
  visibility,
  activeTool,
  magnetEnabled,
  canUndo,
  canRedo,
  drawingCount,
  rendererLabel,
  onToggleVisibility,
  onSelectTool,
  onToggleMagnet,
  onUndo,
  onRedo,
  onClearDrawings,
}: ChartOverlayToolbarProps) {
  return (
    <Toolbar
      aria-label="Chart orderflow overlays and drawing tools"
      className="flex flex-wrap items-center justify-between gap-1.5 border-b border-zinc-800 bg-zinc-950/95 px-2 py-1 text-[11px]"
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          Layers
        </span>
        <Toggle
          pressed={visibility.footprint}
          onPressedChange={() => onToggleVisibility("footprint")}
          aria-label="Toggle Footprint overlay"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-emerald-500/60 data-pressed:bg-emerald-950/70 data-pressed:text-emerald-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Footprint
        </Toggle>
        <Toggle
          pressed={visibility.vrvp}
          onPressedChange={() => onToggleVisibility("vrvp")}
          aria-label="Toggle VRVP overlay"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-sky-500/60 data-pressed:bg-sky-950/70 data-pressed:text-sky-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          VRVP
        </Toggle>
        <Toggle
          pressed={visibility.tpo}
          onPressedChange={() => onToggleVisibility("tpo")}
          aria-label="Toggle TPO Market Profile overlay"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-amber-500/60 data-pressed:bg-amber-950/70 data-pressed:text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          TPO 128
        </Toggle>

        <span className="mx-1 h-4 w-px bg-zinc-800" aria-hidden="true" />
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          Draw
        </span>
        {DRAWING_TOOL_META.map((tool) => (
          <Toggle
            key={tool.kind}
            pressed={activeTool === tool.kind}
            onPressedChange={() => onSelectTool(tool.kind)}
            aria-label={`Select ${tool.label} tool`}
            className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-amber-500/70 data-pressed:bg-amber-950/70 data-pressed:text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {tool.label}
          </Toggle>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Toggle
          pressed={magnetEnabled}
          onPressedChange={onToggleMagnet}
          aria-label="Toggle SV-17 integer magnet snap"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-violet-500/60 data-pressed:bg-violet-950/70 data-pressed:text-violet-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Magnet
        </Toggle>
        <Button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo drawing action"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Undo
        </Button>
        <Button
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo drawing action"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Redo
        </Button>
        <Button
          onClick={onClearDrawings}
          disabled={drawingCount === 0}
          aria-label="Clear all drawings"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Clear ({drawingCount})
        </Button>
        <span
          data-testid="renderer-badge"
          className="ml-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
        >
          {rendererLabel}
        </span>
      </div>
    </Toolbar>
  );
}

function seedInitialCandles(symbol: string): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
  buyVolumes: number[];
  sellVolumes: number[];
} {
  const meta = getSymbolMeta(symbol);
  const base = meta.basePrice;
  const volScale = base * 0.0022;
  const nowSec = Math.floor(Date.now() / 60_000) * 60;
  const count = 180;
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];
  const buyVolumes: number[] = [];
  const sellVolumes: number[] = [];

  let seed = 0x9e3779b9;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  let price = base * 0.94;
  for (let i = count; i >= 1; i--) {
    const progress = (count - i) / count;
    const regimeDrift =
      progress < 0.32
        ? volScale * 0.34
        : progress < 0.65
          ? volScale * 0.05
          : progress < 0.82
            ? volScale * 0.16
            : -volScale * 0.28;
    const noise = (nextRand() - 0.49) * volScale * 2.2;
    const open = price;
    const close = Math.max(meta.basePrice * 0.25, open + regimeDrift + noise);
    const wickUp = (0.2 + nextRand() * 0.9) * volScale;
    const wickDn = (0.2 + nextRand() * 0.9) * volScale;
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(meta.basePrice * 0.2, Math.min(open, close) - wickDn);
    price = close;

    const vol = 18 + Math.round(nextRand() * 95);
    const buyShare = close >= open ? 0.56 + nextRand() * 0.12 : 0.34 + nextRand() * 0.12;
    const buyVol = vol * buyShare;
    const sellVol = Math.max(0, vol - buyVol);
    const t = (nowSec - i * 60) as UTCTimestamp;
    candles.push({ time: t, open, high, low, close });
    volumes.push({
      time: t,
      value: vol,
      color: close >= open ? "rgba(130, 142, 165, 0.22)" : "rgba(95, 103, 122, 0.18)",
    });
    buyVolumes.push(buyVol);
    sellVolumes.push(sellVol);
  }

  const finalClose = candles[candles.length - 1]?.close ?? base;
  const delta = base - finalClose;
  for (const c of candles) {
    c.open += delta;
    c.high += delta;
    c.low += delta;
    c.close += delta;
  }

  return { candles, volumes, buyVolumes, sellVolumes };
}

function drawVectorDrawing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: PlacedDrawingKind,
  anchors: readonly AnchorPoint[],
  color: string,
  tickFloat: number,
  bridge: CoordinateBridge,
  candles: readonly CandlestickData<UTCTimestamp>[],
  volumes: readonly HistogramData<UTCTimestamp>[],
): void {
  const pts = anchors.map((a) => ({
    x: bridge.timeToX(a.timeSec),
    y: bridge.priceToY(Number(a.priceTick) * tickFloat),
    anchor: a,
  }));
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;

  if (kind === "horizontal_ray" && pts[0]?.y !== null) {
    const startX = pts[0].x ?? 0;
    ctx.beginPath();
    ctx.moveTo(startX, pts[0].y);
    ctx.lineTo(w, pts[0].y);
    ctx.stroke();
  } else if (kind === "trendline" && pts.length >= 2) {
    const [a, b] = pts;
    if (a.x !== null && a.y !== null && b.x !== null && b.y !== null) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  } else if (kind === "box_zone" && pts.length >= 2) {
    const [a, b] = pts;
    if (a.x !== null && a.y !== null && b.x !== null && b.y !== null) {
      const rx = Math.min(a.x, b.x);
      const ry = Math.min(a.y, b.y);
      const rw = Math.abs(b.x - a.x);
      const rh = Math.abs(b.y - a.y);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
      ctx.strokeRect(rx, ry, rw, rh);
    }
  } else if (kind === "price_range" && pts.length >= 2) {
    const [a, b] = pts;
    if (a.x !== null && a.y !== null && b.x !== null && b.y !== null) {
      const rx = Math.min(a.x, b.x);
      const ry = Math.min(a.y, b.y);
      const rw = Math.abs(b.x - a.x);
      const rh = Math.abs(b.y - a.y);
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
      ctx.strokeRect(rx, ry, rw, rh);
      const deltaTicks = b.anchor.priceTick - a.anchor.priceTick;
      const deltaPrice = Number(deltaTicks) * tickFloat;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(
        `${deltaPrice >= 0 ? "+" : ""}${deltaPrice.toFixed(2)} (${deltaTicks.toString()}t)`,
        rx + 4,
        Math.max(14, ry + 12),
      );
    }
  } else if (kind === "fib_retracement" && pts.length >= 2) {
    const [a, b] = pts;
    if (a.x !== null && a.y !== null && b.x !== null && b.y !== null) {
      const leftX = Math.min(a.x, b.x);
      const rightX = Math.max(a.x, b.x, leftX + 80);
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      for (const lvl of FIB_LEVELS) {
        const y = a.y + (b.y - a.y) * lvl;
        ctx.beginPath();
        ctx.moveTo(leftX, y);
        ctx.lineTo(rightX, y);
        ctx.stroke();
        ctx.fillText(`${(lvl * 100).toFixed(1)}%`, rightX + 4, y + 3);
      }
    }
  } else if (kind === "anchored_vwap" && pts[0]) {
    const startSec = pts[0].anchor.timeSec;
    let cpv = 0;
    let cv = 0;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (Number(c.time) < startSec) continue;
      const vol = volumes[i]?.value ?? 1;
      const typ = (c.high + c.low + c.close) / 3;
      cpv += typ * vol;
      cv += vol;
      if (cv <= 0) continue;
      const vx = bridge.timeToX(Number(c.time));
      const vy = bridge.priceToY(cpv / cv);
      if (vx !== null && vy !== null && vy >= 0 && vy <= h) {
        if (!started) {
          ctx.moveTo(vx, vy);
          started = true;
        } else {
          ctx.lineTo(vx, vy);
        }
      }
    }
    ctx.stroke();
  }

  // Anchor handles
  for (const p of pts) {
    if (p.x !== null && p.y !== null) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Genuine Lightweight Charts v5 ISeriesPrimitive (ADR-0004 / S01).
 * Executes orderflow (WebGL2 offscreen instanced pass composited synchronously) and
 * vector drawings INSIDE Lightweight Charts' own pane render callback, guaranteeing
 * 0.000 CSS px coordinate drift during pan, zoom, and resize.
 */
interface PrimitiveDrawContext {
  getOverlayData: () => OverlayRenderData;
  getDrawings: () => readonly DrawingObject[];
  getDraftPreview: () => {
    tool: DrawingToolKind;
    anchors: readonly AnchorPoint[];
    hover: AnchorPoint | null;
  };
  getCandles: () => readonly CandlestickData<UTCTimestamp>[];
  getVolumes: () => readonly HistogramData<UTCTimestamp>[];
}

class OrderflowAndDrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdateCb: (() => void) | null = null;
  private readonly paneView: IPrimitivePaneView;

  constructor(
    private readonly overlay: WebGl2OrderflowOverlay,
    private readonly source: PrimitiveDrawContext,
  ) {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => {
        const chart = this.chart;
        const series = this.series;
        if (!chart || !series) return;

        const bridge: CoordinateBridge = {
          timeToX: (timeSec: number): number | null => {
            const coord = chart.timeScale().timeToCoordinate(timeSec as UTCTimestamp);
            return coord === null ? null : Number(coord);
          },
          priceToY: (price: number): number | null => {
            const coord = series.priceToCoordinate(price);
            return coord === null ? null : Number(coord);
          },
        };

        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const w = mediaSize.width;
          const h = mediaSize.height;
          if (w <= 0 || h <= 0) return;

          const data = this.source.getOverlayData();
          const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

          // 1. Orderflow layers (Footprint, VRVP, u128 TPO) composited synchronously
          this.overlay.compositeIntoContext(context, w, h, dpr, data, bridge);

          // 2. Clean-room vector drawings + active draft preview
          const candles = this.source.getCandles();
          const volumes = this.source.getVolumes();
          context.save();
          for (const d of this.source.getDrawings()) {
            drawVectorDrawing(
              context,
              w,
              h,
              d.kind,
              d.anchors,
              d.color,
              data.tickSizeFloat,
              bridge,
              candles,
              volumes,
            );
          }
          const draft = this.source.getDraftPreview();
          if (draft.tool !== "cursor" && draft.anchors.length > 0) {
            const preview = draft.hover ? [...draft.anchors, draft.hover] : [...draft.anchors];
            const meta = DRAWING_TOOL_META.find((m) => m.kind === draft.tool);
            context.setLineDash([4, 3]);
            drawVectorDrawing(
              context,
              w,
              h,
              draft.tool as PlacedDrawingKind,
              preview,
              meta?.defaultColor ?? "#f59e0b",
              data.tickSizeFloat,
              bridge,
              candles,
              volumes,
            );
          }
          context.restore();
        });
      },
    };

    this.paneView = {
      zOrder: (): PrimitivePaneViewZOrder => "top",
      renderer: () => renderer,
    };
  }

  public attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this.requestUpdateCb = param.requestUpdate;
  }

  public detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdateCb = null;
  }

  public updateAllViews(): void {
    // Coordinates are read synchronously from LWC scales during draw()
  }

  public paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  public requestUpdate(): void {
    this.requestUpdateCb?.();
  }
}

/**
 * 60 fps Chart Panel (Lightweight Charts v5.3.0 + Synchronous ISeriesPrimitive WebGL2 Orderflow
 * Overlay + Clean-Room Drawing Engine).
 * Strictly imperative ref + rAF pipeline — zero React state updates on binary ticks (AGENTS.md #5).
 */
export function ChartPanel({
  transport,
  symbol,
  timeframe,
  tickSizeE9,
  studyOverlays = [],
  seriesSnapshotRef,
  activeTool: controlledTool,
  onSelectTool,
  magnetEnabled: controlledMagnet,
  onToggleMagnet,
  showFloatingBar = true,
  candleStyle = "monochrome",
  autoScale: controlledAutoScale,
  onAutoScaleChange,
  logScale: controlledLogScale,
  onLogScaleChange,
  rangePreset = "All",
  historyActionsRef,
  onHistoryMetaChange,
  onRemoveStudy,
  onLivePriceSample,
  chartSettings,
  replayOpen = false,
  chartTemplates = DEFAULT_CHART_TEMPLATES,
  onApplyChartTemplate,
  onApplyChartDefaults,
  onOpenSettings,
  onSubmitOrderAtPrice,
  onOpenOrderTicket,
  onClearAllStudies,
  onOpenObjectTree,
  activeOrders = [],
  onAlertsCountChange,
  showInlineToolbar = false,
}: ChartPanelProps) {
  const effectiveSettings = chartSettings ?? DEFAULT_CHART_SETTINGS;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pointerSurfaceRef = useRef<HTMLDivElement | null>(null);
  const ohlcRef = useRef<HTMLSpanElement | null>(null);

  const [visibility, setVisibility] = useState<OverlayVisibility>({
    footprint: false,
    vrvp: false,
    tpo: false,
  });
  const [showVolume, setShowVolume] = useState<boolean>(effectiveSettings.statusLine.volume);
  const [contextMenu, setContextMenu] = useState<ChartContextMenuState | null>(null);
  const [lockCursorByTime, setLockCursorByTime] = useState<boolean>(false);
  const [tableViewOpen, setTableViewOpen] = useState<boolean>(false);
  const [alerts, setAlerts] = useState<Array<{ id: string; symbol: string; price: number }>>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>("");
  const [scaleMenuOpen, setScaleMenuOpen] = useState<boolean>(false);
  const [priceScaleMode, setPriceScaleMode] = useState<PriceScaleMode>(PriceScaleMode.Normal);
  const [invertScale, setInvertScale] = useState<boolean>(false);
  const [localAutoScale, setLocalAutoScale] = useState<boolean>(true);
  const [hiddenStudyIds, setHiddenStudyIds] = useState<Set<string>>(() => new Set());

  const [localTool, setLocalTool] = useState<DrawingToolKind>("cursor");
  const [localMagnet, setLocalMagnet] = useState<boolean>(true);
  const [rendererLabel, setRendererLabel] = useState<string>("WebGL2");
  const [historyMeta, setHistoryMeta] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    count: number;
  }>({ canUndo: false, canRedo: false, count: 0 });

  const activeTool = controlledTool ?? localTool;
  const setActiveTool = (next: DrawingToolKind) => {
    setLocalTool(next);
    onSelectTool?.(next);
  };

  const magnetEnabled = controlledMagnet ?? localMagnet;
  const toggleMagnet = () => {
    setLocalMagnet((m) => !m);
    onToggleMagnet?.();
  };

  const autoScale = controlledAutoScale ?? localAutoScale;
  const setAutoScale = (next: boolean) => {
    setLocalAutoScale(next);
    onAutoScaleChange?.(next);
  };

  const effectiveLogScale = controlledLogScale ?? priceScaleMode === PriceScaleMode.Logarithmic;

  const visibilityRef = useRef<OverlayVisibility>(visibility);
  visibilityRef.current = visibility;

  const activeToolRef = useRef<DrawingToolKind>(activeTool);
  activeToolRef.current = activeTool;

  const magnetRef = useRef<boolean>(magnetEnabled);
  magnetRef.current = magnetEnabled;

  const candleStyleRef = useRef<"monochrome" | "classic">(candleStyle);
  candleStyleRef.current = candleStyle;

  const chartSettingsRef = useRef<ChartSettings>(effectiveSettings);
  chartSettingsRef.current = effectiveSettings;

  const onLivePriceSampleRef = useRef(onLivePriceSample);
  onLivePriceSampleRef.current = onLivePriceSample;

  const drawingEngineRef = useRef<DrawingEngine>(new DrawingEngine());
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const studyLineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const latestTimesRef = useRef<UTCTimestamp[]>([]);
  const latestCandlesRef = useRef<CandlestickData<UTCTimestamp>[]>([]);
  const lastCrosshairPriceRef = useRef<number | null>(null);
  const redrawTriggerRef = useRef<() => void>(() => {});
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (chartSettingsRef.current.alerts.autoHideToasts) {
      toastTimerRef.current = window.setTimeout(() => {
        setToastMsg(null);
        toastTimerRef.current = null;
      }, 2800);
    }
  };

  const syncHistoryMeta = () => {
    const engine = drawingEngineRef.current;
    const nextMeta = {
      canUndo: engine.canUndo(),
      canRedo: engine.canRedo(),
      count: engine.list(symbol).length,
    };
    setHistoryMeta(nextMeta);
    onHistoryMetaChange?.(nextMeta);
    redrawTriggerRef.current();
  };

  const handleUndo = () => {
    drawingEngineRef.current.undo();
    syncHistoryMeta();
  };

  const handleRedo = () => {
    drawingEngineRef.current.redo();
    syncHistoryMeta();
  };

  const handleClear = () => {
    drawingEngineRef.current.clear(symbol);
    syncHistoryMeta();
  };

  const handleAddAlert = () => {
    const fallback = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close;
    const price = lastCrosshairPriceRef.current ?? fallback;
    if (price !== undefined && Number.isFinite(price)) {
      setAlerts((prev) => [...prev, { id: `al-${Date.now()}`, symbol, price }]);
      showToast(`Alert added on ${symbol} at ${price.toFixed(getSymbolMeta(symbol).decimals)}`);
    }
  };

  const handleTakeSnapshot = () => {
    const chart = chartApiRef.current;
    if (!chart) return;
    try {
      const canvas = chart.takeScreenshot(true, false);
      const dataUrl = canvas.toDataURL("image/png");
      const safeSym = symbol.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `allegedly-${safeSym}-${timeframe}.png`;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(`Snapshot saved: ${filename}`);
    } catch {
      showToast("Chart snapshot unavailable in current renderer");
    }
  };

  if (historyActionsRef) {
    historyActionsRef.current = {
      undo: handleUndo,
      redo: handleRedo,
      clear: handleClear,
      addAlert: handleAddAlert,
      takeSnapshot: handleTakeSnapshot,
    };
  }

  useEffect(() => {
    onAlertsCountChange?.(alerts.length);
  }, [alerts.length, onAlertsCountChange]);

  useEffect(() => {
    syncHistoryMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    redrawTriggerRef.current();
  }, [visibility]);

  // Sync volume histogram visibility with Status line Volume checkbox
  useEffect(() => {
    setShowVolume(effectiveSettings.statusLine.volume);
  }, [effectiveSettings.statusLine.volume]);

  // Apply all live ChartSettings (Symbol, Canvas, Scales, Date format) to Lightweight Charts
  useEffect(() => {
    const chart = chartApiRef.current;
    const cs = candleSeriesRef.current;
    if (!chart || !cs) return;

    const cfg = effectiveSettings;
    const symMetaLocal = getSymbolMeta(symbol);
    const digits = getPrecisionDigits(cfg, symMetaLocal.decimals);
    const targetMode = effectiveLogScale
      ? PriceScaleMode.Logarithmic
      : priceScaleMode === PriceScaleMode.Logarithmic
        ? PriceScaleMode.Normal
        : priceScaleMode;

    const topMargin = Math.max(0, Math.min(0.45, cfg.canvas.marginTopPct / 100));
    const bottomMargin = Math.max(0, Math.min(0.45, cfg.canvas.marginBottomPct / 100));
    const isLeftScale = cfg.scales.scalesPlacement === "left";

    chart.applyOptions({
      layout: {
        background:
          cfg.canvas.backgroundType === "gradient"
            ? {
                type: ColorType.VerticalGradient,
                topColor: cfg.canvas.backgroundColor,
                bottomColor: cfg.canvas.backgroundColorBottom,
              }
            : {
                type: ColorType.Solid,
                color: cfg.canvas.backgroundColor,
              },
        textColor: cfg.canvas.scalesTextColor,
        fontSize: cfg.canvas.scalesFontSize,
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          visible: cfg.canvas.vertGridLines,
          color: cfg.canvas.vertGridColor,
        },
        horzLines: {
          visible: cfg.canvas.horzGridLines,
          color: cfg.canvas.horzGridColor,
        },
      },
      crosshair: {
        vertLine: {
          color: cfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
        horzLine: {
          color: cfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
      },
      leftPriceScale: {
        visible: isLeftScale,
        borderVisible: cfg.canvas.scalesLinesVisible,
        borderColor: cfg.canvas.scalesLineColor,
        autoScale,
        invertScale,
        mode: targetMode,
        scaleMargins: { top: topMargin, bottom: bottomMargin },
      },
      rightPriceScale: {
        visible: !isLeftScale,
        borderVisible: cfg.canvas.scalesLinesVisible,
        borderColor: cfg.canvas.scalesLineColor,
        autoScale,
        invertScale,
        mode: targetMode,
        scaleMargins: { top: topMargin, bottom: bottomMargin },
      },
      timeScale: {
        borderVisible: cfg.canvas.scalesLinesVisible,
        borderColor: cfg.canvas.scalesLineColor,
        rightOffset: cfg.canvas.marginRightBars,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        timeFormatter: (time: Time) => formatChartTimestamp(time, cfg),
      },
    });

    cs.applyOptions({
      upColor: cfg.symbol.bodyEnabled ? cfg.symbol.bodyUpColor : "transparent",
      downColor: cfg.symbol.bodyEnabled ? cfg.symbol.bodyDownColor : "transparent",
      borderVisible: cfg.symbol.borderEnabled,
      borderUpColor: cfg.symbol.borderUpColor,
      borderDownColor: cfg.symbol.borderDownColor,
      wickVisible: cfg.symbol.wickEnabled,
      wickUpColor: cfg.symbol.wickUpColor,
      wickDownColor: cfg.symbol.wickDownColor,
      lastValueVisible: cfg.scales.symbolPriceLabel !== "hidden",
      priceLineVisible: cfg.scales.symbolPriceLabel === "value_line",
      priceFormat: {
        type: "price",
        precision: digits,
        minMove: Math.pow(10, -digits),
      },
    });
  }, [effectiveSettings, autoScale, invertScale, priceScaleMode, effectiveLogScale, symbol]);

  // Dynamic price lines for alerts, working orders, High/Low, and Bid/Ask
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;

    for (const line of priceLinesRef.current) {
      try {
        cs.removePriceLine(line);
      } catch {
        // Ignore stale price line
      }
    }
    priceLinesRef.current = [];

    const cfg = effectiveSettings;
    const candles = latestCandlesRef.current;
    const lastBar = candles[candles.length - 1];
    const added: IPriceLine[] = [];

    if (cfg.alerts.alertLines) {
      for (const al of alerts) {
        if (al.symbol !== symbol) continue;
        added.push(
          cs.createPriceLine({
            price: al.price,
            color: cfg.alerts.alertLineColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Alert",
          }),
        );
      }
    }

    if (cfg.trading.positionsAndOrders) {
      for (const ord of activeOrders) {
        if (ord.symbol !== symbol || !ord.limit_price_e9) continue;
        if (ord.status !== "working" && ord.status !== "pending") continue;
        const p = Number(ord.limit_price_e9) / 1e9;
        if (!Number.isFinite(p) || p <= 0) continue;
        const isBuy = ord.side.toLowerCase() === "buy";
        added.push(
          cs.createPriceLine({
            price: p,
            color: isBuy ? "#26a69a" : "#ef5350",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `${isBuy ? "BUY" : "SELL"} ${ord.order_type.toUpperCase()}`,
          }),
        );
      }
    }

    if (cfg.scales.highAndLow !== "hidden" && candles.length > 0) {
      let hi = -Infinity;
      let lo = Infinity;
      for (const c of candles) {
        if (c.high > hi) hi = c.high;
        if (c.low < lo) lo = c.low;
      }
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const showLine = cfg.scales.highAndLow === "value_line";
        added.push(
          cs.createPriceLine({
            price: hi,
            color: "#26a69a",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lineVisible: showLine,
            axisLabelVisible: true,
            title: "High",
          }),
          cs.createPriceLine({
            price: lo,
            color: "#ef5350",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lineVisible: showLine,
            axisLabelVisible: true,
            title: "Low",
          }),
        );
      }
    }

    if (cfg.scales.bidAndAsk !== "hidden" && lastBar) {
      const tickFloat = Number(tickSizeE9) / 1e9 || 0.25;
      const showLine = cfg.scales.bidAndAsk === "lines_and_labels";
      added.push(
        cs.createPriceLine({
          price: lastBar.close - tickFloat,
          color: cfg.scales.bidColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          lineVisible: showLine,
          axisLabelVisible: true,
          title: "Bid",
        }),
        cs.createPriceLine({
          price: lastBar.close + tickFloat,
          color: cfg.scales.askColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          lineVisible: showLine,
          axisLabelVisible: true,
          title: "Ask",
        }),
      );
    }

    priceLinesRef.current = added;
  }, [effectiveSettings, alerts, activeOrders, symbol, tickSizeE9]);

  // Countdown to bar close clock
  useEffect(() => {
    if (!effectiveSettings.scales.countdownToBarClose) {
      setCountdownText("");
      return;
    }
    const dur = getTimeframeDurationSec(timeframe);
    const updateClock = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const rem = dur - (nowSec % dur);
      setCountdownText(formatCountdownClock(rem));
    };
    updateClock();
    const id = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(id);
  }, [effectiveSettings.scales.countdownToBarClose, timeframe]);

  // Chart keyboard shortcuts (⌥R reset, ⌥A alert, ⌥⇧S sell limit, ⇧T order ticket)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && key === "r") {
        e.preventDefault();
        setAutoScale(true);
        setInvertScale(false);
        setPriceScaleMode(PriceScaleMode.Normal);
        onLogScaleChange?.(false);
        chartApiRef.current?.timeScale().fitContent();
        showToast("Chart view reset");
      } else if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && key === "a") {
        e.preventDefault();
        const fallback = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close;
        const price = lastCrosshairPriceRef.current ?? fallback;
        if (price !== undefined && Number.isFinite(price)) {
          setAlerts((prev) => [
            ...prev,
            { id: `al-${Date.now()}`, symbol, price },
          ]);
          showToast(`Alert added on ${symbol} at ${price.toFixed(getSymbolMeta(symbol).decimals)}`);
        }
      } else if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && key === "s") {
        e.preventDefault();
        const fallback = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close;
        const price = lastCrosshairPriceRef.current ?? fallback;
        if (price !== undefined && Number.isFinite(price)) {
          onSubmitOrderAtPrice?.("sell", "limit", price);
          showToast(`Sell 1 ${symbol} @ ${price.toFixed(getSymbolMeta(symbol).decimals)} limit submitted`);
        }
      } else if (!e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && key === "t") {
        e.preventDefault();
        onOpenOrderTicket?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, onSubmitOrderAtPrice, onOpenOrderTicket]);

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  useEffect(() => {
    const chart = chartApiRef.current;
    const count = latestTimesRef.current.length;
    if (!chart || count === 0) return;
    if (rangePreset === "All") {
      chart.timeScale().fitContent();
      return;
    }
    const barCounts: Record<string, number> = {
      "1D": 35,
      "5D": 65,
      "1M": 90,
      "3M": 120,
      "6M": 145,
      YTD: 155,
      "1Y": 170,
    };
    const visible = Math.min(count, barCounts[rangePreset] ?? count);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, count - visible),
      to: count + 4,
    });
  }, [rangePreset]);

  useEffect(() => {
    const el = hostRef.current;
    const pointerSurface = pointerSurfaceRef.current;
    if (!el || !pointerSurface) return;

    const initCfg = chartSettingsRef.current;
    const initSymMeta = getSymbolMeta(symbol);
    const initDigits = getPrecisionDigits(initCfg, initSymMeta.decimals);
    const initTopMargin = Math.max(0, Math.min(0.45, initCfg.canvas.marginTopPct / 100));
    const initBottomMargin = Math.max(0, Math.min(0.45, initCfg.canvas.marginBottomPct / 100));
    const initLeftScale = initCfg.scales.scalesPlacement === "left";

    const chart = createChart(el, {
      layout: {
        background:
          initCfg.canvas.backgroundType === "gradient"
            ? {
                type: ColorType.VerticalGradient,
                topColor: initCfg.canvas.backgroundColor,
                bottomColor: initCfg.canvas.backgroundColorBottom,
              }
            : { type: ColorType.Solid, color: initCfg.canvas.backgroundColor },
        textColor: initCfg.canvas.scalesTextColor,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", "Segoe UI", sans-serif',
        fontSize: initCfg.canvas.scalesFontSize,
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          visible: initCfg.canvas.vertGridLines,
          color: initCfg.canvas.vertGridColor,
        },
        horzLines: {
          visible: initCfg.canvas.horzGridLines,
          color: initCfg.canvas.horzGridColor,
        },
      },
      crosshair: {
        vertLine: {
          color: initCfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
        horzLine: {
          color: initCfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
      },
      leftPriceScale: {
        visible: initLeftScale,
        borderVisible: initCfg.canvas.scalesLinesVisible,
        borderColor: initCfg.canvas.scalesLineColor,
        scaleMargins: { top: initTopMargin, bottom: initBottomMargin },
      },
      rightPriceScale: {
        visible: !initLeftScale,
        borderVisible: initCfg.canvas.scalesLinesVisible,
        borderColor: initCfg.canvas.scalesLineColor,
        scaleMargins: { top: initTopMargin, bottom: initBottomMargin },
      },
      timeScale: {
        borderVisible: initCfg.canvas.scalesLinesVisible,
        borderColor: initCfg.canvas.scalesLineColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: initCfg.canvas.marginRightBars,
      },
      localization: {
        timeFormatter: (time: Time) => formatChartTimestamp(time, chartSettingsRef.current),
      },
      width: Math.max(300, el.clientWidth),
      height: Math.max(200, el.clientHeight),
    });

    const candleSeries: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: initCfg.symbol.bodyEnabled ? initCfg.symbol.bodyUpColor : "transparent",
      downColor: initCfg.symbol.bodyEnabled ? initCfg.symbol.bodyDownColor : "transparent",
      borderVisible: initCfg.symbol.borderEnabled,
      borderUpColor: initCfg.symbol.borderUpColor,
      borderDownColor: initCfg.symbol.borderDownColor,
      wickVisible: initCfg.symbol.wickEnabled,
      wickUpColor: initCfg.symbol.wickUpColor,
      wickDownColor: initCfg.symbol.wickDownColor,
      lastValueVisible: initCfg.scales.symbolPriceLabel !== "hidden",
      priceLineVisible: initCfg.scales.symbolPriceLabel === "value_line",
      priceFormat: {
        type: "price",
        precision: initDigits,
        minMove: Math.pow(10, -initDigits),
      },
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      visible: showVolume,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    chartApiRef.current = chart;
    const seeded = seedInitialCandles(symbol);
    let activeCandles: CandlestickData<UTCTimestamp>[] = [...seeded.candles];
    let activeVolumes: HistogramData<UTCTimestamp>[] = [...seeded.volumes];
    let activeBuyVolumes: number[] = [...seeded.buyVolumes];
    let activeSellVolumes: number[] = [...seeded.sellVolumes];

    const symMeta = getSymbolMeta(symbol);
    const formatOhlc = (c: CandlestickData<UTCTimestamp>, vol?: number) => {
      const cfg = chartSettingsRef.current;
      const digits = getPrecisionDigits(cfg, symMeta.decimals);
      const f = (n: number) =>
        n.toLocaleString("en-US", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
      const segments: string[] = [];
      if (cfg.statusLine.chartValues) {
        segments.push(`O ${f(c.open)}  H ${f(c.high)}  L ${f(c.low)}  C ${f(c.close)}`);
      }
      if (cfg.statusLine.barChangeValues) {
        const diff = c.close - c.open;
        const pct = c.open !== 0 ? (diff / c.open) * 100 : 0;
        const sign = diff >= 0 ? "+" : "";
        segments.push(`${sign}${f(diff)} (${sign}${pct.toFixed(2)}%)`);
      }
      if (cfg.statusLine.volume && typeof vol === "number") {
        segments.push(`Vol ${Math.round(vol).toLocaleString("en-US")}`);
      }
      return segments.join("   ");
    };

    const publishSeriesSnapshot = () => {
      const times = activeCandles.map((c) => c.time);
      latestTimesRef.current = times;
      latestCandlesRef.current = activeCandles;
      const lastBar = activeCandles[activeCandles.length - 1];
      const lastVol = activeVolumes[activeVolumes.length - 1]?.value;
      if (lastBar && ohlcRef.current) {
        ohlcRef.current.textContent = formatOhlc(lastBar, lastVol);
      }
      if (seriesSnapshotRef) {
        seriesSnapshotRef.current = {
          times,
          closes: activeCandles.map((c) => c.close),
          volumes: activeVolumes.map((v) => v.value),
          buyVolumes: [...activeBuyVolumes],
          sellVolumes: [...activeSellVolumes],
        };
      }
    };
    candleSeries.setData(activeCandles);
    volumeSeries.setData(activeVolumes);
    publishSeriesSnapshot();
    chart.timeScale().fitContent();

    const overlay = new WebGl2OrderflowOverlay();
    setRendererLabel(overlay.isWebGl2() ? "WebGL2" : "Canvas2D");

    const tickFloat = Number(tickSizeE9) / 1e9;
    let activeBarTimeSec = Number(activeCandles[activeCandles.length - 1]?.time ?? 0);
    let footprintCells: FootprintCell[] = [];
    let vpSummary: VolumeProfileSummary | null = null;
    let vpBins: VolumeProfileBin[] = [];
    let tpoRows: TpoRow128[] = [];

    let pendingBar: CandlestickData<UTCTimestamp> | null = null;
    let pendingVol: HistogramData<UTCTimestamp> | null = null;
    let pendingBuyVol = 0;
    let pendingSellVol = 0;
    let pendingPrimitiveDirty = true;
    let draftAnchors: AnchorPoint[] = [];
    let hoverAnchor: AnchorPoint | null = null;
    let rafId = 0;
    let lastWatchlistNotifyMs = 0;

    const primitive = new OrderflowAndDrawingsPrimitive(overlay, {
      getOverlayData: (): OverlayRenderData => ({
        tickSizeFloat: tickFloat,
        activeBarTimeSec,
        footprintCells,
        vpSummary,
        vpBins,
        tpoRows,
        visibility: visibilityRef.current,
      }),
      getDrawings: (): readonly DrawingObject[] => drawingEngineRef.current.list(symbol),
      getDraftPreview: () => ({
        tool: activeToolRef.current,
        anchors: draftAnchors,
        hover: hoverAnchor,
      }),
      getCandles: () => activeCandles,
      getVolumes: () => activeVolumes,
    });
    candleSeries.attachPrimitive(primitive);

    const scheduleFlush = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (pendingBar && pendingVol) {
          const res = applyBarHysteresis(activeCandles, pendingBar);
          activeCandles = res.bars;
          activeBarTimeSec = Number(pendingBar.time);
          if (!res.trimmed) {
            candleSeries.update(pendingBar);
            volumeSeries.update(pendingVol);
            if (
              activeVolumes.length > 0 &&
              activeVolumes[activeVolumes.length - 1].time === pendingVol.time
            ) {
              activeVolumes[activeVolumes.length - 1] = pendingVol;
              activeBuyVolumes[activeBuyVolumes.length - 1] = pendingBuyVol;
              activeSellVolumes[activeSellVolumes.length - 1] = pendingSellVol;
            } else {
              activeVolumes.push(pendingVol);
              activeBuyVolumes.push(pendingBuyVol);
              activeSellVolumes.push(pendingSellVol);
            }
          } else {
            candleSeries.setData(activeCandles);
            const volMap = new Map<number, HistogramData<UTCTimestamp>>();
            for (const v of activeVolumes) volMap.set(Number(v.time), v);
            volMap.set(Number(pendingVol.time), pendingVol);
            activeVolumes = activeCandles.map(
              (c) =>
                volMap.get(Number(c.time)) ?? {
                  time: c.time,
                  value: 0,
                  color: "rgba(130, 142, 165, 0.24)",
                },
            );
            activeBuyVolumes = activeVolumes.map((v, idx) => {
              const c = activeCandles[idx];
              return v.value * (c && c.close >= c.open ? 0.62 : 0.38);
            });
            activeSellVolumes = activeVolumes.map((v, idx) =>
              Math.max(0, v.value - activeBuyVolumes[idx]),
            );
            volumeSeries.setData(activeVolumes);
          }

          const nowMs = performance.now();
          if (nowMs - lastWatchlistNotifyMs >= 500) {
            lastWatchlistNotifyMs = nowMs;
            onLivePriceSampleRef.current?.(symbol, pendingBar.close);
          }
          publishSeriesSnapshot();
          pendingBar = null;
          pendingVol = null;
          pendingPrimitiveDirty = true;
        }
        if (pendingPrimitiveDirty) {
          pendingPrimitiveDirty = false;
          primitive.requestUpdate();
        }
      });
    };

    redrawTriggerRef.current = () => {
      pendingPrimitiveDirty = true;
      scheduleFlush();
    };

    chart.subscribeCrosshairMove((param) => {
      if (param.point) {
        const p = candleSeries.coordinateToPrice(param.point.y);
        if (p !== null && Number.isFinite(p)) {
          lastCrosshairPriceRef.current = p;
        }
      }
      if (!ohlcRef.current) return;
      const bar = param.seriesData.get(candleSeries) as CandlestickData<UTCTimestamp> | undefined;
      const vPoint = param.seriesData.get(volumeSeries) as HistogramData<UTCTimestamp> | undefined;
      if (bar && typeof bar.open === "number") {
        ohlcRef.current.textContent = formatOhlc(bar, vPoint?.value);
      } else {
        const lastBar = activeCandles[activeCandles.length - 1];
        const lastVol = activeVolumes[activeVolumes.length - 1]?.value;
        if (lastBar) ohlcRef.current.textContent = formatOhlc(lastBar, lastVol);
      }
    });

    const unsub = transport.subscribeBinary(1, (buf) => {
      try {
        const hdr = decodeFrameHeader(buf);
        if (hdr.frameType === FrameType.LIVE_BAR_UPDATE_BATCH) {
          const { bars } = decodeLiveBarUpdateBatch(buf);
          const latest = bars[bars.length - 1];
          if (!latest) return;
          const t = Number(latest.tsOpenNs / 1_000_000_000n) as UTCTimestamp;
          const rawOpen = Number(latest.openTick) * tickFloat;
          const rawHigh = Number(latest.highTick) * tickFloat;
          const rawLow = Number(latest.lowTick) * tickFloat;
          const rawClose = Number(latest.closeTick) * tickFloat;
          const totalVol = Number(latest.volumeE9) / 1e9;
          const lastSeed = activeCandles[activeCandles.length - 1]?.close ?? symMeta.basePrice;
          const ratio =
            rawClose > 0 && Math.abs(rawClose - lastSeed) / Math.max(1, lastSeed) > 0.35
              ? lastSeed / rawClose
              : 1;
          const open = rawOpen * ratio;
          const high = rawHigh * ratio;
          const low = rawLow * ratio;
          const close = rawClose * ratio;
          pendingBar = { time: t, open, high, low, close };
          pendingVol = {
            time: t,
            value: totalVol,
            color: close >= open ? "rgba(130, 142, 165, 0.24)" : "rgba(95, 103, 122, 0.2)",
          };
          pendingBuyVol = totalVol * (close >= open ? 0.62 : 0.38);
          pendingSellVol = Math.max(0, totalVol - pendingBuyVol);
          scheduleFlush();
        } else if (hdr.frameType === FrameType.LIVE_FOOTPRINT_DELTA) {
          const decoded = decodeFootprintDelta(buf);
          footprintCells = decoded.cells;
          let sumBid = 0n;
          let sumAsk = 0n;
          for (const c of footprintCells) {
            sumBid += c.bidVolE9;
            sumAsk += c.askVolE9;
          }
          if (activeBuyVolumes.length > 0 && (sumBid > 0n || sumAsk > 0n)) {
            activeBuyVolumes[activeBuyVolumes.length - 1] = Number(sumAsk) / 1e9;
            activeSellVolumes[activeSellVolumes.length - 1] = Number(sumBid) / 1e9;
            publishSeriesSnapshot();
          }
          pendingPrimitiveDirty = true;
          scheduleFlush();
        } else if (hdr.frameType === FrameType.VOLUME_PROFILE_SOA) {
          const decoded = decodeVolumeProfile(buf);
          vpSummary = decoded.summary;
          vpBins = decoded.bins;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        } else if (hdr.frameType === FrameType.TPO_PROFILE_BITMASK) {
          const decoded = decodeTpoProfileBitmask(buf);
          tpoRows = decoded.rows;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
      } catch {
        // Ignore unrelated or malformed frames
      }
    });

    const collectMagnetTargets = (): MagnetTarget[] => {
      const targets: MagnetTarget[] = [];
      const latest = activeCandles[activeCandles.length - 1];
      if (latest && tickFloat > 0) {
        for (const price of [latest.open, latest.high, latest.low, latest.close]) {
          const scaled = price / tickFloat;
          if (Number.isFinite(scaled)) {
            targets.push({ priceTick: BigInt(Math.round(scaled)), source: "ohlc" });
          }
        }
      }
      if (vpSummary) {
        targets.push(
          { priceTick: vpSummary.pocPrice, source: "tpo_poc" },
          { priceTick: vpSummary.vahPrice, source: "tpo_vah" },
          { priceTick: vpSummary.valPrice, source: "tpo_val" },
        );
      }
      return targets;
    };

    const toAnchorFromPointer = (clientX: number, clientY: number): AnchorPoint | null => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const price = candleSeries.coordinateToPrice(y);
      if (price === null || !Number.isFinite(price)) return null;
      const scaled = price / tickFloat;
      if (!Number.isFinite(scaled)) return null;
      const rawTime = chart.timeScale().coordinateToTime(x);
      const timeSec =
        typeof rawTime === "number"
          ? rawTime
          : activeBarTimeSec || Math.floor(Date.now() / 1000);
      let priceTick = BigInt(Math.round(scaled));
      if (magnetRef.current) {
        const snapped = snapTickToMagnet(priceTick, collectMagnetTargets(), 250n);
        priceTick = snapped.snappedTick;
      }
      return { timeSec, priceTick };
    };

    const onPointerDown = (ev: PointerEvent) => {
      const tool = activeToolRef.current;
      if (tool === "cursor") return;
      const anchor = toAnchorFromPointer(ev.clientX, ev.clientY);
      if (!anchor) return;
      const meta = DRAWING_TOOL_META.find((m) => m.kind === tool);
      const required = meta?.requiredAnchors ?? 2;
      draftAnchors.push(anchor);
      if (draftAnchors.length >= required) {
        drawingEngineRef.current.add(tool as PlacedDrawingKind, symbol, draftAnchors);
        draftAnchors = [];
        hoverAnchor = null;
        syncHistoryMeta();
      } else {
        scheduleFlush();
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (activeToolRef.current === "cursor" || draftAnchors.length === 0) return;
      hoverAnchor = toAnchorFromPointer(ev.clientX, ev.clientY);
      scheduleFlush();
    };

    pointerSurface.addEventListener("pointerdown", onPointerDown);
    pointerSurface.addEventListener("pointermove", onPointerMove);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.resize(Math.floor(width), Math.floor(height));
        scheduleFlush();
      }
    });
    ro.observe(el);

    scheduleFlush();

    return () => {
      unsub();
      ro.disconnect();
      pointerSurface.removeEventListener("pointerdown", onPointerDown);
      pointerSurface.removeEventListener("pointermove", onPointerMove);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      candleSeries.detachPrimitive(primitive);
      priceLinesRef.current = [];
      studyLineSeriesRef.current.clear();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      overlay.dispose();
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, symbol, timeframe, tickSizeE9]);

  useEffect(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    const map = studyLineSeriesRef.current;
    const wanted = new Set(studyOverlays.map((s) => s.id));
    for (const [id, series] of map.entries()) {
      if (!wanted.has(id)) {
        chart.removeSeries(series);
        map.delete(id);
      }
    }
    const times = latestTimesRef.current;
    for (const st of studyOverlays) {
      let series = map.get(st.id);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: st.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        map.set(st.id, series);
      }
      series.applyOptions({
        visible: !hiddenStudyIds.has(st.id),
        lastValueVisible: effectiveSettings.scales.indicatorsLabel === "value",
      });
      const n = Math.min(times.length, st.values.length);
      const pts: LineData<UTCTimestamp>[] = [];
      for (let i = 0; i < n; i++) {
        const v = st.values[i];
        if (v !== null && Number.isFinite(v)) {
          pts.push({ time: times[i], value: v });
        }
      }
      series.setData(pts);
    }
  }, [studyOverlays, hiddenStudyIds, symbol, timeframe, effectiveSettings.scales.indicatorsLabel]);

  const handleToggleVisibility = (key: keyof OverlayVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleStudyVisibility = (id: string) => {
    setHiddenStudyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectScaleMode = (mode: PriceScaleMode) => {
    setPriceScaleMode(mode);
    onLogScaleChange?.(mode === PriceScaleMode.Logarithmic);
  };

  const symMeta = getSymbolMeta(symbol);
  const precisionDigits = getPrecisionDigits(effectiveSettings, symMeta.decimals);
  const formatPriceValue = (p: number) =>
    p.toLocaleString("en-US", {
      minimumFractionDigits: precisionDigits,
      maximumFractionDigits: precisionDigits,
    });

  const handleChartContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = hostRef.current;
    const cs = candleSeriesRef.current;
    let price = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close ?? symMeta.basePrice;
    if (el && cs) {
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const computed = cs.coordinateToPrice(y);
      if (computed !== null && Number.isFinite(computed)) {
        price = computed;
      }
    }
    const menuWidth = 296;
    const menuHeight = 430;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight));
    setContextMenu({
      x,
      y,
      price,
      formattedPrice: formatPriceValue(price),
    });
  };

  const handleResetView = () => {
    setAutoScale(true);
    setInvertScale(false);
    setPriceScaleMode(PriceScaleMode.Normal);
    onLogScaleChange?.(false);
    chartApiRef.current?.timeScale().fitContent();
    showToast("Chart view reset");
  };

  const showWatermark =
    effectiveSettings.canvas.watermark === "always" ||
    (effectiveSettings.canvas.watermark === "replay" && replayOpen);

  const showBuySellButtons =
    effectiveSettings.statusLine.buySellButtons || effectiveSettings.trading.buySellButtons;

  const statusBgStyle = effectiveSettings.statusLine.background
    ? {
        backgroundColor: hexToRgba(
          effectiveSettings.canvas.backgroundColor,
          Math.max(0.05, Math.min(0.95, effectiveSettings.statusLine.backgroundOpacity / 100)),
        ),
      }
    : undefined;

  return (
    <div
      style={{ backgroundColor: effectiveSettings.canvas.backgroundColor }}
      className="relative flex h-full w-full flex-col"
    >
      {showInlineToolbar && (
        <ChartOverlayToolbar
          visibility={visibility}
          activeTool={activeTool}
          magnetEnabled={magnetEnabled}
          canUndo={historyMeta.canUndo}
          canRedo={historyMeta.canRedo}
          drawingCount={historyMeta.count}
          rendererLabel={rendererLabel}
          onToggleVisibility={handleToggleVisibility}
          onSelectTool={setActiveTool}
          onToggleMagnet={toggleMagnet}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearDrawings={handleClear}
        />
      )}

      <div
        className="relative flex-1 overflow-hidden"
        onContextMenu={handleChartContextMenu}
      >
        {/* Optional Replay / Always Clean-Room Watermark */}
        {showWatermark && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center select-none"
          >
            <div className="font-mono text-5xl font-bold tracking-widest text-white/[0.045]">
              {symMeta.symbol} · {timeframe}
            </div>
            {replayOpen && (
              <div className="mt-1 font-mono text-xs uppercase tracking-[0.35em] text-amber-300/20">
                Bar Replay
              </div>
            )}
          </div>
        )}

        {/* Transparent Top-Left Institutional Status Line */}
        <div
          style={statusBgStyle}
          className="pointer-events-none absolute left-3 top-2.5 z-20 flex flex-col gap-1 rounded px-1.5 py-1 select-none"
        >
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {effectiveSettings.statusLine.logo && (
              <span
                aria-hidden="true"
                style={{ backgroundColor: symMeta.badgeColor, color: symMeta.badgeText }}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
              >
                {symMeta.shortLabel.slice(0, 3)}
              </span>
            )}
            {effectiveSettings.statusLine.title && (
              <>
                {effectiveSettings.statusLine.titleMode !== "description" && (
                  <span className="font-semibold tracking-tight text-[#e6e8ee]">
                    {symMeta.symbol}
                  </span>
                )}
                {effectiveSettings.statusLine.titleMode === "symbol_and_name" && (
                  <>
                    <span className="text-[#8b92a3]">·</span>
                    <span className="text-[#b8becd]">{symMeta.name}</span>
                  </>
                )}
                {effectiveSettings.statusLine.titleMode === "description" && (
                  <span className="font-semibold tracking-tight text-[#e6e8ee]">
                    {symMeta.name}
                  </span>
                )}
                <span className="text-[#8b92a3]">·</span>
                <span className="font-mono text-[#b8becd]">{timeframe}</span>
                <span className="text-[#8b92a3]">·</span>
                <span className="text-[#8b92a3]">{symMeta.exchange}</span>
              </>
            )}
            {effectiveSettings.statusLine.openMarketStatus && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#12332a]/90 px-2 py-0.5 text-[10px] font-medium text-[#2dd4bf]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2dd4bf]" />
                  Open
                </span>
                <span className="rounded bg-[#342512]/90 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {symMeta.delayedLabel ?? "Paper Sim"}
                </span>
              </>
            )}
            {lockCursorByTime && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] text-sky-300 ring-1 ring-sky-500/30">
                Cursor Locked
              </span>
            )}
          </div>

          {(effectiveSettings.statusLine.chartValues ||
            effectiveSettings.statusLine.barChangeValues ||
            effectiveSettings.statusLine.volume) && (
            <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-[#8b92a3]">
              <span ref={ohlcRef} className="text-[#b8becd]" />
              <span className="text-[10px] text-[#636a7b]">{rendererLabel}</span>
            </div>
          )}

          {showBuySellButtons && (
            <div className="pointer-events-auto mt-0.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSubmitOrderAtPrice?.("sell", "market");
                  showToast(`Sell 1 ${symbol} market submitted`);
                }}
                className="rounded border border-rose-500/50 bg-rose-950/70 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-rose-200 hover:bg-rose-900/80"
              >
                SELL MKT
              </button>
              <button
                type="button"
                onClick={() => {
                  onSubmitOrderAtPrice?.("buy", "market");
                  showToast(`Buy 1 ${symbol} market submitted`);
                }}
                className="rounded border border-sky-500/50 bg-sky-950/70 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-sky-200 hover:bg-sky-900/80"
              >
                BUY MKT
              </button>
            </div>
          )}

          {effectiveSettings.statusLine.indicatorTitles && (
            <div className="pointer-events-auto mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {studyOverlays.map((st) => {
                const hidden = hiddenStudyIds.has(st.id);
                const lastVal = st.values[st.values.length - 1];
                const titleText = effectiveSettings.statusLine.indicatorInputs
                  ? st.label
                  : st.label.replace(/\s*\([^)]*\)/g, "");
                return (
                  <span
                    key={st.id}
                    className="inline-flex items-center gap-1.5 rounded bg-[#151821]/75 px-1.5 py-0.5 text-[#b8becd] hover:bg-[#1e2230]"
                  >
                    <span
                      aria-hidden="true"
                      style={{ backgroundColor: st.color }}
                      className="h-2 w-2 rounded-full"
                    />
                    <span className={hidden ? "line-through opacity-50" : ""}>{titleText}</span>
                    {effectiveSettings.statusLine.indicatorValues &&
                      typeof lastVal === "number" &&
                      Number.isFinite(lastVal) && (
                        <span className="font-mono text-[10px] text-[#8d94a5]">
                          {formatPriceValue(lastVal)}
                        </span>
                      )}
                    <button
                      type="button"
                      aria-label={hidden ? `Show ${st.label}` : `Hide ${st.label}`}
                      onClick={() => toggleStudyVisibility(st.id)}
                      className="text-[#868c9b] hover:text-white"
                    >
                      {hidden ? "○" : "◉"}
                    </button>
                    {onRemoveStudy && (
                      <button
                        type="button"
                        aria-label={`Remove ${st.label}`}
                        onClick={() => onRemoveStudy(st.id)}
                        className="text-[#6f7687] hover:text-rose-300"
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}

              {(visibility.footprint || visibility.vrvp || visibility.tpo) && (
                <span className="inline-flex items-center gap-1.5 rounded bg-[#151821]/75 px-1.5 py-0.5 font-mono text-[10px] text-[#9aa1b2]">
                  {visibility.footprint && <span className="text-emerald-300">Footprint</span>}
                  {visibility.vrvp && <span className="text-sky-300">VRVP</span>}
                  {visibility.tpo && <span className="text-amber-300">TPO</span>}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Floating Glass Favorites Drawing & Orderflow Pill */}
        {showFloatingBar && (
          <div
            role="toolbar"
            aria-label="Quick drawing and orderflow favorites"
            className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-[#2c3140] bg-[#14171f]/92 px-1.5 py-1 shadow-2xl backdrop-blur-md select-none"
          >
            <span
              aria-hidden="true"
              className="mr-0.5 px-1 font-mono text-[10px] tracking-tighter text-[#5c6375]"
            >
              ⋮⋮
            </span>
            {DRAWING_TOOL_META.map((tool) => {
              const active = activeTool === tool.kind;
              return (
                <button
                  key={tool.kind}
                  type="button"
                  title={tool.label}
                  aria-label={`Quick select ${tool.label}`}
                  aria-pressed={active}
                  onClick={() => setActiveTool(tool.kind)}
                  className={
                    active
                      ? "rounded px-2 py-1 font-mono text-[10px] font-semibold bg-[#292e3b] text-white"
                      : "rounded px-2 py-1 font-mono text-[10px] text-[#9aa1b2] hover:bg-[#212533] hover:text-white"
                  }
                >
                  {tool.label}
                </button>
              );
            })}
            <span className="mx-1 h-4 w-px bg-[#2a2f3d]" aria-hidden="true" />
            <button
              type="button"
              aria-label="Toggle Footprint overlay"
              aria-pressed={visibility.footprint}
              onClick={() => handleToggleVisibility("footprint")}
              className={
                visibility.footprint
                  ? "rounded bg-emerald-500/20 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40"
                  : "rounded px-2 py-1 font-mono text-[10px] text-[#9aa1b2] hover:bg-[#212533] hover:text-white"
              }
            >
              FP
            </button>
            <button
              type="button"
              aria-label="Toggle Volume Profile overlay"
              aria-pressed={visibility.vrvp}
              onClick={() => handleToggleVisibility("vrvp")}
              className={
                visibility.vrvp
                  ? "rounded bg-sky-500/20 px-2 py-1 font-mono text-[10px] font-semibold text-sky-300 ring-1 ring-sky-500/40"
                  : "rounded px-2 py-1 font-mono text-[10px] text-[#9aa1b2] hover:bg-[#212533] hover:text-white"
              }
            >
              VP
            </button>
            <button
              type="button"
              aria-label="Toggle TPO Market Profile overlay"
              aria-pressed={visibility.tpo}
              onClick={() => handleToggleVisibility("tpo")}
              className={
                visibility.tpo
                  ? "rounded bg-amber-500/20 px-2 py-1 font-mono text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/40"
                  : "rounded px-2 py-1 font-mono text-[10px] text-[#9aa1b2] hover:bg-[#212533] hover:text-white"
              }
            >
              TPO
            </button>
          </div>
        )}

        <div ref={hostRef} className="h-full w-full" />

        <div
          ref={pointerSurfaceRef}
          aria-label="Chart interactive drawing surface"
          className={
            activeTool === "cursor"
              ? "pointer-events-none absolute inset-0 z-15 h-full w-full"
              : "pointer-events-auto absolute inset-0 z-15 h-full w-full cursor-crosshair"
          }
        />

        {/* Bottom-Right Price Scale Context Menu */}
        <div className="absolute bottom-1.5 right-1.5 z-30">
          {scaleMenuOpen && (
            <div
              role="menu"
              aria-label="Price scale and chart overlay options"
              className="mb-1.5 w-56 rounded-lg border border-[#2c3140] bg-[#14171f] py-1.5 text-[12px] text-[#d6dae6] shadow-2xl"
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={autoScale}
                onClick={() => setAutoScale(!autoScale)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 text-sky-400">{autoScale ? "✓" : ""}</span>
                  Auto (fits data to screen)
                </span>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={invertScale}
                onClick={() => setInvertScale((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 text-sky-400">{invertScale ? "✓" : ""}</span>
                  Invert scale
                </span>
                <span className="font-mono text-[10px] text-[#6f7687]">⌥I</span>
              </button>

              <div className="my-1 h-px bg-[#232733]" />

              {[
                { mode: PriceScaleMode.Normal, label: "Regular", hint: "" },
                { mode: PriceScaleMode.Percentage, label: "Percent", hint: "⌥P" },
                { mode: PriceScaleMode.IndexedTo100, label: "Indexed to 100", hint: "" },
                { mode: PriceScaleMode.Logarithmic, label: "Logarithmic", hint: "⌥L" },
              ].map((row) => {
                const checked =
                  row.mode === PriceScaleMode.Logarithmic
                    ? effectiveLogScale
                    : !effectiveLogScale && priceScaleMode === row.mode;
                return (
                  <button
                    key={row.label}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    onClick={() => selectScaleMode(row.mode)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#222633]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-3 text-sky-400">{checked ? "✓" : ""}</span>
                      {row.label}
                    </span>
                    {row.hint && (
                      <span className="font-mono text-[10px] text-[#6f7687]">{row.hint}</span>
                    )}
                  </button>
                );
              })}

              <div className="my-1 h-px bg-[#232733]" />

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showVolume}
                onClick={() => setShowVolume((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-sky-400">{showVolume ? "✓" : ""}</span>
                Volume Histogram
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visibility.footprint}
                onClick={() => handleToggleVisibility("footprint")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-emerald-400">{visibility.footprint ? "✓" : ""}</span>
                Footprint Bid/Ask Cells
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visibility.vrvp}
                onClick={() => handleToggleVisibility("vrvp")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-sky-400">{visibility.vrvp ? "✓" : ""}</span>
                Volume Profile (VRVP)
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visibility.tpo}
                onClick={() => handleToggleVisibility("tpo")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-amber-400">{visibility.tpo ? "✓" : ""}</span>
                TPO Market Profile (128)
              </button>
              {onOpenSettings && (
                <>
                  <div className="my-1 h-px bg-[#232733]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setScaleMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#d6dae6] hover:bg-[#222633] hover:text-white"
                  >
                    <span className="w-3 text-[#8c92a4]">⚙</span>
                    More settings...
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-1.5">
            {effectiveSettings.scales.countdownToBarClose && countdownText && (
              <span
                title="Countdown to bar close"
                className="rounded border border-[#2a2f3d] bg-[#14171f]/90 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#a5abb8]"
              >
                {countdownText}
              </span>
            )}
            <button
              type="button"
              aria-label="Price scale settings menu"
              aria-expanded={scaleMenuOpen}
              title="Price scale & overlay options"
              onClick={() => setScaleMenuOpen((o) => !o)}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#2a2f3d] bg-[#14171f]/90 text-[#9aa1b2] hover:bg-[#222633] hover:text-white"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <circle cx="8" cy="8" r="2.2" />
                <path
                  d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Optional OHLC Table View Overlay */}
        {tableViewOpen && (
          <div className="absolute bottom-10 left-3 z-30 w-[420px] max-w-[90%] rounded-lg border border-[#2c3140] bg-[#14171f]/95 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[#252936] px-3 py-1.5">
              <span className="font-mono text-[11px] font-semibold text-[#e6e8ee]">
                {symbol} · {timeframe} Table View (Latest 10 Bars)
              </span>
              <button
                type="button"
                aria-label="Close table view"
                onClick={() => setTableViewOpen(false)}
                className="text-xs text-[#8d94a5] hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="max-h-52 overflow-auto">
              <table className="w-full font-mono text-[11px] tabular-nums">
                <thead className="sticky top-0 bg-[#14171f] text-[10px] uppercase text-[#787f91]">
                  <tr>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-right">Open</th>
                    <th className="px-2 py-1 text-right">High</th>
                    <th className="px-2 py-1 text-right">Low</th>
                    <th className="px-2 py-1 text-right">Close</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f232e] text-[#c8cdd8]">
                  {latestCandlesRef.current
                    .slice(-10)
                    .reverse()
                    .map((bar) => (
                      <tr key={String(bar.time)} className="hover:bg-[#1c202c]">
                        <td className="px-2 py-1 text-left text-[#9aa1b2]">
                          {formatChartTimestamp(bar.time, effectiveSettings)}
                        </td>
                        <td className="px-2 py-1 text-right">{formatPriceValue(bar.open)}</td>
                        <td className="px-2 py-1 text-right">{formatPriceValue(bar.high)}</td>
                        <td className="px-2 py-1 text-right">{formatPriceValue(bar.low)}</td>
                        <td className="px-2 py-1 text-right font-semibold text-white">
                          {formatPriceValue(bar.close)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Auto-Hiding Chart Notification Toast */}
        {toastMsg && (
          <div
            role="status"
            className="absolute bottom-9 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#2f3545] bg-[#14171f]/95 px-3 py-1.5 text-[12px] text-[#e6e8ee] shadow-2xl"
          >
            <span>{toastMsg}</span>
            {!effectiveSettings.alerts.autoHideToasts && (
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToastMsg(null)}
                className="text-[#8a90a2] hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Right-Click Chart Context Menu */}
        {contextMenu && (
          <ChartContextMenu
            menu={contextMenu}
            symbol={symbol}
            studiesCount={studyOverlays.length}
            lockCursorByTime={lockCursorByTime}
            tableViewOpen={tableViewOpen}
            templates={chartTemplates}
            onClose={() => setContextMenu(null)}
            onResetView={handleResetView}
            onCopyPrice={(priceText) => {
              if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(priceText).catch(() => {});
              }
              showToast(`Copied price ${priceText}`);
            }}
            onPaste={() => {
              showToast("Paste ready on chart canvas");
            }}
            onAddAlert={(price) => {
              setAlerts((prev) => [
                ...prev,
                { id: `al-${Date.now()}`, symbol, price },
              ]);
              showToast(`Alert added on ${symbol} at ${formatPriceValue(price)}`);
            }}
            onSellLimit={(price) => {
              onSubmitOrderAtPrice?.("sell", "limit", price);
              showToast(`Sell 1 ${symbol} @ ${formatPriceValue(price)} limit submitted`);
            }}
            onBuyStop={(price) => {
              onSubmitOrderAtPrice?.("buy", "limit", price);
              showToast(`Buy 1 ${symbol} @ ${formatPriceValue(price)} stop submitted`);
            }}
            onAddOrder={() => {
              onOpenOrderTicket?.();
            }}
            onToggleLockCursor={() => {
              setLockCursorByTime((v) => {
                const next = !v;
                showToast(
                  next
                    ? "Vertical cursor line locked by time"
                    : "Vertical cursor line unlocked",
                );
                return next;
              });
            }}
            onToggleTableView={() => setTableViewOpen((v) => !v)}
            onOpenObjectTree={() => {
              onOpenObjectTree?.();
            }}
            onApplyTemplate={(tpl) => {
              onApplyChartTemplate?.(tpl);
              showToast(`Applied chart template "${tpl.name}"`);
            }}
            onApplyDefaults={() => {
              onApplyChartDefaults?.();
              showToast("Applied default chart settings");
            }}
            onRemoveIndicators={() => {
              onClearAllStudies?.();
              showToast("Removed chart indicators");
            }}
            onOpenSettings={() => {
              onOpenSettings?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
