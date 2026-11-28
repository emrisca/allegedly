export const MAX_ACTIVE_BARS = 6_000;
export const TRIM_TARGET_BARS = 5_000;

/**
 * Maintains the ADR-0003 / S01 5,000/6,000 sliding-window hysteresis buffer
 * so Lightweight Charts v5.3 never accumulates unbounded bar arrays during multi-hour sessions.
 */
export function applyBarHysteresis<T extends { time: number }>(
  bars: T[],
  incoming: T,
  preserveHistory = false,
): { trimmed: boolean; bars: T[] } {
  const last = bars[bars.length - 1];
  if (last && last.time === incoming.time) {
    bars[bars.length - 1] = incoming;
    return { trimmed: false, bars };
  }
  bars.push(incoming);
  if (!preserveHistory && bars.length > MAX_ACTIVE_BARS) {
    const start = bars.length - TRIM_TARGET_BARS;
    return { trimmed: true, bars: bars.slice(start) };
  }
  return { trimmed: false, bars };
}
