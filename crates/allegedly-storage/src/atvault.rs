use allegedly_core::NormalizedTick;
use crc32fast::Hasher;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use thiserror::Error;

pub const ATVAULT_MAGIC: [u8; 4] = *b"ATVL";
pub const TICK_WIRE_BYTES: usize = 72;
/// Hard per-block caps preventing untrusted/corrupted headers from triggering OOM aborts (RTSD-12).
pub const MAX_BLOCK_TICKS: usize = 1_000_000;
pub const MAX_BLOCK_COMP_BYTES: usize = 128 * 1024 * 1024;

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
    #[error("corrupt .atvault block exceeds safety cap: count={count}, comp_len={comp_len}")]
    BlockLimitExceeded { count: usize, comp_len: usize },
    #[error("corrupt .atvault block payload: {0}")]
    CorruptBlock(String),
    #[error("parquet schema mismatch: {0}")]
    SchemaMismatch(String),
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

fn decode_tick(chunk: &[u8; TICK_WIRE_BYTES]) -> NormalizedTick {
    NormalizedTick {
        ts_exchange_ns: i64::from_le_bytes([
            chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7],
        ]),
        ts_recv_ns: i64::from_le_bytes([
            chunk[8], chunk[9], chunk[10], chunk[11], chunk[12], chunk[13], chunk[14], chunk[15],
        ]),
        instrument_id: u32::from_le_bytes([chunk[16], chunk[17], chunk[18], chunk[19]]),
        flags: u32::from_le_bytes([chunk[20], chunk[21], chunk[22], chunk[23]]),
        seq: u64::from_le_bytes([
            chunk[24], chunk[25], chunk[26], chunk[27], chunk[28], chunk[29], chunk[30], chunk[31],
        ]),
        price_e9: i64::from_le_bytes([
            chunk[32], chunk[33], chunk[34], chunk[35], chunk[36], chunk[37], chunk[38], chunk[39],
        ]),
        qty_e9: i64::from_le_bytes([
            chunk[40], chunk[41], chunk[42], chunk[43], chunk[44], chunk[45], chunk[46], chunk[47],
        ]),
        bid_e9: i64::from_le_bytes([
            chunk[48], chunk[49], chunk[50], chunk[51], chunk[52], chunk[53], chunk[54], chunk[55],
        ]),
        ask_e9: i64::from_le_bytes([
            chunk[56], chunk[57], chunk[58], chunk[59], chunk[60], chunk[61], chunk[62], chunk[63],
        ]),
        side: chunk[64],
        provenance_tier: chunk[65],
        provenance_modifiers: chunk[66],
        _pad: [0; 5],
    }
}

fn compute_block_crc(count: u32, comp_len: u32, compressed: &[u8]) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(&count.to_le_bytes());
    hasher.update(&comp_len.to_le_bytes());
    hasher.update(compressed);
    hasher.finalize()
}

/// Append a Zstd-3 compressed, CRC32-authenticated block (covering header + payload) into an `.atvault` segment.
pub fn append_atvault_block(path: &Path, ticks: &[NormalizedTick]) -> Result<usize, StorageError> {
    if ticks.len() > MAX_BLOCK_TICKS {
        return Err(StorageError::BlockLimitExceeded {
            count: ticks.len(),
            comp_len: 0,
        });
    }
    let mut raw = Vec::with_capacity(ticks.len() * TICK_WIRE_BYTES);
    for t in ticks {
        encode_tick(&mut raw, t);
    }
    let compressed = zstd::bulk::compress(&raw, 3)?;
    if compressed.len() > MAX_BLOCK_COMP_BYTES {
        return Err(StorageError::BlockLimitExceeded {
            count: ticks.len(),
            comp_len: compressed.len(),
        });
    }
    let count_u32 = ticks.len() as u32;
    let comp_len_u32 = compressed.len() as u32;
    let crc = compute_block_crc(count_u32, comp_len_u32, &compressed);

    // Avoid TOCTOU race: open handle first, then inspect file length on the open descriptor.
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    if file.metadata()?.len() == 0 {
        file.write_all(&ATVAULT_MAGIC)?;
    }
    file.write_all(&count_u32.to_le_bytes())?;
    file.write_all(&comp_len_u32.to_le_bytes())?;
    file.write_all(&crc.to_le_bytes())?;
    file.write_all(&compressed)?;
    file.sync_data()?;
    Ok(compressed.len())
}

