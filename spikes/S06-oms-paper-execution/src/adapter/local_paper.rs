use crate::adapter::{
    AdapterCapabilities, AdapterError, BrokerAccountSnapshot, BrokerEvent, BrokerOrderAck,
    BrokerOrderSnapshot, BrokerPositionSnapshot, ExecutionAdapter, ReplaceOrderRequest,
};
use crate::state::OrderState;
use crate::types::{
    now_unix_ns, ClientOrderId, ExecutionEnv, FillEvent, InstrumentSpec, MoneyMicros, OrderClass,
    OrderIntent, OrderType, Position, PriceTicks, Qty, Side,
};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::broadcast;

#[derive(Debug, Clone)]
pub enum PartialFillPolicy {
    /// Fill market/marketable orders in 1 fill.
    Full,
    /// Deterministic partial fill chunks (e.g., `[3, 7]` splits a 10-lot into 3 then 7).
    FixedChunks(Vec<i64>),
    /// Split every N-th order into 40% + 60% partial fills (mirrors Alpaca's 10% partial-fill testability).
    EveryNthSplit { every_n: u64 },
}

#[derive(Debug, Clone)]
pub struct LocalPaperConfig {
    pub simulated_latency: Duration,
    pub partial_fill_policy: PartialFillPolicy,
    pub supports_native_oco: bool,
    pub initial_equity_micros: MoneyMicros,
}

impl Default for LocalPaperConfig {
    fn default() -> Self {
        Self {
            simulated_latency: Duration::ZERO,
            partial_fill_policy: PartialFillPolicy::Full,
            supports_native_oco: true,
            initial_equity_micros: MoneyMicros::from_dollars(100_000),
        }
    }
}

#[derive(Debug, Clone)]
struct SimOrder {
    broker_order_id: String,
    client_order_id: ClientOrderId,
    symbol: String,
    side: Side,
    order_qty: Qty,
    cum_filled_qty: Qty,
    fill_notional_ticks: i128,
    avg_fill_price: PriceTicks,
    order_type: OrderType,
    order_class: OrderClass,
    state: OrderState,
    parent_broker_order_id: Option<String>,
    oco_sibling_broker_id: Option<String>,
    /// High/low water mark for trailing stop orders.
    trail_watermark: Option<PriceTicks>,
    /// Whether child legs for a native bracket have been spawned.
    native_legs_spawned: bool,
    tp_broker_id: Option<String>,
    sl_broker_id: Option<String>,
}

struct SimInner {
    specs: HashMap<String, InstrumentSpec>,
    last_prices: HashMap<String, PriceTicks>,
    orders_by_broker_id: HashMap<String, SimOrder>,
    broker_id_by_client_id: HashMap<ClientOrderId, String>,
    positions: HashMap<String, Position>,
    next_order_seq: u64,
    next_exec_seq: u64,
    submit_count: u64,
    /// Optional fault injection: fail next submit before/after storing order.
    inject_ambiguous_after_commit: bool,
    inject_ambiguous_before_commit: bool,
    config: LocalPaperConfig,
}

/// Deterministic in-process Paper Simulator (`R04` Core v0.1/v0.2).
/// Zero network dependencies, 100% fixed-point integer math.
pub struct LocalPaperAdapter {
    inner: Arc<Mutex<SimInner>>,
    events_tx: broadcast::Sender<BrokerEvent>,
}

impl LocalPaperAdapter {
    pub fn new(config: LocalPaperConfig, specs: Vec<InstrumentSpec>) -> Self {
        let mut spec_map = HashMap::new();
        for s in specs {
            spec_map.insert(s.symbol.clone(), s);
        }
        let (tx, _) = broadcast::channel(4096);
        Self {
            inner: Arc::new(Mutex::new(SimInner {
                specs: spec_map,
                last_prices: HashMap::new(),
                orders_by_broker_id: HashMap::new(),
                broker_id_by_client_id: HashMap::new(),
                positions: HashMap::new(),
                next_order_seq: 1,
                next_exec_seq: 1,
                submit_count: 0,
                inject_ambiguous_after_commit: false,
                inject_ambiguous_before_commit: false,
                config,
            })),
            events_tx: tx,
        }
    }

