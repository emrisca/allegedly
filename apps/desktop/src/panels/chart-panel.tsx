import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Button } from "@ui-sdk/react/button";
import { Toggle } from "@ui-sdk/react/toggle";
import { Toolbar } from "@ui-sdk/react/toolbar";
import {
  FrameType,
  decodeFootprintDelta,
  decodeFrameHeader,
  decodeLiveBarUpdateBatch,
  decodeTpoProfileBitmask,
  decodeVolumeProfile,
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
  type DrawingToolKind,
  type MagnetTarget,
  type PlacedDrawingKind,
} from "../drawings/drawing-engine";
import { applyBarHysteresis } from "../render/hysteresis";
import {
  WebGl2OrderflowOverlay,
  type OverlayVisibility,
} from "../render/webgl2-orderflow-overlay";

export interface ChartPanelProps {
  transport: TransportAdapter;
  symbol: string;
  timeframe: string;
  tickSizeE9: bigint;
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
} {
  const base = symbol.startsWith("ETH") ? 3500 : symbol.startsWith("SOL") ? 185 : 50000;
  const step = symbol.startsWith("ETH") ? 4 : symbol.startsWith("SOL") ? 0.5 : 35;
  const nowSec = Math.floor(Date.now() / 60_000) * 60;
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];
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
    candles.push({ time: t, open, high, low, close });
    volumes.push({
      time: t,
      value: 15 + ((state >>> 16) % 85),
      color: close >= open ? "rgba(16, 185, 129, 0.35)" : "rgba(244, 63, 94, 0.35)",
    });
    price = close;
  }
  return { candles, volumes };
}

/**
 * 60 fps Chart Panel (Lightweight Charts v5.3.0 + WebGL2 Orderflow Overlay + Clean-Room Drawing Engine).
 * Strictly imperative ref + rAF pipeline — zero React state updates on binary ticks (AGENTS.md #5).
 */
