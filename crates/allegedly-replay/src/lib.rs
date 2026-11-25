use allegedly_core::{Bps, NormalizedTick, PriceE9, QtyE9, VwapAccumulator};
use allegedly_orderflow::{BarSlice, FootprintSlabArena};
use allegedly_storage::{AtVaultBlockReader, StorageError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Maximum bars retained in the replay slab arena before oldest bars are evicted after hashing (SV-13).
const REPLAY_ARENA_MAX_BARS: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReplaySpeed {
    #[serde(rename = "1x")]
    RealTime1x,
    #[serde(rename = "5x")]
    Fast5x,
    #[serde(rename = "50x")]
    Fast50x,
    #[serde(rename = "max")]
    MaxCpuBatch,
}

impl ReplaySpeed {
    pub fn batch_step(self) -> usize {
        match self {
            Self::RealTime1x => 8,
            Self::Fast5x => 40,
            Self::Fast50x => 400,
            Self::MaxCpuBatch => 2_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplayDigest {
    pub ticks_processed: u64,
    pub bars_sealed: usize,
    pub final_vwap_e9: Option<i64>,
    pub sha256_hex: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ReplayControlAction {
    Play,
    Pause,
    Step,
    Seek { cursor: usize },
    SetSpeed { speed: ReplaySpeed },
    Reset,
    VerifyDeterminism,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplayStatusSnapshot {
    pub playing: bool,
    pub speed: ReplaySpeed,
    pub cursor: usize,
    pub total_ticks: usize,
    pub bars_sealed: usize,
    pub final_vwap_e9: Option<String>,
    pub sha256_hex: String,
    pub determinism_verified: bool,
}

fn hash_bar_slice(hasher: &mut Sha256, b: &BarSlice) {
    hasher.update(b.bar_ts_ns.to_le_bytes());
    hasher.update(b.open_tick.to_le_bytes());
    hasher.update(b.high_tick.to_le_bytes());
    hasher.update(b.low_tick.to_le_bytes());
    hasher.update(b.close_tick.to_le_bytes());
    hasher.update(b.total_vol_e9.to_le_bytes());
    hasher.update(b.buy_vol_e9.to_le_bytes());
    hasher.update(b.sell_vol_e9.to_le_bytes());
    hasher.update(b.poc_tick.to_le_bytes());
}

/// Incremental bounded-memory replay accumulator (O(batch) per step, constant RAM via bar eviction).
pub struct IncrementalReplayEngine {
    bar_interval_ns: i64,
    tick_size_e9: i64,
    arena: FootprintSlabArena,
    vwap: VwapAccumulator,
    sealed_hasher: Sha256,
    hashed_bars_in_arena: usize,
    total_bars_sealed: usize,
    ticks_processed: u64,
}

impl IncrementalReplayEngine {
    pub fn new(bar_interval_ns: i64, tick_size_e9: i64) -> Self {
        Self {
            bar_interval_ns,
            tick_size_e9,
            arena: FootprintSlabArena::new(bar_interval_ns, tick_size_e9, Bps(30_000)),
            vwap: VwapAccumulator::default(),
            sealed_hasher: Sha256::new(),
            hashed_bars_in_arena: 0,
            total_bars_sealed: 0,
            ticks_processed: 0,
        }
    }

    /// Ingest a chunk of ticks incrementally without touching prior history (O(chunk.len())).
    pub fn ingest_batch(&mut self, batch: &[NormalizedTick]) {
        for t in batch {
            self.arena.ingest_tick(t);
            let _ = self.vwap.update(PriceE9(t.price_e9), QtyE9(t.qty_e9));
            self.ticks_processed += 1;
        }
        self.flush_newly_sealed_bars();
    }

    fn flush_newly_sealed_bars(&mut self) {
        if self.arena.bars.len() > self.hashed_bars_in_arena {
            for b in &self.arena.bars[self.hashed_bars_in_arena..] {
                hash_bar_slice(&mut self.sealed_hasher, b);
                self.total_bars_sealed += 1;
            }
            self.hashed_bars_in_arena = self.arena.bars.len();
        }
        // Keep arena RSS strictly bounded during multi-million-tick streaming replay (RTSD-04)
        if self.arena.bars.len() > REPLAY_ARENA_MAX_BARS {
            self.arena.evict_oldest_bars(REPLAY_ARENA_MAX_BARS / 2);
            self.hashed_bars_in_arena = self.arena.bars.len();
        }
    }

    /// Compute a non-destructive point-in-time deterministic digest (including the currently open bar if any).
    pub fn snapshot_digest(&self) -> ReplayDigest {
        let mut hasher = self.sealed_hasher.clone();
        let mut bars_count = self.total_bars_sealed;

        // Include any in-progress bar without mutating self.arena
        if let (Some(bar_ts_ns), Some((open_tick, high_tick, low_tick, close_tick))) =
            (self.arena.active_bar_ts_ns(), self.arena.active_ohlc())
        {
            let active_cells = self.arena.active_cells_snapshot();
            let mut poc_tick = close_tick;
            let mut max_vol = -1i64;
            for c in &active_cells {
                let tot = c.bid_vol_e9.saturating_add(c.ask_vol_e9);
                if tot > max_vol {
                    max_vol = tot;
                    poc_tick = c.price_tick;
                }
            }
            let (total_vol_e9, buy_vol_e9, sell_vol_e9) = self.arena.active_totals();
            let pending = BarSlice {
                bar_ts_ns,
                cell_offset: 0,
                cell_count: active_cells.len() as u32,
                open_tick,
                high_tick,
                low_tick,
                close_tick,
                total_vol_e9,
                buy_vol_e9,
                sell_vol_e9,
                poc_tick,
            };
            hash_bar_slice(&mut hasher, &pending);
            bars_count += 1;
        }

        let final_vwap_e9 = self.vwap.vwap().ok().flatten().map(|p| p.0);
        if let Some(v) = final_vwap_e9 {
            hasher.update(v.to_le_bytes());
        }
        hasher.update(self.ticks_processed.to_le_bytes());
        let digest = hasher.finalize();
        let mut hex = String::with_capacity(64);
        for b in digest {
            hex.push_str(&format!("{b:02x}"));
        }
        ReplayDigest {
            ticks_processed: self.ticks_processed,
            bars_sealed: bars_count,
            final_vwap_e9,
            sha256_hex: hex,
        }
    }

    pub fn bar_interval_ns(&self) -> i64 {
        self.bar_interval_ns
    }

    pub fn tick_size_e9(&self) -> i64 {
        self.tick_size_e9
    }
}

/// Deterministic chunked replay over normalized ticks executing genuine `speed.batch_step()` increments
/// so `1x`, `5x`, `50x`, and `max` traverse different batch sizes & intermediate flushes (SV-09 / RTSD-04).
pub fn replay_ticks_deterministic(
    ticks: &[NormalizedTick],
    bar_interval_ns: i64,
    tick_size_e9: i64,
    speed: ReplaySpeed,
) -> ReplayDigest {
    let mut engine = IncrementalReplayEngine::new(bar_interval_ns, tick_size_e9);
    let step = speed.batch_step().max(1);
    for chunk in ticks.chunks(step) {
        engine.ingest_batch(chunk);
    }
    engine.snapshot_digest()
}

/// Streaming `.atvault` replay at `speed.batch_step()` chunking without loading the full file into RAM.
pub fn replay_atvault_streaming(
    path: &Path,
    bar_interval_ns: i64,
    tick_size_e9: i64,
    speed: ReplaySpeed,
) -> Result<(ReplayDigest, usize), StorageError> {
    let mut reader = AtVaultBlockReader::open(path)?;
    let mut engine = IncrementalReplayEngine::new(bar_interval_ns, tick_size_e9);
    let step = speed.batch_step().max(1);
    let mut batches_executed = 0usize;
    let mut carry: Vec<NormalizedTick> = Vec::with_capacity(step);

    while let Some(block) = reader.next_block()? {
        for tick in block {
            carry.push(tick);
            if carry.len() >= step {
                engine.ingest_batch(&carry);
                carry.clear();
                batches_executed += 1;
            }
        }
    }
    if !carry.is_empty() {
        engine.ingest_batch(&carry);
        batches_executed += 1;
    }
    Ok((engine.snapshot_digest(), batches_executed))
}

enum ReplaySource {
    Memory(Vec<NormalizedTick>),
    AtVaultFile {
        path: PathBuf,
        total_ticks: usize,
        reader: AtVaultBlockReader,
        block_buf: Vec<NormalizedTick>,
        block_pos: usize,
    },
}

impl ReplaySource {
    fn total_ticks(&self) -> usize {
        match self {
            Self::Memory(v) => v.len(),
            Self::AtVaultFile { total_ticks, .. } => *total_ticks,
        }
    }

    fn reset_to_start(&mut self) -> Result<(), StorageError> {
        if let Self::AtVaultFile {
            path,
            reader,
            block_buf,
            block_pos,
            ..
        } = self
        {
            *reader = AtVaultBlockReader::open(path)?;
            block_buf.clear();
            *block_pos = 0;
        }
        Ok(())
    }

    fn read_next_into(
        &mut self,
        cursor: usize,
        count: usize,
        out: &mut Vec<NormalizedTick>,
    ) -> Result<usize, StorageError> {
        out.clear();
        match self {
            Self::Memory(v) => {
                let end = (cursor + count).min(v.len());
                if cursor < end {
                    out.extend_from_slice(&v[cursor..end]);
                }
                Ok(out.len())
            }
            Self::AtVaultFile {
                reader,
                block_buf,
                block_pos,
                ..
            } => {
                while out.len() < count {
                    if *block_pos >= block_buf.len() {
                        match reader.next_block()? {
                            Some(blk) => {
                                *block_buf = blk;
                                *block_pos = 0;
                            }
                            None => break,
                        }
                    }
                    let take = (count - out.len()).min(block_buf.len() - *block_pos);
                    out.extend_from_slice(&block_buf[*block_pos..*block_pos + take]);
                    *block_pos += take;
                }
                Ok(out.len())
            }
        }
    }
}

/// Interactive incremental streaming replay session supporting Play/Pause/Step/Seek/Speed,
/// `.atvault` disk streaming, and real cross-speed SV-09 SHA-256 verification.
pub struct ReplaySession {
    source: ReplaySource,
    engine: IncrementalReplayEngine,
    playing: bool,
    speed: ReplaySpeed,
    cursor: usize,
    determinism_verified: bool,
    last_digest: ReplayDigest,
    scratch: Vec<NormalizedTick>,
}

impl ReplaySession {
    pub fn from_ticks(ticks: Vec<NormalizedTick>, bar_interval_ns: i64, tick_size_e9: i64) -> Self {
        let mut session = Self {
            source: ReplaySource::Memory(ticks),
            engine: IncrementalReplayEngine::new(bar_interval_ns, tick_size_e9),
            playing: false,
            speed: ReplaySpeed::RealTime1x,
            cursor: 0,
            determinism_verified: false,
            last_digest: ReplayDigest {
                ticks_processed: 0,
                bars_sealed: 0,
                final_vwap_e9: None,
                sha256_hex: String::new(),
            },
            scratch: Vec::with_capacity(2_000),
        };
        let initial = session.source.total_ticks().min(64);
        session.advance_by(initial);
        session
    }

    /// Open a disk-backed streaming `.atvault` replay session without loading the whole segment into RAM.
    pub fn from_atvault(
        path: &Path,
        bar_interval_ns: i64,
        tick_size_e9: i64,
    ) -> Result<Self, StorageError> {
        let mut counter = AtVaultBlockReader::open(path)?;
        let mut total_ticks = 0usize;
        while let Some(blk) = counter.next_block()? {
            total_ticks += blk.len();
        }
        let reader = AtVaultBlockReader::open(path)?;
        let mut session = Self {
            source: ReplaySource::AtVaultFile {
                path: path.to_path_buf(),
                total_ticks,
                reader,
                block_buf: Vec::new(),
                block_pos: 0,
            },
            engine: IncrementalReplayEngine::new(bar_interval_ns, tick_size_e9),
            playing: false,
            speed: ReplaySpeed::RealTime1x,
            cursor: 0,
            determinism_verified: false,
            last_digest: ReplayDigest {
                ticks_processed: 0,
                bars_sealed: 0,
                final_vwap_e9: None,
                sha256_hex: String::new(),
            },
            scratch: Vec::with_capacity(2_000),
        };
        let initial = total_ticks.min(64);
        session.advance_by(initial);
        Ok(session)
    }

    fn advance_by(&mut self, n: usize) {
        if n == 0 {
            self.last_digest = self.engine.snapshot_digest();
            return;
        }
        if let Ok(read) = self
            .source
            .read_next_into(self.cursor, n, &mut self.scratch)
            && read > 0
        {
            self.engine.ingest_batch(&self.scratch[..read]);
            self.cursor += read;
        }
        self.last_digest = self.engine.snapshot_digest();
    }

    fn seek_to(&mut self, target: usize) {
        let clamped = target.min(self.source.total_ticks());
        if clamped >= self.cursor {
            // Fast incremental forward seek: O(delta)
            let mut remaining = clamped - self.cursor;
            while remaining > 0 {
                let chunk = remaining.min(self.speed.batch_step().max(256));
                self.advance_by(chunk);
                remaining -= chunk;
            }
        } else {
            // Backward seek: reset streaming engine and advance in bounded chunks
            self.engine = IncrementalReplayEngine::new(
                self.engine.bar_interval_ns(),
                self.engine.tick_size_e9(),
            );
            let _ = self.source.reset_to_start();
            self.cursor = 0;
            let mut remaining = clamped;
            while remaining > 0 {
                let chunk = remaining.min(2_000);
                self.advance_by(chunk);
                remaining -= chunk;
            }
            if clamped == 0 {
                self.last_digest = self.engine.snapshot_digest();
            }
        }
    }

    /// Execute genuine stepped replay passes at `1x`, `5x`, `50x`, and `max` up to `self.cursor`
    /// and verify bit-exact SHA-256 parity across all four speed schedules (SV-09 / RTSD-04).
    pub fn verify_cross_speed_determinism(&mut self) -> bool {
        let target = self.cursor.min(self.source.total_ticks());
        let bar_ns = self.engine.bar_interval_ns();
        let tick_e9 = self.engine.tick_size_e9();

        let run_speed = |speed: ReplaySpeed| -> Option<(ReplayDigest, usize)> {
            let mut eng = IncrementalReplayEngine::new(bar_ns, tick_e9);
            let step = speed.batch_step().max(1);
            let mut steps = 0usize;
            match &self.source {
                ReplaySource::Memory(v) => {
                    for chunk in v[..target].chunks(step) {
                        eng.ingest_batch(chunk);
                        steps += 1;
                    }
                    Some((eng.snapshot_digest(), steps))
                }
                ReplaySource::AtVaultFile { path, .. } => {
                    let mut reader = AtVaultBlockReader::open(path).ok()?;
                    let mut processed = 0usize;
                    let mut buf = Vec::with_capacity(step);
                    while processed < target {
                        let Some(blk) = reader.next_block().ok()? else {
                            break;
                        };
                        for tick in blk {
                            if processed >= target {
                                break;
                            }
                            buf.push(tick);
                            processed += 1;
                            if buf.len() >= step {
                                eng.ingest_batch(&buf);
                                buf.clear();
                                steps += 1;
                            }
                        }
                    }
                    if !buf.is_empty() {
                        eng.ingest_batch(&buf);
                        steps += 1;
                    }
                    Some((eng.snapshot_digest(), steps))
                }
            }
        };

        let Some((d1, s1)) = run_speed(ReplaySpeed::RealTime1x) else {
            self.determinism_verified = false;
            return false;
        };
        let Some((d5, _s5)) = run_speed(ReplaySpeed::Fast5x) else {
            self.determinism_verified = false;
            return false;
        };
        let Some((d50, _s50)) = run_speed(ReplaySpeed::Fast50x) else {
            self.determinism_verified = false;
            return false;
        };
        let Some((dmax, smax)) = run_speed(ReplaySpeed::MaxCpuBatch) else {
            self.determinism_verified = false;
            return false;
        };

        // Ensure multi-step speeds genuinely executed different chunk schedules when target > 8
        let distinct_schedules = target <= ReplaySpeed::RealTime1x.batch_step() || s1 > smax;
        let ok = distinct_schedules && d1 == d5 && d5 == d50 && d50 == dmax;
        self.last_digest = d1;
        self.determinism_verified = ok;
        ok
    }

    pub fn apply_control(&mut self, action: ReplayControlAction) -> ReplayStatusSnapshot {
        match action {
            ReplayControlAction::Play => {
                self.playing = true;
                if self.cursor >= self.source.total_ticks() {
                    self.seek_to(0);
                }
                self.advance_by(self.speed.batch_step());
                if self.cursor >= self.source.total_ticks() {
                    self.playing = false;
                }
            }
            ReplayControlAction::Pause => {
                self.playing = false;
            }
            ReplayControlAction::Step => {
                self.playing = false;
                self.advance_by(self.speed.batch_step());
            }
            ReplayControlAction::Seek { cursor } => {
                self.seek_to(cursor);
            }
            ReplayControlAction::SetSpeed { speed } => {
                self.speed = speed;
            }
            ReplayControlAction::Reset => {
                self.playing = false;
                self.determinism_verified = false;
                self.seek_to(0);
            }
            ReplayControlAction::VerifyDeterminism => {
                if self.cursor == 0 && self.source.total_ticks() > 0 {
                    self.seek_to(self.source.total_ticks());
                }
                self.verify_cross_speed_determinism();
            }
        }
        self.status()
    }

    pub fn status(&self) -> ReplayStatusSnapshot {
        ReplayStatusSnapshot {
            playing: self.playing,
            speed: self.speed,
            cursor: self.cursor,
            total_ticks: self.source.total_ticks(),
            bars_sealed: self.last_digest.bars_sealed,
            final_vwap_e9: self.last_digest.final_vwap_e9.map(|v| v.to_string()),
            sha256_hex: self.last_digest.sha256_hex.clone(),
            determinism_verified: self.determinism_verified,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_core::{
        AggressorSide, InstrumentId, PriceE9, ProvenanceModifiers, ProvenanceTier, QtyE9,
        TimestampNs,
    };
    use allegedly_storage::append_atvault_block;

    fn sample_ticks(n: i64) -> Vec<NormalizedTick> {
        (0..n)
            .map(|i| {
                NormalizedTick::new(
                    TimestampNs(1_732_500_000_000_000_000 + i * 500_000_000),
                    TimestampNs(1_732_500_000_000_000_000 + i * 500_000_000),
                    InstrumentId(1),
                    (i + 1) as u64,
                    PriceE9(50_000_000_000_000 + (i % 17) * 250_000_000),
                    QtyE9(100_000_000 * ((i % 5) + 1)),
                    PriceE9(50_000_000_000_000),
                    PriceE9(50_250_000_000_000),
                    if i % 3 == 0 {
                        AggressorSide::Buy
                    } else {
                        AggressorSide::Sell
                    },
                    ProvenanceTier::ExactTickAggr,
                    ProvenanceModifiers::NONE,
                )
            })
            .collect()
    }

    #[test]
    fn sv09_bit_exact_cross_speed_stepped_replay_determinism() {
        let ticks = sample_ticks(5_000);
        let run_stepped = |speed: ReplaySpeed| -> (ReplayStatusSnapshot, usize) {
            let mut s = ReplaySession::from_ticks(ticks.clone(), 60_000_000_000, 250_000_000);
            s.apply_control(ReplayControlAction::Reset);
            s.apply_control(ReplayControlAction::SetSpeed { speed });
            let mut steps = 0usize;
            let mut snap = s.status();
            while snap.cursor < snap.total_ticks {
                snap = s.apply_control(ReplayControlAction::Step);
                steps += 1;
            }
            (snap, steps)
        };

        let (s1, steps1) = run_stepped(ReplaySpeed::RealTime1x);
        let (s5, steps5) = run_stepped(ReplaySpeed::Fast5x);
        let (s50, steps50) = run_stepped(ReplaySpeed::Fast50x);
        let (smax, stepsmax) = run_stepped(ReplaySpeed::MaxCpuBatch);

        assert!(steps1 > steps5 && steps5 > steps50 && steps50 > stepsmax);
        assert_eq!(s1.sha256_hex, s5.sha256_hex);
        assert_eq!(s5.sha256_hex, s50.sha256_hex);
        assert_eq!(s50.sha256_hex, smax.sha256_hex);
        assert_eq!(s1.bars_sealed, smax.bars_sealed);
        assert_eq!(s1.final_vwap_e9, smax.final_vwap_e9);
        assert!(s1.bars_sealed > 10);
        assert_eq!(s1.sha256_hex.len(), 64);
    }

    #[test]
    fn atvault_streaming_replay_session_preserves_sha256() {
        let ticks = sample_ticks(1_200);
        let path = std::env::temp_dir().join(format!(
            "allegedly_replay_test_{}.atvault",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        // Write multiple compressed blocks to verify multi-block streaming
        append_atvault_block(&path, &ticks[..500]).unwrap();
        append_atvault_block(&path, &ticks[500..]).unwrap();

        let (stream_1x, batches_1x) =
            replay_atvault_streaming(&path, 60_000_000_000, 250_000_000, ReplaySpeed::RealTime1x)
                .unwrap();
        let (stream_max, batches_max) =
            replay_atvault_streaming(&path, 60_000_000_000, 250_000_000, ReplaySpeed::MaxCpuBatch)
                .unwrap();
        assert!(batches_1x > batches_max);
        assert_eq!(stream_1x, stream_max);

        let mut session = ReplaySession::from_atvault(&path, 60_000_000_000, 250_000_000).unwrap();
        let snap = session.apply_control(ReplayControlAction::Seek { cursor: 1_200 });
        assert_eq!(snap.cursor, 1_200);
        let verified = session.apply_control(ReplayControlAction::VerifyDeterminism);
        assert!(verified.determinism_verified);
        assert_eq!(verified.sha256_hex, stream_1x.sha256_hex);

        let _ = std::fs::remove_file(&path);
    }
}
