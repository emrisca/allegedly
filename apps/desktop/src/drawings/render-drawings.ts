import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";
import type { CoordinateBridge } from "../render/webgl2-orderflow-overlay";
import {
  FIB_EXT_LEVELS,
  FIB_LEVELS,
  computeRulerMetrics,
  type AnchorPoint,
  type PlacedDrawingKind,
} from "./drawing-engine";

interface PixelPoint {
  x: number | null;
  y: number | null;
  anchor: AnchorPoint;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size = 7,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - size * Math.cos(angle - Math.PI / 6),
    toY - size * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - size * Math.cos(angle + Math.PI / 6),
    toY - size * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  borderColor: string,
  bgColor = "rgba(18, 21, 29, 0.94)",
  textColor = "#e6e8ee",
) {
  ctx.save();
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  const padX = 8;
  const metrics = ctx.measureText(text);
  const bw = Math.max(44, metrics.width + padX * 2);
  const bh = 22;
  drawRoundedRectPath(ctx, x, y - bh / 2, bw, bh, 5);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = borderColor;
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y);
  ctx.restore();
}

function drawVolumeHistogram(
  ctx: CanvasRenderingContext2D,
  leftX: number,
  rightX: number,
  candles: readonly CandlestickData<UTCTimestamp>[],
  volumes: readonly HistogramData<UTCTimestamp>[],
  startSec: number,
  endSec: number,
  bridge: CoordinateBridge,
  color: string,
) {
  const minSec = Math.min(startSec, endSec);
  const maxSec = Math.max(startSec, endSec);
  let lowPrice = Number.POSITIVE_INFINITY;
  let highPrice = Number.NEGATIVE_INFINITY;
  const subset: Array<{ high: number; low: number; close: number; open: number; vol: number }> = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = Number(c.time);
    if (t >= minSec && t <= maxSec) {
      if (c.low < lowPrice) lowPrice = c.low;
      if (c.high > highPrice) highPrice = c.high;
      subset.push({
        high: c.high,
        low: c.low,
        close: c.close,
        open: c.open,
        vol: volumes[i]?.value ?? 1,
      });
    }
  }
  if (subset.length === 0 || !Number.isFinite(lowPrice) || highPrice <= lowPrice) return;

  const bucketCount = 24;
  const step = (highPrice - lowPrice) / bucketCount;
  const upVol = new Float64Array(bucketCount);
  const dnVol = new Float64Array(bucketCount);
  for (const bar of subset) {
    const mid = (bar.high + bar.low + bar.close) / 3;
    const idx = Math.max(0, Math.min(bucketCount - 1, Math.floor((mid - lowPrice) / step)));
    if (bar.close >= bar.open) upVol[idx] += bar.vol;
    else dnVol[idx] += bar.vol;
  }

  let maxTot = 0;
  let pocIdx = 0;
  for (let i = 0; i < bucketCount; i++) {
    const tot = upVol[i] + dnVol[i];
    if (tot > maxTot) {
      maxTot = tot;
      pocIdx = i;
    }
  }
  if (maxTot <= 0) return;

  const spanW = Math.max(48, Math.abs(rightX - leftX));
  const originX = Math.min(leftX, rightX);
  const maxBarW = spanW * 0.42;

  for (let i = 0; i < bucketCount; i++) {
    const pLow = lowPrice + i * step;
    const pHigh = pLow + step;
    const yTop = bridge.priceToY(pHigh);
    const yBot = bridge.priceToY(pLow);
    if (yTop === null || yBot === null) continue;
    const rowH = Math.max(2, Math.abs(yBot - yTop) - 1);
    const top = Math.min(yTop, yBot);
    const tot = upVol[i] + dnVol[i];
    const barW = (tot / maxTot) * maxBarW;
    const upW = tot > 0 ? (upVol[i] / tot) * barW : 0;
    const dnW = barW - upW;

    ctx.fillStyle = i === pocIdx ? "rgba(250, 204, 21, 0.72)" : "rgba(56, 189, 248, 0.42)";
    ctx.fillRect(originX, top, upW, rowH);
    ctx.fillStyle = i === pocIdx ? "rgba(245, 158, 11, 0.78)" : "rgba(239, 83, 80, 0.36)";
    ctx.fillRect(originX + upW, top, dnW, rowH);
  }

  const pocY = bridge.priceToY(lowPrice + (pocIdx + 0.5) * step);
  if (pocY !== null) {
    ctx.save();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(originX, pocY);
    ctx.lineTo(originX + spanW, pocY);
    ctx.stroke();
    ctx.restore();
  }

  // Subtle range frame
  const topY = bridge.priceToY(highPrice);
  const botY = bridge.priceToY(lowPrice);
  if (topY !== null && botY !== null) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(originX, Math.min(topY, botY), spanW, Math.abs(botY - topY));
    ctx.restore();
  }
}

