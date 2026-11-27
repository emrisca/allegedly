import { describe, expect, it } from "vitest";
import {
  DEFAULT_FAVORITE_TOOLS,
  DRAWING_SLOTS,
  DrawingEngine,
  hitTestDrawing,
  computeRulerMetrics,
  snapTickToMagnet,
  type PlacedDrawingKind,
} from "./drawing-engine";

describe("Clean-room Drawing Engine (E06 / SV-17)", () => {
  it("supports all 6 v0.1 tools, Undo/Redo stack, and exact BigInt .atanalysis.toml round-trip", () => {
    const engine = new DrawingEngine();
    const kinds: PlacedDrawingKind[] = [
      "trendline",
      "horizontal_ray",
      "fib_retracement",
      "box_zone",
      "price_range",
      "anchored_vwap",
    ];

    for (let i = 0; i < kinds.length; i++) {
      engine.add(kinds[i], "BTC/USD", [
        { timeSec: 1_732_500_000 + i * 60, priceTick: 190_000n + BigInt(i) },
        { timeSec: 1_732_500_600 + i * 60, priceTick: 190_050n + BigInt(i) },
      ]);
    }
    expect(engine.list("BTC/USD")).toHaveLength(6);
    expect(engine.canUndo()).toBe(true);

    expect(engine.undo()).toBe(true);
    expect(engine.list("BTC/USD")).toHaveLength(5);
    expect(engine.canRedo()).toBe(true);

    expect(engine.redo()).toBe(true);
    expect(engine.list("BTC/USD")).toHaveLength(6);

    const toml = engine.toAtAnalysisToml();
    expect(toml).toContain('schema_version = "allegedly.analysis.v1"');
    expect(toml).toContain('price_tick = "190000"');

    const restored = new DrawingEngine();
    const loadedCount = restored.loadFromAtAnalysisToml(toml);
    expect(loadedCount).toBe(6);
    expect(restored.list("BTC/USD")[0].anchors[0].priceTick).toBe(190_000n);
  });

  it("scopes clear(symbol) on redo, preserves monotonic IDs after reload, and round-trips escaped TOML strings (RTSD-17)", () => {
    const engine = new DrawingEngine();
    const btc = engine.add(
      "trendline",
      "BTC/USD",
      [
        { timeSec: 100, priceTick: 190_000n },
        { timeSec: 200, priceTick: 190_100n },
      ],
      "#38bdf8",
      'Breakout "A" \\ line\n2',
    );
    const eth = engine.add("horizontal_ray", "ETH/USD", [
      { timeSec: 100, priceTick: 35_000n },
    ]);
    expect(btc.id).toBe("drw-1");
    expect(eth.id).toBe("drw-2");

    // Clear only BTC/USD, undo, then redo — ETH/USD must survive redo!
    engine.clear("BTC/USD");
    expect(engine.list("BTC/USD")).toHaveLength(0);
    expect(engine.list("ETH/USD")).toHaveLength(1);

    expect(engine.undo()).toBe(true);
    expect(engine.list("BTC/USD")).toHaveLength(1);
    expect(engine.list("ETH/USD")).toHaveLength(1);

    expect(engine.redo()).toBe(true);
    expect(engine.list("BTC/USD")).toHaveLength(0);
    expect(engine.list("ETH/USD")).toHaveLength(1);

    // Undo so both exist, check TOML escape round-trip, then remove drw-1 & reload
    expect(engine.undo()).toBe(true);
    const tomlWithEscapes = engine.toAtAnalysisToml();
    const loaded = new DrawingEngine();
    expect(loaded.loadFromAtAnalysisToml(tomlWithEscapes)).toBe(2);
    expect(loaded.list("BTC/USD")[0].label).toBe('Breakout "A" \\ line\n2');

    engine.remove("drw-1");
    const sparseToml = engine.toAtAnalysisToml();
    const sparseLoaded = new DrawingEngine();
    expect(sparseLoaded.loadFromAtAnalysisToml(sparseToml)).toBe(1);
    const next = sparseLoaded.add("horizontal_ray", "SOL/USD", [{ timeSec: 300, priceTick: 18500n }]);
    expect(next.id).toBe("drw-3");
  });

  it("performs exact SV-17 integer magnet snap to TPO POC/VAH/VAL and bar OHLC", () => {
    const snap = snapTickToMagnet(
      190_003n,
      [
        { priceTick: 190_000n, source: "tpo_poc" },
        { priceTick: 190_020n, source: "tpo_vah" },
      ],
      5n,
    );
    expect(snap.snappedTick).toBe(190_000n);
    expect(snap.target?.source).toBe("tpo_poc");

    const miss = snapTickToMagnet(190_100n, [{ priceTick: 190_000n, source: "tpo_poc" }], 5n);
    expect(miss.snappedTick).toBe(190_100n);
    expect(miss.target).toBeNull();
  });

  it("computes exact BigInt ruler metrics (delta, %, ticks, bars, duration, cumulative volume)", () => {
    const start = { timeSec: 1_700_000_000, priceTick: 29_394n }; // 7348.50 at $0.25 tick
    const end = { timeSec: 1_700_000_000 + 29 * 86400, priceTick: 28_427n }; // -967 ticks (-241.75)
    const bars = Array.from({ length: 20 }, (_, i) => ({
      timeSec: 1_700_000_000 + Math.round((i * 29 * 86400) / 19),
      volume: 3_870_500_000,
    }));
    const metrics = computeRulerMetrics({
      start,
      end,
      tickSizeE9: 250_000_000n,
      bars,
    });
    expect(metrics.deltaTicks).toBe(-967n);
    expect(metrics.deltaPrice).toBeCloseTo(-241.75, 2);
    expect(metrics.pctChange).toBeCloseTo(-3.29, 2);
    expect(metrics.barCount).toBe(20);
    expect(metrics.durationLabel).toBe("29d");
    expect(metrics.volumeLabel).toBe("77.41 B");
    expect(metrics.isNegative).toBe(true);
  });

  it("exposes all 7 categorized sidebar slots, 12 default favorites, and TOML round-trip for new tools", () => {
    expect(DRAWING_SLOTS).toHaveLength(7);
    expect(DEFAULT_FAVORITE_TOOLS).toEqual([
      "box_zone",
      "path",
      "trendline",
      "horizontal_ray",
      "fixed_range_vp",
      "fib_retracement",
      "short_position",
      "long_position",
      "anchored_vwap",
      "brush",
      "text",
      "anchored_vp",
    ]);

    const engine = new DrawingEngine();
    engine.add("long_position", "ES1!", [
      { timeSec: 1000, priceTick: 28_000n },
      { timeSec: 2000, priceTick: 28_200n },
    ]);
    engine.add("fixed_range_vp", "ES1!", [
      { timeSec: 1000, priceTick: 28_000n },
      { timeSec: 3000, priceTick: 28_300n },
    ]);
    engine.add("icon_stamp", "ES1!", [{ timeSec: 1500, priceTick: 28_100n }], "#e6e8ee", "🎯");

    const reloaded = new DrawingEngine();
    expect(reloaded.loadFromAtAnalysisToml(engine.toAtAnalysisToml())).toBe(3);
    expect(reloaded.list("ES1!")[2].label).toBe("🎯");
  });

  it("supports style/text/coordinate updates with undo/redo, TOML round-trip, and hitTestDrawing", () => {
    const engine = new DrawingEngine();
    const trend = engine.add("trendline", "BTC/USD", [
      { timeSec: 1000, priceTick: 100n },
      { timeSec: 2000, priceTick: 200n },
    ]);

    const updated = engine.update(trend.id, {
      color: "#f23645",
      lineWidth: 3,
      lineStyle: "dashed",
      extendRight: true,
      label: "Resistance",
      fontSize: 14,
      textColor: "#ffffff",
      locked: true,
    });
    expect(updated?.color).toBe("#f23645");
    expect(updated?.lineWidth).toBe(3);
    expect(updated?.lineStyle).toBe("dashed");
    expect(updated?.extendRight).toBe(true);
    expect(updated?.locked).toBe(true);

    // TOML round-trip preserves custom style metadata
    const reloaded = new DrawingEngine();
    expect(reloaded.loadFromAtAnalysisToml(engine.toAtAnalysisToml())).toBe(1);
    const rt = reloaded.list("BTC/USD")[0];
    expect(rt.lineWidth).toBe(3);
    expect(rt.lineStyle).toBe("dashed");
    expect(rt.extendRight).toBe(true);
    expect(rt.fontSize).toBe(14);
    expect(rt.textColor).toBe("#ffffff");
    expect(rt.locked).toBe(true);

    // Undo restores previous style cleanly
    expect(engine.undo()).toBe(true);
    expect(engine.getById(trend.id)?.lineStyle).toBeUndefined();
    expect(engine.redo()).toBe(true);
    expect(engine.getById(trend.id)?.lineStyle).toBe("dashed");

    // Hit-test anchor vs body vs empty canvas
    const toPixel = (a: { timeSec: number; priceTick: bigint }) => ({
      x: (a.timeSec - 1000) / 10, // 0..100
      y: Number(a.priceTick), // 100..200
    });
    const hitAnchor = hitTestDrawing(engine.list("BTC/USD"), 2, 101, toPixel, 400, 400);
    expect(hitAnchor?.hitKind).toBe("anchor");
    expect(hitAnchor?.anchorIndex).toBe(0);

    const hitBody = hitTestDrawing(engine.list("BTC/USD"), 50, 150, toPixel, 400, 400);
    expect(hitBody?.hitKind).toBe("body");

    const miss = hitTestDrawing(engine.list("BTC/USD"), 50, 20, toPixel, 400, 400);
    expect(miss).toBeNull();
  });
});
