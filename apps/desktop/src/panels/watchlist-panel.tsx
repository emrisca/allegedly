import { useMemo, useState } from "react";
import {
  getMarketProviderMeta,
  isProviderConfigured,
  type MarketProviderConfigMap,
  type MarketProviderId,
} from "@allegedly/ui-chrome";
import { getSymbolMeta } from "../data/symbols";

export interface WatchlistPriceSample {
  last: number;
  change: number;
  changePct: number;
}

export interface WatchlistItemEntry {
  symbol: string;
  providerId: MarketProviderId;
  flag?: "red" | "blue" | "green" | "orange" | null;
}

export interface WatchlistPanelProps {
  items: readonly WatchlistItemEntry[];
  activeSymbol: string;
  activeProviderId?: MarketProviderId;
  livePrices: Record<string, WatchlistPriceSample>;
  providerConfigs: MarketProviderConfigMap;
  onSelectSymbol: (symbol: string, providerId: MarketProviderId) => void;
  onAddSymbolClick: () => void;
  onRemoveSymbol: (symbol: string) => void;
  onCycleFlag: (symbol: string) => void;
  onConfigureProvider: (providerId: MarketProviderId) => void;
  onCollapse: () => void;
}

const FLAG_COLORS: Record<NonNullable<WatchlistItemEntry["flag"]>, string> = {
  red: "#f23645",
  blue: "#2962ff",
  green: "#089981",
  orange: "#f59e0b",
};

