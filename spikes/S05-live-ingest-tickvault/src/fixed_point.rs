//! Exact fixed-point decimal parsing and formatting scaled by 1e-9 (`i64`).
//!
//! Enforces Allegedly Non-Negotiable #7 (Financial Correctness):
//! zero IEEE-754 `f32`/`f64` operations in price or quantity parsing/math.
//! Scale `1e-9` aligns 1:1 with Databento DBN `FIXED_PRICE_SCALE = 1_000_000_000`.

use std::fmt;

pub const SCALE: i64 = 1_000_000_000;
pub const SCALE_DECIMALS: usize = 9;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FixedPointError {
    Empty,
    InvalidFormat(String),
    PrecisionLoss(String),
    Overflow(String),
}

impl fmt::Display for FixedPointError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(f, "empty decimal string"),
            Self::InvalidFormat(s) => write!(f, "invalid decimal format: {s:?}"),
            Self::PrecisionLoss(s) => write!(f, "precision beyond 1e-9 scale: {s:?}"),
            Self::Overflow(s) => write!(f, "fixed-point i64 overflow: {s:?}"),
        }
    }
}

impl std::error::Error for FixedPointError {}

/// Parses an arbitrary ASCII decimal string (including optional sign and
/// scientific notation like `2e-8` or `1.5E+3`) into an exact `1e-9` scaled `i64`.
///
/// Rejects any non-zero fractional digit beyond 9 decimal places so precision
/// loss can never happen silently.
pub fn parse_decimal_e9(raw: &str) -> Result<i64, FixedPointError> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(FixedPointError::Empty);
    }

    let (neg, rest) = if let Some(r) = s.strip_prefix('-') {
        (true, r)
    } else if let Some(r) = s.strip_prefix('+') {
        (false, r)
    } else {
        (false, s)
    };

    if rest.is_empty() {
        return Err(FixedPointError::InvalidFormat(raw.to_string()));
    }

    // Split optional scientific exponent
    let (mantissa, exp10): (&str, i32) = match rest.find(['e', 'E']) {
        Some(idx) => {
            let exp_str = &rest[idx + 1..];
            let exp: i32 = exp_str
                .parse()
                .map_err(|_| FixedPointError::InvalidFormat(raw.to_string()))?;
            (&rest[..idx], exp)
        }
        None => (rest, 0),
    };

    if mantissa.is_empty() {
        return Err(FixedPointError::InvalidFormat(raw.to_string()));
    }

    let (int_part, frac_part) = match mantissa.split_once('.') {
        Some((i, f)) => {
            if f.contains('.') {
                return Err(FixedPointError::InvalidFormat(raw.to_string()));
            }
            (i, f)
        }
        None => (mantissa, ""),
    };

    if int_part.is_empty() && frac_part.is_empty() {
        return Err(FixedPointError::InvalidFormat(raw.to_string()));
    }
    if !int_part.bytes().all(|b| b.is_ascii_digit())
        || !frac_part.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(FixedPointError::InvalidFormat(raw.to_string()));
    }

    // Combine significant digits into a single stream, tracking net power of 10
    // relative to 1e-9: value_e9 = digits_as_int * 10^(exp10 + 9 - frac_part.len())
    let shift: i32 = exp10 + (SCALE_DECIMALS as i32) - (frac_part.len() as i32);

    // Strip leading zeros to keep u128 accumulation tight
    let mut digits = Vec::with_capacity(int_part.len() + frac_part.len());
    for b in int_part.bytes().chain(frac_part.bytes()) {
        if digits.is_empty() && b == b'0' {
            continue;
        }
        digits.push(b);
    }

    if digits.is_empty() {
        return Ok(0);
    }

    // If shift < 0, we must divide by 10^(-shift); ensure all dropped digits are '0'
    let mut eff_shift = shift;
    while eff_shift < 0 {
        match digits.last() {
            Some(b'0') => {
                digits.pop();
                eff_shift += 1;
            }
            Some(_) => return Err(FixedPointError::PrecisionLoss(raw.to_string())),
            None => return Ok(0),
        }
    }

    let mut acc: u128 = 0;
    for b in digits {
        acc = acc
            .checked_mul(10)
            .and_then(|v| v.checked_add((b - b'0') as u128))
            .ok_or_else(|| FixedPointError::Overflow(raw.to_string()))?;
    }

    for _ in 0..eff_shift {
        acc = acc
            .checked_mul(10)
            .ok_or_else(|| FixedPointError::Overflow(raw.to_string()))?;
    }

    if neg {
        let max_neg = (i64::MAX as u128) + 1;
        if acc > max_neg {
            return Err(FixedPointError::Overflow(raw.to_string()));
        }
        if acc == max_neg {
            Ok(i64::MIN)
        } else {
            Ok(-(acc as i64))
        }
    } else {
        if acc > i64::MAX as u128 {
            return Err(FixedPointError::Overflow(raw.to_string()));
        }
        Ok(acc as i64)
    }
}

