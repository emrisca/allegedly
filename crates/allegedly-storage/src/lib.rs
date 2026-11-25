pub mod atvault;
pub mod catalog;
pub mod parquet_vault;

pub use atvault::{
    ATVAULT_MAGIC, AtVaultBlockReader, MAX_BLOCK_COMP_BYTES, MAX_BLOCK_TICKS, StorageError,
    append_atvault_block, read_atvault_segment,
};
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

    #[test]
    fn rtsd12_corrupt_header_and_parquet_pruning() {
        let dir =
            std::env::temp_dir().join(format!("allegedly-storage-rtsd12-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // 1. Corrupt .atvault count header triggers ChecksumMismatch or BlockLimitExceeded (no OOM)
        let ticks = sample_ticks(20);
        let atv = dir.join("corrupt.atvault");
        append_atvault_block(&atv, &ticks).unwrap();
        let mut bytes = std::fs::read(&atv).unwrap();
        // Flip bit in count u32 at offset 4..8 (set to 500_000 which is under cap, so CRC must catch it)
        bytes[4..8].copy_from_slice(&500_000u32.to_le_bytes());
        std::fs::write(&atv, &bytes).unwrap();
        assert!(matches!(
            read_atvault_segment(&atv),
            Err(StorageError::ChecksumMismatch { .. })
        ));
        // Set huge count over cap (u32::MAX) -> BlockLimitExceeded before allocation
        bytes[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
        std::fs::write(&atv, &bytes).unwrap();
        assert!(matches!(
            read_atvault_segment(&atv),
            Err(StorageError::BlockLimitExceeded { .. })
        ));

        // 2. Parquet out-of-range query prunes all row groups cleanly
        let pq = dir.join("pruned.parquet");
        write_parquet_atomic(&pq, &ticks).unwrap();
        let empty = read_parquet_range(&pq, 0, 1_000).unwrap();
        assert!(empty.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
