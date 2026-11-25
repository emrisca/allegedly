import { describe, expect, it } from "vitest";
import {
  BIT_BUY_IMBAL,
  BIT_POC,
  BookState,
  decodeFootprintDelta,
  decodeLiveBarUpdateBatch,
  decodeLiveL2BookBatch,
  decodeLiveTradeBatch,
  decodeStreamStatusFrame,
  decodeTpoProfileBitmask,
  decodeVolumeProfile,
  encodeLiveBarUpdateBatch,
  encodeLiveL2BookBatch,
  encodeLiveTradeBatch,
  encodeStreamStatusFrame,
  formatFixedE9,
  FrameType,
  HEADER_BYTES,
  MAGIC_ALG2,
  packTradeFlags,
  PROTOCOL_VERSION_V1,
  ProvenanceTier,
  unpackTradeFlags,
  writeFrameHeader,
} from "./decoder.js";
import { OfflineSimTransportAdapter } from "./offline-sim-adapter.js";
import { assertLoopbackUrl } from "./ws-adapter.js";
import type { BootConfig, PaperAccountSnapshot, WorkspacePatchResult } from "./transport.js";

describe("ALG2 v1 binary wire decoder (T07)", () => {
  it("round-trips exact 24 B header + 40 B LIVE_TRADE_BATCH with BigInt i64 qty_e9 > i32::MAX", () => {
    const flags = packTradeFlags(1, ProvenanceTier.ExactTickAggr, 0b010, false);
    const buf = encodeLiveTradeBatch(7, 999n, [
      {
        seq: 42n,
        tsNs: 1_732_500_000_000_000_000n,
        priceE9: 95_123_500_000_000n,
        qtyE9: 50_000_000_000n, // 50 BTC > i32::MAX
        flags,
      },
    ]);
    expect(buf.byteLength).toBe(HEADER_BYTES + 40);

    const { header, trades } = decodeLiveTradeBatch(buf);
    expect(header.magic).toBe(MAGIC_ALG2);
    expect(header.version).toBe(PROTOCOL_VERSION_V1);
    expect(header.streamId).toBe(7);
    expect(trades).toHaveLength(1);
    expect(trades[0].qtyE9).toBe(50_000_000_000n);
    expect(trades[0].priceE9).toBe(95_123_500_000_000n);
    expect(unpackTradeFlags(trades[0].flags)).toEqual({
      side: 1,
      provenanceTier: ProvenanceTier.ExactTickAggr,
      provenanceModifiers: 0b010,
      outOfSeq: false,
    });
  });

  it("decodes exact 32 B FootprintCell delta frames", () => {
    const buf = new ArrayBuffer(HEADER_BYTES + 32);
    const dv = new DataView(buf);
    writeFrameHeader(dv, 0, FrameType.LIVE_FOOTPRINT_DELTA, 2, 1, 555n);
    dv.setBigInt64(24, 190_000n, true);
    dv.setBigInt64(32, 12_500_000_000n, true);
    dv.setBigInt64(40, 45_000_000_000n, true);
    dv.setUint32(48, 37, true);
    dv.setUint8(52, BIT_BUY_IMBAL | BIT_POC);

    const { cells } = decodeFootprintDelta(buf);
    expect(cells).toHaveLength(1);
    expect(cells[0].priceTick).toBe(190_000n);
    expect(cells[0].askVolE9).toBe(45_000_000_000n);
    expect(cells[0].imbalanceFlags).toBe(BIT_BUY_IMBAL | BIT_POC);
  });

  it("decodes exact 24 B summary + 24 B bin VOLUME_PROFILE_SOA frames", () => {
    const buf = new ArrayBuffer(HEADER_BYTES + 24 + 24);
    const dv = new DataView(buf);
    writeFrameHeader(dv, 0, FrameType.VOLUME_PROFILE_SOA, 5, 1, 777n);
    dv.setBigInt64(24, 190_000n, true);
    dv.setBigInt64(32, 190_100n, true);
    dv.setBigInt64(40, 189_900n, true);
    dv.setBigInt64(48, 190_000n, true);
    dv.setBigInt64(56, 3_000_000_000n, true);
    dv.setBigInt64(64, 4_000_000_000n, true);

    const { summary, bins } = decodeVolumeProfile(buf);
    expect(summary.pocPrice).toBe(190_000n);
    expect(summary.vahPrice).toBe(190_100n);
    expect(bins[0].askVolE9).toBe(4_000_000_000n);
  });

  it("decodes exact 8 B header + 24 B u128 TPO_PROFILE_BITMASK (high bit >= 64)", () => {
    const buf = new ArrayBuffer(HEADER_BYTES + 8 + 24);
    const dv = new DataView(buf);
    writeFrameHeader(dv, 0, FrameType.TPO_PROFILE_BITMASK, 6, 1, 888n);
    dv.setUint16(24, 2, true);
    dv.setUint16(26, 96, true);
    dv.setBigInt64(32, 190_005n, true);
    dv.setBigUint64(40, 0b101n, true);
    dv.setBigUint64(48, 1n << 31n, true); // period 95 (24h 15m session)

    const { tpoHeader, rows } = decodeTpoProfileBitmask(buf);
    expect(tpoHeader.wordsPerRow).toBe(2);
    expect(tpoHeader.periodCount).toBe(96);
    expect(rows[0].periodMask).toBe(0b101n | (1n << 95n));
  });

  it("round-trips exact 16 B header + 24 B level LIVE_L2_BOOK_BATCH & 72 B LIVE_BAR_UPDATE_BATCH", () => {
    const l2Buf = encodeLiveL2BookBatch(
      4,
      1000n,
      {
        bookSeq: 88n,
        levelCount: 1,
        bookState: BookState.Live,
        isSnapshot: true,
        provenanceTier: ProvenanceTier.ExactL3Mbo,
        provenanceModifiers: 0,
      },
      [
        {
          priceE9: 95_000_000_000_000n,
          qtyE9: 4_250_000_000n,
          sideActionFlags: 0,
          orderCount: 12,
        },
      ],
    );
    expect(l2Buf.byteLength).toBe(HEADER_BYTES + 16 + 24);
    const l2 = decodeLiveL2BookBatch(l2Buf);
    expect(l2.bookHeader.bookSeq).toBe(88n);
    expect(l2.levels[0].orderCount).toBe(12);

    const barBuf = encodeLiveBarUpdateBatch(4, 1001n, [
      {
        tsOpenNs: 1_732_500_000_000_000_000n,
        openTick: 190_000n,
        highTick: 190_010n,
        lowTick: 189_990n,
        closeTick: 190_005n,
        volumeE9: 100_000_000_000n,
        buyVolE9: 60_000_000_000n,
        sellVolE9: 40_000_000_000n,
        flags: 0n,
      },
    ]);
    expect(barBuf.byteLength).toBe(HEADER_BYTES + 72);
    const bars = decodeLiveBarUpdateBatch(barBuf);
    expect(bars.bars[0].closeTick).toBe(190_005n);
  });

  it("round-trips exact 16 B aligned STREAM_STATUS_FRAME", () => {
    const buf = encodeStreamStatusFrame(3, 123_456n, {
      seq: 100n,
      droppedTotal: 5,
      reasonCode: 1,
      bookState: BookState.Stale,
      provenanceTier: ProvenanceTier.ExactTickAggr,
    });
    expect(buf.byteLength).toBe(HEADER_BYTES + 16);
    const { status } = decodeStreamStatusFrame(buf);
    expect(status.seq).toBe(100n);
    expect(status.droppedTotal).toBe(5);
    expect(status.bookState).toBe(BookState.Stale);
    expect(status.provenanceTier).toBe(ProvenanceTier.ExactTickAggr);
  });

  it("formats fixed-point BigInt values without float drift", () => {
    expect(formatFixedE9(95_123_500_000_000n, 2)).toBe("95123.50");
    expect(formatFixedE9(-500_000_000n, 2)).toBe("-0.50");
  });

  it("enforces loopback-only security policy on LoopbackWsTransportAdapter", () => {
    expect(() => assertLoopbackUrl("ws://127.0.0.1:19420/alg2")).not.toThrow();
    expect(() => assertLoopbackUrl("ws://evil.example.com:19420/alg2")).toThrow(/non-loopback/i);
  });

  it("verifies OfflineSimTransportAdapter SV-01 offline defaults, OCC state_rev & Kill-Switch", async () => {
    const sim = new OfflineSimTransportAdapter();
    const boot = await sim.invokeJson<Record<string, never>, BootConfig>("get_boot_config", {});
    expect(boot.updates_check_on_startup).toBe(false);
    expect(boot.live_armed).toBe(false);
    expect(boot.offline_mode).toBe(true);

    const p1 = await sim.invokeJson("apply_workspace_patch", {
      observed_rev: 0,
      set_link_symbol: ["A", "SOL/USD"],
    }) as WorkspacePatchResult;
    expect(p1).toEqual({ accepted: true, current_rev: 1 });

    const stale = await sim.invokeJson("apply_workspace_patch", {
      observed_rev: 0,
      set_link_symbol: ["A", "ETH/USD"],
    }) as WorkspacePatchResult;
    expect(stale).toEqual({ accepted: false, current_rev: 1 });

    await sim.invokeJson("submit_paper_order", {
      symbol: "SOL/USD",
      side: "buy",
      order_type: "limit",
      qty_e9: "2000000000",
      limit_price_e9: "230000000000",
    });
    const afterKill = await sim.invokeJson<Record<string, never>, PaperAccountSnapshot>(
      "kill_switch_cancel_all",
      {},
    );
    expect(afterKill.live_armed).toBe(false);
    expect(afterKill.orders[0].status).toBe("canceled");

    const frames = sim.stepFrames(1);
    expect(frames).toHaveLength(7);
    expect(decodeLiveTradeBatch(frames[0]).trades).toHaveLength(4);
    expect(decodeLiveBarUpdateBatch(frames[1]).bars).toHaveLength(1);
    expect(decodeFootprintDelta(frames[2]).cells).toHaveLength(11);
    expect(decodeVolumeProfile(frames[3]).bins).toHaveLength(11);
    expect(decodeTpoProfileBitmask(frames[4]).rows).toHaveLength(11);
    expect(decodeLiveL2BookBatch(frames[5]).levels).toHaveLength(24);
    expect(decodeStreamStatusFrame(frames[6]).status.bookState).toBe(BookState.Live);
    sim.dispose();
  });
});

