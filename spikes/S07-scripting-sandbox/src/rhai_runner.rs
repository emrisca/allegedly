use std::time::Instant;
use rhai::{AST, Array, Dynamic, Engine, Map, Scope};

use crate::dataset::{BarInput, StudyOutput};
use crate::metrics::{LatencyStats, compute_latency_stats, rss_mb};
use crate::wasmtime_runner::HostileTestOutcome;

const RHAI_STUDY_SCRIPT: &str = r#"
fn init_state() {
    #{
        bar_idx: 0,
        ema: 0.0,
        prev_ema: 0.0,
        prev_close: 0.0,
        rsi_gain_sum: 0.0,
        rsi_loss_sum: 0.0,
        avg_gain: 0.0,
        avg_loss: 0.0,
        rsi: 50.0,
        prev_session: -1,
        cum_vol: 0.0,
        vwap: 0.0,
        m2: 0.0,
        upper: 0.0,
        lower: 0.0,
        position: 0,
        entry_price: 0.0,
        realized_pnl: 0.0,
        trades: 0
    }
}

fn step_bar(st, high_tick, low_tick, close_tick, volume, session_id) {
    let high = high_tick.to_float() * 0.25;
    let low = low_tick.to_float() * 0.25;
    let close = close_tick.to_float() * 0.25;
    let vol = volume.to_float();
    let alpha = 2.0 / 21.0;

    let bar_idx = st.bar_idx;
    let prev_ema = st.ema;
    let prev_close = st.prev_close;

    // 1. EMA-20
    let ema = if bar_idx == 0 {
        close
    } else {
        alpha * close + (1.0 - alpha) * prev_ema
    };
    st.ema = ema;

    // 2. RSI-14 (Wilder RMA)
    let rsi = 50.0;
    if bar_idx > 0 {
        let change = close - prev_close;
        let gain = if change > 0.0 { change } else { 0.0 };
        let loss = if change < 0.0 { -change } else { 0.0 };
        if bar_idx <= 14 {
            st.rsi_gain_sum += gain;
            st.rsi_loss_sum += loss;
            if bar_idx == 14 {
                let ag = st.rsi_gain_sum / 14.0;
                let al = st.rsi_loss_sum / 14.0;
                st.avg_gain = ag;
                st.avg_loss = al;
                rsi = if al == 0.0 { 100.0 } else if ag == 0.0 { 0.0 } else { 100.0 - 100.0 / (1.0 + ag / al) };
            }
        } else {
            let ag = (st.avg_gain * 13.0 + gain) / 14.0;
            let al = (st.avg_loss * 13.0 + loss) / 14.0;
            st.avg_gain = ag;
            st.avg_loss = al;
            rsi = if al == 0.0 { 100.0 } else if ag == 0.0 { 0.0 } else { 100.0 - 100.0 / (1.0 + ag / al) };
        }
    }
    st.rsi = rsi;

    // 3. Session-Anchored VWAP + Welford StdDev Bands
    if session_id != st.prev_session {
        st.prev_session = session_id;
        st.cum_vol = 0.0;
        st.vwap = 0.0;
        st.m2 = 0.0;
    }
    let tp = (high + low + close) / 3.0;
    let new_vol = st.cum_vol + vol;
    if new_vol > 0.0 {
        let delta = tp - st.vwap;
        let new_vwap = st.vwap + (vol / new_vol) * delta;
        let delta2 = tp - new_vwap;
        st.m2 += vol * delta * delta2;
        st.cum_vol = new_vol;
        st.vwap = new_vwap;
        let variance = st.m2 / st.cum_vol;
        let sd = if variance > 0.0 { variance.sqrt() } else { 0.0 };
        st.upper = new_vwap + 2.0 * sd;
        st.lower = new_vwap - 2.0 * sd;
    }

    // 4. Stateful Crossover Strategy
    if bar_idx >= 20 {
        let bull = prev_close <= prev_ema && close > ema && close > st.vwap && rsi < 70.0;
        let bear = prev_close >= prev_ema && close < ema && close < st.vwap && rsi > 30.0;

        if bull {
            if st.position == -1 {
                st.realized_pnl += st.entry_price - close;
                st.trades += 1;
                st.position = 0;
            }
            if st.position == 0 {
                st.position = 1;
                st.entry_price = close;
                st.trades += 1;
            }
        } else if bear {
            if st.position == 1 {
                st.realized_pnl += close - st.entry_price;
                st.trades += 1;
                st.position = 0;
            }
            if st.position == 0 {
                st.position = -1;
                st.entry_price = close;
                st.trades += 1;
            }
        } else if st.position == 1 && close >= st.upper {
            st.realized_pnl += close - st.entry_price;
            st.trades += 1;
            st.position = 0;
        } else if st.position == -1 && close <= st.lower {
            st.realized_pnl += st.entry_price - close;
            st.trades += 1;
            st.position = 0;
        }
    }

    st.prev_close = close;
    st.prev_ema = ema;
    st.bar_idx = bar_idx + 1;
    st
}