/// Parses a `serde_json::value::RawValue` token that may be either a JSON number
/// (`59318.2`) or a JSON string (`"59318.20"`), without ever touching `f64`.
pub fn parse_json_raw_decimal_e9(raw_token: &str) -> Result<i64, FixedPointError> {
    let trimmed = raw_token.trim();
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(trimmed);
    parse_decimal_e9(unquoted)
}

/// Formats an exact `1e-9` scaled `i64` back to a minimal canonical decimal string
/// (trimming insignificant trailing zeros after the decimal point).
pub fn format_e9(val: i64) -> String {
    if val == 0 {
        return "0".to_string();
    }
    let neg = val < 0;
    let abs: u128 = val.unsigned_abs() as u128;
    let scale = SCALE as u128;
    let whole = abs / scale;
    let frac = abs % scale;

    if frac == 0 {
        if neg {
            format!("-{whole}")
        } else {
            whole.to_string()
        }
    } else {
        let frac_padded = format!("{frac:09}");
        let frac_trimmed = frac_padded.trim_end_matches('0');
        if neg {
            format!("-{whole}.{frac_trimmed}")
        } else {
            format!("{whole}.{frac_trimmed}")
        }
    }
}

/// Formats a scaled `i64` with fixed decimal places (up to 9).
pub fn format_e9_fixed(val: i64, decimals: usize) -> String {
    assert!(decimals <= SCALE_DECIMALS);
    let neg = val < 0;
    let abs: u128 = val.unsigned_abs() as u128;
    let scale = SCALE as u128;
    let whole = abs / scale;
    let frac = abs % scale;
    let sign = if neg && val != 0 { "-" } else { "" };
    if decimals == 0 {
        format!("{sign}{whole}")
    } else {
        let frac_padded = format!("{frac:09}");
        format!("{sign}{whole}.{}", &frac_padded[..decimals])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_float_drift_classic_0_1_plus_0_2() {
        let a = parse_decimal_e9("0.1").unwrap();
        let b = parse_decimal_e9("0.2").unwrap();
        let c = parse_decimal_e9("0.3").unwrap();
        assert_eq!(a + b, c);
        assert_eq!(format_e9(a + b), "0.3");
    }

    #[test]
    fn round_trip_crypto_cme_fx_edge_decimals() {
        let cases = [
            ("0", 0_i64, "0"),
            ("-0.0", 0_i64, "0"),
            ("59318.2", 59_318_200_000_000, "59318.2"),
            ("0.00000001", 10, "0.00000001"),           // 1 satoshi (8 decimals)
            ("0.000000001", 1, "0.000000001"),          // 1 Gwei / 1e-9
            ("0.00010000", 100_000, "0.0001"),          // Kraken trailing zeros
            ("5942.25", 5_942_250_000_000, "5942.25"),  // CME ES 0.25 tick
            ("5942.50", 5_942_500_000_000, "5942.5"),
            ("5942.75", 5_942_750_000_000, "5942.75"),
            ("1.12074", 1_120_740_000, "1.12074"),      // FX 0.00001 pip
            ("0.00001", 10_000, "0.00001"),
            ("1e-8", 10, "0.00000001"),                 // Scientific notation
            ("2.5E-6", 2_500, "0.0000025"),
            ("1.23E+4", 12_300_000_000_000, "12300"),
            ("-123.456789012", -123_456_789_012, "-123.456789012"),
            ("0.000000020000", 20, "0.00000002"),       // Trailing zeros past 9th digit OK
        ];

        for (input, expected_i64, expected_fmt) in cases {
            let parsed = parse_decimal_e9(input).unwrap_or_else(|e| panic!("failed {input}: {e}"));
            assert_eq!(parsed, expected_i64, "input={input}");
            let formatted = format_e9(parsed);
            assert_eq!(formatted, expected_fmt, "input={input}");
            assert_eq!(parse_decimal_e9(&formatted).unwrap(), expected_i64);
        }
    }

    #[test]
    fn raw_json_number_and_string_parsing() {
        assert_eq!(
            parse_json_raw_decimal_e9("59318.2").unwrap(),
            59_318_200_000_000
        );
        assert_eq!(
            parse_json_raw_decimal_e9("\"59349.60\"").unwrap(),
            59_349_600_000_000
        );
        assert_eq!(parse_json_raw_decimal_e9("\"0.00000002\"").unwrap(), 20);
    }

    #[test]
    fn rejects_precision_loss_overflow_and_invalid() {
        assert!(matches!(
            parse_decimal_e9("0.0000000001"),
            Err(FixedPointError::PrecisionLoss(_))
        ));
        assert!(matches!(
            parse_decimal_e9("99999999999999999999"),
            Err(FixedPointError::Overflow(_))
        ));
        assert!(matches!(
            parse_decimal_e9("NaN"),
            Err(FixedPointError::InvalidFormat(_))
        ));
        assert!(matches!(parse_decimal_e9(""), Err(FixedPointError::Empty)));
    }
}
