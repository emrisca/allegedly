import { DEFAULT_TPO_SETTINGS, type TpoSettings } from "./tpo-settings";
import type { TpoRow128 } from "@allegedly/ipc-client";

const SESSION_SECONDS = 86_400;
const PERIOD_SECONDS = 1_800;
const MAX_ROWS = 40;

interface Session {
  firstTime: number;
  ranges: Map<number, { low: number; high: number }>;
  revision: number;
  cached?: { key: string; profile: TpoProfile };
}

export interface TpoProfile {
  time: number;
  endTime: number;
  rows: TpoRow128[];
  rowTicks: number;
  maxStack: number;
  poc: bigint;
  vah: bigint;
  val: bigint;
}

export class SessionTpo {
  private readonly sessions = new Map<number, Session>();

  constructor(private readonly tickSize: number) {}

  add(time: number, low: number, high: number): void {
    if (![time, low, high].every(Number.isFinite) || low > high) return;
    const day = Math.floor(time / SESSION_SECONDS) * SESSION_SECONDS;
    let session = this.sessions.get(day);
    if (!session) {
      session = { firstTime: time, ranges: new Map(), revision: 0 };
      this.sessions.set(day, session);
    }
    const period = Math.floor((time - day) / PERIOD_SECONDS);
    const prior = session.ranges.get(period);
    const range = { low: Math.min(low, prior?.low ?? low), high: Math.max(high, prior?.high ?? high) };
    if (prior?.low === range.low && prior.high === range.high && time >= session.firstTime) return;
    session.firstTime = Math.min(time, session.firstTime);
    session.ranges.set(period, range);
    session.revision++;
  }

  days(): number[] {
    return [...this.sessions.keys()].sort((a, b) => a - b);
  }

  *visible(from: number, to: number, merges: readonly number[] = [], valueArea = 70, blockMinutes = 30): IterableIterator<TpoProfile> {
    if (this.tickSize <= 0) return;
    const groups: number[][] = [];
    const mergedDays = new Set(merges);
    for (const day of this.days()) {
      const previous = groups.at(-1);
      if (previous && mergedDays.has(day)) previous.push(day);
      else groups.push([day]);
    }
    for (const group of groups) {
      const endTime = group[group.length - 1] + SESSION_SECONDS;
      const sessions = group.map((day) => this.sessions.get(day)!);
      const first = sessions[0];
      if (endTime <= from || first.firstTime > to) continue;
      const key = JSON.stringify([valueArea, blockMinutes, group, sessions.map((session) => session.revision)]);
      if (first.cached?.key !== key) {
        first.cached = { key, profile: this.buildProfile(sessions, endTime, valueArea, blockMinutes) };
      }
      yield first.cached.profile;
    }
  }

  private buildProfile(sessions: Session[], endTime: number, valueArea: number, blockMinutes: number): TpoProfile {
    const tickSize = this.tickSize;
    const buckets = new Map<number, { period: number; low: number; high: number }>();
    for (const [index, session] of sessions.entries()) {
      for (const [halfHour, range] of session.ranges) {
        const period = Math.floor((halfHour + index * 48) * 30 / blockMinutes);
        const prior = buckets.get(period);
        buckets.set(period, {
          period,
          low: Math.min(range.low, prior?.low ?? range.low),
          high: Math.max(range.high, prior?.high ?? range.high),
        });
      }
    }
    const ranges = [...buckets.values()];
    const lowTick = Math.floor(Math.min(...ranges.map((range) => range.low)) / tickSize);
    const highTick = Math.floor(Math.max(...ranges.map((range) => range.high)) / tickSize);
    const rowTicks = Math.max(1, Math.ceil((highTick - lowTick + 1) / MAX_ROWS));
    const masks = new Map<number, bigint>();
    for (const range of ranges) {
      const low = Math.floor((Math.floor(range.low / tickSize) - lowTick) / rowTicks);
      const high = Math.floor((Math.floor(range.high / tickSize) - lowTick) / rowTicks);
      for (let row = low; row <= high; row++) {
        masks.set(row, (masks.get(row) ?? 0n) | (1n << BigInt(range.period)));
      }
    }
    const rows = Array.from({ length: Math.ceil((highTick - lowTick + 1) / rowTicks) }, (_, row) => ({
      priceTick: BigInt(lowTick + row * rowTicks),
      periodMask: masks.get(row) ?? 0n,
    }));
    const counts = rows.map(({ periodMask }) => {
      let count = 0;
      for (let bits = periodMask; bits; bits &= bits - 1n) count++;
      return count;
    });
    const mid = (rows.length - 1) / 2;
    const poc = counts.reduce((best, count, index) =>
      count > counts[best] || (count === counts[best] && Math.abs(index - mid) < Math.abs(best - mid))
        ? index : best, 0);
    const target = Math.ceil(counts.reduce((sum, count) => sum + count, 0) * valueArea / 100);
    let low = poc;
    let high = poc;
    let included = counts[poc];
    while (included < target && (low > 0 || high < counts.length - 1)) {
      const below = counts[low - 1] ?? -1;
      const above = counts[high + 1] ?? -1;
      if (above >= below) included += counts[++high];
      else included += counts[--low];
    }
    return {
      time: sessions[0].firstTime,
      endTime,
      rows,
      rowTicks,
      maxStack: counts[poc],
      poc: rows[poc].priceTick,
      vah: rows[high].priceTick,
      val: rows[low].priceTick,
    };
  }
}

