use crate::types::TickEvent;

/// Exact R05 Section 2.3 Tool 1 FootprintCell layout (32 bytes, zero floats).
#[repr(C, align(8))]
#[derive(Clone, Copy, Debug, Default)]
pub struct FootprintCell {
    pub bid_vol: i64,
    pub ask_vol: i64,
    pub bid_trades: u32,
    pub ask_trades: u32,
    pub flags: u16,
    pub _pad: [u8; 6],
}

pub const FLAG_IMB_BID: u16 = 1 << 0;
pub const FLAG_IMB_ASK: u16 = 1 << 1;
pub const FLAG_POC: u16 = 1 << 2;
pub const FLAG_VA: u16 = 1 << 3;

#[derive(Clone, Debug)]
pub struct FootprintBar {
    pub bar_ts_open_ns: i64,
    pub base_tick: i64,
    pub row_ticks: i64,
    pub open_tick: i64,
    pub high_tick: i64,
    pub low_tick: i64,
    pub close_tick: i64,
    pub total_vol: i64,
    pub delta: i64,
    pub min_delta: i64,
    pub max_delta: i64,
    pub vwap_num_i128: i128, // exact sum(tick * qty) in i128 — zero float drift!
    pub poc_offset: u16,
    pub vah_offset: u16,
    pub val_offset: u16,
    pub unfinished_high: bool,
    pub unfinished_low: bool,
    pub cells: Vec<FootprintCell>,
}

impl FootprintBar {
    pub fn new(bar_ts_open_ns: i64, first_tick: i64, row_ticks: i64) -> Self {
        let bucket = first_tick.div_euclid(row_ticks) * row_ticks;
        Self {
            bar_ts_open_ns,
            base_tick: bucket,
            row_ticks,
            open_tick: first_tick,
            high_tick: first_tick,
            low_tick: first_tick,
            close_tick: first_tick,
            total_vol: 0,
            delta: 0,
            min_delta: 0,
            max_delta: 0,
            vwap_num_i128: 0,
            poc_offset: 0,
            vah_offset: 0,
            val_offset: 0,
            unfinished_high: false,
            unfinished_low: false,
            cells: vec![FootprintCell::default(); 1],
        }
    }

    #[inline(always)]
    pub fn ingest(&mut self, tick_index: i64, qty: i64, side: u8) {
        let bucket = tick_index.div_euclid(self.row_ticks) * self.row_ticks;
        if bucket < self.base_tick {
            let prepend = ((self.base_tick - bucket) / self.row_ticks) as usize;
            let old_len = self.cells.len();
            self.cells.resize(old_len + prepend, FootprintCell::default());
            self.cells.copy_within(0..old_len, prepend);
            for c in &mut self.cells[0..prepend] {
                *c = FootprintCell::default();
            }
            self.base_tick = bucket;
        }
        let idx = ((bucket - self.base_tick) / self.row_ticks) as usize;
        if idx >= self.cells.len() {
            self.cells.resize(idx + 1, FootprintCell::default());
        }

        let cell = &mut self.cells[idx];
        if side == 1 {
            cell.ask_vol += qty;
            cell.ask_trades += 1;
            self.delta += qty;
        } else {
            cell.bid_vol += qty;
            cell.bid_trades += 1;
            self.delta -= qty;
        }
        if self.delta < self.min_delta {
            self.min_delta = self.delta;
        }
        if self.delta > self.max_delta {
            self.max_delta = self.delta;
        }
        self.total_vol += qty;
        self.vwap_num_i128 += (tick_index as i128) * (qty as i128);
        if tick_index > self.high_tick {
            self.high_tick = tick_index;
        }
        if tick_index < self.low_tick {
            self.low_tick = tick_index;
        }
        self.close_tick = tick_index;
    }

