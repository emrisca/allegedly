use allegedly_core::{AggressorSide, BookState, InstrumentId};
use allegedly_ingest::{
    CoreEventDispatcher, DEFAULT_RING_CAP, SyntheticSimProvider, VenueProtocol, kraken_book_crc32,
    run_resilient_ws_session,
};
use futures_util::SinkExt;
use rtrb::RingBuffer;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn kraken_v2_loopback_crc32_mismatch_triggers_stale_and_resyncs_under_2s() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let conn_count = Arc::new(AtomicUsize::new(0));
    let conn_clone = Arc::clone(&conn_count);

    let server = tokio::spawn(async move {
        for _ in 0..2 {
            let (stream, _) = listener.accept().await.unwrap();
            let c = conn_clone.fetch_add(1, Ordering::SeqCst);
            let mut ws = accept_async(stream).await.unwrap();

            if c == 0 {
                // Connection 1: valid trade, then CORRUPTED CRC32 book checksum
                let t1 = r#"{"channel":"trade","data":[{"price":"95000.50","qty":"0.25","side":"buy","seq":1,"ts_ns":1732500000000000000}]}"#;
                ws.send(Message::Text(t1.into())).await.unwrap();
                let bad_book = r#"{"channel":"book","data":[{"asks":[["95001.00","1.0"]],"bids":[["95000.00","1.0"]],"checksum":12345}]}"#;
                ws.send(Message::Text(bad_book.into())).await.unwrap();
            } else {
                // Connection 2 (resync): valid CRC32 book snapshot + 2 clean trades
                let good_crc = kraken_book_crc32(&[("95001.00", "1.0")], &[("95000.00", "1.0")]);
                let ok_book = format!(
                    r#"{{"channel":"book","data":[{{"asks":[["95001.00","1.0"]],"bids":[["95000.00","1.0"]],"checksum":{good_crc}}}]}}"#
                );
                ws.send(Message::Text(ok_book.into())).await.unwrap();
                let t2 = r#"{"channel":"trade","data":[{"price":"95001.00","qty":"0.50","side":"sell","seq":2,"ts_ns":1732500001000000000},{"price":"95001.50","qty":"1.00","side":"buy","seq":3,"ts_ns":1732500002000000000}]}"#;
                ws.send(Message::Text(t2.into())).await.unwrap();
            }
        }
    });

    let (mut prod, cons) = RingBuffer::new(DEFAULT_RING_CAP);
    let url = format!("ws://{addr}");
    let stats = run_resilient_ws_session(
        &url,
        VenueProtocol::KrakenV2,
        InstrumentId(1),
        &mut prod,
        3,
        3,
    )
    .await
    .unwrap();
    server.await.unwrap();

    assert_eq!(stats.faults_detected, 1);
    assert_eq!(stats.fault_events[0].book_state, BookState::Stale);
    assert_eq!(stats.resync_count, 1);
    assert!(
        stats.max_resync_ms < 2_000,
        "Kraken resync took {} ms (>= 2000 ms)",
        stats.max_resync_ms
    );
    assert_eq!(stats.final_book_state, BookState::Live);
    assert_eq!(stats.ticks_pushed, 3);
    assert_eq!(cons.slots(), 3);
    println!(
        "T09 Kraken loopback CRC32 fault test PASS: faults={} resync_ms={} ticks={}",
        stats.faults_detected, stats.max_resync_ms, stats.ticks_pushed
    );
}

