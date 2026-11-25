import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
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

export interface ChartPanelProps {
  transport: TransportAdapter;
  symbol: string;
  timeframe: string;
  tickSizeE9: bigint;
  studyOverlays?: readonly StudyOverlaySeries[];
  seriesSnapshotRef?: { current: ChartSeriesSnapshot };
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
  // Align initial historical seed scale with backend sim/OMS ($95,000 BTC/USD, $3,500 ETH/USD, $185 SOL/USD)
  const base = symbol.startsWith("ETH") ? 3500 : symbol.startsWith("SOL") ? 185 : 95000;
  const step = symbol.startsWith("ETH") ? 4 : symbol.startsWith("SOL") ? 0.5 : 45;
  const nowSec = Math.floor(Date.now() / 60_000) * 60;
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];
  const buyVolumes: number[] = [];
  const sellVolumes: number[] = [];
  let price = base - step * 12;
  let state = 0x51a7c3d1;

  for (let i = 120; i >= 1; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const drift = ((state % 100) / 100 - 0.48) * step;
    const open = price;
    const close = Math.max(step, open + drift);
    const wick = (((state >>> 8) % 60) / 100) * step;
    const high = Math.max(open, close) + wick;
    const low = Math.max(step * 0.5, Math.min(open, close) - wick);
    const t = (nowSec - i * 60) as UTCTimestamp;
    const totalVol = 15 + ((state >>> 16) % 85);
    const upRatio = close >= open ? 0.62 : 0.38;
    const buyVol = totalVol * upRatio;
    const sellVol = totalVol - buyVol;
    candles.push({ time: t, open, high, low, close });
    volumes.push({
      time: t,
      value: totalVol,
      color: close >= open ? "rgba(16, 185, 129, 0.35)" : "rgba(244, 63, 94, 0.35)",
    });
    buyVolumes.push(buyVol);
    sellVolumes.push(sellVol);
    price = close;
  }
  return { candles, volumes, buyVolumes, sellVolumes };
}

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
}: ChartPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pointerSurfaceRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);

  const [visibility, setVisibility] = useState<OverlayVisibility>({
    footprint: true,
    vrvp: true,
    tpo: true,
  });
  const [activeTool, setActiveTool] = useState<DrawingToolKind>("cursor");
  const [magnetEnabled, setMagnetEnabled] = useState<boolean>(true);
  const [rendererLabel, setRendererLabel] = useState<string>("WebGL2");
  const [historyMeta, setHistoryMeta] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    count: number;
  }>({ canUndo: false, canRedo: false, count: 0 });

  const visibilityRef = useRef<OverlayVisibility>(visibility);
  visibilityRef.current = visibility;

  const activeToolRef = useRef<DrawingToolKind>(activeTool);
  activeToolRef.current = activeTool;

  const magnetRef = useRef<boolean>(magnetEnabled);
  magnetRef.current = magnetEnabled;

  const drawingEngineRef = useRef<DrawingEngine>(new DrawingEngine());
  const chartApiRef = useRef<IChartApi | null>(null);
  const studyLineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const latestTimesRef = useRef<UTCTimestamp[]>([]);
  const redrawTriggerRef = useRef<() => void>(() => {});

  const syncHistoryMeta = () => {
    const engine = drawingEngineRef.current;
    setHistoryMeta({
      canUndo: engine.canUndo(),
      canRedo: engine.canRedo(),
      count: engine.list(symbol).length,
    });
    redrawTriggerRef.current();
  };

  useEffect(() => {
    syncHistoryMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    redrawTriggerRef.current();
  }, [visibility]);

  useEffect(() => {
    const el = hostRef.current;
    const pointerSurface = pointerSurfaceRef.current;
    if (!el || !pointerSurface) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#a1a1aa",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#18181b" },
        horzLines: { color: "#18181b" },
      },
      crosshair: {
        vertLine: { color: "#52525b", labelBackgroundColor: "#27272a" },
        horzLine: { color: "#52525b", labelBackgroundColor: "#27272a" },
      },
      rightPriceScale: { borderColor: "#27272a" },
      timeScale: { borderColor: "#27272a", timeVisible: true, secondsVisible: false },
      width: Math.max(300, el.clientWidth),
      height: Math.max(200, el.clientHeight),
    });

    const candleSeries: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartApiRef.current = chart;
    const seeded = seedInitialCandles(symbol);
    let activeCandles: CandlestickData<UTCTimestamp>[] = [...seeded.candles];
    let activeVolumes: HistogramData<UTCTimestamp>[] = [...seeded.volumes];
    let activeBuyVolumes: number[] = [...seeded.buyVolumes];
    let activeSellVolumes: number[] = [...seeded.sellVolumes];

    const publishSeriesSnapshot = () => {
      const times = activeCandles.map((c) => c.time);
      latestTimesRef.current = times;
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
      getDrawings: () => drawingEngineRef.current.list(symbol),
      getDraftPreview: () => ({
        tool: activeToolRef.current,
        anchors: draftAnchors,
        hover: hoverAnchor,
      }),
      getCandles: () => activeCandles,
      getVolumes: () => activeVolumes,
    });
    candleSeries.attachPrimitive(primitive);

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

    const flush = () => {
      rafId = 0;
      if (pendingBar && pendingVol) {
        const res = applyBarHysteresis(activeCandles, pendingBar);
        activeCandles = res.bars;
        activeBarTimeSec = Number(pendingBar.time);
        if (!res.trimmed) {
          candleSeries.update(pendingBar);
          volumeSeries.update(pendingVol);
          if (activeVolumes.length > 0 && activeVolumes[activeVolumes.length - 1].time === pendingVol.time) {
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
                color: "rgba(16, 185, 129, 0.35)",
              },
          );
          activeBuyVolumes = activeVolumes.map((v, idx) => {
            const c = activeCandles[idx];
            return v.value * (c && c.close >= c.open ? 0.62 : 0.38);
          });
          activeSellVolumes = activeVolumes.map((v, idx) => Math.max(0, v.value - activeBuyVolumes[idx]));
          volumeSeries.setData(activeVolumes);
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
    };

    const scheduleFlush = () => {
      pendingPrimitiveDirty = true;
      if (rafId === 0) {
        rafId = requestAnimationFrame(flush);
      }
    };

    redrawTriggerRef.current = scheduleFlush;

    const unsub = transport.subscribeBinary(1, (buf) => {
      try {
        const hdr = decodeFrameHeader(buf);
        if (hdr.frameType === FrameType.LIVE_BAR_UPDATE_BATCH) {
          const { bars } = decodeLiveBarUpdateBatch(buf);
          const latest = bars[bars.length - 1];
          if (!latest) return;
          const t = Number(latest.tsOpenNs / 1_000_000_000n) as UTCTimestamp;
          const open = Number(latest.openTick) * tickFloat;
          const high = Number(latest.highTick) * tickFloat;
          const low = Number(latest.lowTick) * tickFloat;
          const close = Number(latest.closeTick) * tickFloat;
          const totalVol = Number(latest.volumeE9) / 1e9;
          pendingBar = { time: t, open, high, low, close };
          pendingVol = {
            time: t,
            value: totalVol,
            color: close >= open ? "rgba(16, 185, 129, 0.45)" : "rgba(244, 63, 94, 0.45)",
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
          scheduleFlush();
        } else if (hdr.frameType === FrameType.VOLUME_PROFILE_SOA) {
          const decoded = decodeVolumeProfile(buf);
          vpSummary = decoded.summary;
          vpBins = decoded.bins;
          scheduleFlush();
        } else if (hdr.frameType === FrameType.TPO_PROFILE_BITMASK) {
          const decoded = decodeTpoProfileBitmask(buf);
          tpoRows = decoded.rows;
          scheduleFlush();
        }
      } catch {
        // Ignore unrelated or malformed frames
      }
    });

    const toAnchorFromPointer = (clientX: number, clientY: number): AnchorPoint | null => {
      const rect = pointerSurface.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const rawPrice = candleSeries.coordinateToPrice(y);
      if (rawPrice === null || tickFloat <= 0) return null;
      const scaled = Number(rawPrice) / tickFloat;
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
      studyLineSeriesRef.current.clear();
      chartApiRef.current = null;
      overlay.dispose();
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, symbol, timeframe, tickSizeE9]);

  // Synchronize active Study LineSeries overlays without disturbing 60 fps tick loop
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
  }, [studyOverlays, symbol, timeframe]);

  const handleToggleVisibility = (key: keyof OverlayVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
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

  return (
    <div className="relative flex h-full w-full flex-col bg-zinc-950">
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
        onToggleMagnet={() => setMagnetEnabled((m) => !m)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearDrawings={handleClear}
      />
      <div className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute left-3 top-2 z-20 flex items-center gap-2">
          <span
            ref={badgeRef}
            className="rounded border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] text-zinc-200"
          >
            {symbol} · {timeframe} · LWC v5.3 ISeriesPrimitive ({rendererLabel})
          </span>
        </div>
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
      </div>
    </div>
  );
}
