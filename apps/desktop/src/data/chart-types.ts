import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";

export interface KagiPoint {
  time: UTCTimestamp;
  value: number;
  yang: boolean;
}

export interface PointAndFigureColumn {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  isX: boolean;
  boxSize: number;
}

function computeAutoStep(bars: readonly CandlestickData<UTCTimestamp>[], mult = 0.85): number {
  if (bars.length === 0) return 1;
  let trSum = 0;
  const n = Math.min(bars.length, 40);
  const start = bars.length - n;
  for (let i = start; i < bars.length; i++) {
    const cur = bars[i];
    const prevClose = i > 0 ? bars[i - 1].close : cur.open;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    );
    trSum += tr;
  }
  const atr = trSum / Math.max(1, n);
  const refPrice = Math.max(1e-6, bars[bars.length - 1].close);
  return Math.max(atr * mult, refPrice * 0.0012);
}

function ensureMonotonicTime(rawTime: number, prevTime: number): UTCTimestamp {
  return (rawTime > prevTime ? rawTime : prevTime + 1) as UTCTimestamp;
}

export function transformHeikinAshi(
  bars: readonly CandlestickData<UTCTimestamp>[],
): CandlestickData<UTCTimestamp>[] {
  if (bars.length === 0) return [];
  const out: CandlestickData<UTCTimestamp>[] = [];
  let prevOpen = (bars[0].open + bars[0].close) / 2;
  let prevClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? prevOpen : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    out.push({
      time: b.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
}

export function transformHighLow(
  bars: readonly CandlestickData<UTCTimestamp>[],
): CandlestickData<UTCTimestamp>[] {
  return bars.map((b) => {
    const up = b.close >= b.open;
    return {
      time: b.time,
      open: up ? b.low : b.high,
      high: b.high,
      low: b.low,
      close: up ? b.high : b.low,
    };
  });
}

export function transformRenko(
  bars: readonly CandlestickData<UTCTimestamp>[],
  explicitBrickSize?: number,
): CandlestickData<UTCTimestamp>[] {
  if (bars.length < 2) return [...bars];
  const brick = explicitBrickSize && explicitBrickSize > 0 ? explicitBrickSize : computeAutoStep(bars, 0.75);
  const out: CandlestickData<UTCTimestamp>[] = [];

  let ref = Math.round(bars[0].close / brick) * brick;
  let dir: 1 | -1 | 0 = 0;
  let prevTime = Number(bars[0].time) - 1;

  for (let i = 1; i < bars.length; i++) {
    const price = bars[i].close;
    const barTime = Number(bars[i].time);

    let guard = 0;
    while (guard++ < 32) {
      if (dir >= 0 && price >= ref + brick) {
        const nextRef = ref + brick;
        const t = ensureMonotonicTime(barTime, prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: ref, high: nextRef, low: ref, close: nextRef });
        ref = nextRef;
        dir = 1;
      } else if (dir === -1 && price >= ref + brick * 2) {
        // Standard Renko reversal requires 2 bricks from current brick extreme
        const nextOpen = ref + brick;
        const nextClose = ref + brick * 2;
        const t = ensureMonotonicTime(barTime, prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: nextOpen, high: nextClose, low: nextOpen, close: nextClose });
        ref = nextClose;
        dir = 1;
      } else if (dir <= 0 && price <= ref - brick) {
        const nextRef = ref - brick;
        const t = ensureMonotonicTime(barTime, prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: ref, high: ref, low: nextRef, close: nextRef });
        ref = nextRef;
        dir = -1;
      } else if (dir === 1 && price <= ref - brick * 2) {
        const nextOpen = ref - brick;
        const nextClose = ref - brick * 2;
        const t = ensureMonotonicTime(barTime, prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: nextOpen, high: nextOpen, low: nextClose, close: nextClose });
        ref = nextClose;
        dir = -1;
      } else {
        break;
      }
    }
  }
  return out.length >= 2 ? out : [...bars];
}

