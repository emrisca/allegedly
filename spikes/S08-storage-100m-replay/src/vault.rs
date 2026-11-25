use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use arrow::array::{Int64Array, UInt8Array};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::record_batch::RecordBatch;
use parquet::arrow::ArrowWriter;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use parquet::basic::{Compression, Encoding, ZstdLevel};
use parquet::file::properties::{EnabledStatistics, WriterProperties, WriterVersion};
use parquet::file::statistics::Statistics;
use parquet::schema::types::ColumnPath;
use rusqlite::{Connection, params};
use sha2::{Digest, Sha256};

use crate::metrics::{LatencyStats, compute_latency_stats, rss_stats_mb};
use crate::orderflow::FootprintBuilder;
use crate::types::{TickEvent, TickGenerator};

pub const NUM_DAYS: u32 = 20;
pub const TICKS_PER_DAY: usize = 5_000_000;
pub const TOTAL_TICKS: u64 = (NUM_DAYS as u64) * (TICKS_PER_DAY as u64); // 100,000,000
pub const ROW_GROUP_SIZE: usize = 200_000;

#[derive(Debug)]
pub struct WriteBenchReport {
    pub total_ticks: u64,
    pub wall_secs: f64,
    pub ticks_per_sec: f64,
    pub total_parquet_bytes: u64,
    pub sqlite_bytes: u64,
    pub bytes_per_tick: f64,
    pub ratio_vs_packed_26b: f64,
    pub ratio_vs_aligned_32b: f64,
    pub total_vol: i128,
    pub total_delta: i128,
    pub peak_rss_mb: f64,
    pub vault_manifest_sha256: String,
    pub day_bounds: Vec<(u32, i64, i64)>,
}

#[derive(Debug)]
pub struct ReplayBenchReport {
    pub total_ticks: u64,
    pub wall_secs: f64,
    pub ticks_per_sec: f64,
    pub total_vol: i128,
    pub total_delta: i128,
    pub minute_bars_seen: u64,
    pub current_rss_mb: f64,
    pub peak_rss_mb: f64,
    pub stream_digest_hex: String,
}

#[derive(Debug)]
pub struct SeekBenchReport {
    pub num_seeks: usize,
    pub avg_ticks_per_1h: f64,
    pub avg_bars_per_1h: f64,
    #[allow(dead_code)]
    pub row_groups_total: usize,
    pub row_groups_read: usize,
    pub pruning_pct: f64,
    pub cold_nocache_enabled: bool,
    pub cold_ms: LatencyStats,
    pub warm_ms: LatencyStats,
}

fn trade_schema() -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("ts_event", DataType::Int64, false),
        Field::new("price_fp", DataType::Int64, false),
        Field::new("qty_fp", DataType::Int64, false),
        Field::new("aggressor_side", DataType::UInt8, false),
        Field::new("flags", DataType::UInt8, false),
    ]))
}

fn writer_properties() -> WriterProperties {
    WriterProperties::builder()
        .set_writer_version(WriterVersion::PARQUET_2_0)
        .set_compression(Compression::ZSTD(ZstdLevel::try_new(3).unwrap()))
        .set_max_row_group_row_count(Some(ROW_GROUP_SIZE))
        .set_statistics_enabled(EnabledStatistics::Chunk)
        .set_column_dictionary_enabled(ColumnPath::from("ts_event"), false)
        .set_column_encoding(ColumnPath::from("ts_event"), Encoding::DELTA_BINARY_PACKED)
        .set_column_dictionary_enabled(ColumnPath::from("price_fp"), false)
        .set_column_encoding(ColumnPath::from("price_fp"), Encoding::DELTA_BINARY_PACKED)
        .set_column_dictionary_enabled(ColumnPath::from("qty_fp"), true)
        .set_column_dictionary_enabled(ColumnPath::from("aggressor_side"), true)
        .set_column_dictionary_enabled(ColumnPath::from("flags"), true)
        .build()
}

