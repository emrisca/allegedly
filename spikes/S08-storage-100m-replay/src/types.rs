/// Canonical fixed-point scale matching R07 (Databento DBN `1e-9` convention).
pub const PRICE_SCALE: i64 = 1_000_000_000;
/// CME ES tick size = $0.25 = 250_000_000 nanodollars.
pub const ES_TICK_SIZE_FP: i64 = 250_000_000;

/// Canonical fixed-point tick event (`#[repr(C)]`, 32 bytes aligned / 26 bytes packed payload).
/// Zero IEEE-754 floating-point types anywhere in storage or order-flow math.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct TickEvent {
    pub ts_event: i64,     // 8 B: UTC nanoseconds since Unix epoch
    pub price_fp: i64,     // 8 B: 1e-9 fixed-point price (exact multiple of ES_TICK_SIZE_FP)
    pub qty_fp: i64,       // 8 B: exact integer lot quantity (contracts)
    pub aggressor_side: u8,// 1 B: 1 = Buy (@Ask), 2 = Sell (@Bid)
    pub flags: u8,         // 1 B: provenance (0 = Exact ExchangeReported) + flags
    pub _pad: [u8; 6],     // 6 B alignment -> 32 B C struct
}

pub const PACKED_TICK_BYTES: usize = 8 + 8 + 8 + 1 + 1; // 26 bytes
pub const ALIGNED_TICK_BYTES: usize = std::mem::size_of::<TickEvent>(); // 32 bytes

impl TickEvent {
    #[inline(always)]
    pub fn tick_index(&self) -> i64 {
        self.price_fp.div_euclid(ES_TICK_SIZE_FP)
    }
}

/// Deterministic XorShift64* PRNG for reproducible 100M-tick synthesis.
#[derive(Clone)]
pub struct TickGenerator {
    state: u64,
    price_tick: i64,
    ts_ns: i64,
    day_end_ns: i64,
    remaining_in_day: usize,
}

impl TickGenerator {
    /// Creates a deterministic tick generator for a specific trading day `day_idx` (0..20).
    /// Each day spans 23 hours (82,800 seconds) starting 2026-11-(01+day_idx) 00:00:00 UTC.
    pub fn for_day(day_idx: u32, ticks_per_day: usize) -> Self {
        // 2026-11-01T00:00:00Z in Unix epoch seconds = 1793491200
        let base_day_sec: i64 = 1_793_491_200 + (day_idx as i64) * 86_400;
        let ts_ns = base_day_sec * 1_000_000_000;
        let day_end_ns = ts_ns + 82_800 * 1_000_000_000; // 23h CME Globex session
        // Deterministic seed unique per day
        let seed = 0x508A_11E6_ED10_0001u64 ^ ((day_idx as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15));
        // Starting price shifts slightly per day around ES 6000.00 (24,000 ticks)
        let price_tick = 24_000 + ((day_idx as i64 % 7) - 3) * 40;
        Self {
            state: seed,
            price_tick,
            ts_ns,
            day_end_ns,
            remaining_in_day: ticks_per_day,
        }
    }

    #[inline(always)]
    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Generates the next synthetic tick with realistic microstructure (sticky BBO, occasional 1-tick moves,
    /// heavy-tailed contract sizes 1..50, and monotonic nanosecond timestamps).
    #[inline(always)]
    pub fn next_tick(&mut self) -> TickEvent {
        let r = self.next_u64();

        // Advance timestamp proportionally to remaining session window with micro-burstiness
        let rem_ns = (self.day_end_ns - self.ts_ns).max(1) as u64;
        let rem_cnt = self.remaining_in_day.max(1) as u64;
        let avg_step = (rem_ns / rem_cnt).max(1);
        let jitter_step = (r % (avg_step.saturating_mul(2).max(2))) + 1;
        self.ts_ns = (self.ts_ns + jitter_step as i64).min(self.day_end_ns);
        self.remaining_in_day = self.remaining_in_day.saturating_sub(1);

        // Realistic sticky price movement: 84% unchanged, 8% +1 tick, 8% -1 tick, mild mean reversion
        let move_bucket = (r >> 16) & 0xFF;
        if move_bucket < 20 {
            self.price_tick += 1;
        } else if move_bucket < 40 {
            self.price_tick -= 1;
        } else if move_bucket == 40 {
            // Soft mean reversion back toward 24,000 ticks so price stays realistic over 5M ticks
            if self.price_tick > 24_600 {
                self.price_tick -= 1;
            } else if self.price_tick < 23_400 {
                self.price_tick += 1;
            }
        }

        // Aggressor side: 1 = Buy (@Ask), 2 = Sell (@Bid)
        let aggressor_side = if ((r >> 24) & 1) == 0 { 1u8 } else { 2u8 };

        // Contract lot quantity (heavy-tailed: mostly 1..5, occasional blocks up to 50)
        let q_sel = (r >> 32) & 0x3F;
        let qty_fp = if q_sel < 40 {
            1 + ((r >> 40) % 4) as i64
        } else if q_sel < 58 {
            5 + ((r >> 40) % 12) as i64
        } else {
            15 + ((r >> 40) % 36) as i64
        };

        TickEvent {
            ts_event: self.ts_ns,
            price_fp: self.price_tick * ES_TICK_SIZE_FP,
            qty_fp,
            aggressor_side,
            flags: 0, // 0 = Exact ExchangeReported
            _pad: [0; 6],
        }
    }
}
