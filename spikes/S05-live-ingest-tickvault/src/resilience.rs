//! Automated Reconnect, Sequence-Gap Detection, Exponential Backoff with Jitter,
//! and Bounded-Channel Backpressure Harness over real local TCP + WebSocket sockets.

use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, connect_async, tungstenite::Message};

use crate::fixed_point::parse_decimal_e9;
use crate::model::{
    AggressorSide, AggressorSource, BookState, NormalizedTick, SYM_SYNTHETIC_BTC_USD, StaleReason,
    Venue, now_unix_ns,
};
use crate::orderbook::L2OrderBook;

/// Deterministic or time-seeded xorshift64* PRNG for zero-dependency backoff jitter.
#[derive(Debug, Clone)]
pub struct ExponentialBackoff {
    pub base_ms: u64,
    pub max_ms: u64,
    pub attempt: u32,
    rng_state: u64,
}

impl ExponentialBackoff {
    pub fn new(base_ms: u64, max_ms: u64, seed: u64) -> Self {
        Self {
            base_ms,
            max_ms,
            attempt: 0,
            rng_state: if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed },
        }
    }

    pub fn reset(&mut self) {
        self.attempt = 0;
    }

    /// Full-jitter exponential backoff (`[base_ms/2, cap]`) bounded by `max_ms`.
    pub fn next_delay(&mut self) -> Duration {
        let exp = self.attempt.min(16);
        let raw_cap = self.base_ms.saturating_mul(1_u64 << exp).min(self.max_ms);
        self.attempt = self.attempt.saturating_add(1);

        // xorshift64*
        let mut x = self.rng_state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.rng_state = x;
        let rnd = x.wrapping_mul(0x2545_F491_4F6C_DD1D);

        // Equal-jitter: half deterministic exponential + half random in [0, half]
        let half = (raw_cap / 2).max(1);
        let jitter = rnd % (half + 1);
        Duration::from_millis(half + jitter)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResilienceReport {
    pub gap_detected: bool,
    pub stale_entered_on_gap: bool,
    pub gap_resync_ms: f64,
    pub tcp_drop_detected: bool,
    pub stale_entered_on_drop: bool,
    pub backoff_delays_ms: Vec<u64>,
    pub reconnect_attempts: u32,
    pub drop_resync_ms: f64,
    pub final_book_live: bool,
    pub silent_corruptions: u64,
    pub backpressure_total_sent: u64,
    pub backpressure_received: u64,
    pub backpressure_dropped: u64,
    pub backpressure_max_queue_bound: usize,
    pub backpressure_stale_signaled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct MockWsMsg {
    seq: u64,
    msg_type: String,
    bid: String,
    bid_qty: String,
    ask: String,
    ask_qty: String,
}

/// Runs the end-to-end TCP/WS sequence-gap + abrupt-drop + exponential-backoff
/// + bounded-channel backpressure harness.
pub async fn run_resilience_harness()
-> Result<ResilienceReport, Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let url = format!("ws://{addr}");

    // Spawn mock exchange server:
    // Conn 0: sends snapshot(seq=0), update(seq=1), then GAP jump to seq=5 (client should detect gap & reconnect)
    // Conn 1: sends fresh snapshot(seq=10), update(seq=11), then ABRUPTLY drops TCP socket
    // Conn 2: rejects immediately (TCP drop before WS handshake) -> exercises backoff attempt #1
    // Conn 3: rejects immediately -> exercises backoff attempt #2
    // Conn 4: sends fresh snapshot(seq=20), update(seq=21) -> clean final live state!
    let server_handle = tokio::spawn(async move {
        // Conn 0: sequence gap
        if let Ok((stream, _)) = listener.accept().await
            && let Ok(mut ws) = accept_async(stream).await
        {
            let msgs = [
                MockWsMsg {
                    seq: 0,
                    msg_type: "snapshot".into(),
                    bid: "59300.00".into(),
                    bid_qty: "1.0".into(),
                    ask: "59301.00".into(),
                    ask_qty: "1.0".into(),
                },
                MockWsMsg {
                    seq: 1,
                    msg_type: "update".into(),
                    bid: "59300.50".into(),
                    bid_qty: "2.0".into(),
                    ask: "59301.00".into(),
                    ask_qty: "1.0".into(),
                },
                // Injected sequence gap: expected 2, got 5!
                MockWsMsg {
                    seq: 5,
                    msg_type: "update".into(),
                    bid: "59399.00".into(), // corrupted jump that MUST NOT be applied!
                    bid_qty: "9.0".into(),
                    ask: "59400.00".into(),
                    ask_qty: "9.0".into(),
                },
            ];
            for m in msgs {
                let _ = ws
                    .send(Message::Text(serde_json::to_string(&m).unwrap().into()))
                    .await;
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            let _ = ws.close(None).await;
        }

        // Conn 1: fresh snapshot after gap, then abrupt TCP drop without Close frame
        if let Ok((stream, _)) = listener.accept().await
            && let Ok(mut ws) = accept_async(stream).await
        {
            let msgs = [
                MockWsMsg {
                    seq: 10,
                    msg_type: "snapshot".into(),
                    bid: "59302.00".into(),
                    bid_qty: "1.5".into(),
                    ask: "59303.00".into(),
                    ask_qty: "1.5".into(),
                },
                MockWsMsg {
                    seq: 11,
                    msg_type: "update".into(),
                    bid: "59302.50".into(),
                    bid_qty: "1.8".into(),
                    ask: "59303.00".into(),
                    ask_qty: "1.5".into(),
                },
            ];
            for m in msgs {
                let _ = ws
                    .send(Message::Text(serde_json::to_string(&m).unwrap().into()))
                    .await;
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            // Abrupt drop!
            drop(ws);
        }

        // Conn 2 & 3: immediate drop before WS upgrade to exercise multi-step exponential backoff
        for _ in 0..2 {
            if let Ok((stream, _)) = listener.accept().await {
                drop(stream);
            }
        }

        // Conn 4: clean reconnect + fresh snapshot + steady update
        if let Ok((stream, _)) = listener.accept().await
            && let Ok(mut ws) = accept_async(stream).await
        {
            let msgs = [
                MockWsMsg {
                    seq: 20,
                    msg_type: "snapshot".into(),
                    bid: "59305.00".into(),
                    bid_qty: "3.0".into(),
                    ask: "59306.00".into(),
                    ask_qty: "3.0".into(),
                },
                MockWsMsg {
                    seq: 21,
                    msg_type: "update".into(),
                    bid: "59305.25".into(),
                    bid_qty: "3.5".into(),
                    ask: "59306.00".into(),
                    ask_qty: "3.0".into(),
                },
            ];
            for m in msgs {
                let _ = ws
                    .send(Message::Text(serde_json::to_string(&m).unwrap().into()))
                    .await;
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            let _ = ws.close(None).await;
        }
    });

    let mut book = L2OrderBook::new("SYN-BTC-USD", Some(25));
    let mut backoff = ExponentialBackoff::new(20, 500, 0xA11E_6ED1_505);

    let mut gap_detected = false;
    let mut stale_entered_on_gap = false;
    let mut gap_resync_start: Option<Instant> = None;
    let mut gap_resync_ms = 0.0;

    let mut tcp_drop_detected = false;
    let mut stale_entered_on_drop = false;
    let mut drop_resync_start: Option<Instant> = None;
    let mut drop_resync_ms = 0.0;

    let mut backoff_delays_ms: Vec<u64> = Vec::new();
    let mut reconnect_attempts: u32 = 0;
    let mut silent_corruptions: u64 = 0;
    let mut phase = 0_u8; // 0=before gap, 1=after gap before drop, 2=after drop recovered

    while phase < 3 {
        let conn = connect_async(&url).await;
        let ws_stream = match conn {
            Ok((stream, _)) => {
                backoff.reset();
                stream
            }
            Err(_) => {
                reconnect_attempts += 1;
                let d = backoff.next_delay();
                backoff_delays_ms.push(d.as_millis() as u64);
                tokio::time::sleep(d).await;
                continue;
            }
        };

        let (_write, mut read) = ws_stream.split();
        let mut expected_seq: Option<u64> = None;
        let mut trigger_gap_resync = false;

        while let Some(item) = read.next().await {
            match item {
                Ok(Message::Text(txt)) => {
                    let m: MockWsMsg = serde_json::from_str(&txt)?;
                    if let Some(exp) = expected_seq
                        && m.seq != exp
                    {
                        gap_detected = true;
                        book.invalidate(StaleReason::SequenceGap {
                            expected: exp,
                            got: m.seq,
                        });
                        stale_entered_on_gap =
                            matches!(book.state, BookState::Stale(StaleReason::SequenceGap { .. }));
                        gap_resync_start = Some(Instant::now());
                        trigger_gap_resync = true;
                        break;
                    }
                    expected_seq = Some(m.seq + 1);

                    let b = parse_decimal_e9(&m.bid)?;
                    let bq = parse_decimal_e9(&m.bid_qty)?;
                    let a = parse_decimal_e9(&m.ask)?;
                    let aq = parse_decimal_e9(&m.ask_qty)?;

                    if m.msg_type == "snapshot" {
                        book.apply_snapshot(
                            vec![(b, bq, m.bid.clone(), m.bid_qty.clone())],
                            vec![(a, aq, m.ask.clone(), m.ask_qty.clone())],
                        );
                        if let Some(t0) = gap_resync_start.take() {
                            gap_resync_ms = t0.elapsed().as_secs_f64() * 1000.0;
                            phase = 1;
                        }
                        if let Some(t0) = drop_resync_start.take() {
                            drop_resync_ms = t0.elapsed().as_secs_f64() * 1000.0;
                            phase = 2;
                        }
                    } else if book.is_live() {
                        book.apply_bid_delta(b, bq, m.bid.clone(), m.bid_qty.clone());
                        book.apply_ask_delta(a, aq, m.ask.clone(), m.ask_qty.clone());
                        book.finish_delta();
                        if book.is_crossed() {
                            silent_corruptions += 1;
                        }
                    } else {
                        silent_corruptions += 1;
                    }
                }
                Ok(Message::Close(_)) => {
                    if phase == 2 {
                        phase = 3;
                    }
                    break;
                }
                Err(_) => {
                    // Abrupt TCP drop!
                    tcp_drop_detected = true;
                    book.invalidate(StaleReason::Disconnected);
                    stale_entered_on_drop =
                        matches!(book.state, BookState::Stale(StaleReason::Disconnected));
                    drop_resync_start = Some(Instant::now());
                    break;
                }
                _ => {}
            }
        }

        // If stream ended cleanly (EOF without Close frame during phase 1 -> abrupt TCP drop)
        if !trigger_gap_resync && phase == 1 && !tcp_drop_detected {
            tcp_drop_detected = true;
            book.invalidate(StaleReason::Disconnected);
            stale_entered_on_drop =
                matches!(book.state, BookState::Stale(StaleReason::Disconnected));
            drop_resync_start = Some(Instant::now());
        }

        if phase < 3 && !trigger_gap_resync {
            reconnect_attempts += 1;
            let d = backoff.next_delay();
            backoff_delays_ms.push(d.as_millis() as u64);
            tokio::time::sleep(d).await;
        }
    }

    let _ = server_handle.await;

    // Verify the corrupted gap delta (59399.00) was NEVER applied
    let final_bid = book.best_bid().map(|l| l.price_e9).unwrap_or(0);
    if final_bid != parse_decimal_e9("59305.25")? {
        silent_corruptions += 1;
    }

    // Part 2: Bounded Channel Backpressure Test (100,000 events into cap=1024 with slow consumer)
    let bound: usize = 1024;
    let total_burst: u64 = 100_000;
    let (tx, mut rx) = mpsc::channel::<NormalizedTick>(bound);
    let mut bp_book = L2OrderBook::new("SYN-BTC-USD", Some(25));
    bp_book.apply_snapshot(
        vec![(59_300_000_000_000, 1_000_000_000, "59300".into(), "1".into())],
        vec![(59_301_000_000_000, 1_000_000_000, "59301".into(), "1".into())],
    );

    let consumer = tokio::spawn(async move {
        let mut received = 0_u64;
        while let Some(_tick) = rx.recv().await {
            received += 1;
            if received % 256 == 0 {
                // Simulate intentionally slow downstream consumer
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
        }
        received
    });

    let mut dropped = 0_u64;
    let mut stale_signaled = false;
    let base_ns = now_unix_ns();
    for i in 0..total_burst {
        let tick = NormalizedTick {
            ts_exchange_ns: base_ns + (i as i64) * 1_000,
            ts_recv_ns: base_ns + (i as i64) * 1_000,
            price_e9: 59_300_000_000_000,
            qty_e9: 100_000_000,
            trade_id: i,
            seq: i + 1,
            best_bid_e9: 59_300_000_000_000,
            best_ask_e9: 59_301_000_000_000,
            symbol_id: SYM_SYNTHETIC_BTC_USD,
            venue: Venue::Synthetic,
            aggressor_side: AggressorSide::Buy,
            aggressor_source: AggressorSource::ExchangeReported,
        };
        if tx.try_send(tick).is_err() {
            dropped += 1;
            if !stale_signaled {
                bp_book.invalidate(StaleReason::BackpressureDrop);
                stale_signaled =
                    matches!(bp_book.state, BookState::Stale(StaleReason::BackpressureDrop));
            }
        }
    }
    drop(tx);
    let received = consumer.await?;

    Ok(ResilienceReport {
        gap_detected,
        stale_entered_on_gap,
        gap_resync_ms,
        tcp_drop_detected,
        stale_entered_on_drop,
        backoff_delays_ms,
        reconnect_attempts,
        drop_resync_ms,
        final_book_live: book.is_live(),
        silent_corruptions,
        backpressure_total_sent: total_burst,
        backpressure_received: received,
        backpressure_dropped: dropped,
        backpressure_max_queue_bound: bound,
        backpressure_stale_signaled: stale_signaled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exponential_backoff_grows_and_respects_cap() {
        let mut b = ExponentialBackoff::new(50, 1000, 42);
        let d0 = b.next_delay().as_millis() as u64;
        let d1 = b.next_delay().as_millis() as u64;
        let d2 = b.next_delay().as_millis() as u64;
        let d10 = {
            for _ in 0..7 {
                b.next_delay();
            }
            b.next_delay().as_millis() as u64
        };
        assert!((25..=50).contains(&d0), "d0={d0}");
        assert!((50..=100).contains(&d1), "d1={d1}");
        assert!((100..=200).contains(&d2), "d2={d2}");
        assert!((500..=1000).contains(&d10), "d10={d10}");
    }

    #[tokio::test]
    async fn resilience_harness_passes_end_to_end() {
        let rep = run_resilience_harness().await.unwrap();
        assert!(rep.gap_detected);
        assert!(rep.stale_entered_on_gap);
        assert!(rep.gap_resync_ms < 2000.0);
        assert!(rep.tcp_drop_detected);
        assert!(rep.stale_entered_on_drop);
        assert!(rep.reconnect_attempts >= 3);
        assert!(rep.backoff_delays_ms.len() >= 3);
        assert!(rep.final_book_live);
        assert_eq!(rep.silent_corruptions, 0);
        assert_eq!(
            rep.backpressure_received + rep.backpressure_dropped,
            rep.backpressure_total_sent
        );
        assert!(rep.backpressure_dropped > 0);
        assert!(rep.backpressure_stale_signaled);
    }
}
