import {
  BookState,
  encodeLiveBarUpdateBatch,
  encodeLiveL2BookBatch,
  encodeLiveTradeBatch,
  encodeStreamStatusFrame,
  packTradeFlags,
  ProvenanceTier,
  type LiveBarUpdate,
  type LiveL2BookLevel,
  type LiveTradeRecord,
} from "./decoder.js";
import type {
  BootConfig,
  PaperAccountSnapshot,
  PaperOrderRequest,
  PaperOrderTicket,
  TransportAdapter,
  WorkspacePatch,
  WorkspacePatchResult,
  WorkspaceState,
} from "./transport.js";

const SYMBOL_BASE_PRICE_E9: Record<string, bigint> = {
  "BTC/USD": 95_000_000_000_000n,
  "ETH/USD": 3_420_000_000_000n,
  "SOL/USD": 238_500_000_000n,
};

const SYMBOL_TICK_E9: Record<string, bigint> = {
  "BTC/USD": 500_000_000n, // $0.50
  "ETH/USD": 100_000_000n, // $0.10
  "SOL/USD": 10_000_000n,  // $0.01
};

/**
 * Deterministic zero-network local simulator transport (SV-01 / T07 / T08).
 * Emits authentic ALG2 v1 binary frames without opening any network socket.
 */
export class OfflineSimTransportAdapter implements TransportAdapter {
  public readonly kind = "offline-sim" as const;

  private readonly bootConfig: BootConfig = {
    updates_check_on_startup: false,
    live_armed: false,
    offline_mode: true,
  };

  private workspace: WorkspaceState = {
    state_rev: 0,
    link_group_symbols: { A: "BTC/USD" },
    active_theme: "allegedly-dark",
    live_armed: false,
    selected_object_id: null,
  };

  private prngState = 0xa11e6ed1n;
  private seq = 0n;
  private bookSeq = 0n;
  private currentPriceE9 = SYMBOL_BASE_PRICE_E9["BTC/USD"];
  private tickSizeE9 = SYMBOL_TICK_E9["BTC/USD"];
  private currentBarStartSec = Math.floor(Date.now() / 60_000) * 60;
  private barOpenE9 = SYMBOL_BASE_PRICE_E9["BTC/USD"];
  private barHighE9 = SYMBOL_BASE_PRICE_E9["BTC/USD"];
  private barLowE9 = SYMBOL_BASE_PRICE_E9["BTC/USD"];
  private barVolE9 = 0n;
  private barBuyVolE9 = 0n;
  private barSellVolE9 = 0n;

  private orderCounter = 0;
  private readonly orders: PaperOrderTicket[] = [];
  private readonly netPositions = new Map<string, bigint>();
  private readonly listeners = new Map<number, Set<(frame: ArrayBuffer) => void>>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  private nextRand(): bigint {
    // Deterministic xorshift64* (pure BigInt — zero float math)
    let x = this.prngState;
    x ^= (x >> 12n) & 0xffffffffffffffffn;
    x ^= (x << 25n) & 0xffffffffffffffffn;
    x ^= (x >> 27n) & 0xffffffffffffffffn;
    this.prngState = x;
    return (x * 2685821657736338717n) & 0xffffffffffffffffn;
  }

  private resetSymbol(symbol: string): void {
    const base = SYMBOL_BASE_PRICE_E9[symbol] ?? 100_000_000_000n;
    this.tickSizeE9 = SYMBOL_TICK_E9[symbol] ?? 10_000_000n;
    this.currentPriceE9 = base;
    this.barOpenE9 = base;
    this.barHighE9 = base;
    this.barLowE9 = base;
    this.barVolE9 = 0n;
    this.barBuyVolE9 = 0n;
    this.barSellVolE9 = 0n;
  }

  public getCurrentPriceE9(): bigint {
    return this.currentPriceE9;
  }

  public getTickSizeE9(): bigint {
    return this.tickSizeE9;
  }

