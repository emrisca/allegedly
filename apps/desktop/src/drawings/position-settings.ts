import { formatFixedE9 } from "@allegedly/ipc-client";

export const POSITION_STAT_OPTIONS = [
  { id: "tpPriceOffset", label: "TP price offset" },
  { id: "tpPercentOffset", label: "TP percent offset" },
  { id: "tpTickOffset", label: "TP tick offset" },
  { id: "tpAmount", label: "TP amount" },
  { id: "tpPl", label: "TP PL" },
  { id: "openClosedPl", label: "Open/closed PL" },
  { id: "qty", label: "Qty" },
  { id: "riskRewardRatio", label: "Risk/reward ratio" },
  { id: "slPriceOffset", label: "SL price offset" },
  { id: "slPercentOffset", label: "SL percent offset" },
  { id: "slTickOffset", label: "SL tick offset" },
  { id: "slAmount", label: "SL amount" },
  { id: "slPl", label: "SL PL" },
] as const;

export type PositionStatField = (typeof POSITION_STAT_OPTIONS)[number]["id"];

export const DEFAULT_POSITION_STATS_FIELDS: PositionStatField[] = [
  "tpTickOffset",
  "riskRewardRatio",
  "slTickOffset",
];

export interface PositionSettings {
  accountSize: string;
  lotSize: string;
  risk: string;
  riskUnit: "USD" | "%";
  leverage: string;
  quantityPrecision: number;
  stopTicks: string;
  stopColor: string;
  stopOpacity: number;
  targetColor: string;
  targetOpacity: number;
  priceLabels: boolean;
  stats?: "summary" | "levels" | "none";
  statsFields: PositionStatField[];
  compact: boolean;
  alwaysShowStats: boolean;
}

export const DEFAULT_POSITION_SETTINGS: PositionSettings = {
  accountSize: "10000",
  lotSize: "4",
  risk: "1000",
  riskUnit: "USD",
  leverage: "20",
  quantityPrecision: 1,
  stopTicks: "",
  stopColor: "#ef5350",
  stopOpacity: 0.22,
  targetColor: "#26a69a",
  targetOpacity: 0.22,
  priceLabels: true,
  stats: "summary",
  statsFields: [...DEFAULT_POSITION_STATS_FIELDS],
  compact: true,
  alwaysShowStats: false,
};

const VALID_STAT_FIELD_SET = new Set<string>(POSITION_STAT_OPTIONS.map((o) => o.id));

export function resolvePositionStatsFields(settings?: Partial<PositionSettings>): PositionStatField[] {
  if (Array.isArray(settings?.statsFields)) {
    const picked = new Set(settings.statsFields.filter((f) => VALID_STAT_FIELD_SET.has(f)));
    return POSITION_STAT_OPTIONS.map((o) => o.id).filter((id) => picked.has(id));
  }
  if (settings?.stats === "none") return [];
  if (settings?.stats === "levels") return ["tpTickOffset", "slTickOffset"];
  if (settings?.stats === "summary") return ["qty", "riskRewardRatio"];
  return [...DEFAULT_POSITION_STATS_FIELDS];
}

const SCALE = 1_000_000_000n;

export function positionDecimalE9(value: string): bigint {
  const trimmed = value.trim();
  const match = /^(\d{1,18})(?:\.(\d{0,9}))?$/.exec(trimmed);
  if (!match) return 0n;
  return BigInt(match[1]) * SCALE + BigInt((match[2] ?? "").padEnd(9, "0"));
}

export function positionDistances(
  entry: bigint,
  target: bigint,
  settings?: Partial<PositionSettings>,
  rr = 2,
) {
  const targetTicks = entry > target ? entry - target : target - entry;
  const ratio = BigInt(Math.max(1, Math.round(rr * 100)));
  const fallback = (targetTicks * 100n) / ratio;
  const stopTicks =
    settings?.stopTicks && /^\d{1,24}$/.test(settings.stopTicks)
      ? BigInt(settings.stopTicks)
      : fallback;
  return { targetTicks, stopTicks: stopTicks > 0n ? stopTicks : 1n };
}

export function estimatePositionQuantityE9(
  entryE9: bigint,
  stopDistanceE9: bigint,
  settings: PositionSettings,
): bigint | null {
  const lot = positionDecimalE9(settings.lotSize);
  const account = positionDecimalE9(settings.accountSize);
  const leverage = positionDecimalE9(settings.leverage);
  const riskInput = positionDecimalE9(settings.risk);
  if ([entryE9, stopDistanceE9, lot, account, leverage, riskInput].some((value) => value <= 0n)) {
    return null;
  }
  const risk = settings.riskUnit === "%" ? (account * riskInput) / (100n * SCALE) : riskInput;
  const riskLotsE9 = (risk * SCALE * SCALE) / (stopDistanceE9 * lot);
  const buyingPowerLotsE9 = (account * leverage * SCALE) / (entryE9 * lot);
  return riskLotsE9 < buyingPowerLotsE9 ? riskLotsE9 : buyingPowerLotsE9;
}

export function estimatePositionQuantity(
  entryE9: bigint,
  stopDistanceE9: bigint,
  settings: PositionSettings,
): string | null {
  const qtyE9 = estimatePositionQuantityE9(entryE9, stopDistanceE9, settings);
  if (qtyE9 === null) return null;
  return formatFixedE9(qtyE9, settings.quantityPrecision);
}

