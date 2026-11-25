export const MAGIC_ALG2 = 0x414c4732;
export const PROTOCOL_VERSION_V1 = 1;
export const HEADER_BYTES = 24;

export const BIT_BUY_IMBAL = 1 << 0;
export const BIT_SELL_IMBAL = 1 << 1;
export const BIT_POC = 1 << 2;
export const BIT_UNFINISHED = 1 << 3;

export const FrameType = {
  OHLCV_BARS_SOA: 0x0001,
  FOOTPRINT_SLAB_SOA: 0x0002,
  VOLUME_PROFILE_SOA: 0x0003,
  TPO_PROFILE_BITMASK: 0x0004,
  LIVE_TRADE_BATCH: 0x0101,
  LIVE_L2_BOOK_BATCH: 0x0102,
  LIVE_BAR_UPDATE_BATCH: 0x0103,
  LIVE_FOOTPRINT_DELTA: 0x0104,
  STREAM_STATUS_FRAME: 0x0201,
} as const;

export type FrameTypeCode = (typeof FrameType)[keyof typeof FrameType];

export const BookState = {
  Live: 0,
  Stale: 1,
  Rebuilding: 2,
  Disconnected: 3,
  Halted: 4,
} as const;

export type BookStateCode = (typeof BookState)[keyof typeof BookState];

export const BOOK_STATE_LABELS: Record<number, string> = {
  [BookState.Live]: "LIVE",
  [BookState.Stale]: "STALE",
  [BookState.Rebuilding]: "REBUILDING",
  [BookState.Disconnected]: "DISCONNECTED",
  [BookState.Halted]: "HALTED",
};

export const ProvenanceTier = {
  ExactL3Mbo: 0,
  ExactTickAggr: 1,
  EstimatedL1Quote: 2,
  EstimatedTickRule: 3,
  SyntheticIntrabar: 4,
} as const;

export type ProvenanceTierCode = (typeof ProvenanceTier)[keyof typeof ProvenanceTier];

export const PROVENANCE_TIER_LABELS: Record<number, string> = {
  [ProvenanceTier.ExactL3Mbo]: "T1 · EXACT L3 MBO",
  [ProvenanceTier.ExactTickAggr]: "T2 · EXACT TICK AGGR",
  [ProvenanceTier.EstimatedL1Quote]: "T3 · EST L1 QUOTE",
  [ProvenanceTier.EstimatedTickRule]: "T4 · EST TICK RULE",
  [ProvenanceTier.SyntheticIntrabar]: "T5 · SYNTHETIC",
};

export interface FrameHeader {
  magic: number;
  version: number;
  frameType: number;
  streamId: number;
  recordCount: number;
  sendNs: bigint;
}

export interface UnpackedTradeFlags {
  side: number;
  provenanceTier: number;
  provenanceModifiers: number;
  outOfSeq: boolean;
}

export interface LiveTradeRecord {
  seq: bigint;
  tsNs: bigint;
  priceE9: bigint;
  qtyE9: bigint;
  flags: number;
}

export interface FootprintCell {
  priceTick: bigint;
  bidVolE9: bigint;
  askVolE9: bigint;
  tradeCount: number;
  imbalanceFlags: number;
}

export interface VolumeProfileSummary {
  pocPrice: bigint;
  vahPrice: bigint;
  valPrice: bigint;
}

export interface VolumeProfileBin {
  priceTick: bigint;
  bidVolE9: bigint;
  askVolE9: bigint;
}

export interface TpoHeader {
  wordsPerRow: number;
  periodCount: number;
}

export interface TpoRow128 {
  priceTick: bigint;
  periodMask: bigint;
}

export interface LiveL2BookHeader {
  bookSeq: bigint;
  levelCount: number;
  bookState: number;
  isSnapshot: boolean;
  provenanceTier: number;
  provenanceModifiers: number;
}

export interface LiveL2BookLevel {
  priceE9: bigint;
  qtyE9: bigint;
  sideActionFlags: number;
  orderCount: number;
}