  public stepFrames(streamId: number): ArrayBuffer[] {
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const trades: LiveTradeRecord[] = [];
    const batchCount = 4;

    for (let i = 0; i < batchCount; i++) {
      const r = this.nextRand();
      const deltaTicks = (r % 5n) - 2n; // -2..+2 ticks
      this.currentPriceE9 += deltaTicks * this.tickSizeE9;
      if (this.currentPriceE9 < this.tickSizeE9 * 10n) {
        this.currentPriceE9 = this.tickSizeE9 * 10n;
      }
      const side = Number((r >> 8n) & 1n) === 0 ? 1 : 2; // 1=buy, 2=sell
      const qtyE9 = ((r >> 12n) % 2_500_000_000n) + 50_000_000n; // 0.05..2.55 units
      this.seq += 1n;

      if (this.currentPriceE9 > this.barHighE9) this.barHighE9 = this.currentPriceE9;
      if (this.currentPriceE9 < this.barLowE9) this.barLowE9 = this.currentPriceE9;
      this.barVolE9 += qtyE9;
      if (side === 1) this.barBuyVolE9 += qtyE9;
      else this.barSellVolE9 += qtyE9;

      trades.push({
        seq: this.seq,
        tsNs: nowNs + BigInt(i) * 1_000_000n,
        priceE9: this.currentPriceE9,
        qtyE9,
        flags: packTradeFlags(side, ProvenanceTier.ExactTickAggr, 0, false),
      });
    }

    const nowSec = Math.floor(Date.now() / 60_000) * 60;
    if (nowSec > this.currentBarStartSec) {
      this.currentBarStartSec = nowSec;
      this.barOpenE9 = this.currentPriceE9;
      this.barHighE9 = this.currentPriceE9;
      this.barLowE9 = this.currentPriceE9;
      this.barVolE9 = 0n;
      this.barBuyVolE9 = 0n;
      this.barSellVolE9 = 0n;
    }

    const bar: LiveBarUpdate = {
      tsOpenNs: BigInt(this.currentBarStartSec) * 1_000_000_000n,
      openTick: this.barOpenE9 / this.tickSizeE9,
      highTick: this.barHighE9 / this.tickSizeE9,
      lowTick: this.barLowE9 / this.tickSizeE9,
      closeTick: this.currentPriceE9 / this.tickSizeE9,
      volumeE9: this.barVolE9,
      buyVolE9: this.barBuyVolE9,
      sellVolE9: this.barSellVolE9,
      flags: 0n,
    };

    const levels: LiveL2BookLevel[] = [];
    for (let i = 1; i <= 12; i++) {
      const rBid = this.nextRand();
      const rAsk = this.nextRand();
      levels.push({
        priceE9: this.currentPriceE9 - BigInt(i) * this.tickSizeE9,
        qtyE9: ((rBid % 15n) + 1n) * 250_000_000n,
        sideActionFlags: 0, // bid
        orderCount: Number((rBid >> 4n) % 18n) + 1,
      });
      levels.push({
        priceE9: this.currentPriceE9 + BigInt(i) * this.tickSizeE9,
        qtyE9: ((rAsk % 15n) + 1n) * 250_000_000n,
        sideActionFlags: 1, // ask
        orderCount: Number((rAsk >> 4n) % 18n) + 1,
      });
    }
    this.bookSeq += 1n;

    return [
      encodeLiveTradeBatch(streamId, nowNs, trades),
      encodeLiveBarUpdateBatch(streamId, nowNs, [bar]),
      encodeLiveL2BookBatch(
        streamId,
        nowNs,
        {
          bookSeq: this.bookSeq,
          levelCount: levels.length,
          bookState: BookState.Live,
          isSnapshot: true,
          provenanceTier: ProvenanceTier.ExactTickAggr,
          provenanceModifiers: 0,
        },
        levels,
      ),
      encodeStreamStatusFrame(streamId, nowNs, {
        seq: this.seq,
        droppedTotal: 0,
        reasonCode: 0,
        bookState: BookState.Live,
        provenanceTier: ProvenanceTier.ExactTickAggr,
      }),
    ];
  }

