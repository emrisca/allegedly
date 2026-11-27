use allegedly_core::{
    BookState, Bps, ConfigCascade, InstrumentId, PriceE9, ProvenanceModifiers, ProvenanceTier,
    QtyE9, ResolvedSetting, TimestampNs,
};
use allegedly_ingest::{
    FeedSource, LIVE_CRYPTO_CANONICAL_SYMBOLS, LiveFeedConfig, LiveFeedHandle, LiveL2Snapshot,
    LiveMarketEvent, SyntheticSimProvider,
};
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
const MAX_LIVE_EVENTS_PER_POLL: usize = 4_096;

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketDataStatusDto {
    pub source: String,
    pub symbol: String,
    pub connected: bool,
    pub book_state: String,
    pub provenance_tier: String,
    pub trades_received: u64,
    pub crc_ok: u64,
    pub crc_mismatches: u64,
    pub reconnects: u64,
    pub last_error: Option<String>,
    pub supported_symbols: Vec<String>,
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
    let trimmed = sym.trim();
    if let Some(exact) = SYMBOLS.iter().find(|m| m.symbol == trimmed) {
        return Some(exact);
    }
    let upper = trimmed.to_ascii_uppercase();
    let canonical = match upper.as_str() {
        "BTC-USD" | "XBT/USD" | "XBT-USD" => "BTC/USD",
        "ETH-USD" => "ETH/USD",
        "SOL-USD" => "SOL/USD",
        _ => upper.as_str(),
    };
    SYMBOLS.iter().find(|m| m.symbol == canonical)
}

fn symbol_name_by_id(id: u32) -> &'static str {
    SYMBOLS
        .iter()
        .find(|m| m.id.0 == id)
        .map_or("BTC/USD", |m| m.symbol)
}

fn book_state_str(state: BookState) -> &'static str {
    match state {
        BookState::Live => "live",
        BookState::Stale => "stale",
        BookState::Rebuilding => "rebuilding",
        BookState::Disconnected => "disconnected",
        BookState::Halted => "halted",
    }
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
    feed_source: FeedSource,
    live_feed: Option<LiveFeedHandle>,
    latest_l2: Option<LiveL2Snapshot>,
    live_last_error: Option<String>,
    sim_trades_received: u64,
    last_emitted_dropped: u64,
    mark_prices_e9: BTreeMap<u32, i64>,
    vrvp_bins: BTreeMap<i64, (i64, i64)>,
    frame_seq: u64,
    active_symbol: String,
    active_instrument_id: InstrumentId,
    active_tick_size_e9: i64,
}

impl AllegedlyRuntime {
    /// Boot the offline-default runtime backed by a crash-safe SQLite WAL OMS journal at `data_dir`.
    /// SV-01 invariant: zero network sockets or background WS workers are created at boot.
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
            feed_source: FeedSource::PaperSim,
            live_feed: None,
            latest_l2: None,
            live_last_error: None,
            sim_trades_received: 0,
            last_emitted_dropped: 0,
            mark_prices_e9,
            vrvp_bins: BTreeMap::new(),
            frame_seq: 0,
            active_symbol: "BTC/USD".to_string(),
            active_instrument_id: InstrumentId(1),
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

    /// Switch cleanly between `paper_sim`, `kraken_ws_v2`, and `coinbase_ws` for `symbol`.
    /// Stops any prior background live feed cleanly before switching.
    pub fn set_market_data_source(
        &mut self,
        source: &str,
        symbol: &str,
    ) -> Result<MarketDataStatusDto, String> {
        self.set_market_data_source_with_url(source, symbol, None)
    }

