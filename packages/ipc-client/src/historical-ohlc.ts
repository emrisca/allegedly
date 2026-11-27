import type { MarketDataSourceId } from "./transport.js";

export interface HistoricalOhlcBar {
  /** Bar open timestamp in Unix seconds (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  D: 86400,
  "1D": 86400,
  W: 604800,
  "1W": 604800,
  M: 2592000,
  "1M": 2592000,
};

export function timeframeToSeconds(tf: string): number {
  return TIMEFRAME_SECONDS[tf] ?? 60;
}

/**
 * Aligns any Unix timestamp (seconds, UTC) down to the exact open timestamp of the
 * candle bucket for `tf`.
 * - Intraday (`1m`..`4h`) & Daily (`D`): aligned to exact UTC epoch multiples of duration
 * - Weekly (`W`): aligned to UTC Monday 00:00:00
 * - Monthly (`M`): aligned to UTC 1st of month 00:00:00
 */
export function alignTimeSecToTimeframe(tsSec: number, tf: string): number {
  const sec = Math.floor(tsSec);
  if (!Number.isFinite(sec) || sec <= 0) return 0;

  if (tf === "M" || tf === "1M") {
    const d = new Date(sec * 1000);
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
  }

  if (tf === "W" || tf === "1W") {
    // Unix epoch 1970-01-01 was Thursday (day 4). Shift by 3 days so Monday is 0.
    const dayStart = Math.floor(sec / 86400) * 86400;
    const dow = new Date(dayStart * 1000).getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (dow + 6) % 7;
    return dayStart - daysSinceMonday * 86400;
  }

  const step = Math.max(60, timeframeToSeconds(tf));
  return Math.floor(sec / step) * step;
}

/**
 * Returns the exact close timestamp (Unix seconds, UTC) of the candle that opened at `openSec`.
 */
export function timeframeBucketCloseSec(openSec: number, tf: string): number {
  if (tf === "M" || tf === "1M") {
    const d = new Date(openSec * 1000);
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000);
  }
  return openSec + Math.max(60, timeframeToSeconds(tf));
}

/**
 * Aggregates finer-grained OHLCV bars into exact timeframe buckets so every returned
 * bar truly spans the requested open-to-close duration (`3m`, `15m`, `30m`, `2h`, `4h`, `W`, `M`, etc.).
 */
