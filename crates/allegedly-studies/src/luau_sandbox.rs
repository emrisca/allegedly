use mlua::{Lua, VmState};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use thiserror::Error;

/// Global terminal-wide Study memory ceiling (RT3-08, ADR-0005, SV-13).
pub const GLOBAL_STUDY_MEMORY_CAP_BYTES: usize = 64 * 1024 * 1024;
pub const PER_STUDY_DEFAULT_CAP_BYTES: usize = 8 * 1024 * 1024;
pub const DEFAULT_INSTRUCTION_BUDGET: usize = 250_000;

#[derive(Debug, Error)]
pub enum StudySandboxError {
    #[error("Luau runtime error: {0}")]
    Lua(#[from] mlua::Error),
    #[error("global Study memory pool exceeded ({requested} bytes would exceed 64 MiB cap)")]
    GlobalPoolExceeded { requested: usize },
}

/// Shared terminal-wide Study memory pool accounting (<= 64 MiB hard cap).
#[derive(Debug, Default)]
pub struct GlobalStudyMemoryPool {
    reserved_bytes: AtomicUsize,
}

impl GlobalStudyMemoryPool {
    pub fn try_reserve(&self, bytes: usize) -> Result<PoolReservation<'_>, StudySandboxError> {
        let mut cur = self.reserved_bytes.load(Ordering::SeqCst);
        loop {
            let next = cur.saturating_add(bytes);
            if next > GLOBAL_STUDY_MEMORY_CAP_BYTES {
                return Err(StudySandboxError::GlobalPoolExceeded { requested: next });
            }
            match self.reserved_bytes.compare_exchange(
                cur,
                next,
                Ordering::SeqCst,
                Ordering::SeqCst,
            ) {
                Ok(_) => {
                    return Ok(PoolReservation { pool: self, bytes });
                }
                Err(actual) => cur = actual,
            }
        }
    }

    pub fn reserved_bytes(&self) -> usize {
        self.reserved_bytes.load(Ordering::SeqCst)
    }
}

pub struct PoolReservation<'a> {
    pool: &'a GlobalStudyMemoryPool,
    bytes: usize,
}

impl Drop for PoolReservation<'_> {
    fn drop(&mut self) {
        self.pool
            .reserved_bytes
            .fetch_sub(self.bytes, Ordering::SeqCst);
    }
}

/// Sandboxed Luau Study runner: strips hostile globals, enforces memory cap & instruction budget.
pub struct LuauStudyRunner {
    lua: Lua,
    max_instructions: usize,
}

impl LuauStudyRunner {
    pub fn new(
        per_study_mem_bytes: usize,
        max_instructions: usize,
    ) -> Result<Self, StudySandboxError> {
        let lua = Lua::new();
        lua.sandbox(true)?;
        lua.set_memory_limit(per_study_mem_bytes.min(GLOBAL_STUDY_MEMORY_CAP_BYTES))?;
        let globals = lua.globals();
        for banned in [
            "os", "io", "package", "debug", "dofile", "loadfile", "require",
        ] {
            globals.set(banned, mlua::Value::Nil)?;
        }
        Ok(Self {
            lua,
            max_instructions,
        })
    }

    pub fn eval_study_series(
        &self,
        pool: &GlobalStudyMemoryPool,
        reserve_bytes: usize,
        script: &str,
        closes: &[f64],
    ) -> Result<Vec<f64>, StudySandboxError> {
        let _guard = pool.try_reserve(reserve_bytes)?;
        let budget = self.max_instructions;
        let ticks = Arc::new(AtomicUsize::new(0));
        let ticks_hook = ticks.clone();
        self.lua.set_interrupt(move |_| {
            let n = ticks_hook.fetch_add(1, Ordering::Relaxed);
            if n > budget {
                Err(mlua::Error::RuntimeError(
                    "study instruction budget exceeded".into(),
                ))
            } else {
                Ok(VmState::Continue)
            }
        });

        let tbl = self.lua.create_table_with_capacity(closes.len(), 0)?;
        for (idx, &v) in closes.iter().enumerate() {
            tbl.raw_set(idx + 1, v)?;
        }
        self.lua.globals().set("close", tbl)?;

        let result: mlua::Table = self.lua.load(script).eval()?;
        let mut out = Vec::with_capacity(closes.len());
        for i in 1..=closes.len() {
            let val: f64 = result.raw_get(i).unwrap_or(f64::NAN);
            out.push(val);
        }
        self.lua.remove_interrupt();
        Ok(out)
    }
}