export interface LiveBarUpdate {
  tsOpenNs: bigint;
  openTick: bigint;
  highTick: bigint;
  lowTick: bigint;
  closeTick: bigint;
  volumeE9: bigint;
  buyVolE9: bigint;
  sellVolE9: bigint;
  flags: bigint;
}

export interface StreamStatusFrame {
  seq: bigint;
  droppedTotal: number;
  reasonCode: number;
  bookState: number;
  provenanceTier: number;
}

export function packTradeFlags(
  side: number,
  tier: number,
  modifiers: number,
  outOfSeq: boolean,
): number {
  let f = side & 0b11;
  f |= (tier & 0b111) << 2;
  f |= (modifiers & 0b111) << 5;
  if (outOfSeq) {
    f |= 1 << 8;
  }
  return f >>> 0;
}

export function unpackTradeFlags(flags: number): UnpackedTradeFlags {
  return {
    side: flags & 0b11,
    provenanceTier: (flags >>> 2) & 0b111,
    provenanceModifiers: (flags >>> 5) & 0b111,
    outOfSeq: ((flags >>> 8) & 1) === 1,
  };
}

export function writeFrameHeader(
  view: DataView,
  byteOffset: number,
  frameType: number,
  streamId: number,
  recordCount: number,
  sendNs: bigint,
): void {
  view.setUint32(byteOffset, MAGIC_ALG2, true);
  view.setUint16(byteOffset + 4, PROTOCOL_VERSION_V1, true);
  view.setUint16(byteOffset + 6, frameType, true);
  view.setUint32(byteOffset + 8, streamId, true);
  view.setUint32(byteOffset + 12, recordCount, true);
  view.setBigUint64(byteOffset + 16, sendNs, true);
}

