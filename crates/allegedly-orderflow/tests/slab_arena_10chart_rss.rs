use allegedly_core::{
    AggressorSide, Bps, InstrumentId, NormalizedTick, PriceE9, ProvenanceModifiers, ProvenanceTier,
    QtyE9, TimestampNs,
};
use allegedly_orderflow::FootprintSlabArena;

#[cfg(unix)]
fn current_process_rss_bytes() -> Option<usize> {
    let pid = std::process::id().to_string();
    let out = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &pid])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let kb: usize = String::from_utf8_lossy(&out.stdout).trim().parse().ok()?;
    Some(kb * 1024)
}

#[cfg(not(unix))]
fn current_process_rss_bytes() -> Option<usize> {
    None
}

/// UV-04 / SV-13 Tier A (Arena OS RSS Bench — partial until 10 mounted desktop charts are profiled):
/// Measures live FootprintSlabArena heap capacity AND OS process RSS delta (without artificial
/// `shrink_to_fit()`) across 10 concurrent multi-timeframe charts totaling 100,000 sealed bars
/// (target: < 60 MiB vs 260.77 MiB S08 Vec baseline).
#[test]
fn slab_arena_10chart_100k_bars_stays_under_60_mib() {
    const CHARTS: usize = 10;
    const BARS_PER_CHART: usize = 10_000; // 10 * 10,000 = 100,000 bars total
    const TICKS_PER_BAR: usize = 16; // Realistic multi-price-level bar footprint

    let timeframes_ns: [i64; CHARTS] = [
        60_000_000_000,    // 1m
        180_000_000_000,   // 3m
        300_000_000_000,   // 5m
        900_000_000_000,   // 15m
        1_800_000_000_000, // 30m
        3_600_000_000_000, // 1h
        60_000_000_000,    // 1m (instrument 2)
        300_000_000_000,   // 5m (instrument 2)
        60_000_000_000,    // 1m (instrument 3)
        300_000_000_000,   // 5m (instrument 3)
    ];

    let rss_before = current_process_rss_bytes();
    let mut arenas: Vec<FootprintSlabArena> = Vec::with_capacity(CHARTS);
    let tick_size_e9: i64 = 500_000_000; // $0.50

    for (chart_idx, &tf_ns) in timeframes_ns.iter().enumerate() {
        let mut arena = FootprintSlabArena::new(tf_ns, tick_size_e9, Bps(30_000));
        let mut rng: u64 = 0xA11E_6ED1 ^ ((chart_idx as u64 + 1) * 0x9E37_79B9_7F4A_7C15);
        let base_price: i64 = 95_000_000_000_000;
        let mut cur_tick_offset: i64 = 0;

        for bar_i in 0..BARS_PER_CHART {
            let bar_ts = (bar_i as i64) * tf_ns + 1_732_500_000_000_000_000;
            for t_i in 0..TICKS_PER_BAR {
                rng ^= rng >> 12;
                rng ^= rng << 25;
                rng ^= rng >> 27;
                let r = rng.wrapping_mul(2685821657736338717);
                let step = ((r % 5) as i64) - 2; // -2..+2 ticks -> ~6-10 distinct cells per bar
                cur_tick_offset = (cur_tick_offset + step).clamp(-12, 12);
                let side = if (r >> 8) & 1 == 0 {
                    AggressorSide::Buy
                } else {
                    AggressorSide::Sell
                };
                let tick = NormalizedTick::new(
                    TimestampNs(bar_ts + (t_i as i64) * 1_000_000),
                    TimestampNs(bar_ts + (t_i as i64) * 1_000_000),
                    InstrumentId((chart_idx as u32) + 1),
                    (bar_i * TICKS_PER_BAR + t_i) as u64,
                    PriceE9(base_price + cur_tick_offset * tick_size_e9),
                    QtyE9(250_000_000),
                    PriceE9(0),
                    PriceE9(0),
                    side,
                    ProvenanceTier::ExactTickAggr,
                    ProvenanceModifiers::NONE,
                );
                arena.ingest_tick(&tick);
            }
        }
        arena.seal_active_bar();
        arenas.push(arena);
    }

    let rss_after = current_process_rss_bytes();
    let total_bars: usize = arenas.iter().map(|a| a.bars.len()).sum();
    let total_cells: usize = arenas.iter().map(|a| a.cells.len()).sum();
    let total_bytes: usize = arenas
        .iter()
        .map(FootprintSlabArena::estimated_heap_bytes)
        .sum();
    let mib_x100 = (total_bytes as u128 * 100) / (1024 * 1024);

    if let (Some(before), Some(after)) = (rss_before, rss_after) {
        let rss_delta = after.saturating_sub(before);
        let rss_mib_x100 = (rss_delta as u128 * 100) / (1024 * 1024);
        println!(
            "UV-04 (Arena OS RSS Bench) 10-chart FootprintSlabArena (no shrink_to_fit): charts={} bars={} cells={} capacity_bytes={} ({}.{:02} MiB) os_rss_delta_bytes={} ({}.{:02} MiB)",
            arenas.len(),
            total_bars,
            total_cells,
            total_bytes,
            mib_x100 / 100,
            mib_x100 % 100,
            rss_delta,
            rss_mib_x100 / 100,
            rss_mib_x100 % 100,
        );
        assert!(
            rss_delta < 60 * 1024 * 1024,
            "UV-04 OS RSS delta exceeded 60 MiB: {} bytes",
            rss_delta
        );
    } else {
        println!(
            "UV-04 (Arena Bench) 10-chart FootprintSlabArena (no shrink_to_fit): charts={} bars={} cells={} capacity_bytes={} ({}.{:02} MiB)",
            arenas.len(),
            total_bars,
            total_cells,
            total_bytes,
            mib_x100 / 100,
            mib_x100 % 100,
        );
    }

    assert_eq!(total_bars, CHARTS * BARS_PER_CHART);
    assert!(
        total_bytes < 60 * 1024 * 1024,
        "UV-04 capacity budget exceeded: {} bytes >= 60 MiB",
        total_bytes
    );

    // Verify off-viewport eviction compacts slab cleanly to 5,000 bars/chart
    for arena in &mut arenas {
        arena.evict_oldest_bars(5_000);
        assert_eq!(arena.bars.len(), 5_000);
    }
    let evicted_bytes: usize = arenas
        .iter()
        .map(FootprintSlabArena::estimated_heap_bytes)
        .sum();
    assert!(evicted_bytes < total_bytes);
}
