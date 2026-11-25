import type { TransportAdapter } from "./transport.js";

interface TauriInternals {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
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
 * Tauri v2 IPC transport adapter (ADR-0002 / ST-07).
 * Routes typed JSON control commands over `invoke()` and binary ALG2 frames over
 * polling/channel callbacks without allocating per-tick JSON objects.
 */
export class TauriTransportAdapter implements TransportAdapter {
  public readonly kind = "tauri" as const;

  async invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes> {
    if (!isTauriRuntime() || !window.__TAURI_INTERNALS__) {
      throw new Error("TauriTransportAdapter invoked outside a Tauri v2 runtime");
    }
    return window.__TAURI_INTERNALS__.invoke<TRes>(cmd, { payload });
  }

  subscribeBinary(streamId: number, onFrame: (frame: ArrayBuffer) => void): () => void {
    if (!isTauriRuntime() || !window.__TAURI_INTERNALS__) {
      return () => {};
    }
    let active = true;
    const tick = async () => {
      if (!active || !window.__TAURI_INTERNALS__) return;
      try {
        const bytes = await window.__TAURI_INTERNALS__.invoke<number[] | Uint8Array | null>(
          "poll_binary_frame",
          { streamId },
        );
        if (active && bytes && bytes.length > 0) {
          const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
          const copy = new Uint8Array(u8.byteLength); copy.set(u8); onFrame(copy.buffer);
        }
      } catch {
        // Non-fatal: surface stream status frame on next cycle
      }
      if (active) {
        timer = setTimeout(tick, 16);
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(tick, 16);
    return () => {
      active = false;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }
}
