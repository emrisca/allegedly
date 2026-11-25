import { describe, expect, it } from "vitest";
import { applyBarHysteresis, MAX_ACTIVE_BARS, TRIM_TARGET_BARS } from "./hysteresis";

describe("LWC v5.3 5,000/6,000 sliding-window hysteresis (ADR-0003)", () => {
  it("trims cleanly from 6,001 bars down to 5,000 newest bars and updates live bar in place", () => {
    let bars = Array.from({ length: MAX_ACTIVE_BARS }, (_, i) => ({ time: i * 60, close: 100 + i }));
    const inPlace = applyBarHysteresis(bars, { time: (MAX_ACTIVE_BARS - 1) * 60, close: 999 });
    expect(inPlace.trimmed).toBe(false);
    expect(inPlace.bars).toHaveLength(MAX_ACTIVE_BARS);
    expect(inPlace.bars[inPlace.bars.length - 1].close).toBe(999);

    const overflow = applyBarHysteresis(inPlace.bars, { time: MAX_ACTIVE_BARS * 60, close: 1000 });
    expect(overflow.trimmed).toBe(true);
    expect(overflow.bars).toHaveLength(TRIM_TARGET_BARS);
    expect(overflow.bars[0].time).toBe(1001 * 60);
    expect(overflow.bars[overflow.bars.length - 1].close).toBe(1000);
  });
});
