use allegedly_core::{
    BookState, Bps, ConfigCascade, InstrumentId, PriceE9, ProvenanceModifiers, ProvenanceTier,
    QtyE9, ResolvedSetting, TimestampNs,
};
use allegedly_ingest::SyntheticSimProvider;
use allegedly_ipc::{
    FrameBatcher, LiveBarUpdate, LiveL2BookHeader, LiveL2BookLevel, LiveTradeRecord,
    StreamStatusFrame, TpoHeader, TpoRow128, VolumeProfileBin, VolumeProfileSummary,
    WorkspacePatch, WorkspacePatchResult, WorkspaceStateHub, encode_footprint_delta,
    encode_live_bar_update_batch, encode_live_l2_book_batch, encode_tpo_profile_bitmask,
    encode_volume_profile, pack_trade_flags,
};
use allegedly_oms::{
    JournalMode, LocalPaperOms, OrderJournal, OrderRequest, OrderSide, OrderState, OrderType,
    is_forbidden_adapter,
};
use allegedly_orderflow::{FootprintSlabArena, TpoProfile, compute_value_area};
use allegedly_replay::{ReplayControlAction, ReplaySession, ReplayStatusSnapshot};
use allegedly_studies::{
    GlobalStudyMemoryPool, StudyRunRequest, StudyRunResponse, evaluate_study_request,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Hard bound on historical bars kept in the live footprint slab arena (SV-13 / RTSD-02).
pub const MAX_LIVE_FOOTPRINT_BARS: usize = 5_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BootConfig {
    /// SV-01 / RT3-02: MUST be false by default for zero-packet offline boot.
    pub updates_check_on_startup: bool,
    /// ADR-0009: MUST be false by default at boot.
    pub live_armed: bool,
    pub offline_mode: bool,
}

impl Default for BootConfig {
    fn default() -> Self {
        Self {
            updates_check_on_startup: false,
            live_armed: false,
            offline_mode: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperOrderSubmission {
    pub symbol: String,
    pub side: String,
    pub order_type: String,
    pub qty_e9: String,
    pub limit_price_e9: Option<String>,
    #[serde(default)]
    pub reduce_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperOrderTicketDto {
    pub order_id: String,
    pub symbol: String,
    pub side: String,
    pub order_type: String,
    pub qty_e9: String,
    pub limit_price_e9: Option<String>,
    pub fill_price_e9: Option<String>,
    pub status: String,
    pub created_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperAccountSnapshotDto {
    pub mode: String,
    pub live_armed: bool,
    pub net_position_e9: BTreeMap<String, String>,
    pub orders: Vec<PaperOrderTicketDto>,
}

struct SymbolMeta {
    id: InstrumentId,
    symbol: &'static str,
    base_price_e9: i64,
    tick_size_e9: i64,
}

const SYMBOLS: &[SymbolMeta] = &[
    SymbolMeta {
        id: InstrumentId(1),
        symbol: "BTC/USD",
        base_price_e9: 95_000_000_000_000,
        tick_size_e9: 500_000_000,
    },
    SymbolMeta {
        id: InstrumentId(2),
        symbol: "ETH/USD",
        base_price_e9: 3_420_000_000_000,
        tick_size_e9: 100_000_000,
    },
    SymbolMeta {
        id: InstrumentId(3),
        symbol: "SOL/USD",
        base_price_e9: 185_000_000_000,
        tick_size_e9: 10_000_000,
    },
    SymbolMeta {
        id: InstrumentId(4),
        symbol: "ESZ26",
        base_price_e9: 6_020_000_000_000,
        tick_size_e9: 250_000_000,
    },
    SymbolMeta {
        id: InstrumentId(5),
        symbol: "NQZ26",
        base_price_e9: 21_150_000_000_000,
        tick_size_e9: 250_000_000,
    },
    SymbolMeta {
        id: InstrumentId(6),
        symbol: "NVDA",
        base_price_e9: 142_000_000_000,
        tick_size_e9: 10_000_000,
    },
    SymbolMeta {
        id: InstrumentId(7),
        symbol: "SPY",
        base_price_e9: 598_000_000_000,
        tick_size_e9: 10_000_000,
    },
];

fn symbol_meta_by_name(sym: &str) -> Option<&'static SymbolMeta> {
    SYMBOLS.iter().find(|m| m.symbol == sym)
}

fn symbol_name_by_id(id: u32) -> &'static str {
    SYMBOLS
        .iter()
        .find(|m| m.id.0 == id)
        .map_or("BTC/USD", |m| m.symbol)
}

pub struct AllegedlyRuntime {
    pub config: BootConfig,
    pub settings: ConfigCascade,
    pub workspace_hub: WorkspaceStateHub,
    pub footprint: FootprintSlabArena,
    pub tpo: TpoProfile,
    pub batcher: FrameBatcher,
    pub sim: SyntheticSimProvider,
    pub study_pool: GlobalStudyMemoryPool,
    pub replay: ReplaySession,
    pub oms: LocalPaperOms,
    pub book_state: BookState,
    mark_prices_e9: BTreeMap<u32, i64>,
    vrvp_bins: BTreeMap<i64, (i64, i64)>,
    frame_seq: u64,
    active_symbol: String,
    active_tick_size_e9: i64,
}

impl AllegedlyRuntime {
    /// Boot the offline-default runtime backed by a crash-safe SQLite WAL OMS journal at `data_dir`.
    pub fn boot_offline_with_data_dir(data_dir: &Path) -> Result<Self, String> {
        let _ = std::fs::create_dir_all(data_dir);
        let wal_path: PathBuf = data_dir.join("paper_oms.sqlite");
        let journal = OrderJournal::open(&wal_path, JournalMode::PaperSim)
            .map_err(|e| format!("failed to open SQLite WAL OMS journal: {e}"))?;
        let oms = LocalPaperOms::new(journal);

        let mut replay_seed = SyntheticSimProvider::new(
            InstrumentId(1),
            0x5EED_4E91,
            95_000_000_000_000,
            500_000_000,
            1_732_500_000_000_000_000,
        );
        let replay_ticks = (0..2_000).map(|_| replay_seed.next_tick()).collect();
        let replay = ReplaySession::from_ticks(replay_ticks, 60_000_000_000, 500_000_000);

        let mut mark_prices_e9 = BTreeMap::new();
        for m in SYMBOLS {
            mark_prices_e9.insert(m.id.0, m.base_price_e9);
        }

        Ok(Self {
            config: BootConfig::default(),
            settings: ConfigCascade::with_v01_defaults(),
            workspace_hub: WorkspaceStateHub::default(),
            footprint: FootprintSlabArena::new(60_000_000_000, 500_000_000, Bps(30_000)),
            tpo: TpoProfile::default(),
            batcher: FrameBatcher::new(1),
            sim: SyntheticSimProvider::new(
                InstrumentId(1),
                0xA11E_6ED1,
                95_000_000_000_000,
                500_000_000,
                1_732_500_000_000_000_000,
            ),
            study_pool: GlobalStudyMemoryPool::default(),
            replay,
            oms,
            book_state: BookState::Live,
            mark_prices_e9,
            vrvp_bins: BTreeMap::new(),
            frame_seq: 0,
            active_symbol: "BTC/USD".to_string(),
            active_tick_size_e9: 500_000_000,
        })
    }

    /// Convenience offline default using a per-process temp directory (tests & headless harnesses).
    pub fn boot_offline_default() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "allegedly-runtime-{}-{}",
            std::process::id(),
            Uuid::now_v7()
        ));
        Self::boot_offline_with_data_dir(&dir).expect("temp directory SQLite WAL journal must open")
    }

    pub fn apply_workspace_patch(&mut self, patch: WorkspacePatch) -> WorkspacePatchResult {
        let res = self.workspace_hub.apply_patch(patch);
        if res.accepted {
            let snap = self.workspace_hub.snapshot();
            if let Some(sym) = snap.link_group_symbols.get(&'A')
                && sym != &self.active_symbol
                && let Some(meta) = symbol_meta_by_name(sym)
            {
                self.active_symbol = meta.symbol.to_string();
                self.active_tick_size_e9 = meta.tick_size_e9;
                let base = self
                    .mark_prices_e9
                    .get(&meta.id.0)
                    .copied()
                    .unwrap_or(meta.base_price_e9);
                self.sim = SyntheticSimProvider::new(
                    meta.id,
                    0xA11E_6ED1 ^ u64::from(meta.id.0),
                    base,
                    meta.tick_size_e9,
                    1_732_500_000_000_000_000,
                );
                self.footprint =
                    FootprintSlabArena::new(60_000_000_000, meta.tick_size_e9, Bps(30_000));
                self.tpo = TpoProfile::default();
                self.vrvp_bins.clear();
            }
        }
        res
    }

    /// Delegate paper order submission to `LocalPaperOms` + `RiskGate` + SQLite WAL (RTSD-01).
    pub fn submit_paper_order(
        &mut self,
        payload: PaperOrderSubmission,
        now_ns: i64,
    ) -> Result<PaperAccountSnapshotDto, String> {
        if is_forbidden_adapter("PaperSim") {
            return Err("adapter blocked by policy".into());
        }
        let meta = symbol_meta_by_name(&payload.symbol)
            .ok_or_else(|| format!("unknown instrument symbol: {}", payload.symbol))?;

        let side = match payload.side.as_str() {
            "buy" => OrderSide::Buy,
            "sell" => OrderSide::Sell,
            other => {
                return Err(format!(
                    "invalid side '{other}': expected strictly 'buy' or 'sell'"
                ));
            }
        };
        let order_type = match payload.order_type.as_str() {
            "market" => OrderType::Market,
            "limit" => OrderType::Limit,
            other => {
                return Err(format!(
                    "invalid order_type '{other}': expected strictly 'market' or 'limit'"
                ));
            }
        };

        let qty_val: i64 = payload
            .qty_e9
            .parse()
            .map_err(|_| "invalid fixed-point qty_e9".to_string())?;
        if qty_val <= 0 {
            return Err("qty_e9 must be strictly positive".to_string());
        }

        let limit_price = match (&order_type, payload.limit_price_e9.as_deref()) {
            (OrderType::Limit, Some(p_str)) => {
                let p_val: i64 = p_str
                    .parse()
                    .map_err(|_| "invalid fixed-point limit_price_e9".to_string())?;
                if p_val <= 0 {
                    return Err("limit_price_e9 must be strictly positive".to_string());
                }
                Some(PriceE9(p_val))
            }
            (OrderType::Limit, None) => {
                return Err("limit orders require limit_price_e9".to_string());
            }
            (OrderType::Market, _) => None,
            _ => None,
        };

        let mark_px = self
            .mark_prices_e9
            .get(&meta.id.0)
            .copied()
            .unwrap_or(meta.base_price_e9);

        let req = OrderRequest {
            client_order_id: Uuid::now_v7(),
            instrument_id: meta.id,
            side,
            order_type,
            qty: QtyE9(qty_val),
            limit_price,
            reduce_only: payload.reduce_only,
            oco_group_id: None,
        };

        self.oms
            .submit_order_with_mark(
                req,
                self.book_state,
                false,
                Some(PriceE9(mark_px)),
                TimestampNs(now_ns),
            )
            .map_err(|e| e.to_string())?;

        Ok(self.paper_account_snapshot())
    }

    pub fn paper_account_snapshot(&self) -> PaperAccountSnapshotDto {
        let mut net_position_e9 = BTreeMap::new();
        for (&inst_id, &qty) in self.oms.positions_snapshot() {
            if qty != 0 {
                net_position_e9.insert(symbol_name_by_id(inst_id).to_string(), qty.to_string());
            }
        }
        let orders = self
            .oms
            .orders_snapshot()
            .into_iter()
            .take(50)
            .map(|o| {
                let status = match o.state {
                    OrderState::Filled => "filled",
                    OrderState::Canceled | OrderState::Rejected => "canceled",
                    _ => "working",
                };
                let fill_price_e9 = if o.state == OrderState::Filled {
                    o.limit_price.map(|p| p.0.to_string())
                } else {
                    None
                };
                PaperOrderTicketDto {
                    order_id: o.client_order_id.to_string(),
                    symbol: symbol_name_by_id(o.instrument_id.0).to_string(),
                    side: match o.side {
                        OrderSide::Buy => "buy".into(),
                        OrderSide::Sell => "sell".into(),
                    },
                    order_type: match o.order_type {
                        OrderType::Market => "market".into(),
                        OrderType::Limit => "limit".into(),
                        OrderType::Stop => "stop".into(),
                        OrderType::StopLimit => "stop_limit".into(),
                    },
                    qty_e9: o.qty.0.to_string(),
                    limit_price_e9: o.limit_price.map(|p| p.0.to_string()),
                    fill_price_e9,
                    status: status.into(),
                    created_ms: (o.updated_ns.0.max(0) as u64) / 1_000_000,
                }
            })
            .collect();

        PaperAccountSnapshotDto {
            mode: "PAPER / SIM".to_string(),
            live_armed: self.oms.live_armed(),
            net_position_e9,
            orders,
        }
    }

    pub fn kill_switch_cancel_all(
        &mut self,
        now_ns: i64,
    ) -> Result<PaperAccountSnapshotDto, String> {
        self.oms
            .trigger_kill_switch(TimestampNs(now_ns))
            .map_err(|e| e.to_string())?;
        Ok(self.paper_account_snapshot())
    }

    /// Advance the sim pipeline and emit the full canonical ALG2 v1 binary frame set:
    /// `LIVE_TRADE_BATCH`, `LIVE_BAR_UPDATE_BATCH`, `LIVE_FOOTPRINT_DELTA`,
    /// `LIVE_L2_BOOK_BATCH`, `VOLUME_PROFILE_SOA`, `TPO_PROFILE_BITMASK`, and `STREAM_STATUS_FRAME`
    /// while bounding `FootprintSlabArena` history to `MAX_LIVE_FOOTPRINT_BARS` (RTSD-02).
    pub fn step_sim_frames(&mut self, count: usize, now_ns: u64) -> Vec<Vec<u8>> {
        let mut frames = Vec::with_capacity(7);
        let mut last_price_e9 = self
            .mark_prices_e9
            .get(&1)
            .copied()
            .unwrap_or(95_000_000_000_000);
        let mut active_inst_id = 1u32;

        for _ in 0..count {
            let tick = self.sim.next_tick();
            active_inst_id = tick.instrument_id;
            last_price_e9 = tick.price_e9;
            self.mark_prices_e9
                .insert(tick.instrument_id, tick.price_e9);
            self.footprint.ingest_tick(&tick);

            let price_tick = tick.price_e9.div_euclid(self.active_tick_size_e9);
            let entry = self.vrvp_bins.entry(price_tick).or_insert((0, 0));
            if tick.side == 1 {
                entry.1 = entry.1.saturating_add(tick.qty_e9);
            } else {
                entry.0 = entry.0.saturating_add(tick.qty_e9);
            }
            let period = ((self.frame_seq / 12) % 96) as u16;
            self.tpo.record_bracket(period, price_tick, price_tick);

            self.batcher.push_trade(LiveTradeRecord {
                seq: tick.seq,
                ts_ns: tick.ts_exchange_ns,
                price_e9: tick.price_e9,
                qty_e9: tick.qty_e9,
                flags: pack_trade_flags(
                    tick.side,
                    tick.tier(),
                    ProvenanceModifiers(tick.provenance_modifiers),
                    false,
                ),
                _pad: 0,
            });
        }

        // Enforce strict bar memory bound (RTSD-02)
        if self.footprint.bars.len() > MAX_LIVE_FOOTPRINT_BARS {
            self.footprint.evict_oldest_bars(MAX_LIVE_FOOTPRINT_BARS);
        }

        self.frame_seq = self.frame_seq.saturating_add(1);
        let stream_id = 1u32;

        // 1. LIVE_TRADE_BATCH (0x0101)
        if let Some(trade_frame) = self.batcher.maybe_flush_trades(now_ns, true) {
            frames.push(trade_frame);
        }

        // 2. LIVE_BAR_UPDATE_BATCH (0x0103)
        if let (Some(ts_open_ns), Some((open_tick, high_tick, low_tick, close_tick))) = (
            self.footprint.active_bar_ts_ns(),
            self.footprint.active_ohlc(),
        ) {
            let (vol, buy_vol, sell_vol) = self.footprint.active_totals();
            frames.push(encode_live_bar_update_batch(
                stream_id,
                now_ns,
                &[LiveBarUpdate {
                    ts_open_ns,
                    open_tick,
                    high_tick,
                    low_tick,
                    close_tick,
                    volume_e9: vol,
                    buy_vol_e9: buy_vol,
                    sell_vol_e9: sell_vol,
                    flags: 0,
                }],
            ));
        }

        // 3. LIVE_FOOTPRINT_DELTA (0x0104)
        let active_cells = self.footprint.active_cells_snapshot();
        if !active_cells.is_empty() {
            frames.push(encode_footprint_delta(stream_id, now_ns, &active_cells));
        }

        // 4. LIVE_L2_BOOK_BATCH (0x0102) — deterministic synthetic 12-level bid/ask ladder around live mark
        let tick_sz = self.active_tick_size_e9;
        let mid_tick = last_price_e9.div_euclid(tick_sz);
        let mut levels = Vec::with_capacity(24);
        for depth in 1..=12i64 {
            let ask_px = (mid_tick + depth) * tick_sz;
            let bid_px = (mid_tick - depth + 1) * tick_sz;
            let qty_base =
                1_000_000_000i64 + (((self.frame_seq as i64 + depth * 7) % 11) * 250_000_000);
            levels.push(LiveL2BookLevel {
                price_e9: ask_px,
                qty_e9: qty_base,
                side_action_flags: 1, // Ask
                order_count: (depth as u32) + 2,
            });
            levels.push(LiveL2BookLevel {
                price_e9: bid_px,
                qty_e9: qty_base + 150_000_000,
                side_action_flags: 0, // Bid
                order_count: (depth as u32) + 3,
            });
        }
        frames.push(encode_live_l2_book_batch(
            stream_id,
            now_ns,
            LiveL2BookHeader {
                book_seq: self.frame_seq,
                level_count: levels.len() as u32,
                book_state: self.book_state as u8,
                is_snapshot: 1,
                provenance_tier: ProvenanceTier::ExactTickAggr as u8,
                provenance_modifiers: 0,
            },
            &levels,
        ));

        // 5. VOLUME_PROFILE_SOA (0x0003) & 6. TPO_PROFILE_BITMASK (0x0004) every 4th step
        if self.frame_seq.is_multiple_of(4) && !self.vrvp_bins.is_empty() {
            let bins: Vec<VolumeProfileBin> = self
                .vrvp_bins
                .iter()
                .map(
                    |(&price_tick, &(bid_vol_e9, ask_vol_e9))| VolumeProfileBin {
                        price_tick,
                        bid_vol_e9,
                        ask_vol_e9,
                    },
                )
                .collect();
            let summary: VolumeProfileSummary = compute_value_area(&bins, 7_000);
            frames.push(encode_volume_profile(stream_id, now_ns, summary, &bins));

            let tpo_rows: Vec<TpoRow128> = self.tpo.rows_128();
            if !tpo_rows.is_empty() {
                frames.push(encode_tpo_profile_bitmask(
                    stream_id,
                    now_ns,
                    TpoHeader {
                        words_per_row: 2,
                        period_count: self.tpo.period_count(),
                        _pad: 0,
                    },
                    &tpo_rows,
                ));
            }
        }

        // 7. STREAM_STATUS_FRAME (0x0201) on first tick and every 8th step
        if self.frame_seq == 1 || self.frame_seq.is_multiple_of(8) {
            let _ = active_inst_id;
            frames.push(self.batcher.emit_status_immediate(
                now_ns,
                StreamStatusFrame::new(
                    self.frame_seq,
                    self.batcher.dropped_overflow().min(u64::from(u32::MAX)) as u32,
                    0,
                    self.book_state,
                    ProvenanceTier::ExactTickAggr,
                ),
            ));
        }

        frames
    }

    pub fn step_sim_batch(&mut self, count: usize, now_ns: u64) -> Option<Vec<u8>> {
        self.step_sim_frames(count, now_ns).into_iter().next()
    }

    /// Pack a slice of ALG2 frames into a single length-prefixed binary buffer `[u32_le_len][frame]...`
    /// for zero-JSON `tauri::ipc::Response::new(bytes)` transfer (ADR-0002 / RTSD-02).
    pub fn pack_frames_raw(frames: &[Vec<u8>]) -> Vec<u8> {
        let total: usize = frames.iter().map(|f| 4 + f.len()).sum();
        let mut out = Vec::with_capacity(total);
        for f in frames {
            out.extend_from_slice(&(f.len() as u32).to_le_bytes());
            out.extend_from_slice(f);
        }
        out
    }

    pub fn run_study(&self, req: &StudyRunRequest) -> Result<StudyRunResponse, String> {
        evaluate_study_request(&self.study_pool, req)
    }

    pub fn replay_status(&self) -> ReplayStatusSnapshot {
        self.replay.status()
    }

    pub fn control_replay(&mut self, action: ReplayControlAction) -> ReplayStatusSnapshot {
        self.replay.apply_control(action)
    }

    pub fn resolved_settings(&self) -> Vec<ResolvedSetting> {
        self.settings.resolved_settings()
    }

    pub fn set_setting_override(
        &mut self,
        key: String,
        value: String,
    ) -> Result<Vec<ResolvedSetting>, String> {
        self.settings.try_set_instance_override(key, value)?;
        Ok(self.settings.resolved_settings())
    }

    pub fn reset_setting_override(&mut self, key: &str) -> Vec<ResolvedSetting> {
        self.settings.reset_to_inherited(key);
        self.settings.resolved_settings()
    }

    pub fn export_workspace_toml(&self, name: &str, symbol: &str, timeframe: &str) -> String {
        self.settings
            .export_atworkspace_toml(name, symbol, timeframe)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_ipc::{FrameType, decode_header, decode_live_trade_batch};
    use allegedly_studies::BuiltinStudyKind;
    use std::collections::BTreeSet;

    #[test]
    fn sv01_offline_default_boot_invariants_and_full_7_frame_pipeline() {
        let mut rt = AllegedlyRuntime::boot_offline_default();
        assert!(!rt.config.updates_check_on_startup);
        assert!(!rt.config.live_armed);
        assert!(!rt.workspace_hub.snapshot().live_armed);

        let mut seen_types = BTreeSet::new();
        for step in 1..=8u64 {
            let frames = rt.step_sim_frames(8, step * 16_000_000);
            for f in &frames {
                let hdr = decode_header(f).unwrap();
                seen_types.insert(hdr.frame_type);
                if hdr.frame_type == FrameType::LiveTradeBatch as u16 {
                    let (_, trades) = decode_live_trade_batch(f).unwrap();
                    assert_eq!(trades.len(), 8);
                }
            }
        }
        // Verify ALL 7 canonical ALG2 v1 binary frame types are emitted natively (RTSD-02)
        for expected in [
            FrameType::LiveTradeBatch as u16,
            FrameType::LiveBarUpdateBatch as u16,
            FrameType::LiveFootprintDelta as u16,
            FrameType::LiveL2BookBatch as u16,
            FrameType::VolumeProfileSoa as u16,
            FrameType::TpoProfileBitmask as u16,
            FrameType::StreamStatusFrame as u16,
        ] {
            assert!(
                seen_types.contains(&expected),
                "missing ALG2 frame_type 0x{expected:04X}"
            );
        }

        // Studies, Replay determinism, Settings cascade
        let study = rt
            .run_study(&StudyRunRequest {
                id: "sma-3".into(),
                builtin: Some(BuiltinStudyKind::Sma),
                period: Some(3),
                luau_script: None,
                closes: vec![10.0, 20.0, 30.0, 40.0],
                volumes: vec![],
                buy_volumes: vec![],
                sell_volumes: vec![],
            })
            .unwrap();
        assert_eq!(study.values[2], Some(20.0));

        let replay = rt.control_replay(ReplayControlAction::VerifyDeterminism);
        assert!(replay.determinism_verified);
        assert_eq!(replay.sha256_hex.len(), 64);

        assert!(
            rt.set_setting_override("updates.checkOnStartup".into(), "true".into())
                .is_err()
        );
    }

    #[test]
    fn rtsd01_runtime_oms_wal_persistence_risk_gate_and_symbol_mark_pricing() {
        let dir = std::env::temp_dir().join(format!("allegedly-app-rtsd01-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let mut rt = AllegedlyRuntime::boot_offline_with_data_dir(&dir).unwrap();
        // Invalid side must be rejected (no silent fallback to short sell!)
        assert!(
            rt.submit_paper_order(
                PaperOrderSubmission {
                    symbol: "ETH/USD".into(),
                    side: "BUY".into(),
                    order_type: "market".into(),
                    qty_e9: "1000000000".into(),
                    limit_price_e9: None,
                    reduce_only: false,
                },
                1_000_000
            )
            .is_err()
        );

        // ETH/USD market order fills at ETH mark (~$3,420), NOT hardcoded $95,000!
        let snap = rt
            .submit_paper_order(
                PaperOrderSubmission {
                    symbol: "ETH/USD".into(),
                    side: "buy".into(),
                    order_type: "market".into(),
                    qty_e9: "1000000000".into(),
                    limit_price_e9: None,
                    reduce_only: false,
                },
                2_000_000,
            )
            .unwrap();
        assert_eq!(
            snap.orders[0].fill_price_e9.as_deref(),
            Some("3420000000000")
        );
        assert_eq!(
            snap.net_position_e9.get("ETH/USD").map(String::as_str),
            Some("1000000000")
        );

        // RiskGate rejects entry when BookState::Stale
        rt.book_state = BookState::Stale;
        assert!(
            rt.submit_paper_order(
                PaperOrderSubmission {
                    symbol: "BTC/USD".into(),
                    side: "buy".into(),
                    order_type: "market".into(),
                    qty_e9: "1000000000".into(),
                    limit_price_e9: None,
                    reduce_only: false,
                },
                3_000_000
            )
            .is_err()
        );

        // Restart runtime against the same data_dir -> SQLite WAL crash recovery preserves orders & positions!
        drop(rt);
        let reloaded = AllegedlyRuntime::boot_offline_with_data_dir(&dir).unwrap();
        let reloaded_snap = reloaded.paper_account_snapshot();
        assert_eq!(reloaded_snap.orders.len(), 1);
        assert_eq!(
            reloaded_snap
                .net_position_e9
                .get("ETH/USD")
                .map(String::as_str),
            Some("1000000000")
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
