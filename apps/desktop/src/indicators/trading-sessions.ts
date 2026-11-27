import type { CandlestickData } from "lightweight-charts";
import type { CoordinateBridge } from "../render/webgl2-orderflow-overlay";

export type SessionTimezone =
  | "America/New_York"
  | "America/Los_Angeles"
  | "America/Chicago"
  | "Etc/UTC";

export interface TradingSessionsConfig {
  timezone: SessionTimezone;
  showTokyo: boolean;
  tokyoHours: string;
  tokyoColor: string;
  showLondon: boolean;
  londonHours: string;
  londonColor: string;
  showNewYork: boolean;
  newYorkHours: string;
  newYorkColor: string;
  /** Transparency 0 (opaque) to 100 (invisible), matching Pine color.new(c, 82) */
  transparency: number;
  showSessionNames: boolean;
}

export const DEFAULT_TRADING_SESSIONS_CONFIG: TradingSessionsConfig = {
  timezone: "America/New_York",
  showTokyo: true,
  tokyoHours: "2000-0200",
  tokyoColor: "#d69d14", // rgb(214, 157, 20)
  showLondon: true,
  londonHours: "0400-1200",
  londonColor: "#2d9141", // rgb(45, 145, 65)
  showNewYork: true,
  newYorkHours: "0930-1600",
  newYorkColor: "#305dd0", // rgb(48, 93, 208)
  transparency: 82,
  showSessionNames: true,
};

const STORAGE_KEY = "allegedly.trading_sessions.v1";

export function cloneTradingSessionsConfig(src: TradingSessionsConfig): TradingSessionsConfig {
  return { ...src };
}

export function loadStoredTradingSessionsConfig(): TradingSessionsConfig {
  if (typeof window === "undefined") return cloneTradingSessionsConfig(DEFAULT_TRADING_SESSIONS_CONFIG);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneTradingSessionsConfig(DEFAULT_TRADING_SESSIONS_CONFIG);
    const parsed = JSON.parse(raw) as Partial<TradingSessionsConfig>;
    return {
      ...DEFAULT_TRADING_SESSIONS_CONFIG,
      ...parsed,
      transparency: Math.min(100, Math.max(0, Math.round(Number(parsed.transparency ?? DEFAULT_TRADING_SESSIONS_CONFIG.transparency)))),
    };
  } catch {
    return cloneTradingSessionsConfig(DEFAULT_TRADING_SESSIONS_CONFIG);
  }
}

export function saveStoredTradingSessionsConfig(cfg: TradingSessionsConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
}

export interface SessionWindowMinutes {
  startMin: number;
  endMin: number;
}

/** Parses TradingView session string "HHMM-HHMM" (e.g. "2000-0200" or "0930-1600"). */
export function parseSessionWindow(spec: string): SessionWindowMinutes | null {
  const m = /^\s*(\d{2}):?(\d{2})\s*-\s*(\d{2}):?(\d{2})\s*$/.exec(spec);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  if (sh > 23 || sm > 59 || eh > 24 || em > 59) return null;
  return {
    startMin: sh * 60 + sm,
    endMin: eh * 60 + em,
  };
}

export function isMinuteInSession(minuteOfDay: number, win: SessionWindowMinutes): boolean {
  if (win.startMin === win.endMin) return true;
  if (win.startMin < win.endMin) {
    return minuteOfDay >= win.startMin && minuteOfDay < win.endMin;
  }
  // Overnight wrap (e.g. 2000-0200 => 1200..1439 or 0..119)
  return minuteOfDay >= win.startMin || minuteOfDay < win.endMin;
}

const tzFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTzFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = tzFormatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    tzFormatterCache.set(tz, fmt);
  }
  return fmt;
}

export function getMinuteOfDayInTimezone(timeSec: number, timezone: string): number {
  const fmt = getTzFormatter(timezone);
  const parts = fmt.formatToParts(new Date(timeSec * 1000));
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value) % 24;
    if (p.type === "minute") m = Number(p.value);
  }
  return h * 60 + m;
}

export interface ComputedSessionBox {
  id: "tokyo" | "london" | "newYork";
  name: string;
  color: string;
  startTimeSec: number;
  endTimeSec: number;
  high: number;
  low: number;
  completed: boolean;
}

export function isIntradayTimeframe(timeframe: string): boolean {
  const tf = timeframe.trim();
  return /^(\d+)(s|m|h)$/i.test(tf);
}

