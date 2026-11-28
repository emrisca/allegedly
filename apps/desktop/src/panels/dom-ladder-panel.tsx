import { useEffect, useRef } from "react";
import {
  decodeFrameHeader,
  decodeLiveL2BookBatch,
  decodeLiveTradeBatch,
  formatFixedE9,
  FrameType,
  unpackTradeFlags,
  type LiveL2BookLevel,
  type LiveTradeRecord,
  type TransportAdapter,
} from "@allegedly/ipc-client";

export interface DomLadderPanelProps {
  transport: TransportAdapter;
  symbol: string;
  compactDensity?: boolean;
}

/**
 * 60 Hz Canvas2D DOM Ladder & Time & Sales hot-path renderer (AGENTS.md #5 / E07).
 * Consumes binary ALG2 frames directly into mutable refs and repaints inside rAF
 * with zero React state updates or virtual-DOM diffing.
 */
export function DomLadderPanel({
  transport,
  symbol,
  compactDensity = true,
}: DomLadderPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const compactRef = useRef<boolean>(compactDensity);
  compactRef.current = compactDensity;
  const repaintRef = useRef<() => void>(() => {});

  useEffect(() => {
    repaintRef.current();
  }, [compactDensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let asks: LiveL2BookLevel[] = [];
    let bids: LiveL2BookLevel[] = [];
    const tape: LiveTradeRecord[] = [];
    let dirty = true;
    let rafId = 0;

    const paint = () => {
      rafId = 0;
      if (!dirty) return;
      dirty = false;

      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(240, host.clientWidth);
      const h = Math.max(200, host.clientHeight);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const light = document.documentElement.dataset.theme === "light";
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = light ? "#ffffff" : "#12141a";
      ctx.fillRect(0, 0, w, h);

      // Header bar
      ctx.fillStyle = light ? "#f1f3f7" : "#16181f";
      ctx.fillRect(0, 0, w, 28);
      ctx.fillStyle = light ? "#d4d4d8" : "#292b32";
      ctx.fillRect(0, 27, w, 1);
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = light ? "#27272a" : "#e6e8ee";
      ctx.fillText(`DOM · ${symbol}`, 10, 18);
      ctx.fillStyle = light ? "#52525b" : "#9ca3af";
      ctx.fillText("SIZE", w - 64, 18);

      const rowH = compactRef.current ? 17 : 22;
      const visibleSide = Math.min(10, Math.max(4, Math.floor((h - 160) / (rowH * 2))));
      const topAsks = asks.slice(0, visibleSide).reverse();
      const topBids = bids.slice(0, visibleSide);

      let maxQty = 1n;
      for (const l of [...topAsks, ...topBids]) {
        if (l.qtyE9 > maxQty) maxQty = l.qtyE9;
      }

      let y = 32;
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";

      // Asks (sell liquidity)
      for (const lvl of topAsks) {
        const barW = Number((lvl.qtyE9 * BigInt(Math.floor(w - 20))) / maxQty);
        ctx.fillStyle = "rgba(242, 54, 69, 0.16)";
        ctx.fillRect(w - 10 - barW, y, barW, rowH - 2);
        ctx.fillStyle = light ? "#b42332" : "#f87171";
        ctx.fillText(formatFixedE9(lvl.priceE9, 2), 10, y + 12);
        ctx.fillStyle = light ? "#27272a" : "#e4e4e7";
        ctx.fillText(formatFixedE9(lvl.qtyE9, 3), w - 72, y + 12);
        y += rowH;
      }

      // Spread divider
      ctx.fillStyle = light ? "#d4d4d8" : "#292b32";
      ctx.fillRect(8, y + 2, w - 16, 1);
      y += 8;

      // Bids (buy liquidity)
      for (const lvl of topBids) {
        const barW = Number((lvl.qtyE9 * BigInt(Math.floor(w - 20))) / maxQty);
        ctx.fillStyle = "rgba(8, 153, 129, 0.18)";
        ctx.fillRect(w - 10 - barW, y, barW, rowH - 2);
        ctx.fillStyle = light ? "#08705f" : "#34d399";
        ctx.fillText(formatFixedE9(lvl.priceE9, 2), 10, y + 12);
        ctx.fillStyle = light ? "#27272a" : "#e4e4e7";
        ctx.fillText(formatFixedE9(lvl.qtyE9, 3), w - 72, y + 12);
        y += rowH;
      }

      // Time & Sales tape footer section
      y += 6;
      ctx.fillStyle = light ? "#f1f3f7" : "#16181f";
      ctx.fillRect(0, y, w, 22);
      ctx.fillStyle = light ? "#d4d4d8" : "#292b32";
      ctx.fillRect(0, y, w, 1);
      ctx.fillRect(0, y + 21, w, 1);
      ctx.fillStyle = light ? "#52525b" : "#9ca3af";
      ctx.fillText("TIME & SALES (ALG2)", 10, y + 15);
      y += 26;

      const tapeRowH = compactRef.current ? 15 : 19;
      const maxTapeRows = Math.max(0, Math.floor((h - y - 4) / tapeRowH));
      for (let i = 0; i < Math.min(tape.length, maxTapeRows); i++) {
        const t = tape[i];
        const { side } = unpackTradeFlags(t.flags);
        const isBuy = side === 1;
        ctx.fillStyle = light ? (isBuy ? "#08705f" : "#b42332") : (isBuy ? "#22c55e" : "#ef4444");
        ctx.fillText(isBuy ? "BUY " : "SELL", 10, y + 11);
        ctx.fillStyle = light ? "#27272a" : "#e6e8ee";
        ctx.fillText(formatFixedE9(t.priceE9, 2), 52, y + 11);
        ctx.fillStyle = light ? "#52525b" : "#9ca3af";
        ctx.fillText(formatFixedE9(t.qtyE9, 3), w - 72, y + 11);
        y += tapeRowH;
      }

      ctx.restore();
    };

    const schedulePaint = () => {
      dirty = true;
      if (rafId === 0) {
        rafId = requestAnimationFrame(paint);
      }
    };
    repaintRef.current = schedulePaint;

    const unsub = transport.subscribeBinary(1, (buf) => {
      try {
        const hdr = decodeFrameHeader(buf);
        if (hdr.frameType === FrameType.LIVE_L2_BOOK_BATCH) {
          const { levels } = decodeLiveL2BookBatch(buf);
          bids = levels.filter((l) => l.sideActionFlags === 0);
          asks = levels.filter((l) => l.sideActionFlags !== 0);
          schedulePaint();
        } else if (hdr.frameType === FrameType.LIVE_TRADE_BATCH) {
          const { trades } = decodeLiveTradeBatch(buf);
          for (const t of trades) {
            tape.unshift(t);
          }
          if (tape.length > 40) tape.length = 40;
          schedulePaint();
        }
      } catch {
        // Ignore malformed frames
      }
    });

    const themeObserver = new MutationObserver(schedulePaint);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const ro = new ResizeObserver(schedulePaint);
    ro.observe(host);
    schedulePaint();

    return () => {
      unsub();
      ro.disconnect();
      themeObserver.disconnect();
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [transport, symbol]);

  return (
    <div ref={hostRef} className="h-full w-full overflow-hidden bg-[var(--app-panel-bg,#12141a)]">
      <canvas
        ref={canvasRef}
        aria-label={`DOM Ladder and Time and Sales for ${symbol}`}
        className="block h-full w-full"
      />
    </div>
  );
}
