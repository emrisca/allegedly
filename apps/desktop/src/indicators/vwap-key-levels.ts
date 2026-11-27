import type { CandlestickData, HistogramData } from "lightweight-charts";
import type { CoordinateBridge } from "../render/webgl2-orderflow-overlay";

export type VwapSourceKind = "hlc3" | "close" | "open" | "high" | "low" | "hl2" | "ohlc4";

export interface VwapKeyLevelsConfig {
  source: VwapSourceKind;
  showMonthly: boolean;
  showPreviousWeek: boolean;
  showWeekly: boolean;
  lineBars: number;
  rightOffset: number;
  showTraditionalMonthly: boolean;
  showTraditionalYearly: boolean;
  showTraditionalWeekly: boolean;
  monthVwapColor: string;
  monthBandColor: string;
  prevVwapColor: string;
  prevBandColor: string;
  weekVwapColor: string;
  weekBandColor: string;
}

export const DEFAULT_VWAP_KEY_LEVELS_CONFIG: VwapKeyLevelsConfig = {
  source: "hlc3",
  showMonthly: true,
  showPreviousWeek: true,
  showWeekly: true,
  lineBars: 18,
  rightOffset: 5,
  showTraditionalMonthly: true,
  showTraditionalYearly: true,
  showTraditionalWeekly: true,
  monthVwapColor: "#9c50be", // rgb(156, 80, 190)
  monthBandColor: "#9c50be",
  prevVwapColor: "#e6be23", // rgb(230, 190, 35)
  prevBandColor: "#e6be23",
  weekVwapColor: "#dc3737", // rgb(220, 55, 55)
  weekBandColor: "#dc3737",
};

const STORAGE_KEY = "allegedly.vwap_key_levels.v1";

export function cloneVwapKeyLevelsConfig(src: VwapKeyLevelsConfig): VwapKeyLevelsConfig {
  return { ...src };
}

export function loadStoredVwapKeyLevelsConfig(): VwapKeyLevelsConfig {
  if (typeof window === "undefined") return cloneVwapKeyLevelsConfig(DEFAULT_VWAP_KEY_LEVELS_CONFIG);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneVwapKeyLevelsConfig(DEFAULT_VWAP_KEY_LEVELS_CONFIG);
    const parsed = JSON.parse(raw) as Partial<VwapKeyLevelsConfig>;
    return {
      ...DEFAULT_VWAP_KEY_LEVELS_CONFIG,
      ...parsed,
      lineBars: Math.min(200, Math.max(1, Math.round(Number(parsed.lineBars ?? DEFAULT_VWAP_KEY_LEVELS_CONFIG.lineBars)))),
      rightOffset: Math.min(100, Math.max(0, Math.round(Number(parsed.rightOffset ?? DEFAULT_VWAP_KEY_LEVELS_CONFIG.rightOffset)))),
    };
  } catch {
    return cloneVwapKeyLevelsConfig(DEFAULT_VWAP_KEY_LEVELS_CONFIG);
  }
}

export function saveStoredVwapKeyLevelsConfig(cfg: VwapKeyLevelsConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
}

export interface VwapPoint {
  timeSec: number;
  vwap: number;
  vah: number;
  val: number;
  reset: boolean;
}

export interface VwapKeyLevelItem {
  tag: string;
  price: number;
  color: string;
}

export interface ComputedVwapKeyLevels {
  monthly: VwapPoint[];
  weekly: VwapPoint[];
  yearly: VwapPoint[];
  latestLevels: {
    monthVah: number | null;
    monthVwap: number | null;
    monthVal: number | null;
    prevVah: number | null;
    prevVwap: number | null;
    prevVal: number | null;
    weekVah: number | null;
    weekVwap: number | null;
    weekVal: number | null;
  };
}

function getSourcePrice(c: CandlestickData, src: VwapSourceKind): number {
  switch (src) {
    case "close":
      return c.close;
    case "open":
      return c.open;
    case "high":
      return c.high;
    case "low":
      return c.low;
    case "hl2":
      return (c.high + c.low) / 2;
    case "ohlc4":
      return (c.open + c.high + c.low + c.close) / 4;
    case "hlc3":
    default:
      return (c.high + c.low + c.close) / 3;
  }
}

