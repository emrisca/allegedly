//! Phase 2 Spike S05 Runner:
//! 1. Live concurrent dual-venue ingest soak (Kraken Spot WS v2 + Coinbase Advanced Trade WS)
//! 2. Local Tick-Vault persistence & exact replay round-trip + 100k synthetic burst throughput
//! 3. Reconnect, sequence-gap detection & bounded-channel backpressure harness
//! 4. Databento `.dbn.zst` (Apache-2.0) + Dukascopy `.bi5` offline decoder verification
//! 5. Lee-Ready & Tick-Rule inference evaluation against exchange-signed ground truth

use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

use allegedly_s05_live_ingest_tickvault::coinbase::{CoinbaseSoakStats, run_coinbase_soak};
use allegedly_s05_live_ingest_tickvault::inference::evaluate_inference_against_ground_truth;
use allegedly_s05_live_ingest_tickvault::kraken::{KrakenSoakStats, run_kraken_soak};
use allegedly_s05_live_ingest_tickvault::model::{
    AggressorSide, AggressorSource, NormalizedTick, ProvenanceHeader, SYM_COINBASE_BTC_USD,
    SYM_COINBASE_ETH_USD, SYM_KRAKEN_BTC_USD, SYM_KRAKEN_ETH_USD, SYM_SYNTHETIC_BTC_USD,
    Timeliness, Venue, VenueCoverage, now_unix_ns,
};
use allegedly_s05_live_ingest_tickvault::offline::{
    Bi5CheckReport, DbnCheckReport, decode_dukascopy_bi5_bytes, run_dbn_verification,
};
use allegedly_s05_live_ingest_tickvault::orderbook::L2OrderBook;
use allegedly_s05_live_ingest_tickvault::resilience::{ResilienceReport, run_resilience_harness};
use allegedly_s05_live_ingest_tickvault::vault::{
    VaultRoundTripReport, roundtrip_verify_and_benchmark,
};
use serde::Serialize;
use tokio::sync::mpsc;

#[derive(Debug, Serialize)]
struct Percentiles {
    p50: f64,
    p95: f64,
    p99: f64,
    max: f64,
}

#[derive(Debug, Serialize)]
struct KrakenSummary {
    ws_messages_total: u64,
    trade_snapshot_ticks: u64,
    trade_live_ticks: u64,
    book_snapshots: u64,
    book_updates: u64,
    heartbeats: u64,
    crc_passed: u64,
    crc_failed: u64,
    resyncs_triggered: u64,
    parse_errors: u64,
    channel_drops: u64,
    bbo_checked: u64,
    bbo_strict_aligned: u64,
    bbo_strict_match_pct: f64,
    bbo_midpoint_aligned: u64,
    bbo_midpoint_match_pct: f64,
    parse_latency_us: Percentiles,
    exchange_to_recv_ms: Percentiles,
}

#[derive(Debug, Serialize)]
struct CoinbaseSummary {
    ws_messages_total: u64,
    trade_snapshot_ticks: u64,
    trade_live_ticks: u64,
    l2_snapshots: u64,
    l2_update_msgs: u64,
    l2_level_deltas: u64,
    heartbeats: u64,
    seq_checked: u64,
    seq_gaps: u64,
    resyncs_triggered: u64,
    parse_errors: u64,
    channel_drops: u64,
    bbo_checked: u64,
    inverted_strict_aligned: u64,
    inverted_strict_match_pct: f64,
    inverted_midpoint_aligned: u64,
    inverted_midpoint_match_pct: f64,
    uninverted_strict_aligned: u64,
    uninverted_strict_match_pct: f64,
    uninverted_midpoint_aligned: u64,
    uninverted_midpoint_match_pct: f64,
    parse_latency_us: Percentiles,
    exchange_to_recv_ms: Percentiles,
}

#[derive(Debug, Serialize)]
struct SyntheticIngestBench {
    events_processed: u64,
    elapsed_ms: f64,
    events_per_sec: f64,
    normalize_latency_us: Percentiles,
}

#[derive(Debug, Serialize)]
struct InferenceSummary {
    label: String,
    evaluated: u64,
    lee_ready_classified: u64,
    lee_ready_correct: u64,
    lee_ready_accuracy_pct: f64,
    tick_rule_classified: u64,
    tick_rule_correct: u64,
    tick_rule_accuracy_pct: f64,
    provenance_tags_verified: bool,
}

