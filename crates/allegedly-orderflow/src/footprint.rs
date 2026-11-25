use allegedly_core::{AggressorSide, Bps, NormalizedTick, PriceE9};
use allegedly_ipc::{BIT_BUY_IMBAL, BIT_POC, BIT_SELL_IMBAL, FootprintCell};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BarSlice {
    pub bar_ts_ns: i64,
    pub cell_offset: u32,
    pub cell_count: u32,
    pub open_tick: i64,
    pub high_tick: i64,
    pub low_tick: i64,
    pub close_tick: i64,
    pub total_vol_e9: i64,
    pub buy_vol_e9: i64,
    pub sell_vol_e9: i64,
    pub poc_tick: i64,
}

/// Flat contiguous 32-byte FootprintCell slab arena (ADR-0004, SV-13).
#[derive(Debug, Default)]
pub struct FootprintSlabArena {
    pub bars: Vec<BarSlice>,
    pub cells: Vec<FootprintCell>,
    active_bar_ts_ns: Option<i64>,
    active_cells: BTreeMap<i64, FootprintCell>,
    active_ohlc: Option<(i64, i64, i64, i64)>,
    active_totals: (i64, i64, i64),
    bar_interval_ns: i64,
    tick_size_e9: i64,
    imbalance_ratio_bps: Bps,
}

impl FootprintSlabArena {
    pub fn new(bar_interval_ns: i64, tick_size_e9: i64, imbalance_ratio_bps: Bps) -> Self {
        Self {
            bars: Vec::new(),
            cells: Vec::new(),
            active_bar_ts_ns: None,
            active_cells: BTreeMap::new(),
            active_ohlc: None,
            active_totals: (0, 0, 0),
            bar_interval_ns: bar_interval_ns.max(1),
            tick_size_e9: tick_size_e9.max(1),
            imbalance_ratio_bps,
        }
    }

    pub fn ingest_tick(&mut self, tick: &NormalizedTick) {
        let bucket = tick.ts_exchange_ns.div_euclid(self.bar_interval_ns) * self.bar_interval_ns;
        if let Some(cur) = self.active_bar_ts_ns
            && bucket > cur
        {
            self.seal_active_bar();
        }
        self.active_bar_ts_ns = Some(bucket);
        let price_tick = PriceE9(tick.price_e9)
            .to_ticks(self.tick_size_e9)
            .map(|t| t.0)
            .unwrap_or(0);

        self.active_ohlc = match self.active_ohlc {
            None => Some((price_tick, price_tick, price_tick, price_tick)),
            Some((o, h, l, _)) => Some((o, h.max(price_tick), l.min(price_tick), price_tick)),
        };

        let cell = self
            .active_cells
            .entry(price_tick)
            .or_insert(FootprintCell {
                price_tick,
                bid_vol_e9: 0,
                ask_vol_e9: 0,
                trade_count: 0,
                imbalance_flags: 0,
                _pad: [0; 3],
            });
        match tick.aggressor_side() {
            AggressorSide::Buy => {
                cell.ask_vol_e9 = cell.ask_vol_e9.saturating_add(tick.qty_e9);
                self.active_totals.1 = self.active_totals.1.saturating_add(tick.qty_e9);
            }
            AggressorSide::Sell => {
                cell.bid_vol_e9 = cell.bid_vol_e9.saturating_add(tick.qty_e9);
                self.active_totals.2 = self.active_totals.2.saturating_add(tick.qty_e9);
            }
            AggressorSide::Unknown => {}
        }
        self.active_totals.0 = self.active_totals.0.saturating_add(tick.qty_e9);
        cell.trade_count = cell.trade_count.saturating_add(1);
    }

    pub fn seal_active_bar(&mut self) {
        let Some(bar_ts_ns) = self.active_bar_ts_ns.take() else {
            return;
        };
        let Some((open_tick, high_tick, low_tick, close_tick)) = self.active_ohlc.take() else {
            return;
        };
        let mut sorted: Vec<FootprintCell> = self.active_cells.values().copied().collect();
        self.active_cells.clear();

        // Mark diagonal imbalances (exact integer bps: ask[p] * 10_000 >= bid[p-1] * ratio_bps)
        let ratio = i128::from(self.imbalance_ratio_bps.0.max(10_000));
        let mut poc_idx = 0usize;
        let mut max_vol = -1i64;
        for i in 0..sorted.len() {
            let tot = sorted[i].bid_vol_e9.saturating_add(sorted[i].ask_vol_e9);
            if tot > max_vol {
                max_vol = tot;
                poc_idx = i;
            }
            if i > 0 && sorted[i].price_tick == sorted[i - 1].price_tick + 1 {
                let ask_hi = i128::from(sorted[i].ask_vol_e9);
                let bid_lo = i128::from(sorted[i - 1].bid_vol_e9);
                if ask_hi > 0 && ask_hi * 10_000 >= bid_lo * ratio {
                    sorted[i].imbalance_flags |= BIT_BUY_IMBAL;
                }
                if bid_lo > 0 && bid_lo * 10_000 >= ask_hi * ratio {
                    sorted[i - 1].imbalance_flags |= BIT_SELL_IMBAL;
                }
            }
        }
        let poc_tick = if let Some(poc_cell) = sorted.get_mut(poc_idx) {
            poc_cell.imbalance_flags |= BIT_POC;
            poc_cell.price_tick
        } else {
            close_tick
        };

        let offset = self.cells.len() as u32;
        let count = sorted.len() as u32;
        self.cells.extend_from_slice(&sorted);
        self.bars.push(BarSlice {
            bar_ts_ns,
            cell_offset: offset,
            cell_count: count,
            open_tick,
            high_tick,
            low_tick,
            close_tick,
            total_vol_e9: self.active_totals.0,
            buy_vol_e9: self.active_totals.1,
            sell_vol_e9: self.active_totals.2,
            poc_tick,
        });
        self.active_totals = (0, 0, 0);
    }

    pub fn active_cells_snapshot(&self) -> Vec<FootprintCell> {
        self.active_cells.values().copied().collect()
    }

    /// Exact heap memory consumed by contiguous BarSlice + FootprintCell slabs (UV-04 / SV-13).
    pub fn estimated_heap_bytes(&self) -> usize {
        self.bars.capacity() * std::mem::size_of::<BarSlice>()
            + self.cells.capacity() * std::mem::size_of::<FootprintCell>()
            + self.active_cells.len()
                * (std::mem::size_of::<i64>() + std::mem::size_of::<FootprintCell>() + 32)
    }

    /// Evict oldest historical bars beyond `keep_bars`, compacting the contiguous cell slab.
    pub fn evict_oldest_bars(&mut self, keep_bars: usize) {
        if self.bars.len() <= keep_bars {
            return;
        }
        let drop_bars = self.bars.len() - keep_bars;
        let first_kept_cell = self.bars[drop_bars].cell_offset as usize;
        self.bars.drain(..drop_bars);
        if first_kept_cell > 0 && first_kept_cell <= self.cells.len() {
            self.cells.drain(..first_kept_cell);
            let shift = first_kept_cell as u32;
            for b in &mut self.bars {
                b.cell_offset -= shift;
            }
        }
        self.bars.shrink_to_fit();
        self.cells.shrink_to_fit();
    }
}