/// Streaming block-by-block `.atvault` reader preventing full-dataset RAM blowups (RTSD-04 / RTSD-12).
pub struct AtVaultBlockReader {
    file: File,
}

impl AtVaultBlockReader {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let mut file = File::open(path)?;
        let mut magic = [0u8; 4];
        if file.read_exact(&mut magic).is_err() || magic != ATVAULT_MAGIC {
            return Err(StorageError::InvalidMagic);
        }
        Ok(Self { file })
    }

    /// Read the next authenticated block of ticks. Returns `Ok(None)` at EOF or clean truncated crash tail.
    pub fn next_block(&mut self) -> Result<Option<Vec<NormalizedTick>>, StorageError> {
        let mut hdr = [0u8; 12];
        let mut filled = 0usize;
        while filled < 12 {
            let n = self.file.read(&mut hdr[filled..])?;
            if n == 0 {
                return Ok(None);
            }
            filled += n;
        }
        let count_u32 = u32::from_le_bytes([hdr[0], hdr[1], hdr[2], hdr[3]]);
        let comp_len_u32 = u32::from_le_bytes([hdr[4], hdr[5], hdr[6], hdr[7]]);
        let expected_crc = u32::from_le_bytes([hdr[8], hdr[9], hdr[10], hdr[11]]);
        let count = count_u32 as usize;
        let comp_len = comp_len_u32 as usize;

        if count > MAX_BLOCK_TICKS || comp_len > MAX_BLOCK_COMP_BYTES {
            return Err(StorageError::BlockLimitExceeded { count, comp_len });
        }

        let mut comp = vec![0u8; comp_len];
        let mut comp_read = 0usize;
        while comp_read < comp_len {
            let n = self.file.read(&mut comp[comp_read..])?;
            if n == 0 {
                // Incomplete crash tail: stop cleanly at last complete block.
                return Ok(None);
            }
            comp_read += n;
        }

        let actual_crc = compute_block_crc(count_u32, comp_len_u32, &comp);
        if actual_crc != expected_crc {
            return Err(StorageError::ChecksumMismatch {
                expected: expected_crc,
                actual: actual_crc,
            });
        }

        let expected_raw_len = count
            .checked_mul(TICK_WIRE_BYTES)
            .ok_or(StorageError::BlockLimitExceeded { count, comp_len })?;
        let raw = zstd::bulk::decompress(&comp, expected_raw_len)?;
        if raw.len() != expected_raw_len {
            return Err(StorageError::CorruptBlock(format!(
                "decompressed byte length {} != expected {}",
                raw.len(),
                expected_raw_len
            )));
        }

        let (chunks, rem) = raw.as_chunks::<TICK_WIRE_BYTES>();
        if !rem.is_empty() {
            return Err(StorageError::CorruptBlock(format!(
                "non-zero trailing tick bytes: {}",
                rem.len()
            )));
        }
        let mut out = Vec::with_capacity(count);
        for chunk in chunks {
            out.push(decode_tick(chunk));
        }
        Ok(Some(out))
    }
}

/// Read all intact blocks from an .atvault segment, safely tolerating an incomplete crash-tail block.
pub fn read_atvault_segment(path: &Path) -> Result<Vec<NormalizedTick>, StorageError> {
    let mut reader = AtVaultBlockReader::open(path)?;
    let mut ticks = Vec::new();
    while let Some(block) = reader.next_block()? {
        ticks.extend(block);
    }
    Ok(ticks)
}
