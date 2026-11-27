import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPaneApi,
  type IPriceLine,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type LineData,
  type PrimitivePaneViewZOrder,
  type SeriesAttachedParameter,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  DEFAULT_CHART_SETTINGS,
  DEFAULT_CHART_TEMPLATES,
  type ChartSettings,
  type ChartSettingsTemplate,
} from "@allegedly/ui-chrome";
import { Button } from "@ui-sdk/react/button";
import { Toggle } from "@ui-sdk/react/toggle";
import { Toolbar } from "@ui-sdk/react/toolbar";
import {
  decodeFootprintDelta,
  decodeFrameHeader,
  decodeLiveBarUpdateBatch,
  decodeTpoProfileBitmask,
  decodeVolumeProfile,
  fetchHistoricalOhlc,
  FrameType,
  type FootprintCell,
  type MarketDataSourceId,
  type TpoRow128,
  type TransportAdapter,
  type VolumeProfileBin,
  type VolumeProfileSummary,
} from "@allegedly/ipc-client";
import {
  DEFAULT_FAVORITE_TOOLS,
  DRAWING_TOOL_META,
  DrawingEngine,
  getDrawingToolMeta,
  hitTestDrawing,
  snapTickToMagnet,
  type AnchorPoint,
  type DrawingObject,
  type DrawingToolKind,
  type MagnetTarget,
  type PlacedDrawingKind,
} from "../drawings/drawing-engine";
import {
  drawMarketStructureOverlay,
  drawRulerOverlay,
  drawVectorDrawing,
  drawVolumeHistogram,
} from "../drawings/render-drawings";
import {
  cloneVpConfig,
  computeFixedRangeVolumeProfile,
  loadStoredVpDefaults,
  type VolumeProfileConfig,
  type VpCandleInput,
} from "../drawings/volume-profile";
import { DrawingToolIcon } from "../components/drawing-tool-icons";
import {
  DrawingQuickStyleBar,
  DrawingSettingsDialog,
  VolumeProfileSettingsDialog,
} from "../components/drawing-settings-dialog";
import {
  hexWithOpacity,
  isTimeframeVisible,
  type IndicatorLineStyle,
  type TimeframeVisibility,
} from "../components/indicator-settings-dialog";
import { getSymbolMeta } from "../data/symbols";
import {
  ChartContextMenu,
  type ChartContextMenuState,
} from "../components/chart-context-menu";
import { applyBarHysteresis } from "../render/hysteresis";
import {
  WebGl2OrderflowOverlay,
  type CoordinateBridge,
  type OverlayRenderData,
  type OverlayVisibility,
} from "../render/webgl2-orderflow-overlay";

export interface StudyOverlaySeries {
  id: string;
  label: string;
  color: string;
  overlay?: boolean;
  values: Array<number | null>;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: IndicatorLineStyle;
  opacity?: number;
  showPriceLabel?: boolean;
  showPriceLine?: boolean;
  visibility?: TimeframeVisibility;
}

export interface ChartSeriesSnapshot {
  times: UTCTimestamp[];
  opens?: number[];
  highs?: number[];
  lows?: number[];
  closes: number[];
  volumes: number[];
  buyVolumes: number[];
  sellVolumes: number[];
}

export interface ChartHistoryActions {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  addAlert?: () => void;
  takeSnapshot?: () => void;
  resetZoom?: () => void;
}

export interface ChartOrderOverlay {
  order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  qty_e9: string;
  limit_price_e9?: string | null;
  status: string;
}

export interface ChartPanelProps {
  transport: TransportAdapter;
  symbol: string;
  timeframe: string;
  tickSizeE9: bigint;
  studyOverlays?: readonly StudyOverlaySeries[];
  seriesSnapshotRef?: { current: ChartSeriesSnapshot };
  /** Controlled chrome state from institutional shell */
  activeTool?: DrawingToolKind;
  onSelectTool?: (tool: DrawingToolKind) => void;
  magnetEnabled?: boolean;
  onToggleMagnet?: () => void;
  showFloatingBar?: boolean;
  stayInDrawingMode?: boolean;
  drawingsLocked?: boolean;
  drawingsHidden?: boolean;
  favoriteTools?: readonly PlacedDrawingKind[];
  activeIconStamp?: string;
  candleStyle?: "monochrome" | "classic";
  autoScale?: boolean;
  onAutoScaleChange?: (auto: boolean) => void;
  logScale?: boolean;
  onLogScaleChange?: (log: boolean) => void;
  rangePreset?: "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";
  historyActionsRef?: { current: ChartHistoryActions | null };
  onHistoryMetaChange?: (meta: { canUndo: boolean; canRedo: boolean; count: number }) => void;
  onRemoveStudy?: (id: string) => void;
  onOpenStudySettings?: (id: string) => void;
  onLivePriceSample?: (symbol: string, last: number) => void;
  /** Live Chart Settings + Templates + Context Menu actions */
  chartSettings?: ChartSettings;
  replayOpen?: boolean;
  chartTemplates?: readonly ChartSettingsTemplate[];
  onApplyChartTemplate?: (template: ChartSettingsTemplate) => void;
  onApplyChartDefaults?: () => void;
  onOpenSettings?: () => void;
  onSubmitOrderAtPrice?: (
    side: "buy" | "sell",
    orderType: "market" | "limit",
    explicitPrice?: number,
  ) => void;
  onOpenOrderTicket?: () => void;
  onClearAllStudies?: () => void;
  onOpenObjectTree?: () => void;
  activeOrders?: readonly ChartOrderOverlay[];
  onAlertsCountChange?: (count: number) => void;
  /** Controlled orderflow & volume layer visibility synced with Indicators modal */
  overlayVisibility?: OverlayVisibility;
  onToggleOverlayVisibility?: (key: keyof OverlayVisibility) => void;
  showVolume?: boolean;
  onShowVolumeChange?: (next: boolean) => void;
  /** Render legacy inline toolbar when used standalone */
  /** Active market data source (`paper_sim` stays 100% offline per SV-01) */
  dataSource?: MarketDataSourceId;
  /** Called after historical OHLC backfill or throttled live updates so active studies recompute */
  onSeriesUpdated?: () => void;
  showInlineToolbar?: boolean;
}

function formatCompactVolume(val: number): string {
  if (!Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  if (abs >= 1e9) return `${(val / 1e9).toFixed(2)} B`;
  if (abs >= 1e6) return `${(val / 1e6).toFixed(2)} M`;
  if (abs >= 1e3) return `${(val / 1e3).toFixed(2)} K`;
  return Math.round(val).toLocaleString("en-US");
}

function LegendEyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
    >
      <path
        d="M2.2 8c1.5-2.6 3.5-3.9 5.8-3.9 2.3 0 4.3 1.3 5.8 3.9-1.5 2.6-3.5 3.9-5.8 3.9-2.3 0-4.3-1.3-5.8-3.9Z"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.6" />
      <path d="M3 13 13 3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
    >
      <path
        d="M2.2 8c1.5-2.6 3.5-3.9 5.8-3.9 2.3 0 4.3 1.3 5.8 3.9-1.5 2.6-3.5 3.9-5.8 3.9-2.3 0-4.3-1.3-5.8-3.9Z"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}

function getPrecisionDigits(cfg: ChartSettings, defaultDecimals: number): number {
  switch (cfg.symbol.precision) {
    case "1/100":
      return 2;
    case "1/1000":
      return 3;
    case "1/10000":
      return 4;
    default:
      return defaultDecimals;
  }
}

function formatChartTimestamp(time: Time, cfg: ChartSettings): string {
  const sec = typeof time === "number" ? time : 0;
  if (!Number.isFinite(sec) || sec <= 0) return String(time);
  const date = new Date(sec * 1000);
  const tz = cfg.symbol.timezone || "America/Los_Angeles";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const weekday = get("weekday");
    const day = get("day");
    const month = get("month");
    const year2 = get("year");
    const year4 = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
    }).format(date);
    const monthNum = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "2-digit",
    }).format(date);

    const dowPrefix = cfg.scales.dayOfWeekOnLabels ? `${weekday} ` : "";
    switch (cfg.scales.dateFormat) {
      case "yyyy-MM-dd":
        return `${dowPrefix}${year4}-${monthNum}-${day}`;
      case "MM/dd/yyyy":
        return `${dowPrefix}${monthNum}/${day}/${year4}`;
      case "dd MMM 'yy":
        return `${dowPrefix}${day} ${month} '${year2}`;
      case "ddd dd MMM 'yy":
      default:
        return `${dowPrefix}${day} ${month} '${year2}`;
    }
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function getTimeframeDurationSec(tf: string): number {
  switch (tf) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "1h":
      return 3600;
    case "4h":
      return 14400;
    case "W":
      return 7 * 86400;
    case "D":
    default:
      return 86400;
  }
}

