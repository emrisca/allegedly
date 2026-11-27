import { useEffect, useMemo, useState } from "react";
import { Button } from "@ui-sdk/react/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import {
  BOOK_STATE_LABELS,
  BookState,
  formatFixedE9,
  PROVENANCE_TIER_LABELS,
  ProvenanceTier,
  type BuiltinStudyKind,
  type PaperAccountSnapshot,
  type ResolvedSetting,
  type StudyRunResponse,
} from "@allegedly/ipc-client";

export type PaperOmsTabValue = "ticket" | "orders" | "provenance" | "studies" | "settings";

export interface PaperOmsPanelProps {
  symbol: string;
  account: PaperAccountSnapshot;
  bookState: number;
  provenanceTier: number;
  defaultTab?: PaperOmsTabValue;
  panelMode?: "trade" | "system";
  livePrice?: number;
  tickSize?: number;
  activeStudies?: readonly StudyRunResponse[];
  studyError?: string | null;
  settings?: readonly ResolvedSetting[];
  exportedToml?: string | null;
  onSubmitOrder: (
    side: "buy" | "sell",
    orderType: "market" | "limit",
    explicitPrice?: number,
    qty?: number,
  ) => void;
  onKillSwitch: () => void;
  onSwitchToDom?: () => void;
  onCollapse?: () => void;
  onRunBuiltinStudy?: (kind: BuiltinStudyKind, period: number) => void;
  onRunLuauStudy?: (script: string) => void;
  onClearStudies?: () => void;
  onUpdateSetting?: (key: string, value: string) => void;
  onResetSetting?: (key: string) => void;
  onExportWorkspaceToml?: () => void;
}

const PROVENANCE_LADDER: ReadonlyArray<{
  tier: number;
  displayTier: number;
  label: string;
  desc: string;
  absorptionAllowed: boolean;
  exactMbo: boolean;
}> = [
  {
    tier: ProvenanceTier.ExactL3Mbo,
    displayTier: 1,
    label: "EXACT: L3 MBO",
    desc: "Native per-order queue position (Exact PIQ)",
    absorptionAllowed: true,
    exactMbo: true,
  },
  {
    tier: ProvenanceTier.ExactTickAggr,
    displayTier: 2,
    label: "EXACT: TICK AGGR",
    desc: "Exchange-tagged aggressor side (SV-10 OK)",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.EstimatedL1Quote,
    displayTier: 3,
    label: "INFERRED: QUOTE RULE",
    desc: "Lee-Ready BBO side classification",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.EstimatedTickRule,
    displayTier: 4,
    label: "INFERRED: TICK RULE",
    desc: "Prior-tick direction inference",
    absorptionAllowed: true,
    exactMbo: false,
  },
  {
    tier: ProvenanceTier.SyntheticIntrabar,
    displayTier: 5,
    label: "SYNTHETIC: INTRABAR",
    desc: "Coarse OHLCV synthesis (SV-10 triggers gated)",
    absorptionAllowed: false,
    exactMbo: false,
  },
];

const DEFAULT_LUAU_SNIPPET =
  "local out = {}; for i = 1, #close do out[i] = i == 1 and close[i] or (close[i] + close[i-1]) / 2 end; return out";

function bookStateTextClass(bookState: number): string {
  if (bookState === BookState.Live) return "text-emerald-300";
  if (bookState === BookState.Rebuilding || bookState === BookState.Stale) return "text-amber-300";
  return "text-rose-300";
}

function decimalsForTick(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) return 2;
  if (tick >= 1) return 2;
  const s = tick.toFixed(6).replace(/0+$/, "");
  const dot = s.indexOf(".");
  return dot === -1 ? 2 : Math.max(2, s.length - dot - 1);
}

