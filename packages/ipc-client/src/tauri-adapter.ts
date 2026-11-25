import { BookState, ProvenanceTier, encodeStreamStatusFrame } from "./decoder.js";
import type { TransportAdapter } from "./transport.js";

export type TauriInvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface TauriInternals {
  invoke: TauriInvokeFn;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

/**
 * Unpack length-prefixed `[u32_le_len][ALG2 frame bytes]...` raw `ArrayBuffer`
 * returned by Tauri v2 `tauri::ipc::Response::new(Vec<u8>)` (ADR-0002 / RTSD-02).
 * Fails closed on truncated headers, zero-length frames, or trailing garbage.
 */
export function unpackRawFrameBatch(buf: ArrayBuffer): ArrayBuffer[] {
  const frames: ArrayBuffer[] = [];
  const dv = new DataView(buf);
  let offset = 0;
  while (offset < buf.byteLength) {
    if (offset + 4 > buf.byteLength) {
      throw new RangeError(`Truncated frame batch length prefix at offset ${offset}`);
    }
    const len = dv.getUint32(offset, true);
    offset += 4;
    if (len === 0 || offset + len > buf.byteLength) {
      throw new RangeError(`Truncated or zero-length frame (${len} bytes) at offset ${offset}`);
    }
    frames.push(buf.slice(offset, offset + len));
    offset += len;
  }
  return frames;
}

interface StreamPump {
  listeners: Set<(frame: ArrayBuffer) => void>;
  timer: ReturnType<typeof setTimeout> | undefined;
  active: boolean;
  seq: bigint;
  errorCount: number;
}

/**
 * Tauri v2 IPC transport adapter (ADR-0002 / ST-07 / RTSD-02).
 * - Typed JSON control commands over `invoke()`
 * - Single multiplexed raw `ArrayBuffer` (`tauri::ipc::Response`) stream pump per `streamId`
 *   with zero per-tick JSON array serialization and fail-closed `STREAM_STATUS_FRAME` emission on error.
 */
export class TauriTransportAdapter implements TransportAdapter {
  public readonly kind = "tauri" as const;
  private readonly pumps = new Map<number, StreamPump>();
  private readonly customInvoker?: TauriInvokeFn;

  constructor(customInvoker?: TauriInvokeFn) {
    this.customInvoker = customInvoker;
  }

  private getInvoker(): TauriInvokeFn | null {
    if (this.customInvoker) return this.customInvoker;
    if (isTauriRuntime() && window.__TAURI_INTERNALS__) {
      return window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
    }
    return null;
  }

  async invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes> {
    const invoker = this.getInvoker();
    if (!invoker) {
      throw new Error("TauriTransportAdapter invoked outside a Tauri v2 runtime");
    }
    return invoker<TRes>(cmd, { payload });
  }

  subscribeBinary(streamId: number, onFrame: (frame: ArrayBuffer) => void): () => void {
    const invoker = this.getInvoker();
    if (!invoker) {
      return () => {};
    }

    let pump = this.pumps.get(streamId);
    if (!pump) {
      pump = {
        listeners: new Set(),
        timer: undefined,
        active: true,
        seq: 0n,
        errorCount: 0,
      };
      this.pumps.set(streamId, pump);

      const currentPump = pump;
      const tick = async () => {
        if (!currentPump.active) return;
        try {
          const raw = await invoker<ArrayBuffer | Uint8Array>("poll_binary_frames", { streamId });
          if (!currentPump.active) return;
          const ab: ArrayBuffer =
            raw instanceof ArrayBuffer
              ? raw
              : raw instanceof Uint8Array
                ? (raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer)
                : new ArrayBuffer(0);
          if (ab.byteLength > 0) {
            const frames = unpackRawFrameBatch(ab);
            for (const frame of frames) {
              for (const listener of currentPump.listeners) {
                listener(frame);
              }
            }
          }
        } catch {
          // Fail-closed: synthesize and dispatch Disconnected STREAM_STATUS_FRAME instead of swallowing silently (RTSD-02)
          currentPump.errorCount += 1;
          currentPump.seq += 1n;
          const errFrame = encodeStreamStatusFrame(
            streamId,
            BigInt(Date.now()) * 1_000_000n,
            {
              seq: currentPump.seq,
              droppedTotal: currentPump.errorCount,
              reasonCode: 0x0503,
              bookState: BookState.Disconnected,
              provenanceTier: ProvenanceTier.ExactTickAggr,
            },
          );
          for (const listener of currentPump.listeners) {
            listener(errFrame);
          }
        }
        if (currentPump.active) {
          currentPump.timer = setTimeout(tick, 16);
        }
      };

      currentPump.timer = setTimeout(tick, 16);
    }

    pump.listeners.add(onFrame);

    return () => {
      const p = this.pumps.get(streamId);
      if (!p) return;
      p.listeners.delete(onFrame);
      if (p.listeners.size === 0) {
        p.active = false;
        if (p.timer !== undefined) {
          clearTimeout(p.timer);
        }
        this.pumps.delete(streamId);
      }
    };
  }

  dispose(): void {
    for (const pump of this.pumps.values()) {
      pump.active = false;
      if (pump.timer !== undefined) {
        clearTimeout(pump.timer);
      }
      pump.listeners.clear();
    }
    this.pumps.clear();
  }
}
