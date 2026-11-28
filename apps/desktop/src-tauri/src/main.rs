#![deny(unsafe_code)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use allegedly_app::{
    AllegedlyRuntime, BootConfig, MarketDataStatusDto, PaperAccountSnapshotDto,
    PaperOrderSubmission,
};
use allegedly_core::ResolvedSetting;
use allegedly_ipc::{WorkspacePatch, WorkspacePatchResult, WorkspaceState};
use allegedly_replay::{ReplayControlAction, ReplayStatusSnapshot};
use allegedly_studies::{StudyRunRequest, StudyRunResponse};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{Manager, PhysicalPosition, PhysicalSize, RunEvent, State, WindowEvent};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettingOverridePayload {
    key: String,
    value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettingResetPayload {
    key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkspaceExportPayload {
    name: String,
    symbol: String,
    timeframe: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UiReadyPayload {
    first_paint_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MarketDataSourcePayload {
    source: String,
    symbol: String,
}

const WINDOW_STATE_FILE: &str = "window_state.json";
const MIN_SAVED_WIDTH: u32 = 320;
const MIN_SAVED_HEIGHT: u32 = 240;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
struct SavedWindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    #[serde(default)]
    maximized: bool,
    #[serde(default)]
    fullscreen: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MonitorRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RestoredGeometry {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

fn window_state_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join(WINDOW_STATE_FILE)
}

fn load_window_state(data_dir: &std::path::Path) -> Option<SavedWindowState> {
    let raw = std::fs::read_to_string(window_state_path(data_dir)).ok()?;
    let parsed: SavedWindowState = serde_json::from_str(&raw).ok()?;
    if parsed.width < MIN_SAVED_WIDTH || parsed.height < MIN_SAVED_HEIGHT {
        return None;
    }
    Some(parsed)
}

fn save_window_state(data_dir: &std::path::Path, state: SavedWindowState) -> std::io::Result<()> {
    if state.width < MIN_SAVED_WIDTH || state.height < MIN_SAVED_HEIGHT {
        return Ok(());
    }
    std::fs::create_dir_all(data_dir)?;
    let path = window_state_path(data_dir);
    let tmp = data_dir.join(format!("{WINDOW_STATE_FILE}.tmp"));
    let json = serde_json::to_string_pretty(&state)
        .map_err(|err| std::io::Error::other(err.to_string()))?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

fn overlap_extent(a_start: i64, a_len: u32, b_start: i64, b_len: u32) -> i64 {
    let a_end = a_start + i64::from(a_len);
    let b_end = b_start + i64::from(b_len);
    (a_end.min(b_end) - a_start.max(b_start)).max(0)
}

fn resolve_restored_geometry(
    saved: SavedWindowState,
    monitors: &[MonitorRect],
) -> RestoredGeometry {
    if monitors.is_empty() {
        return RestoredGeometry {
            width: saved.width,
            height: saved.height,
            x: saved.x,
            y: saved.y,
        };
    }

    // Pick the monitor with the largest visible intersection with the saved window rect.
    let mut best_monitor: Option<MonitorRect> = None;
    let mut best_area: i64 = 0;
    for &mon in monitors {
        let ox = overlap_extent(i64::from(saved.x), saved.width, i64::from(mon.x), mon.width);
        let oy = overlap_extent(
            i64::from(saved.y),
            saved.height,
            i64::from(mon.y),
            mon.height,
        );
        if ox >= 100 && oy >= 60 {
            let area = ox.saturating_mul(oy);
            if area > best_area {
                best_area = area;
                best_monitor = Some(mon);
            }
        }
    }

    if let Some(mon) = best_monitor {
        let width = saved.width.min(mon.width).max(MIN_SAVED_WIDTH.min(mon.width));
        let height = saved.height.min(mon.height).max(MIN_SAVED_HEIGHT.min(mon.height));
        // Keep the top-left inside a reachable band on the matched monitor.
        let max_x = mon.x.saturating_add(mon.width.saturating_sub(100) as i32);
        let min_x = mon.x.saturating_sub(width.saturating_sub(100) as i32);
        let max_y = mon.y.saturating_add(mon.height.saturating_sub(60) as i32);
        let x = saved.x.clamp(min_x, max_x);
        let y = saved.y.clamp(mon.y, max_y);
        RestoredGeometry {
            width,
            height,
            x,
            y,
        }
    } else {
        // Saved display was disconnected: preserve size (clamped to primary) and center on it.
        let primary = monitors[0];
        let width = saved
            .width
            .min(primary.width)
            .max(MIN_SAVED_WIDTH.min(primary.width));
        let height = saved
            .height
            .min(primary.height)
            .max(MIN_SAVED_HEIGHT.min(primary.height));
        let x = primary
            .x
            .saturating_add((primary.width.saturating_sub(width) / 2) as i32);
        let y = primary
            .y
            .saturating_add((primary.height.saturating_sub(height) / 2) as i32);
        RestoredGeometry {
            width,
            height,
            x,
            y,
        }
    }
}

fn capture_window_state(
    window: &tauri::WebviewWindow,
    previous: Option<SavedWindowState>,
) -> Option<SavedWindowState> {
    if window.is_minimized().unwrap_or(false) {
        return previous;
    }
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let maximized = window.is_maximized().unwrap_or(false);
    let size = window.inner_size().ok()?;
    let pos = window.outer_position().ok()?;

    if size.width < MIN_SAVED_WIDTH || size.height < MIN_SAVED_HEIGHT {
        return previous;
    }

    if fullscreen {
        let base = previous.unwrap_or(SavedWindowState {
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
            maximized: false,
            fullscreen: true,
        });
        return Some(SavedWindowState {
            fullscreen: true,
            maximized: false,
            ..base
        });
    }

    #[cfg(not(target_os = "macos"))]
    if maximized {
        let base = previous.unwrap_or(SavedWindowState {
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
            maximized: true,
            fullscreen: false,
        });
        return Some(SavedWindowState {
            maximized: true,
            fullscreen: false,
            ..base
        });
    }

    Some(SavedWindowState {
        width: size.width,
        height: size.height,
        x: pos.x,
        y: pos.y,
        maximized,
        fullscreen: false,
    })
}

fn restore_saved_window_geometry(
    window: &tauri::WebviewWindow,
    saved: SavedWindowState,
) {
    let monitors: Vec<MonitorRect> = window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            MonitorRect {
                x: p.x,
                y: p.y,
                width: s.width,
                height: s.height,
            }
        })
        .collect();
    let geo = resolve_restored_geometry(saved, &monitors);
    // Set size BEFORE position: on macOS `setContentSize` anchors bottom-left,
    // so applying `set_position` second locks the exact saved top-left corner.
    let _ = window.set_size(PhysicalSize::new(geo.width, geo.height));
    let _ = window.set_position(PhysicalPosition::new(geo.x, geo.y));
}

struct DesktopState {
    runtime: Mutex<AllegedlyRuntime>,
    data_dir: PathBuf,
    boot_instant: Instant,
    ready_logged: AtomicBool,
    window_revealed: AtomicBool,
    traffic_lights_visible: AtomicBool,
    pending_fullscreen: AtomicBool,
    pending_maximize: AtomicBool,
    last_window_state: Mutex<Option<SavedWindowState>>,
    last_saved_at: Mutex<Option<Instant>>,
}

impl DesktopState {
    fn new(data_dir: PathBuf) -> Result<Self, String> {
        let runtime = AllegedlyRuntime::boot_offline_with_data_dir(&data_dir)?;
        let initial_window_state = load_window_state(&data_dir);
        let pending_fullscreen = initial_window_state.is_some_and(|s| s.fullscreen);
        #[cfg(not(target_os = "macos"))]
        let pending_maximize = initial_window_state.is_some_and(|s| s.maximized && !s.fullscreen);
        #[cfg(target_os = "macos")]
        let pending_maximize = false;

        Ok(Self {
            runtime: Mutex::new(runtime),
            data_dir,
            boot_instant: Instant::now(),
            ready_logged: AtomicBool::new(false),
            window_revealed: AtomicBool::new(false),
            traffic_lights_visible: AtomicBool::new(false),
            pending_fullscreen: AtomicBool::new(pending_fullscreen),
            pending_maximize: AtomicBool::new(pending_maximize),
            last_window_state: Mutex::new(initial_window_state),
            last_saved_at: Mutex::new(None),
        })
    }

    fn record_window_state(&self, window: &tauri::WebviewWindow, flush_now: bool) {
        if !self.window_revealed.load(Ordering::SeqCst) {
            return;
        }
        let next = {
            let mut guard = self.last_window_state.lock().expect("window state lock");
            let captured = capture_window_state(window, *guard);
            if let Some(s) = captured {
                *guard = Some(s);
            }
            *guard
        };
        if let Some(state_to_save) = next {
            self.maybe_persist_window_state(state_to_save, flush_now);
        }
    }

    fn flush_cached_window_state(&self) {
        let cached = *self.last_window_state.lock().expect("window state lock");
        if let Some(state_to_save) = cached {
            let _ = save_window_state(&self.data_dir, state_to_save);
        }
    }

    fn maybe_persist_window_state(&self, state: SavedWindowState, force: bool) {
        if !force {
            let mut last = self.last_saved_at.lock().expect("last_saved_at lock");
            if let Some(prev) = *last {
                if prev.elapsed() < std::time::Duration::from_millis(250) {
                    return;
                }
            }
            *last = Some(Instant::now());
        } else {
            let mut last = self.last_saved_at.lock().expect("last_saved_at lock");
            *last = Some(Instant::now());
        }
        let _ = save_window_state(&self.data_dir, state);
    }
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn apply_macos_traffic_lights_visibility(window: &tauri::WebviewWindow, visible: bool) {
    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        use objc2_app_kit::{NSWindow, NSWindowButton};

        if let Ok(raw_ns_window) = win.ns_window() {
            if raw_ns_window.is_null() {
                return;
            }
            // SAFETY: Tauri's `ns_window()` returns a valid `NSWindow` pointer owned by the
            // live `WebviewWindow`, and we are executing on the macOS AppKit main thread.
            let ns_window = unsafe { &*(raw_ns_window as *const NSWindow) };
            for button_kind in [
                NSWindowButton::CloseButton,
                NSWindowButton::MiniaturizeButton,
                NSWindowButton::ZoomButton,
            ] {
                if let Some(button) = ns_window.standardWindowButton(button_kind) {
                    button.setHidden(!visible);
                }
            }
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn apply_macos_traffic_lights_visibility(_window: &tauri::WebviewWindow, _visible: bool) {}

fn now_ns() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

#[tauri::command]
fn get_boot_config(state: State<'_, DesktopState>) -> BootConfig {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.config.clone()
}

#[tauri::command]
fn get_workspace_state(state: State<'_, DesktopState>) -> WorkspaceState {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.workspace_hub.snapshot()
}

#[tauri::command]
fn apply_workspace_patch(
    state: State<'_, DesktopState>,
    payload: WorkspacePatch,
) -> WorkspacePatchResult {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.apply_workspace_patch(payload)
}

#[tauri::command]
fn get_paper_account(state: State<'_, DesktopState>) -> PaperAccountSnapshotDto {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.paper_account_snapshot()
}

#[tauri::command]
fn submit_paper_order(
    state: State<'_, DesktopState>,
    payload: PaperOrderSubmission,
) -> Result<PaperAccountSnapshotDto, String> {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.submit_paper_order(payload, now_ns() as i64)
}

#[tauri::command]
fn kill_switch_cancel_all(
    state: State<'_, DesktopState>,
) -> Result<PaperAccountSnapshotDto, String> {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.kill_switch_cancel_all(now_ns() as i64)
}

#[tauri::command]
fn run_study(
    state: State<'_, DesktopState>,
    payload: StudyRunRequest,
) -> Result<StudyRunResponse, String> {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.run_study(&payload)
}

#[tauri::command]
fn get_replay_status(state: State<'_, DesktopState>) -> ReplayStatusSnapshot {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.replay_status()
}

#[tauri::command]
fn control_replay(
    state: State<'_, DesktopState>,
    payload: ReplayControlAction,
) -> ReplayStatusSnapshot {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.control_replay(payload)
}

#[tauri::command]
fn get_settings_cascade(state: State<'_, DesktopState>) -> Vec<ResolvedSetting> {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.resolved_settings()
}

#[tauri::command]
fn update_setting_override(
    state: State<'_, DesktopState>,
    payload: SettingOverridePayload,
) -> Result<Vec<ResolvedSetting>, String> {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.set_setting_override(payload.key, payload.value)
}

#[tauri::command]
fn reset_setting_override(
    state: State<'_, DesktopState>,
    payload: SettingResetPayload,
) -> Vec<ResolvedSetting> {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.reset_setting_override(&payload.key)
}

#[tauri::command]
fn export_workspace_toml(
    state: State<'_, DesktopState>,
    payload: WorkspaceExportPayload,
) -> String {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.export_workspace_toml(&payload.name, &payload.symbol, &payload.timeframe)
}

/// Switch active market data source (`paper_sim`, `kraken_ws_v2`, `coinbase_ws`) & symbol.
/// Live WebSocket feeds connect ONLY after explicit invocation here (SV-01 offline boot invariant).
#[tauri::command]
fn set_market_data_source(
    state: State<'_, DesktopState>,
    payload: MarketDataSourcePayload,
) -> Result<MarketDataStatusDto, String> {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.set_market_data_source(&payload.source, &payload.symbol)
}

#[tauri::command]
fn get_market_data_status(state: State<'_, DesktopState>) -> MarketDataStatusDto {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.get_market_data_status()
}

/// Raw binary `application/octet-stream` IPC frame batch (`tauri::ipc::Response`; ADR-0002 / RTSD-02).
/// Packs length-prefixed `[u32_le][ALG2 frame]...` bytes with zero JSON array serialization.
#[tauri::command]
fn poll_binary_frames(state: State<'_, DesktopState>, stream_id: u32) -> tauri::ipc::Response {
    let _ = stream_id;
    let mut rt = state.runtime.lock().expect("runtime lock");
    let frames = rt.poll_live_or_sim_frames(now_ns());
    let packed = AllegedlyRuntime::pack_frames_raw(&frames);
    tauri::ipc::Response::new(packed)
}

/// Reveal the initially hidden main window once the first launch intro frame has painted.
#[tauri::command]
fn reveal_launch_window(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
    light: Option<bool>,
) {
    let bg = if light.unwrap_or(false) {
        tauri::window::Color(241, 243, 246, 255)
    } else {
        tauri::window::Color(7, 8, 10, 255)
    };
    let _ = window.set_background_color(Some(bg));
    let show_lights = state.traffic_lights_visible.load(Ordering::SeqCst);
    apply_macos_traffic_lights_visibility(&window, show_lights);
    if !state.window_revealed.swap(true, Ordering::SeqCst) {
        let _ = window.show();
        if state.pending_maximize.swap(false, Ordering::SeqCst) {
            let _ = window.maximize();
        }
        if state.pending_fullscreen.swap(false, Ordering::SeqCst) {
            let _ = window.set_fullscreen(true);
        }
        let _ = window.set_focus();
        // Re-assert traffic light visibility after order-front on macOS.
        let still_show = state.traffic_lights_visible.load(Ordering::SeqCst);
        apply_macos_traffic_lights_visibility(&window, still_show);
    }
}

/// Show or hide the native macOS traffic light buttons (Close / Miniaturize / Zoom).
#[tauri::command]
fn set_traffic_lights_visible(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
    visible: bool,
) {
    state.traffic_lights_visible.store(visible, Ordering::SeqCst);
    apply_macos_traffic_lights_visibility(&window, visible);
}

/// Deterministic frontend paint-readiness sentinel for `UV-05` cold-start telemetry (RTSD-05).
#[tauri::command]
fn report_ui_ready(state: State<'_, DesktopState>, payload: Option<UiReadyPayload>) -> u64 {
    let _ = payload;
    let elapsed_ms = state.boot_instant.elapsed().as_millis() as u64;
    if !state.ready_logged.swap(true, Ordering::SeqCst)
        && std::env::var("ALLEGEDLY_BENCH_READY").ok().as_deref() == Some("1")
    {
        println!("ALLEGEDLY_UI_READY_MS={elapsed_ms}");
        let _ = std::io::stdout().flush();
    }
    elapsed_ms
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = if let Ok(override_dir) = std::env::var("ALLEGEDLY_DATA_DIR") {
                PathBuf::from(override_dir)
            } else {
                app.path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::env::temp_dir().join("allegedly-data"))
            };
            let desktop_state = DesktopState::new(data_dir).map_err(std::io::Error::other)?;
            // SV-01 / ADR-0009 boot assertions
            {
                let rt = desktop_state.runtime.lock().expect("runtime lock");
                assert!(!rt.config.updates_check_on_startup);
                assert!(!rt.config.live_armed);
                assert!(rt.config.offline_mode);
            }
            app.manage(desktop_state);

            if let Some(main_window) = app.get_webview_window("main") {
                // Restore last closed window size & position while the window is still hidden
                // so the launch intro paints immediately at the saved dimensions.
                let initial_saved = *app
                    .state::<DesktopState>()
                    .last_window_state
                    .lock()
                    .expect("window state lock");
                if let Some(saved) = initial_saved {
                    restore_saved_window_geometry(&main_window, saved);
                }

                apply_macos_traffic_lights_visibility(&main_window, false);

                let win_for_events = main_window.clone();
                let handle_for_events = app.handle().clone();
                main_window.on_window_event(move |event| {
                    let state = handle_for_events.state::<DesktopState>();
                    match event {
                        WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                            state.record_window_state(&win_for_events, false);
                        }
                        WindowEvent::Focused(false) | WindowEvent::CloseRequested { .. } => {
                            state.record_window_state(&win_for_events, true);
                        }
                        WindowEvent::Destroyed => {
                            state.flush_cached_window_state();
                        }
                        _ => {}
                    }
                });

                // Safety fallback: ensure the window never remains hidden if the frontend fails to signal.
                let fallback_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(2500));
                    let state = fallback_handle.state::<DesktopState>();
                    if !state.window_revealed.swap(true, Ordering::SeqCst) {
                        if let Some(win) = fallback_handle.get_webview_window("main") {
                            state.traffic_lights_visible.store(true, Ordering::SeqCst);
                            apply_macos_traffic_lights_visibility(&win, true);
                            let _ = win.show();
                            if state.pending_maximize.swap(false, Ordering::SeqCst) {
                                let _ = win.maximize();
                            }
                            if state.pending_fullscreen.swap(false, Ordering::SeqCst) {
                                let _ = win.set_fullscreen(true);
                            }
                            let _ = win.set_focus();
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_boot_config,
            get_workspace_state,
            apply_workspace_patch,
            get_paper_account,
            submit_paper_order,
            kill_switch_cancel_all,
            run_study,
            get_replay_status,
            control_replay,
            get_settings_cascade,
            update_setting_override,
            reset_setting_override,
            export_workspace_toml,
            set_market_data_source,
            get_market_data_status,
            poll_binary_frames,
            reveal_launch_window,
            set_traffic_lights_visible,
            report_ui_ready,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Allegedly desktop shell")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                let state = app_handle.state::<DesktopState>();
                if let Some(win) = app_handle.get_webview_window("main") {
                    state.record_window_state(&win, true);
                } else {
                    state.flush_cached_window_state();
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tauri_desktop_state_enforces_sv01_and_wal_persistence() {
        let dir = std::env::temp_dir().join(format!("allegedly-tauri-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let state = DesktopState::new(dir.clone()).unwrap();
        {
            let mut rt = state.runtime.lock().unwrap();
            assert!(!rt.config.updates_check_on_startup);
            assert!(!rt.config.live_armed);
            assert!(rt.config.offline_mode);
            let status = rt.get_market_data_status();
            assert_eq!(status.source, "paper_sim");
            assert_eq!(status.symbol, "BTC/USD");
            assert!(rt.set_market_data_source("kraken_ws_v2", "ES1!").is_err());
            let frames = rt.poll_live_or_sim_frames(16_000_000);
            let packed = AllegedlyRuntime::pack_frames_raw(&frames);
            assert!(!packed.is_empty());
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn window_state_round_trips_and_rejects_invalid_sizes() {
        let dir =
            std::env::temp_dir().join(format!("allegedly-winstate-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let saved = SavedWindowState {
            width: 2200,
            height: 1400,
            x: 180,
            y: 96,
            maximized: false,
            fullscreen: false,
        };
        save_window_state(&dir, saved).unwrap();
        assert_eq!(load_window_state(&dir), Some(saved));

        // Tiny bogus sizes should never overwrite a valid saved state.
        let bogus = SavedWindowState {
            width: 0,
            height: 0,
            x: -32000,
            y: -32000,
            maximized: false,
            fullscreen: false,
        };
        save_window_state(&dir, bogus).unwrap();
        assert_eq!(load_window_state(&dir), Some(saved));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_restored_geometry_clamps_disconnected_monitor_to_primary() {
        let primary = MonitorRect {
            x: 0,
            y: 0,
            width: 2880,
            height: 1800,
        };
        // Window still visible on primary keeps exact size & position.
        let on_primary = SavedWindowState {
            width: 2100,
            height: 1300,
            x: 240,
            y: 140,
            maximized: false,
            fullscreen: false,
        };
        assert_eq!(
            resolve_restored_geometry(on_primary, &[primary]),
            RestoredGeometry {
                width: 2100,
                height: 1300,
                x: 240,
                y: 140,
            }
        );

        // Window from a disconnected display centers on primary and clamps oversized dimensions.
        let off_screen = SavedWindowState {
            width: 3400,
            height: 2000,
            x: 4000,
            y: 100,
            maximized: false,
            fullscreen: false,
        };
        assert_eq!(
            resolve_restored_geometry(off_screen, &[primary]),
            RestoredGeometry {
                width: 2880,
                height: 1800,
                x: 0,
                y: 0,
            }
        );
    }
}
