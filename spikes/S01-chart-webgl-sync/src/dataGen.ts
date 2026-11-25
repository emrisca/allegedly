import type { CandlestickData, HistogramData, LineData, UTCTimestamp } from 'lightweight-charts';

// Fixed-point ES futures tick size: 1 tick = 0.25 index points (stored as integer ticks in SoA arrays)
export const TICK_SIZE = 0.25;
export const LEVELS_PER_BAR = 20;

export interface FootprintBarData {
  timeSec: number;
  lowTick: number;
  highTick: number;
  openTick: number;
  closeTick: number;
  delta: number;
  totalVolume: number;
  // Flat offset into bidVols / askVols (LEVELS_PER_BAR entries per bar)
  levelOffset: number;
}

export interface GeneratedDataset {
  barCount: number;
  // Fixed-point SoA representation (mirrors Rust i64/i32 IPC contract)
  timesSec: Int32Array;
  openTicks: Int32Array;
  highTicks: Int32Array;
  lowTicks: Int32Array;
  closeTicks: Int32Array;
  deltas: Int32Array;
  volumes: Int32Array;
  // Pre-generated footprint levels for the tail window (last 2000 bars × 20 levels = 40,000 cells)
  fpStartIndex: number;
  fpBarCount: number;
  fpBidVols: Uint16Array;
  fpAskVols: Uint16Array;
  // View-boundary converted arrays for LWC
  candles: CandlestickData<UTCTimestamp>[];
  volumeBars: HistogramData<UTCTimestamp>[];
  rsiLine: LineData<UTCTimestamp>[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDataset(barCount = 100_000, fpWindowBars = 2_000): GeneratedDataset {
  const rng = mulberry32(0xA11E6ED1);
  const timesSec = new Int32Array(barCount);
  const openTicks = new Int32Array(barCount);
  const highTicks = new Int32Array(barCount);
  const lowTicks = new Int32Array(barCount);
  const closeTicks = new Int32Array(barCount);
  const deltas = new Int32Array(barCount);
  const volumes = new Int32Array(barCount);

  const fpStartIndex = Math.max(0, barCount - fpWindowBars);
  const fpBarCount = barCount - fpStartIndex;
  const fpBidVols = new Uint16Array(fpBarCount * LEVELS_PER_BAR);
  const fpAskVols = new Uint16Array(fpBarCount * LEVELS_PER_BAR);

  const candles: CandlestickData<UTCTimestamp>[] = new Array(barCount);
  const volumeBars: HistogramData<UTCTimestamp>[] = new Array(barCount);
  const rsiLine: LineData<UTCTimestamp>[] = new Array(barCount);

  // Start ~100,000 minutes prior to 2026-11-24T16:00:00Z
  const endEpoch = 1795536000;
  const startEpoch = endEpoch - barCount * 60;
  let priceTick = 23200; // 5800.00 ES

  let avgGain = 1.0;
  let avgLoss = 1.0;

  for (let i = 0; i < barCount; i++) {
    const t = (startEpoch + i * 60) as UTCTimestamp;
    timesSec[i] = t;

    const open = priceTick;
    // Mean-reverting random walk in integer ticks
    const step = Math.round((rng() - 0.5) * 14);
    const close = Math.max(16000, open + step);
    const upWick = Math.floor(rng() * 8) + 2;
    const dnWick = Math.floor(rng() * 8) + 2;
    const high = Math.max(open, close) + upWick;
    const low = Math.min(open, close) - dnWick;

    openTicks[i] = open;
    highTicks[i] = high;
    lowTicks[i] = low;
    closeTicks[i] = close;

    let barVol = 0;
    let barDelta = 0;

    if (i >= fpStartIndex) {
      const fpIdx = i - fpStartIndex;
      const base = fpIdx * LEVELS_PER_BAR;
      for (let lv = 0; lv < LEVELS_PER_BAR; lv++) {
        // Bell-ish distribution centered near middle of bar
        const centerDist = Math.abs(lv - LEVELS_PER_BAR / 2) / (LEVELS_PER_BAR / 2);
        const weight = 1.4 - centerDist;
        const bid = Math.max(1, Math.floor(rng() * 140 * weight));
        const ask = Math.max(1, Math.floor(rng() * 140 * weight));
        fpBidVols[base + lv] = bid;
        fpAskVols[base + lv] = ask;
        barVol += bid + ask;
        barDelta += ask - bid;
      }
    } else {
      barVol = 400 + Math.floor(rng() * 2200);
      barDelta = Math.floor((rng() - 0.5) * barVol * 0.5);
    }

    volumes[i] = barVol;
    deltas[i] = barDelta;
    priceTick = close;

    // Boundary float conversion ONLY for LWC display API (Constraints #7)
    candles[i] = {
      time: t,
      open: open * TICK_SIZE,
      high: high * TICK_SIZE,
      low: low * TICK_SIZE,
      close: close * TICK_SIZE,
    };

    volumeBars[i] = {
      time: t,
      value: barDelta,
      color: barDelta >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
    };

    const diff = close - open;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiLine[i] = {
      time: t,
      value: 100 - 100 / (1 + rs),
    };
  }

  return {
    barCount,
    timesSec,
    openTicks,
    highTicks,
    lowTicks,
    closeTicks,
    deltas,
    volumes,
    fpStartIndex,
    fpBarCount,
    fpBidVols,
    fpAskVols,
    candles,
    volumeBars,
    rsiLine,
  };
}

export function applyLiveTick(dataset: GeneratedDataset, tickSeq: number): {
  candle: CandlestickData<UTCTimestamp>;
  deltaBar: HistogramData<UTCTimestamp>;
  lastIndex: number;
} {
  const lastIdx = dataset.barCount - 1;
  const fpIdx = lastIdx - dataset.fpStartIndex;
  const base = fpIdx * LEVELS_PER_BAR;

  // Deterministic micro-tick mutation in integer ticks
  const dir = ((tickSeq * 2654435761) >>> 28) % 3 - 1; // -1, 0, +1
  const nextClose = Math.max(
    dataset.openTicks[lastIdx] - 12,
    Math.min(dataset.openTicks[lastIdx] + 12, dataset.closeTicks[lastIdx] + dir),
  );
  dataset.closeTicks[lastIdx] = nextClose;
  if (nextClose > dataset.highTicks[lastIdx]) dataset.highTicks[lastIdx] = nextClose;
  if (nextClose < dataset.lowTicks[lastIdx]) dataset.lowTicks[lastIdx] = nextClose;

  const lv = Math.abs(tickSeq) % LEVELS_PER_BAR;
  const qty = 5 + (tickSeq % 25);
  if (dir >= 0) {
    dataset.fpAskVols[base + lv] = Math.min(65000, dataset.fpAskVols[base + lv] + qty);
    dataset.deltas[lastIdx] += qty;
  } else {
    dataset.fpBidVols[base + lv] = Math.min(65000, dataset.fpBidVols[base + lv] + qty);
    dataset.deltas[lastIdx] -= qty;
  }
  dataset.volumes[lastIdx] += qty;

  const time = dataset.timesSec[lastIdx] as UTCTimestamp;
  return {
    lastIndex: lastIdx,
    candle: {
      time,
      open: dataset.openTicks[lastIdx] * TICK_SIZE,
      high: dataset.highTicks[lastIdx] * TICK_SIZE,
      low: dataset.lowTicks[lastIdx] * TICK_SIZE,
      close: dataset.closeTicks[lastIdx] * TICK_SIZE,
    },
    deltaBar: {
      time,
      value: dataset.deltas[lastIdx],
      color: dataset.deltas[lastIdx] >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
    },
  };
}
