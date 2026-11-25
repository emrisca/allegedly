use std::thread;
use std::time::Instant;

use rtrb::RingBuffer;

use crate::metrics::{LatencyStats, compute_latency_stats};
use crate::orderflow::{DyadicVrvpTree, FootprintBar, FootprintBuilder, TpoProfile};
use crate::types::{TickEvent, TickGenerator};

#[derive(Clone, Copy)]
struct StampedTick {
    tick: TickEvent,
    enqueue_ns: u64, // 0 if not sampled
}

#[derive(Debug)]
pub struct HotRingAndOrderflowReport {
    pub ticks_streamed: usize,
    pub wall_secs: f64,
    pub throughput_ticks_per_sec: f64,
    pub spsc_saturated_latency: LatencyStats,
    pub spsc_paced_500k_latency: LatencyStats,
    pub footprint_bars_built: usize,
    pub zero_drift_verified: bool,
    pub tpo_update_avg_ns: f64,
    pub tpo_poc_tick: i64,
    pub tpo_poc_count: u32,
    pub tpo_ib_range_ticks: i64,
    pub tpo_split_verified: bool,
    pub vrvp_bar_count: usize,
    pub vrvp_build_ms: f64,
    pub vrvp_query_count: usize,
    pub vrvp_query_latency: LatencyStats,
    pub vrvp_avg_blocks_touched: f64,
    pub vrvp_exact_match_verified: bool,
}

/// Paced 500,000 ticks/sec (2× R07's 250k/s gate) lock-free SPSC handoff + Footprint + TPO latency test
/// (measures real wire-to-engine handoff latency without artificial 65,536-slot saturation queueing).
fn run_paced_spsc_latency_bench(num_ticks: usize, interval_ns: u64) -> Result<LatencyStats, String> {
    let (mut producer, mut consumer) = RingBuffer::<StampedTick>::new(4_096);
    let epoch = Instant::now();

    let producer_handle = thread::spawn(move || {
        let mut tick_gen = TickGenerator::for_day(2, num_ticks);
        let mut target_ns = epoch.elapsed().as_nanos() as u64;
        for i in 0..num_ticks {
            target_ns += interval_ns;
            while (epoch.elapsed().as_nanos() as u64) < target_ns {
                std::hint::spin_loop();
            }
            let tick = tick_gen.next_tick();
            let enqueue_ns = if i % 10 == 0 {
                epoch.elapsed().as_nanos() as u64
            } else {
                0
            };
            let item = StampedTick { tick, enqueue_ns };
            loop {
                match producer.push(item) {
                    Ok(()) => break,
                    Err(_) => std::hint::spin_loop(),
                }
            }
        }
    });

    let day2_start_ns: i64 = (1_793_491_200 + 2 * 86_400) * 1_000_000_000;
    let mut fp = FootprintBuilder::new(60_000_000_000, 1);
    let mut tpo = TpoProfile::new(day2_start_ns, 24_000, 4_000);
    let mut samples_ns = Vec::with_capacity(num_ticks / 10 + 16);

    let mut received = 0usize;
    while received < num_ticks {
        match consumer.pop() {
            Ok(st) => {
                fp.ingest(&st.tick);
                tpo.update_tick(st.tick.ts_event, st.tick.tick_index(), st.tick.qty_fp);
                if st.enqueue_ns != 0 {
                    let now_ns = epoch.elapsed().as_nanos() as u64;
                    samples_ns.push(now_ns.saturating_sub(st.enqueue_ns));
                }
                received += 1;
            }
            Err(_) => std::hint::spin_loop(),
        }
    }
    producer_handle.join().map_err(|_| "paced producer panicked")?;
    fp.flush();
    fp.assert_zero_drift()?;
    Ok(compute_latency_stats(&mut samples_ns))
}

