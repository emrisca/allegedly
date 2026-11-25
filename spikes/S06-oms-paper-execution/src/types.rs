use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;
use uuid::Uuid;

/// 100% fixed-point domain errors — zero IEEE-754 floats anywhere in this crate.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum FixedPointError {
    #[error("empty numeric string")]
    Empty,
    #[error("invalid fixed-point syntax: {0}")]
    InvalidSyntax(String),
    #[error("value overflowed fixed-point bounds: {0}")]
    Overflow(String),
    #[error("price {value} is not aligned to instrument tick size {num}/{den}")]
    NotTickAligned {
        value: String,
        num: i64,
        den: i64,
    },
    #[error("invalid instrument spec: {0}")]
    InvalidSpec(String),
}

/// Signed integer price expressed as exact tick count for an `InstrumentSpec`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize)]
pub struct PriceTicks(pub i64);

impl PriceTicks {
    pub const ZERO: Self = Self(0);

    #[inline]
    pub fn checked_add(self, rhs: i64) -> Option<Self> {
        self.0.checked_add(rhs).map(Self)
    }

    #[inline]
    pub fn checked_sub(self, rhs: i64) -> Option<Self> {
        self.0.checked_sub(rhs).map(Self)
    }
}

/// Fixed-point integer quantity (contracts or scaled shares).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize)]
pub struct Qty(pub i64);

impl Qty {
    pub const ZERO: Self = Self(0);

    #[inline]
    pub fn is_positive(self) -> bool {
        self.0 > 0
    }

    #[inline]
    pub fn abs(self) -> Self {
        Self(self.0.abs())
    }

    #[inline]
    pub fn checked_add(self, rhs: Self) -> Option<Self> {
        self.0.checked_add(rhs.0).map(Self)
    }

    #[inline]
    pub fn checked_sub(self, rhs: Self) -> Option<Self> {
        self.0.checked_sub(rhs.0).map(Self)
    }
}

/// Exact monetary value in micro-units (1 USD = 1_000_000 MoneyMicros).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize)]
pub struct MoneyMicros(pub i128);

impl MoneyMicros {
    pub const ZERO: Self = Self(0);
    pub const SCALE: i128 = 1_000_000;

    pub fn from_dollars(dollars: i64) -> Self {
        Self((dollars as i128) * Self::SCALE)
    }

    pub fn format_usd(self) -> String {
        let neg = self.0 < 0;
        let abs = self.0.unsigned_abs();
        let whole = abs / 1_000_000;
        let cents = (abs % 1_000_000) / 10_000;
        if neg {
            format!("-${whole}.{cents:02}")
        } else {
            format!("${whole}.{cents:02}")
        }
    }
}

/// Basis points (10_000 bps = 100.00%, 100 bps = 1.00%).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize)]
pub struct Bps(pub i64);

/// Immutable instrument metadata per `01-Charter/Glossary.md` & `R04` §3.1.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstrumentSpec {
    pub venue: String,
    pub symbol: String,
    /// Optional correlation group (e.g., "CME_ES" shared by ES & MES for CME Rule 534 anti-hedging).
    pub product_group: String,
    /// Rational tick size numerator (e.g., 25 for 0.25, 1 for 0.01).
    pub tick_size_num: i64,
    /// Rational tick size denominator (e.g., 100 for 0.25 or 0.01, 32 for 1/32).
    pub tick_size_den: i64,
    /// Decimal places for quantity serialization (0 for whole shares/contracts).
    pub qty_scale: u32,
    /// Dollar value per 1 full point (1.00 price move) per 1 unit qty, in micro-dollars.
    /// Example: US equity = 1_000_000 ($1.00); CME ES = 50_000_000 ($50.00); MES = 5_000_000 ($5.00).
    pub point_value_micros: i64,
    pub currency: String,
}

