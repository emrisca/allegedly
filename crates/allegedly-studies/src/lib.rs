pub mod builtins;
pub mod luau_sandbox;

pub use builtins::{cvd_series, ema, footprint_delta_series, sma, vwap_series, wilder_rsi};
pub use luau_sandbox::{
    DEFAULT_INSTRUCTION_BUDGET, GLOBAL_STUDY_MEMORY_CAP_BYTES, GlobalStudyMemoryPool,
    LuauStudyRunner, PER_STUDY_DEFAULT_CAP_BYTES, PoolReservation, StudySandboxError,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuiltinStudyKind {
    Sma,
    Ema,
    WilderRsi,
    Vwap,
    Cvd,
    FootprintDelta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyRunRequest {
    pub id: String,
    pub builtin: Option<BuiltinStudyKind>,
    pub period: Option<usize>,
    pub luau_script: Option<String>,
    pub closes: Vec<f64>,
    #[serde(default)]
    pub volumes: Vec<f64>,
    #[serde(default)]
    pub buy_volumes: Vec<f64>,
    #[serde(default)]
    pub sell_volumes: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyRunResponse {
    pub id: String,
    pub label: String,
    pub overlay: bool,
    /// `None` encodes warm-up NaN values cleanly over JSON.
    pub values: Vec<Option<f64>>,
    pub memory_pool_reserved_bytes: usize,
    pub memory_pool_peak_bytes: usize,
    pub memory_pool_cap_bytes: usize,
}

fn sanitize_series(raw: Vec<f64>) -> Vec<Option<f64>> {
    raw.into_iter()
        .map(|v| if v.is_finite() { Some(v) } else { None })
        .collect()
}

pub fn evaluate_study_request(
    pool: &GlobalStudyMemoryPool,
    req: &StudyRunRequest,
) -> Result<StudyRunResponse, String> {
    if let Some(script) = &req.luau_script {
        let cap = PER_STUDY_DEFAULT_CAP_BYTES;
        let runner =
            LuauStudyRunner::new(cap, DEFAULT_INSTRUCTION_BUDGET).map_err(|e| e.to_string())?;
        let raw = runner
            .eval_study_series(pool, cap, script, &req.closes)
            .map_err(|e| e.to_string())?;
        return Ok(StudyRunResponse {
            id: req.id.clone(),
            label: format!("Luau ({})", req.id),
            overlay: true,
            values: sanitize_series(raw),
            memory_pool_reserved_bytes: pool.reserved_bytes(),
            memory_pool_peak_bytes: pool.peak_reserved_bytes(),
            memory_pool_cap_bytes: GLOBAL_STUDY_MEMORY_CAP_BYTES,
        });
    }

    let kind = req
        .builtin
        .clone()
        .ok_or_else(|| "either builtin or luau_script must be provided".to_string())?;
    let period = req.period.unwrap_or(14).clamp(1, 500);

    let (label, overlay, raw) = match kind {
        BuiltinStudyKind::Sma => (format!("SMA({period})"), true, sma(&req.closes, period)),
        BuiltinStudyKind::Ema => (format!("EMA({period})"), true, ema(&req.closes, period)),
        BuiltinStudyKind::WilderRsi => (
            format!("RSI({period})"),
            false,
            wilder_rsi(&req.closes, period),
        ),
        BuiltinStudyKind::Vwap => {
            let vols = if req.volumes.len() == req.closes.len() {
                req.volumes.clone()
            } else {
                vec![1.0; req.closes.len()]
            };
            ("VWAP".to_string(), true, vwap_series(&req.closes, &vols))
        }
        BuiltinStudyKind::Cvd => (
            "CVD".to_string(),
            false,
            cvd_series(&req.buy_volumes, &req.sell_volumes),
        ),
        BuiltinStudyKind::FootprintDelta => (
            "Footprint Delta".to_string(),
            false,
            footprint_delta_series(&req.buy_volumes, &req.sell_volumes),
        ),
    };

    Ok(StudyRunResponse {
        id: req.id.clone(),
        label,
        overlay,
        values: sanitize_series(raw),
        memory_pool_reserved_bytes: pool.reserved_bytes(),
        memory_pool_peak_bytes: pool.peak_reserved_bytes(),
        memory_pool_cap_bytes: GLOBAL_STUDY_MEMORY_CAP_BYTES,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_sma_ema_rsi_sanity() {
        let closes = [10.0, 11.0, 12.0, 13.0, 14.0, 15.0];
        let s = sma(&closes, 3);
        assert!(s[1].is_nan());
        assert!((s[2] - 11.0).abs() < 1e-9);
        assert!((s[5] - 14.0).abs() < 1e-9);

        let r = wilder_rsi(&closes, 3);
        assert!((r[5] - 100.0).abs() < 1e-9);
    }

    #[test]
    fn luau_sandbox_blocks_escapes_nondeterminism_stale_interrupt_and_64mib_pool() {
        let pool = GlobalStudyMemoryPool::default();
        let runner = LuauStudyRunner::new(PER_STUDY_DEFAULT_CAP_BYTES, 10_000).unwrap();

        // 1. Valid study runs cleanly over zero-copy FloatSeriesView (`close`)
        let out = runner
            .eval_study_series(
                &pool,
                PER_STUDY_DEFAULT_CAP_BYTES,
                "local o = {}; for i = 1, #close do o[i] = close[i] * 2 end; return o",
                &[10.0, 20.0, 30.0],
            )
            .unwrap();
        assert_eq!(out, vec![20.0, 40.0, 60.0]);
        assert_eq!(pool.reserved_bytes(), 0);
        assert_eq!(pool.peak_reserved_bytes(), PER_STUDY_DEFAULT_CAP_BYTES);

        // 2. Hostile os/io escape blocked
        assert!(
            runner
                .eval_study_series(
                    &pool,
                    PER_STUDY_DEFAULT_CAP_BYTES,
                    "return os.execute('echo pwn')",
                    &[1.0]
                )
                .is_err()
        );

        // 3. Non-deterministic math.random is stripped for SV-09 replay determinism (RTSD-07)
        assert!(
            runner
                .eval_study_series(
                    &pool,
                    PER_STUDY_DEFAULT_CAP_BYTES,
                    "return { math.random() }",
                    &[1.0]
                )
                .is_err()
        );

        // 4. Infinite loop terminated by instruction budget AND RAII drop guard restores clean runner reuse
        assert!(
            runner
                .eval_study_series(
                    &pool,
                    PER_STUDY_DEFAULT_CAP_BYTES,
                    "while true do end",
                    &[1.0]
                )
                .is_err()
        );
        let after_timeout = runner
            .eval_study_series(
                &pool,
                PER_STUDY_DEFAULT_CAP_BYTES,
                "return { close[1] + 5 }",
                &[7.0],
            )
            .unwrap();
        assert_eq!(after_timeout, vec![12.0]);

        // 5. Global 64 MiB pool strictly allows at most 8 concurrent 8 MiB VMs (zero 4x bypass)
        let mut guards = Vec::new();
        for _ in 0..8 {
            guards.push(pool.try_reserve(PER_STUDY_DEFAULT_CAP_BYTES).unwrap());
        }
        assert_eq!(pool.reserved_bytes(), GLOBAL_STUDY_MEMORY_CAP_BYTES);
        assert!(matches!(
            pool.try_reserve(1),
            Err(StudySandboxError::GlobalPoolExceeded { .. })
        ));
        drop(guards);
        assert_eq!(pool.reserved_bytes(), 0);
    }
}
