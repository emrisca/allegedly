use crate::types::{now_unix_ns, InstrumentSpec, Position, PriceTicks, Qty, Side};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio::sync::broadcast;

#[derive(Debug, Clone)]
pub enum InjectedFault {
    RateLimit429 { retry_after_ms: u64 },
    Server5xxBeforeCommit(u16),
    Server5xxAfterCommit(u16),
    MalformedJson,
    InvalidNumericField,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaOrderWire {
    pub id: String,
    pub client_order_id: String,
    pub symbol: String,
    pub side: String,
    #[serde(rename = "type")]
    pub order_type: String,
    pub order_class: String,
    pub time_in_force: String,
    pub qty: String,
    pub filled_qty: String,
    pub filled_avg_price: Option<String>,
    pub limit_price: Option<String>,
    pub stop_price: Option<String>,
    pub trail_price: Option<String>,
    pub trail_percent: Option<String>,
    pub status: String,
    pub legs: Option<Vec<AlpacaOrderWire>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaPositionWire {
    pub symbol: String,
    pub qty: String,
    pub avg_entry_price: String,
    pub side: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaAccountWire {
    pub id: String,
    pub status: String,
    pub equity: String,
    pub buying_power: String,
    pub trading_blocked: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct CreateOrderBody {
    symbol: String,
    qty: String,
    side: String,
    #[serde(rename = "type")]
    order_type: String,
    time_in_force: String,
    client_order_id: String,
    #[serde(default = "default_simple")]
    order_class: String,
    limit_price: Option<String>,
    stop_price: Option<String>,
    trail_price: Option<String>,
    trail_percent: Option<String>,
    take_profit: Option<TakeProfitSpec>,
    stop_loss: Option<StopLossSpec>,
}

fn default_simple() -> String {
    "simple".to_string()
}

#[derive(Debug, Clone, Deserialize)]
struct TakeProfitSpec {
    limit_price: String,
}

#[derive(Debug, Clone, Deserialize)]
struct StopLossSpec {
    stop_price: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ReplaceOrderBody {
    qty: Option<String>,
    limit_price: Option<String>,
    stop_price: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClientIdQuery {
    client_order_id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ListOrdersQuery {
    status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClosePositionsQuery {
    cancel_orders: Option<bool>,
}

#[derive(Debug, Clone)]
struct StoredOrder {
    wire: AlpacaOrderWire,
    spec: InstrumentSpec,
    qty: Qty,
    filled_qty: Qty,
    notional_ticks: i128,
    oco_sibling_id: Option<String>,
    parent_id: Option<String>,
    trail_watermark: Option<PriceTicks>,
}

struct MockStateInner {
    expected_key_id: String,
    expected_secret: String,
    specs: HashMap<String, InstrumentSpec>,
    last_prices: HashMap<String, PriceTicks>,
    orders: HashMap<String, StoredOrder>,
    id_by_client_id: HashMap<String, String>,
    positions: HashMap<String, Position>,
    next_id: u64,
    next_exec_id: u64,
    post_fault_queue: VecDeque<InjectedFault>,
    partial_fill_chunks: Option<Vec<i64>>,
    initial_equity_micros: i128,
}

#[derive(Clone)]
pub struct MockAlpacaHandle {
    state: Arc<Mutex<MockStateInner>>,
    ws_tx: broadcast::Sender<String>,
    ws_drop_tx: broadcast::Sender<()>,
    pub base_http_url: String,
    pub ws_url: String,
    pub addr: SocketAddr,
}

impl MockAlpacaHandle {
    pub async fn start(
        key_id: impl Into<String>,
        secret: impl Into<String>,
        specs: Vec<InstrumentSpec>,
    ) -> Self {
        let mut spec_map = HashMap::new();
        for s in specs {
            spec_map.insert(s.symbol.clone(), s);
        }
        let state = Arc::new(Mutex::new(MockStateInner {
            expected_key_id: key_id.into(),
            expected_secret: secret.into(),
            specs: spec_map,
            last_prices: HashMap::new(),
            orders: HashMap::new(),
            id_by_client_id: HashMap::new(),
            positions: HashMap::new(),
            next_id: 1,
            next_exec_id: 1,
            post_fault_queue: VecDeque::new(),
            partial_fill_chunks: None,
            initial_equity_micros: 100_000_000_000, // $100,000
        }));
        let (ws_tx, _) = broadcast::channel(4096);
        let (ws_drop_tx, _) = broadcast::channel(64);

        let app_state = AppState {
            inner: state.clone(),
            ws_tx: ws_tx.clone(),
            ws_drop_tx: ws_drop_tx.clone(),
        };

        let router = Router::new()
            .route("/v2/orders", post(handle_post_order).get(handle_list_orders).delete(handle_cancel_all))
            .route("/v2/orders:by_client_order_id", get(handle_get_by_client_id))
            .route("/v2/orders/{order_id}", patch(handle_replace_order).delete(handle_cancel_order))
            .route("/v2/positions", get(handle_list_positions).delete(handle_close_all_positions))
            .route("/v2/account", get(handle_get_account))
            .route("/stream", get(handle_ws_stream))
            .with_state(app_state);

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind local mock alpaca");
        let addr = listener.local_addr().expect("local addr");
        tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        Self {
            state,
            ws_tx,
            ws_drop_tx,
            base_http_url: format!("http://{addr}"),
            ws_url: format!("ws://{addr}/stream"),
            addr,
        }
    }

    pub fn set_market_price(&self, symbol: &str, price: PriceTicks) {
        let mut ws_msgs = Vec::new();
        {
            let mut st = self.state.lock().expect("mock lock");
            st.last_prices.insert(symbol.to_string(), price);
            evaluate_mock_orders(&mut st, symbol, price, &mut ws_msgs);
        }
        for m in ws_msgs {
            let _ = self.ws_tx.send(m);
        }
    }

    pub fn enqueue_post_fault(&self, fault: InjectedFault) {
        self.state
            .lock()
            .expect("mock lock")
            .post_fault_queue
            .push_back(fault);
    }

    pub fn set_partial_fill_chunks(&self, chunks: Option<Vec<i64>>) {
        self.state.lock().expect("mock lock").partial_fill_chunks = chunks;
    }

    /// Forcibly drops all active WebSocket trade_updates subscribers to simulate mid-session disconnect.
    pub fn force_drop_ws(&self) {
        let _ = self.ws_drop_tx.send(());
    }

    pub fn total_order_count(&self) -> usize {
        self.state.lock().expect("mock lock").orders.len()
    }

    /// Simulate a venue-side fill directly (e.g., while OMS is crashed/offline).
    pub fn simulate_background_fill(
        &self,
        client_order_id: &str,
        fill_qty: Qty,
        fill_price: PriceTicks,
        broadcast_ws: bool,
    ) {
        let mut ws_msgs = Vec::new();
        {
            let mut st = self.state.lock().expect("mock lock");
            if let Some(oid) = st.id_by_client_id.get(client_order_id).cloned() {
                apply_mock_fill(&mut st, &oid, fill_qty, fill_price, &mut ws_msgs);
            }
        }
        if broadcast_ws {
            for m in ws_msgs {
                let _ = self.ws_tx.send(m);
            }
        }
    }

    pub fn simulate_background_cancel(&self, client_order_id: &str, broadcast_ws: bool) {
        let mut ws_msgs = Vec::new();
        {
            let mut st = self.state.lock().expect("mock lock");
            if let Some(oid) = st.id_by_client_id.get(client_order_id).cloned() {
                if let Some(ord) = st.orders.get_mut(&oid) {
                    if !is_terminal_status(&ord.wire.status) {
                        ord.wire.status = "canceled".to_string();
                        ws_msgs.push(make_trade_update_json("canceled", &ord.wire, None, None, None));
                    }
                }
            }
        }
        if broadcast_ws {
            for m in ws_msgs {
                let _ = self.ws_tx.send(m);
            }
        }
    }

    pub fn inject_orphan_order(
        &self,
        client_order_id: &str,
        symbol: &str,
        side: Side,
        qty: Qty,
        limit_price: PriceTicks,
    ) {
        let mut st = self.state.lock().expect("mock lock");
        let spec = st
            .specs
            .get(symbol)
            .cloned()
            .unwrap_or_else(|| InstrumentSpec::us_equity(symbol));
        let oid = format!("alp-orphan-{}", st.next_id);
        st.next_id += 1;
        let wire = AlpacaOrderWire {
            id: oid.clone(),
            client_order_id: client_order_id.to_string(),
            symbol: symbol.to_string(),
            side: side.as_alpaca_str().to_string(),
            order_type: "limit".to_string(),
            order_class: "simple".to_string(),
            time_in_force: "day".to_string(),
            qty: spec.format_qty(qty),
            filled_qty: "0".to_string(),
            filled_avg_price: None,
            limit_price: Some(spec.format_price_ticks(limit_price).unwrap_or_default()),
            stop_price: None,
            trail_price: None,
            trail_percent: None,
            status: "new".to_string(),
            legs: None,
        };
        st.id_by_client_id
            .insert(client_order_id.to_string(), oid.clone());
        st.orders.insert(
            oid,
            StoredOrder {
                wire,
                spec,
                qty,
                filled_qty: Qty::ZERO,
                notional_ticks: 0,
                oco_sibling_id: None,
                parent_id: None,
                trail_watermark: None,
            },
        );
    }
}

#[derive(Clone)]
struct AppState {
    inner: Arc<Mutex<MockStateInner>>,
    ws_tx: broadcast::Sender<String>,
    ws_drop_tx: broadcast::Sender<()>,
}

fn check_auth(headers: &HeaderMap, st: &MockStateInner) -> Result<(), Response> {
    let k = headers
        .get("APCA-API-KEY-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let s = headers
        .get("APCA-API-SECRET-KEY")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if k == st.expected_key_id && s == st.expected_secret {
        Ok(())
    } else {
        Err((StatusCode::FORBIDDEN, Json(json!({"message": "forbidden"}))).into_response())
    }
}

fn is_terminal_status(s: &str) -> bool {
    matches!(s, "filled" | "canceled" | "expired" | "rejected" | "replaced")
}

fn make_trade_update_json(
    event: &str,
    order: &AlpacaOrderWire,
    price: Option<String>,
    qty: Option<String>,
    exec_id: Option<String>,
) -> String {
    json!({
        "stream": "trade_updates",
        "data": {
            "event": event,
            "execution_id": exec_id,
            "price": price,
            "qty": qty,
            "timestamp_ns": now_unix_ns(),
            "order": order
        }
    })
    .to_string()
}

fn apply_mock_fill(
    st: &mut MockStateInner,
    oid: &str,
    fill_qty: Qty,
    fill_price: PriceTicks,
    ws_msgs: &mut Vec<String>,
) {
    let exec_id = format!("alp-exec-{}", st.next_exec_id);
    st.next_exec_id += 1;

    let (symbol, side, spec, oco_sib, updated_wire, is_full) = {
        let Some(ord) = st.orders.get_mut(oid) else {
            return;
        };
        if is_terminal_status(&ord.wire.status) {
            return;
        }
        let rem = ord.qty.0 - ord.filled_qty.0;
        let actual = fill_qty.0.min(rem);
        if actual <= 0 {
            return;
        }
        ord.filled_qty = Qty(ord.filled_qty.0 + actual);
        ord.notional_ticks += (actual as i128) * (fill_price.0 as i128);
        let avg_ticks = PriceTicks((ord.notional_ticks / (ord.filled_qty.0 as i128)) as i64);
        let is_full = ord.filled_qty == ord.qty;
        ord.wire.filled_qty = ord.spec.format_qty(ord.filled_qty);
        ord.wire.filled_avg_price = ord.spec.format_price_ticks(avg_ticks).ok();
        ord.wire.status = if is_full {
            "filled".to_string()
        } else {
            "partially_filled".to_string()
        };
        let side = if ord.wire.side == "buy" {
            Side::Buy
        } else {
            Side::Sell
        };
        (
            ord.wire.symbol.clone(),
            side,
            ord.spec.clone(),
            ord.oco_sibling_id.clone(),
            ord.wire.clone(),
            is_full,
        )
    };

    let pos = st
        .positions
        .entry(symbol.clone())
        .or_insert_with(|| Position::flat(&symbol));
    let _ = pos.apply_fill(&spec, side, fill_qty, fill_price);

    let ev_name = if is_full { "fill" } else { "partial_fill" };
    ws_msgs.push(make_trade_update_json(
        ev_name,
        &updated_wire,
        spec.format_price_ticks(fill_price).ok(),
        Some(spec.format_qty(fill_qty)),
        Some(exec_id),
    ));

    // Activate / scale native bracket child legs if this order has children
    let child_ids: Vec<String> = st
        .orders
        .values()
        .filter(|o| o.parent_id.as_deref() == Some(oid) && !is_terminal_status(&o.wire.status))
        .map(|o| o.wire.id.clone())
        .collect();
    if !child_ids.is_empty() {
        let parent_cum = st
            .orders
            .get(oid)
            .map(|o| o.filled_qty)
            .unwrap_or(Qty::ZERO);
        for cid in child_ids {
            if let Some(child) = st.orders.get_mut(&cid) {
                child.qty = parent_cum;
                child.wire.qty = child.spec.format_qty(parent_cum);
                if child.wire.status == "held" {
                    child.wire.status = "new".to_string();
                    ws_msgs.push(make_trade_update_json("new", &child.wire, None, None, None));
                } else {
                    ws_msgs.push(make_trade_update_json(
                        "replaced",
                        &child.wire,
                        None,
                        None,
                        None,
                    ));
                }
            }
        }
    }

    // Atomic OCO sibling cancellation
    if let Some(sib_id) = oco_sib {
        if let Some(sib) = st.orders.get_mut(&sib_id) {
            if !is_terminal_status(&sib.wire.status) {
                sib.wire.status = "canceled".to_string();
                ws_msgs.push(make_trade_update_json("canceled", &sib.wire, None, None, None));
            }
        }
    }
}

fn evaluate_mock_orders(
    st: &mut MockStateInner,
    symbol: &str,
    price: PriceTicks,
    ws_msgs: &mut Vec<String>,
) {
    let candidates: Vec<String> = st
        .orders
        .values()
        .filter(|o| {
            o.wire.symbol == symbol
                && !is_terminal_status(&o.wire.status)
                && o.wire.status != "held"
        })
        .map(|o| o.wire.id.clone())
        .collect();

    for oid in candidates {
        let maybe_fill: Option<(Qty, PriceTicks)> = {
            let Some(ord) = st.orders.get_mut(&oid) else {
                continue;
            };
            if is_terminal_status(&ord.wire.status) || ord.wire.status == "held" {
                continue;
            }
            let rem = Qty(ord.qty.0 - ord.filled_qty.0);
            let side = if ord.wire.side == "buy" {
                Side::Buy
            } else {
                Side::Sell
            };
            match ord.wire.order_type.as_str() {
                "market" => Some((rem, price)),
                "limit" => {
                    let lp = ord
                        .wire
                        .limit_price
                        .as_deref()
                        .and_then(|s| ord.spec.parse_price_str(s).ok());
                    match (side, lp) {
                        (Side::Buy, Some(l)) if price <= l => Some((rem, l.min(price))),
                        (Side::Sell, Some(l)) if price >= l => Some((rem, l.max(price))),
                        _ => None,
                    }
                }
                "stop" => {
                    let sp = ord
                        .wire
                        .stop_price
                        .as_deref()
                        .and_then(|s| ord.spec.parse_price_str(s).ok());
                    match (side, sp) {
                        (Side::Buy, Some(s)) if price >= s => Some((rem, price)),
                        (Side::Sell, Some(s)) if price <= s => Some((rem, price)),
                        _ => None,
                    }
                }
                "trailing_stop" => {
                    let wm = match ord.trail_watermark {
                        Some(w) => match side {
                            Side::Sell => w.max(price),
                            Side::Buy => w.min(price),
                        },
                        None => price,
                    };
                    ord.trail_watermark = Some(wm);
                    let offset = if let Some(tp) = &ord.wire.trail_price {
                        ord.spec.parse_price_str(tp).map(|p| p.0).unwrap_or(0)
                    } else if let Some(pct) = &ord.wire.trail_percent {
                        // trail_percent e.g. "2.50" => 250 bps => parse via equity 0.01 scale
                        let pct_spec = InstrumentSpec::us_equity("PCT");
                        let bps = pct_spec.parse_price_str(pct).map(|p| p.0).unwrap_or(0);
                        ((wm.0 as i128 * bps as i128) / 10_000_i128) as i64
                    } else {
                        0
                    };
                    match side {
                        Side::Sell if price.0 <= wm.0 - offset => Some((rem, price)),
                        Side::Buy if price.0 >= wm.0 + offset => Some((rem, price)),
                        _ => None,
                    }
                }
                _ => None,
            }
        };

        if let Some((rem, px)) = maybe_fill {
            let chunks = match st.partial_fill_chunks.clone() {
                Some(v) => {
                    let mut out = Vec::new();
                    let mut left = rem.0;
                    for c in v {
                        if left <= 0 {
                            break;
                        }
                        let take = c.min(left);
                        if take > 0 {
                            out.push(take);
                            left -= take;
                        }
                    }
                    if left > 0 {
                        out.push(left);
                    }
                    out
                }
                None => vec![rem.0],
            };
            for c in chunks {
                apply_mock_fill(st, &oid, Qty(c), px, ws_msgs);
            }
        }
    }
}

async fn handle_post_order(
    State(app): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateOrderBody>,
) -> Response {
    let mut ws_msgs = Vec::new();
    let resp = {
        let mut st = app.inner.lock().expect("mock lock");
        if let Err(r) = check_auth(&headers, &st) {
            return r;
        }

        // Pop injected fault if any
        if let Some(fault) = st.post_fault_queue.pop_front() {
            match fault {
                InjectedFault::RateLimit429 { retry_after_ms } => {
                    let mut r = (
                        StatusCode::TOO_MANY_REQUESTS,
                        Json(json!({"message": "rate limit exceeded"})),
                    )
                        .into_response();
                    r.headers_mut().insert(
                        "X-Retry-After-Ms",
                        retry_after_ms.to_string().parse().unwrap(),
                    );
                    return r;
                }
                InjectedFault::Server5xxBeforeCommit(code) => {
                    let sc = StatusCode::from_u16(code)
                        .unwrap_or(StatusCode::SERVICE_UNAVAILABLE);
                    return (sc, Json(json!({"message": "transient upstream error"})))
                        .into_response();
                }
                InjectedFault::MalformedJson => {
                    return (StatusCode::OK, "{broken_json:::").into_response();
                }
                InjectedFault::InvalidNumericField => {
                    return (
                        StatusCode::OK,
                        Json(json!({
                            "id": "alp-bad-1",
                            "client_order_id": body.client_order_id,
                            "symbol": body.symbol,
                            "side": body.side,
                            "type": body.order_type,
                            "order_class": "simple",
                            "time_in_force": body.time_in_force,
                            "qty": "NaN",
                            "filled_qty": "0",
                            "status": "new"
                        })),
                    )
                        .into_response();
                }
                InjectedFault::Server5xxAfterCommit(code) => {
                    // Put back a marker: we commit order below, THEN return 5xx!
                    // Handle via flag below.
                    let commit_res = commit_order(&mut st, &body, &mut ws_msgs);
                    let sc = StatusCode::from_u16(code)
                        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
                    match commit_res {
                        Ok(_) => {
                            let r = (
                                sc,
                                Json(json!({"message": "committed but response failed"})),
                            )
                                .into_response();
                            drop(st);
                            for m in ws_msgs {
                                let _ = app.ws_tx.send(m);
                            }
                            return r;
                        }
                        Err(err_resp) => return err_resp,
                    }
                }
            }
        }

        match commit_order(&mut st, &body, &mut ws_msgs) {
            Ok(wire) => (StatusCode::OK, Json(wire)).into_response(),
            Err(err_resp) => err_resp,
        }
    };

    for m in ws_msgs {
        let _ = app.ws_tx.send(m);
    }
    resp
}

fn commit_order(
    st: &mut MockStateInner,
    body: &CreateOrderBody,
    ws_msgs: &mut Vec<String>,
) -> Result<AlpacaOrderWire, Response> {
    if st.id_by_client_id.contains_key(&body.client_order_id) {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"code": 40010001, "message": "client_order_id must be unique"})),
        )
            .into_response());
    }

    let spec = st
        .specs
        .get(&body.symbol)
        .cloned()
        .unwrap_or_else(|| InstrumentSpec::us_equity(&body.symbol));
    let qty = spec.parse_qty_str(&body.qty).map_err(|e| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"message": format!("invalid qty: {e}")})),
        )
            .into_response()
    })?;

    let oid = format!("alp-ord-{}", st.next_id);
    st.next_id += 1;

    let mut legs_wire = None;
    let mut created_legs: Vec<StoredOrder> = Vec::new();
    if body.order_class == "bracket" {
        if let (Some(tp), Some(sl)) = (&body.take_profit, &body.stop_loss) {
            let exit_side = if body.side == "buy" { "sell" } else { "buy" };
            let tp_id = format!("alp-ord-{}", st.next_id);
            st.next_id += 1;
            let sl_id = format!("alp-ord-{}", st.next_id);
            st.next_id += 1;

            let tp_wire = AlpacaOrderWire {
                id: tp_id.clone(),
                client_order_id: format!("{}-tp", body.client_order_id),
                symbol: body.symbol.clone(),
                side: exit_side.to_string(),
                order_type: "limit".to_string(),
                order_class: "simple".to_string(),
                time_in_force: body.time_in_force.clone(),
                qty: body.qty.clone(),
                filled_qty: "0".to_string(),
                filled_avg_price: None,
                limit_price: Some(tp.limit_price.clone()),
                stop_price: None,
                trail_price: None,
                trail_percent: None,
                status: "held".to_string(),
                legs: None,
            };
            let sl_wire = AlpacaOrderWire {
                id: sl_id.clone(),
                client_order_id: format!("{}-sl", body.client_order_id),
                symbol: body.symbol.clone(),
                side: exit_side.to_string(),
                order_type: "stop".to_string(),
                order_class: "simple".to_string(),
                time_in_force: body.time_in_force.clone(),
                qty: body.qty.clone(),
                filled_qty: "0".to_string(),
                filled_avg_price: None,
                limit_price: None,
                stop_price: Some(sl.stop_price.clone()),
                trail_price: None,
                trail_percent: None,
                status: "held".to_string(),
                legs: None,
            };
            legs_wire = Some(vec![tp_wire.clone(), sl_wire.clone()]);
            created_legs.push(StoredOrder {
                wire: tp_wire,
                spec: spec.clone(),
                qty,
                filled_qty: Qty::ZERO,
                notional_ticks: 0,
                oco_sibling_id: Some(sl_id.clone()),
                parent_id: Some(oid.clone()),
                trail_watermark: None,
            });
            created_legs.push(StoredOrder {
                wire: sl_wire,
                spec: spec.clone(),
                qty,
                filled_qty: Qty::ZERO,
                notional_ticks: 0,
                oco_sibling_id: Some(tp_id.clone()),
                parent_id: Some(oid.clone()),
                trail_watermark: None,
            });
        }
    }

    let wire = AlpacaOrderWire {
        id: oid.clone(),
        client_order_id: body.client_order_id.clone(),
        symbol: body.symbol.clone(),
        side: body.side.clone(),
        order_type: body.order_type.clone(),
        order_class: body.order_class.clone(),
        time_in_force: body.time_in_force.clone(),
        qty: body.qty.clone(),
        filled_qty: "0".to_string(),
        filled_avg_price: None,
        limit_price: body.limit_price.clone(),
        stop_price: body.stop_price.clone(),
        trail_price: body.trail_price.clone(),
        trail_percent: body.trail_percent.clone(),
        status: "new".to_string(),
        legs: legs_wire,
    };

    let last_px = st.last_prices.get(&body.symbol).copied();
    st.id_by_client_id
        .insert(body.client_order_id.clone(), oid.clone());
    st.orders.insert(
        oid.clone(),
        StoredOrder {
            wire: wire.clone(),
            spec: spec.clone(),
            qty,
            filled_qty: Qty::ZERO,
            notional_ticks: 0,
            oco_sibling_id: None,
            parent_id: None,
            trail_watermark: last_px,
        },
    );
    for leg in created_legs {
        st.id_by_client_id
            .insert(leg.wire.client_order_id.clone(), leg.wire.id.clone());
        st.orders.insert(leg.wire.id.clone(), leg);
    }

    ws_msgs.push(make_trade_update_json("new", &wire, None, None, None));

    // Fill immediately if market or marketable limit
    if let Some(px) = last_px {
        let side = if body.side == "buy" {
            Side::Buy
        } else {
            Side::Sell
        };
        let marketable = match body.order_type.as_str() {
            "market" => true,
            "limit" => body
                .limit_price
                .as_deref()
                .and_then(|s| spec.parse_price_str(s).ok())
                .map(|lp| match side {
                    Side::Buy => px <= lp,
                    Side::Sell => px >= lp,
                })
                .unwrap_or(false),
            _ => false,
        };
        if marketable {
            let chunks = match st.partial_fill_chunks.clone() {
                Some(v) => {
                    let mut out = Vec::new();
                    let mut left = qty.0;
                    for c in v {
                        if left <= 0 {
                            break;
                        }
                        let take = c.min(left);
                        if take > 0 {
                            out.push(take);
                            left -= take;
                        }
                    }
                    if left > 0 {
                        out.push(left);
                    }
                    out
                }
                None => vec![qty.0],
            };
            for c in chunks {
                apply_mock_fill(st, &oid, Qty(c), px, ws_msgs);
            }
        }
    }

    let final_wire = st
        .orders
        .get(&oid)
        .map(|o| o.wire.clone())
        .unwrap_or(wire);
    Ok(final_wire)
}

