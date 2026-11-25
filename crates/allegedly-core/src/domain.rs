use crate::fixed::{PriceE9, QtyE9, TimestampNs};
use crate::provenance::{ProvenanceModifiers, ProvenanceTier};
use serde::{Deserialize, Serialize};
use std::mem::size_of;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[repr(transparent)]
pub struct InstrumentId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum Venue {
    SyntheticSim = 0,
    KrakenSpot = 1,
    CoinbaseAdvTrade = 2,
    DatabentoCme = 3,
    DukascopyFx = 4,
    AlpacaPaper = 5,
    TastytradeSandbox = 6,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum AssetClass {
    CryptoSpot = 0,
    Futures = 1,
    Equities = 2,
    ForexOtc = 3,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstrumentMeta {
    pub id: InstrumentId,
    pub symbol: String,
    pub venue: Venue,
    pub asset_class: AssetClass,
    pub tick_size_e9: i64,
    pub lot_size_e9: i64,
    pub currency: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
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

/// Canonical 72-byte aligned normalized market tick (Data-Model.md / RT3-17).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct NormalizedTick {
    pub ts_exchange_ns: i64,
    pub ts_recv_ns: i64,
    pub instrument_id: u32,
    pub flags: u32,
    pub seq: u64,
    pub price_e9: i64,
    pub qty_e9: i64,
    pub bid_e9: i64,
    pub ask_e9: i64,
    pub side: u8,
    pub provenance_tier: u8,
    pub provenance_modifiers: u8,
    pub _pad: [u8; 5],
}

const _: () = {
    assert!(size_of::<NormalizedTick>() == 72);
};

impl NormalizedTick {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        ts_exchange_ns: TimestampNs,
        ts_recv_ns: TimestampNs,
        instrument_id: InstrumentId,
        seq: u64,
        price: PriceE9,
        qty: QtyE9,
        bid: PriceE9,
        ask: PriceE9,
        side: AggressorSide,
        tier: ProvenanceTier,
        modifiers: ProvenanceModifiers,
    ) -> Self {
        Self {
            ts_exchange_ns: ts_exchange_ns.0,
            ts_recv_ns: ts_recv_ns.0,
            instrument_id: instrument_id.0,
            flags: 0,
            seq,
            price_e9: price.0,
            qty_e9: qty.0,
            bid_e9: bid.0,
            ask_e9: ask.0,
            side: side as u8,
            provenance_tier: tier as u8,
            provenance_modifiers: modifiers.0,
            _pad: [0; 5],
        }
    }

    pub fn aggressor_side(&self) -> AggressorSide {
        AggressorSide::from_u8(self.side)
    }

    pub fn tier(&self) -> ProvenanceTier {
        ProvenanceTier::from_u8(self.provenance_tier).unwrap_or(ProvenanceTier::SyntheticIntrabar)
    }
}

/// Canonical 24-byte aligned L2 price level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(C)]
pub struct BookLevel {
    pub price_e9: i64,
    pub qty_e9: i64,
    pub side_action_flags: u32,
    pub order_count: u32,
}

const _: () = {
    assert!(size_of::<BookLevel>() == 24);
};
