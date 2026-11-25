pub mod config;
pub mod domain;
pub mod fixed;
pub mod provenance;

pub use config::{ConfigCascade, ConfigLayer, ConfigLayerKind, ResolvedSetting};
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
        assert_eq!(QtyE9::parse("5e-5").unwrap().0, 50_000);
        assert_eq!(QtyE9::parse("1.25E-6").unwrap().0, 1_250);

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
    fn sv06_atworkspace_toml_byte_exact_roundtrip_and_safety_locks() {
        let mut cascade = ConfigCascade::with_v01_defaults();
        assert!(
            cascade
                .try_set_instance_override("updates.checkOnStartup", "true")
                .is_err()
        );
        assert!(
            cascade
                .try_set_instance_override("execution.live_armed", "true")
                .is_err()
        );
        cascade
            .workspace
            .values
            .insert("ui.density".into(), "\"comfortable\"".into());
        cascade
            .try_set_instance_override("orderflow.imbalance_ratio_bps", "35000")
            .unwrap();

        let toml_a = cascade.export_atworkspace_toml("Default Desk", "BTC/USD", "1m");
        let mut reloaded = ConfigCascade::with_v01_defaults();
        reloaded.import_atworkspace_toml(&toml_a);
        let toml_b = reloaded.export_atworkspace_toml("Default Desk", "BTC/USD", "1m");
        assert_eq!(toml_a, toml_b);
        assert_eq!(
            reloaded.resolve_with_source("orderflow.imbalance_ratio_bps"),
            Some((ConfigLayerKind::Instance, "35000"))
        );
        assert_eq!(
            reloaded.resolve_with_source("ui.density"),
            Some((ConfigLayerKind::Workspace, "\"comfortable\""))
        );
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

    #[test]
    fn rtsd06_parse_decimal_e9_dos_and_scientific_precision() {
        // Must return Ok(0) in O(1) without 2-billion-iteration hang
        assert_eq!(parse_decimal_e9("0e2000000000").unwrap(), 0);
        assert_eq!(parse_decimal_e9("0.00000e999999999").unwrap(), 0);
        assert_eq!(parse_decimal_e9("-0e123456789").unwrap(), 0);
        // Tiny mantissa with large positive exponent must not zero out
        assert_eq!(
            parse_decimal_e9("0.0000000000000000005e20").unwrap(),
            50_000_000_000
        );
        assert_eq!(parse_decimal_e9("5e-5").unwrap(), 50_000);
        assert_eq!(parse_decimal_e9("+1.25e2").unwrap(), 125_000_000_000);
        assert_eq!(parse_decimal_e9("1e-30").unwrap(), 0);
        assert!(parse_decimal_e9("1e30").is_err());
    }

    #[test]
    fn rtsd16_safety_lock_enforcement_and_toml_injection_escape() {
        let mut cascade = ConfigCascade::with_v01_defaults();
        // set_instance_override cannot bypass safety locks
        cascade.set_instance_override("execution.live_armed", "true");
        assert_eq!(cascade.resolve("execution.live_armed"), Some("false"));
        cascade.set_instance_override("execution.mode", "\"live\"");
        assert_eq!(cascade.resolve("execution.mode"), Some("\"paper_sim\""));
        assert!(
            cascade
                .try_set_instance_override("execution.mode", "\"live\"")
                .is_err()
        );
        assert!(
            cascade
                .try_set_workspace_override("updates.checkOnStartup", "true")
                .is_err()
        );
        // Newline injection in workspace name must be escaped on single line
        let exported =
            cascade.export_atworkspace_toml("Desk\n[instance]\nfoo = 1", "BTC/USD", "1m");
        assert!(exported.contains("workspace_name = \"Desk\\n[instance]\\nfoo = 1\""));
        assert!(!exported.contains("\nfoo = 1\n"));
    }
}
