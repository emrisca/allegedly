//! Local Tick-Vault (`.atvault`) — open, self-describing, Zstd-compressed
//! binary persistence with `ProvenanceHeader` metadata and CRC32 integrity checks.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::model::{
    AggressorSide, AggressorSource, NormalizedTick, ProvenanceHeader, Venue,
};

const MAGIC_START: &[u8; 8] = b"ALGDTV01";
const MAGIC_END: &[u8; 8] = b"TVEND001";
const FORMAT_VERSION: u16 = 1;
pub const RECORD_SIZE_BYTES: usize = 72;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultHeader {
    pub format_version: u16,
    pub scale_decimals: u8,
    pub record_size_bytes: usize,
    pub provenance: Vec<ProvenanceHeader>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRoundTripReport {
    pub path: String,
    pub tick_count: u64,
    pub raw_bytes: u64,
    pub compressed_file_bytes: u64,
    pub bytes_per_tick_raw: f64,
    pub bytes_per_tick_compressed: f64,
    pub compression_ratio: f64,
    pub write_ms: f64,
    pub write_ticks_per_sec: f64,
    pub read_ms: f64,
    pub read_ticks_per_sec: f64,
    pub lost_ticks: u64,
    pub field_mismatches: u64,
    pub crc_verified: bool,
    pub monotonic_per_stream_seq: bool,
    pub non_monotonic_exchange_ts_count: u64,
}

fn encode_tick(t: &NormalizedTick, buf: &mut [u8; RECORD_SIZE_BYTES]) {
    buf[0..8].copy_from_slice(&t.ts_exchange_ns.to_le_bytes());
    buf[8..16].copy_from_slice(&t.ts_recv_ns.to_le_bytes());
    buf[16..24].copy_from_slice(&t.price_e9.to_le_bytes());
    buf[24..32].copy_from_slice(&t.qty_e9.to_le_bytes());
    buf[32..40].copy_from_slice(&t.trade_id.to_le_bytes());
    buf[40..48].copy_from_slice(&t.seq.to_le_bytes());
    buf[48..56].copy_from_slice(&t.best_bid_e9.to_le_bytes());
    buf[56..64].copy_from_slice(&t.best_ask_e9.to_le_bytes());
    buf[64..66].copy_from_slice(&t.symbol_id.to_le_bytes());
    buf[66] = t.venue as u8;
    buf[67] = t.aggressor_side as u8;
    buf[68] = t.aggressor_source as u8;
    buf[69] = 0;
    buf[70] = 0;
    buf[71] = 0;
}

fn decode_tick(buf: &[u8; RECORD_SIZE_BYTES]) -> NormalizedTick {
    NormalizedTick {
        ts_exchange_ns: i64::from_le_bytes(buf[0..8].try_into().unwrap()),
        ts_recv_ns: i64::from_le_bytes(buf[8..16].try_into().unwrap()),
        price_e9: i64::from_le_bytes(buf[16..24].try_into().unwrap()),
        qty_e9: i64::from_le_bytes(buf[24..32].try_into().unwrap()),
        trade_id: u64::from_le_bytes(buf[32..40].try_into().unwrap()),
        seq: u64::from_le_bytes(buf[40..48].try_into().unwrap()),
        best_bid_e9: i64::from_le_bytes(buf[48..56].try_into().unwrap()),
        best_ask_e9: i64::from_le_bytes(buf[56..64].try_into().unwrap()),
        symbol_id: u16::from_le_bytes(buf[64..66].try_into().unwrap()),
        venue: Venue::from_u8(buf[66]),
        aggressor_side: AggressorSide::from_u8(buf[67]),
        aggressor_source: AggressorSource::from_u8(buf[68]),
    }
}

pub fn write_vault(
    path: &Path,
    provenance: Vec<ProvenanceHeader>,
    ticks: &[NormalizedTick],
    zstd_level: i32,
) -> std::io::Result<u64> {
    let header = VaultHeader {
        format_version: FORMAT_VERSION,
        scale_decimals: 9,
        record_size_bytes: RECORD_SIZE_BYTES,
        provenance,
    };
    let header_json = serde_json::to_vec(&header)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let mut file = File::create(path)?;
    file.write_all(MAGIC_START)?;
    file.write_all(&FORMAT_VERSION.to_le_bytes())?;
    file.write_all(&(header_json.len() as u32).to_le_bytes())?;
    file.write_all(&header_json)?;

    // Placeholder for compressed payload byte length
    let compressed_len_pos = file.stream_position()?;
    file.write_all(&0_u64.to_le_bytes())?;
    let payload_start = file.stream_position()?;

    let mut hasher = crc32fast::Hasher::new();
    let mut rec_buf = [0_u8; RECORD_SIZE_BYTES];
    {
        let bw = BufWriter::with_capacity(64 * 1024, &mut file);
        let mut enc = zstd::stream::write::Encoder::new(bw, zstd_level)?;
        for tick in ticks {
            encode_tick(tick, &mut rec_buf);
            hasher.update(&rec_buf);
            enc.write_all(&rec_buf)?;
        }
        let mut bw = enc.finish()?;
        bw.flush()?;
    }

    let payload_end = file.stream_position()?;
    let compressed_len = payload_end - payload_start;
    let raw_crc = hasher.finalize();

    // Trailer: record_count + raw_crc32 + end magic
    file.write_all(&(ticks.len() as u64).to_le_bytes())?;
    file.write_all(&raw_crc.to_le_bytes())?;
    file.write_all(MAGIC_END)?;
    let total_file_len = file.stream_position()?;

    // Patch compressed_len
    file.seek(SeekFrom::Start(compressed_len_pos))?;
    file.write_all(&compressed_len.to_le_bytes())?;
    file.sync_all()?;

    Ok(total_file_len)
}

pub fn read_vault(path: &Path) -> std::io::Result<(VaultHeader, Vec<NormalizedTick>, bool)> {
    let mut file = File::open(path)?;

    let mut magic = [0_u8; 8];
    file.read_exact(&mut magic)?;
    if &magic != MAGIC_START {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "invalid vault start magic",
        ));
    }

    let mut ver_bytes = [0_u8; 2];
    file.read_exact(&mut ver_bytes)?;
    let version = u16::from_le_bytes(ver_bytes);
    if version != FORMAT_VERSION {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("unsupported vault version {version}"),
        ));
    }

    let mut hlen_bytes = [0_u8; 4];
    file.read_exact(&mut hlen_bytes)?;
    let hlen = u32::from_le_bytes(hlen_bytes) as usize;
    let mut header_bytes = vec![0_u8; hlen];
    file.read_exact(&mut header_bytes)?;
    let header: VaultHeader = serde_json::from_slice(&header_bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let mut clen_bytes = [0_u8; 8];
    file.read_exact(&mut clen_bytes)?;
    let compressed_len = u64::from_le_bytes(clen_bytes);

    let payload_start = file.stream_position()?;
    file.seek(SeekFrom::Start(payload_start + compressed_len))?;

    let mut count_bytes = [0_u8; 8];
    file.read_exact(&mut count_bytes)?;
    let expected_count = u64::from_le_bytes(count_bytes) as usize;

    let mut crc_bytes = [0_u8; 4];
    file.read_exact(&mut crc_bytes)?;
    let expected_crc = u32::from_le_bytes(crc_bytes);

    let mut end_magic = [0_u8; 8];
    file.read_exact(&mut end_magic)?;
    if &end_magic != MAGIC_END {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "invalid vault end magic",
        ));
    }

    // Rewind to compressed payload and stream-decode
    file.seek(SeekFrom::Start(payload_start))?;
    let limited = file.take(compressed_len);
    let br = BufReader::with_capacity(64 * 1024, limited);
    let mut dec = zstd::stream::read::Decoder::new(br)?;

    let mut ticks = Vec::with_capacity(expected_count);
    let mut hasher = crc32fast::Hasher::new();
    let mut rec_buf = [0_u8; RECORD_SIZE_BYTES];
    for _ in 0..expected_count {
        dec.read_exact(&mut rec_buf)?;
        hasher.update(&rec_buf);
        ticks.push(decode_tick(&rec_buf));
    }
    let computed_crc = hasher.finalize();

    Ok((header, ticks, computed_crc == expected_crc))
}