impl InstrumentSpec {
    pub fn us_equity(symbol: impl Into<String>) -> Self {
        let sym = symbol.into();
        Self {
            venue: "IEX".to_string(),
            product_group: sym.clone(),
            symbol: sym,
            tick_size_num: 1,
            tick_size_den: 100,
            qty_scale: 0,
            point_value_micros: 1_000_000,
            currency: "USD".to_string(),
        }
    }

    pub fn cme_es(symbol: impl Into<String>) -> Self {
        Self {
            venue: "CME".to_string(),
            symbol: symbol.into(),
            product_group: "CME_ES".to_string(),
            tick_size_num: 25,
            tick_size_den: 100,
            qty_scale: 0,
            point_value_micros: 50_000_000,
            currency: "USD".to_string(),
        }
    }

    pub fn cme_mes(symbol: impl Into<String>) -> Self {
        Self {
            venue: "CME".to_string(),
            symbol: symbol.into(),
            product_group: "CME_ES".to_string(),
            tick_size_num: 25,
            tick_size_den: 100,
            qty_scale: 0,
            point_value_micros: 5_000_000,
            currency: "USD".to_string(),
        }
    }

    /// Exact dollar value of 1 tick per 1 unit of qty, in micro-dollars.
    pub fn tick_value_micros(&self) -> Result<i128, FixedPointError> {
        if self.tick_size_num <= 0 || self.tick_size_den <= 0 {
            return Err(FixedPointError::InvalidSpec(
                "tick_size_num and tick_size_den must be positive".to_string(),
            ));
        }
        let num = (self.point_value_micros as i128)
            .checked_mul(self.tick_size_num as i128)
            .ok_or_else(|| FixedPointError::Overflow("tick_value_micros".to_string()))?;
        Ok(num / (self.tick_size_den as i128))
    }

    /// Compute exact signed P&L in micro-dollars for `(exit_ticks - entry_ticks)` and `qty`.
    pub fn pnl_micros(
        &self,
        entry: PriceTicks,
        exit: PriceTicks,
        signed_qty: Qty,
    ) -> Result<MoneyMicros, FixedPointError> {
        let tick_diff = (exit.0 as i128) - (entry.0 as i128);
        let tv = self.tick_value_micros()?;
        let qty_divisor = pow10_i128(self.qty_scale)?;
        let raw = tick_diff
            .checked_mul(tv)
            .and_then(|v| v.checked_mul(signed_qty.0 as i128))
            .ok_or_else(|| FixedPointError::Overflow("pnl_micros".to_string()))?;
        Ok(MoneyMicros(raw / qty_divisor))
    }

    /// Parse a decimal string (e.g. `"5942.25"`, `"185.50"`) directly into exact `PriceTicks`
    /// without ever touching IEEE-754 floats.
    pub fn parse_price_str(&self, raw: &str) -> Result<PriceTicks, FixedPointError> {
        if self.tick_size_num <= 0 || self.tick_size_den <= 0 {
            return Err(FixedPointError::InvalidSpec(
                "invalid tick fraction".to_string(),
            ));
        }
        let (scaled_int, dec_scale) = parse_decimal_scaled(raw)?;
        let denom_scale = pow10_i128(dec_scale)?;
        // value = scaled_int / denom_scale
        // ticks = value / (tick_size_num / tick_size_den)
        //       = (scaled_int * tick_size_den) / (denom_scale * tick_size_num)
        let numerator = scaled_int
            .checked_mul(self.tick_size_den as i128)
            .ok_or_else(|| FixedPointError::Overflow(raw.to_string()))?;
        let denominator = denom_scale
            .checked_mul(self.tick_size_num as i128)
            .ok_or_else(|| FixedPointError::Overflow(raw.to_string()))?;
        if numerator % denominator != 0 {
            return Err(FixedPointError::NotTickAligned {
                value: raw.to_string(),
                num: self.tick_size_num,
                den: self.tick_size_den,
            });
        }
        let ticks = numerator / denominator;
        let ticks_i64 = i64::try_from(ticks)
            .map_err(|_| FixedPointError::Overflow(raw.to_string()))?;
        Ok(PriceTicks(ticks_i64))
    }