import schema from "../../../schemas/ipc-v1/ipc-contract.json" with { type: "json" };

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

describe("Rust allegedly-ipc golden binary fixtures (T07 parity)", () => {

  it("decodes Rust-emitted LIVE_TRADE_BATCH bytes with 0 byte mismatches", () => {
    const buf = hexToArrayBuffer(schema.golden_fixtures_hex.live_trade_batch);
    const { header, trades } = decodeLiveTradeBatch(buf);
    expect(header.streamId).toBe(7);
    expect(header.sendNs).toBe(999n);
    expect(trades).toHaveLength(1);
    expect(trades[0].seq).toBe(42n);
    expect(trades[0].priceE9).toBe(95_123_500_000_000n);
    expect(trades[0].qtyE9).toBe(50_000_000_000n);
  });

  it("decodes Rust-emitted FOOTPRINT_DELTA bytes with 0 byte mismatches", () => {
    const buf = hexToArrayBuffer(schema.golden_fixtures_hex.footprint_delta);
    const { header, cells } = decodeFootprintDelta(buf);
    expect(header.streamId).toBe(2);
    expect(cells[0].priceTick).toBe(190_000n);
    expect(cells[0].bidVolE9).toBe(12_500_000_000n);
    expect(cells[0].askVolE9).toBe(45_000_000_000n);
    expect(cells[0].tradeCount).toBe(37);
    expect(cells[0].imbalanceFlags).toBe(BIT_BUY_IMBAL | BIT_POC);
  });

  it("decodes Rust-emitted VOLUME_PROFILE_SOA bytes with 0 byte mismatches", () => {
    const buf = hexToArrayBuffer(schema.golden_fixtures_hex.volume_profile);
    const { summary, bins } = decodeVolumeProfile(buf);
    expect(summary.pocPrice).toBe(190_000n);
    expect(summary.vahPrice).toBe(190_100n);
    expect(summary.valPrice).toBe(189_900n);
    expect(bins).toHaveLength(1);
    expect(bins[0].askVolE9).toBe(4_000_000_000n);
  });

  it("decodes Rust-emitted STREAM_STATUS_FRAME bytes with 0 byte mismatches", () => {
    const buf = hexToArrayBuffer(schema.golden_fixtures_hex.stream_status);
    const { status } = decodeStreamStatusFrame(buf);
    expect(status.seq).toBe(100n);
    expect(status.droppedTotal).toBe(5);
    expect(status.reasonCode).toBe(1);
    expect(status.bookState).toBe(BookState.Stale);
    expect(status.provenanceTier).toBe(ProvenanceTier.ExactTickAggr);
  });
});