export function aggregateOhlcBars(
  bars: readonly HistoricalOhlcBar[],
  tf: string,
  limit = 0,
): HistoricalOhlcBar[] {
  if (bars.length === 0) return [];
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  const out: HistoricalOhlcBar[] = [];

  for (const bar of sorted) {
    const bucket = alignTimeSecToTimeframe(bar.time, tf);
    const prev = out[out.length - 1];
    if (prev && prev.time === bucket) {
      if (bar.high > prev.high) prev.high = bar.high;
      if (bar.low < prev.low) prev.low = bar.low;
      prev.close = bar.close;
      prev.volume += bar.volume;
    } else {
      out.push({
        time: bucket,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    }
  }

  if (limit > 0 && out.length > limit) {
    return out.slice(out.length - limit);
  }
  return out;
}

const KRAKEN_REST_PAIRS: Record<string, string> = {
  "BTC/USD": "XBTUSD",
  "ETH/USD": "ETHUSD",
  "SOL/USD": "SOLUSD",
};

const COINBASE_PRODUCTS: Record<string, string> = {
  "BTC/USD": "BTC-USD",
  "ETH/USD": "ETH-USD",
  "SOL/USD": "SOL-USD",
};

export function mapSymbolToKrakenRestPair(symbol: string): string | null {
  return KRAKEN_REST_PAIRS[symbol] ?? null;
}

export function mapSymbolToCoinbaseProduct(symbol: string): string | null {
  return COINBASE_PRODUCTS[symbol] ?? null;
}

/**
 * Valid Kraken OHLC intervals in minutes: 1, 5, 15, 30, 60, 240, 1440, 10080.
 * Always picks a native interval that cleanly divides `tf` so `aggregateOhlcBars`
 * produces exact `3m`, `2h`, and calendar `M` candles.
 */
export function mapTimeframeToKrakenInterval(tf: string): number {
  switch (tf) {
    case "1m":
    case "3m":
      return 1;
    case "5m":
      return 5;
    case "15m":
      return 15;
    case "30m":
      return 30;
    case "1h":
    case "2h":
      return 60;
    case "4h":
      return 240;
    case "D":
    case "1D":
    case "M":
    case "1M":
      return 1440;
    case "W":
    case "1W":
      return 10080;
    default:
      return 60;
  }
}

/**
 * Valid Coinbase Exchange granularities in seconds: 60, 300, 900, 3600, 21600, 86400.
 * Always picks a native granularity that cleanly divides `tf` (e.g. 3600s for 4h, NOT 6h!)
 * so `aggregateOhlcBars` builds true `3m`, `30m`, `2h`, `4h`, `W`, and `M` candles.
 */
export function mapTimeframeToCoinbaseGranularity(tf: string): number {
  switch (tf) {
    case "1m":
    case "3m":
      return 60;
    case "5m":
      return 300;
    case "15m":
    case "30m":
      return 900;
    case "1h":
    case "2h":
    case "4h":
      return 3600;
    case "D":
    case "1D":
    case "W":
    case "1W":
    case "M":
    case "1M":
      return 86400;
    default:
      return 3600;
  }
}

function finalizeSortedBars(bars: HistoricalOhlcBar[], limit: number): HistoricalOhlcBar[] {
  bars.sort((a, b) => a.time - b.time);
  const deduped: HistoricalOhlcBar[] = [];
  for (const bar of bars) {
    if (
      !Number.isFinite(bar.time) ||
      !Number.isFinite(bar.open) ||
      !Number.isFinite(bar.high) ||
      !Number.isFinite(bar.low) ||
      !Number.isFinite(bar.close) ||
      !Number.isFinite(bar.volume) ||
      bar.time <= 0
    ) {
      continue;
    }
    if (deduped.length > 0 && deduped[deduped.length - 1].time === bar.time) {
      deduped[deduped.length - 1] = bar;
    } else {
      deduped.push(bar);
    }
  }
  if (limit > 0 && deduped.length > limit) {
    return deduped.slice(deduped.length - limit);
  }
  return deduped;
}

/**
 * Parse Kraken `/0/public/OHLC` JSON response.
 * Row format: `[time, open, high, low, close, vwap, volume, count]`
 */
export function parseKrakenOhlcResponse(payload: unknown, limit = 1500): HistoricalOhlcBar[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Kraken OHLC payload");
  }
  const obj = payload as { error?: unknown; result?: Record<string, unknown> };
  if (Array.isArray(obj.error) && obj.error.length > 0) {
    throw new Error(`Kraken OHLC error: ${obj.error.join(", ")}`);
  }
  const result = obj.result;
  if (!result || typeof result !== "object") {
    throw new Error("Missing result in Kraken OHLC response");
  }
  const entry = Object.entries(result).find(
    ([key, val]) => key !== "last" && Array.isArray(val),
  );
  if (!entry || !Array.isArray(entry[1])) {
    return [];
  }
  const rows = entry[1] as unknown[];
  const bars: HistoricalOhlcBar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const time = Math.floor(Number(row[0]));
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[6]);
    bars.push({ time, open, high, low, close, volume });
  }
  return finalizeSortedBars(bars, limit);
}

/**
 * Parse Coinbase Exchange `/products/{product}/candles` JSON response.
 * Row format: `[time, low, high, open, close, volume]` (returned newest-first).
 */
export function parseCoinbaseCandlesResponse(payload: unknown, limit = 1500): HistoricalOhlcBar[] {
  if (!Array.isArray(payload)) {
    throw new Error("Invalid Coinbase candles payload");
  }
  const bars: HistoricalOhlcBar[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = Math.floor(Number(row[0]));
    const low = Number(row[1]);
    const high = Number(row[2]);
    const open = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    bars.push({ time, open, high, low, close, volume });
  }
  return finalizeSortedBars(bars, limit);
}