export function decodeFrameHeader(buf: ArrayBufferLike, byteOffset = 0): FrameHeader {
  if (buf.byteLength - byteOffset < HEADER_BYTES) {
    throw new RangeError(
      `ALG2 frame truncated: need ${HEADER_BYTES} B, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset, HEADER_BYTES);
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC_ALG2) {
    throw new Error(`Invalid ALG2 magic: 0x${magic.toString(16)}`);
  }
  const version = view.getUint16(4, true);
  if (version !== PROTOCOL_VERSION_V1) {
    throw new Error(`Unsupported ALG2 protocol version: ${version}`);
  }
  return {
    magic,
    version,
    frameType: view.getUint16(6, true),
    streamId: view.getUint32(8, true),
    recordCount: view.getUint32(12, true),
    sendNs: view.getBigUint64(16, true),
  };
}

export function encodeLiveTradeBatch(
  streamId: number,
  sendNs: bigint,
  trades: readonly LiveTradeRecord[],
): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + trades.length * 40);
  const dv = new DataView(buf);
  writeFrameHeader(dv, 0, FrameType.LIVE_TRADE_BATCH, streamId, trades.length, sendNs);
  for (let i = 0; i < trades.length; i++) {
    const base = HEADER_BYTES + i * 40;
    const t = trades[i];
    dv.setBigUint64(base, t.seq, true);
    dv.setBigInt64(base + 8, t.tsNs, true);
    dv.setBigInt64(base + 16, t.priceE9, true);
    dv.setBigInt64(base + 24, t.qtyE9, true);
    dv.setUint32(base + 32, t.flags, true);
    dv.setUint32(base + 36, 0, true);
  }
  return buf;
}

export function decodeLiveTradeBatch(
  buf: ArrayBufferLike,
  byteOffset = 0,
): { header: FrameHeader; trades: LiveTradeRecord[] } {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.LIVE_TRADE_BATCH) {
    throw new Error(`Expected LIVE_TRADE_BATCH (0x0101), got 0x${header.frameType.toString(16)}`);
  }
  const expectedBytes = HEADER_BYTES + header.recordCount * 40;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(
      `LIVE_TRADE_BATCH length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset + HEADER_BYTES, header.recordCount * 40);
  const trades: LiveTradeRecord[] = new Array(header.recordCount);
  for (let i = 0; i < header.recordCount; i++) {
    const base = i * 40;
    trades[i] = {
      seq: view.getBigUint64(base, true),
      tsNs: view.getBigInt64(base + 8, true),
      priceE9: view.getBigInt64(base + 16, true),
      qtyE9: view.getBigInt64(base + 24, true),
      flags: view.getUint32(base + 32, true),
    };
  }
  return { header, trades };
}

export function decodeFootprintDelta(
  buf: ArrayBufferLike,
  byteOffset = 0,
): { header: FrameHeader; cells: FootprintCell[] } {
  const header = decodeFrameHeader(buf, byteOffset);
  if (
    header.frameType !== FrameType.LIVE_FOOTPRINT_DELTA &&
    header.frameType !== FrameType.FOOTPRINT_SLAB_SOA
  ) {
    throw new Error(
      `Expected FOOTPRINT frame (0x0002|0x0104), got 0x${header.frameType.toString(16)}`,
    );
  }
  const expectedBytes = HEADER_BYTES + header.recordCount * 32;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(
      `FOOTPRINT length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset + HEADER_BYTES, header.recordCount * 32);
  const cells: FootprintCell[] = new Array(header.recordCount);
  for (let i = 0; i < header.recordCount; i++) {
    const base = i * 32;
    cells[i] = {
      priceTick: view.getBigInt64(base, true),
      bidVolE9: view.getBigInt64(base + 8, true),
      askVolE9: view.getBigInt64(base + 16, true),
      tradeCount: view.getUint32(base + 24, true),
      imbalanceFlags: view.getUint8(base + 28),
    };
  }
  return { header, cells };
}

export function decodeVolumeProfile(
  buf: ArrayBufferLike,
  byteOffset = 0,
): { header: FrameHeader; summary: VolumeProfileSummary; bins: VolumeProfileBin[] } {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.VOLUME_PROFILE_SOA) {
    throw new Error(`Expected VOLUME_PROFILE_SOA (0x0003), got 0x${header.frameType.toString(16)}`);
  }
  const expectedBytes = HEADER_BYTES + 24 + header.recordCount * 24;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(
      `VOLUME_PROFILE_SOA length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset + HEADER_BYTES, 24 + header.recordCount * 24);
  const summary: VolumeProfileSummary = {
    pocPrice: view.getBigInt64(0, true),
    vahPrice: view.getBigInt64(8, true),
    valPrice: view.getBigInt64(16, true),
  };
  const bins: VolumeProfileBin[] = new Array(header.recordCount);
  for (let i = 0; i < header.recordCount; i++) {
    const base = 24 + i * 24;
    bins[i] = {
      priceTick: view.getBigInt64(base, true),
      bidVolE9: view.getBigInt64(base + 8, true),
      askVolE9: view.getBigInt64(base + 16, true),
    };
  }
  return { header, summary, bins };
}

export function decodeTpoProfileBitmask(
  buf: ArrayBufferLike,
  byteOffset = 0,
): { header: FrameHeader; tpoHeader: TpoHeader; rows: TpoRow128[] } {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.TPO_PROFILE_BITMASK) {
    throw new Error(
      `Expected TPO_PROFILE_BITMASK (0x0004), got 0x${header.frameType.toString(16)}`,
    );
  }
  const expectedBytes = HEADER_BYTES + 8 + header.recordCount * 24;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(
      `TPO_PROFILE_BITMASK length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset + HEADER_BYTES, 8 + header.recordCount * 24);
  const tpoHeader: TpoHeader = {
    wordsPerRow: view.getUint16(0, true),
    periodCount: view.getUint16(2, true),
  };
  const rows: TpoRow128[] = new Array(header.recordCount);
  for (let i = 0; i < header.recordCount; i++) {
    const base = 8 + i * 24;
    const lo = view.getBigUint64(base + 8, true);
    const hi = view.getBigUint64(base + 16, true);
    rows[i] = {
      priceTick: view.getBigInt64(base, true),
      periodMask: lo | (hi << 64n),
    };
  }
  return { header, tpoHeader, rows };
}

export function encodeLiveL2BookBatch(
  streamId: number,
  sendNs: bigint,
  bookHeader: LiveL2BookHeader,
  levels: readonly LiveL2BookLevel[],
): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + 16 + levels.length * 24);
  const dv = new DataView(buf);
  writeFrameHeader(dv, 0, FrameType.LIVE_L2_BOOK_BATCH, streamId, levels.length, sendNs);
  dv.setBigUint64(HEADER_BYTES, bookHeader.bookSeq, true);
  dv.setUint32(HEADER_BYTES + 8, levels.length, true);
  dv.setUint8(HEADER_BYTES + 12, bookHeader.bookState);
  dv.setUint8(HEADER_BYTES + 13, bookHeader.isSnapshot ? 1 : 0);
  dv.setUint8(HEADER_BYTES + 14, bookHeader.provenanceTier);
  dv.setUint8(HEADER_BYTES + 15, bookHeader.provenanceModifiers);
  for (let i = 0; i < levels.length; i++) {
    const base = HEADER_BYTES + 16 + i * 24;
    const lvl = levels[i];
    dv.setBigInt64(base, lvl.priceE9, true);
    dv.setBigInt64(base + 8, lvl.qtyE9, true);
    dv.setUint32(base + 16, lvl.sideActionFlags, true);
    dv.setUint32(base + 20, lvl.orderCount, true);
  }
  return buf;
}

export function decodeLiveL2BookBatch(
  buf: ArrayBufferLike,
  byteOffset = 0,
): { header: FrameHeader; bookHeader: LiveL2BookHeader; levels: LiveL2BookLevel[] } {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.LIVE_L2_BOOK_BATCH) {
    throw new Error(
      `Expected LIVE_L2_BOOK_BATCH (0x0102), got 0x${header.frameType.toString(16)}`,
    );
  }
  const expectedBytes = HEADER_BYTES + 16 + header.recordCount * 24;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(
      `LIVE_L2_BOOK_BATCH length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset + HEADER_BYTES, 16 + header.recordCount * 24);
  const bookHeader: LiveL2BookHeader = {
    bookSeq: view.getBigUint64(0, true),
    levelCount: view.getUint32(8, true),
    bookState: view.getUint8(12),
    isSnapshot: view.getUint8(13) !== 0,
    provenanceTier: view.getUint8(14),
    provenanceModifiers: view.getUint8(15),
  };
  const levels: LiveL2BookLevel[] = new Array(header.recordCount);
  for (let i = 0; i < header.recordCount; i++) {
    const base = 16 + i * 24;
    levels[i] = {
      priceE9: view.getBigInt64(base, true),
      qtyE9: view.getBigInt64(base + 8, true),
      sideActionFlags: view.getUint32(base + 16, true),
      orderCount: view.getUint32(base + 20, true),
    };
  }
  return { header, bookHeader, levels };
}

