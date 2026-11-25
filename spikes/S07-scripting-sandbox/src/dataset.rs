#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct BarInput {
    pub high_tick: i64,
    pub low_tick: i64,
    pub close_tick: i64,
    pub volume: i64,
    pub session_id: i64,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
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

impl StudyOutput {
    pub fn max_float_diff(&self, other: &Self) -> f64 {
        let diffs = [
            (self.ema - other.ema).abs(),
            (self.rsi - other.rsi).abs(),
            (self.vwap - other.vwap).abs(),
            (self.upper - other.upper).abs(),
            (self.lower - other.lower).abs(),
            (self.realized_pnl - other.realized_pnl).abs(),
        ];
        diffs.into_iter().fold(0.0_f64, f64::max)
    }

    pub fn exact_state_match(&self, other: &Self) -> bool {
        self.trades == other.trades && self.position == other.position
    }
}

/// Deterministic XorShift64 PRNG (zero external deps, 100% reproducible across OS/arch).
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Self(seed)
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    #[inline]
    fn next_range(&mut self, lo: i64, hi: i64) -> i64 {
        let span = (hi - lo + 1) as u64;
        lo + (self.next_u64() % span) as i64
    }
}

/// Generates `n_hist` historical bars + `n_live` incremental live bars using exact fixed-point ticks.
/// Instrument: ES-style futures (tick_size = $0.25, starting at 24000 ticks = $6000.00).
/// Session resets every 390 bars (1 RTH session).
pub fn generate_bars(n_hist: usize, n_live: usize) -> (Vec<BarInput>, Vec<BarInput>) {
    let total = n_hist + n_live;
    let mut rng = Rng::new(0xA11E_6ED1_2026_1124);
    let mut price_tick: i64 = 24_000;
    let mut out = Vec::with_capacity(total);

    for i in 0..total {
        // Mean-reverting + trending random walk in integer ticks
        let drift = if price_tick > 26_000 {
            -1
        } else if price_tick < 22_000 {
            1
        } else {
            0
        };
        let step = rng.next_range(-12, 12) + drift;
        let open_tick = price_tick;
        let close_tick = (open_tick + step).max(1_000);
        let wick_up = rng.next_range(0, 8);
        let wick_dn = rng.next_range(0, 8);
        let high_tick = open_tick.max(close_tick) + wick_up;
        let low_tick = (open_tick.min(close_tick) - wick_dn).max(100);
        let volume = rng.next_range(50, 4500);
        let session_id = (i as i64) / 390;

        out.push(BarInput {
            high_tick,
            low_tick,
            close_tick,
            volume,
            session_id,
        });
        price_tick = close_tick;
    }

    let live = out.split_off(n_hist);
    (out, live)
}
