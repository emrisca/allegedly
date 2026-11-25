//! Clean-room public textbook built-in Study calculations (ADR-0005, Compliance-Notes §2).

pub fn sma(values: &[f64], period: usize) -> Vec<f64> {
    let mut out = vec![f64::NAN; values.len()];
    if period == 0 || values.len() < period {
        return out;
    }
    let mut sum = 0.0;
    for i in 0..values.len() {
        sum += values[i];
        if i >= period {
            sum -= values[i - period];
        }
        if i + 1 >= period {
            out[i] = sum / (period as f64);
        }
    }
    out
}

pub fn ema(values: &[f64], period: usize) -> Vec<f64> {
    let mut out = vec![f64::NAN; values.len()];
    if period == 0 || values.len() < period {
        return out;
    }
    let k = 2.0 / ((period as f64) + 1.0);
    let seed: f64 = values[..period].iter().sum::<f64>() / (period as f64);
    out[period - 1] = seed;
    let mut prev = seed;
    for i in period..values.len() {
        let next = (values[i] - prev) * k + prev;
        out[i] = next;
        prev = next;
    }
    out
}

/// Wilder's RSI (1978 New Concepts in Technical Trading Systems).
pub fn wilder_rsi(values: &[f64], period: usize) -> Vec<f64> {
    let mut out = vec![f64::NAN; values.len()];
    if period == 0 || values.len() <= period {
        return out;
    }
    let mut gain_sum = 0.0;
    let mut loss_sum = 0.0;
    for i in 1..=period {
        let diff = values[i] - values[i - 1];
        if diff >= 0.0 {
            gain_sum += diff;
        } else {
            loss_sum -= diff;
        }
    }
    let mut avg_gain = gain_sum / (period as f64);
    let mut avg_loss = loss_sum / (period as f64);
    out[period] = if avg_loss == 0.0 {
        100.0
    } else {
        100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
    };

    for i in (period + 1)..values.len() {
        let diff = values[i] - values[i - 1];
        let gain = if diff > 0.0 { diff } else { 0.0 };
        let loss = if diff < 0.0 { -diff } else { 0.0 };
        avg_gain = (avg_gain * ((period - 1) as f64) + gain) / (period as f64);
        avg_loss = (avg_loss * ((period - 1) as f64) + loss) / (period as f64);
        out[i] = if avg_loss == 0.0 {
            100.0
        } else {
            100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
        };
    }
    out
}

/// Session Volume-Weighted Average Price using centered offset for numerical stability.
pub fn vwap_series(typical_prices: &[f64], volumes: &[f64]) -> Vec<f64> {
    let n = typical_prices.len().min(volumes.len());
    let mut out = vec![f64::NAN; n];
    if n == 0 {
        return out;
    }
    let anchor = typical_prices[0];
    let mut cum_pv = 0.0;
    let mut cum_v = 0.0;
    for i in 0..n {
        let v = volumes[i].max(0.0);
        cum_pv += (typical_prices[i] - anchor) * v;
        cum_v += v;
        if cum_v > 0.0 {
            out[i] = anchor + (cum_pv / cum_v);
        }
    }
    out
}

/// Per-bar Footprint Delta (`ask_buy_vol - bid_sell_vol`).
pub fn footprint_delta_series(buy_volumes: &[f64], sell_volumes: &[f64]) -> Vec<f64> {
    let n = buy_volumes.len().min(sell_volumes.len());
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        out.push(buy_volumes[i] - sell_volumes[i]);
    }
    out
}

/// Cumulative Volume Delta (`running sum of (buy_vol - sell_vol)`).
pub fn cvd_series(buy_volumes: &[f64], sell_volumes: &[f64]) -> Vec<f64> {
    let deltas = footprint_delta_series(buy_volumes, sell_volumes);
    let mut out = Vec::with_capacity(deltas.len());
    let mut acc = 0.0;
    for d in deltas {
        acc += d;
        out.push(acc);
    }
    out
}
