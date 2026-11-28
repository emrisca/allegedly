import { describe, expect, it } from "vitest";
import {
  createDefaultAlertDraft,
  evaluateAlertsOnPrice,
  formatAlertConditionSummary,
  formatNotificationSummary,
} from "./alert-engine";

describe("alert-engine", () => {
  it("formats TradingView-style alert condition and notification summaries", () => {
    const draft = createDefaultAlertDraft({
      symbol: "NQ1!",
      timeframe: "5m",
      price: 27032.25,
      decimals: 2,
      nowMs: 1_700_000_000_000,
    });
    expect(formatAlertConditionSummary("NQ1!", draft.conditions, 2)).toBe("NQ1! Crossing 27,032.25");
    expect(formatNotificationSummary(draft.notifications)).toBe("App, Toasts, Sound");
  });

  it("triggers crossing alerts and transitions only_once alerts to triggered", () => {
    const al = {
      ...createDefaultAlertDraft({
        symbol: "NQ1!",
        timeframe: "5m",
        price: 27040,
        nowMs: 1_700_000_000_000,
      }),
      trigger: "only_once" as const,
    };

    const miss = evaluateAlertsOnPrice({
      alerts: [al],
      symbol: "NQ1!",
      prevPrice: 27020,
      nextPrice: 27035,
      barTimeSec: 1700000100,
      nowMs: 1_700_000_010_000,
    });
    expect(miss.triggered).toHaveLength(0);

    const hit = evaluateAlertsOnPrice({
      alerts: miss.alerts,
      symbol: "NQ1!",
      prevPrice: 27035,
      nextPrice: 27042,
      barTimeSec: 1700000100,
      nowMs: 1_700_000_020_000,
    });
    expect(hit.triggered).toHaveLength(1);
    expect(hit.alerts[0].status).toBe("triggered");
  });

  it("deduplicates once_per_bar alerts within the same bar and fires again on a new bar", () => {
    const al = {
      ...createDefaultAlertDraft({
        symbol: "BTC/USD",
        timeframe: "1m",
        price: 95000,
        nowMs: 1_700_000_000_000,
      }),
      trigger: "once_per_bar" as const,
    };

    const first = evaluateAlertsOnPrice({
      alerts: [al],
      symbol: "BTC/USD",
      prevPrice: 94950,
      nextPrice: 95010,
      barTimeSec: 1700000100,
      nowMs: 1_700_000_010_000,
    });
    expect(first.triggered).toHaveLength(1);
    expect(first.alerts[0].status).toBe("active");

    const sameBar = evaluateAlertsOnPrice({
      alerts: first.alerts,
      symbol: "BTC/USD",
      prevPrice: 95010,
      nextPrice: 94990,
      barTimeSec: 1700000100,
      nowMs: 1_700_000_020_000,
    });
    expect(sameBar.triggered).toHaveLength(0);

    const nextBar = evaluateAlertsOnPrice({
      alerts: sameBar.alerts,
      symbol: "BTC/USD",
      prevPrice: 94990,
      nextPrice: 95020,
      barTimeSec: 1700000160,
      nowMs: 1_700_000_060_000,
    });
    expect(nextBar.triggered).toHaveLength(1);
  });
});
