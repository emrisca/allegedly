//! Live WebSocket market-data feed manager (`KrakenWsV2` + `CoinbaseAdvTrade`).
//!
//! Hard invariants:
//! - Zero network sockets opened unless `LiveFeedHandle::start` is explicitly called (SV-01).
//! - Zero IEEE-754 `f32`/`f64` floats in price, quantity, or volume parsing/arithmetic (SV-08).
//! - Non-blocking bounded `rtrb` SPSC event delivery; channel overflow transitions `BookState::Stale`
//!   without ever blocking the WebSocket reader task.
//! - Kraken WS v2 enforces live top-10 CRC32 checksum integrity (`BookState::Stale` -> resync).
//! - Coinbase Advanced Trade WS enforces strict `sequence_num` monotonicity + mandatory
//!   maker->taker side inversion (`"BUY"` -> `Sell`, `"SELL"` -> `Buy`).

use crate::parsers::{kraken_book_crc32, parse_coinbase_trade, parse_kraken_trade};
use crate::ws_client::{json_exact_decimal_str, parse_rfc3339_utc_ns};
use allegedly_core::{BookState, InstrumentId, NormalizedTick, PriceE9, ProvenanceTier, QtyE9, TimestampNs};
use futures_util::{SinkExt, StreamExt};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Reverse;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tokio::sync::watch;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

pub const KRAKEN_WS_V2_URL: &str = "wss://ws.kraken.com/v2";
pub const COINBASE_ADV_TRADE_WS_URL: &str = "wss://advanced-trade-ws.coinbase.com";
pub const DEFAULT_LIVE_EVENT_CAP: usize = 8_192;

pub const LIVE_CRYPTO_CANONICAL_SYMBOLS: &[&str] = &["BTC/USD", "ETH/USD", "SOL/USD"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FeedSource {
    #[default]
    PaperSim,
    KrakenWsV2,
    CoinbaseAdvTrade,
}

impl FeedSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PaperSim => "paper_sim",
            Self::KrakenWsV2 => "kraken_ws_v2",
            Self::CoinbaseAdvTrade => "coinbase_ws",
        }
    }

    pub fn parse_str(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "paper_sim" | "paper" | "sim" => Some(Self::PaperSim),
            "kraken_ws_v2" | "kraken" => Some(Self::KrakenWsV2),
            "coinbase_ws" | "coinbase_adv_trade" | "coinbase" => Some(Self::CoinbaseAdvTrade),
            _ => None,
        }
    }

    /// Normalize a user-supplied symbol to Allegedly's canonical symbol string if it is supported
    /// by this live venue, returning `(canonical_symbol, venue_wire_symbol)`.
    pub fn resolve_live_symbol(self, symbol: &str) -> Option<(&'static str, &'static str)> {
        let norm = symbol.trim().to_ascii_uppercase();
        let canonical = match norm.as_str() {
            "BTC/USD" | "BTC-USD" | "XBT/USD" | "XBT-USD" => "BTC/USD",
            "ETH/USD" | "ETH-USD" => "ETH/USD",
            "SOL/USD" | "SOL-USD" => "SOL/USD",
            _ => return None,
        };
        match self {
            Self::KrakenWsV2 => Some((canonical, canonical)),
            Self::CoinbaseAdvTrade => {
                let wire = match canonical {
                    "BTC/USD" => "BTC-USD",
                    "ETH/USD" => "ETH-USD",
                    "SOL/USD" => "SOL-USD",
                    _ => return None,
                };
                Some((canonical, wire))
            }
            Self::PaperSim => None,
        }
    }

    pub fn default_ws_url(self) -> Option<&'static str> {
        match self {
            Self::PaperSim => None,
            Self::KrakenWsV2 => Some(KRAKEN_WS_V2_URL),
            Self::CoinbaseAdvTrade => Some(COINBASE_ADV_TRADE_WS_URL),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveFeedConfig {
    pub source: FeedSource,
    pub symbol: String,
    pub instrument_id: InstrumentId,
    pub ohlc_interval_mins: u32,
    pub book_depth: u32,
    pub channel_capacity: usize,
    /// Optional WebSocket endpoint override for local loopback/mock tests.
    pub ws_url_override: Option<String>,
}

impl LiveFeedConfig {
    pub fn new(source: FeedSource, symbol: impl Into<String>, instrument_id: InstrumentId) -> Self {
        Self {
            source,
            symbol: symbol.into(),
            instrument_id,
            ohlc_interval_mins: 1,
            book_depth: 25,
            channel_capacity: DEFAULT_LIVE_EVENT_CAP,
            ws_url_override: None,
        }
    }
}

/// Fixed-point (`1e-9`) OHLC bar snapshot/update received from a live exchange channel.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LiveOhlcBar {
    pub ts_open_ns: i64,
    pub open_e9: i64,
    pub high_e9: i64,
    pub low_e9: i64,
    pub close_e9: i64,
    pub volume_e9: i64,
    pub interval_mins: u32,
}