#[tokio::test]
async fn coinbase_loopback_seq_gap_and_maker_to_taker_inversion() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let server = tokio::spawn(async move {
        for c in 0..2 {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = accept_async(stream).await.unwrap();
            if c == 0 {
                // seq 1 (maker BUY => taker SELL), then seq gap to 5 -> must transition to Stale
                let m1 = r#"{"channel":"market_trades","sequence_num":1,"price":"3420.10","size":"2.0","side":"BUY","ts_ns":1732500000000000000}"#;
                let m_gap = r#"{"channel":"market_trades","sequence_num":5,"price":"3420.20","size":"1.0","side":"SELL","ts_ns":1732500001000000000}"#;
                ws.send(Message::Text(m1.into())).await.unwrap();
                ws.send(Message::Text(m_gap.into())).await.unwrap();
            } else {
                // Resynced stream: maker SELL => taker BUY
                let m2 = r#"{"channel":"market_trades","sequence_num":10,"price":"3420.30","size":"1.5","side":"SELL","ts_ns":1732500002000000000}"#;
                ws.send(Message::Text(m2.into())).await.unwrap();
            }
        }
    });

    let (mut prod, mut cons) = RingBuffer::new(DEFAULT_RING_CAP);
    let url = format!("ws://{addr}");
    let stats = run_resilient_ws_session(
        &url,
        VenueProtocol::CoinbaseAdvTrade,
        InstrumentId(2),
        &mut prod,
        2,
        3,
    )
    .await
    .unwrap();
    server.await.unwrap();

    assert_eq!(stats.faults_detected, 1);
    assert_eq!(stats.fault_events[0].book_state, BookState::Stale);
    assert_eq!(stats.resync_count, 1);
    assert!(stats.max_resync_ms < 2_000);
    assert_eq!(stats.final_book_state, BookState::Live);

    let first = cons.pop().unwrap();
    let second = cons.pop().unwrap();
    assert_eq!(first.aggressor_side(), AggressorSide::Sell);
    assert_eq!(second.aggressor_side(), AggressorSide::Buy);
    println!(
        "T09 Coinbase loopback seq-gap + maker->taker inversion PASS: resync_ms={}",
        stats.max_resync_ms
    );
}

/// KC-05 / T09: Real lock-free rtrb SPSC (cap = 16,384) -> CoreEventDispatcher -> StorageRing
/// sustained throughput benchmark (target: >= 250,000 ticks/sec).
#[test]
fn kc05_spsc_dispatcher_throughput_exceeds_250k_ticks_per_sec() {
    const TOTAL_TICKS: u64 = 500_000;
    const CHUNK: usize = 4_096;

    let (mut prod, cons) = RingBuffer::new(DEFAULT_RING_CAP);
    let (storage_prod, mut storage_cons) = RingBuffer::new(DEFAULT_RING_CAP);
    let mut dispatcher = CoreEventDispatcher::new(vec![cons], storage_prod);

    let mut sim = SyntheticSimProvider::new(
        InstrumentId(1),
        0xA11E_6ED1,
        95_000_000_000_000,
        500_000_000,
        1_732_500_000_000_000_000,
    );

    let start = Instant::now();
    let mut produced = 0u64;
    let mut stored = 0u64;

    while produced < TOTAL_TICKS {
        let batch = (TOTAL_TICKS - produced).min(CHUNK as u64);
        for _ in 0..batch {
            let tick = sim.next_tick();
            prod.push(tick).expect("ring has headroom");
            produced += 1;
        }
        let _ = dispatcher.poll_all(|_| {});
        while storage_cons.pop().is_ok() {
            stored += 1;
        }
    }

    let elapsed_us = start.elapsed().as_micros().max(1);
    let ticks_per_sec = (u128::from(TOTAL_TICKS) * 1_000_000) / elapsed_us;

    println!(
        "KC-05 SPSC Dispatcher throughput: ticks={} stored={} elapsed_us={} rate={} ticks/s",
        TOTAL_TICKS, stored, elapsed_us, ticks_per_sec
    );

    assert_eq!(stored, TOTAL_TICKS);
    assert_eq!(dispatcher.storage_dropped(), 0);
    assert!(
        ticks_per_sec >= 250_000,
        "KC-05 failed: {} ticks/s < 250,000 ticks/s",
        ticks_per_sec
    );
}
