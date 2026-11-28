export type AlertConditionOperator =
  | "crossing"
  | "crossing_up"
  | "crossing_down"
  | "greater_than"
  | "less_than"
  | "moving_up"
  | "moving_down";

export type AlertTriggerMode =
  | "only_once"
  | "every_time"
  | "once_per_bar"
  | "once_per_bar_close";

export type AlertStatus = "active" | "paused" | "triggered" | "expired";

export interface AlertCondition {
  id: string;
  /** Source identifier: "price" or an indicator id/label */
  source: string;
  operator: AlertConditionOperator;
  valueType: "value" | "indicator";
  value: number;
  /** Optional target indicator id/label when valueType === "indicator" */
  targetSource?: string;
}

export interface AlertNotifications {
  app: boolean;
  toasts: boolean;
  sound: boolean;
  webhookUrl: string;
}

export interface ChartAlert {
  id: string;
  symbol: string;
  timeframe: string;
  name: string;
  conditions: AlertCondition[];
  trigger: AlertTriggerMode;
  /** ISO date-time string, or null for open-ended */
  expirationIso: string | null;
  message: string;
  notifications: AlertNotifications;
  status: AlertStatus;
  createdAt: number;
  lastTriggeredAt: number | null;
  lastTriggeredBarTime: number | null;
  color: string;
}

export interface AlertLogEntry {
  id: string;
  alertId: string;
  symbol: string;
  timeframe: string;
  name: string;
  message: string;
  price: number;
  triggeredAt: number;
}

export const ALERT_OPERATOR_LABELS: Record<AlertConditionOperator, string> = {
  crossing: "Crossing",
  crossing_up: "Crossing Up",
  crossing_down: "Crossing Down",
  greater_than: "Greater Than",
  less_than: "Less Than",
  moving_up: "Moving Up",
  moving_down: "Moving Down",
};

export const ALERT_TRIGGER_LABELS: Record<AlertTriggerMode, string> = {
  only_once: "Only Once",
  every_time: "Every time",
  once_per_bar: "Once Per Bar",
  once_per_bar_close: "Once Per Bar Close",
};

export const DEFAULT_ALERT_NOTIFICATIONS: AlertNotifications = {
  app: true,
  toasts: true,
  sound: true,
  webhookUrl: "",
};

export function defaultExpirationIso(nowMs: number = Date.now()): string {
  const dt = new Date(nowMs + 30 * 24 * 60 * 60 * 1000);
  dt.setSeconds(0, 0);
  return dt.toISOString();
}

