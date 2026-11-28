export type VpRowsLayout = "number_of_rows" | "ticks_per_row";
export type VpVolumeMode = "up_down" | "total" | "delta";
export type VpPlacement = "left" | "right";
export type VpLineStyle = "solid" | "dashed" | "dotted";

export interface VolumeProfileConfig {
  // Inputs tab (exact TradingView FRVP / AVP layout)
  rowsLayout: VpRowsLayout;
  rowSize: number;
  volumeMode: VpVolumeMode;
  valueAreaPercent: number;
  extendRight: boolean;

  // Style tab (exact TradingView FRVP / AVP layout)
  showProfile: boolean;
  showValues: boolean;
  valuesColor: string;
  widthPercent: number;
  placement: VpPlacement;

  upVolumeColor: string;
  upVolumeOpacity: number;
  downVolumeColor: string;
  downVolumeOpacity: number;
  valueAreaUpColor: string;
  valueAreaUpOpacity: number;
  valueAreaDownColor: string;
  valueAreaDownOpacity: number;

  showVah: boolean;
  vahColor: string;
  vahWidth: 1 | 2 | 3 | 4;
  vahLineStyle?: VpLineStyle;
  showVal: boolean;
  valColor: string;
  valWidth: 1 | 2 | 3 | 4;
  valLineStyle?: VpLineStyle;
  showPoc: boolean;
  pocColor: string;
  pocWidth: 1 | 2 | 3 | 4;
  pocLineStyle?: VpLineStyle;

  showDevelopingPoc: boolean;
  developingPocColor: string;
  showDevelopingVa: boolean;
  developingVaColor: string;

  showHistogramBox: boolean;
  histogramBoxColor: string;
  histogramBoxOpacity: number;

  showPriceScaleLabels: boolean;

  // AMT HVN / LVN highlighting (from 03Volume Profile.md)
  showHvnLvn: boolean;
}

/**
 * Exact default Fixed Range Volume Profile settings from Abel's notes
 * (`AllYouNeedToKnow/03Volume Profile.md`: `TW_VPST.png` & `TW_VPST1.png`).
 */
export const DEFAULT_VOLUME_PROFILE_CONFIG: VolumeProfileConfig = {
  rowsLayout: "number_of_rows",
  rowSize: 1000,
  volumeMode: "up_down",
  valueAreaPercent: 68,
  extendRight: false,

  showProfile: true,
  showValues: false,
  valuesColor: "#d1d4dc",
  widthPercent: 35,
  placement: "left",

  upVolumeColor: "#535353",
  upVolumeOpacity: 0.45,
  downVolumeColor: "#4a4b50",
  downVolumeOpacity: 0.45,
  valueAreaUpColor: "#0c0d12",
  valueAreaUpOpacity: 0.88,
  valueAreaDownColor: "#0c0d12",
  valueAreaDownOpacity: 0.88,

  showVah: true,
  vahColor: "#ffffff",
  vahWidth: 2,
  vahLineStyle: "solid",
  showVal: true,
  valColor: "#ffffff",
  valWidth: 2,
  valLineStyle: "solid",
  showPoc: true,
  pocColor: "#f13545",
  pocWidth: 2,
  pocLineStyle: "solid",

  showDevelopingPoc: false,
  developingPocColor: "#f13545",
  showDevelopingVa: false,
  developingVaColor: "#217b89",

  showHistogramBox: true,
  histogramBoxColor: "#162629",
  histogramBoxOpacity: 0.45,

  showPriceScaleLabels: false,
  showHvnLvn: false,
};

/**
 * Default Anchored Volume Profile (AVP) settings — always lives on the right edge
 * against the price scale with VAH/VAL/POC price-scale badges.
 */
