mod hot_ring;
mod metrics;
mod orderflow;
mod types;
mod vault;

use std::path::PathBuf;

use metrics::rss_stats_mb;

fn main() {
    let vault_root = std::env::var("S08_BENCH_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/allegedly-s08-bench/vault"));

    // Safety guard: NEVER allow benchmark data inside the Obsidian vault
    let vault_str = vault_root.to_string_lossy();
    assert!(
        !vault_str.contains("/Documents/Obsidian/"),
        "REFUSING to write multi-GB benchmark data inside Obsidian vault: {vault_str}"
    );

    println!("=== Allegedly Spike S08: 100M-Tick Storage, Replay & Fixed-Point Order-Flow ===");
    println!("Temp Vault Path: {}", vault_root.display());
    println!(
        "Tick Record    : {} B packed / {} B C-aligned | {} days × {} ticks/day = {} ticks",
        types::PACKED_TICK_BYTES,
        types::ALIGNED_TICK_BYTES,
        vault::NUM_DAYS,
        vault::TICKS_PER_DAY,
        vault::TOTAL_TICKS
    );
    let (r0, p0) = rss_stats_mb();
    println!("Start RSS      : {:.2} MiB (peak {:.2} MiB)\n", r0, p0);

    // -------------------------------------------------------------------------
    // Benchmark 1: 100M-Tick Write Throughput & Zstd Compression Ratio
    // -------------------------------------------------------------------------
    println!("--- [1/4] Generating 100,000,000 Fixed-Point Ticks -> Hive Parquet (Zstd-3) + SQLite WAL ---");
    let write_rep = vault::generate_100m_vault(&vault_root).expect("vault generation failed");
    println!(
        "  Ticks Written       : {}",
        write_rep.total_ticks
    );
    println!(
        "  Wall Time           : {:.3} s",
        write_rep.wall_secs
    );
    println!(
        "  Write Throughput    : {:.0} ticks/sec ({:.1} MB/s raw packed)",
        write_rep.ticks_per_sec,
        (write_rep.ticks_per_sec * 26.0) / (1024.0 * 1024.0)
    );
    println!(
        "  Parquet Disk Size   : {:.2} MiB ({} bytes) | {:.2} bytes/tick",
        write_rep.total_parquet_bytes as f64 / (1024.0 * 1024.0),
        write_rep.total_parquet_bytes,
        write_rep.bytes_per_tick
    );
    println!(
        "  SQLite WAL Catalog  : {:.2} KiB ({} bytes)",
        write_rep.sqlite_bytes as f64 / 1024.0,
        write_rep.sqlite_bytes
    );
    println!(
        "  Compression Ratio   : {:.2}x vs 26 B packed ({:.2} GiB) | {:.2}x vs 32 B aligned ({:.2} GiB)",
        write_rep.ratio_vs_packed_26b,
        (write_rep.total_ticks as f64 * 26.0) / (1024.0 * 1024.0 * 1024.0),
        write_rep.ratio_vs_aligned_32b,
        (write_rep.total_ticks as f64 * 32.0) / (1024.0 * 1024.0 * 1024.0)
    );
    println!(
        "  Manifest SHA-256    : {}",
        write_rep.vault_manifest_sha256
    );
    println!(
        "  Exact Accounting    : total_vol={} | total_delta={} | peak_rss={:.2} MiB\n",
        write_rep.total_vol, write_rep.total_delta, write_rep.peak_rss_mb
    );

    // -------------------------------------------------------------------------
    // Benchmark 2: Full 100M-Tick Streaming Sequential Replay
    // -------------------------------------------------------------------------
    println!("--- [2/4] Full 100,000,000-Tick Streaming Sequential Replay ---");
    let replay_rep = vault::replay_100m_streaming(&vault_root).expect("100M replay failed");
    assert_eq!(replay_rep.total_ticks, write_rep.total_ticks);
    assert_eq!(replay_rep.total_vol, write_rep.total_vol, "Replay total volume mismatch!");
    assert_eq!(replay_rep.total_delta, write_rep.total_delta, "Replay total delta mismatch!");
    println!("  Ticks Replayed      : {} (exact match)", replay_rep.total_ticks);
    println!("  Wall Time           : {:.3} s", replay_rep.wall_secs);
    println!(
        "  Replay Throughput   : {:.0} ticks/sec ({:.1} MB/s raw packed)",
        replay_rep.ticks_per_sec,
        (replay_rep.ticks_per_sec * 26.0) / (1024.0 * 1024.0)
    );
    println!(
        "  Minute Bars Seen    : {} | Digest: {} | RSS during replay={:.2} MiB (process peak={:.2} MiB)\n",
        replay_rep.minute_bars_seen,
        replay_rep.stream_digest_hex,
        replay_rep.current_rss_mb,
        replay_rep.peak_rss_mb
    );

    // R07 Determinism Bit-Identity Gate (Day 1 = 5M ticks replayed twice -> SHA-256 identical)
    let (det_ok, det_sha, det_bars) =
        vault::verify_deterministic_replay_sha256(&vault_root).expect("determinism check failed");
    assert!(det_ok, "Deterministic replay SHA-256 mismatch!");
    println!(
        "  [PASS] R07 Deterministic Replay Bit-Identity (5M ticks -> {} Footprint bars): SHA-256={}\n",
        det_bars, det_sha
    );

    // -------------------------------------------------------------------------
    // Benchmark 3: Random 1-Hour Time-Range Seek (Cold F_NOCACHE + Warm)
    // -------------------------------------------------------------------------
    println!("--- [3/4] Random 1-Hour Time-Range Seek (50 random 1h slices across 100M ticks) ---");
    let seek_rep = vault::benchmark_random_seeks(&vault_root, &write_rep.day_bounds, 50)
        .expect("random seek benchmark failed");
    println!(
        "  Avg Slice Matched   : {:.0} ticks -> {:.1} 1m Footprint bars (zero-drift asserted per seek)",
        seek_rep.avg_ticks_per_1h, seek_rep.avg_bars_per_1h
    );
    println!(
        "  Row-Group Pruning   : {:.2}% skipped across 100M-tick vault (avg {:.2} RGs read per seek vs 500 total)",
        seek_rep.pruning_pct,
        seek_rep.row_groups_read as f64 / seek_rep.num_seeks as f64
    );
    println!(
        "  Cold Seek (F_NOCACHE={}): p50={:.2} ms | p95={:.2} ms | p99={:.2} ms | max={:.2} ms",
        seek_rep.cold_nocache_enabled,
        seek_rep.cold_ms.p50_us / 1000.0,
        seek_rep.cold_ms.p95_us / 1000.0,
        seek_rep.cold_ms.p99_us / 1000.0,
        seek_rep.cold_ms.max_us / 1000.0
    );
    println!(
        "  Warm Seek (OS cache)   : p50={:.2} ms | p95={:.2} ms | p99={:.2} ms | max={:.2} ms\n",
        seek_rep.warm_ms.p50_us / 1000.0,
        seek_rep.warm_ms.p95_us / 1000.0,
        seek_rep.warm_ms.p99_us / 1000.0,
        seek_rep.warm_ms.max_us / 1000.0
    );

    // -------------------------------------------------------------------------
    // Benchmark 4: Hot SPSC Ring (`rtrb`) + Fixed-Point Order-Flow Engine (R05)
    // -------------------------------------------------------------------------
    println!("--- [4/4] Hot SPSC Ring (`rtrb`) + Fixed-Point Footprint + 100k-Bar Dyadic VRVP + 64-bit TPO ---");
    let hot_rep =
        hot_ring::run_hot_ring_and_orderflow_bench(5_000_000).expect("hot ring benchmark failed");
    println!(
        "  rtrb SPSC Stream    : {} ticks in {:.3} s -> {:.0} ticks/sec",
        hot_rep.ticks_streamed, hot_rep.wall_secs, hot_rep.throughput_ticks_per_sec
    );
    println!(
        "  SPSC Paced (500k/s) : p50={:.2} µs | p95={:.2} µs | p99={:.2} µs | max={:.2} µs (Gate: <= 500 µs)",
        hot_rep.spsc_paced_500k_latency.p50_us,
        hot_rep.spsc_paced_500k_latency.p95_us,
        hot_rep.spsc_paced_500k_latency.p99_us,
        hot_rep.spsc_paced_500k_latency.max_us
    );
    println!(
        "  SPSC Saturated (64k): p50={:.2} µs | p95={:.2} µs | p99={:.2} µs | max={:.2} µs (full-ring queueing delay)",
        hot_rep.spsc_saturated_latency.p50_us,
        hot_rep.spsc_saturated_latency.p95_us,
        hot_rep.spsc_saturated_latency.p99_us,
        hot_rep.spsc_saturated_latency.max_us
    );
    println!(
        "  Footprint Builder   : {} 1m bars built | Zero Floating-Point Drift = {}",
        hot_rep.footprint_bars_built, hot_rep.zero_drift_verified
    );
    println!(
        "  64-bit TPO Bitmask  : avg={:.2} ns/tick | POC tick={} ({} TPOs) | IB range={} ticks | Bitwise Split={}",
        hot_rep.tpo_update_avg_ns,
        hot_rep.tpo_poc_tick,
        hot_rep.tpo_poc_count,
        hot_rep.tpo_ib_range_ticks,
        hot_rep.tpo_split_verified
    );
    println!(
        "  Dyadic VRVP Tree    : {} bars built in {:.2} ms | {} random viewports (500..50k bars)",
        hot_rep.vrvp_bar_count, hot_rep.vrvp_build_ms, hot_rep.vrvp_query_count
    );
    println!(
        "  VRVP Query Latency  : p50={:.3} µs ({:.4} ms) | p95={:.3} µs ({:.4} ms) | p99={:.3} µs ({:.4} ms) | max={:.3} µs | avg blocks={:.1} | exact={}",
        hot_rep.vrvp_query_latency.p50_us,
        hot_rep.vrvp_query_latency.p50_us / 1000.0,
        hot_rep.vrvp_query_latency.p95_us,
        hot_rep.vrvp_query_latency.p95_us / 1000.0,
        hot_rep.vrvp_query_latency.p99_us,
        hot_rep.vrvp_query_latency.p99_us / 1000.0,
        hot_rep.vrvp_query_latency.max_us,
        hot_rep.vrvp_avg_blocks_touched,
        hot_rep.vrvp_exact_match_verified
    );

    // R07 L2 Queue-Position Fill Realism Sanity Check
    let l2_queue_ok = orderflow::verify_l2_queue_fill_sanity();
    assert!(l2_queue_ok, "L2 conservative queue-position sanity check failed!");
    println!("  [PASS] R07 L2 Conservative Queue-Position Fill Sanity Check (100-lot bid queue vs 10-lot touch -> no premature fill)");

    let (r_end, p_end) = rss_stats_mb();
    println!(
        "\nFinal Process RSS   : {:.2} MiB (Peak RSS: {:.2} MiB)",
        r_end, p_end
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use orderflow::{DyadicVrvpTree, FootprintBar, FootprintBuilder, FootprintCell, TpoProfile};
    use types::{TickEvent, TickGenerator};

    #[test]
    fn canonical_struct_layouts_are_32_bytes() {
        assert_eq!(std::mem::size_of::<TickEvent>(), 32);
        assert_eq!(std::mem::size_of::<FootprintCell>(), 32);
    }

    #[test]
    fn footprint_zero_drift_and_dyadic_vrvp_exact_parity() {
        let mut tick_gen = TickGenerator::for_day(0, 100_000);
        let mut fp = FootprintBuilder::new(60_000_000_000, 1);
        for _ in 0..100_000 {
            let tk = tick_gen.next_tick();
            fp.ingest(&tk);
        }
        fp.flush();
        fp.assert_zero_drift().expect("zero drift failed");
        assert!(!fp.completed.is_empty());

        let mut bars: Vec<FootprintBar> = Vec::with_capacity(2048);
        for i in 0..2048 {
            bars.push(fp.completed[i % fp.completed.len()].clone());
        }
        let mut tree = DyadicVrvpTree::build(&bars);
        for (l, r) in [(0, 100), (17, 513), (3, 2047), (500, 1777)] {
            let res = tree.query(l, r);
            let brute_vol: i64 = bars[l..=r].iter().map(|b| b.total_vol).sum();
            assert_eq!(res.total_vol, brute_vol);
            assert!(res.val_tick <= res.poc_tick && res.poc_tick <= res.vah_tick);
        }
    }

    #[test]
    fn tpo_bitmask_split_and_l2_queue_fill_sanity() {
        let day0_ns = 1_793_491_200 * 1_000_000_000;
        let mut tpo = TpoProfile::new(day0_ns, 24_000, 500);
        let mut tick_gen = TickGenerator::for_day(0, 50_000);
        for _ in 0..50_000 {
            let tk = tick_gen.next_tick();
            tpo.update_tick(tk.ts_event, tk.tick_index(), tk.qty_fp);
        }
        let (_, poc_cnt, ib_lo, ib_hi, _) = tpo.summary();
        assert!(poc_cnt > 0);
        assert!(ib_hi >= ib_lo);
        let (left, right) = tpo.split_at(2);
        for (i, &orig) in tpo.tpo_masks.iter().enumerate() {
            assert_eq!(left[i] | (right[i] << 2), orig);
        }
        assert!(orderflow::verify_l2_queue_fill_sanity());
    }

    #[test]
    fn hot_ring_spsc_mini_pipeline() {
        let rep = hot_ring::run_hot_ring_and_orderflow_bench(100_000).unwrap();
        assert_eq!(rep.ticks_streamed, 100_000);
        assert!(rep.zero_drift_verified);
        assert!(rep.tpo_split_verified);
        assert!(rep.vrvp_exact_match_verified);
        assert!(rep.spsc_paced_500k_latency.p99_us < 500.0, "Paced SPSC p99 exceeded 500 µs!");
        assert!(rep.vrvp_query_latency.p99_us < 250.0, "VRVP p99 exceeded 0.25 ms!");
    }
}