/// Verified L2 order-book snapshot emitted after CRC32/continuity checks pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveL2Snapshot {
    pub book_seq: u64,
    /// `(price_e9, qty_e9)` sorted best bid first (descending price).
    pub bids: Vec<(i64, i64)>,
    /// `(price_e9, qty_e9)` sorted best ask first (ascending price).
    pub asks: Vec<(i64, i64)>,
    pub book_state: BookState,
    pub provenance_tier: ProvenanceTier,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LiveMarketEvent {
    Trade(NormalizedTick),
    L2Snapshot(LiveL2Snapshot),
    OhlcBar(LiveOhlcBar),
    Status(BookState, String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveFeedStatusSnapshot {
    pub connected: bool,
    pub book_state: BookState,
    pub provenance_tier: ProvenanceTier,
    pub trades_received: u64,
    pub ohlc_received: u64,
    pub l2_updates: u64,
    pub crc_ok: u64,
    pub crc_mismatches: u64,
    pub parse_errors: u64,
    pub dropped_events: u64,
    pub reconnects: u64,
    pub last_error: Option<String>,
}

struct LiveFeedMetrics {
    connected: AtomicBool,
    book_state: AtomicU8,
    trades_received: AtomicU64,
    ohlc_received: AtomicU64,
    l2_updates: AtomicU64,
    crc_ok: AtomicU64,
    crc_mismatches: AtomicU64,
    parse_errors: AtomicU64,
    dropped_events: AtomicU64,
    reconnects: AtomicU64,
    last_error: Mutex<Option<String>>,
}

impl LiveFeedMetrics {
    fn new() -> Self {
        Self {
            connected: AtomicBool::new(false),
            book_state: AtomicU8::new(BookState::Rebuilding as u8),
            trades_received: AtomicU64::new(0),
            ohlc_received: AtomicU64::new(0),
            l2_updates: AtomicU64::new(0),
            crc_ok: AtomicU64::new(0),
            crc_mismatches: AtomicU64::new(0),
            parse_errors: AtomicU64::new(0),
            dropped_events: AtomicU64::new(0),
            reconnects: AtomicU64::new(0),
            last_error: Mutex::new(None),
        }
    }

    fn set_book_state(&self, state: BookState) {
        self.book_state.store(state as u8, Ordering::Release);
    }

    fn book_state(&self) -> BookState {
        BookState::from_u8(self.book_state.load(Ordering::Acquire))
            .unwrap_or(BookState::Disconnected)
    }

    fn set_last_error(&self, err: impl Into<String>) {
        if let Ok(mut guard) = self.last_error.lock() {
            *guard = Some(err.into());
        }
    }

    fn clear_last_error(&self) {
        if let Ok(mut guard) = self.last_error.lock() {
            *guard = None;
        }
    }

    fn snapshot(&self) -> LiveFeedStatusSnapshot {
        let last_error = self.last_error.lock().ok().and_then(|g| g.clone());
        LiveFeedStatusSnapshot {
            connected: self.connected.load(Ordering::Acquire),
            book_state: self.book_state(),
            provenance_tier: ProvenanceTier::ExactTickAggr,
            trades_received: self.trades_received.load(Ordering::Relaxed),
            ohlc_received: self.ohlc_received.load(Ordering::Relaxed),
            l2_updates: self.l2_updates.load(Ordering::Relaxed),
            crc_ok: self.crc_ok.load(Ordering::Relaxed),
            crc_mismatches: self.crc_mismatches.load(Ordering::Relaxed),
            parse_errors: self.parse_errors.load(Ordering::Relaxed),
            dropped_events: self.dropped_events.load(Ordering::Relaxed),
            reconnects: self.reconnects.load(Ordering::Relaxed),
            last_error,
        }
    }
}

/// Handle to a running background live WebSocket feed task.
/// Dropping this handle cleanly signals shutdown and joins the background worker thread.
pub struct LiveFeedHandle {
    consumer: Consumer<LiveMarketEvent>,
    metrics: Arc<LiveFeedMetrics>,
    shutdown_tx: Option<watch::Sender<bool>>,
    worker_thread: Option<JoinHandle<()>>,
}

impl LiveFeedHandle {
    /// Start a live WebSocket feed worker on a dedicated lightweight current-thread Tokio runtime.
    pub fn start(config: LiveFeedConfig) -> Result<Self, String> {
        if config.source == FeedSource::PaperSim {
            return Err("LiveFeedHandle cannot be started with FeedSource::PaperSim".to_string());
        }

        let wire_symbol = if config.ws_url_override.is_some() {
            config
                .source
                .resolve_live_symbol(&config.symbol)
                .map(|(_, w)| w.to_string())
                .unwrap_or_else(|| config.symbol.clone())
        } else {
            config
                .source
                .resolve_live_symbol(&config.symbol)
                .map(|(_, w)| w.to_string())
                .ok_or_else(|| {
                    format!(
                        "Symbol '{}' is not supported on live venue '{}'",
                        config.symbol,
                        config.source.as_str()
                    )
                })?
        };

        let url = config
            .ws_url_override
            .clone()
            .or_else(|| config.source.default_ws_url().map(ToString::to_string))
            .ok_or_else(|| "missing WebSocket URL for live feed".to_string())?;

        let cap = config.channel_capacity.max(2);
        let (producer, consumer) = RingBuffer::<LiveMarketEvent>::new(cap);
        let metrics = Arc::new(LiveFeedMetrics::new());
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let worker_metrics = Arc::clone(&metrics);
        let worker_cfg = WorkerConfig {
            source: config.source,
            url,
            wire_symbol,
            instrument_id: config.instrument_id,
            ohlc_interval_mins: config.ohlc_interval_mins.max(1),
            book_depth: normalize_kraken_depth(config.book_depth),
        };

        let worker_thread = std::thread::Builder::new()
            .name(format!("allegedly-ws-{}", config.source.as_str()))
            .spawn(move || {
                let _ = rustls::crypto::ring::default_provider().install_default();
                let rt = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(rt) => rt,
                    Err(e) => {
                        worker_metrics.set_book_state(BookState::Disconnected);
                        worker_metrics.set_last_error(format!("tokio runtime build failed: {e}"));
                        return;
                    }
                };
                rt.block_on(run_live_feed_loop(
                    worker_cfg,
                    producer,
                    worker_metrics,
                    shutdown_rx,
                ));
            })
            .map_err(|e| format!("failed to spawn live feed worker thread: {e}"))?;

        Ok(Self {
            consumer,
            metrics,
            shutdown_tx: Some(shutdown_tx),
            worker_thread: Some(worker_thread),
        })
    }

    /// Non-blocking pop of the next live market event from the lock-free SPSC ring.
    pub fn try_recv(&mut self) -> Option<LiveMarketEvent> {
        self.consumer.pop().ok()
    }

    pub fn status_snapshot(&self) -> LiveFeedStatusSnapshot {
        self.metrics.snapshot()
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }
        if let Some(handle) = self.worker_thread.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for LiveFeedHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

struct WorkerConfig {
    source: FeedSource,
    url: String,
    wire_symbol: String,
    instrument_id: InstrumentId,
    ohlc_interval_mins: u32,
    book_depth: u32,
}

fn normalize_kraken_depth(depth: u32) -> u32 {
    match depth {
        0..=10 => 10,
        11..=25 => 25,
        26..=100 => 100,
        101..=500 => 500,
        _ => 1000,
    }
}

/// Non-blocking push into the bounded SPSC event ring; on saturation, marks `BookState::Stale`
/// and increments `dropped_events` without ever blocking the WebSocket reader.
fn push_event_nonblocking(
    producer: &mut Producer<LiveMarketEvent>,
    metrics: &LiveFeedMetrics,
    event: LiveMarketEvent,
) -> bool {
    if producer.push(event).is_ok() {
        true
    } else {
        metrics.dropped_events.fetch_add(1, Ordering::Relaxed);
        metrics.set_book_state(BookState::Stale);
        metrics.set_last_error("live_event_channel_saturated");
        false
    }
}

#[derive(Default)]
struct KrakenL2Book {
    asks: BTreeMap<i64, (String, String, i64)>,
    bids: BTreeMap<Reverse<i64>, (String, String, i64)>,
}

impl KrakenL2Book {
    fn clear(&mut self) {
        self.asks.clear();
        self.bids.clear();
    }

    fn apply_levels(&mut self, levels: Option<&Vec<Value>>, is_ask: bool) -> bool {
        let Some(arr) = levels else {
            return true;
        };
        for lv in arr {
            let Some(p_str) = lv.get("price").and_then(json_exact_decimal_str) else {
                return false;
            };
            let Some(q_str) = lv.get("qty").and_then(json_exact_decimal_str) else {
                return false;
            };
            let Ok(px) = PriceE9::parse(&p_str) else {
                return false;
            };
            let Ok(qty) = QtyE9::parse(&q_str) else {
                return false;
            };
            if is_ask {
                if qty.0 == 0 {
                    self.asks.remove(&px.0);
                } else {
                    self.asks.insert(px.0, (p_str, q_str, qty.0));
                }
            } else if qty.0 == 0 {
                self.bids.remove(&Reverse(px.0));
            } else {
                self.bids.insert(Reverse(px.0), (p_str, q_str, qty.0));
            }
        }
        true
    }

    fn truncate_to_depth(&mut self, depth: usize) {
        while self.asks.len() > depth {
            let _ = self.asks.pop_last();
        }
        while self.bids.len() > depth {
            let _ = self.bids.pop_last();
        }
    }

    fn compute_crc32(&self) -> u32 {
        let top_asks: Vec<(&str, &str)> = self
            .asks
            .values()
            .take(10)
            .map(|(p, q, _)| (p.as_str(), q.as_str()))
            .collect();
        let top_bids: Vec<(&str, &str)> = self
            .bids
            .values()
            .take(10)
            .map(|(p, q, _)| (p.as_str(), q.as_str()))
            .collect();
        kraken_book_crc32(&top_asks, &top_bids)
    }

    fn snapshot(&self, book_seq: u64, max_levels: usize, state: BookState) -> LiveL2Snapshot {
        let bids = self
            .bids
            .iter()
            .take(max_levels)
            .map(|(Reverse(px), (_, _, qty))| (*px, *qty))
            .collect();
        let asks = self
            .asks
            .iter()
            .take(max_levels)
            .map(|(px, (_, _, qty))| (*px, *qty))
            .collect();
        LiveL2Snapshot {
            book_seq,
            bids,
            asks,
            book_state: state,
            provenance_tier: ProvenanceTier::ExactTickAggr,
        }
    }
}

fn parse_kraken_ohlc_item(item: &Value, default_interval_mins: u32) -> Option<LiveOhlcBar> {
    let open = PriceE9::parse(&item.get("open").and_then(json_exact_decimal_str)?).ok()?;
    let high = PriceE9::parse(&item.get("high").and_then(json_exact_decimal_str)?).ok()?;
    let low = PriceE9::parse(&item.get("low").and_then(json_exact_decimal_str)?).ok()?;
    let close = PriceE9::parse(&item.get("close").and_then(json_exact_decimal_str)?).ok()?;
    let volume = QtyE9::parse(&item.get("volume").and_then(json_exact_decimal_str)?).ok()?;
    let ts_str = item
        .get("interval_begin")
        .or_else(|| item.get("timestamp"))
        .and_then(Value::as_str)?;
    let ts_open_ns = parse_rfc3339_utc_ns(ts_str)?;
    let interval_mins = item
        .get("interval")
        .and_then(Value::as_u64)
        .map(|v| v as u32)
        .unwrap_or(default_interval_mins);
    Some(LiveOhlcBar {
        ts_open_ns,
        open_e9: open.0,
        high_e9: high.0,
        low_e9: low.0,
        close_e9: close.0,
        volume_e9: volume.0,
        interval_mins,
    })
}

async fn sleep_or_shutdown(dur: Duration, shutdown_rx: &mut watch::Receiver<bool>) -> bool {
    if *shutdown_rx.borrow() {
        return true;
    }
    tokio::select! {
        _ = tokio::time::sleep(dur) => *shutdown_rx.borrow(),
        _ = shutdown_rx.changed() => true,
    }
}

async fn run_live_feed_loop(
    cfg: WorkerConfig,
    mut producer: Producer<LiveMarketEvent>,
    metrics: Arc<LiveFeedMetrics>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let mut attempt: u32 = 0;
    let mut backoff_ms: u64 = 100;
    let mut book_seq: u64 = 0;
    let mut trade_seq_fallback: u64 = 1;

    while !*shutdown_rx.borrow() {
        metrics.connected.store(false, Ordering::Release);
        let next_state = if attempt == 0 {
            BookState::Rebuilding
        } else {
            BookState::Stale
        };
        metrics.set_book_state(next_state);

        let connect_fut = timeout(Duration::from_secs(10), connect_async(&cfg.url));
        let connect_res = tokio::select! {
            res = connect_fut => res,
            _ = shutdown_rx.changed() => break,
        };

        let (mut ws, _) = match connect_res {
            Ok(Ok(pair)) => pair,
            Ok(Err(e)) => {
                let reason = format!("ws connect error: {e}");
                metrics.set_book_state(BookState::Disconnected);
                metrics.set_last_error(reason.clone());
                push_event_nonblocking(
                    &mut producer,
                    &metrics,
                    LiveMarketEvent::Status(BookState::Disconnected, reason),
                );
                attempt = attempt.saturating_add(1);
                if sleep_or_shutdown(Duration::from_millis(backoff_ms), &mut shutdown_rx).await {
                    break;
                }
                backoff_ms = (backoff_ms * 2).min(4_000);
                continue;
            }
            Err(_) => {
                let reason = "ws connect timeout".to_string();
                metrics.set_book_state(BookState::Disconnected);
                metrics.set_last_error(reason.clone());
                push_event_nonblocking(
                    &mut producer,
                    &metrics,
                    LiveMarketEvent::Status(BookState::Disconnected, reason),
                );
                attempt = attempt.saturating_add(1);
                if sleep_or_shutdown(Duration::from_millis(backoff_ms), &mut shutdown_rx).await {
                    break;
                }
                backoff_ms = (backoff_ms * 2).min(4_000);
                continue;
            }
        };

        if attempt > 0 {
            metrics.reconnects.fetch_add(1, Ordering::Relaxed);
        }
        attempt = attempt.saturating_add(1);
        backoff_ms = 100;
        metrics.connected.store(true, Ordering::Release);
        metrics.set_book_state(BookState::Rebuilding);

        let subs = build_subscribe_messages(&cfg);
        let mut sub_failed = false;
        for msg in subs {
            if let Err(e) = ws.send(Message::Text(msg.into())).await {
                let reason = format!("ws subscribe send failed: {e}");
                metrics.set_book_state(BookState::Disconnected);
                metrics.set_last_error(reason.clone());
                push_event_nonblocking(
                    &mut producer,
                    &metrics,
                    LiveMarketEvent::Status(BookState::Disconnected, reason),
                );
                sub_failed = true;
                break;
            }
        }
        if sub_failed {
            let _ = ws.close(None).await;
            if sleep_or_shutdown(Duration::from_millis(150), &mut shutdown_rx).await {
                break;
            }
            continue;
        }

        let mut kraken_book = KrakenL2Book::default();
        let mut expected_cb_seq: Option<u64> = None;
        let mut need_resync = false;

        while !*shutdown_rx.borrow() {
            let next_msg = tokio::select! {
                msg = ws.next() => msg,
                _ = shutdown_rx.changed() => break,
            };

            let Some(msg_res) = next_msg else {
                metrics.set_book_state(BookState::Disconnected);
                push_event_nonblocking(
                    &mut producer,
                    &metrics,
                    LiveMarketEvent::Status(BookState::Disconnected, "ws stream ended".into()),
                );
                need_resync = true;
                break;
            };

            let msg = match msg_res {
                Ok(m) => m,
                Err(e) => {
                    let reason = format!("ws read error: {e}");
                    metrics.set_book_state(BookState::Disconnected);
                    metrics.set_last_error(reason.clone());
                    push_event_nonblocking(
                        &mut producer,
                        &metrics,
                        LiveMarketEvent::Status(BookState::Disconnected, reason),
                    );
                    need_resync = true;
                    break;
                }
            };

            match msg {
                Message::Ping(payload) => {
                    let _ = ws.send(Message::Pong(payload)).await;
                    continue;
                }
                Message::Pong(_) | Message::Binary(_) | Message::Frame(_) => continue,
                Message::Close(_) => {
                    metrics.set_book_state(BookState::Disconnected);
                    push_event_nonblocking(
                        &mut producer,
                        &metrics,
                        LiveMarketEvent::Status(BookState::Disconnected, "ws closed by peer".into()),
                    );
                    need_resync = true;
                    break;
                }
                Message::Text(txt) => {
                    let Ok(val) = serde_json::from_str::<Value>(&txt) else {
                        metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                        continue;
                    };

                    match cfg.source {
                        FeedSource::KrakenWsV2 => {
                            if !handle_kraken_message(
                                &val,
                                &cfg,
                                &mut kraken_book,
                                &mut book_seq,
                                &mut trade_seq_fallback,
                                &mut producer,
                                &metrics,
                            ) {
                                need_resync = true;
                                break;
                            }
                        }
                        FeedSource::CoinbaseAdvTrade => {
                            if !handle_coinbase_message(
                                &val,
                                &cfg,
                                &mut expected_cb_seq,
                                &mut producer,
                                &metrics,
                            ) {
                                need_resync = true;
                                break;
                            }
                        }
                        FeedSource::PaperSim => break,
                    }
                }
            }
        }

        metrics.connected.store(false, Ordering::Release);
        let _ = ws.close(None).await;

        if *shutdown_rx.borrow() {
            break;
        }
        if need_resync && sleep_or_shutdown(Duration::from_millis(50), &mut shutdown_rx).await {
            break;
        }
    }

    metrics.connected.store(false, Ordering::Release);
    metrics.set_book_state(BookState::Disconnected);
}

fn build_subscribe_messages(cfg: &WorkerConfig) -> Vec<String> {
    match cfg.source {
        FeedSource::KrakenWsV2 => vec![
            serde_json::json!({
                "method": "subscribe",
                "params": {
                    "channel": "trade",
                    "symbol": [cfg.wire_symbol],
                    "snapshot": true
                }
            })
            .to_string(),
            serde_json::json!({
                "method": "subscribe",
                "params": {
                    "channel": "book",
                    "symbol": [cfg.wire_symbol],
                    "depth": cfg.book_depth,
                    "snapshot": true
                }
            })
            .to_string(),
            serde_json::json!({
                "method": "subscribe",
                "params": {
                    "channel": "ohlc",
                    "symbol": [cfg.wire_symbol],
                    "interval": cfg.ohlc_interval_mins,
                    "snapshot": true
                }
            })
            .to_string(),
        ],
        FeedSource::CoinbaseAdvTrade => vec![
            serde_json::json!({
                "type": "subscribe",
                "product_ids": [cfg.wire_symbol],
                "channel": "market_trades"
            })
            .to_string(),
            serde_json::json!({
                "type": "subscribe",
                "product_ids": [cfg.wire_symbol],
                "channel": "heartbeats"
            })
            .to_string(),
        ],
        FeedSource::PaperSim => Vec::new(),
    }
}

/// Returns `false` when a fail-closed fault (e.g. CRC32 mismatch) requires immediate WS resync.
fn handle_kraken_message(
    val: &Value,
    cfg: &WorkerConfig,
    book: &mut KrakenL2Book,
    book_seq: &mut u64,
    trade_seq_fallback: &mut u64,
    producer: &mut Producer<LiveMarketEvent>,
    metrics: &LiveFeedMetrics,
) -> bool {
    if val.get("method").and_then(Value::as_str) == Some("subscribe") {
        if val.get("success").and_then(Value::as_bool) == Some(false) {
            let err = val
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("kraken subscribe rejected")
                .to_string();
            metrics.set_last_error(err.clone());
            push_event_nonblocking(
                producer,
                metrics,
                LiveMarketEvent::Status(BookState::Stale, err),
            );
        }
        return true;
    }

    let Some(channel) = val.get("channel").and_then(Value::as_str) else {
        return true;
    };
    let msg_type = val.get("type").and_then(Value::as_str).unwrap_or("");

    match channel {
        "book" => {
            let Some(data) = val.get("data").and_then(Value::as_array) else {
                return true;
            };
            for item in data {
                if msg_type == "snapshot" {
                    book.clear();
                }
                let asks_ok = book.apply_levels(item.get("asks").and_then(Value::as_array), true);
                let bids_ok = book.apply_levels(item.get("bids").and_then(Value::as_array), false);
                if !asks_ok || !bids_ok {
                    metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
                book.truncate_to_depth(cfg.book_depth as usize);

                if let Some(crc_u64) = item.get("checksum").and_then(Value::as_u64) {
                    let expected = crc_u64 as u32;
                    let computed = book.compute_crc32();
                    if computed != expected {
                        metrics.crc_mismatches.fetch_add(1, Ordering::Relaxed);
                        metrics.set_book_state(BookState::Stale);
                        let reason = format!(
                            "kraken_crc32_mismatch expected={expected} computed={computed}"
                        );
                        metrics.set_last_error(reason.clone());
                        push_event_nonblocking(
                            producer,
                            metrics,
                            LiveMarketEvent::Status(BookState::Stale, reason),
                        );
                        return false;
                    }
                    metrics.crc_ok.fetch_add(1, Ordering::Relaxed);
                }

                let prev_state = metrics.book_state();
                if metrics.dropped_events.load(Ordering::Relaxed) == 0
                    || prev_state != BookState::Live
                {
                    metrics.set_book_state(BookState::Live);
                    metrics.clear_last_error();
                    if prev_state != BookState::Live {
                        push_event_nonblocking(
                            producer,
                            metrics,
                            LiveMarketEvent::Status(BookState::Live, "kraken_book_live".into()),
                        );
                    }
                }
                *book_seq = book_seq.saturating_add(1);
                metrics.l2_updates.fetch_add(1, Ordering::Relaxed);
                let snap = book.snapshot(*book_seq, cfg.book_depth as usize, BookState::Live);
                push_event_nonblocking(producer, metrics, LiveMarketEvent::L2Snapshot(snap));
            }
        }
        "trade" => {
            let Some(data) = val.get("data").and_then(Value::as_array) else {
                return true;
            };
            let mut batch = Vec::with_capacity(data.len());
            for item in data {
                let Some(price_s) = item.get("price").and_then(json_exact_decimal_str) else {
                    metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let Some(qty_s) = item.get("qty").and_then(json_exact_decimal_str) else {
                    metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let Some(side_s) = item.get("side").and_then(Value::as_str) else {
                    metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let Some(ts_str) = item.get("timestamp").and_then(Value::as_str) else {
                    metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let Some(ts_ns) = parse_rfc3339_utc_ns(ts_str) else {
                    metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let seq = item
                    .get("trade_id")
                    .or_else(|| item.get("seq"))
                    .and_then(Value::as_u64)
                    .unwrap_or_else(|| {
                        let s = *trade_seq_fallback;
                        *trade_seq_fallback = trade_seq_fallback.saturating_add(1);
                        s
                    });
                match parse_kraken_trade(
                    cfg.instrument_id,
                    seq,
                    TimestampNs(ts_ns),
                    &price_s,
                    &qty_s,
                    side_s,
                ) {
                    Ok(tick) => batch.push(tick),
                    Err(_) => {
                        metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
            // Keep snapshot/update trades chronological so FootprintSlabArena never drops them
            batch.sort_by_key(|t| (t.ts_exchange_ns, t.seq));
            for tick in batch {
                if push_event_nonblocking(producer, metrics, LiveMarketEvent::Trade(tick)) {
                    metrics.trades_received.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
        "ohlc" => {
            let Some(data) = val.get("data").and_then(Value::as_array) else {
                return true;
            };
            for item in data {
                match parse_kraken_ohlc_item(item, cfg.ohlc_interval_mins) {
                    Some(bar) => {
                        if push_event_nonblocking(producer, metrics, LiveMarketEvent::OhlcBar(bar)) {
                            metrics.ohlc_received.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                    None => {
                        metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
        }
        "heartbeat" | "status" => {}
        _ => {}
    }

    true
}

/// Returns `false` when a fail-closed fault (`sequence_num` gap) requires immediate WS resync.
fn handle_coinbase_message(
    val: &Value,
    cfg: &WorkerConfig,
    expected_seq: &mut Option<u64>,
    producer: &mut Producer<LiveMarketEvent>,
    metrics: &LiveFeedMetrics,
) -> bool {
    if val.get("type").and_then(Value::as_str) == Some("error") {
        let err = val
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("coinbase ws error")
            .to_string();
        metrics.set_last_error(err.clone());
        push_event_nonblocking(
            producer,
            metrics,
            LiveMarketEvent::Status(BookState::Stale, err),
        );
        return true;
    }

    let seq_num = if let Some(sn) = val.get("sequence_num").and_then(Value::as_u64) {
        if let Some(exp) = *expected_seq
            && sn != exp
        {
            metrics.set_book_state(BookState::Stale);
            let reason = format!("coinbase_sequence_gap expected={exp} actual={sn}");
            metrics.set_last_error(reason.clone());
            push_event_nonblocking(
                producer,
                metrics,
                LiveMarketEvent::Status(BookState::Stale, reason),
            );
            return false;
        }
        *expected_seq = Some(sn.saturating_add(1));
        sn
    } else {
        0
    };

    let Some(channel) = val.get("channel").and_then(Value::as_str) else {
        return true;
    };
    if channel != "market_trades" {
        if channel == "subscriptions" || channel == "heartbeats" {
            let prev_state = metrics.book_state();
            if prev_state != BookState::Live && metrics.dropped_events.load(Ordering::Relaxed) == 0
            {
                metrics.set_book_state(BookState::Live);
                metrics.clear_last_error();
                push_event_nonblocking(
                    producer,
                    metrics,
                    LiveMarketEvent::Status(BookState::Live, "coinbase_trades_live".into()),
                );
            }
        }
        return true;
    }

    let mut raw_trades: Vec<&Value> = Vec::new();
    if let Some(events) = val.get("events").and_then(Value::as_array) {
        for ev in events {
            if let Some(trades) = ev.get("trades").and_then(Value::as_array) {
                for tr in trades {
                    raw_trades.push(tr);
                }
            }
        }
    } else if val.get("price").is_some() {
        raw_trades.push(val);
    }

    let mut batch = Vec::with_capacity(raw_trades.len());
    for tr in raw_trades {
        let Some(price_s) = tr.get("price").and_then(json_exact_decimal_str) else {
            metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
            continue;
        };
        let Some(size_s) = tr.get("size").and_then(json_exact_decimal_str) else {
            metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
            continue;
        };
        let Some(side_s) = tr.get("side").and_then(Value::as_str) else {
            metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
            continue;
        };
        let Some(time_s) = tr
            .get("time")
            .or_else(|| val.get("timestamp"))
            .and_then(Value::as_str)
        else {
            metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
            continue;
        };
        let Some(ts_ns) = parse_rfc3339_utc_ns(time_s) else {
            metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
            continue;
        };
        match parse_coinbase_trade(
            cfg.instrument_id,
            None,
            seq_num,
            TimestampNs(ts_ns),
            &price_s,
            &size_s,
            side_s,
        ) {
            Ok(tick) => batch.push(tick),
            Err(_) => {
                metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    // Coinbase snapshots arrive newest-first; sort ascending for monotonic bar ingestion
    batch.sort_by_key(|t| (t.ts_exchange_ns, t.seq));

    let prev_state = metrics.book_state();
    if prev_state != BookState::Live && !batch.is_empty() {
        metrics.set_book_state(BookState::Live);
        metrics.clear_last_error();
        push_event_nonblocking(
            producer,
            metrics,
            LiveMarketEvent::Status(BookState::Live, "coinbase_trades_live".into()),
        );
    }

    for tick in batch {
        if push_event_nonblocking(producer, metrics, LiveMarketEvent::Trade(tick)) {
            metrics.trades_received.fetch_add(1, Ordering::Relaxed);
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_core::AggressorSide;
    use std::time::Instant;
    use tokio::net::TcpListener;
    use tokio_tungstenite::accept_async;

    #[test]
    fn symbol_resolution_and_source_parsing() {
        assert_eq!(FeedSource::parse_str("paper_sim"), Some(FeedSource::PaperSim));
        assert_eq!(
            FeedSource::parse_str("kraken_ws_v2"),
            Some(FeedSource::KrakenWsV2)
        );
        assert_eq!(
            FeedSource::parse_str("coinbase_ws"),
            Some(FeedSource::CoinbaseAdvTrade)
        );
        assert_eq!(
            FeedSource::KrakenWsV2.resolve_live_symbol("BTC/USD"),
            Some(("BTC/USD", "BTC/USD"))
        );
        assert_eq!(
            FeedSource::CoinbaseAdvTrade.resolve_live_symbol("BTC/USD"),
            Some(("BTC/USD", "BTC-USD"))
        );
        assert_eq!(
            FeedSource::CoinbaseAdvTrade.resolve_live_symbol("SOL-USD"),
            Some(("SOL/USD", "SOL-USD"))
        );
        assert_eq!(FeedSource::KrakenWsV2.resolve_live_symbol("NQ1!"), None);
        assert_eq!(FeedSource::KrakenWsV2.resolve_live_symbol("ES1!"), None);
    }

    #[test]
    fn kraken_mock_ws_trades_l2_crc_ohlc_and_resync_on_mismatch() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let (addr, server_task) = rt.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let handle = tokio::spawn(async move {
                // Connection 1: valid book snapshot + ohlc + trade, then corrupt CRC32 update
                let (stream1, _) = listener.accept().await.unwrap();
                let mut ws1 = accept_async(stream1).await.unwrap();
                for _ in 0..3 {
                    let _ = ws1.next().await;
                }
                let good_crc = kraken_book_crc32(&[("95001.0", "1.5")], &[("95000.0", "2.0")]);
                let snap = serde_json::json!({
                    "channel": "book",
                    "type": "snapshot",
                    "data": [{
                        "symbol": "BTC/USD",
                        "asks": [{"price": 95001.0, "qty": 1.5}],
                        "bids": [{"price": 95000.0, "qty": 2.0}],
                        "checksum": good_crc
                    }]
                })
                .to_string();
                ws1.send(Message::Text(snap.into())).await.unwrap();

                let ohlc = serde_json::json!({
                    "channel": "ohlc",
                    "type": "snapshot",
                    "data": [{
                        "symbol": "BTC/USD",
                        "open": "94990.5",
                        "high": "95010.0",
                        "low": "94980.0",
                        "close": "95000.5",
                        "volume": "12.345",
                        "interval": 1,
                        "interval_begin": "2026-11-27T02:00:00.000000000Z"
                    }]
                })
                .to_string();
                ws1.send(Message::Text(ohlc.into())).await.unwrap();

                let trade = serde_json::json!({
                    "channel": "trade",
                    "type": "update",
                    "data": [{
                        "symbol": "BTC/USD",
                        "side": "buy",
                        "price": "95001.0",
                        "qty": "0.25",
                        "trade_id": 1001,
                        "timestamp": "2026-11-27T02:00:05.123000Z"
                    }]
                })
                .to_string();
                ws1.send(Message::Text(trade.into())).await.unwrap();

                // Inject bad CRC32 to force BookState::Stale + reconnect/resync
                let bad_update = serde_json::json!({
                    "channel": "book",
                    "type": "update",
                    "data": [{
                        "symbol": "BTC/USD",
                        "asks": [{"price": 95002.0, "qty": 3.0}],
                        "bids": [],
                        "checksum": good_crc ^ 0xDEAD_BEEF
                    }]
                })
                .to_string();
                ws1.send(Message::Text(bad_update.into())).await.unwrap();

                // Connection 2: resynced valid snapshot
                let (stream2, _) = listener.accept().await.unwrap();
                let mut ws2 = accept_async(stream2).await.unwrap();
                for _ in 0..3 {
                    let _ = ws2.next().await;
                }
                let resync_snap = serde_json::json!({
                    "channel": "book",
                    "type": "snapshot",
                    "data": [{
                        "symbol": "BTC/USD",
                        "asks": [{"price": 95001.0, "qty": 1.5}],
                        "bids": [{"price": 95000.0, "qty": 2.0}],
                        "checksum": good_crc
                    }]
                })
                .to_string();
                ws2.send(Message::Text(resync_snap.into())).await.unwrap();
                tokio::time::sleep(Duration::from_millis(200)).await;
                let _ = ws2.close(None).await;
            });
            (addr, handle)
        });

        let mut cfg = LiveFeedConfig::new(FeedSource::KrakenWsV2, "BTC/USD", InstrumentId(1));
        cfg.ws_url_override = Some(format!("ws://{addr}"));
        let mut handle = LiveFeedHandle::start(cfg).unwrap();

        let mut saw_trade = false;
        let mut saw_ohlc = false;
        let mut saw_l2 = false;
        let mut saw_stale = false;
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline {
            rt.block_on(async { tokio::time::sleep(Duration::from_millis(10)).await });
            while let Some(ev) = handle.try_recv() {
                match ev {
                    LiveMarketEvent::Trade(t) => {
                        assert_eq!(t.price_e9, 95_001_000_000_000);
                        assert_eq!(t.qty_e9, 250_000_000);
                        assert_eq!(t.aggressor_side(), AggressorSide::Buy);
                        saw_trade = true;
                    }
                    LiveMarketEvent::OhlcBar(b) => {
                        assert_eq!(b.open_e9, 94_990_500_000_000);
                        assert_eq!(b.close_e9, 95_000_500_000_000);
                        assert_eq!(b.volume_e9, 12_345_000_000);
                        saw_ohlc = true;
                    }
                    LiveMarketEvent::L2Snapshot(s) => {
                        assert_eq!(s.bids[0].0, 95_000_000_000_000);
                        assert_eq!(s.asks[0].0, 95_001_000_000_000);
                        saw_l2 = true;
                    }
                    LiveMarketEvent::Status(BookState::Stale, reason) => {
                        assert!(reason.contains("kraken_crc32_mismatch"));
                        saw_stale = true;
                    }
                    LiveMarketEvent::Status(_, _) => {}
                }
            }
            let st = handle.status_snapshot();
            if saw_trade && saw_ohlc && saw_l2 && saw_stale && st.crc_ok >= 2 && st.reconnects >= 1
            {
                break;
            }
        }

        let st = handle.status_snapshot();
        handle.stop();
        rt.block_on(server_task).unwrap();

        assert!(saw_trade, "expected Kraken trade event");
        assert!(saw_ohlc, "expected Kraken ohlc event");
        assert!(saw_l2, "expected Kraken L2 snapshot event");
        assert!(saw_stale, "expected Stale event on CRC32 mismatch");
        assert_eq!(st.crc_mismatches, 1);
        assert!(st.crc_ok >= 2, "expected resynced CRC32 pass, got {}", st.crc_ok);
        assert!(st.reconnects >= 1, "expected automatic reconnect after CRC fault");
        assert_eq!(st.parse_errors, 0);
    }

    #[test]
    fn coinbase_mock_ws_maker_inversion_and_seq_gap_resync() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let (addr, server_task) = rt.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let handle = tokio::spawn(async move {
                let (stream1, _) = listener.accept().await.unwrap();
                let mut ws1 = accept_async(stream1).await.unwrap();
                for _ in 0..2 {
                    let _ = ws1.next().await;
                }
                let msg0 = serde_json::json!({
                    "channel": "market_trades",
                    "sequence_num": 0,
                    "events": [{
                        "type": "snapshot",
                        "trades": [
                            {"product_id": "BTC-USD", "price": "95005.25", "size": "0.10", "side": "SELL", "time": "2026-11-27T02:00:02.000000Z"},
                            {"product_id": "BTC-USD", "price": "95004.75", "size": "0.20", "side": "BUY", "time": "2026-11-27T02:00:01.000000Z"}
                        ]
                    }]
                })
                .to_string();
                ws1.send(Message::Text(msg0.into())).await.unwrap();

                // Inject sequence gap (expected 1, send 5)
                let gap = serde_json::json!({
                    "channel": "market_trades",
                    "sequence_num": 5,
                    "events": []
                })
                .to_string();
                ws1.send(Message::Text(gap.into())).await.unwrap();

                // Connection 2 after resync
                let (stream2, _) = listener.accept().await.unwrap();
                let mut ws2 = accept_async(stream2).await.unwrap();
                for _ in 0..2 {
                    let _ = ws2.next().await;
                }
                let msg_ok = serde_json::json!({
                    "channel": "market_trades",
                    "sequence_num": 0,
                    "events": [{
                        "type": "update",
                        "trades": [
                            {"product_id": "BTC-USD", "price": "95010.00", "size": "0.50", "side": "SELL", "time": "2026-11-27T02:00:03.000000Z"}
                        ]
                    }]
                })
                .to_string();
                ws2.send(Message::Text(msg_ok.into())).await.unwrap();
                tokio::time::sleep(Duration::from_millis(200)).await;
                let _ = ws2.close(None).await;
            });
            (addr, handle)
        });

        let mut cfg = LiveFeedConfig::new(FeedSource::CoinbaseAdvTrade, "BTC/USD", InstrumentId(1));
        cfg.ws_url_override = Some(format!("ws://{addr}"));
        let mut handle = LiveFeedHandle::start(cfg).unwrap();

        let mut ticks = Vec::new();
        let mut saw_stale_gap = false;
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline {
            rt.block_on(async { tokio::time::sleep(Duration::from_millis(10)).await });
            while let Some(ev) = handle.try_recv() {
                match ev {
                    LiveMarketEvent::Trade(t) => ticks.push(t),
                    LiveMarketEvent::Status(BookState::Stale, reason) => {
                        if reason.contains("coinbase_sequence_gap") {
                            saw_stale_gap = true;
                        }
                    }
                    _ => {}
                }
            }
            if ticks.len() >= 3 && saw_stale_gap && handle.status_snapshot().reconnects >= 1 {
                break;
            }
        }

        let st = handle.status_snapshot();
        handle.stop();
        rt.block_on(server_task).unwrap();

        assert_eq!(ticks.len(), 3);
        // Sorted chronologically: first trade is 02:00:01 (maker BUY -> taker Sell)
        assert_eq!(ticks[0].price_e9, 95_004_750_000_000);
        assert_eq!(ticks[0].aggressor_side(), AggressorSide::Sell);
        // Second trade is 02:00:02 (maker SELL -> taker Buy)
        assert_eq!(ticks[1].price_e9, 95_005_250_000_000);
        assert_eq!(ticks[1].aggressor_side(), AggressorSide::Buy);
        // Third trade arrived after reconnect/resync
        assert_eq!(ticks[2].price_e9, 95_010_000_000_000);
        assert_eq!(ticks[2].aggressor_side(), AggressorSide::Buy);
        assert!(saw_stale_gap);
        assert!(st.reconnects >= 1);
        assert_eq!(st.parse_errors, 0);
    }

    #[test]
    fn channel_saturation_never_blocks_and_marks_stale() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let (addr, server_task) = rt.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let handle = tokio::spawn(async move {
                let (stream, _) = listener.accept().await.unwrap();
                let mut ws = accept_async(stream).await.unwrap();
                for _ in 0..3 {
                    let _ = ws.next().await;
                }
                let mut trades = Vec::new();
                for i in 0..10u64 {
                    trades.push(serde_json::json!({
                        "symbol": "BTC/USD",
                        "side": "buy",
                        "price": "95000.0",
                        "qty": "0.1",
                        "trade_id": i + 1,
                        "timestamp": format!("2026-11-27T02:00:{:02}.000000Z", i)
                    }));
                }
                let msg = serde_json::json!({
                    "channel": "trade",
                    "type": "update",
                    "data": trades
                })
                .to_string();
                ws.send(Message::Text(msg.into())).await.unwrap();
                tokio::time::sleep(Duration::from_millis(200)).await;
                let _ = ws.close(None).await;
            });
            (addr, handle)
        });

        let mut cfg = LiveFeedConfig::new(FeedSource::KrakenWsV2, "BTC/USD", InstrumentId(1));
        cfg.channel_capacity = 2;
        cfg.ws_url_override = Some(format!("ws://{addr}"));
        let mut handle = LiveFeedHandle::start(cfg).unwrap();

        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            rt.block_on(async { tokio::time::sleep(Duration::from_millis(15)).await });
            let st = handle.status_snapshot();
            if st.dropped_events > 0 && st.book_state == BookState::Stale {
                break;
            }
        }
        let st = handle.status_snapshot();
        handle.stop();
        rt.block_on(server_task).unwrap();

        assert!(st.dropped_events > 0, "expected ring drops on cap=2 burst");
        assert_eq!(st.book_state, BookState::Stale);
    }

    #[test]
    #[ignore = "live public internet connectivity smoke test (run manually with --ignored --nocapture)"]
    fn live_kraken_ws_v2_5s_smoke_test() {
        let cfg = LiveFeedConfig::new(FeedSource::KrakenWsV2, "BTC/USD", InstrumentId(1));
        let mut handle = LiveFeedHandle::start(cfg).unwrap();
        let start = Instant::now();
        let mut trades = 0u64;
        let mut l2s = 0u64;
        let mut ohlcs = 0u64;

        while start.elapsed() < Duration::from_secs(5) {
            while let Some(ev) = handle.try_recv() {
                match ev {
                    LiveMarketEvent::Trade(_) => trades += 1,
                    LiveMarketEvent::L2Snapshot(_) => l2s += 1,
                    LiveMarketEvent::OhlcBar(_) => ohlcs += 1,
                    LiveMarketEvent::Status(_, _) => {}
                }
            }
            std::thread::sleep(Duration::from_millis(25));
        }

        let st = handle.status_snapshot();
        handle.stop();

        println!(
            "KRAKEN_LIVE_5S_SMOKE trades={trades} l2={l2s} ohlc={ohlcs} crc_ok={} crc_bad={} parse_errs={} drops={} state={:?}",
            st.crc_ok, st.crc_mismatches, st.parse_errors, st.dropped_events, st.book_state
        );
        assert!(trades > 0, "expected live BTC/USD trades from Kraken WS v2");
        assert!(l2s > 0, "expected live BTC/USD L2 book snapshots from Kraken WS v2");
        assert!(ohlcs > 0, "expected live BTC/USD OHLC updates from Kraken WS v2");
        assert!(st.crc_ok > 0, "expected live CRC32 checks to pass");
        assert_eq!(st.crc_mismatches, 0, "expected 0 CRC32 mismatches");
        assert_eq!(st.parse_errors, 0, "expected 0 parse errors");
        assert_eq!(st.dropped_events, 0, "expected 0 dropped events");
    }
}
