//! Public read-only Kraken WS v2 + Coinbase Advanced Trade live soak binary (UV-06 / S05).
//!
//! Safety invariants:
//! - Strictly public read-only market-data WebSockets (ZERO credentials, ZERO API keys, ZERO trading).
//! - Pure fixed-point `i64` parsing (`PriceE9`, `QtyE9`) — ZERO binary floats (`SV-08`).
//! - Feeds real exchange trade messages through per-provider `rtrb` SPSC rings into
//!   `CoreEventDispatcher` -> `StorageRing`, validating Coinbase monotonic `sequence_num`
//!   and mandatory maker->taker side inversion.

use allegedly_core::{InstrumentId, NormalizedTick, TimestampNs};
use allegedly_ingest::{
    CoreEventDispatcher, DEFAULT_RING_CAP, parse_coinbase_trade, parse_kraken_trade,
};
use futures_util::{SinkExt, StreamExt};
use rtrb::{Producer, RingBuffer};
use serde_json::Value;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

const KRAKEN_WS_URL: &str = "wss://ws.kraken.com/v2";
const COINBASE_WS_URL: &str = "wss://advanced-trade-ws.coinbase.com";

fn now_ns() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0)
}

fn json_decimal_str(v: &Value) -> Option<String> {
    if let Some(s) = v.as_str() {
        Some(s.to_string())
    } else {
        v.as_number().map(ToString::to_string)
    }
}

