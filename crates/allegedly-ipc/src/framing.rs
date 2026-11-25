use allegedly_core::{BookState, ProvenanceModifiers, ProvenanceTier};
use std::mem::{offset_of, size_of};
use thiserror::Error;

pub const MAGIC_ALG2: u32 = 0x414C_4732; // "ALG2"
pub const PROTOCOL_VERSION_V1: u16 = 1;
pub const HEADER_BYTES: usize = 24;

pub const BIT_BUY_IMBAL: u8 = 1 << 0;
pub const BIT_SELL_IMBAL: u8 = 1 << 1;
pub const BIT_POC: u8 = 1 << 2;
pub const BIT_UNFINISHED: u8 = 1 << 3;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum IpcFrameError {
    #[error("buffer too short: expected at least {expected} bytes, got {actual}")]
    Truncated { expected: usize, actual: usize },
    #[error("invalid magic 0x{0:08X} (expected 0x414C4732)")]
    InvalidMagic(u32),
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u16),
    #[error("unknown frame_type 0x{0:04X}")]
    UnknownFrameType(u16),
    #[error("payload length {actual} does not match expected {expected}")]
    PayloadLengthMismatch { expected: usize, actual: usize },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum FrameType {
    OhlcvBarsSoa = 0x0001,
    FootprintSlabSoa = 0x0002,
    VolumeProfileSoa = 0x0003,
    TpoProfileBitmask = 0x0004,
    LiveTradeBatch = 0x0101,
    LiveL2BookBatch = 0x0102,
    LiveBarUpdateBatch = 0x0103,
    LiveFootprintDelta = 0x0104,
    StreamStatusFrame = 0x0201,
}

impl FrameType {
    pub fn from_u16(v: u16) -> Result<Self, IpcFrameError> {
        match v {
            0x0001 => Ok(Self::OhlcvBarsSoa),
            0x0002 => Ok(Self::FootprintSlabSoa),
            0x0003 => Ok(Self::VolumeProfileSoa),
            0x0004 => Ok(Self::TpoProfileBitmask),
            0x0101 => Ok(Self::LiveTradeBatch),
            0x0102 => Ok(Self::LiveL2BookBatch),
            0x0103 => Ok(Self::LiveBarUpdateBatch),
            0x0104 => Ok(Self::LiveFootprintDelta),
            0x0201 => Ok(Self::StreamStatusFrame),
            other => Err(IpcFrameError::UnknownFrameType(other)),
        }
    }
}

/// Exact 24-byte, 8-byte-aligned little-endian frame header (IPC-Contract §3.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(C)]
pub struct FrameHeader {
    pub magic: u32,
    pub version: u16,
    pub frame_type: u16,
    pub stream_id: u32,
    pub record_count: u32,
    pub send_ns: u64,
}

/// Exact 40-byte live trade record with i64 qty_e9 (RT3-01).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct LiveTradeRecord {
    pub seq: u64,
    pub ts_ns: i64,
    pub price_e9: i64,
    pub qty_e9: i64,
    pub flags: u32,
    pub _pad: u32,
}

/// Canonical 32-byte FootprintCell shared across IPC & FootprintSlabArena.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct FootprintCell {
    pub price_tick: i64,
    pub bid_vol_e9: i64,
    pub ask_vol_e9: i64,
    pub trade_count: u32,
    pub imbalance_flags: u8,
    pub _pad: [u8; 3],
}

/// Canonical 24-byte Volume Profile summary header.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct VolumeProfileSummary {
    pub poc_price: i64,
    pub vah_price: i64,
    pub val_price: i64,
}

/// Canonical 24-byte Volume Profile bin.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct VolumeProfileBin {
    pub price_tick: i64,
    pub bid_vol_e9: i64,
    pub ask_vol_e9: i64,
}

/// Canonical 8-byte TPO header + 24-byte u128 TPO row (RT3-10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct TpoHeader {
    pub words_per_row: u16,
    pub period_count: u16,
    pub _pad: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct TpoRow128 {
    pub price_tick: i64,
    pub period_mask: [u64; 2],
}

/// Canonical 16-byte L2 book batch header + 24-byte L2 level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct LiveL2BookHeader {
    pub book_seq: u64,
    pub level_count: u32,
    pub book_state: u8,
    pub is_snapshot: u8,
    pub provenance_tier: u8,
    pub provenance_modifiers: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct LiveL2BookLevel {
    pub price_e9: i64,
    pub qty_e9: i64,
    pub side_action_flags: u32,
    pub order_count: u32,
}

/// Canonical 72-byte live bar update record.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct LiveBarUpdate {
    pub ts_open_ns: i64,
    pub open_tick: i64,
    pub high_tick: i64,
    pub low_tick: i64,
    pub close_tick: i64,
    pub volume_e9: i64,
    pub buy_vol_e9: i64,
    pub sell_vol_e9: i64,
    pub flags: u64,
}

/// Canonical 16-byte aligned STREAM_STATUS_FRAME (RT3-01).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct StreamStatusFrame {
    pub seq: u64,
    pub dropped_total: u32,
    pub reason_code: u16,
    pub book_state: u8,
    pub provenance_tier: u8,
}

