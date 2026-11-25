pub mod journal;
pub mod risk;
pub mod state;

pub use journal::{JournalError, JournalMode, OrderJournal};
pub use risk::{OmsAction, RiskError, RiskGate};
pub use state::{
    FORBIDDEN_DO_NOT_BUILD_ADAPTERS, OrderRecord, OrderRequest, OrderSide, OrderState, OrderType,
    is_forbidden_adapter,
};

use allegedly_core::{BookState, PriceE9, QtyE9, TimestampNs};
use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;

/// Compile-time live-trading safety flag (OFF by default in v0.1).
pub const LIVE_TRADING_COMPILED_IN: bool = cfg!(feature = "allow-live-trading");

#[derive(Debug, Error)]
pub enum OmsError {
    #[error("risk gate rejected order: {0}")]
    Risk(#[from] RiskError),
    #[error("SQLite WAL journal write failed: {0}")]
    Journal(#[from] JournalError),
    #[error("duplicate client_order_id rejected: {0}")]
    DuplicateClientOrderId(Uuid),
    #[error("invalid order parameters: {0}")]
    InvalidOrder(String),
}

/// Local deterministic Paper/Sim OMS engine enforcing Risk-Reduction Bypass + crash-safe SQLite WAL persistence.
pub struct LocalPaperOms {
    risk: RiskGate,
    journal: OrderJournal,
    orders: HashMap<Uuid, OrderRecord>,
    positions_e9: HashMap<u32, i64>,
    live_armed: bool,
}

impl LocalPaperOms {
    /// Construct a `LocalPaperOms` and automatically recover persisted orders & positions from the WAL journal.
    pub fn new(journal: OrderJournal) -> Self {
        let mut orders = HashMap::new();
        if let Ok(existing) = journal.load_all_orders(10_000) {
            for o in existing {
                orders.insert(o.client_order_id, o);
            }
        }
        let positions_e9 = journal.load_positions().unwrap_or_default();
        Self {
            risk: RiskGate::default(),
            journal,
            orders,
            positions_e9,
            live_armed: false,
        }
    }

    /// Audited read-only accessor (always `false` in v0.1 Paper/Sim).
    pub fn live_armed(&self) -> bool {
        self.live_armed
    }

    pub fn journal_mode(&self) -> JournalMode {
        self.journal.mode()
    }

    pub fn orders_snapshot(&self) -> Vec<OrderRecord> {
        let mut out: Vec<OrderRecord> = self.orders.values().cloned().collect();
        out.sort_by_key(|a| std::cmp::Reverse(a.updated_ns.0));
        out
    }

    pub fn positions_snapshot(&self) -> &HashMap<u32, i64> {
        &self.positions_e9
    }

    pub fn set_position_e9(
        &mut self,
        instrument_id: u32,
        pos_e9: i64,
        now_ns: TimestampNs,
    ) -> Result<(), JournalError> {
        self.journal
            .upsert_position(instrument_id, pos_e9, now_ns)?;
        if pos_e9 == 0 {
            self.positions_e9.remove(&instrument_id);
        } else {
            self.positions_e9.insert(instrument_id, pos_e9);
        }
        Ok(())
    }

    /// Validate, risk-gate, write-ahead to SQLite WAL, and record a paper order.
    ///
    /// For `OrderType::Market` orders with a provided `mark_price_e9`, fills immediately at `mark_price_e9`
    /// and atomically updates the SQLite `positions` table before mutating in-memory state.
    pub fn submit_order_with_mark(
        &mut self,
        req: OrderRequest,
        book_state: BookState,
        reconciling: bool,
        mark_price_e9: Option<PriceE9>,
        now_ns: TimestampNs,
    ) -> Result<OrderRecord, OmsError> {
        if self.orders.contains_key(&req.client_order_id) {
            return Err(OmsError::DuplicateClientOrderId(req.client_order_id));
        }
        if req.order_type == OrderType::Limit {
            match req.limit_price {
                Some(p) if p.0 > 0 => {}
                _ => {
                    return Err(OmsError::InvalidOrder(
                        "limit orders require strictly positive limit_price_e9".into(),
                    ));
                }
            }
        }
        if req.order_type == OrderType::Market && mark_price_e9.is_some_and(|p| p.0 <= 0) {
            return Err(OmsError::InvalidOrder(
                "market fill mark price must be strictly positive".into(),
            ));
        }

        let current_pos = self
            .positions_e9
            .get(&req.instrument_id.0)
            .copied()
            .unwrap_or(0);

        self.risk.evaluate_action(
            OmsAction::PlaceOrder,
            book_state,
            reconciling,
            current_pos,
            Some(&req),
        )?;

        let (state, filled_qty, effective_price, new_pos) = if req.order_type == OrderType::Market {
            if let Some(fill_px) = mark_price_e9 {
                let delta = match req.side {
                    OrderSide::Buy => req.qty.0,
                    OrderSide::Sell => -req.qty.0,
                };
                let next_pos = current_pos
                    .checked_add(delta)
                    .ok_or_else(|| OmsError::InvalidOrder("position quantity overflow".into()))?;
                (OrderState::Filled, req.qty, Some(fill_px), next_pos)
            } else {
                (OrderState::Acked, QtyE9(0), req.limit_price, current_pos)
            }
        } else {
            (OrderState::Acked, QtyE9(0), req.limit_price, current_pos)
        };

        let rec = OrderRecord {
            client_order_id: req.client_order_id,
            instrument_id: req.instrument_id,
            side: req.side,
            order_type: req.order_type,
            qty: req.qty,
            filled_qty,
            limit_price: effective_price,
            reduce_only: req.reduce_only,
            state,
            updated_ns: now_ns,
        };

        // Write-ahead to SQLite WAL *before* mutating in-memory state (RTSD-09 / SV-03).
        self.journal
            .commit_order_and_position(&rec, new_pos, now_ns)?;

        self.orders.insert(rec.client_order_id, rec.clone());
        if new_pos == 0 {
            self.positions_e9.remove(&req.instrument_id.0);
        } else {
            self.positions_e9.insert(req.instrument_id.0, new_pos);
        }
        Ok(rec)
    }

    pub fn submit_order(
        &mut self,
        req: OrderRequest,
        book_state: BookState,
        reconciling: bool,
        now_ns: TimestampNs,
    ) -> Result<OrderRecord, OmsError> {
        self.submit_order_with_mark(req, book_state, reconciling, None, now_ns)
    }

    /// Execute Kill-Switch in a single atomic SQLite WAL transaction.
    ///
    /// - `JournalMode::BrokerLive`: transitions all working orders to `PendingCancel` in both WAL and RAM.
    /// - `JournalMode::PaperSim`: transitions all working orders to `Canceled` AND flattens open positions
    ///   in both WAL and RAM so crash recovery reloads the exact same state.
    pub fn trigger_kill_switch(&mut self, now_ns: TimestampNs) -> Result<usize, JournalError> {
        let working_ids: Vec<Uuid> = self
            .orders
            .values()
            .filter(|o| o.state.is_working())
            .map(|o| o.client_order_id)
            .collect();

        let (target_state, flatten_positions) = match self.journal.mode() {
            JournalMode::BrokerLive => (OrderState::PendingCancel, false),
            JournalMode::PaperSim => (OrderState::Canceled, true),
        };

        let count = self.journal.commit_kill_switch_batch(
            &working_ids,
            target_state,
            flatten_positions,
            now_ns,
        )?;

        for id in &working_ids {
            if let Some(o) = self.orders.get_mut(id) {
                o.state = target_state;
                o.updated_ns = now_ns;
            }
        }
        if flatten_positions {
            self.positions_e9.clear();
        }
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_core::{InstrumentId, PriceE9, QtyE9};
    use std::time::Instant;

    #[test]
    fn sv04_risk_reduction_bypass_matrix() {
        let gate = RiskGate::default();
        assert!(is_forbidden_adapter("Rithmic"));
        assert!(!is_forbidden_adapter("PaperSim"));

        // 1. Fresh entry blocked when book is Stale
        let buy_entry = OrderRequest {
            client_order_id: Uuid::now_v7(),
            instrument_id: InstrumentId(1),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            qty: QtyE9(1_000_000_000),
            limit_price: Some(PriceE9(95_000_000_000_000)),
            reduce_only: false,
            oco_group_id: None,
        };
        assert!(matches!(
            gate.evaluate_action(
                OmsAction::PlaceOrder,
                BookState::Stale,
                false,
                0,
                Some(&buy_entry)
            ),
            Err(RiskError::BookNotLive(BookState::Stale))
        ));

        // 2. Strictly reducing sell while long 2.0 passes EVEN when book is Stale
        let reduce_sell = OrderRequest {
            client_order_id: Uuid::now_v7(),
            instrument_id: InstrumentId(1),
            side: OrderSide::Sell,
            order_type: OrderType::Market,
            qty: QtyE9(1_000_000_000),
            limit_price: None,
            reduce_only: true,
            oco_group_id: None,
        };
        assert!(
            gate.evaluate_action(
                OmsAction::PlaceOrder,
                BookState::Stale,
                false,
                2_000_000_000,
                Some(&reduce_sell)
            )
            .is_ok()
        );

        // 3. Flip-attempting reduce_only sell (qty 3 while long 2) rejected!
        let flip_sell = OrderRequest {
            qty: QtyE9(3_000_000_000),
            ..reduce_sell
        };
        assert!(matches!(
            gate.evaluate_action(
                OmsAction::PlaceOrder,
                BookState::Stale,
                false,
                2_000_000_000,
                Some(&flip_sell)
            ),
            Err(RiskError::NotStrictlyReducing { .. })
        ));

        // 4. Cancel / KillSwitch / Reconcile ALWAYS pass
        for act in [
            OmsAction::CancelOrder,
            OmsAction::CancelAll,
            OmsAction::TriggerKillSwitch,
            OmsAction::ReconcileNow,
        ] {
            assert!(
                gate.evaluate_action(act, BookState::Halted, true, 0, None)
                    .is_ok()
            );
        }
    }

    #[test]
    fn rtsd09_paper_kill_switch_crash_recovery_and_duplicate_idempotency() {
        let dir = std::env::temp_dir().join(format!("allegedly-oms-rtsd09-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("paper_journal.sqlite");

        let journal = OrderJournal::open(&db_path, JournalMode::PaperSim).unwrap();
        let mut oms = LocalPaperOms::new(journal);
        assert!(!oms.live_armed());

        // 1. Market fill at realistic ETH price ($3,420) updates position durably
        let mkt_id = Uuid::now_v7();
        let mkt = OrderRequest {
            client_order_id: mkt_id,
            instrument_id: InstrumentId(2),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            qty: QtyE9(2_000_000_000),
            limit_price: None,
            reduce_only: false,
            oco_group_id: None,
        };
        let filled = oms
            .submit_order_with_mark(
                mkt.clone(),
                BookState::Live,
                false,
                Some(PriceE9(3_420_000_000_000)),
                TimestampNs(1_000),
            )
            .unwrap();
        assert_eq!(filled.state, OrderState::Filled);
        assert_eq!(oms.positions_snapshot().get(&2), Some(&2_000_000_000));

        // 2. Duplicate client_order_id rejected
        assert!(matches!(
            oms.submit_order_with_mark(
                mkt,
                BookState::Live,
                false,
                Some(PriceE9(3_420_000_000_000)),
                TimestampNs(1_001),
            ),
            Err(OmsError::DuplicateClientOrderId(id)) if id == mkt_id
        ));

        // 3. Working limit order
        let lim_id = Uuid::now_v7();
        oms.submit_order(
            OrderRequest {
                client_order_id: lim_id,
                instrument_id: InstrumentId(2),
                side: OrderSide::Sell,
                order_type: OrderType::Limit,
                qty: QtyE9(1_000_000_000),
                limit_price: Some(PriceE9(3_500_000_000_000)),
                reduce_only: false,
                oco_group_id: None,
            },
            BookState::Live,
            false,
            TimestampNs(1_002),
        )
        .unwrap();

        // 4. Kill-switch in PaperSim atomically transitions working orders -> Canceled AND flattens positions
        let canceled = oms.trigger_kill_switch(TimestampNs(2_000)).unwrap();
        assert_eq!(canceled, 1);
        assert!(oms.positions_snapshot().is_empty());

        // 5. Simulate process restart: reload fresh LocalPaperOms from SQLite WAL
        drop(oms);
        let reopened =
            LocalPaperOms::new(OrderJournal::open(&db_path, JournalMode::PaperSim).unwrap());
        assert!(reopened.positions_snapshot().is_empty());
        let lim_reloaded = reopened
            .orders_snapshot()
            .into_iter()
            .find(|o| o.client_order_id == lim_id)
            .unwrap();
        assert_eq!(lim_reloaded.state, OrderState::Canceled);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn uv02_apfs_fullfsync_batched_50_order_kill_switch_and_crash_recovery() {
        let dir = std::env::temp_dir().join(format!("allegedly-oms-uv02-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("live_journal.sqlite");

        let journal = OrderJournal::open(&db_path, JournalMode::BrokerLive).unwrap();
        let mut oms = LocalPaperOms::new(journal);
        for i in 0..50 {
            let req = OrderRequest {
                client_order_id: Uuid::now_v7(),
                instrument_id: InstrumentId(1),
                side: OrderSide::Buy,
                order_type: OrderType::Limit,
                qty: QtyE9(1_000_000_000),
                limit_price: Some(PriceE9(90_000_000_000_000 + i * 1_000_000_000)),
                reduce_only: false,
                oco_group_id: None,
            };
            oms.submit_order(req, BookState::Live, false, TimestampNs(1_000 + i))
                .unwrap();
        }

        let t0 = Instant::now();
        let canceled = oms.trigger_kill_switch(TimestampNs(99_999)).unwrap();
        let elapsed_us = t0.elapsed().as_micros();
        assert_eq!(canceled, 50);
        // Verify BOTH in-memory state AND post-crash SQLite reload agree on PendingCancel (RTSD-09)
        assert!(
            oms.orders_snapshot()
                .iter()
                .all(|o| o.state == OrderState::PendingCancel)
        );
        let reopened = OrderJournal::open(&db_path, JournalMode::BrokerLive).unwrap();
        let working = reopened.load_working_orders().unwrap();
        assert_eq!(working.len(), 50);
        assert!(working.iter().all(|o| o.state == OrderState::PendingCancel));
        eprintln!(
            "[UV-02 MEASURED] BrokerLive PRAGMA fullfsync=ON batched 50-order Kill-Switch commit: {} us ({}.{:03} ms)",
            elapsed_us,
            elapsed_us / 1000,
            elapsed_us % 1000
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
