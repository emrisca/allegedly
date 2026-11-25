use std::alloc::{Layout, alloc as std_alloc, dealloc as std_dealloc};
use std::cell::UnsafeCell;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct BarInput {
    pub high_tick: i64,
    pub low_tick: i64,
    pub close_tick: i64,
    pub volume: i64,
    pub session_id: i64,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct StudyOutput {
    pub ema: f64,
    pub rsi: f64,
    pub vwap: f64,
    pub upper: f64,
    pub lower: f64,
    pub realized_pnl: f64,
    pub trades: i64,
    pub position: i64,
}

struct StudyState {
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

impl StudyState {
    const fn new() -> Self {
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
        }
    }

    #[inline(always)]
    fn step(&mut self, bar: &BarInput) {
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
            let bull_cross = prev_close <= prev_ema && close > self.ema && close > self.vwap && self.rsi < 70.0;
            let bear_cross = prev_close >= prev_ema && close < self.ema && close < self.vwap && self.rsi > 30.0;

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

    fn output(&self) -> StudyOutput {
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

struct GlobalState(UnsafeCell<StudyState>);
unsafe impl Sync for GlobalState {}

static STATE: GlobalState = GlobalState(UnsafeCell::new(StudyState::new()));

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let layout = Layout::from_size_align(len.max(1), 8).unwrap();
    unsafe { std_alloc(layout) }
}

#[unsafe(no_mangle)]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    let layout = Layout::from_size_align(len.max(1), 8).unwrap();
    unsafe { std_dealloc(ptr, layout) }
}

#[unsafe(no_mangle)]
pub extern "C" fn study_reset() {
    unsafe {
        *STATE.0.get() = StudyState::new();
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn study_eval_batch(bars_ptr: *const BarInput, count: usize, out_ptr: *mut StudyOutput) {
    let bars = unsafe { std::slice::from_raw_parts(bars_ptr, count) };
    let st = unsafe { &mut *STATE.0.get() };
    for bar in bars {
        st.step(bar);
    }
    unsafe {
        *out_ptr = st.output();
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn study_step_tick(
    high_tick: i64,
    low_tick: i64,
    close_tick: i64,
    volume: i64,
    session_id: i64,
    out_ptr: *mut StudyOutput,
) {
    let bar = BarInput {
        high_tick,
        low_tick,
        close_tick,
        volume,
        session_id,
    };
    let st = unsafe { &mut *STATE.0.get() };
    st.step(&bar);
    unsafe {
        *out_ptr = st.output();
    }
}

// --- Hostile sandbox test entrypoints ---

#[unsafe(no_mangle)]
pub extern "C" fn hostile_infinite_loop() -> i64 {
    let mut x: i64 = 1;
    loop {
        x = std::hint::black_box(x.wrapping_add(1));
        if x == 0 {
            break;
        }
    }
    x
}

#[unsafe(no_mangle)]
pub extern "C" fn hostile_memory_bomb(megabytes: usize) -> usize {
    let mut ptrs: Vec<(*mut u8, Layout)> = Vec::with_capacity(megabytes);
    let mut checksum: usize = 0;
    for i in 0..megabytes {
        let layout = Layout::from_size_align(1024 * 1024, 16).unwrap();
        let ptr = unsafe { std_alloc(layout) };
        if ptr.is_null() {
            std::alloc::handle_alloc_error(layout);
        }
        // Touch 1 byte per 64 KiB WASM page so allocation cannot be elided and uses minimal fuel
        for page in 0..16 {
            unsafe {
                let p = ptr.add(page * 65_536);
                std::ptr::write_volatile(p, (i & 0xFF) as u8);
                checksum = checksum.wrapping_add(std::ptr::read_volatile(p) as usize);
            }
        }
        ptrs.push((ptr, layout));
    }
    std::hint::black_box(&ptrs);
    checksum.wrapping_add(ptrs.len().saturating_mul(1024 * 1024))
}

#[inline(never)]
fn recurse(n: u64) -> u64 {
    let mut scratch = [0u64; 64];
    scratch[0] = std::hint::black_box(n);
    if n == 0 {
        scratch[0]
    } else {
        std::hint::black_box(scratch[0].wrapping_add(recurse(n + 1)))
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hostile_stack_overflow() -> u64 {
    recurse(1)
}
