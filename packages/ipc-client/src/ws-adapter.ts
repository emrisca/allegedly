import type { TransportAdapter } from "./transport.js";

const ALLOWED_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function assertLoopbackUrl(urlString: string): URL {
  const parsed = new URL(urlString);
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error(`LoopbackWsTransportAdapter requires ws:// or wss://, got ${parsed.protocol}`);
  }
  if (!ALLOWED_LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Security policy (ADR-0002): LoopbackWsTransportAdapter refuses non-loopback host "${parsed.hostname}"`,
    );
  }
  return parsed;
}

/**
 * Diagnostic/browser-mode loopback WebSocket transport adapter (ST-07).
 * Enforces strict loopback-only host validation (127.0.0.1 / localhost / [::1]).
 */
export class LoopbackWsTransportAdapter implements TransportAdapter {
  public readonly kind = "loopback-ws" as const;
  private readonly url: URL;
  private ws: WebSocket | null = null;
  private readonly listeners = new Map<number, Set<(frame: ArrayBuffer) => void>>();
  private readonly pendingRpc = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private reqSeq = 0;

  constructor(urlString = "ws://127.0.0.1:19420/alg2") {
    this.url = assertLoopbackUrl(urlString);
  }

  private ensureSocket(): WebSocket {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return this.ws;
    }
    const ws = new WebSocket(this.url.toString());
    ws.binaryType = "arraybuffer";
    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer && ev.data.byteLength >= 12) {
        const dv = new DataView(ev.data);
        const streamId = dv.getUint32(8, true);
        const subs = this.listeners.get(streamId);
        if (subs) {
          for (const cb of subs) cb(ev.data);
        }
        return;
      }
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data) as { id?: string; result?: unknown; error?: string };
          if (msg.id && this.pendingRpc.has(msg.id)) {
            const p = this.pendingRpc.get(msg.id)!;
            this.pendingRpc.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error));
            else p.resolve(msg.result);
          }
        } catch {
          // Ignore malformed non-RPC frames
        }
      }
    };
    this.ws = ws;
    return ws;
  }

  invokeJson<TReq, TRes>(cmd: string, payload: TReq): Promise<TRes> {
    const ws = this.ensureSocket();
    const id = `rpc-${++this.reqSeq}`;
    return new Promise<TRes>((resolve, reject) => {
      this.pendingRpc.set(id, {
        resolve: (v) => resolve(v as TRes),
        reject,
      });
      const send = () => ws.send(JSON.stringify({ id, cmd, payload }));
      if (ws.readyState === WebSocket.OPEN) {
        send();
      } else {
        ws.addEventListener("open", send, { once: true });
        ws.addEventListener("error", () => {
          this.pendingRpc.delete(id);
          reject(new Error(`Loopback WebSocket failed connecting to ${this.url.toString()}`));
        }, { once: true });
      }
    });
  }

  subscribeBinary(streamId: number, onFrame: (frame: ArrayBuffer) => void): () => void {
    this.ensureSocket();
    let set = this.listeners.get(streamId);
    if (!set) {
      set = new Set();
      this.listeners.set(streamId, set);
    }
    set.add(onFrame);
    return () => {
      set?.delete(onFrame);
      if (set && set.size === 0) {
        this.listeners.delete(streamId);
      }
    };
  }

  dispose(): void {
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
    this.pendingRpc.clear();
  }
}
