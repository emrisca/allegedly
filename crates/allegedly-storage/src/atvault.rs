use allegedly_core::NormalizedTick;
use crc32fast::Hasher;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use thiserror::Error;

pub const ATVAULT_MAGIC: [u8; 4] = *b"ATVL";
pub const TICK_WIRE_BYTES: usize = 72;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Arrow error: {0}")]
    Arrow(#[from] arrow::error::ArrowError),
    #[error("Parquet error: {0}")]
    Parquet(#[from] parquet::errors::ParquetError),
    #[error("corrupt .atvault magic header")]
    InvalidMagic,
    #[error("corrupt .atvault block checksum: expected 0x{expected:08X}, got 0x{actual:08X}")]
    ChecksumMismatch { expected: u32, actual: u32 },
}

fn encode_tick(buf: &mut Vec<u8>, t: &NormalizedTick) {
    buf.extend_from_slice(&t.ts_exchange_ns.to_le_bytes());
    buf.extend_from_slice(&t.ts_recv_ns.to_le_bytes());
    buf.extend_from_slice(&t.instrument_id.to_le_bytes());
    buf.extend_from_slice(&t.flags.to_le_bytes());
    buf.extend_from_slice(&t.seq.to_le_bytes());
    buf.extend_from_slice(&t.price_e9.to_le_bytes());
    buf.extend_from_slice(&t.qty_e9.to_le_bytes());
    buf.extend_from_slice(&t.bid_e9.to_le_bytes());
    buf.extend_from_slice(&t.ask_e9.to_le_bytes());
    buf.push(t.side);
    buf.push(t.provenance_tier);
    buf.push(t.provenance_modifiers);
    buf.extend_from_slice(&[0u8; 5]);
}

fn decode_tick(chunk: &[u8]) -> NormalizedTick {
    NormalizedTick {
        ts_exchange_ns: i64::from_le_bytes(chunk[0..8].try_into().unwrap()),
        ts_recv_ns: i64::from_le_bytes(chunk[8..16].try_into().unwrap()),
        instrument_id: u32::from_le_bytes(chunk[16..20].try_into().unwrap()),
        flags: u32::from_le_bytes(chunk[20..24].try_into().unwrap()),
        seq: u64::from_le_bytes(chunk[24..32].try_into().unwrap()),
        price_e9: i64::from_le_bytes(chunk[32..40].try_into().unwrap()),
        qty_e9: i64::from_le_bytes(chunk[40..48].try_into().unwrap()),
        bid_e9: i64::from_le_bytes(chunk[48..56].try_into().unwrap()),
        ask_e9: i64::from_le_bytes(chunk[56..64].try_into().unwrap()),
        side: chunk[64],
        provenance_tier: chunk[65],
        provenance_modifiers: chunk[66],
        _pad: [0; 5],
    }
}

/// Append a Zstd-3 compressed, CRC32-verified block of NormalizedTicks into an .atvault segment file.
pub fn append_atvault_block(path: &Path, ticks: &[NormalizedTick]) -> Result<usize, StorageError> {
    let mut raw = Vec::with_capacity(ticks.len() * TICK_WIRE_BYTES);
    for t in ticks {
        encode_tick(&mut raw, t);
    }
    let compressed = zstd::bulk::compress(&raw, 3)?;
    let mut hasher = Hasher::new();
    hasher.update(&compressed);
    let crc = hasher.finalize();

    let exists = path.exists() && path.metadata()?.len() > 0;
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    if !exists {
        file.write_all(&ATVAULT_MAGIC)?;
    }
    file.write_all(&(ticks.len() as u32).to_le_bytes())?;
    file.write_all(&(compressed.len() as u32).to_le_bytes())?;
    file.write_all(&crc.to_le_bytes())?;
    file.write_all(&compressed)?;
    file.sync_data()?;
    Ok(compressed.len())
}

/// Read all intact blocks from an .atvault segment, safely tolerating an incomplete crash-tail block.
pub fn read_atvault_segment(path: &Path) -> Result<Vec<NormalizedTick>, StorageError> {
    let mut file = File::open(path)?;
    let mut all = Vec::new();
    file.read_to_end(&mut all)?;
    if all.len() < 4 || all[0..4] != ATVAULT_MAGIC {
        return Err(StorageError::InvalidMagic);
    }
    let mut cursor = 4usize;
    let mut ticks = Vec::new();
    while cursor + 12 <= all.len() {
        let count = u32::from_le_bytes(all[cursor..cursor + 4].try_into().unwrap()) as usize;
        let comp_len = u32::from_le_bytes(all[cursor + 4..cursor + 8].try_into().unwrap()) as usize;
        let expected_crc = u32::from_le_bytes(all[cursor + 8..cursor + 12].try_into().unwrap());
        cursor += 12;
        if cursor + comp_len > all.len() {
            // Truncated crash tail: stop cleanly at last complete block.
            break;
        }
        let comp_slice = &all[cursor..cursor + comp_len];
        cursor += comp_len;
        let mut hasher = Hasher::new();
        hasher.update(comp_slice);
        let actual_crc = hasher.finalize();
        if actual_crc != expected_crc {
            return Err(StorageError::ChecksumMismatch {
                expected: expected_crc,
                actual: actual_crc,
            });
        }
        let raw = zstd::bulk::decompress(comp_slice, count * TICK_WIRE_BYTES)?;
        for chunk in raw.as_chunks::<TICK_WIRE_BYTES>().0 {
            ticks.push(decode_tick(chunk));
        }
    }
    Ok(ticks)
}
