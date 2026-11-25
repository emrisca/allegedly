import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import { applyLiveTick, generateDataset, TICK_SIZE, type GeneratedDataset } from './dataGen';
import { LwcSyncPrimitive, type LwcPaintSnapshot } from './SyncPrimitive';
import { WebGLOrderflowOverlay, type RenderStats, type WebGLHardwareInfo } from './webglOrderflow';

export type SyncMode = 'primitive-hook' | 'range-raf' | 'lwc-only';

interface DriftSample {
  coordDriftCssPx: number;
  coordDriftPhysPx: number;
  pixelCentroidDriftCssPx: number | null;
  pixelCentroidDriftPhysPx: number | null;
  paintDeltaMs: number;
}

interface AlignmentReport {
  scenario: string;
  syncMode: SyncMode;
  samples: number;
  dpr: number;
  coordDriftCssMax: number;
  coordDriftCssP95: number;
  coordDriftPhysMax: number;
  pixelDriftCssMax: number | null;
  pixelDriftCssP95: number | null;
  pixelDriftPhysMax: number | null;
  laggingFrames: number;
  paintDeltaMsP95: number;
}

interface PerfReport {
  syncMode: SyncMode;
  loadedBars: number;
  visibleBars: number;
  tickHz: number;
  durationMs: number;
  frames: number;
  effectiveFps: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsP99: number;
  frameMsMax: number;
  jsWorkMsP50: number;
  jsWorkMsP95: number;
  jsWorkMsP99: number;
  glDrawCpuMsP50: number;
  glDrawCpuMsP95: number;
  glDrawCpuMsP99: number;
  stallsOver20ms: number;
  stallsOver33ms: number;
  avgQuads: number;
  avgGlyphs: number;
  avgVisibleFootprintBars: number;
  driftCssMax: number;
  driftCssP95: number;
  jsHeapStartMB: number | null;
  jsHeapEndMB: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function readLwcFiducialCentroid(
  canvas: HTMLCanvasElement,
  expectedX: number,
  expectedY: number,
  radius = 24,
): { x: number; y: number; pixels: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const x0 = Math.max(0, Math.floor(expectedX - radius));
  const y0 = Math.max(0, Math.floor(expectedY - radius));
  const x1 = Math.min(canvas.width - 1, Math.ceil(expectedX + radius));
  const y1 = Math.min(canvas.height - 1, Math.ceil(expectedY + radius));
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  if (rw <= 0 || rh <= 0) return null;

  const img = ctx.getImageData(x0, y0, rw, rh).data;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let row = 0; row < rh; row++) {
    for (let col = 0; col < rw; col++) {
      const idx = (row * rw + col) * 4;
      const r = img[idx];
      const g = img[idx + 1];
      const b = img[idx + 2];
      const a = img[idx + 3];
      if (r < 25 && g > 235 && b > 235 && a > 235) {
        sumX += x0 + col + 0.5;
        sumY += y0 + row + 0.5;
        count++;
      }
    }
  }
  if (count === 0) return null;
  return { x: sumX / count, y: sumY / count, pixels: count };
}

