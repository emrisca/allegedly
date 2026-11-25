use allegedly_core::{Bps, ConfigCascade, InstrumentId, ResolvedSetting};
use allegedly_ingest::SyntheticSimProvider;
use allegedly_ipc::{FrameBatcher, LiveTradeRecord, WorkspaceStateHub, pack_trade_flags};
use allegedly_orderflow::FootprintSlabArena;
use allegedly_replay::{ReplayControlAction, ReplaySession, ReplayStatusSnapshot};
use allegedly_studies::{
    GlobalStudyMemoryPool, StudyRunRequest, StudyRunResponse, evaluate_study_request,
};
use serde::{Deserialize, Serialize};

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

pub struct AllegedlyRuntime {
    pub config: BootConfig,
    pub settings: ConfigCascade,
    pub workspace_hub: WorkspaceStateHub,
    pub footprint: FootprintSlabArena,
    pub batcher: FrameBatcher,
    pub sim: SyntheticSimProvider,
    pub study_pool: GlobalStudyMemoryPool,
    pub replay: ReplaySession,
}

impl AllegedlyRuntime {
    pub fn boot_offline_default() -> Self {
        let mut replay_seed = SyntheticSimProvider::new(
            InstrumentId(1),
            0x5EED_4E91,
            95_000_000_000_000,
            500_000_000,
            1_732_500_000_000_000_000,
        );
        let replay_ticks = (0..2_000).map(|_| replay_seed.next_tick()).collect();
        let replay = ReplaySession::from_ticks(replay_ticks, 60_000_000_000, 500_000_000);

        Self {
            config: BootConfig::default(),
            settings: ConfigCascade::with_v01_defaults(),
            workspace_hub: WorkspaceStateHub::default(),
            footprint: FootprintSlabArena::new(60_000_000_000, 500_000_000, Bps(30_000)),
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
        }
    }

    pub fn step_sim_batch(&mut self, count: usize, now_ns: u64) -> Option<Vec<u8>> {
        for _ in 0..count {
            let tick = self.sim.next_tick();
            self.footprint.ingest_tick(&tick);
            self.batcher.push_trade(LiveTradeRecord {
                seq: tick.seq,
                ts_ns: tick.ts_exchange_ns,
                price_e9: tick.price_e9,
                qty_e9: tick.qty_e9,
                flags: pack_trade_flags(
                    tick.side,
                    tick.tier(),
                    allegedly_core::ProvenanceModifiers(tick.provenance_modifiers),
                    false,
                ),
                _pad: 0,
            });
        }
        self.batcher.maybe_flush_trades(now_ns, true)
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
    use allegedly_ipc::decode_live_trade_batch;
    use allegedly_studies::BuiltinStudyKind;

    #[test]
    fn sv01_offline_default_boot_invariants_and_sim_pipeline() {
        let mut rt = AllegedlyRuntime::boot_offline_default();
        assert!(!rt.config.updates_check_on_startup);
        assert!(!rt.config.live_armed);
        assert!(!rt.workspace_hub.snapshot().live_armed);

        let frame = rt.step_sim_batch(32, 16_000_000).unwrap();
        let (hdr, trades) = decode_live_trade_batch(&frame).unwrap();
        assert_eq!(hdr.record_count, 32);
        assert_eq!(trades.len(), 32);

        // Slice 4 runtime wiring: Studies, Replay determinism, and Settings-as-Code cascade
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
        let updated = rt
            .set_setting_override("orderflow.imbalance_ratio_bps".into(), "35000".into())
            .unwrap();
        assert!(
            updated
                .iter()
                .any(|s| s.key == "orderflow.imbalance_ratio_bps"
                    && s.value == "35000"
                    && s.is_overridden)
        );
        let toml = rt.export_workspace_toml("Alpha Desk", "BTC/USD", "1m");
        assert!(toml.contains("orderflow.imbalance_ratio_bps = 35000"));
    }
}