    pub fn set_market_price(&self, symbol: &str, price: PriceTicks) {
        let mut events = Vec::new();
        {
            let mut st = self.inner.lock().expect("sim lock");
            st.last_prices.insert(symbol.to_string(), price);
            evaluate_working_orders(&mut st, symbol, price, &mut events);
        }
        for ev in events {
            let _ = self.events_tx.send(ev);
        }
    }

    pub fn set_partial_fill_policy(&self, policy: PartialFillPolicy) {
        let mut st = self.inner.lock().expect("sim lock");
        st.config.partial_fill_policy = policy;
    }

    pub fn inject_ambiguous_error(&self, after_commit: bool) {
        let mut st = self.inner.lock().expect("sim lock");
        if after_commit {
            st.inject_ambiguous_after_commit = true;
        } else {
            st.inject_ambiguous_before_commit = true;
        }
    }

    /// Directly execute a partial or full fill on the simulated venue (useful for crash-recovery tests
    /// where fills happen while the OMS is offline and not subscribed to events).
    pub fn simulate_venue_fill(
        &self,
        client_order_id: &ClientOrderId,
        fill_qty: Qty,
        fill_price: PriceTicks,
        emit_event: bool,
    ) -> Result<FillEvent, AdapterError> {
        let mut events = Vec::new();
        let fill = {
            let mut st = self.inner.lock().expect("sim lock");
            let bid = st
                .broker_id_by_client_id
                .get(client_order_id)
                .cloned()
                .ok_or_else(|| AdapterError::NotFound(client_order_id.0.clone()))?;
            apply_sim_fill(&mut st, &bid, fill_qty, fill_price, &mut events)?
        };
        if emit_event {
            for ev in events {
                let _ = self.events_tx.send(ev);
            }
        }
        Ok(fill)
    }

    /// Cancel an order directly on the venue while OMS is offline.
    pub fn simulate_venue_cancel(
        &self,
        client_order_id: &ClientOrderId,
        emit_event: bool,
    ) -> Result<(), AdapterError> {
        let mut events = Vec::new();
        {
            let mut st = self.inner.lock().expect("sim lock");
            let bid = st
                .broker_id_by_client_id
                .get(client_order_id)
                .cloned()
                .ok_or_else(|| AdapterError::NotFound(client_order_id.0.clone()))?;
            if let Some(ord) = st.orders_by_broker_id.get_mut(&bid) {
                if !ord.state.is_terminal() {
                    ord.state = OrderState::Canceled;
                    events.push(BrokerEvent::Canceled {
                        client_order_id: ord.client_order_id.clone(),
                        broker_order_id: ord.broker_order_id.clone(),
                        ts_ns: now_unix_ns(),
                    });
                }
            }
        }
        if emit_event {
            for ev in events {
                let _ = self.events_tx.send(ev);
            }
        }
        Ok(())
    }

    /// Insert an unjournaled orphan working order on the venue (for crash-reconciliation detection tests).
    pub fn inject_orphan_working_order(
        &self,
        client_order_id: ClientOrderId,
        symbol: &str,
        side: Side,
        qty: Qty,
        limit_price: PriceTicks,
    ) -> String {
        let mut st = self.inner.lock().expect("sim lock");
        let seq = st.next_order_seq;
        st.next_order_seq += 1;
        let bid = format!("SIM-ORPHAN-{seq}");
        let ord = SimOrder {
            broker_order_id: bid.clone(),
            client_order_id: client_order_id.clone(),
            symbol: symbol.to_string(),
            side,
            order_qty: qty,
            cum_filled_qty: Qty::ZERO,
            fill_notional_ticks: 0,
            avg_fill_price: PriceTicks::ZERO,
            order_type: OrderType::Limit { limit_price },
            order_class: OrderClass::Simple,
            state: OrderState::Accepted,
            parent_broker_order_id: None,
            oco_sibling_broker_id: None,
            trail_watermark: None,
            native_legs_spawned: false,
            tp_broker_id: None,
            sl_broker_id: None,
        };
        st.broker_id_by_client_id
            .insert(client_order_id, bid.clone());
        st.orders_by_broker_id.insert(bid.clone(), ord);
        bid
    }

