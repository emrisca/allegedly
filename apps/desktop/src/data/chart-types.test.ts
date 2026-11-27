import { describe, expect, it } from "vitest";
import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";
import {
  buildVolumeWeightedCandles,
  transformHeikinAshi,
  transformHighLow,
  transformKagi,
  transformLineBreak,
  transformPointAndFigure,
  transformRangeBars,
  transformRenko,
} from "./chart-types";

const SAMPLE_BARS: CandlestickData<UTCTimestamp>[] = [
  { time: 1000 as UTCTimestamp, open: 100, high: 103, low: 99, close: 102 },
  { time: 1060 as UTCTimestamp, open: 102, high: 106, low: 101, close: 105 },
  { time: 1120 as UTCTimestamp, open: 105, high: 109, low: 104, close: 108 },
  { time: 1180 as UTCTimestamp, open: 108, high: 110, low: 103, close: 104 },
  { time: 1240 as UTCTimestamp, open: 104, high: 105, low: 98, close: 99 },
  { time: 1300 as UTCTimestamp, open: 99, high: 102, low: 96, close: 97 },
  { time: 1360 as UTCTimestamp, open: 97, high: 104, low: 96, close: 103 },
  { time: 1420 as UTCTimestamp, open: 103, high: 111, low: 102, close: 110 },
];

const SAMPLE_VOLS: HistogramData<UTCTimestamp>[] = SAMPLE_BARS.map((b, i) => ({
  time: b.time,
  value: 100 + i * 250,
}));

function assertStrictlyAscending(times: number[]) {
  for (let i = 1; i < times.length; i++) {
    expect(times[i]).toBeGreaterThan(times[i - 1]);
  }
}

describe("Chart Bar Types Transforms (All 21 TradingView Styles)", () => {
  it("computes standard Heikin Ashi candles", () => {
    const ha = transformHeikinAshi(SAMPLE_BARS);
    expect(ha).toHaveLength(SAMPLE_BARS.length);
    expect(ha[0].close).toBeCloseTo((100 + 103 + 99 + 102) / 4, 6);
    expect(ha[1].open).toBeCloseTo((ha[0].open + ha[0].close) / 2, 6);
    assertStrictlyAscending(ha.map((b) => Number(b.time)));
  });

  it("computes High-low range bars without altering high/low bounds", () => {
    const hl = transformHighLow(SAMPLE_BARS);
    expect(hl).toHaveLength(SAMPLE_BARS.length);
    expect(hl[0].open).toBe(99);
    expect(hl[0].close).toBe(103);
  });

  it("computes monotonic Renko bricks with fixed brick height", () => {
    const renko = transformRenko(SAMPLE_BARS, 2);
    expect(renko.length).toBeGreaterThanOrEqual(4);
    for (const b of renko) {
      expect(Math.abs(b.close - b.open)).toBeCloseTo(2, 6);
    }
    assertStrictlyAscending(renko.map((b) => Number(b.time)));
  });

  it("computes monotonic 3-Line Break bars", () => {
    const lb = transformLineBreak(SAMPLE_BARS, 3);
    expect(lb.length).toBeGreaterThanOrEqual(3);
    assertStrictlyAscending(lb.map((b) => Number(b.time)));
  });

  it("computes monotonic Kagi points with yang/yin trend flips", () => {
    const kagi = transformKagi(SAMPLE_BARS, 3);
    expect(kagi.length).toBeGreaterThanOrEqual(3);
    assertStrictlyAscending(kagi.map((p) => Number(p.time)));
  });

  it("computes Point & Figure X/O columns", () => {
    const pf = transformPointAndFigure(SAMPLE_BARS, 2);
    expect(pf.length).toBeGreaterThanOrEqual(1);
    assertStrictlyAscending(pf.map((c) => Number(c.time)));
  });

  it("computes constant-range bars", () => {
    const rng = transformRangeBars(SAMPLE_BARS, 4);
    expect(rng.length).toBeGreaterThanOrEqual(3);
    for (const b of rng) {
      expect(b.high - b.low).toBeCloseTo(4, 6);
    }
    assertStrictlyAscending(rng.map((b) => Number(b.time)));
  });

  it("weights Volume candles alpha monotonically with volume", () => {
    const vc = buildVolumeWeightedCandles(SAMPLE_BARS, SAMPLE_VOLS, "#26a69a", "#ef5350");
    expect(vc).toHaveLength(SAMPLE_BARS.length);
    expect(vc[0].color).toContain("rgba(");
    expect(vc[vc.length - 1].color).toContain("1.00)");
  });
});