// Compile-time layout & offset proofs (T06 / IPC-Contract §3)
const _: () = {
    assert!(size_of::<FrameHeader>() == 24);
    assert!(offset_of!(FrameHeader, magic) == 0);
    assert!(offset_of!(FrameHeader, version) == 4);
    assert!(offset_of!(FrameHeader, frame_type) == 6);
    assert!(offset_of!(FrameHeader, stream_id) == 8);
    assert!(offset_of!(FrameHeader, record_count) == 12);
    assert!(offset_of!(FrameHeader, send_ns) == 16);

    assert!(size_of::<LiveTradeRecord>() == 40);
    assert!(size_of::<FootprintCell>() == 32);
    assert!(size_of::<VolumeProfileSummary>() == 24);
    assert!(size_of::<VolumeProfileBin>() == 24);
    assert!(size_of::<TpoHeader>() == 8);
    assert!(size_of::<TpoRow128>() == 24);
    assert!(size_of::<LiveL2BookHeader>() == 16);
    assert!(size_of::<LiveL2BookLevel>() == 24);
    assert!(size_of::<LiveBarUpdate>() == 72);

    assert!(size_of::<StreamStatusFrame>() == 16);
    assert!(offset_of!(StreamStatusFrame, seq) == 0);
    assert!(offset_of!(StreamStatusFrame, dropped_total) == 8);
    assert!(offset_of!(StreamStatusFrame, reason_code) == 12);
    assert!(offset_of!(StreamStatusFrame, book_state) == 14);
    assert!(offset_of!(StreamStatusFrame, provenance_tier) == 15);
};

pub fn pack_trade_flags(
    side: u8,
    tier: ProvenanceTier,
    modifiers: ProvenanceModifiers,
    out_of_seq: bool,
) -> u32 {
    let mut f = u32::from(side & 0b11);
    f |= u32::from((tier as u8) & 0b111) << 2;
    f |= u32::from(modifiers.0 & 0b111) << 5;
    if out_of_seq {
        f |= 1 << 8;
    }
    f
}

pub fn encode_header(buf: &mut Vec<u8>, hdr: FrameHeader) {
    buf.extend_from_slice(&hdr.magic.to_le_bytes());
    buf.extend_from_slice(&hdr.version.to_le_bytes());
    buf.extend_from_slice(&hdr.frame_type.to_le_bytes());
    buf.extend_from_slice(&hdr.stream_id.to_le_bytes());
    buf.extend_from_slice(&hdr.record_count.to_le_bytes());
    buf.extend_from_slice(&hdr.send_ns.to_le_bytes());
}

pub fn decode_header(bytes: &[u8]) -> Result<FrameHeader, IpcFrameError> {
    if bytes.len() < HEADER_BYTES {
        return Err(IpcFrameError::Truncated {
            expected: HEADER_BYTES,
            actual: bytes.len(),
        });
    }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if magic != MAGIC_ALG2 {
        return Err(IpcFrameError::InvalidMagic(magic));
    }
    let version = u16::from_le_bytes(bytes[4..6].try_into().unwrap());
    if version != PROTOCOL_VERSION_V1 {
        return Err(IpcFrameError::UnsupportedVersion(version));
    }
    let frame_type = u16::from_le_bytes(bytes[6..8].try_into().unwrap());
    let _ = FrameType::from_u16(frame_type)?;
    let stream_id = u32::from_le_bytes(bytes[8..12].try_into().unwrap());
    let record_count = u32::from_le_bytes(bytes[12..16].try_into().unwrap());
    let send_ns = u64::from_le_bytes(bytes[16..24].try_into().unwrap());
    Ok(FrameHeader {
        magic,
        version,
        frame_type,
        stream_id,
        record_count,
        send_ns,
    })
}

pub fn encode_live_trade_batch(
    stream_id: u32,
    send_ns: u64,
    trades: &[LiveTradeRecord],
) -> Vec<u8> {
    let mut buf = Vec::with_capacity(HEADER_BYTES + trades.len() * 40);
    encode_header(
        &mut buf,
        FrameHeader {
            magic: MAGIC_ALG2,
            version: PROTOCOL_VERSION_V1,
            frame_type: FrameType::LiveTradeBatch as u16,
            stream_id,
            record_count: trades.len() as u32,
            send_ns,
        },
    );
    for t in trades {
        buf.extend_from_slice(&t.seq.to_le_bytes());
        buf.extend_from_slice(&t.ts_ns.to_le_bytes());
        buf.extend_from_slice(&t.price_e9.to_le_bytes());
        buf.extend_from_slice(&t.qty_e9.to_le_bytes());
        buf.extend_from_slice(&t.flags.to_le_bytes());
        buf.extend_from_slice(&0u32.to_le_bytes());
    }
    buf
}

