pub mod classifier;
pub mod dispatcher;
pub mod parsers;

pub use classifier::SideClassifier;
pub use dispatcher::{
    CoreEventDispatcher, DEFAULT_RING_CAP, ProviderIngress, ProviderRing, SyntheticSimProvider,
};
pub use parsers::{ParseError, kraken_book_crc32, parse_coinbase_trade, parse_kraken_trade};

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_core::{
        AggressorSide, BookState, InstrumentId, PriceE9, ProvenanceTier, TimestampNs,
    };

    #[test]
    fn coinbase_inverts_maker_side_to_taker_side() {
        let tick = parse_coinbase_trade(
            InstrumentId(1),
            Some(10),
            10,
            TimestampNs(1_000),
            "95000.50",
            "0.25",
            "BUY", // maker was BUY -> taker/aggressor MUST be Sell
        )
        .unwrap();
        assert_eq!(tick.aggressor_side(), AggressorSide::Sell);
        assert_eq!(tick.tier(), ProvenanceTier::ExactTickAggr);

        let gap = parse_coinbase_trade(
            InstrumentId(1),
            Some(11),
            13,
            TimestampNs(2_000),
            "95000.50",
            "0.25",
            "SELL",
        );
        assert_eq!(
            gap,
            Err(ParseError::SequenceGap {
                expected: 11,
                actual: 13
            })
        );
    }

    #[test]
    fn ring_saturation_never_blocks_and_emits_stale_status() {
        let ring = ProviderRing::with_capacity(2);
        let mut ingress = ProviderIngress::new(ring.producer);
        let mut sim =
            SyntheticSimProvider::new(InstrumentId(1), 42, 100_000_000_000, 10_000_000, 0);

        assert!(ingress.try_push(sim.next_tick()).is_none());
        assert!(ingress.try_push(sim.next_tick()).is_none());
        let status = ingress
            .try_push(sim.next_tick())
            .expect("3rd push on cap-2 ring must emit Stale status");
        assert_eq!(status.book_state, BookState::Stale as u8);
        assert_eq!(status.dropped_total, 1);
        assert_eq!(ingress.book_state(), BookState::Stale);
    }

    #[test]
    fn lee_ready_and_tick_rule_classifier() {
        let mut c = SideClassifier::default();
        let (s1, t1) = c.classify(PriceE9(101), Some(PriceE9(99)), Some(PriceE9(101)));
        assert_eq!(
            (s1, t1),
            (AggressorSide::Buy, ProvenanceTier::EstimatedL1Quote)
        );

        let (s2, t2) = c.classify(PriceE9(100), None, None);
        assert_eq!(
            (s2, t2),
            (AggressorSide::Sell, ProvenanceTier::EstimatedTickRule)
        );
    }

    #[test]
    fn dispatcher_routes_to_storage_ring() {
        let p_ring = ProviderRing::with_capacity(16);
        let s_ring = ProviderRing::with_capacity(16);
        let mut ingress = ProviderIngress::new(p_ring.producer);
        let mut sim =
            SyntheticSimProvider::new(InstrumentId(1), 7, 50_000_000_000, 10_000_000, 1_000);
        for _ in 0..5 {
            assert!(ingress.try_push(sim.next_tick()).is_none());
        }
        let mut disp = CoreEventDispatcher::new(vec![p_ring.consumer], s_ring.producer);
        let mut seen = 0;
        let drained = disp.poll_all(|_| seen += 1);
        assert_eq!(drained, 5);
        assert_eq!(seen, 5);
        assert_eq!(disp.storage_dropped(), 0);
        let mut s_rx = s_ring.consumer;
        let mut stored = 0;
        while s_rx.pop().is_ok() {
            stored += 1;
        }
        assert_eq!(stored, 5);
    }
}
