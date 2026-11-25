//! UV-06 Public Read-Only Live Exchange Soak Harness (0 credentials, 0 live orders, 0 floats).
//!
//! Connects to public unauthenticated Kraken WS v2 (`trade` + `book` `depth=100` with live CRC32 verification)
//! and Coinbase Advanced Trade WS (`market_trades` with envelope sequence verification), parses every
//! decimal via `serde_json` `arbitrary_precision` raw ASCII strings -> exact integer `PriceE9`/`QtyE9`,
//! pushes through lock-free `rtrb` SPSC rings -> `CoreEventDispatcher`, and exits NON-ZERO on any
//! parse error, ring drop, storage drop, zero trades, or unrecovered fault (RTSD-03 / RTSD-10).

use allegedly_core::{InstrumentId, NormalizedTick, PriceE9, QtyE9, TimestampNs};
use allegedly_ingest::{
    CoreEventDispatcher, DEFAULT_RING_CAP, json_exact_decimal_str, kraken_book_crc32,
    parse_coinbase_trade, parse_kraken_trade, parse_rfc3339_utc_ns,
};
use futures_util::{SinkExt, StreamExt};
use rtrb::{Producer, RingBuffer};
use serde_json::Value;
use std::cmp::Reverse;
use std::collections::BTreeMap;
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

const KRAKEN_WS_URL: &str = "wss://ws.kraken.com/v2";
const COINBASE_WS_URL: &str = "wss://advanced-trade-ws.coinbase.com";

#[derive(Default)]
struct KrakenL2Book {
    asks: BTreeMap<i64, (String, String)>,
    bids: BTreeMap<Reverse<i64>, (String, String)>,
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
                    self.asks.insert(px.0, (p_str, q_str));
                }
            } else if qty.0 == 0 {
                self.bids.remove(&Reverse(px.0));
            } else {
                self.bids.insert(Reverse(px.0), (p_str, q_str));
            }
        }
        true
    }

    fn verify_crc32(&self, expected_crc: u32) -> bool {
        let top_asks: Vec<(&str, &str)> = self
            .asks
            .values()
            .take(10)
            .map(|(p, q)| (p.as_str(), q.as_str()))
            .collect();
        let top_bids: Vec<(&str, &str)> = self
            .bids
            .values()
            .take(10)
            .map(|(p, q)| (p.as_str(), q.as_str()))
            .collect();
        kraken_book_crc32(&top_asks, &top_bids) == expected_crc
    }
}

struct KrakenCounters {
    trades_ok: AtomicU64,
    parse_errs: AtomicU64,
    ring_drops: AtomicU64,
    book_crc_ok: AtomicU64,
    book_crc_mismatches: AtomicU64,
    reconnects: AtomicU64,
}