export function encodeLiveBarUpdateBatch(
  streamId: number,
  sendNs: bigint,
  bars: readonly LiveBarUpdate[],
): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + bars.length * 72);
  const dv = new DataView(buf);
  writeFrameHeader(dv, 0, FrameType.LIVE_BAR_UPDATE_BATCH, streamId, bars.length, sendNs);
  for (let i = 0; i < bars.length; i++) {
    const base = HEADER_BYTES + i * 72;
    const b = bars[i];
    dv.setBigInt64(base, b.tsOpenNs, true);
    dv.setBigInt64(base + 8, b.openTick, true);
    dv.setBigInt64(base + 16, b.highTick, true);
    dv.setBigInt64(base + 24, b.lowTick, true);
    dv.setBigInt64(base + 32, b.closeTick, true);
    dv.setBigInt64(base + 40, b.volumeE9, true);
    dv.setBigInt64(base + 48, b.buyVolE9, true);
    dv.setBigInt64(base + 56, b.sellVolE9, true);
    dv.setBigUint64(base + 64, b.flags, true);
  }
  return buf;
}

export function decodeLiveBarUpdateBatch(
  buf: ArrayBufferLike,
  byteOffset = 0,
): { header: FrameHeader; bars: LiveBarUpdate[] } {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.LIVE_BAR_UPDATE_BATCH) {
    throw new Error(
      `Expected LIVE_BAR_UPDATE_BATCH (0x0103), got 0x${header.frameType.toString(16)}`,
    );
  }
  const expectedBytes = HEADER_BYTES + header.recordCount * 72;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(
      `LIVE_BAR_UPDATE_BATCH length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset + HEADER_BYTES, header.recordCount * 72);
  const bars: LiveBarUpdate[] = new Array(header.recordCount);
  for (let i = 0; i < header.recordCount; i++) {
    const base = i * 72;
    bars[i] = {
      tsOpenNs: view.getBigInt64(base, true),
      openTick: view.getBigInt64(base + 8, true),
      highTick: view.getBigInt64(base + 16, true),
      lowTick: view.getBigInt64(base + 24, true),
      closeTick: view.getBigInt64(base + 32, true),
      volumeE9: view.getBigInt64(base + 40, true),
      buyVolE9: view.getBigInt64(base + 48, true),
      sellVolE9: view.getBigInt64(base + 56, true),
      flags: view.getBigUint64(base + 64, true),
    };
  }
  return { header, bars };
}

export function encodeStreamStatusFrame(
  streamId: number,
  sendNs: bigint,
  status: StreamStatusFrame,
): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + 16);
  const dv = new DataView(buf);
  writeFrameHeader(dv, 0, FrameType.STREAM_STATUS_FRAME, streamId, 1, sendNs);
  dv.setBigUint64(HEADER_BYTES, status.seq, true);
  dv.setUint32(HEADER_BYTES + 8, status.droppedTotal, true);
  dv.setUint16(HEADER_BYTES + 12, status.reasonCode, true);
  dv.setUint8(HEADER_BYTES + 14, status.bookState);
  dv.setUint8(HEADER_BYTES + 15, status.provenanceTier);
  return buf;
}

export function decodeStreamStatusFrame(
  buf: ArrayBufferLike,
  byteOffset = 0,
): { header: FrameHeader; status: StreamStatusFrame } {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.STREAM_STATUS_FRAME) {
    throw new Error(
      `Expected STREAM_STATUS_FRAME (0x0201), got 0x${header.frameType.toString(16)}`,
    );
  }
  const expectedBytes = HEADER_BYTES + 16;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(
      `STREAM_STATUS_FRAME length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`,
    );
  }
  const view = new DataView(buf, byteOffset + HEADER_BYTES, 16);
  return {
    header,
    status: {
      seq: view.getBigUint64(0, true),
      droppedTotal: view.getUint32(8, true),
      reasonCode: view.getUint16(12, true),
      bookState: view.getUint8(14),
      provenanceTier: view.getUint8(15),
    },
  };
}

/**
 * Pure BigInt fixed-point formatter (10^9 scale) — zero floating-point money math (SV-08).
 */
export function formatFixedE9(valueE9: bigint, decimals = 2): string {
  const negative = valueE9 < 0n;
  const abs = negative ? -valueE9 : valueE9;
  const whole = abs / 1_000_000_000n;
  const fracRaw = (abs % 1_000_000_000n).toString().padStart(9, "0");
  const frac = decimals > 0 ? `.${fracRaw.slice(0, Math.min(decimals, 9))}` : "";
  return `${negative ? "-" : ""}${whole.toString()}${frac}`;
}
