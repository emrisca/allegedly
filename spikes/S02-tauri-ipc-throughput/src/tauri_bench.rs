mod framing;

use serde_json::Value;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody, Response};

static BOOT_INSTANT: OnceLock<Instant> = OnceLock::new();
static BULK_BIN_100K: OnceLock<Arc<Vec<u8>>> = OnceLock::new();
static BULK_JSON_100K: OnceLock<Arc<Vec<framing::JsonBar>>> = OnceLock::new();

#[tauri::command]
fn get_boot_ms() -> f64 {
    BOOT_INSTANT
        .get()
        .map(|t| t.elapsed().as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

#[tauri::command]
fn ping_ipc(id: u64, client_ts: f64) -> (u64, f64) {
    (id, client_ts)
}

#[tauri::command]
fn get_bulk_bars_binary() -> Response {
    let data = BULK_BIN_100K
        .get_or_init(|| Arc::new(framing::build_bulk_bars_soa(100_000)));
    Response::new((**data).clone())
}

#[tauri::command]
fn get_bulk_bars_json() -> &'static [framing::JsonBar] {
    let data = BULK_JSON_100K
        .get_or_init(|| Arc::new(framing::build_bulk_bars_json_vec(100_000)));
    // Leak once in benchmark process for zero-copy borrow of pre-built JSON structs
    let ptr: *const [framing::JsonBar] = data.as_slice();
    unsafe { &*ptr }
}

#[tauri::command]
async fn stream_channel_binary(
    rate: u64,
    batch_ms: u64,
    duration_ms: u64,
    on_event: Channel<InvokeResponseBody>,
) -> Value {
    let start = Instant::now();
    let deadline = start + Duration::from_millis(duration_ms);
    let mut seq: u64 = 0;
    let mut frames_sent: u64 = 0;
    let mut bytes_sent: u64 = 0;
    let mut scratch = Vec::with_capacity(65_536);

    if batch_ms > 0 {
        let interval = Duration::from_millis(batch_ms);
        let msgs_per_batch = ((rate * batch_ms) / 1000).max(1) as usize;
        let mut next_tick = start;
        while Instant::now() < deadline {
            let now = Instant::now();
            if now < next_tick {
                tokio::time::sleep(next_tick - now).await;
            }
            next_tick += interval;
            let send_ns = start.elapsed().as_nanos() as u64;
            framing::pack_delta_batch(&mut scratch, seq, msgs_per_batch, send_ns);
            bytes_sent += scratch.len() as u64;
            if on_event.send(InvokeResponseBody::Raw(scratch.clone())).is_err() {
                break;
            }
            seq += msgs_per_batch as u64;
            frames_sent += 1;
        }
    } else {
        // Unbatched: 1 message per Channel.send() call, paced per 1ms quantum
        let per_ms = (rate / 1000).max(1) as usize;
        let mut next_ms = start;
        while Instant::now() < deadline {
            let now = Instant::now();
            if now < next_ms {
                tokio::time::sleep(next_ms - now).await;
            }
            next_ms += Duration::from_millis(1);
            let send_ns = start.elapsed().as_nanos() as u64;
            for _ in 0..per_ms {
                framing::pack_delta_batch(&mut scratch, seq, 1, send_ns);
                bytes_sent += scratch.len() as u64;
                if on_event.send(InvokeResponseBody::Raw(scratch.clone())).is_err() {
                    break;
                }
                seq += 1;
                frames_sent += 1;
            }
        }
    }

    let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
    serde_json::json!({
        "sent_msgs": seq,
        "sent_frames": frames_sent,
        "sent_bytes": bytes_sent,
        "server_elapsed_ms": elapsed_ms
    })
}

fn measure_process_tree_rss_mb(root_pid: u32) -> Value {
    let out = std::process::Command::new("ps")
        .args(["-eo", "pid,ppid,rss,comm"])
        .output();
    let Ok(out) = out else {
        return serde_json::json!(null);
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut children: std::collections::HashMap<u32, Vec<u32>> = std::collections::HashMap::new();
    let mut rss_map: std::collections::HashMap<u32, u64> = std::collections::HashMap::new();
    let mut comm_map: std::collections::HashMap<u32, String> = std::collections::HashMap::new();

    for line in text.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let Ok(pid) = parts[0].parse::<u32>() else { continue };
        let Ok(ppid) = parts[1].parse::<u32>() else { continue };
        let Ok(rss) = parts[2].parse::<u64>() else { continue };
        rss_map.insert(pid, rss);
        comm_map.insert(pid, parts[3..].join(" "));
        children.entry(ppid).or_default().push(pid);
    }

    let mut total_kb: u64 = 0;
    let mut procs = Vec::new();
    let mut queue = std::collections::VecDeque::new();
    let mut seen = std::collections::HashSet::new();
    queue.push_back(root_pid);
    while let Some(p) = queue.pop_front() {
        if !seen.insert(p) {
            continue;
        }
        let kb = *rss_map.get(&p).unwrap_or(&0);
        total_kb += kb;
        procs.push(serde_json::json!({
            "pid": p,
            "rssMB": ((kb as f64 / 1024.0) * 100.0).round() / 100.0,
            "comm": comm_map.get(&p).cloned().unwrap_or_default()
        }));
        if let Some(ch) = children.get(&p) {
            for &c in ch {
                queue.push_back(c);
            }
        }
    }

    serde_json::json!({
        "rootPid": root_pid,
        "processCount": seen.len(),
        "totalRssMB": ((total_kb as f64 / 1024.0) * 100.0).round() / 100.0,
        "processes": procs
    })
}

#[tauri::command]
fn report_results(app: tauri::AppHandle, mut payload: Value) {
    let pid = std::process::id();
    let rss = measure_process_tree_rss_mb(pid);
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("nativeProcessTree".to_string(), rss);
    }
    let out_path = std::env::var("S02_TAURI_OUT")
        .unwrap_or_else(|_| "tauri-bench-results.json".to_string());
    if let Ok(pretty) = serde_json::to_string_pretty(&payload) {
        let _ = std::fs::write(&out_path, pretty);
    }
    println!("S02_TAURI_DONE {out_path}");
    app.exit(0);
}

fn main() {
    let _ = BOOT_INSTANT.set(Instant::now());
    // Pre-build 100k payloads before WebView init so bulk IPC timing isolates transport + decode
    let _ = BULK_BIN_100K.set(Arc::new(framing::build_bulk_bars_soa(100_000)));
    let _ = BULK_JSON_100K.set(Arc::new(framing::build_bulk_bars_json_vec(100_000)));

    let mut builder = tauri::Builder::default().invoke_handler(tauri::generate_handler![
        get_boot_ms,
        ping_ipc,
        get_bulk_bars_binary,
        get_bulk_bars_json,
        stream_channel_binary,
        report_results
    ]);

    builder = builder.setup(|app| {
        #[cfg(target_os = "macos")]
        {
            // Keep completely headless/background so we never show a Dock icon or steal focus
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("error running s02-tauri-ipc");
}