    /// Switch market data source with an optional WebSocket endpoint override (for loopback tests).
    pub fn set_market_data_source_with_url(
        &mut self,
        source: &str,
        symbol: &str,
        ws_url_override: Option<String>,
    ) -> Result<MarketDataStatusDto, String> {
        let parsed_source = FeedSource::parse_str(source).ok_or_else(|| {
            format!(
                "unknown market data source '{source}': expected 'paper_sim', 'kraken_ws_v2', or 'coinbase_ws'"
            )
        })?;

        let paper_list: Vec<&str> = SYMBOLS.iter().map(|m| m.symbol).collect();
        let live_list = LIVE_CRYPTO_CANONICAL_SYMBOLS.join(", ");

        match parsed_source {
            FeedSource::PaperSim => {
                let meta = symbol_meta_by_name(symbol).ok_or_else(|| {
                    format!(
                        "Symbol '{symbol}' is not supported in paper_sim. Paper Sim symbols: {}.",
                        paper_list.join(", ")
                    )
                })?;

                // Cleanly stop any prior live WS worker
                if let Some(mut handle) = self.live_feed.take() {
                    handle.stop();
                }

                self.reset_active_stream_state(meta);
                self.feed_source = FeedSource::PaperSim;
                self.book_state = BookState::Live;
                self.config.offline_mode = true;
                self.live_last_error = None;
                Ok(self.get_market_data_status())
            }
            FeedSource::KrakenWsV2 | FeedSource::CoinbaseAdvTrade => {
                let Some((canonical, _wire)) = parsed_source.resolve_live_symbol(symbol) else {
                    return Err(format!(
                        "Symbol '{}' is not supported on live venue '{}'. Live-supported symbols: {}. Paper Sim symbols: {}.",
                        symbol,
                        parsed_source.as_str(),
                        live_list,
                        paper_list.join(", ")
                    ));
                };

                let meta = symbol_meta_by_name(canonical)
                    .ok_or_else(|| format!("missing metadata for canonical symbol '{canonical}'"))?;

                // Stop prior live worker BEFORE starting the new connection
                if let Some(mut handle) = self.live_feed.take() {
                    handle.stop();
                }

                let mut cfg = LiveFeedConfig::new(parsed_source, canonical, meta.id);
                cfg.ws_url_override = ws_url_override;
                let handle = LiveFeedHandle::start(cfg)?;

                self.reset_active_stream_state(meta);
                self.feed_source = parsed_source;
                self.book_state = BookState::Rebuilding;
                self.config.offline_mode = false;
                self.live_last_error = None;
                self.live_feed = Some(handle);
                Ok(self.get_market_data_status())
            }
        }
    }

    fn reset_active_stream_state(&mut self, meta: &SymbolMeta) {
        self.active_symbol = meta.symbol.to_string();
        self.active_instrument_id = meta.id;
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
        self.footprint = FootprintSlabArena::new(60_000_000_000, meta.tick_size_e9, Bps(30_000));
        self.tpo = TpoProfile::default();
        self.vrvp_bins.clear();
        self.latest_l2 = None;
        self.batcher = FrameBatcher::new(1);
        self.frame_seq = 0;
        self.last_emitted_dropped = 0;
    }