pub fn decode_live_trade_batch(
    bytes: &[u8],
) -> Result<(FrameHeader, Vec<LiveTradeRecord>), IpcFrameError> {
    let hdr = decode_header(bytes)?;
    let expected = HEADER_BYTES + (hdr.record_count as usize) * 40;
    if bytes.len() != expected {
        return Err(IpcFrameError::PayloadLengthMismatch {
            expected,
            actual: bytes.len(),
        });
    }
    let mut out = Vec::with_capacity(hdr.record_count as usize);
    for chunk in bytes[HEADER_BYTES..].as_chunks::<40>().0 {
        out.push(LiveTradeRecord {
            seq: u64::from_le_bytes(chunk[0..8].try_into().unwrap()),
            ts_ns: i64::from_le_bytes(chunk[8..16].try_into().unwrap()),
            price_e9: i64::from_le_bytes(chunk[16..24].try_into().unwrap()),
            qty_e9: i64::from_le_bytes(chunk[24..32].try_into().unwrap()),
            flags: u32::from_le_bytes(chunk[32..36].try_into().unwrap()),
            _pad: u32::from_le_bytes(chunk[36..40].try_into().unwrap()),
        });
    }
    Ok((hdr, out))
}

pub fn encode_footprint_delta(stream_id: u32, send_ns: u64, cells: &[FootprintCell]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(HEADER_BYTES + cells.len() * 32);
    encode_header(
        &mut buf,
        FrameHeader {
            magic: MAGIC_ALG2,
            version: PROTOCOL_VERSION_V1,
            frame_type: FrameType::LiveFootprintDelta as u16,
            stream_id,
            record_count: cells.len() as u32,
            send_ns,
        },
    );
    for c in cells {
        buf.extend_from_slice(&c.price_tick.to_le_bytes());
        buf.extend_from_slice(&c.bid_vol_e9.to_le_bytes());
        buf.extend_from_slice(&c.ask_vol_e9.to_le_bytes());
        buf.extend_from_slice(&c.trade_count.to_le_bytes());
        buf.push(c.imbalance_flags);
        buf.extend_from_slice(&[0u8; 3]);
    }
    buf
}

pub fn encode_volume_profile(
    stream_id: u32,
    send_ns: u64,
    summary: VolumeProfileSummary,
    bins: &[VolumeProfileBin],
) -> Vec<u8> {
    let mut buf = Vec::with_capacity(HEADER_BYTES + 24 + bins.len() * 24);
    encode_header(
        &mut buf,
        FrameHeader {
            magic: MAGIC_ALG2,
            version: PROTOCOL_VERSION_V1,
            frame_type: FrameType::VolumeProfileSoa as u16,
            stream_id,
            record_count: bins.len() as u32,
            send_ns,
        },
    );
    buf.extend_from_slice(&summary.poc_price.to_le_bytes());
    buf.extend_from_slice(&summary.vah_price.to_le_bytes());
    buf.extend_from_slice(&summary.val_price.to_le_bytes());
    for b in bins {
        buf.extend_from_slice(&b.price_tick.to_le_bytes());
        buf.extend_from_slice(&b.bid_vol_e9.to_le_bytes());
        buf.extend_from_slice(&b.ask_vol_e9.to_le_bytes());
    }
    buf
}

pub fn encode_stream_status(stream_id: u32, send_ns: u64, status: StreamStatusFrame) -> Vec<u8> {
    let mut buf = Vec::with_capacity(HEADER_BYTES + 16);
    encode_header(
        &mut buf,
        FrameHeader {
            magic: MAGIC_ALG2,
            version: PROTOCOL_VERSION_V1,
            frame_type: FrameType::StreamStatusFrame as u16,
            stream_id,
            record_count: 1,
            send_ns,
        },
    );
    buf.extend_from_slice(&status.seq.to_le_bytes());
    buf.extend_from_slice(&status.dropped_total.to_le_bytes());
    buf.extend_from_slice(&status.reason_code.to_le_bytes());
    buf.push(status.book_state);
    buf.push(status.provenance_tier);
    buf
}

pub fn decode_stream_status(
    bytes: &[u8],
) -> Result<(FrameHeader, StreamStatusFrame), IpcFrameError> {
    let hdr = decode_header(bytes)?;
    let expected = HEADER_BYTES + 16;
    if bytes.len() != expected {
        return Err(IpcFrameError::PayloadLengthMismatch {
            expected,
            actual: bytes.len(),
        });
    }
    let b = &bytes[HEADER_BYTES..];
    Ok((
        hdr,
        StreamStatusFrame {
            seq: u64::from_le_bytes(b[0..8].try_into().unwrap()),
            dropped_total: u32::from_le_bytes(b[8..12].try_into().unwrap()),
            reason_code: u16::from_le_bytes(b[12..14].try_into().unwrap()),
            book_state: b[14],
            provenance_tier: b[15],
        },
    ))
}

impl StreamStatusFrame {
    pub fn new(
        seq: u64,
        dropped_total: u32,
        reason_code: u16,
        book_state: BookState,
        tier: ProvenanceTier,
    ) -> Self {
        Self {
            seq,
            dropped_total,
            reason_code,
            book_state: book_state as u8,
            provenance_tier: tier as u8,
        }
    }
}