async fn handle_list_orders(
    State(app): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ListOrdersQuery>,
) -> Response {
    let st = app.inner.lock().expect("mock lock");
    if let Err(r) = check_auth(&headers, &st) {
        return r;
    }
    let only_open = q.status.as_deref().unwrap_or("open") == "open";
    let list: Vec<AlpacaOrderWire> = st
        .orders
        .values()
        .filter(|o| !only_open || !is_terminal_status(&o.wire.status))
        .map(|o| o.wire.clone())
        .collect();
    (StatusCode::OK, Json(list)).into_response()
}

async fn handle_get_by_client_id(
    State(app): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ClientIdQuery>,
) -> Response {
    let st = app.inner.lock().expect("mock lock");
    if let Err(r) = check_auth(&headers, &st) {
        return r;
    }
    if let Some(oid) = st.id_by_client_id.get(&q.client_order_id) {
        if let Some(ord) = st.orders.get(oid) {
            return (StatusCode::OK, Json(ord.wire.clone())).into_response();
        }
    }
    (
        StatusCode::NOT_FOUND,
        Json(json!({"message": "order not found"})),
    )
        .into_response()
}

async fn handle_replace_order(
    State(app): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<String>,
    Json(body): Json<ReplaceOrderBody>,
) -> Response {
    let mut ws_msgs = Vec::new();
    let resp = {
        let mut st = app.inner.lock().expect("mock lock");
        if let Err(r) = check_auth(&headers, &st) {
            return r;
        }
        let Some(ord) = st.orders.get_mut(&order_id) else {
            return (StatusCode::NOT_FOUND, Json(json!({"message": "not found"})))
                .into_response();
        };
        if is_terminal_status(&ord.wire.status) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({"message": "cannot replace terminal order"})),
            )
                .into_response();
        }
        if let Some(q_str) = body.qty {
            if let Ok(q) = ord.spec.parse_qty_str(&q_str) {
                ord.qty = q;
                ord.wire.qty = q_str;
            }
        }
        if let Some(lp) = body.limit_price {
            ord.wire.limit_price = Some(lp);
        }
        if let Some(sp) = body.stop_price {
            ord.wire.stop_price = Some(sp);
        }
        let w = ord.wire.clone();
        ws_msgs.push(make_trade_update_json("replaced", &w, None, None, None));
        (StatusCode::OK, Json(w)).into_response()
    };
    for m in ws_msgs {
        let _ = app.ws_tx.send(m);
    }
    resp
}