export const DEFAULT_ANCHORED_VP_CONFIG: VolumeProfileConfig = {
  rowsLayout: "number_of_rows",
  rowSize: 500,
  volumeMode: "up_down",
  valueAreaPercent: 68,
  extendRight: true,

  showProfile: true,
  showValues: false,
  valuesColor: "#d1d4dc",
  widthPercent: 25,
  placement: "right",

  upVolumeColor: "#787b86",
  upVolumeOpacity: 0.45,
  downVolumeColor: "#2a2e39",
  downVolumeOpacity: 0.5,
  valueAreaUpColor: "#5d606b",
  valueAreaUpOpacity: 0.65,
  valueAreaDownColor: "#14171f",
  valueAreaDownOpacity: 0.85,

  showVah: true,
  vahColor: "#2962ff",
  vahWidth: 1,
  vahLineStyle: "solid",
  showVal: true,
  valColor: "#2962ff",
  valWidth: 1,
  valLineStyle: "solid",
  showPoc: true,
  pocColor: "#b22833",
  pocWidth: 1,
  pocLineStyle: "solid",

  showDevelopingPoc: false,
  developingPocColor: "#f13545",
  showDevelopingVa: false,
  developingVaColor: "#217b89",

  showHistogramBox: false,
  histogramBoxColor: "#162629",
  histogramBoxOpacity: 0.25,

  showPriceScaleLabels: true,
  showHvnLvn: false,
};

export const FRVP_DEFAULTS_STORAGE_KEY = "allegedly.frvp_defaults.v1";
export const AVP_DEFAULTS_STORAGE_KEY = "allegedly.avp_defaults.v1";

export function cloneVpConfig(cfg?: Partial<VolumeProfileConfig>): VolumeProfileConfig {
  return {
    ...DEFAULT_VOLUME_PROFILE_CONFIG,
    ...(cfg ?? {}),
  };
}

export function cloneAvpConfig(cfg?: Partial<VolumeProfileConfig>): VolumeProfileConfig {
  return {
    ...DEFAULT_ANCHORED_VP_CONFIG,
    ...(cfg ?? {}),
    extendRight: true,
    placement: cfg?.placement ?? "right",
  };
}

export function loadStoredVpDefaults(): VolumeProfileConfig {
  if (typeof window === "undefined" || !window.localStorage) {
    return cloneVpConfig();
  }
  try {
    const raw = window.localStorage.getItem(FRVP_DEFAULTS_STORAGE_KEY);
    if (!raw) return cloneVpConfig();
    const parsed = JSON.parse(raw) as Partial<VolumeProfileConfig>;
    return cloneVpConfig(parsed);
  } catch {
    return cloneVpConfig();
  }
}

export function saveStoredVpDefaults(cfg: VolumeProfileConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(FRVP_DEFAULTS_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
}

export function loadStoredAvpDefaults(): VolumeProfileConfig {
  if (typeof window === "undefined" || !window.localStorage) {
    return cloneAvpConfig();
  }
  try {
    const raw = window.localStorage.getItem(AVP_DEFAULTS_STORAGE_KEY);
    if (!raw) return cloneAvpConfig();
    const parsed = JSON.parse(raw) as Partial<VolumeProfileConfig>;
    return cloneAvpConfig(parsed);
  } catch {
    return cloneAvpConfig();
  }
}

export function saveStoredAvpDefaults(cfg: VolumeProfileConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(AVP_DEFAULTS_STORAGE_KEY, JSON.stringify(cloneAvpConfig(cfg)));
  } catch {
    // ignore storage errors
  }
}