  private ensureTimer(): void {
    if (this.intervalHandle !== null) return;
    this.intervalHandle = setInterval(() => {
      for (const [streamId, subs] of this.listeners.entries()) {
        if (subs.size === 0) continue;
        const frames = this.stepFrames(streamId);
        for (const frame of frames) {
          for (const cb of subs) cb(frame);
        }
      }
    }, 120);
  }

  async invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes> {
    switch (cmd) {
      case "get_boot_config":
        return { ...this.bootConfig } as TRes;

      case "get_workspace_snapshot":
        return {
          ...this.workspace,
          link_group_symbols: { ...this.workspace.link_group_symbols },
        } as TRes;

      case "apply_workspace_patch": {
        const patch = payload as unknown as WorkspacePatch;
        if (patch.observed_rev < this.workspace.state_rev) {
          const res: WorkspacePatchResult = {
            accepted: false,
            current_rev: this.workspace.state_rev,
          };
          return res as TRes;
        }
        if (patch.set_link_symbol) {
          const [grp, sym] = patch.set_link_symbol;
          this.workspace.link_group_symbols[grp] = sym;
          this.resetSymbol(sym);
        }
        if (patch.set_theme) {
          this.workspace.active_theme = patch.set_theme;
        }
        if (patch.set_selected_object !== undefined) {
          this.workspace.selected_object_id = patch.set_selected_object;
        }
        this.workspace.state_rev += 1;
        const res: WorkspacePatchResult = {
          accepted: true,
          current_rev: this.workspace.state_rev,
        };
        return res as TRes;
      }

      case "get_paper_account":
        return this.snapshotPaperAccount() as TRes;

      case "submit_paper_order": {
        const req = payload as unknown as PaperOrderRequest;
        const qty = BigInt(req.qty_e9);
        if (qty <= 0n) {
          throw new Error("Order quantity must be > 0");
        }
        const id = `SIM-${String(++this.orderCounter).padStart(4, "0")}`;
        const isMarket = req.order_type === "market";
        const ticket: PaperOrderTicket = {
          order_id: id,
          symbol: req.symbol,
          side: req.side,
          order_type: req.order_type,
          qty_e9: qty.toString(),
          limit_price_e9: req.limit_price_e9 ?? null,
          fill_price_e9: isMarket ? this.currentPriceE9.toString() : null,
          status: isMarket ? "filled" : "working",
          created_ms: Date.now(),
        };
        this.orders.unshift(ticket);
        if (isMarket) {
          const prev = this.netPositions.get(req.symbol) ?? 0n;
          this.netPositions.set(req.symbol, req.side === "buy" ? prev + qty : prev - qty);
        }
        return this.snapshotPaperAccount() as TRes;
      }

      case "kill_switch_cancel_all": {
        for (const o of this.orders) {
          if (o.status === "working") {
            o.status = "canceled";
          }
        }
        return this.snapshotPaperAccount() as TRes;
      }

      default:
        throw new Error(`Unknown offline-sim command: ${cmd}`);
    }
  }

  private snapshotPaperAccount(): PaperAccountSnapshot {
    const net: Record<string, string> = {};
    for (const [k, v] of this.netPositions.entries()) {
      net[k] = v.toString();
    }
    return {
      mode: "PAPER / SIM",
      live_armed: false,
      net_position_e9: net,
      orders: this.orders.slice(0, 50).map((o) => ({ ...o })),
    };
  }

  subscribeBinary(streamId: number, onFrame: (frame: ArrayBuffer) => void): () => void {
    let set = this.listeners.get(streamId);
    if (!set) {
      set = new Set();
      this.listeners.set(streamId, set);
    }
    set.add(onFrame);
    // Emit initial seed frames immediately on next microtask for snappy first paint
    queueMicrotask(() => {
      if (set?.has(onFrame)) {
        for (const frame of this.stepFrames(streamId)) {
          onFrame(frame);
        }
      }
    });
    this.ensureTimer();
    return () => {
      set?.delete(onFrame);
      if (set && set.size === 0) {
        this.listeners.delete(streamId);
      }
      if (this.listeners.size === 0 && this.intervalHandle !== null) {
        clearInterval(this.intervalHandle);
        this.intervalHandle = null;
      }
    };
  }

  dispose(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.listeners.clear();
  }
}
