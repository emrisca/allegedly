#![forbid(unsafe_code)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use allegedly_app::{AllegedlyRuntime, BootConfig, PaperAccountSnapshotDto, PaperOrderSubmission};
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
use tauri::{Manager, State};

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

struct DesktopState {
    runtime: Mutex<AllegedlyRuntime>,
    boot_instant: Instant,
    ready_logged: AtomicBool,
}

impl DesktopState {
    fn new(data_dir: PathBuf) -> Result<Self, String> {
        let runtime = AllegedlyRuntime::boot_offline_with_data_dir(&data_dir)?;
        Ok(Self {
            runtime: Mutex::new(runtime),
            boot_instant: Instant::now(),
            ready_logged: AtomicBool::new(false),
        })
    }
}

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

/// Raw binary `application/octet-stream` IPC frame batch (`tauri::ipc::Response`; ADR-0002 / RTSD-02).
/// Packs length-prefixed `[u32_le][ALG2 frame]...` bytes with zero JSON array serialization.
#[tauri::command]
fn poll_binary_frames(state: State<'_, DesktopState>, stream_id: u32) -> tauri::ipc::Response {
    let _ = stream_id;
    let mut rt = state.runtime.lock().expect("runtime lock");
    let frames = rt.step_sim_frames(8, now_ns());
    let packed = AllegedlyRuntime::pack_frames_raw(&frames);
    tauri::ipc::Response::new(packed)
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
            }
            app.manage(desktop_state);
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
            poll_binary_frames,
            report_ui_ready,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Allegedly desktop shell");
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
            let frames = rt.step_sim_frames(8, 16_000_000);
            let packed = AllegedlyRuntime::pack_frames_raw(&frames);
            assert!(!packed.is_empty());
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
