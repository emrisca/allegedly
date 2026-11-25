pub mod footprint;
pub mod tpo;
pub mod vrvp;

pub use footprint::{BarSlice, FootprintSlabArena};
pub use tpo::{TpoProfile, TpoSummary};
pub use vrvp::{DyadicVrvpTree, compute_value_area};

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_core::{
        AggressorSide, Bps, InstrumentId, NormalizedTick, PriceE9, PriceTicks, ProvenanceModifiers,
        ProvenanceTier, QtyE9, TimestampNs,
    };
    use allegedly_ipc::{BIT_BUY_IMBAL, BIT_POC};

    #[test]
    fn footprint_diagonal_imbalance_and_poc() {
        let mut arena = FootprintSlabArena::new(60_000_000_000, 1_000_000_000, Bps(30_000));
        // Tick 100 sell 1, Tick 101 buy 5 -> 5 / 1 = 500% >= 300% BUY imbalance at 101
        let t1 = NormalizedTick::new(
            TimestampNs(60_000_000_000),
            TimestampNs(60_000_000_000),
            InstrumentId(1),
            1,
            PriceE9(100_000_000_000),
            QtyE9(1_000_000_000),
            PriceE9(100_000_000_000),
            PriceE9(101_000_000_000),
            AggressorSide::Sell,
            ProvenanceTier::ExactTickAggr,
            ProvenanceModifiers::NONE,
        );
        let t2 = NormalizedTick::new(
            TimestampNs(60_000_001_000),
            TimestampNs(60_000_001_000),
            InstrumentId(1),
            2,
            PriceE9(101_000_000_000),
            QtyE9(5_000_000_000),
            PriceE9(100_000_000_000),
            PriceE9(101_000_000_000),
            AggressorSide::Buy,
            ProvenanceTier::ExactTickAggr,
            ProvenanceModifiers::NONE,
        );
        arena.ingest_tick(&t1);
        arena.ingest_tick(&t2);
        arena.seal_active_bar();

        assert_eq!(arena.bars.len(), 1);
        assert_eq!(arena.bars[0].poc_tick, 101);
        let c101 = arena.cells.iter().find(|c| c.price_tick == 101).unwrap();
        assert_ne!(c101.imbalance_flags & BIT_BUY_IMBAL, 0);
        assert_ne!(c101.imbalance_flags & BIT_POC, 0);
    }

    #[test]
    fn dyadic_vrvp_matches_exact_sum() {
        let mut bars = Vec::new();
        for i in 0..300 {
            bars.push(vec![(100 + (i % 5) as i64, 100, 200)]);
        }
        let tree = DyadicVrvpTree::from_bar_profiles(bars);
        let (summary, bins) = tree.query(0, 300);
        assert_eq!(bins.len(), 5);
        assert_eq!(bins[0].bid_vol_e9, 6_000);
        assert_eq!(bins[0].ask_vol_e9, 12_000);
        assert!((100..=104).contains(&summary.poc_price));
    }

    #[test]
    fn tpo_u128_96_brackets_and_magnet_snap() {
        let mut tpo = TpoProfile::default();
        for period in 0..96u16 {
            let lo = 500 + i64::from(period % 3);
            tpo.record_bracket(period, lo, lo + 2);
        }
        assert_eq!(tpo.period_count(), 96);
        let sum = tpo.summary().unwrap();
        assert_eq!(sum.poc_tick, PriceTicks(502));
        assert_eq!(tpo.magnet_snap(PriceTicks(502), 2), Some(PriceTicks(502)));
        assert_eq!(tpo.magnet_snap(PriceTicks(505), 2), Some(sum.vah_tick));
    }

    #[test]
    fn rtsd15_evict_zero_and_out_of_order_tick_guard() {
        let mut arena = FootprintSlabArena::new(60_000_000_000, 1_000_000_000, Bps(30_000));
        let make_tick = |ts: i64, px: i64| {
            NormalizedTick::new(
                TimestampNs(ts),
                TimestampNs(ts),
                InstrumentId(1),
                1,
                PriceE9(px),
                QtyE9(1_000_000_000),
                PriceE9(px),
                PriceE9(px),
                AggressorSide::Buy,
                ProvenanceTier::ExactTickAggr,
                ProvenanceModifiers::NONE,
            )
        };
        arena.ingest_tick(&make_tick(120_000_000_000, 100_000_000_000));
        // Backwards out-of-order tick must not rewind active_bar_ts_ns
        arena.ingest_tick(&make_tick(60_000_000_000, 99_000_000_000));
        assert_eq!(arena.late_ticks_dropped, 1);
        assert_eq!(arena.active_bar_ts_ns(), Some(120_000_000_000));
        arena.seal_active_bar();
        assert_eq!(arena.bars.len(), 1);
        // evict_oldest_bars(0) must clear cleanly without panicking
        arena.evict_oldest_bars(0);
        assert!(arena.bars.is_empty());
        assert!(arena.cells.is_empty());
    }
}
