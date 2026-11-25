use std::path::Path;
use std::time::Instant;
use wasmtime::{Config, Engine, Linker, Module, Store, StoreLimits, StoreLimitsBuilder, TypedFunc};

use crate::dataset::{BarInput, StudyOutput};
use crate::metrics::{LatencyStats, compute_latency_stats, rss_mb};

struct HostState {
    limits: StoreLimits,
}

#[derive(Debug)]
pub struct WasmtimeBenchResult {
    pub cold_start_ms: f64,
    pub batch_100k_ms: f64,
    pub batch_output: StudyOutput,
    pub live_10k: LatencyStats,
    pub live_output: StudyOutput,
    pub rss_delta_mb: f64,
    pub wasm_file_kb: f64,
}

#[derive(Debug)]
pub struct HostileTestOutcome {
    pub name: &'static str,
    pub passed: bool,
    pub elapsed_ms: f64,
    pub detail: String,
}

pub struct WasmtimeInstance {
    store: Store<HostState>,
    memory: wasmtime::Memory,
    step_fn: TypedFunc<(i64, i64, i64, i64, i64, u32), ()>,
    out_ptr: u32,
}

impl WasmtimeInstance {
    pub fn new(engine: &Engine, module: &Module, mem_cap_bytes: usize) -> Result<Self, String> {
        let limits = StoreLimitsBuilder::new()
            .memory_size(mem_cap_bytes)
            .table_elements(10_000)
            .instances(4)
            .build();
        let mut store = Store::new(engine, HostState { limits });
        store.limiter(|s| &mut s.limits);
        store.set_fuel(100_000_000).map_err(|e| e.to_string())?;

        // Zero-capability Linker: NO WASI, NO FS, NO NET, NO ENV.
        let linker: Linker<HostState> = Linker::new(engine);
        let instance = linker
            .instantiate(&mut store, module)
            .map_err(|e| e.to_string())?;

        let memory = instance
            .get_memory(&mut store, "memory")
            .ok_or("missing exported memory")?;
        let alloc_fn = instance
            .get_typed_func::<u32, u32>(&mut store, "alloc")
            .map_err(|e| e.to_string())?;
        let out_ptr = alloc_fn
            .call(&mut store, std::mem::size_of::<StudyOutput>() as u32)
            .map_err(|e| e.to_string())?;
        let step_fn = instance
            .get_typed_func::<(i64, i64, i64, i64, i64, u32), ()>(&mut store, "study_step_tick")
            .map_err(|e| e.to_string())?;

        Ok(Self {
            store,
            memory,
            step_fn,
            out_ptr,
        })
    }

    pub fn step_live(&mut self, bar: &BarInput) -> Result<StudyOutput, String> {
        self.store.set_fuel(500_000).map_err(|e| e.to_string())?;
        self.step_fn
            .call(
                &mut self.store,
                (
                    bar.high_tick,
                    bar.low_tick,
                    bar.close_tick,
                    bar.volume,
                    bar.session_id,
                    self.out_ptr,
                ),
            )
            .map_err(|e| e.to_string())?;

        let mut buf = [0u8; std::mem::size_of::<StudyOutput>()];
        self.memory
            .read(&self.store, self.out_ptr as usize, &mut buf)
            .map_err(|e| e.to_string())?;
        Ok(unsafe { std::ptr::read_unaligned(buf.as_ptr() as *const StudyOutput) })
    }
}

pub fn create_engine_and_module(wasm_path: &Path) -> Result<(Engine, Module, usize), String> {
    let wasm_bytes = std::fs::read(wasm_path)
        .map_err(|e| format!("failed to read {}: {}", wasm_path.display(), e))?;
    let mut cfg = Config::new();
    cfg.consume_fuel(true);
    let engine = Engine::new(&cfg).map_err(|e| e.to_string())?;
    let module = Module::new(&engine, &wasm_bytes).map_err(|e| e.to_string())?;
    Ok((engine, module, wasm_bytes.len()))
}

