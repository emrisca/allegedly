#[derive(Debug, Clone, Copy)]
pub struct LatencyStats {
    pub p50_us: f64,
    pub p95_us: f64,
    pub p99_us: f64,
    pub max_us: f64,
    #[allow(dead_code)]
    pub mean_us: f64,
}

pub fn compute_latency_stats(samples_ns: &mut [u64]) -> LatencyStats {
    if samples_ns.is_empty() {
        return LatencyStats {
            p50_us: 0.0,
            p95_us: 0.0,
            p99_us: 0.0,
            max_us: 0.0,
            mean_us: 0.0,
        };
    }
    samples_ns.sort_unstable();
    let n = samples_ns.len();
    let pct = |p: f64| -> f64 {
        let idx = ((n as f64 - 1.0) * p).round() as usize;
        samples_ns[idx.min(n - 1)] as f64 / 1000.0
    };
    let sum: u128 = samples_ns.iter().map(|&x| x as u128).sum();
    LatencyStats {
        p50_us: pct(0.50),
        p95_us: pct(0.95),
        p99_us: pct(0.99),
        max_us: samples_ns[n - 1] as f64 / 1000.0,
        mean_us: (sum as f64 / n as f64) / 1000.0,
    }
}

#[cfg(target_os = "macos")]
pub fn current_rss_bytes() -> u64 {
    #[repr(C)]
    #[derive(Default)]
    struct TimeValue {
        seconds: i32,
        microseconds: i32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct MachTaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        resident_size_max: u64,
        user_time: TimeValue,
        system_time: TimeValue,
        policy: i32,
        suspend_count: i32,
    }

    unsafe extern "C" {
        fn mach_task_self() -> u32;
        fn task_info(
            target_task: u32,
            flavor: u32,
            task_info_out: *mut MachTaskBasicInfo,
            task_info_out_cnt: *mut u32,
        ) -> i32;
    }

    const MACH_TASK_BASIC_INFO: u32 = 20;
    let mut info = MachTaskBasicInfo::default();
    let mut count = (std::mem::size_of::<MachTaskBasicInfo>() / std::mem::size_of::<u32>()) as u32;
    let kr = unsafe { task_info(mach_task_self(), MACH_TASK_BASIC_INFO, &mut info, &mut count) };
    if kr == 0 {
        info.resident_size
    } else {
        0
    }
}

#[cfg(not(target_os = "macos"))]
pub fn current_rss_bytes() -> u64 {
    0
}

pub fn rss_mb() -> f64 {
    current_rss_bytes() as f64 / (1024.0 * 1024.0)
}
