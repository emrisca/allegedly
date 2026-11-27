export type MarketProviderId =
  | "paper_sim"
  | "kraken_ws_v2"
  | "coinbase_ws"
  | "databento"
  | "polygon"
  | "rithmic"
  | "tradovate"
  | "projectx"
  | "ibkr"
  | "alpaca"
  | "dxfeed"
  | "cqg"
  | "binance"
  | "bybit"
  | "oanda";

export interface ProviderCredentialField {
  key: "apiKey" | "apiSecret" | "username" | "password" | "accountId" | "endpoint";
  label: string;
  placeholder: string;
  secret?: boolean;
  required?: boolean;
}

export interface MarketProviderMeta {
  id: MarketProviderId;
  name: string;
  shortTag: string;
  badgeColor: string;
  category: "builtin" | "subscription";
  requiresSubscription: boolean;
  subscriptionNote: string;
  assetClasses: readonly string[];
  /** Built-in live feed id if directly supported by the native WebSocket adapter */
  nativeFeedId?: "paper_sim" | "kraken_ws_v2" | "coinbase_ws";
  fields: readonly ProviderCredentialField[];
  docsUrl: string;
}

export interface StoredProviderConfig {
  enabled: boolean;
  apiKey?: string;
  apiSecret?: string;
  username?: string;
  password?: string;
  accountId?: string;
  endpoint?: string;
  savedAt?: number;
}

export type MarketProviderConfigMap = Partial<Record<MarketProviderId, StoredProviderConfig>>;