pub fn run_benchmark(
    wasm_path: &Path,
    hist: &[BarInput],
    live: &[BarInput],
) -> Result<(WasmtimeBenchResult, Engine, Module), String> {
    let rss_before = rss_mb();
    let t_cold = Instant::now();
    let (engine, module, wasm_len) = create_engine_and_module(wasm_path)?;

    let limits = StoreLimitsBuilder::new()
        .memory_size(64 * 1024 * 1024)
        .table_elements(10_000)
        .instances(4)
        .build();
    let mut store = Store::new(&engine, HostState { limits });
    store.limiter(|s| &mut s.limits);
    store.set_fuel(10_000_000).map_err(|e| e.to_string())?;
    let linker: Linker<HostState> = Linker::new(&engine);
    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| e.to_string())?;
    let cold_start_ms = t_cold.elapsed().as_secs_f64() * 1000.0;

    let memory = instance
        .get_memory(&mut store, "memory")
        .ok_or("missing exported memory")?;
    let alloc_fn = instance
        .get_typed_func::<u32, u32>(&mut store, "alloc")
        .map_err(|e| e.to_string())?;
    let reset_fn = instance
        .get_typed_func::<(), ()>(&mut store, "study_reset")
        .map_err(|e| e.to_string())?;
    let batch_fn = instance
        .get_typed_func::<(u32, u32, u32), ()>(&mut store, "study_eval_batch")
        .map_err(|e| e.to_string())?;
    let step_fn = instance
        .get_typed_func::<(i64, i64, i64, i64, i64, u32), ()>(&mut store, "study_step_tick")
        .map_err(|e| e.to_string())?;

    // Allocate chunk buffer (1,000 bars per host->guest crossing per R06 spec) + output struct
    const CHUNK_BARS: usize = 1_000;
    let bar_size = std::mem::size_of::<BarInput>();
    let out_size = std::mem::size_of::<StudyOutput>();
    let bars_ptr = alloc_fn
        .call(&mut store, (CHUNK_BARS * bar_size) as u32)
        .map_err(|e| e.to_string())?;
    let out_ptr = alloc_fn
        .call(&mut store, out_size as u32)
        .map_err(|e| e.to_string())?;

    // 100k historical batch benchmark (with fuel metering ON)
    store.set_fuel(5_000_000_000).map_err(|e| e.to_string())?;
    reset_fn.call(&mut store, ()).map_err(|e| e.to_string())?;

    let t_batch = Instant::now();
    for chunk in hist.chunks(CHUNK_BARS) {
        let byte_len = chunk.len() * bar_size;
        let bytes = unsafe { std::slice::from_raw_parts(chunk.as_ptr() as *const u8, byte_len) };
        memory
            .write(&mut store, bars_ptr as usize, bytes)
            .map_err(|e| e.to_string())?;
        batch_fn
            .call(&mut store, (bars_ptr, chunk.len() as u32, out_ptr))
            .map_err(|e| e.to_string())?;
    }
    let batch_100k_ms = t_batch.elapsed().as_secs_f64() * 1000.0;

    let mut out_buf = [0u8; std::mem::size_of::<StudyOutput>()];
    memory
        .read(&store, out_ptr as usize, &mut out_buf)
        .map_err(|e| e.to_string())?;
    let batch_output = unsafe { std::ptr::read_unaligned(out_buf.as_ptr() as *const StudyOutput) };

    // 10,000 single-bar incremental live ticks
    let mut samples_ns = Vec::with_capacity(live.len());
    for bar in live {
        let t0 = Instant::now();
        store.set_fuel(500_000).map_err(|e| e.to_string())?;
        step_fn
            .call(
                &mut store,
                (
                    bar.high_tick,
                    bar.low_tick,
                    bar.close_tick,
                    bar.volume,
                    bar.session_id,
                    out_ptr,
                ),
            )
            .map_err(|e| e.to_string())?;
        memory
            .read(&store, out_ptr as usize, &mut out_buf)
            .map_err(|e| e.to_string())?;
        samples_ns.push(t0.elapsed().as_nanos() as u64);
    }
    let live_output = unsafe { std::ptr::read_unaligned(out_buf.as_ptr() as *const StudyOutput) };
    let live_10k = compute_latency_stats(&mut samples_ns);
    let rss_after = rss_mb();

    Ok((
        WasmtimeBenchResult {
            cold_start_ms,
            batch_100k_ms,
            batch_output,
            live_10k,
            live_output,
            rss_delta_mb: (rss_after - rss_before).max(0.0),
            wasm_file_kb: wasm_len as f64 / 1024.0,
        },
        engine,
        module,
    ))
}

