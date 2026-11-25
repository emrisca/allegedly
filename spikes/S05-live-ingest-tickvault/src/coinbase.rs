//! Coinbase Advanced Trade WS (`wss://advanced-trade-ws.coinbase.com/`) live adapter.
//!
//! - Channels: `level2` (`l2_data`), `market_trades`, `heartbeats` on `BTC-USD`, `ETH-USD`
//! - Zero `f64`: parses string decimals directly into exact `i64` (`1e-9`)
//! - Enforces `sequence_num` continuity across the connection
//! - **Inverts maker side to taker/aggressor side** (`"SELL"` -> Buy aggressor, `"BUY"` -> Sell aggressor)
//!   and cross-checks BOTH inverted and uninverted side against live L2 BBO!

use std::collections::HashMap;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::value::RawValue;
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::fixed_point::parse_decimal_e9;
use crate::model::{
    AggressorSide, AggressorSource, NormalizedTick, SYM_COINBASE_BTC_USD, SYM_COINBASE_ETH_USD,
    StaleReason, Venue, now_unix_ns,
};
use crate::orderbook::L2OrderBook;

pub const COINBASE_ADV_WS_URL: &str = "wss://advanced-trade-ws.coinbase.com/";

#[derive(Debug, Clone, Default)]
pub struct CoinbaseSoakStats {
    pub ws_messages_total: u64,
    pub trade_snapshot_ticks: u64,
    pub trade_live_ticks: u64,
    pub l2_snapshots: u64,
    pub l2_update_msgs: u64,
    pub l2_level_deltas: u64,
    pub heartbeats: u64,
    pub seq_checked: u64,
    pub seq_gaps: u64,
    pub resyncs_triggered: u64,
    pub parse_errors: u64,
    pub channel_drops: u64,
    /// Empirical proof of maker->taker inversion against live non-crossed BBO
    pub bbo_checked: u64,
    pub inverted_strict_aligned: u64,
    pub inverted_midpoint_aligned: u64,
    pub uninverted_strict_aligned: u64,
    pub uninverted_midpoint_aligned: u64,
    pub bbo_buy_count: u64,
    pub bbo_sell_count: u64,
    pub parse_latencies_ns: Vec<u64>,
    pub exchange_to_recv_latencies_ms: Vec<f64>,
}

#[derive(Debug, Deserialize)]
struct CoinbaseEnvelope<'a> {
    #[serde(default)]
    channel: Option<&'a str>,
    #[serde(default)]
    sequence_num: Option<u64>,
    #[serde(borrow, default)]
    events: Option<&'a RawValue>,
}

#[derive(Debug, Deserialize)]
struct CoinbaseTradeEvent<'a> {
    #[serde(rename = "type")]
    event_type: &'a str,
    #[serde(borrow, default)]
    trades: Vec<CoinbaseTradeItem<'a>>,
}

#[derive(Debug, Deserialize)]
struct CoinbaseTradeItem<'a> {
    product_id: &'a str,
    trade_id: &'a str,
    price: &'a str,
    size: &'a str,
    time: &'a str,
    side: &'a str,
}

#[derive(Debug, Deserialize)]
struct CoinbaseL2Event<'a> {
    #[serde(rename = "type")]
    event_type: &'a str,
    product_id: &'a str,
    #[serde(borrow, default)]
    updates: Vec<CoinbaseL2Update<'a>>,
}

#[derive(Debug, Deserialize)]
struct CoinbaseL2Update<'a> {
    side: &'a str,
    price_level: &'a str,
    new_quantity: &'a str,
}

/// Coinbase Advanced Trade `market_trades` `side` reports the **maker's** resting order side:
/// - `"SELL"` (resting ask lifted) => **Buy** aggressor
/// - `"BUY"`  (resting bid hit)    => **Sell** aggressor
pub fn normalize_coinbase_maker_side(maker_side: &str) -> (AggressorSide, AggressorSource) {
    match maker_side {
        "SELL" | "sell" => (AggressorSide::Buy, AggressorSource::ExchangeReportedInverted),
        "BUY" | "buy" => (AggressorSide::Sell, AggressorSource::ExchangeReportedInverted),
        _ => (AggressorSide::Unknown, AggressorSource::None),
    }
}

fn raw_uninverted_side(maker_side: &str) -> AggressorSide {
    match maker_side {
        "BUY" | "buy" => AggressorSide::Buy,
        "SELL" | "sell" => AggressorSide::Sell,
        _ => AggressorSide::Unknown,
    }
}

fn product_to_id(prod: &str) -> Option<u16> {
    match prod {
        "BTC-USD" => Some(SYM_COINBASE_BTC_USD),
        "ETH-USD" => Some(SYM_COINBASE_ETH_USD),
        _ => None,
    }
}

fn parse_rfc3339_ns(ts: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .and_then(|dt| dt.timestamp_nanos_opt())
        .unwrap_or_else(now_unix_ns)
}

