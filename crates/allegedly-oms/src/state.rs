use allegedly_core::{InstrumentId, PriceE9, QtyE9, TimestampNs};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Hardcoded FORBIDDEN_DO_NOT_BUILD_ADAPTERS denylist (ADR-0009, RT4-08, Compliance-Notes).
pub const FORBIDDEN_DO_NOT_BUILD_ADAPTERS: [&str; 9] = [
    "apex",
    "take_profit_trader",
    "bulenox",
    "elite_trader_funding",
    "rithmic",
    "cqg",
    "sierra_scid_dtc",
    "ibkr_official_gpl_tws",
    "tradingview_charting_library",
];

pub fn is_forbidden_adapter(name: &str) -> bool {
    let norm = name.trim().to_ascii_lowercase().replace(['-', ' '], "_");
    FORBIDDEN_DO_NOT_BUILD_ADAPTERS
        .iter()
        .any(|&b| norm == b || norm.contains(b))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderType {
    Market,
    Limit,
    Stop,
    StopLimit,
}

/// Canonical 12-state OrderState machine (Data-Model.md, ADR-0009, RT3-10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OrderState {
    PendingLocal,
    Submitted,
    Acked,
    PartiallyFilled,
    Filled,
    PendingCancel,
    Canceled,
    PendingReplace,
    Rejected,
    Expired,
    UnknownReconciling,
    Orphaned,
}

impl OrderState {
    pub fn is_working(self) -> bool {
        matches!(
            self,
            Self::PendingLocal
                | Self::Submitted
                | Self::Acked
                | Self::PartiallyFilled
                | Self::PendingCancel
                | Self::PendingReplace
                | Self::UnknownReconciling
        )
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::PendingLocal => "PendingLocal",
            Self::Submitted => "Submitted",
            Self::Acked => "Acked",
            Self::PartiallyFilled => "PartiallyFilled",
            Self::Filled => "Filled",
            Self::PendingCancel => "PendingCancel",
            Self::Canceled => "Canceled",
            Self::PendingReplace => "PendingReplace",
            Self::Rejected => "Rejected",
            Self::Expired => "Expired",
            Self::UnknownReconciling => "UnknownReconciling",
            Self::Orphaned => "Orphaned",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "PendingLocal" => Some(Self::PendingLocal),
            "Submitted" => Some(Self::Submitted),
            "Acked" => Some(Self::Acked),
            "PartiallyFilled" => Some(Self::PartiallyFilled),
            "Filled" => Some(Self::Filled),
            "PendingCancel" => Some(Self::PendingCancel),
            "Canceled" => Some(Self::Canceled),
            "PendingReplace" => Some(Self::PendingReplace),
            "Rejected" => Some(Self::Rejected),
            "Expired" => Some(Self::Expired),
            "UnknownReconciling" => Some(Self::UnknownReconciling),
            "Orphaned" => Some(Self::Orphaned),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderRequest {
    pub client_order_id: Uuid,
    pub instrument_id: InstrumentId,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub qty: QtyE9,
    pub limit_price: Option<PriceE9>,
    pub reduce_only: bool,
    pub oco_group_id: Option<Uuid>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderRecord {
    pub client_order_id: Uuid,
    pub instrument_id: InstrumentId,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub qty: QtyE9,
    pub filled_qty: QtyE9,
    pub limit_price: Option<PriceE9>,
    pub reduce_only: bool,
    pub state: OrderState,
    pub updated_ns: TimestampNs,
}
