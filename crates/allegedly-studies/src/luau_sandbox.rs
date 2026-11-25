use mlua::{Lua, MetaMethod, UserData, UserDataMethods, VmState};
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

/// Shared terminal-wide Study memory pool accounting (<= 64 MiB hard cap) with peak telemetry.
#[derive(Debug, Default)]
pub struct GlobalStudyMemoryPool {
    reserved_bytes: AtomicUsize,
    peak_reserved_bytes: AtomicUsize,
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
                    self.peak_reserved_bytes.fetch_max(next, Ordering::SeqCst);
                    return Ok(PoolReservation { pool: self, bytes });
                }
                Err(actual) => cur = actual,
            }
        }
    }

    pub fn reserved_bytes(&self) -> usize {
        self.reserved_bytes.load(Ordering::SeqCst)
    }

    pub fn peak_reserved_bytes(&self) -> usize {
        self.peak_reserved_bytes.load(Ordering::SeqCst)
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

/// RAII guard guaranteeing `lua.remove_interrupt()` runs even on early error returns (RTSD-07).
struct InterruptGuard<'a>(&'a Lua);

impl Drop for InterruptGuard<'_> {
    fn drop(&mut self) {
        self.0.remove_interrupt();
    }
}

/// Zero-copy read-only flat SoA `ByteView` userdata backed by `Arc<[f64]>` (ADR-0005 / RTSD-07).
/// Supports 1-indexed Luau `close[i]` and `#close` without copying per-bar values into a Lua Table.
#[derive(Clone)]
struct FloatSeriesView(Arc<[f64]>);

impl UserData for FloatSeriesView {
    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        methods.add_meta_method(MetaMethod::Len, |_, this, ()| Ok(this.0.len()));
        methods.add_meta_method(MetaMethod::Index, |_, this, idx: usize| {
            if idx == 0 || idx > this.0.len() {
                Ok(mlua::Value::Nil)
            } else {
                Ok(mlua::Value::Number(this.0[idx - 1]))
            }
        });
    }
}

/// Sandboxed Luau Study runner:
/// - Strips hostile globals (`os`, `io`, `package`, `debug`, `dofile`, `loadfile`, `require`).
/// - Removes non-deterministic `math.random` / `math.randomseed` for SV-09 deterministic replay.
/// - Enforces strict `vm_memory_limit == pool_reservation` so global 64 MiB cap cannot be bypassed.
/// - Cleans up instruction interrupt hook via RAII Drop guard.
/// - Exposes zero-copy `FloatSeriesView` (`close`) + packed little-endian `close_bytes` flat ABI.
pub struct LuauStudyRunner {
    lua: Lua,
    vm_cap_bytes: usize,
    max_instructions: usize,
}

impl LuauStudyRunner {
    pub fn new(
        per_study_mem_bytes: usize,
        max_instructions: usize,
    ) -> Result<Self, StudySandboxError> {
        let vm_cap_bytes = per_study_mem_bytes.clamp(64 * 1024, GLOBAL_STUDY_MEMORY_CAP_BYTES);
        let lua = Lua::new();

        // Build deterministic `math` table stripping `random` and `randomseed` BEFORE freezing via sandbox(true)
        let globals = lua.globals();
        if let Ok(orig_math) = globals.get::<mlua::Table>("math") {
            let det_math = lua.create_table()?;
            for pair in orig_math.pairs::<mlua::Value, mlua::Value>() {
                let (k, v) = pair?;
                if let mlua::Value::String(ref ks) = k {
                    let key_str = ks.to_str()?;
                    if key_str == "random" || key_str == "randomseed" {
                        continue;
                    }
                }
                det_math.raw_set(k, v)?;
            }
            globals.set("math", det_math)?;
        }

        for banned in [
            "os", "io", "package", "debug", "dofile", "loadfile", "require",
        ] {
            globals.set(banned, mlua::Value::Nil)?;
        }

        lua.sandbox(true)?;
        lua.set_memory_limit(vm_cap_bytes)?;

        Ok(Self {
            lua,
            vm_cap_bytes,
            max_instructions,
        })
    }

    pub fn vm_cap_bytes(&self) -> usize {
        self.vm_cap_bytes
    }

    pub fn eval_study_series(
        &self,
        pool: &GlobalStudyMemoryPool,
        reserve_bytes: usize,
        script: &str,
        closes: &[f64],
    ) -> Result<Vec<f64>, StudySandboxError> {
        // Strict 1:1 accounting: reserve the EXACT VM cap (never allow VM cap > reserved pool bytes; RTSD-07)
        let effective_cap = reserve_bytes
            .min(self.vm_cap_bytes)
            .clamp(64 * 1024, GLOBAL_STUDY_MEMORY_CAP_BYTES);
        let _pool_guard = pool.try_reserve(effective_cap)?;
        self.lua.set_memory_limit(effective_cap)?;

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
        let _interrupt_guard = InterruptGuard(&self.lua);

        // Zero-copy flat SoA ByteView (`close[i]`, `#close`) + raw little-endian bytes (`close_bytes`)
        let shared_closes: Arc<[f64]> = Arc::from(closes);
        let mut raw_bytes = Vec::with_capacity(std::mem::size_of_val(closes));
        for &v in closes {
            raw_bytes.extend_from_slice(&v.to_le_bytes());
        }
        let globals = self.lua.globals();
        globals.set("close", FloatSeriesView(shared_closes))?;
        globals.set("close_bytes", self.lua.create_string(&raw_bytes)?)?;
        globals.set("close_len", closes.len())?;

        let result: mlua::Table = self.lua.load(script).eval()?;
        let mut out = Vec::with_capacity(closes.len());
        for i in 1..=closes.len() {
            let val: f64 = result.raw_get(i).unwrap_or(f64::NAN);
            out.push(val);
        }
        Ok(out)
    }
}
