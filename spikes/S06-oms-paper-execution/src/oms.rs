use crate::adapter::{
    verify_adapter_allowed, AdapterError, BrokerEvent, BrokerOrderSnapshot, ExecutionAdapter,
    ReplaceOrderRequest,
};
use crate::journal::{JournalError, JournalEvent, SqliteWalJournal};
use crate::risk::{RiskConfig, RiskError, RiskGate};
use crate::state::{BracketGroup, OrderRecord, OrderState, StateError};
use crate::types::{
    now_unix_ns, BboQuote, ClientOrderId, FillEvent, FixedPointError, InstrumentSpec, MoneyMicros,
    OrderClass, OrderIntent, OrderType, Position, PriceTicks, ProtectiveLegMode, Qty,
    TimeInForce,
};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OmsError {
    #[error("risk check rejected order: {0}")]
    Risk(#[from] RiskError),
    #[error("state machine error: {0}")]
    State(#[from] StateError),
    #[error("journal error: {0}")]
    Journal(#[from] JournalError),
    #[error("adapter error: {0}")]
    Adapter(#[from] AdapterError),
    #[error("fixed-point math error: {0}")]
    FixedPoint(#[from] FixedPointError),
    #[error("order not found in OMS: {0}")]
    OrderNotFound(ClientOrderId),
    #[error("ambiguous submit for {client_order_id} (marked UnknownPendingReconcile): {detail}")]
    AmbiguousSubmit {
        client_order_id: ClientOrderId,
        detail: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KillSwitchReport {
    pub halt_latency_ns: u64,
    pub total_latency_ns: u64,
    pub canceled_orders: usize,
    pub flattened_positions: usize,
    pub remaining_working_orders: usize,
    pub remaining_open_positions: usize,
    pub verified_flat: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReconciliationReport {
    pub wal_events_replayed: usize,
    pub wal_replay_ns: u64,
    pub reconcile_ns: u64,
    pub missed_fills_recovered: usize,
    pub unknown_orders_resolved: usize,
    pub states_updated: usize,
    pub orphan_broker_orders: Vec<BrokerOrderSnapshot>,
    pub position_mismatches: Vec<String>,
    pub clean: bool,
}

/// Allegedly Deterministic OMS Engine (Phase 2 Spike S06).
/// Enforces 100% fixed-point math, WAL write-ahead intent logging, idempotency,
/// bracket partial-fill scaling, pre-trade risk gates, kill-switch, and crash reconciliation.
pub struct OmsEngine {
    adapter: Arc<dyn ExecutionAdapter>,
    journal: SqliteWalJournal,
    risk: RiskGate,
    specs: HashMap<String, InstrumentSpec>,
    orders: HashMap<ClientOrderId, OrderRecord>,
    brackets: HashMap<ClientOrderId, BracketGroup>,
    positions: HashMap<String, Position>,
    bbo_cache: HashMap<String, BboQuote>,
    halted: Arc<AtomicBool>,
    reconciling: Arc<AtomicBool>,
    wal_events_replayed: usize,
    wal_replay_ns: u64,
}

impl OmsEngine {
    pub fn new(
        journal_path: impl AsRef<Path>,
        adapter: Arc<dyn ExecutionAdapter>,
        risk_config: RiskConfig,
        specs: Vec<InstrumentSpec>,
    ) -> Result<Self, OmsError> {
        verify_adapter_allowed(&adapter.capabilities().adapter_id)?;
        let journal = SqliteWalJournal::open(journal_path)?;
        let mut spec_map = HashMap::new();
        for s in specs {
            spec_map.insert(s.symbol.clone(), s);
        }
        Ok(Self {
            adapter,
            journal,
            risk: RiskGate::new(risk_config),
            specs: spec_map,
            orders: HashMap::new(),
            brackets: HashMap::new(),
            positions: HashMap::new(),
            bbo_cache: HashMap::new(),
            halted: Arc::new(AtomicBool::new(false)),
            reconciling: Arc::new(AtomicBool::new(false)),
            wal_events_replayed: 0,
            wal_replay_ns: 0,
        })
    }

    /// Cold-boot recovery from an existing SQLite WAL journal after an abrupt crash.
    /// Places the OMS into `RECONCILING` mode (blocking new orders) until `reconcile_with_broker()` passes.
    pub fn recover_from_wal(
        journal_path: impl AsRef<Path>,
        adapter: Arc<dyn ExecutionAdapter>,
        risk_config: RiskConfig,
        specs: Vec<InstrumentSpec>,
    ) -> Result<Self, OmsError> {
        let mut oms = Self::new(journal_path, adapter, risk_config, specs)?;
        oms.reconciling.store(true, Ordering::SeqCst);

        let start = Instant::now();
        let rows = oms.journal.read_all()?;
        for row in &rows {
            oms.replay_journal_event(row.ts_ns, &row.event)?;
        }
        oms.wal_events_replayed = rows.len();
        oms.wal_replay_ns = start.elapsed().as_nanos() as u64;
        Ok(oms)
    }

    fn replay_journal_event(&mut self, ts_ns: i64, event: &JournalEvent) -> Result<(), OmsError> {
        match event {
            JournalEvent::IntentLogged {
                intent,
                protective_leg_mode,
            } => {
                let rec = OrderRecord::from_intent(intent, *protective_leg_mode, ts_ns)?;
                self.orders.insert(intent.client_order_id.clone(), rec);
            }
            JournalEvent::StateTransition {
                client_order_id,
                broker_order_id,
                new_state,
                reason,
            } => {
                if let Some(rec) = self.orders.get_mut(client_order_id) {
                    if rec.state != *new_state {
                        let _ = rec.transition(
                            *new_state,
                            broker_order_id.clone(),
                            reason.clone(),
                            ts_ns,
                        );
                    } else if let Some(bid) = broker_order_id {
                        rec.broker_order_id = Some(bid.clone());
                    }
                }
            }
            JournalEvent::FillApplied { fill } => {
                let applied = if let Some(rec) = self.orders.get_mut(&fill.client_order_id) {
                    rec.apply_fill(fill)?
                } else {
                    false
                };
                if applied {
                    let spec = self.spec_for(&fill.symbol);
                    let pos = self
                        .positions
                        .entry(fill.symbol.clone())
                        .or_insert_with(|| Position::flat(&fill.symbol));
                    pos.apply_fill(&spec, fill.side, fill.fill_qty, fill.fill_price)?;
                }
            }
            JournalEvent::OrderReplaced {
                client_order_id,
                new_qty,
                new_order_type,
            } => {
                if let Some(rec) = self.orders.get_mut(client_order_id) {
                    rec.apply_replace(*new_qty, *new_order_type, ts_ns)?;
                }
            }
            JournalEvent::BracketRegistered {
                entry_client_id,
                take_profit_price,
                stop_loss_price,
                mode,
            } => {
                self.brackets.insert(
                    entry_client_id.clone(),
                    BracketGroup {
                        entry_client_id: entry_client_id.clone(),
                        take_profit_client_id: None,
                        stop_loss_client_id: None,
                        take_profit_price: *take_profit_price,
                        stop_loss_price: *stop_loss_price,
                        protected_qty: Qty::ZERO,
                        mode: *mode,
                        closed_by_leg: None,
                    },
                );
            }
            JournalEvent::BracketLegsUpdated {
                entry_client_id,
                take_profit_client_id,
                stop_loss_client_id,
                protected_qty,
                closed_by_leg,
            } => {
                if let Some(bg) = self.brackets.get_mut(entry_client_id) {
                    bg.take_profit_client_id = take_profit_client_id.clone();
                    bg.stop_loss_client_id = stop_loss_client_id.clone();
                    bg.protected_qty = *protected_qty;
                    bg.closed_by_leg = closed_by_leg.clone();
                }
            }
            JournalEvent::KillSwitchTriggered { .. } => {
                self.halted.store(true, Ordering::SeqCst);
            }
            JournalEvent::ReconciliationNote { .. } => {}
        }
        Ok(())
    }

    pub fn spec_for(&self, symbol: &str) -> InstrumentSpec {
        self.specs
            .get(symbol)
            .cloned()
            .unwrap_or_else(|| InstrumentSpec::us_equity(symbol))
    }

    pub fn update_bbo(&mut self, symbol: impl Into<String>, quote: BboQuote) {
        self.bbo_cache.insert(symbol.into(), quote);
    }

    pub fn is_halted(&self) -> bool {
        self.halted.load(Ordering::SeqCst)
    }

    pub fn is_reconciling(&self) -> bool {
        self.reconciling.load(Ordering::SeqCst)
    }

    pub fn clear_halt(&mut self) {
        self.halted.store(false, Ordering::SeqCst);
    }

    pub fn risk_gate(&self) -> &RiskGate {
        &self.risk
    }

    pub fn risk_gate_mut(&mut self) -> &mut RiskGate {
        &mut self.risk
    }

    pub fn journal(&self) -> &SqliteWalJournal {
        &self.journal
    }

    pub fn get_order(&self, client_order_id: &ClientOrderId) -> Option<&OrderRecord> {
        self.orders.get(client_order_id)
    }

    pub fn all_orders(&self) -> impl Iterator<Item = &OrderRecord> {
        self.orders.values()
    }

    pub fn working_orders(&self) -> Vec<&OrderRecord> {
        self.orders
            .values()
            .filter(|o| o.state.is_working())
            .collect()
    }

    pub fn get_bracket(&self, entry_id: &ClientOrderId) -> Option<&BracketGroup> {
        self.brackets.get(entry_id)
    }

    pub fn get_position(&self, symbol: &str) -> Position {
        self.positions
            .get(symbol)
            .cloned()
            .unwrap_or_else(|| Position::flat(symbol))
    }

    pub fn total_daily_pnl_micros(&self) -> Result<MoneyMicros, FixedPointError> {
        let mut total = 0_i128;
        for (sym, pos) in &self.positions {
            total += pos.realized_pnl_micros.0;
            if pos.net_qty.0 != 0 {
                let spec = self.spec_for(sym);
                let mark = self
                    .bbo_cache
                    .get(sym)
                    .map(|q| q.mid_ticks())
                    .unwrap_or(pos.avg_entry_price);
                total += pos.unrealized_pnl_micros(&spec, mark)?.0;
            }
        }
        Ok(MoneyMicros(total))
    }

    /// Submit a new order intent with pre-trade risk validation, idempotency, and WAL write-ahead logging.
    pub async fn submit_order(&mut self, intent: OrderIntent) -> Result<OrderRecord, OmsError> {
        self.submit_order_internal(intent, false).await
    }

    async fn submit_order_internal(
        &mut self,
        intent: OrderIntent,
        is_protective_exit: bool,
    ) -> Result<OrderRecord, OmsError> {
        if self.halted.load(Ordering::SeqCst) {
            return Err(OmsError::Risk(RiskError::OmsHalted));
        }
        if self.reconciling.load(Ordering::SeqCst) {
            return Err(OmsError::Risk(RiskError::OmsReconciling));
        }

        // Idempotency check: duplicate client_order_id returns existing order without re-sending!
        if let Some(existing) = self.orders.get(&intent.client_order_id).cloned() {
            if existing.state != OrderState::UnknownPendingReconcile {
                return Ok(existing);
            }
            // Existing order is UnknownPendingReconcile: query broker BEFORE ever retrying!
            if let Some(snap) = self
                .adapter
                .get_order_by_client_id(&intent.client_order_id)
                .await?
            {
                self.reconcile_single_snapshot(&snap)?;
                return Ok(self.orders.get(&intent.client_order_id).cloned().unwrap());
            }
            // Broker confirmed 404 -> safe to proceed with fresh dispatch of same client_order_id.
        }

        let spec = self.spec_for(&intent.symbol);
        let cur_pos = self.get_position(&intent.symbol).net_qty;
        let working_same_side: i64 = self
            .orders
            .values()
            .filter(|o| {
                o.symbol == intent.symbol
                    && o.side == intent.side
                    && o.state.is_working()
                    && o.parent_client_order_id.is_none()
            })
            .map(|o| o.leaves_qty.0)
            .sum();
        let correlated_net: i64 = self
            .positions
            .iter()
            .filter(|(sym, _)| self.spec_for(sym).product_group == spec.product_group)
            .map(|(_, p)| p.net_qty.0)
            .sum();
        let daily_pnl = self.total_daily_pnl_micros()?;
        let bbo = self.bbo_cache.get(&intent.symbol).copied();
        let now_ns = now_unix_ns();
        let now_ms = now_ns / 1_000_000;

        self.risk.check_pre_trade(
            &intent,
            &spec,
            cur_pos,
            Qty(working_same_side),
            Qty(correlated_net),
            daily_pnl,
            bbo,
            now_ms,
            is_protective_exit,
        )?;

        let caps = self.adapter.capabilities();
        let protective_mode = match intent.order_class {
            OrderClass::Bracket { .. } => {
                if caps.supports_native_oco {
                    ProtectiveLegMode::BrokerNative
                } else {
                    ProtectiveLegMode::ClientManagedWarning
                }
            }
            _ => ProtectiveLegMode::BrokerNative,
        };

        // Step 1: Write-Ahead Intent Log (persisted to SQLite WAL BEFORE network transmit).
        if !self.orders.contains_key(&intent.client_order_id) {
            let rec = OrderRecord::from_intent(&intent, protective_mode, now_ns)?;
            self.journal.append(
                now_ns,
                &JournalEvent::IntentLogged {
                    intent: intent.clone(),
                    protective_leg_mode: protective_mode,
                },
            )?;
            self.orders.insert(intent.client_order_id.clone(), rec);

            if let OrderClass::Bracket {
                take_profit_price,
                stop_loss_price,
            } = intent.order_class
            {
                let bg = BracketGroup {
                    entry_client_id: intent.client_order_id.clone(),
                    take_profit_client_id: None,
                    stop_loss_client_id: None,
                    take_profit_price,
                    stop_loss_price,
                    protected_qty: Qty::ZERO,
                    mode: protective_mode,
                    closed_by_leg: None,
                };
                self.journal.append(
                    now_ns,
                    &JournalEvent::BracketRegistered {
                        entry_client_id: intent.client_order_id.clone(),
                        take_profit_price,
                        stop_loss_price,
                        mode: protective_mode,
                    },
                )?;
                self.brackets.insert(intent.client_order_id.clone(), bg);
            }
        }

        // Step 2: Transition to PendingNew in WAL before wire call.
        self.transition_order(
            &intent.client_order_id,
            OrderState::PendingNew,
            None,
            None,
        )?;

        // Step 3: Dispatch to ExecutionAdapter.
        match self.adapter.submit_order(&intent).await {
            Ok(ack) => {
                // Record broker_order_id and transition to Accepted (or broker's current working state).
                // Note: if broker filled immediately, fills will arrive via BrokerEvent or snapshot sync.
                let target = match ack.state {
                    OrderState::Filled | OrderState::PartiallyFilled => OrderState::Accepted,
                    other => other,
                };
                self.transition_order(
                    &intent.client_order_id,
                    target,
                    Some(ack.broker_order_id.clone()),
                    None,
                )?;

                // Register broker-native bracket child legs if returned in Ack
                if let OrderClass::Bracket {
                    take_profit_price,
                    stop_loss_price,
                } = intent.order_class
                {
                    if !ack.leg_broker_ids.is_empty() {
                        let exit_side = intent.side.opposite();
                        let mut tp_cid_opt = None;
                        let mut sl_cid_opt = None;
                        for (leg_cid, leg_bid) in &ack.leg_broker_ids {
                            let is_tp = leg_cid.as_str().ends_with("-tp");
                            let leg_type = if is_tp {
                                tp_cid_opt = Some(leg_cid.clone());
                                OrderType::Limit {
                                    limit_price: take_profit_price,
                                }
                            } else {
                                sl_cid_opt = Some(leg_cid.clone());
                                OrderType::Stop {
                                    stop_price: stop_loss_price,
                                }
                            };
                            let leg_intent = OrderIntent {
                                client_order_id: leg_cid.clone(),
                                symbol: intent.symbol.clone(),
                                side: exit_side,
                                qty: intent.qty,
                                order_type: leg_type,
                                order_class: OrderClass::Simple,
                                tif: intent.tif,
                                env: intent.env,
                                parent_client_order_id: Some(intent.client_order_id.clone()),
                                oco_sibling_id: None,
                            };
                            let ts = now_unix_ns();
                            if !self.orders.contains_key(leg_cid) {
                                let mut leg_rec =
                                    OrderRecord::from_intent(&leg_intent, protective_mode, ts)?;
                                leg_rec.broker_order_id = Some(leg_bid.clone());
                                leg_rec.state = OrderState::Accepted;
                                self.journal.append(
                                    ts,
                                    &JournalEvent::IntentLogged {
                                        intent: leg_intent,
                                        protective_leg_mode: protective_mode,
                                    },
                                )?;
                                self.journal.append(
                                    ts,
                                    &JournalEvent::StateTransition {
                                        client_order_id: leg_cid.clone(),
                                        broker_order_id: Some(leg_bid.clone()),
                                        new_state: OrderState::Accepted,
                                        reason: None,
                                    },
                                )?;
                                self.orders.insert(leg_cid.clone(), leg_rec);
                            }
                        }
                        if let Some(bg) = self.brackets.get_mut(&intent.client_order_id) {
                            bg.take_profit_client_id = tp_cid_opt.clone();
                            bg.stop_loss_client_id = sl_cid_opt.clone();
                            let ts = now_unix_ns();
                            self.journal.append(
                                ts,
                                &JournalEvent::BracketLegsUpdated {
                                    entry_client_id: intent.client_order_id.clone(),
                                    take_profit_client_id: tp_cid_opt,
                                    stop_loss_client_id: sl_cid_opt,
                                    protected_qty: bg.protected_qty,
                                    closed_by_leg: None,
                                },
                            )?;
                        }
                    }
                }

                Ok(self.orders.get(&intent.client_order_id).cloned().unwrap())
            }
            Err(AdapterError::AmbiguousTransport(detail)) => {
                // Transition to UnknownPendingReconcile — never blindly re-POST!
                self.transition_order(
                    &intent.client_order_id,
                    OrderState::UnknownPendingReconcile,
                    None,
                    Some(detail.clone()),
                )?;
                Err(OmsError::AmbiguousSubmit {
                    client_order_id: intent.client_order_id,
                    detail,
                })
            }
            Err(AdapterError::DuplicateClientOrderId(_)) => {
                if let Some(snap) = self
                    .adapter
                    .get_order_by_client_id(&intent.client_order_id)
                    .await?
                {
                    self.reconcile_single_snapshot(&snap)?;
                    return Ok(self.orders.get(&intent.client_order_id).cloned().unwrap());
                }
                Err(OmsError::Adapter(AdapterError::DuplicateClientOrderId(
                    intent.client_order_id,
                )))
            }
            Err(AdapterError::Rejected(reason)) => {
                self.transition_order(
                    &intent.client_order_id,
                    OrderState::Rejected,
                    None,
                    Some(reason.clone()),
                )?;
                Err(OmsError::Adapter(AdapterError::Rejected(reason)))
            }
            Err(other) => {
                self.transition_order(
                    &intent.client_order_id,
                    OrderState::UnknownPendingReconcile,
                    None,
                    Some(other.to_string()),
                )?;
                Err(OmsError::Adapter(other))
            }
        }
    }

    pub async fn cancel_order(&mut self, client_order_id: &ClientOrderId) -> Result<(), OmsError> {
        let bid = {
            let rec = self
                .orders
                .get(client_order_id)
                .ok_or_else(|| OmsError::OrderNotFound(client_order_id.clone()))?;
            if rec.state.is_terminal() {
                return Ok(());
            }
            rec.broker_order_id.clone()
        };

        self.transition_order(client_order_id, OrderState::PendingCancel, None, None)?;
        if let Some(broker_id) = bid {
            self.adapter.cancel_order(&broker_id).await?;
        }
        Ok(())
    }

    pub async fn replace_order(
        &mut self,
        client_order_id: &ClientOrderId,
        req: ReplaceOrderRequest,
    ) -> Result<(), OmsError> {
        let bid = {
            let rec = self
                .orders
                .get(client_order_id)
                .ok_or_else(|| OmsError::OrderNotFound(client_order_id.clone()))?;
            if rec.state.is_terminal() {
                return Err(OmsError::State(StateError::IllegalTransition {
                    client_order_id: client_order_id.clone(),
                    from: rec.state,
                    to: OrderState::PendingReplace,
                }));
            }
            rec.broker_order_id.clone().ok_or_else(|| {
                OmsError::Adapter(AdapterError::NotFound(client_order_id.0.clone()))
            })?
        };

        self.transition_order(client_order_id, OrderState::PendingReplace, None, None)?;
        let ack = self.adapter.replace_order(&bid, &req).await?;
        let new_type = if let Some(lp) = req.new_limit_price {
            Some(OrderType::Limit { limit_price: lp })
        } else {
            req.new_stop_price
                .map(|sp| OrderType::Stop { stop_price: sp })
        };
        let ts = now_unix_ns();
        if let Some(rec) = self.orders.get_mut(client_order_id) {
            rec.apply_replace(req.new_qty, new_type, ts)?;
        }
        self.journal.append(
            ts,
            &JournalEvent::OrderReplaced {
                client_order_id: client_order_id.clone(),
                new_qty: req.new_qty,
                new_order_type: new_type,
            },
        )?;
        self.transition_order(
            client_order_id,
            OrderState::Accepted,
            Some(ack.broker_order_id),
            None,
        )?;
        Ok(())
    }

    /// Process an asynchronous broker event (`trade_updates` WS or local paper event).
    pub async fn apply_broker_event(&mut self, event: BrokerEvent) -> Result<(), OmsError> {
        match event {
            BrokerEvent::Accepted {
                client_order_id,
                broker_order_id,
                ts_ns,
            } => {
                if let Some(rec) = self.orders.get(&client_order_id) {
                    if rec.state == OrderState::PendingNew
                        || rec.state == OrderState::UnknownPendingReconcile
                        || rec.state == OrderState::PendingReplace
                    {
                        self.transition_order(
                            &client_order_id,
                            OrderState::Accepted,
                            Some(broker_order_id),
                            None,
                        )?;
                    }
                } else if let Some(parent_cid) = client_order_id
                    .as_str()
                    .strip_suffix("-tp")
                    .or_else(|| client_order_id.as_str().strip_suffix("-sl"))
                {
                    // Auto-register native bracket child legs spawned dynamically by broker on entry fill.
                    let parent_key = ClientOrderId::from_raw(parent_cid);
                    if let (Some(parent), Some(bg)) = (
                        self.orders.get(&parent_key).cloned(),
                        self.brackets.get(&parent_key).cloned(),
                    ) {
                        let is_tp = client_order_id.as_str().ends_with("-tp");
                        let leg_type = if is_tp {
                            OrderType::Limit {
                                limit_price: bg.take_profit_price,
                            }
                        } else {
                            OrderType::Stop {
                                stop_price: bg.stop_loss_price,
                            }
                        };
                        let leg_qty = if parent.cum_filled_qty.0 > 0 {
                            parent.cum_filled_qty
                        } else {
                            parent.order_qty
                        };
                        let leg_intent = OrderIntent {
                            client_order_id: client_order_id.clone(),
                            symbol: parent.symbol.clone(),
                            side: parent.side.opposite(),
                            qty: leg_qty,
                            order_type: leg_type,
                            order_class: OrderClass::Simple,
                            tif: parent.tif,
                            env: parent.env,
                            parent_client_order_id: Some(parent_key.clone()),
                            oco_sibling_id: None,
                        };
                        let mut leg_rec =
                            OrderRecord::from_intent(&leg_intent, bg.mode, ts_ns)?;
                        leg_rec.broker_order_id = Some(broker_order_id.clone());
                        leg_rec.state = OrderState::Accepted;
                        self.journal.append(
                            ts_ns,
                            &JournalEvent::IntentLogged {
                                intent: leg_intent,
                                protective_leg_mode: bg.mode,
                            },
                        )?;
                        self.journal.append(
                            ts_ns,
                            &JournalEvent::StateTransition {
                                client_order_id: client_order_id.clone(),
                                broker_order_id: Some(broker_order_id),
                                new_state: OrderState::Accepted,
                                reason: None,
                            },
                        )?;
                        self.orders.insert(client_order_id.clone(), leg_rec);

                        if let Some(b) = self.brackets.get_mut(&parent_key) {
                            if is_tp {
                                b.take_profit_client_id = Some(client_order_id.clone());
                            } else {
                                b.stop_loss_client_id = Some(client_order_id.clone());
                            }
                            b.protected_qty = leg_qty;
                            self.journal.append(
                                ts_ns,
                                &JournalEvent::BracketLegsUpdated {
                                    entry_client_id: parent_key,
                                    take_profit_client_id: b.take_profit_client_id.clone(),
                                    stop_loss_client_id: b.stop_loss_client_id.clone(),
                                    protected_qty: b.protected_qty,
                                    closed_by_leg: b.closed_by_leg.clone(),
                                },
                            )?;
                        }
                    }
                }
            }
            BrokerEvent::Fill(fill) => {
                self.handle_fill_event(fill).await?;
            }
            BrokerEvent::Canceled {
                client_order_id,
                broker_order_id,
                ..
            } => {
                if let Some(rec) = self.orders.get(&client_order_id) {
                    if !rec.state.is_terminal() {
                        self.transition_order(
                            &client_order_id,
                            OrderState::Canceled,
                            Some(broker_order_id),
                            None,
                        )?;
                    }
                }
            }
            BrokerEvent::Replaced {
                client_order_id,
                new_qty,
                new_order_type,
                ts_ns,
                ..
            } => {
                if let Some(rec) = self.orders.get_mut(&client_order_id) {
                    if !rec.state.is_terminal() {
                        rec.apply_replace(new_qty, new_order_type, ts_ns)?;
                        self.journal.append(
                            ts_ns,
                            &JournalEvent::OrderReplaced {
                                client_order_id: client_order_id.clone(),
                                new_qty,
                                new_order_type,
                            },
                        )?;
                    }
                }
            }
            BrokerEvent::Rejected {
                client_order_id,
                reason,
                ..
            } => {
                if let Some(rec) = self.orders.get(&client_order_id) {
                    if !rec.state.is_terminal() {
                        self.transition_order(
                            &client_order_id,
                            OrderState::Rejected,
                            None,
                            Some(reason),
                        )?;
                    }
                }
            }
            BrokerEvent::Expired {
                client_order_id,
                broker_order_id,
                ..
            } => {
                if let Some(rec) = self.orders.get(&client_order_id) {
                    if !rec.state.is_terminal() {
                        self.transition_order(
                            &client_order_id,
                            OrderState::Expired,
                            Some(broker_order_id),
                            None,
                        )?;
                    }
                }
            }
            BrokerEvent::StreamDisconnected { .. } => {
                // R04 §3.5: Immediately enter RECONCILING blocking new orders until synced!
                self.reconciling.store(true, Ordering::SeqCst);
            }
            BrokerEvent::StreamReconnected { .. } => {
                let _ = self.reconcile_with_broker().await?;
            }
        }
        Ok(())
    }

    async fn handle_fill_event(&mut self, fill: FillEvent) -> Result<(), OmsError> {
        // Ignore unknown flatten fills if not tracked, or track position accurately
        let applied = if let Some(rec) = self.orders.get_mut(&fill.client_order_id) {
            rec.apply_fill(&fill)?
        } else {
            // If this is a kill-switch flatten fill created server-side, apply directly to position
            if fill.client_order_id.as_str().contains("flatten-") {
                let spec = self.spec_for(&fill.symbol);
                let pos = self
                    .positions
                    .entry(fill.symbol.clone())
                    .or_insert_with(|| Position::flat(&fill.symbol));
                pos.apply_fill(&spec, fill.side, fill.fill_qty, fill.fill_price)?;
                self.journal
                    .append(fill.ts_ns, &JournalEvent::FillApplied { fill })?;
            }
            return Ok(());
        };

        if !applied {
            // Deduplicated by exec_id — zero double fills!
            return Ok(());
        }

        self.journal
            .append(fill.ts_ns, &JournalEvent::FillApplied { fill: fill.clone() })?;
        let spec = self.spec_for(&fill.symbol);
        let pos = self
            .positions
            .entry(fill.symbol.clone())
            .or_insert_with(|| Position::flat(&fill.symbol));
        pos.apply_fill(&spec, fill.side, fill.fill_qty, fill.fill_price)?;

        // Check if this fill is on a Bracket entry order -> scale protective OCO legs strictly to cum_filled_qty!
        if let Some(bg) = self.brackets.get(&fill.client_order_id).cloned() {
            let entry_rec = self.orders.get(&fill.client_order_id).cloned().unwrap();
            let target_qty = entry_rec.cum_filled_qty;

            if bg.mode == ProtectiveLegMode::ClientManagedWarning {
                // Client-managed fallback: spawn or scale TP & SL legs strictly to `cum_filled_qty`!
                if bg.take_profit_client_id.is_none() && bg.stop_loss_client_id.is_none() {
                    let tp_cid =
                        ClientOrderId::from_raw(format!("{}-tp", entry_rec.client_order_id.0));
                    let sl_cid =
                        ClientOrderId::from_raw(format!("{}-sl", entry_rec.client_order_id.0));
                    let exit_side = entry_rec.side.opposite();

                    let tp_intent = OrderIntent {
                        client_order_id: tp_cid.clone(),
                        symbol: entry_rec.symbol.clone(),
                        side: exit_side,
                        qty: target_qty,
                        order_type: OrderType::Limit {
                            limit_price: bg.take_profit_price,
                        },
                        order_class: OrderClass::Simple,
                        tif: TimeInForce::Gtc,
                        env: entry_rec.env,
                        parent_client_order_id: Some(entry_rec.client_order_id.clone()),
                        oco_sibling_id: Some(sl_cid.clone()),
                    };
                    let sl_intent = OrderIntent {
                        client_order_id: sl_cid.clone(),
                        symbol: entry_rec.symbol.clone(),
                        side: exit_side,
                        qty: target_qty,
                        order_type: OrderType::Stop {
                            stop_price: bg.stop_loss_price,
                        },
                        order_class: OrderClass::Simple,
                        tif: TimeInForce::Gtc,
                        env: entry_rec.env,
                        parent_client_order_id: Some(entry_rec.client_order_id.clone()),
                        oco_sibling_id: Some(tp_cid.clone()),
                    };

                    Box::pin(self.submit_order_internal(tp_intent, true)).await?;
                    Box::pin(self.submit_order_internal(sl_intent, true)).await?;

                    if let Some(b) = self.brackets.get_mut(&entry_rec.client_order_id) {
                        b.take_profit_client_id = Some(tp_cid.clone());
                        b.stop_loss_client_id = Some(sl_cid.clone());
                        b.protected_qty = target_qty;
                    }
                    self.journal.append(
                        now_unix_ns(),
                        &JournalEvent::BracketLegsUpdated {
                            entry_client_id: entry_rec.client_order_id.clone(),
                            take_profit_client_id: Some(tp_cid),
                            stop_loss_client_id: Some(sl_cid),
                            protected_qty: target_qty,
                            closed_by_leg: None,
                        },
                    )?;
                } else if target_qty > bg.protected_qty {
                    // Subsequent partial fill: scale existing TP & SL legs up to `target_qty`!
                    for leg_cid in [bg.take_profit_client_id.clone(), bg.stop_loss_client_id.clone()]
                        .into_iter()
                        .flatten()
                    {
                        if let Some(leg) = self.orders.get(&leg_cid) {
                            if leg.state.is_working() {
                                let _ = self
                                    .replace_order(
                                        &leg_cid,
                                        ReplaceOrderRequest {
                                            new_qty: Some(target_qty),
                                            new_limit_price: None,
                                            new_stop_price: None,
                                        },
                                    )
                                    .await;
                            }
                        }
                    }
                    if let Some(b) = self.brackets.get_mut(&entry_rec.client_order_id) {
                        b.protected_qty = target_qty;
                        self.journal.append(
                            now_unix_ns(),
                            &JournalEvent::BracketLegsUpdated {
                                entry_client_id: entry_rec.client_order_id.clone(),
                                take_profit_client_id: b.take_profit_client_id.clone(),
                                stop_loss_client_id: b.stop_loss_client_id.clone(),
                                protected_qty: target_qty,
                                closed_by_leg: b.closed_by_leg.clone(),
                            },
                        )?;
                    }
                }
            } else {
                // Broker-native bracket: update tracked `protected_qty` strictly to `cum_filled_qty`
                if let Some(b) = self.brackets.get_mut(&entry_rec.client_order_id) {
                    b.protected_qty = target_qty;
                    self.journal.append(
                        now_unix_ns(),
                        &JournalEvent::BracketLegsUpdated {
                            entry_client_id: entry_rec.client_order_id.clone(),
                            take_profit_client_id: b.take_profit_client_id.clone(),
                            stop_loss_client_id: b.stop_loss_client_id.clone(),
                            protected_qty: target_qty,
                            closed_by_leg: b.closed_by_leg.clone(),
                        },
                    )?;
                }
            }
        }

        // Check if this fill is on an OCO leg -> atomically cancel sibling if still working!
        let sibling_to_cancel: Option<(ClientOrderId, Option<ClientOrderId>)> = self
            .orders
            .get(&fill.client_order_id)
            .and_then(|rec| {
                let sib = rec.oco_sibling_id.clone().or_else(|| {
                    rec.parent_client_order_id.as_ref().and_then(|parent_id| {
                        self.brackets.get(parent_id).and_then(|bg| {
                            if bg.take_profit_client_id.as_ref() == Some(&fill.client_order_id) {
                                bg.stop_loss_client_id.clone()
                            } else if bg.stop_loss_client_id.as_ref() == Some(&fill.client_order_id)
                            {
                                bg.take_profit_client_id.clone()
                            } else {
                                None
                            }
                        })
                    })
                });
                sib.map(|s| (s, rec.parent_client_order_id.clone()))
            });

        if let Some((sib_cid, parent_opt)) = sibling_to_cancel {
            if let Some(sib_rec) = self.orders.get(&sib_cid) {
                if sib_rec.state.is_working() {
                    let _ = self.cancel_order(&sib_cid).await;
                }
            }
            if let Some(parent_id) = parent_opt {
                if let Some(b) = self.brackets.get_mut(&parent_id) {
                    b.closed_by_leg = Some(fill.client_order_id.clone());
                }
            }
        }

        Ok(())
    }

    /// 4-Step Atomic Panic Kill-Switch & Flatten-All Protocol (`R04` §3.6 & `S06-T5`).
    pub async fn trigger_kill_switch(
        &mut self,
        reason: &str,
    ) -> Result<KillSwitchReport, OmsError> {
        let total_start = Instant::now();

        // Step 1: HALT OMS immediately (lock-free atomic flag)
        self.halted.store(true, Ordering::SeqCst);
        let halt_latency_ns = total_start.elapsed().as_nanos() as u64;

        // Step 2: CANCEL ALL WORKING ORDERS (bulk cancel + parallel per-order fallback)
        let mut canceled_orders = self.adapter.cancel_all_orders().await.unwrap_or(0);
        let stray_after_bulk = self.adapter.list_open_orders().await?;
        for stray in stray_after_bulk {
            if self.adapter.cancel_order(&stray.broker_order_id).await.is_ok() {
                canceled_orders += 1;
            }
        }

        // Step 3: VERIFY ZERO WORKING ORDERS
        let remaining_working = self.adapter.list_open_orders().await?;
        let remaining_working_orders = remaining_working.len();

        // Mark all local working orders as Canceled in memory & WAL
        let local_working_ids: Vec<ClientOrderId> = self
            .orders
            .values()
            .filter(|o| o.state.is_working())
            .map(|o| o.client_order_id.clone())
            .collect();
        for cid in local_working_ids {
            let _ = self.transition_order(&cid, OrderState::Canceled, None, Some(reason.into()));
        }

        // Step 4: MARKETABLE FLATTEN + VERIFY FLAT
        let flattened_positions = self.adapter.close_all_positions().await?;
        let remaining_positions = self.adapter.list_positions().await?;
        let remaining_open_positions = remaining_positions
            .iter()
            .filter(|p| p.net_qty.0 != 0)
            .count();

        // Zero local positions if broker verified flat
        if remaining_open_positions == 0 {
            for pos in self.positions.values_mut() {
                pos.net_qty = Qty::ZERO;
                pos.avg_entry_price = PriceTicks::ZERO;
            }
        }

        let total_latency_ns = total_start.elapsed().as_nanos() as u64;
        self.journal.append(
            now_unix_ns(),
            &JournalEvent::KillSwitchTriggered {
                reason: reason.to_string(),
                canceled_orders,
                flattened_positions,
            },
        )?;

        Ok(KillSwitchReport {
            halt_latency_ns,
            total_latency_ns,
            canceled_orders,
            flattened_positions,
            remaining_working_orders,
            remaining_open_positions,
            verified_flat: remaining_working_orders == 0 && remaining_open_positions == 0,
        })
    }

    /// Reconcile WAL-replayed or post-disconnect OMS state against authoritative broker snapshots.
    pub async fn reconcile_with_broker(&mut self) -> Result<ReconciliationReport, OmsError> {
        self.reconciling.store(true, Ordering::SeqCst);
        let start = Instant::now();

        let broker_orders = self.adapter.list_all_orders().await?;
        let broker_positions = self.adapter.list_positions().await?;

        let mut broker_by_cid: HashMap<ClientOrderId, BrokerOrderSnapshot> = HashMap::new();
        for bo in &broker_orders {
            broker_by_cid.insert(bo.client_order_id.clone(), bo.clone());
        }

        let mut missed_fills_recovered = 0usize;
        let mut unknown_orders_resolved = 0usize;
        let mut states_updated = 0usize;
        let mut known_cids: HashSet<ClientOrderId> = HashSet::new();

        let local_cids: Vec<ClientOrderId> = self.orders.keys().cloned().collect();
        for cid in local_cids {
            known_cids.insert(cid.clone());
            let local_rec = self.orders.get(&cid).cloned().unwrap();
            let was_unknown = local_rec.state == OrderState::UnknownPendingReconcile;

            if let Some(snap) = broker_by_cid.get(&cid) {
                let (mf, su) = self.reconcile_single_snapshot(snap)?;
                missed_fills_recovered += mf;
                states_updated += su;
                if was_unknown && self.orders.get(&cid).map(|r| r.state) != Some(OrderState::UnknownPendingReconcile) {
                    unknown_orders_resolved += 1;
                }
            } else if local_rec.state.is_working() {
                // Local order is PendingNew / UnknownPendingReconcile, and broker has no record of it!
                // Double-check via direct `get_order_by_client_id`.
                if let Some(snap) = self.adapter.get_order_by_client_id(&cid).await? {
                    let (mf, su) = self.reconcile_single_snapshot(&snap)?;
                    missed_fills_recovered += mf;
                    states_updated += su;
                    if was_unknown {
                        unknown_orders_resolved += 1;
                    }
                } else {
                    self.transition_order(
                        &cid,
                        OrderState::Rejected,
                        None,
                        Some("not found on broker during crash reconciliation".to_string()),
                    )?;
                    states_updated += 1;
                    if was_unknown {
                        unknown_orders_resolved += 1;
                    }
                }
            }
        }

        // Detect orphan working orders on broker not present in our local WAL journal
        let mut orphan_broker_orders = Vec::new();
        for bo in &broker_orders {
            if !known_cids.contains(&bo.client_order_id) && bo.state.is_working() {
                // Exclude child legs whose parent we know (re-attach them cleanly!)
                let is_known_bracket_leg = bo
                    .client_order_id
                    .as_str()
                    .strip_suffix("-tp")
                    .or_else(|| bo.client_order_id.as_str().strip_suffix("-sl"))
                    .map(|p| known_cids.contains(&ClientOrderId::from_raw(p)))
                    .unwrap_or(false);
                if !is_known_bracket_leg {
                    orphan_broker_orders.push(bo.clone());
                }
            }
        }

        // Verify local positions match broker positions 100%
        let mut position_mismatches = Vec::new();
        let mut broker_pos_map: HashMap<String, Qty> = HashMap::new();
        for bp in &broker_positions {
            broker_pos_map.insert(bp.symbol.clone(), bp.net_qty);
        }
        let all_syms: HashSet<String> = self
            .positions
            .keys()
            .cloned()
            .chain(broker_pos_map.keys().cloned())
            .collect();
        for sym in all_syms {
            let local_qty = self.get_position(&sym).net_qty;
            let broker_qty = broker_pos_map.get(&sym).copied().unwrap_or(Qty::ZERO);
            if local_qty != broker_qty {
                position_mismatches.push(format!(
                    "{sym}: local={} != broker={}",
                    local_qty.0, broker_qty.0
                ));
            }
        }

        let clean = orphan_broker_orders.is_empty() && position_mismatches.is_empty();
        if clean {
            self.reconciling.store(false, Ordering::SeqCst);
        }

        let reconcile_ns = start.elapsed().as_nanos() as u64;
        self.journal.append(
            now_unix_ns(),
            &JournalEvent::ReconciliationNote {
                summary: format!(
                    "clean={clean}, missed_fills={missed_fills_recovered}, unknown_resolved={unknown_orders_resolved}, orphans={}, pos_mismatches={}",
                    orphan_broker_orders.len(),
                    position_mismatches.len()
                ),
            },
        )?;

        Ok(ReconciliationReport {
            wal_events_replayed: self.wal_events_replayed,
            wal_replay_ns: self.wal_replay_ns,
            reconcile_ns,
            missed_fills_recovered,
            unknown_orders_resolved,
            states_updated,
            orphan_broker_orders,
            position_mismatches,
            clean,
        })
    }

    fn reconcile_single_snapshot(
        &mut self,
        snap: &BrokerOrderSnapshot,
    ) -> Result<(usize, usize), OmsError> {
        let mut missed_fills = 0usize;
        let mut states_updated = 0usize;

        let local = match self.orders.get(&snap.client_order_id) {
            Some(r) => r.clone(),
            None => return Ok((0, 0)),
        };

        // Recover any missed fills strictly using exact integer notional difference!
        if snap.cum_filled_qty.0 > local.cum_filled_qty.0 {
            let delta_qty = Qty(snap.cum_filled_qty.0 - local.cum_filled_qty.0);
            let total_notional =
                (snap.cum_filled_qty.0 as i128) * (snap.avg_fill_price.0 as i128);
            let delta_notional = total_notional - local.fill_notional_ticks;
            let delta_price = PriceTicks((delta_notional / (delta_qty.0 as i128)) as i64);

            let synth_fill = FillEvent {
                exec_id: format!(
                    "RECON-{}-{}",
                    snap.broker_order_id, snap.cum_filled_qty.0
                ),
                client_order_id: snap.client_order_id.clone(),
                broker_order_id: snap.broker_order_id.clone(),
                symbol: snap.symbol.clone(),
                side: snap.side,
                fill_qty: delta_qty,
                fill_price: delta_price,
                ts_ns: now_unix_ns(),
            };

            let applied = if let Some(rec) = self.orders.get_mut(&snap.client_order_id) {
                rec.apply_fill(&synth_fill)?
            } else {
                false
            };
            if applied {
                self.journal.append(
                    synth_fill.ts_ns,
                    &JournalEvent::FillApplied {
                        fill: synth_fill.clone(),
                    },
                )?;
                let spec = self.spec_for(&synth_fill.symbol);
                let pos = self
                    .positions
                    .entry(synth_fill.symbol.clone())
                    .or_insert_with(|| Position::flat(&synth_fill.symbol));
                pos.apply_fill(
                    &spec,
                    synth_fill.side,
                    synth_fill.fill_qty,
                    synth_fill.fill_price,
                )?;
                missed_fills += 1;
                states_updated += 1;
            }
        }

        // Sync state if broker state differs (e.g., PendingCancel -> Canceled, PendingNew -> Accepted)
        let current_state = self
            .orders
            .get(&snap.client_order_id)
            .map(|r| r.state)
            .unwrap();
        if current_state != snap.state && current_state.can_transition_to(snap.state) {
            self.transition_order(
                &snap.client_order_id,
                snap.state,
                Some(snap.broker_order_id.clone()),
                None,
            )?;
            states_updated += 1;
        }

        Ok((missed_fills, states_updated))
    }

    fn transition_order(
        &mut self,
        client_order_id: &ClientOrderId,
        next: OrderState,
        broker_order_id: Option<String>,
        reason: Option<String>,
    ) -> Result<(), OmsError> {
        let ts_ns = now_unix_ns();
        let rec = self
            .orders
            .get_mut(client_order_id)
            .ok_or_else(|| OmsError::OrderNotFound(client_order_id.clone()))?;
        rec.transition(next, broker_order_id.clone(), reason.clone(), ts_ns)?;
        self.journal.append(
            ts_ns,
            &JournalEvent::StateTransition {
                client_order_id: client_order_id.clone(),
                broker_order_id,
                new_state: next,
                reason,
            },
        )?;
        Ok(())
    }
}