pub async fn run_coinbase_soak(
    duration: Duration,
    tx: mpsc::Sender<NormalizedTick>,
) -> Result<CoinbaseSoakStats, Box<dyn std::error::Error + Send + Sync>> {
    let mut stats = CoinbaseSoakStats::default();
    let mut books: HashMap<String, L2OrderBook> = HashMap::new();
    books.insert("BTC-USD".into(), L2OrderBook::new("BTC-USD", None));
    books.insert("ETH-USD".into(), L2OrderBook::new("ETH-USD", None));

    let (ws_stream, _resp) = connect_async(COINBASE_ADV_WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();

    let products = ["BTC-USD", "ETH-USD"];
    for channel in ["level2", "market_trades", "heartbeats"] {
        let sub = serde_json::json!({
            "type": "subscribe",
            "product_ids": products,
            "channel": channel,
        });
        write.send(Message::Text(sub.to_string().into())).await?;
    }

    let deadline = tokio::time::Instant::now() + duration;
    let mut expected_seq: Option<u64> = None;
    let mut local_seq: HashMap<u16, u64> = HashMap::new();

    loop {
        let now = tokio::time::Instant::now();
        if now >= deadline {
            break;
        }
        let remaining = deadline - now;
        let next = tokio::time::timeout(remaining, read.next()).await;
        let msg = match next {
            Ok(Some(Ok(m))) => m,
            Ok(Some(Err(e))) => return Err(Box::new(e)),
            Ok(None) => break,
            Err(_) => break,
        };

        match msg {
            Message::Text(txt) => {
                let parse_start = Instant::now();
                let recv_ns = now_unix_ns();
                stats.ws_messages_total += 1;

                let env: CoinbaseEnvelope<'_> = match serde_json::from_str(&txt) {
                    Ok(e) => e,
                    Err(_) => {
                        stats.parse_errors += 1;
                        continue;
                    }
                };

                // Verify sequence_num monotonicity across connection
                if let Some(seq_num) = env.sequence_num {
                    stats.seq_checked += 1;
                    if let Some(exp) = expected_seq
                        && seq_num != exp
                    {
                        stats.seq_gaps += 1;
                        stats.resyncs_triggered += 1;
                        for b in books.values_mut() {
                            b.invalidate(StaleReason::SequenceGap {
                                expected: exp,
                                got: seq_num,
                            });
                        }
                        let unsub = serde_json::json!({
                            "type": "unsubscribe",
                            "product_ids": products,
                            "channel": "level2",
                        });
                        let resub = serde_json::json!({
                            "type": "subscribe",
                            "product_ids": products,
                            "channel": "level2",
                        });
                        let _ = write.send(Message::Text(unsub.to_string().into())).await;
                        let _ = write.send(Message::Text(resub.to_string().into())).await;
                    }
                    expected_seq = Some(seq_num + 1);
                }

                match env.channel {
                    Some("heartbeats") => {
                        stats.heartbeats += 1;
                    }
                    Some("l2_data") => {
                        let Some(raw_ev) = env.events else { continue };
                        let events: Vec<CoinbaseL2Event<'_>> =
                            match serde_json::from_str(raw_ev.get()) {
                                Ok(v) => v,
                                Err(_) => {
                                    stats.parse_errors += 1;
                                    continue;
                                }
                            };

                        for ev in events {
                            let Some(book) = books.get_mut(ev.product_id) else {
                                continue;
                            };
                            if ev.event_type == "snapshot" {
                                let mut bids = Vec::new();
                                let mut asks = Vec::new();
                                for u in &ev.updates {
                                    let (Ok(p), Ok(q)) = (
                                        parse_decimal_e9(u.price_level),
                                        parse_decimal_e9(u.new_quantity),
                                    ) else {
                                        stats.parse_errors += 1;
                                        continue;
                                    };
                                    match u.side {
                                        "bid" => bids.push((p, q, String::new(), String::new())),
                                        "offer" | "ask" => {
                                            asks.push((p, q, String::new(), String::new()))
                                        }
                                        _ => {}
                                    }
                                }
                                book.apply_snapshot(bids, asks);
                                stats.l2_snapshots += 1;
                            } else if ev.event_type == "update" {
                                if !book.is_live() {
                                    continue;
                                }
                                for u in &ev.updates {
                                    let (Ok(p), Ok(q)) = (
                                        parse_decimal_e9(u.price_level),
                                        parse_decimal_e9(u.new_quantity),
                                    ) else {
                                        stats.parse_errors += 1;
                                        continue;
                                    };
                                    stats.l2_level_deltas += 1;
                                    match u.side {
                                        "bid" => {
                                            book.apply_bid_delta(p, q, String::new(), String::new())
                                        }
                                        "offer" | "ask" => {
                                            book.apply_ask_delta(p, q, String::new(), String::new())
                                        }
                                        _ => {}
                                    }
                                }
                                book.finish_delta();
                                stats.l2_update_msgs += 1;
                            }
                        }
                        stats
                            .parse_latencies_ns
                            .push(parse_start.elapsed().as_nanos() as u64);
                    }
                    Some("market_trades") => {
                        let Some(raw_ev) = env.events else { continue };
                        let events: Vec<CoinbaseTradeEvent<'_>> =
                            match serde_json::from_str(raw_ev.get()) {
                                Ok(v) => v,
                                Err(_) => {
                                    stats.parse_errors += 1;
                                    continue;
                                }
                            };

                        for ev in events {
                            let is_live = ev.event_type == "update";
                            // Coinbase `market_trades` events can arrive in reverse chronological
                            // order within a single batch; iterate chronologically by trade_id/time
                            for t in ev.trades.iter().rev() {
                                let Some(sym_id) = product_to_id(t.product_id) else {
                                    continue;
                                };
                                let (Ok(price_e9), Ok(qty_e9)) =
                                    (parse_decimal_e9(t.price), parse_decimal_e9(t.size))
                                else {
                                    stats.parse_errors += 1;
                                    continue;
                                };

                                let (inv_side, source) = normalize_coinbase_maker_side(t.side);
                                let raw_side = raw_uninverted_side(t.side);
                                let ts_exch = parse_rfc3339_ns(t.time);
                                let trade_id = t.trade_id.parse::<u64>().unwrap_or(0);

                                let (best_bid_e9, best_ask_e9) = books
                                    .get(t.product_id)
                                    .map(|b| b.bbo_prices())
                                    .unwrap_or((0, 0));

                                if is_live {
                                    stats.trade_live_ticks += 1;
                                    let latency_ms = (recv_ns - ts_exch) as f64 / 1_000_000.0;
                                    stats.exchange_to_recv_latencies_ms.push(latency_ms);

                                    if best_bid_e9 > 0
                                        && best_ask_e9 > 0
                                        && best_bid_e9 < best_ask_e9
                                    {
                                        stats.bbo_checked += 1;
                                        let two_p = (price_e9 as i128) * 2;
                                        let bid_plus_ask =
                                            (best_bid_e9 as i128) + (best_ask_e9 as i128);

                                        match inv_side {
                                            AggressorSide::Buy => {
                                                stats.bbo_buy_count += 1;
                                                if price_e9 >= best_ask_e9 {
                                                    stats.inverted_strict_aligned += 1;
                                                }
                                                if two_p > bid_plus_ask {
                                                    stats.inverted_midpoint_aligned += 1;
                                                }
                                            }
                                            AggressorSide::Sell => {
                                                stats.bbo_sell_count += 1;
                                                if price_e9 <= best_bid_e9 {
                                                    stats.inverted_strict_aligned += 1;
                                                }
                                                if two_p < bid_plus_ask {
                                                    stats.inverted_midpoint_aligned += 1;
                                                }
                                            }
                                            AggressorSide::Unknown => {}
                                        }

                                        match raw_side {
                                            AggressorSide::Buy => {
                                                if price_e9 >= best_ask_e9 {
                                                    stats.uninverted_strict_aligned += 1;
                                                }
                                                if two_p > bid_plus_ask {
                                                    stats.uninverted_midpoint_aligned += 1;
                                                }
                                            }
                                            AggressorSide::Sell => {
                                                if price_e9 <= best_bid_e9 {
                                                    stats.uninverted_strict_aligned += 1;
                                                }
                                                if two_p < bid_plus_ask {
                                                    stats.uninverted_midpoint_aligned += 1;
                                                }
                                            }
                                            AggressorSide::Unknown => {}
                                        }
                                    }
                                } else {
                                    stats.trade_snapshot_ticks += 1;
                                }

                                let seq = local_seq
                                    .entry(sym_id)
                                    .and_modify(|s| *s += 1)
                                    .or_insert(1);

                                let tick = NormalizedTick {
                                    ts_exchange_ns: ts_exch,
                                    ts_recv_ns: recv_ns,
                                    price_e9,
                                    qty_e9,
                                    trade_id,
                                    seq: *seq,
                                    best_bid_e9: if is_live { best_bid_e9 } else { 0 },
                                    best_ask_e9: if is_live { best_ask_e9 } else { 0 },
                                    symbol_id: sym_id,
                                    venue: Venue::CoinbaseAdvTrade,
                                    aggressor_side: inv_side,
                                    aggressor_source: source,
                                };

                                if is_live && tx.try_send(tick).is_err() {
                                    stats.channel_drops += 1;
                                }
                            }
                        }
                        stats
                            .parse_latencies_ns
                            .push(parse_start.elapsed().as_nanos() as u64);
                    }
                    _ => {}
                }
            }
            Message::Ping(p) => {
                let _ = write.send(Message::Pong(p)).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let _ = write.send(Message::Close(None)).await;
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coinbase_side_inverts_maker_to_aggressor() {
        // Maker SELL (resting ask lifted) -> Aggressor BUY
        assert_eq!(
            normalize_coinbase_maker_side("SELL"),
            (AggressorSide::Buy, AggressorSource::ExchangeReportedInverted)
        );
        // Maker BUY (resting bid hit) -> Aggressor SELL
        assert_eq!(
            normalize_coinbase_maker_side("BUY"),
            (
                AggressorSide::Sell,
                AggressorSource::ExchangeReportedInverted
            )
        );
    }
}
