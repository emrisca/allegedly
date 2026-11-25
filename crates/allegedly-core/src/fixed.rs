use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

pub const SCALE_E9: i64 = 1_000_000_000;
pub const SCALE_E9_I128: i128 = 1_000_000_000;
pub const SCALE_MICROS: i128 = 1_000_000;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum FixedError {
    #[error("invalid decimal string: {0}")]
    InvalidDecimal(String),
    #[error("fixed-point arithmetic overflow")]
    Overflow,
    #[error("division by zero")]
    DivisionByZero,
    #[error("tick size must be strictly positive, got {0}")]
    InvalidTickSize(i64),
}

/// Fixed-point price scaled by 1e9 (matching databento::dbn FIXED_PRICE_SCALE).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(transparent)]
pub struct PriceE9(pub i64);

/// Fixed-point quantity scaled by 1e9.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(transparent)]
pub struct QtyE9(pub i64);

/// Discrete integer instrument price tick index.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(transparent)]
pub struct PriceTicks(pub i64);

/// Discrete integer contract/share lot quantity.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(transparent)]
pub struct LotQty(pub i64);

/// Currency amount scaled by 1e6 (micro-dollars/micro-quote units) in i128 to prevent overflow.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(transparent)]
pub struct MoneyMicros(pub i128);

/// UTC Unix timestamp in nanoseconds.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(transparent)]
pub struct TimestampNs(pub i64);

/// Basis points (10_000 bps = 100.00%, 30_000 bps = 300% / 3.0x imbalance).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[repr(transparent)]
pub struct Bps(pub i32);

/// Parse an exact ASCII decimal or scientific-notation string (e.g., "67234.50", "-0.000125", "1.5e-5")
/// into scaled 1e9 i64 without ever touching binary floating-point parsing (SV-08).
pub fn parse_decimal_e9(input: &str) -> Result<i64, FixedError> {
    let s = input.trim();
    if s.is_empty() {
        return Err(FixedError::InvalidDecimal(input.to_string()));
    }
    let (neg, rest) = if let Some(r) = s.strip_prefix('-') {
        (true, r)
    } else if let Some(r) = s.strip_prefix('+') {
        (false, r)
    } else {
        (false, s)
    };
    if rest.is_empty() {
        return Err(FixedError::InvalidDecimal(input.to_string()));
    }

    // Optional ASCII exponent (e.g. "5e-5" from Kraken WS v2 JSON numbers)
    let (mantissa, exp10): (&str, i32) = if let Some(idx) = rest.find(['e', 'E']) {
        let (m, e_part) = rest.split_at(idx);
        let e_str = &e_part[1..];
        let parsed_exp = e_str
            .parse::<i32>()
            .map_err(|_| FixedError::InvalidDecimal(input.to_string()))?;
        (m, parsed_exp)
    } else {
        (rest, 0)
    };

    let mut parts = mantissa.split('.');
    let int_part = parts.next().unwrap_or("");
    let frac_part = parts.next();
    if parts.next().is_some() {
        return Err(FixedError::InvalidDecimal(input.to_string()));
    }
    if int_part.is_empty() && frac_part.is_none_or(str::is_empty) {
        return Err(FixedError::InvalidDecimal(input.to_string()));
    }

    // Collect significant digits in pure integer i128 without floats
    let mut digits_val: i128 = 0;
    let mut frac_digits: i32 = 0;
    for b in int_part.bytes() {
        if !b.is_ascii_digit() {
            return Err(FixedError::InvalidDecimal(input.to_string()));
        }
        digits_val = digits_val
            .checked_mul(10)
            .and_then(|v| v.checked_add(i128::from(b - b'0')))
            .ok_or(FixedError::Overflow)?;
    }
    if let Some(f) = frac_part {
        for b in f.bytes() {
            if !b.is_ascii_digit() {
                return Err(FixedError::InvalidDecimal(input.to_string()));
            }
            // Keep up to 18 fractional digits before scaling so tiny scientific values stay exact
            if frac_digits < 18 {
                digits_val = digits_val
                    .checked_mul(10)
                    .and_then(|v| v.checked_add(i128::from(b - b'0')))
                    .ok_or(FixedError::Overflow)?;
                frac_digits += 1;
            }
        }
    }

    // Target scale is 10^9: net shift = 9 + exp10 - frac_digits
    let shift = 9i32
        .checked_add(exp10)
        .and_then(|v| v.checked_sub(frac_digits))
        .ok_or(FixedError::Overflow)?;

    let mag = if shift >= 0 {
        let mut v = digits_val;
        for _ in 0..shift {
            v = v.checked_mul(10).ok_or(FixedError::Overflow)?;
        }
        v
    } else {
        let mut v = digits_val;
        for _ in 0..shift.unsigned_abs() {
            v /= 10;
            if v == 0 {
                break;
            }
        }
        v
    };

    let signed = if neg { -mag } else { mag };
    i64::try_from(signed).map_err(|_| FixedError::Overflow)
}