export function transformLineBreak(
  bars: readonly CandlestickData<UTCTimestamp>[],
  lines = 3,
): CandlestickData<UTCTimestamp>[] {
  if (bars.length < 2) return [...bars];
  const out: CandlestickData<UTCTimestamp>[] = [
    {
      time: bars[0].time,
      open: bars[0].open,
      high: Math.max(bars[0].open, bars[0].close),
      low: Math.min(bars[0].open, bars[0].close),
      close: bars[0].close,
    },
  ];
  let prevTime = Number(bars[0].time);

  for (let i = 1; i < bars.length; i++) {
    const close = bars[i].close;
    const recent = out.slice(-lines);
    const highest = Math.max(...recent.map((b) => Math.max(b.open, b.close)));
    const lowest = Math.min(...recent.map((b) => Math.min(b.open, b.close)));
    const last = out[out.length - 1];
    const lastUp = last.close >= last.open;

    if (lastUp) {
      if (close > last.close) {
        const t = ensureMonotonicTime(Number(bars[i].time), prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: last.close, high: close, low: last.close, close });
      } else if (close < lowest) {
        const t = ensureMonotonicTime(Number(bars[i].time), prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: last.open, high: last.open, low: close, close });
      }
    } else {
      if (close < last.close) {
        const t = ensureMonotonicTime(Number(bars[i].time), prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: last.close, high: last.close, low: close, close });
      } else if (close > highest) {
        const t = ensureMonotonicTime(Number(bars[i].time), prevTime);
        prevTime = Number(t);
        out.push({ time: t, open: last.open, high: close, low: last.open, close });
      }
    }
  }
  return out.length >= 2 ? out : [...bars];
}

export function transformKagi(
  bars: readonly CandlestickData<UTCTimestamp>[],
  explicitReversal?: number,
): KagiPoint[] {
  if (bars.length === 0) return [];
  const rev = explicitReversal && explicitReversal > 0 ? explicitReversal : computeAutoStep(bars, 1.15);
  const pts: KagiPoint[] = [{ time: bars[0].time, value: bars[0].close, yang: true }];
  let dir: 1 | -1 = 1;
  let extreme = bars[0].close;
  let prevShoulder = bars[0].close;
  let prevWaist = bars[0].close;
  let yang = true;
  let prevTime = Number(bars[0].time);

  for (let i = 1; i < bars.length; i++) {
    const c = bars[i].close;
    const t = ensureMonotonicTime(Number(bars[i].time), prevTime);
    if (dir === 1) {
      if (c >= extreme) {
        extreme = c;
        if (extreme > prevShoulder) yang = true;
        prevTime = Number(t);
        pts.push({ time: t, value: extreme, yang });
      } else if (extreme - c >= rev) {
        prevShoulder = extreme;
        dir = -1;
        extreme = c;
        if (extreme < prevWaist) yang = false;
        prevTime = Number(t);
        pts.push({ time: t, value: extreme, yang });
      }
    } else {
      if (c <= extreme) {
        extreme = c;
        if (extreme < prevWaist) yang = false;
        prevTime = Number(t);
        pts.push({ time: t, value: extreme, yang });
      } else if (c - extreme >= rev) {
        prevWaist = extreme;
        dir = 1;
        extreme = c;
        if (extreme > prevShoulder) yang = true;
        prevTime = Number(t);
        pts.push({ time: t, value: extreme, yang });
      }
    }
  }
  return pts.length >= 2 ? pts : bars.map((b) => ({ time: b.time, value: b.close, yang: b.close >= b.open }));
}