export interface FetchHistoricalOhlcParams {
  source: MarketDataSourceId;
  symbol: string;
  timeframe: string;
  limit?: number;
  /** Optional upper timestamp bound (Unix seconds) for paginating older historical candles. */
  endTimeSec?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch real historical OHLCV candles from Kraken or Coinbase Exchange ONLY when
 * `source` is an explicit live feed (`kraken_ws_v2` or `coinbase_ws`).
 * Aggregates finer exchange candles into exact requested timeframe buckets when needed.
 * Never issues any network call when `source === "paper_sim"` (SV-01 invariant).
 */
export async function fetchHistoricalOhlc(
  params: FetchHistoricalOhlcParams,
): Promise<HistoricalOhlcBar[]> {
  const {
    source,
    symbol,
    timeframe,
    limit = 1500,
    endTimeSec,
    signal,
    fetchImpl = globalThis.fetch,
  } = params;

  if (source === "paper_sim") {
    return [];
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API unavailable in current runtime");
  }

  const tfSec = timeframeToSeconds(timeframe);

  if (source === "kraken_ws_v2") {
    const pair = mapSymbolToKrakenRestPair(symbol);
    if (!pair) return [];
    const interval = mapTimeframeToKrakenInterval(timeframe);
    const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}`;
    const res = await fetchImpl(url, { signal });
    if (!res.ok) {
      throw new Error(`Kraken OHLC HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    const raw = parseKrakenOhlcResponse(json, 0);
    return interval * 60 < tfSec
      ? aggregateOhlcBars(raw, timeframe, limit)
      : finalizeSortedBars(raw, limit);
  }

  if (source === "coinbase_ws") {
    const product = mapSymbolToCoinbaseProduct(symbol);
    if (!product) return [];
    const granularity = mapTimeframeToCoinbaseGranularity(timeframe);
    const aggFactor = Math.max(1, Math.round(tfSec / granularity));
    const baseUrl = `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles`;
    const windowSec = granularity * 300;

    // Single older window when scroll-back requests candles strictly before `endTimeSec`.
    if (typeof endTimeSec === "number" && Number.isFinite(endTimeSec) && endTimeSec > 0) {
      const endIso = new Date(endTimeSec * 1000).toISOString();
      const startIso = new Date(Math.max(0, endTimeSec - windowSec) * 1000).toISOString();
      const url = `${baseUrl}?granularity=${granularity}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
      const res = await fetchImpl(url, { signal });
      if (!res.ok) {
        throw new Error(`Coinbase candles HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      const raw = parseCoinbaseCandlesResponse(json, 0);
      return granularity < tfSec
        ? aggregateOhlcBars(raw, timeframe, limit)
        : finalizeSortedBars(raw, limit);
    }

    const firstUrl = `${baseUrl}?granularity=${granularity}`;
    const firstRes = await fetchImpl(firstUrl, { signal });
    if (!firstRes.ok) {
      throw new Error(`Coinbase candles HTTP ${firstRes.status}`);
    }
    const firstJson: unknown = await firstRes.json();
    const collected = parseCoinbaseCandlesResponse(firstJson, 0);

    // Paginate backwards (up to 6 chunks) to cover both long history and aggregated timeframes.
    const desiredRaw = limit * aggFactor;
    const maxPages = Math.min(6, Math.max(1, Math.ceil(desiredRaw / 300)));
    if (maxPages > 1 && collected.length >= 200) {
      let oldestSec = collected[0].time;
      for (let page = 1; page < maxPages; page++) {
        if (signal?.aborted) break;
        const pageEnd = oldestSec - granularity;
        const pageStart = Math.max(0, pageEnd - windowSec);
        if (pageEnd <= pageStart) break;
        const pageUrl = `${baseUrl}?granularity=${granularity}&start=${encodeURIComponent(
          new Date(pageStart * 1000).toISOString(),
        )}&end=${encodeURIComponent(new Date(pageEnd * 1000).toISOString())}`;
        try {
          const pageRes = await fetchImpl(pageUrl, { signal });
          if (!pageRes.ok) break;
          const pageJson: unknown = await pageRes.json();
          const pageBars = parseCoinbaseCandlesResponse(pageJson, 300);
          if (pageBars.length === 0) break;
          collected.unshift(...pageBars);
          oldestSec = pageBars[0].time;
          if (pageBars.length < 150) break;
        } catch {
          break;
        }
      }
    }

    return granularity < tfSec
      ? aggregateOhlcBars(collected, timeframe, limit)
      : finalizeSortedBars(collected, limit);
  }

  return [];
}