    pub fn total_order_count(&self) -> usize {
        self.inner.lock().expect("sim lock").orders_by_broker_id.len()
    }
}

fn to_snapshot(o: &SimOrder) -> BrokerOrderSnapshot {
    BrokerOrderSnapshot {
        broker_order_id: o.broker_order_id.clone(),
        client_order_id: o.client_order_id.clone(),
        symbol: o.symbol.clone(),
        side: o.side,
        order_qty: o.order_qty,
        cum_filled_qty: o.cum_filled_qty,
        avg_fill_price: o.avg_fill_price,
        order_type: o.order_type,
        state: o.state,
        parent_broker_order_id: o.parent_broker_order_id.clone(),
    }
}

fn compute_fill_chunks(st: &SimInner, total_qty: i64) -> Vec<i64> {
    match &st.config.partial_fill_policy {
        PartialFillPolicy::Full => vec![total_qty],
        PartialFillPolicy::FixedChunks(chunks) => {
            let mut out = Vec::new();
            let mut rem = total_qty;
            for &c in chunks {
                if rem <= 0 {
                    break;
                }
                let take = c.min(rem);
                if take > 0 {
                    out.push(take);
                    rem -= take;
                }
            }
            if rem > 0 {
                out.push(rem);
            }
            out
        }
        PartialFillPolicy::EveryNthSplit { every_n } => {
            if *every_n > 0 && st.submit_count % *every_n == 0 && total_qty >= 2 {
                let first = (total_qty * 4 / 10).max(1);
                let second = total_qty - first;
                vec![first, second]
            } else {
                vec![total_qty]
            }
        }
    }
}