export function transformPointAndFigure(
  bars: readonly CandlestickData<UTCTimestamp>[],
  reversalBoxes = 3,
): PointAndFigureColumn[] {
  if (bars.length < 2) return [];
  const box = computeAutoStep(bars, 0.55);
  const cols: PointAndFigureColumn[] = [];
  let isX = bars[1].close >= bars[0].close;
  let colOpen = Math.round(bars[0].close / box) * box;
  let colExtreme = colOpen + (isX ? box : -box);
  let prevTime = Number(bars[0].time);

  for (let i = 1; i < bars.length; i++) {
    const price = bars[i].close;
    if (isX) {
      if (price >= colExtreme + box) {
        const steps = Math.floor((price - colExtreme) / box);
        colExtreme += steps * box;
      } else if (colExtreme - price >= box * reversalBoxes) {
        const t = ensureMonotonicTime(Number(bars[i].time), prevTime);
        prevTime = Number(t);
        cols.push({
          time: t,
          open: colOpen,
          high: colExtreme,
          low: colOpen,
          close: colExtreme,
          isX: true,
          boxSize: box,
        });
        isX = false;
        colOpen = colExtreme - box;
        const steps = Math.max(reversalBoxes, Math.floor((colExtreme - price) / box));
        colExtreme = colExtreme - steps * box;
      }
    } else {
      if (price <= colExtreme - box) {
        const steps = Math.floor((colExtreme - price) / box);
        colExtreme -= steps * box;
      } else if (price - colExtreme >= box * reversalBoxes) {
        const t = ensureMonotonicTime(Number(bars[i].time), prevTime);
        prevTime = Number(t);
        cols.push({
          time: t,
          open: colOpen,
          high: colOpen,
          low: colExtreme,
          close: colExtreme,
          isX: false,
          boxSize: box,
        });
        isX = true;
        colOpen = colExtreme + box;
        const steps = Math.max(reversalBoxes, Math.floor((price - colExtreme) / box));
        colExtreme = colExtreme + steps * box;
      }
    }
  }
  const lastT = ensureMonotonicTime(Number(bars[bars.length - 1].time), prevTime);
  cols.push({
    time: lastT,
    open: colOpen,
    high: Math.max(colOpen, colExtreme),
    low: Math.min(colOpen, colExtreme),
    close: colExtreme,
    isX,
    boxSize: box,
  });
  return cols;
}

export function transformRangeBars(
  bars: readonly CandlestickData<UTCTimestamp>[],
  explicitRange?: number,
): CandlestickData<UTCTimestamp>[] {
  if (bars.length < 2) return [...bars];
  const rangeSize = explicitRange && explicitRange > 0 ? explicitRange : computeAutoStep(bars, 1.0);
  const out: CandlestickData<UTCTimestamp>[] = [];
  let curOpen = bars[0].open;
  let curHigh = bars[0].open;
  let curLow = bars[0].open;
  let prevTime = Number(bars[0].time) - 1;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    for (const p of [b.open, b.high, b.low, b.close]) {
      curHigh = Math.max(curHigh, p);
      curLow = Math.min(curLow, p);
      if (curHigh - curLow >= rangeSize) {
        const isUp = p >= curOpen;
        const close = isUp ? curLow + rangeSize : curHigh - rangeSize;
        const t = ensureMonotonicTime(Number(b.time), prevTime);
        prevTime = Number(t);
        out.push({
          time: t,
          open: curOpen,
          high: isUp ? close : curHigh,
          low: isUp ? curLow : close,
          close,
        });
        curOpen = close;
        curHigh = close;
        curLow = close;
      }
    }
  }
  return out.length >= 2 ? out : [...bars];
}

export function buildVolumeWeightedCandles(
  bars: readonly CandlestickData<UTCTimestamp>[],
  volumes: readonly HistogramData<UTCTimestamp>[],
  upHex: string,
  downHex: string,
): Array<CandlestickData<UTCTimestamp> & { color?: string; borderColor?: string; wickColor?: string }> {
  if (bars.length === 0) return [];
  let maxVol = 1;
  for (let i = 0; i < volumes.length; i++) {
    if (volumes[i].value > maxVol) maxVol = volumes[i].value;
  }
  const parseRgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    if (h.length !== 6) return [120, 130, 150];
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  };
  const [ur, ug, ub] = parseRgb(upHex);
  const [dr, dg, db] = parseRgb(downHex);

  return bars.map((b, i) => {
    const vol = volumes[i]?.value ?? 0;
    const ratio = Math.min(1, Math.max(0.18, vol / maxVol));
    const isUp = b.close >= b.open;
    const [r, g, bl] = isUp ? [ur, ug, ub] : [dr, dg, db];
    const fill = `rgba(${r}, ${g}, ${bl}, ${ratio.toFixed(2)})`;
    const border = `rgba(${r}, ${g}, ${bl}, ${Math.min(1, ratio + 0.28).toFixed(2)})`;
    return {
      ...b,
      color: fill,
      borderColor: border,
      wickColor: border,
    };
  });
}
