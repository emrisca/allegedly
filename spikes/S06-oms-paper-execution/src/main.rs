use allegedly_s06_oms::adapter::alpaca_paper::{AlpacaAdapterConfig, AlpacaPaperAdapter};
use allegedly_s06_oms::adapter::local_paper::{
    LocalPaperAdapter, LocalPaperConfig, PartialFillPolicy,
};
use allegedly_s06_oms::adapter::{BrokerEvent, ExecutionAdapter};
use allegedly_s06_oms::journal::{JournalEvent, SqliteWalJournal};
use allegedly_s06_oms::mock_alpaca::{InjectedFault, MockAlpacaHandle};
use allegedly_s06_oms::oms::{OmsEngine, OmsError};
use allegedly_s06_oms::risk::{ApiCredentials, RiskConfig};
use allegedly_s06_oms::state::OrderState;
use allegedly_s06_oms::types::{
    now_unix_ns, BboQuote, Bps, ClientOrderId, ExecutionEnv, InstrumentSpec, MoneyMicros,
    OrderClass, OrderIntent, OrderType, PriceTicks, ProtectiveLegMode, Qty, Side, TimeInForce,
};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;
use uuid::Uuid;

const BENCH_DIR: &str = "/tmp/allegedly-s06-bench";

fn bench_db(name: &str) -> PathBuf {
    let dir = PathBuf::from(BENCH_DIR);
    std::fs::create_dir_all(&dir).expect("create /tmp/allegedly-s06-bench");
    dir.join(format!("{name}-{}.sqlite", Uuid::now_v7()))
}

fn cleanup_db(path: &Path) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", path.display()));
}

/// Format nanoseconds cleanly using 100% integer math (zero floats anywhere in `src/`).
fn fmt_ns(ns: u64) -> String {
    if ns < 1_000 {
        format!("{ns} ns")
    } else if ns < 1_000_000 {
        let us_whole = ns / 1_000;
        let us_frac = (ns % 1_000) / 10;
        format!("{us_whole}.{us_frac:02} us")
    } else {
        let ms_whole = ns / 1_000_000;
        let ms_frac = (ns % 1_000_000) / 1_000;
        format!("{ms_whole}.{ms_frac:03} ms")
    }
}

struct LatencyStats {
    p50_ns: u64,
    p95_ns: u64,
    p99_ns: u64,
    max_ns: u64,
}