function utcMonthKey(timeSec: number): number {
  const d = new Date(timeSec * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function utcYearKey(timeSec: number): number {
  return new Date(timeSec * 1000).getUTCFullYear();
}

/** ISO week index anchored at Monday 00:00 UTC (matches TradingView timeframe.change("W")). */
function utcWeekKey(timeSec: number): number {
  // 1970-01-01 was Thursday (day 4); shifting by +3 days aligns floor(days / 7) to Monday 00:00 UTC
  const days = Math.floor(timeSec / 86400);
  return Math.floor((days + 3) / 7);
}

interface VwapAccumulator {
  key: number | null;
  sumPV: number;
  sumP2V: number;
  sumV: number;
  lastVwap: number | null;
  lastVah: number | null;
  lastVal: number | null;
}

function stepVwap(
  acc: VwapAccumulator,
  periodKey: number,
  price: number,
  vol: number,
): { vwap: number; vah: number; val: number; reset: boolean; prevCompleted: { vwap: number; vah: number; val: number } | null } {
  const safeVol = vol > 0 && Number.isFinite(vol) ? vol : 1;
  let reset = false;
  let prevCompleted: { vwap: number; vah: number; val: number } | null = null;
  if (acc.key === null || acc.key !== periodKey) {
    if (acc.key !== null && acc.lastVwap !== null && acc.lastVah !== null && acc.lastVal !== null) {
      prevCompleted = {
        vwap: acc.lastVwap,
        vah: acc.lastVah,
        val: acc.lastVal,
      };
    }
    acc.key = periodKey;
    acc.sumPV = 0;
    acc.sumP2V = 0;
    acc.sumV = 0;
    reset = true;
  }
  acc.sumPV += price * safeVol;
  acc.sumP2V += price * price * safeVol;
  acc.sumV += safeVol;

  const vwap = acc.sumPV / acc.sumV;
  const variance = Math.max(0, acc.sumP2V / acc.sumV - vwap * vwap);
  const stdev = Math.sqrt(variance);
  const vah = vwap + stdev;
  const val = vwap - stdev;

  acc.lastVwap = vwap;
  acc.lastVah = vah;
  acc.lastVal = val;

  return { vwap, vah, val, reset, prevCompleted };
}

export function computeVwapKeyLevels(
  candles: readonly CandlestickData[],
  volumes: readonly HistogramData[],
  config: VwapKeyLevelsConfig,
): ComputedVwapKeyLevels {
  const monthly: VwapPoint[] = [];
  const weekly: VwapPoint[] = [];
  const yearly: VwapPoint[] = [];

  const mAcc: VwapAccumulator = { key: null, sumPV: 0, sumP2V: 0, sumV: 0, lastVwap: null, lastVah: null, lastVal: null };
  const wAcc: VwapAccumulator = { key: null, sumPV: 0, sumP2V: 0, sumV: 0, lastVwap: null, lastVah: null, lastVal: null };
  const yAcc: VwapAccumulator = { key: null, sumPV: 0, sumP2V: 0, sumV: 0, lastVwap: null, lastVah: null, lastVal: null };

  let prevVwap: number | null = null;
  let prevVah: number | null = null;
  let prevVal: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tSec = Number(c.time);
    if (!Number.isFinite(tSec)) continue;
    const price = getSourcePrice(c, config.source);
    const vol = Number(volumes[i]?.value ?? 1);

    const m = stepVwap(mAcc, utcMonthKey(tSec), price, vol);
    monthly.push({ timeSec: tSec, vwap: m.vwap, vah: m.vah, val: m.val, reset: m.reset });

    const w = stepVwap(wAcc, utcWeekKey(tSec), price, vol);
    if (w.prevCompleted) {
      prevVwap = w.prevCompleted.vwap;
      prevVah = w.prevCompleted.vah;
      prevVal = w.prevCompleted.val;
    }
    weekly.push({ timeSec: tSec, vwap: w.vwap, vah: w.vah, val: w.val, reset: w.reset });

    const y = stepVwap(yAcc, utcYearKey(tSec), price, vol);
    yearly.push({ timeSec: tSec, vwap: y.vwap, vah: y.vah, val: y.val, reset: y.reset });
  }

  return {
    monthly,
    weekly,
    yearly,
    latestLevels: {
      monthVah: mAcc.lastVah,
      monthVwap: mAcc.lastVwap,
      monthVal: mAcc.lastVal,
      prevVah,
      prevVwap,
      prevVal,
      weekVah: wAcc.lastVah,
      weekVwap: wAcc.lastVwap,
      weekVal: wAcc.lastVal,
    },
  };
}

function strokeContinuousVwap(
  ctx: CanvasRenderingContext2D,
  series: readonly VwapPoint[],
  field: "vwap" | "vah" | "val",
  color: string,
  lineWidth: number,
  bridge: CoordinateBridge,
  w: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  let penDown = false;
  for (let i = 0; i < series.length; i++) {
    const pt = series[i];
    if (pt.reset) {
      penDown = false;
    }
    const x = bridge.timeToX(pt.timeSec);
    const y = bridge.priceToY(pt[field]);
    if (x === null || y === null || x < -120 || x > w + 120) {
      penDown = false;
      continue;
    }
    if (!penDown) {
      ctx.moveTo(x, y);
      penDown = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function estimateBarSpacingPx(
  candles: readonly CandlestickData[],
  bridge: CoordinateBridge,
): number {
  for (let i = candles.length - 1; i >= 1; i--) {
    const x1 = bridge.timeToX(Number(candles[i].time));
    const x0 = bridge.timeToX(Number(candles[i - 1].time));
    if (x1 !== null && x0 !== null && x1 > x0) {
      return Math.min(48, Math.max(2, x1 - x0));
    }
  }
  return 8;
}

export function drawVwapKeyLevelsOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  candles: readonly CandlestickData[],
  volumes: readonly HistogramData[],
  bridge: CoordinateBridge,
  config: VwapKeyLevelsConfig,
): void {
  if (candles.length < 2) return;
  const computed = computeVwapKeyLevels(candles, volumes, config);

  // 1. Traditional continuous VWAPs + 1-sigma VAH/VAL bands
  if (config.showTraditionalYearly) {
    strokeContinuousVwap(ctx, computed.yearly, "vah", config.prevBandColor, 1, bridge, w);
    strokeContinuousVwap(ctx, computed.yearly, "val", config.prevBandColor, 1, bridge, w);
    strokeContinuousVwap(ctx, computed.yearly, "vwap", config.prevVwapColor, 2, bridge, w);
  }
  if (config.showTraditionalMonthly) {
    strokeContinuousVwap(ctx, computed.monthly, "vah", config.monthBandColor, 1, bridge, w);
    strokeContinuousVwap(ctx, computed.monthly, "val", config.monthBandColor, 1, bridge, w);
    strokeContinuousVwap(ctx, computed.monthly, "vwap", config.monthVwapColor, 2, bridge, w);
  }
  if (config.showTraditionalWeekly) {
    strokeContinuousVwap(ctx, computed.weekly, "vah", config.weekBandColor, 1, bridge, w);
    strokeContinuousVwap(ctx, computed.weekly, "val", config.weekBandColor, 1, bridge, w);
    strokeContinuousVwap(ctx, computed.weekly, "vwap", config.weekVwapColor, 2, bridge, w);
  }

  // 2. Right-side projected key level lines + labels (mVAH/mVWAP/mVAL, pwVAH/pwVWAP/pwVAL, wVAH/wVWAP/wVAL)
  const lastCandle = candles[candles.length - 1];
  const lastX = bridge.timeToX(Number(lastCandle.time));
  if (lastX === null) return;

  const barSpacing = estimateBarSpacingPx(candles, bridge);
  const rawX1 = lastX + config.rightOffset * barSpacing;
  const rawX2 = rawX1 + config.lineBars * barSpacing;

  // Keep projected lines & tags gracefully visible inside the right margin even when chart isn't scrolled right
  const rightPadding = 54;
  let x1 = rawX1;
  let x2 = rawX2;
  if (x2 > w - rightPadding) {
    const desiredSpan = Math.min(Math.max(32, rawX2 - rawX1), Math.max(40, w * 0.25));
    x2 = w - rightPadding;
    x1 = Math.max(0, x2 - desiredSpan);
  }

  const L = computed.latestLevels;
  const levels: VwapKeyLevelItem[] = [];
  if (config.showMonthly) {
    if (L.monthVah !== null) levels.push({ tag: "mVAH", price: L.monthVah, color: config.monthBandColor });
    if (L.monthVwap !== null) levels.push({ tag: "mVWAP", price: L.monthVwap, color: config.monthVwapColor });
    if (L.monthVal !== null) levels.push({ tag: "mVAL", price: L.monthVal, color: config.monthBandColor });
  }
  if (config.showPreviousWeek) {
    if (L.prevVah !== null) levels.push({ tag: "pwVAH", price: L.prevVah, color: config.prevBandColor });
    if (L.prevVwap !== null) levels.push({ tag: "pwVWAP", price: L.prevVwap, color: config.prevVwapColor });
    if (L.prevVal !== null) levels.push({ tag: "pwVAL", price: L.prevVal, color: config.prevBandColor });
  }
  if (config.showWeekly) {
    if (L.weekVah !== null) levels.push({ tag: "wVAH", price: L.weekVah, color: config.weekBandColor });
    if (L.weekVwap !== null) levels.push({ tag: "wVWAP", price: L.weekVwap, color: config.weekVwapColor });
    if (L.weekVal !== null) levels.push({ tag: "wVAL", price: L.weekVal, color: config.weekBandColor });
  }

  ctx.save();
  ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  for (const lv of levels) {
    const y = bridge.priceToY(lv.price);
    if (y === null || y < -16 || y > h + 16) continue;
    const py = Math.round(y) + 0.5;
    ctx.strokeStyle = lv.color;
    ctx.lineWidth = lv.tag.endsWith("VWAP") ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, py);
    ctx.lineTo(x2, py);
    ctx.stroke();

    ctx.fillStyle = lv.color;
    ctx.fillText(lv.tag, x2 + 4, py);
  }
  ctx.restore();
}
