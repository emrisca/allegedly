import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import {
  getMarketProviderMeta,
  isProviderConfigured,
  type MarketProviderConfigMap,
  type MarketProviderId,
} from "@allegedly/ui-chrome";
import {
  SYMBOL_CATALOG,
  type SymbolAssetClass,
  type SymbolMeta,
} from "../data/symbols";

export type SymbolSearchMode = "switch" | "watchlist";

export interface SymbolSearchDialogProps {
  open: boolean;
  initialQuery?: string;
  mode?: SymbolSearchMode;
  watchlistSymbols: readonly string[];
  providerConfigs: MarketProviderConfigMap;
  onOpenChange: (open: boolean) => void;
  onSelectSymbol: (symbol: string, providerId: MarketProviderId) => void;
  onToggleWatchlist: (symbol: string, providerId: MarketProviderId) => void;
  onConfigureProvider: (providerId: MarketProviderId) => void;
}

const CATEGORIES: readonly ("All" | SymbolAssetClass)[] = [
  "All",
  "Stocks",
  "Funds",
  "Futures",
  "Forex",
  "Crypto",
  "Indices",
  "Bonds",
  "Options",
];

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toUpperCase().indexOf(q.toUpperCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[#5b9cf6]">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

export function SymbolSearchDialog({
  open,
  initialQuery = "",
  mode = "switch",
  watchlistSymbols,
  providerConfigs,
  onOpenChange,
  onSelectSymbol,
  onToggleWatchlist,
  onConfigureProvider,
}: SymbolSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<"All" | SymbolAssetClass>("All");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [subPrompt, setSubPrompt] = useState<{
    symbol: string;
    providerId: MarketProviderId;
    addToWatchlistOnly: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setCategory("All");
      setSelectedIndex(0);
      setExpandedSymbol(null);
      setSubPrompt(null);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    }
  }, [open, initialQuery]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SYMBOL_CATALOG.filter((item) => {
      if (category !== "All" && item.assetClass !== category) return false;
      if (!q) return true;
      if (item.symbol.toLowerCase().includes(q)) return true;
      if (item.name.toLowerCase().includes(q)) return true;
      if (item.exchange.toLowerCase().includes(q)) return true;
      if (item.assetClass.toLowerCase().includes(q)) return true;
      return item.providers.some((p) => {
        const pm = getMarketProviderMeta(p.providerId);
        return (
          pm.name.toLowerCase().includes(q) ||
          pm.shortTag.toLowerCase().includes(q) ||
          p.exchange.toLowerCase().includes(q)
        );
      });
    });
  }, [query, category]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, category]);

  const handleActivate = (
    item: SymbolMeta,
    providerId: MarketProviderId,
    addToWatchlistOnly = false,
  ) => {
    const prov = getMarketProviderMeta(providerId);
    const ready = isProviderConfigured(providerId, providerConfigs);
    if (prov.requiresSubscription && !ready) {
      setSubPrompt({
        symbol: item.symbol,
        providerId,
        addToWatchlistOnly,
      });
      return;
    }
    if (addToWatchlistOnly || mode === "watchlist") {
      onToggleWatchlist(item.symbol, providerId);
      if (mode === "watchlist") return;
    }
    onSelectSymbol(item.symbol, providerId);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (subPrompt) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSubPrompt(null);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(Math.max(0, filtered.length - 1), prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      const row = filtered[selectedIndex];
      handleActivate(row, row.defaultProvider, mode === "watchlist");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />
      <DialogContent
        onKeyDown={handleKeyDown}
        className="fixed left-1/2 top-[10vh] z-50 flex max-h-[78vh] w-[min(760px,94vw)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#14161c)] text-[#d1d4dc] shadow-[0_28px_72px_rgba(0,0,0,0.78)]"
      >
        <DialogTitle className="sr-only">
          {mode === "watchlist" ? "Add Symbol to Watchlist" : "Symbol Search"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Search symbols across Crypto, Futures, Stocks, ETFs, Forex, Indices, Bonds, and Options with market data provider selection.
        </DialogDescription>

        {/* Search Input Row */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--app-border,#262a34)] px-4">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-[18px] w-[18px] shrink-0 text-[#868993]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.8 3.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search symbol or provider"
            placeholder={
              mode === "watchlist"
                ? "Add symbol to watchlist (e.g. NQ1!, NVDA, BTC/USD)..."
                : "Search symbol, company, or provider (e.g. MNQ, NVDA, Kraken, CME)..."
            }
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-[#f0f3fa] placeholder:text-[#6c717e] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="rounded px-2 py-1 text-[12px] font-medium text-[#9598a1] hover:bg-[#232733] hover:text-white"
            >
              Clear
            </button>
          )}
          <span className="h-5 w-px bg-[var(--app-border,#262a34)]" aria-hidden="true" />
          <button
            type="button"
            aria-label="Close symbol search"
            onClick={() => onOpenChange(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#868993] hover:bg-[#232733] hover:text-white"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Asset Category Filter Pills */}
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--app-border,#23262f)] px-4 py-2.5">
          {category !== "All" ? (
            <>
              <button
                type="button"
                onClick={() => setCategory("All")}
                className="flex items-center gap-1.5 rounded-full bg-[#2962ff] px-3 py-1 text-[12px] font-semibold text-white"
              >
                <span>{category}</span>
                <span aria-hidden="true" className="text-[11px] opacity-85">×</span>
              </button>
              <span className="mx-1 h-4 w-px bg-[var(--app-border,#2c303a)]" aria-hidden="true" />
              {CATEGORIES.filter((c) => c !== "All" && c !== category).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className="shrink-0 rounded-full border border-[var(--app-border,#2a2e39)] bg-[#1c202a] px-3 py-1 text-[12px] font-medium text-[#b2b5be] hover:bg-[#262b38] hover:text-white"
                >
                  {cat}
                </button>
              ))}
            </>
          ) : (
            CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={
                    active
                      ? "shrink-0 rounded-full bg-[#2962ff] px-3 py-1 text-[12px] font-semibold text-white"
                      : "shrink-0 rounded-full border border-[var(--app-border,#2a2e39)] bg-[#1c202a] px-3 py-1 text-[12px] font-medium text-[#b2b5be] hover:bg-[#262b38] hover:text-white"
                  }
                >
                  {cat}
                </button>
              );
            })
          )}
        </div>

        {/* Subscription Required Inline Modal Banner */}
        {subPrompt && (() => {
          const prov = getMarketProviderMeta(subPrompt.providerId);
          return (
            <div
              role="alertdialog"
              aria-label="Subscription required"
              className="mx-4 mt-3 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-[#1c1a14] p-3.5 text-[12px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
                      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
                    </svg>
                    <span>
                      {prov.name} subscription / API key required for live {subPrompt.symbol}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#d1c7b0]">
                    {prov.subscriptionNote}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss subscription notice"
                  onClick={() => setSubPrompt(null)}
                  className="text-[#9598a1] hover:text-white"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const pid = subPrompt.providerId;
                    setSubPrompt(null);
                    onOpenChange(false);
                    onConfigureProvider(pid);
                  }}
                  className="h-8 rounded-md bg-[#2962ff] px-3.5 text-[12px] font-semibold text-white hover:bg-[#1e53e5]"
                >
                  Configure {prov.name} Key
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sym = subPrompt.symbol;
                    const wlOnly = subPrompt.addToWatchlistOnly;
                    setSubPrompt(null);
                    if (wlOnly || mode === "watchlist") {
                      onToggleWatchlist(sym, "paper_sim");
                    }
                    if (!wlOnly && mode !== "watchlist") {
                      onSelectSymbol(sym, "paper_sim");
                      onOpenChange(false);
                    }
                  }}
                  className="h-8 rounded-md border border-[#363a45] bg-[#1e222d] px-3.5 text-[12px] font-medium text-[#e6e8ee] hover:bg-[#2a2e39] hover:text-white"
                >
                  Open in Paper Sim (Free)
                </button>
              </div>
            </div>
          );
        })()}

        {/* Results List */}
        <div className="min-h-[260px] flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-1.5 text-center">
              <div className="text-[13px] font-medium text-[#b2b5be]">
                No symbols match "{query}"
              </div>
              <div className="text-[11px] text-[#787b86]">
                Try BTC, NQ1!, MNQ1!, ES1!, NVDA, AAPL, SPY, EUR/USD, Kraken, CME, or Polygon
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const inWatchlist = watchlistSymbols.includes(item.symbol);
                const primaryOpt = item.providers[0];
                const primaryProv = getMarketProviderMeta(primaryOpt.providerId);
                const primaryConfigured = isProviderConfigured(primaryOpt.providerId, providerConfigs);
                const extraCount = Math.max(0, item.providers.length - 1);
                const isExpanded = expandedSymbol === item.symbol;

                return (
                  <div
                    key={item.symbol}
                    className={
                      isSelected
                        ? "rounded-xl bg-[#222734]"
                        : "rounded-xl hover:bg-[#1c202b]"
                    }
                  >
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <button
                        type="button"
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => handleActivate(item, primaryOpt.providerId, false)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          aria-hidden="true"
                          style={{ backgroundColor: item.badgeColor, color: item.badgeText }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        >
                          {item.shortLabel.slice(0, 3)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold text-[#f0f3fa]">
                              <HighlightMatch text={item.symbol} query={query} />
                            </span>
                            <span className="rounded bg-[#262b38] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-[#9aa1b2]">
                              {item.assetBadge}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-[#868993]">
                            <HighlightMatch text={item.name} query={query} />
                          </div>
                        </div>
                      </button>

                      {/* Right Cluster: Provider + Subscription Badge + Multi-provider Expander + Watchlist + */}
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-[#b2b5be]">
                            {primaryOpt.exchange}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/95"
                            style={{ backgroundColor: `${primaryProv.badgeColor}33`, color: "#e6e8ee", border: `1px solid ${primaryProv.badgeColor}66` }}
                          >
                            {primaryProv.shortTag}
                          </span>
                          {primaryProv.requiresSubscription && !primaryConfigured ? (
                            <span
                              title="Subscription or API key required"
                              className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300"
                            >
                              Sub
                            </span>
                          ) : (
                            <span
                              title={primaryProv.requiresSubscription ? "Provider configured" : "Free built-in feed"}
                              className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400"
                            >
                              {primaryProv.requiresSubscription ? "Ready" : "Free"}
                            </span>
                          )}
                        </div>

                        {extraCount > 0 && (
                          <button
                            type="button"
                            aria-label={`Show ${extraCount} more providers for ${item.symbol}`}
                            aria-expanded={isExpanded}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedSymbol((curr) => (curr === item.symbol ? null : item.symbol));
                            }}
                            className="flex h-6 items-center gap-0.5 rounded-full border border-[#343946] bg-[#1a1e28] px-2 text-[11px] font-medium text-[#d1d4dc] hover:border-[#4b5263] hover:text-white"
                          >
                            <span>+{extraCount}</span>
                            <span className="text-[9px]">{isExpanded ? "▴" : "▾"}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                          aria-label={inWatchlist ? `Remove ${item.symbol} from watchlist` : `Add ${item.symbol} to watchlist`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWatchlist(item.symbol, primaryOpt.providerId);
                          }}
                          className={
                            inWatchlist
                              ? "flex h-7 w-7 items-center justify-center rounded-md bg-[#2962ff]/20 text-[#5b9cf6] hover:bg-[#2962ff]/30"
                              : "flex h-7 w-7 items-center justify-center rounded-md text-[#868993] hover:bg-[#2a2e39] hover:text-white"
                          }
                        >
                          {inWatchlist ? (
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Multi-Provider Picker */}
                    {isExpanded && (
                      <div className="border-t border-[#262b38] bg-[#11141b]/80 px-3 py-2">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                          Available Providers for {item.symbol}
                        </div>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {item.providers.map((opt) => {
                            const pm = getMarketProviderMeta(opt.providerId);
                            const ready = isProviderConfigured(opt.providerId, providerConfigs);
                            return (
                              <button
                                key={opt.providerId}
                                type="button"
                                onClick={() => handleActivate(item, opt.providerId, false)}
                                className="flex items-center justify-between gap-2 rounded-lg border border-[#262a34] bg-[#171a22] px-2.5 py-1.5 text-left hover:border-[#3c4355] hover:bg-[#1e222d]"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: pm.badgeColor }}
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate text-[12px] font-medium text-[#f0f3fa]">
                                      {pm.name}
                                    </div>
                                    <div className="truncate text-[10px] text-[#787b86]">
                                      {opt.exchange}{opt.feedSymbol ? ` · ${opt.feedSymbol}` : ""}
                                    </div>
                                  </div>
                                </div>
                                {pm.requiresSubscription && !ready ? (
                                  <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                                    Sub req
                                  </span>
                                ) : (
                                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                                    {pm.requiresSubscription ? "Connected" : "Free"}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Hints */}
        <div className="flex h-9 shrink-0 items-center justify-between border-t border-[var(--app-border,#23262f)] bg-[var(--app-panel-bg,#101218)] px-4 text-[11px] text-[#787b86]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onConfigureProvider("databento");
            }}
            className="font-medium text-[#5b9cf6] hover:text-white"
          >
            Manage Data Providers &amp; API Keys →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