fn apply_sim_fill(
    st: &mut SimInner,
    broker_order_id: &str,
    fill_qty: Qty,
    fill_price: PriceTicks,
    events: &mut Vec<BrokerEvent>,
) -> Result<FillEvent, AdapterError> {
    let exec_seq = st.next_exec_seq;
    st.next_exec_seq += 1;
    let exec_id = format!("SIM-EXEC-{exec_seq}");
    let ts_ns = now_unix_ns();

    let (client_order_id, symbol, side, new_cum, order_class, oco_sibling, native_oco, tp_id, sl_id) = {
        let ord = st
            .orders_by_broker_id
            .get_mut(broker_order_id)
            .ok_or_else(|| AdapterError::NotFound(broker_order_id.to_string()))?;
        if ord.state.is_terminal() {
            return Err(AdapterError::Rejected(format!(
                "cannot fill terminal order {broker_order_id} in state {:?}",
                ord.state
            )));
        }
        let rem = ord.order_qty.0 - ord.cum_filled_qty.0;
        let actual_qty = fill_qty.0.min(rem);
        if actual_qty <= 0 {
            return Err(AdapterError::Rejected("no leaves_qty remaining".to_string()));
        }
        ord.cum_filled_qty = Qty(ord.cum_filled_qty.0 + actual_qty);
        ord.fill_notional_ticks += (actual_qty as i128) * (fill_price.0 as i128);
        ord.avg_fill_price =
            PriceTicks((ord.fill_notional_ticks / (ord.cum_filled_qty.0 as i128)) as i64);
        ord.state = if ord.cum_filled_qty == ord.order_qty {
            OrderState::Filled
        } else {
            OrderState::PartiallyFilled
        };
        (
            ord.client_order_id.clone(),
            ord.symbol.clone(),
            ord.side,
            ord.cum_filled_qty,
            ord.order_class,
            ord.oco_sibling_broker_id.clone(),
            st.config.supports_native_oco,
            ord.tp_broker_id.clone(),
            ord.sl_broker_id.clone(),
        )
    };

    // Update simulated position
    let spec = st
        .specs
        .get(&symbol)
        .cloned()
        .unwrap_or_else(|| InstrumentSpec::us_equity(&symbol));
    let pos = st
        .positions
        .entry(symbol.clone())
        .or_insert_with(|| Position::flat(&symbol));
    pos.apply_fill(&spec, side, fill_qty, fill_price)
        .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;

    let fill_ev = FillEvent {
        exec_id,
        client_order_id: client_order_id.clone(),
        broker_order_id: broker_order_id.to_string(),
        symbol: symbol.clone(),
        side,
        fill_qty,
        fill_price,
        ts_ns,
    };
    events.push(BrokerEvent::Fill(fill_ev.clone()));

    // Native bracket handling: spawn or scale TP & SL OCO legs strictly to `new_cum`!
    if native_oco {
        if let OrderClass::Bracket {
            take_profit_price,
            stop_loss_price,
        } = order_class
        {
            if let (Some(tp_bid), Some(sl_bid)) = (tp_id, sl_id) {
                // Scale existing working legs to match `new_cum`
                for leg_bid in [tp_bid, sl_bid] {
                    if let Some(leg) = st.orders_by_broker_id.get_mut(&leg_bid) {
                        if !leg.state.is_terminal() {
                            leg.order_qty = new_cum;
                            events.push(BrokerEvent::Replaced {
                                client_order_id: leg.client_order_id.clone(),
                                broker_order_id: leg.broker_order_id.clone(),
                                new_qty: Some(new_cum),
                                new_order_type: None,
                                ts_ns,
                            });
                        }
                    }
                }
            } else {
                // Spawn atomic OCO child legs sized strictly to `new_cum`
                let tp_seq = st.next_order_seq;
                st.next_order_seq += 1;
                let sl_seq = st.next_order_seq;
                st.next_order_seq += 1;
                let tp_bid = format!("SIM-ORD-{tp_seq}");
                let sl_bid = format!("SIM-ORD-{sl_seq}");
                let tp_cid = ClientOrderId::from_raw(format!("{}-tp", client_order_id.0));
                let sl_cid = ClientOrderId::from_raw(format!("{}-sl", client_order_id.0));
                let exit_side = side.opposite();

                let tp_ord = SimOrder {
                    broker_order_id: tp_bid.clone(),
                    client_order_id: tp_cid.clone(),
                    symbol: symbol.clone(),
                    side: exit_side,
                    order_qty: new_cum,
                    cum_filled_qty: Qty::ZERO,
                    fill_notional_ticks: 0,
                    avg_fill_price: PriceTicks::ZERO,
                    order_type: OrderType::Limit {
                        limit_price: take_profit_price,
                    },
                    order_class: OrderClass::Simple,
                    state: OrderState::Accepted,
                    parent_broker_order_id: Some(broker_order_id.to_string()),
                    oco_sibling_broker_id: Some(sl_bid.clone()),
                    trail_watermark: None,
                    native_legs_spawned: true,
                    tp_broker_id: None,
                    sl_broker_id: None,
                };
                let sl_ord = SimOrder {
                    broker_order_id: sl_bid.clone(),
                    client_order_id: sl_cid.clone(),
                    symbol: symbol.clone(),
                    side: exit_side,
                    order_qty: new_cum,
                    cum_filled_qty: Qty::ZERO,
                    fill_notional_ticks: 0,
                    avg_fill_price: PriceTicks::ZERO,
                    order_type: OrderType::Stop {
                        stop_price: stop_loss_price,
                    },
                    order_class: OrderClass::Simple,
                    state: OrderState::Accepted,
                    parent_broker_order_id: Some(broker_order_id.to_string()),
                    oco_sibling_broker_id: Some(tp_bid.clone()),
                    trail_watermark: None,
                    native_legs_spawned: true,
                    tp_broker_id: None,
                    sl_broker_id: None,
                };
                st.broker_id_by_client_id.insert(tp_cid.clone(), tp_bid.clone());
                st.broker_id_by_client_id.insert(sl_cid.clone(), sl_bid.clone());
                st.orders_by_broker_id.insert(tp_bid.clone(), tp_ord);
                st.orders_by_broker_id.insert(sl_bid.clone(), sl_ord);
                if let Some(parent) = st.orders_by_broker_id.get_mut(broker_order_id) {
                    parent.native_legs_spawned = true;
                    parent.tp_broker_id = Some(tp_bid.clone());
                    parent.sl_broker_id = Some(sl_bid.clone());
                }
                events.push(BrokerEvent::Accepted {
                    client_order_id: tp_cid,
                    broker_order_id: tp_bid,
                    ts_ns,
                });
                events.push(BrokerEvent::Accepted {
                    client_order_id: sl_cid,
                    broker_order_id: sl_bid,
                    ts_ns,
                });
            }
        }
    }

    // Atomic OCO sibling cancellation when a child leg fills!
    if let Some(sib_bid) = oco_sibling {
        if let Some(sib) = st.orders_by_broker_id.get_mut(&sib_bid) {
            if !sib.state.is_terminal() {
                sib.state = OrderState::Canceled;
                events.push(BrokerEvent::Canceled {
                    client_order_id: sib.client_order_id.clone(),
                    broker_order_id: sib.broker_order_id.clone(),
                    ts_ns,
                });
            }
        }
    }

    Ok(fill_ev)
}