export interface VpCandleInput {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VpBinResult {
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  upVol: number;
  downVol: number;
  totalVol: number;
  deltaVol: number;
  inValueArea: boolean;
}

export interface VpDevelopingPoint {
  time: number;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
}

export interface ComputedVolumeProfile {
  bins: VpBinResult[];
  lowPrice: number;
  highPrice: number;
  pocIdx: number;
  vahIdx: number;
  valIdx: number;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  maxTotalVol: number;
  maxAbsDelta: number;
  totalVolume: number;
  hvnIndices: number[];
  lvnIndices: number[];
  developing: VpDevelopingPoint[];
}

function expandValueArea(
  totals: Float64Array,
  pocIdx: number,
  totalVolume: number,
  vaPercent: number,
): { valIdx: number; vahIdx: number } {
  const n = totals.length;
  if (n === 0 || totalVolume <= 0) {
    return { valIdx: 0, vahIdx: 0 };
  }
  const target = totalVolume * Math.max(0.05, Math.min(1, vaPercent / 100));
  let lo = pocIdx;
  let hi = pocIdx;
  let accum = totals[pocIdx];

  while (accum < target && (lo > 0 || hi < n - 1)) {
    // Standard AMT two-row step comparison above vs below
    const up1 = hi + 1 < n ? totals[hi + 1] : 0;
    const up2 = hi + 2 < n ? totals[hi + 2] : 0;
    const dn1 = lo - 1 >= 0 ? totals[lo - 1] : 0;
    const dn2 = lo - 2 >= 0 ? totals[lo - 2] : 0;

    const upPair = up1 + up2;
    const dnPair = dn1 + dn2;

    if (hi >= n - 1) {
      lo -= 1;
      accum += totals[lo];
    } else if (lo <= 0) {
      hi += 1;
      accum += totals[hi];
    } else if (upPair >= dnPair) {
      hi += 1;
      accum += totals[hi];
      if (accum < target && hi + 1 < n) {
        hi += 1;
        accum += totals[hi];
      }
    } else {
      lo -= 1;
      accum += totals[lo];
      if (accum < target && lo - 1 >= 0) {
        lo -= 1;
        accum += totals[lo];
      }
    }
  }
  return { valIdx: lo, vahIdx: hi };
}

/**
 * Computes a high-resolution Fixed Range / Session Volume Profile using
 * full-bar High–Low range distribution (matching TradingView FRVP behavior).
 */
export function computeFixedRangeVolumeProfile(
  bars: readonly VpCandleInput[],
  tickSizeFloat: number,
  config: VolumeProfileConfig,
): ComputedVolumeProfile | null {
  if (bars.length === 0) return null;

  let lowPrice = Number.POSITIVE_INFINITY;
  let highPrice = Number.NEGATIVE_INFINITY;
  for (const b of bars) {
    if (b.low < lowPrice) lowPrice = b.low;
    if (b.high > highPrice) highPrice = b.high;
  }
  if (!Number.isFinite(lowPrice) || !Number.isFinite(highPrice) || highPrice <= lowPrice) {
    return null;
  }

  const priceSpan = highPrice - lowPrice;
  const safeTick = tickSizeFloat > 0 ? tickSizeFloat : priceSpan / 100;
  let bucketCount: number;
  if (config.rowsLayout === "ticks_per_row") {
    const rowPrice = Math.max(safeTick, safeTick * Math.max(1, Math.round(config.rowSize)));
    bucketCount = Math.max(8, Math.min(1000, Math.ceil(priceSpan / rowPrice)));
  } else {
    bucketCount = Math.max(8, Math.min(1000, Math.round(config.rowSize || 100)));
  }

  const step = priceSpan / bucketCount;
  const upVol = new Float64Array(bucketCount);
  const dnVol = new Float64Array(bucketCount);
  const totals = new Float64Array(bucketCount);
  const developing: VpDevelopingPoint[] = [];
  const needDeveloping = config.showDevelopingPoc || config.showDevelopingVa;

  let totalVolume = 0;

  for (let bi = 0; bi < bars.length; bi++) {
    const bar = bars[bi];
    const vol = Number.isFinite(bar.volume) && bar.volume > 0 ? bar.volume : 1;
    const isUp = bar.close >= bar.open;

    const iLow = Math.max(0, Math.min(bucketCount - 1, Math.floor((bar.low - lowPrice) / step)));
    const iHigh = Math.max(
      iLow,
      Math.min(bucketCount - 1, Math.floor((bar.high - lowPrice) / step)),
    );
    const touched = iHigh - iLow + 1;
    const share = vol / touched;

    // Proportional up/down volume split per bar (close location within range)
    const range = bar.high - bar.low;
    const upRatio =
      range > 0 ? Math.max(0.15, Math.min(0.85, (bar.close - bar.low) / range)) : isUp ? 0.65 : 0.35;
    const upShare = share * upRatio;
    const dnShare = share - upShare;

    for (let k = iLow; k <= iHigh; k++) {
      upVol[k] += upShare;
      dnVol[k] += dnShare;
      totals[k] += share;
    }
    totalVolume += vol;

    if (needDeveloping) {
      let curPoc = 0;
      let curMax = 0;
      for (let k = 0; k < bucketCount; k++) {
        if (totals[k] > curMax) {
          curMax = totals[k];
          curPoc = k;
        }
      }
      const { valIdx, vahIdx } = config.showDevelopingVa
        ? expandValueArea(totals, curPoc, totalVolume, config.valueAreaPercent)
        : { valIdx: curPoc, vahIdx: curPoc };
      developing.push({
        time: bar.time,
        pocPrice: lowPrice + (curPoc + 0.5) * step,
        vahPrice: lowPrice + (vahIdx + 1) * step,
        valPrice: lowPrice + valIdx * step,
      });
    }
  }

  if (totalVolume <= 0) return null;

  let pocIdx = 0;
  let maxTotalVol = 0;
  let maxAbsDelta = 0;
  for (let i = 0; i < bucketCount; i++) {
    if (totals[i] > maxTotalVol) {
      maxTotalVol = totals[i];
      pocIdx = i;
    }
    const d = Math.abs(upVol[i] - dnVol[i]);
    if (d > maxAbsDelta) maxAbsDelta = d;
  }
  if (maxTotalVol <= 0) return null;

  const { valIdx, vahIdx } = expandValueArea(
    totals,
    pocIdx,
    totalVolume,
    config.valueAreaPercent,
  );

  // Detect HVN ("mountains") and LVN ("valleys") on a smoothed 24-bin coarse envelope
  const hvnIndices: number[] = [];
  const lvnIndices: number[] = [];
  if (config.showHvnLvn && bucketCount >= 12) {
    const win = Math.max(1, Math.floor(bucketCount / 28));
    const smooth = new Float64Array(bucketCount);
    for (let i = 0; i < bucketCount; i++) {
      let sum = 0;
      let cnt = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(bucketCount - 1, i + win); j++) {
        sum += totals[j];
        cnt++;
      }
      smooth[i] = cnt > 0 ? sum / cnt : 0;
    }
    let smoothMax = 0;
    for (let i = 0; i < bucketCount; i++) {
      if (smooth[i] > smoothMax) smoothMax = smooth[i];
    }
    const minSep = Math.max(2, Math.floor(bucketCount / 10));
    for (let i = win; i < bucketCount - win; i++) {
      const v = smooth[i];
      let isLocalMax = true;
      let isLocalMin = true;
      for (let j = Math.max(0, i - win); j <= Math.min(bucketCount - 1, i + win); j++) {
        if (j === i) continue;
        if (smooth[j] > v) isLocalMax = false;
        if (smooth[j] < v) isLocalMin = false;
      }
      if (isLocalMax && v >= smoothMax * 0.72) {
        if (hvnIndices.length === 0 || i - hvnIndices[hvnIndices.length - 1] >= minSep) {
          hvnIndices.push(i);
        }
      } else if (isLocalMin && v > 0 && v <= smoothMax * 0.34) {
        if (lvnIndices.length === 0 || i - lvnIndices[lvnIndices.length - 1] >= minSep) {
          lvnIndices.push(i);
        }
      }
    }
  }

