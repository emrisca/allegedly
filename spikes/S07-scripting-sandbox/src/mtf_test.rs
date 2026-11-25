use crate::dataset::BarInput;
use crate::native_study::NativeStudy;

/// Verifies R06 Pre-Declared Gate:
/// 1) MTF Non-Repainting Determinism Test (1m base + 15m HTF):
///    A 1m base bar closing at `t_base_close` may ONLY observe 15m HTF bars whose
///    `t_htf_close <= t_base_close`. Batch historical load vs. incremental live tick-by-tick
///    replay MUST produce 100% bit-identical (`u64::to_bits`) output series.
/// 2) Intrabar Rollback Determinism Test (`var` rollback vs bar-close commit).
pub fn run_mtf_and_rollback_tests(bars: &[BarInput]) -> (bool, usize, bool) {
    // 1. MTF Non-Repainting Test (1m -> 15m HTF EMA-20)
    const HTF_MULT: usize = 15;
    let n = bars.len().min(15_000); // 1,000 15m bars

    // Mode A: Historical Batch Pass (builds all 15m HTF bars first, then aligns by t_htf_close <= t_base_close)
    let mut htf_bars: Vec<(usize, BarInput)> = Vec::new();
    for chunk_idx in 0..(n / HTF_MULT) {
        let start = chunk_idx * HTF_MULT;
        let end = start + HTF_MULT - 1; // close index of 15m bar
        let mut high = i64::MIN;
        let mut low = i64::MAX;
        let mut vol = 0i64;
        for b in &bars[start..=end] {
            high = high.max(b.high_tick);
            low = low.min(b.low_tick);
            vol += b.volume;
        }
        let close_bar = bars[end];
        htf_bars.push((
            end,
            BarInput {
                high_tick: high,
                low_tick: low,
                close_tick: close_bar.close_tick,
                volume: vol,
                session_id: close_bar.session_id,
            },
        ));
    }

    let mut htf_study_batch = NativeStudy::new();
    let mut htf_ema_by_close: Vec<(usize, u64)> = Vec::with_capacity(htf_bars.len());
    for &(close_idx, ref hb) in &htf_bars {
        htf_study_batch.step(hb);
        htf_ema_by_close.push((close_idx, htf_study_batch.output().ema.to_bits()));
    }

    let mut batch_aligned: Vec<u64> = Vec::with_capacity(n);
    let mut cursor = 0usize;
    let mut last_confirmed_bits = 0.0_f64.to_bits();
    for base_idx in 0..n {
        while cursor < htf_ema_by_close.len() && htf_ema_by_close[cursor].0 <= base_idx {
            last_confirmed_bits = htf_ema_by_close[cursor].1;
            cursor += 1;
        }
        batch_aligned.push(last_confirmed_bits);
    }

    // Mode B: Live Tick-by-Tick / Bar-by-Bar Streaming Replay (only sees base bars up to current index)
    let mut htf_study_live = NativeStudy::new();
    let mut live_aligned: Vec<u64> = Vec::with_capacity(n);
    let mut cur_high = i64::MIN;
    let mut cur_low = i64::MAX;
    let mut cur_vol = 0i64;
    let mut live_last_confirmed_bits = 0.0_f64.to_bits();

    for (base_idx, b) in bars[..n].iter().enumerate() {
        cur_high = cur_high.max(b.high_tick);
        cur_low = cur_low.min(b.low_tick);
        cur_vol += b.volume;

        if (base_idx + 1) % HTF_MULT == 0 {
            let hb = BarInput {
                high_tick: cur_high,
                low_tick: cur_low,
                close_tick: b.close_tick,
                volume: cur_vol,
                session_id: b.session_id,
            };
            htf_study_live.step(&hb);
            live_last_confirmed_bits = htf_study_live.output().ema.to_bits();
            cur_high = i64::MIN;
            cur_low = i64::MAX;
            cur_vol = 0;
        }
        live_aligned.push(live_last_confirmed_bits);
    }

    let mtf_mismatches = batch_aligned
        .iter()
        .zip(live_aligned.iter())
        .filter(|(a, b)| a != b)
        .count();

    // 2. Intrabar Rollback Determinism Test
    let mut clean = NativeStudy::new();
    let mut with_intrabar = NativeStudy::new();
    for b in &bars[..500] {
        clean.step(b);

        // Simulate 3 noisy intrabar ticks before the final bar close
        with_intrabar.commit_snapshot();
        for jitter in [-5i64, 9, -3] {
            with_intrabar.rollback();
            let mut fake = *b;
            fake.close_tick += jitter;
            fake.high_tick = fake.high_tick.max(fake.close_tick);
            fake.low_tick = fake.low_tick.min(fake.close_tick);
            fake.volume = (b.volume / 2).max(1);
            with_intrabar.step(&fake);
        }
        with_intrabar.rollback();
        with_intrabar.step(b);
    }
    let clean_out = clean.output();
    let rb_out = with_intrabar.output();
    let rollback_ok = clean_out.ema.to_bits() == rb_out.ema.to_bits()
        && clean_out.rsi.to_bits() == rb_out.rsi.to_bits()
        && clean_out.vwap.to_bits() == rb_out.vwap.to_bits()
        && clean_out.realized_pnl.to_bits() == rb_out.realized_pnl.to_bits()
        && clean_out.trades == rb_out.trades;

    (mtf_mismatches == 0, n, rollback_ok)
}