    /// Return current market data connection, book integrity, provenance, and supported symbols.
    pub fn get_market_data_status(&self) -> MarketDataStatusDto {
        match self.feed_source {
            FeedSource::PaperSim => MarketDataStatusDto {
                source: FeedSource::PaperSim.as_str().to_string(),
                symbol: self.active_symbol.clone(),
                connected: true,
                book_state: book_state_str(self.book_state).to_string(),
                provenance_tier: "SYNTHETIC: PAPER-SIM".to_string(),
                trades_received: self.sim_trades_received,
                crc_ok: 0,
                crc_mismatches: 0,
                reconnects: 0,
                last_error: self.live_last_error.clone(),
                supported_symbols: SYMBOLS.iter().map(|m| m.symbol.to_string()).collect(),
            },
            FeedSource::KrakenWsV2 | FeedSource::CoinbaseAdvTrade => {
                let supported_symbols = LIVE_CRYPTO_CANONICAL_SYMBOLS
                    .iter()
                    .map(|s| (*s).to_string())
                    .collect();
                if let Some(ref handle) = self.live_feed {
                    let st = handle.status_snapshot();
                    MarketDataStatusDto {
                        source: self.feed_source.as_str().to_string(),
                        symbol: self.active_symbol.clone(),
                        connected: st.connected,
                        book_state: book_state_str(st.book_state).to_string(),
                        provenance_tier: st.provenance_tier.badge_label().to_string(),
                        trades_received: st.trades_received,
                        crc_ok: st.crc_ok,
                        crc_mismatches: st.crc_mismatches,
                        reconnects: st.reconnects,
                        last_error: st.last_error.or_else(|| self.live_last_error.clone()),
                        supported_symbols,
                    }
                } else {
                    MarketDataStatusDto {
                        source: self.feed_source.as_str().to_string(),
                        symbol: self.active_symbol.clone(),
                        connected: false,
                        book_state: book_state_str(BookState::Disconnected).to_string(),
                        provenance_tier: ProvenanceTier::ExactTickAggr.badge_label().to_string(),
                        trades_received: 0,
                        crc_ok: 0,
                        crc_mismatches: 0,
                        reconnects: 0,
                        last_error: self.live_last_error.clone(),
                        supported_symbols,
                    }
                }
            }
        }
    }

