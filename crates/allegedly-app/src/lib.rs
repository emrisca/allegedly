use allegedly_core::{Bps, InstrumentId};
use allegedly_ingest::SyntheticSimProvider;
use allegedly_ipc::{FrameBatcher, LiveTradeRecord, WorkspaceStateHub, pack_trade_flags};
use allegedly_orderflow::FootprintSlabArena;
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
    pub workspace_hub: WorkspaceStateHub,
    pub footprint: FootprintSlabArena,
    pub batcher: FrameBatcher,
    pub sim: SyntheticSimProvider,
}

impl AllegedlyRuntime {
    pub fn boot_offline_default() -> Self {
        Self {
            config: BootConfig::default(),
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_ipc::decode_live_trade_batch;

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
    }
}