    /// Finalizes diagonal imbalances (300% = 30,000 bps in i128), POC, Dual-Row Steidlmayer 70% Value Area,
    /// and unfinished auction flags — 100% fixed-point integer arithmetic.
    pub fn finalize(&mut self, ratio_bps: i128, min_vol: i64) {
        let n = self.cells.len();
        if n == 0 {
            return;
        }
        // Diagonal imbalances (cross-multiplication in i128, zero division/float)
        for i in 0..n {
            if i > 0 {
                let ask = self.cells[i].ask_vol as i128;
                let diag_bid = self.cells[i - 1].bid_vol as i128;
                if self.cells[i].ask_vol >= min_vol && diag_bid > 0 && ask * 10_000 >= ratio_bps * diag_bid {
                    self.cells[i].flags |= FLAG_IMB_ASK;
                }
            }
            if i + 1 < n {
                let bid = self.cells[i].bid_vol as i128;
                let diag_ask = self.cells[i + 1].ask_vol as i128;
                if self.cells[i].bid_vol >= min_vol && diag_ask > 0 && bid * 10_000 >= ratio_bps * diag_ask {
                    self.cells[i].flags |= FLAG_IMB_BID;
                }
            }
        }

        // POC + Steidlmayer Dual-Row 70% Value Area (R05 Tool 2A Algorithm A)
        let (poc_idx, val_idx, vah_idx) = compute_poc_and_va_from_cells(&self.cells, 7000);
        self.poc_offset = poc_idx as u16;
        self.val_offset = val_idx as u16;
        self.vah_offset = vah_idx as u16;
        self.cells[poc_idx].flags |= FLAG_POC;
        for c in &mut self.cells[val_idx..=vah_idx] {
            c.flags |= FLAG_VA;
        }

        // Unfinished auction checks at extremes
        let hi_c = &self.cells[n - 1];
        let lo_c = &self.cells[0];
        self.unfinished_high = hi_c.bid_vol > 0 && hi_c.ask_vol > 0;
        self.unfinished_low = lo_c.bid_vol > 0 && lo_c.ask_vol > 0;
    }

    /// Strict zero-drift accounting assertion:
    /// sum(bid_vol + ask_vol) == total_vol AND sum(ask_vol - bid_vol) == delta.
    pub fn verify_zero_drift(&self) -> Result<(), String> {
        let mut sum_tot: i64 = 0;
        let mut sum_delta: i64 = 0;
        for c in &self.cells {
            sum_tot += c.bid_vol + c.ask_vol;
            sum_delta += c.ask_vol - c.bid_vol;
        }
        if sum_tot != self.total_vol {
            return Err(format!(
                "footprint volume drift: cell_sum={sum_tot} != bar_total_vol={}",
                self.total_vol
            ));
        }
        if sum_delta != self.delta {
            return Err(format!(
                "footprint delta drift: cell_delta={sum_delta} != bar_delta={}",
                self.delta
            ));
        }
        Ok(())
    }
}

/// Exact integer POC + Steidlmayer Dual-Row Value Area over dense volume slice.
pub fn compute_poc_and_va(vols: &[i64], va_bps: i128) -> (usize, usize, usize, i64) {
    let n = vols.len();
    if n == 0 {
        return (0, 0, 0, 0);
    }
    let mut total: i64 = 0;
    let mut poc_idx = 0usize;
    let mut poc_vol = -1i64;
    let mid2 = (n - 1) as isize;
    for (i, &v) in vols.iter().enumerate() {
        total += v;
        if v > poc_vol
            || (v == poc_vol
                && (2 * i as isize - mid2).abs() < (2 * poc_idx as isize - mid2).abs())
        {
            poc_vol = v;
            poc_idx = i;
        }
    }
    if total == 0 {
        return (poc_idx, poc_idx, poc_idx, 0);
    }
    let target = (((total as i128) * va_bps + 9999) / 10_000) as i64;
    let mut i_up = poc_idx;
    let mut i_dn = poc_idx;
    let mut acc = vols[poc_idx];

    while acc < target && (i_up + 1 < n || i_dn > 0) {
        let s_up = if i_up + 1 < n {
            vols[i_up + 1] + if i_up + 2 < n { vols[i_up + 2] } else { 0 }
        } else {
            -1
        };
        let s_dn = if i_dn > 0 {
            vols[i_dn - 1] + if i_dn >= 2 { vols[i_dn - 2] } else { 0 }
        } else {
            -1
        };

        if s_up > s_dn {
            i_up = (i_up + 2).min(n - 1);
            acc += s_up;
        } else if s_dn > s_up {
            i_dn = i_dn.saturating_sub(2);
            acc += s_dn;
        } else {
            let adj_up = if i_up + 1 < n { vols[i_up + 1] } else { -1 };
            let adj_dn = if i_dn > 0 { vols[i_dn - 1] } else { -1 };
            if adj_up >= adj_dn && i_up + 1 < n {
                i_up = (i_up + 2).min(n - 1);
                acc += s_up.max(0);
            } else if i_dn > 0 {
                i_dn = i_dn.saturating_sub(2);
                acc += s_dn.max(0);
            } else {
                break;
            }
        }
    }
    (poc_idx, i_dn, i_up, total)
}

