use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use mlua::{Function, Lua, Table, VmState};

use crate::dataset::{BarInput, StudyOutput};
use crate::metrics::{LatencyStats, compute_latency_stats, rss_mb};
use crate::wasmtime_runner::HostileTestOutcome;

const LUAU_STUDY_SCRIPT: &str = r#"
local bar_idx = 0
local ema = 0.0
local prev_ema = 0.0
local prev_close = 0.0
local rsi_gain_sum = 0.0
local rsi_loss_sum = 0.0
local avg_gain = 0.0
local avg_loss = 0.0
local rsi = 50.0
local prev_session = -1
local cum_vol = 0.0
local vwap = 0.0
local m2 = 0.0
local upper = 0.0
local lower = 0.0
local position = 0
local entry_price = 0.0
local realized_pnl = 0.0
local trades = 0

local TICK_SIZE = 0.25
local ALPHA = 2.0 / 21.0
local sqrt = math.sqrt

local function compute_rsi(ag: number, al: number): number
    if al == 0.0 then
        return 100.0
    elseif ag == 0.0 then
        return 0.0
    else
        return 100.0 - 100.0 / (1.0 + ag / al)
    end
end

function study_reset()
    bar_idx = 0
    ema = 0.0
    prev_ema = 0.0
    prev_close = 0.0
    rsi_gain_sum = 0.0
    rsi_loss_sum = 0.0
    avg_gain = 0.0
    avg_loss = 0.0
    rsi = 50.0
    prev_session = -1
    cum_vol = 0.0
    vwap = 0.0
    m2 = 0.0
    upper = 0.0
    lower = 0.0
    position = 0
    entry_price = 0.0
    realized_pnl = 0.0
    trades = 0
end

function step_bar(high_tick: number, low_tick: number, close_tick: number, volume: number, session_id: number)
    local high = high_tick * TICK_SIZE
    local low = low_tick * TICK_SIZE
    local close = close_tick * TICK_SIZE
    local vol = volume

    -- 1. EMA-20
    local p_ema = ema
    local p_close = prev_close
    if bar_idx == 0 then
        ema = close
    else
        ema = ALPHA * close + (1.0 - ALPHA) * ema
    end

    -- 2. RSI-14 (Wilder RMA)
    if bar_idx == 0 then
        rsi = 50.0
    else
        local change = close - p_close
        local gain = if change > 0.0 then change else 0.0
        local loss = if change < 0.0 then -change else 0.0
        if bar_idx <= 14 then
            rsi_gain_sum += gain
            rsi_loss_sum += loss
            if bar_idx == 14 then
                avg_gain = rsi_gain_sum / 14.0
                avg_loss = rsi_loss_sum / 14.0
                rsi = compute_rsi(avg_gain, avg_loss)
            else
                rsi = 50.0
            end
        else
            avg_gain = (avg_gain * 13.0 + gain) / 14.0
            avg_loss = (avg_loss * 13.0 + loss) / 14.0
            rsi = compute_rsi(avg_gain, avg_loss)
        end
    end

    -- 3. Session-Anchored VWAP + Welford StdDev Bands
    if session_id ~= prev_session then
        prev_session = session_id
        cum_vol = 0.0
        vwap = 0.0
        m2 = 0.0
    end
    local tp = (high + low + close) / 3.0
    local new_vol = cum_vol + vol
    if new_vol > 0.0 then
        local delta = tp - vwap
        local new_vwap = vwap + (vol / new_vol) * delta
        local delta2 = tp - new_vwap
        m2 += vol * delta * delta2
        cum_vol = new_vol
        vwap = new_vwap
        local variance = m2 / cum_vol
        local sd = if variance > 0.0 then sqrt(variance) else 0.0
        upper = vwap + 2.0 * sd
        lower = vwap - 2.0 * sd
    end

    -- 4. Stateful Crossover Strategy
    if bar_idx >= 20 then
        local bull = p_close <= p_ema and close > ema and close > vwap and rsi < 70.0
        local bear = p_close >= p_ema and close < ema and close < vwap and rsi > 30.0

        if bull then
            if position == -1 then
                realized_pnl += entry_price - close
                trades += 1
                position = 0
            end
            if position == 0 then
                position = 1
                entry_price = close
                trades += 1
            end
        elseif bear then
            if position == 1 then
                realized_pnl += close - entry_price
                trades += 1
                position = 0
            end
            if position == 0 then
                position = -1
                entry_price = close
                trades += 1
            end
        elseif position == 1 and close >= upper then
            realized_pnl += close - entry_price
            trades += 1
            position = 0
        elseif position == -1 and close <= lower then
            realized_pnl += entry_price - close
            trades += 1
            position = 0
        end
    end

    prev_close = close
    prev_ema = ema
    bar_idx += 1
