use crate::framing::{
    LiveTradeRecord, StreamStatusFrame, encode_live_trade_batch, encode_stream_status,
};

pub const DEFAULT_COALESCE_INTERVAL_NS: u64 = 16_000_000; // 16 ms
pub const MAX_TRADES_PER_FRAME: usize = 4_096;

/// 16 ms coalescing frame batcher with immediate bypass for STREAM_STATUS_FRAME (IPC-Contract §5).
#[derive(Debug, Default)]
pub struct FrameBatcher {
    stream_id: u32,
    last_flush_ns: u64,
    pending_trades: Vec<LiveTradeRecord>,
}

impl FrameBatcher {
    pub fn new(stream_id: u32) -> Self {
        Self {
            stream_id,
            last_flush_ns: 0,
            pending_trades: Vec::with_capacity(256),
        }
    }

    pub fn push_trade(&mut self, trade: LiveTradeRecord) {
        self.pending_trades.push(trade);
    }

    /// Immediately emit a 16 B STREAM_STATUS_FRAME bypassing the 16 ms coalescing timer.
    pub fn emit_status_immediate(&self, now_ns: u64, status: StreamStatusFrame) -> Vec<u8> {
        encode_stream_status(self.stream_id, now_ns, status)
    }

    /// Flush up to MAX_TRADES_PER_FRAME when >= 16 ms elapsed or force == true.
    pub fn maybe_flush_trades(&mut self, now_ns: u64, force: bool) -> Option<Vec<u8>> {
        if self.pending_trades.is_empty() {
            return None;
        }
        if !force
            && self.last_flush_ns != 0
            && now_ns.saturating_sub(self.last_flush_ns) < DEFAULT_COALESCE_INTERVAL_NS
            && self.pending_trades.len() < MAX_TRADES_PER_FRAME
        {
            return None;
        }
        let take = self.pending_trades.len().min(MAX_TRADES_PER_FRAME);
        let chunk: Vec<LiveTradeRecord> = self.pending_trades.drain(..take).collect();
        self.last_flush_ns = now_ns;
        Some(encode_live_trade_batch(self.stream_id, now_ns, &chunk))
    }

    pub fn pending_len(&self) -> usize {
        self.pending_trades.len()
    }
}
