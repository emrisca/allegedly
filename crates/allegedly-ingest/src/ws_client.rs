use crate::parsers::{kraken_book_crc32, parse_coinbase_trade, parse_kraken_trade};
use allegedly_core::{BookState, InstrumentId, NormalizedTick, ProvenanceTier, TimestampNs};
use futures_util::{SinkExt, StreamExt};
use rtrb::Producer;
use serde_json::Value;
use std::time::{Duration, Instant};
use thiserror::Error;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VenueProtocol {
    KrakenV2,
    CoinbaseAdvTrade,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FaultEvent {
    pub book_state: BookState,
    pub reason: String,
    pub reconnect_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WsSessionStats {
    pub ticks_pushed: u64,
    pub parse_errors: u64,
    pub ring_drops: u64,
    pub faults_detected: u32,
    pub resync_count: u32,
    pub max_resync_ms: u64,
    pub final_book_state: BookState,
    pub provenance_tier: ProvenanceTier,
    pub fault_events: Vec<FaultEvent>,
}

#[derive(Debug, Error)]
pub enum WsIngestError {
    #[error("websocket connection failed: {0}")]
    Connect(String),
    #[error("websocket subscribe failed: {0}")]
    Subscribe(String),
}

/// Zero-float extraction of an exact ASCII decimal string from a `serde_json::Value`.
/// Requires `serde_json` `arbitrary_precision` so `Value::Number` preserves the exact wire string
/// without ever converting through IEEE-754 `f64` (SV-08 / RTSD-03).
pub fn json_exact_decimal_str(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Pure-integer RFC-3339 UTC timestamp parser (`YYYY-MM-DDTHH:MM:SS[.fffffffff]Z`) -> Unix nanoseconds.
/// Rejects malformed dates instead of fabricating a constant fallback timestamp (RTSD-10).
pub fn parse_rfc3339_utc_ns(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || (b[10] != b'T' && b[10] != b't') {
        return None;
    }
    if b[13] != b':' || b[16] != b':' {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let min: i64 = s.get(14..16)?.parse().ok()?;
    let sec: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || !(0..=23).contains(&hour)
        || !(0..=59).contains(&min)
        || !(0..=60).contains(&sec)
    {
        return None;
    }
    let rest = &s[19..];
    let (frac_ns, tz_part) = if let Some(after_dot) = rest.strip_prefix('.') {
        let end_digits = after_dot
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(after_dot.len());
        let digits = &after_dot[..end_digits];
        let mut ns: i64 = 0;
        let mut scale: i64 = 100_000_000;
        for ch in digits.bytes().take(9) {
            ns += i64::from(ch - b'0') * scale;
            scale /= 10;
        }
        (ns, &after_dot[end_digits..])
    } else {
        (0, rest)
    };
    if tz_part != "Z" && tz_part != "z" && tz_part != "+00:00" {
        return None;
    }

    // Howard Hinnant civil-from-days inverse: days since 1970-01-01 in exact integer math
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = month;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;

    let total_secs = days
        .checked_mul(86_400)?
        .checked_add(hour * 3_600 + min * 60 + sec)?;
    total_secs.checked_mul(1_000_000_000)?.checked_add(frac_ns)
}

fn extract_timestamp_ns(obj: &Value) -> Option<TimestampNs> {
    if let Some(ns) = obj.get("ts_ns").and_then(Value::as_i64)
        && ns > 0
    {
        return Some(TimestampNs(ns));
    }
    if let Some(ts_str) = obj
        .get("timestamp")
        .or_else(|| obj.get("time"))
        .and_then(Value::as_str)
    {
        return parse_rfc3339_utc_ns(ts_str).map(TimestampNs);
    }
    None
}

fn extract_book_levels(arr: Option<&Vec<Value>>) -> Vec<(String, String)> {
    let Some(items) = arr else {
        return Vec::new();
    };
    let mut out = Vec::with_capacity(items.len());
    for entry in items {
        if let Some(pair) = entry.as_array()
            && pair.len() >= 2
            && let (Some(p), Some(q)) = (
                json_exact_decimal_str(&pair[0]),
                json_exact_decimal_str(&pair[1]),
            )
        {
            out.push((p, q));
        } else if let Some(obj) = entry.as_object()
            && let (Some(p), Some(q)) = (
                obj.get("price").and_then(json_exact_decimal_str),
                obj.get("qty").and_then(json_exact_decimal_str),
            )
        {
            out.push((p, q));
        }
    }
    out
}

/// Resilient WebSocket market data consumer feeding a single-producer rtrb ring (T09 / ADR-0006).
///
/// Supports both real Kraken WS v2 (`trade` + `book` objects) & Coinbase AdvTrade (`events[].trades[]`)
/// schemas as well as deterministic loopback fault-injection fixtures.
///
/// Fail-closed invariants:
/// - Kraken WS v2 CRC32 mismatch -> immediate `BookState::Stale` -> close + reconnect/resync (< 2 s).
/// - Coinbase AdvTrade WS `sequence_num` gap -> immediate `BookState::Stale` -> reconnect/resync,
///   with mandatory maker->taker side inversion (`"BUY"` -> Sell, `"SELL"` -> Buy).
/// - SPSC ring full -> increments `ring_drops`, sets `BookState::Stale`, and records a `FaultEvent`.
/// - Missing/malformed timestamp -> rejected (`parse_errors += 1`), never fabricated.
pub async fn run_resilient_ws_session(
    url: &str,
    protocol: VenueProtocol,
    instrument_id: InstrumentId,
    producer: &mut Producer<NormalizedTick>,
    target_ticks: u64,
    max_reconnects: u32,
) -> Result<WsSessionStats, WsIngestError> {
    run_resilient_ws_session_with_subscribe(
        url,
        protocol,
        instrument_id,
        None,
        producer,
        target_ticks,
        max_reconnects,
    )
    .await
}

pub async fn run_resilient_ws_session_with_subscribe(
    url: &str,
    protocol: VenueProtocol,
    instrument_id: InstrumentId,
    subscribe_payload: Option<&str>,
    producer: &mut Producer<NormalizedTick>,
    target_ticks: u64,
    max_reconnects: u32,
) -> Result<WsSessionStats, WsIngestError> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut stats = WsSessionStats {
        ticks_pushed: 0,
        parse_errors: 0,
        ring_drops: 0,
        faults_detected: 0,
        resync_count: 0,
        max_resync_ms: 0,
        final_book_state: BookState::Disconnected,
        provenance_tier: ProvenanceTier::ExactTickAggr,
        fault_events: Vec::new(),
    };

    let mut attempts = 0u32;
    let mut fault_started: Option<Instant> = None;

    while stats.ticks_pushed < target_ticks && attempts <= max_reconnects {
        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| WsIngestError::Connect(e.to_string()))?;

        let (mut write, mut read) = ws_stream.split();
        if let Some(sub_msg) = subscribe_payload {
            write
                .send(Message::Text(sub_msg.to_string().into()))
                .await
                .map_err(|e| WsIngestError::Subscribe(e.to_string()))?;
        }

        let mut expected_cb_seq: Option<u64> = None;
        let mut book_state = BookState::Live;

        if let Some(started) = fault_started.take() {
            let elapsed_ms = started.elapsed().as_millis() as u64;
            stats.resync_count += 1;
            stats.max_resync_ms = stats.max_resync_ms.max(elapsed_ms);
            if let Some(last) = stats.fault_events.last_mut() {
                last.reconnect_ms = elapsed_ms;
            }
        }

        let mut fault_triggered = false;

        while let Some(msg_res) = read.next().await {
            let msg = match msg_res {
                Ok(m) => m,
                Err(_) => {
                    book_state = BookState::Disconnected;
                    fault_triggered = true;
                    break;
                }
            };
            let Message::Text(txt) = msg else {
                continue;
            };

            let Ok(env) = serde_json::from_str::<Value>(&txt) else {
                stats.parse_errors += 1;
                continue;
            };
            let Some(channel) = env.get("channel").and_then(Value::as_str) else {
                continue;
            };

            match protocol {
                VenueProtocol::KrakenV2 => {
                    if channel == "book" {
                        if let Some(data) = env.get("data").and_then(Value::as_array) {
                            for item in data {
                                if let Some(expected_crc) =
                                    item.get("checksum").and_then(Value::as_u64)
                                {
                                    let asks_owned = extract_book_levels(
                                        item.get("asks").and_then(Value::as_array),
                                    );
                                    let bids_owned = extract_book_levels(
                                        item.get("bids").and_then(Value::as_array),
                                    );
                                    let asks_ref: Vec<(&str, &str)> = asks_owned
                                        .iter()
                                        .map(|(p, q)| (p.as_str(), q.as_str()))
                                        .collect();
                                    let bids_ref: Vec<(&str, &str)> = bids_owned
                                        .iter()
                                        .map(|(p, q)| (p.as_str(), q.as_str()))
                                        .collect();
                                    let computed = kraken_book_crc32(&asks_ref, &bids_ref);
                                    if u64::from(computed) != expected_crc {
                                        book_state = BookState::Stale;
                                        stats.faults_detected += 1;
                                        stats.fault_events.push(FaultEvent {
                                            book_state: BookState::Stale,
                                            reason: format!(
                                                "kraken_crc32_mismatch expected={expected_crc} computed={computed}"
                                            ),
                                            reconnect_ms: 0,
                                        });
                                        fault_started = Some(Instant::now());
                                        fault_triggered = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if fault_triggered {
                            break;
                        }
                    } else if channel == "trade"
                        && let Some(data) = env.get("data").and_then(Value::as_array)
                    {
                        for item in data {
                            let Some(p) = item.get("price").and_then(json_exact_decimal_str) else {
                                stats.parse_errors += 1;
                                continue;
                            };
                            let Some(q) = item.get("qty").and_then(json_exact_decimal_str) else {
                                stats.parse_errors += 1;
                                continue;
                            };
                            let Some(s) = item.get("side").and_then(Value::as_str) else {
                                stats.parse_errors += 1;
                                continue;
                            };
                            let Some(ts_ns) = extract_timestamp_ns(item) else {
                                stats.parse_errors += 1;
                                continue;
                            };
                            let seq = item
                                .get("trade_id")
                                .or_else(|| item.get("seq"))
                                .and_then(Value::as_u64)
                                .unwrap_or(stats.ticks_pushed + 1);
                            match parse_kraken_trade(instrument_id, seq, ts_ns, &p, &q, s) {
                                Ok(tick) => {
                                    if producer.push(tick).is_err() {
                                        stats.ring_drops += 1;
                                        book_state = BookState::Stale;
                                        stats.faults_detected += 1;
                                        stats.fault_events.push(FaultEvent {
                                            book_state: BookState::Stale,
                                            reason: "spsc_ring_saturated".into(),
                                            reconnect_ms: 0,
                                        });
                                    } else {
                                        stats.ticks_pushed += 1;
                                    }
                                }
                                Err(_) => {
                                    stats.parse_errors += 1;
                                }
                            }
                        }
                    }
                }
                VenueProtocol::CoinbaseAdvTrade => {
                    let Some(seq_num) = env.get("sequence_num").and_then(Value::as_u64) else {
                        continue;
                    };
                    if let Some(exp) = expected_cb_seq
                        && seq_num != exp
                    {
                        book_state = BookState::Stale;
                        stats.faults_detected += 1;
                        stats.fault_events.push(FaultEvent {
                            book_state: BookState::Stale,
                            reason: format!(
                                "coinbase_sequence_gap expected={exp} actual={seq_num}"
                            ),
                            reconnect_ms: 0,
                        });
                        fault_started = Some(Instant::now());
                        fault_triggered = true;
                        break;
                    }
                    expected_cb_seq = Some(seq_num.saturating_add(1));

                    if channel != "market_trades" {
                        continue;
                    }

                    // Support both real Coinbase AdvTrade `events[].trades[]` AND flat test envelopes
                    let mut raw_trades: Vec<&Value> = Vec::new();
                    if let Some(events) = env.get("events").and_then(Value::as_array) {
                        for ev in events {
                            if let Some(trades) = ev.get("trades").and_then(Value::as_array) {
                                for tr in trades {
                                    raw_trades.push(tr);
                                }
                            }
                        }
                    } else if env.get("price").is_some() {
                        raw_trades.push(&env);
                    }

                    for tr in raw_trades {
                        let Some(p) = tr.get("price").and_then(json_exact_decimal_str) else {
                            stats.parse_errors += 1;
                            continue;
                        };
                        let Some(q) = tr.get("size").and_then(json_exact_decimal_str) else {
                            stats.parse_errors += 1;
                            continue;
                        };
                        let Some(s) = tr.get("side").and_then(Value::as_str) else {
                            stats.parse_errors += 1;
                            continue;
                        };
                        let Some(ts_ns) =
                            extract_timestamp_ns(tr).or_else(|| extract_timestamp_ns(&env))
                        else {
                            stats.parse_errors += 1;
                            continue;
                        };
                        match parse_coinbase_trade(instrument_id, None, seq_num, ts_ns, &p, &q, s) {
                            Ok(tick) => {
                                if producer.push(tick).is_err() {
                                    stats.ring_drops += 1;
                                    book_state = BookState::Stale;
                                    stats.faults_detected += 1;
                                    stats.fault_events.push(FaultEvent {
                                        book_state: BookState::Stale,
                                        reason: "spsc_ring_saturated".into(),
                                        reconnect_ms: 0,
                                    });
                                } else {
                                    stats.ticks_pushed += 1;
                                }
                            }
                            Err(_) => {
                                stats.parse_errors += 1;
                            }
                        }
                    }
                }
            }

            if stats.ticks_pushed >= target_ticks {
                break;
            }
        }

        stats.final_book_state = book_state;
        if !fault_triggered || stats.ticks_pushed >= target_ticks {
            break;
        }

        attempts += 1;
        tokio::time::sleep(Duration::from_millis(15)).await;
    }

    Ok(stats)
}