export const MARKET_DATA_PROVIDERS: readonly MarketProviderMeta[] = [
  {
    id: "paper_sim",
    name: "Paper Sim",
    shortTag: "SIM",
    badgeColor: "#475569",
    category: "builtin",
    requiresSubscription: false,
    subscriptionNote: "Built-in offline deterministic simulator — free, no network required.",
    assetClasses: ["Crypto", "Futures", "Stocks", "Forex", "Indices"],
    nativeFeedId: "paper_sim",
    fields: [],
    docsUrl: "",
  },
  {
    id: "kraken_ws_v2",
    name: "Kraken",
    shortTag: "KRAKEN",
    badgeColor: "#7c3aed",
    category: "builtin",
    requiresSubscription: false,
    subscriptionNote: "Free public WebSocket v2 + OHLC REST feed for spot crypto.",
    assetClasses: ["Crypto"],
    nativeFeedId: "kraken_ws_v2",
    fields: [],
    docsUrl: "https://docs.kraken.com/api/",
  },
  {
    id: "coinbase_ws",
    name: "Coinbase",
    shortTag: "COINBASE",
    badgeColor: "#2563eb",
    category: "builtin",
    requiresSubscription: false,
    subscriptionNote: "Free public Exchange WebSocket + candles REST feed for spot crypto.",
    assetClasses: ["Crypto"],
    nativeFeedId: "coinbase_ws",
    fields: [],
    docsUrl: "https://docs.cdp.coinbase.com/exchange/docs/welcome",
  },
  {
    id: "databento",
    name: "Databento",
    shortTag: "DATABENTO",
    badgeColor: "#0ea5e9",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires a Databento API key & CME/Nasdaq license for live L1/L2/MBO futures & equities.",
    assetClasses: ["Futures", "Stocks", "Options"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "db-xxxxxxxxxxxxxxxxxxxxxxxx", secret: true, required: true },
    ],
    docsUrl: "https://databento.com/docs",
  },
  {
    id: "polygon",
    name: "Polygon.io",
    shortTag: "POLYGON",
    badgeColor: "#6366f1",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires a Polygon.io Stocks / Options / Indices / Forex subscription plan.",
    assetClasses: ["Stocks", "Funds", "Indices", "Forex", "Options", "Crypto"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "poly_xxxxxxxxxxxxxxxx", secret: true, required: true },
    ],
    docsUrl: "https://polygon.io/docs",
  },
  {
    id: "rithmic",
    name: "Rithmic",
    shortTag: "RITHMIC",
    badgeColor: "#f59e0b",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires an active Rithmic / CME market data subscription (broker or prop firm).",
    assetClasses: ["Futures"],
    fields: [
      { key: "username", label: "Rithmic User ID", placeholder: "user@firm", required: true },
      { key: "password", label: "Password", placeholder: "••••••••", secret: true, required: true },
      { key: "endpoint", label: "System / Gateway", placeholder: "Rithmic Paper Trading / Chicago" },
    ],
    docsUrl: "https://www.rithmic.com/",
  },
  {
    id: "tradovate",
    name: "Tradovate",
    shortTag: "TRADOVATE",
    badgeColor: "#10b981",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires a Tradovate account with CME/CBOT/COMEX/NYMEX market data subscription.",
    assetClasses: ["Futures"],
    fields: [
      { key: "username", label: "Username", placeholder: "trader_id", required: true },
      { key: "apiKey", label: "API Key / CID", placeholder: "tv_cid_xxxx", secret: true, required: true },
      { key: "apiSecret", label: "API Secret", placeholder: "••••••••", secret: true },
    ],
    docsUrl: "https://api.tradovate.com/",
  },
  {
    id: "projectx",
    name: "ProjectX",
    shortTag: "PROJECTX",
    badgeColor: "#ec4899",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires a ProjectX / TopstepX gateway API key & CME feed access.",
    assetClasses: ["Futures"],
    fields: [
      { key: "username", label: "Username", placeholder: "prop_user", required: true },
      { key: "apiKey", label: "API Key", placeholder: "px_live_xxxx", secret: true, required: true },
    ],
    docsUrl: "https://projectx.com/",
  },
  {
    id: "ibkr",
    name: "Interactive Brokers",
    shortTag: "IBKR",
    badgeColor: "#dc2626",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires an IBKR account with exchange data bundles & local TWS / Client Portal Gateway.",
    assetClasses: ["Stocks", "Funds", "Futures", "Forex", "Indices", "Bonds", "Options"],
    fields: [
      { key: "accountId", label: "Account ID", placeholder: "U1234567", required: true },
      { key: "endpoint", label: "Gateway Host:Port", placeholder: "127.0.0.1:7497", required: true },
    ],
    docsUrl: "https://www.interactivebrokers.com/en/trading/ib-api.php",
  },
  {
    id: "alpaca",
    name: "Alpaca",
    shortTag: "ALPACA",
    badgeColor: "#eab308",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires Alpaca Market Data API Key & Secret (IEX free tier or SIP paid subscription).",
    assetClasses: ["Stocks", "Funds", "Crypto"],
    fields: [
      { key: "apiKey", label: "API Key ID", placeholder: "PKXXXXXXXXXXXXXXXX", secret: true, required: true },
      { key: "apiSecret", label: "Secret Key", placeholder: "••••••••••••••••", secret: true, required: true },
    ],
    docsUrl: "https://docs.alpaca.markets/",
  },
  {
    id: "dxfeed",
    name: "dxFeed",
    shortTag: "DXFEED",
    badgeColor: "#14b8a6",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires a dxFeed retail or institutional CME/OPRA/Equities subscription token.",
    assetClasses: ["Futures", "Stocks", "Indices", "Options"],
    fields: [
      { key: "apiKey", label: "Auth Token", placeholder: "dxf_token_xxxx", secret: true, required: true },
      { key: "endpoint", label: "DXLink URL", placeholder: "wss://demo.dxfeed.com/dxlink-ws" },
    ],
    docsUrl: "https://dxfeed.com/",
  },
  {
    id: "cqg",
    name: "CQG",
    shortTag: "CQG",
    badgeColor: "#0284c7",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires a CQG WebAPI subscription and futures brokerage credentials.",
    assetClasses: ["Futures", "Bonds"],
    fields: [
      { key: "username", label: "CQG Username", placeholder: "cqg_trader", required: true },
      { key: "password", label: "Password", placeholder: "••••••••", secret: true, required: true },
    ],
    docsUrl: "https://www.cqg.com/",
  },
  {
    id: "binance",
    name: "Binance",
    shortTag: "BINANCE",
    badgeColor: "#f59e0b",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Configure Binance API key (subject to regional availability) for spot & perpetual futures.",
    assetClasses: ["Crypto"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "binance_api_key", secret: true, required: true },
      { key: "apiSecret", label: "Secret Key", placeholder: "••••••••", secret: true },
    ],
    docsUrl: "https://developers.binance.com/",
  },
  {
    id: "bybit",
    name: "Bybit",
    shortTag: "BYBIT",
    badgeColor: "#f97316",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Configure Bybit API key for spot & perpetual crypto market data.",
    assetClasses: ["Crypto"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "bybit_api_key", secret: true, required: true },
      { key: "apiSecret", label: "API Secret", placeholder: "••••••••", secret: true },
    ],
    docsUrl: "https://bybit-exchange.github.io/docs/",
  },
  {
    id: "oanda",
    name: "OANDA",
    shortTag: "OANDA",
    badgeColor: "#22c55e",
    category: "subscription",
    requiresSubscription: true,
    subscriptionNote: "Requires an OANDA v20 trading account & Personal Access Token for live FX & CFDs.",
    assetClasses: ["Forex", "Indices", "Bonds"],
    fields: [
      { key: "accountId", label: "Account ID", placeholder: "101-001-XXXXXXX-001", required: true },
      { key: "apiKey", label: "API Token", placeholder: "oanda_token_xxxx", secret: true, required: true },
    ],
    docsUrl: "https://developer.oanda.com/",
  },
];

const PROVIDERS_STORAGE_KEY = "allegedly.market_providers.v1";

export function getMarketProviderMeta(id: MarketProviderId): MarketProviderMeta {
  return MARKET_DATA_PROVIDERS.find((p) => p.id === id) ?? MARKET_DATA_PROVIDERS[0];
}

export function isProviderConfigured(
  id: MarketProviderId,
  configs: MarketProviderConfigMap,
): boolean {
  const meta = getMarketProviderMeta(id);
  if (!meta.requiresSubscription) return true;
  const entry = configs[id];
  if (!entry || !entry.enabled) return false;
  return meta.fields
    .filter((f) => f.required)
    .every((f) => {
      const val = entry[f.key];
      return typeof val === "string" && val.trim().length > 0;
    });
}

export function loadStoredProviderConfigs(): MarketProviderConfigMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as MarketProviderConfigMap;
  } catch {
    return {};
  }
}

export function saveStoredProviderConfigs(next: MarketProviderConfigMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}
