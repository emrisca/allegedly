use serde::{Deserialize, Serialize};

/// Canonical 5-tier data provenance ladder (ADR-0008, SV-10, SV-11).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(u8)]
pub enum ProvenanceTier {
    /// Exact L3 Market-By-Order exchange feed with native order IDs.
    ExactL3Mbo = 0,
    /// Exact tick-by-tick executed trades with exchange-reported aggressor side.
    ExactTickAggr = 1,
    /// Trade aggressor side inferred against contemporaneous L1 BBO (Lee-Ready).
    EstimatedL1Quote = 2,
    /// Trade aggressor side inferred solely from prior trade tick direction.
    EstimatedTickRule = 3,
    /// Intrabar volume distribution synthesized from coarse OHLCV candles.
    #[default]
    SyntheticIntrabar = 4,
}

impl ProvenanceTier {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::ExactL3Mbo),
            1 => Some(Self::ExactTickAggr),
            2 => Some(Self::EstimatedL1Quote),
            3 => Some(Self::EstimatedTickRule),
            4 => Some(Self::SyntheticIntrabar),
            _ => None,
        }
    }

    pub fn badge_label(self) -> &'static str {
        match self {
            Self::ExactL3Mbo => "EXACT: L3-MBO",
            Self::ExactTickAggr => "EXACT: TICK-AGGR",
            Self::EstimatedL1Quote => "ESTIMATED: L1-QUOTE",
            Self::EstimatedTickRule => "ESTIMATED: TICK-RULE",
            Self::SyntheticIntrabar => "SYNTHETIC: INTRABAR",
        }
    }

    /// True if absorption/spoof-exact L3 features are permitted (SV-10).
    pub fn supports_absorption_triggers(self) -> bool {
        !matches!(self, Self::SyntheticIntrabar)
    }

    /// True if exact MBO queue position is available; false requires `[Est / Max]` PIQ badge (SV-11).
    pub fn is_exact_mbo(self) -> bool {
        matches!(self, Self::ExactL3Mbo)
    }
}

/// Orthogonal provenance modifier bitflags (IPC-Contract §3.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct ProvenanceModifiers(pub u8);

impl ProvenanceModifiers {
    pub const NONE: Self = Self(0);
    pub const PARTIAL_VENUE: u8 = 1 << 0;
    pub const OTC_INDICATIVE: u8 = 1 << 1;
    pub const DELAYED: u8 = 1 << 2;

    pub fn with(self, flag: u8) -> Self {
        Self(self.0 | flag)
    }

    pub fn contains(self, flag: u8) -> bool {
        (self.0 & flag) != 0
    }
}

/// Canonical 5-state order-book health enum (ADR-0008, ADR-0009, IPC-Contract).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[repr(u8)]
pub enum BookState {
    Live = 0,
    Stale = 1,
    Rebuilding = 2,
    #[default]
    Disconnected = 3,
    Halted = 4,
}

impl BookState {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::Live),
            1 => Some(Self::Stale),
            2 => Some(Self::Rebuilding),
            3 => Some(Self::Disconnected),
            4 => Some(Self::Halted),
            _ => None,
        }
    }

    pub fn is_live(self) -> bool {
        matches!(self, Self::Live)
    }
}
