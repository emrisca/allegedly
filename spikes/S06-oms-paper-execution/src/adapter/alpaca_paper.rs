use crate::adapter::{
    AdapterCapabilities, AdapterError, BrokerAccountSnapshot, BrokerEvent, BrokerOrderAck,
    BrokerOrderSnapshot, BrokerPositionSnapshot, ExecutionAdapter, ReplaceOrderRequest,
};
use crate::mock_alpaca::{AlpacaAccountWire, AlpacaOrderWire, AlpacaPositionWire};
use crate::risk::ApiCredentials;
use crate::state::OrderState;
use crate::types::{
    now_unix_ns, ClientOrderId, ExecutionEnv, FillEvent, InstrumentSpec, MoneyMicros, OrderClass,
    OrderIntent, OrderType, PriceTicks, Side,
};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[derive(Debug, Clone)]
pub struct AlpacaAdapterConfig {
    pub base_http_url: String,
    pub ws_url: String,
    pub max_429_retries: u32,
    pub max_5xx_retries: u32,
    pub base_backoff_ms: u64,
    pub request_timeout_ms: u64,
}

impl AlpacaAdapterConfig {
    pub fn local_mock(base_http_url: String, ws_url: String) -> Self {
        Self {
            base_http_url,
            ws_url,
            max_429_retries: 4,
            max_5xx_retries: 3,
            base_backoff_ms: 15,
            request_timeout_ms: 2_000,
        }
    }
}

/// Wire-compatible Alpaca Trading API v2 REST + `trade_updates` WS adapter.
/// Enforces strict Paper/Sandbox host allowlist, zero-float fixed-point parsing,
/// HTTP 429 backoff, and query-before-retry 5xx idempotency via `client_order_id`.
pub struct AlpacaPaperAdapter {
    creds: ApiCredentials,
    config: AlpacaAdapterConfig,
    http: Client,
    specs: Arc<HashMap<String, InstrumentSpec>>,
    events_tx: broadcast::Sender<BrokerEvent>,
    ws_shutdown: Arc<AtomicBool>,
    ws_connected: Arc<AtomicBool>,
}

