mod dataset;
mod luau_runner;
mod metrics;
mod mtf_test;
mod native_study;
mod rhai_runner;
mod wasmtime_runner;

use std::path::PathBuf;
use std::time::Instant;

use dataset::generate_bars;
use luau_runner::LuauStudyInstance;
use metrics::{compute_latency_stats, rss_mb};
use native_study::NativeStudy;
use rhai_runner::RhaiStudyInstance;
use wasmtime_runner::WasmtimeInstance;

fn resolve_wasm_path() -> PathBuf {
    if let Ok(p) = std::env::var("S07_WASM_PATH") {
        return PathBuf::from(p);
    }
    if let Ok(target_dir) = std::env::var("CARGO_TARGET_DIR") {
        let p = PathBuf::from(target_dir)
            .join("wasm32-unknown-unknown/release/s07_guest_wasm.wasm");
        if p.exists() {
            return p;
        }
    }
    PathBuf::from("/Users/abelmora/.cache/allegedly-target/wasm32-unknown-unknown/release/s07_guest_wasm.wasm")
}

fn main() {
    println!("=== Allegedly Spike S07: Scripting & Study Sandbox Shootout ===");
    println!("Workload: EMA-20 + RSI-14 + Session VWAP (±2σ) + Stateful Crossover Strategy");
    println!("Dataset : 100,000 historical bars + 10,000 single-bar incremental live ticks");
    println!("Baseline RSS: {:.2} MiB\n", rss_mb());

    let (hist, live) = generate_bars(100_000, 10_000);

    // -------------------------------------------------------------------------
    // 1. Native Rust (`mv-studies`) Baseline
    // -------------------------------------------------------------------------
    let rss_n0 = rss_mb();
    let t_cold_n = Instant::now();
    let mut native = NativeStudy::new();
    let native_cold_ms = t_cold_n.elapsed().as_secs_f64() * 1000.0;

    let t_batch_n = Instant::now();
    let native_batch_out = native.eval_batch(&hist);
    let native_batch_ms = t_batch_n.elapsed().as_secs_f64() * 1000.0;

    let mut native_live_ns = Vec::with_capacity(live.len());
    for bar in &live {
        let t0 = Instant::now();
        native.step(bar);
        let _ = std::hint::black_box(native.output());
        native_live_ns.push(t0.elapsed().as_nanos() as u64);
    }
    let native_live_out = native.output();
    let native_live_stats = compute_latency_stats(&mut native_live_ns);
    let native_rss_delta = (rss_mb() - rss_n0).max(0.0);

    println!(
        "[Native Rust] cold={:.4} ms | 100k batch={:.3} ms | live p50={:.3} µs p95={:.3} µs p99={:.3} µs max={:.3} µs | RSS delta={:.2} MiB",
        native_cold_ms,
        native_batch_ms,
        native_live_stats.p50_us,
        native_live_stats.p95_us,
        native_live_stats.p99_us,
        native_live_stats.max_us,
        native_rss_delta
    );
    println!(
        "  -> output(100k): ema={:.6} rsi={:.6} vwap={:.6} pnl={:.4} trades={} pos={}",
        native_batch_out.ema,
        native_batch_out.rsi,
        native_batch_out.vwap,
        native_batch_out.realized_pnl,
        native_batch_out.trades,
        native_batch_out.position
    );

    // -------------------------------------------------------------------------
    // 2. Wasmtime v51.0.0 (Fuel + 64 MiB StoreLimits + Zero WASI)
    // -------------------------------------------------------------------------
    let wasm_path = resolve_wasm_path();
    let (wt_res, wt_engine, wt_module) =
        wasmtime_runner::run_benchmark(&wasm_path, &hist, &live).expect("wasmtime benchmark failed");
    println!(
        "[Wasmtime   ] cold={:.3} ms | 100k batch={:.3} ms | live p50={:.3} µs p95={:.3} µs p99={:.3} µs max={:.3} µs | RSS delta={:.2} MiB | wasm={:.1} KiB",
        wt_res.cold_start_ms,
        wt_res.batch_100k_ms,
        wt_res.live_10k.p50_us,
        wt_res.live_10k.p95_us,
        wt_res.live_10k.p99_us,
        wt_res.live_10k.max_us,
        wt_res.rss_delta_mb,
        wt_res.wasm_file_kb
    );
    let wt_batch_err = native_batch_out.max_float_diff(&wt_res.batch_output);
    let wt_live_err = native_live_out.max_float_diff(&wt_res.live_output);
    assert!(
        wt_batch_err <= 1e-9 && wt_live_err <= 1e-9 && native_live_out.exact_state_match(&wt_res.live_output),
        "Wasmtime numerical mismatch! batch_err={wt_batch_err}, live_err={wt_live_err}"
    );
    println!(
        "  -> parity vs Native: batch_max_err={:.3e}, live_max_err={:.3e}, trades_match=TRUE",
        wt_batch_err, wt_live_err
    );

    // -------------------------------------------------------------------------
    // 3. Rhai v1.27.0 (Pure Rust, max_operations + size caps)
    // -------------------------------------------------------------------------
    let rhai_res = rhai_runner::run_benchmark(&hist, &live).expect("rhai benchmark failed");
    println!(
        "[Rhai       ] cold={:.3} ms | 100k batch={:.3} ms | live p50={:.3} µs p95={:.3} µs p99={:.3} µs max={:.3} µs | RSS delta={:.2} MiB",
        rhai_res.cold_start_ms,
        rhai_res.batch_100k_ms,
        rhai_res.live_10k.p50_us,
        rhai_res.live_10k.p95_us,
        rhai_res.live_10k.p99_us,
        rhai_res.live_10k.max_us,
        rhai_res.rss_delta_mb
    );
    let rhai_batch_err = native_batch_out.max_float_diff(&rhai_res.batch_output);
    let rhai_live_err = native_live_out.max_float_diff(&rhai_res.live_output);
    assert!(
        rhai_batch_err <= 1e-9 && rhai_live_err <= 1e-9 && native_live_out.exact_state_match(&rhai_res.live_output),
        "Rhai numerical mismatch! batch_err={rhai_batch_err}, live_err={rhai_live_err}"
    );
    println!(
        "  -> parity vs Native: batch_max_err={:.3e}, live_max_err={:.3e}, trades_match=TRUE",
        rhai_batch_err, rhai_live_err
    );

    // -------------------------------------------------------------------------
    // 4. Luau (mlua v0.12.3, sandbox(true) + 64 MiB limit + interrupt)
    // -------------------------------------------------------------------------
    let luau_res = luau_runner::run_benchmark(&hist, &live).expect("luau benchmark failed");
    println!(
        "[Luau (mlua)] cold={:.3} ms | 100k batch={:.3} ms | live p50={:.3} µs p95={:.3} µs p99={:.3} µs max={:.3} µs | RSS delta={:.2} MiB",
        luau_res.cold_start_ms,
        luau_res.batch_100k_ms,
        luau_res.live_10k.p50_us,
        luau_res.live_10k.p95_us,
        luau_res.live_10k.p99_us,
        luau_res.live_10k.max_us,
        luau_res.rss_delta_mb
    );
    let luau_batch_err = native_batch_out.max_float_diff(&luau_res.batch_output);
    let luau_live_err = native_live_out.max_float_diff(&luau_res.live_output);
    assert!(
        luau_batch_err <= 1e-9 && luau_live_err <= 1e-9 && native_live_out.exact_state_match(&luau_res.live_output),
        "Luau numerical mismatch! batch_err={luau_batch_err}, live_err={luau_live_err}"
    );
    println!(
        "  -> parity vs Native: batch_max_err={:.3e}, live_max_err={:.3e}, trades_match=TRUE",
        luau_batch_err, luau_live_err
    );

    // -------------------------------------------------------------------------
    // 5. R06 Gate: 10 Concurrent Studies on 1 Chart (5 Native + 3 WASM + 2 Script)
    //    Compare both (5 Native + 3 WASM + 2 Luau) and (5 Native + 3 WASM + 2 Rhai)
    // -------------------------------------------------------------------------
    println!("\n=== R06 Gate: 10 Active Studies Live Tick Mix (10,000 ticks) ===");
    {
        let mut natives: Vec<NativeStudy> = (0..5).map(|_| NativeStudy::new()).collect();
        let mut wasms: Vec<WasmtimeInstance> = (0..3)
            .map(|_| WasmtimeInstance::new(&wt_engine, &wt_module, 64 * 1024 * 1024).unwrap())
            .collect();
        let mut luaus: Vec<LuauStudyInstance> =
            (0..2).map(|_| LuauStudyInstance::new().unwrap()).collect();

        let mut mix_ns = Vec::with_capacity(live.len());
        for bar in &live {
            let t0 = Instant::now();
            for n in &mut natives {
                n.step(bar);
                std::hint::black_box(n.output());
            }
            for w in &mut wasms {
                std::hint::black_box(w.step_live(bar).unwrap());
            }
            for l in &mut luaus {
                std::hint::black_box(l.step_live(bar).unwrap());
            }
            mix_ns.push(t0.elapsed().as_nanos() as u64);
        }
        let s = compute_latency_stats(&mut mix_ns);
        println!(
            "  5 Native + 3 Wasmtime + 2 Luau : p50={:.2} µs | p95={:.2} µs | p99={:.2} µs | max={:.2} µs (Gate: p99 <= 1000 µs -> {})",
            s.p50_us,
            s.p95_us,
            s.p99_us,
            s.max_us,
            if s.p99_us <= 1000.0 { "PASS" } else { "FAIL" }
        );
    }
    {
        let mut natives: Vec<NativeStudy> = (0..5).map(|_| NativeStudy::new()).collect();
        let mut wasms: Vec<WasmtimeInstance> = (0..3)
            .map(|_| WasmtimeInstance::new(&wt_engine, &wt_module, 64 * 1024 * 1024).unwrap())
            .collect();
        let mut rhais: Vec<RhaiStudyInstance> =
            (0..2).map(|_| RhaiStudyInstance::new().unwrap()).collect();

        let mut mix_ns = Vec::with_capacity(live.len());
        for bar in &live {
            let t0 = Instant::now();
            for n in &mut natives {
                n.step(bar);
                std::hint::black_box(n.output());
            }
            for w in &mut wasms {
                std::hint::black_box(w.step_live(bar).unwrap());
            }
            for r in &mut rhais {
                std::hint::black_box(r.step_live(bar).unwrap());
            }
            mix_ns.push(t0.elapsed().as_nanos() as u64);
        }
        let s = compute_latency_stats(&mut mix_ns);
        println!(
            "  5 Native + 3 Wasmtime + 2 Rhai : p50={:.2} µs | p95={:.2} µs | p99={:.2} µs | max={:.2} µs (Gate: p99 <= 1000 µs -> {})",
            s.p50_us,
            s.p95_us,
            s.p99_us,
            s.max_us,
            if s.p99_us <= 1000.0 { "PASS" } else { "FAIL" }
        );
    }

    // -------------------------------------------------------------------------
    // 6. R06 Gate: MTF Non-Repainting & Intrabar Rollback Determinism
    // -------------------------------------------------------------------------
    println!("\n=== R06 Gate: MTF Non-Repainting & Intrabar Rollback Determinism ===");
    let (mtf_ok, mtf_bars, rollback_ok) = mtf_test::run_mtf_and_rollback_tests(&hist);
    println!(
        "  1m+15m HTF Batch vs Live Replay ({mtf_bars} bars): bit-identical={mtf_ok} -> {}",
        if mtf_ok { "PASS" } else { "FAIL" }
    );
    println!(
        "  Intrabar Rollback vs Clean Close (500 bars)     : bit-identical={rollback_ok} -> {}",
        if rollback_ok { "PASS" } else { "FAIL" }
    );
    assert!(mtf_ok && rollback_ok, "Determinism gate failed!");

    // -------------------------------------------------------------------------
    // 7. Mandatory Hostile-Script Sandbox Escape Suite
    // -------------------------------------------------------------------------
    println!("\n=== Mandatory Sandbox Escape / Hostile-Script Tests ===");
    let wt_hostile = wasmtime_runner::run_hostile_tests(&wt_engine, &wt_module);
    let rhai_hostile = rhai_runner::run_hostile_tests();
    let luau_hostile = luau_runner::run_hostile_tests();

    for (label, suite) in [
        ("Wasmtime", wt_hostile),
        ("Rhai", rhai_hostile),
        ("Luau", luau_hostile),
    ] {
        println!("--- {label} ---");
        for t in &suite {
            println!(
                "  [{}] {:40} ({:.3} ms) — {}",
                if t.passed { "PASS" } else { "FAIL" },
                t.name,
                t.elapsed_ms,
                t.detail.replace('\n', " | ")
            );
            assert!(t.passed, "{label} hostile test failed: {}", t.name);
        }
    }

    // Verify sibling isolation after all hostile traps
    let mut sibling_wt = WasmtimeInstance::new(&wt_engine, &wt_module, 64 * 1024 * 1024).unwrap();
    let mut sibling_rhai = RhaiStudyInstance::new().unwrap();
    let mut sibling_luau = LuauStudyInstance::new().unwrap();
    let mut sibling_native = NativeStudy::new();
    for bar in &hist[..50] {
        sibling_native.step(bar);
        let o_wt = sibling_wt.step_live(bar).unwrap();
        let o_rhai = sibling_rhai.step_live(bar).unwrap();
        let o_luau = sibling_luau.step_live(bar).unwrap();
        let o_nat = sibling_native.output();
        assert!(o_nat.max_float_diff(&o_wt) <= 1e-9);
        assert!(o_nat.max_float_diff(&o_rhai) <= 1e-9);
        assert!(o_nat.max_float_diff(&o_luau) <= 1e-9);
    }
    println!("\n[PASS] Sibling instance isolation verified across Wasmtime, Rhai, and Luau after all hostile traps.");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn four_runtime_numerical_parity() {
        let (hist, live) = generate_bars(2_000, 200);
        let mut native = NativeStudy::new();
        let nat_batch = native.eval_batch(&hist);
        for bar in &live {
            native.step(bar);
        }
        let nat_live = native.output();

        let wasm_path = resolve_wasm_path();
        let (wt, _, _) = wasmtime_runner::run_benchmark(&wasm_path, &hist, &live).unwrap();
        assert!(nat_batch.max_float_diff(&wt.batch_output) <= 1e-9);
        assert!(nat_live.max_float_diff(&wt.live_output) <= 1e-9);
        assert!(nat_live.exact_state_match(&wt.live_output));

        let rhai = rhai_runner::run_benchmark(&hist, &live).unwrap();
        assert!(nat_batch.max_float_diff(&rhai.batch_output) <= 1e-9);
        assert!(nat_live.max_float_diff(&rhai.live_output) <= 1e-9);
        assert!(nat_live.exact_state_match(&rhai.live_output));

        let luau = luau_runner::run_benchmark(&hist, &live).unwrap();
        assert!(nat_batch.max_float_diff(&luau.batch_output) <= 1e-9);
        assert!(nat_live.max_float_diff(&luau.live_output) <= 1e-9);
        assert!(nat_live.exact_state_match(&luau.live_output));
    }

    #[test]
    fn mtf_non_repainting_and_intrabar_rollback() {
        let (hist, _) = generate_bars(20_000, 100);
        let (mtf_ok, bars, rollback_ok) = mtf_test::run_mtf_and_rollback_tests(&hist);
        assert!(bars >= 15_000);
        assert!(mtf_ok, "MTF non-repainting batch vs live mismatch");
        assert!(rollback_ok, "Intrabar rollback determinism mismatch");
    }

    #[test]
    fn hostile_sandbox_escape_suite_all_runtimes() {
        let wasm_path = resolve_wasm_path();
        let (engine, module, _) = wasmtime_runner::create_engine_and_module(&wasm_path).unwrap();

        for t in wasmtime_runner::run_hostile_tests(&engine, &module) {
            assert!(t.passed, "Wasmtime hostile test failed: {} — {}", t.name, t.detail);
        }
        for t in rhai_runner::run_hostile_tests() {
            assert!(t.passed, "Rhai hostile test failed: {} — {}", t.name, t.detail);
        }
        for t in luau_runner::run_hostile_tests() {
            assert!(t.passed, "Luau hostile test failed: {} — {}", t.name, t.detail);
        }
    }
}
