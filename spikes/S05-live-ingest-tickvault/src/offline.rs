//! Offline decoder verification for Phase 2 Spike S05:
//! 1. Databento `dbn` (Apache-2.0): synthetic CME `GLBX.MDP3` `TradeMsg` and
//!    `Mbp10Msg` encode -> `.dbn.zst` -> decode -> `NormalizedTick` round-trip & throughput.
//! 2. Dukascopy `.bi5` (`>3I2f` LZMA): decode -> `QuoteTick` (`OtcIndicative`) & throughput.

use std::fs::File;
use std::io::{BufReader, Cursor};
use std::os::raw::c_char;
use std::path::Path;
use std::time::Instant;

use dbn::decode::{DbnDecoder, DecodeRecord};
use dbn::encode::{DbnEncoder, EncodeRecord};
use dbn::enums::{Action, SType, Schema, Side};
use dbn::record::{BidAskPair, Mbp10Msg, RecordHeader, TradeMsg};
use dbn::{FIXED_PRICE_SCALE, FlagSet, MetadataBuilder, rtype};
use serde::{Deserialize, Serialize};

use crate::model::{
    AggressorSide, AggressorSource, NormalizedTick, QuoteTick, SYM_CME_ES, SYM_DUKASCOPY_EURUSD,
    Venue, VenueCoverage,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbnCheckReport {
    pub trades_file: String,
    pub mbp10_file: String,
    pub trade_records_roundtripped: u64,
    pub mbp10_records_roundtripped: u64,
    pub trade_field_mismatches: u64,
    pub mbp10_field_mismatches: u64,
    pub trade_decode_ms: f64,
    pub trade_decode_records_per_sec: f64,
    pub mbp10_decode_ms: f64,
    pub mbp10_decode_records_per_sec: f64,
    pub trades_zst_bytes: u64,
    pub mbp10_zst_bytes: u64,
    pub fixed_price_scale: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bi5CheckReport {
    pub source: String,
    pub compressed_bytes: u64,
    pub decompressed_bytes: u64,
    pub ticks_decoded: u64,
    pub lzma_plus_parse_ms: f64,
    pub parse_only_ms: f64,
    pub parse_records_per_sec: f64,
    pub total_records_per_sec: f64,
    pub first_bid_e9: i64,
    pub first_ask_e9: i64,
    pub provenance_otc_verified: bool,
}

pub fn dbn_side_to_aggressor(side: c_char) -> (AggressorSide, AggressorSource) {
    match side as u8 as char {
        'B' => (AggressorSide::Buy, AggressorSource::ExchangeReported),
        'A' => (AggressorSide::Sell, AggressorSource::ExchangeReported),
        _ => (AggressorSide::Unknown, AggressorSource::None),
    }
}

pub fn trade_msg_to_normalized(msg: &TradeMsg) -> NormalizedTick {
    let (aggressor_side, aggressor_source) = dbn_side_to_aggressor(msg.side);
    NormalizedTick {
        ts_exchange_ns: msg.hd.ts_event as i64,
        ts_recv_ns: msg.ts_recv as i64,
        price_e9: msg.price, // 1:1 match with FIXED_PRICE_SCALE = 1_000_000_000!
        qty_e9: (msg.size as i64) * FIXED_PRICE_SCALE,
        trade_id: msg.sequence as u64,
        seq: msg.sequence as u64,
        best_bid_e9: 0,
        best_ask_e9: 0,
        symbol_id: SYM_CME_ES,
        venue: Venue::CmeGlobexDbn,
        aggressor_side,
        aggressor_source,
    }
}

pub fn mbp10_msg_to_normalized(msg: &Mbp10Msg) -> NormalizedTick {
    let (aggressor_side, aggressor_source) = dbn_side_to_aggressor(msg.side);
    let top = &msg.levels[0];
    NormalizedTick {
        ts_exchange_ns: msg.hd.ts_event as i64,
        ts_recv_ns: msg.ts_recv as i64,
        price_e9: msg.price,
        qty_e9: (msg.size as i64) * FIXED_PRICE_SCALE,
        trade_id: msg.sequence as u64,
        seq: msg.sequence as u64,
        best_bid_e9: top.bid_px,
        best_ask_e9: top.ask_px,
        symbol_id: SYM_CME_ES,
        venue: Venue::CmeGlobexDbn,
        aggressor_side,
        aggressor_source,
    }
}

/// Encodes synthetic CME `GLBX.MDP3` `TradeMsg` + `Mbp10Msg` frames to `.dbn.zst`,
/// decodes them back via `dbn::decode::DbnDecoder::from_zstd_file`, verifies exact
/// conversion to `NormalizedTick`, and benchmarks decode throughput.
pub fn run_dbn_verification(
    out_dir: &Path,
    trade_count: u64,
    mbp10_count: u64,
) -> Result<DbnCheckReport, Box<dyn std::error::Error + Send + Sync>> {
    std::fs::create_dir_all(out_dir)?;
    let trades_path = out_dir.join("synthetic_glbx_trades.dbn.zst");
    let mbp10_path = out_dir.join("synthetic_glbx_mbp10.dbn.zst");

    let base_ts: u64 = 1_795_570_000_000_000_000;
    let base_px: i64 = 5_942 * FIXED_PRICE_SCALE; // CME ES 5942.00
    let es_tick: i64 = 250_000_000; // 0.25 tick

    // 1. Encode TradeMsg stream to .dbn.zst
    {
        let metadata = MetadataBuilder::new()
            .dataset("GLBX.MDP3")
            .schema(Some(Schema::Trades))
            .start(base_ts)
            .stype_in(Some(SType::RawSymbol))
            .stype_out(SType::InstrumentId)
            .symbols(vec!["ESZ6".to_string()])
            .build();
        let file = File::create(&trades_path)?;
        let mut enc = DbnEncoder::with_zstd(file, &metadata)?;
        for i in 0..trade_count {
            let is_buy = i % 2 == 0;
            let px = base_px + ((i % 16) as i64) * es_tick;
            let msg = TradeMsg {
                hd: RecordHeader::new::<TradeMsg>(rtype::MBP_0, 1, 42, base_ts + i * 100_000),
                price: px,
                size: ((i % 10) + 1) as u32,
                action: Action::Trade as c_char,
                side: if is_buy {
                    Side::Bid as c_char
                } else {
                    Side::Ask as c_char
                },
                flags: FlagSet::empty(),
                depth: 0,
                ts_recv: base_ts + i * 100_000 + 5_000,
                ts_in_delta: 5_000,
                sequence: (i + 1) as u32,
            };
            enc.encode_record(&msg)?;
        }
        enc.flush()?;
    }

    // 2. Decode TradeMsg stream & verify exact round-trip
    let t0 = Instant::now();
    let mut dec = DbnDecoder::from_zstd_file(&trades_path)?;
    let mut decoded_trades = 0_u64;
    let mut trade_mismatches = 0_u64;
    while let Some(msg) = dec.decode_record::<TradeMsg>()? {
        let tick = trade_msg_to_normalized(msg);
        let exp_px = base_px + ((decoded_trades % 16) as i64) * es_tick;
        let exp_side = if decoded_trades % 2 == 0 {
            AggressorSide::Buy
        } else {
            AggressorSide::Sell
        };
        if tick.price_e9 != exp_px
            || tick.aggressor_side != exp_side
            || tick.aggressor_source != AggressorSource::ExchangeReported
            || tick.venue != Venue::CmeGlobexDbn
        {
            trade_mismatches += 1;
        }
        decoded_trades += 1;
    }
    let trade_decode_secs = t0.elapsed().as_secs_f64();

    // 3. Encode Mbp10Msg stream to .dbn.zst
    {
        let metadata = MetadataBuilder::new()
            .dataset("GLBX.MDP3")
            .schema(Some(Schema::Mbp10))
            .start(base_ts)
            .stype_in(Some(SType::RawSymbol))
            .stype_out(SType::InstrumentId)
            .symbols(vec!["ESZ6".to_string()])
            .build();
        let file = File::create(&mbp10_path)?;
        let mut enc = DbnEncoder::with_zstd(file, &metadata)?;
        for i in 0..mbp10_count {
            let mut levels = std::array::from_fn(|_| BidAskPair::default());
            for (lvl, pair) in levels.iter_mut().enumerate() {
                let offset = (lvl as i64) * es_tick;
                pair.bid_px = base_px - offset;
                pair.ask_px = base_px + es_tick + offset;
                pair.bid_sz = 25 + lvl as u32;
                pair.ask_sz = 30 + lvl as u32;
                pair.bid_ct = 5;
                pair.ask_ct = 6;
            }
            let msg = Mbp10Msg {
                hd: RecordHeader::new::<Mbp10Msg>(rtype::MBP_10, 1, 42, base_ts + i * 200_000),
                price: base_px + es_tick,
                size: 3,
                action: Action::Trade as c_char,
                side: Side::Bid as c_char,
                flags: FlagSet::empty(),
                depth: 0,
                ts_recv: base_ts + i * 200_000 + 4_000,
                ts_in_delta: 4_000,
                sequence: (i + 1) as u32,
                levels,
            };
            enc.encode_record(&msg)?;
        }
        enc.flush()?;
    }

    // 4. Decode Mbp10Msg stream & verify BBO + fixed-point fields
    let t1 = Instant::now();
    let mut dec10 = DbnDecoder::from_zstd_file(&mbp10_path)?;
    let mut decoded_mbp10 = 0_u64;
    let mut mbp10_mismatches = 0_u64;
    while let Some(msg) = dec10.decode_record::<Mbp10Msg>()? {
        let tick = mbp10_msg_to_normalized(msg);
        if tick.best_bid_e9 != base_px
            || tick.best_ask_e9 != base_px + es_tick
            || tick.price_e9 != base_px + es_tick
            || tick.aggressor_side != AggressorSide::Buy
        {
            mbp10_mismatches += 1;
        }
        decoded_mbp10 += 1;
    }
    let mbp10_decode_secs = t1.elapsed().as_secs_f64();

    let trades_zst_bytes = std::fs::metadata(&trades_path)?.len();
    let mbp10_zst_bytes = std::fs::metadata(&mbp10_path)?.len();

    Ok(DbnCheckReport {
        trades_file: trades_path.display().to_string(),
        mbp10_file: mbp10_path.display().to_string(),
        trade_records_roundtripped: decoded_trades,
        mbp10_records_roundtripped: decoded_mbp10,
        trade_field_mismatches: trade_mismatches,
        mbp10_field_mismatches: mbp10_mismatches,
        trade_decode_ms: trade_decode_secs * 1000.0,
        trade_decode_records_per_sec: if trade_decode_secs > 0.0 {
            decoded_trades as f64 / trade_decode_secs
        } else {
            0.0
        },
        mbp10_decode_ms: mbp10_decode_secs * 1000.0,
        mbp10_decode_records_per_sec: if mbp10_decode_secs > 0.0 {
            decoded_mbp10 as f64 / mbp10_decode_secs
        } else {
            0.0
        },
        trades_zst_bytes,
        mbp10_zst_bytes,
        fixed_price_scale: FIXED_PRICE_SCALE,
    })
}

/// Decodes a Dukascopy `.bi5` (LZMA-compressed 20-byte big-endian `>3I2f` tick file)
/// into Allegedly's fixed-point `QuoteTick` with mandatory `VenueCoverage::OtcIndicative`
/// and `AggressorSource::None` provenance tags.
pub fn decode_dukascopy_bi5_bytes(
    compressed: &[u8],
    hour_start_unix_ns: i64,
    point_divisor: i64, // 100_000 for 5-decimal FX pairs like EURUSD
    source_label: &str,
) -> Result<(Vec<QuoteTick>, Bi5CheckReport), Box<dyn std::error::Error + Send + Sync>> {
    let t_total = Instant::now();
    let mut decompressed = Vec::new();
    let mut reader = BufReader::new(Cursor::new(compressed));
    lzma_rs::lzma_decompress(&mut reader, &mut decompressed)?;

    let t_parse = Instant::now();
    let rec_count = decompressed.len() / 20;
    let mut quotes = Vec::with_capacity(rec_count);
    let scale_mul = 1_000_000_000_i64 / point_divisor; // 10_000 for EURUSD (1e-5 -> 1e-9)

    for chunk in decompressed.chunks_exact(20) {
        let ms_offset = u32::from_be_bytes(chunk[0..4].try_into().unwrap()) as i64;
        let ask_raw = u32::from_be_bytes(chunk[4..8].try_into().unwrap()) as i64;
        let bid_raw = u32::from_be_bytes(chunk[8..12].try_into().unwrap()) as i64;
        // Wire spec >3I2f carries indicative volume in millions as IEEE f32;
        // convert immediately at the ingress boundary into fixed-point i64 (1e-9).
        let ask_vol_f32 = f32::from_be_bytes(chunk[12..16].try_into().unwrap());
        let bid_vol_f32 = f32::from_be_bytes(chunk[16..20].try_into().unwrap());
        let ask_qty_e9 = ((ask_vol_f32 as f64) * 1_000_000_000.0).round() as i64;
        let bid_qty_e9 = ((bid_vol_f32 as f64) * 1_000_000_000.0).round() as i64;

        quotes.push(QuoteTick {
            ts_exchange_ns: hour_start_unix_ns + ms_offset * 1_000_000,
            bid_e9: bid_raw * scale_mul,
            ask_e9: ask_raw * scale_mul,
            bid_qty_e9,
            ask_qty_e9,
            symbol_id: SYM_DUKASCOPY_EURUSD,
            venue: Venue::DukascopyOtc,
            coverage: VenueCoverage::OtcIndicative,
            aggressor_source: AggressorSource::None,
        });
    }

    let parse_secs = t_parse.elapsed().as_secs_f64();
    let total_secs = t_total.elapsed().as_secs_f64();

    let first_bid_e9 = quotes.first().map(|q| q.bid_e9).unwrap_or(0);
    let first_ask_e9 = quotes.first().map(|q| q.ask_e9).unwrap_or(0);
    let prov_ok = quotes.iter().all(|q| {
        q.coverage == VenueCoverage::OtcIndicative && q.aggressor_source == AggressorSource::None
    });

    let report = Bi5CheckReport {
        source: source_label.to_string(),
        compressed_bytes: compressed.len() as u64,
        decompressed_bytes: decompressed.len() as u64,
        ticks_decoded: quotes.len() as u64,
        lzma_plus_parse_ms: total_secs * 1000.0,
        parse_only_ms: parse_secs * 1000.0,
        parse_records_per_sec: if parse_secs > 0.0 {
            quotes.len() as f64 / parse_secs
        } else {
            0.0
        },
        total_records_per_sec: if total_secs > 0.0 {
            quotes.len() as f64 / total_secs
        } else {
            0.0
        },
        first_bid_e9,
        first_ask_e9,
        provenance_otc_verified: prov_ok,
    };

    Ok((quotes, report))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dbn_synthetic_trade_and_mbp10_roundtrip() {
        let dir = std::path::PathBuf::from("/tmp/allegedly-s05-bench/unit_dbn");
        let rep = run_dbn_verification(&dir, 5_000, 1_000).unwrap();
        assert_eq!(rep.trade_records_roundtripped, 5_000);
        assert_eq!(rep.mbp10_records_roundtripped, 1_000);
        assert_eq!(rep.trade_field_mismatches, 0);
        assert_eq!(rep.mbp10_field_mismatches, 0);
        assert_eq!(rep.fixed_price_scale, 1_000_000_000);
    }

    #[test]
    fn dukascopy_bi5_synthetic_decode() {
        // Build 100 synthetic 20-byte >3I2f ticks and LZMA-compress them
        let mut raw = Vec::with_capacity(2000);
        for i in 0..100_u32 {
            raw.extend_from_slice(&(i * 100).to_be_bytes());
            raw.extend_from_slice(&112_074_u32.to_be_bytes());
            raw.extend_from_slice(&112_071_u32.to_be_bytes());
            raw.extend_from_slice(&0.90_f32.to_be_bytes());
            raw.extend_from_slice(&0.22_f32.to_be_bytes());
        }
        let mut compressed = Vec::new();
        lzma_rs::lzma_compress(&mut Cursor::new(&raw), &mut compressed).unwrap();
        let (quotes, rep) =
            decode_dukascopy_bi5_bytes(&compressed, 1_789_473_600_000_000_000, 100_000, "synthetic")
                .unwrap();
        assert_eq!(quotes.len(), 100);
        assert_eq!(rep.first_ask_e9, 1_120_740_000);
        assert_eq!(rep.first_bid_e9, 1_120_710_000);
        assert!(rep.provenance_otc_verified);
    }
}
