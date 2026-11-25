use allegedly_core::{BookState, ProvenanceModifiers, ProvenanceTier};
use allegedly_ipc::{
    BIT_BUY_IMBAL, BIT_POC, FootprintCell, FrameHeader, FrameType, LiveBarUpdate, LiveL2BookHeader,
    LiveL2BookLevel, LiveTradeRecord, MAGIC_ALG2, PROTOCOL_VERSION_V1, StreamStatusFrame,
    TpoHeader, TpoRow128, VolumeProfileBin, VolumeProfileSummary, encode_footprint_delta,
    encode_live_trade_batch, encode_stream_status, encode_volume_profile, pack_trade_flags,
};
use serde::Serialize;
use std::mem::size_of;

#[derive(Serialize)]
struct IpcContractSchema {
    magic_hex: String,
    version: u16,
    header_bytes: usize,
    record_sizes: RecordSizes,
    frame_types: Vec<(&'static str, u16)>,
    golden_fixtures_hex: GoldenFixturesHex,
}

#[derive(Serialize)]
struct GoldenFixturesHex {
    live_trade_batch: String,
    footprint_delta: String,
    volume_profile: String,
    stream_status: String,
}

#[derive(Serialize)]
struct RecordSizes {
    live_trade_record: usize,
    footprint_cell: usize,
    volume_profile_summary: usize,
    volume_profile_bin: usize,
    tpo_header: usize,
    tpo_row_128: usize,
    live_l2_book_header: usize,
    live_l2_book_level: usize,
    live_bar_update: usize,
    stream_status_frame: usize,
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(&mut out, "{b:02x}");
    }
    out
}

fn main() {
    let trade_bytes = encode_live_trade_batch(
        7,
        999,
        &[LiveTradeRecord {
            seq: 42,
            ts_ns: 1_732_500_000_000_000_000,
            price_e9: 95_123_500_000_000,
            qty_e9: 50_000_000_000,
            flags: pack_trade_flags(
                1,
                ProvenanceTier::ExactTickAggr,
                ProvenanceModifiers::NONE,
                false,
            ),
            _pad: 0,
        }],
    );
    let footprint_bytes = encode_footprint_delta(
        2,
        555,
        &[FootprintCell {
            price_tick: 190_000,
            bid_vol_e9: 12_500_000_000,
            ask_vol_e9: 45_000_000_000,
            trade_count: 37,
            imbalance_flags: BIT_BUY_IMBAL | BIT_POC,
            _pad: [0; 3],
        }],
    );
    let vp_bytes = encode_volume_profile(
        5,
        777,
        VolumeProfileSummary {
            poc_price: 190_000,
            vah_price: 190_100,
            val_price: 189_900,
        },
        &[VolumeProfileBin {
            price_tick: 190_000,
            bid_vol_e9: 3_000_000_000,
            ask_vol_e9: 4_000_000_000,
        }],
    );
    let status_bytes = encode_stream_status(
        3,
        123_456,
        StreamStatusFrame::new(100, 5, 1, BookState::Stale, ProvenanceTier::ExactTickAggr),
    );

    let schema = IpcContractSchema {
        magic_hex: format!("0x{MAGIC_ALG2:08X}"),
        version: PROTOCOL_VERSION_V1,
        header_bytes: size_of::<FrameHeader>(),
        record_sizes: RecordSizes {
            live_trade_record: size_of::<LiveTradeRecord>(),
            footprint_cell: size_of::<FootprintCell>(),
            volume_profile_summary: size_of::<VolumeProfileSummary>(),
            volume_profile_bin: size_of::<VolumeProfileBin>(),
            tpo_header: size_of::<TpoHeader>(),
            tpo_row_128: size_of::<TpoRow128>(),
            live_l2_book_header: size_of::<LiveL2BookHeader>(),
            live_l2_book_level: size_of::<LiveL2BookLevel>(),
            live_bar_update: size_of::<LiveBarUpdate>(),
            stream_status_frame: size_of::<StreamStatusFrame>(),
        },
        frame_types: vec![
            ("OHLCV_BARS_SOA", FrameType::OhlcvBarsSoa as u16),
            ("FOOTPRINT_SLAB_SOA", FrameType::FootprintSlabSoa as u16),
            ("VOLUME_PROFILE_SOA", FrameType::VolumeProfileSoa as u16),
            ("TPO_PROFILE_BITMASK", FrameType::TpoProfileBitmask as u16),
            ("LIVE_TRADE_BATCH", FrameType::LiveTradeBatch as u16),
            ("LIVE_L2_BOOK_BATCH", FrameType::LiveL2BookBatch as u16),
            (
                "LIVE_BAR_UPDATE_BATCH",
                FrameType::LiveBarUpdateBatch as u16,
            ),
            ("LIVE_FOOTPRINT_DELTA", FrameType::LiveFootprintDelta as u16),
            ("STREAM_STATUS_FRAME", FrameType::StreamStatusFrame as u16),
        ],
        golden_fixtures_hex: GoldenFixturesHex {
            live_trade_batch: to_hex(&trade_bytes),
            footprint_delta: to_hex(&footprint_bytes),
            volume_profile: to_hex(&vp_bytes),
            stream_status: to_hex(&status_bytes),
        },
    };
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}
