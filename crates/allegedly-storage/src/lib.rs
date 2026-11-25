pub mod atvault;
pub mod catalog;
pub mod parquet_vault;

pub use atvault::{ATVAULT_MAGIC, StorageError, append_atvault_block, read_atvault_segment};
pub use catalog::{CatalogDb, PartitionEntry};
pub use parquet_vault::{read_parquet_range, write_parquet_atomic};

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_core::{
        AggressorSide, InstrumentId, NormalizedTick, PriceE9, ProvenanceModifiers, ProvenanceTier,
        QtyE9, TimestampNs,
    };

    fn sample_ticks(n: usize) -> Vec<NormalizedTick> {
        (0..n)
            .map(|i| {
                NormalizedTick::new(
                    TimestampNs(1_732_500_000_000_000_000 + (i as i64) * 1_000_000),
                    TimestampNs(1_732_500_000_000_000_000 + (i as i64) * 1_000_000),
                    InstrumentId(1),
                    (i + 1) as u64,
                    PriceE9(95_000_000_000_000 + (i as i64 % 20) * 500_000_000),
                    QtyE9(250_000_000),
                    PriceE9(94_999_500_000_000),
                    PriceE9(95_000_500_000_000),
                    if i % 2 == 0 {
                        AggressorSide::Buy
                    } else {
                        AggressorSide::Sell
                    },
                    ProvenanceTier::ExactTickAggr,
                    ProvenanceModifiers::NONE,
                )
            })
            .collect()
    }

    #[test]
    fn atvault_and_parquet_lossless_roundtrip() {
        let dir =
            std::env::temp_dir().join(format!("allegedly-storage-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let ticks = sample_ticks(1_000);
        let atv = dir.join("btc.atvault");
        append_atvault_block(&atv, &ticks).unwrap();
        let read_back = read_atvault_segment(&atv).unwrap();
        assert_eq!(read_back, ticks);

        let pq = dir.join("btc.parquet");
        let bytes = write_parquet_atomic(&pq, &ticks).unwrap();
        assert!(bytes > 0);
        let pq_back = read_parquet_range(&pq, i64::MIN, i64::MAX).unwrap();
        assert_eq!(pq_back, ticks);

        let cat = CatalogDb::open(&dir.join("catalog.sqlite")).unwrap();
        cat.register_partition(&PartitionEntry {
            symbol: "BTC/USD".into(),
            start_ts_ns: ticks.first().unwrap().ts_exchange_ns,
            end_ts_ns: ticks.last().unwrap().ts_exchange_ns,
            row_count: ticks.len() as i64,
            file_path: pq.to_string_lossy().into_owned(),
        })
        .unwrap();
        let found = cat
            .query_overlapping("BTC/USD", i64::MIN, i64::MAX)
            .unwrap();
        assert_eq!(found.len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
