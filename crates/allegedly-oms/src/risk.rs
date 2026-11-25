use crate::state::{OrderRequest, OrderSide};
use allegedly_core::BookState;
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum RiskError {
    #[error("forbidden adapter blocked by DO-NOT-BUILD policy: {0}")]
    ForbiddenAdapter(String),
    #[error("live execution disabled at compile time (allow-live-trading feature OFF)")]
    LiveTradingDisabled,
    #[error("risk-increasing order blocked while BookState is {0:?} (fail-closed)")]
    BookNotLive(BookState),
    #[error("risk-increasing order blocked while OMS is reconciling")]
    ReconcilingActive,
    #[error("order quantity must be positive")]
    InvalidQuantity,
    #[error("order quantity exceeds max_order_qty_e9 limit")]
    MaxOrderQtyExceeded,
    #[error("reduce_only order does not strictly reduce current position ({current_pos_e9})")]
    NotStrictlyReducing { current_pos_e9: i64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OmsAction {
    PlaceOrder,
    CancelOrder,
    CancelAll,
    TriggerKillSwitch,
    ReconcileNow,
}

/// Pre-trade RiskGate enforcing the canonical Risk-Reduction Bypass Rule (RT3-05, ADR-0009).
#[derive(Debug, Clone)]
pub struct RiskGate {
    pub max_order_qty_e9: i64,
}

impl Default for RiskGate {
    fn default() -> Self {
        Self {
            max_order_qty_e9: 100_000_000_000, // 100 units
        }
    }
}

impl RiskGate {
    /// Risk-Reduction Bypass Rule:
    /// - CancelOrder, CancelAll, TriggerKillSwitch, ReconcileNow ALWAYS bypass BookState/Reconciling gates.
    /// - PlaceOrder with `reduce_only == true` that strictly reduces current_pos_e9 ALWAYS bypasses BookState/Reconciling gates.
    /// - Risk-increasing or position-flipping PlaceOrder fails closed whenever `book_state != Live` or `reconciling == true`.
    pub fn evaluate_action(
        &self,
        action: OmsAction,
        book_state: BookState,
        reconciling: bool,
        current_pos_e9: i64,
        req: Option<&OrderRequest>,
    ) -> Result<(), RiskError> {
        match action {
            OmsAction::CancelOrder
            | OmsAction::CancelAll
            | OmsAction::TriggerKillSwitch
            | OmsAction::ReconcileNow => Ok(()),
            OmsAction::PlaceOrder => {
                let req = req.ok_or(RiskError::InvalidQuantity)?;
                if req.qty.0 <= 0 {
                    return Err(RiskError::InvalidQuantity);
                }
                if req.reduce_only {
                    let strictly_reduces = match req.side {
                        OrderSide::Sell => current_pos_e9 > 0 && req.qty.0 <= current_pos_e9,
                        OrderSide::Buy => {
                            current_pos_e9 < 0 && req.qty.0 <= current_pos_e9.saturating_abs()
                        }
                    };
                    if !strictly_reduces {
                        return Err(RiskError::NotStrictlyReducing { current_pos_e9 });
                    }
                    // Strictly risk-reducing: bypass BookState & Reconciling fail-closed gates!
                    return Ok(());
                }
                if !book_state.is_live() {
                    return Err(RiskError::BookNotLive(book_state));
                }
                if reconciling {
                    return Err(RiskError::ReconcilingActive);
                }
                if req.qty.0 > self.max_order_qty_e9 {
                    return Err(RiskError::MaxOrderQtyExceeded);
                }
                Ok(())
            }
        }
    }
}