fn init_catalog(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS instruments (
             instrument_id INTEGER PRIMARY KEY,
             venue TEXT NOT NULL,
             symbol TEXT NOT NULL,
             tick_size_fp INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS partitions (
             partition_id INTEGER PRIMARY KEY AUTOINCREMENT,
             venue TEXT NOT NULL,
             symbol TEXT NOT NULL,
             day_num INTEGER NOT NULL,
             file_path TEXT NOT NULL,
             row_count INTEGER NOT NULL,
             min_ts_ns INTEGER NOT NULL,
             max_ts_ns INTEGER NOT NULL,
             file_bytes INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_partitions_ts ON partitions (min_ts_ns, max_ts_ns);",
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO instruments (instrument_id, venue, symbol, tick_size_fp) VALUES (1, 'GLBX', 'ES', 250000000)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

#[cfg(target_os = "macos")]
fn set_file_nocache(file: &File) -> bool {
    use std::os::unix::io::AsRawFd;
    const F_NOCACHE: i32 = 48;
    unsafe extern "C" {
        fn fcntl(fd: i32, cmd: i32, ...) -> i32;
    }
    unsafe { fcntl(file.as_raw_fd(), F_NOCACHE, 1) == 0 }
}

#[cfg(not(target_os = "macos"))]
fn set_file_nocache(_file: &File) -> bool {
    false
}

/// Benchmark 1: Generate 100,000,000 deterministic fixed-point ticks into Hive-partitioned
/// Zstd Parquet + SQLite WAL metadata catalog under `vault_root` (strictly in /tmp/allegedly-s08-bench/).
pub fn generate_100m_vault(vault_root: &Path) -> Result<WriteBenchReport, String> {
    if vault_root.exists() {
        fs::remove_dir_all(vault_root).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(vault_root).map_err(|e| e.to_string())?;

    let db_path = vault_root.join("catalog.sqlite");
    let conn = init_catalog(&db_path)?;
    let schema = trade_schema();
    let props = writer_properties();

    // Reusable column buffers (only 200k rows = ~5.2 MB RAM!)
    let mut ts_buf: Vec<i64> = Vec::with_capacity(ROW_GROUP_SIZE);
    let mut price_buf: Vec<i64> = Vec::with_capacity(ROW_GROUP_SIZE);
    let mut qty_buf: Vec<i64> = Vec::with_capacity(ROW_GROUP_SIZE);
    let mut side_buf: Vec<u8> = Vec::with_capacity(ROW_GROUP_SIZE);
    let mut flags_buf: Vec<u8> = Vec::with_capacity(ROW_GROUP_SIZE);

    let mut total_parquet_bytes: u64 = 0;
    let mut total_vol: i128 = 0;
    let mut total_delta: i128 = 0;
    let mut manifest_hasher = Sha256::new();
    let mut day_bounds = Vec::with_capacity(NUM_DAYS as usize);

    let t_start = Instant::now();
    for day_idx in 0..NUM_DAYS {
        let day_num = day_idx + 1;
        let part_dir = vault_root.join(format!(
            "market_data/schema=trades/venue=GLBX/symbol=ES/year=2026/month=11/day={day_num:02}"
        ));
        fs::create_dir_all(&part_dir).map_err(|e| e.to_string())?;
        let part_file = part_dir.join("part-000.parquet");
        let file = File::create(&part_file).map_err(|e| e.to_string())?;

        let mut writer = ArrowWriter::try_new(file, schema.clone(), Some(props.clone()))
            .map_err(|e| e.to_string())?;

        let mut tick_gen = TickGenerator::for_day(day_idx, TICKS_PER_DAY);
        let mut day_min_ts = i64::MAX;
        let mut day_max_ts = i64::MIN;
        let mut remaining = TICKS_PER_DAY;

        while remaining > 0 {
            let chunk = remaining.min(ROW_GROUP_SIZE);
            ts_buf.clear();
            price_buf.clear();
            qty_buf.clear();
            side_buf.clear();
            flags_buf.clear();

            for _ in 0..chunk {
                let t = tick_gen.next_tick();
                if t.ts_event < day_min_ts {
                    day_min_ts = t.ts_event;
                }
                if t.ts_event > day_max_ts {
                    day_max_ts = t.ts_event;
                }
                total_vol += t.qty_fp as i128;
                if t.aggressor_side == 1 {
                    total_delta += t.qty_fp as i128;
                } else {
                    total_delta -= t.qty_fp as i128;
                }
                ts_buf.push(t.ts_event);
                price_buf.push(t.price_fp);
                qty_buf.push(t.qty_fp);
                side_buf.push(t.aggressor_side);
                flags_buf.push(t.flags);
            }

            let batch = RecordBatch::try_new(
                schema.clone(),
                vec![
                    Arc::new(Int64Array::from_iter_values(ts_buf.iter().copied())),
                    Arc::new(Int64Array::from_iter_values(price_buf.iter().copied())),
                    Arc::new(Int64Array::from_iter_values(qty_buf.iter().copied())),
                    Arc::new(UInt8Array::from_iter_values(side_buf.iter().copied())),
                    Arc::new(UInt8Array::from_iter_values(flags_buf.iter().copied())),
                ],
            )
            .map_err(|e| e.to_string())?;

            writer.write(&batch).map_err(|e| e.to_string())?;
            remaining -= chunk;
        }
        writer.close().map_err(|e| e.to_string())?;

        let f_bytes = fs::metadata(&part_file).map_err(|e| e.to_string())?.len();
        total_parquet_bytes += f_bytes;
        day_bounds.push((day_num, day_min_ts, day_max_ts));

        conn.execute(
            "INSERT INTO partitions (venue, symbol, day_num, file_path, row_count, min_ts_ns, max_ts_ns, file_bytes)
             VALUES ('GLBX', 'ES', ?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                day_num,
                part_file.to_string_lossy().as_ref(),
                TICKS_PER_DAY as i64,
                day_min_ts,
                day_max_ts,
                f_bytes as i64
            ],
        )
        .map_err(|e| e.to_string())?;

        manifest_hasher.update(day_num.to_le_bytes());
        manifest_hasher.update(day_min_ts.to_le_bytes());
        manifest_hasher.update(day_max_ts.to_le_bytes());
        manifest_hasher.update(f_bytes.to_le_bytes());
    }
    let wall_secs = t_start.elapsed().as_secs_f64();

    // Flush WAL checkpoint to get accurate SQLite size
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    let sqlite_bytes = fs::metadata(&db_path).map_err(|e| e.to_string())?.len();
    let (_, peak_rss_mb) = rss_stats_mb();

    let raw_packed = (TOTAL_TICKS as f64) * 26.0;
    let raw_aligned = (TOTAL_TICKS as f64) * 32.0;
    let bytes_per_tick = total_parquet_bytes as f64 / TOTAL_TICKS as f64;
    let digest = manifest_hasher.finalize();
    let vault_manifest_sha256 = digest.iter().map(|b| format!("{b:02x}")).collect::<String>();

    Ok(WriteBenchReport {
        total_ticks: TOTAL_TICKS,
        wall_secs,
        ticks_per_sec: TOTAL_TICKS as f64 / wall_secs,
        total_parquet_bytes,
        sqlite_bytes,
        bytes_per_tick,
        ratio_vs_packed_26b: raw_packed / total_parquet_bytes as f64,
        ratio_vs_aligned_32b: raw_aligned / total_parquet_bytes as f64,
        total_vol,
        total_delta,
        peak_rss_mb,
        vault_manifest_sha256,
        day_bounds,
    })
}

/// Benchmark 2: Full 100M-tick streaming sequential replay (bounded memory, zero full load).
pub fn replay_100m_streaming(vault_root: &Path) -> Result<ReplayBenchReport, String> {
    let db_path = vault_root.join("catalog.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT file_path FROM partitions ORDER BY min_ts_ns ASC")
        .map_err(|e| e.to_string())?;
    let files: Vec<PathBuf> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .map(|r| PathBuf::from(r.unwrap()))
        .collect();

    let mut total_ticks: u64 = 0;
    let mut total_vol: i128 = 0;
    let mut total_delta: i128 = 0;
    let mut minute_bars_seen: u64 = 0;
    let mut last_bar_bucket: i64 = -1;
    let mut checksum: u64 = 0xCBF2_9CE4_8422_2325;
    let mut max_rss_during_replay: f64 = 0.0;

    let t_start = Instant::now();
    for path in &files {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let reader = ParquetRecordBatchReaderBuilder::try_new(file)
            .map_err(|e| e.to_string())?
            .with_batch_size(65_536)
            .build()
            .map_err(|e| e.to_string())?;

        for batch_res in reader {
            let batch = batch_res.map_err(|e| e.to_string())?;
            let ts_arr = batch
                .column(0)
                .as_any()
                .downcast_ref::<Int64Array>()
                .unwrap();
            let px_arr = batch
                .column(1)
                .as_any()
                .downcast_ref::<Int64Array>()
                .unwrap();
            let qty_arr = batch
                .column(2)
                .as_any()
                .downcast_ref::<Int64Array>()
                .unwrap();
            let side_arr = batch
                .column(3)
                .as_any()
                .downcast_ref::<UInt8Array>()
                .unwrap();
            let flags_arr = batch
                .column(4)
                .as_any()
                .downcast_ref::<UInt8Array>()
                .unwrap();

            let ts = ts_arr.values();
            let px = px_arr.values();
            let qty = qty_arr.values();
            let side = side_arr.values();
            let flags = flags_arr.values();

            let n = batch.num_rows();
            for i in 0..n {
                let t = ts[i];
                let q = qty[i] as i128;
                let s = side[i];
                total_vol += q;
                if s == 1 {
                    total_delta += q;
                } else {
                    total_delta -= q;
                }
                let bar_b = t / 60_000_000_000;
                if bar_b != last_bar_bucket {
                    minute_bars_seen += 1;
                    last_bar_bucket = bar_b;
                }
                checksum = checksum.wrapping_mul(0x100000001b3)
                    ^ ((px[i] as u64).wrapping_add(flags[i] as u64));
            }
            total_ticks += n as u64;
        }
        let (cur_rss, _) = rss_stats_mb();
        if cur_rss > max_rss_during_replay {
            max_rss_during_replay = cur_rss;
        }
    }
    let wall_secs = t_start.elapsed().as_secs_f64();
    let (current_rss_mb, peak_rss_mb) = rss_stats_mb();

    Ok(ReplayBenchReport {
        total_ticks,
        wall_secs,
        ticks_per_sec: total_ticks as f64 / wall_secs,
        total_vol,
        total_delta,
        minute_bars_seen,
        current_rss_mb: max_rss_during_replay.max(current_rss_mb),
        peak_rss_mb,
        stream_digest_hex: format!("{checksum:016x}"),
    })
}

/// Executes a single random 1-hour time-range seek via SQLite WAL partition lookup +
/// Parquet row-group min/max pruning + exact 1-minute FootprintBar reconstruction.
fn execute_range_seek(
    conn: &Connection,
    t_start: i64,
    t_end: i64,
    bypass_os_cache: bool,
) -> Result<(u64, usize, usize, usize, bool), String> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT file_path FROM partitions WHERE max_ts_ns >= ?1 AND min_ts_ns <= ?2 ORDER BY min_ts_ns ASC",
        )
        .map_err(|e| e.to_string())?;

    let paths: Vec<String> = stmt
        .query_map(params![t_start, t_end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    let mut matched_ticks: u64 = 0;
    let mut total_rgs = 0usize;
    let mut read_rgs = 0usize;
    let mut nocache_ok = true;
    let mut fp = FootprintBuilder::new(60_000_000_000, 1);

    for p in paths {
        let file = File::open(&p).map_err(|e| e.to_string())?;
        if bypass_os_cache {
            nocache_ok &= set_file_nocache(&file);
        }
        let builder = ParquetRecordBatchReaderBuilder::try_new(file).map_err(|e| e.to_string())?;
        let meta = builder.metadata();
        let num_rgs = meta.num_row_groups();
        total_rgs += num_rgs;

        let mut selected = Vec::new();
        for rg_idx in 0..num_rgs {
            let rg = meta.row_group(rg_idx);
            let keep = match rg.column(0).statistics() {
                Some(Statistics::Int64(s)) => {
                    let rg_min = s.min_opt().copied().unwrap_or(i64::MIN);
                    let rg_max = s.max_opt().copied().unwrap_or(i64::MAX);
                    rg_max >= t_start && rg_min <= t_end
                }
                _ => true,
            };
            if keep {
                selected.push(rg_idx);
            }
        }
        read_rgs += selected.len();
        if selected.is_empty() {
            continue;
        }

        let reader = builder
            .with_row_groups(selected)
            .with_batch_size(32_768)
            .build()
            .map_err(|e| e.to_string())?;

        for batch_res in reader {
            let batch = batch_res.map_err(|e| e.to_string())?;
            let ts = batch.column(0).as_any().downcast_ref::<Int64Array>().unwrap().values();
            let px = batch.column(1).as_any().downcast_ref::<Int64Array>().unwrap().values();
            let qty = batch.column(2).as_any().downcast_ref::<Int64Array>().unwrap().values();
            let side = batch.column(3).as_any().downcast_ref::<UInt8Array>().unwrap().values();
            let flags = batch.column(4).as_any().downcast_ref::<UInt8Array>().unwrap().values();

            for i in 0..batch.num_rows() {
                let t = ts[i];
                if t >= t_start && t < t_end {
                    fp.ingest(&TickEvent {
                        ts_event: t,
                        price_fp: px[i],
                        qty_fp: qty[i],
                        aggressor_side: side[i],
                        flags: flags[i],
                        _pad: [0; 6],
                    });
                    matched_ticks += 1;
                }
            }
        }
    }
    fp.flush();
    fp.assert_zero_drift()?;

    Ok((matched_ticks, fp.completed.len(), total_rgs, read_rgs, nocache_ok))
}

/// Benchmark 3: Random 1-hour time-range seeks (Cold via macOS F_NOCACHE + Warm page cache).
pub fn benchmark_random_seeks(
    vault_root: &Path,
    day_bounds: &[(u32, i64, i64)],
    num_seeks: usize,
) -> Result<SeekBenchReport, String> {
    let db_path = vault_root.join("catalog.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Deterministic pseudo-random 1-hour windows spanning all 20 days
    let one_hour_ns: i64 = 3_600 * 1_000_000_000;
    let mut windows = Vec::with_capacity(num_seeks);
    let mut state: u64 = 0xDEAD_BEEF_2026_1124;
    for _ in 0..num_seeks {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        let day_i = (state as usize) % day_bounds.len();
        let (_, d_min, d_max) = day_bounds[day_i];
        let span = (d_max - d_min - one_hour_ns).max(1) as u64;
        let offset = (state.wrapping_mul(0x9E37_79B9_7F4A_7C15) % span) as i64;
        let t0 = d_min + offset;
        windows.push((t0, t0 + one_hour_ns));
    }

    // Cold Pass (F_NOCACHE=1 on macOS -> bypasses UBC page cache for real SSD read latency)
    let mut cold_ns = Vec::with_capacity(num_seeks);
    let mut total_ticks_sum: u64 = 0;
    let mut total_bars_sum: usize = 0;
    let mut rg_total_sum = 0usize;
    let mut rg_read_sum = 0usize;
    let mut cold_nocache_enabled = true;

    for &(t0, t1) in &windows {
        let start = Instant::now();
        let (ticks, bars, rgt, rgr, nc) = execute_range_seek(&conn, t0, t1, true)?;
        cold_ns.push(start.elapsed().as_nanos() as u64);
        total_ticks_sum += ticks;
        total_bars_sum += bars;
        rg_total_sum += rgt;
        rg_read_sum += rgr;
        cold_nocache_enabled &= nc;
    }

    // Warm Pass (page cache warm — prime once, then measure all windows)
    for &(t0, t1) in &windows {
        let _ = execute_range_seek(&conn, t0, t1, false)?;
    }
    let mut warm_ns = Vec::with_capacity(num_seeks);
    for &(t0, t1) in &windows {
        let start = Instant::now();
        let _ = execute_range_seek(&conn, t0, t1, false)?;
        warm_ns.push(start.elapsed().as_nanos() as u64);
    }

    let cold_stats = compute_latency_stats(&mut cold_ns);
    let warm_stats = compute_latency_stats(&mut warm_ns);
    // Note: total row groups across the entire 100M-tick vault = 20 * 25 = 500 per query.
    // SQLite partition pruning narrows 20 files (500 RGs) -> 1 file (25 RGs), then Parquet min/max narrows 25 -> ~2 RGs!
    let total_vault_rgs = num_seeks * (NUM_DAYS as usize) * (TICKS_PER_DAY / ROW_GROUP_SIZE);
    let pruning_pct = (1.0 - (rg_read_sum as f64 / total_vault_rgs as f64)) * 100.0;

    Ok(SeekBenchReport {
        num_seeks,
        avg_ticks_per_1h: total_ticks_sum as f64 / num_seeks as f64,
        avg_bars_per_1h: total_bars_sum as f64 / num_seeks as f64,
        row_groups_total: rg_total_sum,
        row_groups_read: rg_read_sum,
        pruning_pct,
        cold_nocache_enabled,
        cold_ms: cold_stats,
        warm_ms: warm_stats,
    })
}

/// R07 Determinism Gate: Replay Day 1 (5M ticks) twice independently and assert 100% SHA-256 identity
/// of all finalized Footprint bars, POCs, Value Areas, and VWAP numerators.
pub fn verify_deterministic_replay_sha256(vault_root: &Path) -> Result<(bool, String, usize), String> {
    let day1_path = vault_root.join(
        "market_data/schema=trades/venue=GLBX/symbol=ES/year=2026/month=11/day=01/part-000.parquet",
    );

    let run_once = || -> Result<(String, usize), String> {
        let file = File::open(&day1_path).map_err(|e| e.to_string())?;
        let reader = ParquetRecordBatchReaderBuilder::try_new(file)
            .map_err(|e| e.to_string())?
            .with_batch_size(65_536)
            .build()
            .map_err(|e| e.to_string())?;

        let mut fp = FootprintBuilder::new(60_000_000_000, 1);
        for batch_res in reader {
            let batch = batch_res.map_err(|e| e.to_string())?;
            let ts = batch.column(0).as_any().downcast_ref::<Int64Array>().unwrap().values();
            let px = batch.column(1).as_any().downcast_ref::<Int64Array>().unwrap().values();
            let qty = batch.column(2).as_any().downcast_ref::<Int64Array>().unwrap().values();
            let side = batch.column(3).as_any().downcast_ref::<UInt8Array>().unwrap().values();
            let flags = batch.column(4).as_any().downcast_ref::<UInt8Array>().unwrap().values();

            for i in 0..batch.num_rows() {
                fp.ingest(&TickEvent {
                    ts_event: ts[i],
                    price_fp: px[i],
                    qty_fp: qty[i],
                    aggressor_side: side[i],
                    flags: flags[i],
                    _pad: [0; 6],
                });
            }
        }
        fp.flush();
        fp.assert_zero_drift()?;

        let mut hasher = Sha256::new();
        for b in &fp.completed {
            hasher.update(b.bar_ts_open_ns.to_le_bytes());
            hasher.update(b.total_vol.to_le_bytes());
            hasher.update(b.delta.to_le_bytes());
            hasher.update(b.vwap_num_i128.to_le_bytes());
            hasher.update(b.poc_offset.to_le_bytes());
            hasher.update(b.vah_offset.to_le_bytes());
            hasher.update(b.val_offset.to_le_bytes());
            for c in &b.cells {
                hasher.update(c.bid_vol.to_le_bytes());
                hasher.update(c.ask_vol.to_le_bytes());
                hasher.update(c.flags.to_le_bytes());
            }
        }
        let hex = hasher
            .finalize()
            .iter()
            .map(|x| format!("{x:02x}"))
            .collect::<String>();
        Ok((hex, fp.completed.len()))
    };

    let (h1, n1) = run_once()?;
    let (h2, n2) = run_once()?;
    Ok((h1 == h2 && n1 == n2, h1, n1))
}