fn evaluate_working_orders(
    st: &mut SimInner,
    symbol: &str,
    price: PriceTicks,
    events: &mut Vec<BrokerEvent>,
) {
    let candidate_ids: Vec<String> = st
        .orders_by_broker_id
        .values()
        .filter(|o| o.symbol == symbol && o.state.is_working())
        .map(|o| o.broker_order_id.clone())
        .collect();

    for bid in candidate_ids {
        let trigger_fill: Option<(Qty, PriceTicks)> = {
            let Some(ord) = st.orders_by_broker_id.get_mut(&bid) else {
                continue;
            };
            if !ord.state.is_working() {
                continue;
            }
            let rem = Qty(ord.order_qty.0 - ord.cum_filled_qty.0);
            match ord.order_type {
                OrderType::Market => Some((rem, price)),
                OrderType::Limit { limit_price } => match ord.side {
                    Side::Buy if price <= limit_price => Some((rem, limit_price.min(price))),
                    Side::Sell if price >= limit_price => Some((rem, limit_price.max(price))),
                    _ => None,
                },
                OrderType::Stop { stop_price } => match ord.side {
                    Side::Buy if price >= stop_price => Some((rem, price)),
                    Side::Sell if price <= stop_price => Some((rem, price)),
                    _ => None,
                },
                OrderType::StopLimit {
                    stop_price,
                    limit_price,
                } => match ord.side {
                    Side::Buy if price >= stop_price && price <= limit_price => {
                        Some((rem, limit_price.min(price)))
                    }
                    Side::Sell if price <= stop_price && price >= limit_price => {
                        Some((rem, limit_price.max(price)))
                    }
                    _ => None,
                },
                OrderType::TrailingStop {
                    trail_ticks,
                    trail_bps,
                } => {
                    let wm = match ord.trail_watermark {
                        Some(w) => match ord.side {
                            Side::Sell => w.max(price), // trailing stop sell tracks highest high
                            Side::Buy => w.min(price),  // trailing stop buy tracks lowest low
                        },
                        None => price,
                    };
                    ord.trail_watermark = Some(wm);
                    let offset = if let Some(t) = trail_ticks {
                        t
                    } else if let Some(bps) = trail_bps {
                        ((wm.0 as i128 * bps.0 as i128) / 10_000_i128) as i64
                    } else {
                        0
                    };
                    match ord.side {
                        Side::Sell if price.0 <= wm.0 - offset => Some((rem, price)),
                        Side::Buy if price.0 >= wm.0 + offset => Some((rem, price)),
                        _ => None,
                    }
                }
            }
        };

        if let Some((rem, fill_px)) = trigger_fill {
            let chunks = compute_fill_chunks(st, rem.0);
            for chunk in chunks {
                let _ = apply_sim_fill(st, &bid, Qty(chunk), fill_px, events);
            }
        }
    }
}

