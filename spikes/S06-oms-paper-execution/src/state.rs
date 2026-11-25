use crate::types::{
    ClientOrderId, ExecutionEnv, FillEvent, OrderClass, OrderIntent, OrderType, PriceTicks,
    ProtectiveLegMode, Qty, Side, TimeInForce,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;

/// Canonical OMS Order Lifecycle states (per S06 brief & R04 §3.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderState {
    IntentLogged,
    PendingNew,
    Accepted,
    PartiallyFilled,
    Filled,
    PendingCancel,
    Canceled,
    PendingReplace,
    Replaced,
    Rejected,
    Expired,
    UnknownPendingReconcile,
}

impl OrderState {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            OrderState::Filled
                | OrderState::Canceled
                | OrderState::Replaced
                | OrderState::Rejected
                | OrderState::Expired
        )
    }

    pub fn is_working(self) -> bool {
        matches!(
            self,
            OrderState::PendingNew
                | OrderState::Accepted
                | OrderState::PartiallyFilled
                | OrderState::PendingCancel
                | OrderState::PendingReplace
                | OrderState::UnknownPendingReconcile
        )
    }

    /// Strict deterministic transition validation table.
    pub fn can_transition_to(self, next: OrderState) -> bool {
        use OrderState::*;
        if self == next {
            // Self-transitions permitted only for incremental partial fills or repeated reconciliation pings.
            return matches!(self, PartiallyFilled | UnknownPendingReconcile);
        }
        match (self, next) {
            (IntentLogged, PendingNew | Rejected | UnknownPendingReconcile) => true,
            (
                PendingNew,
                Accepted
                    | PartiallyFilled
                    | Filled
                    | PendingCancel
                    | Canceled
                    | Rejected
                    | Expired
                    | UnknownPendingReconcile,
            ) => true,
            (
                Accepted,
                PartiallyFilled
                    | Filled
                    | PendingCancel
                    | Canceled
                    | PendingReplace
                    | Replaced
                    | Expired
                    | Rejected
                    | UnknownPendingReconcile,
            ) => true,
            (
                PartiallyFilled,
                PartiallyFilled
                    | Filled
                    | PendingCancel
                    | Canceled
                    | PendingReplace
                    | Replaced
                    | Expired
                    | UnknownPendingReconcile,
            ) => true,
            (
                PendingCancel,
                Canceled | PartiallyFilled | Filled | Accepted | Rejected | UnknownPendingReconcile,
            ) => true,
            (
                PendingReplace,
                Replaced | Accepted | PartiallyFilled | Filled | Canceled | Rejected
                    | UnknownPendingReconcile,
            ) => true,
            // UnknownPendingReconcile can resolve to any authoritative broker state.
            (UnknownPendingReconcile, Accepted | PartiallyFilled | Filled | Canceled | Replaced | Rejected | Expired) => true,
            _ => false,
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum StateError {
    #[error("illegal state transition for {client_order_id}: {from:?} -> {to:?}")]
    IllegalTransition {
        client_order_id: ClientOrderId,
        from: OrderState,
        to: OrderState,
    },
    #[error("over-fill detected for {client_order_id}: cum={cum} + fill={fill} > order_qty={order_qty}")]
    OverFill {
        client_order_id: ClientOrderId,
        cum: i64,
        fill: i64,
        order_qty: i64,
    },
    #[error("invalid quantity {0} for order {1}")]
    InvalidQuantity(i64, ClientOrderId),
}

/// Complete deterministic in-memory state of an order inside the OMS.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderRecord {
    pub client_order_id: ClientOrderId,
    pub broker_order_id: Option<String>,
    pub symbol: String,
    pub side: Side,
    pub order_qty: Qty,
    pub cum_filled_qty: Qty,
    pub leaves_qty: Qty,
    /// Exact integer tick average fill price (weighted integer mean over fills).
    pub avg_fill_price: PriceTicks,
    /// Numerator accumulator (`sum(fill_qty * fill_price_ticks)`) to avoid rounding drift across partial fills.
    pub fill_notional_ticks: i128,
    pub order_type: OrderType,
    pub order_class: OrderClass,
    pub tif: TimeInForce,
    pub env: ExecutionEnv,
    pub state: OrderState,
    pub protective_leg_mode: ProtectiveLegMode,
    pub parent_client_order_id: Option<ClientOrderId>,
    pub oco_sibling_id: Option<ClientOrderId>,
    pub reject_reason: Option<String>,
    pub seen_exec_ids: HashSet<String>,
    pub created_ts_ns: i64,
    pub updated_ts_ns: i64,
}

impl OrderRecord {
    pub fn from_intent(
        intent: &OrderIntent,
        protective_leg_mode: ProtectiveLegMode,
        ts_ns: i64,
    ) -> Result<Self, StateError> {
        if intent.qty.0 <= 0 {
            return Err(StateError::InvalidQuantity(
                intent.qty.0,
                intent.client_order_id.clone(),
            ));
        }
        Ok(Self {
            client_order_id: intent.client_order_id.clone(),
            broker_order_id: None,
            symbol: intent.symbol.clone(),
            side: intent.side,
            order_qty: intent.qty,
            cum_filled_qty: Qty::ZERO,
            leaves_qty: intent.qty,
            avg_fill_price: PriceTicks::ZERO,
            fill_notional_ticks: 0,
            order_type: intent.order_type,
            order_class: intent.order_class,
            tif: intent.tif,
            env: intent.env,
            state: OrderState::IntentLogged,
            protective_leg_mode,
            parent_client_order_id: intent.parent_client_order_id.clone(),
            oco_sibling_id: intent.oco_sibling_id.clone(),
            reject_reason: None,
            seen_exec_ids: HashSet::new(),
            created_ts_ns: ts_ns,
            updated_ts_ns: ts_ns,
        })
    }

    /// Strict accounting invariant checked after every fill or state update.
    pub fn assert_invariants(&self) -> Result<(), StateError> {
        if !matches!(self.state, OrderState::Canceled | OrderState::Rejected | OrderState::Expired | OrderState::Replaced) {
            if self.cum_filled_qty.0 + self.leaves_qty.0 != self.order_qty.0 {
                return Err(StateError::OverFill {
                    client_order_id: self.client_order_id.clone(),
                    cum: self.cum_filled_qty.0,
                    fill: self.leaves_qty.0,
                    order_qty: self.order_qty.0,
                });
            }
        }
        Ok(())
    }

    pub fn transition(
        &mut self,
        next: OrderState,
        broker_order_id: Option<String>,
        reason: Option<String>,
        ts_ns: i64,
    ) -> Result<(), StateError> {
        if !self.state.can_transition_to(next) {
            return Err(StateError::IllegalTransition {
                client_order_id: self.client_order_id.clone(),
                from: self.state,
                to: next,
            });
        }
        if let Some(bid) = broker_order_id {
            self.broker_order_id = Some(bid);
        }
        if let Some(r) = reason {
            self.reject_reason = Some(r);
        }
        self.state = next;
        if matches!(next, OrderState::Canceled | OrderState::Rejected | OrderState::Expired | OrderState::Replaced) {
            self.leaves_qty = Qty::ZERO;
        }
        self.updated_ts_ns = ts_ns;
        self.assert_invariants()
    }

    /// Apply a fill event with strict `exec_id` idempotency and exact fixed-point accounting.
    /// Returns `Ok(true)` if the fill was newly applied, `Ok(false)` if deduplicated.
    pub fn apply_fill(&mut self, fill: &FillEvent) -> Result<bool, StateError> {
        if self.seen_exec_ids.contains(&fill.exec_id) {
            return Ok(false);
        }
        if fill.fill_qty.0 <= 0 {
            return Err(StateError::InvalidQuantity(
                fill.fill_qty.0,
                self.client_order_id.clone(),
            ));
        }
        let new_cum = self.cum_filled_qty.0 + fill.fill_qty.0;
        if new_cum > self.order_qty.0 {
            return Err(StateError::OverFill {
                client_order_id: self.client_order_id.clone(),
                cum: self.cum_filled_qty.0,
                fill: fill.fill_qty.0,
                order_qty: self.order_qty.0,
            });
        }
        let target_state = if new_cum == self.order_qty.0 {
            OrderState::Filled
        } else {
            OrderState::PartiallyFilled
        };
        if !self.state.can_transition_to(target_state) {
            return Err(StateError::IllegalTransition {
                client_order_id: self.client_order_id.clone(),
                from: self.state,
                to: target_state,
            });
        }

        self.seen_exec_ids.insert(fill.exec_id.clone());
        self.broker_order_id = Some(fill.broker_order_id.clone());
        self.cum_filled_qty = Qty(new_cum);
        self.leaves_qty = Qty(self.order_qty.0 - new_cum);
        self.fill_notional_ticks += (fill.fill_qty.0 as i128) * (fill.fill_price.0 as i128);
        self.avg_fill_price = PriceTicks((self.fill_notional_ticks / (new_cum as i128)) as i64);
        self.state = target_state;
        self.updated_ts_ns = fill.ts_ns;
        self.assert_invariants()?;
        Ok(true)
    }

    /// Apply an in-place replace (`qty` and/or `limit_price` / `stop_price`).
    pub fn apply_replace(
        &mut self,
        new_qty: Option<Qty>,
        new_order_type: Option<OrderType>,
        ts_ns: i64,
    ) -> Result<(), StateError> {
        if let Some(q) = new_qty {
            if q.0 < self.cum_filled_qty.0 || q.0 <= 0 {
                return Err(StateError::InvalidQuantity(
                    q.0,
                    self.client_order_id.clone(),
                ));
            }
            self.order_qty = q;
            self.leaves_qty = Qty(q.0 - self.cum_filled_qty.0);
        }
        if let Some(ot) = new_order_type {
            self.order_type = ot;
        }
        self.updated_ts_ns = ts_ns;
        self.assert_invariants()
    }
}

/// Tracks a Bracket group (Entry + OCO Take-Profit & Stop-Loss) with partial-fill qty coupling.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BracketGroup {
    pub entry_client_id: ClientOrderId,
    pub take_profit_client_id: Option<ClientOrderId>,
    pub stop_loss_client_id: Option<ClientOrderId>,
    pub take_profit_price: PriceTicks,
    pub stop_loss_price: PriceTicks,
    /// Current protected quantity synced strictly to `entry.cum_filled_qty`.
    pub protected_qty: Qty,
    pub mode: ProtectiveLegMode,
    pub closed_by_leg: Option<ClientOrderId>,
}