  const bins: VpBinResult[] = new Array(bucketCount);
  for (let i = 0; i < bucketCount; i++) {
    const pLow = lowPrice + i * step;
    const pHigh = pLow + step;
    bins[i] = {
      priceLow: pLow,
      priceHigh: pHigh,
      priceMid: (pLow + pHigh) * 0.5,
      upVol: upVol[i],
      downVol: dnVol[i],
      totalVol: totals[i],
      deltaVol: upVol[i] - dnVol[i],
      inValueArea: i >= valIdx && i <= vahIdx,
    };
  }

  return {
    bins,
    lowPrice,
    highPrice,
    pocIdx,
    vahIdx,
    valIdx,
    pocPrice: lowPrice + (pocIdx + 0.5) * step,
    vahPrice: lowPrice + (vahIdx + 1) * step,
    valPrice: lowPrice + valIdx * step,
    maxTotalVol,
    maxAbsDelta,
    totalVolume,
    hvnIndices,
    lvnIndices,
    developing,
  };
}

export interface SwingPivotLabel {
  time: number;
  price: number;
  kind: "HH" | "HL" | "LH" | "LL";
  isHigh: boolean;
}

export interface StructureBreakLine {
  fromTime: number;
  toTime: number;
  price: number;
  direction: "bullish" | "bearish";
  label: "BOS";
}