    pub fn apply_workspace_patch(&mut self, patch: WorkspacePatch) -> WorkspacePatchResult {
        let res = self.workspace_hub.apply_patch(patch);
        if res.accepted {
            let snap = self.workspace_hub.snapshot();
            if let Some(sym) = snap.link_group_symbols.get(&'A').cloned()
                && sym != self.active_symbol
                && let Some(meta) = symbol_meta_by_name(&sym)
            {
                match self.feed_source {
                    FeedSource::PaperSim => {
                        self.reset_active_stream_state(meta);
                    }
                    FeedSource::KrakenWsV2 | FeedSource::CoinbaseAdvTrade => {
                        let src_str = self.feed_source.as_str();
                        if let Err(err) = self.set_market_data_source(src_str, meta.symbol) {
                            // Zero silent fallback to synthetic data: stop live feed & surface explicit error.
                            if let Some(mut handle) = self.live_feed.take() {
                                handle.stop();
                            }
                            self.reset_active_stream_state(meta);
                            self.book_state = BookState::Disconnected;
                            self.live_last_error = Some(err);
                        }
                    }
                }
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

    /// Unified polling entrypoint for Tauri IPC:
    /// - In `paper_sim` mode: behaves identically to `step_sim_frames(8, now_ns)`.
    /// - In live mode (`kraken_ws_v2` / `coinbase_ws`): drains bounded live events, updates
    ///   `FootprintSlabArena`, `TpoProfile`, `vrvp_bins`, `mark_prices_e9`, and encodes real
    ///   `ALG2` v1 binary frames.
    pub fn poll_live_or_sim_frames(&mut self, now_ns: u64) -> Vec<Vec<u8>> {
        if self.feed_source == FeedSource::PaperSim {
            return self.step_sim_frames(8, now_ns);
        }

        let mut drained = Vec::new();
        if let Some(ref mut handle) = self.live_feed {
            for _ in 0..MAX_LIVE_EVENTS_PER_POLL {
                match handle.try_recv() {
                    Some(ev) => drained.push(ev),
                    None => break,
                }
            }
        }
        self.process_live_events_into_frames(drained, now_ns)
    }

    fn process_live_events_into_frames(
        &mut self,
        events: Vec<LiveMarketEvent>,
        now_ns: u64,
    ) -> Vec<Vec<u8>> {
        let mut frames = Vec::with_capacity(7);
        let stream_id = 1u32;
        let tick_sz = self.active_tick_size_e9.max(1);

        let mut trades_drained = 0usize;
        let mut l2_dirty = false;
        let mut status_dirty = false;
        let mut ohlc_bars: Vec<LiveBarUpdate> = Vec::new();

        for ev in events {
            match ev {
                LiveMarketEvent::Trade(tick) => {
                    trades_drained += 1;
                    self.mark_prices_e9
                        .insert(tick.instrument_id, tick.price_e9);
                    self.footprint.ingest_tick(&tick);

                    let price_tick = tick.price_e9.div_euclid(tick_sz);
                    let entry = self.vrvp_bins.entry(price_tick).or_insert((0, 0));
                    if tick.side == 1 {
                        entry.1 = entry.1.saturating_add(tick.qty_e9);
                    } else if tick.side == 2 {
                        entry.0 = entry.0.saturating_add(tick.qty_e9);
                    }
                    let period = (tick.ts_exchange_ns.div_euclid(1_800_000_000_000)).rem_euclid(96)
                        as u16;
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
                LiveMarketEvent::L2Snapshot(snap) => {
                    if self.book_state != snap.book_state {
                        self.book_state = snap.book_state;
                        status_dirty = true;
                    }
                    if let (Some((best_bid, _)), Some((best_ask, _))) =
                        (snap.bids.first(), snap.asks.first())
                    {
                        let mid = ((i128::from(*best_bid) + i128::from(*best_ask)) / 2) as i64;
                        self.mark_prices_e9
                            .entry(self.active_instrument_id.0)
                            .or_insert(mid);
                    }
                    self.latest_l2 = Some(snap);
                    l2_dirty = true;
                }
                LiveMarketEvent::OhlcBar(bar) => {
                    let open_tick = bar.open_e9.div_euclid(tick_sz);
                    let high_tick = bar.high_e9.div_euclid(tick_sz);
                    let low_tick = bar.low_e9.div_euclid(tick_sz);
                    let close_tick = bar.close_e9.div_euclid(tick_sz);
                    self.mark_prices_e9
                        .insert(self.active_instrument_id.0, bar.close_e9);

                    let period =
                        (bar.ts_open_ns.div_euclid(1_800_000_000_000)).rem_euclid(96) as u16;
                    self.tpo
                        .record_bracket(period, low_tick.min(high_tick), high_tick.max(low_tick));

                    ohlc_bars.push(LiveBarUpdate {
                        ts_open_ns: bar.ts_open_ns,
                        open_tick,
                        high_tick,
                        low_tick,
                        close_tick,
                        volume_e9: bar.volume_e9,
                        buy_vol_e9: 0,
                        sell_vol_e9: 0,
                        flags: 0,
                    });
                }
                LiveMarketEvent::Status(state, msg) => {
                    if self.book_state != state {
                        self.book_state = state;
                        status_dirty = true;
                    }
                    if state != BookState::Live {
                        self.live_last_error = Some(msg);
                    } else {
                        self.live_last_error = None;
                    }
                }
            }
        }

        // Enforce strict bar memory bound (RTSD-02)
        if self.footprint.bars.len() > MAX_LIVE_FOOTPRINT_BARS {
            self.footprint.evict_oldest_bars(MAX_LIVE_FOOTPRINT_BARS);
        }

        // Inspect live worker counters for ring drops or state changes
        let mut dropped_total: u64 = self.batcher.dropped_overflow();
        if let Some(ref handle) = self.live_feed {
            let st = handle.status_snapshot();
            dropped_total = dropped_total.saturating_add(st.dropped_events);
            if st.dropped_events > self.last_emitted_dropped {
                self.last_emitted_dropped = st.dropped_events;
                self.book_state = BookState::Stale;
                status_dirty = true;
            } else if self.book_state != st.book_state {
                self.book_state = st.book_state;
                status_dirty = true;
            }
        }

        self.frame_seq = self.frame_seq.saturating_add(1);

        // 1. LIVE_TRADE_BATCH (0x0101)
        if trades_drained > 0
            && let Some(trade_frame) = self.batcher.maybe_flush_trades(now_ns, true)
        {
            frames.push(trade_frame);
        }

        // 2. LIVE_BAR_UPDATE_BATCH (0x0103)
        if let (Some(ts_open_ns), Some((open_tick, high_tick, low_tick, close_tick))) = (
            self.footprint.active_bar_ts_ns(),
            self.footprint.active_ohlc(),
        ) {
            let (vol, buy_vol, sell_vol) = self.footprint.active_totals();
            let mut merged = false;
            for bar in &mut ohlc_bars {
                if bar.ts_open_ns == ts_open_ns {
                    bar.buy_vol_e9 = buy_vol;
                    bar.sell_vol_e9 = sell_vol;
                    merged = true;
                }
            }
            if !merged && trades_drained > 0 {
                ohlc_bars.push(LiveBarUpdate {
                    ts_open_ns,
                    open_tick,
                    high_tick,
                    low_tick,
                    close_tick,
                    volume_e9: vol,
                    buy_vol_e9: buy_vol,
                    sell_vol_e9: sell_vol,
                    flags: 0,
                });
            }
        }
        if !ohlc_bars.is_empty() {
            frames.push(encode_live_bar_update_batch(stream_id, now_ns, &ohlc_bars));
        }

        // 3. LIVE_FOOTPRINT_DELTA (0x0104)
        if trades_drained > 0 {
            let active_cells = self.footprint.active_cells_snapshot();
            if !active_cells.is_empty() {
                frames.push(encode_footprint_delta(stream_id, now_ns, &active_cells));
            }
        }

        // 4. LIVE_L2_BOOK_BATCH (0x0102)
        if l2_dirty && let Some(ref snap) = self.latest_l2 {
            let mut levels = Vec::with_capacity(snap.asks.len() + snap.bids.len());
            for &(price_e9, qty_e9) in &snap.asks {
                levels.push(LiveL2BookLevel {
                    price_e9,
                    qty_e9,
                    side_action_flags: 1, // Ask
                    order_count: 0,
                });
            }
            for &(price_e9, qty_e9) in &snap.bids {
                levels.push(LiveL2BookLevel {
                    price_e9,
                    qty_e9,
                    side_action_flags: 0, // Bid
                    order_count: 0,
                });
            }
            frames.push(encode_live_l2_book_batch(
                stream_id,
                now_ns,
                LiveL2BookHeader {
                    book_seq: snap.book_seq,
                    level_count: levels.len() as u32,
                    book_state: snap.book_state as u8,
                    is_snapshot: 1,
                    provenance_tier: snap.provenance_tier as u8,
                    provenance_modifiers: 0,
                },
                &levels,
            ));
        }

        // 5. VOLUME_PROFILE_SOA (0x0003) & 6. TPO_PROFILE_BITMASK (0x0004)
        if (trades_drained > 0 || !ohlc_bars.is_empty())
            && (self.frame_seq <= 1 || self.frame_seq.is_multiple_of(4))
        {
            if !self.vrvp_bins.is_empty() {
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
            }
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

        // 7. STREAM_STATUS_FRAME (0x0201) immediately on state/drop transition and periodically
        if status_dirty || self.frame_seq == 1 || self.frame_seq.is_multiple_of(8) {
            let reason_code = if self.book_state == BookState::Stale {
                1
            } else {
                0
            };
            frames.push(self.batcher.emit_status_immediate(
                now_ns,
                StreamStatusFrame::new(
                    self.frame_seq,
                    dropped_total.min(u64::from(u32::MAX)) as u32,
                    reason_code,
                    self.book_state,
                    ProvenanceTier::ExactTickAggr,
                ),
            ));
        }

        frames
    }

    /// Advance the sim pipeline and emit the full canonical ALG2 v1 binary frame set:
    /// `LIVE_TRADE_BATCH`, `LIVE_BAR_UPDATE_BATCH`, `LIVE_FOOTPRINT_DELTA`,
    /// `LIVE_L2_BOOK_BATCH`, `VOLUME_PROFILE_SOA`, `TPO_PROFILE_BITMASK`, and `STREAM_STATUS_FRAME`
    /// while bounding `FootprintSlabArena` history to `MAX_LIVE_FOOTPRINT_BARS` (RTSD-02).
    pub fn step_sim_frames(&mut self, count: usize, now_ns: u64) -> Vec<Vec<u8>> {
        let mut frames = Vec::with_capacity(7);
        let mut last_price_e9 = self
            .mark_prices_e9
            .get(&self.active_instrument_id.0)
            .copied()
            .unwrap_or(95_000_000_000_000);
        let mut active_inst_id = self.active_instrument_id.0;

        for _ in 0..count {
            let tick = self.sim.next_tick();
            self.sim_trades_received = self.sim_trades_received.saturating_add(1);
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
    use allegedly_core::{AggressorSide, NormalizedTick};
    use allegedly_ingest::LiveOhlcBar;
    use allegedly_ipc::{FrameType, decode_header, decode_live_trade_batch, decode_stream_status};
    use allegedly_studies::BuiltinStudyKind;
    use std::collections::BTreeSet;

    #[test]
    fn sv01_offline_default_boot_invariants_and_full_7_frame_pipeline() {
        let mut rt = AllegedlyRuntime::boot_offline_default();
        assert!(!rt.config.updates_check_on_startup);
        assert!(!rt.config.live_armed);
        assert!(rt.config.offline_mode);
        assert!(!rt.workspace_hub.snapshot().live_armed);
        let status = rt.get_market_data_status();
        assert_eq!(status.source, "paper_sim");
        assert_eq!(status.symbol, "BTC/USD");
        assert!(status.connected);
        assert_eq!(status.book_state, "live");

        let mut seen_types = BTreeSet::new();
        for step in 1..=8u64 {
            let frames = rt.poll_live_or_sim_frames(step * 16_000_000);
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
    fn live_event_drain_encodes_all_7_alg2_frames_and_stale_status() {
        let mut rt = AllegedlyRuntime::boot_offline_default();
        let ts_ns = 1_795_744_800_000_000_000i64;
        let tick = NormalizedTick::new(
            TimestampNs(ts_ns + 5_000_000_000),
            TimestampNs(ts_ns + 5_000_000_000),
            InstrumentId(1),
            42,
            PriceE9(95_001_000_000_000),
            QtyE9(250_000_000),
            PriceE9(95_000_000_000_000),
            PriceE9(95_001_000_000_000),
            AggressorSide::Buy,
            ProvenanceTier::ExactTickAggr,
            ProvenanceModifiers::NONE,
        );
        let events = vec![
            LiveMarketEvent::Status(BookState::Live, "kraken_book_live".into()),
            LiveMarketEvent::L2Snapshot(LiveL2Snapshot {
                book_seq: 1,
                bids: vec![(95_000_000_000_000, 2_000_000_000)],
                asks: vec![(95_001_000_000_000, 1_500_000_000)],
                book_state: BookState::Live,
                provenance_tier: ProvenanceTier::ExactTickAggr,
            }),
            LiveMarketEvent::OhlcBar(LiveOhlcBar {
                ts_open_ns: ts_ns,
                open_e9: 94_990_000_000_000,
                high_e9: 95_010_000_000_000,
                low_e9: 94_980_000_000_000,
                close_e9: 95_001_000_000_000,
                volume_e9: 10_000_000_000,
                interval_mins: 1,
            }),
            LiveMarketEvent::Trade(tick),
        ];

        let frames = rt.process_live_events_into_frames(events, 100_000);
        let mut seen = BTreeSet::new();
        for f in &frames {
            let hdr = decode_header(f).unwrap();
            seen.insert(hdr.frame_type);
        }
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
                seen.contains(&expected),
                "missing live ALG2 frame_type 0x{expected:04X}"
            );
        }
        assert_eq!(rt.mark_prices_e9.get(&1).copied(), Some(95_001_000_000_000));

        // Transition to BookState::Stale must emit STREAM_STATUS_FRAME immediately
        let stale_frames = rt.process_live_events_into_frames(
            vec![LiveMarketEvent::Status(
                BookState::Stale,
                "kraken_crc32_mismatch".into(),
            )],
            200_000,
        );
        assert_eq!(stale_frames.len(), 1);
        let (_, st_frame) = decode_stream_status(&stale_frames[0]).unwrap();
        assert_eq!(st_frame.book_state, BookState::Stale as u8);
        assert_eq!(st_frame.reason_code, 1);
    }

    #[test]
    fn live_source_rejects_unsupported_futures_symbols_with_clear_error() {
        let mut rt = AllegedlyRuntime::boot_offline_default();
        let err_nq = rt
            .set_market_data_source("kraken_ws_v2", "NQ1!")
            .unwrap_err();
        assert!(err_nq.contains("NQ1!"));
        assert!(err_nq.contains("BTC/USD"));
        assert!(err_nq.contains("Paper Sim"));

        let err_es = rt
            .set_market_data_source("coinbase_ws", "ES1!")
            .unwrap_err();
        assert!(err_es.contains("ES1!"));
        assert!(err_es.contains("coinbase_ws"));

        // Runtime remains safely on offline paper_sim default after rejected switch
        assert!(rt.config.offline_mode);
        assert_eq!(rt.get_market_data_status().source, "paper_sim");
    }

    #[test]
    fn switching_back_to_paper_sim_restores_offline_mode_and_sim_frames() {
        let mut rt = AllegedlyRuntime::boot_offline_default();
        let st = rt.set_market_data_source("paper_sim", "SOL/USD").unwrap();
        assert_eq!(st.source, "paper_sim");
        assert_eq!(st.symbol, "SOL/USD");
        assert!(rt.config.offline_mode);
        let frames = rt.poll_live_or_sim_frames(16_000_000);
        assert!(!frames.is_empty());
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

    #[test]
    #[ignore = "live public Kraken WS v2 runtime smoke test (run manually with --ignored --nocapture)"]
    fn live_runtime_kraken_ws_v2_5s_smoke() {
        let mut rt = AllegedlyRuntime::boot_offline_default();
        let init_status = rt
            .set_market_data_source("kraken_ws_v2", "BTC/USD")
            .unwrap();
        assert_eq!(init_status.source, "kraken_ws_v2");
        assert_eq!(init_status.symbol, "BTC/USD");

        let start = std::time::Instant::now();
        let mut seen = BTreeSet::new();
        let mut step = 1u64;
        while start.elapsed() < std::time::Duration::from_secs(5) {
            let frames = rt.poll_live_or_sim_frames(step * 50_000_000);
            for f in &frames {
                let hdr = decode_header(f).unwrap();
                seen.insert(hdr.frame_type);
            }
            step += 1;
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let st = rt.get_market_data_status();
        println!("APP_RUNTIME_KRAKEN_5S_SMOKE status={st:?} seen_frames={seen:?}");
        assert!(st.connected, "expected connected Kraken WS v2");
        assert_eq!(st.book_state, "live");
        assert!(st.trades_received > 0, "expected live BTC/USD trades");
        assert!(st.crc_ok > 0, "expected live CRC32 checks");
        assert_eq!(st.crc_mismatches, 0, "expected 0 CRC32 mismatches");
        assert!(seen.contains(&(FrameType::LiveTradeBatch as u16)));
        assert!(seen.contains(&(FrameType::LiveBarUpdateBatch as u16)));
        assert!(seen.contains(&(FrameType::LiveL2BookBatch as u16)));
        assert!(seen.contains(&(FrameType::StreamStatusFrame as u16)));

        // Switch cleanly back to offline paper_sim
        let back = rt.set_market_data_source("paper_sim", "BTC/USD").unwrap();
        assert_eq!(back.source, "paper_sim");
        assert!(rt.config.offline_mode);
    }
}