#[derive(Debug, Serialize)]
struct FullSpikeReport {
    soak_start_utc: String,
    soak_end_utc: String,
    soak_duration_secs: u64,
    rss_start_mb: f64,
    rss_post_soak_mb: f64,
    rss_peak_mb: f64,
    kraken: KrakenSummary,
    coinbase: CoinbaseSummary,
    live_vault: VaultRoundTripReport,
    synthetic_100k_ingest: SyntheticIngestBench,
    synthetic_100k_vault: VaultRoundTripReport,
    resilience: ResilienceReport,
    dbn: DbnCheckReport,
    dukascopy_bi5: Option<Bi5CheckReport>,
    inference_live: InferenceSummary,
    inference_10k_benchmark: InferenceSummary,
}

fn current_rss_mb() -> f64 {
    let pid = std::process::id().to_string();
    let out = Command::new("ps")
        .args(["-o", "rss=", "-p", &pid])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            let kb: f64 = s.trim().parse().unwrap_or(0.0);
            kb / 1024.0
        }
        Err(_) => 0.0,
    }
}

fn percentiles_u64_to_us(samples: &mut [u64]) -> Percentiles {
    if samples.is_empty() {
        return Percentiles {
            p50: 0.0,
            p95: 0.0,
            p99: 0.0,
            max: 0.0,
        };
    }
    samples.sort_unstable();
    let n = samples.len();
    let at = |p: f64| -> f64 {
        let idx = ((n as f64 - 1.0) * p).round() as usize;
        samples[idx.min(n - 1)] as f64 / 1_000.0
    };
    Percentiles {
        p50: at(0.50),
        p95: at(0.95),
        p99: at(0.99),
        max: samples[n - 1] as f64 / 1_000.0,
    }
}

fn percentiles_f64(samples: &mut [f64]) -> Percentiles {
    if samples.is_empty() {
        return Percentiles {
            p50: 0.0,
            p95: 0.0,
            p99: 0.0,
            max: 0.0,
        };
    }
    samples.sort_by(|a, b| a.total_cmp(b));
    let n = samples.len();
    let at = |p: f64| -> f64 {
        let idx = ((n as f64 - 1.0) * p).round() as usize;
        samples[idx.min(n - 1)]
    };
    Percentiles {
        p50: at(0.50),
        p95: at(0.95),
        p99: at(0.99),
        max: samples[n - 1],
    }
}

fn pct(num: u64, den: u64) -> f64 {
    if den == 0 {
        0.0
    } else {
        (num as f64 / den as f64) * 100.0
    }
}

fn run_synthetic_100k_ingest_and_vault(
    out_dir: &PathBuf,
) -> Result<(SyntheticIngestBench, VaultRoundTripReport), Box<dyn std::error::Error + Send + Sync>>
{
    let n: u64 = 100_000;
    let mut book = L2OrderBook::new("SYN-BTC-USD", Some(25));
    let base_bid: i64 = 59_300_000_000_000;
    let tick_sz: i64 = 100_000_000; // $0.10
    book.apply_snapshot(
        (0..25).map(|i| {
            let p = base_bid - i * tick_sz;
            (p, 1_000_000_000, String::new(), String::new())
        }),
        (0..25).map(|i| {
            let p = base_bid + tick_sz + i * tick_sz;
            (p, 1_000_000_000, String::new(), String::new())
        }),
    );

    let mut ticks = Vec::with_capacity(n as usize);
    let mut lat_ns = Vec::with_capacity(n as usize);
    let base_ns = now_unix_ns();
    let t_start = Instant::now();

    for i in 0..n {
        let t0 = Instant::now();
        let shift = ((i / 100) % 20) as i64 - 10;
        let bid = base_bid + shift * tick_sz;
        let ask = bid + tick_sz;
        book.apply_bid_delta(bid, 2_000_000_000 + (i as i64 % 50) * 10_000, String::new(), String::new());
        book.apply_ask_delta(ask, 1_800_000_000 + (i as i64 % 50) * 10_000, String::new(), String::new());
        book.finish_delta();

        let is_buy = i % 2 == 0;
        let tick = NormalizedTick {
            ts_exchange_ns: base_ns + (i as i64) * 50_000,
            ts_recv_ns: base_ns + (i as i64) * 50_000 + 2_000,
            price_e9: if is_buy { ask } else { bid },
            qty_e9: 50_000_000 + ((i % 100) as i64) * 1_000_000,
            trade_id: 1_000_000 + i,
            seq: i + 1,
            best_bid_e9: bid,
            best_ask_e9: ask,
            symbol_id: SYM_SYNTHETIC_BTC_USD,
            venue: Venue::Synthetic,
            aggressor_side: if is_buy {
                AggressorSide::Buy
            } else {
                AggressorSide::Sell
            },
            aggressor_source: AggressorSource::ExchangeReported,
        };
        ticks.push(tick);
        lat_ns.push(t0.elapsed().as_nanos() as u64);
    }
    let elapsed_secs = t_start.elapsed().as_secs_f64();

    let prov = vec![ProvenanceHeader {
        venue: Venue::Synthetic,
        symbol: "SYN-BTC-USD".into(),
        symbol_id: SYM_SYNTHETIC_BTC_USD,
        coverage: VenueCoverage::FullVenue,
        timeliness: Timeliness::Synthetic,
        delay_seconds: 0,
        aggressor_source: AggressorSource::ExchangeReported,
        scale_decimals: 9,
        recorded_at_ns: base_ns,
    }];
    let vault_path = out_dir.join("bench_100k.atvault");
    let vault_rep = roundtrip_verify_and_benchmark(&vault_path, prov, &ticks, 3)?;

    let ingest_rep = SyntheticIngestBench {
        events_processed: n,
        elapsed_ms: elapsed_secs * 1000.0,
        events_per_sec: n as f64 / elapsed_secs,
        normalize_latency_us: percentiles_u64_to_us(&mut lat_ns),
    };

    Ok((ingest_rep, vault_rep))
}