    /// Format `PriceTicks` into an exact decimal wire string (e.g. `"5942.25"`).
    /// Supports decimal denominators (10^k); for non-decimal tick fractions falls back to 6 decimal places.
    pub fn format_price_ticks(&self, ticks: PriceTicks) -> Result<String, FixedPointError> {
        if self.tick_size_num <= 0 || self.tick_size_den <= 0 {
            return Err(FixedPointError::InvalidSpec(
                "invalid tick fraction".to_string(),
            ));
        }
        let decimals = decimal_places_for_den(self.tick_size_den).unwrap_or(6);
        let scale = pow10_i128(decimals)?;
        let num = (ticks.0 as i128)
            .checked_mul(self.tick_size_num as i128)
            .and_then(|v| v.checked_mul(scale))
            .ok_or_else(|| FixedPointError::Overflow("format_price_ticks".to_string()))?;
        let scaled = num / (self.tick_size_den as i128);
        Ok(format_scaled_i128(scaled, decimals))
    }

    /// Parse a decimal quantity string into exact fixed-point `Qty`.
    pub fn parse_qty_str(&self, raw: &str) -> Result<Qty, FixedPointError> {
        let (scaled_int, dec_scale) = parse_decimal_scaled(raw)?;
        let qty_i128 = if dec_scale <= self.qty_scale {
            let mul = pow10_i128(self.qty_scale - dec_scale)?;
            scaled_int
                .checked_mul(mul)
                .ok_or_else(|| FixedPointError::Overflow(raw.to_string()))?
        } else {
            let div = pow10_i128(dec_scale - self.qty_scale)?;
            if scaled_int % div != 0 {
                return Err(FixedPointError::InvalidSyntax(format!(
                    "qty {raw} exceeds precision scale {}",
                    self.qty_scale
                )));
            }
            scaled_int / div
        };
        let q = i64::try_from(qty_i128)
            .map_err(|_| FixedPointError::Overflow(raw.to_string()))?;
        Ok(Qty(q))
    }

    /// Format `Qty` as an exact decimal wire string.
    pub fn format_qty(&self, qty: Qty) -> String {
        format_scaled_i128(qty.0 as i128, self.qty_scale)
    }
}

fn decimal_places_for_den(mut den: i64) -> Option<u32> {
    if den == 1 {
        return Some(0);
    }
    let mut places = 0u32;
    while den > 1 {
        if den % 10 != 0 {
            return None;
        }
        den /= 10;
        places += 1;
    }
    Some(places)
}

fn pow10_i128(exp: u32) -> Result<i128, FixedPointError> {
    10_i128
        .checked_pow(exp)
        .ok_or_else(|| FixedPointError::Overflow(format!("10^{exp}")))
}

fn parse_decimal_scaled(raw: &str) -> Result<(i128, u32), FixedPointError> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(FixedPointError::Empty);
    }
    let (neg, body) = if let Some(rest) = s.strip_prefix('-') {
        (true, rest)
    } else if let Some(rest) = s.strip_prefix('+') {
        (false, rest)
    } else {
        (false, s)
    };
    if body.is_empty() {
        return Err(FixedPointError::InvalidSyntax(raw.to_string()));
    }
    // Reject scientific notation, NaN, inf, spaces, etc.
    let mut parts = body.split('.');
    let int_part = parts.next().unwrap_or("");
    let frac_part = parts.next();
    if parts.next().is_some() {
        return Err(FixedPointError::InvalidSyntax(raw.to_string()));
    }
    if int_part.is_empty() && frac_part.map_or(true, |f| f.is_empty()) {
        return Err(FixedPointError::InvalidSyntax(raw.to_string()));
    }
    if !int_part.bytes().all(|b| b.is_ascii_digit()) {
        return Err(FixedPointError::InvalidSyntax(raw.to_string()));
    }
    let frac = frac_part.unwrap_or("");
    if !frac.bytes().all(|b| b.is_ascii_digit()) {
        return Err(FixedPointError::InvalidSyntax(raw.to_string()));
    }
    let dec_scale = u32::try_from(frac.len())
        .map_err(|_| FixedPointError::Overflow(raw.to_string()))?;
    let mut combined = String::with_capacity(int_part.len() + frac.len());
    combined.push_str(int_part);
    combined.push_str(frac);
    let unsigned: i128 = combined
        .parse()
        .map_err(|_| FixedPointError::Overflow(raw.to_string()))?;
    let signed = if neg {
        unsigned
            .checked_neg()
            .ok_or_else(|| FixedPointError::Overflow(raw.to_string()))?
    } else {
        unsigned
    };
    Ok((signed, dec_scale))
}

