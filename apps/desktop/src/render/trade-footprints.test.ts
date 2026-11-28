import { BIT_BUY_IMBAL, BIT_POC, type LiveTradeRecord } from "@allegedly/ipc-client";
import { expect, it } from "vitest";
import { TradeFootprints } from "./trade-footprints";

it("retains streamed bid and ask quantities on their candle after the next candle opens", () => {
  const footprints = new TradeFootprints(250_000_000n, "5m");
  const trade = (time: number, side: number, quantity: bigint): LiveTradeRecord => ({
    seq: BigInt(time),
    tsNs: BigInt(time) * 1_000_000_000n,
    priceE9: 100_250_000_000n,
    qtyE9: quantity,
    flags: side,
  });

  footprints.add([trade(305, 1, 3n), trade(599, 2, 1n), trade(600, 2, 2n), trade(601, 0, 5n)]);

  const [[time, levels]] = [...footprints.visible(300, 599)];
  expect(time).toBe(300);
  expect([...levels]).toEqual([{
    priceTick: 401n,
    bidVolE9: 1n,
    askVolE9: 3n,
    tradeCount: 2,
    imbalanceFlags: BIT_BUY_IMBAL | BIT_POC,
  }]);
  const [[, nextLevels]] = [...footprints.visible(600, 899)];
  expect([...nextLevels][0].bidVolE9).toBe(2n);
});