fn build_10k_inference_benchmark_ticks() -> Vec<NormalizedTick> {
    // Deterministic 10,000-trade realistic crypto tight-spread tape with ~10%
    // midpoint/inside-spread/fast-tick noise to validate Lee-Ready & Tick Rule
    // accuracy against ground-truth exchange-reported sides.
    let mut state: u64 = 0x5EED_C0DE_505;
    let mut next_u64 = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };

    let mut bid: i64 = 59_300_000_000_000;
    let tick_sz: i64 = 100_000_000; // $0.10
    let mut out = Vec::with_capacity(10_000);
    let base_ns = now_unix_ns();

    for i in 0..10_000_u64 {
        let r = next_u64();
        let spread_ticks = if (r % 5) == 0 { 2 } else { 1 };
        let ask = bid + spread_ticks * tick_sz;
        let is_buy = (r >> 8) & 1 == 1;
        let regime = (r >> 16) % 100;

        // 82% trade at touch, 10% midpoint/inside-spread, 8% quote-lag stale BBO
        let price = if regime < 82 {
            if is_buy { ask } else { bid }
        } else if regime < 92 {
            (bid + ask) / 2
        } else {
            // Fast-tick race: quote shifted before trade arrived
            if is_buy { bid } else { ask }
        };

        out.push(NormalizedTick {
            ts_exchange_ns: base_ns + (i as i64) * 1_000_000,
            ts_recv_ns: base_ns + (i as i64) * 1_000_000 + 5_000,
            price_e9: price,
            qty_e9: 100_000_000,
            trade_id: i + 1,
            seq: i + 1,
            best_bid_e9: bid,
            best_ask_e9: ask,
            symbol_id: SYM_SYNTHETIC_BTC_USD,
            venue: Venue::Synthetic,
            aggressor_side: if is_buy {
                AggressorSide::Buy
            } else {
                AggressorSide::Sell
            },
            aggressor_source: AggressorSource::ExchangeReported,
        });

        // Random walk mid
        match (r >> 24) % 7 {
            0 => bid += tick_sz,
            1 => bid -= tick_sz,
            _ => {}
        }
    }
    out
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Install rustls ring crypto provider explicitly (rustls 0.23 requirement)
    let _ = rustls::crypto::ring::default_provider().install_default();

    let args: Vec<String> = std::env::args().collect();
    let soak_secs: u64 = args
        .windows(2)
        .find(|w| w[0] == "--soak-secs")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(45);

    let out_dir = PathBuf::from("/tmp/allegedly-s05-bench");
    std::fs::create_dir_all(&out_dir)?;

    let rss_start_mb = current_rss_mb();
    let mut rss_peak_mb = rss_start_mb;

    println!(
        "[S05] Starting dual-venue live soak for {soak_secs}s (Kraken WS v2 + Coinbase AdvTrade WS)..."
    );
    let soak_start_utc = chrono::Utc::now().to_rfc3339();
    let soak_dur = Duration::from_secs(soak_secs);

    let (tx, mut rx) = mpsc::channel::<NormalizedTick>(65_536);
    let tx_kraken = tx.clone();
    let tx_coinbase = tx;

    let collector = tokio::spawn(async move {
        let mut live_ticks = Vec::with_capacity(4096);
        while let Some(t) = rx.recv().await {
            live_ticks.push(t);
        }
        live_ticks
    });

    let kraken_handle = tokio::spawn(run_kraken_soak(soak_dur, 25, tx_kraken));
    let coinbase_handle = tokio::spawn(run_coinbase_soak(soak_dur, tx_coinbase));

    let (kraken_res, coinbase_res) = tokio::join!(kraken_handle, coinbase_handle);
    let mut kraken_stats: KrakenSoakStats = kraken_res??;
    let mut coinbase_stats: CoinbaseSoakStats = coinbase_res??;
    let live_ticks = collector.await?;
    let soak_end_utc = chrono::Utc::now().to_rfc3339();

    let rss_post_soak_mb = current_rss_mb();
    rss_peak_mb = rss_peak_mb.max(rss_post_soak_mb);
    println!(
        "[S05] Live soak finished: Kraken live ticks={}, Coinbase live ticks={}, total collected={}, RSS={:.2} MB",
        kraken_stats.trade_live_ticks,
        coinbase_stats.trade_live_ticks,
        live_ticks.len(),
        rss_post_soak_mb
    );

    // 2. Persist live captured ticks to local Tick-Vault & verify exact round-trip
    let recorded_at = now_unix_ns();
    let live_prov = vec![
        ProvenanceHeader {
            venue: Venue::KrakenSpot,
            symbol: "BTC/USD".into(),
            symbol_id: SYM_KRAKEN_BTC_USD,
            coverage: VenueCoverage::FullVenue,
            timeliness: Timeliness::RealTime,
            delay_seconds: 0,
            aggressor_source: AggressorSource::ExchangeReported,
            scale_decimals: 9,
            recorded_at_ns: recorded_at,
        },
        ProvenanceHeader {
            venue: Venue::KrakenSpot,
            symbol: "ETH/USD".into(),
            symbol_id: SYM_KRAKEN_ETH_USD,
            coverage: VenueCoverage::FullVenue,
            timeliness: Timeliness::RealTime,
            delay_seconds: 0,
            aggressor_source: AggressorSource::ExchangeReported,
            scale_decimals: 9,
            recorded_at_ns: recorded_at,
        },
        ProvenanceHeader {
            venue: Venue::CoinbaseAdvTrade,
            symbol: "BTC-USD".into(),
            symbol_id: SYM_COINBASE_BTC_USD,
            coverage: VenueCoverage::FullVenue,
            timeliness: Timeliness::RealTime,
            delay_seconds: 0,
            aggressor_source: AggressorSource::ExchangeReportedInverted,
            scale_decimals: 9,
            recorded_at_ns: recorded_at,
        },
        ProvenanceHeader {
            venue: Venue::CoinbaseAdvTrade,
            symbol: "ETH-USD".into(),
            symbol_id: SYM_COINBASE_ETH_USD,
            coverage: VenueCoverage::FullVenue,
            timeliness: Timeliness::RealTime,
            delay_seconds: 0,
            aggressor_source: AggressorSource::ExchangeReportedInverted,
            scale_decimals: 9,
            recorded_at_ns: recorded_at,
        },
    ];
    let live_vault_path = out_dir.join("live_soak.atvault");
    let live_vault = roundtrip_verify_and_benchmark(&live_vault_path, live_prov, &live_ticks, 3)?;
    println!(
        "[S05] Live Tick-Vault verified: {} ticks, {:.1} B/tick compressed, lost={}, mismatches={}, crc_ok={}",
        live_vault.tick_count,
        live_vault.bytes_per_tick_compressed,
        live_vault.lost_ticks,
        live_vault.field_mismatches,
        live_vault.crc_verified
    );

    // 3. Synthetic 100k sustained ingest + L2 book + vault benchmark
    let (synthetic_100k_ingest, synthetic_100k_vault) =
        run_synthetic_100k_ingest_and_vault(&out_dir)?;
    rss_peak_mb = rss_peak_mb.max(current_rss_mb());
    println!(
        "[S05] Synthetic 100k ingest: {:.0} events/s (p99={:.2} us); vault write={:.0} ticks/s, read={:.0} ticks/s, {:.2} B/tick",
        synthetic_100k_ingest.events_per_sec,
        synthetic_100k_ingest.normalize_latency_us.p99,
        synthetic_100k_vault.write_ticks_per_sec,
        synthetic_100k_vault.read_ticks_per_sec,
        synthetic_100k_vault.bytes_per_tick_compressed,
    );

    // 4. Reconnect, Sequence-Gap Detection & Backpressure Harness
    let resilience = run_resilience_harness().await?;
    println!(
        "[S05] Resilience harness: gap_detected={}, gap_resync={:.2}ms, drop_detected={}, drop_resync={:.2}ms, backoffs={:?}ms, bp_dropped={}/{}, silent_corruptions={}",
        resilience.gap_detected,
        resilience.gap_resync_ms,
        resilience.tcp_drop_detected,
        resilience.drop_resync_ms,
        resilience.backoff_delays_ms,
        resilience.backpressure_dropped,
        resilience.backpressure_total_sent,
        resilience.silent_corruptions,
    );

    // 5. Databento DBN (Apache-2.0) synthetic TradeMsg + Mbp10Msg round-trip & throughput
    let dbn = run_dbn_verification(&out_dir, 200_000, 50_000)?;
    rss_peak_mb = rss_peak_mb.max(current_rss_mb());
    println!(
        "[S05] Databento DBN: {} trades ({:.0} rec/s, mismatches={}), {} mbp10 ({:.0} rec/s, mismatches={})",
        dbn.trade_records_roundtripped,
        dbn.trade_decode_records_per_sec,
        dbn.trade_field_mismatches,
        dbn.mbp10_records_roundtripped,
        dbn.mbp10_decode_records_per_sec,
        dbn.mbp10_field_mismatches,
    );

    // 6. Dukascopy .bi5 check if cached at /tmp/allegedly-s05-bench/EURUSD_2026_09_15_12h.bi5
    let bi5_path = out_dir.join("EURUSD_2026_09_15_12h.bi5");
    let dukascopy_bi5 = if bi5_path.exists() {
        let bytes = std::fs::read(&bi5_path)?;
        let (_quotes, rep) = decode_dukascopy_bi5_bytes(
            &bytes,
            1_789_473_600_000_000_000,
            100_000,
            "https://datafeed.dukascopy.com/datafeed/EURUSD/2026/09/15/12h_ticks.bi5",
        )?;
        println!(
            "[S05] Dukascopy .bi5: {} ticks decoded ({:.0} rec/s parse, {:.0} rec/s total LZMA+parse, otc_prov={})",
            rep.ticks_decoded,
            rep.parse_records_per_sec,
            rep.total_records_per_sec,
            rep.provenance_otc_verified,
        );
        Some(rep)
    } else {
        None
    };

    // 7. Tick-Side Inference Evaluation (Live captured + 10k benchmark)
    let inf_live_raw = evaluate_inference_against_ground_truth(&live_ticks);
    let inference_live = InferenceSummary {
        label: "Live Kraken+Coinbase Captured Ticks".into(),
        evaluated: inf_live_raw.total_evaluated,
        lee_ready_classified: inf_live_raw.lee_ready_classified,
        lee_ready_correct: inf_live_raw.lee_ready_correct,
        lee_ready_accuracy_pct: inf_live_raw.lee_ready_accuracy_pct(),
        tick_rule_classified: inf_live_raw.tick_rule_classified,
        tick_rule_correct: inf_live_raw.tick_rule_correct,
        tick_rule_accuracy_pct: inf_live_raw.tick_rule_accuracy_pct(),
        provenance_tags_verified: inf_live_raw.provenance_tags_verified,
    };

    let bench_10k_ticks = build_10k_inference_benchmark_ticks();
    let inf_10k_raw = evaluate_inference_against_ground_truth(&bench_10k_ticks);
    let inference_10k_benchmark = InferenceSummary {
        label: "10,000-Trade Tight-Spread Benchmark".into(),
        evaluated: inf_10k_raw.total_evaluated,
        lee_ready_classified: inf_10k_raw.lee_ready_classified,
        lee_ready_correct: inf_10k_raw.lee_ready_correct,
        lee_ready_accuracy_pct: inf_10k_raw.lee_ready_accuracy_pct(),
        tick_rule_classified: inf_10k_raw.tick_rule_classified,
        tick_rule_correct: inf_10k_raw.tick_rule_correct,
        tick_rule_accuracy_pct: inf_10k_raw.tick_rule_accuracy_pct(),
        provenance_tags_verified: inf_10k_raw.provenance_tags_verified,
    };
    println!(
        "[S05] Inference Live (n={}): LR={:.2}%, TR={:.2}% | 10k Bench: LR={:.2}%, TR={:.2}%",
        inference_live.evaluated,
        inference_live.lee_ready_accuracy_pct,
        inference_live.tick_rule_accuracy_pct,
        inference_10k_benchmark.lee_ready_accuracy_pct,
        inference_10k_benchmark.tick_rule_accuracy_pct,
    );

    let report = FullSpikeReport {
        soak_start_utc,
        soak_end_utc,
        soak_duration_secs: soak_secs,
        rss_start_mb,
        rss_post_soak_mb,
        rss_peak_mb,
        kraken: KrakenSummary {
            ws_messages_total: kraken_stats.ws_messages_total,
            trade_snapshot_ticks: kraken_stats.trade_snapshot_ticks,
            trade_live_ticks: kraken_stats.trade_live_ticks,
            book_snapshots: kraken_stats.book_snapshots,
            book_updates: kraken_stats.book_updates,
            heartbeats: kraken_stats.heartbeats,
            crc_passed: kraken_stats.crc_passed,
            crc_failed: kraken_stats.crc_failed,
            resyncs_triggered: kraken_stats.resyncs_triggered,
            parse_errors: kraken_stats.parse_errors,
            channel_drops: kraken_stats.channel_drops,
            bbo_checked: kraken_stats.bbo_checked,
            bbo_strict_aligned: kraken_stats.bbo_strict_aligned,
            bbo_strict_match_pct: pct(kraken_stats.bbo_strict_aligned, kraken_stats.bbo_checked),
            bbo_midpoint_aligned: kraken_stats.bbo_midpoint_aligned,
            bbo_midpoint_match_pct: pct(
                kraken_stats.bbo_midpoint_aligned,
                kraken_stats.bbo_checked,
            ),
            parse_latency_us: percentiles_u64_to_us(&mut kraken_stats.parse_latencies_ns),
            exchange_to_recv_ms: percentiles_f64(&mut kraken_stats.exchange_to_recv_latencies_ms),
        },
        coinbase: CoinbaseSummary {
            ws_messages_total: coinbase_stats.ws_messages_total,
            trade_snapshot_ticks: coinbase_stats.trade_snapshot_ticks,
            trade_live_ticks: coinbase_stats.trade_live_ticks,
            l2_snapshots: coinbase_stats.l2_snapshots,
            l2_update_msgs: coinbase_stats.l2_update_msgs,
            l2_level_deltas: coinbase_stats.l2_level_deltas,
            heartbeats: coinbase_stats.heartbeats,
            seq_checked: coinbase_stats.seq_checked,
            seq_gaps: coinbase_stats.seq_gaps,
            resyncs_triggered: coinbase_stats.resyncs_triggered,
            parse_errors: coinbase_stats.parse_errors,
            channel_drops: coinbase_stats.channel_drops,
            bbo_checked: coinbase_stats.bbo_checked,
            inverted_strict_aligned: coinbase_stats.inverted_strict_aligned,
            inverted_strict_match_pct: pct(
                coinbase_stats.inverted_strict_aligned,
                coinbase_stats.bbo_checked,
            ),
            inverted_midpoint_aligned: coinbase_stats.inverted_midpoint_aligned,
            inverted_midpoint_match_pct: pct(
                coinbase_stats.inverted_midpoint_aligned,
                coinbase_stats.bbo_checked,
            ),
            uninverted_strict_aligned: coinbase_stats.uninverted_strict_aligned,
            uninverted_strict_match_pct: pct(
                coinbase_stats.uninverted_strict_aligned,
                coinbase_stats.bbo_checked,
            ),
            uninverted_midpoint_aligned: coinbase_stats.uninverted_midpoint_aligned,
            uninverted_midpoint_match_pct: pct(
                coinbase_stats.uninverted_midpoint_aligned,
                coinbase_stats.bbo_checked,
            ),
            parse_latency_us: percentiles_u64_to_us(&mut coinbase_stats.parse_latencies_ns),
            exchange_to_recv_ms: percentiles_f64(&mut coinbase_stats.exchange_to_recv_latencies_ms),
        },
        live_vault,
        synthetic_100k_ingest,
        synthetic_100k_vault,
        resilience,
        dbn,
        dukascopy_bi5,
        inference_live,
        inference_10k_benchmark,
    };

    let json_path = out_dir.join("s05_results.json");
    std::fs::write(&json_path, serde_json::to_string_pretty(&report)?)?;
    println!("[S05] Full JSON report written to {}", json_path.display());

    Ok(())
}
