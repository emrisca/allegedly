import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  decodeFrameHeader,
  decodeLiveBarUpdateBatch,
  FrameType,
  type TransportAdapter,
} from "@allegedly/ipc-client";

export interface ChartPanelProps {
  transport: TransportAdapter;
  symbol: string;
  timeframe: string;
  tickSizeE9: bigint;
}

function seedInitialCandles(symbol: string): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
} {
  const base = symbol === "ETH/USD" ? 3420 : symbol === "SOL/USD" ? 238.5 : 95000;
  const step = symbol === "ETH/USD" ? 1.8 : symbol === "SOL/USD" ? 0.25 : 42;
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
 * 60 fps Chart Panel (Lightweight Charts v5.3.0).
 * Strictly imperative ref + rAF pipeline — zero React state updates on binary ticks (AGENTS.md #5).
 */
export function ChartPanel({ transport, symbol, timeframe, tickSizeE9 }: ChartPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

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
    candleSeries.setData(seeded.candles);
    volumeSeries.setData(seeded.volumes);
    chart.timeScale().fitContent();

    let pendingBar: CandlestickData<UTCTimestamp> | null = null;
    let pendingVol: HistogramData<UTCTimestamp> | null = null;
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (pendingBar) {
        candleSeries.update(pendingBar);
        if (badgeRef.current) {
          badgeRef.current.textContent = `${symbol} · ${timeframe} · LAST ${pendingBar.close.toFixed(2)}`;
        }
        pendingBar = null;
      }
      if (pendingVol) {
        volumeSeries.update(pendingVol);
        pendingVol = null;
      }
    };

    const tickFloat = Number(tickSizeE9) / 1e9;

    const unsub = transport.subscribeBinary(1, (buf) => {
      try {
        const hdr = decodeFrameHeader(buf);
        if (hdr.frameType !== FrameType.LIVE_BAR_UPDATE_BATCH) return;
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
        if (rafId === 0) {
          rafId = requestAnimationFrame(flush);
        }
      } catch {
        // Ignore non-bar or partial frames
      }
    });

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.resize(Math.floor(width), Math.floor(height));
      }
    });
    ro.observe(el);

    return () => {
      unsub();
      ro.disconnect();
      if (rafId !== 0) cancelAnimationFrame(rafId);
      chart.remove();
    };
  }, [transport, symbol, timeframe, tickSizeE9]);

  return (
    <div className="relative flex h-full w-full flex-col bg-zinc-950">
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex items-center gap-2">
        <span
          ref={badgeRef}
          className="rounded border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] text-zinc-200"
        >
          {symbol} · {timeframe} · LWC v5.3 + WebGL2 READY
        </span>
      </div>
      <div ref={hostRef} className="h-full w-full flex-1" />
    </div>
  );
}