function formatMoney(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function PaperOmsPanel({
  symbol,
  account,
  bookState,
  provenanceTier,
  defaultTab = "ticket",
  panelMode = "system",
  livePrice,
  tickSize = 0.5,
  activeStudies = [],
  studyError = null,
  settings = [],
  exportedToml = null,
  onSubmitOrder,
  onKillSwitch,
  onSwitchToDom,
  onCollapse,
  onRunBuiltinStudy,
  onRunLuauStudy,
  onClearStudies,
  onUpdateSetting,
  onResetSetting,
  onExportWorkspaceToml,
}: PaperOmsPanelProps) {
  const [luauDraft, setLuauDraft] = useState<string>(DEFAULT_LUAU_SNIPPET);
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [editingSettingValue, setEditingSettingValue] = useState<string>("");

  // TradingView / Tradovate order ticket state
  const [activeTab, setActiveTab] = useState<PaperOmsTabValue>(defaultTab);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [qtyText, setQtyText] = useState<string>("0.50");
  const [priceText, setPriceText] = useState<string>("");
  const [exitsOpen, setExitsOpen] = useState<boolean>(true);
  const [tpEnabled, setTpEnabled] = useState<boolean>(false);
  const [slEnabled, setSlEnabled] = useState<boolean>(false);
  const [tpTicks, setTpTicks] = useState<number>(75);
  const [slTicks, setSlTicks] = useState<number>(25);
  const [extraOpen, setExtraOpen] = useState<boolean>(false);
  const [tif, setTif] = useState<"GTC" | "DAY" | "IOC" | "FOK">("GTC");

  const decimals = useMemo(() => decimalsForTick(tickSize), [tickSize]);
  const refPrice = livePrice && Number.isFinite(livePrice) && livePrice > 0 ? livePrice : 95000;
  const halfSpread = Math.max(tickSize * 0.5, 0.01);
  const bidPrice = Math.max(tickSize, refPrice - halfSpread);
  const askPrice = refPrice + halfSpread;
  const spread = askPrice - bidPrice;

  // Keep default limit/stop price synced when switching symbol or toggling side
  useEffect(() => {
    setPriceText((side === "buy" ? askPrice : bidPrice).toFixed(decimals));
  }, [symbol, decimals]);

  const parsedQty = Math.max(0.01, Number.parseFloat(qtyText) || 0.5);
  const parsedPrice = Number.parseFloat(priceText);
  const effectivePrice =
    orderType === "market"
      ? side === "buy"
        ? askPrice
        : bidPrice
      : Number.isFinite(parsedPrice) && parsedPrice > 0
        ? parsedPrice
        : side === "buy"
          ? askPrice
          : bidPrice;

  const notionalUsd = parsedQty * effectivePrice;
  const availableMargin = 50000;
  const tickValueUsd = tickSize * parsedQty;

  const tpPrice =
    side === "buy" ? effectivePrice + tpTicks * tickSize : Math.max(tickSize, effectivePrice - tpTicks * tickSize);
  const slPrice =
    side === "buy" ? Math.max(tickSize, effectivePrice - slTicks * tickSize) : effectivePrice + slTicks * tickSize;

  const rawPos = account.net_position_e9[symbol] ?? "0";
  const netPosBig = BigInt(rawPos);
  const netPos = formatFixedE9(netPosBig, 3);
  const posColor =
    netPosBig > 0n ? "text-[#089981]" : netPosBig < 0n ? "text-[#f23645]" : "text-[#d1d4dc]";

  const latestLuauPeakBytes = activeStudies.reduce(
    (max, st) => Math.max(max, st.memory_pool_peak_bytes ?? st.memory_pool_reserved_bytes ?? 0),
    0,
  );
  const poolCapBytes = activeStudies[0]?.memory_pool_cap_bytes ?? 64 * 1024 * 1024;

  const beginEditSetting = (s: ResolvedSetting) => {
    setEditingSettingKey(s.key);
    setEditingSettingValue(s.value);
  };

  const commitEditSetting = (key: string) => {
    onUpdateSetting?.(key, editingSettingValue);
    setEditingSettingKey(null);
  };

  const handlePlaceTicketOrder = () => {
    const mappedType: "market" | "limit" = orderType === "market" ? "market" : "limit";
    onSubmitOrder(
      side,
      mappedType,
      mappedType === "limit" ? effectivePrice : undefined,
      parsedQty,
    );
  };

  const isTradeView = panelMode === "trade";

  return (
    <section
      aria-label="Paper execution, studies, provenance, and settings"
      className="flex h-full w-full flex-col bg-[#131722] text-xs text-[#d1d4dc] select-none"
    >
      {/* Clean TradingView / Tradovate Panel Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2a2e39] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2962ff]/18 font-mono text-[10px] font-bold text-[#6fa1ff]">
            {symbol.slice(0, 1)}
          </span>
          <span className="truncate text-[13px] font-semibold tracking-tight text-[#f0f3fa]">
            {symbol}
          </span>
          <span className="rounded bg-[#2a2e39] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#9598a1]">
            {account.mode === "PAPER / SIM" ? "SIM" : account.mode}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {account.orders.length > 0 && (
            <Button
              onClick={onKillSwitch}
              title="Cancel all working paper orders"
              className="rounded px-2 py-1 text-[11px] font-medium text-[#f23645] hover:bg-[#f23645]/12"
            >
              Cancel All
            </Button>
          )}
          {onCollapse && (
            <button
              type="button"
              aria-label="Close right drawer"
              onClick={onCollapse}
              className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#f0f3fa]"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Order | DOM Segmented Switch (matches TradingView & MotiveWave right panel) */}
      {isTradeView && onSwitchToDom && (
        <div className="shrink-0 px-3 pt-2.5 pb-1">
          <div className="grid grid-cols-2 rounded-lg bg-[#1e222d] p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("ticket")}
              className={`h-7 rounded-md text-[12px] font-medium transition-colors ${
                activeTab === "ticket"
                  ? "bg-[#2a2e39] text-[#f0f3fa] shadow-sm"
                  : "text-[#787b86] hover:text-[#d1d4dc]"
              }`}
            >
              Order
            </button>
            <button
              type="button"
              onClick={onSwitchToDom}
              className="h-7 rounded-md text-[12px] font-medium text-[#787b86] transition-colors hover:text-[#d1d4dc]"
            >
              DOM
            </button>
          </div>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PaperOmsTabValue)}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Navigation Tabs: streamlined in Trade view, full 5-tab bar in Data & System view */}
        <TabsList
          aria-label="Execution and desk panel tabs"
          className={
            isTradeView
              ? "mx-3 mt-1.5 flex shrink-0 items-center gap-3 border-b border-[#2a2e39] text-[11px]"
              : "mx-2.5 mt-2 mb-1 grid shrink-0 grid-cols-5 gap-0.5 rounded-md border border-[#2a2e39] bg-[#181c27] p-0.5"
          }
        >
          <TabsTab
            value="ticket"
            aria-label="Paper Ticket"
            className={
              isTradeView
                ? "border-b-2 border-transparent pb-1.5 font-medium text-[#787b86] hover:text-[#d1d4dc] data-selected:border-[#f0f3fa] data-selected:text-[#f0f3fa]"
                : "truncate rounded px-1 py-1 text-center text-[10.5px] font-medium text-[#787b86] hover:text-[#d1d4dc] data-selected:bg-[#2a2e39] data-selected:text-[#f0f3fa]"
            }
          >
            {isTradeView ? "Ticket" : "Ticket"}
          </TabsTab>
          <TabsTab
            value="orders"
            aria-label={`Journal (${account.orders.length})`}
            className={
              isTradeView
                ? "border-b-2 border-transparent pb-1.5 font-medium text-[#787b86] hover:text-[#d1d4dc] data-selected:border-[#f0f3fa] data-selected:text-[#f0f3fa]"
                : "truncate rounded px-1 py-1 text-center text-[10.5px] font-medium text-[#787b86] hover:text-[#d1d4dc] data-selected:bg-[#2a2e39] data-selected:text-[#f0f3fa]"
            }
          >
            Orders{account.orders.length > 0 ? ` (${account.orders.length})` : ""}
          </TabsTab>
          <TabsTab
            value="provenance"
            aria-label="Provenance"
            className={
              isTradeView
                ? "hidden"
                : "truncate rounded px-1 py-1 text-center text-[10.5px] font-medium text-[#787b86] hover:text-[#d1d4dc] data-selected:bg-[#2a2e39] data-selected:text-[#f0f3fa]"
            }
          >
            Data
          </TabsTab>
          <TabsTab
            value="studies"
            aria-label={`Studies (${activeStudies.length})`}
            className={
              isTradeView
                ? "hidden"
                : "truncate rounded px-1 py-1 text-center text-[10.5px] font-medium text-[#787b86] hover:text-[#d1d4dc] data-selected:bg-[#2a2e39] data-selected:text-[#f0f3fa]"
            }
          >
            Studies
          </TabsTab>
          <TabsTab
            value="settings"
            aria-label="TOML Cascade"
            className={
              isTradeView
                ? "hidden"
                : "truncate rounded px-1 py-1 text-center text-[10.5px] font-medium text-[#787b86] hover:text-[#d1d4dc] data-selected:bg-[#2a2e39] data-selected:text-[#f0f3fa]"
            }
          >
            Config
          </TabsTab>
        </TabsList>

        {/* TAB 1: TRADINGVIEW / TRADOVATE ORDER TICKET */}
        <TabsPanel value="ticket" className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          <div className="space-y-3">
            {/* Two-sided Sell (Bid) | Spread | Buy (Ask) Quote Selector */}
            <div className="relative grid grid-cols-2 overflow-hidden rounded-lg border border-[#2a2e39] bg-[#181c27]">
              <button
                type="button"
                aria-pressed={side === "sell"}
                onClick={() => {
                  setSide("sell");
                  setPriceText(bidPrice.toFixed(decimals));
                }}
                className={`flex flex-col items-start px-3 py-2 text-left transition-colors ${
                  side === "sell"
                    ? "bg-[#f23645]/16 ring-1 ring-inset ring-[#f23645]/75"
                    : "hover:bg-[#1e222d]"
                }`}
              >
                <span className={`text-[11px] font-medium ${side === "sell" ? "text-[#ff6b77]" : "text-[#9598a1]"}`}>
                  Sell
                </span>
                <span className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums text-[#f0f3fa]">
                  {formatMoney(bidPrice, decimals)}
                </span>
              </button>

              <button
                type="button"
                aria-pressed={side === "buy"}
                onClick={() => {
                  setSide("buy");
                  setPriceText(askPrice.toFixed(decimals));
                }}
                className={`flex flex-col items-end border-l border-[#2a2e39] px-3 py-2 text-right transition-colors ${
                  side === "buy"
                    ? "bg-[#2962ff]/18 ring-1 ring-inset ring-[#2962ff]/80"
                    : "hover:bg-[#1e222d]"
                }`}
              >
                <span className={`text-[11px] font-medium ${side === "buy" ? "text-[#6fa1ff]" : "text-[#9598a1]"}`}>
                  Buy
                </span>
                <span className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums text-[#f0f3fa]">
                  {formatMoney(askPrice, decimals)}
                </span>
              </button>

              <span className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 rounded bg-[#131722] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#9598a1] ring-1 ring-[#2a2e39]">
                {spread.toFixed(decimals)}
              </span>
            </div>

            {/* Order Type Underline Tabs: Market | Limit | Stop */}
            <div className="grid grid-cols-3 border-b border-[#2a2e39]" role="radiogroup" aria-label="Order type">
              {(
                [
                  ["market", "Market"],
                  ["limit", "Limit"],
                  ["stop", "Stop"],
                ] as const
              ).map(([id, label]) => {
                const selected = orderType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setOrderType(id);
                      if (id !== "market") {
                        setPriceText((side === "buy" ? askPrice : bidPrice).toFixed(decimals));
                      }
                    }}
                    className={`border-b-2 pb-2 text-center text-[12px] font-medium transition-colors ${
                      selected
                        ? "border-[#f0f3fa] text-[#f0f3fa]"
                        : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Price Input (Limit / Stop) */}
            {orderType !== "market" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[#9598a1]">
                  <label htmlFor="order-price-input">Price</label>
                  <button
                    type="button"
                    onClick={() => setPriceText((side === "buy" ? askPrice : bidPrice).toFixed(decimals))}
                    className="text-[10.5px] text-[#787b86] hover:text-[#d1d4dc]"
                  >
                    Snap to {side === "buy" ? "Ask" : "Bid"}
                  </button>
                </div>
                <div className="flex h-9 items-center rounded-md border border-[#2a2e39] bg-[#181c27] px-2.5 focus-within:border-[#2962ff]">
                  <input
                    id="order-price-input"
                    type="text"
                    inputMode="decimal"
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[13px] tabular-nums text-[#f0f3fa] outline-none"
                  />
                  <span className="ml-2 shrink-0 text-[11px] text-[#787b86]">
                    {side === "buy" ? "Ask" : "Bid"}
                  </span>
                </div>
              </div>
            )}

            {/* Units / Quantity Input + Quick Size Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#9598a1]">
                <label htmlFor="order-qty-input">Units</label>
                <span className="font-mono text-[11px] tabular-nums text-[#787b86]">
                  ≈ ${formatMoney(notionalUsd, 2)} USD
                </span>
              </div>
              <div className="flex h-9 items-center rounded-md border border-[#2a2e39] bg-[#181c27] px-2.5 focus-within:border-[#2962ff]">
                <input
                  id="order-qty-input"
                  type="text"
                  inputMode="decimal"
                  value={qtyText}
                  onChange={(e) => setQtyText(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[13px] tabular-nums text-[#f0f3fa] outline-none"
                />
                <span className="ml-2 shrink-0 font-mono text-[11px] text-[#787b86]">
                  {symbol.split("/")[0]}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {["0.10", "0.25", "0.50", "1.00"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setQtyText(preset)}
                    className={`h-6 rounded border font-mono text-[10.5px] tabular-nums transition-colors ${
                      qtyText === preset
                        ? "border-[#2962ff] bg-[#2962ff]/18 text-[#f0f3fa]"
                        : "border-[#2a2e39] bg-[#181c27] text-[#9598a1] hover:border-[#363a45] hover:text-[#f0f3fa]"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Compact Account & Margin Summary Card */}
            <div className="space-y-1.5 rounded-lg border border-[#2a2e39] bg-[#181c27] px-3 py-2.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Trade value</span>
                <span className="font-mono tabular-nums text-[#d1d4dc]">
                  {formatMoney(notionalUsd, 2)} <span className="text-[10px] text-[#787b86]">USD</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Available margin</span>
                <span className="font-mono tabular-nums text-[#d1d4dc]">
                  {formatMoney(availableMargin, 2)} <span className="text-[10px] text-[#787b86]">USD</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Net position</span>
                <span className={`font-mono font-semibold tabular-nums ${posColor}`}>
                  {netPos} <span className="text-[10px] font-normal text-[#787b86]">{symbol.split("/")[0]}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#787b86]">Tick value</span>
                <span className="font-mono tabular-nums text-[#d1d4dc]">
                  {formatMoney(tickValueUsd, 2)} <span className="text-[10px] text-[#787b86]">USD</span>
                </span>
              </div>
            </div>

            {/* Collapsible Exits (Bracket / ATM — Take Profit & Stop Loss) */}
            <div className="border-t border-[#2a2e39] pt-2.5">
              <button
                type="button"
                onClick={() => setExitsOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[12px] font-semibold text-[#f0f3fa]"
              >
                <span>Exits</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className={`h-3 w-3 text-[#787b86] transition-transform ${exitsOpen ? "" : "rotate-180"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M2.5 7.5 6 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {exitsOpen && (
                <div className="mt-2.5 space-y-2.5">
                  {/* Take Profit */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#9598a1]">Take profit</span>
                      <button
                        type="button"
                        role="switch"
                        aria-label="Enable take profit"
                        aria-checked={tpEnabled}
                        onClick={() => setTpEnabled((v) => !v)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          tpEnabled ? "bg-[#089981]" : "bg-[#2a2e39]"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            tpEnabled ? "translate-x-4.5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                    <div
                      className={`flex h-8 items-center justify-between rounded-md border px-2.5 font-mono text-[12px] tabular-nums ${
                        tpEnabled
                          ? "border-[#2a2e39] bg-[#181c27] text-[#f0f3fa]"
                          : "border-[#2a2e39]/60 bg-[#181c27]/50 text-[#5d606b]"
                      }`}
                    >
                      <span>{formatMoney(tpPrice, decimals)}</span>
                      <div className="flex items-center gap-1">
                        <input
                          aria-label="Take profit ticks"
                          type="number"
                          min={1}
                          disabled={!tpEnabled}
                          value={tpTicks}
                          onChange={(e) => setTpTicks(Math.max(1, Number(e.target.value) || 1))}
                          className="w-12 bg-transparent text-right text-[11px] outline-none disabled:cursor-not-allowed"
                        />
                        <span className="text-[10.5px] text-[#787b86]">ticks</span>
                      </div>
                    </div>
                  </div>

                  {/* Stop Loss */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#9598a1]">Stop loss</span>
                      <button
                        type="button"
                        role="switch"
                        aria-label="Enable stop loss"
                        aria-checked={slEnabled}
                        onClick={() => setSlEnabled((v) => !v)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          slEnabled ? "bg-[#f23645]" : "bg-[#2a2e39]"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            slEnabled ? "translate-x-4.5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                    <div
                      className={`flex h-8 items-center justify-between rounded-md border px-2.5 font-mono text-[12px] tabular-nums ${
                        slEnabled
                          ? "border-[#2a2e39] bg-[#181c27] text-[#f0f3fa]"
                          : "border-[#2a2e39]/60 bg-[#181c27]/50 text-[#5d606b]"
                      }`}
                    >
                      <span>{formatMoney(slPrice, decimals)}</span>
                      <div className="flex items-center gap-1">
                        <input
                          aria-label="Stop loss ticks"
                          type="number"
                          min={1}
                          disabled={!slEnabled}
                          value={slTicks}
                          onChange={(e) => setSlTicks(Math.max(1, Number(e.target.value) || 1))}
                          className="w-12 bg-transparent text-right text-[11px] outline-none disabled:cursor-not-allowed"
                        />
                        <span className="text-[10.5px] text-[#787b86]">ticks</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Extra Settings (Time in force) */}
            <div className="border-t border-[#2a2e39] pt-2.5">
              <button
                type="button"
                onClick={() => setExtraOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[12px] font-semibold text-[#f0f3fa]"
              >
                <span>Extra settings</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className={`h-3 w-3 text-[#787b86] transition-transform ${extraOpen ? "" : "rotate-180"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M2.5 7.5 6 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {extraOpen && (
                <div className="mt-2 space-y-1">
                  <label htmlFor="order-tif-select" className="text-[11px] text-[#9598a1]">
                    Time in force
                  </label>
                  <select
                    id="order-tif-select"
                    value={tif}
                    onChange={(e) => setTif(e.target.value as "GTC" | "DAY" | "IOC" | "FOK")}
                    className="h-8 w-full rounded-md border border-[#2a2e39] bg-[#181c27] px-2.5 text-[12px] text-[#f0f3fa] outline-none focus:border-[#2962ff]"
                  >
                    <option value="GTC">Good til canceled (GTC)</option>
                    <option value="DAY">Day</option>
                    <option value="IOC">Immediate or cancel (IOC)</option>
                    <option value="FOK">Fill or kill (FOK)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Full-Width Primary Order Execution CTA */}
            <Button
              onClick={handlePlaceTicketOrder}
              className={`flex h-10 w-full items-center justify-center rounded-lg text-[13px] font-semibold text-white transition-colors ${
                side === "buy"
                  ? "bg-[#2962ff] hover:bg-[#1e53e5]"
                  : "bg-[#f23645] hover:bg-[#d92b3a]"
              }`}
            >
              {side === "buy" ? "Buy" : "Sell"} {parsedQty.toFixed(2)} {symbol.split("/")[0]} @{" "}
              {orderType === "market" ? "MKT" : formatMoney(effectivePrice, decimals)}
            </Button>

            {/* Quiet Paper Safety Footer */}
            <p className="text-center text-[10px] text-[#5d606b]">
              Paper simulator · <span data-testid="live-armed-badge">LIVE_ARMED = false</span>
            </p>
          </div>
        </TabsPanel>

        {/* TAB 2: ORDER JOURNAL / WORKING & FILLED ORDERS */}
        <TabsPanel value="orders" className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 font-mono text-[11px]">
          {account.orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-[12px] font-sans font-medium text-[#9598a1]">No paper orders yet</p>
              <p className="mt-1 font-sans text-[11px] text-[#5d606b]">
                Submit a Market or Limit order from the Ticket tab.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {account.orders.slice(0, 20).map((ord) => (
                <li
                  key={ord.order_id}
                  className="flex items-center justify-between rounded-md border border-[#2a2e39] bg-[#181c27] px-2.5 py-2"
                >
                  <div className="flex flex-col">
                    <span className={ord.side === "buy" ? "font-semibold text-[#089981]" : "font-semibold text-[#f23645]"}>
                      {ord.side.toUpperCase()} {ord.order_type.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-[#787b86]">{ord.order_id}</span>
                  </div>
                  <div className="flex flex-col items-end tabular-nums">
                    <span className="text-[#f0f3fa]">{formatFixedE9(BigInt(ord.qty_e9), 2)}</span>
                    <span className="text-[10px] text-[#9598a1]">{ord.status.toUpperCase()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsPanel>

        {/* TAB 3: DATA PROVENANCE (T1..T5) */}
        <TabsPanel value="provenance" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2 font-mono text-[11px]">
          <div className="flex justify-between rounded-md border border-[#2a2e39] bg-[#181c27] px-2.5 py-1.5">
            <span className="text-[#787b86]">Active Tier</span>
            <span className="text-[#6fa1ff]">{PROVENANCE_TIER_LABELS[provenanceTier] ?? "UNKNOWN"}</span>
          </div>
          <div className="flex justify-between rounded-md border border-[#2a2e39] bg-[#181c27] px-2.5 py-1.5">
            <span className="text-[#787b86]">Book State · PIQ</span>
            <span
              data-testid="oms-book-state-badge"
              className={bookStateTextClass(bookState)}
            >
              {BOOK_STATE_LABELS[bookState] ?? "UNKNOWN"} ·{" "}
              {provenanceTier === ProvenanceTier.ExactL3Mbo ? "[EXACT MBO]" : "[Est / Max]"}
            </span>
          </div>
          <ul className="space-y-1 pt-0.5" aria-label="5-tier provenance ledger">
            {PROVENANCE_LADDER.map((row) => {
              const active = row.tier === provenanceTier;
              return (
                <li
                  key={row.tier}
                  className={
                    active
                      ? "flex items-center justify-between rounded-md border border-[#2962ff]/60 bg-[#2962ff]/12 px-2.5 py-1.5 text-[10px]"
                      : "flex items-center justify-between rounded-md border border-[#2a2e39] bg-[#181c27]/70 px-2.5 py-1.5 text-[10px] text-[#787b86]"
                  }
                >
                  <div>
                    <div className={active ? "font-semibold text-[#f0f3fa]" : "text-[#d1d4dc]"}>
                      T{row.displayTier} · {row.label}
                    </div>
                    <div className="text-[9.5px] text-[#787b86]">{row.desc}</div>
                  </div>
                  <span className="rounded bg-[#131722] px-1.5 py-0.5 text-[9px] text-[#d1d4dc]">
                    {active ? "ACTIVE" : row.absorptionAllowed ? "SV-10 OK" : "GATED"}
                  </span>
                </li>
              );
            })}
          </ul>
        </TabsPanel>

        {/* TAB 4: STUDIES & SANDBOXED LUAU RUNNER */}
        <TabsPanel value="studies" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2 font-mono text-[10px]">
          <div className="flex flex-wrap gap-1">
            <Button
              onClick={() => onRunBuiltinStudy?.("sma", 20)}
              className="rounded border border-[#2a2e39] bg-[#181c27] px-2 py-1 text-[10px] text-[#d1d4dc] hover:border-[#2962ff] hover:text-white"
            >
              + SMA(20)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("ema", 9)}
              className="rounded border border-[#2a2e39] bg-[#181c27] px-2 py-1 text-[10px] text-[#d1d4dc] hover:border-[#2962ff] hover:text-white"
            >
              + EMA(9)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("vwap", 1)}
              className="rounded border border-[#2a2e39] bg-[#181c27] px-2 py-1 text-[10px] text-[#d1d4dc] hover:border-[#2962ff] hover:text-white"
            >
              + VWAP
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("wilder_rsi", 14)}
              className="rounded border border-[#2a2e39] bg-[#181c27] px-2 py-1 text-[10px] text-[#d1d4dc] hover:border-[#2962ff] hover:text-white"
            >
              + RSI(14)
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("cvd", 1)}
              className="rounded border border-[#2a2e39] bg-[#181c27] px-2 py-1 text-[10px] text-[#d1d4dc] hover:border-[#2962ff] hover:text-white"
            >
              + CVD
            </Button>
            <Button
              onClick={() => onRunBuiltinStudy?.("footprint_delta", 1)}
              className="rounded border border-[#2a2e39] bg-[#181c27] px-2 py-1 text-[10px] text-[#d1d4dc] hover:border-[#2962ff] hover:text-white"
            >
              + FP Delta
            </Button>
            {activeStudies.length > 0 && (
              <Button
                onClick={() => onClearStudies?.()}
                className="rounded border border-[#2a2e39] bg-[#1e222d] px-2 py-1 text-[10px] text-[#f23645] hover:bg-[#f23645]/12"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-[#9598a1]">
              <label htmlFor="luau-study-input">
                Sandboxed Luau (≤ {(poolCapBytes / (1024 * 1024)).toFixed(0)} MiB):
              </label>
              <span className="tabular-nums text-[#787b86]">
                Peak: {(latestLuauPeakBytes / (1024 * 1024)).toFixed(1)} MiB
              </span>
            </div>
            <textarea
              id="luau-study-input"
              value={luauDraft}
              onChange={(e) => setLuauDraft(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[#2a2e39] bg-[#181c27] p-2 font-mono text-[10px] text-[#d1d4dc] focus:border-[#2962ff] focus:outline-none"
            />
            <Button
              onClick={() => onRunLuauStudy?.(luauDraft)}
              className="rounded-md bg-[#2962ff] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1e53e5]"
            >
              Run Luau Study
            </Button>
          </div>

          {studyError && (
            <div className="rounded-md border border-[#f23645]/50 bg-[#f23645]/12 px-2.5 py-1.5 text-[#ff8a93]">
              {studyError}
            </div>
          )}

          {activeStudies.length > 0 && (
            <ul className="space-y-1">
              {activeStudies.map((st) => {
                const latest = [...st.values].reverse().find((v) => v !== null);
                return (
                  <li
                    key={st.id}
                    className="flex items-center justify-between rounded-md border border-[#2a2e39] bg-[#181c27] px-2.5 py-1.5"
                  >
                    <span className="text-[#f0f3fa]">{st.label}</span>
                    <span className="tabular-nums text-[#9598a1]">
                      {latest !== undefined && latest !== null ? latest.toFixed(2) : "—"} ·{" "}
                      {st.overlay ? "OVERLAY" : "OSC"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsPanel>

        {/* TAB 5: TOML CASCADE SETTINGS */}
        <TabsPanel value="settings" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2 font-mono text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#787b86]">
              5-Level Cascade
            </span>
            <Button
              onClick={() => onExportWorkspaceToml?.()}
              className="shrink-0 rounded border border-[#2a2e39] bg-[#181c27] px-2 py-1 text-[10px] text-[#d1d4dc] hover:bg-[#2a2e39]"
            >
              Export .atworkspace.toml
            </Button>
          </div>

          <ul className="space-y-1">
            {settings.map((s) => {
              const isEditing = editingSettingKey === s.key;
              return (
                <li
                  key={s.key}
                  className="flex items-center justify-between gap-2 rounded-md border border-[#2a2e39] bg-[#181c27] px-2 py-1.5"
                >
                  <div className="min-w-0 truncate">
                    <span className="text-[#d1d4dc]">{s.key}</span>
                    <span className="ml-1.5 rounded bg-[#2a2e39] px-1 py-0.5 text-[9px] uppercase text-[#9598a1]">
                      {s.source_layer}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <input
                          aria-label={`Override value for ${s.key}`}
                          value={editingSettingValue}
                          onChange={(e) => setEditingSettingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEditSetting(s.key);
                            if (e.key === "Escape") setEditingSettingKey(null);
                          }}
                          className="w-20 rounded border border-[#2962ff] bg-[#131722] px-1.5 py-0.5 font-mono text-[10px] text-[#f0f3fa] focus:outline-none"
                        />
                        <Button
                          onClick={() => commitEditSetting(s.key)}
                          className="rounded bg-[#2962ff] px-1.5 py-0.5 text-[9.5px] font-semibold text-white hover:bg-[#1e53e5]"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => setEditingSettingKey(null)}
                          className="rounded border border-[#2a2e39] bg-[#1e222d] px-1.5 py-0.5 text-[9.5px] text-[#9598a1] hover:text-white"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-[#f0f3fa]">{s.value}</span>
                        {s.locked ? (
                          <span className="rounded bg-[#089981]/18 px-1.5 py-0.5 text-[9px] text-[#089981]">
                            LOCKED
                          </span>
                        ) : (
                          <>
                            <Button
                              onClick={() => beginEditSetting(s)}
                              className="rounded border border-[#2a2e39] bg-[#131722] px-1.5 py-0.5 text-[9.5px] text-[#9598a1] hover:text-white"
                            >
                              Override
                            </Button>
                            {s.is_overridden && (
                              <Button
                                onClick={() => onResetSetting?.(s.key)}
                                className="rounded border border-[#2a2e39] bg-[#1e222d] px-1.5 py-0.5 text-[9.5px] text-[#d1d4dc] hover:bg-[#2a2e39]"
                              >
                                Reset
                              </Button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {exportedToml && (
            <pre
              data-testid="exported-workspace-toml"
              className="max-h-28 overflow-auto rounded-md border border-[#2a2e39] bg-[#131722] p-2 text-[9px] text-[#089981]"
            >
              {exportedToml}
            </pre>
          )}
        </TabsPanel>
      </Tabs>
    </section>
  );
}
