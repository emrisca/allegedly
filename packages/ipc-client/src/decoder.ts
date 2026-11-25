export const MAGIC_ALG2 = 0x414c4732;
export const PROTOCOL_VERSION_V1 = 1;
export const HEADER_BYTES = 24;

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

export const BookState = {
  Live: 0,
  Stale: 1,
  Rebuilding: 2,
  Disconnected: 3,
  Halted: 4,
} as const;

export const ProvenanceTier = {
  ExactL3Mbo: 0,
  ExactTickAggr: 1,
  EstimatedL1Quote: 2,
  EstimatedTickRule: 3,
  SyntheticIntrabar: 4,
} as const;

export interface FrameHeader {
  magic: number;
  version: number;
  frameType: number;
  streamId: number;
  recordCount: number;
  sendNs: bigint;
}

export interface LiveTradeRecord {
  seq: bigint;
  tsNs: bigint;
  priceE9: bigint;
  qtyE9: bigint;
  flags: number;
}

export interface StreamStatusFrame {
  seq: bigint;
  droppedTotal: number;
  reasonCode: number;
  bookState: number;
  provenanceTier: number;
}

export function decodeFrameHeader(buf: ArrayBufferLike, byteOffset = 0): FrameHeader {
  if (buf.byteLength - byteOffset < HEADER_BYTES) {
    throw new RangeError(`ALG2 frame truncated: need ${HEADER_BYTES} B, got ${buf.byteLength - byteOffset}`);
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

export function decodeLiveTradeBatch(buf: ArrayBufferLike, byteOffset = 0): {
  header: FrameHeader;
  trades: LiveTradeRecord[];
} {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.LIVE_TRADE_BATCH) {
    throw new Error(`Expected LIVE_TRADE_BATCH (0x0101), got 0x${header.frameType.toString(16)}`);
  }
  const expectedBytes = HEADER_BYTES + header.recordCount * 40;
  if (buf.byteLength - byteOffset !== expectedBytes) {
    throw new RangeError(`LIVE_TRADE_BATCH length mismatch: expected ${expectedBytes}, got ${buf.byteLength - byteOffset}`);
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

export function decodeStreamStatusFrame(buf: ArrayBufferLike, byteOffset = 0): {
  header: FrameHeader;
  status: StreamStatusFrame;
} {
  const header = decodeFrameHeader(buf, byteOffset);
  if (header.frameType !== FrameType.STREAM_STATUS_FRAME) {
    throw new Error(`Expected STREAM_STATUS_FRAME (0x0201), got 0x${header.frameType.toString(16)}`);
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

export interface TransportAdapter {
  readonly kind: "tauri" | "loopback-ws" | "offline-sim";
  invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes>;
  subscribeBinary(streamId: number, onFrame: (frame: ArrayBuffer) => void): () => void;
}
