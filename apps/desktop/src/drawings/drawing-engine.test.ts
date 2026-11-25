import { describe, expect, it } from "vitest";
import { DrawingEngine, snapTickToMagnet, type PlacedDrawingKind } from "./drawing-engine";

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
});