fn compute_stats(samples: &mut [u64]) -> LatencyStats {
    samples.sort_unstable();
    let n = samples.len();
    if n == 0 {
        return LatencyStats {
            p50_ns: 0,
            p95_ns: 0,
            p99_ns: 0,
            max_ns: 0,
        };
    }
    let idx = |pct: usize| -> usize { ((n - 1) * pct) / 100 };
    LatencyStats {
        p50_ns: samples[idx(50)],
        p95_ns: samples[idx(95)],
        p99_ns: samples[idx(99)],
        max_ns: samples[n - 1],
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

async fn drain_local(oms: &mut OmsEngine, rx: &mut broadcast::Receiver<BrokerEvent>) {
    loop {
        match rx.try_recv() {
            Ok(ev) => {
                oms.apply_broker_event(ev).await.expect("apply local event");
            }
            Err(broadcast::error::TryRecvError::Empty) => break,
            Err(broadcast::error::TryRecvError::Lagged(_)) => continue,
            Err(broadcast::error::TryRecvError::Closed) => break,
        }
    }
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
        match tokio::time::timeout(rem.min(Duration::from_millis(25)), rx.recv()).await {
            Ok(Ok(ev)) => {
                oms.apply_broker_event(ev).await.expect("apply ws event");
            }
            Ok(Err(broadcast::error::RecvError::Lagged(_))) => continue,
            Ok(Err(broadcast::error::RecvError::Closed)) => return pred(oms),
            Err(_) => continue,
        }
    }
}

fn bench_risk_config() -> RiskConfig {
    RiskConfig {
        paper_only_mode: true,
        max_order_qty: Qty(1_000),
        max_position_qty: Qty(50_000),
        max_daily_loss_micros: MoneyMicros::from_dollars(10_000_000),
        fat_finger_collar_bps: Bps(5_000),
        duplicate_window_ms: 0,
        max_orders_per_sec: 100_000,
        anti_hedging_enabled: false,
    }
}

#[tokio::main]
async fn main() {
    println!("=========================================================================");
    println!(" Allegedly Phase 2 Spike S06 — OMS & Paper Execution Benchmark Suite");
    println!(" Safety Mode: PAPER / LOCAL WIRE-MOCK ONLY (ZERO live orders/credentials)");
    println!(" WAL Directory: {BENCH_DIR}");
    println!("=========================================================================\n");

    // -------------------------------------------------------------------------
    // Benchmark 1: Fixed-Point Integer Parsing, Formatting & P&L Math
    // -------------------------------------------------------------------------
    let es = InstrumentSpec::cme_es("ESM26");
    let iters: u64 = 100_000;
    let fp_start = Instant::now();
    let mut checksum: i128 = 0;
    for i in 0..iters {
        let p = es.parse_price_str("5942.25").unwrap();
        let s = es.format_price_ticks(PriceTicks(p.0 + (i as i64 % 8))).unwrap();
        let p2 = es.parse_price_str(&s).unwrap();
        let pnl = es.pnl_micros(p, p2, Qty(2)).unwrap();
        checksum = checksum.wrapping_add(pnl.0);
    }
    let fp_elapsed_ns = fp_start.elapsed().as_nanos() as u64;
    let fp_per_op_ns = fp_elapsed_ns / iters;
    println!("[1] Fixed-Point Round-Trip + P&L ({iters} ops, zero floats):");
    println!(
        "    total = {}, avg = {}/op (checksum={})\n",
        fmt_ns(fp_elapsed_ns),
        fmt_ns(fp_per_op_ns),
        checksum
    );

    // -------------------------------------------------------------------------
    // Benchmark 2: Raw SQLite WAL (synchronous=FULL) Append Latency
    // -------------------------------------------------------------------------
    let wal_db = bench_db("raw-wal");
    let journal = SqliteWalJournal::open(&wal_db).expect("open wal");
    let wal_mode = journal.journal_mode().unwrap();
    let wal_iters = 500usize;
    let mut wal_samples = Vec::with_capacity(wal_iters);
    for i in 0..wal_iters {
        let intent = make_intent(
            "ESM26",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(23_700 + (i as i64 % 20)),
            },
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        let ev = JournalEvent::IntentLogged {
            intent,
            protective_leg_mode: ProtectiveLegMode::BrokerNative,
        };
        let t0 = Instant::now();
        journal.append(now_unix_ns(), &ev).unwrap();
        wal_samples.push(t0.elapsed().as_nanos() as u64);
    }
    let wal_stats = compute_stats(&mut wal_samples);
    println!("[2] SQLite WAL Append Latency (journal_mode={wal_mode}, synchronous=FULL, n={wal_iters}):");
    println!(
        "    p50 = {}, p95 = {}, p99 = {}, max = {}\n",
        fmt_ns(wal_stats.p50_ns),
        fmt_ns(wal_stats.p95_ns),
        fmt_ns(wal_stats.p99_ns),
        fmt_ns(wal_stats.max_ns)
    );
    drop(journal);
    cleanup_db(&wal_db);

    // -------------------------------------------------------------------------
    // Benchmark 3: Full OMS Submit (Risk Gate + WAL + LocalPaperAdapter)
    // -------------------------------------------------------------------------
    let oms_db = bench_db("oms-submit");
    let specs = vec![
        InstrumentSpec::cme_es("ESM26"),
        InstrumentSpec::us_equity("AAPL"),
        InstrumentSpec::us_equity("MSFT"),
        InstrumentSpec::us_equity("NVDA"),
        InstrumentSpec::us_equity("AMZN"),
        InstrumentSpec::us_equity("TSLA"),
    ];
    let sim = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
    let mut rx = sim.subscribe_events();
    let mut oms = OmsEngine::new(&oms_db, sim.clone(), bench_risk_config(), specs.clone()).unwrap();
    sim.set_market_price("ESM26", PriceTicks(24_000));
    oms.update_bbo(
        "ESM26",
        BboQuote {
            bid: PriceTicks(23_999),
            ask: PriceTicks(24_001),
        },
    );

    let submit_iters = 500usize;
    let mut submit_samples = Vec::with_capacity(submit_iters);
    for i in 0..submit_iters {
        let intent = make_intent(
            "ESM26",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(23_500 + (i as i64 % 50)),
            },
            OrderClass::Simple,
            ExecutionEnv::LocalPaper,
        );
        let t0 = Instant::now();
        oms.submit_order(intent).await.unwrap();
        submit_samples.push(t0.elapsed().as_nanos() as u64);
    }
    drain_local(&mut oms, &mut rx).await;
    let submit_stats = compute_stats(&mut submit_samples);
    println!("[3] Full OMS Submit Path (Risk + 3x WAL + LocalPaperAdapter, n={submit_iters}):");
    println!(
        "    p50 = {}, p95 = {}, p99 = {}, max = {}\n",
        fmt_ns(submit_stats.p50_ns),
        fmt_ns(submit_stats.p95_ns),
        fmt_ns(submit_stats.p99_ns),
        fmt_ns(submit_stats.max_ns)
    );
    drop(oms);
    cleanup_db(&oms_db);

    // -------------------------------------------------------------------------
    // Benchmark 4: Bracket + Partial-Fill Scaling [3, 7] + OCO Sibling Cancel
    // -------------------------------------------------------------------------
    let br_db = bench_db("bracket-partial");
    let br_cfg = LocalPaperConfig {
        partial_fill_policy: PartialFillPolicy::FixedChunks(vec![3, 7]),
        supports_native_oco: true,
        ..Default::default()
    };
    let br_sim = Arc::new(LocalPaperAdapter::new(br_cfg, specs.clone()));
    let mut br_rx = br_sim.subscribe_events();
    let mut br_oms = OmsEngine::new(&br_db, br_sim.clone(), bench_risk_config(), specs.clone()).unwrap();
    let br_cycles = 100usize;
    let mut br_samples = Vec::with_capacity(br_cycles);
    for _ in 0..br_cycles {
        br_sim.set_market_price("AAPL", PriceTicks(18_500));
        let intent = make_intent(
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
        let cid = intent.client_order_id.clone();
        let t0 = Instant::now();
        br_oms.submit_order(intent).await.unwrap();
        drain_local(&mut br_oms, &mut br_rx).await;
        br_sim.set_market_price("AAPL", PriceTicks(18_600));
        drain_local(&mut br_oms, &mut br_rx).await;
        br_samples.push(t0.elapsed().as_nanos() as u64);

        let bg = br_oms.get_bracket(&cid).unwrap();
        let tp = bg.take_profit_client_id.as_ref().unwrap();
        let sl = bg.stop_loss_client_id.as_ref().unwrap();
        assert_eq!(br_oms.get_order(tp).unwrap().state, OrderState::Filled);
        assert_eq!(br_oms.get_order(sl).unwrap().state, OrderState::Canceled);
    }
    assert_eq!(br_oms.get_position("AAPL").net_qty, Qty::ZERO);
    let br_stats = compute_stats(&mut br_samples);
    println!("[4] Bracket Entry (Partial [3,7]) + OCO TP Fill & SL Cancel (n={br_cycles}):");
    println!(
        "    p50 = {}, p95 = {}, p99 = {}, max = {}, final_pos = 0\n",
        fmt_ns(br_stats.p50_ns),
        fmt_ns(br_stats.p95_ns),
        fmt_ns(br_stats.p99_ns),
        fmt_ns(br_stats.max_ns)
    );
    drop(br_oms);
    cleanup_db(&br_db);

    // -------------------------------------------------------------------------
    // Benchmark 5A: Panic Kill-Switch Fan-Out (50 Open Orders + 5 Pos) — LocalPaper
    // -------------------------------------------------------------------------
    let ks_trials = 20usize;
    let mut ks_local_halt = Vec::with_capacity(ks_trials);
    let mut ks_local_total = Vec::with_capacity(ks_trials);
    let syms5 = ["ESM26", "AAPL", "MSFT", "NVDA", "AMZN"];

    for _ in 0..ks_trials {
        let db = bench_db("kill-local");
        let lsim = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
        let mut lrx = lsim.subscribe_events();
        let mut loms = OmsEngine::new(&db, lsim.clone(), bench_risk_config(), specs.clone()).unwrap();
        for s in syms5 {
            lsim.set_market_price(s, PriceTicks(10_000));
            loms.submit_order(make_intent(
                s,
                Side::Buy,
                5,
                OrderType::Market,
                OrderClass::Simple,
                ExecutionEnv::LocalPaper,
            ))
            .await
            .unwrap();
        }
        drain_local(&mut loms, &mut lrx).await;
        for i in 0..50 {
            let s = syms5[i % syms5.len()];
            loms.submit_order(make_intent(
                s,
                Side::Buy,
                1,
                OrderType::Limit {
                    limit_price: PriceTicks(9_000 - i as i64),
                },
                OrderClass::Simple,
                ExecutionEnv::LocalPaper,
            ))
            .await
            .unwrap();
        }
        drain_local(&mut loms, &mut lrx).await;

        let rep = loms.trigger_kill_switch("bench local").await.unwrap();
        assert!(rep.verified_flat);
        assert_eq!(rep.canceled_orders, 50);
        assert_eq!(rep.flattened_positions, 5);
        assert_eq!(rep.remaining_working_orders, 0);
        assert_eq!(rep.remaining_open_positions, 0);
        ks_local_halt.push(rep.halt_latency_ns);
        ks_local_total.push(rep.total_latency_ns);
        drop(loms);
        cleanup_db(&db);
    }
    let ks_lh = compute_stats(&mut ks_local_halt);
    let ks_lt = compute_stats(&mut ks_local_total);
    println!("[5A] Kill-Switch Fan-Out (LocalPaper, 50 working orders + 5 positions, n={ks_trials}):");
    println!(
        "     Halt  : p50 = {}, p95 = {}, p99 = {}, max = {} (SLA < 10 ms)",
        fmt_ns(ks_lh.p50_ns),
        fmt_ns(ks_lh.p95_ns),
        fmt_ns(ks_lh.p99_ns),
        fmt_ns(ks_lh.max_ns)
    );
    println!(
        "     Total : p50 = {}, p95 = {}, p99 = {}, max = {} (SLA < 5 s, 0 stray working)\n",
        fmt_ns(ks_lt.p50_ns),
        fmt_ns(ks_lt.p95_ns),
        fmt_ns(ks_lt.p99_ns),
        fmt_ns(ks_lt.max_ns)
    );

    // -------------------------------------------------------------------------
    // Benchmark 5B: Panic Kill-Switch Fan-Out (50 Open Orders + 5 Pos) — Alpaca Wire-Mock
    // -------------------------------------------------------------------------
    let mut ks_alp_halt = Vec::with_capacity(ks_trials);
    let mut ks_alp_total = Vec::with_capacity(ks_trials);

    for _ in 0..ks_trials {
        let db = bench_db("kill-alpaca");
        let mock = MockAlpacaHandle::start("PK_BENCH", "SK_BENCH", specs.clone()).await;
        let creds = ApiCredentials::paper_mock("PK_BENCH", "SK_BENCH");
        let cfg = AlpacaAdapterConfig::local_mock(mock.base_http_url.clone(), mock.ws_url.clone());
        let adapter = Arc::new(AlpacaPaperAdapter::new(creds, cfg, specs.clone()).unwrap());
        let mut aoms = OmsEngine::new(&db, adapter.clone(), bench_risk_config(), specs.clone()).unwrap();

        for s in syms5 {
            mock.set_market_price(s, PriceTicks(10_000));
            aoms.submit_order(make_intent(
                s,
                Side::Buy,
                5,
                OrderType::Market,
                OrderClass::Simple,
                ExecutionEnv::BrokerSandbox,
            ))
            .await
            .unwrap();
        }
        for i in 0..50 {
            let s = syms5[i % syms5.len()];
            aoms.submit_order(make_intent(
                s,
                Side::Buy,
                1,
                OrderType::Limit {
                    limit_price: PriceTicks(9_000 - i as i64),
                },
                OrderClass::Simple,
                ExecutionEnv::BrokerSandbox,
            ))
            .await
            .unwrap();
        }

        let rep = aoms.trigger_kill_switch("bench alpaca").await.unwrap();
        assert!(rep.verified_flat);
        assert_eq!(rep.canceled_orders, 50);
        assert_eq!(rep.flattened_positions, 5);
        assert_eq!(rep.remaining_working_orders, 0);
        assert_eq!(rep.remaining_open_positions, 0);
        ks_alp_halt.push(rep.halt_latency_ns);
        ks_alp_total.push(rep.total_latency_ns);
        drop(aoms);
        cleanup_db(&db);
    }
    let ks_ah = compute_stats(&mut ks_alp_halt);
    let ks_at = compute_stats(&mut ks_alp_total);
    println!("[5B] Kill-Switch Fan-Out (Alpaca Wire-Mock HTTP, 50 working orders + 5 positions, n={ks_trials}):");
    println!(
        "     Halt  : p50 = {}, p95 = {}, p99 = {}, max = {} (SLA < 10 ms)",
        fmt_ns(ks_ah.p50_ns),
        fmt_ns(ks_ah.p95_ns),
        fmt_ns(ks_ah.p99_ns),
        fmt_ns(ks_ah.max_ns)
    );
    println!(
        "     Total : p50 = {}, p95 = {}, p99 = {}, max = {} (SLA < 5 s, 0 stray working)\n",
        fmt_ns(ks_at.p50_ns),
        fmt_ns(ks_at.p95_ns),
        fmt_ns(ks_at.p99_ns),
        fmt_ns(ks_at.max_ns)
    );

    // -------------------------------------------------------------------------
    // Benchmark 6: SQLite WAL Crash Recovery & Reconciliation (500 Orders / ~1500 Events)
    // -------------------------------------------------------------------------
    let crash_db = bench_db("crash-recovery");
    let csim = Arc::new(LocalPaperAdapter::new(LocalPaperConfig::default(), specs.clone()));
    let mut crx = csim.subscribe_events();
    let mut bg_fill_cids = Vec::new();
    let mut bg_cancel_cids = Vec::new();
    {
        let mut coms =
            OmsEngine::new(&crash_db, csim.clone(), bench_risk_config(), specs.clone()).unwrap();
        csim.set_market_price("AAPL", PriceTicks(18_500));

        // 465 filled market orders + 20 resting (fill offline) + 10 resting (cancel offline) + 5 ambiguous
        for i in 0..465 {
            let side = if i % 2 == 0 { Side::Buy } else { Side::Sell };
            coms.submit_order(make_intent(
                "AAPL",
                side,
                1,
                OrderType::Market,
                OrderClass::Simple,
                ExecutionEnv::LocalPaper,
            ))
            .await
            .unwrap();
        }
        drain_local(&mut coms, &mut crx).await;

        for i in 0..20 {
            let intent = make_intent(
                "AAPL",
                Side::Buy,
                2,
                OrderType::Limit {
                    limit_price: PriceTicks(18_000 - i),
                },
                OrderClass::Simple,
                ExecutionEnv::LocalPaper,
            );
            bg_fill_cids.push(intent.client_order_id.clone());
            coms.submit_order(intent).await.unwrap();
        }
        for i in 0..10 {
            let intent = make_intent(
                "AAPL",
                Side::Sell,
                1,
                OrderType::Limit {
                    limit_price: PriceTicks(19_000 + i),
                },
                OrderClass::Simple,
                ExecutionEnv::LocalPaper,
            );
            bg_cancel_cids.push(intent.client_order_id.clone());
            coms.submit_order(intent).await.unwrap();
        }
        for i in 0..5 {
            csim.inject_ambiguous_error(true);
            let intent = make_intent(
                "AAPL",
                Side::Buy,
                1,
                OrderType::Limit {
                    limit_price: PriceTicks(17_500 - i),
                },
                OrderClass::Simple,
                ExecutionEnv::LocalPaper,
            );
            assert!(matches!(
                coms.submit_order(intent).await,
                Err(OmsError::AmbiguousSubmit { .. })
            ));
        }
        drain_local(&mut coms, &mut crx).await;
        // Simulate abrupt process crash by dropping OMS!
    }

    // Venue mutates state while OMS is crashed
    for cid in &bg_fill_cids {
        csim.simulate_venue_fill(cid, Qty(2), PriceTicks(18_000), false)
            .unwrap();
    }
    for cid in &bg_cancel_cids {
        csim.simulate_venue_cancel(cid, false).unwrap();
    }

    let mut recovered = OmsEngine::recover_from_wal(
        &crash_db,
        csim.clone(),
        bench_risk_config(),
        specs.clone(),
    )
    .unwrap();
    let rec_rep = recovered.reconcile_with_broker().await.unwrap();
    assert!(rec_rep.clean);
    assert_eq!(rec_rep.missed_fills_recovered, 20);
    assert_eq!(rec_rep.unknown_orders_resolved, 5);
    println!("[6] SQLite WAL Crash Recovery & Reconciliation (500 orders mid-flight):");
    println!(
        "    WAL events replayed = {}, replay_time = {}, broker_reconcile_time = {}",
        rec_rep.wal_events_replayed,
        fmt_ns(rec_rep.wal_replay_ns),
        fmt_ns(rec_rep.reconcile_ns)
    );
    println!(
        "    missed_fills_recovered = {}, unknown_resolved = {}, orphans = {}, pos_mismatches = {}, clean = {}\n",
        rec_rep.missed_fills_recovered,
        rec_rep.unknown_orders_resolved,
        rec_rep.orphan_broker_orders.len(),
        rec_rep.position_mismatches.len(),
        rec_rep.clean
    );
    drop(recovered);
    cleanup_db(&crash_db);

    // -------------------------------------------------------------------------
    // Benchmark 7: Alpaca Wire-Mock Fault Injection & WS Disconnect Reconnect
    // -------------------------------------------------------------------------
    let fault_db = bench_db("alpaca-faults");
    let mock = MockAlpacaHandle::start("PK_FAULT", "SK_FAULT", specs.clone()).await;
    let creds = ApiCredentials::paper_mock("PK_FAULT", "SK_FAULT");
    let cfg = AlpacaAdapterConfig::local_mock(mock.base_http_url.clone(), mock.ws_url.clone());
    let adapter = Arc::new(AlpacaPaperAdapter::new(creds, cfg, specs.clone()).unwrap());
    adapter.start_ws_stream().await.unwrap();
    let mut ws_rx = adapter.subscribe_events();
    let mut foms = OmsEngine::new(&fault_db, adapter.clone(), bench_risk_config(), specs.clone()).unwrap();

    let mut total_fault_submits = 0usize;
    for i in 0..10 {
        mock.enqueue_post_fault(InjectedFault::RateLimit429 { retry_after_ms: 5 });
        foms.submit_order(make_intent(
            "TSLA",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(21_000 + i),
            },
            OrderClass::Simple,
            ExecutionEnv::BrokerSandbox,
        ))
        .await
        .unwrap();
        total_fault_submits += 1;
    }
    for i in 0..10 {
        mock.enqueue_post_fault(InjectedFault::Server5xxBeforeCommit(503));
        foms.submit_order(make_intent(
            "TSLA",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(21_100 + i),
            },
            OrderClass::Simple,
            ExecutionEnv::BrokerSandbox,
        ))
        .await
        .unwrap();
        total_fault_submits += 1;
    }
    for i in 0..10 {
        mock.enqueue_post_fault(InjectedFault::Server5xxAfterCommit(500));
        foms.submit_order(make_intent(
            "TSLA",
            Side::Buy,
            1,
            OrderType::Limit {
                limit_price: PriceTicks(21_200 + i),
            },
            OrderClass::Simple,
            ExecutionEnv::BrokerSandbox,
        ))
        .await
        .unwrap();
        total_fault_submits += 1;
    }
    assert_eq!(mock.total_order_count(), total_fault_submits);

    // 5x WS Disconnect -> Reconnect + Reconcile Latency
    let mut ws_recon_samples = Vec::with_capacity(5);
    for _ in 0..5 {
        let t0 = Instant::now();
        mock.force_drop_ws();
        let saw_disc = drain_ws_until(&mut foms, &mut ws_rx, Duration::from_secs(2), |o| {
            o.is_reconciling()
        })
        .await;
        assert!(saw_disc);
        let saw_rec = drain_ws_until(&mut foms, &mut ws_rx, Duration::from_secs(3), |o| {
            !o.is_reconciling()
        })
        .await;
        assert!(saw_rec);
        ws_recon_samples.push(t0.elapsed().as_nanos() as u64);
    }
    let ws_stats = compute_stats(&mut ws_recon_samples);
    println!("[7] Alpaca Wire-Mock Fault Injection & WS Reconnect (30 HTTP faults + 5 WS drops):");
    println!(
        "    HTTP faults recovered = {total_fault_submits}/30, broker_orders = {}, duplicates = 0",
        mock.total_order_count()
    );
    println!(
        "    WS reconnect+reconcile: p50 = {}, p95 = {}, p99 = {}, max = {} (SLA < 3 s)",
        fmt_ns(ws_stats.p50_ns),
        fmt_ns(ws_stats.p95_ns),
        fmt_ns(ws_stats.p99_ns),
        fmt_ns(ws_stats.max_ns)
    );

    adapter.stop_ws_stream();
    drop(foms);
    cleanup_db(&fault_db);

    println!("\nALL S06 BENCHMARKS COMPLETED SUCCESSFULLY (0 LIVE ORDERS, 0 DUPLICATES, 0 FLOATS).");
}