pub fn format_e9(val: i64) -> String {
    let neg = val < 0;
    let abs = val.unsigned_abs();
    let whole = abs / (SCALE_E9 as u64);
    let frac = abs % (SCALE_E9 as u64);
    if frac == 0 {
        if neg {
            format!("-{whole}")
        } else {
            format!("{whole}")
        }
    } else {
        let mut f = format!("{frac:09}");
        while f.ends_with('0') {
            f.pop();
        }
        if neg {
            format!("-{whole}.{f}")
        } else {
            format!("{whole}.{f}")
        }
    }
}

impl PriceE9 {
    pub fn parse(s: &str) -> Result<Self, FixedError> {
        parse_decimal_e9(s).map(Self)
    }

    pub fn from_ticks(ticks: PriceTicks, tick_size_e9: i64) -> Result<Self, FixedError> {
        if tick_size_e9 <= 0 {
            return Err(FixedError::InvalidTickSize(tick_size_e9));
        }
        ticks
            .0
            .checked_mul(tick_size_e9)
            .map(Self)
            .ok_or(FixedError::Overflow)
    }

    pub fn to_ticks(self, tick_size_e9: i64) -> Result<PriceTicks, FixedError> {
        if tick_size_e9 <= 0 {
            return Err(FixedError::InvalidTickSize(tick_size_e9));
        }
        Ok(PriceTicks(self.0.div_euclid(tick_size_e9)))
    }

    pub fn checked_add(self, rhs: Self) -> Result<Self, FixedError> {
        self.0
            .checked_add(rhs.0)
            .map(Self)
            .ok_or(FixedError::Overflow)
    }

    pub fn checked_sub(self, rhs: Self) -> Result<Self, FixedError> {
        self.0
            .checked_sub(rhs.0)
            .map(Self)
            .ok_or(FixedError::Overflow)
    }
}

impl fmt::Display for PriceE9 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&format_e9(self.0))
    }
}

impl QtyE9 {
    pub fn parse(s: &str) -> Result<Self, FixedError> {
        parse_decimal_e9(s).map(Self)
    }

    pub fn checked_add(self, rhs: Self) -> Result<Self, FixedError> {
        self.0
            .checked_add(rhs.0)
            .map(Self)
            .ok_or(FixedError::Overflow)
    }

    pub fn checked_sub(self, rhs: Self) -> Result<Self, FixedError> {
        self.0
            .checked_sub(rhs.0)
            .map(Self)
            .ok_or(FixedError::Overflow)
    }

    /// Compute notional currency value in MoneyMicros (1e6) using exact i128 math.
    /// (price_e9 * qty_e9) / 1e12 = micros (1e6).
    pub fn notional_micros(self, price: PriceE9) -> Result<MoneyMicros, FixedError> {
        let prod = i128::from(price.0)
            .checked_mul(i128::from(self.0))
            .ok_or(FixedError::Overflow)?;
        Ok(MoneyMicros(prod / 1_000_000_000_000))
    }
}

impl fmt::Display for QtyE9 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&format_e9(self.0))
    }
}

/// Centered i128 VWAP accumulator immune to overflow across 100M+ ticks.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct VwapAccumulator {
    anchor_price_e9: Option<i64>,
    sum_centered_pv: i128,
    sum_vol_e9: i128,
}

impl VwapAccumulator {
    pub fn update(&mut self, price: PriceE9, qty: QtyE9) -> Result<(), FixedError> {
        if qty.0 <= 0 {
            return Ok(());
        }
        let anchor = *self.anchor_price_e9.get_or_insert(price.0);
        let delta_p = i128::from(price.0) - i128::from(anchor);
        let pv = delta_p
            .checked_mul(i128::from(qty.0))
            .ok_or(FixedError::Overflow)?;
        self.sum_centered_pv = self
            .sum_centered_pv
            .checked_add(pv)
            .ok_or(FixedError::Overflow)?;
        self.sum_vol_e9 = self
            .sum_vol_e9
            .checked_add(i128::from(qty.0))
            .ok_or(FixedError::Overflow)?;
        Ok(())
    }

    pub fn vwap(&self) -> Result<Option<PriceE9>, FixedError> {
        let Some(anchor) = self.anchor_price_e9 else {
            return Ok(None);
        };
        if self.sum_vol_e9 == 0 {
            return Ok(None);
        }
        let offset = self.sum_centered_pv / self.sum_vol_e9;
        let total = i128::from(anchor)
            .checked_add(offset)
            .ok_or(FixedError::Overflow)?;
        i64::try_from(total)
            .map(|p| Some(PriceE9(p)))
            .map_err(|_| FixedError::Overflow)
    }

    pub fn total_volume_e9(&self) -> i128 {
        self.sum_vol_e9
    }
}
