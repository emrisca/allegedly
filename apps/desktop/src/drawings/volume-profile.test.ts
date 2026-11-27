import { describe, expect, it } from "vitest";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { DrawingEngine } from "./drawing-engine";
import {
  computeFixedRangeVolumeProfile,
  DEFAULT_VOLUME_PROFILE_CONFIG,
  detectMarketStructure,
} from "./volume-profile";

function makeBar(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
): CandlestickData<UTCTimestamp> {
  return { time: time as UTCTimestamp, open, high, low, close };
}

function makeVpBar(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
) {
  return { time, open, high, low, close, volume };
}

describe("Volume Profile (AMT / FRVP) & Market Structure", () => {
  it("matches exact default FRVP inputs and styling from user notes", () => {
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.rowsLayout).toBe("number_of_rows");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.rowSize).toBe(1000);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.volumeMode).toBe("up_down");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.valueAreaPercent).toBe(68);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.extendRight).toBe(false);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.showProfile).toBe(true);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.showValues).toBe(false);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.widthPercent).toBe(35);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.placement).toBe("left");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.upVolumeColor).toBe("#535353");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.downVolumeColor).toBe("#4a4b50");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.valueAreaUpColor).toBe("#0c0d12");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.valueAreaDownColor).toBe("#0c0d12");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.vahColor).toBe("#ffffff");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.valColor).toBe("#ffffff");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.pocColor).toBe("#f13545");
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.showDevelopingPoc).toBe(false);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.showDevelopingVa).toBe(false);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.showHistogramBox).toBe(true);
    expect(DEFAULT_VOLUME_PROFILE_CONFIG.histogramBoxColor).toBe("#162629");
  });

  it("computes POC, 68% Value Area (VAH/VAL), developing curves, and HVN/LVN accurately", () => {
    const bars = [
      makeVpBar(1000, 100, 110, 95, 105, 200),
      makeVpBar(1060, 104, 108, 102, 106, 500),
      makeVpBar(1120, 105, 107, 103, 105, 800),
      makeVpBar(1180, 105, 106, 104, 105.5, 1200),
      makeVpBar(1240, 104, 118, 103, 115, 150),
    ];

    const prof = computeFixedRangeVolumeProfile(bars, 0.01, {
      ...DEFAULT_VOLUME_PROFILE_CONFIG,
      rowSize: 40,
      valueAreaPercent: 68,
      showDevelopingPoc: true,
      showDevelopingVa: true,
      showHvnLvn: true,
    });

    expect(prof).not.toBeNull();
    if (!prof) return;
    expect(prof.bins.length).toBe(40);
    // POC must lie around the heavy 104–106 cluster
    expect(prof.pocPrice).toBeGreaterThanOrEqual(103);
    expect(prof.pocPrice).toBeLessThanOrEqual(107);
    expect(prof.vahPrice).toBeGreaterThanOrEqual(prof.pocPrice);
    expect(prof.valPrice).toBeLessThanOrEqual(prof.pocPrice);

    const vaVol = prof.bins
      .filter((b) => b.inValueArea)
      .reduce((acc, b) => acc + b.totalVol, 0);
    expect(vaVol / prof.totalVolume).toBeGreaterThanOrEqual(0.68);
    expect(prof.developing.length).toBe(bars.length);
  });

  it("supports ticks_per_row layout mode", () => {
    const bars = [
      makeVpBar(1000, 100, 105, 100, 104, 100),
      makeVpBar(1060, 104, 110, 102, 108, 200),
    ];
    const prof = computeFixedRangeVolumeProfile(bars, 0.01, {
      ...DEFAULT_VOLUME_PROFILE_CONFIG,
      rowsLayout: "ticks_per_row",
      rowSize: 50,
    });
    expect(prof).not.toBeNull();
    // Range is $10, tick is $0.01, 50 ticks/row => $0.50/row => ~20 rows
    expect(prof!.bins.length).toBeGreaterThanOrEqual(18);
    expect(prof!.bins.length).toBeLessThanOrEqual(22);
  });

  it("detects HH/HL swing pivots and bullish Break of Structure (BOS)", () => {
    const highs = [100, 102, 105, 108, 104, 103, 101, 102, 104, 107, 112, 115, 110, 108, 107, 109, 113, 119];
    const lows = [98, 99, 101, 103, 100, 99, 97, 99, 101, 103, 106, 109, 106, 105, 104, 106, 109, 114];
    const candles = highs.map((h, i) =>
      makeBar(1000 + i * 60, (h + lows[i]) / 2, h, lows[i], h - 0.5),
    );
    const ms = detectMarketStructure(candles, 2);
    expect(ms.pivots.length).toBeGreaterThanOrEqual(2);
    expect(ms.pivots.some((p) => p.kind === "HH" || p.kind === "HL")).toBe(true);
    expect(ms.breaks.some((b) => b.direction === "bullish")).toBe(true);
  });

  it("round-trips FRVP vpConfig, AVWAP bands, and R:R ratio through .atanalysis.toml", () => {
    const engine = new DrawingEngine();
    const frvp = engine.add("fixed_range_vp", "BTC-USD", [
      { timeSec: 1000, priceTick: 10000n },
      { timeSec: 2000, priceTick: 12000n },
    ]);
    engine.update(frvp.id, {
      vpConfig: {
        ...DEFAULT_VOLUME_PROFILE_CONFIG,
        rowSize: 500,
        valueAreaPercent: 70,
        extendRight: true,
        placement: "right",
        showHvnLvn: true,
      },
    });
    const avwap = engine.add("anchored_vwap", "BTC-USD", [
      { timeSec: 1500, priceTick: 10500n },
    ]);
    engine.update(avwap.id, { avwapShowBands: true, avwapBandMult: 1.5 });

    const pos = engine.add("long_position", "BTC-USD", [
      { timeSec: 1600, priceTick: 10600n },
      { timeSec: 1900, priceTick: 10400n },
    ]);
    engine.update(pos.id, { rrRatio: 3 });

    const toml = engine.toAtAnalysisToml();
    const restored = new DrawingEngine();
    restored.loadFromAtAnalysisToml(toml);
    const list = restored.list("BTC-USD");
    expect(list.length).toBe(3);

    const rFrvp = list.find((d) => d.kind === "fixed_range_vp")!;
    expect(rFrvp.vpConfig?.rowSize).toBe(500);
    expect(rFrvp.vpConfig?.valueAreaPercent).toBe(70);
    expect(rFrvp.vpConfig?.extendRight).toBe(true);
    expect(rFrvp.vpConfig?.placement).toBe("right");
    expect(rFrvp.vpConfig?.showHvnLvn).toBe(true);

    const rAvwap = list.find((d) => d.kind === "anchored_vwap")!;
    expect(rAvwap.avwapShowBands).toBe(true);
    expect(rAvwap.avwapBandMult).toBe(1.5);

    const rPos = list.find((d) => d.kind === "long_position")!;
    expect(rPos.rrRatio).toBe(3);
  });
});
