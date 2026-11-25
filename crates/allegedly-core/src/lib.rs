pub mod config;
pub mod domain;
pub mod fixed;
pub mod provenance;

pub use config::{ConfigCascade, ConfigLayer};
pub use domain::{
    AggressorSide, AssetClass, BookLevel, InstrumentId, InstrumentMeta, NormalizedTick, Venue,
};
pub use fixed::{
    Bps, FixedError, LotQty, MoneyMicros, PriceE9, PriceTicks, QtyE9, SCALE_E9, TimestampNs,
    VwapAccumulator, format_e9, parse_decimal_e9,
};
pub use provenance::{BookState, ProvenanceModifiers, ProvenanceTier};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_decimal_parse_and_format_exact() {
        let p = PriceE9::parse("67234.50").unwrap();
        assert_eq!(p.0, 67_234_500_000_000);
        assert_eq!(p.to_string(), "67234.5");

        let neg = PriceE9::parse("-0.000125").unwrap();
        assert_eq!(neg.0, -125_000);
        assert_eq!(neg.to_string(), "-0.000125");

        let ticks = p.to_ticks(250_000_000).unwrap();
        assert_eq!(ticks.0, 268_938);
        assert_eq!(PriceE9::from_ticks(ticks, 250_000_000).unwrap(), p);
    }

    #[test]
    fn fixed_overflow_detected_never_wraps() {
        assert_eq!(
            PriceE9(i64::MAX).checked_add(PriceE9(1)),
            Err(FixedError::Overflow)
        );
        assert!(PriceE9::parse("99999999999999999999999").is_err());
    }

    #[test]
    fn centered_i128_vwap_exact() {
        let mut acc = VwapAccumulator::default();
        acc.update(
            PriceE9::parse("100.00").unwrap(),
            QtyE9::parse("10.0").unwrap(),
        )
        .unwrap();
        acc.update(
            PriceE9::parse("102.00").unwrap(),
            QtyE9::parse("30.0").unwrap(),
        )
        .unwrap();
        // (100*10 + 102*30) / 40 = 4060 / 40 = 101.50
        assert_eq!(acc.vwap().unwrap(), Some(PriceE9::parse("101.5").unwrap()));
    }

    #[test]
    fn sv07_five_level_cascade_inheritance_and_reset() {
        let mut cascade = ConfigCascade::default();
        cascade
            .defaults
            .values
            .insert("imbalance_ratio_bps".into(), "30000".into());
        cascade
            .template
            .values
            .insert("imbalance_ratio_bps".into(), "30000".into());
        assert_eq!(cascade.resolve("imbalance_ratio_bps"), Some("30000"));

        cascade.set_instance_override("imbalance_ratio_bps", "40000");
        assert_eq!(cascade.resolve("imbalance_ratio_bps"), Some("40000"));
        assert_eq!(
            cascade.modified_instance_keys(),
            vec!["imbalance_ratio_bps"]
        );
        assert_eq!(
            cascade.export_instance_toml(),
            "imbalance_ratio_bps = 40000\n"
        );

        cascade.reset_to_inherited("imbalance_ratio_bps");
        assert!(cascade.modified_instance_keys().is_empty());
        assert_eq!(cascade.resolve("imbalance_ratio_bps"), Some("30000"));
        assert_eq!(cascade.export_instance_toml(), "");
    }

    #[test]
    fn provenance_and_book_state_invariants() {
        assert!(!ProvenanceTier::SyntheticIntrabar.supports_absorption_triggers());
        assert!(ProvenanceTier::ExactTickAggr.supports_absorption_triggers());
        assert!(ProvenanceTier::ExactL3Mbo.is_exact_mbo());
        assert!(!ProvenanceTier::ExactTickAggr.is_exact_mbo());
        assert!(BookState::Live.is_live());
        assert!(!BookState::Stale.is_live());
    }
}
