pub mod builtins;
pub mod luau_sandbox;

pub use builtins::{cvd_series, ema, footprint_delta_series, sma, vwap_series, wilder_rsi};
pub use luau_sandbox::{
    DEFAULT_INSTRUCTION_BUDGET, GLOBAL_STUDY_MEMORY_CAP_BYTES, GlobalStudyMemoryPool,
    LuauStudyRunner, PER_STUDY_DEFAULT_CAP_BYTES, StudySandboxError,
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
    pub values: Vec<Option<f64>>,
    pub memory_pool_reserved_bytes: usize,
    pub memory_pool_cap_bytes: usize,
}

fn sanitize_series(vals: Vec<f64>) -> Vec<Option<f64>> {
    vals.into_iter()
        .map(|v| if v.is_finite() { Some(v) } else { None })
        .collect()
}

/// Evaluate either a clean-room built-in Study or a sandboxed Luau Study under the 64 MiB global pool cap.
pub fn evaluate_study_request(
    pool: &GlobalStudyMemoryPool,
    req: &StudyRunRequest,
) -> Result<StudyRunResponse, String> {
    if let Some(script) = &req.luau_script {
        let runner = LuauStudyRunner::new(PER_STUDY_DEFAULT_CAP_BYTES, DEFAULT_INSTRUCTION_BUDGET)
            .map_err(|e| e.to_string())?;
        let raw = runner
            .eval_study_series(pool, 2 * 1024 * 1024, script, &req.closes)
            .map_err(|e| e.to_string())?;
        return Ok(StudyRunResponse {
            id: req.id.clone(),
            label: format!("Luau ({})", req.id),
            overlay: true,
            values: sanitize_series(raw),
            memory_pool_reserved_bytes: pool.reserved_bytes(),
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
    fn luau_sandbox_blocks_hostile_escapes_and_enforces_64mib_pool() {
        let pool = GlobalStudyMemoryPool::default();
        let runner = LuauStudyRunner::new(PER_STUDY_DEFAULT_CAP_BYTES, 10_000).unwrap();

        // 1. Valid study runs cleanly
        let out = runner
            .eval_study_series(
                &pool,
                1024 * 1024,
                "local o = {}; for i = 1, #close do o[i] = close[i] * 2 end; return o",
                &[10.0, 20.0, 30.0],
            )
            .unwrap();
        assert_eq!(out, vec![20.0, 40.0, 60.0]);
        assert_eq!(pool.reserved_bytes(), 0);

        // 2. Hostile os/io escape blocked
        assert!(
            runner
                .eval_study_series(&pool, 1024 * 1024, "return os.execute('echo pwn')", &[1.0])
                .is_err()
        );

        // 3. Infinite loop terminated by instruction budget
        assert!(
            runner
                .eval_study_series(&pool, 1024 * 1024, "while true do end", &[1.0])
                .is_err()
        );

        // 4. Global 64 MiB pool cap enforced
        let err = pool.try_reserve(GLOBAL_STUDY_MEMORY_CAP_BYTES + 1);
        assert!(matches!(
            err,
            Err(StudySandboxError::GlobalPoolExceeded { .. })
        ));
    }
}
