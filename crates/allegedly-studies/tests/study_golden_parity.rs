//! Deterministic textbook golden-value parity tests for clean-room built-in studies
//! and sandboxed Luau runtime (ADR-0005). Note: External TA-Lib C oracle cross-check
//! remains explicitly tracked under UV-07 until a dev-only TA-Lib binary is wired in CI.

use allegedly_studies::{
    BuiltinStudyKind, GlobalStudyMemoryPool, StudyRunRequest, cvd_series, ema,
    evaluate_study_request, footprint_delta_series, sma, vwap_series, wilder_rsi,
};

#[test]
fn golden_textbook_parity_sma_ema_wilder_rsi_vwap_cvd_delta() {
    // 1. SMA(3) & EMA(3) exact analytical values
    let prices = [10.0, 12.0, 14.0, 16.0, 14.0, 18.0];
    let s3 = sma(&prices, 3);
    assert!(s3[0].is_nan() && s3[1].is_nan());
    assert!((s3[2] - 12.0).abs() < 1e-12);
    assert!((s3[3] - 14.0).abs() < 1e-12);
    assert!((s3[4] - (44.0 / 3.0)).abs() < 1e-12);
    assert!((s3[5] - 16.0).abs() < 1e-12);

    // EMA(3): k = 2/(3+1) = 0.5; seed = 12.0 -> 14.0 -> 14.0 -> 16.0
    let e3 = ema(&prices, 3);
    assert!(e3[0].is_nan() && e3[1].is_nan());
    assert!((e3[2] - 12.0).abs() < 1e-12);
    assert!((e3[3] - 14.0).abs() < 1e-12);
    assert!((e3[4] - 14.0).abs() < 1e-12);
    assert!((e3[5] - 16.0).abs() < 1e-12);

    // 2. Wilder RSI(4):
    // diffs: +2, +2, -1, +3 -> avg_gain = 7/4 = 1.75, avg_loss = 1/4 = 0.25 -> RS = 7 -> RSI = 87.5
    // next diff: -2 -> avg_gain = (1.75*3 + 0)/4 = 1.3125, avg_loss = (0.25*3 + 2)/4 = 0.6875
    // -> RS = 21/11 -> RSI = 100 - 100/(1 + 21/11) = 65.625
    let rsi_in = [100.0, 102.0, 104.0, 103.0, 106.0, 104.0];
    let r4 = wilder_rsi(&rsi_in, 4);
    assert!(r4[3].is_nan());
    assert!((r4[4] - 87.5).abs() < 1e-12);
    assert!((r4[5] - 65.625).abs() < 1e-12);

    // 3. VWAP exact analytical values
    let vw = vwap_series(&[100.0, 102.0, 104.0], &[10.0, 30.0, 10.0]);
    assert!((vw[0] - 100.0).abs() < 1e-12);
    assert!((vw[1] - 101.5).abs() < 1e-12);
    assert!((vw[2] - 102.0).abs() < 1e-12);

    // 4. Footprint Delta & CVD
    let buy = [12.5, 4.0, 20.0];
    let sell = [2.5, 9.0, 5.0];
    let delta = footprint_delta_series(&buy, &sell);
    let cvd = cvd_series(&buy, &sell);
    assert_eq!(delta, vec![10.0, -5.0, 15.0]);
    assert_eq!(cvd, vec![10.0, 5.0, 20.0]);
}

#[test]
fn study_engine_runs_builtin_and_sandboxed_luau_cleanly() {
    let pool = GlobalStudyMemoryPool::default();
    let closes = vec![100.0, 101.0, 102.0, 103.0, 104.0];

    let builtin_res = evaluate_study_request(
        &pool,
        &StudyRunRequest {
            id: "sma-3".into(),
            builtin: Some(BuiltinStudyKind::Sma),
            period: Some(3),
            luau_script: None,
            closes: closes.clone(),
            volumes: vec![],
            buy_volumes: vec![],
            sell_volumes: vec![],
        },
    )
    .unwrap();
    assert!(builtin_res.overlay);
    assert_eq!(builtin_res.values[0], None);
    assert_eq!(builtin_res.values[2], Some(101.0));
    assert_eq!(builtin_res.values[4], Some(103.0));

    let luau_res = evaluate_study_request(
        &pool,
        &StudyRunRequest {
            id: "custom-mid".into(),
            builtin: None,
            period: None,
            luau_script: Some(
                "local out = {}; for i = 1, #close do out[i] = close[i] + 0.5 end; return out"
                    .into(),
            ),
            closes,
            volumes: vec![],
            buy_volumes: vec![],
            sell_volumes: vec![],
        },
    )
    .unwrap();
    assert_eq!(luau_res.values[0], Some(100.5));
    assert_eq!(luau_res.values[4], Some(104.5));
    assert_eq!(pool.reserved_bytes(), 0);
}