async fn handle_cancel_order(
    State(app): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<String>,
) -> Response {
    let mut ws_msgs = Vec::new();
    let resp = {
        let mut st = app.inner.lock().expect("mock lock");
        if let Err(r) = check_auth(&headers, &st) {
            return r;
        }
        let Some(ord) = st.orders.get_mut(&order_id) else {
            return (StatusCode::NOT_FOUND, Json(json!({"message": "not found"})))
                .into_response();
        };
        if !is_terminal_status(&ord.wire.status) {
            ord.wire.status = "canceled".to_string();
            ws_msgs.push(make_trade_update_json(
                "canceled",
                &ord.wire,
                None,
                None,
                None,
            ));
        }
        StatusCode::NO_CONTENT.into_response()
    };
    for m in ws_msgs {
        let _ = app.ws_tx.send(m);
    }
    resp
}

async fn handle_cancel_all(State(app): State<AppState>, headers: HeaderMap) -> Response {
    let mut ws_msgs = Vec::new();
    let canceled = {
        let mut st = app.inner.lock().expect("mock lock");
        if let Err(r) = check_auth(&headers, &st) {
            return r;
        }
        let mut results = Vec::new();
        for ord in st.orders.values_mut() {
            if !is_terminal_status(&ord.wire.status) {
                ord.wire.status = "canceled".to_string();
                ws_msgs.push(make_trade_update_json(
                    "canceled",
                    &ord.wire,
                    None,
                    None,
                    None,
                ));
                results.push(json!({"id": ord.wire.id, "status": 200}));
            }
        }
        results
    };
    for m in ws_msgs {
        let _ = app.ws_tx.send(m);
    }
    (StatusCode::MULTI_STATUS, Json(canceled)).into_response()
}

