use allegedly_core::PriceTicks;
use allegedly_ipc::TpoRow128;
use std::collections::BTreeMap;

/// Canonical u128 single-session TPO Profile (up to 128 brackets, covering 96x15m 24h sessions; RT3-10, SV-17).
#[derive(Debug, Default)]
pub struct TpoProfile {
    rows: BTreeMap<i64, u128>,
    period_count: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TpoSummary {
    pub poc_tick: PriceTicks,
    pub vah_tick: PriceTicks,
    pub val_tick: PriceTicks,
}

impl TpoProfile {
    pub fn record_bracket(&mut self, period_idx: u16, low_tick: i64, high_tick: i64) {
        if period_idx >= 128 || low_tick > high_tick {
            return;
        }
        let bit = 1u128 << period_idx;
        for tick in low_tick..=high_tick {
            *self.rows.entry(tick).or_insert(0) |= bit;
        }
        self.period_count = self.period_count.max(period_idx + 1);
    }

    pub fn period_count(&self) -> u16 {
        self.period_count
    }

    pub fn rows_128(&self) -> Vec<TpoRow128> {
        self.rows
            .iter()
            .map(|(&price_tick, &mask)| TpoRow128 {
                price_tick,
                period_mask: [mask as u64, (mask >> 64) as u64],
            })
            .collect()
    }

    pub fn summary(&self) -> Option<TpoSummary> {
        if self.rows.is_empty() {
            return None;
        }
        let counts: Vec<(i64, u32)> = self
            .rows
            .iter()
            .map(|(&t, &m)| (t, m.count_ones()))
            .collect();
        let total: u64 = counts.iter().map(|(_, c)| u64::from(*c)).sum();
        let mut poc_idx = 0usize;
        let mut poc_cnt = 0u32;
        for (i, &(_, c)) in counts.iter().enumerate() {
            if c > poc_cnt {
                poc_cnt = c;
                poc_idx = i;
            }
        }
        let target = (total * 70) / 100;
        let mut acc = u64::from(poc_cnt);
        let mut lo = poc_idx;
        let mut hi = poc_idx;
        while acc < target && (lo > 0 || hi + 1 < counts.len()) {
            let up = if hi + 1 < counts.len() {
                counts[hi + 1].1
            } else {
                0
            };
            let dn = if lo > 0 { counts[lo - 1].1 } else { 0 };
            if up >= dn && hi + 1 < counts.len() {
                hi += 1;
                acc += u64::from(up);
            } else if lo > 0 {
                lo -= 1;
                acc += u64::from(dn);
            } else {
                break;
            }
        }
        Some(TpoSummary {
            poc_tick: PriceTicks(counts[poc_idx].0),
            vah_tick: PriceTicks(counts[hi].0),
            val_tick: PriceTicks(counts[lo].0),
        })
    }

    /// Exact SV-17 POC / VAH / VAL magnet snap returning exact i64 PriceTicks (0 sub-tick float error).
    pub fn magnet_snap(
        &self,
        cursor_tick: PriceTicks,
        max_distance_ticks: i64,
    ) -> Option<PriceTicks> {
        let s = self.summary()?;
        [s.poc_tick, s.vah_tick, s.val_tick]
            .into_iter()
            .filter_map(|lvl| {
                let d = (lvl.0 - cursor_tick.0).abs();
                (d <= max_distance_ticks).then_some((d, lvl))
            })
            .min_by_key(|(d, _)| *d)
            .map(|(_, lvl)| lvl)
    }
}