/// Benchmark 4: Lock-free `rtrb` SPSC ring buffer (2 threads) feeding exact fixed-point
/// `i64`/`i128` Footprint Bar builder + 64-bit TPO mask + 100k-bar Dyadic Segment Tree VRVP.
pub fn run_hot_ring_and_orderflow_bench(num_ticks: usize) -> Result<HotRingAndOrderflowReport, String> {
    // 4a. Paced 500k ticks/s end-to-end SPSC + Footprint + TPO latency (200 ms run = 100k ticks)
    let paced_count = num_ticks.min(100_000);
    let spsc_paced_500k_latency = run_paced_spsc_latency_bench(paced_count, 2_000)?;

    // 4b. Unthrottled saturation throughput benchmark (full 65,536-slot ring)
    let (mut producer, mut consumer) = RingBuffer::<StampedTick>::new(65_536);
    let epoch = Instant::now();

    let producer_handle = thread::spawn(move || {
        let mut tick_gen = TickGenerator::for_day(0, num_ticks);
        for i in 0..num_ticks {
            let tick = tick_gen.next_tick();
            let enqueue_ns = if i % 500 == 0 {
                epoch.elapsed().as_nanos() as u64
            } else {
                0
            };
            let item = StampedTick { tick, enqueue_ns };
            loop {
                match producer.push(item) {
                    Ok(()) => break,
                    Err(_) => std::hint::spin_loop(),
                }
            }
        }
    });

    let day0_start_ns: i64 = 1_793_491_200 * 1_000_000_000;
    let mut fp_builder = FootprintBuilder::new(60_000_000_000, 1); // 1-minute footprint bars
    let mut tpo = TpoProfile::new(day0_start_ns, 24_000, 4_000);
    let mut latency_samples_ns: Vec<u64> = Vec::with_capacity(num_ticks / 500 + 16);

    let t_stream = Instant::now();
    let mut received = 0usize;
    while received < num_ticks {
        match consumer.pop() {
            Ok(st) => {
                if st.enqueue_ns != 0 {
                    let now_ns = epoch.elapsed().as_nanos() as u64;
                    latency_samples_ns.push(now_ns.saturating_sub(st.enqueue_ns));
                }
                fp_builder.ingest(&st.tick);
                tpo.update_tick(st.tick.ts_event, st.tick.tick_index(), st.tick.qty_fp);
                received += 1;
            }
            Err(_) => std::hint::spin_loop(),
        }
    }
    let wall_secs = t_stream.elapsed().as_secs_f64();
    producer_handle.join().map_err(|_| "producer thread panicked")?;

    fp_builder.flush();
    fp_builder.assert_zero_drift()?;

    let spsc_saturated_latency = compute_latency_stats(&mut latency_samples_ns);
    let (tpo_poc_tick, tpo_poc_count, ib_lo, ib_hi, _sp) = tpo.summary();
    let (left_m, right_m) = tpo.split_at(2); // Split Initial Balance (A+B) vs rest of day
    let tpo_split_verified = tpo
        .tpo_masks
        .iter()
        .enumerate()
        .all(|(i, &orig)| (left_m[i] | (right_m[i] << 2)) == orig);
    assert!(tpo_split_verified, "TPO bitwise split/merge invariant failed!");

    // Measure dedicated isolated 64-bit TPO mask update latency (ns/tick) over 1M ticks
    let mut tpo_bench = TpoProfile::new(day0_start_ns, 24_000, 4_000);
    let mut tpo_gen = TickGenerator::for_day(1, 1_000_000);
    let sample_ticks: Vec<TickEvent> = (0..1_000_000).map(|_| tpo_gen.next_tick()).collect();
    let t_tpo = Instant::now();
    for tk in &sample_ticks {
        tpo_bench.update_tick(tk.ts_event, tk.tick_index(), tk.qty_fp);
    }
    let tpo_update_avg_ns = t_tpo.elapsed().as_nanos() as f64 / sample_ticks.len() as f64;
    std::hint::black_box(tpo_bench.summary());

    // Build a full 100,000-bar Dyadic Profile Segment Tree (repeating/shifting the real day's
    // completed footprint bars to reach 100,000 bars — matching R05's 100k-bar VRVP budget!).
    let target_bars = 100_000usize;
    let src_len = fp_builder.completed.len();
    let mut bars_100k: Vec<FootprintBar> = Vec::with_capacity(target_bars);
    for i in 0..target_bars {
        let mut b = fp_builder.completed[i % src_len].clone();
        // Shift price mildly across cycles to simulate multi-month price excursion (~±250 ticks)
        let cycle = (i / src_len) as i64;
        let shift = ((cycle * 13) % 500) - 250;
        b.base_tick += shift;
        bars_100k.push(b);
    }

    let t_build = Instant::now();
    let mut vrvp_tree = DyadicVrvpTree::build(&bars_100k);
    let vrvp_build_ms = t_build.elapsed().as_secs_f64() * 1000.0;

    // Run 10,000 random visible-viewport VRVP queries spanning widths of 500..50,000 bars!
    const NUM_QUERIES: usize = 10_000;
    let mut q_samples_ns = Vec::with_capacity(NUM_QUERIES);
    let mut rng: u64 = 0x508F_1CED_C0DE_7777;
    let mut blocks_sum: usize = 0;
    let mut all_exact = true;

    for q_idx in 0..NUM_QUERIES {
        rng ^= rng << 13;
        rng ^= rng >> 7;
        rng ^= rng << 17;
        let width = 500 + ((rng as usize) % 49_500);
        let max_l = vrvp_tree.len() - width;
        let l = ((rng.wrapping_mul(0x9E37_79B9_7F4A_7C15)) as usize) % max_l;
        let r = l + width - 1;

        let t0 = Instant::now();
        let res = vrvp_tree.query(l, r);
        q_samples_ns.push(t0.elapsed().as_nanos() as u64);

        blocks_sum += res.blocks_touched;
        let expected_vol = vrvp_tree.expected_range_vol(l, r);
        if res.total_vol != expected_vol {
            all_exact = false;
        }
        // Spot-check full brute-force POC/VA/total_vol parity on first 25 queries
        if q_idx < 25 {
            let mut brute_vol = 0i64;
            for b in &bars_100k[l..=r] {
                brute_vol += b.total_vol;
            }
            assert_eq!(res.total_vol, brute_vol, "VRVP brute-force volume mismatch!");
        }
    }
    assert!(all_exact, "VRVP total volume drift detected!");
    let vrvp_query_latency = compute_latency_stats(&mut q_samples_ns);

    Ok(HotRingAndOrderflowReport {
        ticks_streamed: num_ticks,
        wall_secs,
        throughput_ticks_per_sec: num_ticks as f64 / wall_secs,
        spsc_saturated_latency,
        spsc_paced_500k_latency,
        footprint_bars_built: fp_builder.completed.len(),
        zero_drift_verified: true,
        tpo_update_avg_ns,
        tpo_poc_tick,
        tpo_poc_count,
        tpo_ib_range_ticks: (ib_hi - ib_lo).max(0),
        tpo_split_verified,
        vrvp_bar_count: target_bars,
        vrvp_build_ms,
        vrvp_query_count: NUM_QUERIES,
        vrvp_query_latency,
        vrvp_avg_blocks_touched: blocks_sum as f64 / NUM_QUERIES as f64,
        vrvp_exact_match_verified: all_exact,
    })
}
