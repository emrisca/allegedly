#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use allegedly_app::{AllegedlyRuntime, BootConfig};
use allegedly_ipc::{WorkspacePatch, WorkspacePatchResult, WorkspaceState};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PaperOrderRequest {
    symbol: String,
    side: String,
    order_type: String,
    qty_e9: String,
    limit_price_e9: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PaperOrderTicket {
    order_id: String,
    symbol: String,
    side: String,
    order_type: String,
    qty_e9: String,
    limit_price_e9: Option<String>,
    fill_price_e9: Option<String>,
    status: String,
    created_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PaperAccountSnapshot {
    mode: String,
    live_armed: bool,
    net_position_e9: BTreeMap<String, String>,
    orders: Vec<PaperOrderTicket>,
}

struct DesktopState {
    runtime: Mutex<AllegedlyRuntime>,
    order_counter: Mutex<u64>,
    net_positions: Mutex<BTreeMap<String, i128>>,
    orders: Mutex<Vec<PaperOrderTicket>>,
}

impl DesktopState {
    fn new() -> Self {
        Self {
            runtime: Mutex::new(AllegedlyRuntime::boot_offline_default()),
            order_counter: Mutex::new(0),
            net_positions: Mutex::new(BTreeMap::new()),
            orders: Mutex::new(Vec::new()),
        }
    }

    fn paper_snapshot(&self) -> PaperAccountSnapshot {
        let positions = self.net_positions.lock().expect("positions lock");
        let orders = self.orders.lock().expect("orders lock");
        PaperAccountSnapshot {
            mode: "PAPER / SIM".to_string(),
            live_armed: false,
            net_position_e9: positions
                .iter()
                .map(|(k, v)| (k.clone(), v.to_string()))
                .collect(),
            orders: orders.iter().take(50).cloned().collect(),
        }
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
fn get_workspace_snapshot(state: State<'_, DesktopState>) -> WorkspaceState {
    let rt = state.runtime.lock().expect("runtime lock");
    rt.workspace_hub.snapshot()
}

#[tauri::command]
fn apply_workspace_patch(
    state: State<'_, DesktopState>,
    payload: WorkspacePatch,
) -> WorkspacePatchResult {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.workspace_hub.apply_patch(payload)
}

#[tauri::command]
fn get_paper_account(state: State<'_, DesktopState>) -> PaperAccountSnapshot {
    state.paper_snapshot()
}

#[tauri::command]
fn submit_paper_order(
    state: State<'_, DesktopState>,
    payload: PaperOrderRequest,
) -> Result<PaperAccountSnapshot, String> {
    let qty: i128 = payload
        .qty_e9
        .parse()
        .map_err(|_| "invalid fixed-point qty_e9".to_string())?;
    if qty <= 0 {
        return Err("qty_e9 must be > 0".to_string());
    }

    let mut counter = state.order_counter.lock().expect("counter lock");
    *counter += 1;
    let id = format!("SIM-{:04}", *counter);
    drop(counter);

    let is_market = payload.order_type == "market";
    let ticket = PaperOrderTicket {
        order_id: id,
        symbol: payload.symbol.clone(),
        side: payload.side.clone(),
        order_type: payload.order_type,
        qty_e9: qty.to_string(),
        limit_price_e9: payload.limit_price_e9,
        fill_price_e9: if is_market {
            Some("95000000000000".to_string())
        } else {
            None
        },
        status: if is_market {
            "filled".to_string()
        } else {
            "working".to_string()
        },
        created_ms: now_ns() / 1_000_000,
    };

    if is_market {
        let mut positions = state.net_positions.lock().expect("positions lock");
        let entry = positions.entry(payload.symbol).or_insert(0);
        if payload.side == "buy" {
            *entry += qty;
        } else {
            *entry -= qty;
        }
    }

    {
        let mut orders = state.orders.lock().expect("orders lock");
        orders.insert(0, ticket);
    }

    Ok(state.paper_snapshot())
}

#[tauri::command]
fn kill_switch_cancel_all(state: State<'_, DesktopState>) -> PaperAccountSnapshot {
    {
        let mut orders = state.orders.lock().expect("orders lock");
        for o in orders.iter_mut() {
            if o.status == "working" {
                o.status = "canceled".to_string();
            }
        }
    }
    state.paper_snapshot()
}

#[tauri::command]
fn poll_binary_frame(state: State<'_, DesktopState>, _stream_id: u32) -> Option<Vec<u8>> {
    let mut rt = state.runtime.lock().expect("runtime lock");
    rt.step_sim_batch(8, now_ns())
}

fn main() {
    let desktop_state = DesktopState::new();
    // SV-01 / ADR-0009 boot assertions
    {
        let rt = desktop_state.runtime.lock().expect("runtime lock");
        assert!(!rt.config.updates_check_on_startup);
        assert!(!rt.config.live_armed);
    }

    tauri::Builder::default()
        .manage(desktop_state)
        .invoke_handler(tauri::generate_handler![
            get_boot_config,
            get_workspace_snapshot,
            apply_workspace_patch,
            get_paper_account,
            submit_paper_order,
            kill_switch_cancel_all,
            poll_binary_frame,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Allegedly desktop shell");
}