export function formatAlertPrice(price: number, decimals = 2): string {
  if (!Number.isFinite(price)) return "0.00";
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatAlertConditionSummary(
  symbol: string,
  conditions: readonly AlertCondition[],
  decimals = 2,
): string {
  const first = conditions[0];
  if (!first) return `${symbol} Alert`;
  const op = ALERT_OPERATOR_LABELS[first.operator] ?? "Crossing";
  const valStr =
    first.valueType === "indicator" && first.targetSource
      ? first.targetSource
      : formatAlertPrice(first.value, decimals);
  const base = `${symbol} ${op} ${valStr}`;
  return conditions.length > 1 ? `${base} (+${conditions.length - 1})` : base;
}

export function formatNotificationSummary(n: AlertNotifications): string {
  const parts: string[] = [];
  if (n.app) parts.push("App");
  if (n.toasts) parts.push("Toasts");
  if (n.sound) parts.push("Sound");
  if (n.webhookUrl.trim()) parts.push("Webhook");
  return parts.length > 0 ? parts.join(", ") : "None";
}

export function formatExpirationLabel(expirationIso: string | null): string {
  if (!expirationIso) return "Open-ended";
  const dt = new Date(expirationIso);
  if (Number.isNaN(dt.getTime())) return "Open-ended";
  const datePart = dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${datePart} at ${hh}:${mm}`;
}

export function createDefaultAlertDraft(params: {
  symbol: string;
  timeframe: string;
  price: number;
  decimals?: number;
  color?: string;
  nowMs?: number;
}): ChartAlert {
  const now = params.nowMs ?? Date.now();
  const decimals = params.decimals ?? 2;
  const rounded = Number(params.price.toFixed(decimals));
  const cond: AlertCondition = {
    id: `cond-${now}-1`,
    source: "price",
    operator: "crossing",
    valueType: "value",
    value: rounded,
  };
  const summary = formatAlertConditionSummary(params.symbol, [cond], decimals);
  return {
    id: `al-${now}-${Math.random().toString(36).slice(2, 6)}`,
    symbol: params.symbol,
    timeframe: params.timeframe,
    name: summary,
    conditions: [cond],
    trigger: "every_time",
    expirationIso: defaultExpirationIso(now),
    message: summary,
    notifications: { ...DEFAULT_ALERT_NOTIFICATIONS },
    status: "active",
    createdAt: now,
    lastTriggeredAt: null,
    lastTriggeredBarTime: null,
    color: params.color ?? "#f59e0b",
  };
}

export function getAlertPrimaryPrice(alert: ChartAlert): number | null {
  const first = alert.conditions.find((c) => c.valueType === "value" && Number.isFinite(c.value));
  return first ? first.value : null;
}

export function evaluateSingleCondition(
  cond: AlertCondition,
  prevPrice: number | null,
  nextPrice: number,
): boolean {
  if (!Number.isFinite(nextPrice) || !Number.isFinite(cond.value)) return false;
  const target = cond.value;
  switch (cond.operator) {
    case "crossing":
      if (prevPrice === null) return false;
      return (
        (prevPrice < target && nextPrice >= target) ||
        (prevPrice > target && nextPrice <= target)
      );
    case "crossing_up":
      if (prevPrice === null) return false;
      return prevPrice < target && nextPrice >= target;
    case "crossing_down":
      if (prevPrice === null) return false;
      return prevPrice > target && nextPrice <= target;
    case "greater_than":
      return nextPrice > target;
    case "less_than":
      return nextPrice < target;
    case "moving_up":
      if (prevPrice === null) return false;
      return nextPrice - prevPrice >= Math.abs(target);
    case "moving_down":
      if (prevPrice === null) return false;
      return prevPrice - nextPrice >= Math.abs(target);
    default:
      return false;
  }
}

export interface EvaluateAlertsResult {
  alerts: ChartAlert[];
  triggered: AlertLogEntry[];
  changed: boolean;
}

const EVERY_TIME_COOLDOWN_MS = 2_000;

export function evaluateAlertsOnPrice(params: {
  alerts: readonly ChartAlert[];
  symbol: string;
  prevPrice: number | null;
  nextPrice: number;
  barTimeSec: number;
  isBarClose?: boolean;
  nowMs?: number;
}): EvaluateAlertsResult {
  const { alerts, symbol, prevPrice, nextPrice, barTimeSec, isBarClose = false } = params;
  const nowMs = params.nowMs ?? Date.now();
  const triggered: AlertLogEntry[] = [];
  let changed = false;

  const nextAlerts = alerts.map((al) => {
    if (al.status !== "active") return al;

    if (al.expirationIso) {
      const expMs = Date.parse(al.expirationIso);
      if (Number.isFinite(expMs) && nowMs >= expMs) {
        changed = true;
        return { ...al, status: "expired" as const };
      }
    }

    if (al.symbol !== symbol) return al;
    if (al.conditions.length === 0) return al;

    if (al.trigger === "once_per_bar_close" && !isBarClose) return al;
    if (
      (al.trigger === "once_per_bar" || al.trigger === "once_per_bar_close") &&
      al.lastTriggeredBarTime === barTimeSec
    ) {
      return al;
    }
    if (
      al.trigger === "every_time" &&
      al.lastTriggeredAt !== null &&
      nowMs - al.lastTriggeredAt < EVERY_TIME_COOLDOWN_MS
    ) {
      return al;
    }

    const matched = al.conditions.every((c) => evaluateSingleCondition(c, prevPrice, nextPrice));
    if (!matched) return al;

    changed = true;
    const entry: AlertLogEntry = {
      id: `alog-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
      alertId: al.id,
      symbol: al.symbol,
      timeframe: al.timeframe,
      name: al.name,
      message: al.message || formatAlertConditionSummary(al.symbol, al.conditions),
      price: nextPrice,
      triggeredAt: nowMs,
    };
    triggered.push(entry);

    return {
      ...al,
      status: al.trigger === "only_once" ? ("triggered" as const) : al.status,
      lastTriggeredAt: nowMs,
      lastTriggeredBarTime: barTimeSec,
    };
  });

  return { alerts: changed ? nextAlerts : (alerts as ChartAlert[]), triggered, changed };
}

const ALERTS_STORAGE_KEY = "allegedly.chartAlerts.v1";
const ALERT_LOGS_STORAGE_KEY = "allegedly.chartAlertLogs.v1";

export function loadStoredAlerts(): ChartAlert[] {
  try {
    const raw = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ChartAlert =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.symbol === "string" &&
        Array.isArray(item.conditions),
    );
  } catch {
    return [];
  }
}

export function saveStoredAlerts(alerts: readonly ChartAlert[]): void {
  try {
    window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // ignore storage errors
  }
}

export function loadStoredAlertLogs(): AlertLogEntry[] {
  try {
    const raw = window.localStorage.getItem(ALERT_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AlertLogEntry =>
        Boolean(item) && typeof item.id === "string" && typeof item.symbol === "string",
    );
  } catch {
    return [];
  }
}

export function saveStoredAlertLogs(logs: readonly AlertLogEntry[]): void {
  try {
    window.localStorage.setItem(ALERT_LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 200)));
  } catch {
    // ignore storage errors
  }
}

export function playAlertChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // ignore audio restrictions
  }
}