export function ChartPanel({ transport, symbol, timeframe, tickSizeE9 }: ChartPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
    const overlayCanvas = overlayCanvasRef.current;
    const drawingCanvas = drawingCanvasRef.current;
    if (!el || !overlayCanvas || !drawingCanvas) return;

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

    const seeded = seedInitialCandles(symbol);
    let activeCandles: CandlestickData<UTCTimestamp>[] = [...seeded.candles];
    let activeVolumes: HistogramData<UTCTimestamp>[] = [...seeded.volumes];
    candleSeries.setData(activeCandles);
    volumeSeries.setData(activeVolumes);
    chart.timeScale().fitContent();

    const overlay = new WebGl2OrderflowOverlay(overlayCanvas);
    setRendererLabel(overlay.isWebGl2() ? "WebGL2" : "Canvas2D");

    const tickFloat = Number(tickSizeE9) / 1e9;
    let activeBarTimeSec = Number(activeCandles[activeCandles.length - 1]?.time ?? 0);
    let footprintCells: FootprintCell[] = [];
    let vpSummary: VolumeProfileSummary | null = null;
    let vpBins: VolumeProfileBin[] = [];
    let tpoRows: TpoRow128[] = [];

    let pendingBar: CandlestickData<UTCTimestamp> | null = null;
    let pendingVol: HistogramData<UTCTimestamp> | null = null;
    let pendingOverlayDirty = true;
    let draftAnchors: AnchorPoint[] = [];
    let hoverAnchor: AnchorPoint | null = null;
    let rafId = 0;

    const getBridge = () => ({
      timeToX: (timeSec: number): number | null => {
        const coord = chart.timeScale().timeToCoordinate(timeSec as UTCTimestamp);
        return coord === null ? null : Number(coord);
      },
      priceToY: (price: number): number | null => {
        const coord = candleSeries.priceToCoordinate(price);
        return coord === null ? null : Number(coord);
      },
    });

    const collectMagnetTargets = (): MagnetTarget[] => {
      const targets: MagnetTarget[] = [];
      const latest = activeCandles[activeCandles.length - 1];
      if (latest && tickFloat > 0) {
        targets.push(
          { priceTick: BigInt(Math.round(latest.open / tickFloat)), source: "ohlc" },
          { priceTick: BigInt(Math.round(latest.high / tickFloat)), source: "ohlc" },
          { priceTick: BigInt(Math.round(latest.low / tickFloat)), source: "ohlc" },
          { priceTick: BigInt(Math.round(latest.close / tickFloat)), source: "ohlc" },
        );
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

    const renderDrawings = (width: number, height: number) => {
      const ctx = drawingCanvas.getContext("2d");
      if (!ctx || width <= 0 || height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.floor(width * dpr);
      const pxH = Math.floor(height * dpr);
      if (drawingCanvas.width !== pxW || drawingCanvas.height !== pxH) {
        drawingCanvas.width = pxW;
        drawingCanvas.height = pxH;
        drawingCanvas.style.width = `${width}px`;
        drawingCanvas.style.height = `${height}px`;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const bridge = getBridge();
      const drawings = drawingEngineRef.current.list(symbol);

      const drawShape = (
        kind: PlacedDrawingKind,
        anchors: readonly AnchorPoint[],
        color: string,
        dashed = false,
      ) => {
        if (anchors.length === 0) return;
        const pts = anchors.map((a) => ({
          x: bridge.timeToX(a.timeSec) ?? width * 0.5,
          y: bridge.priceToY(Number(a.priceTick) * tickFloat) ?? height * 0.5,
          tick: a.priceTick,
        }));
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        if (dashed) ctx.setLineDash([4, 4]);

        if (kind === "horizontal_ray") {
          const p0 = pts[0];
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(width, p0.y);
          ctx.stroke();
          ctx.font = "10px ui-monospace, monospace";
          ctx.fillText(`H-RAY ${(Number(p0.tick) * tickFloat).toFixed(2)}`, p0.x + 6, p0.y - 4);
        } else if (kind === "anchored_vwap") {
          const p0 = pts[0];
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          // Compute cumulative anchor-to-present VWAP curve from activeCandles
          let cumPv = 0;
          let cumV = 0;
          for (let i = 0; i < activeCandles.length; i++) {
            const bar = activeCandles[i];
            if (Number(bar.time) < anchors[0].timeSec) continue;
            const typical = (bar.high + bar.low + bar.close) / 3;
            const vol = activeVolumes[i]?.value ?? 1;
            cumPv += typical * vol;
            cumV += vol;
            const bx = bridge.timeToX(Number(bar.time));
            const by = bridge.priceToY(cumV > 0 ? cumPv / cumV : typical);
            if (bx !== null && by !== null) {
              ctx.lineTo(bx, by);
            }
          }
          ctx.stroke();
          ctx.font = "10px ui-monospace, monospace";
          ctx.fillText("A-VWAP", p0.x + 6, p0.y - 5);
        } else if (pts.length >= 2) {
          const [p0, p1] = pts;
          if (kind === "trendline") {
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          } else if (kind === "box_zone") {
            const x = Math.min(p0.x, p1.x);
            const y = Math.min(p0.y, p1.y);
            const w = Math.abs(p1.x - p0.x);
            const h = Math.abs(p1.y - p0.y);
            ctx.save();
            ctx.globalAlpha = 0.16;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            ctx.strokeRect(x, y, w, h);
          } else if (kind === "fib_retracement") {
            const x0 = Math.min(p0.x, p1.x);
            const x1 = Math.max(p0.x, p1.x);
            ctx.font = "10px ui-monospace, monospace";
            for (const lvl of FIB_LEVELS) {
              const y = p0.y + (p1.y - p0.y) * lvl;
              ctx.beginPath();
              ctx.moveTo(x0, y);
              ctx.lineTo(x1, y);
              ctx.stroke();
              ctx.fillText(`${(lvl * 100).toFixed(1)}%`, x1 + 4, y + 3);
            }
          } else if (kind === "price_range") {
            const x = Math.min(p0.x, p1.x);
            const y = Math.min(p0.y, p1.y);
            const w = Math.abs(p1.x - p0.x);
            const h = Math.abs(p1.y - p0.y);
            ctx.save();
            ctx.globalAlpha = 0.14;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            ctx.strokeRect(x, y, w, h);
            const deltaTicks = p1.tick - p0.tick;
            const deltaPrice = Number(deltaTicks) * tickFloat;
            ctx.font = "10px ui-monospace, monospace";
            ctx.fillText(
              `${deltaPrice >= 0 ? "+" : ""}${deltaPrice.toFixed(2)} (${deltaTicks.toString()}t)`,
              x + 6,
              y + 13,
            );
          }
        }

        // Anchor handles
        ctx.setLineDash([]);
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };

      for (const drw of drawings) {
        drawShape(drw.kind, drw.anchors, drw.color, false);
      }

      if (draftAnchors.length > 0 && activeToolRef.current !== "cursor") {
        const preview = hoverAnchor ? [...draftAnchors, hoverAnchor] : draftAnchors;
        const meta = DRAWING_TOOL_META.find((m) => m.kind === activeToolRef.current);
        drawShape(
          activeToolRef.current as PlacedDrawingKind,
          preview,
          meta?.defaultColor ?? "#38bdf8",
          true,
        );
      }

      ctx.restore();
    };

    const flush = () => {
      rafId = 0;
      if (pendingBar) {
        const resCandle = applyBarHysteresis(activeCandles, pendingBar);
        activeCandles = resCandle.bars;
        const resVol = pendingVol ? applyBarHysteresis(activeVolumes, pendingVol) : null;
        if (resVol) activeVolumes = resVol.bars;
        if (resCandle.trimmed || resVol?.trimmed) {
          candleSeries.setData(activeCandles);
          volumeSeries.setData(activeVolumes);
        } else {
          candleSeries.update(pendingBar);
          if (pendingVol) volumeSeries.update(pendingVol);
        }
        activeBarTimeSec = Number(pendingBar.time);
        if (badgeRef.current) {
          badgeRef.current.textContent = `${symbol} · ${timeframe} · LAST ${pendingBar.close.toFixed(2)} · BARS ${activeCandles.length}`;
        }
        pendingBar = null;
        pendingVol = null;
        pendingOverlayDirty = true;
      }

      if (pendingOverlayDirty) {
        pendingOverlayDirty = false;
        const w = el.clientWidth;
        const h = el.clientHeight;
        overlay.render(
          w,
          h,
          {
            activeBarTimeSec,
            tickSizeFloat: tickFloat,
            footprintCells,
            vpSummary,
            vpBins,
            tpoRows,
            visibility: visibilityRef.current,
          },
          getBridge(),
        );
        renderDrawings(w, h);
      }
    };

    const scheduleFlush = () => {
      pendingOverlayDirty = true;
      if (rafId === 0) {
        rafId = requestAnimationFrame(flush);
      }
    };

    redrawTriggerRef.current = scheduleFlush;

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      scheduleFlush();
    });

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
          pendingBar = { time: t, open, high, low, close };
          pendingVol = {
            time: t,
            value: Number(latest.volumeE9) / 1e9,
            color: close >= open ? "rgba(16, 185, 129, 0.45)" : "rgba(244, 63, 94, 0.45)",
          };
          scheduleFlush();
        } else if (hdr.frameType === FrameType.LIVE_FOOTPRINT_DELTA) {
          const decoded = decodeFootprintDelta(buf);
          footprintCells = decoded.cells;
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
      const rect = drawingCanvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const rawPrice = candleSeries.coordinateToPrice(y);
      if (rawPrice === null || tickFloat <= 0) return null;
      const rawTime = chart.timeScale().coordinateToTime(x);
      const timeSec =
        typeof rawTime === "number"
          ? rawTime
          : activeBarTimeSec || Math.floor(Date.now() / 1000);
      let priceTick = BigInt(Math.round(Number(rawPrice) / tickFloat));
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

    drawingCanvas.addEventListener("pointerdown", onPointerDown);
    drawingCanvas.addEventListener("pointermove", onPointerMove);

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
      drawingCanvas.removeEventListener("pointerdown", onPointerDown);
      drawingCanvas.removeEventListener("pointermove", onPointerMove);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      overlay.dispose();
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, symbol, timeframe, tickSizeE9]);

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
    drawingEngineRef.current.clear();
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
            {symbol} · {timeframe} · LWC v5.3 + {rendererLabel}
          </span>
        </div>
        <div ref={hostRef} className="h-full w-full" />
        <canvas
          ref={overlayCanvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        />
        <canvas
          ref={drawingCanvasRef}
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
