import { useEffect, useRef, useState } from 'react';
import {
  DOM_LEVELS,
  TAPE_ROWS,
  TICK_SIZE,
  subscribeBookTransient,
  useDomStore,
  type BookSnapshot,
} from './bookStore';

export type RenderStrategy = 'react-state' | 'imperative-dom-contained' | 'canvas2d';

interface StrategyBenchResult {
  strategy: RenderStrategy;
  updateHz: number;
  deltasPerSec: number;
  durationMs: number;
  frames: number;
  effectiveFps: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsP99: number;
  frameMsMax: number;
  renderCpuMsP50: number;
  renderCpuMsP95: number;
  renderCpuMsP99: number;
  droppedOver16_7ms: number;
  stallsOver20ms: number;
  stallsOver33ms: number;
  totalDeltasApplied: number;
  reactCommits: number;
}

const MAX_SIZE_SCALE = 350;

function formatTickPrice(tick: number): string {
  return (tick * TICK_SIZE).toFixed(2);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// Strategy 1: Standard React state re-rendering all 100 DOM rows + 50 Tape rows
function ReactStateLadder({ onCommit }: { onCommit: () => void }) {
  const version = useDomStore((s) => s.reactiveVersion);
  const book = useDomStore((s) => s.book);
  void version;

  useEffect(() => {
    onCommit();
  });

  const rows = [];
  for (let i = 0; i < DOM_LEVELS; i++) {
    const bid = book.bidSizes[i];
    const ask = book.askSizes[i];
    const bidPct = Math.min(100, (bid / MAX_SIZE_SCALE) * 100);
    const askPct = Math.min(100, (ask / MAX_SIZE_SCALE) * 100);
    rows.push(
      <div
        key={i}
        className="grid grid-cols-[64px_92px_78px_92px_64px] items-center h-[18px] text-[11px] border-b border-slate-800/60"
      >
        <div className="px-1 text-right text-slate-400">{book.bidVolAtPrice[i]}</div>
        <div className="relative h-full flex items-center justify-end pr-1.5 overflow-hidden">
          {bid > 0 && (
            <div
              className="absolute inset-y-0 right-0 bg-emerald-500/25"
              style={{ width: `${bidPct}%` }}
            />
          )}
          <span className="relative z-10 text-emerald-300">{bid || ''}</span>
        </div>
        <div className="text-center font-semibold text-slate-200 bg-slate-900">
          {formatTickPrice(book.priceTicks[i])}
        </div>
        <div className="relative h-full flex items-center justify-start pl-1.5 overflow-hidden">
          {ask > 0 && (
            <div
              className="absolute inset-y-0 left-0 bg-rose-500/25"
              style={{ width: `${askPct}%` }}
            />
          )}
          <span className="relative z-10 text-rose-300">{ask || ''}</span>
        </div>
        <div className="px-1 text-left text-slate-400">{book.askVolAtPrice[i]}</div>
      </div>,
    );
  }

  const tapeRows = [];
  for (let i = 0; i < TAPE_ROWS; i++) {
    const idx = (book.tapeHead - i + TAPE_ROWS) % TAPE_ROWS;
    const t = book.tape[idx];
    tapeRows.push(
      <div
        key={i}
        className={`grid grid-cols-[96px_74px_48px] h-[18px] text-[11px] px-2 items-center border-b border-slate-800/40 ${
          t.aggressor === 1 ? 'text-emerald-300' : 'text-rose-300'
        }`}
      >
        <span className="text-slate-400">{t.timeStr}</span>
        <span>{formatTickPrice(t.priceTick)}</span>
        <span className="text-right font-semibold">{t.qty}</span>
      </div>,
    );
  }

  return (
    <div className="flex gap-3 h-full p-2">
      <div className="w-[400px] h-full overflow-y-auto border border-slate-800 bg-slate-950">
        {rows}
      </div>
      <div className="w-[235px] h-full overflow-y-auto border border-slate-800 bg-slate-950">
        {tapeRows}
      </div>
    </div>
  );
}

// Strategy 2: Imperative DOM Refs + Tailwind v4 + CSS containment (`contain: strict`, `transform: scaleX`)
// Zero React re-renders during hot updates!
function ImperativeContainedLadder({
  onPaintCost,
}: {
  onPaintCost: (ms: number) => void;
}) {
  const initialBook = useDomStore.getState().book;

  const bidVolRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bidTextRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bidBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const askTextRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const askBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const askVolRefs = useRef<(HTMLDivElement | null)[]>([]);

  const tapeTimeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tapePriceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tapeQtyRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tapeRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let pendingBook: BookSnapshot | null = null;
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      const book = pendingBook;
      if (!book) return;
      pendingBook = null;

      const t0 = performance.now();
      for (let i = 0; i < DOM_LEVELS; i++) {
        if (!book.dirtyMask[i]) continue;
        const bid = book.bidSizes[i];
        const ask = book.askSizes[i];

        const bt = bidTextRefs.current[i];
        if (bt) bt.textContent = bid > 0 ? String(bid) : '';
        const bb = bidBarRefs.current[i];
        if (bb) bb.style.transform = `scaleX(${Math.min(1, bid / MAX_SIZE_SCALE)})`;
        const bv = bidVolRefs.current[i];
        if (bv) bv.textContent = String(book.bidVolAtPrice[i]);

        const at = askTextRefs.current[i];
        if (at) at.textContent = ask > 0 ? String(ask) : '';
        const ab = askBarRefs.current[i];
        if (ab) ab.style.transform = `scaleX(${Math.min(1, ask / MAX_SIZE_SCALE)})`;
        const av = askVolRefs.current[i];
        if (av) av.textContent = String(book.askVolAtPrice[i]);
      }

      for (let i = 0; i < TAPE_ROWS; i++) {
        const idx = (book.tapeHead - i + TAPE_ROWS) % TAPE_ROWS;
        const t = book.tape[idx];
        const r = tapeRowRefs.current[i];
        if (r) {
          r.style.color = t.aggressor === 1 ? '#6ee7b7' : '#fda4af';
        }
        const tt = tapeTimeRefs.current[i];
        if (tt) tt.textContent = t.timeStr;
        const tp = tapePriceRefs.current[i];
        if (tp) tp.textContent = formatTickPrice(t.priceTick);
        const tq = tapeQtyRefs.current[i];
        if (tq) tq.textContent = String(t.qty);
      }

      onPaintCost(performance.now() - t0);
    };

    const unsub = subscribeBookTransient((book) => {
      pendingBook = book;
      if (!rafId) {
        rafId = requestAnimationFrame(flush);
      }
    });

    return () => {
      unsub();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [onPaintCost]);

  const domIndices = Array.from({ length: DOM_LEVELS }, (_, i) => i);
  const tapeIndices = Array.from({ length: TAPE_ROWS }, (_, i) => i);

  return (
    <div className="flex gap-3 h-full p-2">
      <div className="dom-ladder-contained w-[400px] h-full overflow-y-auto border border-slate-800 bg-slate-950">
        {domIndices.map((i) => (
          <div
            key={i}
            className="dom-row-contained grid grid-cols-[64px_92px_78px_92px_64px] items-center text-[11px] border-b border-slate-800/60"
          >
            <div
              ref={(el) => {
                bidVolRefs.current[i] = el;
              }}
              className="px-1 text-right text-slate-400"
            >
              {initialBook.bidVolAtPrice[i]}
            </div>
            <div className="relative h-full flex items-center justify-end pr-1.5 overflow-hidden">
              <div
                ref={(el) => {
                  bidBarRefs.current[i] = el;
                }}
                className="depth-bar-gpu-right absolute inset-0 bg-emerald-500/25"
                style={{
                  transform: `scaleX(${Math.min(1, initialBook.bidSizes[i] / MAX_SIZE_SCALE)})`,
                }}
              />
              <span
                ref={(el) => {
                  bidTextRefs.current[i] = el;
                }}
                className="relative z-10 text-emerald-300"
              >
                {initialBook.bidSizes[i] || ''}
              </span>
            </div>
            <div className="text-center font-semibold text-slate-200 bg-slate-900">
              {formatTickPrice(initialBook.priceTicks[i])}
            </div>
            <div className="relative h-full flex items-center justify-start pl-1.5 overflow-hidden">
              <div
                ref={(el) => {
                  askBarRefs.current[i] = el;
                }}
                className="depth-bar-gpu absolute inset-0 bg-rose-500/25"
                style={{
                  transform: `scaleX(${Math.min(1, initialBook.askSizes[i] / MAX_SIZE_SCALE)})`,
                }}
              />
              <span
                ref={(el) => {
                  askTextRefs.current[i] = el;
                }}
                className="relative z-10 text-rose-300"
              >
                {initialBook.askSizes[i] || ''}
              </span>
            </div>
            <div
              ref={(el) => {
                askVolRefs.current[i] = el;
              }}
              className="px-1 text-left text-slate-400"
            >
              {initialBook.askVolAtPrice[i]}
            </div>
          </div>
        ))}
      </div>
      <div className="dom-ladder-contained w-[235px] h-full overflow-y-auto border border-slate-800 bg-slate-950">
        {tapeIndices.map((i) => (
          <div
            key={i}
            ref={(el) => {
              tapeRowRefs.current[i] = el;
            }}
            className="dom-row-contained grid grid-cols-[96px_74px_48px] text-[11px] px-2 items-center border-b border-slate-800/40 text-emerald-300"
          >
            <span
              ref={(el) => {
                tapeTimeRefs.current[i] = el;
              }}
              className="text-slate-400"
            >
              14:30:00.000
            </span>
            <span
              ref={(el) => {
                tapePriceRefs.current[i] = el;
              }}
            >
              5800.00
            </span>
            <span
              ref={(el) => {
                tapeQtyRefs.current[i] = el;
              }}
              className="text-right font-semibold"
            >
              1
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Strategy 3: Pure DPR-aware Canvas2D DOM Ladder + Time & Sales Tape (zero DOM nodes mutated per tick)
function Canvas2DLadder({ onPaintCost }: { onPaintCost: (ms: number) => void }) {
  const domCanvasRef = useRef<HTMLCanvasElement>(null);
  const tapeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const domCanvas = domCanvasRef.current!;
    const tapeCanvas = tapeCanvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const rowH = 18;
    const domW = 400;
    const domH = Math.min(860, DOM_LEVELS * rowH);
    const tapeW = 235;
    const tapeH = Math.min(860, TAPE_ROWS * rowH);

    domCanvas.width = domW * dpr;
    domCanvas.height = domH * dpr;
    domCanvas.style.width = `${domW}px`;
    domCanvas.style.height = `${domH}px`;

    tapeCanvas.width = tapeW * dpr;
    tapeCanvas.height = tapeH * dpr;
    tapeCanvas.style.width = `${tapeW}px`;
    tapeCanvas.style.height = `${tapeH}px`;

    const domCtx = domCanvas.getContext('2d')!;
    const tapeCtx = tapeCanvas.getContext('2d')!;
    domCtx.scale(dpr, dpr);
    tapeCtx.scale(dpr, dpr);

    const visibleDomRows = Math.floor(domH / rowH);
    const visibleTapeRows = Math.floor(tapeH / rowH);

    let pendingBook: BookSnapshot | null = useDomStore.getState().book;
    let rafId = 0;

    const paint = () => {
      rafId = 0;
      const book = pendingBook;
      if (!book) return;
      pendingBook = null;

      const t0 = performance.now();

      // Paint visible DOM Ladder rows (centered around midIndex)
      const startRow = Math.max(0, book.midIndex - Math.floor(visibleDomRows / 2));
      domCtx.fillStyle = '#020617';
      domCtx.fillRect(0, 0, domW, domH);
      domCtx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      domCtx.textBaseline = 'middle';

      for (let r = 0; r < visibleDomRows && startRow + r < DOM_LEVELS; r++) {
        const idx = startRow + r;
        const y = r * rowH;
        const bid = book.bidSizes[idx];
        const ask = book.askSizes[idx];

        // Price center column background
        domCtx.fillStyle = '#0f172a';
        domCtx.fillRect(156, y, 78, rowH - 1);

        // Bid bar
        if (bid > 0) {
          const w = Math.min(92, (bid / MAX_SIZE_SCALE) * 92);
          domCtx.fillStyle = 'rgba(16, 185, 129, 0.25)';
          domCtx.fillRect(156 - w, y, w, rowH - 1);
        }
        // Ask bar
        if (ask > 0) {
          const w = Math.min(92, (ask / MAX_SIZE_SCALE) * 92);
          domCtx.fillStyle = 'rgba(244, 63, 94, 0.25)';
          domCtx.fillRect(234, y, w, rowH - 1);
        }

        const midY = y + rowH * 0.5;
        domCtx.textAlign = 'right';
        domCtx.fillStyle = '#94a3b8';
        domCtx.fillText(String(book.bidVolAtPrice[idx]), 60, midY);
        if (bid > 0) {
          domCtx.fillStyle = '#6ee7b7';
          domCtx.fillText(String(bid), 150, midY);
        }
        domCtx.textAlign = 'center';
        domCtx.fillStyle = '#e2e8f0';
        domCtx.fillText(formatTickPrice(book.priceTicks[idx]), 195, midY);

        domCtx.textAlign = 'left';
        if (ask > 0) {
          domCtx.fillStyle = '#fda4af';
          domCtx.fillText(String(ask), 240, midY);
        }
        domCtx.fillStyle = '#94a3b8';
        domCtx.fillText(String(book.askVolAtPrice[idx]), 330, midY);
      }

      // Paint Time & Sales tape
      tapeCtx.fillStyle = '#020617';
      tapeCtx.fillRect(0, 0, tapeW, tapeH);
      tapeCtx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      tapeCtx.textBaseline = 'middle';

      for (let r = 0; r < visibleTapeRows; r++) {
        const idx = (book.tapeHead - r + TAPE_ROWS) % TAPE_ROWS;
        const t = book.tape[idx];
        const y = r * rowH + rowH * 0.5;
        tapeCtx.textAlign = 'left';
        tapeCtx.fillStyle = '#94a3b8';
        tapeCtx.fillText(t.timeStr, 8, y);
        tapeCtx.fillStyle = t.aggressor === 1 ? '#6ee7b7' : '#fda4af';
        tapeCtx.fillText(formatTickPrice(t.priceTick), 104, y);
        tapeCtx.textAlign = 'right';
        tapeCtx.fillText(String(t.qty), 226, y);
      }

      onPaintCost(performance.now() - t0);
    };

    paint();
    const unsub = subscribeBookTransient((book) => {
      pendingBook = book;
      if (!rafId) rafId = requestAnimationFrame(paint);
    });

    return () => {
      unsub();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [onPaintCost]);

  return (
    <div className="flex gap-3 h-full p-2">
      <canvas ref={domCanvasRef} className="border border-slate-800" />
      <canvas ref={tapeCanvasRef} className="border border-slate-800" />
    </div>
  );
}

declare global {
  interface Window {
    __S04__?: {
      ready: boolean;
      setStrategy: (s: RenderStrategy) => Promise<void>;
      runBenchmark: (opts: {
        strategy: RenderStrategy;
        updateHz: number;
        deltasPerSec: number;
        durationMs: number;
      }) => Promise<StrategyBenchResult>;
    };
  }
}

export function App() {
  const [strategy, setStrategyState] = useState<RenderStrategy>('canvas2d');
  const paintCostsRef = useRef<number[]>([]);
  const reactCommitsRef = useRef(0);

  const onPaintCost = useRef((ms: number) => {
    paintCostsRef.current.push(ms);
  }).current;

  const onReactCommit = useRef(() => {
    reactCommitsRef.current++;
  }).current;

  useEffect(() => {
    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    window.__S04__ = {
      ready: true,
      setStrategy: async (s) => {
        setStrategyState(s);
        await nextFrame();
        await nextFrame();
      },
      runBenchmark: async (opts) => {
        useDomStore.getState().resetBook();
        setStrategyState(opts.strategy);
        await nextFrame();
        await nextFrame();
        await new Promise((r) => setTimeout(r, 150));

        paintCostsRef.current = [];
        reactCommitsRef.current = 0;

        const frameTimes: number[] = [];
        const batchCpuTimes: number[] = [];
        let droppedOver16_7ms = 0;
        let stallsOver20ms = 0;
        let stallsOver33ms = 0;

        const intervalMs = 1000 / opts.updateHz;
        const deltasPerBatch = Math.max(1, Math.round(opts.deltasPerSec / opts.updateHz));
        const triggerReact = opts.strategy === 'react-state';

        const start = performance.now();
        let prevFrame = start;
        let nextTickAt = start;

        while (performance.now() - start < opts.durationMs) {
          const now = performance.now();
          if (now >= nextTickAt) {
            const b0 = performance.now();
            useDomStore.getState().pushBatch(deltasPerBatch, now, triggerReact);
            batchCpuTimes.push(performance.now() - b0);
            nextTickAt += intervalMs;
            if (nextTickAt < now - intervalMs) nextTickAt = now + intervalMs;
          }

          await nextFrame();
          const after = performance.now();
          const dt = after - prevFrame;
          prevFrame = after;

          frameTimes.push(dt);
          if (dt > 16.67) droppedOver16_7ms++;
          if (dt > 20.0) stallsOver20ms++;
          if (dt > 33.33) stallsOver33ms++;
        }

        const elapsed = performance.now() - start;
        frameTimes.sort((a, b) => a - b);
        const costs = (paintCostsRef.current.length ? paintCostsRef.current : batchCpuTimes).sort(
          (a, b) => a - b,
        );

        return {
          strategy: opts.strategy,
          updateHz: opts.updateHz,
          deltasPerSec: opts.deltasPerSec,
          durationMs: elapsed,
          frames: frameTimes.length,
          effectiveFps: (frameTimes.length / elapsed) * 1000,
          frameMsP50: percentile(frameTimes, 50),
          frameMsP95: percentile(frameTimes, 95),
          frameMsP99: percentile(frameTimes, 99),
          frameMsMax: frameTimes.length ? frameTimes[frameTimes.length - 1] : 0,
          renderCpuMsP50: percentile(costs, 50),
          renderCpuMsP95: percentile(costs, 95),
          renderCpuMsP99: percentile(costs, 99),
          droppedOver16_7ms,
          stallsOver20ms,
          stallsOver33ms,
          totalDeltasApplied: useDomStore.getState().book.totalDeltasApplied,
          reactCommits: reactCommitsRef.current,
        };
      },
    };
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100">
      <div className="px-3 py-1.5 text-xs border-b border-slate-800 flex items-center justify-between">
        <span>Allegedly Spike S04 — 100-Level DOM Ladder + Time & Sales ({strategy})</span>
        <span className="text-slate-400">Tailwind v4 + Fixed-Point i64 Tick Book</span>
      </div>
      <div className="flex-1 min-h-0">
        {strategy === 'react-state' && <ReactStateLadder onCommit={onReactCommit} />}
        {strategy === 'imperative-dom-contained' && (
          <ImperativeContainedLadder onPaintCost={onPaintCost} />
        )}
        {strategy === 'canvas2d' && <Canvas2DLadder onPaintCost={onPaintCost} />}
      </div>
    </div>
  );
}
