use allegedly_ipc::{
    FootprintCell, FrameHeader, FrameType, LiveBarUpdate, LiveL2BookHeader, LiveL2BookLevel,
    LiveTradeRecord, MAGIC_ALG2, PROTOCOL_VERSION_V1, StreamStatusFrame, TpoHeader, TpoRow128,
    VolumeProfileBin, VolumeProfileSummary,
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

fn main() {
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
    };
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}
