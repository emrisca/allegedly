import { alignTimeSecToTimeframe, timeframeBucketCloseSec, timeframeToSeconds } from "@allegedly/ipc-client";
import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";
import type { IndicatorLineStyle, IndicatorPriceSource } from "../components/indicator-settings-dialog";

export const DEFAULT_VWAP = {
  anchor: "D", timeframe: "", waitForClose: true, hideOnDaily: false, offset: 0,
  mode: "deviation", showLine: true,
  bands: [1, 2, 3].map((multiplier, i) => ({
    multiplier, enabled: i === 0, upper: true, lower: true, fill: true,
    upperColor: ["#4caf50", "#a8a62a", "#009688"][i],
    lowerColor: ["#4caf50", "#a8a62a", "#009688"][i],
    upperStyle: "solid" as IndicatorLineStyle, lowerStyle: "solid" as IndicatorLineStyle,
    fillColor: ["#4caf50", "#a8a62a", "#009688"][i], fillOpacity: 0.08,
  })),
};
export type VwapSettings = typeof DEFAULT_VWAP;
export type VwapPoint = { value: number; distance: number; anchor: number } | null;

export function calculateVwap(
  candles: readonly CandlestickData<UTCTimestamp>[],
  volumes: readonly HistogramData<UTCTimestamp>[],
  chartTimeframe: string,
  source: IndicatorPriceSource,
  settings: VwapSettings,
  now = Date.now() / 1000,
): VwapPoint[] {
  const tf = settings.timeframe;
  const useHigher = !!tf && timeframeToSeconds(tf) > timeframeToSeconds(chartTimeframe);
  const groups: Array<{ time: number; start: number; end: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  for (const [index, candle] of candles.entries()) {
    const time = useHigher ? alignTimeSecToTimeframe(candle.time, tf) : candle.time;
    const previous = groups.at(-1);
    const volume = volumes[index]?.value ?? 0;
    if (previous?.time === time) {
      previous.high = Math.max(previous.high, candle.high);
      previous.low = Math.min(previous.low, candle.low);
      previous.close = candle.close;
      previous.volume += volume;
      previous.end = index;
    } else {
      groups.push({ ...candle, time, start: index, end: index, volume });
    }
  }

  const result: VwapPoint[] = Array(candles.length + Math.max(0, settings.offset)).fill(null);
  let weight = 0, mean = 0, deviation = 0, anchor = -1;
  let previous: VwapPoint = null;
  for (const [index, bar] of groups.entries()) {
    const key = alignTimeSecToTimeframe(bar.time, settings.anchor);
    if (key !== anchor) {
      anchor = key;
      weight = mean = deviation = 0;
      previous = null;
    }
    const valueFor = (sample: { high: number; low: number; close: number; open: number; volume: number }) => {
      const price = source === "hl2" ? (sample.high + sample.low) / 2
        : source === "hlc3" ? (sample.high + sample.low + sample.close) / 3
        : source === "ohlc4" ? (sample.open + sample.high + sample.low + sample.close) / 4 : sample[source];
      const total = weight + sample.volume;
      if (total <= 0) return { point: null, total, nextMean: mean, nextDeviation: deviation };
      const delta = price - mean;
      const nextMean = mean + delta * sample.volume / total;
      const nextDeviation = deviation + sample.volume * delta * (price - nextMean);
      return {
        total, nextMean, nextDeviation,
        point: {
          value: nextMean, anchor,
          distance: settings.mode === "percent" ? nextMean / 100 : Math.sqrt(Math.max(0, nextDeviation / total)),
        },
      };
    };
    const final = valueFor(bar);
    const partial = { ...bar, high: -Infinity, low: Infinity, volume: 0 };
    for (let i = bar.start; i <= bar.end; i++) {
      let output = final.point;
      if (useHigher && settings.waitForClose) {
        output = i === bar.end && (index < groups.length - 1 || now >= timeframeBucketCloseSec(bar.time, tf))
          ? final.point : previous;
      } else if (useHigher) {
        const candle = candles[i];
        partial.high = Math.max(partial.high, candle.high);
        partial.low = Math.min(partial.low, candle.low);
        partial.close = candle.close;
        partial.volume += volumes[i]?.value ?? 0;
        output = valueFor(partial).point;
      }
      const shifted = i + settings.offset;
      if (shifted >= 0 && shifted < result.length) result[shifted] = output;
    }
    weight = final.total;
    mean = final.nextMean;
    deviation = final.nextDeviation;
    previous = final.point;
  }
  return result;
}
