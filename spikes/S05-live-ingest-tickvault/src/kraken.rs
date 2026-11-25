//! Kraken Spot WS v2 (`wss://ws.kraken.com/v2`) live adapter.
//!
//! - Channels: `trade` + `book` (depth=25) on `BTC/USD`, `ETH/USD`
//! - Zero `f64`: parses JSON numbers directly from `serde_json::value::RawValue`
//! - Verifies Kraken CRC32 L2 checksum on every snapshot & update
//! - Direct aggressor side (`"buy"` -> Buy, `"sell"` -> Sell)

use std::collections::HashMap;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::value::RawValue;
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::fixed_point::parse_json_raw_decimal_e9;
use crate::model::{
    AggressorSide, AggressorSource, NormalizedTick, SYM_KRAKEN_BTC_USD, SYM_KRAKEN_ETH_USD, Venue,
    now_unix_ns,
};
use crate::orderbook::L2OrderBook;

pub const KRAKEN_WS_V2_URL: &str = "wss://ws.kraken.com/v2";

#[derive(Debug, Clone, Default)]
pub struct KrakenSoakStats {
    pub ws_messages_total: u64,
    pub trade_snapshot_ticks: u64,
    pub trade_live_ticks: u64,
    pub book_snapshots: u64,
    pub book_updates: u64,
    pub heartbeats: u64,
    pub crc_passed: u64,
    pub crc_failed: u64,
    pub resyncs_triggered: u64,
    pub parse_errors: u64,
    pub channel_drops: u64,
    /// Live trade aggressor-vs-BBO checks (non-crossed live book)
    pub bbo_checked: u64,
    pub bbo_strict_aligned: u64,
    pub bbo_midpoint_aligned: u64,
    pub bbo_buy_count: u64,
    pub bbo_sell_count: u64,
    pub parse_latencies_ns: Vec<u64>,
    pub exchange_to_recv_latencies_ms: Vec<f64>,
}

#[derive(Debug, Deserialize)]
struct KrakenEnvelope<'a> {
    #[serde(default)]
    channel: Option<&'a str>,
    #[serde(rename = "type", default)]
    msg_type: Option<&'a str>,
    #[serde(borrow, default)]
    data: Option<&'a RawValue>,
}

#[derive(Debug, Deserialize)]
struct KrakenTradeItem<'a> {
    symbol: &'a str,
    side: &'a str,
    #[serde(borrow)]
    price: &'a RawValue,
    #[serde(borrow)]
    qty: &'a RawValue,
    trade_id: u64,
    timestamp: &'a str,
}

#[derive(Debug, Deserialize)]
struct KrakenBookLevelRaw<'a> {
    #[serde(borrow)]
    price: &'a RawValue,
    #[serde(borrow)]
    qty: &'a RawValue,
}

#[derive(Debug, Deserialize)]
struct KrakenBookItem<'a> {
    symbol: &'a str,
    #[serde(borrow, default)]
    bids: Vec<KrakenBookLevelRaw<'a>>,
    #[serde(borrow, default)]
    asks: Vec<KrakenBookLevelRaw<'a>>,
    checksum: Option<u32>,
}

pub fn normalize_kraken_side(side: &str) -> (AggressorSide, AggressorSource) {
    match side {
        "buy" | "BUY" => (AggressorSide::Buy, AggressorSource::ExchangeReported),
        "sell" | "SELL" => (AggressorSide::Sell, AggressorSource::ExchangeReported),
        _ => (AggressorSide::Unknown, AggressorSource::None),
    }
}

fn symbol_to_id(sym: &str) -> Option<u16> {
    match sym {
        "BTC/USD" => Some(SYM_KRAKEN_BTC_USD),
        "ETH/USD" => Some(SYM_KRAKEN_ETH_USD),
        _ => None,
    }
}

fn parse_rfc3339_ns(ts: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .and_then(|dt| dt.timestamp_nanos_opt())
        .unwrap_or_else(now_unix_ns)
}

