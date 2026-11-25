use allegedly_core::{
    AggressorSide, FixedError, InstrumentId, NormalizedTick, PriceE9, ProvenanceModifiers,
    ProvenanceTier, QtyE9, TimestampNs,
};
use crc32fast::Hasher;
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ParseError {
    #[error("fixed-point parse error: {0}")]
    Fixed(#[from] FixedError),
    #[error("unknown side string: {0}")]
    UnknownSide(String),
    #[error("sequence gap: expected {expected}, got {actual}")]
    SequenceGap { expected: u64, actual: u64 },
}

/// Kraken WS v2 reports direct taker side ("buy" -> Buy, "sell" -> Sell).
pub fn parse_kraken_trade(
    instrument_id: InstrumentId,
    seq: u64,
    ts_ns: TimestampNs,
    price_str: &str,
    qty_str: &str,
    taker_side: &str,
) -> Result<NormalizedTick, ParseError> {
    let side = match taker_side {
        "buy" | "BUY" => AggressorSide::Buy,
        "sell" | "SELL" => AggressorSide::Sell,
        other => return Err(ParseError::UnknownSide(other.to_string())),
    };
    let price = PriceE9::parse(price_str)?;
    let qty = QtyE9::parse(qty_str)?;
    Ok(NormalizedTick::new(
        ts_ns,
        ts_ns,
        instrument_id,
        seq,
        price,
        qty,
        PriceE9(0),
        PriceE9(0),
        side,
        ProvenanceTier::ExactTickAggr,
        ProvenanceModifiers::NONE,
    ))
}

/// Kraken WS v2 top-10 book CRC32 checksum helper (strips '.' and leading zeros per Kraken spec).
pub fn kraken_book_crc32(asks: &[(&str, &str)], bids: &[(&str, &str)]) -> u32 {
    fn norm(s: &str) -> String {
        let stripped: String = s.chars().filter(|&c| c != '.').collect();
        let trimmed = stripped.trim_start_matches('0');
        if trimmed.is_empty() {
            "0".to_string()
        } else {
            trimmed.to_string()
        }
    }
    let mut payload = String::new();
    for (p, q) in asks.iter().take(10) {
        payload.push_str(&norm(p));
        payload.push_str(&norm(q));
    }
    for (p, q) in bids.iter().take(10) {
        payload.push_str(&norm(p));
        payload.push_str(&norm(q));
    }
    let mut h = Hasher::new();
    h.update(payload.as_bytes());
    h.finalize()
}

/// Coinbase Advanced Trade WS reports MAKER side; MUST invert to taker/aggressor side (S05 proof!).
/// maker "BUY" => aggressor Sell; maker "SELL" => aggressor Buy.
pub fn parse_coinbase_trade(
    instrument_id: InstrumentId,
    expected_seq: Option<u64>,
    seq: u64,
    ts_ns: TimestampNs,
    price_str: &str,
    qty_str: &str,
    maker_side: &str,
) -> Result<NormalizedTick, ParseError> {
    if let Some(exp) = expected_seq {
        if seq != exp {
            return Err(ParseError::SequenceGap {
                expected: exp,
                actual: seq,
            });
        }
    }
    let taker_side = match maker_side {
        "BUY" | "buy" => AggressorSide::Sell,
        "SELL" | "sell" => AggressorSide::Buy,
        other => return Err(ParseError::UnknownSide(other.to_string())),
    };
    let price = PriceE9::parse(price_str)?;
    let qty = QtyE9::parse(qty_str)?;
    Ok(NormalizedTick::new(
        ts_ns,
        ts_ns,
        instrument_id,
        seq,
        price,
        qty,
        PriceE9(0),
        PriceE9(0),
        taker_side,
        ProvenanceTier::ExactTickAggr,
        ProvenanceModifiers::NONE,
    ))
}