function formatSignedFixedE9(valE9: bigint, decimals: number, prefix = "", suffix = ""): string {
  const sign = valE9 < 0n ? "-" : "+";
  const abs = valE9 < 0n ? -valE9 : valE9;
  return `${sign}${prefix}${formatFixedE9(abs, decimals)}${suffix}`;
}

export interface ComputedPositionStatLines {
  tp: string[];
  center: string[];
  sl: string[];
}

export function computePositionStatLines(params: {
  isShort: boolean;
  entryTick: bigint;
  targetTicks: bigint;
  stopTicks: bigint;
  tickSizeE9: bigint;
  digits: number;
  settings: PositionSettings;
  currentPriceE9?: bigint | null;
}): ComputedPositionStatLines {
  const { isShort, entryTick, targetTicks, stopTicks, tickSizeE9, digits, settings, currentPriceE9 } =
    params;
  const activeFields = resolvePositionStatsFields(settings);
  const tp: string[] = [];
  const center: string[] = [];
  const sl: string[] = [];
  if (activeFields.length === 0) return { tp, center, sl };

  const entryE9 = entryTick * tickSizeE9;
  const tpDistE9 = targetTicks * tickSizeE9;
  const slDistE9 = stopTicks * tickSizeE9;
  const qtyE9 = estimatePositionQuantityE9(entryE9, slDistE9, settings);
  const lotE9 = positionDecimalE9(settings.lotSize);
  const accountE9 = positionDecimalE9(settings.accountSize);
  const unitsE9 = qtyE9 !== null && lotE9 > 0n ? (qtyE9 * lotE9) / SCALE : null;

  const tpPctE9 = entryE9 > 0n ? (tpDistE9 * 100n * SCALE) / entryE9 : 0n;
  const slPctE9 = entryE9 > 0n ? (slDistE9 * 100n * SCALE) / entryE9 : 0n;
  const tpPlE9 = unitsE9 !== null ? (tpDistE9 * unitsE9) / SCALE : null;
  const slPlE9 = unitsE9 !== null ? (slDistE9 * unitsE9) / SCALE : null;
  const rrE9 = stopTicks > 0n ? (targetTicks * SCALE) / stopTicks : 0n;

  const openPlE9 =
    unitsE9 !== null && currentPriceE9 && currentPriceE9 > 0n
      ? ((isShort ? entryE9 - currentPriceE9 : currentPriceE9 - entryE9) * unitsE9) / SCALE
      : null;

  const selected = new Set(activeFields);

  if (selected.has("tpPriceOffset")) {
    tp.push(`+${formatFixedE9(tpDistE9, digits)}`);
  }
  if (selected.has("tpPercentOffset")) {
    tp.push(`+${formatFixedE9(tpPctE9, 2)}%`);
  }
  if (selected.has("tpTickOffset")) {
    tp.push(settings.compact ? `+${targetTicks}t` : `Target +${targetTicks}t`);
  }
  if (selected.has("tpPl") && tpPlE9 !== null) {
    tp.push(formatSignedFixedE9(tpPlE9, 2, "$"));
  }
  if (selected.has("tpAmount") && tpPlE9 !== null && accountE9 > 0n) {
    tp.push(`Acct $${formatFixedE9(accountE9 + tpPlE9, 2)}`);
  }

  if (selected.has("openClosedPl") && openPlE9 !== null) {
    center.push(`P&L ${formatSignedFixedE9(openPlE9, 2, "$")}`);
  }
  if (selected.has("qty") && qtyE9 !== null) {
    center.push(`Qty ${formatFixedE9(qtyE9, settings.quantityPrecision)}`);
  }
  if (selected.has("riskRewardRatio")) {
    center.push(`R:R ${formatFixedE9(rrE9, 2)}`);
  }

  if (selected.has("slPriceOffset")) {
    sl.push(`-${formatFixedE9(slDistE9, digits)}`);
  }
  if (selected.has("slPercentOffset")) {
    sl.push(`-${formatFixedE9(slPctE9, 2)}%`);
  }
  if (selected.has("slTickOffset")) {
    sl.push(settings.compact ? `-${stopTicks}t` : `Stop -${stopTicks}t`);
  }
  if (selected.has("slPl") && slPlE9 !== null) {
    sl.push(formatSignedFixedE9(-slPlE9, 2, "$"));
  }
  if (selected.has("slAmount") && slPlE9 !== null && accountE9 > 0n) {
    const rem = accountE9 > slPlE9 ? accountE9 - slPlE9 : 0n;
    sl.push(`Acct $${formatFixedE9(rem, 2)}`);
  }

  return { tp, center, sl };
}

export interface PositionTemplate {
  position: PositionSettings;
  color: string;
  lineStyle: "solid" | "dashed" | "dotted";
  lineWidth: 1 | 2 | 3 | 4;
  textColor: string;
  fontSize: number;
}

export function loadPositionTemplate(kind: string): PositionTemplate | null {
  try {
    return JSON.parse(
      localStorage.getItem(`allegedly.position.template.${kind}`) ?? "null",
    ) as PositionTemplate | null;
  } catch {
    return null;
  }
}

export function savePositionTemplate(kind: string, template: PositionTemplate): void {
  try {
    localStorage.setItem(`allegedly.position.template.${kind}`, JSON.stringify(template));
  } catch {
    // New drawings use the built-in defaults if storage is unavailable.
  }
}
