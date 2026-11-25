use crate::parsers::{kraken_book_crc32, parse_coinbase_trade, parse_kraken_trade};
use allegedly_core::{BookState, InstrumentId, NormalizedTick, ProvenanceTier, TimestampNs};
use futures_util::StreamExt;
use rtrb::Producer;
use serde::Deserialize;
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
    pub faults_detected: u32,
    pub resync_count: u32,
    pub max_resync_ms: u64,
    pub final_book_state: BookState,
    pub provenance_tier: ProvenanceTier,
    pub fault_events: Vec<FaultEvent>,
}

#[derive(Debug, Error)]
pub enum WsIngestError {
    #[error("websocket connect failed: {0}")]
    Connect(String),
    #[error("websocket read failed: {0}")]
    Read(String),
}

#[derive(Debug, Deserialize)]
struct KrakenEnvelope {
    channel: String,
    #[serde(default)]
    data: Vec<KrakenItem>,
}

#[derive(Debug, Deserialize)]
struct KrakenItem {
    #[serde(default)]
    price: Option<String>,
    #[serde(default)]
    qty: Option<String>,
    #[serde(default)]
    side: Option<String>,
    #[serde(default)]
    seq: Option<u64>,
    #[serde(default)]
    ts_ns: Option<i64>,
    #[serde(default)]
    asks: Vec<(String, String)>,
    #[serde(default)]
    bids: Vec<(String, String)>,
    #[serde(default)]
    checksum: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct CoinbaseEnvelope {
    channel: String,
    sequence_num: u64,
    #[serde(default)]
    price: Option<String>,
    #[serde(default)]
    size: Option<String>,
    #[serde(default)]
    side: Option<String>,
    #[serde(default)]
    ts_ns: Option<i64>,
}

/// Resilient WebSocket market data consumer feeding a single-producer rtrb ring (T09 / ADR-0006).
///
/// Fail-closed invariants:
/// - Kraken WS v2 CRC32 mismatch -> immediate `BookState::Stale` -> close + reconnect/resync (< 2 s).
/// - Coinbase AdvTrade WS `sequence_num` gap -> immediate `BookState::Stale` -> reconnect/resync,
///   with mandatory maker->taker side inversion (`"BUY"` -> Sell, `"SELL"` -> Buy).
pub async fn run_resilient_ws_session(
    url: &str,
    protocol: VenueProtocol,
    instrument_id: InstrumentId,
    producer: &mut Producer<NormalizedTick>,
    target_ticks: u64,
    max_reconnects: u32,
) -> Result<WsSessionStats, WsIngestError> {
    let mut stats = WsSessionStats {
        ticks_pushed: 0,
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

        let (_, mut read) = ws_stream.split();
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

            match protocol {
                VenueProtocol::KrakenV2 => {
                    let Ok(env) = serde_json::from_str::<KrakenEnvelope>(&txt) else {
                        continue;
                    };
                    if env.channel == "book" {
                        for item in &env.data {
                            if let Some(expected_crc) = item.checksum {
                                let asks_ref: Vec<(&str, &str)> = item
                                    .asks
                                    .iter()
                                    .map(|(p, q)| (p.as_str(), q.as_str()))
                                    .collect();
                                let bids_ref: Vec<(&str, &str)> = item
                                    .bids
                                    .iter()
                                    .map(|(p, q)| (p.as_str(), q.as_str()))
                                    .collect();
                                let computed = kraken_book_crc32(&asks_ref, &bids_ref);
                                if computed != expected_crc {
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
                        if fault_triggered {
                            break;
                        }
                    } else if env.channel == "trade" {
                        for item in &env.data {
                            if let (Some(p), Some(q), Some(s)) = (
                                item.price.as_deref(),
                                item.qty.as_deref(),
                                item.side.as_deref(),
                            ) && let Ok(tick) = parse_kraken_trade(
                                instrument_id,
                                item.seq.unwrap_or(stats.ticks_pushed + 1),
                                TimestampNs(item.ts_ns.unwrap_or(1_732_500_000_000_000_000)),
                                p,
                                q,
                                s,
                            ) {
                                let _ = producer.push(tick);
                                stats.ticks_pushed += 1;
                            }
                        }
                    }
                }
                VenueProtocol::CoinbaseAdvTrade => {
                    let Ok(env) = serde_json::from_str::<CoinbaseEnvelope>(&txt) else {
                        continue;
                    };
                    if env.channel == "market_trades"
                        && let (Some(p), Some(q), Some(s)) = (
                            env.price.as_deref(),
                            env.size.as_deref(),
                            env.side.as_deref(),
                        )
                    {
                        match parse_coinbase_trade(
                            instrument_id,
                            expected_cb_seq,
                            env.sequence_num,
                            TimestampNs(env.ts_ns.unwrap_or(1_732_500_000_000_000_000)),
                            p,
                            q,
                            s,
                        ) {
                            Ok(tick) => {
                                expected_cb_seq = Some(env.sequence_num + 1);
                                let _ = producer.push(tick);
                                stats.ticks_pushed += 1;
                            }
                            Err(err) => {
                                book_state = BookState::Stale;
                                stats.faults_detected += 1;
                                stats.fault_events.push(FaultEvent {
                                    book_state: BookState::Stale,
                                    reason: err.to_string(),
                                    reconnect_ms: 0,
                                });
                                fault_started = Some(Instant::now());
                                fault_triggered = true;
                                break;
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