function formatPrice(val: number, decimals: number): string {
  return val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSigned(val: number, decimals: number, suffix = ""): string {
  if (!Number.isFinite(val)) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${val >= 0 ? "+" : "−"}${abs}${suffix}`;
}

export function WatchlistPanel({
  items,
  activeSymbol,
  activeProviderId,
  livePrices,
  providerConfigs,
  onSelectSymbol,
  onAddSymbolClick,
  onRemoveSymbol,
  onCycleFlag,
  onConfigureProvider,
  onCollapse,
}: WatchlistPanelProps) {
  const [sortMode, setSortMode] = useState<"default" | "pct_desc" | "pct_asc" | "flagged">("default");
  const [menuOpen, setMenuOpen] = useState(false);

  const sortedItems = useMemo(() => {
    const arr = [...items];
    if (sortMode === "default") return arr;
    if (sortMode === "flagged") {
      return arr.sort((a, b) => Number(Boolean(b.flag)) - Number(Boolean(a.flag)));
    }
    return arr.sort((a, b) => {
      const ma = getSymbolMeta(a.symbol);
      const mb = getSymbolMeta(b.symbol);
      const pa = livePrices[a.symbol]?.changePct ?? ma.seedChangePct;
      const pb = livePrices[b.symbol]?.changePct ?? mb.seedChangePct;
      return sortMode === "pct_desc" ? pb - pa : pa - pb;
    });
  }, [items, sortMode, livePrices]);

  const activeEntry =
    items.find((it) => it.symbol === activeSymbol) ??
    items[0] ?? {
      symbol: activeSymbol,
      providerId: activeProviderId ?? "paper_sim",
    };
  const activeMeta = getSymbolMeta(activeEntry.symbol);
  const activeProv = getMarketProviderMeta(activeProviderId ?? activeEntry.providerId);
  const activeProvReady = isProviderConfigured(activeProv.id, providerConfigs);
  const activeLive = livePrices[activeMeta.symbol];
  const activeLast = activeLive?.last ?? activeMeta.basePrice;
  const activeChange = activeLive?.change ?? activeMeta.seedChange;
  const activeChangePct = activeLive?.changePct ?? activeMeta.seedChangePct;
  const activeIsUp = activeChange >= 0;

  return (
    <section
      aria-label="Watchlist"
      className="flex h-full flex-col bg-[var(--app-panel-bg,#12141a)] text-[#d1d4dc]"
    >
      {/* TradingView-style Watchlist Header */}
      <div className="relative flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#f0f3fa]">
            Watchlist
          </span>
          <span className="px-0.5 text-[10px] tabular-nums text-[#6b7280]">
            {items.length}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Add symbol to watchlist (or start typing anywhere)"
            aria-label="Add symbol to watchlist"
            onClick={onAddSymbolClick}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#8b8f9c] hover:bg-white/[0.06] hover:text-[#f4f4f5] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
          </button>

          <button
            type="button"
            title="Watchlist sort & options"
            aria-label="Watchlist options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#8b8f9c] hover:bg-white/[0.06] hover:text-[#f4f4f5] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <circle cx="3.5" cy="8" r="1.1" />
              <circle cx="8" cy="8" r="1.1" />
              <circle cx="12.5" cy="8" r="1.1" />
            </svg>
          </button>

          <button
            type="button"
            title="Collapse watchlist"
            aria-label="Collapse right sidebar"
            onClick={onCollapse}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#8b8f9c] hover:bg-white/[0.06] hover:text-[#f4f4f5] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Watchlist sort options"
            className="absolute right-2 top-11 z-40 w-44 rounded-[6px] border border-white/[0.10] bg-[var(--app-surface-bg,#16181f)] p-1 text-[12px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          >
            {(
              [
                ["default", "Custom Order"],
                ["flagged", "Flagged First"],
                ["pct_desc", "Top Gainers (%)"],
                ["pct_asc", "Top Losers (%)"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={sortMode === id}
                onClick={() => {
                  setSortMode(id);
                  setMenuOpen(false);
                }}
                className={
                  sortMode === id
                    ? "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left font-medium text-white bg-white/[0.10]"
                    : "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[#d1d4dc] hover:bg-white/[0.06]"
                }
              >
                <span>{label}</span>
                {sortMode === id && <span className="text-[10px] text-[#e4e4e7]">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[minmax(116px,1.5fr)_minmax(62px,0.9fr)_minmax(50px,0.75fr)_minmax(50px,0.75fr)] items-center border-b border-[var(--app-border,#2a2e39)]/70 px-2.5 py-2 text-[10px] font-medium text-[#787b86]">
        <span className="pl-3.5">Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">Chg</span>
        <span className="text-right">Chg%</span>
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {sortedItems.map((entry) => {
          const item = getSymbolMeta(entry.symbol);
          const prov = getMarketProviderMeta(entry.providerId);
          const provReady = isProviderConfigured(entry.providerId, providerConfigs);
          const needsSub = prov.requiresSubscription && !provReady;
          const active = item.symbol === activeSymbol;
          const live = livePrices[item.symbol];
          const last = live?.last ?? item.basePrice;
          const change = live?.change ?? item.seedChange;
          const changePct = live?.changePct ?? item.seedChangePct;
          const isUp = change >= 0;
          const colorCls = isUp ? "text-[#089981]" : "text-[#f23645]";
          const flagHex = entry.flag ? FLAG_COLORS[entry.flag] : null;

          return (
            <div
              key={item.symbol}
              className={
                active
                  ? "group relative mx-1 my-px rounded-md border border-white/[0.10] bg-white/[0.05] transition-colors"
                  : "group relative mx-1 my-px rounded-md border border-transparent transition-colors hover:bg-white/[0.04]"
              }
            >
              {/* Color Flag Ribbon */}
              <button
                type="button"
                title={entry.flag ? "Change or clear flag" : "Flag symbol"}
                aria-label={`Flag ${item.symbol}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCycleFlag(item.symbol);
                }}
                className="absolute left-0 top-1/2 z-10 flex h-5 w-3 -translate-y-1/2 items-center justify-start opacity-75 transition-opacity hover:opacity-100"
              >
                <span
                  className={flagHex ? "block h-3 w-2 rounded-r-sm" : "block h-3 w-1.5 rounded-r-sm bg-transparent group-hover:bg-white/[0.16]"}
                  style={flagHex ? { backgroundColor: flagHex } : undefined}
                />
              </button>

              <button
                type="button"
                onClick={() => onSelectSymbol(item.symbol, entry.providerId)}
                className="grid w-full grid-cols-[minmax(116px,1.5fr)_minmax(62px,0.9fr)_minmax(50px,0.75fr)_minmax(50px,0.75fr)] items-center py-1.5 pl-3 pr-2 text-left"
              >
                <span className="flex min-w-0 items-center gap-1.5 pr-1">
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: item.badgeColor, color: item.badgeText }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                  >
                    {item.shortLabel.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className={`truncate text-[11.5px] font-semibold leading-tight ${active ? "text-white" : "text-[#e1e4eb]"}`}>
                        {item.symbol}
                      </span>
                      {needsSub && (
                        <span
                          title={`${prov.name} subscription required for live data`}
                          className="shrink-0 text-[9px] font-bold text-amber-400"
                        >
                          D
                        </span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-[9px] uppercase tracking-tight text-[#787b86]">
                      {prov.shortTag}
                    </span>
                  </span>
                </span>

                <span className={`truncate text-right font-mono text-[11px] tabular-nums ${colorCls}`}>
                  {formatPrice(last, item.decimals)}
                </span>
                <span className={`truncate text-right font-mono text-[10.5px] tabular-nums ${colorCls}`}>
                  {formatSigned(change, item.decimals > 1 ? 1 : 2)}
                </span>
                <span className={`truncate text-right font-mono text-[10.5px] tabular-nums group-hover:opacity-0 ${colorCls}`}>
                  {formatSigned(changePct, 2, "%")}
                </span>
              </button>

              {/* Hover Remove Trash Icon (matches TradingView screenshot) */}
              {items.length > 1 && (
                <button
                  type="button"
                  title={`Remove ${item.symbol} from watchlist`}
                  aria-label={`Remove ${item.symbol} from watchlist`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSymbol(item.symbol);
                  }}
                  className="absolute right-1.5 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded bg-[var(--app-surface-bg,#1e222d)] text-[#868993] hover:text-[#f23645] group-hover:flex"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M3 4.5h10M6 4.5V3h4v1.5M5 4.5l.6 8.5h4.8L11 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Symbol Detail Footer */}
      <div className="border-t border-[var(--app-border,#2a2e39)] bg-[var(--app-panel-bg,#131722)] p-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-white">
                {activeMeta.symbol}
              </span>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[#e6e8ee]"
                style={{
                  backgroundColor: `${activeProv.badgeColor}33`,
                  border: `1px solid ${activeProv.badgeColor}66`,
                }}
              >
                {activeProv.shortTag}
              </span>
            </div>
            <span className="shrink-0 text-[10.5px] text-[#787b86]">
              {activeMeta.exchange}
            </span>
          </div>
          <div className="truncate text-[11px] text-[#868993]">{activeMeta.name}</div>
          <div className="flex items-baseline gap-2 pt-1 tabular-nums">
            <span className="font-mono text-[18px] font-semibold text-white">
              {formatPrice(activeLast, activeMeta.decimals)}
            </span>
            <span className={`font-mono text-[11.5px] font-medium ${activeIsUp ? "text-[#089981]" : "text-[#f23645]"}`}>
              {formatSigned(activeChange, 2)} ({formatSigned(activeChangePct, 2, "%")})
            </span>
          </div>

          {activeProv.requiresSubscription && !activeProvReady && (
            <button
              type="button"
              onClick={() => onConfigureProvider(activeProv.id)}
              className="mt-1.5 flex w-full items-center justify-between rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-left text-[10.5px] text-amber-300 hover:bg-amber-500/18"
            >
              <span>{activeProv.name} subscription required</span>
              <span className="font-semibold text-amber-200">Configure →</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