pub async fn run_kraken_soak(
    duration: Duration,
    depth: usize,
    tx: mpsc::Sender<NormalizedTick>,
) -> Result<KrakenSoakStats, Box<dyn std::error::Error + Send + Sync>> {
    let mut stats = KrakenSoakStats::default();
    let mut books: HashMap<String, L2OrderBook> = HashMap::new();
    books.insert("BTC/USD".into(), L2OrderBook::new("BTC/USD", Some(depth)));
    books.insert("ETH/USD".into(), L2OrderBook::new("ETH/USD", Some(depth)));

    let (ws_stream, _resp) = connect_async(KRAKEN_WS_V2_URL).await?;
    let (mut write, mut read) = ws_stream.split();

    // Subscribe to book first so BBO is warm immediately, then trade
    let sub_book = serde_json::json!({
        "method": "subscribe",
        "params": {
            "channel": "book",
            "symbol": ["BTC/USD", "ETH/USD"],
            "depth": depth,
            "snapshot": true
        }
    });
    let sub_trade = serde_json::json!({
        "method": "subscribe",
        "params": {
            "channel": "trade",
            "symbol": ["BTC/USD", "ETH/USD"],
            "snapshot": true
        }
    });
    write.send(Message::Text(sub_book.to_string().into())).await?;
    write.send(Message::Text(sub_trade.to_string().into())).await?;

    let deadline = tokio::time::Instant::now() + duration;
    let mut seq_counter: HashMap<u16, u64> = HashMap::new();

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

                let env: KrakenEnvelope<'_> = match serde_json::from_str(&txt) {
                    Ok(e) => e,
                    Err(_) => {
                        stats.parse_errors += 1;
                        continue;
                    }
                };

                match (env.channel, env.msg_type) {
                    (Some("heartbeat"), _) => {
                        stats.heartbeats += 1;
                    }
                    (Some("book"), Some(mtype)) => {
                        let Some(raw_data) = env.data else { continue };
                        let items: Vec<KrakenBookItem<'_>> =
                            match serde_json::from_str(raw_data.get()) {
                                Ok(v) => v,
                                Err(_) => {
                                    stats.parse_errors += 1;
                                    continue;
                                }
                            };

                        for item in items {
                            let Some(book) = books.get_mut(item.symbol) else {
                                continue;
                            };

                            if mtype == "snapshot" {
                                let mut bids = Vec::with_capacity(item.bids.len());
                                for b in &item.bids {
                                    let rp = b.price.get().to_string();
                                    let rq = b.qty.get().to_string();
                                    if let (Ok(p), Ok(q)) = (
                                        parse_json_raw_decimal_e9(&rp),
                                        parse_json_raw_decimal_e9(&rq),
                                    ) {
                                        bids.push((p, q, rp, rq));
                                    }
                                }
                                let mut asks = Vec::with_capacity(item.asks.len());
                                for a in &item.asks {
                                    let rp = a.price.get().to_string();
                                    let rq = a.qty.get().to_string();
                                    if let (Ok(p), Ok(q)) = (
                                        parse_json_raw_decimal_e9(&rp),
                                        parse_json_raw_decimal_e9(&rq),
                                    ) {
                                        asks.push((p, q, rp, rq));
                                    }
                                }
                                book.apply_snapshot(bids, asks);
                                stats.book_snapshots += 1;
                            } else if mtype == "update" {
                                if !book.is_live() {
                                    continue;
                                }
                                for b in &item.bids {
                                    let rp = b.price.get().to_string();
                                    let rq = b.qty.get().to_string();
                                    if let (Ok(p), Ok(q)) = (
                                        parse_json_raw_decimal_e9(&rp),
                                        parse_json_raw_decimal_e9(&rq),
                                    ) {
                                        book.apply_bid_delta(p, q, rp, rq);
                                    }
                                }
                                for a in &item.asks {
                                    let rp = a.price.get().to_string();
                                    let rq = a.qty.get().to_string();
                                    if let (Ok(p), Ok(q)) = (
                                        parse_json_raw_decimal_e9(&rp),
                                        parse_json_raw_decimal_e9(&rq),
                                    ) {
                                        book.apply_ask_delta(p, q, rp, rq);
                                    }
                                }
                                book.finish_delta();
                                stats.book_updates += 1;
                            }

                            if let Some(expected_crc) = item.checksum {
                                if book.verify_kraken_checksum(expected_crc) {
                                    stats.crc_passed += 1;
                                } else {
                                    stats.crc_failed += 1;
                                    stats.resyncs_triggered += 1;
                                    let sym = item.symbol.to_string();
                                    let unsub = serde_json::json!({
                                        "method": "unsubscribe",
                                        "params": {"channel": "book", "symbol": [&sym], "depth": depth}
                                    });
                                    let resub = serde_json::json!({
                                        "method": "subscribe",
                                        "params": {"channel": "book", "symbol": [&sym], "depth": depth, "snapshot": true}
                                    });
                                    let _ = write.send(Message::Text(unsub.to_string().into())).await;
                                    let _ = write.send(Message::Text(resub.to_string().into())).await;
                                }
                            }
                        }
                        stats
                            .parse_latencies_ns
                            .push(parse_start.elapsed().as_nanos() as u64);
                    }
                    (Some("trade"), Some(mtype)) => {
                        let Some(raw_data) = env.data else { continue };
                        let items: Vec<KrakenTradeItem<'_>> =
                            match serde_json::from_str(raw_data.get()) {
                                Ok(v) => v,
                                Err(_) => {
                                    stats.parse_errors += 1;
                                    continue;
                                }
                            };

                        let is_live = mtype == "update";
                        for item in items {
                            let Some(sym_id) = symbol_to_id(item.symbol) else {
                                continue;
                            };
                            let (Ok(price_e9), Ok(qty_e9)) = (
                                parse_json_raw_decimal_e9(item.price.get()),
                                parse_json_raw_decimal_e9(item.qty.get()),
                            ) else {
                                stats.parse_errors += 1;
                                continue;
                            };

                            let (side, source) = normalize_kraken_side(item.side);
                            let ts_exch = parse_rfc3339_ns(item.timestamp);

                            let (best_bid_e9, best_ask_e9) = books
                                .get(item.symbol)
                                .map(|b| b.bbo_prices())
                                .unwrap_or((0, 0));

                            if is_live {
                                stats.trade_live_ticks += 1;
                                let latency_ms = (recv_ns - ts_exch) as f64 / 1_000_000.0;
                                stats.exchange_to_recv_latencies_ms.push(latency_ms);

                                if best_bid_e9 > 0 && best_ask_e9 > 0 && best_bid_e9 < best_ask_e9 {
                                    stats.bbo_checked += 1;
                                    let two_p = (price_e9 as i128) * 2;
                                    let bid_plus_ask = (best_bid_e9 as i128) + (best_ask_e9 as i128);
                                    match side {
                                        AggressorSide::Buy => {
                                            stats.bbo_buy_count += 1;
                                            if price_e9 >= best_ask_e9 {
                                                stats.bbo_strict_aligned += 1;
                                            }
                                            if two_p > bid_plus_ask {
                                                stats.bbo_midpoint_aligned += 1;
                                            }
                                        }
                                        AggressorSide::Sell => {
                                            stats.bbo_sell_count += 1;
                                            if price_e9 <= best_bid_e9 {
                                                stats.bbo_strict_aligned += 1;
                                            }
                                            if two_p < bid_plus_ask {
                                                stats.bbo_midpoint_aligned += 1;
                                            }
                                        }
                                        AggressorSide::Unknown => {}
                                    }
                                }
                            } else {
                                stats.trade_snapshot_ticks += 1;
                            }

                            let seq = seq_counter
                                .entry(sym_id)
                                .and_modify(|s| *s += 1)
                                .or_insert(1);

                            let tick = NormalizedTick {
                                ts_exchange_ns: ts_exch,
                                ts_recv_ns: recv_ns,
                                price_e9,
                                qty_e9,
                                trade_id: item.trade_id,
                                seq: *seq,
                                best_bid_e9: if is_live { best_bid_e9 } else { 0 },
                                best_ask_e9: if is_live { best_ask_e9 } else { 0 },
                                symbol_id: sym_id,
                                venue: Venue::KrakenSpot,
                                aggressor_side: side,
                                aggressor_source: source,
                            };

                            if is_live && tx.try_send(tick).is_err() {
                                stats.channel_drops += 1;
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
    fn kraken_side_is_direct_taker() {
        assert_eq!(
            normalize_kraken_side("buy"),
            (AggressorSide::Buy, AggressorSource::ExchangeReported)
        );
        assert_eq!(
            normalize_kraken_side("sell"),
            (AggressorSide::Sell, AggressorSource::ExchangeReported)
        );
    }
}
