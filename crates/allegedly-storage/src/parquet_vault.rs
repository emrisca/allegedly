use crate::atvault::StorageError;
use allegedly_core::NormalizedTick;
use arrow::array::{Int64Array, UInt8Array, UInt32Array, UInt64Array};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::record_batch::RecordBatch;
use parquet::arrow::ArrowWriter;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use parquet::basic::{Compression, Encoding, ZstdLevel};
use parquet::file::properties::WriterProperties;
use parquet::file::statistics::Statistics;
use std::fs::{self, File};
use std::path::Path;
use std::sync::Arc;

fn tick_schema() -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("ts_exchange_ns", DataType::Int64, false),
        Field::new("ts_recv_ns", DataType::Int64, false),
        Field::new("instrument_id", DataType::UInt32, false),
        Field::new("seq", DataType::UInt64, false),
        Field::new("price_e9", DataType::Int64, false),
        Field::new("qty_e9", DataType::Int64, false),
        Field::new("bid_e9", DataType::Int64, false),
        Field::new("ask_e9", DataType::Int64, false),
        Field::new("side", DataType::UInt8, false),
        Field::new("provenance_tier", DataType::UInt8, false),
        Field::new("provenance_modifiers", DataType::UInt8, false),
    ]))
}

fn downcast_col<'a, T: 'static>(
    batch: &'a RecordBatch,
    index: usize,
    name: &'static str,
) -> Result<&'a T, StorageError> {
    let col = batch
        .columns()
        .get(index)
        .ok_or_else(|| StorageError::SchemaMismatch(format!("missing column {index} ({name})")))?;
    col.as_any().downcast_ref::<T>().ok_or_else(|| {
        StorageError::SchemaMismatch(format!(
            "column {index} ({name}) has unexpected Arrow type {:?}",
            col.data_type()
        ))
    })
}

/// Atomically compact NormalizedTicks into a Zstd-3 + DELTA_BINARY_PACKED Parquet 2.0 file
/// with explicit `sync_all()` before atomic rename (RTSD-12 / SV-03).
pub fn write_parquet_atomic(path: &Path, ticks: &[NormalizedTick]) -> Result<u64, StorageError> {
    let schema = tick_schema();
    let batch = RecordBatch::try_new(
        schema.clone(),
        vec![
            Arc::new(Int64Array::from_iter_values(
                ticks.iter().map(|t| t.ts_exchange_ns),
            )),
            Arc::new(Int64Array::from_iter_values(
                ticks.iter().map(|t| t.ts_recv_ns),
            )),
            Arc::new(UInt32Array::from_iter_values(
                ticks.iter().map(|t| t.instrument_id),
            )),
            Arc::new(UInt64Array::from_iter_values(ticks.iter().map(|t| t.seq))),
            Arc::new(Int64Array::from_iter_values(
                ticks.iter().map(|t| t.price_e9),
            )),
            Arc::new(Int64Array::from_iter_values(ticks.iter().map(|t| t.qty_e9))),
            Arc::new(Int64Array::from_iter_values(ticks.iter().map(|t| t.bid_e9))),
            Arc::new(Int64Array::from_iter_values(ticks.iter().map(|t| t.ask_e9))),
            Arc::new(UInt8Array::from_iter_values(ticks.iter().map(|t| t.side))),
            Arc::new(UInt8Array::from_iter_values(
                ticks.iter().map(|t| t.provenance_tier),
            )),
            Arc::new(UInt8Array::from_iter_values(
                ticks.iter().map(|t| t.provenance_modifiers),
            )),
        ],
    )?;

    let tmp = path.with_extension("parquet.tmp");
    let file = File::create(&tmp)?;
    let props = WriterProperties::builder()
        .set_compression(Compression::ZSTD(ZstdLevel::try_new(3)?))
        .set_max_row_group_row_count(Some(200_000))
        .set_encoding(Encoding::DELTA_BINARY_PACKED)
        .build();
    let mut writer = ArrowWriter::try_new(file, schema, Some(props))?;
    writer.write(&batch)?;
    let file = writer.into_inner()?;
    file.sync_all()?;
    drop(file);
    fs::rename(&tmp, path)?;
    Ok(fs::metadata(path)?.len())
}

/// Read ticks within `[start_ts_ns, end_ts_ns]` using Parquet row-group min/max statistics pruning
/// and typed schema checks (zero `.unwrap()` panics on untrusted input; RTSD-12).
pub fn read_parquet_range(
    path: &Path,
    start_ts_ns: i64,
    end_ts_ns: i64,
) -> Result<Vec<NormalizedTick>, StorageError> {
    let file = File::open(path)?;
    let builder = ParquetRecordBatchReaderBuilder::try_new(file)?;
    let metadata = builder.metadata().clone();

    // Row-group statistics pruning on column 0 (`ts_exchange_ns`)
    let mut selected_row_groups = Vec::new();
    for (rg_idx, rg) in metadata.row_groups().iter().enumerate() {
        let mut overlaps = true;
        if let Some(col_meta) = rg.columns().first()
            && let Some(Statistics::Int64(stats)) = col_meta.statistics()
            && let (Some(&min_ts), Some(&max_ts)) = (stats.min_opt(), stats.max_opt())
            && (max_ts < start_ts_ns || min_ts > end_ts_ns)
        {
            overlaps = false;
        }
        if overlaps {
            selected_row_groups.push(rg_idx);
        }
    }

    if selected_row_groups.is_empty() {
        return Ok(Vec::new());
    }

    let reader = builder.with_row_groups(selected_row_groups).build()?;
    let mut out = Vec::new();
    for maybe_batch in reader {
        let batch = maybe_batch?;
        let ts_ex = downcast_col::<Int64Array>(&batch, 0, "ts_exchange_ns")?;
        let ts_rx = downcast_col::<Int64Array>(&batch, 1, "ts_recv_ns")?;
        let inst = downcast_col::<UInt32Array>(&batch, 2, "instrument_id")?;
        let seq = downcast_col::<UInt64Array>(&batch, 3, "seq")?;
        let price = downcast_col::<Int64Array>(&batch, 4, "price_e9")?;
        let qty = downcast_col::<Int64Array>(&batch, 5, "qty_e9")?;
        let bid = downcast_col::<Int64Array>(&batch, 6, "bid_e9")?;
        let ask = downcast_col::<Int64Array>(&batch, 7, "ask_e9")?;
        let side = downcast_col::<UInt8Array>(&batch, 8, "side")?;
        let tier = downcast_col::<UInt8Array>(&batch, 9, "provenance_tier")?;
        let mods = downcast_col::<UInt8Array>(&batch, 10, "provenance_modifiers")?;

        for i in 0..batch.num_rows() {
            let t = ts_ex.value(i);
            if t >= start_ts_ns && t <= end_ts_ns {
                out.push(NormalizedTick {
                    ts_exchange_ns: t,
                    ts_recv_ns: ts_rx.value(i),
                    instrument_id: inst.value(i),
                    flags: 0,
                    seq: seq.value(i),
                    price_e9: price.value(i),
                    qty_e9: qty.value(i),
                    bid_e9: bid.value(i),
                    ask_e9: ask.value(i),
                    side: side.value(i),
                    provenance_tier: tier.value(i),
                    provenance_modifiers: mods.value(i),
                    _pad: [0; 5],
                });
            }
        }
    }
    Ok(out)
}