describe("Stage D Slice 4 JSON IPC commands (Studies, Replay, Settings-as-Code)", () => {
  it("evaluates built-in studies, verifies replay determinism, and enforces safety-locked settings cascade", async () => {
    const adapter = new OfflineSimTransportAdapter();

    const sma = await adapter.invokeJson<
      { id: string; builtin: string; period: number; closes: number[] },
      { label: string; values: Array<number | null> }
    >("run_study", {
      id: "sma-3",
      builtin: "sma",
      period: 3,
      closes: [10, 20, 30, 40],
    });
    expect(sma.label).toBe("SMA(3)");
    expect(sma.values).toEqual([null, null, 20, 30]);

    const r1 = await adapter.invokeJson<{ action: string; cursor?: number }, { sha256_hex: string; determinism_verified: boolean }>(
      "control_replay",
      { action: "seek", cursor: 500 },
    );
    const r2 = await adapter.invokeJson<{ action: string }, { sha256_hex: string; determinism_verified: boolean }>(
      "control_replay",
      { action: "verify_determinism" },
    );
    expect(r2.determinism_verified).toBe(true);
    expect(r2.sha256_hex).toBe(r1.sha256_hex);

    await expect(
      adapter.invokeJson("update_setting_override", {
        key: "updates.checkOnStartup",
        value: "true",
      }),
    ).rejects.toThrow(/Safety invariant lock/);

    const settings = await adapter.invokeJson<
      { key: string; value: string },
      Array<{ key: string; value: string; is_overridden: boolean }>
    >("update_setting_override", {
      key: "orderflow.imbalance_ratio_bps",
      value: "35000",
    });
    expect(
      settings.find((s) => s.key === "orderflow.imbalance_ratio_bps")?.is_overridden,
    ).toBe(true);

    const toml = await adapter.invokeJson<
      { name: string; symbol: string; timeframe: string },
      string
    >("export_workspace_toml", {
      name: "Default Desk",
      symbol: "BTC/USD",
      timeframe: "1m",
    });
    expect(toml).toContain("orderflow.imbalance_ratio_bps = 35000");

    adapter.dispose();
  });
});
