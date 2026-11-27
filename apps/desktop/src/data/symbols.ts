export interface SymbolMeta {
  symbol: string;
  shortLabel: string;
  name: string;
  exchange: string;
  badgeColor: string;
  badgeText: string;
  basePrice: number;
  tickSizeE9: bigint;
  decimals: number;
  seedChange: number;
  seedChangePct: number;
  delayedLabel?: string;
  supportsLive?: boolean;
}

export const WATCHLIST_SYMBOLS: readonly SymbolMeta[] = [
  {
    symbol: "BTC/USD",
    shortLabel: "₿",
    name: "Bitcoin / US Dollar",
    exchange: "SPOT",
    badgeColor: "#f59e0b",
    badgeText: "#0c0d11",
    basePrice: 95_000.0,
    tickSizeE9: 500_000_000n, // $0.50
    decimals: 2,
    seedChange: 1_240.5,
    seedChangePct: 1.32,
    supportsLive: true,
  },
  {
    symbol: "ETH/USD",
    shortLabel: "Ξ",
    name: "Ethereum / US Dollar",
    exchange: "SPOT",
    badgeColor: "#6366f1",
    badgeText: "#ffffff",
    basePrice: 3_400.0,
    tickSizeE9: 100_000_000n, // $0.10
    decimals: 2,
    seedChange: 48.2,
    seedChangePct: 1.44,
    supportsLive: true,
  },
  {
    symbol: "SOL/USD",
    shortLabel: "S",
    name: "Solana / US Dollar",
    exchange: "SPOT",
    badgeColor: "#14b8a6",
    badgeText: "#0c0d11",
    basePrice: 185.0,
    tickSizeE9: 10_000_000n, // $0.01
    decimals: 2,
    seedChange: 4.15,
    seedChangePct: 2.29,
    supportsLive: true,
  },
  {
    symbol: "NQ1!",
    shortLabel: "100",
    name: "NASDAQ 100 E-mini Futures",
    exchange: "CME · SIM",
    badgeColor: "#0284c7",
    badgeText: "#ffffff",
    basePrice: 25_756.0,
    tickSizeE9: 250_000_000n, // $0.25
    decimals: 2,
    seedChange: -518.5,
    seedChangePct: -1.98,
    delayedLabel: "Paper Sim",
  },
  {
    symbol: "MNQ1!",
    shortLabel: "100",
    name: "Micro E-mini Nasdaq-100",
    exchange: "CME · SIM",
    badgeColor: "#0ea5e9",
    badgeText: "#ffffff",
    basePrice: 25_754.25,
    tickSizeE9: 250_000_000n,
    decimals: 2,
    seedChange: -515.0,
    seedChangePct: -1.96,
    delayedLabel: "Paper Sim",
  },
  {
    symbol: "ES1!",
    shortLabel: "500",
    name: "E-mini S&P 500 Futures",
    exchange: "CME · SIM",
    badgeColor: "#dc2626",
    badgeText: "#ffffff",
    basePrice: 7_142.5,
    tickSizeE9: 250_000_000n,
    decimals: 2,
    seedChange: -69.25,
    seedChangePct: -0.96,
    delayedLabel: "Paper Sim",
  },
  {
    symbol: "GC1!",
    shortLabel: "Au",
    name: "Gold Futures",
    exchange: "COMEX · SIM",
    badgeColor: "#d97706",
    badgeText: "#ffffff",
    basePrice: 3_524.8,
    tickSizeE9: 100_000_000n, // $0.10
    decimals: 2,
    seedChange: -32.4,
    seedChangePct: -0.91,
    delayedLabel: "Paper Sim",
  },
  {
    symbol: "CL1!",
    shortLabel: "CL",
    name: "WTI Crude Oil Futures",
    exchange: "NYMEX · SIM",
    badgeColor: "#334155",
    badgeText: "#ffffff",
    basePrice: 83.74,
    tickSizeE9: 10_000_000n, // $0.01
    decimals: 2,
    seedChange: 1.68,
    seedChangePct: 2.05,
    delayedLabel: "Paper Sim",
  },
  {
    symbol: "VIX",
    shortLabel: "V",
    name: "CBOE Volatility Index",
    exchange: "CBOE · SIM",
    badgeColor: "#16a34a",
    badgeText: "#ffffff",
    basePrice: 28.52,
    tickSizeE9: 10_000_000n,
    decimals: 2,
    seedChange: 2.14,
    seedChangePct: 8.11,
    delayedLabel: "Paper Sim",
  },
];

export function getSymbolMeta(symbol: string): SymbolMeta {
  return (
    WATCHLIST_SYMBOLS.find((m) => m.symbol === symbol) ?? {
      symbol,
      shortLabel: symbol.slice(0, 2).toUpperCase(),
      name: symbol,
      exchange: "SIM",
      badgeColor: "#3b82f6",
      badgeText: "#ffffff",
      basePrice: 95_000,
      tickSizeE9: 500_000_000n,
      decimals: 2,
      seedChange: 0,
      seedChangePct: 0,
      delayedLabel: "Paper Sim",
    }
  );
}
