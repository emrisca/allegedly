mod framing;

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

#[derive(Deserialize)]
#[serde(tag = "cmd")]
enum ClientCmd {
    #[serde(rename = "BULK_BIN")]
    BulkBin { bars: usize },
    #[serde(rename = "BULK_JSON")]
    BulkJson { bars: usize },
    #[serde(rename = "STREAM")]
    Stream {
        mode: String, // "bin" | "json"
        rate: u64,    // target msgs/sec (10_000, 50_000, 100_000)
        batch_ms: u64, // 0 = unbatched (1 msg/frame), 16 = 60Hz batched
        duration_ms: u64,
    },
    #[serde(rename = "PING")]
    Ping { id: u64, client_ts: f64 },
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(4172);
    let addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&addr).await.expect("bind loopback ws");
    println!("S02_WS_READY ws://{addr}");

    // Pre-build 100k bars binary & JSON once to isolate IPC transport from generation cost
    let bulk_bin_100k = Arc::new(framing::build_bulk_bars_soa(100_000));
    let bulk_json_100k = Arc::new(
        serde_json::to_string(&framing::build_bulk_bars_json_vec(100_000))
            .expect("serialize json bars"),
    );

    while let Ok((stream, _)) = listener.accept().await {
        let _ = stream.set_nodelay(true);
        let bulk_bin = Arc::clone(&bulk_bin_100k);
        let bulk_json = Arc::clone(&bulk_json_100k);
        tokio::spawn(async move {
            let ws = match tokio_tungstenite::accept_async(stream).await {
                Ok(ws) => ws,
                Err(_) => return,
            };
            let (mut ws_tx, mut ws_rx) = ws.split();
            let (out_tx, mut out_rx) = mpsc::channel::<Message>(4096);

            let writer = tokio::spawn(async move {
                while let Some(msg) = out_rx.recv().await {
                    if ws_tx.send(msg).await.is_err() {
                        break;
                    }
                }
            });

            while let Some(Ok(msg)) = ws_rx.next().await {
                if let Message::Text(txt) = msg {
                    let parsed: Result<ClientCmd, _> = serde_json::from_str(&txt);
                    let Ok(cmd) = parsed else { continue };
                    match cmd {
                        ClientCmd::Ping { id, client_ts } => {
                            let pong = format!(r#"{{"kind":"PONG","id":{id},"client_ts":{client_ts}}}"#);
                            let _ = out_tx.send(Message::Text(pong.into())).await;
                        }
                        ClientCmd::BulkBin { bars } => {
                            let payload = if bars == 100_000 {
                                (*bulk_bin).clone()
                            } else {
                                framing::build_bulk_bars_soa(bars)
                            };
                            let _ = out_tx.send(Message::Binary(payload.into())).await;
                        }
                        ClientCmd::BulkJson { bars } => {
                            let payload = if bars == 100_000 {
                                (*bulk_json).clone()
                            } else {
                                serde_json::to_string(&framing::build_bulk_bars_json_vec(bars))
                                    .unwrap_or_default()
                            };
                            let _ = out_tx.send(Message::Text(payload.into())).await;
                        }
                        ClientCmd::Stream {
                            mode,
                            rate,
                            batch_ms,
                            duration_ms,
                        } => {
                            let tx = out_tx.clone();
                            tokio::spawn(async move {
                                run_stream(tx, &mode, rate, batch_ms, duration_ms).await;
                            });
                        }
                    }
                }
            }
            drop(out_tx);
            let _ = writer.await;
        });
    }
}

async fn run_stream(
    tx: mpsc::Sender<Message>,
    mode: &str,
    rate: u64,
    batch_ms: u64,
    duration_ms: u64,
) {
    let start = Instant::now();
    let deadline = start + Duration::from_millis(duration_ms);
    let mut seq: u64 = 0;
    let mut frames_sent: u64 = 0;
    let mut bytes_sent: u64 = 0;
    let mut scratch = Vec::with_capacity(65_536);

    if batch_ms > 0 {
        let interval = Duration::from_millis(batch_ms);
        let msgs_per_batch = ((rate * batch_ms) / 1000).max(1) as usize;
        let mut next_tick = start;

        while Instant::now() < deadline {
            let now = Instant::now();
            if now < next_tick {
                tokio::time::sleep(next_tick - now).await;
            }
            next_tick += interval;
            let send_ns = start.elapsed().as_nanos() as u64;

            if mode == "bin" {
                framing::pack_delta_batch(&mut scratch, seq, msgs_per_batch, send_ns);
                bytes_sent += scratch.len() as u64;
                if tx.send(Message::Binary(scratch.clone().into())).await.is_err() {
                    return;
                }
            } else {
                let s = framing::build_delta_json_batch(seq, msgs_per_batch, send_ns);
                bytes_sent += s.len() as u64;
                if tx.send(Message::Text(s.into())).await.is_err() {
                    return;
                }
            }
            seq += msgs_per_batch as u64;
            frames_sent += 1;
        }
    } else {
        // Unbatched: 1 message per WebSocket frame, paced in 1ms quanta to hit target rate cleanly
        let per_ms = (rate / 1000).max(1) as usize;
        let mut next_ms = start;
        while Instant::now() < deadline {
            let now = Instant::now();
            if now < next_ms {
                tokio::time::sleep(next_ms - now).await;
            }
            next_ms += Duration::from_millis(1);
            let send_ns = start.elapsed().as_nanos() as u64;

            for _ in 0..per_ms {
                if mode == "bin" {
                    framing::pack_delta_batch(&mut scratch, seq, 1, send_ns);
                    bytes_sent += scratch.len() as u64;
                    if tx.send(Message::Binary(scratch.clone().into())).await.is_err() {
                        return;
                    }
                } else {
                    let s = framing::build_delta_json_batch(seq, 1, send_ns);
                    bytes_sent += s.len() as u64;
                    if tx.send(Message::Text(s.into())).await.is_err() {
                        return;
                    }
                }
                seq += 1;
                frames_sent += 1;
            }
        }
    }

    let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
    let done = format!(
        r#"{{"kind":"STREAM_DONE","mode":"{mode}","rate":{rate},"batch_ms":{batch_ms},"sent_msgs":{seq},"sent_frames":{frames_sent},"sent_bytes":{bytes_sent},"server_elapsed_ms":{elapsed_ms:.3}}}"#
    );
    let _ = tx.send(Message::Text(done.into())).await;
}