async fn run_kraken_soak(
    mut producer: Producer<NormalizedTick>,
    deadline: Instant,
    c: Arc<KrakenCounters>,
) {
    let mut seq_counter: u64 = 1;
    let mut reconnect_attempt: u32 = 0;

    while Instant::now() < deadline {
        let connect_res = timeout(Duration::from_secs(10), connect_async(KRAKEN_WS_URL)).await;
        let (mut ws, _) = match connect_res {
            Ok(Ok(pair)) => pair,
            Ok(Err(e)) => {
                eprintln!("[kraken] connect error: {e}");
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            Err(_) => {
                eprintln!("[kraken] connect timeout");
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
        };

        if reconnect_attempt > 0 {
            c.reconnects.fetch_add(1, Ordering::Relaxed);
        }
        reconnect_attempt += 1;

        let sub_trade = serde_json::json!({
            "method": "subscribe",
            "params": {
                "channel": "trade",
                "symbol": ["SOL/USD", "BTC/USD"],
                "snapshot": false
            }
        })
        .to_string();
        let sub_book = serde_json::json!({
            "method": "subscribe",
            "params": {
                "channel": "book",
                "symbol": ["BTC/USD"],
                "depth": 100,
                "snapshot": true
            }
        })
        .to_string();

        if ws.send(Message::Text(sub_trade.into())).await.is_err()
            || ws.send(Message::Text(sub_book.into())).await.is_err()
        {
            tokio::time::sleep(Duration::from_millis(500)).await;
            continue;
        }

        let mut book = KrakenL2Book::default();
        let mut need_resync = false;

        while Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let step = remaining.min(Duration::from_secs(2));
            match timeout(step, ws.next()).await {
                Ok(Some(Ok(Message::Text(txt)))) => {
                    let Ok(val) = serde_json::from_str::<Value>(&txt) else {
                        c.parse_errs.fetch_add(1, Ordering::Relaxed);
                        continue;
                    };
                    let Some(channel) = val.get("channel").and_then(Value::as_str) else {
                        continue;
                    };
                    let msg_type = val.get("type").and_then(Value::as_str).unwrap_or("");

                    if channel == "book" {
                        let Some(data) = val.get("data").and_then(Value::as_array) else {
                            continue;
                        };
                        for item in data {
                            if msg_type == "snapshot" {
                                book.clear();
                            }
                            let asks_ok =
                                book.apply_levels(item.get("asks").and_then(Value::as_array), true);
                            let bids_ok = book
                                .apply_levels(item.get("bids").and_then(Value::as_array), false);
                            if !asks_ok || !bids_ok {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            }
                            if let Some(crc_u64) = item.get("checksum").and_then(Value::as_u64) {
                                let expected = crc_u64 as u32;
                                if book.verify_crc32(expected) {
                                    c.book_crc_ok.fetch_add(1, Ordering::Relaxed);
                                } else {
                                    eprintln!(
                                        "[kraken] book CRC32 mismatch -> BookState::Stale -> resyncing"
                                    );
                                    c.book_crc_mismatches.fetch_add(1, Ordering::Relaxed);
                                    need_resync = true;
                                    break;
                                }
                            }
                        }
                        if need_resync {
                            break;
                        }
                    } else if channel == "trade" {
                        let Some(data) = val.get("data").and_then(Value::as_array) else {
                            continue;
                        };
                        for item in data {
                            let Some(price_s) = item.get("price").and_then(json_exact_decimal_str)
                            else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(qty_s) = item.get("qty").and_then(json_exact_decimal_str)
                            else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(side_s) = item.get("side").and_then(Value::as_str) else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(ts_str) = item.get("timestamp").and_then(Value::as_str) else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(ts_ns) = parse_rfc3339_utc_ns(ts_str) else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
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
                            let seq = item
                                .get("trade_id")
                                .and_then(Value::as_u64)
                                .unwrap_or(seq_counter);
                            seq_counter += 1;

                            match parse_kraken_trade(
                                inst,
                                seq,
                                TimestampNs(ts_ns),
                                &price_s,
                                &qty_s,
                                side_s,
                            ) {
                                Ok(tick) => {
                                    if producer.push(tick).is_err() {
                                        c.ring_drops.fetch_add(1, Ordering::Relaxed);
                                    } else {
                                        c.trades_ok.fetch_add(1, Ordering::Relaxed);
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[kraken] parse err: {e}");
                                    c.parse_errs.fetch_add(1, Ordering::Relaxed);
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
                    eprintln!("[kraken] ws error: {e}");
                    break;
                }
                _ => {}
            }
        }
        let _ = ws.close(None).await;
    }
}

struct CoinbaseCounters {
    trades_ok: AtomicU64,
    seq_gaps: AtomicU64,
    parse_errs: AtomicU64,
    ring_drops: AtomicU64,
    reconnects: AtomicU64,
}

async fn run_coinbase_soak(
    mut producer: Producer<NormalizedTick>,
    deadline: Instant,
    c: Arc<CoinbaseCounters>,
) {
    let mut reconnect_attempt: u32 = 0;

    while Instant::now() < deadline {
        let connect_res = timeout(Duration::from_secs(10), connect_async(COINBASE_WS_URL)).await;
        let (mut ws, _) = match connect_res {
            Ok(Ok(pair)) => pair,
            Ok(Err(e)) => {
                eprintln!("[coinbase] connect error: {e}");
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            Err(_) => {
                eprintln!("[coinbase] connect timeout");
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
        };

        if reconnect_attempt > 0 {
            c.reconnects.fetch_add(1, Ordering::Relaxed);
        }
        reconnect_attempt += 1;

        let sub = serde_json::json!({
            "type": "subscribe",
            "product_ids": ["SOL-USD", "BTC-USD"],
            "channel": "market_trades"
        })
        .to_string();
        if ws.send(Message::Text(sub.into())).await.is_err() {
            tokio::time::sleep(Duration::from_millis(500)).await;
            continue;
        }

        let mut expected_seq: Option<u64> = None;
        while Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let step = remaining.min(Duration::from_secs(2));
            match timeout(step, ws.next()).await {
                Ok(Some(Ok(Message::Text(txt)))) => {
                    let Ok(val) = serde_json::from_str::<Value>(&txt) else {
                        c.parse_errs.fetch_add(1, Ordering::Relaxed);
                        continue;
                    };
                    let seq_num = if let Some(sn) = val.get("sequence_num").and_then(Value::as_u64)
                    {
                        if let Some(exp) = expected_seq
                            && sn != exp
                        {
                            eprintln!(
                                "[coinbase] sequence gap expected={exp} actual={sn} -> BookState::Stale -> resyncing"
                            );
                            c.seq_gaps.fetch_add(1, Ordering::Relaxed);
                            break;
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
                            let Some(price_s) = tr.get("price").and_then(json_exact_decimal_str)
                            else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(size_s) = tr.get("size").and_then(json_exact_decimal_str)
                            else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(side_s) = tr.get("side").and_then(Value::as_str) else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(time_s) = tr.get("time").and_then(Value::as_str) else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
                                continue;
                            };
                            let Some(ts_ns) = parse_rfc3339_utc_ns(time_s) else {
                                c.parse_errs.fetch_add(1, Ordering::Relaxed);
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
                            match parse_coinbase_trade(
                                inst,
                                None,
                                seq_num,
                                TimestampNs(ts_ns),
                                &price_s,
                                &size_s,
                                side_s,
                            ) {
                                Ok(tick) => {
                                    if producer.push(tick).is_err() {
                                        c.ring_drops.fetch_add(1, Ordering::Relaxed);
                                    } else {
                                        c.trades_ok.fetch_add(1, Ordering::Relaxed);
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[coinbase] parse err: {e}");
                                    c.parse_errs.fetch_add(1, Ordering::Relaxed);
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
}

#[tokio::main]
async fn main() -> ExitCode {
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

    let kc = Arc::new(KrakenCounters {
        trades_ok: AtomicU64::new(0),
        parse_errs: AtomicU64::new(0),
        ring_drops: AtomicU64::new(0),
        book_crc_ok: AtomicU64::new(0),
        book_crc_mismatches: AtomicU64::new(0),
        reconnects: AtomicU64::new(0),
    });
    let cc = Arc::new(CoinbaseCounters {
        trades_ok: AtomicU64::new(0),
        seq_gaps: AtomicU64::new(0),
        parse_errs: AtomicU64::new(0),
        ring_drops: AtomicU64::new(0),
        reconnects: AtomicU64::new(0),
    });

    let start = Instant::now();
    let deadline = start + Duration::from_secs(duration_secs);

    let k_handle = tokio::spawn(run_kraken_soak(k_prod, deadline, Arc::clone(&kc)));
    let c_handle = tokio::spawn(run_coinbase_soak(c_prod, deadline, Arc::clone(&cc)));

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

    let k_trades = kc.trades_ok.load(Ordering::Relaxed);
    let k_errs = kc.parse_errs.load(Ordering::Relaxed);
    let k_drops = kc.ring_drops.load(Ordering::Relaxed);
    let k_crc_ok = kc.book_crc_ok.load(Ordering::Relaxed);
    let k_crc_bad = kc.book_crc_mismatches.load(Ordering::Relaxed);
    let k_reconn = kc.reconnects.load(Ordering::Relaxed);
    let c_trades = cc.trades_ok.load(Ordering::Relaxed);
    let c_gaps = cc.seq_gaps.load(Ordering::Relaxed);
    let c_errs = cc.parse_errs.load(Ordering::Relaxed);
    let c_drops = cc.ring_drops.load(Ordering::Relaxed);
    let c_reconn = cc.reconnects.load(Ordering::Relaxed);
    let storage_drops = dispatcher.storage_dropped();

    let passed = k_trades > 0
        && c_trades > 0
        && k_crc_ok > 0
        && k_errs == 0
        && c_errs == 0
        && k_drops == 0
        && c_drops == 0
        && storage_drops == 0
        && k_crc_bad == 0
        && c_gaps == 0;

    let elapsed_ms = start.elapsed().as_millis();
    let summary = serde_json::json!({
        "passed": passed,
        "duration_secs": duration_secs,
        "elapsed_ms": elapsed_ms,
        "kraken_trades_parsed": k_trades,
        "kraken_parse_errors": k_errs,
        "kraken_ring_drops": k_drops,
        "kraken_book_crc_ok": k_crc_ok,
        "kraken_book_crc_mismatches": k_crc_bad,
        "kraken_reconnects": k_reconn,
        "coinbase_trades_parsed": c_trades,
        "coinbase_seq_gaps": c_gaps,
        "coinbase_parse_errors": c_errs,
        "coinbase_ring_drops": c_drops,
        "coinbase_reconnects": c_reconn,
        "dispatched_to_storage_ring": dispatched_total,
        "aggressor_buy_ticks": buy_count,
        "aggressor_sell_ticks": sell_count,
        "storage_drops": storage_drops,
        "serde_arbitrary_precision": true,
        "credentials_used": false,
        "live_armed": false
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&summary).unwrap_or_default()
    );

    if passed {
        ExitCode::SUCCESS
    } else {
        eprintln!("FAIL [UV-06]: Live soak failed one or more strict zero-error/zero-drop gates.");
        ExitCode::FAILURE
    }
}