fn eval_batch(st, highs, lows, closes, vols, sids) {
    let n = closes.len();
    let i = 0;
    while i < n {
        st = step_bar(st, highs[i], lows[i], closes[i], vols[i], sids[i]);
        i += 1;
    }
    st
}
"#;

#[derive(Debug)]
pub struct RhaiBenchResult {
    pub cold_start_ms: f64,
    pub batch_100k_ms: f64,
    pub batch_output: StudyOutput,
    pub live_10k: LatencyStats,
    pub live_output: StudyOutput,
    pub rss_delta_mb: f64,
}

pub struct RhaiStudyInstance {
    engine: Engine,
    ast: AST,
    scope: Scope<'static>,
    state: Dynamic,
}

impl RhaiStudyInstance {
    pub fn new() -> Result<Self, String> {
        let mut engine = Engine::new();
        engine.set_max_operations(50_000);
        engine.set_max_call_levels(32);
        engine.set_max_expr_depths(32, 32);
        engine.set_max_array_size(10_000);
        engine.set_max_string_size(1_048_576);
        engine.set_max_map_size(1_000);

        let ast = engine.compile(RHAI_STUDY_SCRIPT).map_err(|e| e.to_string())?;
        let mut scope = Scope::new();
        let state: Dynamic = engine
            .call_fn(&mut scope, &ast, "init_state", ())
            .map_err(|e| e.to_string())?;
        Ok(Self {
            engine,
            ast,
            scope,
            state,
        })
    }

    pub fn step_live(&mut self, bar: &BarInput) -> Result<StudyOutput, String> {
        let st: Dynamic = self
            .engine
            .call_fn(
                &mut self.scope,
                &self.ast,
                "step_bar",
                (
                    self.state.clone(),
                    bar.high_tick,
                    bar.low_tick,
                    bar.close_tick,
                    bar.volume,
                    bar.session_id,
                ),
            )
            .map_err(|e| e.to_string())?;
        self.state = st;
        Ok(extract_output(&self.state))
    }
}

fn extract_output(state: &Dynamic) -> StudyOutput {
    let m = state.clone().cast::<Map>();
    let get_f = |k: &str| m.get(k).and_then(|v| v.as_float().ok()).unwrap_or(0.0);
    let get_i = |k: &str| m.get(k).and_then(|v| v.as_int().ok()).unwrap_or(0);
    StudyOutput {
        ema: get_f("ema"),
        rsi: get_f("rsi"),
        vwap: get_f("vwap"),
        upper: get_f("upper"),
        lower: get_f("lower"),
        realized_pnl: get_f("realized_pnl"),
        trades: get_i("trades"),
        position: get_i("position"),
    }
}

