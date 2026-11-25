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

export interface TransportAdapter {
  readonly kind: "tauri" | "loopback-ws" | "offline-sim";
  invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes>;
  subscribeBinary(streamId: number, onFrame: (frame: ArrayBuffer) => void): () => void;
  dispose?(): void;
}