declare global {
  interface Window {
    __S01__?: {
      ready: boolean;
      getInfo: () => {
        hwInfo: WebGLHardwareInfo;
        barCount: number;
        load100kMs: number;
        firstPaintMs: number;
        windowDpr: number;
        lwcDpr: number;
        pane0Css: { w: number; h: number };
        pane0Bitmap: { w: number; h: number };
        lastStats: RenderStats | null;
      };
      measureIdleRaf: (frames: number) => Promise<{ p50: number; p95: number; max: number; fps: number }>;
      setSyncMode: (mode: SyncMode) => void;
      setVisibleBars: (count: number) => void;
      loadWindowedDataset: (barCount: number) => number;
      measureAlignment: (scenario: 'rest' | 'rapid-pan' | 'rapid-zoom' | 'resize') => Promise<AlignmentReport>;
      runPerfBenchmark: (opts: {
        durationMs: number;
        visibleBars: number;
        tickHz: number;
        mode: SyncMode;
      }) => Promise<PerfReport>;
    };
  }
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<string>('Initializing S01...');

  useEffect(() => {
    const container = containerRef.current!;
    const glCanvas = glCanvasRef.current!;

    let dataset: GeneratedDataset = generateDataset(100_000, 2_000);
    const overlay = new WebGLOrderflowOverlay(glCanvas);

    const tLoadStart = performance.now();
    const chart: IChartApi = createChart(container, {
      width: container.clientWidth || 1440,
      height: container.clientHeight || 900,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0e14' },
        textColor: '#94a3b8',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 2.4,
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.16)',
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries: ISeriesApi<'Candlestick'> = chart.addSeries(
      CandlestickSeries,
      {
        upColor: 'rgba(34, 197, 94, 0.35)',
        downColor: 'rgba(239, 68, 68, 0.35)',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      },
      0,
    );
    const volSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
      },
      1,
    );
    const rsiSeries = chart.addSeries(
      LineSeries,
      {
        color: '#38bdf8',
        lineWidth: 2,
      },
      2,
    );

    const panes = chart.panes();
    if (panes.length >= 3) {
      panes[0].setStretchFactor(5);
      panes[1].setStretchFactor(1.2);
      panes[2].setStretchFactor(1.2);
    }

    candleSeries.setData(dataset.candles);
    volSeries.setData(dataset.volumeBars);
    rsiSeries.setData(dataset.rsiLine);

    chart.timeScale().setVisibleLogicalRange({
      from: dataset.barCount - 500,
      to: dataset.barCount + 5,
    });

    const load100kMs = performance.now() - tLoadStart;

    let syncMode: SyncMode = 'primitive-hook';
    let lastStats: RenderStats | null = null;
    let lastGlPaintMs = 0;
    let lastGlFiducialX: number | null = null;
    let lastGlFiducialY: number | null = null;
    let rafPending = false;
    let firstPaintMs = 0;

    const renderOverlayFromSnap = (snap: LwcPaintSnapshot) => {
      overlay.syncBackingStore(
        snap.mediaWidth,
        snap.mediaHeight,
        snap.bitmapWidth,
        snap.bitmapHeight,
      );
      lastStats = overlay.render(
        chart,
        candleSeries,
        dataset,
        snap.horizontalPixelRatio,
        snap.verticalPixelRatio,
        primitive.calibrationAnchor,
      );
      lastGlPaintMs = performance.now();
      lastGlFiducialX = lastStats.fiducialGlPhysX;
      lastGlFiducialY = lastStats.fiducialGlPhysY;
      if (firstPaintMs === 0) {
        firstPaintMs = performance.now() - tLoadStart;
      }
    };

    const primitive = new LwcSyncPrimitive((snap) => {
      if (syncMode === 'primitive-hook') {
        renderOverlayFromSnap(snap);
      }
    });
    candleSeries.attachPrimitive(primitive);

    const onRangeChange = () => {
      if (syncMode !== 'range-raf') return;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const snap = primitive.lastSnapshot;
        if (snap) {
          renderOverlayFromSnap(snap);
        }
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.resize(Math.floor(width), Math.floor(height));
          if (syncMode === 'range-raf' && primitive.lastSnapshot) {
            onRangeChange();
          }
        }
      }
    });
    ro.observe(container);

    const sampleDriftOnce = (): DriftSample | null => {
      const snap = primitive.lastSnapshot;
      if (!snap || snap.anchorPhysX === null || snap.anchorPhysY === null) return null;
      if (lastGlFiducialX === null || lastGlFiducialY === null) return null;

      const dpr = snap.horizontalPixelRatio || window.devicePixelRatio || 1;
      const dxCoord = Math.abs(snap.anchorPhysX - lastGlFiducialX);
      const dyCoord = Math.abs(snap.anchorPhysY - lastGlFiducialY);
      const coordPhys = Math.hypot(dxCoord, dyCoord);

      let pixelPhys: number | null = null;
      if (snap.lwcCanvas) {
        const lwcC = readLwcFiducialCentroid(snap.lwcCanvas, snap.anchorPhysX, snap.anchorPhysY, 32);
        const glC = overlay.readFiducialCentroid(lastGlFiducialX, lastGlFiducialY, 32);
        if (lwcC && glC) {
          pixelPhys = Math.hypot(lwcC.x - glC.x, lwcC.y - glC.y);
        }
      }

      return {
        coordDriftPhysPx: coordPhys,
        coordDriftCssPx: coordPhys / dpr,
        pixelCentroidDriftPhysPx: pixelPhys,
        pixelCentroidDriftCssPx: pixelPhys !== null ? pixelPhys / dpr : null,
        paintDeltaMs: Math.abs(lastGlPaintMs - snap.timestampMs),
      };
    };

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const measureIdleRaf = async (frames: number) => {
      const dts: number[] = [];
      await nextFrame();
      let prev = performance.now();
      for (let i = 0; i < frames; i++) {
        await nextFrame();
        const now = performance.now();
        dts.push(now - prev);
        prev = now;
      }
      const total = dts.reduce((a, b) => a + b, 0);
      dts.sort((a, b) => a - b);
      return {
        p50: percentile(dts, 50),
        p95: percentile(dts, 95),
        max: dts[dts.length - 1] ?? 0,
        fps: (frames / total) * 1000,
      };
    };

    const measureAlignment = async (
      scenario: 'rest' | 'rapid-pan' | 'rapid-zoom' | 'resize',
    ): Promise<AlignmentReport> => {
      const anchorBarIndex = dataset.barCount - 250;
      const anchorPrice = dataset.closeTicks[anchorBarIndex] * TICK_SIZE;
      primitive.calibrationAnchor = { barIndex: anchorBarIndex, price: anchorPrice };

      chart.timeScale().setVisibleLogicalRange({
        from: dataset.barCount - 500,
        to: dataset.barCount + 2,
      });
      await nextFrame();
      await nextFrame();

      const samples: DriftSample[] = [];
      let laggingFrames = 0;

      if (scenario === 'rest') {
        for (let i = 0; i < 15; i++) {
          await nextFrame();
          const s = sampleDriftOnce();
          if (s) samples.push(s);
        }
      } else if (scenario === 'rapid-pan') {
        for (let step = 0; step < 90; step++) {
          const offset = Math.sin(step * 0.14) * 140;
          chart.timeScale().setVisibleLogicalRange({
            from: dataset.barCount - 500 + offset,
            to: dataset.barCount + 2 + offset,
          });
          await nextFrame();
          const s = sampleDriftOnce();
          if (s) {
            samples.push(s);
            if (s.coordDriftCssPx > 0.5) laggingFrames++;
          }
        }
      } else if (scenario === 'rapid-zoom') {
        for (let step = 0; step < 90; step++) {
          const span = 180 + Math.round((Math.sin(step * 0.16) * 0.5 + 0.5) * 420);
          chart.timeScale().setVisibleLogicalRange({
            from: anchorBarIndex - span * 0.5,
            to: anchorBarIndex + span * 0.5,
          });
          await nextFrame();
          const s = sampleDriftOnce();
          if (s) {
            samples.push(s);
            if (s.coordDriftCssPx > 0.5) laggingFrames++;
          }
        }
      } else if (scenario === 'resize') {
        const sizes = [
          [1280, 720],
          [1440, 900],
          [1024, 640],
          [1440, 900],
        ];
        for (const [w, h] of sizes) {
          chart.resize(w, h);
          await nextFrame();
          const s = sampleDriftOnce();
          if (s) {
            samples.push(s);
            if (s.coordDriftCssPx > 0.5) laggingFrames++;
          }
          await nextFrame();
          const s2 = sampleDriftOnce();
          if (s2) samples.push(s2);
        }
      }

      primitive.calibrationAnchor = null;
      chart.timeScale().setVisibleLogicalRange({
        from: dataset.barCount - 500,
        to: dataset.barCount + 5,
      });
      await nextFrame();

      const coordCss = samples.map((s) => s.coordDriftCssPx).sort((a, b) => a - b);
      const coordPhys = samples.map((s) => s.coordDriftPhysPx).sort((a, b) => a - b);
      const pixCss = samples
        .map((s) => s.pixelCentroidDriftCssPx)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      const pixPhys = samples
        .map((s) => s.pixelCentroidDriftPhysPx)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      const deltas = samples.map((s) => s.paintDeltaMs).sort((a, b) => a - b);

      return {
        scenario,
        syncMode,
        samples: samples.length,
        dpr: primitive.lastSnapshot?.horizontalPixelRatio ?? (window.devicePixelRatio || 1),
        coordDriftCssMax: coordCss.length ? coordCss[coordCss.length - 1] : 0,
        coordDriftCssP95: percentile(coordCss, 95),
        coordDriftPhysMax: coordPhys.length ? coordPhys[coordPhys.length - 1] : 0,
        pixelDriftCssMax: pixCss.length ? pixCss[pixCss.length - 1] : null,
        pixelDriftCssP95: pixCss.length ? percentile(pixCss, 95) : null,
        pixelDriftPhysMax: pixPhys.length ? pixPhys[pixPhys.length - 1] : null,
        laggingFrames,
        paintDeltaMsP95: percentile(deltas, 95),
      };
    };

    const runPerfBenchmark = async (opts: {
      durationMs: number;
      visibleBars: number;
      tickHz: number;
      mode: SyncMode;
    }): Promise<PerfReport> => {
      syncMode = opts.mode;
      const anchorBarIndex = dataset.barCount - Math.floor(opts.visibleBars * 0.5);
      primitive.calibrationAnchor =
        opts.mode === 'lwc-only'
          ? null
          : {
              barIndex: anchorBarIndex,
              price: dataset.closeTicks[anchorBarIndex] * TICK_SIZE,
            };

      const baseFrom = dataset.barCount - opts.visibleBars;
      const baseTo = dataset.barCount + 4;
      chart.timeScale().setVisibleLogicalRange({ from: baseFrom, to: baseTo });
      await nextFrame();
      await nextFrame();

      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const jsHeapStartMB = mem ? mem.usedJSHeapSize / (1024 * 1024) : null;

      const frameTimes: number[] = [];
      const jsWorkTimes: number[] = [];
      const glTimes: number[] = [];
      const driftCss: number[] = [];
      let totalQuads = 0;
      let totalGlyphs = 0;
      let totalFpBars = 0;
      let stallsOver20ms = 0;
      let stallsOver33ms = 0;

      let tickSeq = 0;
      const tickIntervalMs = opts.tickHz > 0 ? 1000 / opts.tickHz : Number.POSITIVE_INFINITY;
      let lastTickTime = performance.now();

      const start = performance.now();
      let prevFrame = start;
      let step = 0;

      while (performance.now() - start < opts.durationMs) {
        const workStart = performance.now();
        const panShift = Math.sin(step * 0.08) * 180 - 180;
        const zoomJitter = Math.sin(step * 0.05) * 12;
        chart.timeScale().setVisibleLogicalRange({
          from: baseFrom + panShift - zoomJitter,
          to: baseTo + panShift + zoomJitter,
        });

        if (workStart - lastTickTime >= tickIntervalMs) {
          lastTickTime = workStart;
          const upd = applyLiveTick(dataset, ++tickSeq);
          candleSeries.update(upd.candle);
          volSeries.update(upd.deltaBar);
        }
        const workEnd = performance.now();
        jsWorkTimes.push(workEnd - workStart);

        await nextFrame();
        const after = performance.now();
        const dt = after - prevFrame;
        prevFrame = after;

        frameTimes.push(dt);
        if (dt > 20.0) stallsOver20ms++;
        if (dt > 33.33) stallsOver33ms++;

        if (lastStats && opts.mode !== 'lwc-only') {
          glTimes.push(lastStats.drawCpuMs);
          totalQuads += lastStats.quadCount;
          totalGlyphs += lastStats.glyphCount;
          totalFpBars += lastStats.visibleFootprintBars;
        }

        const snap = primitive.lastSnapshot;
        if (
          opts.mode !== 'lwc-only' &&
          snap &&
          snap.anchorPhysX !== null &&
          snap.anchorPhysY !== null &&
          lastGlFiducialX !== null &&
          lastGlFiducialY !== null
        ) {
          const dpr = snap.horizontalPixelRatio || 1;
          const d = Math.hypot(snap.anchorPhysX - lastGlFiducialX, snap.anchorPhysY - lastGlFiducialY) / dpr;
          driftCss.push(d);
        }
        step++;
      }

      const elapsed = performance.now() - start;
      const jsHeapEndMB = mem ? mem.usedJSHeapSize / (1024 * 1024) : null;
      primitive.calibrationAnchor = null;

      frameTimes.sort((a, b) => a - b);
      jsWorkTimes.sort((a, b) => a - b);
      glTimes.sort((a, b) => a - b);
      driftCss.sort((a, b) => a - b);

      const n = Math.max(1, frameTimes.length);
      return {
        syncMode: opts.mode,
        loadedBars: dataset.barCount,
        visibleBars: opts.visibleBars,
        tickHz: opts.tickHz,
        durationMs: elapsed,
        frames: frameTimes.length,
        effectiveFps: (frameTimes.length / elapsed) * 1000,
        frameMsP50: percentile(frameTimes, 50),
        frameMsP95: percentile(frameTimes, 95),
        frameMsP99: percentile(frameTimes, 99),
        frameMsMax: frameTimes.length ? frameTimes[frameTimes.length - 1] : 0,
        jsWorkMsP50: percentile(jsWorkTimes, 50),
        jsWorkMsP95: percentile(jsWorkTimes, 95),
        jsWorkMsP99: percentile(jsWorkTimes, 99),
        glDrawCpuMsP50: percentile(glTimes, 50),
        glDrawCpuMsP95: percentile(glTimes, 95),
        glDrawCpuMsP99: percentile(glTimes, 99),
        stallsOver20ms,
        stallsOver33ms,
        avgQuads: Math.round(totalQuads / n),
        avgGlyphs: Math.round(totalGlyphs / n),
        avgVisibleFootprintBars: Math.round(totalFpBars / n),
        driftCssMax: driftCss.length ? driftCss[driftCss.length - 1] : 0,
        driftCssP95: percentile(driftCss, 95),
        jsHeapStartMB,
        jsHeapEndMB,
      };
    };

    window.__S01__ = {
      ready: true,
      getInfo: () => ({
        hwInfo: overlay.hwInfo,
        barCount: dataset.barCount,
        load100kMs,
        firstPaintMs,
        windowDpr: window.devicePixelRatio || 1,
        lwcDpr: primitive.lastSnapshot?.horizontalPixelRatio ?? (window.devicePixelRatio || 1),
        pane0Css: {
          w: primitive.lastSnapshot?.mediaWidth ?? 0,
          h: primitive.lastSnapshot?.mediaHeight ?? 0,
        },
        pane0Bitmap: {
          w: primitive.lastSnapshot?.bitmapWidth ?? 0,
          h: primitive.lastSnapshot?.bitmapHeight ?? 0,
        },
        lastStats,
      }),
      measureIdleRaf,
      setSyncMode: (m: SyncMode) => {
        syncMode = m;
      },
      setVisibleBars: (count: number) => {
        chart.timeScale().setVisibleLogicalRange({
          from: dataset.barCount - count,
          to: dataset.barCount + 4,
        });
      },
      loadWindowedDataset: (barCount: number) => {
        const t0 = performance.now();
        dataset = generateDataset(barCount, Math.min(barCount, 2_000));
        candleSeries.setData(dataset.candles);
        volSeries.setData(dataset.volumeBars);
        rsiSeries.setData(dataset.rsiLine);
        chart.timeScale().setVisibleLogicalRange({
          from: dataset.barCount - 500,
          to: dataset.barCount + 5,
        });
        return performance.now() - t0;
      },
      measureAlignment,
      runPerfBenchmark,
    };

    setHud(
      `S01 Ready | LWC v5.3.0 | 100k bars loaded in ${load100kMs.toFixed(1)}ms | GPU: ${overlay.hwInfo.unmaskedRenderer}`,
    );

    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
      chart.remove();
      overlay.destroy();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <canvas
        ref={glCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 10,
          zIndex: 10,
          padding: '4px 8px',
          background: 'rgba(11, 14, 20, 0.85)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          borderRadius: 4,
          fontSize: 11,
          pointerEvents: 'none',
        }}
      >
        {hud}
      </div>
    </div>
  );
}