export function drawVectorDrawing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: PlacedDrawingKind,
  anchors: readonly AnchorPoint[],
  color: string,
  tickFloat: number,
  bridge: CoordinateBridge,
  candles: readonly CandlestickData<UTCTimestamp>[],
  volumes: readonly HistogramData<UTCTimestamp>[],
  label?: string,
  showHandles = true,
): void {
  const pts: PixelPoint[] = anchors.map((a) => ({
    x: bridge.timeToX(a.timeSec),
    y: bridge.priceToY(Number(a.priceTick) * tickFloat),
    anchor: a,
  }));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;

  const p0 = pts[0];
  const p1 = pts[1];
  const p2 = pts[2];
  const p3 = pts[3];

  switch (kind) {
    case "horizontal_line":
      if (p0?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, p0.y);
        ctx.lineTo(w, p0.y);
        ctx.stroke();
      }
      break;

    case "horizontal_ray":
      if (p0?.y !== null) {
        const startX = p0.x ?? 0;
        ctx.beginPath();
        ctx.moveTo(startX, p0.y);
        ctx.lineTo(w, p0.y);
        ctx.stroke();
      }
      break;

    case "vertical_line":
      if (p0?.x !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, 0);
        ctx.lineTo(p0.x, h);
        ctx.stroke();
      }
      break;

    case "crossline":
      if (p0?.x !== null && p0.y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, p0.y);
        ctx.lineTo(w, p0.y);
        ctx.moveTo(p0.x, 0);
        ctx.lineTo(p0.x, h);
        ctx.stroke();
      }
      break;

    case "trendline":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      break;

    case "ray":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
          const scale = (w + h) / len;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p0.x + dx * scale, p0.y + dy * scale);
          ctx.stroke();
        }
      }
      break;

    case "extended_line":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
          const scale = (w + h) / len;
          ctx.beginPath();
          ctx.moveTo(p0.x - dx * scale, p0.y - dy * scale);
          ctx.lineTo(p0.x + dx * scale, p0.y + dy * scale);
          ctx.stroke();
        }
      }
      break;

    case "info_line":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        const deltaPrice = Number(p1.anchor.priceTick - p0.anchor.priceTick) * tickFloat;
        const startPrice = Number(p0.anchor.priceTick) * tickFloat;
        const pct = startPrice !== 0 ? (deltaPrice / startPrice) * 100 : 0;
        const angleDeg = (Math.atan2(-(p1.y - p0.y), p1.x - p0.x) * 180) / Math.PI;
        const sign = deltaPrice >= 0 ? "+" : "";
        drawBadge(
          ctx,
          (p0.x + p1.x) / 2 + 8,
          (p0.y + p1.y) / 2 - 14,
          `${sign}${deltaPrice.toFixed(2)} (${sign}${pct.toFixed(2)}%) · ${angleDeg.toFixed(1)}°`,
          color,
        );
      }
      break;

    case "trend_angle":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p0.x + Math.max(48, Math.abs(p1.x - p0.x)), p0.y);
        ctx.stroke();
        ctx.restore();
        const angleRad = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const deg = (-angleRad * 180) / Math.PI;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, 26, Math.min(0, angleRad), Math.max(0, angleRad));
        ctx.stroke();
        ctx.font = "10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(`${deg.toFixed(1)}°`, p0.x + 32, p0.y - 6);
      }
      break;

    case "fib_retracement":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const leftX = Math.min(p0.x, p1.x);
        const rightX = Math.max(p0.x, p1.x, leftX + 90);
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillRect(leftX, Math.min(p0.y, p1.y), rightX - leftX, Math.abs(p1.y - p0.y));
        ctx.restore();
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        for (const lvl of FIB_LEVELS) {
          const y = p0.y + (p1.y - p0.y) * lvl;
          ctx.beginPath();
          ctx.moveTo(leftX, y);
          ctx.lineTo(rightX, y);
          ctx.stroke();
          ctx.fillText(`${(lvl * 100).toFixed(1)}%`, rightX + 5, y + 3);
        }
      }
      break;

    case "fib_extension":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const baseAnchor = p2?.y !== null && p2?.x !== null ? p2 : p1;
        const leftX = Math.min(p0.x, p1.x, baseAnchor.x ?? p1.x);
        const rightX = Math.max(p0.x, p1.x, baseAnchor.x ?? p1.x, leftX + 110);
        const span = p1.y - p0.y;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        if (p2?.x !== null && p2?.y !== null) ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        const refY = baseAnchor.y ?? p1.y;
        for (const lvl of FIB_EXT_LEVELS) {
          const y = refY + span * lvl;
          ctx.beginPath();
          ctx.moveTo(leftX, y);
          ctx.lineTo(rightX, y);
          ctx.stroke();
          ctx.fillText(`${lvl.toFixed(3)}`, rightX + 5, y + 3);
        }
      }
      break;

    case "fib_channel":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const offset = p2?.y !== null ? p2.y - p0.y : 60;
        for (const lvl of [0, 0.382, 0.5, 0.618, 1]) {
          const dy = offset * lvl;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y + dy);
          ctx.lineTo(p1.x, p1.y + dy);
          ctx.stroke();
        }
      }
      break;

    case "fib_time_zone":
    case "fib_trend_time":
      if (p0?.x !== null && p1?.x !== null) {
        const unit = Math.max(12, Math.abs(p1.x - p0.x));
        const dir = p1.x >= p0.x ? 1 : -1;
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        for (const n of [0, 1, 2, 3, 5, 8, 13, 21]) {
          const x = p0.x + dir * unit * n;
          if (x < 0 || x > w) continue;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
          ctx.fillText(String(n), x + 3, 18);
        }
      }
      break;

    case "fib_fan":
    case "pitchfan":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const rightX = w;
        const dx = p1.x - p0.x || 1;
        for (const ratio of [0.25, 0.382, 0.5, 0.618, 0.786, 1]) {
          const ty = p0.y + (p1.y - p0.y) * ratio;
          const slope = (ty - p0.y) / dx;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(rightX, p0.y + slope * (rightX - p0.x));
          ctx.stroke();
        }
      }
      break;

    case "fib_circles":
    case "fib_arcs":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const radius = Math.max(8, Math.hypot(p1.x - p0.x, p1.y - p0.y));
        for (const lvl of [0.382, 0.5, 0.618, 1, 1.618]) {
          ctx.beginPath();
          if (kind === "fib_arcs") {
            ctx.arc(p0.x, p0.y, radius * lvl, Math.PI, Math.PI * 2);
          } else {
            ctx.arc(p0.x, p0.y, radius * lvl, 0, Math.PI * 2);
          }
          ctx.stroke();
        }
      }
      break;

    case "fib_spiral":
    case "fib_wedge":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const baseR = Math.max(10, Math.hypot(p1.x - p0.x, p1.y - p0.y));
        ctx.beginPath();
        for (let t = 0; t <= Math.PI * 4; t += 0.15) {
          const r = (baseR * t) / (Math.PI * 4);
          const x = p0.x + r * Math.cos(t);
          const y = p0.y + r * Math.sin(t);
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;

    case "xabcd_pattern":
    case "cypher_pattern":
    case "head_and_shoulders":
    case "abcd_pattern":
    case "triangle_pattern":
    case "three_drives":
    case "elliott_impulse":
    case "elliott_correction":
    case "elliott_triangle":
    case "elliott_double_combo":
    case "elliott_triple_combo": {
      const valid = pts.filter((p): p is { x: number; y: number; anchor: AnchorPoint } => p.x !== null && p.y !== null);
      if (valid.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(valid[0].x, valid[0].y);
        for (let i = 1; i < valid.length; i++) {
          ctx.lineTo(valid[i].x, valid[i].y);
        }
        if (kind === "triangle_pattern" && valid.length >= 3) {
          ctx.closePath();
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fill();
          ctx.restore();
        }
        ctx.stroke();

        const labelsMap: Record<string, string[]> = {
          xabcd_pattern: ["X", "A", "B", "C", "D"],
          cypher_pattern: ["X", "A", "B", "C", "D"],
          head_and_shoulders: ["LS", "NL", "H", "NR", "RS"],
          abcd_pattern: ["A", "B", "C", "D"],
          triangle_pattern: ["A", "B", "C", "D"],
          three_drives: ["0", "1", "A", "2", "B", "3"],
          elliott_impulse: ["(0)", "(1)", "(2)", "(3)", "(4)", "(5)"],
          elliott_correction: ["(0)", "(A)", "(B)", "(C)"],
          elliott_triangle: ["(0)", "(A)", "(B)", "(C)", "(D)", "(E)"],
          elliott_double_combo: ["(0)", "(W)", "(X)", "(Y)"],
          elliott_triple_combo: ["(0)", "(W)", "(X)", "(Y)", "(X)", "(Z)"],
        };
        const lbls = labelsMap[kind] ?? [];
        ctx.font = "bold 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        valid.forEach((pt, idx) => {
          const text = lbls[idx] ?? String(idx + 1);
          ctx.fillText(text, pt.x - 6, pt.y - 8);
        });
      }
      break;
    }

    case "cyclic_lines":
      if (p0?.x !== null && p1?.x !== null) {
        const period = Math.max(18, Math.abs(p1.x - p0.x));
        for (let x = p0.x % period; x < w; x += period) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
      break;

    case "time_cycles":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null) {
        const r = Math.max(14, Math.abs(p1.x - p0.x) / 2);
        const startX = Math.min(p0.x, p1.x);
        for (let x = startX + r; x < w + r; x += r * 2) {
          ctx.beginPath();
          ctx.arc(x, p0.y, r, Math.PI, 0);
          ctx.stroke();
        }
      }
      break;

    case "sine_line":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const halfPeriod = Math.max(20, Math.abs(p1.x - p0.x));
        const amp = Math.max(12, Math.abs(p1.y - p0.y));
        ctx.beginPath();
        for (let x = Math.min(p0.x, p1.x); x <= w; x += 4) {
          const phase = ((x - p0.x) / halfPeriod) * Math.PI;
          const y = p0.y - Math.sin(phase) * amp;
          if (x === Math.min(p0.x, p1.x)) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;

    case "long_position":
    case "short_position":
    case "position_forecast":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const isShort = kind === "short_position";
        const rx = Math.min(p0.x, p1.x);
        const rw = Math.max(110, Math.abs(p1.x - p0.x));
        const entryY = p0.y;
        const dist = Math.max(24, Math.abs(p1.y - p0.y));
        const tpY = isShort ? entryY + dist : entryY - dist;
        const slY = isShort ? entryY - dist * 0.5 : entryY + dist * 0.5;

        // Profit zone (teal/emerald)
        ctx.fillStyle = "rgba(38, 166, 154, 0.22)";
        ctx.fillRect(rx, Math.min(entryY, tpY), rw, Math.abs(tpY - entryY));
        ctx.strokeStyle = "#26a69a";
        ctx.strokeRect(rx, Math.min(entryY, tpY), rw, Math.abs(tpY - entryY));

        // Risk zone (coral/rose)
        ctx.fillStyle = "rgba(239, 83, 80, 0.22)";
        ctx.fillRect(rx, Math.min(entryY, slY), rw, Math.abs(slY - entryY));
        ctx.strokeStyle = "#ef5350";
        ctx.strokeRect(rx, Math.min(entryY, slY), rw, Math.abs(slY - entryY));

        // Entry divider
        ctx.strokeStyle = "#e6e8ee";
        ctx.beginPath();
        ctx.moveTo(rx, entryY);
        ctx.lineTo(rx + rw, entryY);
        ctx.stroke();

        ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#e6e8ee";
        ctx.fillText(isShort ? "SHORT  R:R 2.00" : "LONG  R:R 2.00", rx + 6, entryY - 5);
      }
      break;

    case "bars_pattern":
    case "ghost_feed":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const rx = Math.min(p0.x, p1.x);
        const rw = Math.max(60, Math.abs(p1.x - p0.x));
        ctx.save();
        ctx.globalAlpha = 0.65;
        const barsCount = 12;
        const stepX = rw / barsCount;
        for (let i = 0; i < barsCount; i++) {
          const t = i / (barsCount - 1);
          const bx = rx + i * stepX + stepX * 0.35;
          const by = p0.y + (p1.y - p0.y) * t + Math.sin(i * 1.4) * 14;
          ctx.strokeRect(bx, by - 8, Math.max(3, stepX * 0.45), 16);
        }
        ctx.restore();
      }
      break;

    case "sector":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const radius = Math.max(20, Math.hypot(p1.x - p0.x, p1.y - p0.y));
        const a1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const a2 = p2?.x !== null && p2?.y !== null ? Math.atan2(p2.y - p0.y, p2.x - p0.x) : a1 + 0.7;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.arc(p0.x, p0.y, radius, a1, a2);
        ctx.closePath();
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.restore();
        ctx.stroke();
      }
      break;

    case "anchored_vwap":
      if (p0) {
        const startSec = p0.anchor.timeSec;
        let cpv = 0;
        let cv = 0;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < candles.length; i++) {
          const c = candles[i];
          if (Number(c.time) < startSec) continue;
          const vol = volumes[i]?.value ?? 1;
          const typ = (c.high + c.low + c.close) / 3;
          cpv += typ * vol;
          cv += vol;
          if (cv <= 0) continue;
          const vx = bridge.timeToX(Number(c.time));
          const vy = bridge.priceToY(cpv / cv);
          if (vx !== null && vy !== null && vy >= 0 && vy <= h) {
            if (!started) {
              ctx.moveTo(vx, vy);
              started = true;
            } else {
              ctx.lineTo(vx, vy);
            }
          }
        }
        ctx.stroke();
      }
      break;

    case "fixed_range_vp":
      if (p0?.x !== null && p1?.x !== null) {
        drawVolumeHistogram(
          ctx,
          p0.x,
          p1.x,
          candles,
          volumes,
          p0.anchor.timeSec,
          p1.anchor.timeSec,
          bridge,
          color,
        );
      }
      break;

    case "anchored_vp":
      if (p0?.x !== null) {
        const lastSec = Number(candles[candles.length - 1]?.time ?? p0.anchor.timeSec);
        const lastX = bridge.timeToX(lastSec) ?? Math.min(w - 64, p0.x + 180);
        drawVolumeHistogram(
          ctx,
          p0.x,
          Math.max(p0.x + 80, lastX),
          candles,
          volumes,
          p0.anchor.timeSec,
          lastSec,
          bridge,
          color,
        );
      }
      break;

    case "price_range":
    case "date_range":
    case "date_price_range":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const rx = Math.min(p0.x, p1.x);
        const ry = Math.min(p0.y, p1.y);
        const rw = Math.abs(p1.x - p0.x);
        const rh = Math.abs(p1.y - p0.y);
        const isNeg = p1.anchor.priceTick < p0.anchor.priceTick;
        const accent = kind === "date_price_range" ? (isNeg ? "#ef5350" : "#2962ff") : color;
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
        ctx.strokeRect(rx, ry, rw, rh);
        const ticks = p1.anchor.priceTick - p0.anchor.priceTick;
        const delta = Number(ticks) * tickFloat;
        const startP = Number(p0.anchor.priceTick) * tickFloat;
        const pct = startP !== 0 ? (delta / startP) * 100 : 0;
        const sign = delta >= 0 ? "+" : "";
        const durMin = Math.round(Math.abs(p1.anchor.timeSec - p0.anchor.timeSec) / 60);
        const msg =
          kind === "date_range"
            ? `${durMin}m`
            : `${sign}${delta.toFixed(2)} (${sign}${pct.toFixed(2)}%) ${ticks.toString()}t`;
        drawBadge(ctx, rx + rw / 2 - 48, ry + rh + 14, msg, accent);
      }
      break;

    case "brush":
    case "highlighter": {
      const valid = pts.filter((p): p is { x: number; y: number; anchor: AnchorPoint } => p.x !== null && p.y !== null);
      if (valid.length >= 2) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (kind === "highlighter") {
          ctx.lineWidth = 14;
          ctx.globalAlpha = 0.28;
        } else {
          ctx.lineWidth = 2.2;
        }
        ctx.beginPath();
        ctx.moveTo(valid[0].x, valid[0].y);
        for (let i = 1; i < valid.length; i++) {
          ctx.lineTo(valid[i].x, valid[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    case "arrow":
    case "arrow_marker":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        ctx.lineWidth = kind === "arrow_marker" ? 3 : 1.6;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        drawArrowHead(ctx, p0.x, p0.y, p1.x, p1.y, kind === "arrow_marker" ? 11 : 8);
      }
      break;

    case "arrow_mark_up":
      if (p0?.x !== null && p0?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - 10);
        ctx.lineTo(p0.x + 8, p0.y + 2);
        ctx.lineTo(p0.x + 3, p0.y + 2);
        ctx.lineTo(p0.x + 3, p0.y + 11);
        ctx.lineTo(p0.x - 3, p0.y + 11);
        ctx.lineTo(p0.x - 3, p0.y + 2);
        ctx.lineTo(p0.x - 8, p0.y + 2);
        ctx.closePath();
        ctx.fill();
      }
      break;

    case "arrow_mark_down":
      if (p0?.x !== null && p0?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y + 10);
        ctx.lineTo(p0.x + 8, p0.y - 2);
        ctx.lineTo(p0.x + 3, p0.y - 2);
        ctx.lineTo(p0.x + 3, p0.y - 11);
        ctx.lineTo(p0.x - 3, p0.y - 11);
        ctx.lineTo(p0.x - 3, p0.y - 2);
        ctx.lineTo(p0.x - 8, p0.y - 2);
        ctx.closePath();
        ctx.fill();
      }
      break;

    case "box_zone":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const rx = Math.min(p0.x, p1.x);
        const ry = Math.min(p0.y, p1.y);
        const rw = Math.abs(p1.x - p0.x);
        const rh = Math.abs(p1.y - p0.y);
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
        ctx.strokeRect(rx, ry, rw, rh);
      }
      break;

    case "rotated_rectangle":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const hProj = p2?.x !== null && p2?.y !== null ? (p2.x - p0.x) * nx + (p2.y - p0.y) * ny : 45;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p1.x + nx * hProj, p1.y + ny * hProj);
        ctx.lineTo(p0.x + nx * hProj, p0.y + ny * hProj);
        ctx.closePath();
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.restore();
        ctx.stroke();
      }
      break;

    case "path":
    case "polyline": {
      const valid = pts.filter((p): p is { x: number; y: number; anchor: AnchorPoint } => p.x !== null && p.y !== null);
      if (valid.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(valid[0].x, valid[0].y);
        for (let i = 1; i < valid.length; i++) {
          ctx.lineTo(valid[i].x, valid[i].y);
        }
        if (kind === "polyline" && valid.length >= 3) {
          ctx.closePath();
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fill();
          ctx.restore();
        }
        ctx.stroke();
        if (kind === "path") {
          const prev = valid[valid.length - 2];
          const last = valid[valid.length - 1];
          drawArrowHead(ctx, prev.x, prev.y, last.x, last.y, 8);
        }
      }
      break;
    }

    case "circle":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.restore();
        ctx.stroke();
      }
      break;

    case "ellipse":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const cx = (p0.x + p1.x) / 2;
        const cy = (p0.y + p1.y) / 2;
        const rx = Math.max(4, Math.abs(p1.x - p0.x) / 2);
        const ry = Math.max(4, Math.abs(p1.y - p0.y) / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.restore();
        ctx.stroke();
      }
      break;

    case "triangle":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        if (p2?.x !== null && p2?.y !== null) {
          ctx.lineTo(p2.x, p2.y);
          ctx.closePath();
          ctx.save();
          ctx.globalAlpha = 0.14;
          ctx.fill();
          ctx.restore();
        }
        ctx.stroke();
      }
      break;

    case "arc":
    case "curve":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const ctrlX = p2?.x ?? (p0.x + p1.x) / 2;
        const ctrlY = p2?.y ?? Math.min(p0.y, p1.y) - 40;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(ctrlX, ctrlY, p1.x, p1.y);
        ctx.stroke();
      }
      break;

    case "double_curve":
      if (p0?.x !== null && p0?.y !== null && p1?.x !== null && p1?.y !== null) {
        const c1x = p2?.x ?? (p0.x + p1.x) / 2;
        const c1y = p2?.y ?? p0.y;
        const c2x = p3?.x ?? (p0.x + p1.x) / 2;
        const c2y = p3?.y ?? p1.y;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p1.x, p1.y);
        ctx.stroke();
      }
      break;

    case "text":
      if (p0?.x !== null && p0?.y !== null) {
        ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = color;
        ctx.fillText(label || "Text", p0.x, p0.y);
      }
      break;

    case "note":
    case "comment":
    case "signpost":
    case "image_annotation":
    case "post_annotation":
    case "idea_annotation":
      if (p0?.x !== null && p0?.y !== null) {
        const prefix =
          kind === "idea_annotation"
            ? "💡 "
            : kind === "post_annotation"
              ? "𝕏 "
              : kind === "image_annotation"
                ? "🖼 "
                : kind === "signpost"
                  ? "★ "
                  : "";
        drawBadge(ctx, p0.x + 6, p0.y - 12, `${prefix}${label || kind.replace("_annotation", "")}`, color);
      }
      break;

    case "price_note":
    case "callout":
      if (p0?.x !== null && p0?.y !== null) {
        const tx = p1?.x ?? p0.x + 36;
        const ty = p1?.y ?? p0.y - 28;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        const priceStr = (Number(p0.anchor.priceTick) * tickFloat).toFixed(2);
        const msg =
          kind === "price_note"
            ? `${label ? `${label} · ` : ""}${priceStr}`
            : label || "Callout";
        drawBadge(ctx, tx, ty, msg, color);
      }
      break;

    case "price_label":
      if (p0?.x !== null && p0?.y !== null) {
        const priceStr = (Number(p0.anchor.priceTick) * tickFloat).toFixed(2);
        drawBadge(ctx, p0.x + 8, p0.y, priceStr, color, "#1e3a8a", "#ffffff");
      }
      break;

    case "pin":
      if (p0?.x !== null && p0?.y !== null) {
        ctx.beginPath();
        ctx.arc(p0.x, p0.y - 10, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - 4);
        ctx.lineTo(p0.x, p0.y);
        ctx.stroke();
      }
      break;

    case "flag_mark":
      if (p0?.x !== null && p0?.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p0.x, p0.y - 18);
        ctx.lineTo(p0.x + 14, p0.y - 13);
        ctx.lineTo(p0.x, p0.y - 8);
        ctx.fill();
        ctx.stroke();
      }
      break;

    case "table":
      if (p0?.x !== null && p0?.y !== null) {
        drawRoundedRectPath(ctx, p0.x, p0.y, 128, 52, 4);
        ctx.fillStyle = "rgba(18, 21, 29, 0.94)";
        ctx.fill();
        ctx.stroke();
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#e6e8ee";
        const px = (Number(p0.anchor.priceTick) * tickFloat).toFixed(2);
        ctx.fillText(`Level   ${px}`, p0.x + 8, p0.y + 18);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(label || "Notes   Key Zone", p0.x + 8, p0.y + 38);
      }
      break;

    case "icon_stamp":
      if (p0?.x !== null && p0?.y !== null) {
        ctx.font = "18px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label || "★", p0.x, p0.y);
      }
      break;
  }

  if (showHandles) {
    for (const p of pts) {
      if (p.x !== null && p.y !== null) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#101217";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

export function drawRulerOverlay(params: {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  start: AnchorPoint;
  end: AnchorPoint;
  tickSizeE9: bigint;
  bridge: CoordinateBridge;
  candles: readonly CandlestickData<UTCTimestamp>[];
  volumes: readonly HistogramData<UTCTimestamp>[];
  decimals: number;
}): void {
  const { ctx, w, h, start, end, tickSizeE9, bridge, candles, volumes, decimals } = params;
  const tickFloat = Number(tickSizeE9) / 1e9;
  const x1 = bridge.timeToX(start.timeSec);
  const y1 = bridge.priceToY(Number(start.priceTick) * tickFloat);
  const x2 = bridge.timeToX(end.timeSec);
  const y2 = bridge.priceToY(Number(end.priceTick) * tickFloat);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return;

  const bars = candles.map((c, idx) => ({
    timeSec: Number(c.time),
    volume: volumes[idx]?.value ?? 0,
  }));
  const metrics = computeRulerMetrics({ start, end, tickSizeE9, bars });

  const solidColor = metrics.isNegative ? "#f23645" : "#2962ff";
  const fillColor = metrics.isNegative
    ? "rgba(242, 54, 69, 0.20)"
    : "rgba(41, 98, 255, 0.20)";

  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.max(1, Math.abs(x2 - x1));
  const rh = Math.max(1, Math.abs(y2 - y1));

  ctx.save();
  // Shaded rectangle
  ctx.fillStyle = fillColor;
  ctx.fillRect(rx, ry, rw, rh);

  // Horizontal & Vertical center cross-axes with directional arrows
  ctx.strokeStyle = solidColor;
  ctx.lineWidth = 1.4;
  const midX = rx + rw / 2;
  const midY = ry + rh / 2;

  if (rw > 4) {
    ctx.beginPath();
    ctx.moveTo(x1, midY);
    ctx.lineTo(x2, midY);
    ctx.stroke();
    drawArrowHead(ctx, x1, midY, x2, midY, 7);
  }
  if (rh > 4) {
    ctx.beginPath();
    ctx.moveTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.stroke();
    drawArrowHead(ctx, midX, y1, midX, y2, 7);
  }

  // Metrics Pill Card below (or above if near bottom)
  const sign = metrics.deltaTicks > 0n ? "+" : "";
  const deltaStr = `${sign}${metrics.deltaPrice.toFixed(decimals)}`;
  const pctStr = `${sign}${metrics.pctChange.toFixed(2)}%`;
  const ticksStr = `${sign}${metrics.deltaTicks.toLocaleString("en-US")} ticks`;
  const line1 = `${deltaStr} (${pctStr}) ${ticksStr}`;
  const line2 = `${metrics.barCount} bars, ${metrics.durationLabel}`;
  const line3 = `Vol ${metrics.volumeLabel}`;

  ctx.font = "600 11.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  const maxTextW = Math.max(
    ctx.measureText(line1).width,
    ctx.measureText(line2).width,
    ctx.measureText(line3).width,
  );
  const cardW = Math.max(176, maxTextW + 24);
  const cardH = 62;
  const cardX = Math.max(8, Math.min(w - cardW - 8, midX - cardW / 2));
  const preferBelow = ry + rh + 8 + cardH < h - 8;
  const cardY = preferBelow ? ry + rh + 8 : Math.max(8, ry - cardH - 8);

  drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 6);
  ctx.fillStyle = solidColor;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const centerX = cardX + cardW / 2;
  ctx.fillText(line1, centerX, cardY + 14);
  ctx.font = "500 11.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(line2, centerX, cardY + 32);
  ctx.fillText(line3, centerX, cardY + 49);

  ctx.restore();
}