end

function eval_batch(highs, lows, closes, vols, sids, n: number)
    for i = 1, n do
        step_bar(highs[i], lows[i], closes[i], vols[i], sids[i])
    end
end

function get_output()
    return ema, rsi, vwap, upper, lower, realized_pnl, trades, position
end
"#;

#[derive(Debug)]
pub struct LuauBenchResult {
    pub cold_start_ms: f64,
    pub batch_100k_ms: f64,
    pub batch_output: StudyOutput,
    pub live_10k: LatencyStats,
    pub live_output: StudyOutput,
    pub rss_delta_mb: f64,
}

pub struct LuauStudyInstance {
    lua: Lua,
    step_fn: Function,
    out_fn: Function,
    budget_used: Arc<AtomicU64>,
}

impl LuauStudyInstance {
    pub fn new() -> Result<Self, String> {
        let lua = Lua::new();
        lua.sandbox(true).map_err(|e| e.to_string())?;
        lua.set_memory_limit(64 * 1024 * 1024)
            .map_err(|e| e.to_string())?;
        let budget_used = Arc::new(AtomicU64::new(0));
        let counter = budget_used.clone();
        lua.set_interrupt(move |_| {
            let n = counter.fetch_add(1, Ordering::Relaxed);
            if n > 10_000 {
                Err(mlua::Error::RuntimeError(
                    "interrupt: instruction budget exceeded".into(),
                ))
            } else {
                Ok(VmState::Continue)
            }
        });
        lua.load(LUAU_STUDY_SCRIPT)
            .exec()
            .map_err(|e| e.to_string())?;
        let globals = lua.globals();
        let step_fn: Function = globals.get("step_bar").map_err(|e| e.to_string())?;
        let out_fn: Function = globals.get("get_output").map_err(|e| e.to_string())?;
        Ok(Self {
            lua,
            step_fn,
            out_fn,
            budget_used,
        })
    }

    pub fn step_live(&mut self, bar: &BarInput) -> Result<StudyOutput, String> {
        self.budget_used.store(0, Ordering::Relaxed);
        self.step_fn
            .call::<()>((
                bar.high_tick as f64,
                bar.low_tick as f64,
                bar.close_tick as f64,
                bar.volume as f64,
                bar.session_id as f64,
            ))
            .map_err(|e| e.to_string())?;
        let (ema, rsi, vwap, upper, lower, realized_pnl, trades, position): (
            f64,
            f64,
            f64,
            f64,
            f64,
            f64,
            i64,
            i64,
        ) = self.out_fn.call(()).map_err(|e| e.to_string())?;
        let _ = &self.lua;
        Ok(StudyOutput {
            ema,
            rsi,
            vwap,
            upper,
            lower,
            realized_pnl,
            trades,
            position,
        })
    }
}

