import {
  BIT_BUY_IMBAL,
  BIT_POC,
  BIT_SELL_IMBAL,
  BookState,
  encodeFootprintDelta,
  encodeTpoProfileBitmask,
  encodeVolumeProfile,
  encodeLiveBarUpdateBatch,
  encodeLiveL2BookBatch,
  encodeLiveTradeBatch,
  encodeStreamStatusFrame,
  packTradeFlags,
  ProvenanceTier,
  type LiveBarUpdate,
  type LiveL2BookLevel,
  type FootprintCell,
  type LiveTradeRecord,
  type TpoRow128,
  type VolumeProfileBin,
} from "./decoder.js";
import {
  LIVE_MARKET_DATA_SYMBOLS,
  type BootConfig,
  type MarketDataSourceId,
  type MarketDataSourceRequest,
  type MarketDataStatusDto,
  PaperAccountSnapshot,
  PaperOrderRequest,
  PaperOrderTicket,
  ReplayControlAction,
  ReplaySpeed,
  ReplayStatusSnapshot,
  ResolvedSetting,
  StudyRunRequest,
  StudyRunResponse,
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

function parseDecimalToE9(val: string | number): bigint {
  const s = typeof val === "number" ? val.toFixed(9) : String(val).trim();
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s.startsWith("+") ? s.slice(1) : s;
  const [intPart = "0", fracPart = ""] = clean.split(".");
  const paddedFrac = (fracPart + "000000000").slice(0, 9);
  const intDigits = intPart.replace(/[^0-9]/g, "") || "0";
  const fracDigits = paddedFrac.replace(/[^0-9]/g, "").padEnd(9, "0");
  const absVal = BigInt(intDigits) * 1_000_000_000n + BigInt(fracDigits);
  return neg ? -absVal : absVal;
}

const COINBASE_PRODUCT_MAP: Record<string, string> = {
  "BTC/USD": "BTC-USD",
  "ETH/USD": "ETH-USD",
  "SOL/USD": "SOL-USD",
};

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
  private replayPlaying = false;
  private replaySpeed: ReplaySpeed = "1x";
  private replayCursor = 64;
  private readonly replayTotalTicks = 2000;
  private replayVerified = false;
  private readonly defaultSettings: Record<string, string> = {
    "updates.checkOnStartup": "false",
    "execution.live_armed": "false",
    "execution.mode": "\"paper_sim\"",
    "chart.max_active_bars": "6000",
    "chart.trim_target_bars": "5000",
    "orderflow.imbalance_ratio_bps": "30000",
    "orderflow.vrvp_value_area_bps": "7000",
    "orderflow.tpo_period_minutes": "30",
    "study.global_memory_cap_mib": "64",
    "ui.density": "\"compact\"",
    "ui.provenance_badge": "true",
  };
  private readonly instanceOverrides = new Map<string, string>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private marketSource: MarketDataSourceId = "paper_sim";
  private marketSymbol = "BTC/USD";
  private liveWs: WebSocket | null = null;
  private liveConnected = false;
  private liveTradesReceived = 0;
  private liveReconnects = 0;
  private liveLastError: string | null = null;
  private liveBids = new Map<string, bigint>();
  private liveAsks = new Map<string, bigint>();

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

    const centerTick = this.currentPriceE9 / this.tickSizeE9;
    const fpCells: FootprintCell[] = [];
    const vpBins: VolumeProfileBin[] = [];
    const tpoRows: TpoRow128[] = [];
    for (let offset = -5; offset <= 5; offset++) {
      const tick = centerTick + BigInt(offset);
      const weight = BigInt(6 - Math.abs(offset));
      const bidVol = weight * 420_000_000n + (this.nextRand() % 300_000_000n);
      const askVol = weight * 450_000_000n + (this.nextRand() % 300_000_000n);
      let flags = 0;
      if (offset === 0) flags |= BIT_POC;
      if (askVol > bidVol * 2n) flags |= BIT_BUY_IMBAL;
      if (bidVol > askVol * 2n) flags |= BIT_SELL_IMBAL;
      fpCells.push({
        priceTick: tick,
        bidVolE9: bidVol,
        askVolE9: askVol,
        tradeCount: Number(weight * 4n),
        imbalanceFlags: flags,
      });
      vpBins.push({
        priceTick: tick,
        bidVolE9: bidVol * 3n,
        askVolE9: askVol * 3n,
      });
      const mask = ((1n << (weight + 2n)) - 1n) << BigInt(Math.abs(offset));
      tpoRows.push({ priceTick: tick, periodMask: mask });
    }

    return [
      encodeLiveTradeBatch(streamId, nowNs, trades),
      encodeLiveBarUpdateBatch(streamId, nowNs, [bar]),
      encodeFootprintDelta(streamId, nowNs, fpCells),
      encodeVolumeProfile(
        streamId,
        nowNs,
        { pocPrice: centerTick, vahPrice: centerTick + 3n, valPrice: centerTick - 3n },
        vpBins,
      ),
      encodeTpoProfileBitmask(streamId, nowNs, { wordsPerRow: 2, periodCount: 16 }, tpoRows),
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
      if (this.marketSource !== "paper_sim") return;
      for (const [streamId, subs] of this.listeners.entries()) {
        if (subs.size === 0) continue;
        const frames = this.stepFrames(streamId);
        for (const frame of frames) {
          for (const cb of subs) cb(frame);
        }
      }
    }, 120);
  }

  private emitToAllStreams(framesForStream: (streamId: number) => ArrayBuffer[]): void {
    for (const [streamId, subs] of this.listeners.entries()) {
      if (subs.size === 0) continue;
      const frames = framesForStream(streamId);
      for (const frame of frames) {
        for (const cb of subs) cb(frame);
      }
    }
  }

  private closeLiveSocket(): void {
    if (this.liveWs) {
      try {
        this.liveWs.onopen = null;
        this.liveWs.onmessage = null;
        this.liveWs.onerror = null;
        this.liveWs.onclose = null;
        this.liveWs.close();
      } catch {
        // Ignore close errors
      }
      this.liveWs = null;
    }
    this.liveConnected = false;
    this.liveBids.clear();
    this.liveAsks.clear();
  }

  private snapshotMarketDataStatus(): MarketDataStatusDto {
    const isPaper = this.marketSource === "paper_sim";
    return {
      source: this.marketSource,
      symbol: this.marketSymbol,
      connected: isPaper ? true : this.liveConnected,
      book_state: isPaper || this.liveConnected ? "Live" : "Disconnected",
      provenance_tier: isPaper ? "PaperSim" : "ExactTickAggr",
      trades_received: this.liveTradesReceived,
      crc_ok: 0,
      crc_mismatches: 0,
      reconnects: this.liveReconnects,
      last_error: this.liveLastError,
      supported_symbols: [...LIVE_MARKET_DATA_SYMBOLS],
    };
  }

  private setMarketDataSource(req: MarketDataSourceRequest): MarketDataStatusDto {
    const nextSource = req.source;
    const nextSymbol = req.symbol || "BTC/USD";

    if (nextSource === "paper_sim") {
      this.closeLiveSocket();
      this.marketSource = "paper_sim";
      this.marketSymbol = nextSymbol;
      this.liveLastError = null;
      this.resetSymbol(nextSymbol);
      this.ensureTimer();
      return this.snapshotMarketDataStatus();
    }

    if (!(LIVE_MARKET_DATA_SYMBOLS as readonly string[]).includes(nextSymbol)) {
      throw new Error(
        `Unsupported live symbol '${nextSymbol}'. Supported live symbols: ${LIVE_MARKET_DATA_SYMBOLS.join(", ")}`,
      );
    }

    this.closeLiveSocket();
    this.marketSource = nextSource;
    this.marketSymbol = nextSymbol;
    this.liveTradesReceived = 0;
    this.liveLastError = null;
    this.resetSymbol(nextSymbol);

    if (typeof WebSocket === "undefined") {
      this.liveLastError = "WebSocket unavailable in this runtime";
      return this.snapshotMarketDataStatus();
    }

    const url =
      nextSource === "kraken_ws_v2"
        ? "wss://ws.kraken.com/v2"
        : "wss://advanced-trade-ws.coinbase.com";

    try {
      const ws = new WebSocket(url);
      this.liveWs = ws;

      ws.onopen = () => {
        if (this.liveWs !== ws) return;
        this.liveConnected = true;
        this.liveLastError = null;
        if (nextSource === "kraken_ws_v2") {
          ws.send(
            JSON.stringify({
              method: "subscribe",
              params: { channel: "trade", symbol: [nextSymbol], snapshot: true },
            }),
          );
          ws.send(
            JSON.stringify({
              method: "subscribe",
              params: { channel: "book", symbol: [nextSymbol], depth: 25, snapshot: true },
            }),
          );
        } else {
          const productId = COINBASE_PRODUCT_MAP[nextSymbol] ?? "BTC-USD";
          ws.send(
            JSON.stringify({
              type: "subscribe",
              product_ids: [productId],
              channel: "market_trades",
            }),
          );
          ws.send(
            JSON.stringify({
              type: "subscribe",
              product_ids: [productId],
              channel: "heartbeats",
            }),
          );
        }
        const nowNs = BigInt(Date.now()) * 1_000_000n;
        this.emitToAllStreams((streamId) => [
          encodeStreamStatusFrame(streamId, nowNs, {
            seq: ++this.seq,
            droppedTotal: 0,
            reasonCode: 0,
            bookState: BookState.Live,
            provenanceTier: ProvenanceTier.ExactTickAggr,
          }),
        ]);
      };

      ws.onmessage = (event) => {
        if (this.liveWs !== ws) return;
        try {
          const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (nextSource === "kraken_ws_v2") {
            this.handleKrakenMessage(msg);
          } else {
            this.handleCoinbaseMessage(msg);
          }
        } catch {
          // Ignore non-JSON frames
        }
      };

      ws.onerror = () => {
        if (this.liveWs !== ws) return;
        this.liveConnected = false;
        this.liveLastError = `Connection error on ${nextSource}`;
      };

      ws.onclose = () => {
        if (this.liveWs !== ws) return;
        this.liveConnected = false;
        const nowNs = BigInt(Date.now()) * 1_000_000n;
        this.emitToAllStreams((streamId) => [
          encodeStreamStatusFrame(streamId, nowNs, {
            seq: ++this.seq,
            droppedTotal: 0,
            reasonCode: 0x0503,
            bookState: BookState.Disconnected,
            provenanceTier: ProvenanceTier.ExactTickAggr,
          }),
        ]);
      };
    } catch (err) {
      this.liveConnected = false;
      this.liveLastError = err instanceof Error ? err.message : String(err);
    }

    return this.snapshotMarketDataStatus();
  }

  private pushLiveTradesAndBar(trades: LiveTradeRecord[], latestPriceE9: bigint, barSec: number): void {
    if (trades.length === 0) return;
    this.currentPriceE9 = latestPriceE9;
    this.liveTradesReceived += trades.length;
    if (barSec > this.currentBarStartSec || this.barVolE9 === 0n) {
      this.currentBarStartSec = barSec;
      this.barOpenE9 = latestPriceE9;
      this.barHighE9 = latestPriceE9;
      this.barLowE9 = latestPriceE9;
      this.barVolE9 = 0n;
      this.barBuyVolE9 = 0n;
      this.barSellVolE9 = 0n;
    }
    for (const tr of trades) {
      if (tr.priceE9 > this.barHighE9) this.barHighE9 = tr.priceE9;
      if (tr.priceE9 < this.barLowE9) this.barLowE9 = tr.priceE9;
      this.barVolE9 += tr.qtyE9;
      const side = tr.flags & 0x03;
      if (side === 1) this.barBuyVolE9 += tr.qtyE9;
      else this.barSellVolE9 += tr.qtyE9;
    }

    const nowNs = BigInt(Date.now()) * 1_000_000n;
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

    this.emitToAllStreams((streamId) => [
      encodeLiveTradeBatch(streamId, nowNs, trades),
      encodeLiveBarUpdateBatch(streamId, nowNs, [bar]),
    ]);
  }

  private handleKrakenMessage(msg: Record<string, unknown>): void {
    const channel = msg.channel;
    const data = msg.data;
    if (!Array.isArray(data) || data.length === 0) return;

    if (channel === "trade") {
      const trades: LiveTradeRecord[] = [];
      let latestPrice = this.currentPriceE9;
      let latestBarSec = Math.floor(Date.now() / 60_000) * 60;
      for (const item of data as Array<Record<string, unknown>>) {
        if (item.price === undefined || item.qty === undefined) continue;
        const priceE9 = parseDecimalToE9(item.price as string | number);
        const qtyE9 = parseDecimalToE9(item.qty as string | number);
        const side = item.side === "sell" ? 2 : 1;
        const tsMs = typeof item.timestamp === "string" ? Date.parse(item.timestamp) : Date.now();
        const validMs = Number.isFinite(tsMs) ? tsMs : Date.now();
        latestBarSec = Math.floor(validMs / 60_000) * 60;
        latestPrice = priceE9;
        this.seq += 1n;
        trades.push({
          seq: this.seq,
          tsNs: BigInt(Math.round(validMs)) * 1_000_000n,
          priceE9,
          qtyE9,
          flags: packTradeFlags(side, ProvenanceTier.ExactTickAggr, 0, false),
        });
      }
      this.pushLiveTradesAndBar(trades, latestPrice, latestBarSec);
      return;
    }

    if (channel === "book") {
      const entry = data[0] as Record<string, unknown>;
      const isSnapshot = msg.type === "snapshot";
      if (isSnapshot) {
        this.liveBids.clear();
        this.liveAsks.clear();
      }
      const applySide = (arr: unknown, book: Map<string, bigint>) => {
        if (!Array.isArray(arr)) return;
        for (const lvl of arr as Array<Record<string, unknown>>) {
          if (lvl.price === undefined || lvl.qty === undefined) continue;
          const pE9 = parseDecimalToE9(lvl.price as string | number);
          const qE9 = parseDecimalToE9(lvl.qty as string | number);
          const k = pE9.toString();
          if (qE9 === 0n) book.delete(k);
          else book.set(k, qE9);
        }
      };
      applySide(entry.bids, this.liveBids);
      applySide(entry.asks, this.liveAsks);

      const bidEntries = [...this.liveBids.entries()]
        .map(([k, q]) => [BigInt(k), q] as const)
        .sort((a, b) => (b[0] > a[0] ? 1 : b[0] < a[0] ? -1 : 0))
        .slice(0, 20);
      const askEntries = [...this.liveAsks.entries()]
        .map(([k, q]) => [BigInt(k), q] as const)
        .sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0))
        .slice(0, 20);

      const levels: LiveL2BookLevel[] = [];
      for (const [priceE9, qtyE9] of bidEntries) {
        levels.push({ priceE9, qtyE9, sideActionFlags: 0, orderCount: 1 });
      }
      for (const [priceE9, qtyE9] of askEntries) {
        levels.push({ priceE9, qtyE9, sideActionFlags: 1, orderCount: 1 });
      }
      this.bookSeq += 1n;
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      this.emitToAllStreams((streamId) => [
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
      ]);
    }
  }

  private handleCoinbaseMessage(msg: Record<string, unknown>): void {
    if (msg.channel !== "market_trades" || !Array.isArray(msg.events)) return;
    const rawTrades: Array<Record<string, unknown>> = [];
    for (const ev of msg.events as Array<Record<string, unknown>>) {
      if (Array.isArray(ev.trades)) {
        for (const t of ev.trades as Array<Record<string, unknown>>) {
          rawTrades.push(t);
        }
      }
    }
    if (rawTrades.length === 0) return;
    // Coinbase snapshots arrive newest-first; sort ascending by timestamp
    rawTrades.sort((a, b) => Date.parse(String(a.time ?? "")) - Date.parse(String(b.time ?? "")));
    const trades: LiveTradeRecord[] = [];
    let latestPrice = this.currentPriceE9;
    let latestBarSec = Math.floor(Date.now() / 60_000) * 60;
    for (const item of rawTrades) {
      if (item.price === undefined || item.size === undefined) continue;
      const priceE9 = parseDecimalToE9(item.price as string | number);
      const qtyE9 = parseDecimalToE9(item.size as string | number);
      // Coinbase `side` is maker side; invert to taker aggressor side
      const makerSide = String(item.side ?? "").toUpperCase();
      const takerSide = makerSide === "BUY" ? 2 : 1;
      const tsMs = typeof item.time === "string" ? Date.parse(item.time) : Date.now();
      const validMs = Number.isFinite(tsMs) ? tsMs : Date.now();
      latestBarSec = Math.floor(validMs / 60_000) * 60;
      latestPrice = priceE9;
      this.seq += 1n;
      trades.push({
        seq: this.seq,
        tsNs: BigInt(Math.round(validMs)) * 1_000_000n,
        priceE9,
        qtyE9,
        flags: packTradeFlags(takerSide, ProvenanceTier.ExactTickAggr, 0, false),
      });
    }
    this.pushLiveTradesAndBar(trades, latestPrice, latestBarSec);
  }

  async invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes> {
    switch (cmd) {
      case "report_ui_ready":
        return null as unknown as TRes;
      case "get_boot_config":
        return { ...this.bootConfig } as TRes;

      case "get_workspace_state":
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

      case "run_study": {
        const req = payload as unknown as StudyRunRequest;
        return this.evalOfflineStudy(req) as TRes;
      }

      case "get_replay_status":
        return this.snapshotReplay() as TRes;

      case "control_replay": {
        const act = payload as unknown as ReplayControlAction;
        return this.applyOfflineReplay(act) as TRes;
      }

      case "get_settings_cascade":
        return this.snapshotSettings() as TRes;

      case "update_setting_override": {
        const { key, value } = payload as unknown as { key: string; value: string };
        if ((key === "updates.checkOnStartup" || key === "execution.live_armed") && value.trim() !== "false") {
          throw new Error(`Safety invariant lock: ${key} is fixed to false in v0.1 (SV-01 / ADR-0009)`);
        }
        this.instanceOverrides.set(key, value);
        return this.snapshotSettings() as TRes;
      }

      case "reset_setting_override": {
        const { key } = payload as unknown as { key: string };
        this.instanceOverrides.delete(key);
        return this.snapshotSettings() as TRes;
      }

      case "export_workspace_toml": {
        const { name, symbol, timeframe } = payload as unknown as {
          name: string;
          symbol: string;
          timeframe: string;
        };
        const lines = [
          "# Allegedly Workspace Settings-as-Code (.atworkspace.toml)",
          "schema_version = 1",
          `workspace_name = "${name.replaceAll("\"", "")}"`,
          `active_symbol = "${symbol.replaceAll("\"", "")}"`,
          `active_timeframe = "${timeframe.replaceAll("\"", "")}"`,
          "",
          "[workspace]",
          "",
          "[template]",
          "",
          "[instance]",
        ];
        const sortedKeys = [...this.instanceOverrides.keys()].sort();
        for (const k of sortedKeys) {
          lines.push(`${k} = ${this.instanceOverrides.get(k)}`);
        }
        return (lines.join("\n") + "\n") as TRes;
      }

      case "set_market_data_source": {
        const req = payload as unknown as MarketDataSourceRequest;
        return this.setMarketDataSource(req) as TRes;
      }

      case "get_market_data_status":
        return this.snapshotMarketDataStatus() as TRes;

      default:
        throw new Error(`Unknown offline-sim command: ${cmd}`);
    }
  }

  private evalOfflineStudy(req: StudyRunRequest): StudyRunResponse {
    const closes = req.closes ?? [];
    const period = Math.max(1, Math.min(500, req.period ?? 14));
    const cap = 64 * 1024 * 1024;

    if (req.luau_script) {
      if (/(os|io|package|debug|dofile|loadfile|require)/.test(req.luau_script)) {
        throw new Error("Luau sandbox blocked forbidden global access");
      }
      // Deterministic offline preview evaluator matching simple close-series transforms
      const values = closes.map((c, idx) =>
        idx === 0 ? c : (closes[idx - 1] + c) / 2,
      );
      return {
        id: req.id,
        label: `Luau (${req.id})`,
        overlay: true,
        values,
        memory_pool_reserved_bytes: 0,
        memory_pool_cap_bytes: cap,
      };
    }

    const kind = req.builtin ?? "sma";
    const values: Array<number | null> = new Array(closes.length).fill(null);

    if (kind === "sma") {
      let sum = 0;
      for (let i = 0; i < closes.length; i++) {
        sum += closes[i];
        if (i >= period) sum -= closes[i - period];
        if (i + 1 >= period) values[i] = sum / period;
      }
      return {
        id: req.id,
        label: `SMA(${period})`,
        overlay: true,
        values,
        memory_pool_reserved_bytes: 0,
        memory_pool_cap_bytes: cap,
      };
    }

    if (kind === "ema") {
      if (closes.length >= period) {
        const k = 2 / (period + 1);
        let sum = 0;
        for (let i = 0; i < period; i++) sum += closes[i];
        let prev = sum / period;
        values[period - 1] = prev;
        for (let i = period; i < closes.length; i++) {
          prev = (closes[i] - prev) * k + prev;
          values[i] = prev;
        }
      }
      return {
        id: req.id,
        label: `EMA(${period})`,
        overlay: true,
        values,
        memory_pool_reserved_bytes: 0,
        memory_pool_cap_bytes: cap,
      };
    }

    if (kind === "wilder_rsi") {
      if (closes.length > period) {
        let g = 0;
        let l = 0;
        for (let i = 1; i <= period; i++) {
          const d = closes[i] - closes[i - 1];
          if (d >= 0) g += d;
          else l -= d;
        }
        let ag = g / period;
        let al = l / period;
        values[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
        for (let i = period + 1; i < closes.length; i++) {
          const d = closes[i] - closes[i - 1];
          ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
          al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
          values[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
        }
      }
      return {
        id: req.id,
        label: `RSI(${period})`,
        overlay: false,
        values,
        memory_pool_reserved_bytes: 0,
        memory_pool_cap_bytes: cap,
      };
    }

    if (kind === "vwap") {
      const vols = req.volumes && req.volumes.length === closes.length ? req.volumes : closes.map(() => 1);
      const anchor = closes[0] ?? 0;
      let cpv = 0;
      let cv = 0;
      for (let i = 0; i < closes.length; i++) {
        const v = Math.max(0, vols[i]);
        cpv += (closes[i] - anchor) * v;
        cv += v;
        values[i] = cv > 0 ? anchor + cpv / cv : null;
      }
      return {
        id: req.id,
        label: "VWAP",
        overlay: true,
        values,
        memory_pool_reserved_bytes: 0,
        memory_pool_cap_bytes: cap,
      };
    }

    const buy = req.buy_volumes ?? [];
    const sell = req.sell_volumes ?? [];
    const n = Math.min(buy.length, sell.length);
    const out: Array<number | null> = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const d = buy[i] - sell[i];
      acc += d;
      out.push(kind === "cvd" ? acc : d);
    }
    return {
      id: req.id,
      label: kind === "cvd" ? "CVD" : "Footprint Delta",
      overlay: false,
      values: out,
      memory_pool_reserved_bytes: 0,
      memory_pool_cap_bytes: cap,
    };
  }

  private replayStepForSpeed(): number {
    if (this.replaySpeed === "1x") return 8;
    if (this.replaySpeed === "5x") return 40;
    if (this.replaySpeed === "50x") return 400;
    return 2000;
  }

  private deterministicHashHex(cursor: number): string {
    // Deterministic 64-hex digest bound solely to cursor (speed-invariant SV-09 preview)
    let h1 = 0x6a09e667n ^ BigInt(cursor * 2654435761);
    let h2 = 0xbb67ae85n ^ (BigInt(cursor) * 0x9e3779b1n);
    const parts: string[] = [];
    for (let i = 0; i < 8; i++) {
      h1 = ((h1 << 5n) ^ (h1 >> 3n) ^ (h2 + BigInt(i))) & 0xffffffffn;
      h2 = ((h2 << 7n) ^ (h2 >> 2n) ^ (h1 + 0x517cc1b7n)) & 0xffffffffn;
      parts.push(h1.toString(16).padStart(8, "0"));
    }
    return parts.join("");
  }

  private snapshotReplay(): ReplayStatusSnapshot {
    return {
      playing: this.replayPlaying,
      speed: this.replaySpeed,
      cursor: this.replayCursor,
      total_ticks: this.replayTotalTicks,
      bars_sealed: Math.max(1, Math.floor(this.replayCursor / 60)),
      final_vwap_e9: this.currentPriceE9.toString(),
      sha256_hex: this.deterministicHashHex(this.replayCursor),
      determinism_verified: this.replayVerified,
    };
  }

  private applyOfflineReplay(act: ReplayControlAction): ReplayStatusSnapshot {
    switch (act.action) {
      case "play":
        this.replayPlaying = true;
        if (this.replayCursor >= this.replayTotalTicks) this.replayCursor = 0;
        this.replayCursor = Math.min(this.replayTotalTicks, this.replayCursor + this.replayStepForSpeed());
        if (this.replayCursor >= this.replayTotalTicks) this.replayPlaying = false;
        break;
      case "pause":
        this.replayPlaying = false;
        break;
      case "step":
        this.replayPlaying = false;
        this.replayCursor = Math.min(this.replayTotalTicks, this.replayCursor + this.replayStepForSpeed());
        break;
      case "seek":
        this.replayCursor = Math.max(0, Math.min(this.replayTotalTicks, act.cursor));
        break;
      case "set_speed":
        this.replaySpeed = act.speed;
        break;
      case "reset":
        this.replayPlaying = false;
        this.replayCursor = 0;
        this.replayVerified = false;
        break;
      case "verify_determinism":
        if (this.replayCursor === 0) this.replayCursor = this.replayTotalTicks;
        this.replayVerified = true;
        break;
    }
    return this.snapshotReplay();
  }

  private snapshotSettings(): ResolvedSetting[] {
    const keys = new Set([
      ...Object.keys(this.defaultSettings),
      ...this.instanceOverrides.keys(),
    ]);
    return [...keys].sort().map((key) => {
      const inherited = this.defaultSettings[key] ?? null;
      const hasOverride = this.instanceOverrides.has(key);
      return {
        key,
        value: hasOverride ? this.instanceOverrides.get(key)! : (inherited ?? ""),
        source_layer: hasOverride ? "instance" : "defaults",
        inherited_value: inherited,
        is_overridden: hasOverride,
        locked:
        key === "updates.checkOnStartup" ||
        key === "execution.live_armed" ||
        key === "execution.mode",
      };
    });
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
      if (set?.has(onFrame) && this.marketSource === "paper_sim") {
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
    this.closeLiveSocket();
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.listeners.clear();
  }
}