/// Minimal hand-encoded valid WebAssembly binary importing `wasi_snapshot_preview1::path_open`
/// (proves FS/network/env imports are denied by construction when zero WASI host bindings exist).
fn build_hostile_import_wasm() -> Vec<u8> {
    let mut w = Vec::new();
    // Magic + Version 1
    w.extend_from_slice(&[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    // Type section (id=1): 1 func type () -> ()
    w.extend_from_slice(&[0x01, 0x04, 0x01, 0x60, 0x00, 0x00]);
    // Import section (id=2): 1 import: mod="wasi_snapshot_preview1", field="path_open", kind=func(0), type=0
    let mod_name = b"wasi_snapshot_preview1";
    let field_name = b"path_open";
    let mut imp = Vec::new();
    imp.push(0x01); // 1 import
    imp.push(mod_name.len() as u8);
    imp.extend_from_slice(mod_name);
    imp.push(field_name.len() as u8);
    imp.extend_from_slice(field_name);
    imp.push(0x00); // func
    imp.push(0x00); // type index 0
    w.push(0x02);
    w.push(imp.len() as u8);
    w.extend_from_slice(&imp);
    w
}

pub fn run_hostile_tests(engine: &Engine, module: &Module) -> Vec<HostileTestOutcome> {
    let mut results = Vec::new();
    let linker: Linker<HostState> = Linker::new(engine);

    // Helper: create fresh sandboxed store (64 MiB cap)
    let make_store = |fuel: u64| {
        let limits = StoreLimitsBuilder::new()
            .memory_size(64 * 1024 * 1024)
            .table_elements(10_000)
            .instances(4)
            .build();
        let mut s = Store::new(engine, HostState { limits });
        s.limiter(|st| &mut st.limits);
        let _ = s.set_fuel(fuel);
        s
    };

    // 1. Infinite Loop Termination
    {
        let mut store = make_store(5_000_000);
        let inst = linker.instantiate(&mut store, module).unwrap();
        let f = inst
            .get_typed_func::<(), i64>(&mut store, "hostile_infinite_loop")
            .unwrap();
        let t0 = Instant::now();
        let res = f.call(&mut store, ());
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => {
                let msg = format!("{e:#}");
                (msg.contains("fuel") || msg.contains("OutOfFuel"), msg)
            }
            Ok(v) => (false, format!("unexpectedly returned {v}")),
        };
        results.push(HostileTestOutcome {
            name: "Infinite loop termination (5M fuel)",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 2. Memory Bomb Allocation (128 MiB under 64 MiB cap)
    {
        let mut store = make_store(500_000_000);
        let inst = linker.instantiate(&mut store, module).unwrap();
        let memory = inst.get_memory(&mut store, "memory").unwrap();
        let f = inst
            .get_typed_func::<u32, u32>(&mut store, "hostile_memory_bomb")
            .unwrap();
        let t0 = Instant::now();
        let res = f.call(&mut store, 128);
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let mem_bytes = memory.data_size(&store);
        let (passed, detail) = match res {
            Err(e) => {
                let msg = format!("{e:#}");
                let hit_oom_not_fuel = !msg.contains("fuel") && mem_bytes <= 64 * 1024 * 1024;
                (
                    hit_oom_not_fuel,
                    format!(
                        "StoreLimits capped at {:.2} MiB; trap: {msg}",
                        mem_bytes as f64 / (1024.0 * 1024.0)
                    ),
                )
            }
            Ok(v) => (false, format!("unexpectedly allocated {v} bytes")),
        };
        results.push(HostileTestOutcome {
            name: "Memory bomb (128 MiB vs 64 MiB cap)",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 3. Filesystem / Network / Env Denied by Construction
    {
        let t0 = Instant::now();
        let bad_bytes = build_hostile_import_wasm();
        let bad_mod = Module::new(engine, &bad_bytes).unwrap();
        let mut store = make_store(1_000_000);
        let res = linker.instantiate(&mut store, &bad_mod);
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => (true, format!("denied at link: {e:#}")),
            Ok(_) => (false, "unexpectedly linked WASI import".to_string()),
        };
        results.push(HostileTestOutcome {
            name: "FS/Net/Env denied by construction",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 4. Stack Overflow Recursion
    {
        let mut store = make_store(50_000_000);
        let inst = linker.instantiate(&mut store, module).unwrap();
        let f = inst
            .get_typed_func::<(), u64>(&mut store, "hostile_stack_overflow")
            .unwrap();
        let t0 = Instant::now();
        let res = f.call(&mut store, ());
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => {
                let msg = format!("{e:#}");
                (
                    msg.contains("stack") || msg.contains("exhausted") || msg.contains("trap"),
                    msg,
                )
            }
            Ok(v) => (false, format!("unexpectedly returned {v}")),
        };
        results.push(HostileTestOutcome {
            name: "Stack overflow recursion caught",
            passed,
            elapsed_ms,
            detail,
        });
    }

    results
}
