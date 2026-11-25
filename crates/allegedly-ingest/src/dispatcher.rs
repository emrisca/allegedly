use allegedly_core::{BookState, NormalizedTick, ProvenanceTier};
use allegedly_ipc::StreamStatusFrame;
use rtrb::{Consumer, Producer, RingBuffer};

/// Production default SPSC capacity (RT3-16, ADR-0008).
pub const DEFAULT_RING_CAP: usize = 16_384;

pub struct ProviderRing {
    pub producer: Producer<NormalizedTick>,
    pub consumer: Consumer<NormalizedTick>,
}

impl ProviderRing {
    pub fn with_capacity(cap: usize) -> Self {
        let (producer, consumer) = RingBuffer::new(cap);
        Self { producer, consumer }
    }
}

/// Non-blocking provider ingress sender: never blocks exchange WS, marks BookState::Stale on full ring.
pub struct ProviderIngress {
    producer: Producer<NormalizedTick>,
    dropped_total: u32,
    book_state: BookState,
    seq: u64,
}

impl ProviderIngress {
    pub fn new(producer: Producer<NormalizedTick>) -> Self {
        Self {
            producer,
            dropped_total: 0,
            book_state: BookState::Live,
            seq: 0,
        }
    }

    pub fn try_push(&mut self, tick: NormalizedTick) -> Option<StreamStatusFrame> {
        self.seq = self.seq.wrapping_add(1);
        match self.producer.push(tick) {
            Ok(()) => None,
            Err(_) => {
                self.dropped_total = self.dropped_total.saturating_add(1);
                self.book_state = BookState::Stale;
                Some(StreamStatusFrame::new(
                    self.seq,
                    self.dropped_total,
                    1, // ring saturation
                    BookState::Stale,
                    tick.tier(),
                ))
            }
        }
    }

    pub fn book_state(&self) -> BookState {
        self.book_state
    }

    pub fn dropped_total(&self) -> u32 {
        self.dropped_total
    }
}

/// Single-threaded Core Event Dispatcher draining per-provider SPSC rings and forwarding to StorageRing (RT3-06).
pub struct CoreEventDispatcher {
    consumers: Vec<Consumer<NormalizedTick>>,
    storage_tx: Producer<NormalizedTick>,
    storage_dropped: u32,
}

impl CoreEventDispatcher {
    pub fn new(
        consumers: Vec<Consumer<NormalizedTick>>,
        storage_tx: Producer<NormalizedTick>,
    ) -> Self {
        Self {
            consumers,
            storage_tx,
            storage_dropped: 0,
        }
    }

    pub fn poll_all(&mut self, mut on_tick: impl FnMut(NormalizedTick)) -> usize {
        let mut total = 0usize;
        for rx in &mut self.consumers {
            while let Ok(tick) = rx.pop() {
                on_tick(tick);
                if self.storage_tx.push(tick).is_err() {
                    self.storage_dropped = self.storage_dropped.saturating_add(1);
                }
                total += 1;
            }
        }
        total
    }

    pub fn storage_dropped(&self) -> u32 {
        self.storage_dropped
    }
}

/// Deterministic zero-network synthetic market generator for SV-01 offline boot & CI tests.
pub struct SyntheticSimProvider {
    instrument_id: allegedly_core::InstrumentId,
    state: u64,
    price_e9: i64,
    tick_size_e9: i64,
    seq: u64,
    ts_ns: i64,
}

impl SyntheticSimProvider {
    pub fn new(
        instrument_id: allegedly_core::InstrumentId,
        seed: u64,
        start_price_e9: i64,
        tick_size_e9: i64,
        start_ts_ns: i64,
    ) -> Self {
        Self {
            instrument_id,
            state: seed.max(1),
            price_e9: start_price_e9,
            tick_size_e9: tick_size_e9.max(1),
            seq: 0,
            ts_ns: start_ts_ns,
        }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    pub fn next_tick(&mut self) -> NormalizedTick {
        let r = self.next_u64();
        let step = (r % 3) as i64 - 1; // -1, 0, +1 tick
        self.price_e9 = (self.price_e9 + step * self.tick_size_e9).max(self.tick_size_e9);
        self.seq += 1;
        self.ts_ns += 50_000_000; // 50 ms
        let qty_e9 = (((r >> 8) % 50) as i64 + 1) * 100_000_000; // 0.1..5.0
        let side = if (r >> 16) & 1 == 0 {
            allegedly_core::AggressorSide::Buy
        } else {
            allegedly_core::AggressorSide::Sell
        };
        NormalizedTick::new(
            allegedly_core::TimestampNs(self.ts_ns),
            allegedly_core::TimestampNs(self.ts_ns),
            self.instrument_id,
            self.seq,
            allegedly_core::PriceE9(self.price_e9),
            allegedly_core::QtyE9(qty_e9),
            allegedly_core::PriceE9(self.price_e9 - self.tick_size_e9),
            allegedly_core::PriceE9(self.price_e9 + self.tick_size_e9),
            side,
            ProvenanceTier::ExactTickAggr,
            allegedly_core::ProvenanceModifiers::NONE,
        )
    }
}
