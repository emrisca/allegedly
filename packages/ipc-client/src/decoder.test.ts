import { describe, expect, it } from "vitest";
import {
  BookState,
  decodeLiveTradeBatch,
  decodeStreamStatusFrame,
  FrameType,
  HEADER_BYTES,
  MAGIC_ALG2,
  PROTOCOL_VERSION_V1,
  ProvenanceTier,
} from "./decoder.js";

describe("ALG2 v1 binary wire decoder (T07)", () => {
  it("decodes exact 24 B header + 40 B LIVE_TRADE_BATCH with BigInt i64 qty_e9 > i32::MAX", () => {
    const buf = new ArrayBuffer(HEADER_BYTES + 40);
    const dv = new DataView(buf);
    dv.setUint32(0, MAGIC_ALG2, true);
    dv.setUint16(4, PROTOCOL_VERSION_V1, true);
    dv.setUint16(6, FrameType.LIVE_TRADE_BATCH, true);
    dv.setUint32(8, 7, true);
    dv.setUint32(12, 1, true);
    dv.setBigUint64(16, 999n, true);

    dv.setBigUint64(24, 42n, true);
    dv.setBigInt64(32, 1_732_500_000_000_000_000n, true);
    dv.setBigInt64(40, 95_123_500_000_000n, true);
    dv.setBigInt64(48, 50_000_000_000n, true); // 50 BTC > i32::MAX
    dv.setUint32(56, 0b101, true);
    dv.setUint32(60, 0, true);

    const { header, trades } = decodeLiveTradeBatch(buf);
    expect(header.streamId).toBe(7);
    expect(trades).toHaveLength(1);
    expect(trades[0].qtyE9).toBe(50_000_000_000n);
    expect(trades[0].priceE9).toBe(95_123_500_000_000n);
  });

  it("decodes exact 16 B aligned STREAM_STATUS_FRAME", () => {
    const buf = new ArrayBuffer(HEADER_BYTES + 16);
    const dv = new DataView(buf);
    dv.setUint32(0, MAGIC_ALG2, true);
    dv.setUint16(4, PROTOCOL_VERSION_V1, true);
    dv.setUint16(6, FrameType.STREAM_STATUS_FRAME, true);
    dv.setUint32(8, 3, true);
    dv.setUint32(12, 1, true);
    dv.setBigUint64(16, 123_456n, true);

    dv.setBigUint64(24, 100n, true);
    dv.setUint32(32, 5, true);
    dv.setUint16(36, 1, true);
    dv.setUint8(38, BookState.Stale);
    dv.setUint8(39, ProvenanceTier.ExactTickAggr);

    const { status } = decodeStreamStatusFrame(buf);
    expect(status.seq).toBe(100n);
    expect(status.droppedTotal).toBe(5);
    expect(status.bookState).toBe(BookState.Stale);
    expect(status.provenanceTier).toBe(ProvenanceTier.ExactTickAggr);
  });
});
