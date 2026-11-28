import { expect, it } from "vitest";
import type { UTCTimestamp } from "lightweight-charts";
import { calculateVwap, DEFAULT_VWAP } from "./vwap-settings";

const start = 86_400;
const candles = [10, 20, 30].map((close, index) => ({
  time: (start + index * 1800) as UTCTimestamp,
  open: close, high: close, low: close, close,
}));
const volumes = candles.map(({ time }) => ({ time, value: 1 }));

it("calculates session VWAP, weighted dispersion and positive offsets", () => {
  const points = calculateVwap(candles, volumes, "30m", "hlc3", { ...DEFAULT_VWAP, offset: 1 });
  expect(points.map((point) => point?.value)).toEqual([undefined, 10, 15, 20]);
  expect(points[2]?.distance).toBe(5);
});

it("waits for the higher timeframe close and avoids using future data in previews", () => {
  const options = { ...DEFAULT_VWAP, timeframe: "1h" };
  expect(calculateVwap(candles, volumes, "30m", "close", options, start + 4000)
    .map((point) => point?.value)).toEqual([undefined, 20, 20]);
  const preview = calculateVwap(candles, volumes, "30m", "close", { ...options, waitForClose: false }, start + 4000);
  expect(preview.slice(0, 2).map((point) => point?.value)).toEqual([10, 20]);
  expect(preview[2]?.value).toBeCloseTo(70 / 3);
});
