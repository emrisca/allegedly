import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";
import type { CoordinateBridge } from "../render/webgl2-orderflow-overlay";
import {
  FIB_EXT_LEVELS,
  FIB_LEVELS,
  computeRulerMetrics,
  type AnchorPoint,
  type DrawingObject,
  type PlacedDrawingKind,
  loadStoredVpDefaults,
  type VolumeProfileConfig,
} from "./drawing-engine";
import {
  computeFixedRangeVolumeProfile,
  detectMarketStructure,
  type VpCandleInput,
} from "./volume-profile";

function colorWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      const a = Math.max(0, Math.min(1, alpha));
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }
  }
  return hex;
}

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

export function drawVolumeHistogram(
  ctx: CanvasRenderingContext2D,
  w: number,
  leftX: number,
  rightX: number,
  candles: readonly CandlestickData<UTCTimestamp>[],
  volumes: readonly HistogramData<UTCTimestamp>[],
  startSec: number,
  endSec: number,
  bridge: CoordinateBridge,
  tickFloat: number,
  vpConfig?: VolumeProfileConfig,
  isSelected = false,
) {
  const cfg = vpConfig ?? loadStoredVpDefaults();
  const minSec = Math.min(startSec, endSec);
  const maxSec = Math.max(startSec, endSec);
  const subset: VpCandleInput[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = Number(c.time);
    if (t >= minSec && t <= maxSec) {
      subset.push({
        time: t,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: volumes[i]?.value ?? 1,
      });
    }
  }
  const profile = computeFixedRangeVolumeProfile(subset, tickFloat, cfg);
  if (!profile) return;

  const originX = Math.min(leftX, rightX);
  const rawEndX = Math.max(leftX, rightX);
  const boxEndX = cfg.extendRight ? Math.max(rawEndX, w) : rawEndX;
  const boxSpanW = Math.max(48, boxEndX - originX);
  const histSpanW = Math.max(48, rawEndX - originX);
  const widthFrac = Math.max(0.05, Math.min(1, cfg.widthPercent / 100));
  const maxBarW = Math.max(12, (cfg.extendRight ? boxSpanW : histSpanW) * widthFrac);

  const topY = bridge.priceToY(profile.highPrice);
  const botY = bridge.priceToY(profile.lowPrice);

  ctx.save();
  ctx.setLineDash([]);

  // 1. Histogram Box background
  if (cfg.showHistogramBox && topY !== null && botY !== null) {
    const boxY = Math.min(topY, botY);
    const boxH = Math.abs(botY - topY);
    ctx.fillStyle = colorWithAlpha(cfg.histogramBoxColor, cfg.histogramBoxOpacity);
    ctx.fillRect(originX, boxY, boxSpanW, boxH);
    if (isSelected) {
      ctx.strokeStyle = "rgba(41, 98, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(originX, boxY, boxSpanW, boxH);
      ctx.setLineDash([]);
    }
  }

  // 2. Volume Profile Histogram Rows (Up/Down, Total, or Delta; Left or Right placement)
  if (cfg.showProfile && profile.bins.length > 0) {
    const upOut = colorWithAlpha(cfg.upVolumeColor, cfg.upVolumeOpacity);
    const dnOut = colorWithAlpha(cfg.downVolumeColor, cfg.downVolumeOpacity);
    const upVa = colorWithAlpha(cfg.valueAreaUpColor, cfg.valueAreaUpOpacity);
    const dnVa = colorWithAlpha(cfg.valueAreaDownColor, cfg.valueAreaDownOpacity);

    const anchorRight = cfg.placement === "right";
    const rightAnchorX = cfg.extendRight ? boxEndX : rawEndX;

    for (let i = 0; i < profile.bins.length; i++) {
      const bin = profile.bins[i];
      if (bin.totalVol <= 0) continue;
      const yTop = bridge.priceToY(bin.priceHigh);
      const yBot = bridge.priceToY(bin.priceLow);
      if (yTop === null || yBot === null) continue;
      const top = Math.min(yTop, yBot);
      const rawH = Math.abs(yBot - yTop);
      const rowH = rawH >= 3 ? rawH - 0.6 : Math.max(1, rawH);

      if (cfg.volumeMode === "delta") {
        const denom = Math.max(1e-9, profile.maxAbsDelta);
        const barW = (Math.abs(bin.deltaVol) / denom) * maxBarW;
        const fill =
          bin.deltaVol >= 0
            ? bin.inValueArea
              ? upVa
              : upOut
            : bin.inValueArea
              ? dnVa
              : dnOut;
        ctx.fillStyle = fill;
        const x = anchorRight ? rightAnchorX - barW : originX;
        ctx.fillRect(x, top, barW, rowH);
      } else if (cfg.volumeMode === "total") {
        const barW = (bin.totalVol / profile.maxTotalVol) * maxBarW;
        ctx.fillStyle = bin.inValueArea ? upVa : upOut;
        const x = anchorRight ? rightAnchorX - barW : originX;
        ctx.fillRect(x, top, barW, rowH);
      } else {
        // Up/Down stacked bar
        const barW = (bin.totalVol / profile.maxTotalVol) * maxBarW;
        const upW = bin.totalVol > 0 ? (bin.upVol / bin.totalVol) * barW : 0;
        const dnW = Math.max(0, barW - upW);
        const cUp = bin.inValueArea ? upVa : upOut;
        const cDn = bin.inValueArea ? dnVa : dnOut;
        if (anchorRight) {
          ctx.fillStyle = cDn;
          ctx.fillRect(rightAnchorX - barW, top, dnW, rowH);
          ctx.fillStyle = cUp;
          ctx.fillRect(rightAnchorX - upW, top, upW, rowH);
        } else {
          ctx.fillStyle = cUp;
          ctx.fillRect(originX, top, upW, rowH);
          ctx.fillStyle = cDn;
          ctx.fillRect(originX + upW, top, dnW, rowH);
        }
      }

      if (cfg.showValues && rawH >= 10) {
        const labelVal =
          bin.totalVol >= 1000
            ? `${(bin.totalVol / 1000).toFixed(1)}K`
            : Math.round(bin.totalVol).toString();
        ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "#d1d4dc";
        const tx = anchorRight ? rightAnchorX - maxBarW - 34 : originX + 3;
        ctx.fillText(labelVal, tx, top + rawH * 0.72);
      }
    }
  }

  // 3. Optional HVN (High Volume Nodes) & LVN (Low Volume Nodes) bands
  if (cfg.showHvnLvn) {
    ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    for (const idx of profile.hvnIndices) {
      const bin = profile.bins[idx];
      if (!bin) continue;
      const y = bridge.priceToY(bin.priceMid);
      if (y === null) continue;
      ctx.fillStyle = "rgba(41, 98, 255, 0.14)";
      ctx.fillRect(originX, y - 5, boxSpanW, 10);
      ctx.fillStyle = "#93c5fd";
      ctx.fillText("HVN", originX + boxSpanW - 26, y + 3);
    }
    for (const idx of profile.lvnIndices) {
      const bin = profile.bins[idx];
      if (!bin) continue;
      const y = bridge.priceToY(bin.priceMid);
      if (y === null) continue;
      ctx.strokeStyle = "rgba(255, 152, 0, 0.75)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + boxSpanW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffb74d";
      ctx.fillText("LVN", originX + boxSpanW - 26, y - 3);
    }
  }

  // 4. Developing POC & Developing Value Area curves
  if ((cfg.showDevelopingPoc || cfg.showDevelopingVa) && profile.developing.length > 1) {
    const drawDevCurve = (
      getter: (pt: NonNullable<typeof profile>["developing"][number]) => number,
      stroke: string,
      dash: number[],
    ) => {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.25;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      for (const pt of profile.developing) {
        const dx = bridge.timeToX(pt.time);
        const dy = bridge.priceToY(getter(pt));
        if (dx === null || dy === null) continue;
        if (!started) {
          ctx.moveTo(dx, dy);
          started = true;
        } else {
          ctx.lineTo(dx, dy);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (cfg.showDevelopingVa) {
      drawDevCurve((p) => p.vahPrice, cfg.developingVaColor, [3, 3]);
      drawDevCurve((p) => p.valPrice, cfg.developingVaColor, [3, 3]);
    }
    if (cfg.showDevelopingPoc) {
      drawDevCurve((p) => p.pocPrice, cfg.developingPocColor, []);
    }
  }

  // 5. Key AMT Levels: VAH, VAL, POC
  const drawLevelLine = (price: number, stroke: string, widthPx: number, tag: string) => {
    const ly = bridge.priceToY(price);
    if (ly === null) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = widthPx;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(originX, ly);
    ctx.lineTo(boxEndX, ly);
    ctx.stroke();
    if (isSelected) {
      ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = stroke;
      ctx.fillText(tag, Math.min(boxEndX - 28, w - 34), ly - 4);
    }
  };

  if (cfg.showVah) drawLevelLine(profile.vahPrice, cfg.vahColor, cfg.vahWidth, "VAH");
  if (cfg.showVal) drawLevelLine(profile.valPrice, cfg.valColor, cfg.valWidth, "VAL");
  if (cfg.showPoc) drawLevelLine(profile.pocPrice, cfg.pocColor, cfg.pocWidth, "POC");

  ctx.restore();
}

/**
 * Renders Market Structure swing labels (HH, HL, LH, LL) and Break of Structure (BOS) lines
 * matching Abel's 01Market Structure.md notes.
 */
export function drawMarketStructureOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  candles: readonly CandlestickData<UTCTimestamp>[],
  bridge: CoordinateBridge,
) {
  if (candles.length < 15) return;
  const input = candles.map((c) => ({
    time: Number(c.time),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const { pivots, breaks } = detectMarketStructure(input, 5);
  ctx.save();

  // BOS horizontal dashed lines
  ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (const brk of breaks) {
    const x1 = bridge.timeToX(brk.fromTime);
    const x2 = bridge.timeToX(brk.toTime);
    const y = bridge.priceToY(brk.price);
    if (x1 === null || x2 === null || y === null || y < 6 || y > h - 6) continue;
    const stroke = brk.direction === "bullish" ? "#089981" : "#f23645";
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = stroke;
    const midX = Math.max(8, Math.min(w - 28, (x1 + x2) / 2 - 10));
    ctx.fillText(brk.label, midX, brk.direction === "bullish" ? y - 4 : y + 10);
  }

  // HH / HL / LH / LL swing badges
  ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
  for (const pv of pivots) {
    const x = bridge.timeToX(pv.time);
    const y = bridge.priceToY(pv.price);
    if (x === null || y === null || x < 4 || x > w - 4 || y < 12 || y > h - 12) continue;
    const isBull = pv.kind === "HH" || pv.kind === "HL";
    const fill = isBull ? "#089981" : "#f23645";
    ctx.fillStyle = fill;
    ctx.textAlign = "center";
    ctx.fillText(pv.kind, x, pv.isHigh ? y - 8 : y + 14);
  }
  ctx.textAlign = "left";
  ctx.restore();
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
  style?: Partial<DrawingObject>,
  selected = false,
): void {
  const pts: PixelPoint[] = anchors.map((a) => ({
    x: bridge.timeToX(a.timeSec),
    y: bridge.priceToY(Number(a.priceTick) * tickFloat),
    anchor: a,
  }));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = style?.fillColor ?? color;
  ctx.lineWidth = style?.lineWidth ?? 1.5;
  if (style?.lineStyle === "dashed") {
    ctx.setLineDash([6, 4]);
  } else if (style?.lineStyle === "dotted") {
    ctx.setLineDash([2, 3]);
  }
  const fontSize = style?.fontSize ?? 12;
  const textColor = style?.textColor ?? color;

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
        if (label) {
          ctx.save();
          ctx.setLineDash([]);
          ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillStyle = textColor;
          ctx.fillText(label, 12, p0.y - 6);
          ctx.restore();
        }
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
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        const scale = len > 0.5 ? (w + h) / len : 1;
        const sx = style?.extendLeft ? p0.x - dx * scale : p0.x;
        const sy = style?.extendLeft ? p0.y - dy * scale : p0.y;
        const ex = style?.extendRight ? p0.x + dx * scale : p1.x;
        const ey = style?.extendRight ? p0.y + dy * scale : p1.y;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (label) {
          ctx.save();
          ctx.setLineDash([]);
          ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillStyle = textColor;
          ctx.fillText(label, (p0.x + p1.x) / 2 + 6, (p0.y + p1.y) / 2 - 6);
          ctx.restore();
        }
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
        const rr = Math.max(0.25, Math.min(20, style?.rrRatio ?? 2));
        const dist = Math.max(24, Math.abs(p1.y - p0.y));
        const tpY = isShort ? entryY + dist : entryY - dist;
        const slY = isShort ? entryY - dist / rr : entryY + dist / rr;

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
        const entryPrice = Number(p0.anchor.priceTick) * tickFloat;
        const targetPrice = Number(p1.anchor.priceTick) * tickFloat;
        const targetPct = entryPrice > 0 ? (Math.abs(targetPrice - entryPrice) / entryPrice) * 100 : 0;
        ctx.fillText(
          `${isShort ? "SHORT" : "LONG"}  R:R ${rr.toFixed(2)}  (${targetPct.toFixed(2)}%)`,
          rx + 6,
          entryY - 5,
        );
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
        const showBands = Boolean(style?.avwapShowBands);
        const mult = style?.avwapBandMult ?? 1;
        let cpv = 0;
        let cp2v = 0;
        let cv = 0;
        const mainPts: Array<{ x: number; y: number }> = [];
        const upperPts: Array<{ x: number; y: number }> = [];
        const lowerPts: Array<{ x: number; y: number }> = [];

        for (let i = 0; i < candles.length; i++) {
          const c = candles[i];
          if (Number(c.time) < startSec) continue;
          const vol = Math.max(0.0001, volumes[i]?.value ?? 1);
          const typ = (c.high + c.low + c.close) / 3;
          cpv += typ * vol;
          cp2v += typ * typ * vol;
          cv += vol;
          const mean = cpv / cv;
          const variance = Math.max(0, cp2v / cv - mean * mean);
          const std = Math.sqrt(variance);

          const vx = bridge.timeToX(Number(c.time));
          const vy = bridge.priceToY(mean);
          if (vx !== null && vy !== null && vy >= -h && vy <= h * 2) {
            mainPts.push({ x: vx, y: vy });
            if (showBands) {
              const uy = bridge.priceToY(mean + std * mult);
              const ly = bridge.priceToY(mean - std * mult);
              if (uy !== null && ly !== null) {
                upperPts.push({ x: vx, y: uy });
                lowerPts.push({ x: vx, y: ly });
              }
            }
          }
        }

        if (showBands && upperPts.length >= 2 && lowerPts.length >= 2) {
          ctx.save();
          ctx.fillStyle = colorWithAlpha(color, 0.1);
          ctx.beginPath();
          ctx.moveTo(upperPts[0].x, upperPts[0].y);
          for (let i = 1; i < upperPts.length; i++) ctx.lineTo(upperPts[i].x, upperPts[i].y);
          for (let i = lowerPts.length - 1; i >= 0; i--) ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = colorWithAlpha(color, 0.55);
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(upperPts[0].x, upperPts[0].y);
          for (let i = 1; i < upperPts.length; i++) ctx.lineTo(upperPts[i].x, upperPts[i].y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(lowerPts[0].x, lowerPts[0].y);
          for (let i = 1; i < lowerPts.length; i++) ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
          ctx.stroke();
          ctx.restore();
        }

        if (mainPts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(mainPts[0].x, mainPts[0].y);
          for (let i = 1; i < mainPts.length; i++) ctx.lineTo(mainPts[i].x, mainPts[i].y);
          ctx.stroke();
        }
      }
      break;

    case "fixed_range_vp":
      if (p0?.x !== null && p1?.x !== null) {
        drawVolumeHistogram(
          ctx,
          w,
          p0.x,
          p1.x,
          candles,
          volumes,
          p0.anchor.timeSec,
          p1.anchor.timeSec,
          bridge,
          tickFloat,
          style?.vpConfig,
          selected,
        );
      }
      break;

    case "anchored_vp":
      if (p0?.x !== null) {
        const lastSec = Number(candles[candles.length - 1]?.time ?? p0.anchor.timeSec);
        const lastX = bridge.timeToX(lastSec) ?? Math.min(w - 64, p0.x + 180);
        drawVolumeHistogram(
          ctx,
          w,
          p0.x,
          Math.max(p0.x + 80, lastX),
          candles,
          volumes,
          p0.anchor.timeSec,
          lastSec,
          bridge,
          tickFloat,
          style?.vpConfig,
          selected,
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
        const baseLeft = Math.min(p0.x, p1.x);
        const baseRight = Math.max(p0.x, p1.x);
        const rx = style?.extendLeft ? 0 : baseLeft;
        const rx2 = style?.extendRight ? w : baseRight;
        const ry = Math.min(p0.y, p1.y);
        const rw = Math.max(1, rx2 - rx);
        const rh = Math.abs(p1.y - p0.y);
        if (style?.fillEnabled !== false) {
          ctx.save();
          ctx.fillStyle = style?.fillColor ?? color;
          ctx.globalAlpha = style?.fillOpacity ?? 0.16;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.restore();
        }
        ctx.strokeRect(rx, ry, rw, rh);
        if (style?.showMiddleLine) {
          const midY = ry + rh / 2;
          ctx.save();
          ctx.strokeStyle = style.middleLineColor ?? color;
          ctx.lineWidth = 1;
          const mStyle = style.middleLineStyle ?? "dashed";
          ctx.setLineDash(mStyle === "dashed" ? [5, 4] : mStyle === "dotted" ? [2, 3] : []);
          ctx.beginPath();
          ctx.moveTo(rx, midY);
          ctx.lineTo(rx + rw, midY);
          ctx.stroke();
          ctx.restore();
        }
        if (label) {
          ctx.save();
          ctx.setLineDash([]);
          ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillStyle = textColor;
          ctx.fillText(label, baseLeft + 8, ry + fontSize + 4);
          ctx.restore();
        }
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
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = textColor;
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
    ctx.setLineDash([]);
    const radius = selected ? 4.5 : 2.5;
    for (const p of pts) {
      if (p.x !== null && p.y !== null) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#131722";
        ctx.fill();
        ctx.lineWidth = selected ? 2 : 1.5;
        ctx.strokeStyle = selected ? "#2962ff" : color;
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