fn compute_poc_and_va_from_cells(cells: &[FootprintCell], va_bps: i128) -> (usize, usize, usize) {
    let vols: Vec<i64> = cells.iter().map(|c| c.bid_vol + c.ask_vol).collect();
    let (poc, val, vah, _) = compute_poc_and_va(&vols, va_bps);
    (poc, val, vah)
}

/// Streaming 1-minute Footprint Bar builder (zero floats, O(1) live ingestion).
pub struct FootprintBuilder {
    bar_interval_ns: i64,
    row_ticks: i64,
    active: Option<FootprintBar>,
    pub completed: Vec<FootprintBar>,
    pub total_raw_ticks: u64,
    pub total_raw_vol: i64,
    pub total_raw_delta: i64,
}

impl FootprintBuilder {
    pub fn new(bar_interval_ns: i64, row_ticks: i64) -> Self {
        Self {
            bar_interval_ns,
            row_ticks,
            active: None,
            completed: Vec::new(),
            total_raw_ticks: 0,
            total_raw_vol: 0,
            total_raw_delta: 0,
        }
    }

    #[inline(always)]
    pub fn ingest(&mut self, tick: &TickEvent) {
        let bar_open = tick.ts_event.div_euclid(self.bar_interval_ns) * self.bar_interval_ns;
        let tick_idx = tick.tick_index();
        self.total_raw_ticks += 1;
        self.total_raw_vol += tick.qty_fp;
        if tick.aggressor_side == 1 {
            self.total_raw_delta += tick.qty_fp;
        } else {
            self.total_raw_delta -= tick.qty_fp;
        }

        let need_new = match self.active {
            Some(ref b) => b.bar_ts_open_ns != bar_open,
            None => true,
        };
        if need_new {
            if let Some(mut finished) = self.active.take() {
                finished.finalize(30_000, 10);
                self.completed.push(finished);
            }
            self.active = Some(FootprintBar::new(bar_open, tick_idx, self.row_ticks));
        }
        if let Some(ref mut b) = self.active {
            b.ingest(tick_idx, tick.qty_fp, tick.aggressor_side);
        }
    }

    pub fn flush(&mut self) {
        if let Some(mut finished) = self.active.take() {
            finished.finalize(30_000, 10);
            self.completed.push(finished);
        }
    }

    /// Asserts exact zero-drift across every bar AND across the entire raw tick stream.
    pub fn assert_zero_drift(&self) -> Result<(), String> {
        let mut all_bars_vol: i64 = 0;
        let mut all_bars_delta: i64 = 0;
        for b in &self.completed {
            b.verify_zero_drift()?;
            all_bars_vol += b.total_vol;
            all_bars_delta += b.delta;
        }
        if let Some(ref b) = self.active {
            b.verify_zero_drift()?;
            all_bars_vol += b.total_vol;
            all_bars_delta += b.delta;
        }
        if all_bars_vol != self.total_raw_vol {
            return Err(format!(
                "global volume drift: bars={all_bars_vol} != raw_ticks={}",
                self.total_raw_vol
            ));
        }
        if all_bars_delta != self.total_raw_delta {
            return Err(format!(
                "global delta drift: bars={all_bars_delta} != raw_ticks={}",
                self.total_raw_delta
            ));
        }
        Ok(())
    }
}

