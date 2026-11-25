use allegedly_s06_oms::adapter::alpaca_paper::{AlpacaAdapterConfig, AlpacaPaperAdapter};
use allegedly_s06_oms::adapter::local_paper::{
    LocalPaperAdapter, LocalPaperConfig,
};
use allegedly_s06_oms::adapter::{
    verify_adapter_allowed, AdapterCapabilities, AdapterError, BrokerAccountSnapshot, BrokerEvent,
    BrokerOrderAck, BrokerOrderSnapshot, BrokerPositionSnapshot, ExecutionAdapter,
    ReplaceOrderRequest, FORBIDDEN_DO_NOT_BUILD_ADAPTERS,
};
use allegedly_s06_oms::mock_alpaca::{InjectedFault, MockAlpacaHandle};
use allegedly_s06_oms::oms::{OmsEngine, OmsError};
use allegedly_s06_oms::risk::{ApiCredentials, RiskConfig, RiskError};
use allegedly_s06_oms::state::{OrderRecord, OrderState, StateError};
use allegedly_s06_oms::types::{
    now_unix_ns, BboQuote, Bps, ClientOrderId, ExecutionEnv, FixedPointError,
    InstrumentSpec, MoneyMicros, OrderClass, OrderIntent, OrderType, Position, PriceTicks,
    ProtectiveLegMode, Qty, Side, TimeInForce,
};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;
use uuid::Uuid;

fn test_db_path(name: &str) -> PathBuf {
    let dir = PathBuf::from("/tmp/allegedly-s06-bench/tests");
    std::fs::create_dir_all(&dir).expect("create /tmp/allegedly-s06-bench/tests");
    dir.join(format!("{name}-{}.sqlite", Uuid::now_v7()))
}

fn cleanup_db(path: &Path) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", path.display()));
}

async fn drain_events(oms: &mut OmsEngine, rx: &mut broadcast::Receiver<BrokerEvent>) -> usize {
    let mut count = 0;
    loop {
        match rx.try_recv() {
            Ok(ev) => {
                oms.apply_broker_event(ev).await.expect("apply broker event");
                count += 1;
            }
            Err(broadcast::error::TryRecvError::Empty) => break,
            Err(broadcast::error::TryRecvError::Lagged(_)) => continue,
            Err(broadcast::error::TryRecvError::Closed) => break,
        }
    }
    count
}

async fn drain_ws_until<F>(
    oms: &mut OmsEngine,
    rx: &mut broadcast::Receiver<BrokerEvent>,
    timeout: Duration,
    mut pred: F,
) -> bool
where
    F: FnMut(&OmsEngine) -> bool,
{
    let deadline = Instant::now() + timeout;
    loop {
        if pred(oms) {
            return true;
        }
        let now = Instant::now();
        if now >= deadline {
            return pred(oms);
        }
        let rem = deadline - now;
        match tokio::time::timeout(rem.min(Duration::from_millis(50)), rx.recv()).await {
            Ok(Ok(ev)) => {
                oms.apply_broker_event(ev).await.expect("apply ws event");
            }
            Ok(Err(broadcast::error::RecvError::Lagged(_))) => continue,
            Ok(Err(broadcast::error::RecvError::Closed)) => return pred(oms),
            Err(_) => continue,
        }
    }
}

fn make_intent(
    symbol: &str,
    side: Side,
    qty: i64,
    order_type: OrderType,
    order_class: OrderClass,
    env: ExecutionEnv,
) -> OrderIntent {
    OrderIntent {
        client_order_id: ClientOrderId::generate_v7(),
        symbol: symbol.to_string(),
        side,
        qty: Qty(qty),
        order_type,
        order_class,
        tif: TimeInForce::Day,
        env,
        parent_client_order_id: None,
        oco_sibling_id: None,
    }
}

// ============================================================================
// S06-T1: Fixed-Point Round-Trip, Exact P&L Math & Static Zero-Float Audit
// ============================================================================

#[test]
fn s06_t1_fixed_point_roundtrip_and_zero_float_source_audit() {
    let es = InstrumentSpec::cme_es("ESM26");
    assert_eq!(es.tick_value_micros().unwrap(), 12_500_000); // $12.50 per 0.25 tick

    // Exact parse -> format round trip
    let p1 = es.parse_price_str("5942.25").unwrap();
    assert_eq!(p1, PriceTicks(23_769));
    assert_eq!(es.format_price_ticks(p1).unwrap(), "5942.25");

    let aapl = InstrumentSpec::us_equity("AAPL");
    let p2 = aapl.parse_price_str("185.50").unwrap();
    assert_eq!(p2, PriceTicks(18_550));
    assert_eq!(aapl.format_price_ticks(p2).unwrap(), "185.50");

    // Non-tick-aligned & invalid float-like syntax strictly rejected
    assert!(matches!(
        es.parse_price_str("5942.10"),
        Err(FixedPointError::NotTickAligned { .. })
    ));
    assert!(matches!(
        aapl.parse_price_str("NaN"),
        Err(FixedPointError::InvalidSyntax(_))
    ));
    assert!(matches!(
        aapl.parse_price_str("inf"),
        Err(FixedPointError::InvalidSyntax(_))
    ));
    assert!(matches!(
        aapl.parse_price_str("1e5"),
        Err(FixedPointError::InvalidSyntax(_))
    ));
    assert!(matches!(
        aapl.parse_price_str(""),
        Err(FixedPointError::Empty)
    ));

    // Exact Position accounting: scale in, partial close, reverse through zero
    let mut pos = Position::flat("ESM26");
    pos.apply_fill(&es, Side::Buy, Qty(2), es.parse_price_str("5900.00").unwrap())
        .unwrap();
    pos.apply_fill(&es, Side::Buy, Qty(2), es.parse_price_str("5902.00").unwrap())
        .unwrap();
    assert_eq!(pos.net_qty, Qty(4));
    assert_eq!(pos.avg_entry_price, es.parse_price_str("5901.00").unwrap());

    // Partial close 2 contracts at 5903.00 -> +2 points * $50 * 2 = +$200.00
    pos.apply_fill(&es, Side::Sell, Qty(2), es.parse_price_str("5903.00").unwrap())
        .unwrap();
    assert_eq!(pos.net_qty, Qty(2));
    assert_eq!(pos.realized_pnl_micros, MoneyMicros::from_dollars(200));

    // Reverse through zero: sell 3 at 5900.00 -> closes 2 at -1pt (-$100), opens short 1 @ 5900.00
    pos.apply_fill(&es, Side::Sell, Qty(3), es.parse_price_str("5900.00").unwrap())
        .unwrap();
    assert_eq!(pos.net_qty, Qty(-1));
    assert_eq!(pos.avg_entry_price, es.parse_price_str("5900.00").unwrap());
    assert_eq!(pos.realized_pnl_micros, MoneyMicros::from_dollars(100));

    // Unrealized P&L when mark drops to 5898.00 -> short 1 profits +2 pts = +$100
    let unrl = pos
        .unrealized_pnl_micros(&es, es.parse_price_str("5898.00").unwrap())
        .unwrap();
    assert_eq!(unrl, MoneyMicros::from_dollars(100));

    // Static Zero-Float Audit across all non-comment lines in src/
    let src_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut stack = vec![src_dir];
    let mut float_hits = Vec::new();
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).expect("read src dir") {
            let path = entry.expect("dir entry").path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|s| s.to_str()) == Some("rs") {
                let text = std::fs::read_to_string(&path).expect("read rs");
                for (idx, line) in text.lines().enumerate() {
                    let code_part = line.split("//").next().unwrap_or("");
                    for tok in code_part.split(|c: char| !c.is_ascii_alphanumeric() && c != '_') {
                        if tok == "f32" || tok == "f64" {
                            float_hits.push(format!("{}:{}", path.display(), idx + 1));
                        }
                    }
                }
            }
        }
    }
    assert!(
        float_hits.is_empty(),
        "ZERO floats allowed in OMS core src/, found: {float_hits:?}"
    );
}

