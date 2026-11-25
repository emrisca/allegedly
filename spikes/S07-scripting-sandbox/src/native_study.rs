use crate::dataset::{BarInput, StudyOutput};

/// Native Rust `mv-studies` incremental state machine with explicit `preview` / `rollback` / `commit`
/// semantics (matching R06 Section 1.1 & 1.2).
#[derive(Clone, Debug)]
pub struct NativeStudy {
    bar_idx: i64,
    ema: f64,
    prev_ema: f64,
    prev_close: f64,
    rsi_gain_sum: f64,
    rsi_loss_sum: f64,
    avg_gain: f64,
    avg_loss: f64,
    rsi: f64,
    prev_session: i64,
    cum_vol: f64,
    vwap: f64,
    m2: f64,
    upper: f64,
    lower: f64,
    position: i64,
    entry_price: f64,
    realized_pnl: f64,
    trades: i64,
    snapshot: Option<Box<NativeStudySnapshot>>,
}

#[derive(Clone, Debug)]
struct NativeStudySnapshot {
    bar_idx: i64,
    ema: f64,
    prev_ema: f64,
    prev_close: f64,
    rsi_gain_sum: f64,
    rsi_loss_sum: f64,
    avg_gain: f64,
    avg_loss: f64,
    rsi: f64,
    prev_session: i64,
    cum_vol: f64,
    vwap: f64,
    m2: f64,
    upper: f64,
    lower: f64,
    position: i64,
    entry_price: f64,
    realized_pnl: f64,
    trades: i64,
}

impl NativeStudy {
    pub fn new() -> Self {
        Self {
            bar_idx: 0,
            ema: 0.0,
            prev_ema: 0.0,
            prev_close: 0.0,
            rsi_gain_sum: 0.0,
            rsi_loss_sum: 0.0,
            avg_gain: 0.0,
            avg_loss: 0.0,
            rsi: 50.0,
            prev_session: -1,
            cum_vol: 0.0,
            vwap: 0.0,
            m2: 0.0,
            upper: 0.0,
            lower: 0.0,
            position: 0,
            entry_price: 0.0,
            realized_pnl: 0.0,
            trades: 0,
            snapshot: None,
        }
    }

    /// Snapshot committed bar-close state for live intrabar rollback (`var` semantics).
    pub fn commit_snapshot(&mut self) {
        self.snapshot = Some(Box::new(NativeStudySnapshot {
            bar_idx: self.bar_idx,
            ema: self.ema,
            prev_ema: self.prev_ema,
            prev_close: self.prev_close,
            rsi_gain_sum: self.rsi_gain_sum,
            rsi_loss_sum: self.rsi_loss_sum,
            avg_gain: self.avg_gain,
            avg_loss: self.avg_loss,
            rsi: self.rsi,
            prev_session: self.prev_session,
            cum_vol: self.cum_vol,
            vwap: self.vwap,
            m2: self.m2,
            upper: self.upper,
            lower: self.lower,
            position: self.position,
            entry_price: self.entry_price,
            realized_pnl: self.realized_pnl,
            trades: self.trades,
        }));
    }

    /// Roll back intrabar mutations to last committed bar-close state.
    pub fn rollback(&mut self) {
        if let Some(ref s) = self.snapshot {
            self.bar_idx = s.bar_idx;
            self.ema = s.ema;
            self.prev_ema = s.prev_ema;
            self.prev_close = s.prev_close;
            self.rsi_gain_sum = s.rsi_gain_sum;
            self.rsi_loss_sum = s.rsi_loss_sum;
            self.avg_gain = s.avg_gain;
            self.avg_loss = s.avg_loss;
            self.rsi = s.rsi;
            self.prev_session = s.prev_session;
            self.cum_vol = s.cum_vol;
            self.vwap = s.vwap;
            self.m2 = s.m2;
            self.upper = s.upper;
            self.lower = s.lower;
            self.position = s.position;
            self.entry_price = s.entry_price;
            self.realized_pnl = s.realized_pnl;
            self.trades = s.trades;
        }
    }