interface TpoCoordinates {
  timeToX(time: number): number | null;
  priceToY(price: number): number | null;
}

function profileLayout(profile: TpoProfile, bridge: TpoCoordinates, width: number) {
  const x = bridge.timeToX(profile.time);
  const endX = bridge.timeToX(profile.endTime);
  if (x === null || x >= width || endX === null || endX <= x || endX < 0) return null;
  const cellWidth = Math.min(11, (endX - x) / (profile.maxStack + 1));
  return cellWidth >= 0.35 ? { x, endX, cellWidth } : null;
}

export function hitTestTpoProfile(
  profiles: Iterable<TpoProfile>,
  bridge: TpoCoordinates,
  tickSize: number,
  width: number,
  px: number,
  py: number,
): TpoProfile | null {
  if (px < 0 || px >= width) return null;
  for (const profile of profiles) {
    const layout = profileLayout(profile, bridge, width);
    if (!layout || px < layout.x || px >= layout.x + layout.cellWidth * profile.maxStack) continue;
    for (const row of profile.rows) {
      if (row.periodMask === 0n) continue;
      const price = Number(row.priceTick) * tickSize;
      const y = bridge.priceToY(price);
      const top = bridge.priceToY(price + profile.rowTicks * tickSize);
      if (y === null || top === null || py < Math.min(y, top) || py > Math.max(y, top)) continue;
      let count = 0;
      for (let bits = row.periodMask; bits; bits &= bits - 1n) count++;
      if (px < layout.x + layout.cellWidth * count) return profile;
    }
  }
  return null;
}

export function drawSessionTpo(
  ctx: CanvasRenderingContext2D,
  profiles: Iterable<TpoProfile>,
  bridge: TpoCoordinates,
  tickSize: number,
  width: number,
  height: number,
  settings: TpoSettings = DEFAULT_TPO_SETTINGS,
): void {
  ctx.save();
  ctx.font = "9px system-ui";
  ctx.textBaseline = "middle";
  for (const profile of profiles) {
    const layout = profileLayout(profile, bridge, width);
    if (!layout) continue;
    const { x, endX: nextX, cellWidth } = layout;
    const span = nextX - x;
    for (const row of profile.rows) {
      if (row.periodMask === 0n) continue;
      const price = Number(row.priceTick) * tickSize;
      const y = bridge.priceToY(price);
      const top = bridge.priceToY(price + profile.rowTicks * tickSize);
      if (y === null || top === null || Math.max(y, top) < 0 || Math.min(y, top) > height) continue;
      const rowTop = Math.min(y, top);
      const rowHeight = Math.abs(y - top);
      let left = x;
      for (let bits = row.periodMask, period = 0; bits; bits >>= 1n, period++) {
        if (!(bits & 1n)) continue;
        ctx.fillStyle = row.priceTick === profile.poc ? settings.pocColor
          : row.priceTick >= profile.val && row.priceTick <= profile.vah ? settings.valueAreaColor : settings.outsideColor;
        ctx.fillRect(left, rowTop, cellWidth, Math.max(0.5, rowHeight - 0.4));
        if (settings.letters && cellWidth >= 8 && rowHeight >= 7.5) {
          ctx.font = rowHeight >= 9 ? "9px system-ui" : "7px system-ui";
          ctx.fillStyle = settings.letterColor;
          ctx.textAlign = "center";
          ctx.fillText(String.fromCharCode(period % 52 < 26 ? 65 + period % 52 : 97 + period % 52 - 26),
            left + cellWidth / 2, rowTop + rowHeight / 2);
        }
        left += cellWidth;
      }
    }

    const levels = new Map<bigint, string[]>();
    for (const [tick, label] of [[profile.poc, "POC"], [profile.vah, "VAH"], [profile.val, "VAL"]] as const) {
      if (label === "POC" ? !settings.pocLine : !settings.valueAreaLines) continue;
      const labels = levels.get(tick) ?? [];
      labels.push(label);
      levels.set(tick, labels);
    }
    for (const [tick, labels] of levels) {
      const y = bridge.priceToY((Number(tick) + profile.rowTicks / 2) * tickSize);
      if (y === null || y < 0 || y > height) continue;
      const isPoc = labels.includes("POC");
      ctx.strokeStyle = isPoc ? settings.pocLineColor : settings.valueAreaLineColor;
      ctx.setLineDash(isPoc ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(width, nextX), y);
      ctx.stroke();
      if (span >= 75) {
        ctx.fillStyle = isPoc ? "#f4aec2" : "#d5cee5";
        ctx.font = "9px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(labels.join(" / "), Math.max(0, x + 3), Math.max(6, y - 6));
      }
    }
  }
  ctx.restore();
}
