import {
  alignTimeSecToTimeframe,
  BIT_BUY_IMBAL,
  BIT_POC,
  BIT_SELL_IMBAL,
  unpackTradeFlags,
  type FootprintCell,
  type LiveTradeRecord,
} from "@allegedly/ipc-client";

const MAX_BARS = 256;
const MAX_LEVELS_PER_BAR = 2048;

interface FootprintBar {
  cells: Map<bigint, FootprintCell>;
  poc: FootprintCell;
}

export class TradeFootprints {
  private readonly bars = new Map<number, FootprintBar>();

  constructor(private readonly tickSizeE9: bigint, private readonly timeframe: string) {}

  add(trades: readonly LiveTradeRecord[]): void {
    if (this.tickSizeE9 <= 0n) return;
    for (const trade of trades) {
      const { side } = unpackTradeFlags(trade.flags);
      if ((side !== 1 && side !== 2) || trade.qtyE9 <= 0n) continue;
      const time = alignTimeSecToTimeframe(Number(trade.tsNs / 1_000_000_000n), this.timeframe);
      const priceTick = (trade.priceE9 + this.tickSizeE9 / 2n) / this.tickSizeE9;
      let bar = this.bars.get(time);
      let cell = bar?.cells.get(priceTick);
      if (!cell) {
        if (bar && bar.cells.size >= MAX_LEVELS_PER_BAR) continue;
        cell = { priceTick, bidVolE9: 0n, askVolE9: 0n, tradeCount: 0, imbalanceFlags: 0 };
        if (!bar) {
          bar = { cells: new Map(), poc: cell };
          this.bars.set(time, bar);
        }
        bar.cells.set(priceTick, cell);
      }
      if (!bar) continue;
      if (side === 1) cell.askVolE9 += trade.qtyE9;
      else cell.bidVolE9 += trade.qtyE9;
      cell.tradeCount++;
      cell.imbalanceFlags &= BIT_POC;
      if (cell.askVolE9 > 0n && cell.askVolE9 >= cell.bidVolE9 * 3n) cell.imbalanceFlags |= BIT_BUY_IMBAL;
      if (cell.bidVolE9 > 0n && cell.bidVolE9 >= cell.askVolE9 * 3n) cell.imbalanceFlags |= BIT_SELL_IMBAL;
      if (cell.askVolE9 + cell.bidVolE9 > bar.poc.askVolE9 + bar.poc.bidVolE9) {
        bar.poc.imbalanceFlags &= ~BIT_POC;
        bar.poc = cell;
      }
      bar.poc.imbalanceFlags |= BIT_POC;
    }
    while (this.bars.size > MAX_BARS) {
      this.bars.delete(Math.min(...this.bars.keys()));
    }
  }

  *visible(from: number, to: number): IterableIterator<[number, Iterable<FootprintCell>]> {
    for (const [time, bar] of this.bars) {
      if (time >= from && time <= to) yield [time, bar.cells.values()];
    }
  }
}
