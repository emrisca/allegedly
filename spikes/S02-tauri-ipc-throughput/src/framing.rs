use serde::Serialize;

/// Wire magic for packed fixed-point binary tick/DOM delta batches ("ALG2")
pub const MAGIC_ALG2: u32 = 0x414C_4732;
/// Batch frame header: magic(u32) + count(u32) + send_ns(u64) = 16 bytes
pub const HEADER_BYTES: usize = 16;
/// Fixed-point tick/DOM delta record: seq(u64) + send_ns(u64) + price_tick(i64) + qty(i32) + flags(u32) = 32 bytes
pub const RECORD_BYTES: usize = 32;

/// Fixed-point OHLCV bar (48 bytes SoA: 6 x i64 per bar, zero IEEE-754 floats)
#[derive(Serialize)]
pub struct JsonBar {
    pub t: i64,
    pub o: i64,
    pub h: i64,
    pub l: i64,
    pub c: i64,
    pub v: i64,
}

#[derive(Serialize)]
pub struct JsonDeltaMsg {
    pub seq: u64,
    pub ts_ns: u64,
    pub price_tick: i64,
    pub qty: i32,
    pub flags: u32,
}

/// Generates N fixed-point OHLCV bars in Struct-of-Arrays (SoA) little-endian binary:
/// Header: magic(u32) + bar_count(u32) + reserved(u64) = 16 bytes
/// Payload: times_sec[N](i64), open_ticks[N](i64), high_ticks[N](i64),
///          low_ticks[N](i64), close_ticks[N](i64), volumes[N](i64)
/// Total payload = 16 + N * 48 bytes (4,800,016 bytes for 100k bars)
pub fn build_bulk_bars_soa(bar_count: usize) -> Vec<u8> {
    let mut buf = Vec::with_capacity(HEADER_BYTES + bar_count * 48);
    buf.extend_from_slice(&MAGIC_ALG2.to_le_bytes());
    buf.extend_from_slice(&(bar_count as u32).to_le_bytes());
    buf.extend_from_slice(&0u64.to_le_bytes());

    let start_epoch: i64 = 1_795_536_000 - (bar_count as i64) * 60;
    let mut price_tick: i64 = 23_200; // 5800.00 ES (0.25 tick)
    let mut state: u64 = 0xA11E_6ED1_5EED_0002;

    let mut times = Vec::with_capacity(bar_count);
    let mut opens = Vec::with_capacity(bar_count);
    let mut highs = Vec::with_capacity(bar_count);
    let mut lows = Vec::with_capacity(bar_count);
    let mut closes = Vec::with_capacity(bar_count);
    let mut vols = Vec::with_capacity(bar_count);

    for i in 0..bar_count {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let step = ((state >> 33) % 15) as i64 - 7;
        let open = price_tick;
        let close = (open + step).max(16_000);
        let high = open.max(close) + (((state >> 16) % 6) as i64 + 1);
        let low = open.min(close) - (((state >> 8) % 6) as i64 + 1);
        let vol = 200 + ((state >> 24) % 2500) as i64;
        price_tick = close;

        times.push(start_epoch + (i as i64) * 60);
        opens.push(open);
        highs.push(high);
        lows.push(low);
        closes.push(close);
        vols.push(vol);
    }

    for slice in [&times, &opens, &highs, &lows, &closes, &vols] {
        for &v in slice {
            buf.extend_from_slice(&v.to_le_bytes());
        }
    }
    buf
}

pub fn build_bulk_bars_json_vec(bar_count: usize) -> Vec<JsonBar> {
    let start_epoch: i64 = 1_795_536_000 - (bar_count as i64) * 60;
    let mut price_tick: i64 = 23_200;
    let mut state: u64 = 0xA11E_6ED1_5EED_0002;
    let mut out = Vec::with_capacity(bar_count);
    for i in 0..bar_count {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let step = ((state >> 33) % 15) as i64 - 7;
        let open = price_tick;
        let close = (open + step).max(16_000);
        let high = open.max(close) + (((state >> 16) % 6) as i64 + 1);
        let low = open.min(close) - (((state >> 8) % 6) as i64 + 1);
        let vol = 200 + ((state >> 24) % 2500) as i64;
        price_tick = close;
        out.push(JsonBar {
            t: start_epoch + (i as i64) * 60,
            o: open,
            h: high,
            l: low,
            c: close,
            v: vol,
        });
    }
    out
}

/// Packs `count` fixed-point tick/DOM delta records into one binary frame.
pub fn pack_delta_batch(
    buf: &mut Vec<u8>,
    start_seq: u64,
    count: usize,
    send_ns: u64,
) {
    buf.clear();
    buf.reserve(HEADER_BYTES + count * RECORD_BYTES);
    buf.extend_from_slice(&MAGIC_ALG2.to_le_bytes());
    buf.extend_from_slice(&(count as u32).to_le_bytes());
    buf.extend_from_slice(&send_ns.to_le_bytes());

    for i in 0..count {
        let seq = start_seq + (i as u64);
        let price_tick: i64 = 23_200 + ((seq % 200) as i64) - 100;
        let qty: i32 = 1 + ((seq % 50) as i32);
        let flags: u32 = ((seq & 1) as u32) | (((seq % 100) as u32) << 8);

        buf.extend_from_slice(&seq.to_le_bytes());
        buf.extend_from_slice(&send_ns.to_le_bytes());
        buf.extend_from_slice(&price_tick.to_le_bytes());
        buf.extend_from_slice(&qty.to_le_bytes());
        buf.extend_from_slice(&flags.to_le_bytes());
    }
}

pub fn build_delta_json_batch(start_seq: u64, count: usize, send_ns: u64) -> String {
    let mut msgs = Vec::with_capacity(count);
    for i in 0..count {
        let seq = start_seq + (i as u64);
        msgs.push(JsonDeltaMsg {
            seq,
            ts_ns: send_ns,
            price_tick: 23_200 + ((seq % 200) as i64) - 100,
            qty: 1 + ((seq % 50) as i32),
            flags: ((seq & 1) as u32) | (((seq % 100) as u32) << 8),
        });
    }
    serde_json::to_string(&msgs).unwrap_or_default()
}
