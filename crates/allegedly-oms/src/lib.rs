pub mod journal;
pub mod risk;
pub mod state;

pub use journal::{JournalError, JournalMode, OrderJournal};
pub use risk::{OmsAction, RiskError, RiskGate};
pub use state::{
    FORBIDDEN_DO_NOT_BUILD_ADAPTERS, OrderRecord, OrderRequest, OrderSide, OrderState, OrderType,
    is_forbidden_adapter,
};

use allegedly_core::{BookState, TimestampNs};
use std::collections::HashMap;
use uuid::Uuid;

/// Compile-time live-trading safety flag (OFF by default in v0.1).
pub const LIVE_TRADING_COMPILED_IN: bool = cfg!(feature = "allow-live-trading");

/// Local deterministic Paper/Sim OMS engine enforcing Risk-Reduction Bypass + WAL persistence.
pub struct LocalPaperOms {
    risk: RiskGate,
    journal: OrderJournal,
    orders: HashMap<Uuid, OrderRecord>,
    positions_e9: HashMap<u32, i64>,
    pub live_armed: bool,
}

impl LocalPaperOms {
    pub fn new(journal: OrderJournal) -> Self {
        Self {
            risk: RiskGate::default(),
            journal,
            orders: HashMap::new(),
            positions_e9: HashMap::new(),
            live_armed: false,
        }
    }

    pub fn set_position_e9(&mut self, instrument_id: u32, pos_e9: i64) {
        self.positions_e9.insert(instrument_id, pos_e9);
    }

    pub fn submit_order(
        &mut self,
        req: OrderRequest,
        book_state: BookState,
        reconciling: bool,
        now_ns: TimestampNs,
    ) -> Result<OrderRecord, RiskError> {
        let pos = self
            .positions_e9
            .get(&req.instrument_id.0)
            .copied()
            .unwrap_or(0);
        self.risk.evaluate_action(
            OmsAction::PlaceOrder,
            book_state,
            reconciling,
            pos,
            Some(&req),
        )?;
        let rec = OrderRecord {
            client_order_id: req.client_order_id,
            instrument_id: req.instrument_id,
            side: req.side,
            order_type: req.order_type,
            qty: req.qty,
            filled_qty: allegedly_core::QtyE9(0),
            limit_price: req.limit_price,
            reduce_only: req.reduce_only,
            state: OrderState::Acked,
            updated_ns: now_ns,
        };
        let _ = self.journal.upsert_order(&rec);
        self.orders.insert(rec.client_order_id, rec.clone());
        Ok(rec)
    }

    pub fn trigger_kill_switch(&mut self, now_ns: TimestampNs) -> Result<usize, JournalError> {
        let working_ids: Vec<Uuid> = self
            .orders
            .values()
            .filter(|o| o.state.is_working())
            .map(|o| o.client_order_id)
            .collect();
        let count = self
            .journal
            .commit_kill_switch_batch(&working_ids, now_ns)?;
        for id in &working_ids {
            if let Some(o) = self.orders.get_mut(id) {
                o.state = OrderState::Canceled;
                o.updated_ns = now_ns;
            }
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
    fn forbidden_adapters_denylist_blocks_all_9() {
        for name in FORBIDDEN_DO_NOT_BUILD_ADAPTERS {
            assert!(is_forbidden_adapter(name), "expected {name} to be blocked");
        }
        assert!(is_forbidden_adapter("Apex Trader Funding"));
        assert!(is_forbidden_adapter("Take-Profit-Trader"));
        assert!(!is_forbidden_adapter("alpaca_paper"));
        assert!(!LIVE_TRADING_COMPILED_IN);
    }

    #[test]
    fn risk_reduction_bypass_truth_table() {
        let gate = RiskGate::default();
        let entry_buy = OrderRequest {
            client_order_id: Uuid::now_v7(),
            instrument_id: InstrumentId(1),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            qty: QtyE9(1_000_000_000),
            limit_price: Some(PriceE9(100_000_000_000)),
            reduce_only: false,
            oco_group_id: None,
        };
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

        // 1. Risk-increasing order MUST fail closed when BookState != Live or reconciling == true
        assert_eq!(
            gate.evaluate_action(
                OmsAction::PlaceOrder,
                BookState::Stale,
                false,
                0,
                Some(&entry_buy)
            ),
            Err(RiskError::BookNotLive(BookState::Stale))
        );
        assert_eq!(
            gate.evaluate_action(
                OmsAction::PlaceOrder,
                BookState::Live,
                true,
                0,
                Some(&entry_buy)
            ),
            Err(RiskError::ReconcilingActive)
        );

        // 2. Strictly reducing order MUST succeed even during BookState::Disconnected + reconciling == true!
        assert!(
            gate.evaluate_action(
                OmsAction::PlaceOrder,
                BookState::Disconnected,
                true,
                2_000_000_000,
                Some(&reduce_sell)
            )
            .is_ok()
        );

        // 3. Position-flipping reduce_only order (selling 3 when long 2) MUST be rejected!
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
        // Verify crash-recovery reload sees all 50 orders durably transitioned to PendingCancel
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