async fn handle_list_positions(State(app): State<AppState>, headers: HeaderMap) -> Response {
    let st = app.inner.lock().expect("mock lock");
    if let Err(r) = check_auth(&headers, &st) {
        return r;
    }
    let out: Vec<AlpacaPositionWire> = st
        .positions
        .values()
        .filter(|p| p.net_qty.0 != 0)
        .map(|p| {
            let spec = st
                .specs
                .get(&p.symbol)
                .cloned()
                .unwrap_or_else(|| InstrumentSpec::us_equity(&p.symbol));
            AlpacaPositionWire {
                symbol: p.symbol.clone(),
                qty: spec.format_qty(p.net_qty),
                avg_entry_price: spec
                    .format_price_ticks(p.avg_entry_price)
                    .unwrap_or_else(|_| "0.00".to_string()),
                side: if p.net_qty.0 > 0 {
                    "long".to_string()
                } else {
                    "short".to_string()
                },
            }
        })
        .collect();
    (StatusCode::OK, Json(out)).into_response()
}

async fn handle_close_all_positions(
    State(app): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ClosePositionsQuery>,
) -> Response {
    let mut ws_msgs = Vec::new();
    let results = {
        let mut st = app.inner.lock().expect("mock lock");
        if let Err(r) = check_auth(&headers, &st) {
            return r;
        }
        if q.cancel_orders.unwrap_or(false) {
            for ord in st.orders.values_mut() {
                if !is_terminal_status(&ord.wire.status) {
                    ord.wire.status = "canceled".to_string();
                    ws_msgs.push(make_trade_update_json(
                        "canceled",
                        &ord.wire,
                        None,
                        None,
                        None,
                    ));
                }
            }
        }
        let open_pos: Vec<(String, Qty)> = st
            .positions
            .iter()
            .filter(|(_, p)| p.net_qty.0 != 0)
            .map(|(sym, p)| (sym.clone(), p.net_qty))
            .collect();
        let mut closed = Vec::new();
        for (sym, net_qty) in open_pos {
            let spec = st
                .specs
                .get(&sym)
                .cloned()
                .unwrap_or_else(|| InstrumentSpec::us_equity(&sym));
            let side = if net_qty.0 > 0 {
                Side::Sell
            } else {
                Side::Buy
            };
            let qty = Qty(net_qty.0.abs());
            let px = st
                .last_prices
                .get(&sym)
                .copied()
                .or_else(|| st.positions.get(&sym).map(|p| p.avg_entry_price))
                .unwrap_or(PriceTicks(10_000));
            let oid = format!("alp-flat-{}", st.next_id);
            st.next_id += 1;
            let cid = format!("alp-flatten-{sym}-{}", st.next_id);
            let wire = AlpacaOrderWire {
                id: oid.clone(),
                client_order_id: cid.clone(),
                symbol: sym.clone(),
                side: side.as_alpaca_str().to_string(),
                order_type: "market".to_string(),
                order_class: "simple".to_string(),
                time_in_force: "day".to_string(),
                qty: spec.format_qty(qty),
                filled_qty: "0".to_string(),
                filled_avg_price: None,
                limit_price: None,
                stop_price: None,
                trail_price: None,
                trail_percent: None,
                status: "new".to_string(),
                legs: None,
            };
            st.id_by_client_id.insert(cid, oid.clone());
            st.orders.insert(
                oid.clone(),
                StoredOrder {
                    wire,
                    spec,
                    qty,
                    filled_qty: Qty::ZERO,
                    notional_ticks: 0,
                    oco_sibling_id: None,
                    parent_id: None,
                    trail_watermark: None,
                },
            );
            apply_mock_fill(&mut st, &oid, qty, px, &mut ws_msgs);
            closed.push(json!({"symbol": sym, "status": 200}));
        }
        closed
    };
    for m in ws_msgs {
        let _ = app.ws_tx.send(m);
    }
    (StatusCode::MULTI_STATUS, Json(results)).into_response()
}

