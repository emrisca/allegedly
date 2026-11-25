use allegedly_ipc::{VolumeProfileBin, VolumeProfileSummary};
use std::collections::BTreeMap;

/// 16-ary Dyadic Segment Tree for sub-millisecond Visible-Range Volume Profile (VRVP)
/// queries over 100k+ bars (ADR-0006, S08, SV-12).
#[derive(Debug, Default)]
pub struct DyadicVrvpTree {
    /// Level 0: per-bar sparse bins (price_tick -> (bid_vol_e9, ask_vol_e9))
    leaves: Vec<Vec<(i64, i64, i64)>>,
    /// Level 1: 16-bar aggregated nodes
    level1: Vec<Vec<(i64, i64, i64)>>,
    /// Level 2: 256-bar aggregated nodes
    level2: Vec<Vec<(i64, i64, i64)>>,
}

fn merge_bins(sources: &[&[(i64, i64, i64)]]) -> Vec<(i64, i64, i64)> {
    let mut map: BTreeMap<i64, (i64, i64)> = BTreeMap::new();
    for src in sources {
        for &(tick, bid, ask) in *src {
            let e = map.entry(tick).or_insert((0, 0));
            e.0 = e.0.saturating_add(bid);
            e.1 = e.1.saturating_add(ask);
        }
    }
    map.into_iter().map(|(t, (b, a))| (t, b, a)).collect()
}

impl DyadicVrvpTree {
    pub fn from_bar_profiles(bars: Vec<Vec<(i64, i64, i64)>>) -> Self {
        let mut level1 = Vec::with_capacity(bars.len().div_ceil(16));
        for chunk in bars.chunks(16) {
            let refs: Vec<&[(i64, i64, i64)]> = chunk.iter().map(Vec::as_slice).collect();
            level1.push(merge_bins(&refs));
        }
        let mut level2 = Vec::with_capacity(level1.len().div_ceil(16));
        for chunk in level1.chunks(16) {
            let refs: Vec<&[(i64, i64, i64)]> = chunk.iter().map(Vec::as_slice).collect();
            level2.push(merge_bins(&refs));
        }
        Self {
            leaves: bars,
            level1,
            level2,
        }
    }

    /// Query visible bar range `[start, end)` and compute exact integer POC / VAH / VAL (70% value area).
    pub fn query(&self, start: usize, end: usize) -> (VolumeProfileSummary, Vec<VolumeProfileBin>) {
        let end = end.min(self.leaves.len());
        if start >= end {
            return (VolumeProfileSummary::default(), Vec::new());
        }
        let mut agg: BTreeMap<i64, (i64, i64)> = BTreeMap::new();
        let mut idx = start;
        while idx < end {
            let slice: &[(i64, i64, i64)] = if idx.is_multiple_of(256) && idx + 256 <= end {
                let s = &self.level2[idx / 256];
                idx += 256;
                s
            } else if idx.is_multiple_of(16) && idx + 16 <= end {
                let s = &self.level1[idx / 16];
                idx += 16;
                s
            } else {
                let s = &self.leaves[idx];
                idx += 1;
                s
            };
            for &(tick, bid, ask) in slice {
                let e = agg.entry(tick).or_insert((0, 0));
                e.0 = e.0.saturating_add(bid);
                e.1 = e.1.saturating_add(ask);
            }
        }

        let bins: Vec<VolumeProfileBin> = agg
            .into_iter()
            .map(|(price_tick, (bid_vol_e9, ask_vol_e9))| VolumeProfileBin {
                price_tick,
                bid_vol_e9,
                ask_vol_e9,
            })
            .collect();

        let summary = compute_value_area(&bins, 7_000);
        (summary, bins)
    }
}

/// Exact integer 70% (7_000 bps) CME Market Profile Value Area algorithm (zero floats).
pub fn compute_value_area(bins: &[VolumeProfileBin], value_area_bps: i128) -> VolumeProfileSummary {
    if bins.is_empty() {
        return VolumeProfileSummary::default();
    }
    let mut total_vol: i128 = 0;
    let mut poc_idx = 0usize;
    let mut poc_vol: i128 = -1;
    for (i, b) in bins.iter().enumerate() {
        let v = i128::from(b.bid_vol_e9) + i128::from(b.ask_vol_e9);
        total_vol += v;
        if v > poc_vol {
            poc_vol = v;
            poc_idx = i;
        }
    }
    let target = (total_vol * value_area_bps) / 10_000;
    let mut acc = poc_vol;
    let mut lo = poc_idx;
    let mut hi = poc_idx;

    while acc < target && (lo > 0 || hi + 1 < bins.len()) {
        let up_vol: i128 = if hi + 1 < bins.len() {
            i128::from(bins[hi + 1].bid_vol_e9) + i128::from(bins[hi + 1].ask_vol_e9)
        } else {
            -1
        };
        let dn_vol: i128 = if lo > 0 {
            i128::from(bins[lo - 1].bid_vol_e9) + i128::from(bins[lo - 1].ask_vol_e9)
        } else {
            -1
        };
        if up_vol >= dn_vol && hi + 1 < bins.len() {
            hi += 1;
            acc += up_vol;
        } else if lo > 0 {
            lo -= 1;
            acc += dn_vol;
        } else {
            break;
        }
    }

    VolumeProfileSummary {
        poc_price: bins[poc_idx].price_tick,
        vah_price: bins[hi].price_tick,
        val_price: bins[lo].price_tick,
    }
}
