export interface BootConfig {
  /** SV-01 / RT3-02: MUST be false by default for zero-packet offline boot. */
  updates_check_on_startup: boolean;
  /** ADR-0009: MUST be false by default at boot. */
  live_armed: boolean;
  offline_mode: boolean;
}

export interface WorkspaceState {
  state_rev: number;
  link_group_symbols: Record<string, string>;
  active_theme: string;
  live_armed: boolean;
  selected_object_id: string | null;
}

export interface WorkspacePatch {
  observed_rev: number;
  set_link_symbol?: [string, string] | null;
  set_theme?: string | null;
  set_selected_object?: string | null;
}

export interface WorkspacePatchResult {
  accepted: boolean;
  current_rev: number;
}

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type PaperOrderStatus = "working" | "filled" | "canceled";

export interface PaperOrderRequest {
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  qty_e9: string;
  limit_price_e9?: string;
}

export interface PaperOrderTicket {
  order_id: string;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  qty_e9: string;
  limit_price_e9: string | null;
  fill_price_e9: string | null;
  status: PaperOrderStatus;
  created_ms: number;
}

export interface PaperAccountSnapshot {
  mode: "PAPER / SIM";
  live_armed: false;
  net_position_e9: Record<string, string>;
  orders: PaperOrderTicket[];
}

export type BuiltinStudyKind =
  | "sma"
  | "ema"
  | "wilder_rsi"
  | "vwap"
  | "cvd"
  | "footprint_delta";

export interface StudyRunRequest {
  id: string;
  builtin?: BuiltinStudyKind | null;
  period?: number | null;
  luau_script?: string | null;
  closes: number[];
  volumes?: number[];
  buy_volumes?: number[];
  sell_volumes?: number[];
}

export interface StudyRunResponse {
  id: string;
  label: string;
  overlay: boolean;
  values: Array<number | null>;
  memory_pool_reserved_bytes: number;
  memory_pool_peak_bytes?: number;
  memory_pool_cap_bytes: number;
}

export type ReplaySpeed = "1x" | "5x" | "50x" | "max";

export type ReplayControlAction =
  | { action: "play" }
  | { action: "pause" }
  | { action: "step" }
  | { action: "seek"; cursor: number }
  | { action: "set_speed"; speed: ReplaySpeed }
  | { action: "reset" }
  | { action: "verify_determinism" };

export interface ReplayStatusSnapshot {
  playing: boolean;
  speed: ReplaySpeed;
  cursor: number;
  total_ticks: number;
  bars_sealed: number;
  final_vwap_e9: string | null;
  sha256_hex: string;
  determinism_verified: boolean;
}

export type ConfigLayerKind = "defaults" | "global" | "workspace" | "template" | "instance";

export interface ResolvedSetting {
  key: string;
  value: string;
  source_layer: ConfigLayerKind;
  inherited_value: string | null;
  is_overridden: boolean;
  locked: boolean;
}


export type MarketDataSourceId = "paper_sim" | "kraken_ws_v2" | "coinbase_ws";

export const LIVE_MARKET_DATA_SYMBOLS = ["BTC/USD", "ETH/USD", "SOL/USD"] as const;

export interface MarketDataSourceRequest {
  source: MarketDataSourceId;
  symbol: string;
}

export interface MarketDataStatusDto {
  source: MarketDataSourceId;
  symbol: string;
  connected: boolean;
  book_state: string;
  provenance_tier: string;
  trades_received: number;
  crc_ok: number;
  crc_mismatches: number;
  reconnects: number;
  last_error: string | null;
  supported_symbols: string[];
}

export interface TransportAdapter {
  readonly kind: "tauri" | "loopback-ws" | "offline-sim";
  invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes>;
  subscribeBinary(streamId: number, onFrame: (frame: ArrayBuffer) => void): () => void;
  dispose?(): void;
}