#[async_trait]
impl ExecutionAdapter for LocalPaperAdapter {
    fn capabilities(&self) -> AdapterCapabilities {
        let st = self.inner.lock().expect("sim lock");
        AdapterCapabilities {
            adapter_id: "local_paper_sim".to_string(),
            env: ExecutionEnv::LocalPaper,
            paper_mode: true,
            supports_native_oco: st.config.supports_native_oco,
            supports_modify_in_place: true,
            supports_trailing_stop: true,
            supports_bulk_cancel: true,
            allowed_hosts: vec!["127.0.0.1".to_string(), "localhost".to_string()],
        }
    }

    async fn submit_order(&self, intent: &OrderIntent) -> Result<BrokerOrderAck, AdapterError> {
        let delay = self.inner.lock().expect("sim lock").config.simulated_latency;
        if !delay.is_zero() {
            tokio::time::sleep(delay).await;
        }

        let mut events = Vec::new();
        let ack = {
            let mut st = self.inner.lock().expect("sim lock");
            if intent.env == ExecutionEnv::BrokerLive {
                return Err(AdapterError::SecurityViolation(
                    "LocalPaperAdapter rejects BrokerLive intents".to_string(),
                ));
            }
            if st.inject_ambiguous_before_commit {
                st.inject_ambiguous_before_commit = false;
                return Err(AdapterError::AmbiguousTransport(
                    "injected transport drop before venue commit".to_string(),
                ));
            }
            if st.broker_id_by_client_id.contains_key(&intent.client_order_id) {
                return Err(AdapterError::DuplicateClientOrderId(
                    intent.client_order_id.clone(),
                ));
            }

            st.submit_count += 1;
            let seq = st.next_order_seq;
            st.next_order_seq += 1;
            let bid = format!("SIM-ORD-{seq}");
            let ts_ns = now_unix_ns();
            let last_px = st.last_prices.get(&intent.symbol).copied();

            let ord = SimOrder {
                broker_order_id: bid.clone(),
                client_order_id: intent.client_order_id.clone(),
                symbol: intent.symbol.clone(),
                side: intent.side,
                order_qty: intent.qty,
                cum_filled_qty: Qty::ZERO,
                fill_notional_ticks: 0,
                avg_fill_price: PriceTicks::ZERO,
                order_type: intent.order_type,
                order_class: intent.order_class,
                state: OrderState::Accepted,
                parent_broker_order_id: intent
                    .parent_client_order_id
                    .as_ref()
                    .and_then(|p| st.broker_id_by_client_id.get(p).cloned()),
                oco_sibling_broker_id: intent
                    .oco_sibling_id
                    .as_ref()
                    .and_then(|s| st.broker_id_by_client_id.get(s).cloned()),
                trail_watermark: last_px,
                native_legs_spawned: false,
                tp_broker_id: None,
                sl_broker_id: None,
            };
            st.broker_id_by_client_id
                .insert(intent.client_order_id.clone(), bid.clone());
            st.orders_by_broker_id.insert(bid.clone(), ord);

            // Wire reciprocal OCO link if sibling already exists
            if let Some(sib_cid) = &intent.oco_sibling_id {
                if let Some(sib_bid) = st.broker_id_by_client_id.get(sib_cid).cloned() {
                    if let Some(sib_ord) = st.orders_by_broker_id.get_mut(&sib_bid) {
                        sib_ord.oco_sibling_broker_id = Some(bid.clone());
                    }
                }
            }

            events.push(BrokerEvent::Accepted {
                client_order_id: intent.client_order_id.clone(),
                broker_order_id: bid.clone(),
                ts_ns,
            });

            // Immediately fill Market or marketable Limit orders against current price
            if let Some(px) = last_px {
                let is_marketable = match intent.order_type {
                    OrderType::Market => true,
                    OrderType::Limit { limit_price } => match intent.side {
                        Side::Buy => px <= limit_price,
                        Side::Sell => px >= limit_price,
                    },
                    _ => false,
                };
                if is_marketable {
                    let chunks = compute_fill_chunks(&st, intent.qty.0);
                    for c in chunks {
                        let _ = apply_sim_fill(&mut st, &bid, Qty(c), px, &mut events);
                    }
                }
            }

            if st.inject_ambiguous_after_commit {
                st.inject_ambiguous_after_commit = false;
                return Err(AdapterError::AmbiguousTransport(
                    "injected transport drop AFTER venue commit".to_string(),
                ));
            }

            let cur_state = st
                .orders_by_broker_id
                .get(&bid)
                .map(|o| o.state)
                .unwrap_or(OrderState::Accepted);

            BrokerOrderAck {
                broker_order_id: bid,
                client_order_id: intent.client_order_id.clone(),
                state: cur_state,
                leg_broker_ids: Vec::new(),
            }
        };

        for ev in events {
            let _ = self.events_tx.send(ev);
        }
        Ok(ack)
    }

    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), AdapterError> {
        let ev = {
            let mut st = self.inner.lock().expect("sim lock");
            let ord = st
                .orders_by_broker_id
                .get_mut(broker_order_id)
                .ok_or_else(|| AdapterError::NotFound(broker_order_id.to_string()))?;
            if ord.state.is_terminal() {
                return Ok(());
            }
            ord.state = OrderState::Canceled;
            BrokerEvent::Canceled {
                client_order_id: ord.client_order_id.clone(),
                broker_order_id: ord.broker_order_id.clone(),
                ts_ns: now_unix_ns(),
            }
        };
        let _ = self.events_tx.send(ev);
        Ok(())
    }

    async fn replace_order(
        &self,
        broker_order_id: &str,
        req: &ReplaceOrderRequest,
    ) -> Result<BrokerOrderAck, AdapterError> {
        let (ack, ev) = {
            let mut st = self.inner.lock().expect("sim lock");
            let ord = st
                .orders_by_broker_id
                .get_mut(broker_order_id)
                .ok_or_else(|| AdapterError::NotFound(broker_order_id.to_string()))?;
            if ord.state.is_terminal() {
                return Err(AdapterError::Rejected(format!(
                    "cannot replace terminal order {broker_order_id}"
                )));
            }
            if let Some(q) = req.new_qty {
                ord.order_qty = q;
            }
            if let Some(lp) = req.new_limit_price {
                ord.order_type = OrderType::Limit { limit_price: lp };
            }
            if let Some(sp) = req.new_stop_price {
                ord.order_type = OrderType::Stop { stop_price: sp };
            }
            let ack = BrokerOrderAck {
                broker_order_id: ord.broker_order_id.clone(),
                client_order_id: ord.client_order_id.clone(),
                state: ord.state,
                leg_broker_ids: Vec::new(),
            };
            let ev = BrokerEvent::Replaced {
                client_order_id: ord.client_order_id.clone(),
                broker_order_id: ord.broker_order_id.clone(),
                new_qty: req.new_qty,
                new_order_type: Some(ord.order_type),
                ts_ns: now_unix_ns(),
            };
            (ack, ev)
        };
        let _ = self.events_tx.send(ev);
        Ok(ack)
    }

    async fn cancel_all_orders(&self) -> Result<usize, AdapterError> {
        let mut events = Vec::new();
        let canceled = {
            let mut st = self.inner.lock().expect("sim lock");
            let ts_ns = now_unix_ns();
            let mut count = 0usize;
            for ord in st.orders_by_broker_id.values_mut() {
                if ord.state.is_working() {
                    ord.state = OrderState::Canceled;
                    count += 1;
                    events.push(BrokerEvent::Canceled {
                        client_order_id: ord.client_order_id.clone(),
                        broker_order_id: ord.broker_order_id.clone(),
                        ts_ns,
                    });
                }
            }
            count
        };
        for ev in events {
            let _ = self.events_tx.send(ev);
        }
        Ok(canceled)
    }

    async fn close_all_positions(&self) -> Result<usize, AdapterError> {
        let mut events = Vec::new();
        let closed = {
            let mut st = self.inner.lock().expect("sim lock");
            let open_positions: Vec<(String, Qty)> = st
                .positions
                .iter()
                .filter(|(_, p)| p.net_qty.0 != 0)
                .map(|(sym, p)| (sym.clone(), p.net_qty))
                .collect();
            let mut count = 0usize;
            for (sym, net_qty) in open_positions {
                let side = if net_qty.0 > 0 {
                    Side::Sell
                } else {
                    Side::Buy
                };
                let qty = Qty(net_qty.0.abs());
                let fill_px = st
                    .last_prices
                    .get(&sym)
                    .copied()
                    .or_else(|| st.positions.get(&sym).map(|p| p.avg_entry_price))
                    .unwrap_or(PriceTicks(10_000));
                let seq = st.next_order_seq;
                st.next_order_seq += 1;
                let bid = format!("SIM-FLAT-{seq}");
                let cid = ClientOrderId::from_raw(format!("flatten-{sym}-{seq}"));
                let ord = SimOrder {
                    broker_order_id: bid.clone(),
                    client_order_id: cid.clone(),
                    symbol: sym.clone(),
                    side,
                    order_qty: qty,
                    cum_filled_qty: Qty::ZERO,
                    fill_notional_ticks: 0,
                    avg_fill_price: PriceTicks::ZERO,
                    order_type: OrderType::Market,
                    order_class: OrderClass::Simple,
                    state: OrderState::Accepted,
                    parent_broker_order_id: None,
                    oco_sibling_broker_id: None,
                    trail_watermark: None,
                    native_legs_spawned: false,
                    tp_broker_id: None,
                    sl_broker_id: None,
                };
                st.broker_id_by_client_id.insert(cid, bid.clone());
                st.orders_by_broker_id.insert(bid.clone(), ord);
                let _ = apply_sim_fill(&mut st, &bid, qty, fill_px, &mut events);
                count += 1;
            }
            count
        };
        for ev in events {
            let _ = self.events_tx.send(ev);
        }
        Ok(closed)
    }

    async fn get_order_by_client_id(
        &self,
        client_order_id: &ClientOrderId,
    ) -> Result<Option<BrokerOrderSnapshot>, AdapterError> {
        let st = self.inner.lock().expect("sim lock");
        Ok(st
            .broker_id_by_client_id
            .get(client_order_id)
            .and_then(|bid| st.orders_by_broker_id.get(bid))
            .map(to_snapshot))
    }

    async fn list_open_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError> {
        let st = self.inner.lock().expect("sim lock");
        Ok(st
            .orders_by_broker_id
            .values()
            .filter(|o| o.state.is_working())
            .map(to_snapshot)
            .collect())
    }

    async fn list_all_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError> {
        let st = self.inner.lock().expect("sim lock");
        Ok(st.orders_by_broker_id.values().map(to_snapshot).collect())
    }

    async fn list_positions(&self) -> Result<Vec<BrokerPositionSnapshot>, AdapterError> {
        let st = self.inner.lock().expect("sim lock");
        Ok(st
            .positions
            .values()
            .filter(|p| p.net_qty.0 != 0)
            .map(|p| BrokerPositionSnapshot {
                symbol: p.symbol.clone(),
                net_qty: p.net_qty,
                avg_entry_price: p.avg_entry_price,
            })
            .collect())
    }

    async fn get_account(&self) -> Result<BrokerAccountSnapshot, AdapterError> {
        let st = self.inner.lock().expect("sim lock");
        let realized: i128 = st
            .positions
            .values()
            .map(|p| p.realized_pnl_micros.0)
            .sum();
        let equity = MoneyMicros(st.config.initial_equity_micros.0 + realized);
        Ok(BrokerAccountSnapshot {
            account_id: "LOCAL-PAPER-SIM-001".to_string(),
            env: ExecutionEnv::LocalPaper,
            equity_micros: equity,
            buying_power_micros: MoneyMicros(equity.0 * 4),
            trading_blocked: false,
        })
    }

    fn subscribe_events(&self) -> broadcast::Receiver<BrokerEvent> {
        self.events_tx.subscribe()
    }
}