fn format_scaled_i128(val: i128, decimals: u32) -> String {
    if decimals == 0 {
        return val.to_string();
    }
    let neg = val < 0;
    let abs = val.unsigned_abs();
    let scale = 10_u128.pow(decimals);
    let whole = abs / scale;
    let frac = abs % scale;
    let width = decimals as usize;
    if neg {
        format!("-{whole}.{frac:0width$}")
    } else {
        format!("{whole}.{frac:0width$}")
    }
}

/// Client-generated deterministic UUIDv7 idempotency key.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ClientOrderId(pub String);

impl ClientOrderId {
    pub fn generate_v7() -> Self {
        Self(Uuid::now_v7().to_string())
    }

    pub fn from_raw(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ClientOrderId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Buy,
    Sell,
}

impl Side {
    pub fn opposite(self) -> Self {
        match self {
            Side::Buy => Side::Sell,
            Side::Sell => Side::Buy,
        }
    }

    pub fn sign(self) -> i64 {
        match self {
            Side::Buy => 1,
            Side::Sell => -1,
        }
    }

    pub fn as_alpaca_str(self) -> &'static str {
        match self {
            Side::Buy => "buy",
            Side::Sell => "sell",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeInForce {
    Day,
    Gtc,
    Ioc,
    Fok,
}

impl TimeInForce {
    pub fn as_alpaca_str(self) -> &'static str {
        match self {
            TimeInForce::Day => "day",
            TimeInForce::Gtc => "gtc",
            TimeInForce::Ioc => "ioc",
            TimeInForce::Fok => "fok",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OrderType {
    Market,
    Limit {
        limit_price: PriceTicks,
    },
    Stop {
        stop_price: PriceTicks,
    },
    StopLimit {
        stop_price: PriceTicks,
        limit_price: PriceTicks,
    },
    TrailingStop {
        trail_ticks: Option<i64>,
        trail_bps: Option<Bps>,
    },
}

/// Bracket/OCO order class aligned with Alpaca v2 (`simple`, `bracket`, `oco`, `oto`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "class", rename_all = "snake_case")]
pub enum OrderClass {
    Simple,
    Bracket {
        take_profit_price: PriceTicks,
        stop_loss_price: PriceTicks,
    },
    Oco {
        take_profit_price: PriceTicks,
        stop_loss_price: PriceTicks,
    },
    Oto {
        child_price: PriceTicks,
    },
}

/// Distinguishes broker-held server-side brackets from client-managed fallback legs (`R04` §3.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProtectiveLegMode {
    BrokerNative,
    ClientManagedWarning,
}

/// Strongly typed execution environment for hard Sim-vs-Live isolation (`R04` §3.4 & `S06-T6`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionEnv {
    LocalPaper,
    BrokerSandbox,
    BrokerLive,
}

impl ExecutionEnv {
    pub fn is_paper_or_sandbox(self) -> bool {
        matches!(self, ExecutionEnv::LocalPaper | ExecutionEnv::BrokerSandbox)
    }
}

/// Fixed-point Best Bid / Offer reference for fat-finger price collar validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BboQuote {
    pub bid: PriceTicks,
    pub ask: PriceTicks,
}

impl BboQuote {
    pub fn mid_ticks(self) -> PriceTicks {
        PriceTicks((self.bid.0 + self.ask.0) / 2)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderIntent {
    pub client_order_id: ClientOrderId,
    pub symbol: String,
    pub side: Side,
    pub qty: Qty,
    pub order_type: OrderType,
    pub order_class: OrderClass,
    pub tif: TimeInForce,
    pub env: ExecutionEnv,
    /// Optional parent order id for child legs in client-managed or OCO brackets.
    pub parent_client_order_id: Option<ClientOrderId>,
    /// Optional OCO sibling id.
    pub oco_sibling_id: Option<ClientOrderId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FillEvent {
    pub exec_id: String,
    pub client_order_id: ClientOrderId,
    pub broker_order_id: String,
    pub symbol: String,
    pub side: Side,
    pub fill_qty: Qty,
    pub fill_price: PriceTicks,
    pub ts_ns: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub symbol: String,
    /// Positive = long, negative = short, 0 = flat.
    pub net_qty: Qty,
    pub avg_entry_price: PriceTicks,
    pub realized_pnl_micros: MoneyMicros,
}

impl Position {
    pub fn flat(symbol: impl Into<String>) -> Self {
        Self {
            symbol: symbol.into(),
            net_qty: Qty::ZERO,
            avg_entry_price: PriceTicks::ZERO,
            realized_pnl_micros: MoneyMicros::ZERO,
        }
    }

    /// Apply a fill strictly in fixed-point integer math (zero floats).
    pub fn apply_fill(
        &mut self,
        spec: &InstrumentSpec,
        side: Side,
        fill_qty: Qty,
        fill_price: PriceTicks,
    ) -> Result<(), FixedPointError> {
        if fill_qty.0 <= 0 {
            return Err(FixedPointError::InvalidSyntax(
                "fill_qty must be positive".to_string(),
            ));
        }
        let signed_fill = side.sign() * fill_qty.0;
        let old_qty = self.net_qty.0;
        let new_qty = old_qty
            .checked_add(signed_fill)
            .ok_or_else(|| FixedPointError::Overflow("position qty".to_string()))?;

        if old_qty == 0 || (old_qty > 0 && signed_fill > 0) || (old_qty < 0 && signed_fill < 0) {
            // Increasing position in same direction: weighted average price in i128 ticks.
            let old_notional = (old_qty.abs() as i128) * (self.avg_entry_price.0 as i128);
            let fill_notional = (fill_qty.0 as i128) * (fill_price.0 as i128);
            let total_abs = new_qty.abs() as i128;
            self.avg_entry_price = PriceTicks(((old_notional + fill_notional) / total_abs) as i64);
            self.net_qty = Qty(new_qty);
        } else {
            // Reducing, closing, or reversing position.
            let closed_abs = old_qty.abs().min(fill_qty.0);
            let closed_signed = if old_qty > 0 { closed_abs } else { -closed_abs };
            let realized = spec.pnl_micros(self.avg_entry_price, fill_price, Qty(closed_signed))?;
            self.realized_pnl_micros = MoneyMicros(self.realized_pnl_micros.0 + realized.0);
            self.net_qty = Qty(new_qty);
            if new_qty == 0 {
                self.avg_entry_price = PriceTicks::ZERO;
            } else if (old_qty > 0 && new_qty < 0) || (old_qty < 0 && new_qty > 0) {
                // Reversed through zero: remaining qty enters at fill_price.
                self.avg_entry_price = fill_price;
            }
        }
        Ok(())
    }

    pub fn unrealized_pnl_micros(
        &self,
        spec: &InstrumentSpec,
        mark: PriceTicks,
    ) -> Result<MoneyMicros, FixedPointError> {
        if self.net_qty.0 == 0 {
            return Ok(MoneyMicros::ZERO);
        }
        spec.pnl_micros(self.avg_entry_price, mark, self.net_qty)
    }
}

#[inline]
pub fn now_unix_ns() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0)
}