// ============================================================================
// S06-T2 (Local): State Machine Transitions, Order Types & Native Bracket OCO
// ============================================================================

#[tokio::test]
async fn s06_t2_local_state_machine_and_order_types() {
    let db = test_db_path("s06_t2_local");
    let specs = vec![InstrumentSpec::cme_es("ESM26"), InstrumentSpec::us_equity("AAPL")];
    let sim = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
    let mut rx = sim.subscribe_events();
    let mut oms = OmsEngine::new(&db, sim.clone(), RiskConfig::default(), specs).unwrap();

    // Illegal state transitions rejected strictly
    let sample_intent = make_intent(
        "AAPL",
        Side::Buy,
        10,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    let mut rec =
        OrderRecord::from_intent(&sample_intent, ProtectiveLegMode::BrokerNative, now_unix_ns())
            .unwrap();
    assert!(matches!(
        rec.transition(OrderState::Filled, None, None, now_unix_ns()),
        Err(StateError::IllegalTransition { .. })
    ));
    rec.transition(OrderState::PendingNew, None, None, now_unix_ns())
        .unwrap();
    rec.transition(OrderState::Filled, Some("B1".into()), None, now_unix_ns())
        .unwrap();
    assert!(matches!(
        rec.transition(OrderState::Accepted, None, None, now_unix_ns()),
        Err(StateError::IllegalTransition { .. })
    ));

    // Seed market prices
    sim.set_market_price("AAPL", PriceTicks(18_500)); // $185.00
    oms.update_bbo(
        "AAPL",
        BboQuote {
            bid: PriceTicks(18_499),
            ask: PriceTicks(18_501),
        },
    );

    // 1. Market + Native Bracket (TP @ 186.00, SL @ 184.00)
    let br_intent = make_intent(
        "AAPL",
        Side::Buy,
        10,
        OrderType::Market,
        OrderClass::Bracket {
            take_profit_price: PriceTicks(18_600),
            stop_loss_price: PriceTicks(18_400),
        },
        ExecutionEnv::LocalPaper,
    );
    let br_cid = br_intent.client_order_id.clone();
    oms.submit_order(br_intent).await.unwrap();
    drain_events(&mut oms, &mut rx).await;

    assert_eq!(oms.get_order(&br_cid).unwrap().state, OrderState::Filled);
    assert_eq!(oms.get_position("AAPL").net_qty, Qty(10));
    let bg = oms.get_bracket(&br_cid).unwrap().clone();
    assert_eq!(bg.protected_qty, Qty(10));
    let tp_cid = bg.take_profit_client_id.clone().unwrap();
    let sl_cid = bg.stop_loss_client_id.clone().unwrap();
    assert_eq!(oms.get_order(&tp_cid).unwrap().state, OrderState::Accepted);
    assert_eq!(oms.get_order(&sl_cid).unwrap().state, OrderState::Accepted);

    // Price rallies to TP @ 186.00 -> TP fills, OCO sibling SL auto-cancels!
    sim.set_market_price("AAPL", PriceTicks(18_600));
    drain_events(&mut oms, &mut rx).await;
    assert_eq!(oms.get_order(&tp_cid).unwrap().state, OrderState::Filled);
    assert_eq!(oms.get_order(&sl_cid).unwrap().state, OrderState::Canceled);
    assert_eq!(oms.get_position("AAPL").net_qty, Qty::ZERO);
    assert_eq!(
        oms.get_position("AAPL").realized_pnl_micros,
        MoneyMicros::from_dollars(10) // +$1.00 * 10 shares
    );

    // 2. Limit order -> Replace-in-place -> Fill
    oms.update_bbo(
        "AAPL",
        BboQuote {
            bid: PriceTicks(18_599),
            ask: PriceTicks(18_601),
        },
    );
    let lim = make_intent(
        "AAPL",
        Side::Buy,
        5,
        OrderType::Limit {
            limit_price: PriceTicks(18_500),
        },
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    let lim_cid = lim.client_order_id.clone();
    oms.submit_order(lim).await.unwrap();
    drain_events(&mut oms, &mut rx).await;
    assert_eq!(oms.get_order(&lim_cid).unwrap().state, OrderState::Accepted);

    oms.replace_order(
        &lim_cid,
        ReplaceOrderRequest {
            new_qty: Some(Qty(8)),
            new_limit_price: Some(PriceTicks(18_550)),
            new_stop_price: None,
        },
    )
    .await
    .unwrap();
    drain_events(&mut oms, &mut rx).await;
    assert_eq!(oms.get_order(&lim_cid).unwrap().order_qty, Qty(8));

    sim.set_market_price("AAPL", PriceTicks(18_550));
    drain_events(&mut oms, &mut rx).await;
    assert_eq!(oms.get_order(&lim_cid).unwrap().state, OrderState::Filled);
    assert_eq!(oms.get_position("AAPL").net_qty, Qty(8));

    // 3. Trailing Stop (sell 8, trail 50 ticks = $0.50): rallies to 187.00, drops to 186.50 -> triggers!
    let trail = make_intent(
        "AAPL",
        Side::Sell,
        8,
        OrderType::TrailingStop {
            trail_ticks: Some(50),
            trail_bps: None,
        },
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    let trail_cid = trail.client_order_id.clone();
    oms.submit_order(trail).await.unwrap();
    drain_events(&mut oms, &mut rx).await;

    sim.set_market_price("AAPL", PriceTicks(18_700)); // watermark moves up to 187.00
    drain_events(&mut oms, &mut rx).await;
    assert_eq!(oms.get_order(&trail_cid).unwrap().state, OrderState::Accepted);

    sim.set_market_price("AAPL", PriceTicks(18_650)); // pullback 50 ticks -> fills!
    drain_events(&mut oms, &mut rx).await;
    assert_eq!(oms.get_order(&trail_cid).unwrap().state, OrderState::Filled);
    assert_eq!(oms.get_position("AAPL").net_qty, Qty::ZERO);

    let recon = oms.reconcile_with_broker().await.unwrap();
    assert!(recon.clean, "reconcile should be clean: {recon:?}");

    cleanup_db(&db);
}

// ============================================================================
// S06-T3: Partial Fills, Bracket Qty Scaling (Native & Client-Managed) & Dedup
// ============================================================================

#[tokio::test]
async fn s06_t3_partial_fills_bracket_scaling_and_exec_id_dedup() {
    let db = test_db_path("s06_t3_partial");
    let specs = vec![InstrumentSpec::us_equity("NVDA")];

    // Part A: Client-Managed Bracket Fallback (`supports_native_oco: false`)
    let cfg = LocalPaperConfig {
        supports_native_oco: false,
        ..Default::default()
    };
    let sim = Arc::new(LocalPaperAdapter::new(cfg, specs.clone()));
    let mut rx = sim.subscribe_events();
    let mut oms = OmsEngine::new(&db, sim.clone(), RiskConfig::default(), specs).unwrap();

    sim.set_market_price("NVDA", PriceTicks(13_000)); // $130.00
    oms.update_bbo(
        "NVDA",
        BboQuote {
            bid: PriceTicks(12_999),
            ask: PriceTicks(13_001),
        },
    );

    // Resting limit buy 10 @ 129.00 with bracket TP 132.00 / SL 127.00
    let entry = make_intent(
        "NVDA",
        Side::Buy,
        10,
        OrderType::Limit {
            limit_price: PriceTicks(12_900),
        },
        OrderClass::Bracket {
            take_profit_price: PriceTicks(13_200),
            stop_loss_price: PriceTicks(12_700),
        },
        ExecutionEnv::LocalPaper,
    );
    let entry_cid = entry.client_order_id.clone();
    oms.submit_order(entry).await.unwrap();
    drain_events(&mut oms, &mut rx).await;

    assert_eq!(
        oms.get_order(&entry_cid).unwrap().protective_leg_mode,
        ProtectiveLegMode::ClientManagedWarning
    );

    // Partial Fill #1: 3 shares @ 129.00 -> protective TP & SL legs MUST size to 3 (NOT 10!)
    let fill1 = sim
        .simulate_venue_fill(&entry_cid, Qty(3), PriceTicks(12_900), true)
        .unwrap();
    drain_events(&mut oms, &mut rx).await;

    let rec1 = oms.get_order(&entry_cid).unwrap();
    assert_eq!(rec1.state, OrderState::PartiallyFilled);
    assert_eq!(rec1.cum_filled_qty, Qty(3));
    assert_eq!(rec1.leaves_qty, Qty(7));
    assert_eq!(rec1.cum_filled_qty.0 + rec1.leaves_qty.0, rec1.order_qty.0);

    let bg1 = oms.get_bracket(&entry_cid).unwrap().clone();
    assert_eq!(bg1.protected_qty, Qty(3));
    let tp_cid = bg1.take_profit_client_id.clone().unwrap();
    let sl_cid = bg1.stop_loss_client_id.clone().unwrap();
    assert_eq!(oms.get_order(&tp_cid).unwrap().order_qty, Qty(3));
    assert_eq!(oms.get_order(&sl_cid).unwrap().order_qty, Qty(3));

    // Replay duplicate Fill #1 with identical exec_id -> MUST be deduplicated (0 double fill!)
    oms.apply_broker_event(BrokerEvent::Fill(fill1.clone()))
        .await
        .unwrap();
    assert_eq!(oms.get_order(&entry_cid).unwrap().cum_filled_qty, Qty(3));
    assert_eq!(oms.get_position("NVDA").net_qty, Qty(3));

    // Partial Fill #2: 4 shares @ 129.10 -> cum=7, leaves=3, TP & SL scale atomically to 7!
    sim.simulate_venue_fill(&entry_cid, Qty(4), PriceTicks(12_910), true)
        .unwrap();
    drain_events(&mut oms, &mut rx).await;

    let rec2 = oms.get_order(&entry_cid).unwrap();
    assert_eq!(rec2.state, OrderState::PartiallyFilled);
    assert_eq!(rec2.cum_filled_qty, Qty(7));
    assert_eq!(rec2.leaves_qty, Qty(3));
    assert_eq!(oms.get_bracket(&entry_cid).unwrap().protected_qty, Qty(7));
    assert_eq!(oms.get_order(&tp_cid).unwrap().order_qty, Qty(7));
    assert_eq!(oms.get_order(&sl_cid).unwrap().order_qty, Qty(7));

    // Final Fill #3: 3 shares @ 129.20 -> cum=10, leaves=0, TP & SL scale to 10!
    sim.simulate_venue_fill(&entry_cid, Qty(3), PriceTicks(12_920), true)
        .unwrap();
    drain_events(&mut oms, &mut rx).await;

    let rec3 = oms.get_order(&entry_cid).unwrap();
    assert_eq!(rec3.state, OrderState::Filled);
    assert_eq!(rec3.cum_filled_qty, Qty(10));
    assert_eq!(rec3.leaves_qty, Qty::ZERO);
    assert_eq!(oms.get_bracket(&entry_cid).unwrap().protected_qty, Qty(10));
    assert_eq!(oms.get_order(&tp_cid).unwrap().order_qty, Qty(10));
    assert_eq!(oms.get_order(&sl_cid).unwrap().order_qty, Qty(10));

    // Stop-loss hits @ 127.00 -> SL fills 10, TP auto-cancels!
    sim.set_market_price("NVDA", PriceTicks(12_700));
    drain_events(&mut oms, &mut rx).await;
    assert_eq!(oms.get_order(&sl_cid).unwrap().state, OrderState::Filled);
    assert_eq!(oms.get_order(&tp_cid).unwrap().state, OrderState::Canceled);
    assert_eq!(oms.get_position("NVDA").net_qty, Qty::ZERO);

    let recon = oms.reconcile_with_broker().await.unwrap();
    assert!(recon.clean, "reconcile failed: {recon:?}");

    cleanup_db(&db);
}

// ============================================================================
// S06-T4 (Local): Crash Simulation Mid-Flight, SQLite WAL Replay & Orphan Flag
// ============================================================================

#[tokio::test]
async fn s06_t4_wal_crash_recovery_reconciliation_and_orphan_detection() {
    let db = test_db_path("s06_t4_crash");
    let specs = vec![InstrumentSpec::us_equity("MSFT")];
    let sim = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
    let mut rx = sim.subscribe_events();

    let (filled_cid, resting_cid, canceled_cid, ambiguous_cid) = {
        let mut risk_cfg = RiskConfig::default();
        risk_cfg.duplicate_window_ms = 0;
        let mut oms = OmsEngine::new(&db, sim.clone(), risk_cfg, specs.clone()).unwrap();
        assert_eq!(oms.journal().journal_mode().unwrap().to_ascii_lowercase(), "wal");

        sim.set_market_price("MSFT", PriceTicks(40_000)); // $400.00

        // Order 1: Market buy 10 -> fills before crash
        let o1 = make_intent(
            "MSFT",
            Side::Buy,
            10,
            OrderType::Market,
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        let c1 = o1.client_order_id.clone();
        oms.submit_order(o1).await.unwrap();
        drain_events(&mut oms, &mut rx).await;

        // Order 2: Resting limit buy 5 @ 395.00 -> will fill on venue WHILE OMS IS CRASHED
        let o2 = make_intent(
            "MSFT",
            Side::Buy,
            5,
            OrderType::Limit {
                limit_price: PriceTicks(39_500),
            },
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        let c2 = o2.client_order_id.clone();
        oms.submit_order(o2).await.unwrap();
        drain_events(&mut oms, &mut rx).await;

        // Order 3: Resting limit sell 4 @ 410.00 -> will cancel on venue WHILE OMS IS CRASHED
        let o3 = make_intent(
            "MSFT",
            Side::Sell,
            4,
            OrderType::Limit {
                limit_price: PriceTicks(41_000),
            },
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        let c3 = o3.client_order_id.clone();
        oms.submit_order(o3).await.unwrap();
        drain_events(&mut oms, &mut rx).await;

        // Order 4: Ambiguous transport drop AFTER venue commit -> marked UnknownPendingReconcile
        sim.inject_ambiguous_error(true);
        let o4 = make_intent(
            "MSFT",
            Side::Buy,
            3,
            OrderType::Limit {
                limit_price: PriceTicks(39_000),
            },
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        let c4 = o4.client_order_id.clone();
        assert!(matches!(
            oms.submit_order(o4).await,
            Err(OmsError::AmbiguousSubmit { .. })
        ));
        assert_eq!(
            oms.get_order(&c4).unwrap().state,
            OrderState::UnknownPendingReconcile
        );

        // ABRUPT CRASH: `oms` is dropped here without graceful shutdown!
        (c1, c2, c3, c4)
    };

    // While OMS is down, venue executes fills & cancels without emitting to any OMS listener
    sim.simulate_venue_fill(&resting_cid, Qty(5), PriceTicks(39_500), false)
        .unwrap();
    sim.simulate_venue_cancel(&canceled_cid, false).unwrap();

    // Cold-boot recovery from SQLite WAL
    let mut recovered = OmsEngine::recover_from_wal(
        &db,
        sim.clone(),
        RiskConfig::default(),
        specs.clone(),
    )
    .unwrap();

    // MUST boot in RECONCILING mode blocking new orders!
    assert!(recovered.is_reconciling());
    let blocked_intent = make_intent(
        "MSFT",
        Side::Buy,
        1,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    assert!(matches!(
        recovered.submit_order(blocked_intent).await,
        Err(OmsError::Risk(RiskError::OmsReconciling))
    ));

    // Run reconciliation against venue snapshot
    let report = recovered.reconcile_with_broker().await.unwrap();
    assert!(report.clean, "expected clean reconciliation: {report:?}");
    assert_eq!(report.missed_fills_recovered, 1);
    assert_eq!(report.unknown_orders_resolved, 1);
    assert!(!recovered.is_reconciling());

    // Verify 100% deterministic state match
    assert_eq!(recovered.get_order(&filled_cid).unwrap().state, OrderState::Filled);
    assert_eq!(recovered.get_order(&resting_cid).unwrap().state, OrderState::Filled);
    assert_eq!(recovered.get_order(&canceled_cid).unwrap().state, OrderState::Canceled);
    assert_eq!(recovered.get_order(&ambiguous_cid).unwrap().state, OrderState::Accepted);
    assert_eq!(recovered.get_position("MSFT").net_qty, Qty(15)); // 10 + 5 recovered!

    // Now inject an unjournaled orphan working order on the venue -> reconcile MUST flag it and stay RECONCILING!
    let orphan_cid = ClientOrderId::generate_v7();
    sim.inject_orphan_working_order(
        orphan_cid.clone(),
        "MSFT",
        Side::Buy,
        Qty(2),
        PriceTicks(38_000),
    );
    let orphan_report = recovered.reconcile_with_broker().await.unwrap();
    assert!(!orphan_report.clean);
    assert_eq!(orphan_report.orphan_broker_orders.len(), 1);
    assert_eq!(orphan_report.orphan_broker_orders[0].client_order_id, orphan_cid);
    assert!(
        recovered.is_reconciling(),
        "OMS must remain RECONCILING when orphan working order is detected"
    );

    cleanup_db(&db);
}

// ============================================================================
// S06-T2/T3/T4 (Alpaca Wire-Mock): Full Lifecycle, WS Stream, 429/5xx & Drops
// ============================================================================

#[tokio::test]
async fn s06_t2_t4_alpaca_wire_mock_lifecycle_faults_and_ws_reconnect() {
    let db = test_db_path("s06_alpaca_mock");
    let specs = vec![InstrumentSpec::us_equity("AAPL"), InstrumentSpec::us_equity("TSLA")];
    let mock = MockAlpacaHandle::start("PK_TEST_MOCK_KEY", "SK_TEST_MOCK_SECRET", specs.clone()).await;

    let creds = ApiCredentials::paper_mock("PK_TEST_MOCK_KEY", "SK_TEST_MOCK_SECRET");
    let cfg = AlpacaAdapterConfig::local_mock(mock.base_http_url.clone(), mock.ws_url.clone());
    let adapter = Arc::new(AlpacaPaperAdapter::new(creds, cfg, specs.clone()).unwrap());
    adapter.start_ws_stream().await.expect("start ws stream");
    let mut rx = adapter.subscribe_events();

    let mut risk_cfg = RiskConfig::default();
    risk_cfg.duplicate_window_ms = 0;
    risk_cfg.max_orders_per_sec = 500;
    let mut oms = OmsEngine::new(&db, adapter.clone(), risk_cfg, specs).unwrap();

    // Verify account snapshot parses strictly in fixed-point micros
    let acct = adapter.get_account().await.unwrap();
    assert_eq!(acct.equity_micros, MoneyMicros::from_dollars(100_000));

    // Seed mock price & test native Bracket with deterministic partial fills [3, 7]
    mock.set_market_price("AAPL", PriceTicks(19_000)); // $190.00
    mock.set_partial_fill_chunks(Some(vec![3, 7]));

    let br_intent = make_intent(
        "AAPL",
        Side::Buy,
        10,
        OrderType::Market,
        OrderClass::Bracket {
            take_profit_price: PriceTicks(19_200),
            stop_loss_price: PriceTicks(18_800),
        },
        ExecutionEnv::BrokerSandbox,
    );
    let br_cid = br_intent.client_order_id.clone();
    oms.submit_order(br_intent).await.unwrap();

    let filled_ok = drain_ws_until(&mut oms, &mut rx, Duration::from_secs(2), |o| {
        o.get_order(&br_cid).map(|r| r.state) == Some(OrderState::Filled)
    })
    .await;
    assert!(filled_ok, "expected bracket entry to fill over trade_updates WS");
    assert_eq!(oms.get_position("AAPL").net_qty, Qty(10));

    // Trigger TP @ 192.00 -> TP fills and SL OCO sibling cancels over WS
    let (tp_cid, sl_cid) = {
        let bg = oms.get_bracket(&br_cid).unwrap();
        (
            bg.take_profit_client_id.clone().unwrap(),
            bg.stop_loss_client_id.clone().unwrap(),
        )
    };
    mock.set_partial_fill_chunks(None);
    mock.set_market_price("AAPL", PriceTicks(19_200));
    let flat_ok = drain_ws_until(&mut oms, &mut rx, Duration::from_secs(2), |o| {
        o.get_position("AAPL").net_qty == Qty::ZERO
            && o.get_order(&sl_cid).map(|r| r.state) == Some(OrderState::Canceled)
    })
    .await;
    assert!(flat_ok, "expected TP fill & SL OCO cancel over WS");
    assert_eq!(oms.get_order(&tp_cid).unwrap().state, OrderState::Filled);
    assert_eq!(oms.get_order(&sl_cid).unwrap().state, OrderState::Canceled);

    // Verify Limit -> Replace-in-place -> Fill, Stop, and TrailingStop over Alpaca REST + WS
    let lim = make_intent(
        "AAPL",
        Side::Buy,
        4,
        OrderType::Limit {
            limit_price: PriceTicks(19_000),
        },
        OrderClass::Simple,
        ExecutionEnv::BrokerSandbox,
    );
    let lim_cid = lim.client_order_id.clone();
    oms.submit_order(lim).await.unwrap();
    oms.replace_order(
        &lim_cid,
        ReplaceOrderRequest {
            new_qty: Some(Qty(5)),
            new_limit_price: Some(PriceTicks(19_100)),
            new_stop_price: None,
        },
    )
    .await
    .unwrap();
    mock.set_market_price("AAPL", PriceTicks(19_100));
    assert!(
        drain_ws_until(&mut oms, &mut rx, Duration::from_secs(2), |o| {
            o.get_order(&lim_cid).map(|r| r.state) == Some(OrderState::Filled)
        })
        .await
    );
    assert_eq!(oms.get_position("AAPL").net_qty, Qty(5));

    // Stop sell 2 @ 190.50
    let stp = make_intent(
        "AAPL",
        Side::Sell,
        2,
        OrderType::Stop {
            stop_price: PriceTicks(19_050),
        },
        OrderClass::Simple,
        ExecutionEnv::BrokerSandbox,
    );
    let stp_cid = stp.client_order_id.clone();
    oms.submit_order(stp).await.unwrap();
    mock.set_market_price("AAPL", PriceTicks(19_050));
    assert!(
        drain_ws_until(&mut oms, &mut rx, Duration::from_secs(2), |o| {
            o.get_order(&stp_cid).map(|r| r.state) == Some(OrderState::Filled)
        })
        .await
    );
    assert_eq!(oms.get_position("AAPL").net_qty, Qty(3));

    // TrailingStop sell 3 (trail 50 ticks = $0.50): rallies to 192.00, pulls back to 191.50 -> fills!
    let trl = make_intent(
        "AAPL",
        Side::Sell,
        3,
        OrderType::TrailingStop {
            trail_ticks: Some(50),
            trail_bps: None,
        },
        OrderClass::Simple,
        ExecutionEnv::BrokerSandbox,
    );
    let trl_cid = trl.client_order_id.clone();
    oms.submit_order(trl).await.unwrap();
    mock.set_market_price("AAPL", PriceTicks(19_200));
    mock.set_market_price("AAPL", PriceTicks(19_150));
    assert!(
        drain_ws_until(&mut oms, &mut rx, Duration::from_secs(2), |o| {
            o.get_order(&trl_cid).map(|r| r.state) == Some(OrderState::Filled)
        })
        .await
    );
    assert_eq!(oms.get_position("AAPL").net_qty, Qty::ZERO);

    // Fault Injection Suite (>= 24 fault runs: 429, 5xx before commit, 5xx after commit, malformed JSON/NaN)
    let orders_before_faults = mock.total_order_count();
    let mut successful_submits = 0usize;

    // 8x HTTP 429 rate-limit backoff runs
    for i in 0..8 {
        mock.enqueue_post_fault(InjectedFault::RateLimit429 { retry_after_ms: 5 });
        let intent = make_intent(
            "TSLA",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(20_000 + i),
            },
            OrderClass::Simple,
            ExecutionEnv::BrokerSandbox,
        );
        oms.submit_order(intent).await.expect("429 should recover via backoff");
        successful_submits += 1;
    }

    // 8x HTTP 503 BEFORE commit -> adapter queries by_client_order_id (404), retries cleanly
    for i in 0..8 {
        mock.enqueue_post_fault(InjectedFault::Server5xxBeforeCommit(503));
        let intent = make_intent(
            "TSLA",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(20_100 + i),
            },
            OrderClass::Simple,
            ExecutionEnv::BrokerSandbox,
        );
        oms.submit_order(intent)
            .await
            .expect("503 before commit should recover idempotently");
        successful_submits += 1;
    }

    // 8x HTTP 500 AFTER commit -> adapter queries by_client_order_id (200), adopts WITHOUT re-POSTing!
    for i in 0..8 {
        mock.enqueue_post_fault(InjectedFault::Server5xxAfterCommit(500));
        let intent = make_intent(
            "TSLA",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(20_200 + i),
            },
            OrderClass::Simple,
            ExecutionEnv::BrokerSandbox,
        );
        let cid = intent.client_order_id.clone();
        oms.submit_order(intent)
            .await
            .expect("500 after commit must adopt existing order");
        // Calling submit_order again with identical client_order_id -> 0 duplicates!
        let dup_intent = OrderIntent {
            client_order_id: cid,
            symbol: "TSLA".to_string(),
            side: Side::Buy,
            qty: Qty(1),
            order_type: OrderType::Limit {
                limit_price: PriceTicks(20_200 + i),
            },
            order_class: OrderClass::Simple,
            tif: TimeInForce::Day,
            env: ExecutionEnv::BrokerSandbox,
            parent_client_order_id: None,
            oco_sibling_id: None,
        };
        oms.submit_order(dup_intent).await.unwrap();
        successful_submits += 1;
    }

    // Assert ZERO duplicate orders created across all 24 fault runs!
    assert_eq!(
        mock.total_order_count() - orders_before_faults,
        successful_submits,
        "ZERO duplicate orders allowed across 24 fault-injection runs"
    );

    // Malformed JSON and NaN numeric field MUST be rejected cleanly
    mock.enqueue_post_fault(InjectedFault::MalformedJson);
    let bad_json_intent = make_intent(
        "TSLA",
        Side::Buy,
        1,
        OrderType::Limit {
            limit_price: PriceTicks(19_900),
        },
        OrderClass::Simple,
        ExecutionEnv::BrokerSandbox,
    );
    assert!(matches!(
        oms.submit_order(bad_json_intent).await,
        Err(OmsError::Adapter(AdapterError::MalformedPayload(_)))
    ));

    mock.enqueue_post_fault(InjectedFault::InvalidNumericField);
    let nan_intent = make_intent(
        "TSLA",
        Side::Buy,
        1,
        OrderType::Limit {
            limit_price: PriceTicks(19_901),
        },
        OrderClass::Simple,
        ExecutionEnv::BrokerSandbox,
    );
    assert!(matches!(
        oms.submit_order(nan_intent).await,
        Err(OmsError::Adapter(AdapterError::MalformedPayload(_)))
    ));

    // Mid-session WS disconnect -> OMS enters RECONCILING -> auto-reconnects & reconciles < 3 s!
    let reconnect_start = Instant::now();
    mock.force_drop_ws();
    let saw_disconnect = drain_ws_until(&mut oms, &mut rx, Duration::from_secs(2), |o| {
        o.is_reconciling()
    })
    .await;
    assert!(saw_disconnect, "OMS must enter RECONCILING on WS disconnect");

    let reconnected = drain_ws_until(&mut oms, &mut rx, Duration::from_secs(3), |o| {
        !o.is_reconciling()
    })
    .await;
    let recon_elapsed = reconnect_start.elapsed();
    assert!(reconnected, "OMS must auto-reconnect and complete reconciliation");
    assert!(
        recon_elapsed < Duration::from_secs(3),
        "WS reconnect reconciliation exceeded 3s SLA: {recon_elapsed:?}"
    );

    let final_recon = oms.reconcile_with_broker().await.unwrap();
    assert!(final_recon.clean, "final reconcile failed: {final_recon:?}");

    adapter.stop_ws_stream();
    cleanup_db(&db);
}

// ============================================================================
// S06-T5: Pre-Trade Risk Gate & Panic Kill-Switch (50 Working Orders + 5 Pos)
// ============================================================================

#[tokio::test]
async fn s06_t5_pre_trade_risk_gate_and_kill_switch_50_orders() {
    let db = test_db_path("s06_t5_risk_kill");
    let specs = vec![
        InstrumentSpec::cme_es("ESM26"),
        InstrumentSpec::cme_mes("MESM26"),
        InstrumentSpec::us_equity("AAPL"),
        InstrumentSpec::us_equity("MSFT"),
        InstrumentSpec::us_equity("NVDA"),
        InstrumentSpec::us_equity("AMZN"),
    ];
    let sim = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
    let mut rx = sim.subscribe_events();

    let risk_cfg = RiskConfig {
        paper_only_mode: true,
        max_order_qty: Qty(20),
        max_position_qty: Qty(30),
        max_daily_loss_micros: MoneyMicros::from_dollars(500),
        fat_finger_collar_bps: Bps(200), // 2.00%
        duplicate_window_ms: 500,
        max_orders_per_sec: 100,
        anti_hedging_enabled: true,
    };
    let mut oms = OmsEngine::new(&db, sim.clone(), risk_cfg, specs.clone()).unwrap();

    sim.set_market_price("ESM26", PriceTicks(24_000)); // 6000.00
    sim.set_market_price("MESM26", PriceTicks(24_000));
    oms.update_bbo(
        "ESM26",
        BboQuote {
            bid: PriceTicks(23_999),
            ask: PriceTicks(24_001),
        },
    );

    // 1. Max order size guard
    let oversized = make_intent(
        "ESM26",
        Side::Buy,
        25,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    assert!(matches!(
        oms.submit_order(oversized).await,
        Err(OmsError::Risk(RiskError::MaxOrderSizeExceeded { .. }))
    ));

    // 2. Fat-finger price collar (> 2.00% from 24001)
    let fat_finger = make_intent(
        "ESM26",
        Side::Buy,
        1,
        OrderType::Limit {
            limit_price: PriceTicks(25_000),
        },
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    assert!(matches!(
        oms.submit_order(fat_finger).await,
        Err(OmsError::Risk(RiskError::FatFingerCollarBreached { .. }))
    ));

    // 3. Buy 1 ES -> then attempt opposing Sell 1 MES (same CME_ES product group -> CME Rule 534!)
    let es_buy = make_intent(
        "ESM26",
        Side::Buy,
        1,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    oms.submit_order(es_buy).await.unwrap();
    drain_events(&mut oms, &mut rx).await;

    let mes_hedge = make_intent(
        "MESM26",
        Side::Sell,
        1,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    assert!(matches!(
        oms.submit_order(mes_hedge).await,
        Err(OmsError::Risk(RiskError::AntiHedgingViolation { .. }))
    ));

    // 4. Duplicate order throttle within 500ms window
    let lim1 = make_intent(
        "ESM26",
        Side::Buy,
        1,
        OrderType::Limit {
            limit_price: PriceTicks(23_900),
        },
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    oms.submit_order(lim1).await.unwrap();
    let lim2 = make_intent(
        "ESM26",
        Side::Buy,
        1,
        OrderType::Limit {
            limit_price: PriceTicks(23_900),
        },
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    assert!(matches!(
        oms.submit_order(lim2).await,
        Err(OmsError::Risk(RiskError::DuplicateOrderThrottled { .. }))
    ));

    // 5. Daily loss limit guard (simulate unrealized loss > $500 on long 1 ES: drop 12 pts = -$600)
    oms.update_bbo(
        "ESM26",
        BboQuote {
            bid: PriceTicks(23_950),
            ask: PriceTicks(23_952),
        },
    );
    let loss_order = make_intent(
        "AAPL",
        Side::Buy,
        1,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    assert!(matches!(
        oms.submit_order(loss_order).await,
        Err(OmsError::Risk(RiskError::DailyLossLimitBreached { .. }))
    ));
    cleanup_db(&db);

    // 6. Panic Kill-Switch SLA: 5 open positions + 50 resting working orders
    let db2 = test_db_path("s06_t5_kill50");
    let sim2 = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
    let mut rx2 = sim2.subscribe_events();
    let kill_risk = RiskConfig {
        paper_only_mode: true,
        max_order_qty: Qty(100),
        max_position_qty: Qty(500),
        max_daily_loss_micros: MoneyMicros::from_dollars(100_000),
        fat_finger_collar_bps: Bps(5_000),
        duplicate_window_ms: 0,
        max_orders_per_sec: 1000,
        anti_hedging_enabled: false,
    };
    let mut oms2 = OmsEngine::new(&db2, sim2.clone(), kill_risk, specs).unwrap();

    let syms = ["ESM26", "AAPL", "MSFT", "NVDA", "AMZN"];
    for s in syms {
        sim2.set_market_price(s, PriceTicks(10_000));
        let open_pos = make_intent(
            s,
            Side::Buy,
            5,
            OrderType::Market,
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        oms2.submit_order(open_pos).await.unwrap();
    }
    drain_events(&mut oms2, &mut rx2).await;

    // Place 50 resting limit orders (10 per symbol)
    for i in 0..50 {
        let s = syms[i % syms.len()];
        let resting = make_intent(
            s,
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(9_000 - (i as i64)),
            },
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        oms2.submit_order(resting).await.unwrap();
    }
    drain_events(&mut oms2, &mut rx2).await;
    assert_eq!(oms2.working_orders().len(), 50);

    let report = oms2.trigger_kill_switch("S06-T5 panic test").await.unwrap();
    assert!(report.verified_flat);
    assert_eq!(report.canceled_orders, 50);
    assert_eq!(report.flattened_positions, 5);
    assert_eq!(report.remaining_working_orders, 0);
    assert_eq!(report.remaining_open_positions, 0);
    assert!(
        report.halt_latency_ns < 10_000_000,
        "halt latency must be < 10ms, got {} ns",
        report.halt_latency_ns
    );
    assert!(
        report.total_latency_ns < 5_000_000_000,
        "total kill-switch latency must be < 5s, got {} ns",
        report.total_latency_ns
    );

    // Post-halt order MUST be rejected immediately
    let post_halt = make_intent(
        "AAPL",
        Side::Buy,
        1,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::LocalPaper,
    );
    assert!(matches!(
        oms2.submit_order(post_halt).await,
        Err(OmsError::Risk(RiskError::OmsHalted))
    ));

    cleanup_db(&db2);
}

// ============================================================================
// S06-T6 & S06-T7: Sim-vs-Live Hard Isolation, Secret Hygiene & DO-NOT-BUILD
// ============================================================================

struct DummyForbiddenAdapter {
    id: String,
    tx: broadcast::Sender<BrokerEvent>,
}

#[async_trait]
impl ExecutionAdapter for DummyForbiddenAdapter {
    fn capabilities(&self) -> AdapterCapabilities {
        AdapterCapabilities {
            adapter_id: self.id.clone(),
            env: ExecutionEnv::BrokerSandbox,
            paper_mode: true,
            supports_native_oco: false,
            supports_modify_in_place: false,
            supports_trailing_stop: false,
            supports_bulk_cancel: false,
            allowed_hosts: vec![],
        }
    }
    async fn submit_order(&self, _: &OrderIntent) -> Result<BrokerOrderAck, AdapterError> {
        unimplemented!()
    }
    async fn cancel_order(&self, _: &str) -> Result<(), AdapterError> {
        unimplemented!()
    }
    async fn replace_order(&self, _: &str, _: &ReplaceOrderRequest) -> Result<BrokerOrderAck, AdapterError> {
        unimplemented!()
    }
    async fn cancel_all_orders(&self) -> Result<usize, AdapterError> {
        unimplemented!()
    }
    async fn close_all_positions(&self) -> Result<usize, AdapterError> {
        unimplemented!()
    }
    async fn get_order_by_client_id(&self, _: &ClientOrderId) -> Result<Option<BrokerOrderSnapshot>, AdapterError> {
        unimplemented!()
    }
    async fn list_open_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError> {
        unimplemented!()
    }
    async fn list_all_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError> {
        unimplemented!()
    }
    async fn list_positions(&self) -> Result<Vec<BrokerPositionSnapshot>, AdapterError> {
        unimplemented!()
    }
    async fn get_account(&self) -> Result<BrokerAccountSnapshot, AdapterError> {
        unimplemented!()
    }
    fn subscribe_events(&self) -> broadcast::Receiver<BrokerEvent> {
        self.tx.subscribe()
    }
}

#[tokio::test]
async fn s06_t6_t7_sim_vs_live_isolation_secret_hygiene_and_do_not_build_denylist() {
    let db = test_db_path("s06_t6_isolation");
    let specs = vec![InstrumentSpec::us_equity("AAPL")];

    // 1. Sandbox credentials CANNOT target live hosts
    let secret_key = "SUPER_SECRET_DO_NOT_LEAK_999";
    let key_id = "PK_SANDBOX_KEY_123";
    let paper_creds = ApiCredentials::paper_mock(key_id, secret_key);

    assert!(matches!(
        paper_creds.validate_target_url("https://api.alpaca.markets/v2/orders"),
        Err(RiskError::CrossEnvHostViolation { .. })
    ));
    assert!(matches!(
        paper_creds.validate_target_url("wss://api.alpaca.markets/stream"),
        Err(RiskError::CrossEnvHostViolation { .. })
    ));
    assert!(matches!(
        paper_creds.validate_target_url("https://api.tastyworks.com/orders"),
        Err(RiskError::CrossEnvHostViolation { .. })
    ));
    assert!(paper_creds
        .validate_target_url("https://paper-api.alpaca.markets/v2/orders")
        .is_ok());
    assert!(paper_creds
        .validate_target_url("http://127.0.0.1:8080/v2/orders")
        .is_ok());

    // AlpacaPaperAdapter constructor refuses live URLs and BrokerLive credentials
    let bad_cfg = AlpacaAdapterConfig::local_mock(
        "https://api.alpaca.markets".to_string(),
        "wss://api.alpaca.markets/stream".to_string(),
    );
    assert!(matches!(
        AlpacaPaperAdapter::new(paper_creds.clone(), bad_cfg, specs.clone()),
        Err(AdapterError::SecurityViolation(_))
    ));
    let live_creds = ApiCredentials::new(ExecutionEnv::BrokerLive, "LIVE_KEY", "LIVE_SECRET");
    assert!(matches!(
        live_creds.validate_target_url("https://api.alpaca.markets/v2/orders"),
        Err(RiskError::LiveTradingCompileDisabled)
    ));

    // 2. Debug & Display redaction (zero secret leakage)
    let dbg_str = format!("{paper_creds:?}");
    let disp_str = format!("{paper_creds}");
    assert!(!dbg_str.contains(secret_key));
    assert!(!dbg_str.contains(key_id));
    assert!(!disp_str.contains(secret_key));
    assert!(!disp_str.contains(key_id));

    // 3. LIVE_ARMED boots false, arm_live() fails in PaperOnly build, BrokerLive intent rejected
    let sim = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
    let mut oms = OmsEngine::new(&db, sim.clone(), RiskConfig::default(), specs.clone()).unwrap();
    assert!(!oms.risk_gate().is_live_armed());
    assert!(matches!(
        oms.risk_gate().arm_live(),
        Err(RiskError::LiveTradingCompileDisabled)
    ));
    let live_intent = make_intent(
        "AAPL",
        Side::Buy,
        1,
        OrderType::Market,
        OrderClass::Simple,
        ExecutionEnv::BrokerLive,
    );
    assert!(matches!(
        oms.submit_order(live_intent).await,
        Err(OmsError::Risk(RiskError::LiveTradingCompileDisabled))
    ));

    // Verify zero secret strings written to SQLite DB or WAL file on disk
    let raw_db_bytes = std::fs::read(&db).unwrap_or_default();
    assert!(!String::from_utf8_lossy(&raw_db_bytes).contains(secret_key));
    if let Ok(wal_bytes) = std::fs::read(format!("{}-wal", db.display())) {
        assert!(!String::from_utf8_lossy(&wal_bytes).contains(secret_key));
    }

    // 4. R04 Prop-Firm & Closed-Gateway DO-NOT-BUILD Denylist Enforcement (S06-T7)
    for forbidden in FORBIDDEN_DO_NOT_BUILD_ADAPTERS {
        assert!(
            matches!(
                verify_adapter_allowed(forbidden),
                Err(AdapterError::ForbiddenAdapter(_))
            ),
            "expected '{forbidden}' to be blocked"
        );
        let (tx, _) = broadcast::channel(8);
        let bad_adapter = Arc::new(DummyForbiddenAdapter {
            id: (*forbidden).to_string(),
            tx,
        });
        let db_bad = test_db_path("s06_forbidden");
        assert!(matches!(
            OmsEngine::new(&db_bad, bad_adapter, RiskConfig::default(), specs.clone()),
            Err(OmsError::Adapter(AdapterError::ForbiddenAdapter(_)))
        ));
        cleanup_db(&db_bad);
    }
    assert!(verify_adapter_allowed("local_paper_sim").is_ok());
    assert!(verify_adapter_allowed("alpaca_paper_v2").is_ok());

    cleanup_db(&db);
}
