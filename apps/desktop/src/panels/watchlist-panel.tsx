import { WATCHLIST_SYMBOLS } from "../data/symbols";

export interface WatchlistPanelProps {
  activeSymbol: string;
  livePrices: Record<string, { last: number; change: number; changePct: number }>;
  onSelectSymbol: (symbol: string) => void;
  onCollapse: () => void;
}

function formatPrice(val: number, decimals: number): string {
  return val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSigned(val: number, decimals: number): string {
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return val > 0 ? `+${abs}` : val < 0 ? `-${abs}` : abs;
}

export function WatchlistPanel({
  activeSymbol,
  livePrices,
  onSelectSymbol,
  onCollapse,
}: WatchlistPanelProps) {
  return (
    <section
      aria-label="Watchlist"
      className="flex h-full w-full flex-col bg-[#101217] text-xs text-[#e6e8ee] select-none"
    >
      {/* Header matching screenshot's Watchlist ▾ + icons */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#232733] px-3">
        <div className="flex items-center gap-1.5 font-semibold tracking-tight text-[#f1f3f8]">
          <span>Watchlist</span>
          <span className="text-[10px] text-[#868c9b]">▾</span>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse right sidebar"
          title="Collapse sidebar"
          className="flex h-6 w-6 items-center justify-center rounded text-[#8c93a4] hover:bg-[#1c202b] hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[1.35fr_1fr_0.8fr_0.8fr] items-center border-b border-[#1d202b] px-2.5 py-1.5 text-[11px] font-medium text-[#7b8294]">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">Chg</span>
        <span className="text-right">Chg%</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {WATCHLIST_SYMBOLS.map((item) => {
          const active = item.symbol === activeSymbol;
          const live = livePrices[item.symbol];
          const last = live?.last ?? item.basePrice;
          const change = live?.change ?? item.seedChange;
          const changePct = live?.changePct ?? item.seedChangePct;
          const isUp = change >= 0;
          const colorCls = isUp ? "text-[#26a69a]" : "text-[#ef5350]";

          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => onSelectSymbol(item.symbol)}
              className={
                active
                  ? "grid w-full grid-cols-[1.35fr_1fr_0.8fr_0.8fr] items-center border-b border-[#191c25] bg-[#1c202c] px-2.5 py-2 text-left transition-colors"
                  : "grid w-full grid-cols-[1.35fr_1fr_0.8fr_0.8fr] items-center border-b border-[#161922] px-2.5 py-2 text-left transition-colors hover:bg-[#161923]"
              }
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: item.badgeColor, color: item.badgeText }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                >
                  {item.shortLabel.slice(0, 3)}
                </span>
                <span className="truncate font-mono text-[11px] font-semibold text-[#e6e8ee]">
                  {item.symbol}
                </span>
                <span className="rounded bg-[#241f14] px-1 font-mono text-[8px] font-semibold text-amber-400">
                  S
                </span>
              </span>
              <span className={`truncate text-right font-mono text-[11px] tabular-nums ${colorCls}`}>
                {formatPrice(last, item.decimals)}
              </span>
              <span className={`truncate text-right font-mono text-[11px] tabular-nums ${colorCls}`}>
                {formatSigned(change, item.decimals > 1 ? 1 : 2)}
              </span>
              <span className={`truncate text-right font-mono text-[11px] tabular-nums ${colorCls}`}>
                {formatSigned(changePct, 2)}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Instrument Mini Summary Footer */}
      <div className="border-t border-[#232733] bg-[#0e1015] p-3">
        {(() => {
          const activeMeta =
            WATCHLIST_SYMBOLS.find((w) => w.symbol === activeSymbol) ?? WATCHLIST_SYMBOLS[0];
          const live = livePrices[activeSymbol];
          const last = live?.last ?? activeMeta.basePrice;
          const change = live?.change ?? activeMeta.seedChange;
          const changePct = live?.changePct ?? activeMeta.seedChangePct;
          const isUp = change >= 0;
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#f1f3f8]">
                  {activeMeta.symbol}
                </span>
                <span className="rounded bg-[#191d27] px-1.5 py-0.5 font-mono text-[10px] text-[#868c9b]">
                  {activeMeta.exchange}
                </span>
              </div>
              <div className="truncate text-[11px] text-[#868c9b]">{activeMeta.name}</div>
              <div className="flex items-baseline gap-2 pt-1 font-mono tabular-nums">
                <span className="text-base font-semibold text-[#f1f3f8]">
                  {formatPrice(last, activeMeta.decimals)}
                </span>
                <span className={`text-[11px] ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                  {formatSigned(change, 2)} ({formatSigned(changePct, 2)}%)
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