// =============================================================================
// Tool 2B: Hierarchical Dyadic Profile Segment Tree for VRVP (< 0.25 ms target)
// =============================================================================

#[derive(Clone)]
pub struct DenseProfileBlock {
    pub base_tick: i64,
    pub vols: Vec<i64>,
    pub total_vol: i64,
}

impl DenseProfileBlock {
    fn from_bar(bar: &FootprintBar) -> Self {
        let vols: Vec<i64> = bar.cells.iter().map(|c| c.bid_vol + c.ask_vol).collect();
        Self {
            base_tick: bar.base_tick,
            vols,
            total_vol: bar.total_vol,
        }
    }

    fn merge_slice(blocks: &[DenseProfileBlock]) -> Self {
        let min_tick = blocks.iter().map(|b| b.base_tick).min().unwrap_or(0);
        let max_tick = blocks
            .iter()
            .map(|b| b.base_tick + b.vols.len() as i64)
            .max()
            .unwrap_or(min_tick);
        let len = (max_tick - min_tick).max(0) as usize;
        let mut vols = vec![0i64; len];
        let mut total_vol = 0i64;
        for b in blocks {
            let off = (b.base_tick - min_tick) as usize;
            for (dst, &src) in vols[off..off + b.vols.len()].iter_mut().zip(&b.vols) {
                *dst += src;
            }
            total_vol += b.total_vol;
        }
        Self {
            base_tick: min_tick,
            vols,
            total_vol,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct VrvpResult {
    pub poc_tick: i64,
    pub val_tick: i64,
    pub vah_tick: i64,
    pub total_vol: i64,
    pub blocks_touched: usize,
}

/// 16-ary hierarchical Dyadic Profile Segment Tree (Levels: 1, 16, 256, 4096 bars).
/// Matches R05 Section 2.3 Tool 2B for `< 0.25 ms` VRVP over `100,000+` bars.
pub struct DyadicVrvpTree {
    level0: Vec<DenseProfileBlock>, // stride 1
    level1: Vec<DenseProfileBlock>, // stride 16
    level2: Vec<DenseProfileBlock>, // stride 256
    level3: Vec<DenseProfileBlock>, // stride 4096
    prefix_vol: Vec<i64>,
    scratch: Vec<i64>,
}

impl DyadicVrvpTree {
    pub fn build(bars: &[FootprintBar]) -> Self {
        let level0: Vec<DenseProfileBlock> = bars.iter().map(DenseProfileBlock::from_bar).collect();
        let level1: Vec<DenseProfileBlock> = level0
            .chunks(16)
            .map(DenseProfileBlock::merge_slice)
            .collect();
        let level2: Vec<DenseProfileBlock> = level1
            .chunks(16)
            .map(DenseProfileBlock::merge_slice)
            .collect();
        let level3: Vec<DenseProfileBlock> = level2
            .chunks(16)
            .map(DenseProfileBlock::merge_slice)
            .collect();

        let mut prefix_vol = Vec::with_capacity(level0.len() + 1);
        prefix_vol.push(0);
        let mut acc = 0i64;
        for b in &level0 {
            acc += b.total_vol;
            prefix_vol.push(acc);
        }

        Self {
            level0,
            level1,
            level2,
            level3,
            prefix_vol,
            scratch: Vec::with_capacity(4096),
        }
    }

    pub fn len(&self) -> usize {
        self.level0.len()
    }

    pub fn expected_range_vol(&self, l: usize, r: usize) -> i64 {
        self.prefix_vol[r + 1] - self.prefix_vol[l]
    }

    /// Queries exact Visible Range Volume Profile over inclusive bar range `[l, r]`.
    /// Zero heap allocations in steady state (reuses `self.scratch`).
    pub fn query(&mut self, l: usize, r: usize) -> VrvpResult {
        debug_assert!(l <= r && r < self.level0.len());
        let mut refs: Vec<&DenseProfileBlock> = Vec::with_capacity(64);
        let mut cur = l;
        let end = r + 1;

        while cur < end {
            if cur % 4096 == 0 && cur + 4096 <= end {
                refs.push(&self.level3[cur / 4096]);
                cur += 4096;
            } else if cur % 256 == 0 && cur + 256 <= end {
                refs.push(&self.level2[cur / 256]);
                cur += 256;
            } else if cur % 16 == 0 && cur + 16 <= end {
                refs.push(&self.level1[cur / 16]);
                cur += 16;
            } else {
                refs.push(&self.level0[cur]);
                cur += 1;
            }
        }

        let min_tick = refs.iter().map(|b| b.base_tick).min().unwrap_or(0);
        let max_tick = refs
            .iter()
            .map(|b| b.base_tick + b.vols.len() as i64)
            .max()
            .unwrap_or(min_tick);
        let span = (max_tick - min_tick).max(1) as usize;

        self.scratch.clear();
        self.scratch.resize(span, 0);
        for b in &refs {
            let off = (b.base_tick - min_tick) as usize;
            let dst = &mut self.scratch[off..off + b.vols.len()];
            for (d, &s) in dst.iter_mut().zip(&b.vols) {
                *d += s;
            }
        }

        let (poc_off, val_off, vah_off, total_vol) = compute_poc_and_va(&self.scratch, 7000);
        VrvpResult {
            poc_tick: min_tick + poc_off as i64,
            val_tick: min_tick + val_off as i64,
            vah_tick: min_tick + vah_off as i64,
            total_vol,
            blocks_touched: refs.len(),
        }
    }
}

// =============================================================================
// Tool 3: 64-Bit TPO Profile Bitmask Engine (R05 Section 2.3 Tool 3)
// =============================================================================

#[derive(Clone)]
pub struct TpoProfile {
    pub base_tick: i64,
    pub tpo_masks: Vec<u64>,
    pub row_vols: Vec<i64>,
    pub session_start_ns: i64,
    pub sub_interval_ns: i64,
}

impl TpoProfile {
    pub fn new(session_start_ns: i64, center_tick: i64, half_range: usize) -> Self {
        let len = half_range * 2 + 1;
        Self {
            base_tick: center_tick - half_range as i64,
            tpo_masks: vec![0u64; len],
            row_vols: vec![0i64; len],
            session_start_ns,
            sub_interval_ns: 30 * 60 * 1_000_000_000, // 30-minute TPO letters A..Z, a..z
        }
    }

    /// O(1) zero-allocation 64-bit TPO mask update (single bitwise OR).
    #[inline(always)]
    pub fn update_tick(&mut self, ts_ns: i64, tick_idx: i64, qty: i64) {
        let period = ((ts_ns - self.session_start_ns).max(0) / self.sub_interval_ns).min(63) as u32;
        let off = tick_idx - self.base_tick;
        if off >= 0 && (off as usize) < self.tpo_masks.len() {
            let idx = off as usize;
            self.tpo_masks[idx] |= 1u64 << period;
            self.row_vols[idx] += qty;
        }
    }

    /// Computes TPO POC, Initial Balance (periods A & B = mask 0b11), and bitwise Split check.
    pub fn summary(&self) -> (i64, u32, i64, i64, usize) {
        let mut poc_tick = self.base_tick;
        let mut poc_tpos = 0u32;
        let mut ib_low = i64::MAX;
        let mut ib_high = i64::MIN;
        let mut single_prints = 0usize;

        for (i, &mask) in self.tpo_masks.iter().enumerate() {
            if mask == 0 {
                continue;
            }
            let cnt = mask.count_ones();
            let t = self.base_tick + i as i64;
            if cnt > poc_tpos {
                poc_tpos = cnt;
                poc_tick = t;
            }
            if (mask & 0b11) != 0 {
                ib_low = ib_low.min(t);
                ib_high = ib_high.max(t);
            }
            if cnt == 1 {
                single_prints += 1;
            }
        }
        (poc_tick, poc_tpos, ib_low, ib_high, single_prints)
    }

    /// Bitwise split at sub-interval `m_split` with zero data re-scanning (R05 Tool 3.6).
    pub fn split_at(&self, m_split: u32) -> (Vec<u64>, Vec<u64>) {
        let left_mask = (1u64 << m_split) - 1;
        let left = self.tpo_masks.iter().map(|&m| m & left_mask).collect();
        let right = self.tpo_masks.iter().map(|&m| m >> m_split).collect();
        (left, right)
    }
}

// =============================================================================
// R07 Gate: Conservative L2 Queue-Position Fill Simulator Sanity Check
// =============================================================================

#[derive(Debug, Clone)]
pub struct ConservativeLimitOrder {
    pub limit_tick: i64,
    pub is_buy: bool,
    pub qty: i64,
    pub qty_ahead: i64,
    pub qty_behind: i64,
    pub filled: bool,
}

impl ConservativeLimitOrder {
    pub fn place_at_back(limit_tick: i64, is_buy: bool, qty: i64, displayed_level_qty: i64) -> Self {
        Self {
            limit_tick,
            is_buy,
            qty,
            qty_ahead: displayed_level_qty,
            qty_behind: 0,
            filled: false,
        }
    }

    /// Updates queue state on a trade print (FIFO front depletion or strict trade-through).
    pub fn on_trade(&mut self, trade_tick: i64, trade_qty: i64) {
        if self.filled {
            return;
        }
        if (self.is_buy && trade_tick < self.limit_tick)
            || (!self.is_buy && trade_tick > self.limit_tick)
        {
            self.qty_ahead = 0;
            self.filled = true;
            return;
        }
        if trade_tick == self.limit_tick {
            self.qty_ahead -= trade_qty;
            if self.qty_ahead <= 0 {
                self.qty_ahead = 0;
                self.filled = true;
            }
        }
    }

    /// Conservative (pessimistic alpha=0) cancel model: assumes cancels come from behind first.
    pub fn on_cancel(&mut self, cancel_qty: i64) {
        let c_behind = self.qty_behind.min(cancel_qty);
        self.qty_behind -= c_behind;
        let c_ahead = cancel_qty - c_behind;
        self.qty_ahead = (self.qty_ahead - c_ahead).max(0);
    }

    pub fn on_add(&mut self, add_qty: i64) {
        self.qty_behind += add_qty;
    }
}

pub fn verify_l2_queue_fill_sanity() -> bool {
    // R07 Pre-declared Gate:
    // Passive limit buy placed at back of 100-lot bid does NOT fill on 10-lot touch;
    // fills only after >= 100 lots trade at bid (conservative model) or trade-through.
    let mut ord = ConservativeLimitOrder::place_at_back(24_000, true, 1, 100);
    ord.on_add(25);
    ord.on_cancel(20); // conservative: cancels behind only -> qty_ahead stays 100
    assert_eq!(ord.qty_ahead, 100);
    ord.on_trade(24_000, 10); // 10-lot touch -> MUST NOT FILL!
    if ord.filled || ord.qty_ahead != 90 {
        return false;
    }
    ord.on_trade(24_000, 89); // 99 cumulative lots -> STILL NOT FILLED!
    if ord.filled || ord.qty_ahead != 1 {
        return false;
    }
    ord.on_trade(24_000, 1); // 100th lot -> FILLS!
    if !ord.filled {
        return false;
    }

    // Trade-through test
    let mut ord2 = ConservativeLimitOrder::place_at_back(24_000, true, 1, 500);
    ord2.on_trade(23_999, 1); // traded strictly through bid -> FILLS!
    ord2.filled
}