    #[inline(always)]
    pub fn step(&mut self, bar: &BarInput) {
        const TICK_SIZE: f64 = 0.25;
        const ALPHA: f64 = 2.0 / 21.0;

        let high = (bar.high_tick as f64) * TICK_SIZE;
        let low = (bar.low_tick as f64) * TICK_SIZE;
        let close = (bar.close_tick as f64) * TICK_SIZE;
        let vol = bar.volume as f64;

        // 1. EMA-20
        let prev_ema = self.ema;
        let prev_close = self.prev_close;
        if self.bar_idx == 0 {
            self.ema = close;
        } else {
            self.ema = ALPHA * close + (1.0 - ALPHA) * self.ema;
        }

        // 2. RSI-14 (Wilder RMA)
        if self.bar_idx == 0 {
            self.rsi = 50.0;
        } else {
            let change = close - prev_close;
            let gain = if change > 0.0 { change } else { 0.0 };
            let loss = if change < 0.0 { -change } else { 0.0 };
            if self.bar_idx <= 14 {
                self.rsi_gain_sum += gain;
                self.rsi_loss_sum += loss;
                if self.bar_idx == 14 {
                    self.avg_gain = self.rsi_gain_sum / 14.0;
                    self.avg_loss = self.rsi_loss_sum / 14.0;
                    self.rsi = compute_rsi(self.avg_gain, self.avg_loss);
                } else {
                    self.rsi = 50.0;
                }
            } else {
                self.avg_gain = (self.avg_gain * 13.0 + gain) / 14.0;
                self.avg_loss = (self.avg_loss * 13.0 + loss) / 14.0;
                self.rsi = compute_rsi(self.avg_gain, self.avg_loss);
            }
        }

        // 3. Session-Anchored VWAP + Welford StdDev Bands
        if bar.session_id != self.prev_session {
            self.prev_session = bar.session_id;
            self.cum_vol = 0.0;
            self.vwap = 0.0;
            self.m2 = 0.0;
        }
        let tp = (high + low + close) / 3.0;
        let new_vol = self.cum_vol + vol;
        if new_vol > 0.0 {
            let delta = tp - self.vwap;
            let new_vwap = self.vwap + (vol / new_vol) * delta;
            let delta2 = tp - new_vwap;
            self.m2 += vol * delta * delta2;
            self.cum_vol = new_vol;
            self.vwap = new_vwap;
            let var = self.m2 / self.cum_vol;
            let sd = if var > 0.0 { var.sqrt() } else { 0.0 };
            self.upper = self.vwap + 2.0 * sd;
            self.lower = self.vwap - 2.0 * sd;
        }

        // 4. Stateful Crossover Strategy
        if self.bar_idx >= 20 {
            let bull_cross =
                prev_close <= prev_ema && close > self.ema && close > self.vwap && self.rsi < 70.0;
            let bear_cross =
                prev_close >= prev_ema && close < self.ema && close < self.vwap && self.rsi > 30.0;

            if bull_cross {
                if self.position == -1 {
                    self.realized_pnl += self.entry_price - close;
                    self.trades += 1;
                    self.position = 0;
                }
                if self.position == 0 {
                    self.position = 1;
                    self.entry_price = close;
                    self.trades += 1;
                }
            } else if bear_cross {
                if self.position == 1 {
                    self.realized_pnl += close - self.entry_price;
                    self.trades += 1;
                    self.position = 0;
                }
                if self.position == 0 {
                    self.position = -1;
                    self.entry_price = close;
                    self.trades += 1;
                }
            } else if self.position == 1 && close >= self.upper {
                self.realized_pnl += close - self.entry_price;
                self.trades += 1;
                self.position = 0;
            } else if self.position == -1 && close <= self.lower {
                self.realized_pnl += self.entry_price - close;
                self.trades += 1;
                self.position = 0;
            }
        }

        self.prev_close = close;
        self.prev_ema = self.ema;
        self.bar_idx += 1;
    }

    pub fn eval_batch(&mut self, bars: &[BarInput]) -> StudyOutput {
        for b in bars {
            self.step(b);
        }
        self.output()
    }

    pub fn output(&self) -> StudyOutput {
        StudyOutput {
            ema: self.ema,
            rsi: self.rsi,
            vwap: self.vwap,
            upper: self.upper,
            lower: self.lower,
            realized_pnl: self.realized_pnl,
            trades: self.trades,
            position: self.position,
        }
    }
}

#[inline(always)]
fn compute_rsi(avg_gain: f64, avg_loss: f64) -> f64 {
    if avg_loss == 0.0 {
        100.0
    } else if avg_gain == 0.0 {
        0.0
    } else {
        100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    }
}