function formatCountdownClock(remainingSec: number): string {
  const s = Math.max(0, Math.floor(remainingSec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return `rgba(31, 34, 44, ${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return `rgba(31, 34, 44, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ChartOverlayToolbarProps {
  visibility: OverlayVisibility;
  activeTool: DrawingToolKind;
  magnetEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  drawingCount: number;
  rendererLabel: string;
  onToggleVisibility: (key: keyof OverlayVisibility) => void;
  onSelectTool: (tool: DrawingToolKind) => void;
  onToggleMagnet: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearDrawings: () => void;
}

export interface ActiveOrderflowLegendRow {
  key: keyof OverlayVisibility;
  label: string;
  badge: string;
  color: string;
}

export interface ActiveIndicatorsLegendProps {
  studyOverlays: readonly StudyOverlaySeries[];
  hiddenStudyIds: ReadonlySet<string>;
  showVolumeRow: boolean;
  volumeHidden: boolean;
  volLegendRef?: { current: HTMLSpanElement | null };
  studyValRefs?: { current: Map<string, HTMLSpanElement> };
  activeOrderflowRows: readonly ActiveOrderflowLegendRow[];
  hiddenOrderflowLayers: ReadonlySet<keyof OverlayVisibility>;
  expanded: boolean;
  indicatorInputs: boolean;
  indicatorValues: boolean;
  formatPriceValue: (v: number) => string;
  onToggleExpanded: () => void;
  onToggleVolumeHidden: () => void;
  onRemoveVolume: () => void;
  onToggleStudyHidden: (id: string) => void;
  onRemoveStudy?: (id: string) => void;
  onOpenStudySettings?: (id: string) => void;
  onToggleOrderflowHidden: (key: keyof OverlayVisibility) => void;
  onOpenOrderflowSettings?: (key: keyof OverlayVisibility) => void;
  onRemoveOrderflow: (key: keyof OverlayVisibility) => void;
}

export function ActiveIndicatorsLegend({
  studyOverlays,
  hiddenStudyIds,
  showVolumeRow,
  volumeHidden,
  volLegendRef,
  studyValRefs,
  activeOrderflowRows,
  hiddenOrderflowLayers,
  expanded,
  indicatorInputs,
  indicatorValues,
  formatPriceValue,
  onToggleExpanded,
  onToggleVolumeHidden,
  onRemoveVolume,
  onToggleStudyHidden,
  onRemoveStudy,
  onOpenStudySettings,
  onToggleOrderflowHidden,
  onOpenOrderflowSettings,
  onRemoveOrderflow,
}: ActiveIndicatorsLegendProps) {
  const totalLegendItems =
    (showVolumeRow ? 1 : 0) + studyOverlays.length + activeOrderflowRows.length;
  if (totalLegendItems === 0) return null;

  return (
    <div
      data-testid="active-indicators-legend"
      className="pointer-events-auto mt-1 flex flex-col items-start gap-0.5 text-[12px]"
    >
      {expanded && (
        <div className="flex flex-col items-start gap-0.5">
          {showVolumeRow && (
            <div className="group/ind flex items-center gap-2 rounded px-1 py-0.5 leading-tight transition-colors hover:bg-[#1a1d26]/85">
              <span className={volumeHidden ? "text-[#6d7384]" : "text-[#d4d8e2]"}>Vol</span>
              {!volumeHidden && (
                <span
                  ref={(el) => {
                    if (volLegendRef) volLegendRef.current = el;
                  }}
                  className="font-mono text-[12px] tabular-nums text-[#ef5350]"
                >
                  —
                </span>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={volumeHidden ? "Show Volume" : "Hide Volume"}
                  onClick={onToggleVolumeHidden}
                  className={
                    volumeHidden
                      ? "rounded p-0.5 text-[#9aa1b2] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                      : "rounded p-0.5 text-[#868c9b] opacity-0 transition-opacity hover:text-white group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                  }
                >
                  <LegendEyeIcon hidden={volumeHidden} />
                </button>
                <button
                  type="button"
                  aria-label="Remove Volume"
                  onClick={onRemoveVolume}
                  className="rounded px-0.5 text-[13px] leading-none text-[#787e8d] opacity-0 transition-opacity hover:text-rose-300 group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {studyOverlays.map((st) => {
            const hidden = hiddenStudyIds.has(st.id);
            const lastVal = [...st.values]
              .reverse()
              .find((v): v is number => typeof v === "number" && Number.isFinite(v));
            const titleText = indicatorInputs
              ? st.label
              : st.label.replace(/\s*\([^)]*\)/g, "");
            return (
              <div
                key={st.id}
                onDoubleClick={() => onOpenStudySettings?.(st.id)}
                className="group/ind flex items-center gap-2 rounded px-1 py-0.5 leading-tight transition-colors hover:bg-[#1a1d26]/85"
              >
                <span className={hidden ? "text-[#6d7384]" : "text-[#d4d8e2]"}>
                  {titleText}
                </span>
                {!hidden && indicatorValues && lastVal !== undefined && (
                  <span
                    ref={(el) => {
                      if (!studyValRefs) return;
                      if (el) studyValRefs.current.set(st.id, el);
                      else studyValRefs.current.delete(st.id);
                    }}
                    style={{ color: st.color }}
                    className="font-mono text-[12px] tabular-nums"
                  >
                    {formatPriceValue(lastVal)}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={hidden ? `Show ${st.label}` : `Hide ${st.label}`}
                    onClick={() => onToggleStudyHidden(st.id)}
                    className={
                      hidden
                        ? "rounded p-0.5 text-[#9aa1b2] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                        : "rounded p-0.5 text-[#868c9b] opacity-0 transition-opacity hover:text-white group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                    }
                  >
                    <LegendEyeIcon hidden={hidden} />
                  </button>
                  {onOpenStudySettings && (
                    <button
                      type="button"
                      title={`Settings for ${st.label}`}
                      aria-label={`Settings for ${st.label}`}
                      onClick={() => onOpenStudySettings(st.id)}
                      className="rounded p-0.5 text-[#868c9b] opacity-0 transition-opacity hover:text-white group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <circle cx="8" cy="8" r="2.2" />
                        <path d="M8 2.2v1.3M8 12.5v1.3M2.2 8h1.3M12.5 8h1.3M3.9 3.9l.9.9M11.2 11.2l.9.9M12.1 3.9l-.9.9M4.8 11.2l-.9.9" />
                      </svg>
                    </button>
                  )}
                  {onRemoveStudy && (
                    <button
                      type="button"
                      aria-label={`Remove ${st.label}`}
                      onClick={() => onRemoveStudy(st.id)}
                      className="rounded px-0.5 text-[13px] leading-none text-[#787e8d] opacity-0 transition-opacity hover:text-rose-300 group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {activeOrderflowRows.map((layer) => {
            const hidden = hiddenOrderflowLayers.has(layer.key);
            const hasSettings = Boolean(onOpenOrderflowSettings && layer.key === "vrvp");
            return (
              <div
                key={layer.key}
                onDoubleClick={() => {
                  if (hasSettings) onOpenOrderflowSettings?.(layer.key);
                }}
                className="group/ind flex items-center gap-2 rounded px-1 py-0.5 leading-tight transition-colors hover:bg-[#1a1d26]/85"
              >
                <span className={hidden ? "text-[#6d7384]" : "text-[#d4d8e2]"}>
                  {layer.label}
                </span>
                {!hidden && (
                  <span
                    style={{ color: layer.color }}
                    className="font-mono text-[11px] tabular-nums"
                  >
                    {layer.badge}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={hidden ? `Show ${layer.label}` : `Hide ${layer.label}`}
                    onClick={() => onToggleOrderflowHidden(layer.key)}
                    className={
                      hidden
                        ? "rounded p-0.5 text-[#9aa1b2] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                        : "rounded p-0.5 text-[#868c9b] opacity-0 transition-opacity hover:text-white group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                    }
                  >
                    <LegendEyeIcon hidden={hidden} />
                  </button>
                  {hasSettings && (
                    <button
                      type="button"
                      title={`Settings for ${layer.label}`}
                      aria-label={`Settings for ${layer.label}`}
                      onClick={() => onOpenOrderflowSettings?.(layer.key)}
                      className="rounded p-0.5 text-[#868c9b] opacity-0 transition-opacity hover:text-white group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <circle cx="8" cy="8" r="2.2" />
                        <path d="M8 2.2v1.3M8 12.5v1.3M2.2 8h1.3M12.5 8h1.3M3.9 3.9l.9.9M11.2 11.2l.9.9M12.1 3.9l-.9.9M4.8 11.2l-.9.9" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${layer.label}`}
                    onClick={() => onRemoveOrderflow(layer.key)}
                    className="rounded px-0.5 text-[13px] leading-none text-[#787e8d] opacity-0 transition-opacity hover:text-rose-300 group-hover/ind:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        aria-label={
          expanded ? "Collapse active indicators" : "Expand active indicators"
        }
        aria-expanded={expanded}
        onClick={onToggleExpanded}
        className="mt-0.5 inline-flex h-5 items-center gap-1 rounded border border-[#2c3140] bg-[#16181f]/90 px-1.5 text-[10px] text-[#9aa1b2] hover:bg-[#232733] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {expanded ? (
            <path d="M2.5 7.5 6 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        {!expanded && (
          <span className="font-mono text-[10px] tabular-nums text-[#cfd4e0]">
            {totalLegendItems}
          </span>
        )}
      </button>
    </div>
  );
}

export function ChartOverlayToolbar({
  visibility,
  activeTool,
  magnetEnabled,
  canUndo,
  canRedo,
  drawingCount,
  rendererLabel,
  onToggleVisibility,
  onSelectTool,
  onToggleMagnet,
  onUndo,
  onRedo,
  onClearDrawings,
}: ChartOverlayToolbarProps) {
  return (
    <Toolbar
      aria-label="Chart orderflow overlays and drawing tools"
      className="flex flex-wrap items-center justify-between gap-1.5 border-b border-zinc-800 bg-zinc-950/95 px-2 py-1 text-[11px]"
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          Layers
        </span>
        <Toggle
          pressed={visibility.footprint}
          onPressedChange={() => onToggleVisibility("footprint")}
          aria-label="Toggle Footprint overlay"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-emerald-500/60 data-pressed:bg-emerald-950/70 data-pressed:text-emerald-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Footprint
        </Toggle>
        <Toggle
          pressed={visibility.vrvp}
          onPressedChange={() => onToggleVisibility("vrvp")}
          aria-label="Toggle VRVP overlay"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-sky-500/60 data-pressed:bg-sky-950/70 data-pressed:text-sky-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          VRVP
        </Toggle>
        <Toggle
          pressed={visibility.tpo}
          onPressedChange={() => onToggleVisibility("tpo")}
          aria-label="Toggle TPO Market Profile overlay"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-amber-500/60 data-pressed:bg-amber-950/70 data-pressed:text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          TPO 128
        </Toggle>

        <span className="mx-1 h-4 w-px bg-zinc-800" aria-hidden="true" />
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          Draw
        </span>
        {DRAWING_TOOL_META.filter((t) =>
          [
            "cursor",
            "trendline",
            "horizontal_ray",
            "fib_retracement",
            "box_zone",
            "price_range",
            "anchored_vwap",
          ].includes(t.kind),
        ).map((tool) => (
          <Toggle
            key={tool.kind}
            pressed={activeTool === tool.kind}
            onPressedChange={() => onSelectTool(tool.kind)}
            aria-label={`Select ${tool.label} tool`}
            className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-amber-500/70 data-pressed:bg-amber-950/70 data-pressed:text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {tool.label}
          </Toggle>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Toggle
          pressed={magnetEnabled}
          onPressedChange={onToggleMagnet}
          aria-label="Toggle SV-17 integer magnet snap"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 data-pressed:border-violet-500/60 data-pressed:bg-violet-950/70 data-pressed:text-violet-200 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Magnet
        </Toggle>
        <Button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo drawing action"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Undo
        </Button>
        <Button
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo drawing action"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Redo
        </Button>
        <Button
          onClick={onClearDrawings}
          disabled={drawingCount === 0}
          aria-label="Clear all drawings"
          className="h-6 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Clear ({drawingCount})
        </Button>
        <span
          data-testid="renderer-badge"
          className="ml-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
        >
          {rendererLabel}
        </span>
      </div>
    </Toolbar>
  );
}

function seedInitialCandles(symbol: string): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
  buyVolumes: number[];
  sellVolumes: number[];
} {
  const meta = getSymbolMeta(symbol);
  const base = meta.basePrice;
  const volScale = base * 0.0022;
  const nowSec = Math.floor(Date.now() / 60_000) * 60;
  const count = 180;
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];
  const buyVolumes: number[] = [];
  const sellVolumes: number[] = [];

  let seed = 0x9e3779b9;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  let price = base * 0.94;
  for (let i = count; i >= 1; i--) {
    const progress = (count - i) / count;
    const regimeDrift =
      progress < 0.32
        ? volScale * 0.34
        : progress < 0.65
          ? volScale * 0.05
          : progress < 0.82
            ? volScale * 0.16
            : -volScale * 0.28;
    const noise = (nextRand() - 0.49) * volScale * 2.2;
    const open = price;
    const close = Math.max(meta.basePrice * 0.25, open + regimeDrift + noise);
    const wickUp = (0.2 + nextRand() * 0.9) * volScale;
    const wickDn = (0.2 + nextRand() * 0.9) * volScale;
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(meta.basePrice * 0.2, Math.min(open, close) - wickDn);
    price = close;

    const vol = 18 + Math.round(nextRand() * 95);
    const buyShare = close >= open ? 0.56 + nextRand() * 0.12 : 0.34 + nextRand() * 0.12;
    const buyVol = vol * buyShare;
    const sellVol = Math.max(0, vol - buyVol);
    const t = (nowSec - i * 60) as UTCTimestamp;
    candles.push({ time: t, open, high, low, close });
    volumes.push({
      time: t,
      value: vol,
      color: close >= open ? "rgba(130, 142, 165, 0.22)" : "rgba(95, 103, 122, 0.18)",
    });
    buyVolumes.push(buyVol);
    sellVolumes.push(sellVol);
  }

  const finalClose = candles[candles.length - 1]?.close ?? base;
  const delta = base - finalClose;
  for (const c of candles) {
    c.open += delta;
    c.high += delta;
    c.low += delta;
    c.close += delta;
  }

  return { candles, volumes, buyVolumes, sellVolumes };
}

/**
 * Genuine Lightweight Charts v5 ISeriesPrimitive (ADR-0004 / S01).
 * Executes orderflow (WebGL2 offscreen instanced pass composited synchronously) and
 * vector drawings INSIDE Lightweight Charts' own pane render callback, guaranteeing
 * 0.000 CSS px coordinate drift during pan, zoom, and resize.
 */
interface PrimitiveDrawContext {
  getOverlayData: () => OverlayRenderData;
  getDrawings: () => readonly DrawingObject[];
  getDrawingsHidden: () => boolean;
  getDrawingsLocked: () => boolean;
  getSelectedDrawingId: () => string | null;
  getTimeframe: () => string;
  getDraftPreview: () => {
    tool: DrawingToolKind;
    anchors: readonly AnchorPoint[];
    hover: AnchorPoint | null;
  };
  getRulerPreview: () => { start: AnchorPoint; end: AnchorPoint } | null;
  getZoomBox: () => { x1: number; y1: number; x2: number; y2: number } | null;
  getTickSizeE9: () => bigint;
  getPrecisionDigits: () => number;
  getCandles: () => readonly CandlestickData<UTCTimestamp>[];
  getVolumes: () => readonly HistogramData<UTCTimestamp>[];
  getSessionVpConfig: () => VolumeProfileConfig;
}

class OrderflowAndDrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdateCb: (() => void) | null = null;
  private readonly paneView: IPrimitivePaneView;

  constructor(
    private readonly overlay: WebGl2OrderflowOverlay,
    private readonly source: PrimitiveDrawContext,
  ) {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => {
        const chart = this.chart;
        const series = this.series;
        if (!chart || !series) return;

        const bridge: CoordinateBridge = {
          timeToX: (timeSec: number): number | null => {
            const coord = chart.timeScale().timeToCoordinate(timeSec as UTCTimestamp);
            return coord === null ? null : Number(coord);
          },
          priceToY: (price: number): number | null => {
            const coord = series.priceToCoordinate(price);
            return coord === null ? null : Number(coord);
          },
        };

        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const w = mediaSize.width;
          const h = mediaSize.height;
          if (w <= 0 || h <= 0) return;

          const data = this.source.getOverlayData();
          const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

          const candles = this.source.getCandles();
          const volumes = this.source.getVolumes();

          // 1. Orderflow layers (Footprint, u128 TPO via WebGL2; high-res Session VRVP via VolumeProfileConfig)
          this.overlay.compositeIntoContext(
            context,
            w,
            h,
            dpr,
            { ...data, visibility: { ...data.visibility, vrvp: false } },
            bridge,
          );

          if (data.visibility.vrvp && candles.length >= 2) {
            const visRange = chart.timeScale().getVisibleRange();
            const startSec =
              visRange && typeof visRange.from === "number"
                ? visRange.from
                : Number(candles[0].time);
            const endSec =
              visRange && typeof visRange.to === "number"
                ? visRange.to
                : Number(candles[candles.length - 1].time);
            context.save();
            drawVolumeHistogram(
              context,
              w,
              0,
              w,
              candles,
              volumes,
              startSec,
              endSec,
              bridge,
              data.tickSizeFloat,
              this.source.getSessionVpConfig(),
              false,
            );
            context.restore();
          }

          if (data.visibility.marketStructure && candles.length >= 7) {
            context.save();
            drawMarketStructureOverlay(context, w, h, candles, bridge);
            context.restore();
          }

          // 2. Clean-room vector drawings + active draft preview + ruler + zoom box
          const hidden = this.source.getDrawingsHidden();
          const locked = this.source.getDrawingsLocked();
          context.save();
          const selectedId = this.source.getSelectedDrawingId();
          const currentTf = this.source.getTimeframe();
          if (!hidden) {
            for (const d of this.source.getDrawings()) {
              if (!isTimeframeVisible(currentTf, d.visibility)) continue;
              const isSelected = d.id === selectedId;
              drawVectorDrawing(
                context,
                w,
                h,
                d.kind,
                d.anchors,
                d.color,
                data.tickSizeFloat,
                bridge,
                candles,
                volumes,
                d.label,
                !locked && isSelected,
                d,
                isSelected,
              );
            }
            const draft = this.source.getDraftPreview();
            if (
              draft.tool !== "cursor" &&
              draft.tool !== "ruler" &&
              draft.tool !== "zoom_in" &&
              draft.anchors.length > 0
            ) {
              const preview = draft.hover ? [...draft.anchors, draft.hover] : [...draft.anchors];
              const meta = getDrawingToolMeta(draft.tool);
              context.setLineDash([4, 3]);
              drawVectorDrawing(
                context,
                w,
                h,
                draft.tool as PlacedDrawingKind,
                preview,
                meta.defaultColor ?? "#f59e0b",
                data.tickSizeFloat,
                bridge,
                candles,
                volumes,
                undefined,
                true,
              );
            }
          }

          const ruler = this.source.getRulerPreview();
          if (ruler) {
            drawRulerOverlay({
              ctx: context,
              w,
              h,
              start: ruler.start,
              end: ruler.end,
              tickSizeE9: this.source.getTickSizeE9(),
              bridge,
              candles,
              volumes,
              decimals: this.source.getPrecisionDigits(),
            });
          }

          const zBox = this.source.getZoomBox();
          if (zBox) {
            const zx = Math.min(zBox.x1, zBox.x2);
            const zy = Math.min(zBox.y1, zBox.y2);
            const zw = Math.abs(zBox.x2 - zBox.x1);
            const zh = Math.abs(zBox.y2 - zBox.y1);
            context.fillStyle = "rgba(56, 189, 248, 0.14)";
            context.fillRect(zx, zy, zw, zh);
            context.strokeStyle = "#38bdf8";
            context.lineWidth = 1.25;
            context.setLineDash([4, 3]);
            context.strokeRect(zx, zy, zw, zh);
          }
          context.restore();
        });
      },
    };

    this.paneView = {
      zOrder: (): PrimitivePaneViewZOrder => "top",
      renderer: () => renderer,
    };
  }

  public attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this.requestUpdateCb = param.requestUpdate;
  }

  public detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdateCb = null;
  }

  public updateAllViews(): void {
    // Coordinates are read synchronously from LWC scales during draw()
  }

  public paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  public requestUpdate(): void {
    this.requestUpdateCb?.();
  }
}

/**
 * 60 fps Chart Panel (Lightweight Charts v5.3.0 + Synchronous ISeriesPrimitive WebGL2 Orderflow
 * Overlay + Clean-Room Drawing Engine).
 * Strictly imperative ref + rAF pipeline — zero React state updates on binary ticks (AGENTS.md #5).
 */
export function ChartPanel({
  transport,
  symbol,
  timeframe,
  tickSizeE9,
  studyOverlays = [],
  seriesSnapshotRef,
  activeTool: controlledTool,
  onSelectTool,
  magnetEnabled: controlledMagnet,
  onToggleMagnet,
  showFloatingBar = true,
  stayInDrawingMode = false,
  drawingsLocked = false,
  drawingsHidden = false,
  favoriteTools,
  activeIconStamp = "★",
  candleStyle = "monochrome",
  autoScale: controlledAutoScale,
  onAutoScaleChange,
  logScale: controlledLogScale,
  onLogScaleChange,
  rangePreset = "All",
  historyActionsRef,
  onHistoryMetaChange,
  onRemoveStudy,
  onOpenStudySettings,
  onLivePriceSample,
  chartSettings,
  replayOpen = false,
  chartTemplates = DEFAULT_CHART_TEMPLATES,
  onApplyChartTemplate,
  onApplyChartDefaults,
  onOpenSettings,
  onSubmitOrderAtPrice,
  onOpenOrderTicket,
  onClearAllStudies,
  onOpenObjectTree,
  activeOrders = [],
  onAlertsCountChange,
  overlayVisibility: controlledOverlayVisibility,
  onToggleOverlayVisibility,
  showVolume: controlledShowVolume,
  onShowVolumeChange,
  dataSource = "paper_sim",
  onSeriesUpdated,
  showInlineToolbar = false,
}: ChartPanelProps) {
  const effectiveSettings = chartSettings ?? DEFAULT_CHART_SETTINGS;
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const floatingBarRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pointerSurfaceRef = useRef<HTMLDivElement | null>(null);
  const ohlcRef = useRef<HTMLSpanElement | null>(null);
  const volLegendRef = useRef<HTMLSpanElement | null>(null);
  const lastVolSampleRef = useRef<{ vol: number; isUp: boolean } | null>(null);
  const studyValRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const studyLatestRef = useRef<Map<string, number>>(new Map());

  const [floatingBarPos, setFloatingBarPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem("allegedly.floating_bar_pos.v1");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return { x: parsed.x, y: parsed.y };
      }
    } catch {
      // ignore storage errors
    }
    return null;
  });
  const [isDraggingBar, setIsDraggingBar] = useState<boolean>(false);
  const barDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const [pendingTextAnnotation, setPendingTextAnnotation] = useState<{
    kind: PlacedDrawingKind;
    anchors: AnchorPoint[];
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const pendingTextInputRef = useRef<HTMLInputElement | null>(null);

  const [localVisibility, setLocalVisibility] = useState<OverlayVisibility>({
    footprint: false,
    vrvp: false,
    tpo: false,
    marketStructure: false,
  });
  const visibility = controlledOverlayVisibility ?? localVisibility;
  const [localShowVolume, setLocalShowVolume] = useState<boolean>(effectiveSettings.statusLine.volume);
  const showVolume = controlledShowVolume ?? localShowVolume;
  const setShowVolume = (updater: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof updater === "function" ? updater(showVolume) : updater;
    setLocalShowVolume(next);
    onShowVolumeChange?.(next);
  };
  const [volumeHidden, setVolumeHidden] = useState<boolean>(false);
  const [hiddenOrderflowLayers, setHiddenOrderflowLayers] = useState<Set<keyof OverlayVisibility>>(
    () => new Set(),
  );
  const [indicatorsLegendExpanded, setIndicatorsLegendExpanded] = useState<boolean>(true);
  const [contextMenu, setContextMenu] = useState<ChartContextMenuState | null>(null);
  const [lockCursorByTime, setLockCursorByTime] = useState<boolean>(false);
  const [tableViewOpen, setTableViewOpen] = useState<boolean>(false);
  const [alerts, setAlerts] = useState<Array<{ id: string; symbol: string; price: number }>>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>("");
  const [scaleMenuOpen, setScaleMenuOpen] = useState<boolean>(false);
  const [priceScaleMode, setPriceScaleMode] = useState<PriceScaleMode>(PriceScaleMode.Normal);
  const [invertScale, setInvertScale] = useState<boolean>(false);
  const [localAutoScale, setLocalAutoScale] = useState<boolean>(true);
  const [hiddenStudyIds, setHiddenStudyIds] = useState<Set<string>>(() => new Set());

  const [localTool, setLocalTool] = useState<DrawingToolKind>("cursor");
  const [localMagnet, setLocalMagnet] = useState<boolean>(true);
  const [rendererLabel, setRendererLabel] = useState<string>("WebGL2");
  const [historyMeta, setHistoryMeta] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    count: number;
  }>({ canUndo: false, canRedo: false, count: 0 });

  const activeTool = controlledTool ?? localTool;
  const setActiveTool = (next: DrawingToolKind) => {
    setLocalTool(next);
    onSelectTool?.(next);
  };

  const magnetEnabled = controlledMagnet ?? localMagnet;
  const toggleMagnet = () => {
    setLocalMagnet((m) => !m);
    onToggleMagnet?.();
  };

  const autoScale = controlledAutoScale ?? localAutoScale;
  const setAutoScale = (next: boolean) => {
    setLocalAutoScale(next);
    onAutoScaleChange?.(next);
  };

  const effectiveLogScale = controlledLogScale ?? priceScaleMode === PriceScaleMode.Logarithmic;

  const effectiveOverlayVisibility: OverlayVisibility = {
    footprint: visibility.footprint && !hiddenOrderflowLayers.has("footprint"),
    vrvp: visibility.vrvp && !hiddenOrderflowLayers.has("vrvp"),
    tpo: visibility.tpo && !hiddenOrderflowLayers.has("tpo"),
    marketStructure:
      Boolean(visibility.marketStructure) && !hiddenOrderflowLayers.has("marketStructure"),
  };
  const visibilityRef = useRef<OverlayVisibility>(effectiveOverlayVisibility);
  visibilityRef.current = effectiveOverlayVisibility;

  const activeToolRef = useRef<DrawingToolKind>(activeTool);
  activeToolRef.current = activeTool;

  const magnetRef = useRef<boolean>(magnetEnabled);
  magnetRef.current = magnetEnabled;

  const stayInDrawingModeRef = useRef<boolean>(stayInDrawingMode);
  stayInDrawingModeRef.current = stayInDrawingMode;

  const drawingsLockedRef = useRef<boolean>(drawingsLocked);
  drawingsLockedRef.current = drawingsLocked;

  const drawingsHiddenRef = useRef<boolean>(drawingsHidden);
  drawingsHiddenRef.current = drawingsHidden;

  const activeIconStampRef = useRef<string>(activeIconStamp);
  activeIconStampRef.current = activeIconStamp;

  const shiftPressedRef = useRef<boolean>(false);

  const candleStyleRef = useRef<"monochrome" | "classic">(candleStyle);
  candleStyleRef.current = candleStyle;

  const chartSettingsRef = useRef<ChartSettings>(effectiveSettings);
  chartSettingsRef.current = effectiveSettings;

  const onLivePriceSampleRef = useRef(onLivePriceSample);
  onLivePriceSampleRef.current = onLivePriceSample;

  const onSeriesUpdatedRef = useRef(onSeriesUpdated);
  onSeriesUpdatedRef.current = onSeriesUpdated;

  const [sessionVpConfig, setSessionVpConfig] = useState<VolumeProfileConfig>(() =>
    loadStoredVpDefaults(),
  );
  const [vpSettingsOpen, setVpSettingsOpen] = useState(false);
  const sessionVpConfigRef = useRef<VolumeProfileConfig>(sessionVpConfig);
  sessionVpConfigRef.current = sessionVpConfig;

  const drawingEngineRef = useRef<DrawingEngine | null>(null);
  if (!drawingEngineRef.current) {
    const engine = new DrawingEngine();
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const savedToml = window.localStorage.getItem("allegedly.drawings.toml.v1");
        if (savedToml) engine.loadFromAtAnalysisToml(savedToml);
      } catch {
        // Ignore corrupt persisted drawings
      }
    }
    drawingEngineRef.current = engine;
  }
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [drawingSettingsOpen, setDrawingSettingsOpen] = useState(false);
  const [, setDrawingVersion] = useState(0);
  const selectedDrawingIdRef = useRef<string | null>(null);
  selectedDrawingIdRef.current = selectedDrawingId;
  const requestOverlayRedrawRef = useRef<(() => void) | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const studyLineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const studyPanesRef = useRef<Map<string, IPaneApi<Time>>>(new Map());
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const latestTimesRef = useRef<UTCTimestamp[]>([]);
  const latestCandlesRef = useRef<CandlestickData<UTCTimestamp>[]>([]);
  const lastCrosshairPriceRef = useRef<number | null>(null);
  const redrawTriggerRef = useRef<() => void>(() => {});
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (chartSettingsRef.current.alerts.autoHideToasts) {
      toastTimerRef.current = window.setTimeout(() => {
        setToastMsg(null);
        toastTimerRef.current = null;
      }, 2800);
    }
  };

  const syncHistoryMeta = () => {
    const engine = drawingEngineRef.current!;
    const nextMeta = {
      canUndo: engine.canUndo(),
      canRedo: engine.canRedo(),
      count: engine.list(symbol).length,
    };
    setHistoryMeta(nextMeta);
    onHistoryMetaChange?.(nextMeta);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem("allegedly.drawings.toml.v1", engine.toAtAnalysisToml());
      } catch {
        // Ignore storage quota errors
      }
    }
    redrawTriggerRef.current();
  };

  const handleUndo = () => {
    drawingEngineRef.current!.undo();
    syncHistoryMeta();
  };

  const handleRedo = () => {
    drawingEngineRef.current!.redo();
    syncHistoryMeta();
  };

  const handleClear = () => {
    if (drawingsLockedRef.current) {
      showToast("Drawings are locked — unlock to remove");
      return;
    }
    drawingEngineRef.current!.clear(symbol);
    syncHistoryMeta();
  };

  const handleAddAlert = () => {
    const fallback = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close;
    const price = lastCrosshairPriceRef.current ?? fallback;
    if (price !== undefined && Number.isFinite(price)) {
      setAlerts((prev) => [...prev, { id: `al-${Date.now()}`, symbol, price }]);
      showToast(`Alert added on ${symbol} at ${price.toFixed(getSymbolMeta(symbol).decimals)}`);
    }
  };

  const handleTakeSnapshot = () => {
    const chart = chartApiRef.current;
    if (!chart) return;
    try {
      const canvas = chart.takeScreenshot(true, false);
      const dataUrl = canvas.toDataURL("image/png");
      const safeSym = symbol.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `allegedly-${safeSym}-${timeframe}.png`;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(`Snapshot saved: ${filename}`);
    } catch {
      showToast("Chart snapshot unavailable in current renderer");
    }
  };

  if (historyActionsRef) {
    historyActionsRef.current = {
      undo: handleUndo,
      redo: handleRedo,
      clear: handleClear,
      addAlert: handleAddAlert,
      takeSnapshot: handleTakeSnapshot,
      resetZoom: () => handleResetView(),
    };
  }

  useEffect(() => {
    onAlertsCountChange?.(alerts.length);
  }, [alerts.length, onAlertsCountChange]);

  useEffect(() => {
    syncHistoryMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    redrawTriggerRef.current();
  }, [visibility, hiddenOrderflowLayers, drawingsHidden, drawingsLocked, sessionVpConfig]);

  // Sync volume histogram visibility with Status line Volume checkbox
  useEffect(() => {
    setLocalShowVolume(effectiveSettings.statusLine.volume);
    onShowVolumeChange?.(effectiveSettings.statusLine.volume);
    if (effectiveSettings.statusLine.volume) {
      setVolumeHidden(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSettings.statusLine.volume]);

  // Apply all live ChartSettings (Symbol, Canvas, Scales, Date format) to Lightweight Charts
  useEffect(() => {
    const chart = chartApiRef.current;
    const cs = candleSeriesRef.current;
    if (!chart || !cs) return;

    const cfg = effectiveSettings;
    const symMetaLocal = getSymbolMeta(symbol);
    const digits = getPrecisionDigits(cfg, symMetaLocal.decimals);
    const targetMode = effectiveLogScale
      ? PriceScaleMode.Logarithmic
      : priceScaleMode === PriceScaleMode.Logarithmic
        ? PriceScaleMode.Normal
        : priceScaleMode;

    const topMargin = Math.max(0, Math.min(0.45, cfg.canvas.marginTopPct / 100));
    const bottomMargin = Math.max(0, Math.min(0.45, cfg.canvas.marginBottomPct / 100));
    const isLeftScale = cfg.scales.scalesPlacement === "left";

    chart.applyOptions({
      layout: {
        background:
          cfg.canvas.backgroundType === "gradient"
            ? {
                type: ColorType.VerticalGradient,
                topColor: cfg.canvas.backgroundColor,
                bottomColor: cfg.canvas.backgroundColorBottom,
              }
            : {
                type: ColorType.Solid,
                color: cfg.canvas.backgroundColor,
              },
        textColor: cfg.canvas.scalesTextColor,
        fontSize: cfg.canvas.scalesFontSize,
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          visible: cfg.canvas.vertGridLines,
          color: cfg.canvas.vertGridColor,
        },
        horzLines: {
          visible: cfg.canvas.horzGridLines,
          color: cfg.canvas.horzGridColor,
        },
      },
      crosshair: {
        vertLine: {
          color: cfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
        horzLine: {
          color: cfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
      },
      leftPriceScale: {
        visible: isLeftScale,
        borderVisible: cfg.canvas.scalesLinesVisible,
        borderColor: cfg.canvas.scalesLineColor,
        autoScale,
        invertScale,
        mode: targetMode,
        scaleMargins: { top: topMargin, bottom: bottomMargin },
      },
      rightPriceScale: {
        visible: !isLeftScale,
        borderVisible: cfg.canvas.scalesLinesVisible,
        borderColor: cfg.canvas.scalesLineColor,
        autoScale,
        invertScale,
        mode: targetMode,
        scaleMargins: { top: topMargin, bottom: bottomMargin },
      },
      timeScale: {
        borderVisible: cfg.canvas.scalesLinesVisible,
        borderColor: cfg.canvas.scalesLineColor,
        rightOffset: cfg.canvas.marginRightBars,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        timeFormatter: (time: Time) => formatChartTimestamp(time, cfg),
      },
    });

    cs.applyOptions({
      upColor: cfg.symbol.bodyEnabled ? cfg.symbol.bodyUpColor : "transparent",
      downColor: cfg.symbol.bodyEnabled ? cfg.symbol.bodyDownColor : "transparent",
      borderVisible: cfg.symbol.borderEnabled,
      borderUpColor: cfg.symbol.borderUpColor,
      borderDownColor: cfg.symbol.borderDownColor,
      wickVisible: cfg.symbol.wickEnabled,
      wickUpColor: cfg.symbol.wickUpColor,
      wickDownColor: cfg.symbol.wickDownColor,
      lastValueVisible: cfg.scales.symbolPriceLabel !== "hidden",
      priceLineVisible: cfg.scales.symbolPriceLabel === "value_line",
      priceFormat: {
        type: "price",
        precision: digits,
        minMove: Math.pow(10, -digits),
      },
    });
  }, [effectiveSettings, autoScale, invertScale, priceScaleMode, effectiveLogScale, symbol]);

  // Dynamic price lines for alerts, working orders, High/Low, and Bid/Ask
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;

    for (const line of priceLinesRef.current) {
      try {
        cs.removePriceLine(line);
      } catch {
        // Ignore stale price line
      }
    }
    priceLinesRef.current = [];

    const cfg = effectiveSettings;
    const candles = latestCandlesRef.current;
    const lastBar = candles[candles.length - 1];
    const added: IPriceLine[] = [];

    if (cfg.alerts.alertLines) {
      for (const al of alerts) {
        if (al.symbol !== symbol) continue;
        added.push(
          cs.createPriceLine({
            price: al.price,
            color: cfg.alerts.alertLineColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Alert",
          }),
        );
      }
    }

    if (cfg.trading.positionsAndOrders) {
      for (const ord of activeOrders) {
        if (ord.symbol !== symbol || !ord.limit_price_e9) continue;
        if (ord.status !== "working" && ord.status !== "pending") continue;
        const p = Number(ord.limit_price_e9) / 1e9;
        if (!Number.isFinite(p) || p <= 0) continue;
        const isBuy = ord.side.toLowerCase() === "buy";
        added.push(
          cs.createPriceLine({
            price: p,
            color: isBuy ? "#26a69a" : "#ef5350",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `${isBuy ? "BUY" : "SELL"} ${ord.order_type.toUpperCase()}`,
          }),
        );
      }
    }

    if (cfg.scales.highAndLow !== "hidden" && candles.length > 0) {
      let hi = -Infinity;
      let lo = Infinity;
      for (const c of candles) {
        if (c.high > hi) hi = c.high;
        if (c.low < lo) lo = c.low;
      }
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const showLine = cfg.scales.highAndLow === "value_line";
        added.push(
          cs.createPriceLine({
            price: hi,
            color: "#26a69a",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lineVisible: showLine,
            axisLabelVisible: true,
            title: "High",
          }),
          cs.createPriceLine({
            price: lo,
            color: "#ef5350",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lineVisible: showLine,
            axisLabelVisible: true,
            title: "Low",
          }),
        );
      }
    }

    if (cfg.scales.bidAndAsk !== "hidden" && lastBar) {
      const tickFloat = Number(tickSizeE9) / 1e9 || 0.25;
      const showLine = cfg.scales.bidAndAsk === "lines_and_labels";
      added.push(
        cs.createPriceLine({
          price: lastBar.close - tickFloat,
          color: cfg.scales.bidColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          lineVisible: showLine,
          axisLabelVisible: true,
          title: "Bid",
        }),
        cs.createPriceLine({
          price: lastBar.close + tickFloat,
          color: cfg.scales.askColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          lineVisible: showLine,
          axisLabelVisible: true,
          title: "Ask",
        }),
      );
    }

    priceLinesRef.current = added;
  }, [effectiveSettings, alerts, activeOrders, symbol, tickSizeE9]);

  // Countdown to bar close clock
  useEffect(() => {
    if (!effectiveSettings.scales.countdownToBarClose) {
      setCountdownText("");
      return;
    }
    const dur = getTimeframeDurationSec(timeframe);
    const updateClock = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const rem = dur - (nowSec % dur);
      setCountdownText(formatCountdownClock(rem));
    };
    updateClock();
    const id = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(id);
  }, [effectiveSettings.scales.countdownToBarClose, timeframe]);

  // Chart keyboard shortcuts (⌥R reset, ⌥A alert, ⌥⇧S sell limit, ⇧T order ticket)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && key === "r") {
        e.preventDefault();
        setAutoScale(true);
        setInvertScale(false);
        setPriceScaleMode(PriceScaleMode.Normal);
        onLogScaleChange?.(false);
        chartApiRef.current?.timeScale().fitContent();
        showToast("Chart view reset");
      } else if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && key === "a") {
        e.preventDefault();
        const fallback = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close;
        const price = lastCrosshairPriceRef.current ?? fallback;
        if (price !== undefined && Number.isFinite(price)) {
          setAlerts((prev) => [
            ...prev,
            { id: `al-${Date.now()}`, symbol, price },
          ]);
          showToast(`Alert added on ${symbol} at ${price.toFixed(getSymbolMeta(symbol).decimals)}`);
        }
      } else if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && key === "s") {
        e.preventDefault();
        const fallback = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close;
        const price = lastCrosshairPriceRef.current ?? fallback;
        if (price !== undefined && Number.isFinite(price)) {
          onSubmitOrderAtPrice?.("sell", "limit", price);
          showToast(`Sell 1 ${symbol} @ ${price.toFixed(getSymbolMeta(symbol).decimals)} limit submitted`);
        }
      } else if (!e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && key === "t") {
        e.preventDefault();
        onOpenOrderTicket?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, onSubmitOrderAtPrice, onOpenOrderTicket]);

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume && !volumeHidden });
    if (showVolume && !volumeHidden && volLegendRef.current && lastVolSampleRef.current) {
      volLegendRef.current.textContent = formatCompactVolume(lastVolSampleRef.current.vol);
      volLegendRef.current.style.color = lastVolSampleRef.current.isUp ? "#26a69a" : "#ef5350";
    }
  }, [showVolume, volumeHidden]);

  useEffect(() => {
    const chart = chartApiRef.current;
    const count = latestTimesRef.current.length;
    if (!chart || count === 0) return;
    if (rangePreset === "All") {
      chart.timeScale().fitContent();
      return;
    }
    const barCounts: Record<string, number> = {
      "1D": 35,
      "5D": 65,
      "1M": 90,
      "3M": 120,
      "6M": 145,
      YTD: 155,
      "1Y": 170,
    };
    const visible = Math.min(count, barCounts[rangePreset] ?? count);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, count - visible),
      to: count + 4,
    });
  }, [rangePreset]);

  useEffect(() => {
    const el = hostRef.current;
    const pointerSurface = pointerSurfaceRef.current;
    if (!el || !pointerSurface) return;

    const initCfg = chartSettingsRef.current;
    const initSymMeta = getSymbolMeta(symbol);
    const initDigits = getPrecisionDigits(initCfg, initSymMeta.decimals);
    const initTopMargin = Math.max(0, Math.min(0.45, initCfg.canvas.marginTopPct / 100));
    const initBottomMargin = Math.max(0, Math.min(0.45, initCfg.canvas.marginBottomPct / 100));
    const initLeftScale = initCfg.scales.scalesPlacement === "left";

    const chart = createChart(el, {
      layout: {
        background:
          initCfg.canvas.backgroundType === "gradient"
            ? {
                type: ColorType.VerticalGradient,
                topColor: initCfg.canvas.backgroundColor,
                bottomColor: initCfg.canvas.backgroundColorBottom,
              }
            : { type: ColorType.Solid, color: initCfg.canvas.backgroundColor },
        textColor: initCfg.canvas.scalesTextColor,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", "Segoe UI", sans-serif',
        fontSize: initCfg.canvas.scalesFontSize,
        attributionLogo: false,
        panes: {
          enableResize: true,
          separatorColor: "#2a2e39",
          separatorHoverColor: "rgba(41, 98, 255, 0.35)",
        },
      },
      grid: {
        vertLines: {
          visible: initCfg.canvas.vertGridLines,
          color: initCfg.canvas.vertGridColor,
        },
        horzLines: {
          visible: initCfg.canvas.horzGridLines,
          color: initCfg.canvas.horzGridColor,
        },
      },
      crosshair: {
        vertLine: {
          color: initCfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
        horzLine: {
          color: initCfg.canvas.crosshairColor,
          labelBackgroundColor: "#2b3040",
        },
      },
      leftPriceScale: {
        visible: initLeftScale,
        borderVisible: initCfg.canvas.scalesLinesVisible,
        borderColor: initCfg.canvas.scalesLineColor,
        scaleMargins: { top: initTopMargin, bottom: initBottomMargin },
      },
      rightPriceScale: {
        visible: !initLeftScale,
        borderVisible: initCfg.canvas.scalesLinesVisible,
        borderColor: initCfg.canvas.scalesLineColor,
        scaleMargins: { top: initTopMargin, bottom: initBottomMargin },
      },
      timeScale: {
        borderVisible: initCfg.canvas.scalesLinesVisible,
        borderColor: initCfg.canvas.scalesLineColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: initCfg.canvas.marginRightBars,
      },
      localization: {
        timeFormatter: (time: Time) => formatChartTimestamp(time, chartSettingsRef.current),
      },
      width: Math.max(300, el.clientWidth),
      height: Math.max(200, el.clientHeight),
    });

    const candleSeries: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: initCfg.symbol.bodyEnabled ? initCfg.symbol.bodyUpColor : "transparent",
      downColor: initCfg.symbol.bodyEnabled ? initCfg.symbol.bodyDownColor : "transparent",
      borderVisible: initCfg.symbol.borderEnabled,
      borderUpColor: initCfg.symbol.borderUpColor,
      borderDownColor: initCfg.symbol.borderDownColor,
      wickVisible: initCfg.symbol.wickEnabled,
      wickUpColor: initCfg.symbol.wickUpColor,
      wickDownColor: initCfg.symbol.wickDownColor,
      lastValueVisible: initCfg.scales.symbolPriceLabel !== "hidden",
      priceLineVisible: initCfg.scales.symbolPriceLabel === "value_line",
      priceFormat: {
        type: "price",
        precision: initDigits,
        minMove: Math.pow(10, -initDigits),
      },
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      visible: showVolume && !volumeHidden,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    chartApiRef.current = chart;
    const seeded = seedInitialCandles(symbol);
    let activeCandles: CandlestickData<UTCTimestamp>[] = [...seeded.candles];
    let activeVolumes: HistogramData<UTCTimestamp>[] = [...seeded.volumes];
    let activeBuyVolumes: number[] = [...seeded.buyVolumes];
    let activeSellVolumes: number[] = [...seeded.sellVolumes];

    const symMeta = getSymbolMeta(symbol);
    const formatOhlc = (c: CandlestickData<UTCTimestamp>, vol?: number) => {
      const cfg = chartSettingsRef.current;
      const digits = getPrecisionDigits(cfg, symMeta.decimals);
      const f = (n: number) =>
        n.toLocaleString("en-US", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
      const segments: string[] = [];
      if (cfg.statusLine.chartValues) {
        segments.push(`O ${f(c.open)}  H ${f(c.high)}  L ${f(c.low)}  C ${f(c.close)}`);
      }
      if (cfg.statusLine.barChangeValues) {
        const diff = c.close - c.open;
        const pct = c.open !== 0 ? (diff / c.open) * 100 : 0;
        const sign = diff >= 0 ? "+" : "";
        segments.push(`${sign}${f(diff)} (${sign}${pct.toFixed(2)}%)`);
      }
      void vol;
      return segments.join("   ");
    };

    const updateVolLegend = (bar?: CandlestickData<UTCTimestamp>, vol?: number) => {
      if (typeof vol === "number" && Number.isFinite(vol)) {
        const isUp = !bar || bar.close >= bar.open;
        lastVolSampleRef.current = { vol, isUp };
        if (volLegendRef.current) {
          volLegendRef.current.textContent = formatCompactVolume(vol);
          volLegendRef.current.style.color = isUp ? "#26a69a" : "#ef5350";
        }
      } else if (volLegendRef.current) {
        volLegendRef.current.textContent = "—";
      }
    };

    const publishSeriesSnapshot = () => {
      const times = activeCandles.map((c) => c.time);
      latestTimesRef.current = times;
      latestCandlesRef.current = activeCandles;
      const lastBar = activeCandles[activeCandles.length - 1];
      const lastVol = activeVolumes[activeVolumes.length - 1]?.value;
      if (lastBar && ohlcRef.current) {
        ohlcRef.current.textContent = formatOhlc(lastBar, lastVol);
      }
      updateVolLegend(lastBar, lastVol);
      if (seriesSnapshotRef) {
        seriesSnapshotRef.current = {
          times,
          opens: activeCandles.map((c) => c.open),
          highs: activeCandles.map((c) => c.high),
          lows: activeCandles.map((c) => c.low),
          closes: activeCandles.map((c) => c.close),
          volumes: activeVolumes.map((v) => v.value),
          buyVolumes: [...activeBuyVolumes],
          sellVolumes: [...activeSellVolumes],
        };
      }
    };
    candleSeries.setData(activeCandles);
    volumeSeries.setData(activeVolumes);
    publishSeriesSnapshot();
    chart.timeScale().fitContent();

    const overlay = new WebGl2OrderflowOverlay();
    setRendererLabel(overlay.isWebGl2() ? "WebGL2" : "Canvas2D");

    const tickFloat = Number(tickSizeE9) / 1e9;
    let activeBarTimeSec = Number(activeCandles[activeCandles.length - 1]?.time ?? 0);
    let footprintCells: FootprintCell[] = [];
    let vpSummary: VolumeProfileSummary | null = null;
    let vpBins: VolumeProfileBin[] = [];
    let tpoRows: TpoRow128[] = [];

    let pendingBar: CandlestickData<UTCTimestamp> | null = null;
    let pendingVol: HistogramData<UTCTimestamp> | null = null;
    let pendingBuyVol = 0;
    let pendingSellVol = 0;
    let pendingPrimitiveDirty = true;
    let draftAnchors: AnchorPoint[] = [];
    let hoverAnchor: AnchorPoint | null = null;
    let isFreehandDrawing = false;
    let lastFreehandPx: { x: number; y: number } | null = null;
    let rulerStart: AnchorPoint | null = null;
    let rulerEnd: AnchorPoint | null = null;
    let rulerPinned = false;
    let rulerDragOrigin: { x: number; y: number } | null = null;
    let zoomBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
    let rafId = 0;
    let lastWatchlistNotifyMs = 0;
    let lastStudyRecomputeMs = 0;
    let historicalLoaded = false;
    const backfillAbort = new AbortController();

    const primitive = new OrderflowAndDrawingsPrimitive(overlay, {
      getOverlayData: (): OverlayRenderData => ({
        tickSizeFloat: tickFloat,
        activeBarTimeSec,
        footprintCells,
        vpSummary,
        vpBins,
        tpoRows,
        visibility: visibilityRef.current,
      }),
      getDrawings: (): readonly DrawingObject[] => drawingEngineRef.current!.list(symbol),
      getDrawingsHidden: () => drawingsHiddenRef.current,
      getDrawingsLocked: () => drawingsLockedRef.current,
      getSelectedDrawingId: () => selectedDrawingIdRef.current,
      getTimeframe: () => timeframe,
      getDraftPreview: () => ({
        tool: activeToolRef.current,
        anchors: draftAnchors,
        hover: hoverAnchor,
      }),
      getRulerPreview: () => (rulerStart && rulerEnd ? { start: rulerStart, end: rulerEnd } : null),
      getZoomBox: () => zoomBox,
      getTickSizeE9: () => tickSizeE9,
      getPrecisionDigits: () => getPrecisionDigits(chartSettingsRef.current, symMeta.decimals),
      getCandles: () => activeCandles,
      getVolumes: () => activeVolumes,
      getSessionVpConfig: () => sessionVpConfigRef.current,
    });
    candleSeries.attachPrimitive(primitive);

    // Real historical OHLCV backfill when the user has explicitly opted into a live exchange feed.
    // Strictly skipped in `paper_sim` mode (SV-01 zero network calls at boot).
    if (dataSource !== "paper_sim") {
      void fetchHistoricalOhlc({
        source: dataSource,
        symbol,
        timeframe,
        signal: backfillAbort.signal,
      })
        .then((bars) => {
          if (!bars || bars.length < 2 || backfillAbort.signal.aborted) return;
          activeCandles = bars.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));
          activeVolumes = bars.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? "rgba(130, 142, 165, 0.24)" : "rgba(95, 103, 122, 0.2)",
          }));
          activeBuyVolumes = bars.map((c) => c.volume * (c.close >= c.open ? 0.62 : 0.38));
          activeSellVolumes = bars.map((c, idx) =>
            Math.max(0, c.volume - activeBuyVolumes[idx]),
          );
          historicalLoaded = true;
          const lastBar = activeCandles[activeCandles.length - 1];
          activeBarTimeSec = Number(lastBar.time);
          candleSeries.setData(activeCandles);
          volumeSeries.setData(activeVolumes);
          publishSeriesSnapshot();
          chart.timeScale().fitContent();
          onLivePriceSampleRef.current?.(symbol, lastBar.close);
          onSeriesUpdatedRef.current?.();
          pendingPrimitiveDirty = true;
          scheduleFlush();
        })
        .catch(() => {
          // Keep seeded fallback bars if historical REST is temporarily unreachable
        });
    }

    const scheduleFlush = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (pendingBar && pendingVol) {
          const res = applyBarHysteresis(activeCandles, pendingBar);
          activeCandles = res.bars;
          activeBarTimeSec = Number(pendingBar.time);
          if (!res.trimmed) {
            candleSeries.update(pendingBar);
            volumeSeries.update(pendingVol);
            if (
              activeVolumes.length > 0 &&
              activeVolumes[activeVolumes.length - 1].time === pendingVol.time
            ) {
              activeVolumes[activeVolumes.length - 1] = pendingVol;
              activeBuyVolumes[activeBuyVolumes.length - 1] = pendingBuyVol;
              activeSellVolumes[activeSellVolumes.length - 1] = pendingSellVol;
            } else {
              activeVolumes.push(pendingVol);
              activeBuyVolumes.push(pendingBuyVol);
              activeSellVolumes.push(pendingSellVol);
            }
          } else {
            candleSeries.setData(activeCandles);
            const volMap = new Map<number, HistogramData<UTCTimestamp>>();
            for (const v of activeVolumes) volMap.set(Number(v.time), v);
            volMap.set(Number(pendingVol.time), pendingVol);
            activeVolumes = activeCandles.map(
              (c) =>
                volMap.get(Number(c.time)) ?? {
                  time: c.time,
                  value: 0,
                  color: "rgba(130, 142, 165, 0.24)",
                },
            );
            activeBuyVolumes = activeVolumes.map((v, idx) => {
              const c = activeCandles[idx];
              return v.value * (c && c.close >= c.open ? 0.62 : 0.38);
            });
            activeSellVolumes = activeVolumes.map((v, idx) =>
              Math.max(0, v.value - activeBuyVolumes[idx]),
            );
            volumeSeries.setData(activeVolumes);
          }

          const nowMs = performance.now();
          if (nowMs - lastWatchlistNotifyMs >= 500) {
            lastWatchlistNotifyMs = nowMs;
            onLivePriceSampleRef.current?.(symbol, pendingBar.close);
          }
          publishSeriesSnapshot();
          if (nowMs - lastStudyRecomputeMs >= 1200) {
            lastStudyRecomputeMs = nowMs;
            onSeriesUpdatedRef.current?.();
          }
          pendingBar = null;
          pendingVol = null;
          pendingPrimitiveDirty = true;
        }
        if (pendingPrimitiveDirty) {
          pendingPrimitiveDirty = false;
          primitive.requestUpdate();
        }
      });
    };

    redrawTriggerRef.current = () => {
      pendingPrimitiveDirty = true;
      scheduleFlush();
    };

    chart.subscribeCrosshairMove((param) => {
      if (param.point) {
        const p = candleSeries.coordinateToPrice(param.point.y);
        if (p !== null && Number.isFinite(p)) {
          lastCrosshairPriceRef.current = p;
        }
      }
      const bar = param.seriesData.get(candleSeries) as CandlestickData<UTCTimestamp> | undefined;
      const vPoint = param.seriesData.get(volumeSeries) as HistogramData<UTCTimestamp> | undefined;
      const lastBar = activeCandles[activeCandles.length - 1];
      const lastVol = activeVolumes[activeVolumes.length - 1]?.value;
      if (ohlcRef.current) {
        if (bar && typeof bar.open === "number") {
          ohlcRef.current.textContent = formatOhlc(bar, vPoint?.value);
        } else if (lastBar) {
          ohlcRef.current.textContent = formatOhlc(lastBar, lastVol);
        }
      }
      if (bar && typeof bar.open === "number") {
        updateVolLegend(bar, vPoint?.value);
      } else {
        updateVolLegend(lastBar, lastVol);
      }
      // Update active study legend values imperatively on crosshair hover (0 React re-renders)
      const digits = getPrecisionDigits(chartSettingsRef.current, symMeta.decimals);
      for (const [id, valEl] of studyValRefs.current.entries()) {
        const series = studyLineSeriesRef.current.get(id);
        const pt = series ? (param.seriesData.get(series) as LineData<UTCTimestamp> | undefined) : undefined;
        const val =
          pt && typeof pt.value === "number" && Number.isFinite(pt.value)
            ? pt.value
            : studyLatestRef.current.get(id);
        if (typeof val === "number" && Number.isFinite(val)) {
          valEl.textContent = val.toLocaleString("en-US", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          });
        }
      }
    });

    const unsub = transport.subscribeBinary(1, (buf) => {
      try {
        const hdr = decodeFrameHeader(buf);
        if (hdr.frameType === FrameType.LIVE_BAR_UPDATE_BATCH) {
          const { bars } = decodeLiveBarUpdateBatch(buf);
          const latest = bars[bars.length - 1];
          if (!latest) return;
          const t = Number(latest.tsOpenNs / 1_000_000_000n) as UTCTimestamp;
          const rawOpen = Number(latest.openTick) * tickFloat;
          const rawHigh = Number(latest.highTick) * tickFloat;
          const rawLow = Number(latest.lowTick) * tickFloat;
          const rawClose = Number(latest.closeTick) * tickFloat;
          const totalVol = Number(latest.volumeE9) / 1e9;
          const lastSeed = activeCandles[activeCandles.length - 1]?.close ?? symMeta.basePrice;
          const ratio =
            !historicalLoaded &&
            dataSource === "paper_sim" &&
            rawClose > 0 &&
            Math.abs(rawClose - lastSeed) / Math.max(1, lastSeed) > 0.35
              ? lastSeed / rawClose
              : 1;
          const open = rawOpen * ratio;
          const high = rawHigh * ratio;
          const low = rawLow * ratio;
          const close = rawClose * ratio;
          pendingBar = { time: t, open, high, low, close };
          pendingVol = {
            time: t,
            value: totalVol,
            color: close >= open ? "rgba(130, 142, 165, 0.24)" : "rgba(95, 103, 122, 0.2)",
          };
          pendingBuyVol = totalVol * (close >= open ? 0.62 : 0.38);
          pendingSellVol = Math.max(0, totalVol - pendingBuyVol);
          scheduleFlush();
        } else if (hdr.frameType === FrameType.LIVE_FOOTPRINT_DELTA) {
          const decoded = decodeFootprintDelta(buf);
          footprintCells = decoded.cells;
          let sumBid = 0n;
          let sumAsk = 0n;
          for (const c of footprintCells) {
            sumBid += c.bidVolE9;
            sumAsk += c.askVolE9;
          }
          if (activeBuyVolumes.length > 0 && (sumBid > 0n || sumAsk > 0n)) {
            activeBuyVolumes[activeBuyVolumes.length - 1] = Number(sumAsk) / 1e9;
            activeSellVolumes[activeSellVolumes.length - 1] = Number(sumBid) / 1e9;
            publishSeriesSnapshot();
          }
          pendingPrimitiveDirty = true;
          scheduleFlush();
        } else if (hdr.frameType === FrameType.VOLUME_PROFILE_SOA) {
          const decoded = decodeVolumeProfile(buf);
          vpSummary = decoded.summary;
          vpBins = decoded.bins;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        } else if (hdr.frameType === FrameType.TPO_PROFILE_BITMASK) {
          const decoded = decodeTpoProfileBitmask(buf);
          tpoRows = decoded.rows;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
      } catch {
        // Ignore unrelated or malformed frames
      }
    });

    const collectMagnetTargets = (cursorTimeSec?: number): MagnetTarget[] => {
      const targets: MagnetTarget[] = [];
      if (activeCandles.length > 0 && tickFloat > 0) {
        let targetBar = activeCandles[activeCandles.length - 1];
        if (typeof cursorTimeSec === "number" && Number.isFinite(cursorTimeSec)) {
          let bestDist = Infinity;
          for (let i = 0; i < activeCandles.length; i++) {
            const dist = Math.abs(Number(activeCandles[i].time) - cursorTimeSec);
            if (dist < bestDist) {
              bestDist = dist;
              targetBar = activeCandles[i];
            }
          }
        }
        if (targetBar) {
          for (const price of [targetBar.open, targetBar.high, targetBar.low, targetBar.close]) {
            const scaled = price / tickFloat;
            if (Number.isFinite(scaled)) {
              targets.push({ priceTick: BigInt(Math.round(scaled)), source: "ohlc" });
            }
          }
        }
      }
      if (vpSummary) {
        targets.push(
          { priceTick: vpSummary.pocPrice, source: "tpo_poc" },
          { priceTick: vpSummary.vahPrice, source: "tpo_vah" },
          { priceTick: vpSummary.valPrice, source: "tpo_val" },
        );
      }
      if (tickFloat > 0) {
        for (const d of drawingEngineRef.current!.list(symbol)) {
          if (
            (d.kind === "fixed_range_vp" || d.kind === "anchored_vp") &&
            d.anchors.length >= 1
          ) {
            const t1 = d.anchors[0].timeSec;
            const t2 =
              d.kind === "anchored_vp"
                ? Number(activeCandles[activeCandles.length - 1]?.time ?? t1)
                : (d.anchors[1]?.timeSec ?? t1);
            const minSec = Math.min(t1, t2);
            const maxSec = Math.max(t1, t2);
            const subset: VpCandleInput[] = [];
            for (let i = 0; i < activeCandles.length; i++) {
              const c = activeCandles[i];
              const ct = Number(c.time);
              if (ct >= minSec && ct <= maxSec) {
                subset.push({
                  time: ct,
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close: c.close,
                  volume: activeVolumes[i]?.value ?? 1,
                });
              }
            }
            const prof = computeFixedRangeVolumeProfile(
              subset,
              tickFloat,
              cloneVpConfig(d.vpConfig),
            );
            if (prof) {
              targets.push(
                { priceTick: BigInt(Math.round(prof.pocPrice / tickFloat)), source: "tpo_poc" },
                { priceTick: BigInt(Math.round(prof.vahPrice / tickFloat)), source: "tpo_vah" },
                { priceTick: BigInt(Math.round(prof.valPrice / tickFloat)), source: "tpo_val" },
              );
            }
          }
        }
      }
      return targets;
    };

    const toAnchorFromPointer = (clientX: number, clientY: number): AnchorPoint | null => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const price = candleSeries.coordinateToPrice(y);
      if (price === null || !Number.isFinite(price)) return null;
      const scaled = price / tickFloat;
      if (!Number.isFinite(scaled)) return null;
      const rawTime = chart.timeScale().coordinateToTime(x);
      const timeSec =
        typeof rawTime === "number"
          ? rawTime
          : activeBarTimeSec || Math.floor(Date.now() / 1000);
      let priceTick = BigInt(Math.round(scaled));
      if (magnetRef.current) {
        const snapped = snapTickToMagnet(priceTick, collectMagnetTargets(timeSec), 250n);
        priceTick = snapped.snappedTick;
      }
      return { timeSec, priceTick };
    };

    const finishDrawing = (toolKind: PlacedDrawingKind, anchors: AnchorPoint[], label?: string) => {
      const created = drawingEngineRef.current!.add(toolKind, symbol, anchors, undefined, label);
      setSelectedDrawingId(created.id);
      setDrawingVersion((v) => v + 1);
      draftAnchors = [];
      hoverAnchor = null;
      isFreehandDrawing = false;
      lastFreehandPx = null;
      syncHistoryMeta();
      if (!stayInDrawingModeRef.current) {
        setActiveTool("cursor");
      }
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const tool = ev.shiftKey && activeToolRef.current === "cursor" ? "ruler" : activeToolRef.current;
      if (tool === "cursor") return;

      if (tool === "zoom_in") {
        zoomBox = { x1: px, y1: py, x2: px, y2: py };
        try {
          pointerSurface.setPointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }

      const anchor = toAnchorFromPointer(ev.clientX, ev.clientY);
      if (!anchor) return;

      if (tool === "ruler") {
        if (!rulerStart || rulerPinned) {
          rulerStart = anchor;
          rulerEnd = anchor;
          rulerPinned = false;
          rulerDragOrigin = { x: ev.clientX, y: ev.clientY };
          try {
            pointerSurface.setPointerCapture(ev.pointerId);
          } catch {
            // ignore
          }
        } else {
          rulerEnd = anchor;
          rulerPinned = true;
          rulerDragOrigin = null;
        }
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }

      if (drawingsLockedRef.current) {
        showToast("Drawings are locked — unlock to add or edit");
        return;
      }

      const meta = getDrawingToolMeta(tool);
      if (meta.interaction === "freehand") {
        isFreehandDrawing = true;
        draftAnchors = [anchor];
        lastFreehandPx = { x: px, y: py };
        try {
          pointerSurface.setPointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }

      if (meta.interaction === "multipoint") {
        draftAnchors.push(anchor);
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }

      draftAnchors.push(anchor);
      if (draftAnchors.length >= meta.requiredAnchors) {
        if (meta.interaction === "text") {
          const captured = [...draftAnchors];
          draftAnchors = [];
          hoverAnchor = null;
          pendingPrimitiveDirty = true;
          scheduleFlush();
          setPendingTextAnnotation({
            kind: tool as PlacedDrawingKind,
            anchors: captured,
            x: Math.max(12, Math.min(rect.width - 230, px)),
            y: Math.max(12, Math.min(rect.height - 64, py)),
            value: "",
          });
          return;
        }
        const stamp = tool === "icon_stamp" ? activeIconStampRef.current : undefined;
        finishDrawing(tool as PlacedDrawingKind, draftAnchors, stamp);
      } else {
        pendingPrimitiveDirty = true;
        scheduleFlush();
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;

      if (zoomBox) {
        zoomBox = { ...zoomBox, x2: px, y2: py };
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }

      if (rulerStart && !rulerPinned) {
        const nextAnchor = toAnchorFromPointer(ev.clientX, ev.clientY);
        if (nextAnchor) {
          rulerEnd = nextAnchor;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
        return;
      }

      const tool = activeToolRef.current;
      if (tool === "cursor" || draftAnchors.length === 0) return;

      const meta = getDrawingToolMeta(tool);
      if (meta.interaction === "freehand" && isFreehandDrawing) {
        if (lastFreehandPx && Math.hypot(px - lastFreehandPx.x, py - lastFreehandPx.y) < 4) {
          return;
        }
        const nextAnchor = toAnchorFromPointer(ev.clientX, ev.clientY);
        if (nextAnchor) {
          draftAnchors.push(nextAnchor);
          lastFreehandPx = { x: px, y: py };
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
        return;
      }

      hoverAnchor = toAnchorFromPointer(ev.clientX, ev.clientY);
      pendingPrimitiveDirty = true;
      scheduleFlush();
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (zoomBox) {
        const x1 = Math.min(zoomBox.x1, zoomBox.x2);
        const x2 = Math.max(zoomBox.x1, zoomBox.x2);
        zoomBox = null;
        if (x2 - x1 > 12) {
          const l1 = chart.timeScale().coordinateToLogical(x1);
          const l2 = chart.timeScale().coordinateToLogical(x2);
          if (l1 !== null && l2 !== null && l2 > l1) {
            chart.timeScale().setVisibleLogicalRange({ from: l1, to: l2 });
          }
          if (!stayInDrawingModeRef.current) {
            setActiveTool("cursor");
          }
        }
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }

      if (rulerStart && !rulerPinned && rulerDragOrigin) {
        const moved = Math.hypot(ev.clientX - rulerDragOrigin.x, ev.clientY - rulerDragOrigin.y);
        if (moved > 8) {
          const nextAnchor = toAnchorFromPointer(ev.clientX, ev.clientY);
          if (nextAnchor) rulerEnd = nextAnchor;
          rulerPinned = true;
          rulerDragOrigin = null;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
        return;
      }

      if (isFreehandDrawing) {
        isFreehandDrawing = false;
        lastFreehandPx = null;
        const tool = activeToolRef.current;
        if (draftAnchors.length >= 2 && tool !== "cursor" && tool !== "ruler" && tool !== "zoom_in") {
          finishDrawing(tool as PlacedDrawingKind, draftAnchors);
        } else {
          draftAnchors = [];
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
      }
    };

    const onDoubleClick = () => {
      const tool = activeToolRef.current;
      const meta = getDrawingToolMeta(tool);
      if (meta.interaction === "multipoint" && draftAnchors.length >= 2) {
        finishDrawing(tool as PlacedDrawingKind, draftAnchors);
      }
    };

    const onWindowKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (ev.key === "Shift") {
        shiftPressedRef.current = true;
        if (activeToolRef.current === "cursor") {
          pointerSurface.style.pointerEvents = "auto";
          pointerSurface.style.cursor = "crosshair";
        }
      }
      if (isTyping) return;

      if (ev.key === "Escape") {
        draftAnchors = [];
        hoverAnchor = null;
        isFreehandDrawing = false;
        rulerStart = null;
        rulerEnd = null;
        rulerPinned = false;
        zoomBox = null;
        pendingPrimitiveDirty = true;
        scheduleFlush();
        setActiveTool("cursor");
        return;
      }

      if (ev.key === "Enter") {
        const tool = activeToolRef.current;
        const meta = getDrawingToolMeta(tool);
        if (meta.interaction === "multipoint" && draftAnchors.length >= 2) {
          finishDrawing(tool as PlacedDrawingKind, draftAnchors);
          return;
        }
      }

      if ((ev.metaKey || ev.ctrlKey) && ev.code === "KeyZ") {
        ev.preventDefault();
        if (ev.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (ev.ctrlKey && ev.code === "KeyY") {
        ev.preventDefault();
        handleRedo();
        return;
      }

      if (ev.altKey && !ev.metaKey && !ev.ctrlKey) {
        if (ev.code === "KeyT" && !ev.shiftKey) {
          ev.preventDefault();
          setActiveTool("trendline");
        } else if (ev.code === "KeyH" && !ev.shiftKey) {
          ev.preventDefault();
          setActiveTool("horizontal_line");
        } else if (ev.code === "KeyJ" && !ev.shiftKey) {
          ev.preventDefault();
          setActiveTool("horizontal_ray");
        } else if (ev.code === "KeyV" && !ev.shiftKey) {
          ev.preventDefault();
          setActiveTool("vertical_line");
        } else if (ev.code === "KeyC" && !ev.shiftKey) {
          ev.preventDefault();
          setActiveTool("crossline");
        } else if (ev.code === "KeyF" && !ev.shiftKey) {
          ev.preventDefault();
          setActiveTool("fib_retracement");
        } else if (ev.code === "KeyR" && ev.shiftKey) {
          ev.preventDefault();
          setActiveTool("box_zone");
        }
      }
    };

    const onWindowKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === "Shift") {
        shiftPressedRef.current = false;
        pointerSurface.style.pointerEvents = "";
        pointerSurface.style.cursor = "";
      }
    };

    requestOverlayRedrawRef.current = () => {
      primitive.requestUpdate();
    };

    const toPixel = (anchor: AnchorPoint): { x: number | null; y: number | null } => {
      const xCoord = chart.timeScale().timeToCoordinate(anchor.timeSec as UTCTimestamp);
      const yCoord = candleSeries.priceToCoordinate(Number(anchor.priceTick) * tickFloat);
      return {
        x: xCoord === null ? null : Number(xCoord),
        y: yCoord === null ? null : Number(yCoord),
      };
    };

    let dragState: {
      drawingId: string;
      hitKind: "anchor" | "body";
      anchorIndex: number;
      startAnchor: AnchorPoint;
      origAnchors: AnchorPoint[];
      moved: boolean;
    } | null = null;

    const getVisibleDrawingsForHit = (): DrawingObject[] => {
      if (drawingsHiddenRef.current) return [];
      return drawingEngineRef.current!
        .list(symbol)
        .filter((d) => isTimeframeVisible(timeframe, d.visibility));
    };

    const onHostPointerDownCapture = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      if (activeToolRef.current !== "cursor" || shiftPressedRef.current) return;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const hit = hitTestDrawing(getVisibleDrawingsForHit(), px, py, toPixel, rect.width, rect.height);
      if (!hit) {
        if (selectedDrawingIdRef.current !== null) {
          setSelectedDrawingId(null);
          primitive.requestUpdate();
        }
        return; // Do NOT block LWC pan/zoom when clicking empty chart space
      }
      setSelectedDrawingId(hit.drawing.id);
      setDrawingVersion((v) => v + 1);
      primitive.requestUpdate();

      if (drawingsLockedRef.current || hit.drawing.locked) return;
      const startAnchor = toAnchorFromPointer(ev.clientX, ev.clientY);
      if (!startAnchor) return;

      ev.stopPropagation();
      ev.preventDefault();
      dragState = {
        drawingId: hit.drawing.id,
        hitKind: hit.hitKind,
        anchorIndex: hit.anchorIndex,
        startAnchor,
        origAnchors: hit.drawing.anchors.map((a) => ({ ...a })),
        moved: false,
      };
    };

    const onHostPointerMoveWindow = (ev: PointerEvent) => {
      if (!dragState) return;
      const cur = toAnchorFromPointer(ev.clientX, ev.clientY);
      if (!cur) return;
      ev.preventDefault();
      let nextAnchors: AnchorPoint[];
      if (dragState.hitKind === "anchor" && dragState.anchorIndex >= 0) {
        nextAnchors = dragState.origAnchors.map((a, idx) =>
          idx === dragState!.anchorIndex ? cur : { ...a },
        );
      } else {
        const dt = cur.timeSec - dragState.startAnchor.timeSec;
        const dp = cur.priceTick - dragState.startAnchor.priceTick;
        nextAnchors = dragState.origAnchors.map((a) => ({
          timeSec: a.timeSec + dt,
          priceTick: a.priceTick + dp > 1n ? a.priceTick + dp : 1n,
        }));
      }
      dragState.moved = true;
      drawingEngineRef.current!.setAnchorsSilent(dragState.drawingId, nextAnchors);
      primitive.requestUpdate();
    };

    const onHostPointerUpWindow = () => {
      if (!dragState) return;
      const done = dragState;
      dragState = null;
      if (done.moved) {
        const current = drawingEngineRef.current!.getById(done.drawingId);
        if (current) {
          drawingEngineRef.current!.commitMove(done.drawingId, done.origAnchors, current.anchors);
          syncHistoryMeta();
          setDrawingVersion((v) => v + 1);
        }
      }
    };

    const onHostDoubleClickCapture = (ev: MouseEvent) => {
      if (activeToolRef.current !== "cursor") return;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const hit = hitTestDrawing(getVisibleDrawingsForHit(), px, py, toPixel, rect.width, rect.height);
      if (hit) {
        ev.stopPropagation();
        ev.preventDefault();
        setSelectedDrawingId(hit.drawing.id);
        setDrawingSettingsOpen(true);
      }
    };

    const onDeleteSelectedKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Delete" && ev.key !== "Backspace") return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const selId = selectedDrawingIdRef.current;
      if (!selId) return;
      ev.preventDefault();
      if (drawingEngineRef.current!.remove(selId)) {
        setSelectedDrawingId(null);
        setDrawingSettingsOpen(false);
        syncHistoryMeta();
        setDrawingVersion((v) => v + 1);
        primitive.requestUpdate();
      }
    };

    el.addEventListener("pointerdown", onHostPointerDownCapture, { capture: true });
    el.addEventListener("dblclick", onHostDoubleClickCapture, { capture: true });
    window.addEventListener("pointermove", onHostPointerMoveWindow);
    window.addEventListener("pointerup", onHostPointerUpWindow);
    window.addEventListener("keydown", onDeleteSelectedKey);

    pointerSurface.addEventListener("pointerdown", onPointerDown);
    pointerSurface.addEventListener("pointermove", onPointerMove);
    pointerSurface.addEventListener("pointerup", onPointerUp);
    pointerSurface.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.resize(Math.floor(width), Math.floor(height));
        scheduleFlush();
      }
    });
    ro.observe(el);

    scheduleFlush();

    return () => {
      backfillAbort.abort();
      unsub();
      ro.disconnect();
      requestOverlayRedrawRef.current = null;
      el.removeEventListener("pointerdown", onHostPointerDownCapture, { capture: true });
      el.removeEventListener("dblclick", onHostDoubleClickCapture, { capture: true });
      window.removeEventListener("pointermove", onHostPointerMoveWindow);
      window.removeEventListener("pointerup", onHostPointerUpWindow);
      window.removeEventListener("keydown", onDeleteSelectedKey);
      pointerSurface.removeEventListener("pointerdown", onPointerDown);
      pointerSurface.removeEventListener("pointermove", onPointerMove);
      pointerSurface.removeEventListener("pointerup", onPointerUp);
      pointerSurface.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      candleSeries.detachPrimitive(primitive);
      priceLinesRef.current = [];
      studyLineSeriesRef.current.clear();
      studyPanesRef.current.clear();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      overlay.dispose();
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, symbol, timeframe, tickSizeE9, dataSource]);

  useEffect(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    const map = studyLineSeriesRef.current;
    const paneMap = studyPanesRef.current;
    const wanted = new Set(studyOverlays.map((s) => s.id));
    for (const [id, series] of map.entries()) {
      if (!wanted.has(id)) {
        try {
          chart.removeSeries(series);
        } catch {
          // Series may already have been detached when its pane closed
        }
        map.delete(id);
        const oscPane = paneMap.get(id);
        if (oscPane) {
          try {
            const idx = oscPane.paneIndex();
            if (idx > 0) chart.removePane(idx);
          } catch {
            // Pane already removed
          }
          paneMap.delete(id);
        }
      }
    }
    const times = latestTimesRef.current;
    const latestMap = new Map<string, number>();
    for (const st of studyOverlays) {
      const isOverlay = st.overlay !== false;
      let series = map.get(st.id);
      if (!series) {
        if (isOverlay) {
          series = chart.addSeries(LineSeries, {
            color: st.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            priceScaleId: "right",
          });
        } else {
          // Dedicated LWC v5 sub-pane for oscillators (RSI, CVD, Footprint Delta)
          const pane = chart.addPane();
          pane.setStretchFactor(0.28);
          series = pane.addSeries(LineSeries, {
            color: st.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            priceScaleId: "right",
          });
          if (st.id.startsWith("wilder_rsi")) {
            series.createPriceLine({
              price: 70,
              color: "rgba(148, 163, 184, 0.35)",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "70",
            });
            series.createPriceLine({
              price: 30,
              color: "rgba(148, 163, 184, 0.35)",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "30",
            });
          }
          paneMap.set(st.id, pane);
        }
        map.set(st.id, series);
      }
      const lwcLineStyle =
        st.lineStyle === "dashed"
          ? LineStyle.Dashed
          : st.lineStyle === "dotted"
            ? LineStyle.Dotted
            : LineStyle.Solid;
      series.applyOptions({
        color: hexWithOpacity(st.color, st.opacity ?? 1),
        lineWidth: st.lineWidth ?? 2,
        lineStyle: lwcLineStyle,
        priceLineVisible: st.showPriceLine ?? false,
        visible: !hiddenStudyIds.has(st.id) && isTimeframeVisible(timeframe, st.visibility),
        lastValueVisible:
          (st.showPriceLabel ?? true) &&
          effectiveSettings.scales.indicatorsLabel === "value",
      });
      const n = Math.min(times.length, st.values.length);
      const pts: LineData<UTCTimestamp>[] = [];
      for (let i = 0; i < n; i++) {
        const v = st.values[i];
        if (v !== null && Number.isFinite(v)) {
          pts.push({ time: times[i], value: v });
        }
      }
      const lastNonNull = [...st.values].reverse().find((v): v is number => v !== null && Number.isFinite(v));
      if (lastNonNull !== undefined) {
        latestMap.set(st.id, lastNonNull);
      }
      series.setData(pts);
    }
    studyLatestRef.current = latestMap;
  }, [studyOverlays, hiddenStudyIds, symbol, timeframe, dataSource, effectiveSettings.scales.indicatorsLabel]);

  const handleToggleVisibility = (key: keyof OverlayVisibility) => {
    if (onToggleOverlayVisibility) {
      onToggleOverlayVisibility(key);
    } else {
      setLocalVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const toggleOrderflowLayerHidden = (key: keyof OverlayVisibility) => {
    setHiddenOrderflowLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleStudyVisibility = (id: string) => {
    setHiddenStudyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectScaleMode = (mode: PriceScaleMode) => {
    setPriceScaleMode(mode);
    onLogScaleChange?.(mode === PriceScaleMode.Logarithmic);
  };

  const symMeta = getSymbolMeta(symbol);
  const precisionDigits = getPrecisionDigits(effectiveSettings, symMeta.decimals);
  const formatPriceValue = (p: number) =>
    p.toLocaleString("en-US", {
      minimumFractionDigits: precisionDigits,
      maximumFractionDigits: precisionDigits,
    });

  const handleChartContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = hostRef.current;
    const cs = candleSeriesRef.current;
    let price = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close ?? symMeta.basePrice;
    if (el && cs) {
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const computed = cs.coordinateToPrice(y);
      if (computed !== null && Number.isFinite(computed)) {
        price = computed;
      }
    }
    const menuWidth = 296;
    const menuHeight = 430;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight));
    setContextMenu({
      x,
      y,
      price,
      formattedPrice: formatPriceValue(price),
    });
  };

  const handleResetView = () => {
    setAutoScale(true);
    setInvertScale(false);
    setPriceScaleMode(PriceScaleMode.Normal);
    onLogScaleChange?.(false);
    chartApiRef.current?.timeScale().fitContent();
    showToast("Chart view reset");
  };

  const clampBarCoords = (x: number, y: number): { x: number; y: number } => {
    const container = chartContainerRef.current;
    const bar = floatingBarRef.current;
    const cw = container?.clientWidth ?? 960;
    const ch = container?.clientHeight ?? 600;
    const bw = bar?.offsetWidth ?? 420;
    const bh = bar?.offsetHeight ?? 40;
    return {
      x: Math.max(8, Math.min(Math.max(8, cw - bw - 8), Math.round(x))),
      y: Math.max(8, Math.min(Math.max(8, ch - bh - 8), Math.round(y))),
    };
  };

  useEffect(() => {
    if (!floatingBarPos) return;
    const onResize = () => {
      setFloatingBarPos((curr) => (curr ? clampBarCoords(curr.x, curr.y) : null));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [floatingBarPos !== null]);

  useEffect(() => {
    if (pendingTextAnnotation) {
      pendingTextInputRef.current?.focus();
    }
  }, [pendingTextAnnotation]);

  const handleBarGripPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const container = chartContainerRef.current;
    const bar = floatingBarRef.current;
    if (!container || !bar) return;
    const cRect = container.getBoundingClientRect();
    const bRect = bar.getBoundingClientRect();
    const currentX = floatingBarPos ? floatingBarPos.x : bRect.left - cRect.left;
    const currentY = floatingBarPos ? floatingBarPos.y : bRect.top - cRect.top;
    barDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: currentX,
      startY: currentY,
    };
    setIsDraggingBar(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleBarGripPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = barDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    setFloatingBarPos(clampBarCoords(drag.startX + dx, drag.startY + dy));
  };

  const handleBarGripPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = barDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    barDragRef.current = null;
    setIsDraggingBar(false);
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    const finalPos = clampBarCoords(drag.startX + dx, drag.startY + dy);
    setFloatingBarPos(finalPos);
    try {
      window.localStorage?.setItem("allegedly.floating_bar_pos.v1", JSON.stringify(finalPos));
    } catch {
      // ignore
    }
  };

  const handleBarGripKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 32 : 12;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    e.preventDefault();
    const container = chartContainerRef.current;
    const bar = floatingBarRef.current;
    const cRect = container?.getBoundingClientRect();
    const bRect = bar?.getBoundingClientRect();
    const baseX = floatingBarPos ? floatingBarPos.x : cRect && bRect ? bRect.left - cRect.left : 200;
    const baseY = floatingBarPos ? floatingBarPos.y : cRect && bRect ? bRect.top - cRect.top : 12;
    const next = clampBarCoords(baseX + dx, baseY + dy);
    setFloatingBarPos(next);
    try {
      window.localStorage?.setItem("allegedly.floating_bar_pos.v1", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const activeFavorites = favoriteTools ?? DEFAULT_FAVORITE_TOOLS;

  const showWatermark =
    effectiveSettings.canvas.watermark === "always" ||
    (effectiveSettings.canvas.watermark === "replay" && replayOpen);

  const showBuySellButtons =
    effectiveSettings.statusLine.buySellButtons || effectiveSettings.trading.buySellButtons;

  const statusBgStyle = effectiveSettings.statusLine.background
    ? {
        backgroundColor: hexToRgba(
          effectiveSettings.canvas.backgroundColor,
          Math.max(0.05, Math.min(0.95, effectiveSettings.statusLine.backgroundOpacity / 100)),
        ),
      }
    : undefined;

  return (
    <div
      style={{ backgroundColor: effectiveSettings.canvas.backgroundColor }}
      className="relative flex h-full w-full flex-col"
    >
      {showInlineToolbar && (
        <ChartOverlayToolbar
          visibility={visibility}
          activeTool={activeTool}
          magnetEnabled={magnetEnabled}
          canUndo={historyMeta.canUndo}
          canRedo={historyMeta.canRedo}
          drawingCount={historyMeta.count}
          rendererLabel={rendererLabel}
          onToggleVisibility={handleToggleVisibility}
          onSelectTool={setActiveTool}
          onToggleMagnet={toggleMagnet}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearDrawings={handleClear}
        />
      )}

      <div
        ref={chartContainerRef}
        className="relative flex-1 overflow-hidden"
        onContextMenu={handleChartContextMenu}
      >
        {/* Optional Replay / Always Clean-Room Watermark */}
        {showWatermark && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center select-none"
          >
            <div className="font-mono text-5xl font-bold tracking-widest text-white/[0.045]">
              {symMeta.symbol} · {timeframe}
            </div>
            {replayOpen && (
              <div className="mt-1 font-mono text-xs uppercase tracking-[0.35em] text-amber-300/20">
                Bar Replay
              </div>
            )}
          </div>
        )}

        {/* Transparent Top-Left Institutional Status Line */}
        <div
          style={statusBgStyle}
          className="pointer-events-none absolute left-3 top-2.5 z-20 flex flex-col gap-1 rounded px-1.5 py-1 select-none"
        >
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {effectiveSettings.statusLine.logo && (
              <span
                aria-hidden="true"
                style={{ backgroundColor: symMeta.badgeColor, color: symMeta.badgeText }}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
              >
                {symMeta.shortLabel.slice(0, 3)}
              </span>
            )}
            {effectiveSettings.statusLine.title && (
              <>
                {effectiveSettings.statusLine.titleMode !== "description" && (
                  <span className="font-semibold tracking-tight text-[#e6e8ee]">
                    {symMeta.symbol}
                  </span>
                )}
                {effectiveSettings.statusLine.titleMode === "symbol_and_name" && (
                  <>
                    <span className="text-[#8b92a3]">·</span>
                    <span className="text-[#b8becd]">{symMeta.name}</span>
                  </>
                )}
                {effectiveSettings.statusLine.titleMode === "description" && (
                  <span className="font-semibold tracking-tight text-[#e6e8ee]">
                    {symMeta.name}
                  </span>
                )}
                <span className="text-[#8b92a3]">·</span>
                <span className="font-mono text-[#b8becd]">{timeframe}</span>
                <span className="text-[#8b92a3]">·</span>
                <span className="text-[#8b92a3]">{symMeta.exchange}</span>
              </>
            )}
            {effectiveSettings.statusLine.openMarketStatus && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#12332a]/90 px-2 py-0.5 text-[10px] font-medium text-[#2dd4bf]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2dd4bf]" />
                  Open
                </span>
                <span className="rounded bg-[#342512]/90 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {symMeta.delayedLabel ?? "Paper Sim"}
                </span>
              </>
            )}
            {lockCursorByTime && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] text-sky-300 ring-1 ring-sky-500/30">
                Cursor Locked
              </span>
            )}
          </div>

          {(effectiveSettings.statusLine.chartValues ||
            effectiveSettings.statusLine.barChangeValues ||
            effectiveSettings.statusLine.volume) && (
            <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-[#8b92a3]">
              <span ref={ohlcRef} className="text-[#b8becd]" />
              <span className="text-[10px] text-[#636a7b]">{rendererLabel}</span>
            </div>
          )}

          {showBuySellButtons && (
            <div className="pointer-events-auto mt-0.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSubmitOrderAtPrice?.("sell", "market");
                  showToast(`Sell 1 ${symbol} market submitted`);
                }}
                className="rounded border border-rose-500/50 bg-rose-950/70 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-rose-200 hover:bg-rose-900/80"
              >
                SELL MKT
              </button>
              <button
                type="button"
                onClick={() => {
                  onSubmitOrderAtPrice?.("buy", "market");
                  showToast(`Buy 1 ${symbol} market submitted`);
                }}
                className="rounded border border-sky-500/50 bg-sky-950/70 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-sky-200 hover:bg-sky-900/80"
              >
                BUY MKT
              </button>
            </div>
          )}

          {effectiveSettings.statusLine.indicatorTitles && (
            <ActiveIndicatorsLegend
              studyOverlays={studyOverlays}
              hiddenStudyIds={hiddenStudyIds}
              showVolumeRow={showVolume}
              volumeHidden={volumeHidden}
              volLegendRef={volLegendRef}
              studyValRefs={studyValRefs}
              activeOrderflowRows={[
                ...(visibility.vrvp
                  ? [
                      {
                        key: "vrvp" as const,
                        label: "Session Volume Profile",
                        badge: "VRVP",
                        color: "#38bdf8",
                      },
                    ]
                  : []),
                ...(visibility.footprint
                  ? [
                      {
                        key: "footprint" as const,
                        label: "Footprint Bid/Ask",
                        badge: "FP",
                        color: "#34d399",
                      },
                    ]
                  : []),
                ...(visibility.tpo
                  ? [
                      {
                        key: "tpo" as const,
                        label: "TPO Market Profile",
                        badge: "TPO",
                        color: "#f59e0b",
                      },
                    ]
                  : []),
                ...(visibility.marketStructure
                  ? [
                      {
                        key: "marketStructure" as const,
                        label: "Market Structure (HH/HL/LH/LL)",
                        badge: "BOS",
                        color: "#089981",
                      },
                    ]
                  : []),
              ]}
              hiddenOrderflowLayers={hiddenOrderflowLayers}
              expanded={indicatorsLegendExpanded}
              indicatorInputs={effectiveSettings.statusLine.indicatorInputs}
              indicatorValues={effectiveSettings.statusLine.indicatorValues}
              formatPriceValue={formatPriceValue}
              onToggleExpanded={() => setIndicatorsLegendExpanded((v) => !v)}
              onToggleVolumeHidden={() => setVolumeHidden((v) => !v)}
              onRemoveVolume={() => {
                setVolumeHidden(false);
                setShowVolume(false);
              }}
              onToggleStudyHidden={toggleStudyVisibility}
              onRemoveStudy={onRemoveStudy}
              onOpenStudySettings={onOpenStudySettings}
              onToggleOrderflowHidden={toggleOrderflowLayerHidden}
              onOpenOrderflowSettings={(key) => {
                if (key === "vrvp") setVpSettingsOpen(true);
              }}
              onRemoveOrderflow={handleToggleVisibility}
            />
          )}
        </div>

        {/* Draggable Floating Favorites Drawing & Orderflow Toolbar */}
        {showFloatingBar && (
          <div
            ref={floatingBarRef}
            role="toolbar"
            aria-label="Favorite drawing tools"
            style={
              floatingBarPos
                ? { left: `${floatingBarPos.x}px`, top: `${floatingBarPos.y}px` }
                : undefined
            }
            className={
              floatingBarPos
                ? "absolute z-25 flex items-center gap-0.5 rounded-xl border border-[#2a2e39] bg-[#1e222d]/95 px-1.5 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.62)] backdrop-blur-md select-none"
                : "absolute left-1/2 top-2 z-25 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[#2a2e39] bg-[#1e222d]/95 px-1.5 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.62)] backdrop-blur-md select-none"
            }
          >
            <button
              type="button"
              aria-label="Drag favorites toolbar"
              title="Drag to move toolbar (or use Arrow keys)"
              onPointerDown={handleBarGripPointerDown}
              onPointerMove={handleBarGripPointerMove}
              onPointerUp={handleBarGripPointerUp}
              onPointerCancel={handleBarGripPointerUp}
              onKeyDown={handleBarGripKeyDown}
              className={
                isDraggingBar
                  ? "mr-0.5 flex h-7 w-5 cursor-grabbing items-center justify-center rounded text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-sky-400"
                  : "mr-0.5 flex h-7 w-5 cursor-grab items-center justify-center rounded text-[#62697a] hover:text-[#b2b8c7] focus-visible:outline-2 focus-visible:outline-sky-400"
              }
            >
              <svg aria-hidden="true" viewBox="0 0 12 16" className="h-3.5 w-2.5" fill="currentColor">
                <circle cx="3.5" cy="3" r="1.1" />
                <circle cx="8.5" cy="3" r="1.1" />
                <circle cx="3.5" cy="8" r="1.1" />
                <circle cx="8.5" cy="8" r="1.1" />
                <circle cx="3.5" cy="13" r="1.1" />
                <circle cx="8.5" cy="13" r="1.1" />
              </svg>
            </button>

            {activeFavorites.map((toolKind) => {
              const meta = getDrawingToolMeta(toolKind);
              const active = activeTool === toolKind;
              return (
                <button
                  key={toolKind}
                  type="button"
                  title={meta.shortcut ? `${meta.label} (${meta.shortcut})` : meta.label}
                  aria-label={`Quick select ${meta.label}`}
                  aria-pressed={active}
                  onClick={() => setActiveTool(active ? "cursor" : toolKind)}
                  className={
                    active
                      ? "flex h-7 w-7 items-center justify-center rounded-md bg-[#2962ff]/18 text-[#2962ff] focus-visible:outline-2 focus-visible:outline-sky-400"
                      : "flex h-7 w-7 items-center justify-center rounded-md text-[#b8becd] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                  }
                >
                  <DrawingToolIcon kind={toolKind} className="h-[17px] w-[17px]" />
                </button>
              );
            })}


          </div>
        )}

        {/* Inline Annotation Text Input Popover */}
        {pendingTextAnnotation && (
          <form
            style={{
              left: `${pendingTextAnnotation.x}px`,
              top: `${pendingTextAnnotation.y}px`,
            }}
            onSubmit={(e) => {
              e.preventDefault();
              const label =
                pendingTextAnnotation.value.trim() ||
                getDrawingToolMeta(pendingTextAnnotation.kind).shortLabel;
              drawingEngineRef.current!.add(
                pendingTextAnnotation.kind,
                symbol,
                pendingTextAnnotation.anchors,
                undefined,
                label,
              );
              syncHistoryMeta();
              setPendingTextAnnotation(null);
              if (!stayInDrawingModeRef.current) {
                setActiveTool("cursor");
              }
            }}
            className="absolute z-40 flex items-center gap-1.5 rounded-lg border border-[#343a4c] bg-[#14171f]/98 p-1.5 shadow-2xl"
          >
            <input
              ref={pendingTextInputRef}
              type="text"
              aria-label="Annotation text"
              placeholder={`Enter ${getDrawingToolMeta(pendingTextAnnotation.kind).label.toLowerCase()}...`}
              value={pendingTextAnnotation.value}
              onChange={(e) =>
                setPendingTextAnnotation((curr) =>
                  curr ? { ...curr, value: e.target.value } : null,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setPendingTextAnnotation(null);
                }
              }}
              className="h-7 w-44 rounded border border-[#2c3140] bg-[#0e1015] px-2 text-xs text-[#e6e8ee] placeholder-[#6c7385] focus:border-sky-400 focus:outline-none"
            />
            <button
              type="submit"
              className="h-7 rounded bg-[#e6e8ee] px-2.5 text-xs font-medium text-[#0c0d11] hover:bg-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setPendingTextAnnotation(null)}
              className="h-7 rounded px-2 text-xs text-[#9aa1b2] hover:bg-[#222633] hover:text-white"
            >
              Cancel
            </button>
          </form>
        )}

        {!drawingsHidden &&
          selectedDrawingId &&
          (() => {
            const sel = drawingEngineRef.current!.getById(selectedDrawingId);
            if (!sel || sel.symbol !== symbol) return null;
            return (
              <DrawingQuickStyleBar
                drawing={sel}
                onUpdate={(patch) => {
                  drawingEngineRef.current!.update(sel.id, patch);
                  syncHistoryMeta();
                  setDrawingVersion((v) => v + 1);
                  requestOverlayRedrawRef.current?.();
                }}
                onOpenSettings={() => setDrawingSettingsOpen(true)}
                onDelete={() => {
                  drawingEngineRef.current!.remove(sel.id);
                  setSelectedDrawingId(null);
                  setDrawingSettingsOpen(false);
                  syncHistoryMeta();
                  setDrawingVersion((v) => v + 1);
                  requestOverlayRedrawRef.current?.();
                }}
              />
            );
          })()}

        <div ref={hostRef} className="h-full w-full" />

        <div
          ref={pointerSurfaceRef}
          aria-label="Chart interactive drawing surface"
          className={
            activeTool === "cursor"
              ? "pointer-events-none absolute inset-0 z-15 h-full w-full"
              : "pointer-events-auto absolute inset-0 z-15 h-full w-full cursor-crosshair"
          }
        />

        {/* Bottom-Right Price Scale Context Menu */}
        <div className="absolute bottom-1.5 right-1.5 z-30">
          {scaleMenuOpen && (
            <div
              role="menu"
              aria-label="Price scale and chart overlay options"
              className="mb-1.5 w-56 rounded-lg border border-[#2c3140] bg-[#14171f] py-1.5 text-[12px] text-[#d6dae6] shadow-2xl"
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={autoScale}
                onClick={() => setAutoScale(!autoScale)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 text-sky-400">{autoScale ? "✓" : ""}</span>
                  Auto (fits data to screen)
                </span>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={invertScale}
                onClick={() => setInvertScale((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 text-sky-400">{invertScale ? "✓" : ""}</span>
                  Invert scale
                </span>
                <span className="font-mono text-[10px] text-[#6f7687]">⌥I</span>
              </button>

              <div className="my-1 h-px bg-[#232733]" />

              {[
                { mode: PriceScaleMode.Normal, label: "Regular", hint: "" },
                { mode: PriceScaleMode.Percentage, label: "Percent", hint: "⌥P" },
                { mode: PriceScaleMode.IndexedTo100, label: "Indexed to 100", hint: "" },
                { mode: PriceScaleMode.Logarithmic, label: "Logarithmic", hint: "⌥L" },
              ].map((row) => {
                const checked =
                  row.mode === PriceScaleMode.Logarithmic
                    ? effectiveLogScale
                    : !effectiveLogScale && priceScaleMode === row.mode;
                return (
                  <button
                    key={row.label}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    onClick={() => selectScaleMode(row.mode)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[#222633]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-3 text-sky-400">{checked ? "✓" : ""}</span>
                      {row.label}
                    </span>
                    {row.hint && (
                      <span className="font-mono text-[10px] text-[#6f7687]">{row.hint}</span>
                    )}
                  </button>
                );
              })}

              <div className="my-1 h-px bg-[#232733]" />

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showVolume}
                onClick={() => setShowVolume((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-sky-400">{showVolume ? "✓" : ""}</span>
                Volume Histogram
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visibility.footprint}
                onClick={() => handleToggleVisibility("footprint")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-emerald-400">{visibility.footprint ? "✓" : ""}</span>
                Footprint Bid/Ask Cells
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visibility.vrvp}
                onClick={() => handleToggleVisibility("vrvp")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-sky-400">{visibility.vrvp ? "✓" : ""}</span>
                Volume Profile (VRVP)
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={visibility.tpo}
                onClick={() => handleToggleVisibility("tpo")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#222633]"
              >
                <span className="w-3 text-amber-400">{visibility.tpo ? "✓" : ""}</span>
                TPO Market Profile (128)
              </button>
              {onOpenSettings && (
                <>
                  <div className="my-1 h-px bg-[#232733]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setScaleMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#d6dae6] hover:bg-[#222633] hover:text-white"
                  >
                    <span className="w-3 text-[#8c92a4]">⚙</span>
                    More settings...
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-1.5">
            {effectiveSettings.scales.countdownToBarClose && countdownText && (
              <span
                title="Countdown to bar close"
                className="rounded border border-[#2a2f3d] bg-[#14171f]/90 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#a5abb8]"
              >
                {countdownText}
              </span>
            )}
            <button
              type="button"
              aria-label="Price scale settings menu"
              aria-expanded={scaleMenuOpen}
              title="Price scale & overlay options"
              onClick={() => setScaleMenuOpen((o) => !o)}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#2a2f3d] bg-[#14171f]/90 text-[#9aa1b2] hover:bg-[#222633] hover:text-white"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <circle cx="8" cy="8" r="2.2" />
                <path
                  d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Optional OHLC Table View Overlay */}
        {tableViewOpen && (
          <div className="absolute bottom-10 left-3 z-30 w-[420px] max-w-[90%] rounded-lg border border-[#2c3140] bg-[#14171f]/95 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-[#252936] px-3 py-1.5">
              <span className="font-mono text-[11px] font-semibold text-[#e6e8ee]">
                {symbol} · {timeframe} Table View (Latest 10 Bars)
              </span>
              <button
                type="button"
                aria-label="Close table view"
                onClick={() => setTableViewOpen(false)}
                className="text-xs text-[#8d94a5] hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="max-h-52 overflow-auto">
              <table className="w-full font-mono text-[11px] tabular-nums">
                <thead className="sticky top-0 bg-[#14171f] text-[10px] uppercase text-[#787f91]">
                  <tr>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-right">Open</th>
                    <th className="px-2 py-1 text-right">High</th>
                    <th className="px-2 py-1 text-right">Low</th>
                    <th className="px-2 py-1 text-right">Close</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f232e] text-[#c8cdd8]">
                  {latestCandlesRef.current
                    .slice(-10)
                    .reverse()
                    .map((bar) => (
                      <tr key={String(bar.time)} className="hover:bg-[#1c202c]">
                        <td className="px-2 py-1 text-left text-[#9aa1b2]">
                          {formatChartTimestamp(bar.time, effectiveSettings)}
                        </td>
                        <td className="px-2 py-1 text-right">{formatPriceValue(bar.open)}</td>
                        <td className="px-2 py-1 text-right">{formatPriceValue(bar.high)}</td>
                        <td className="px-2 py-1 text-right">{formatPriceValue(bar.low)}</td>
                        <td className="px-2 py-1 text-right font-semibold text-white">
                          {formatPriceValue(bar.close)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Auto-Hiding Chart Notification Toast */}
        {toastMsg && (
          <div
            role="status"
            className="absolute bottom-9 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#2f3545] bg-[#14171f]/95 px-3 py-1.5 text-[12px] text-[#e6e8ee] shadow-2xl"
          >
            <span>{toastMsg}</span>
            {!effectiveSettings.alerts.autoHideToasts && (
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToastMsg(null)}
                className="text-[#8a90a2] hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Right-Click Chart Context Menu */}
        {contextMenu && (
          <ChartContextMenu
            menu={contextMenu}
            symbol={symbol}
            studiesCount={studyOverlays.length}
            lockCursorByTime={lockCursorByTime}
            tableViewOpen={tableViewOpen}
            templates={chartTemplates}
            onClose={() => setContextMenu(null)}
            onResetView={handleResetView}
            onCopyPrice={(priceText) => {
              if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(priceText).catch(() => {});
              }
              showToast(`Copied price ${priceText}`);
            }}
            onPaste={() => {
              showToast("Paste ready on chart canvas");
            }}
            onAddAlert={(price) => {
              setAlerts((prev) => [
                ...prev,
                { id: `al-${Date.now()}`, symbol, price },
              ]);
              showToast(`Alert added on ${symbol} at ${formatPriceValue(price)}`);
            }}
            onSellLimit={(price) => {
              onSubmitOrderAtPrice?.("sell", "limit", price);
              showToast(`Sell 1 ${symbol} @ ${formatPriceValue(price)} limit submitted`);
            }}
            onBuyStop={(price) => {
              onSubmitOrderAtPrice?.("buy", "limit", price);
              showToast(`Buy 1 ${symbol} @ ${formatPriceValue(price)} stop submitted`);
            }}
            onAddOrder={() => {
              onOpenOrderTicket?.();
            }}
            onToggleLockCursor={() => {
              setLockCursorByTime((v) => {
                const next = !v;
                showToast(
                  next
                    ? "Vertical cursor line locked by time"
                    : "Vertical cursor line unlocked",
                );
                return next;
              });
            }}
            onToggleTableView={() => setTableViewOpen((v) => !v)}
            onOpenObjectTree={() => {
              onOpenObjectTree?.();
            }}
            onApplyTemplate={(tpl) => {
              onApplyChartTemplate?.(tpl);
              showToast(`Applied chart template "${tpl.name}"`);
            }}
            onApplyDefaults={() => {
              onApplyChartDefaults?.();
              showToast("Applied default chart settings");
            }}
            onRemoveIndicators={() => {
              onClearAllStudies?.();
              showToast("Removed chart indicators");
            }}
            onOpenSettings={() => {
              onOpenSettings?.();
            }}
          />
        )}

        <DrawingSettingsDialog
          open={drawingSettingsOpen}
          drawing={selectedDrawingId ? drawingEngineRef.current!.getById(selectedDrawingId) : null}
          tickSizeE9={tickSizeE9}
          decimals={symMeta.decimals}
          onOpenChange={setDrawingSettingsOpen}
          onSave={(id, patch) => {
            drawingEngineRef.current!.update(id, patch);
            syncHistoryMeta();
            setDrawingVersion((v) => v + 1);
            requestOverlayRedrawRef.current?.();
          }}
        />

        <VolumeProfileSettingsDialog
          open={vpSettingsOpen}
          title="Session Volume Profile (VRVP)"
          config={sessionVpConfig}
          onOpenChange={setVpSettingsOpen}
          onSave={(nextCfg) => {
            setSessionVpConfig(nextCfg);
            requestOverlayRedrawRef.current?.();
          }}
        />
      </div>
    </div>
  );
}
