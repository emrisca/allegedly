import { describe, expect, it } from "vitest";
import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";
import {
  computeVwapKeyLevels,
  DEFAULT_VWAP_KEY_LEVELS_CONFIG,
} from "./vwap-key-levels";
import {
  computeTradingSessionBoxes,
  DEFAULT_TRADING_SESSIONS_CONFIG,
  isMinuteInSession,
  parseSessionWindow,
} from "./trading-sessions";

function makeCandle(timeSec: number, price: number, spread = 2): CandlestickData {
  return {
    time: timeSec as UTCTimestamp,
    open: price,
    high: price + spread,
    low: price - spread,
    close: price,
  };
}

function makeVol(timeSec: number, value: number): HistogramData {
  return { time: timeSec as UTCTimestamp, value };
}

describe("VWAP Key Levels indicator", () => {
  it("computes Monthly, Weekly, Yearly VWAP ± 1σ bands and preserves completed Previous Week levels", () => {
    // Week 1: Mon 2026-01-05 (100, vol=10), Tue 2026-01-06 (110, vol=10) -> mean=105, stdev=5 -> VAH=110, VAL=100
    // Week 2: Mon 2026-01-12 (120, vol=20) -> resets weekly VWAP to 120 and captures prevWeek=(105, 110, 100)
    const t1 = Math.floor(Date.UTC(2026, 0, 5, 12, 0) / 1000);
    const t2 = Math.floor(Date.UTC(2026, 0, 6, 12, 0) / 1000);
    const t3 = Math.floor(Date.UTC(2026, 0, 12, 12, 0) / 1000);

    const candles = [makeCandle(t1, 100), makeCandle(t2, 110), makeCandle(t3, 120)];
    const volumes = [makeVol(t1, 10), makeVol(t2, 10), makeVol(t3, 20)];

    const out = computeVwapKeyLevels(candles, volumes, DEFAULT_VWAP_KEY_LEVELS_CONFIG);
    expect(out.weekly).toHaveLength(3);
    expect(out.weekly[0].reset).toBe(true);
    expect(out.weekly[1].reset).toBe(false);
    expect(out.weekly[2].reset).toBe(true);

    // Completed previous week (pwVWAP/pwVAH/pwVAL)
    expect(out.latestLevels.prevVwap).toBeCloseTo(105, 6);
    expect(out.latestLevels.prevVah).toBeCloseTo(110, 6);
    expect(out.latestLevels.prevVal).toBeCloseTo(100, 6);

    // Current week reset on Mon Jan 12
    expect(out.latestLevels.weekVwap).toBeCloseTo(120, 6);

    // Monthly VWAP spans all 3 bars in Jan 2026: (100*10 + 110*10 + 120*20) / 40 = 4500/40 = 112.5
    expect(out.latestLevels.monthVwap).toBeCloseTo(112.5, 6);
    expect(out.latestLevels.monthVah!).toBeGreaterThan(112.5);
    expect(out.latestLevels.monthVal!).toBeLessThan(112.5);
  });
});

describe("Trading Sessions indicator", () => {
  it("handles overnight wrap (Tokyo 2000-0200) and daytime sessions (London 0400-1200, NY 0930-1600) in America/New_York", () => {
    const tokyoWin = parseSessionWindow("2000-0200")!;
    expect(isMinuteInSession(20 * 60, tokyoWin)).toBe(true);
    expect(isMinuteInSession(1 * 60 + 30, tokyoWin)).toBe(true);
    expect(isMinuteInSession(2 * 60, tokyoWin)).toBe(false);
    expect(isMinuteInSession(12 * 60, tokyoWin)).toBe(false);

    // Build 24 hours of 1h candles in EST (UTC-5 on 2026-01-15)
    const startUtc = Date.UTC(2026, 0, 15, 0, 0) / 1000; // 19:00 NY
    const candles: CandlestickData[] = [];
    for (let h = 0; h < 24; h++) {
      candles.push(makeCandle(startUtc + h * 3600, 100 + h, 1));
    }

    const boxes = computeTradingSessionBoxes(candles, DEFAULT_TRADING_SESSIONS_CONFIG, "1h");
    const ids = boxes.map((b) => b.id);
    expect(ids).toContain("tokyo");
    expect(ids).toContain("london");
    expect(ids).toContain("newYork");

    // Non-intraday timeframe skips session boxes gracefully
    const dailyBoxes = computeTradingSessionBoxes(candles, DEFAULT_TRADING_SESSIONS_CONFIG, "D");
    expect(dailyBoxes).toHaveLength(0);
  });
});

describe("VWAP Key Levels & custom timeframe defaults", () => {
  it("matches Abel's exact VWAP Key Levels defaults (10 bars, 3 offset, orange/gray/white/red, traditional off)", () => {
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.lineBars).toBe(10);
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.rightOffset).toBe(3);
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.monthVwapColor).toBe("#ff9800");
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.monthBandColor).toBe("#9598a1");
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.prevVwapColor).toBe("#ffffff");
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.prevBandColor).toBe("#ffffff");
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.weekVwapColor).toBe("#f23645");
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.weekBandColor).toBe("#9598a1");
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.showTraditionalMonthly).toBe(false);
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.showTraditionalYearly).toBe(false);
    expect(DEFAULT_VWAP_KEY_LEVELS_CONFIG.showTraditionalWeekly).toBe(false);
  });
});