pub fn run_benchmark(hist: &[BarInput], live: &[BarInput]) -> Result<RhaiBenchResult, String> {
    let rss_before = rss_mb();
    let t_cold = Instant::now();
    let mut engine = Engine::new();
    // Generous op budget for 100k-bar pure-script batch; tightened for live & hostile tests
    engine.set_max_operations(500_000_000);
    engine.set_max_call_levels(32);
    engine.set_max_expr_depths(32, 32);
    engine.set_max_array_size(200_000);
    engine.set_max_string_size(1_048_576);
    engine.set_max_map_size(1_000);

    let ast = engine.compile(RHAI_STUDY_SCRIPT).map_err(|e| e.to_string())?;
    let mut scope = Scope::new();
    let mut state: Dynamic = engine
        .call_fn(&mut scope, &ast, "init_state", ())
        .map_err(|e| e.to_string())?;
    let cold_start_ms = t_cold.elapsed().as_secs_f64() * 1000.0;

    // Prepare columnar arrays for batch pass (chunked by 1,000 bars to keep Rhai heap bounded)
    const CHUNK: usize = 1_000;
    let t_batch = Instant::now();
    for chunk in hist.chunks(CHUNK) {
        let highs: Array = chunk.iter().map(|b| Dynamic::from(b.high_tick)).collect();
        let lows: Array = chunk.iter().map(|b| Dynamic::from(b.low_tick)).collect();
        let closes: Array = chunk.iter().map(|b| Dynamic::from(b.close_tick)).collect();
        let vols: Array = chunk.iter().map(|b| Dynamic::from(b.volume)).collect();
        let sids: Array = chunk.iter().map(|b| Dynamic::from(b.session_id)).collect();
        state = engine
            .call_fn(
                &mut scope,
                &ast,
                "eval_batch",
                (state, highs, lows, closes, vols, sids),
            )
            .map_err(|e| e.to_string())?;
    }
    let batch_100k_ms = t_batch.elapsed().as_secs_f64() * 1000.0;
    let batch_output = extract_output(&state);

    // Tighten per-tick safety limits for 10,000 live incremental ticks
    engine.set_max_operations(50_000);
    engine.set_max_array_size(10_000);
    let mut samples_ns = Vec::with_capacity(live.len());
    for bar in live {
        let t0 = Instant::now();
        state = engine
            .call_fn(
                &mut scope,
                &ast,
                "step_bar",
                (
                    state,
                    bar.high_tick,
                    bar.low_tick,
                    bar.close_tick,
                    bar.volume,
                    bar.session_id,
                ),
            )
            .map_err(|e| e.to_string())?;
        samples_ns.push(t0.elapsed().as_nanos() as u64);
    }
    let live_output = extract_output(&state);
    let live_10k = compute_latency_stats(&mut samples_ns);
    let rss_after = rss_mb();

    Ok(RhaiBenchResult {
        cold_start_ms,
        batch_100k_ms,
        batch_output,
        live_10k,
        live_output,
        rss_delta_mb: (rss_after - rss_before).max(0.0),
    })
}

pub fn run_hostile_tests() -> Vec<HostileTestOutcome> {
    let mut results = Vec::new();

    let make_sandbox = || {
        let mut engine = Engine::new();
        engine.set_max_operations(100_000);
        engine.set_max_call_levels(32);
        engine.set_max_expr_depths(32, 32);
        engine.set_max_array_size(10_000);
        engine.set_max_string_size(1_048_576); // 1 MiB string cap
        engine.set_max_map_size(1_000);
        engine
    };

    // 1. Infinite Loop Termination
    {
        let engine = make_sandbox();
        let t0 = Instant::now();
        let res = engine.eval::<i64>("let x = 0; loop { x += 1; } x");
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => {
                let s = e.to_string();
                (s.contains("Too many operations"), s)
            }
            Ok(v) => (false, format!("unexpectedly returned {v}")),
        };
        results.push(HostileTestOutcome {
            name: "Infinite loop termination (100k ops)",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 2. Memory Bomb Allocation (256 MiB string & 20M array under caps)
    {
        let engine = make_sandbox();
        let t0 = Instant::now();
        let res_str = engine.eval::<String>(r#"let s = "A"; for i in 0..28 { s += s; } s"#);
        let res_arr = engine.eval::<Array>("let a = []; for i in 0..20000000 { a.push(i); } a");
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let passed = res_str.is_err() && res_arr.is_err();
        let detail = format!(
            "str={:?}, arr={:?}",
            res_str.err().map(|e| e.to_string()),
            res_arr.err().map(|e| e.to_string())
        );
        results.push(HostileTestOutcome {
            name: "Memory bomb (256 MiB str / 20M arr)",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 3. Filesystem / Network / Env Denied by Construction
    {
        let engine = make_sandbox();
        let t0 = Instant::now();
        let r1 = engine.eval::<Dynamic>(r#"open("/etc/passwd")"#);
        let r2 = engine.eval::<Dynamic>(r#"read_file("/etc/passwd")"#);
        let r3 = engine.eval::<Dynamic>(r#"env("HOME")"#);
        let r4 = engine.eval::<Dynamic>(r#"import "os" as os; os::getenv("HOME")"#);
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let passed = r1.is_err() && r2.is_err() && r3.is_err() && r4.is_err();
        let detail = format!(
            "all 4 ambient calls rejected (e.g. {})",
            r1.unwrap_err()
        );
        results.push(HostileTestOutcome {
            name: "FS/Net/Env denied by construction",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 4. Stack Overflow Recursion
    {
        let engine = make_sandbox();
        let t0 = Instant::now();
        let res = engine.eval::<i64>("fn boom(n) { 1 + boom(n + 1) } boom(0)");
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => {
                let s = e.to_string();
                (s.contains("Stack") || s.contains("call"), s)
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
