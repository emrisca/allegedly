use crate::atvault::StorageError;
use allegedly_core::NormalizedTick;
use arrow::array::{Int64Array, UInt8Array, UInt32Array, UInt64Array};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::record_batch::RecordBatch;
use parquet::arrow::ArrowWriter;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use parquet::basic::{Compression, Encoding, ZstdLevel};
use parquet::file::properties::WriterProperties;
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

/// Atomically compact NormalizedTicks into a Zstd-3 + DELTA_BINARY_PACKED Parquet 2.0 file.
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
    writer.close()?;
    fs::rename(&tmp, path)?;
    Ok(fs::metadata(path)?.len())
}

/// Read ticks within `[start_ts_ns, end_ts_ns]` using Parquet streaming batches.
pub fn read_parquet_range(
    path: &Path,
    start_ts_ns: i64,
    end_ts_ns: i64,
) -> Result<Vec<NormalizedTick>, StorageError> {
    let file = File::open(path)?;
    let reader = ParquetRecordBatchReaderBuilder::try_new(file)?.build()?;
    let mut out = Vec::new();
    for maybe_batch in reader {
        let batch = maybe_batch?;
        let ts_ex = batch
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap();
        let ts_rx = batch
            .column(1)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap();
        let inst = batch
            .column(2)
            .as_any()
            .downcast_ref::<UInt32Array>()
            .unwrap();
        let seq = batch
            .column(3)
            .as_any()
            .downcast_ref::<UInt64Array>()
            .unwrap();
        let price = batch
            .column(4)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap();
        let qty = batch
            .column(5)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap();
        let bid = batch
            .column(6)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap();
        let ask = batch
            .column(7)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap();
        let side = batch
            .column(8)
            .as_any()
            .downcast_ref::<UInt8Array>()
            .unwrap();
        let tier = batch
            .column(9)
            .as_any()
            .downcast_ref::<UInt8Array>()
            .unwrap();
        let mods = batch
            .column(10)
            .as_any()
            .downcast_ref::<UInt8Array>()
            .unwrap();

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
