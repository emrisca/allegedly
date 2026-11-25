pub mod alpaca_paper;
pub mod local_paper;

use crate::state::OrderState;
use crate::types::{
    ClientOrderId, ExecutionEnv, FillEvent, MoneyMicros, OrderIntent, OrderType, PriceTicks, Qty,
    Side,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::broadcast;

/// Adapter capability flags cleanly separating broker features and safety modes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdapterCapabilities {
    pub adapter_id: String,
    pub env: ExecutionEnv,
    pub paper_mode: bool,
    pub supports_native_oco: bool,
    pub supports_modify_in_place: bool,
    pub supports_trailing_stop: bool,
    pub supports_bulk_cancel: bool,
    pub allowed_hosts: Vec<String>,
}

/// Hard-enforced `R04` DO-NOT-BUILD denylist (Prop firms & NDA/Enterprise-gated gateways).
/// Verified in `02-Research/R04-Execution-Brokers-Props.md` (2026-11-24).
pub const FORBIDDEN_DO_NOT_BUILD_ADAPTERS: &[&str] = &[
    "apex",
    "apex_trader_funding",
    "take_profit_trader",
    "tpt",
    "bulenox",
    "elite_trader_funding",
    "etf",
    "rithmic",
    "cqg",
];

/// Verifies an adapter ID is legally permitted and not on the `R04` DO-NOT-BUILD denylist.
pub fn verify_adapter_allowed(adapter_id: &str) -> Result<(), AdapterError> {
    let lower = adapter_id.to_ascii_lowercase();
    for forbidden in FORBIDDEN_DO_NOT_BUILD_ADAPTERS {
        if lower == *forbidden || lower.contains(forbidden) {
            return Err(AdapterError::ForbiddenAdapter(adapter_id.to_string()));
        }
    }
    Ok(())
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum AdapterError {
    #[error("adapter '{0}' is explicitly forbidden under R04 DO-NOT-BUILD compliance rules")]
    ForbiddenAdapter(String),
    #[error("duplicate client_order_id rejected by broker: {0}")]
    DuplicateClientOrderId(ClientOrderId),
    #[error("order rejected by broker: {0}")]
    Rejected(String),
    #[error("order not found on broker: {0}")]
    NotFound(String),
    #[error("rate limited (HTTP 429) after retries: retry_after_ms={retry_after_ms}")]
    RateLimited { retry_after_ms: u64 },
    #[error("ambiguous transport/server error (query by_client_order_id required): {0}")]
    AmbiguousTransport(String),
    #[error("malformed broker payload rejected: {0}")]
    MalformedPayload(String),
    #[error("security / host isolation error: {0}")]
    SecurityViolation(String),
    #[error("adapter disconnected: {0}")]
    Disconnected(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrokerOrderAck {
    pub broker_order_id: String,
    pub client_order_id: ClientOrderId,
    pub state: OrderState,
    /// Optional child leg broker IDs returned for broker-native bracket orders.
    pub leg_broker_ids: Vec<(ClientOrderId, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplaceOrderRequest {
    pub new_qty: Option<Qty>,
    pub new_limit_price: Option<PriceTicks>,
    pub new_stop_price: Option<PriceTicks>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrokerOrderSnapshot {
    pub broker_order_id: String,
    pub client_order_id: ClientOrderId,
    pub symbol: String,
    pub side: Side,
    pub order_qty: Qty,
    pub cum_filled_qty: Qty,
    pub avg_fill_price: PriceTicks,
    pub order_type: OrderType,
    pub state: OrderState,
    pub parent_broker_order_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrokerPositionSnapshot {
    pub symbol: String,
    pub net_qty: Qty,
    pub avg_entry_price: PriceTicks,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrokerAccountSnapshot {
    pub account_id: String,
    pub env: ExecutionEnv,
    pub equity_micros: MoneyMicros,
    pub buying_power_micros: MoneyMicros,
    pub trading_blocked: bool,
}

/// Asynchronous execution updates emitted by local simulator or Alpaca `trade_updates` WebSocket.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BrokerEvent {
    Accepted {
        client_order_id: ClientOrderId,
        broker_order_id: String,
        ts_ns: i64,
    },
    Fill(FillEvent),
    Canceled {
        client_order_id: ClientOrderId,
        broker_order_id: String,
        ts_ns: i64,
    },
    Replaced {
        client_order_id: ClientOrderId,
        broker_order_id: String,
        new_qty: Option<Qty>,
        new_order_type: Option<OrderType>,
        ts_ns: i64,
    },
    Rejected {
        client_order_id: ClientOrderId,
        reason: String,
        ts_ns: i64,
    },
    Expired {
        client_order_id: ClientOrderId,
        broker_order_id: String,
        ts_ns: i64,
    },
    StreamDisconnected {
        reason: String,
        ts_ns: i64,
    },
    StreamReconnected {
        ts_ns: i64,
    },
}

/// Unified broker-agnostic execution trait (`R04` Option A).
#[async_trait]
pub trait ExecutionAdapter: Send + Sync {
    fn capabilities(&self) -> AdapterCapabilities;

    async fn submit_order(&self, intent: &OrderIntent) -> Result<BrokerOrderAck, AdapterError>;

    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), AdapterError>;

    async fn replace_order(
        &self,
        broker_order_id: &str,
        req: &ReplaceOrderRequest,
    ) -> Result<BrokerOrderAck, AdapterError>;

    async fn cancel_all_orders(&self) -> Result<usize, AdapterError>;

    async fn close_all_positions(&self) -> Result<usize, AdapterError>;

    async fn get_order_by_client_id(
        &self,
        client_order_id: &ClientOrderId,
    ) -> Result<Option<BrokerOrderSnapshot>, AdapterError>;

    async fn list_open_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError>;

    async fn list_all_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError>;

    async fn list_positions(&self) -> Result<Vec<BrokerPositionSnapshot>, AdapterError>;

    async fn get_account(&self) -> Result<BrokerAccountSnapshot, AdapterError>;

    fn subscribe_events(&self) -> broadcast::Receiver<BrokerEvent>;
}
