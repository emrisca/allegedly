import { describe, expect, it, vi } from "vitest";
import {
  aggregateOhlcBars,
  alignTimeSecToTimeframe,
  fetchHistoricalOhlc,
  mapSymbolToCoinbaseProduct,
  mapSymbolToKrakenRestPair,
  mapTimeframeToCoinbaseGranularity,
  mapTimeframeToKrakenInterval,
  parseCoinbaseCandlesResponse,
  parseKrakenOhlcResponse,
  timeframeToSeconds,
} from "./historical-ohlc.js";

describe("historical-ohlc", () => {
  it("never calls fetch in paper_sim mode (SV-01 offline boot guarantee)", async () => {
    const mockFetch = vi.fn();
    const bars = await fetchHistoricalOhlc({
      source: "paper_sim",
      symbol: "BTC/USD",
      timeframe: "1h",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    expect(bars).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("keeps the immediately preceding Coinbase candle and excludes the current page", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("end")).toBe(new Date(540_000).toISOString());
      return Response.json([[600, 10, 12, 10, 11, 3], [540, 9, 11, 9, 10, 2]]);
    };
    const bars = await fetchHistoricalOhlc({
      source: "coinbase_ws", symbol: "BTC/USD", timeframe: "1m",
      endTimeSec: 600, limit: 300, fetchImpl,
    });
    expect(bars.map((bar) => bar.time)).toEqual([540]);
  });

  it("maps symbols and timeframes accurately for Kraken and Coinbase", () => {
    expect(mapSymbolToKrakenRestPair("BTC/USD")).toBe("XBTUSD");
    expect(mapSymbolToKrakenRestPair("ETH/USD")).toBe("ETHUSD");
    expect(mapSymbolToKrakenRestPair("SOL/USD")).toBe("SOLUSD");
    expect(mapSymbolToKrakenRestPair("ES1!")).toBeNull();

    expect(mapSymbolToCoinbaseProduct("BTC/USD")).toBe("BTC-USD");
    expect(mapSymbolToCoinbaseProduct("ETH/USD")).toBe("ETH-USD");
    expect(mapSymbolToCoinbaseProduct("SOL/USD")).toBe("SOL-USD");

    expect(mapTimeframeToKrakenInterval("1m")).toBe(1);
    expect(mapTimeframeToKrakenInterval("1h")).toBe(60);
    expect(mapTimeframeToKrakenInterval("4h")).toBe(240);
    expect(mapTimeframeToKrakenInterval("D")).toBe(1440);
    expect(mapTimeframeToKrakenInterval("W")).toBe(10080);

    expect(mapTimeframeToCoinbaseGranularity("1m")).toBe(60);
    expect(mapTimeframeToCoinbaseGranularity("1h")).toBe(3600);
    expect(mapTimeframeToCoinbaseGranularity("4h")).toBe(3600);
    expect(mapTimeframeToCoinbaseGranularity("D")).toBe(86400);

    expect(timeframeToSeconds("15m")).toBe(900);
    expect(timeframeToSeconds("D")).toBe(86400);
  });

  it("parses Kraken OHLC responses, sorts ascending, and deduplicates", () => {
    const payload = {
      error: [],
      result: {
        XXBTZUSD: [
          [1793185200, "81378.5", "81399.0", "81197.1", "81207.5", "81282.0", "34.25", 2877],
          [1793181600, "81431.7", "81489.3", "81333.1", "81374.1", "81418.6", "33.06", 3092],
          [1793185200, "81378.5", "81410.0", "81197.1", "81220.0", "81290.0", "36.50", 2910],
        ],
        last: 1793185200,
      },
    };
    const bars = parseKrakenOhlcResponse(payload, 300);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({
      time: 1793181600,
      open: 81431.7,
      high: 81489.3,
      low: 81333.1,
      close: 81374.1,
      volume: 33.06,
    });
    expect(bars[1].close).toBe(81220);
    expect(bars[1].volume).toBe(36.5);
  });

  it("throws when Kraken returns a non-empty error array", () => {
    expect(() =>
      parseKrakenOhlcResponse({ error: ["EQuery:Unknown asset pair"], result: {} }),
    ).toThrow(/Unknown asset pair/);
  });

  it("parses Coinbase newest-first [time, low, high, open, close, volume] tuples in ascending order", () => {
    const payload = [
      [1795773600, 61500, 61664.03, 61548.59, 61534.8, 92.71],
      [1795770000, 61506.54, 61780.88, 61646.93, 61548.59, 163.76],
    ];
    const bars = parseCoinbaseCandlesResponse(payload, 300);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({
      time: 1795770000,
      open: 61646.93,
      high: 61780.88,
      low: 61506.54,
      close: 61548.59,
      volume: 163.76,
    });
    expect(bars[1]).toEqual({
      time: 1795773600,
      open: 61548.59,
      high: 61664.03,
      low: 61500,
      close: 61534.8,
      volume: 92.71,
    });
  });

  it("fetches Kraken and Coinbase endpoints with mapped query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[1795773600, 100, 110, 105, 108, 42]],
    });
    const bars = await fetchHistoricalOhlc({
      source: "coinbase_ws",
      symbol: "ETH/USD",
      timeframe: "15m",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=900",
      { signal: undefined },
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].open).toBe(105);
    expect(bars[0].low).toBe(100);
  });

  it("paginates backwards for Coinbase to load >300 candles when a full page returns", async () => {
    const makePage = (startSec: number, n: number) =>
      Array.from({ length: n }, (_, idx) => {
        const ts = startSec + (n - 1 - idx) * 3600;
        return [ts, 99, 102, 100, 101, 10];
      });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makePage(1795000000, 300) })
      .mockResolvedValueOnce({ ok: true, json: async () => makePage(1795000000 - 300 * 3600, 300) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const bars = await fetchHistoricalOhlc({
      source: "coinbase_ws",
      symbol: "BTC/USD",
      timeframe: "1h",
      limit: 1500,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(bars).toHaveLength(600);
    expect(bars[0].time).toBeLessThan(bars[bars.length - 1].time);
  });

  it("aligns timestamps and aggregates 1m bars into exact 15m and 4h candles", () => {
    // 15 one-minute bars starting at 12:00:00 UTC -> single 15m candle
    const base = Date.UTC(2026, 10, 27, 12, 0, 0) / 1000;
    const oneMinBars = Array.from({ length: 15 }, (_, i) => ({
      time: base + i * 60,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
      volume: 10,
    }));
    const fifteen = aggregateOhlcBars(oneMinBars, "15m");
    expect(fifteen).toHaveLength(1);
    expect(fifteen[0]).toEqual({
      time: base,
      open: 100,
      high: 116,
      low: 99,
      close: 115,
      volume: 150,
    });

    // Weekly alignment snaps to Monday 00:00 UTC
    const fri = Date.UTC(2026, 10, 27, 15, 30, 0) / 1000; // Fri Nov 27, 2026
    const mon = Date.UTC(2026, 10, 23, 0, 0, 0) / 1000;   // Mon Nov 23, 2026
    expect(alignTimeSecToTimeframe(fri, "W")).toBe(mon);
  });
});
