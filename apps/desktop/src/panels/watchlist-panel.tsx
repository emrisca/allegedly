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
      className="flex h-full w-full flex-col bg-[#131722] text-xs text-[#d1d4dc] select-none"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#2a2e39] px-3">
        <span className="text-[13px] font-semibold text-white">Watchlist</span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse right sidebar"
          title="Collapse sidebar"
          className="flex h-6 w-6 items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-[1.35fr_1fr_0.8fr_0.8fr] items-center border-b border-[#2a2e39] px-3 py-1.5 text-[11px] font-medium text-[#787b86]">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">Chg</span>
        <span className="text-right">Chg%</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {WATCHLIST_SYMBOLS.map((item) => {
          const active = item.symbol === activeSymbol;
          const live = livePrices[item.symbol];
          const last = live?.last ?? item.basePrice;
          const change = live?.change ?? item.seedChange;
          const changePct = live?.changePct ?? item.seedChangePct;
          const isUp = change >= 0;
          const colorCls = isUp ? "text-[#089981]" : "text-[#f23645]";

          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => onSelectSymbol(item.symbol)}
              className={
                active
                  ? "grid w-full grid-cols-[1.35fr_1fr_0.8fr_0.8fr] items-center bg-[#2962ff]/12 px-3 py-2 text-left transition-colors"
                  : "grid w-full grid-cols-[1.35fr_1fr_0.8fr_0.8fr] items-center px-3 py-2 text-left transition-colors hover:bg-[#1e222d]"
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: item.badgeColor, color: item.badgeText }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                >
                  {item.shortLabel.slice(0, 2)}
                </span>
                <span className={`truncate text-[12px] font-medium ${active ? "text-white" : "text-[#d1d4dc]"}`}>
                  {item.symbol}
                </span>
              </span>
              <span className={`truncate text-right text-[12px] tabular-nums ${colorCls}`}>
                {formatPrice(last, item.decimals)}
              </span>
              <span className={`truncate text-right text-[11px] tabular-nums ${colorCls}`}>
                {formatSigned(change, item.decimals > 1 ? 1 : 2)}
              </span>
              <span className={`truncate text-right text-[11px] tabular-nums ${colorCls}`}>
                {formatSigned(changePct, 2)}%
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-[#2a2e39] bg-[#131722] p-3">
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
                <span className="text-[13px] font-semibold text-white">
                  {activeMeta.symbol}
                </span>
                <span className="text-[11px] text-[#787b86]">
                  {activeMeta.exchange}
                </span>
              </div>
              <div className="truncate text-[11px] text-[#787b86]">{activeMeta.name}</div>
              <div className="flex items-baseline gap-2 pt-1 tabular-nums">
                <span className="text-[18px] font-semibold text-white">
                  {formatPrice(last, activeMeta.decimals)}
                </span>
                <span className={`text-[12px] font-medium ${isUp ? "text-[#089981]" : "text-[#f23645]"}`}>
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