export interface MarketStructureResult {
  pivots: SwingPivotLabel[];
  breaks: StructureBreakLine[];
}

/**
 * Detects Market Structure pivots (HH, HL, LH, LL) and Break of Structure (BOS)
 * matching Abel's `01Market Structure.md` playbook.
 */
export function detectMarketStructure(
  candles: readonly { time: number; open: number; high: number; low: number; close: number }[],
  swingLookback = 5,
): MarketStructureResult {
  const pivots: SwingPivotLabel[] = [];
  const breaks: StructureBreakLine[] = [];
  if (candles.length < swingLookback * 2 + 1) {
    return { pivots, breaks };
  }

  let lastHighPrice: number | null = null;
  let lastLowPrice: number | null = null;
  let activeHigh: { time: number; price: number; broken: boolean } | null = null;
  let activeLow: { time: number; price: number; broken: boolean } | null = null;

  for (let i = swingLookback; i < candles.length - swingLookback; i++) {
    const c = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = i - swingLookback; j <= i + swingLookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isSwingHigh = false;
      if (candles[j].low <= c.low) isSwingLow = false;
    }

    if (isSwingHigh) {
      const kind: "HH" | "LH" =
        lastHighPrice === null || c.high >= lastHighPrice ? "HH" : "LH";
      pivots.push({ time: c.time, price: c.high, kind, isHigh: true });
      lastHighPrice = c.high;
      activeHigh = { time: c.time, price: c.high, broken: false };
    } else if (isSwingLow) {
      const kind: "HL" | "LL" =
        lastLowPrice === null || c.low >= lastLowPrice ? "HL" : "LL";
      pivots.push({ time: c.time, price: c.low, kind, isHigh: false });
      lastLowPrice = c.low;
      activeLow = { time: c.time, price: c.low, broken: false };
    }

    // Check BOS at confirmation bar (i + swingLookback)
    const cur = candles[i + swingLookback];
    if (activeHigh && !activeHigh.broken && cur.close > activeHigh.price) {
      activeHigh.broken = true;
      breaks.push({
        fromTime: activeHigh.time,
        toTime: cur.time,
        price: activeHigh.price,
        direction: "bullish",
        label: "BOS",
      });
    }
    if (activeLow && !activeLow.broken && cur.close < activeLow.price) {
      activeLow.broken = true;
      breaks.push({
        fromTime: activeLow.time,
        toTime: cur.time,
        price: activeLow.price,
        direction: "bearish",
        label: "BOS",
      });
    }
  }

  return {
    pivots: pivots.slice(-18),
    breaks: breaks.slice(-8),
  };
}
