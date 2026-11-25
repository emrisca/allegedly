use allegedly_core::{
    AggressorSide, Bps, InstrumentId, NormalizedTick, PriceE9, ProvenanceModifiers, ProvenanceTier,
    QtyE9, TimestampNs,
};
use allegedly_orderflow::FootprintSlabArena;

/// UV-04 / SV-13 Tier A: Measure live FootprintSlabArena memory across 10 concurrent
/// multi-timeframe charts totaling 100,000 sealed bars (target: < 60 MiB vs 260.77 MiB S08 Vec baseline).
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
        arena.bars.shrink_to_fit();
        arena.cells.shrink_to_fit();
        arenas.push(arena);
    }

    let total_bars: usize = arenas.iter().map(|a| a.bars.len()).sum();
    let total_cells: usize = arenas.iter().map(|a| a.cells.len()).sum();
    let total_bytes: usize = arenas
        .iter()
        .map(FootprintSlabArena::estimated_heap_bytes)
        .sum();
    let mib_x100 = (total_bytes as u128 * 100) / (1024 * 1024);

    println!(
        "UV-04 10-chart FootprintSlabArena: charts={} bars={} cells={} total_bytes={} ({}.{:02} MiB)",
        arenas.len(),
        total_bars,
        total_cells,
        total_bytes,
        mib_x100 / 100,
        mib_x100 % 100
    );

    assert_eq!(total_bars, CHARTS * BARS_PER_CHART);
    assert!(
        total_bytes < 60 * 1024 * 1024,
        "UV-04 budget exceeded: {} bytes >= 60 MiB",
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