fn read_luau_output(out_fn: &Function) -> Result<StudyOutput, String> {
    let (ema, rsi, vwap, upper, lower, realized_pnl, trades, position): (
        f64,
        f64,
        f64,
        f64,
        f64,
        f64,
        i64,
        i64,
    ) = out_fn.call(()).map_err(|e| e.to_string())?;
    Ok(StudyOutput {
        ema,
        rsi,
        vwap,
        upper,
        lower,
        realized_pnl,
        trades,
        position,
    })
}

pub fn run_benchmark(hist: &[BarInput], live: &[BarInput]) -> Result<LuauBenchResult, String> {
    let rss_before = rss_mb();
    let t_cold = Instant::now();
    let lua = Lua::new();
    lua.sandbox(true).map_err(|e| e.to_string())?;
    lua.set_memory_limit(64 * 1024 * 1024)
        .map_err(|e| e.to_string())?;

    let budget_limit = Arc::new(AtomicU64::new(50_000_000));
    let budget_used = Arc::new(AtomicU64::new(0));
    let lim_ref = budget_limit.clone();
    let used_ref = budget_used.clone();
    lua.set_interrupt(move |_| {
        let n = used_ref.fetch_add(1, Ordering::Relaxed);
        if n > lim_ref.load(Ordering::Relaxed) {
            Err(mlua::Error::RuntimeError(
                "interrupt: execution budget exceeded".into(),
            ))
        } else {
            Ok(VmState::Continue)
        }
    });

    lua.load(LUAU_STUDY_SCRIPT)
        .exec()
        .map_err(|e| e.to_string())?;
    let globals = lua.globals();
    let batch_fn: Function = globals.get("eval_batch").map_err(|e| e.to_string())?;
    let step_fn: Function = globals.get("step_bar").map_err(|e| e.to_string())?;
    let out_fn: Function = globals.get("get_output").map_err(|e| e.to_string())?;
    let cold_start_ms = t_cold.elapsed().as_secs_f64() * 1000.0;

    // 100k historical batch (chunked in 1,000-bar reusable Luau tables to avoid allocator churn)
    const CHUNK: usize = 1_000;
    let highs: Table = lua.create_table_with_capacity(CHUNK, 0).map_err(|e| e.to_string())?;
    let lows: Table = lua.create_table_with_capacity(CHUNK, 0).map_err(|e| e.to_string())?;
    let closes: Table = lua.create_table_with_capacity(CHUNK, 0).map_err(|e| e.to_string())?;
    let vols: Table = lua.create_table_with_capacity(CHUNK, 0).map_err(|e| e.to_string())?;
    let sids: Table = lua.create_table_with_capacity(CHUNK, 0).map_err(|e| e.to_string())?;

    budget_used.store(0, Ordering::Relaxed);
    let t_batch = Instant::now();
    for chunk in hist.chunks(CHUNK) {
        for (idx, b) in chunk.iter().enumerate() {
            let k = idx + 1;
            highs.raw_set(k, b.high_tick as f64).map_err(|e| e.to_string())?;
            lows.raw_set(k, b.low_tick as f64).map_err(|e| e.to_string())?;
            closes.raw_set(k, b.close_tick as f64).map_err(|e| e.to_string())?;
            vols.raw_set(k, b.volume as f64).map_err(|e| e.to_string())?;
            sids.raw_set(k, b.session_id as f64).map_err(|e| e.to_string())?;
        }
        batch_fn
            .call::<()>((&highs, &lows, &closes, &vols, &sids, chunk.len()))
            .map_err(|e| e.to_string())?;
    }
    let batch_100k_ms = t_batch.elapsed().as_secs_f64() * 1000.0;
    let batch_output = read_luau_output(&out_fn)?;

    // 10,000 single-bar incremental live ticks (tight interrupt budget per tick)
    budget_limit.store(10_000, Ordering::Relaxed);
    let mut samples_ns = Vec::with_capacity(live.len());
    for bar in live {
        budget_used.store(0, Ordering::Relaxed);
        let t0 = Instant::now();
        step_fn
            .call::<()>((
                bar.high_tick as f64,
                bar.low_tick as f64,
                bar.close_tick as f64,
                bar.volume as f64,
                bar.session_id as f64,
            ))
            .map_err(|e| e.to_string())?;
        let _ = read_luau_output(&out_fn)?;
        samples_ns.push(t0.elapsed().as_nanos() as u64);
    }
    let live_output = read_luau_output(&out_fn)?;
    let live_10k = compute_latency_stats(&mut samples_ns);
    let rss_after = rss_mb();

    Ok(LuauBenchResult {
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

    let make_sandbox = |interrupt_budget: u64| {
        let lua = Lua::new();
        lua.sandbox(true).unwrap();
        lua.set_memory_limit(64 * 1024 * 1024).unwrap();
        let used = Arc::new(AtomicU64::new(0));
        let u = used.clone();
        lua.set_interrupt(move |_| {
            let n = u.fetch_add(1, Ordering::Relaxed);
            if n > interrupt_budget {
                Err(mlua::Error::RuntimeError(
                    "interrupt: timeout/budget exceeded".into(),
                ))
            } else {
                Ok(VmState::Continue)
            }
        });
        lua
    };

    // 1. Infinite Loop Termination
    {
        let lua = make_sandbox(50_000);
        let t0 = Instant::now();
        let res = lua.load("local x = 0; while true do x += 1 end").exec();
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => {
                let s = e.to_string();
                (s.contains("interrupt"), s)
            }
            Ok(_) => (false, "unexpectedly exited infinite loop".into()),
        };
        results.push(HostileTestOutcome {
            name: "Infinite loop termination (interrupt)",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 2. Memory Bomb Allocation (150 MiB under 64 MiB cap)
    {
        let lua = make_sandbox(1_000_000);
        let t0 = Instant::now();
        let res = lua
            .load(
                r#"
                local t = {}
                local chunk = string.rep("A", 1048576)
                for i = 1, 150 do
                    t[i] = chunk .. tostring(i)
                end
                return #t
                "#,
            )
            .eval::<usize>();
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => {
                let s = e.to_string();
                (
                    s.contains("memory") || s.contains("Memory") || s.contains("not enough"),
                    s,
                )
            }
            Ok(v) => (false, format!("unexpectedly allocated {v} MiB")),
        };
        results.push(HostileTestOutcome {
            name: "Memory bomb (150 MiB vs 64 MiB cap)",
            passed,
            elapsed_ms,
            detail,
        });
    }

    // 3. Filesystem / Network / Env Denied by Construction
    {
        let lua = make_sandbox(10_000);
        let t0 = Instant::now();
        let r_io = lua.load(r#"return io.open("/etc/passwd", "r")"#).eval::<mlua::Value>();
        let r_env = lua.load(r#"return os.getenv("HOME")"#).eval::<mlua::Value>();
        let r_exec = lua.load(r#"return os.execute("ls")"#).eval::<mlua::Value>();
        let r_loadfile = lua.load(r#"return loadfile("/etc/passwd")"#).eval::<mlua::Value>();
        let r_globals_nil: bool = lua
            .load("return io == nil and package == nil and dofile == nil and loadfile == nil and (os == nil or (os.execute == nil and os.getenv == nil))")
            .eval()
            .unwrap_or(false);
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let passed =
            r_io.is_err() && r_env.is_err() && r_exec.is_err() && r_loadfile.is_err() && r_globals_nil;
        let detail = format!(
            "sandboxed globals nil={r_globals_nil}; io.open err={:?}",
            r_io.err().map(|e| e.to_string())
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
        let lua = make_sandbox(1_000_000);
        let t0 = Instant::now();
        let res = lua
            .load("local function boom(n) return 1 + boom(n + 1) end; return boom(1)")
            .eval::<f64>();
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let (passed, detail) = match res {
            Err(e) => {
                let s = e.to_string();
                (s.contains("stack") || s.contains("overflow"), s)
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