export function computeTradingSessionBoxes(
  candles: readonly CandlestickData[],
  config: TradingSessionsConfig,
  timeframe: string,
): ComputedSessionBox[] {
  if (candles.length === 0 || !isIntradayTimeframe(timeframe)) return [];

  const defs: {
    id: "tokyo" | "london" | "newYork";
    name: string;
    enabled: boolean;
    win: SessionWindowMinutes | null;
    color: string;
  }[] = [
    {
      id: "tokyo",
      name: "Tokyo",
      enabled: config.showTokyo,
      win: parseSessionWindow(config.tokyoHours),
      color: config.tokyoColor,
    },
    {
      id: "london",
      name: "London",
      enabled: config.showLondon,
      win: parseSessionWindow(config.londonHours),
      color: config.londonColor,
    },
    {
      id: "newYork",
      name: "New York",
      enabled: config.showNewYork,
      win: parseSessionWindow(config.newYorkHours),
      color: config.newYorkColor,
    },
  ];

  const activeDefs = defs.filter((d) => d.enabled && d.win !== null);
  if (activeDefs.length === 0) return [];

  const boxes: ComputedSessionBox[] = [];
  const openMap = new Map<string, ComputedSessionBox | null>();

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tSec = Number(c.time);
    if (!Number.isFinite(tSec)) continue;
    const minOfDay = getMinuteOfDayInTimezone(tSec, config.timezone);

    for (const def of activeDefs) {
      const inSession = isMinuteInSession(minOfDay, def.win!);
      const current = openMap.get(def.id) ?? null;

      if (inSession) {
        // Also split if there is a multi-hour gap (e.g. weekend gap)
        const prevEnd = current?.endTimeSec ?? tSec;
        const isGapSplit = current !== null && tSec - prevEnd > 10 * 3600;
        if (!current || isGapSplit) {
          if (current) current.completed = true;
          const nextBox: ComputedSessionBox = {
            id: def.id,
            name: def.name,
            color: def.color,
            startTimeSec: tSec,
            endTimeSec: tSec,
            high: c.high,
            low: c.low,
            completed: false,
          };
          boxes.push(nextBox);
          openMap.set(def.id, nextBox);
        } else {
          current.endTimeSec = tSec;
          if (c.high > current.high) current.high = c.high;
          if (c.low < current.low) current.low = c.low;
        }
      } else if (current) {
        current.completed = true;
        openMap.set(def.id, null);
      }
    }
  }

  return boxes;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean.slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return `rgba(48, 93, 208, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

export function drawTradingSessionsOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  candles: readonly CandlestickData[],
  bridge: CoordinateBridge,
  config: TradingSessionsConfig,
  timeframe: string,
): void {
  const boxes = computeTradingSessionBoxes(candles, config, timeframe);
  if (boxes.length === 0) return;

  // Estimate bar width so single-bar sessions (e.g. 4h) still render a proper box
  let halfBar = 3;
  for (let i = candles.length - 1; i >= 1; i--) {
    const x1 = bridge.timeToX(Number(candles[i].time));
    const x0 = bridge.timeToX(Number(candles[i - 1].time));
    if (x1 !== null && x0 !== null && x1 > x0) {
      halfBar = Math.min(20, Math.max(2, (x1 - x0) * 0.45));
      break;
    }
  }

  const alpha = Math.min(1, Math.max(0, (100 - config.transparency) / 100));

  ctx.save();
  ctx.font = "500 10.5px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "right";

  for (const box of boxes) {
    const xStart = bridge.timeToX(box.startTimeSec);
    const xEnd = bridge.timeToX(box.endTimeSec);
    if (xStart === null && xEnd === null) continue;
    const left = (xStart ?? -20) - halfBar;
    const right = (xEnd ?? w + 20) + halfBar;
    if (right < -10 || left > w + 10) continue;

    const yTop = bridge.priceToY(box.high);
    const yBot = bridge.priceToY(box.low);
    if (yTop === null || yBot === null) continue;

    const top = Math.min(yTop, yBot);
    const height = Math.max(2, Math.abs(yBot - yTop));
    const clampedLeft = Math.max(0, left);
    const clampedRight = Math.min(w, right);
    const width = Math.max(2, clampedRight - clampedLeft);

    ctx.fillStyle = hexToRgba(box.color, alpha);
    ctx.fillRect(clampedLeft, top, width, height);

    if (config.showSessionNames && xEnd !== null && xEnd >= 0 && xEnd <= w && top + height < h - 4) {
      ctx.fillStyle = box.color;
      ctx.fillText(box.name, Math.min(w - 4, right), top + height + 3);
    }
  }

  ctx.restore();
}