pub fn roundtrip_verify_and_benchmark(
    path: &Path,
    provenance: Vec<ProvenanceHeader>,
    ticks: &[NormalizedTick],
    zstd_level: i32,
) -> std::io::Result<VaultRoundTripReport> {
    let t0 = Instant::now();
    let file_bytes = write_vault(path, provenance, ticks, zstd_level)?;
    let write_secs = t0.elapsed().as_secs_f64();

    let t1 = Instant::now();
    let (_header, decoded, crc_ok) = read_vault(path)?;
    let read_secs = t1.elapsed().as_secs_f64();

    let lost_ticks = (ticks.len() as i64 - decoded.len() as i64).unsigned_abs();
    let mut field_mismatches = 0_u64;
    for (a, b) in ticks.iter().zip(decoded.iter()) {
        if a != b {
            field_mismatches += 1;
        }
    }

    // Check per-symbol monotonic sequence numbers and exchange timestamp order
    let mut last_seq: HashMap<u16, u64> = HashMap::new();
    let mut last_ts: HashMap<u16, i64> = HashMap::new();
    let mut monotonic_seq = true;
    let mut non_mono_ts = 0_u64;
    for t in &decoded {
        if let Some(&prev_seq) = last_seq.get(&t.symbol_id)
            && t.seq < prev_seq
        {
            monotonic_seq = false;
        }
        last_seq.insert(t.symbol_id, t.seq);

        if let Some(&prev_ts) = last_ts.get(&t.symbol_id)
            && t.ts_exchange_ns < prev_ts
        {
            non_mono_ts += 1;
        }
        last_ts.insert(t.symbol_id, t.ts_exchange_ns);
    }

    let n = ticks.len() as f64;
    let raw_bytes = (ticks.len() * RECORD_SIZE_BYTES) as u64;
    Ok(VaultRoundTripReport {
        path: path.display().to_string(),
        tick_count: ticks.len() as u64,
        raw_bytes,
        compressed_file_bytes: file_bytes,
        bytes_per_tick_raw: if n > 0.0 { raw_bytes as f64 / n } else { 0.0 },
        bytes_per_tick_compressed: if n > 0.0 { file_bytes as f64 / n } else { 0.0 },
        compression_ratio: if file_bytes > 0 {
            raw_bytes as f64 / file_bytes as f64
        } else {
            0.0
        },
        write_ms: write_secs * 1000.0,
        write_ticks_per_sec: if write_secs > 0.0 { n / write_secs } else { 0.0 },
        read_ms: read_secs * 1000.0,
        read_ticks_per_sec: if read_secs > 0.0 { n / read_secs } else { 0.0 },
        lost_ticks,
        field_mismatches,
        crc_verified: crc_ok,
        monotonic_per_stream_seq: monotonic_seq,
        non_monotonic_exchange_ts_count: non_mono_ts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{SYM_KRAKEN_BTC_USD, Timeliness, VenueCoverage};

    #[test]
    fn vault_roundtrip_zero_loss() {
        let dir = std::path::PathBuf::from("/tmp/allegedly-s05-bench");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("unit_test_vault.atvault");

        let ticks: Vec<NormalizedTick> = (0..2_000_u64)
            .map(|i| NormalizedTick {
                ts_exchange_ns: 1_795_570_000_000_000_000 + (i as i64) * 1_000_000,
                ts_recv_ns: 1_795_570_000_000_500_000 + (i as i64) * 1_000_000,
                price_e9: 59_318_200_000_000 + ((i % 10) as i64) * 100_000_000,
                qty_e9: 15_000_000,
                trade_id: 100_000 + i,
                seq: i + 1,
                best_bid_e9: 59_318_100_000_000,
                best_ask_e9: 59_318_200_000_000,
                symbol_id: SYM_KRAKEN_BTC_USD,
                venue: Venue::KrakenSpot,
                aggressor_side: if i % 2 == 0 {
                    AggressorSide::Buy
                } else {
                    AggressorSide::Sell
                },
                aggressor_source: AggressorSource::ExchangeReported,
            })
            .collect();

        let prov = vec![ProvenanceHeader {
            venue: Venue::KrakenSpot,
            symbol: "BTC/USD".into(),
            symbol_id: SYM_KRAKEN_BTC_USD,
            coverage: VenueCoverage::FullVenue,
            timeliness: Timeliness::RealTime,
            delay_seconds: 0,
            aggressor_source: AggressorSource::ExchangeReported,
            scale_decimals: 9,
            recorded_at_ns: 1_795_570_000_000_000_000,
        }];

        let report = roundtrip_verify_and_benchmark(&path, prov, &ticks, 3).unwrap();
        assert_eq!(report.lost_ticks, 0);
        assert_eq!(report.field_mismatches, 0);
        assert!(report.crc_verified);
        assert!(report.monotonic_per_stream_seq);
    }
}
