pub mod builtins;
pub mod luau_sandbox;

pub use builtins::{ema, sma, wilder_rsi};
pub use luau_sandbox::{
    DEFAULT_INSTRUCTION_BUDGET, GLOBAL_STUDY_MEMORY_CAP_BYTES, GlobalStudyMemoryPool,
    LuauStudyRunner, PER_STUDY_DEFAULT_CAP_BYTES, StudySandboxError,
};

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