async fn run_kraken_soak(
    mut producer: Producer<NormalizedTick>,
    deadline: Instant,
    trades_ok: Arc<AtomicU64>,
    parse_errs: Arc<AtomicU64>,
) {
    let connect_res = timeout(Duration::from_secs(10), connect_async(KRAKEN_WS_URL)).await;
    let (mut ws, _) = match connect_res {
        Ok(Ok(pair)) => pair,
        Ok(Err(e)) => {
            eprintln!("[kraken] connect error: {e}");
            return;
        }
        Err(_) => {
            eprintln!("[kraken] connect timeout");
            return;
        }
    };

    let sub = serde_json::json!({
        "method": "subscribe",
        "params": {
            "channel": "trade",
            "symbol": ["SOL/USD", "BTC/USD"]
        }
    })
    .to_string();
    if let Err(e) = ws.send(Message::Text(sub.into())).await {
        eprintln!("[kraken] subscribe error: {e}");
        return;
    }

    let mut seq = 0u64;
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let step = remaining.min(Duration::from_secs(2));
        match timeout(step, ws.next()).await {
            Ok(Some(Ok(Message::Text(txt)))) => {
                let Ok(val) = serde_json::from_str::<Value>(&txt) else {
                    continue;
                };
                if val.get("channel").and_then(Value::as_str) != Some("trade") {
                    continue;
                }
                let Some(items) = val.get("data").and_then(Value::as_array) else {
                    continue;
                };
                for item in items {
                    let Some(price_s) = item.get("price").and_then(json_decimal_str) else {
                        continue;
                    };
                    let Some(qty_s) = item.get("qty").and_then(json_decimal_str) else {
                        continue;
                    };
                    let Some(side_s) = item.get("side").and_then(Value::as_str) else {
                        continue;
                    };
                    let sym = item
                        .get("symbol")
                        .and_then(Value::as_str)
                        .unwrap_or("SOL/USD");
                    let inst = if sym.starts_with("BTC") {
                        InstrumentId(1)
                    } else {
                        InstrumentId(2)
                    };
                    seq += 1;
                    match parse_kraken_trade(
                        inst,
                        seq,
                        TimestampNs(now_ns()),
                        &price_s,
                        &qty_s,
                        side_s,
                    ) {
                        Ok(tick) => {
                            let _ = producer.push(tick);
                            trades_ok.fetch_add(1, Ordering::Relaxed);
                        }
                        Err(_) => {
                            parse_errs.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            }
            Ok(Some(Ok(Message::Ping(p)))) => {
                let _ = ws.send(Message::Pong(p)).await;
            }
            Ok(Some(Ok(Message::Close(_)))) | Ok(None) => break,
            Ok(Some(Err(e))) => {
                eprintln!("[kraken] ws error: {e}");
                break;
            }
            _ => {}
        }
    }
    let _ = ws.close(None).await;
}

async fn run_coinbase_soak(
    mut producer: Producer<NormalizedTick>,
    deadline: Instant,
    trades_ok: Arc<AtomicU64>,
    seq_gaps: Arc<AtomicU64>,
    parse_errs: Arc<AtomicU64>,
) {
    let connect_res = timeout(Duration::from_secs(10), connect_async(COINBASE_WS_URL)).await;
    let (mut ws, _) = match connect_res {
        Ok(Ok(pair)) => pair,
        Ok(Err(e)) => {
            eprintln!("[coinbase] connect error: {e}");
            return;
        }
        Err(_) => {
            eprintln!("[coinbase] connect timeout");
            return;
        }
    };

    let sub = serde_json::json!({
        "type": "subscribe",
        "product_ids": ["SOL-USD", "BTC-USD"],
        "channel": "market_trades"
    })
    .to_string();
    if let Err(e) = ws.send(Message::Text(sub.into())).await {
        eprintln!("[coinbase] subscribe error: {e}");
        return;
    }

    let mut expected_seq: Option<u64> = None;
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let step = remaining.min(Duration::from_secs(2));
        match timeout(step, ws.next()).await {
            Ok(Some(Ok(Message::Text(txt)))) => {
                let Ok(val) = serde_json::from_str::<Value>(&txt) else {
                    continue;
                };
                let seq_num = if let Some(sn) = val.get("sequence_num").and_then(Value::as_u64) {
                    if let Some(exp) = expected_seq
                        && sn != exp
                    {
                        seq_gaps.fetch_add(1, Ordering::Relaxed);
                    }
                    expected_seq = Some(sn.saturating_add(1));
                    sn
                } else {
                    0
                };
                if val.get("channel").and_then(Value::as_str) != Some("market_trades") {
                    continue;
                }

                let Some(events) = val.get("events").and_then(Value::as_array) else {
                    continue;
                };
                for ev in events {
                    let Some(trades) = ev.get("trades").and_then(Value::as_array) else {
                        continue;
                    };
                    for tr in trades {
                        let Some(price_s) = tr.get("price").and_then(json_decimal_str) else {
                            continue;
                        };
                        let Some(size_s) = tr.get("size").and_then(json_decimal_str) else {
                            continue;
                        };
                        let Some(side_s) = tr.get("side").and_then(Value::as_str) else {
                            continue;
                        };
                        let prod = tr
                            .get("product_id")
                            .and_then(Value::as_str)
                            .unwrap_or("SOL-USD");
                        let inst = if prod.starts_with("BTC") {
                            InstrumentId(1)
                        } else {
                            InstrumentId(2)
                        };
                        // Note: per-message seq checked above; pass None to per-trade parser
                        // because multiple trades share one envelope sequence_num.
                        match parse_coinbase_trade(
                            inst,
                            None,
                            seq_num,
                            TimestampNs(now_ns()),
                            &price_s,
                            &size_s,
                            side_s,
                        ) {
                            Ok(tick) => {
                                let _ = producer.push(tick);
                                trades_ok.fetch_add(1, Ordering::Relaxed);
                            }
                            Err(_) => {
                                parse_errs.fetch_add(1, Ordering::Relaxed);
                            }
                        }
                    }
                }
            }
            Ok(Some(Ok(Message::Ping(p)))) => {
                let _ = ws.send(Message::Pong(p)).await;
            }
            Ok(Some(Ok(Message::Close(_)))) | Ok(None) => break,
            Ok(Some(Err(e))) => {
                eprintln!("[coinbase] ws error: {e}");
                break;
            }
            _ => {}
        }
    }
    let _ = ws.close(None).await;
}

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut duration_secs: u64 = 30;
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--duration-secs" && i + 1 < args.len() {
            duration_secs = args[i + 1].parse().unwrap_or(30);
            i += 2;
        } else {
            i += 1;
        }
    }

    let (k_prod, k_cons) = RingBuffer::<NormalizedTick>::new(DEFAULT_RING_CAP);
    let (c_prod, c_cons) = RingBuffer::<NormalizedTick>::new(DEFAULT_RING_CAP);
    let (s_prod, mut s_cons) = RingBuffer::<NormalizedTick>::new(DEFAULT_RING_CAP * 2);

    let mut dispatcher = CoreEventDispatcher::new(vec![k_cons, c_cons], s_prod);

    let k_trades = Arc::new(AtomicU64::new(0));
    let k_errs = Arc::new(AtomicU64::new(0));
    let c_trades = Arc::new(AtomicU64::new(0));
    let c_gaps = Arc::new(AtomicU64::new(0));
    let c_errs = Arc::new(AtomicU64::new(0));

    let start = Instant::now();
    let deadline = start + Duration::from_secs(duration_secs);

    let k_handle = tokio::spawn(run_kraken_soak(
        k_prod,
        deadline,
        k_trades.clone(),
        k_errs.clone(),
    ));
    let c_handle = tokio::spawn(run_coinbase_soak(
        c_prod,
        deadline,
        c_trades.clone(),
        c_gaps.clone(),
        c_errs.clone(),
    ));

    let mut dispatched_total = 0u64;
    let mut buy_count = 0u64;
    let mut sell_count = 0u64;
    while Instant::now() < deadline {
        let mut drained = 0usize;
        let _ = dispatcher.poll_all(&mut |_| {
            drained += 1;
        });
        while let Ok(t) = s_cons.pop() {
            dispatched_total += 1;
            if t.side == 1 {
                buy_count += 1;
            } else if t.side == 2 {
                sell_count += 1;
            }
        }
        if drained == 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    let _ = k_handle.await;
    let _ = c_handle.await;
    let _ = dispatcher.poll_all(&mut |_| {});
    while let Ok(t) = s_cons.pop() {
        dispatched_total += 1;
        if t.side == 1 {
            buy_count += 1;
        } else if t.side == 2 {
            sell_count += 1;
        }
    }

    let elapsed_ms = start.elapsed().as_millis();
    let summary = serde_json::json!({
        "duration_secs": duration_secs,
        "elapsed_ms": elapsed_ms,
        "kraken_trades_parsed": k_trades.load(Ordering::Relaxed),
        "kraken_parse_errors": k_errs.load(Ordering::Relaxed),
        "coinbase_trades_parsed": c_trades.load(Ordering::Relaxed),
        "coinbase_seq_gaps": c_gaps.load(Ordering::Relaxed),
        "coinbase_parse_errors": c_errs.load(Ordering::Relaxed),
        "dispatched_to_storage_ring": dispatched_total,
        "aggressor_buy_ticks": buy_count,
        "aggressor_sell_ticks": sell_count,
        "storage_drops": dispatcher.storage_dropped(),
        "credentials_used": false,
        "live_armed": false
    });
    println!("{}", serde_json::to_string_pretty(&summary).unwrap());
}
