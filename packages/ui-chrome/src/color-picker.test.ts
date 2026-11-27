import { describe, expect, it } from "vitest";
import {
  addRecentColor,
  getRecentColors,
  normalizeHexColor,
  TV_COLOR_PALETTE_ROWS,
} from "./color-picker";

describe("color-picker", () => {
  it("exposes an 8x10 TradingView swatch grid", () => {
    expect(TV_COLOR_PALETTE_ROWS).toHaveLength(8);
    for (const row of TV_COLOR_PALETTE_ROWS) {
      expect(row).toHaveLength(10);
    }
  });

  it("normalizes 3-char and 6-char hex values and records recent colors MRU without duplicates", () => {
    expect(normalizeHexColor("#ABC")).toBe("#aabbcc");
    expect(normalizeHexColor("12AB34")).toBe("#12ab34");
    expect(normalizeHexColor("not-a-hex")).toBeNull();

    addRecentColor("#12ab34");
    addRecentColor("#ff00aa");
    addRecentColor("#12AB34");
    const recents = getRecentColors();
    expect(recents[0]).toBe("#12ab34");
    expect(recents[1]).toBe("#ff00aa");
    expect(recents.filter((c) => c === "#12ab34")).toHaveLength(1);
    expect(recents.length).toBeLessThanOrEqual(19);
  });
});
