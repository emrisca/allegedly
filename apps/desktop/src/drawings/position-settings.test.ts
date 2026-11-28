import { expect, it } from "vitest";
import {
  computePositionStatLines,
  DEFAULT_POSITION_SETTINGS,
  estimatePositionQuantity,
  positionDecimalE9,
  positionDistances,
  resolvePositionStatsFields,
} from "./position-settings";

it("sizes linear positions using the lower of the risk and buying-power limits", () => {
  const amount = positionDecimalE9;
  const settings = {
    ...DEFAULT_POSITION_SETTINGS,
    lotSize: "2",
    accountSize: "1000",
    leverage: "2",
    risk: "2",
    riskUnit: "%" as const,
    quantityPrecision: 2,
  };
  expect(estimatePositionQuantity(amount("100"), amount("5"), settings)).toBe("2.00");
  expect(
    estimatePositionQuantity(amount("100"), amount("5"), {
      ...settings,
      risk: "500",
      riskUnit: "USD",
    }),
  ).toBe("10.00");
  expect(positionDistances(1000n, 850n, { ...settings, stopTicks: "47" })).toEqual({
    targetTicks: 150n,
    stopTicks: 47n,
  });
});

it("resolves legacy and multi-select stats fields and formats fixed-point position metrics", () => {
  expect(resolvePositionStatsFields(DEFAULT_POSITION_SETTINGS)).toEqual([
    "tpTickOffset",
    "riskRewardRatio",
    "slTickOffset",
  ]);
  expect(resolvePositionStatsFields({ stats: "none" })).toEqual([]);
  expect(
    resolvePositionStatsFields({
      statsFields: ["slPl", "tpPriceOffset", "qty", "openClosedPl"],
    }),
  ).toEqual(["tpPriceOffset", "openClosedPl", "qty", "slPl"]);

  const metrics = computePositionStatLines({
    isShort: false,
    entryTick: 1000n,
    targetTicks: 200n,
    stopTicks: 100n,
    tickSizeE9: 1_000_000_000n,
    digits: 2,
    currentPriceE9: 1050_000_000_000n,
    settings: {
      ...DEFAULT_POSITION_SETTINGS,
      accountSize: "10000",
      lotSize: "1",
      risk: "1000",
      riskUnit: "USD",
      leverage: "20",
      quantityPrecision: 1,
      statsFields: [
        "tpPriceOffset",
        "tpPercentOffset",
        "tpTickOffset",
        "tpAmount",
        "tpPl",
        "openClosedPl",
        "qty",
        "riskRewardRatio",
        "slPriceOffset",
        "slPercentOffset",
        "slTickOffset",
        "slAmount",
        "slPl",
      ],
    },
  });

  expect(metrics.tp).toEqual(["+200.00", "+20.00%", "+200t", "+$2000.00", "Acct $12000.00"]);
  expect(metrics.center).toEqual(["P&L +$500.00", "Qty 10.0", "R:R 2.00"]);
  expect(metrics.sl).toEqual(["-100.00", "-10.00%", "-100t", "-$1000.00", "Acct $9000.00"]);
});