impl AlpacaPaperAdapter {
    pub fn new(
        creds: ApiCredentials,
        config: AlpacaAdapterConfig,
        specs: Vec<InstrumentSpec>,
    ) -> Result<Self, AdapterError> {
        if creds.env == ExecutionEnv::BrokerLive {
            return Err(AdapterError::SecurityViolation(
                "AlpacaPaperAdapter refuses BrokerLive credentials".to_string(),
            ));
        }
        // Validate both HTTP & WS hosts against credential environment allowlist (S06-T6).
        creds
            .validate_target_url(&config.base_http_url)
            .map_err(|e| AdapterError::SecurityViolation(e.to_string()))?;
        creds
            .validate_target_url(&config.ws_url)
            .map_err(|e| AdapterError::SecurityViolation(e.to_string()))?;

        let http = Client::builder()
            .timeout(Duration::from_millis(config.request_timeout_ms))
            .build()
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;

        let mut spec_map = HashMap::new();
        for s in specs {
            spec_map.insert(s.symbol.clone(), s);
        }
        let (tx, _) = broadcast::channel(4096);

        Ok(Self {
            creds,
            config,
            http,
            specs: Arc::new(spec_map),
            events_tx: tx,
            ws_shutdown: Arc::new(AtomicBool::new(false)),
            ws_connected: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn is_ws_connected(&self) -> bool {
        self.ws_connected.load(Ordering::SeqCst)
    }

    /// Connect to the Alpaca `trade_updates` WebSocket stream with automatic reconnect
    /// emitting `StreamDisconnected` / `StreamReconnected` lifecycle events.
    pub async fn start_ws_stream(&self) -> Result<(), AdapterError> {
        let ws_url = self.config.ws_url.clone();
        let key = self.creds.key_id().to_string();
        let secret = self.creds.secret_key().to_string();
        let tx = self.events_tx.clone();
        let specs = self.specs.clone();
        let shutdown = self.ws_shutdown.clone();
        let connected = self.ws_connected.clone();

        // Wait until first handshake succeeds (bounded 2s) so callers know the stream is live.
        let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), AdapterError>>();
        let mut ready_tx_opt = Some(ready_tx);

        tokio::spawn(async move {
            let mut first_connect = true;
            while !shutdown.load(Ordering::SeqCst) {
                match tokio_tungstenite::connect_async(&ws_url).await {
                    Ok((ws_stream, _)) => {
                        let (mut write, mut read) = ws_stream.split();
                        let auth = json!({"action": "auth", "key": key, "secret": secret});
                        if write.send(WsMessage::Text(auth.to_string())).await.is_err() {
                            tokio::time::sleep(Duration::from_millis(25)).await;
                            continue;
                        }
                        // Wait for auth ack
                        let mut authed = false;
                        if let Some(Ok(WsMessage::Text(t))) = read.next().await {
                            if let Ok(v) = serde_json::from_str::<Value>(&t) {
                                if v.pointer("/data/status").and_then(|s| s.as_str())
                                    == Some("authorized")
                                {
                                    authed = true;
                                }
                            }
                        }
                        if !authed {
                            if let Some(rtx) = ready_tx_opt.take() {
                                let _ = rtx.send(Err(AdapterError::SecurityViolation(
                                    "WS authorization failed".to_string(),
                                )));
                            }
                            break;
                        }
                        let listen =
                            json!({"action": "listen", "data": {"streams": ["trade_updates"]}});
                        if write.send(WsMessage::Text(listen.to_string())).await.is_err() {
                            tokio::time::sleep(Duration::from_millis(25)).await;
                            continue;
                        }
                        // Wait for listening ack
                        let _ = read.next().await;

                        connected.store(true, Ordering::SeqCst);
                        if let Some(rtx) = ready_tx_opt.take() {
                            let _ = rtx.send(Ok(()));
                        }
                        if !first_connect {
                            let _ = tx.send(BrokerEvent::StreamReconnected {
                                ts_ns: now_unix_ns(),
                            });
                        }
                        first_connect = false;

                        while let Some(msg) = read.next().await {
                            if shutdown.load(Ordering::SeqCst) {
                                break;
                            }
                            match msg {
                                Ok(WsMessage::Text(txt)) => {
                                    if let Ok(ev) = parse_trade_update_ws(&txt, &specs) {
                                        if let Some(broker_ev) = ev {
                                            let _ = tx.send(broker_ev);
                                        }
                                    }
                                }
                                Ok(WsMessage::Close(_)) | Err(_) => break,
                                _ => {}
                            }
                        }

                        connected.store(false, Ordering::SeqCst);
                        if !shutdown.load(Ordering::SeqCst) {
                            let _ = tx.send(BrokerEvent::StreamDisconnected {
                                reason: "websocket stream closed".to_string(),
                                ts_ns: now_unix_ns(),
                            });
                            tokio::time::sleep(Duration::from_millis(30)).await;
                        }
                    }
                    Err(e) => {
                        connected.store(false, Ordering::SeqCst);
                        if first_connect {
                            if let Some(rtx) = ready_tx_opt.take() {
                                let _ = rtx.send(Err(AdapterError::Disconnected(e.to_string())));
                            }
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(30)).await;
                    }
                }
            }
        });

        match tokio::time::timeout(Duration::from_secs(2), ready_rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => Err(AdapterError::Disconnected(
                "ws task exited before ready".to_string(),
            )),
            Err(_) => Err(AdapterError::Disconnected(
                "ws handshake timed out".to_string(),
            )),
        }
    }

    pub fn stop_ws_stream(&self) {
        self.ws_shutdown.store(true, Ordering::SeqCst);
    }

    fn spec_for(&self, symbol: &str) -> InstrumentSpec {
        self.specs
            .get(symbol)
            .cloned()
            .unwrap_or_else(|| InstrumentSpec::us_equity(symbol))
    }

    fn auth_headers(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.header("APCA-API-KEY-ID", self.creds.key_id())
            .header("APCA-API-SECRET-KEY", self.creds.secret_key())
    }

    fn build_submit_payload(&self, intent: &OrderIntent) -> Result<Value, AdapterError> {
        let spec = self.spec_for(&intent.symbol);
        let mut obj = serde_json::Map::new();
        obj.insert("symbol".into(), json!(intent.symbol));
        obj.insert("qty".into(), json!(spec.format_qty(intent.qty)));
        obj.insert("side".into(), json!(intent.side.as_alpaca_str()));
        obj.insert("time_in_force".into(), json!(intent.tif.as_alpaca_str()));
        obj.insert(
            "client_order_id".into(),
            json!(intent.client_order_id.as_str()),
        );

        match intent.order_type {
            OrderType::Market => {
                obj.insert("type".into(), json!("market"));
            }
            OrderType::Limit { limit_price } => {
                obj.insert("type".into(), json!("limit"));
                let lp = spec
                    .format_price_ticks(limit_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                obj.insert("limit_price".into(), json!(lp));
            }
            OrderType::Stop { stop_price } => {
                obj.insert("type".into(), json!("stop"));
                let sp = spec
                    .format_price_ticks(stop_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                obj.insert("stop_price".into(), json!(sp));
            }
            OrderType::StopLimit {
                stop_price,
                limit_price,
            } => {
                obj.insert("type".into(), json!("stop_limit"));
                let sp = spec
                    .format_price_ticks(stop_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                let lp = spec
                    .format_price_ticks(limit_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                obj.insert("stop_price".into(), json!(sp));
                obj.insert("limit_price".into(), json!(lp));
            }
            OrderType::TrailingStop {
                trail_ticks,
                trail_bps,
            } => {
                obj.insert("type".into(), json!("trailing_stop"));
                if let Some(ticks) = trail_ticks {
                    let tp = spec
                        .format_price_ticks(PriceTicks(ticks))
                        .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                    obj.insert("trail_price".into(), json!(tp));
                } else if let Some(bps) = trail_bps {
                    // Format bps as percentage string with 2 decimals (e.g. 250 bps -> "2.50")
                    let whole = bps.0 / 100;
                    let frac = (bps.0 % 100).abs();
                    obj.insert("trail_percent".into(), json!(format!("{whole}.{frac:02}")));
                }
            }
        }

        match intent.order_class {
            OrderClass::Simple => {
                obj.insert("order_class".into(), json!("simple"));
            }
            OrderClass::Bracket {
                take_profit_price,
                stop_loss_price,
            } => {
                obj.insert("order_class".into(), json!("bracket"));
                let tp = spec
                    .format_price_ticks(take_profit_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                let sl = spec
                    .format_price_ticks(stop_loss_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                obj.insert("take_profit".into(), json!({ "limit_price": tp }));
                obj.insert("stop_loss".into(), json!({ "stop_price": sl }));
            }
            OrderClass::Oco {
                take_profit_price,
                stop_loss_price,
            } => {
                obj.insert("order_class".into(), json!("oco"));
                let tp = spec
                    .format_price_ticks(take_profit_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                let sl = spec
                    .format_price_ticks(stop_loss_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                obj.insert("take_profit".into(), json!({ "limit_price": tp }));
                obj.insert("stop_loss".into(), json!({ "stop_price": sl }));
            }
            OrderClass::Oto { child_price } => {
                obj.insert("order_class".into(), json!("oto"));
                let cp = spec
                    .format_price_ticks(child_price)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                obj.insert("take_profit".into(), json!({ "limit_price": cp }));
            }
        }

        Ok(Value::Object(obj))
    }

    fn parse_order_wire(&self, wire: &AlpacaOrderWire) -> Result<BrokerOrderSnapshot, AdapterError> {
        parse_order_wire_with_specs(wire, &self.specs)
    }
}

impl Drop for AlpacaPaperAdapter {
    fn drop(&mut self) {
        self.ws_shutdown.store(true, Ordering::SeqCst);
    }
}

fn map_alpaca_status(status: &str) -> Result<OrderState, AdapterError> {
    match status {
        "new" | "accepted" | "accepted_for_bidding" | "held" => Ok(OrderState::Accepted),
        "pending_new" => Ok(OrderState::PendingNew),
        "partially_filled" => Ok(OrderState::PartiallyFilled),
        "filled" => Ok(OrderState::Filled),
        "pending_cancel" => Ok(OrderState::PendingCancel),
        "canceled" | "done_for_day" => Ok(OrderState::Canceled),
        "pending_replace" => Ok(OrderState::PendingReplace),
        "replaced" => Ok(OrderState::Replaced),
        "rejected" => Ok(OrderState::Rejected),
        "expired" => Ok(OrderState::Expired),
        other => Err(AdapterError::MalformedPayload(format!(
            "unknown alpaca order status '{other}'"
        ))),
    }
}

fn parse_order_wire_with_specs(
    wire: &AlpacaOrderWire,
    specs: &HashMap<String, InstrumentSpec>,
) -> Result<BrokerOrderSnapshot, AdapterError> {
    let spec = specs
        .get(&wire.symbol)
        .cloned()
        .unwrap_or_else(|| InstrumentSpec::us_equity(&wire.symbol));
    let side = match wire.side.as_str() {
        "buy" => Side::Buy,
        "sell" => Side::Sell,
        other => {
            return Err(AdapterError::MalformedPayload(format!(
                "invalid side '{other}'"
            )))
        }
    };
    let order_qty = spec
        .parse_qty_str(&wire.qty)
        .map_err(|e| AdapterError::MalformedPayload(format!("invalid qty '{}': {e}", wire.qty)))?;
    let cum_filled_qty = spec.parse_qty_str(&wire.filled_qty).map_err(|e| {
        AdapterError::MalformedPayload(format!("invalid filled_qty '{}': {e}", wire.filled_qty))
    })?;
    let avg_fill_price = match &wire.filled_avg_price {
        Some(p) if !p.is_empty() => spec.parse_price_str(p).map_err(|e| {
            AdapterError::MalformedPayload(format!("invalid filled_avg_price '{p}': {e}"))
        })?,
        _ => PriceTicks::ZERO,
    };
    let order_type = match wire.order_type.as_str() {
        "market" => OrderType::Market,
        "limit" => {
            let lp = wire
                .limit_price
                .as_deref()
                .ok_or_else(|| AdapterError::MalformedPayload("limit order missing limit_price".into()))?;
            OrderType::Limit {
                limit_price: spec
                    .parse_price_str(lp)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?,
            }
        }
        "stop" => {
            let sp = wire
                .stop_price
                .as_deref()
                .ok_or_else(|| AdapterError::MalformedPayload("stop order missing stop_price".into()))?;
            OrderType::Stop {
                stop_price: spec
                    .parse_price_str(sp)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?,
            }
        }
        "stop_limit" => {
            let sp = wire.stop_price.as_deref().unwrap_or("0");
            let lp = wire.limit_price.as_deref().unwrap_or("0");
            OrderType::StopLimit {
                stop_price: spec
                    .parse_price_str(sp)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?,
                limit_price: spec
                    .parse_price_str(lp)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?,
            }
        }
        "trailing_stop" => {
            let trail_ticks = match &wire.trail_price {
                Some(tp) => Some(
                    spec.parse_price_str(tp)
                        .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?
                        .0,
                ),
                None => None,
            };
            let trail_bps = match &wire.trail_percent {
                Some(pct) => {
                    let pct_spec = InstrumentSpec::us_equity("PCT");
                    let bps = pct_spec
                        .parse_price_str(pct)
                        .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
                    Some(crate::types::Bps(bps.0))
                }
                None => None,
            };
            OrderType::TrailingStop {
                trail_ticks,
                trail_bps,
            }
        }
        other => {
            return Err(AdapterError::MalformedPayload(format!(
                "unknown order_type '{other}'"
            )))
        }
    };
    let state = map_alpaca_status(&wire.status)?;

    Ok(BrokerOrderSnapshot {
        broker_order_id: wire.id.clone(),
        client_order_id: ClientOrderId::from_raw(wire.client_order_id.clone()),
        symbol: wire.symbol.clone(),
        side,
        order_qty,
        cum_filled_qty,
        avg_fill_price,
        order_type,
        state,
        parent_broker_order_id: None,
    })
}

fn parse_trade_update_ws(
    raw: &str,
    specs: &HashMap<String, InstrumentSpec>,
) -> Result<Option<BrokerEvent>, AdapterError> {
    let val: Value =
        serde_json::from_str(raw).map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
    if val.get("stream").and_then(|s| s.as_str()) != Some("trade_updates") {
        return Ok(None);
    }
    let data = val
        .get("data")
        .ok_or_else(|| AdapterError::MalformedPayload("missing data".into()))?;
    let ev_name = data
        .get("event")
        .and_then(|e| e.as_str())
        .ok_or_else(|| AdapterError::MalformedPayload("missing event".into()))?;
    let order_val = data
        .get("order")
        .ok_or_else(|| AdapterError::MalformedPayload("missing order".into()))?;
    let wire: AlpacaOrderWire = serde_json::from_value(order_val.clone())
        .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
    let snap = parse_order_wire_with_specs(&wire, specs)?;
    let ts_ns = data
        .get("timestamp_ns")
        .and_then(|t| t.as_i64())
        .unwrap_or_else(now_unix_ns);

    match ev_name {
        "new" | "accepted" => Ok(Some(BrokerEvent::Accepted {
            client_order_id: snap.client_order_id,
            broker_order_id: snap.broker_order_id,
            ts_ns,
        })),
        "partial_fill" | "fill" => {
            let spec = specs
                .get(&snap.symbol)
                .cloned()
                .unwrap_or_else(|| InstrumentSpec::us_equity(&snap.symbol));
            let px_str = data
                .get("price")
                .and_then(|p| p.as_str())
                .ok_or_else(|| AdapterError::MalformedPayload("fill missing price".into()))?;
            let qty_str = data
                .get("qty")
                .and_then(|q| q.as_str())
                .ok_or_else(|| AdapterError::MalformedPayload("fill missing qty".into()))?;
            let fill_price = spec
                .parse_price_str(px_str)
                .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
            let fill_qty = spec
                .parse_qty_str(qty_str)
                .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
            let exec_id = data
                .get("execution_id")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{}-{}", snap.broker_order_id, snap.cum_filled_qty.0));
            Ok(Some(BrokerEvent::Fill(FillEvent {
                exec_id,
                client_order_id: snap.client_order_id,
                broker_order_id: snap.broker_order_id,
                symbol: snap.symbol,
                side: snap.side,
                fill_qty,
                fill_price,
                ts_ns,
            })))
        }
        "canceled" => Ok(Some(BrokerEvent::Canceled {
            client_order_id: snap.client_order_id,
            broker_order_id: snap.broker_order_id,
            ts_ns,
        })),
        "replaced" => Ok(Some(BrokerEvent::Replaced {
            client_order_id: snap.client_order_id,
            broker_order_id: snap.broker_order_id,
            new_qty: Some(snap.order_qty),
            new_order_type: Some(snap.order_type),
            ts_ns,
        })),
        "rejected" => Ok(Some(BrokerEvent::Rejected {
            client_order_id: snap.client_order_id,
            reason: "rejected by alpaca".to_string(),
            ts_ns,
        })),
        "expired" => Ok(Some(BrokerEvent::Expired {
            client_order_id: snap.client_order_id,
            broker_order_id: snap.broker_order_id,
            ts_ns,
        })),
        _ => Ok(None),
    }
}

#[async_trait]
impl ExecutionAdapter for AlpacaPaperAdapter {
    fn capabilities(&self) -> AdapterCapabilities {
        AdapterCapabilities {
            adapter_id: "alpaca_paper_v2".to_string(),
            env: ExecutionEnv::BrokerSandbox,
            paper_mode: true,
            supports_native_oco: true,
            supports_modify_in_place: true,
            supports_trailing_stop: true,
            supports_bulk_cancel: true,
            allowed_hosts: vec![
                "paper-api.alpaca.markets".to_string(),
                "127.0.0.1".to_string(),
                "localhost".to_string(),
            ],
        }
    }

    async fn submit_order(&self, intent: &OrderIntent) -> Result<BrokerOrderAck, AdapterError> {
        if intent.env == ExecutionEnv::BrokerLive {
            return Err(AdapterError::SecurityViolation(
                "AlpacaPaperAdapter rejects BrokerLive intents".to_string(),
            ));
        }

        let url = format!("{}/v2/orders", self.config.base_http_url);
        let payload = self.build_submit_payload(intent)?;

        let mut retries_429 = 0u32;
        let mut retries_5xx = 0u32;

        loop {
            let resp_res = self
                .auth_headers(self.http.post(&url).json(&payload))
                .send()
                .await;

            match resp_res {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let raw_text = resp
                            .text()
                            .await
                            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
                        let wire: AlpacaOrderWire = serde_json::from_str(&raw_text)
                            .map_err(|e| AdapterError::MalformedPayload(format!("bad json: {e}")))?;
                        // Validate all fixed-point fields strictly before returning Ack!
                        let snap = self.parse_order_wire(&wire)?;
                        let mut leg_ids = Vec::new();
                        if let Some(legs) = &wire.legs {
                            for l in legs {
                                let lsnap = self.parse_order_wire(l)?;
                                leg_ids.push((lsnap.client_order_id, lsnap.broker_order_id));
                            }
                        }
                        return Ok(BrokerOrderAck {
                            broker_order_id: snap.broker_order_id,
                            client_order_id: snap.client_order_id,
                            state: snap.state,
                            leg_broker_ids: leg_ids,
                        });
                    }

                    if status == StatusCode::TOO_MANY_REQUESTS {
                        let retry_after_ms = resp
                            .headers()
                            .get("X-Retry-After-Ms")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .or_else(|| {
                                resp.headers()
                                    .get("Retry-After")
                                    .and_then(|v| v.to_str().ok())
                                    .and_then(|s| s.parse::<u64>().ok())
                                    .map(|secs| secs * 1000)
                            })
                            .unwrap_or_else(|| {
                                self.config.base_backoff_ms * (1u64 << retries_429.min(4))
                            });
                        if retries_429 >= self.config.max_429_retries {
                            return Err(AdapterError::RateLimited { retry_after_ms });
                        }
                        retries_429 += 1;
                        tokio::time::sleep(Duration::from_millis(retry_after_ms)).await;
                        continue;
                    }

                    if status == StatusCode::UNPROCESSABLE_ENTITY {
                        let body = resp.text().await.unwrap_or_default();
                        if body.contains("client_order_id") {
                            return Err(AdapterError::DuplicateClientOrderId(
                                intent.client_order_id.clone(),
                            ));
                        }
                        return Err(AdapterError::Rejected(body));
                    }

                    if status.is_server_error() {
                        // CRITICAL R04 §3.5 RULE: Never blindly re-POST on 5xx!
                        // First query `GET /v2/orders:by_client_order_id` to see if the broker already committed it.
                        if let Ok(Some(existing)) =
                            self.get_order_by_client_id(&intent.client_order_id).await
                        {
                            return Ok(BrokerOrderAck {
                                broker_order_id: existing.broker_order_id,
                                client_order_id: existing.client_order_id,
                                state: existing.state,
                                leg_broker_ids: Vec::new(),
                            });
                        }
                        if retries_5xx >= self.config.max_5xx_retries {
                            return Err(AdapterError::AmbiguousTransport(format!(
                                "HTTP {status} after {retries_5xx} idempotent checks"
                            )));
                        }
                        retries_5xx += 1;
                        let delay = self.config.base_backoff_ms * (1u64 << retries_5xx.min(4));
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        continue;
                    }

                    let body = resp.text().await.unwrap_or_default();
                    return Err(AdapterError::Rejected(format!("HTTP {status}: {body}")));
                }
                Err(err) => {
                    // Transport / timeout error: query by_client_order_id before retrying!
                    if let Ok(Some(existing)) =
                        self.get_order_by_client_id(&intent.client_order_id).await
                    {
                        return Ok(BrokerOrderAck {
                            broker_order_id: existing.broker_order_id,
                            client_order_id: existing.client_order_id,
                            state: existing.state,
                            leg_broker_ids: Vec::new(),
                        });
                    }
                    if retries_5xx >= self.config.max_5xx_retries {
                        return Err(AdapterError::AmbiguousTransport(err.to_string()));
                    }
                    retries_5xx += 1;
                    tokio::time::sleep(Duration::from_millis(self.config.base_backoff_ms)).await;
                }
            }
        }
    }

    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), AdapterError> {
        let url = format!("{}/v2/orders/{broker_order_id}", self.config.base_http_url);
        let resp = self
            .auth_headers(self.http.delete(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if resp.status().is_success() || resp.status() == StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(AdapterError::Rejected(format!(
                "cancel failed HTTP {}",
                resp.status()
            )))
        }
    }

    async fn replace_order(
        &self,
        broker_order_id: &str,
        req: &ReplaceOrderRequest,
    ) -> Result<BrokerOrderAck, AdapterError> {
        let url = format!("{}/v2/orders/{broker_order_id}", self.config.base_http_url);
        // Find symbol spec by fetching open orders if needed; default to equity 0.01 formatting
        let spec = InstrumentSpec::us_equity("DEFAULT");
        let mut body = serde_json::Map::new();
        if let Some(q) = req.new_qty {
            body.insert("qty".into(), json!(spec.format_qty(q)));
        }
        if let Some(lp) = req.new_limit_price {
            body.insert(
                "limit_price".into(),
                json!(spec
                    .format_price_ticks(lp)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?),
            );
        }
        if let Some(sp) = req.new_stop_price {
            body.insert(
                "stop_price".into(),
                json!(spec
                    .format_price_ticks(sp)
                    .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?),
            );
        }
        let resp = self
            .auth_headers(self.http.patch(&url).json(&Value::Object(body)))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(AdapterError::Rejected(format!(
                "replace HTTP {}",
                resp.status()
            )));
        }
        let wire: AlpacaOrderWire = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        let snap = self.parse_order_wire(&wire)?;
        Ok(BrokerOrderAck {
            broker_order_id: snap.broker_order_id,
            client_order_id: snap.client_order_id,
            state: snap.state,
            leg_broker_ids: Vec::new(),
        })
    }

    async fn cancel_all_orders(&self) -> Result<usize, AdapterError> {
        let url = format!("{}/v2/orders", self.config.base_http_url);
        let resp = self
            .auth_headers(self.http.delete(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(AdapterError::Rejected(format!(
                "cancel_all HTTP {}",
                resp.status()
            )));
        }
        let items: Vec<Value> = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        Ok(items.len())
    }

    async fn close_all_positions(&self) -> Result<usize, AdapterError> {
        let url = format!(
            "{}/v2/positions?cancel_orders=true",
            self.config.base_http_url
        );
        let resp = self
            .auth_headers(self.http.delete(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(AdapterError::Rejected(format!(
                "close_all_positions HTTP {}",
                resp.status()
            )));
        }
        let items: Vec<Value> = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        Ok(items.len())
    }

    async fn get_order_by_client_id(
        &self,
        client_order_id: &ClientOrderId,
    ) -> Result<Option<BrokerOrderSnapshot>, AdapterError> {
        let url = format!(
            "{}/v2/orders:by_client_order_id?client_order_id={}",
            self.config.base_http_url,
            client_order_id.as_str()
        );
        let resp = self
            .auth_headers(self.http.get(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(AdapterError::AmbiguousTransport(format!(
                "by_client_order_id HTTP {}",
                resp.status()
            )));
        }
        let wire: AlpacaOrderWire = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        Ok(Some(self.parse_order_wire(&wire)?))
    }

    async fn list_open_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError> {
        let url = format!("{}/v2/orders?status=open", self.config.base_http_url);
        let resp = self
            .auth_headers(self.http.get(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(AdapterError::AmbiguousTransport(format!(
                "list_open_orders HTTP {}",
                resp.status()
            )));
        }
        let wires: Vec<AlpacaOrderWire> = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        wires.iter().map(|w| self.parse_order_wire(w)).collect()
    }

    async fn list_all_orders(&self) -> Result<Vec<BrokerOrderSnapshot>, AdapterError> {
        let url = format!("{}/v2/orders?status=all", self.config.base_http_url);
        let resp = self
            .auth_headers(self.http.get(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(AdapterError::AmbiguousTransport(format!(
                "list_all_orders HTTP {}",
                resp.status()
            )));
        }
        let wires: Vec<AlpacaOrderWire> = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        wires.iter().map(|w| self.parse_order_wire(w)).collect()
    }

    async fn list_positions(&self) -> Result<Vec<BrokerPositionSnapshot>, AdapterError> {
        let url = format!("{}/v2/positions", self.config.base_http_url);
        let resp = self
            .auth_headers(self.http.get(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(AdapterError::AmbiguousTransport(format!(
                "list_positions HTTP {}",
                resp.status()
            )));
        }
        let wires: Vec<AlpacaPositionWire> = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        let mut out = Vec::with_capacity(wires.len());
        for w in wires {
            let spec = self.spec_for(&w.symbol);
            let qty = spec
                .parse_qty_str(&w.qty)
                .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
            let avg = spec
                .parse_price_str(&w.avg_entry_price)
                .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
            out.push(BrokerPositionSnapshot {
                symbol: w.symbol,
                net_qty: qty,
                avg_entry_price: avg,
            });
        }
        Ok(out)
    }

    async fn get_account(&self) -> Result<BrokerAccountSnapshot, AdapterError> {
        let url = format!("{}/v2/account", self.config.base_http_url);
        let resp = self
            .auth_headers(self.http.get(&url))
            .send()
            .await
            .map_err(|e| AdapterError::AmbiguousTransport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(AdapterError::AmbiguousTransport(format!(
                "get_account HTTP {}",
                resp.status()
            )));
        }
        let wire: AlpacaAccountWire = resp
            .json()
            .await
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        let usd = InstrumentSpec::us_equity("USD");
        let eq_cents = usd
            .parse_price_str(&wire.equity)
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        let bp_cents = usd
            .parse_price_str(&wire.buying_power)
            .map_err(|e| AdapterError::MalformedPayload(e.to_string()))?;
        Ok(BrokerAccountSnapshot {
            account_id: wire.id,
            env: ExecutionEnv::BrokerSandbox,
            equity_micros: MoneyMicros((eq_cents.0 as i128) * 10_000),
            buying_power_micros: MoneyMicros((bp_cents.0 as i128) * 10_000),
            trading_blocked: wire.trading_blocked,
        })
    }

    fn subscribe_events(&self) -> broadcast::Receiver<BrokerEvent> {
        self.events_tx.subscribe()
    }
}
