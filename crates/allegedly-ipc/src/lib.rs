pub mod batcher;
pub mod framing;
pub mod hub;

pub use batcher::{
    DEFAULT_COALESCE_INTERVAL_NS, FrameBatcher, MAX_PENDING_TRADES, MAX_TRADES_PER_FRAME,
};
pub use framing::{
    BIT_BUY_IMBAL, BIT_POC, BIT_SELL_IMBAL, BIT_UNFINISHED, FootprintCell, FrameHeader, FrameType,
    HEADER_BYTES, IpcFrameError, LiveBarUpdate, LiveL2BookHeader, LiveL2BookLevel, LiveTradeRecord,
    MAGIC_ALG2, PROTOCOL_VERSION_V1, StreamStatusFrame, TpoHeader, TpoRow128, VolumeProfileBin,
    VolumeProfileSummary, decode_header, decode_live_trade_batch, decode_stream_status,
    encode_footprint_delta, encode_header, encode_live_bar_update_batch, encode_live_l2_book_batch,
    encode_live_trade_batch, encode_stream_status, encode_tpo_profile_bitmask,
    encode_volume_profile, pack_trade_flags,
};
pub use hub::{WorkspacePatch, WorkspacePatchResult, WorkspaceState, WorkspaceStateHub};

#[cfg(test)]
mod tests {
    use super::*;
    use allegedly_core::{BookState, ProvenanceModifiers, ProvenanceTier};

    #[test]
    fn trade_batch_roundtrip_and_large_qty_e9() {
        // Verify qty_e9 > i32::MAX (e.g., 50 BTC = 50_000_000_000) never overflows (RT3-01)
        let rec = LiveTradeRecord {
            seq: 42,
            ts_ns: 1_732_500_000_000_000_000,
            price_e9: 95_123_500_000_000,
            qty_e9: 50_000_000_000,
            flags: pack_trade_flags(
                1,
                ProvenanceTier::ExactTickAggr,
                ProvenanceModifiers::NONE,
                false,
            ),
            _pad: 0,
        };
        let bytes = encode_live_trade_batch(7, 999, &[rec]);
        assert_eq!(bytes.len(), 24 + 40);
        let (hdr, decoded) = decode_live_trade_batch(&bytes).unwrap();
        assert_eq!(hdr.magic, MAGIC_ALG2);
        assert_eq!(hdr.version, PROTOCOL_VERSION_V1);
        assert_eq!(hdr.stream_id, 7);
        assert_eq!(decoded, vec![rec]);
    }

    #[test]
    fn stream_status_frame_roundtrip_bypasses_coalescer() {
        let batcher = FrameBatcher::new(3);
        let status =
            StreamStatusFrame::new(100, 5, 1, BookState::Stale, ProvenanceTier::ExactTickAggr);
        let bytes = batcher.emit_status_immediate(123_456, status);
        assert_eq!(bytes.len(), 24 + 16);
        let (hdr, dec) = decode_stream_status(&bytes).unwrap();
        assert_eq!(hdr.frame_type, FrameType::StreamStatusFrame as u16);
        assert_eq!(dec, status);
    }

    #[test]
    fn workspace_hub_rejects_stale_state_rev() {
        let mut hub = WorkspaceStateHub::default();
        let r1 = hub.apply_patch(WorkspacePatch {
            observed_rev: 0,
            set_link_symbol: Some(('A', "SOL/USD".into())),
            set_theme: None,
            set_selected_object: None,
        });
        assert!(r1.accepted);
        assert_eq!(r1.current_rev, 1);

        let stale = hub.apply_patch(WorkspacePatch {
            observed_rev: 0,
            set_link_symbol: Some(('A', "ETH/USD".into())),
            set_theme: None,
            set_selected_object: None,
        });
        assert!(!stale.accepted);
        assert_eq!(stale.current_rev, 1);
        assert_eq!(
            hub.snapshot()
                .link_group_symbols
                .get(&'A')
                .map(String::as_str),
            Some("SOL/USD")
        );
    }

    #[test]
    fn rtsd14_frame_type_validation_and_bounded_batcher() {
        let status_bytes = encode_stream_status(
            1,
            100,
            StreamStatusFrame::new(1, 0, 0, BookState::Live, ProvenanceTier::ExactTickAggr),
        );
        // Passing a status frame into trade-batch decoder must fail with UnexpectedFrameType
        assert!(matches!(
            decode_live_trade_batch(&status_bytes),
            Err(IpcFrameError::UnexpectedFrameType { .. })
        ));
        // Mutating record_count on a status frame to 2 must fail with InvalidRecordCount
        let mut bad_status = status_bytes.clone();
        bad_status[12..16].copy_from_slice(&2u32.to_le_bytes());
        assert!(matches!(
            decode_stream_status(&bad_status),
            Err(IpcFrameError::InvalidRecordCount {
                expected: 1,
                actual: 2
            })
        ));
        // Bounded FrameBatcher caps pending_trades at MAX_PENDING_TRADES
        let mut batcher = FrameBatcher::new(1);
        for seq in 0..(MAX_PENDING_TRADES as u64 + 10) {
            batcher.push_trade(LiveTradeRecord {
                seq,
                ..Default::default()
            });
        }
        assert_eq!(batcher.pending_len(), MAX_PENDING_TRADES);
        assert_eq!(batcher.dropped_overflow(), 10);
    }
}