async fn handle_get_account(State(app): State<AppState>, headers: HeaderMap) -> Response {
    let st = app.inner.lock().expect("mock lock");
    if let Err(r) = check_auth(&headers, &st) {
        return r;
    }
    let realized: i128 = st
        .positions
        .values()
        .map(|p| p.realized_pnl_micros.0)
        .sum();
    let eq = st.initial_equity_micros + realized;
    let bp = eq * 4;
    let fmt_usd = |micros: i128| {
        let neg = micros < 0;
        let abs = micros.unsigned_abs();
        let whole = abs / 1_000_000;
        let cents = (abs % 1_000_000) / 10_000;
        if neg {
            format!("-{whole}.{cents:02}")
        } else {
            format!("{whole}.{cents:02}")
        }
    };
    let wire = AlpacaAccountWire {
        id: "ALPACA-PAPER-MOCK-001".to_string(),
        status: "ACTIVE".to_string(),
        equity: fmt_usd(eq),
        buying_power: fmt_usd(bp),
        trading_blocked: false,
    };
    (StatusCode::OK, Json(wire)).into_response()
}

async fn handle_ws_stream(ws: WebSocketUpgrade, State(app): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| run_ws_client(socket, app))
}

async fn run_ws_client(socket: WebSocket, app: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut authorized = false;
    let mut subscribed = false;

    // Handshake: wait for auth + listen messages
    while let Some(Ok(msg)) = receiver.next().await {
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).to_string(),
            Message::Close(_) => return,
            _ => continue,
        };
        let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        match val.get("action").and_then(|a| a.as_str()) {
            Some("auth") => {
                let k = val.get("key").and_then(|v| v.as_str()).unwrap_or("");
                let s = val.get("secret").and_then(|v| v.as_str()).unwrap_or("");
                let ok = {
                    let st = app.inner.lock().expect("mock lock");
                    k == st.expected_key_id && s == st.expected_secret
                };
                if ok {
                    authorized = true;
                    let ack = json!({"stream":"authorization","data":{"status":"authorized","action":"authenticate"}}).to_string();
                    let _ = sender.send(Message::Text(ack.into())).await;
                } else {
                    let ack = json!({"stream":"authorization","data":{"status":"unauthorized","action":"authenticate"}}).to_string();
                    let _ = sender.send(Message::Text(ack.into())).await;
                    return;
                }
            }
            Some("listen") if authorized => {
                subscribed = true;
                let ack = json!({"stream":"listening","data":{"streams":["trade_updates"]}}).to_string();
                let _ = sender.send(Message::Text(ack.into())).await;
                break;
            }
            _ => {}
        }
    }

    if !authorized || !subscribed {
        return;
    }

    let mut ws_rx = app.ws_tx.subscribe();
    let mut drop_rx = app.ws_drop_tx.subscribe();

    loop {
        tokio::select! {
            _ = drop_rx.recv() => {
                let _ = sender.send(Message::Close(None)).await;
                break;
            }
            ev = ws_rx.recv() => {
                match ev {
                    Ok(payload) => {
                        if sender.send(Message::Text(payload.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
