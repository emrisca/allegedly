//! Canonical Allegedly market-data structs & Provenance model.
//!
//! Strictly obeys Constraints #7 (0 `f32`/`f64` fields anywhere in price,
//! quantity, tick, book, or bar types) and #8 (Honest Data Provenance).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum Venue {
    Unknown = 0,
    KrakenSpot = 1,
    CoinbaseAdvTrade = 2,
    CmeGlobexDbn = 3,
    DukascopyOtc = 4,
    Synthetic = 5,
}

impl Venue {
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::KrakenSpot,
            2 => Self::CoinbaseAdvTrade,
            3 => Self::CmeGlobexDbn,
            4 => Self::DukascopyOtc,
            5 => Self::Synthetic,
            _ => Self::Unknown,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unknown => "UNKNOWN",
            Self::KrakenSpot => "KRAKEN_SPOT",
            Self::CoinbaseAdvTrade => "COINBASE_ADV_TRADE",
            Self::CmeGlobexDbn => "CME_GLOBEX_DBN",
            Self::DukascopyOtc => "DUKASCOPY_OTC",
            Self::Synthetic => "SYNTHETIC",
        }
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum AggressorSide {
    #[default]
    Unknown = 0,
    Buy = 1,
    Sell = 2,
}

impl AggressorSide {
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Buy,
            2 => Self::Sell,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum AggressorSource {
    None = 0,
    /// Native exchange-reported taker/aggressor side (e.g., Kraken WS v2, Databento CME MDP 3.0).
    ExchangeReported = 1,
    /// Native exchange-reported maker side deterministically inverted to aggressor (e.g., Coinbase).
    ExchangeReportedInverted = 2,
    /// Inferred via Lee & Ready (1991) quote-rule + tick-rule fallback (~70–85% literature ceiling).
    InferredLeeReady = 3,
    /// Inferred via Tick Rule only (no quote alignment).
    InferredTickRule = 4,
}

impl AggressorSource {
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::ExchangeReported,
            2 => Self::ExchangeReportedInverted,
            3 => Self::InferredLeeReady,
            4 => Self::InferredTickRule,
            _ => Self::None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum VenueCoverage {
    FullVenue = 1,
    ConsolidatedSip = 2,
    SingleVenuePartial = 3,
    OtcIndicative = 4,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum Timeliness {
    RealTime = 1,
    Delayed = 2,
    Historical = 3,
    Synthetic = 4,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProvenanceHeader {
    pub venue: Venue,
    pub symbol: String,
    pub symbol_id: u16,
    pub coverage: VenueCoverage,
    pub timeliness: Timeliness,
    pub delay_seconds: u32,
    pub aggressor_source: AggressorSource,
    pub scale_decimals: u8,
    pub recorded_at_ns: i64,
}

/// Canonical normalized trade tick (ZERO floating-point fields).
/// All prices and quantities are exact `i64` scaled by `1e-9`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizedTick {
    pub ts_exchange_ns: i64,
    pub ts_recv_ns: i64,
    pub price_e9: i64,
    pub qty_e9: i64,
    pub trade_id: u64,
    pub seq: u64,
    pub best_bid_e9: i64,
    pub best_ask_e9: i64,
    pub symbol_id: u16,
    pub venue: Venue,
    pub aggressor_side: AggressorSide,
    pub aggressor_source: AggressorSource,
}

/// Canonical L1 quote tick (used for OTC FX `.bi5` / NBBO — ZERO floating-point fields).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuoteTick {
    pub ts_exchange_ns: i64,
    pub bid_e9: i64,
    pub ask_e9: i64,
    pub bid_qty_e9: i64,
    pub ask_qty_e9: i64,
    pub symbol_id: u16,
    pub venue: Venue,
    pub coverage: VenueCoverage,
    pub aggressor_source: AggressorSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BookLevel {
    pub price_e9: i64,
    pub qty_e9: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StaleReason {
    SequenceGap { expected: u64, got: u64 },
    ChecksumMismatch { expected: u32, computed: u32 },
    Disconnected,
    BackpressureDrop,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BookState {
    Initializing,
    Live,
    Stale(StaleReason),
}

/// Symbol ID table used consistently across live ingest, vault, and replay.
pub const SYM_KRAKEN_BTC_USD: u16 = 1;
pub const SYM_KRAKEN_ETH_USD: u16 = 2;
pub const SYM_COINBASE_BTC_USD: u16 = 3;
pub const SYM_COINBASE_ETH_USD: u16 = 4;
pub const SYM_CME_ES: u16 = 10;
pub const SYM_DUKASCOPY_EURUSD: u16 = 20;
pub const SYM_SYNTHETIC_BTC_USD: u16 = 99;

pub fn symbol_id_name(id: u16) -> &'static str {
    match id {
        SYM_KRAKEN_BTC_USD => "BTC/USD",
        SYM_KRAKEN_ETH_USD => "ETH/USD",
        SYM_COINBASE_BTC_USD => "BTC-USD",
        SYM_COINBASE_ETH_USD => "ETH-USD",
        SYM_CME_ES => "ES.FUT",
        SYM_DUKASCOPY_EURUSD => "EURUSD",
        SYM_SYNTHETIC_BTC_USD => "SYN-BTC-USD",
        _ => "UNKNOWN",
    }
}

pub fn now_unix_ns() -> i64 {
    chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
}
