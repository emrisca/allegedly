import { calculateVwap, type VwapSettings } from "../indicators/vwap-settings";
import {
  createDefaultAlertDraft,
  formatAlertConditionSummary,
  getAlertPrimaryPrice,
  type ChartAlert,
} from "../alerts/alert-engine";
import type {
  DataWindowIndicatorValue,
  DataWindowSnapshot,
} from "../components/object-tree-panel";
import { DEFAULT_VOLUME } from "../indicators/volume-settings";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  MismatchDirection,
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
  type Logical,
  type PrimitivePaneViewZOrder,
  type SeriesAttachedParameter,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  DEFAULT_CHART_SETTINGS,
  SettingsCogIcon,
  UiButton,
  DEFAULT_CHART_TEMPLATES,
  type ChartBarType,
  type ChartSettings,
  type ChartSettingsTemplate,
} from "@allegedly/ui-chrome";
import {
  buildVolumeWeightedCandles,
  transformHeikinAshi,
  transformHighLow,
  transformKagi,
  transformLineBreak,
  transformPointAndFigure,
  transformRangeBars,
  transformRenko,
  type PointAndFigureColumn,
} from "../data/chart-types";
import { Button } from "@ui-sdk/react/button";
import { Toggle } from "@ui-sdk/react/toggle";
import { Toolbar } from "@ui-sdk/react/toolbar";
import {
  decodeLiveTradeBatch,
  decodeFrameHeader,
  decodeLiveBarUpdateBatch,
  decodeVolumeProfile,
  fetchHistoricalOhlc,
  alignTimeSecToTimeframe,
  timeframeBucketCloseSec,
  timeframeToSeconds,
  FrameType,

  type MarketDataSourceId,
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
  resizeRectangle,
  type RectangleHandle,
  snapPriceToCandleZone,
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
  cloneAvpConfig,
  cloneVpConfig,
  computeFixedRangeVolumeProfile,
  loadStoredVpDefaults,
  type VolumeProfileConfig,
  type VpCandleInput,
} from "../drawings/volume-profile";
import { DrawingToolIcon } from "../components/drawing-tool-icons";
import {
  TradingSessionsSettingsDialog,
  VwapKeyLevelsSettingsDialog,
} from "../components/custom-indicator-settings-dialogs";
import {
  drawVwapKeyLevelsOverlay,
  loadStoredVwapKeyLevelsConfig,
  saveStoredVwapKeyLevelsConfig,
  type VwapKeyLevelsConfig,
} from "../indicators/vwap-key-levels";
import {
  drawTradingSessionsOverlay,
  loadStoredTradingSessionsConfig,
  saveStoredTradingSessionsConfig,
  type TradingSessionsConfig,
} from "../indicators/trading-sessions";
import {
  DrawingQuickStyleBar,
  DrawingSettingsDialog,
  VolumeProfileSettingsDialog,
} from "../components/drawing-settings-dialog";
import {
  DEFAULT_TIMEFRAME_VISIBILITY,
  IndicatorSettingsDialog,
  type IndicatorConfig,
  type IndicatorPriceSource,
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
import { drawSessionTpo, hitTestTpoProfile, SessionTpo } from "../render/session-tpo";
import { loadTpoMerges, loadTpoSettings, saveTpoPreference, type TpoSettings } from "../render/tpo-settings";
import { TpoSettingsDialog } from "../components/tpo-settings-dialog";
import { TradeFootprints } from "../render/trade-footprints";
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
  vwap?: VwapSettings;
  source?: IndicatorPriceSource;
  precision?: number;
  showStatusValue?: boolean;
  showStatusInputs?: boolean;
  values: Array<number | null>;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: IndicatorLineStyle;
  opacity?: number;
  showPriceLabel?: boolean;
  showPriceLine?: boolean;
  visibility?: TimeframeVisibility;
}

interface VwapFill {
  color: string;
  opacity: number;
  points: Array<{ time: number; lower: number; upper: number; anchor: number } | null>;
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
  addAlert?: (explicitPrice?: number) => void;
  takeSnapshot?: () => void;
  resetZoom?: () => void;
  getCurrentPrice?: () => number | undefined;
  showToast?: (msg: string) => void;
  selectDrawing?: (id: string | null) => void;
  updateDrawing?: (id: string, patch: Partial<DrawingObject>) => void;
  deleteDrawing?: (id: string) => void;
  openDrawingSettings?: (id: string) => void;
  reorderDrawing?: (id: string, targetId: string) => void;
  toggleStudyHidden?: (id: string) => void;
  toggleOrderflowHidden?: (key: keyof OverlayVisibility) => void;
  openOrderflowSettings?: (key: keyof OverlayVisibility) => void;
  toggleVolumeHidden?: () => void;
  openVolumeSettings?: () => void;
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
  barType?: ChartBarType;
  autoScale?: boolean;
  onAutoScaleChange?: (auto: boolean) => void;
  logScale?: boolean;
  onLogScaleChange?: (log: boolean) => void;
  rangePreset?: "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";
  historyActionsRef?: { current: ChartHistoryActions | null };
  onHistoryMetaChange?: (meta: { canUndo: boolean; canRedo: boolean; count: number }) => void;
  onRemoveStudy?: (id: string) => void;
  onOpenStudySettings?: (id: string) => void;
  onLivePriceSample?: (symbol: string, last: number, previousClose?: number | null) => void;
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
  alerts?: readonly ChartAlert[];
  onRequestCreateAlert?: (price?: number) => void;
  onEditAlert?: (alert: ChartAlert) => void;
  onDeleteAlert?: (alertId: string) => void;
  onMoveAlert?: (alertId: string, price: number) => void;
  onAlertsCountChange?: (count: number) => void;
  onDrawingsSnapshotChange?: (drawings: readonly DrawingObject[], selectedId: string | null) => void;
  onIndicatorHiddenStateChange?: (state: {
    hiddenStudyIds: ReadonlySet<string>;
    hiddenOrderflowLayers: ReadonlySet<keyof OverlayVisibility>;
    volumeHidden: boolean;
  }) => void;
  dataWindowActive?: boolean;
  onDataWindowSnapshot?: (snap: DataWindowSnapshot) => void;
  /** Controlled orderflow & volume layer visibility synced with Indicators modal */
  overlayVisibility?: OverlayVisibility;
  onToggleOverlayVisibility?: (key: keyof OverlayVisibility) => void;
  showVolume?: boolean;
  onShowVolumeChange?: (next: boolean) => void;
  /** Render legacy inline toolbar when used standalone */
  /** Active market data source (`paper_sim` stays 100% offline per SV-01) */
  dataSource?: MarketDataSourceId;
  marketStreamReady?: boolean;
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
  onOpenVolumeSettings?: () => void;
  volumeLabel?: string;
  volumeValues?: boolean;
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
  onOpenVolumeSettings,
  volumeLabel = "Vol",
  volumeValues = true,
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
      className="pointer-events-none mt-1 flex flex-col items-start gap-0.5 text-[12px]"
    >
      {expanded && (
        <div className="flex flex-col items-start gap-0.5">
          {showVolumeRow && (
            <div onDoubleClick={onOpenVolumeSettings} className="pointer-events-auto group/ind flex items-center gap-2 rounded px-1 py-0.5 leading-tight transition-colors hover:bg-[#1a1d26]/85">
              <span className={volumeHidden ? "text-[#6d7384]" : "text-[#d4d8e2]"}>{volumeLabel}</span>
              {!volumeHidden && volumeValues && (
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
                {onOpenVolumeSettings && <button type="button" aria-label="Settings for Volume" onClick={onOpenVolumeSettings}
                  className="rounded p-0.5 text-[#868c9b] opacity-0 hover:text-white group-hover/ind:opacity-100 focus-visible:opacity-100">
                  <SettingsCogIcon />
                </button>}
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
            const titleText = indicatorInputs && st.showStatusInputs !== false
              ? st.label
              : st.label.replace(/\s*\([^)]*\)/g, "");
            return (
              <div
                key={st.id}
                onDoubleClick={() => onOpenStudySettings?.(st.id)}
                className="pointer-events-auto group/ind flex items-center gap-2 rounded px-1 py-0.5 leading-tight transition-colors hover:bg-[#1a1d26]/85"
              >
                <span className={hidden ? "text-[#6d7384]" : "text-[#d4d8e2]"}>
                  {titleText}
                </span>
                {!hidden && indicatorValues && st.showStatusValue !== false && lastVal !== undefined && (
                  <span
                    ref={(el) => {
                      if (!studyValRefs) return;
                      if (el) studyValRefs.current.set(st.id, el);
                      else studyValRefs.current.delete(st.id);
                    }}
                    style={{ color: st.color }}
                    className="font-mono text-[12px] tabular-nums"
                  >
                    {st.precision === undefined ? formatPriceValue(lastVal) : lastVal.toFixed(st.precision)}
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
                      <SettingsCogIcon className="h-3.5 w-3.5" />
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
            const hasSettings = Boolean(onOpenOrderflowSettings && (layer.key === "tpo" || layer.key === "vrvp" || layer.key === "vwapKeyLevels" || layer.key === "tradingSessions"));
            return (
              <div
                key={layer.key}
                onDoubleClick={() => {
                  if (hasSettings) onOpenOrderflowSettings?.(layer.key);
                }}
                className="pointer-events-auto group/ind flex items-center gap-2 rounded px-1 py-0.5 leading-tight transition-colors hover:bg-[#1a1d26]/85"
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
                      <SettingsCogIcon className="h-3.5 w-3.5" />
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
        className="pointer-events-auto mt-0.5 inline-flex h-5 items-center gap-1 rounded border border-[#2c3140] bg-[#16181f]/90 px-1.5 text-[10px] text-[#9aa1b2] hover:bg-[#232733] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
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

function hashSymbolSeed(symbol: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < symbol.length; i++) {
    h = (Math.imul(h, 31) + symbol.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Deterministic multi-scale continuous price path for Paper/Sim mode.
 * Evaluating the exact same function at any timestamp `tSec` guarantees that
 * switching between 1m, 5m, 15m, 1h, 4h, D, W, M shows true open-to-close
 * timeframe aggregation of the exact same underlying market history.
 */
function simHashNoise(seed: number, idx: number): number {
  let x = (seed ^ Math.imul(idx | 0, 0x27d4eb2d)) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

/**
 * Smooth non-repeating 1D value-noise octave with hashed integer knots.
 * Never repeats periodically regardless of zoom level or history span.
 */
function simValueNoise1D(seed: number, coord: number): number {
  const i0 = Math.floor(coord);
  const f = coord - i0;
  // Quintic smoothstep for C2 continuity without periodic ringing
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const v0 = simHashNoise(seed, i0) * 2 - 1;
  const v1 = simHashNoise(seed, i0 + 1) * 2 - 1;
  return v0 + (v1 - v0) * u;
}

/**
 * Non-repeating multi-scale 1D Fractal Brownian Motion (fBm) log-price path.
 * Evaluates in O(1) at any Unix timestamp `tSec` across 10 independent dyadic
 * time scales (from 2 minutes up to ~8 years), guaranteeing:
 *  - Organic, non-repeating bull/bear trends, ranges, breakouts, and pullbacks
 *  - Exact multi-timeframe consistency across 1m, 5m, 15m, 1h, 4h, D, W, M
 *  - Seamless infinite left scroll-back
 */
function simRawSignal(seed: number, tSec: number): number {
  // Dyadic scales (seconds) with realistic Hurst-like amplitude falloff (H ~ 0.58)
  const octaves: readonly [number, number][] = [
    [250_000_000, 0.55], // ~8 yr macro cycle
    [62_000_000, 0.34],  // ~2 yr trend regime
    [15_552_000, 0.21],  // ~6 mo swing
    [3_888_000, 0.125],  // ~45 d leg
    [972_000, 0.072],    // ~11 d swing
    [243_000, 0.041],    // ~2.8 d move
    [60_750, 0.023],     // ~17 h session
    [15_180, 0.013],     // ~4.2 h intraday
    [3_600, 0.0072],     // 1 h wave
    [900, 0.0040],       // 15 m structure
    [180, 0.0021],       // 3 m micro
  ];
  let acc = 0;
  for (let i = 0; i < octaves.length; i++) {
    const [periodSec, amp] = octaves[i];
    const octSeed = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
    acc += simValueNoise1D(octSeed, tSec / periodSec) * amp;
  }
  return acc;
}

function buildSimCandleWindow(
  symbol: string,
  timeframe: string,
  bucketOpens: number[],
  nowSec: number,
): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
  buyVolumes: number[];
  sellVolumes: number[];
} {
  const meta = getSymbolMeta(symbol);
  const base = meta.basePrice;
  const seed = hashSymbolSeed(symbol);
  const anchorSignal = simRawSignal(seed, nowSec);
  const priceAt = (tSec: number) =>
    Math.max(base * 0.08, base * Math.exp(simRawSignal(seed, tSec) - anchorSignal));

  const barSec = Math.max(60, timeframeToSeconds(timeframe));
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];
  const buyVolumes: number[] = [];
  const sellVolumes: number[] = [];

  for (const openSec of bucketOpens) {
    const rawCloseSec = timeframeBucketCloseSec(openSec, timeframe);
    const effectiveEndSec = Math.min(rawCloseSec, nowSec);
    const span = Math.max(1, effectiveEndSec - openSec);
    // Sample sub-intervals inside [openSec, effectiveEndSec] so each candle's OHLC
    // genuinely reflects the price path over its exact live duration.
    const samples = Math.min(16, Math.max(4, Math.round(Math.log2(barSec / 60 + 2) * 3)));
    const open = priceAt(openSec);
    const close = priceAt(effectiveEndSec);
    let high = Math.max(open, close);
    let low = Math.min(open, close);
    for (let k = 1; k < samples; k++) {
      const p = priceAt(openSec + (span * k) / samples);
      if (p > high) high = p;
      if (p < low) low = p;
    }

    // Add realistic proportional intra-bar wick energy scaled by sqrt(elapsedMinutes)
    const elapsedMin = Math.max(0.25, span / 60);
    const wickScale = base * 0.00055 * Math.sqrt(elapsedMin);
    const n1 = simHashNoise(seed, Math.floor(openSec / 60));
    const n2 = simHashNoise(seed ^ 0x517cc1b7, Math.floor(openSec / 60));
    high += (0.12 + n1 * 0.65) * wickScale;
    low = Math.max(base * 0.1, low - (0.12 + n2 * 0.65) * wickScale);

    // Volume scales linearly with candle duration (15m ~= 15x a 1m bar's volume)
    const volNoise = 0.55 + simHashNoise(seed ^ 0x9e3779b9, Math.floor(openSec / 60)) * 1.15;
    const vol = Math.max(1, Math.round(elapsedMin * 42 * volNoise));
    const buyShare = close >= open ? 0.55 + n1 * 0.14 : 0.31 + n2 * 0.14;
    const buyVol = vol * buyShare;
    const sellVol = Math.max(0, vol - buyVol);

    const t = openSec as UTCTimestamp;
    candles.push({ time: t, open, high, low, close });
    volumes.push({
      time: t,
      value: vol,
      color: close >= open ? "rgba(130, 142, 165, 0.22)" : "rgba(95, 103, 122, 0.18)",
    });
    buyVolumes.push(buyVol);
    sellVolumes.push(sellVol);
  }

  return { candles, volumes, buyVolumes, sellVolumes };
}

function stepBucketOpenBack(openSec: number, tf: string): number {
  if (tf === "M" || tf === "1M") {
    const d = new Date(openSec * 1000);
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) / 1000);
  }
  return openSec - Math.max(60, timeframeToSeconds(tf));
}

function seedInitialCandles(
  symbol: string,
  timeframe = "D",
  count = 1500,
): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
  buyVolumes: number[];
  sellVolumes: number[];
} {
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBucket = alignTimeSecToTimeframe(nowSec, timeframe);
  const opens: number[] = new Array(count);
  let cur = currentBucket;
  for (let i = count - 1; i >= 0; i--) {
    opens[i] = cur;
    cur = stepBucketOpenBack(cur, timeframe);
  }
  return buildSimCandleWindow(symbol, timeframe, opens, nowSec);
}

function generateOlderSimCandles(
  symbol: string,
  timeframe: string,
  oldestBar: CandlestickData<UTCTimestamp>,
  count = 500,
): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
  buyVolumes: number[];
  sellVolumes: number[];
} {
  const nowSec = Math.floor(Date.now() / 1000);
  const opens: number[] = new Array(count);
  let cur = stepBucketOpenBack(Number(oldestBar.time), timeframe);
  for (let i = count - 1; i >= 0; i--) {
    opens[i] = cur;
    cur = stepBucketOpenBack(cur, timeframe);
  }
  return buildSimCandleWindow(symbol, timeframe, opens, nowSec);
}

/**
 * Genuine Lightweight Charts v5 ISeriesPrimitive (ADR-0004 / S01).
 * Executes orderflow (WebGL2 offscreen instanced pass composited synchronously) and
 * vector drawings INSIDE Lightweight Charts' own pane render callback, guaranteeing
 * 0.000 CSS px coordinate drift during pan, zoom, and resize.
 */
function inferBarStepSec(
  candles: readonly CandlestickData<UTCTimestamp>[],
  fallbackBarStepSec: number,
): number {
  const n = candles.length;
  if (n >= 2) {
    const dt = Number(candles[n - 1].time) - Number(candles[n - 2].time);
    if (Number.isFinite(dt) && dt > 0) return dt;
  }
  return Math.max(1, fallbackBarStepSec);
}

/**
 * Converts a timestamp (including future timestamps past the last bar, historical
 * timestamps before the first bar, or timestamps between bars across timeframes)
 * to a chart X pixel coordinate via Lightweight Charts logical indices.
 */
function timeSecToCoordinateExt(
  chart: IChartApi,
  candles: readonly CandlestickData<UTCTimestamp>[],
  timeSec: number,
  fallbackBarStepSec: number,
): number | null {
  const direct = chart.timeScale().timeToCoordinate(timeSec as UTCTimestamp);
  if (direct !== null) return Number(direct);

  const n = candles.length;
  if (n === 0) return null;
  const step = inferBarStepSec(candles, fallbackBarStepSec);
  const firstTime = Number(candles[0].time);
  const lastIdx = n - 1;
  const lastTime = Number(candles[lastIdx].time);

  let logical: number;
  if (timeSec >= lastTime) {
    logical = lastIdx + (timeSec - lastTime) / step;
  } else if (timeSec <= firstTime) {
    logical = (timeSec - firstTime) / step;
  } else {
    let lo = 0;
    let hi = lastIdx;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (Number(candles[mid].time) <= timeSec) lo = mid;
      else hi = mid;
    }
    const t0 = Number(candles[lo].time);
    const t1 = Number(candles[hi].time);
    const span = Math.max(1, t1 - t0);
    logical = lo + (timeSec - t0) / span;
  }

  const coord = chart.timeScale().logicalToCoordinate(logical as Logical);
  return coord === null ? null : Number(coord);
}

/**
 * Converts any chart X pixel coordinate — including future whitespace past the last bar
 * or historical space before the first bar — into a Unix timestamp in seconds.
 */
function coordinateToTimeSecExt(
  chart: IChartApi,
  candles: readonly CandlestickData<UTCTimestamp>[],
  x: number,
  fallbackBarStepSec: number,
  fallbackTimeSec: number,
): number {
  const rawTime = chart.timeScale().coordinateToTime(x);
  if (typeof rawTime === "number" && Number.isFinite(rawTime)) {
    return rawTime;
  }

  const n = candles.length;
  const logical = chart.timeScale().coordinateToLogical(x);
  if (n === 0 || logical === null || !Number.isFinite(logical)) {
    return fallbackTimeSec;
  }

  const step = inferBarStepSec(candles, fallbackBarStepSec);
  const firstTime = Number(candles[0].time);
  const lastIdx = n - 1;
  const lastTime = Number(candles[lastIdx].time);

  if (logical > lastIdx) {
    return Math.round(lastTime + (logical - lastIdx) * step);
  }
  if (logical < 0) {
    return Math.round(firstTime + logical * step);
  }

  const idx = Math.min(lastIdx, Math.max(0, Math.floor(logical)));
  const frac = logical - idx;
  const t0 = Number(candles[idx].time);
  const t1 = idx < lastIdx ? Number(candles[idx + 1].time) : t0 + step;
  return Math.round(t0 + frac * (t1 - t0));
}

interface PrimitiveDrawContext {
  getOverlayData: () => OverlayRenderData;
  getTpo: () => SessionTpo;
  getVwapFills: () => VwapFill[];
  getTpoSettings: () => { settings: TpoSettings; merges: number[] };
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
  getVwapKeyLevelsConfig: () => VwapKeyLevelsConfig;
  getTradingSessionsConfig: () => TradingSessionsConfig;
  getBarType: () => ChartBarType;
  getPnfColumns: () => readonly PointAndFigureColumn[];
  getBarStepSec: () => number;
  getCountdownText: () => string;
  getPriceScaleBadgeMeta: () => {
    showIntegratedCountdown: boolean;
    upColor: string;
    downColor: string;
  };
  getDrawingCrosshair: () => {
    x: number;
    y: number;
    color: string;
    labelBg: string;
  } | null;
}

class OrderflowAndDrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdateCb: (() => void) | null = null;
  private readonly paneView: IPrimitivePaneView;
  private readonly priceAxisPaneView: IPrimitivePaneView;
  private readonly vpLabelCache = new Map<string, { vah: number; val: number; poc: number } | null>();

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
          timeToX: (timeSec: number): number | null =>
            timeSecToCoordinateExt(
              chart,
              this.source.getCandles(),
              timeSec,
              this.source.getBarStepSec(),
            ),
          barSpacing: chart.timeScale().options().barSpacing,
          visibleTimeRange: chart.timeScale().getVisibleRange(),
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
          const activeBarType = this.source.getBarType();

          // 0. Special Bar Type visual layers (HLC Area ribbon, Point & Figure X/O columns)
          if (activeBarType === "hlc_area" && candles.length >= 2) {
            context.save();
            const upperPts: Array<{ x: number; y: number }> = [];
            const lowerPts: Array<{ x: number; y: number }> = [];
            for (const c of candles) {
              const x = bridge.timeToX(Number(c.time));
              const hy = bridge.priceToY(c.high);
              const ly = bridge.priceToY(c.low);
              if (x === null || hy === null || ly === null) continue;
              upperPts.push({ x, y: hy });
              lowerPts.push({ x, y: ly });
            }
            if (upperPts.length >= 2) {
              context.beginPath();
              context.moveTo(upperPts[0].x, upperPts[0].y);
              for (let i = 1; i < upperPts.length; i++) context.lineTo(upperPts[i].x, upperPts[i].y);
              for (let i = lowerPts.length - 1; i >= 0; i--) context.lineTo(lowerPts[i].x, lowerPts[i].y);
              context.closePath();
              context.fillStyle = "rgba(41, 98, 255, 0.16)";
              context.fill();

              context.strokeStyle = "rgba(8, 153, 129, 0.65)";
              context.lineWidth = 1;
              context.beginPath();
              context.moveTo(upperPts[0].x, upperPts[0].y);
              for (let i = 1; i < upperPts.length; i++) context.lineTo(upperPts[i].x, upperPts[i].y);
              context.stroke();

              context.strokeStyle = "rgba(242, 54, 69, 0.65)";
              context.beginPath();
              context.moveTo(lowerPts[0].x, lowerPts[0].y);
              for (let i = 1; i < lowerPts.length; i++) context.lineTo(lowerPts[i].x, lowerPts[i].y);
              context.stroke();
            }
            context.restore();
          } else if (activeBarType === "point_and_figure") {
            const cols = this.source.getPnfColumns();
            if (cols.length > 0) {
              context.save();
              context.lineWidth = 1.4;
              for (const col of cols) {
                const x = bridge.timeToX(Number(col.time));
                if (x === null || x < -20 || x > w + 20) continue;
                const lo = Math.min(col.open, col.close);
                const hi = Math.max(col.open, col.close);
                const step = Math.max(1e-6, col.boxSize);
                const count = Math.min(48, Math.max(1, Math.round((hi - lo) / step)));
                context.strokeStyle = col.isX ? "#089981" : "#f23645";
                for (let k = 0; k <= count; k++) {
                  const p = lo + k * step;
                  const y = bridge.priceToY(p);
                  if (y === null || y < -12 || y > h + 12) continue;
                  const r = 3.5;
                  if (col.isX) {
                    context.beginPath();
                    context.moveTo(x - r, y - r);
                    context.lineTo(x + r, y + r);
                    context.moveTo(x + r, y - r);
                    context.lineTo(x - r, y + r);
                    context.stroke();
                  } else {
                    context.beginPath();
                    context.arc(x, y, r, 0, Math.PI * 2);
                    context.stroke();
                  }
                }
              }
              context.restore();
            }
          }

          for (const fill of this.source.getVwapFills()) {
            context.save();
            context.fillStyle = fill.color;
            context.globalAlpha = fill.opacity;
            let previous: { x: number; high: number; low: number; anchor: number } | undefined;
            for (const point of fill.points) {
              const x = point ? bridge.timeToX(point.time) : null;
              const hi = point ? bridge.priceToY(point.upper) : null;
              const lo = point ? bridge.priceToY(point.lower) : null;
              if (!point || x === null || hi === null || lo === null) {
                previous = undefined;
                continue;
              }
              if (previous?.anchor === point.anchor && x >= 0 && previous.x <= w) {
                context.beginPath();
                context.moveTo(previous.x, previous.high);
                context.lineTo(x, hi);
                context.lineTo(x, lo);
                context.lineTo(previous.x, previous.low);
                context.fill();
              }
              previous = { x, high: hi, low: lo, anchor: point.anchor };
            }
            context.restore();
          }
          const range = bridge.visibleTimeRange;
          if (data.visibility.tpo && typeof range?.from === "number" && typeof range.to === "number") {
            const { settings, merges } = this.source.getTpoSettings();
            if (!settings.intradayOnly || timeframeToSeconds(this.source.getTimeframe()) < 86_400) {
              const profiles = this.source.getTpo().visible(range.from, range.to, merges, settings.valueArea, settings.blockMinutes);
              drawSessionTpo(context, profiles, bridge, data.tickSizeFloat, w, h, settings);
            }
          }
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

          if (data.visibility.tradingSessions && candles.length >= 2) {
            context.save();
            drawTradingSessionsOverlay(
              context,
              w,
              h,
              candles,
              bridge,
              this.source.getTradingSessionsConfig(),
              this.source.getTimeframe(),
            );
            context.restore();
          }

          if (data.visibility.vwapKeyLevels && candles.length >= 2) {
            context.save();
            drawVwapKeyLevelsOverlay(
              context,
              w,
              h,
              candles,
              volumes,
              bridge,
              this.source.getVwapKeyLevelsConfig(),
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
              if (d.hidden) continue;
              if (!isTimeframeVisible(currentTf, d.visibility, activeBarType)) continue;
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
                !locked && !d.locked && isSelected,
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
                { lineStyle: "dashed" },
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

          // Living NESW dotted crosshair lines while a drawing tool (or Shift measure) is active
          const drawingCrosshair = this.source.getDrawingCrosshair();
          if (drawingCrosshair) {
            context.save();
            context.strokeStyle = drawingCrosshair.color;
            context.lineWidth = 1;
            context.setLineDash([4, 4]);
            const cx = Math.round(drawingCrosshair.x) + 0.5;
            const cy = Math.round(drawingCrosshair.y) + 0.5;
            context.beginPath();
            if (cx >= 0 && cx <= w) {
              context.moveTo(cx, 0);
              context.lineTo(cx, h);
            }
            if (cy >= 0 && cy <= h) {
              context.moveTo(0, cy);
              context.lineTo(w, cy);
            }
            context.stroke();
            context.restore();
          }
          context.restore();
        });
      },
    };

    const hexLuminance = (hex: string): number | null => {
      const cleaned = hex.replace("#", "").trim();
      if (cleaned.length !== 6) return null;
      const r = parseInt(cleaned.slice(0, 2), 16);
      const g = parseInt(cleaned.slice(2, 4), 16);
      const b = parseInt(cleaned.slice(4, 6), 16);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };

    const fillRightRoundedRect = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number,
    ) => {
      const r = Math.min(radius, height / 2, width / 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      ctx.fill();
    };

    const formatScalePrice = (price: number, digits: number): string =>
      price.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

    const priceAxisRenderer: IPrimitivePaneRenderer = {
      draw: (target) => {
        const series = this.series;
        if (!series) return;

        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const pw = mediaSize.width;
          const ph = mediaSize.height;
          if (pw <= 0 || ph <= 0) return;

          const candles = this.source.getCandles();
          const volumes = this.source.getVolumes();
          const digits = this.source.getPrecisionDigits();
          const tickFloat = this.source.getOverlayData().tickSizeFloat;
          const hidden = this.source.getDrawingsHidden();
          const currentTf = this.source.getTimeframe();
          const activeBarType = this.source.getBarType();

          context.save();

          // 1. AVP / FRVP VAH, VAL, POC labels on the right price scale
          if (!hidden && candles.length > 0 && tickFloat > 0) {
            const lastCandle = candles[candles.length - 1];
            const lastSec = Number(lastCandle.time);
            const activeKeys = new Set<string>();
            for (const d of this.source.getDrawings()) {
              if (d.hidden) continue;
              if (d.kind !== "anchored_vp" && d.kind !== "fixed_range_vp") continue;
              if (d.anchors.length < 1) continue;
              if (!isTimeframeVisible(currentTf, d.visibility, activeBarType)) continue;
              const vpCfg =
                d.kind === "anchored_vp"
                  ? cloneAvpConfig(d.vpConfig)
                  : cloneVpConfig(d.vpConfig);
              if (!vpCfg.showPriceScaleLabels) continue;

              const t1 = d.anchors[0].timeSec;
              const t2 = d.kind === "anchored_vp" ? lastSec : (d.anchors[1]?.timeSec ?? t1);
              const cacheKey = `${d.id}:${candles.length}:${lastSec}:${lastCandle.close}:${t1}:${t2}:${vpCfg.rowsLayout}:${vpCfg.rowSize}:${vpCfg.valueAreaPercent}`;
              activeKeys.add(cacheKey);
              let levels = this.vpLabelCache.get(cacheKey);
              if (levels === undefined) {
                const minSec = Math.min(t1, t2);
                const maxSec = Math.max(t1, t2);
                const subset: VpCandleInput[] = [];
                for (let i = 0; i < candles.length; i++) {
                  const c = candles[i];
                  const ct = Number(c.time);
                  if (ct >= minSec && ct <= maxSec) {
                    subset.push({
                      time: ct,
                      open: c.open,
                      high: c.high,
                      low: c.low,
                      close: c.close,
                      volume: volumes[i]?.value ?? 1,
                    });
                  }
                }
                const prof = computeFixedRangeVolumeProfile(subset, tickFloat, vpCfg);
                levels = prof
                  ? { vah: prof.vahPrice, val: prof.valPrice, poc: prof.pocPrice }
                  : null;
                this.vpLabelCache.set(cacheKey, levels);
              }
              if (!levels) continue;

              const badgeLevels: Array<{ price: number; bg: string }> = [];
              if (vpCfg.showVah) badgeLevels.push({ price: levels.vah, bg: vpCfg.vahColor });
              if (vpCfg.showVal) badgeLevels.push({ price: levels.val, bg: vpCfg.valColor });
              if (vpCfg.showPoc) badgeLevels.push({ price: levels.poc, bg: vpCfg.pocColor });

              const badgeW = Math.max(60, pw - 3);
              const badgeH = 19;
              context.font = '500 11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", sans-serif';
              context.textAlign = "left";
              context.textBaseline = "middle";
              for (const lvl of badgeLevels) {
                const coord = series.priceToCoordinate(lvl.price);
                if (coord === null) continue;
                const ly = Number(coord);
                if (ly < 8 || ly > ph - 8) continue;
                const lum = hexLuminance(lvl.bg);
                context.fillStyle = lvl.bg;
                fillRightRoundedRect(context, 0, ly - badgeH / 2, badgeW, badgeH, 2);
                context.fillStyle = lum !== null && lum > 0.62 ? "#131722" : "#ffffff";
                context.fillText(formatScalePrice(lvl.price, digits), 6, ly + 0.5);
              }
            }
            if (this.vpLabelCache.size > activeKeys.size + 16) {
              for (const k of this.vpLabelCache.keys()) {
                if (!activeKeys.has(k)) this.vpLabelCache.delete(k);
              }
            }
          }

          // 2. Integrated 2-line Price + Candle Countdown badge (TradingView style)
          const badgeMeta = this.source.getPriceScaleBadgeMeta();
          if (badgeMeta.showIntegratedCountdown && candles.length > 0) {
            const lastBar = candles[candles.length - 1];
            const rawY = series.priceToCoordinate(lastBar.close);
            if (rawY !== null) {
              const badgeH = 34;
              const halfH = badgeH / 2;
              const cy = Math.max(halfH + 1, Math.min(ph - halfH - 1, Number(rawY)));
              const badgeW = Math.max(68, pw - 3);

              const rawBg =
                lastBar.close > lastBar.open
                  ? badgeMeta.upColor
                  : lastBar.close < lastBar.open
                    ? badgeMeta.downColor
                    : "#787b86";
              const lum = hexLuminance(rawBg);
              const bg =
                !rawBg || rawBg === "transparent" || (lum !== null && lum > 0.52)
                  ? "#727683"
                  : rawBg;

              context.fillStyle = bg;
              fillRightRoundedRect(context, 0, cy - halfH, badgeW, badgeH, 3);

              context.textAlign = "left";
              context.textBaseline = "middle";
              context.fillStyle = "#ffffff";
              context.font = '600 12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", sans-serif';
              context.fillText(formatScalePrice(lastBar.close, digits), 6, cy - 6.5);

              const countdown = this.source.getCountdownText();
              if (countdown) {
                context.fillStyle = "rgba(255, 255, 255, 0.88)";
                context.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
                context.fillText(countdown, 6, cy + 8.5);
              }
            }
          }

          // 3. Living drawing-tool crosshair price label on right price scale
          const xhair = this.source.getDrawingCrosshair();
          if (xhair && xhair.y >= 0 && xhair.y <= ph) {
            const hoverPrice = series.coordinateToPrice(xhair.y);
            if (hoverPrice !== null && Number.isFinite(Number(hoverPrice))) {
              const badgeH = 20;
              const halfH = badgeH / 2;
              const cy = Math.max(halfH + 1, Math.min(ph - halfH - 1, xhair.y));
              const badgeW = Math.max(66, pw - 3);
              context.fillStyle = xhair.labelBg;
              fillRightRoundedRect(context, 0, cy - halfH, badgeW, badgeH, 3);
              context.textAlign = "left";
              context.textBaseline = "middle";
              context.fillStyle = "#ffffff";
              context.font = '500 11.5px -apple-system, BlinkMacSystemFont, "IBM Plex Sans", sans-serif';
              context.fillText(formatScalePrice(Number(hoverPrice), digits), 6, cy + 0.5);
            }
          }

          context.restore();
        });
      },
    };

    this.paneView = {
      zOrder: (): PrimitivePaneViewZOrder => "top",
      renderer: () => renderer,
    };

    this.priceAxisPaneView = {
      zOrder: (): PrimitivePaneViewZOrder => "top",
      renderer: () => priceAxisRenderer,
    };
  }

  public attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<SeriesType>;
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

  public priceAxisPaneViews(): readonly IPrimitivePaneView[] {
    return [this.priceAxisPaneView];
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
  barType = "candles",
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
  alerts: controlledAlerts,
  onRequestCreateAlert,
  onEditAlert,
  onDeleteAlert,
  onMoveAlert,
  onAlertsCountChange,
  onDrawingsSnapshotChange,
  onIndicatorHiddenStateChange,
  dataWindowActive = false,
  onDataWindowSnapshot,
  overlayVisibility: controlledOverlayVisibility,
  onToggleOverlayVisibility,
  showVolume: controlledShowVolume,
  onShowVolumeChange,
  dataSource = "paper_sim",
  marketStreamReady = true,
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
      const raw = window.localStorage.getItem("allegedly.floating_bar_pos.v2");
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
    vwapKeyLevels: false,
    tradingSessions: false,
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
  const [volumeSettingsOpen, setVolumeSettingsOpen] = useState(false);
  const [volumeConfig, setVolumeConfig] = useState<IndicatorConfig>(() => {
    const defaults: IndicatorConfig = { id: "volume", label: "Volume", period: 20, source: "close",
      color: "#2962ff", lineWidth: 2, lineStyle: "solid", opacity: 1, showPriceLabel: true,
      showPriceLine: false, visibility: DEFAULT_TIMEFRAME_VISIBILITY, volume: DEFAULT_VOLUME };
    try {
      const saved = JSON.parse(localStorage.getItem("allegedly.volume.settings") ?? "{}");
      return { ...defaults, ...saved, volume: {
        ...DEFAULT_VOLUME,
        upOpacity: saved.volume?.barOpacity ?? DEFAULT_VOLUME.upOpacity,
        downOpacity: saved.volume?.barOpacity ?? DEFAULT_VOLUME.downOpacity,
        ...saved.volume,
      } };
    } catch {
      return defaults;
    }
  });
  const volumeConfigRef = useRef(volumeConfig);
  volumeConfigRef.current = volumeConfig;
  const volumeRefreshRef = useRef<(() => void) | null>(null);
  const volumeActive = showVolume && !volumeHidden && isTimeframeVisible(timeframe, volumeConfig.visibility, barType);
  const volumeActiveRef = useRef(volumeActive);
  volumeActiveRef.current = volumeActive;

  const [hiddenOrderflowLayers, setHiddenOrderflowLayers] = useState<Set<keyof OverlayVisibility>>(
    () => new Set(),
  );
  const hiddenOrderflowRef = useRef<ReadonlySet<keyof OverlayVisibility>>(hiddenOrderflowLayers);
  hiddenOrderflowRef.current = hiddenOrderflowLayers;
  const [indicatorsLegendExpanded, setIndicatorsLegendExpanded] = useState<boolean>(true);
  const [contextMenu, setContextMenu] = useState<ChartContextMenuState | null>(null);
  const [lockCursorByTime, setLockCursorByTime] = useState<boolean>(false);
  const [tableViewOpen, setTableViewOpen] = useState<boolean>(false);
  const [localAlerts, setLocalAlerts] = useState<ChartAlert[]>([]);
  const alerts: readonly ChartAlert[] = controlledAlerts ?? localAlerts;
  const alertsRef = useRef<readonly ChartAlert[]>(alerts);
  alertsRef.current = alerts;
  const alertDragRef = useRef<{ id: string; startY: number; moved: boolean; price: number | null } | null>(null);
  const suppressAlertClickRef = useRef(false);
  const alertBadgeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const syncAlertBadgePositionsRef = useRef<() => void>(() => {});
  const dataWindowActiveRef = useRef<boolean>(dataWindowActive);
  dataWindowActiveRef.current = dataWindowActive;
  const onDataWindowSnapshotRef = useRef(onDataWindowSnapshot);
  onDataWindowSnapshotRef.current = onDataWindowSnapshot;
  const studyOverlaysRef = useRef(studyOverlays);
  studyOverlaysRef.current = studyOverlays;
  const hiddenStudyIdsRef = useRef<ReadonlySet<string>>(new Set());
  const emitDataWindowRef = useRef<() => void>(() => {});
  const onDrawingsSnapshotChangeRef = useRef(onDrawingsSnapshotChange);
  onDrawingsSnapshotChangeRef.current = onDrawingsSnapshotChange;
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const countdownTextRef = useRef<string>("");
  const [scaleMenuOpen, setScaleMenuOpen] = useState<boolean>(false);
  const [priceScaleMode, setPriceScaleMode] = useState<PriceScaleMode>(PriceScaleMode.Normal);
  const [invertScale, setInvertScale] = useState<boolean>(false);
  const [localAutoScale, setLocalAutoScale] = useState<boolean>(true);
  const [hiddenStudyIds, setHiddenStudyIds] = useState<Set<string>>(() => new Set());
  hiddenStudyIdsRef.current = hiddenStudyIds;

  const [localTool, setLocalTool] = useState<DrawingToolKind>("cursor");
  const [localMagnet, setLocalMagnet] = useState<boolean>(false);
  const [cmdHeld, setCmdHeld] = useState<boolean>(false);
  const [shiftHeld, setShiftHeld] = useState<boolean>(false);
  const [rulerActive, setRulerActive] = useState<boolean>(false);
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
    footprint: (visibility.footprint || barType === "volume_footprint") && !hiddenOrderflowLayers.has("footprint"),
    vrvp: visibility.vrvp && !hiddenOrderflowLayers.has("vrvp"),
    tpo: (visibility.tpo || barType === "tpo") && !hiddenOrderflowLayers.has("tpo"),
    marketStructure:
      Boolean(visibility.marketStructure) && !hiddenOrderflowLayers.has("marketStructure"),
    vwapKeyLevels:
      Boolean(visibility.vwapKeyLevels) && !hiddenOrderflowLayers.has("vwapKeyLevels"),
    tradingSessions:
      Boolean(visibility.tradingSessions) && !hiddenOrderflowLayers.has("tradingSessions"),
  };
  const visibilityRef = useRef<OverlayVisibility>(effectiveOverlayVisibility);
  visibilityRef.current = effectiveOverlayVisibility;

  const activeToolRef = useRef<DrawingToolKind>(activeTool);
  activeToolRef.current = activeTool;

  const baseMagnetRef = useRef<boolean>(magnetEnabled);
  baseMagnetRef.current = magnetEnabled;
  const effectiveMagnet = magnetEnabled !== cmdHeld;
  const magnetRef = useRef<boolean>(effectiveMagnet);
  magnetRef.current = effectiveMagnet;
  const cmdHeldRef = useRef<boolean>(cmdHeld);
  cmdHeldRef.current = cmdHeld;
  const shiftHeldRef = useRef<boolean>(shiftHeld);
  shiftHeldRef.current = shiftHeld;
  // Live Cmd/Ctrl (temporary magnet toggle) & Shift (quick measure + 0°/45°/90° angle snap) tracking
  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.key === "Meta" || e.key === "Control") {
        setCmdHeld(true);
      } else if (e.key === "Shift") {
        setShiftHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setCmdHeld(false);
      } else if (e.key === "Shift") {
        setShiftHeld(false);
      }
    };
    const onBlur = () => {
      setCmdHeld(false);
      setShiftHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Sync Lightweight Charts / drawing crosshair magnet snap live whenever magnet or Cmd/Ctrl state changes
  useEffect(() => {
    syncCrosshairMagnetRef.current?.();
  }, [effectiveMagnet]);

  useEffect(() => {
    requestOverlayRedrawRef.current?.();
  }, [activeTool]);


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

  const marketStreamReadyRef = useRef(marketStreamReady);
  marketStreamReadyRef.current = marketStreamReady;
  const onLivePriceSampleRef = useRef(onLivePriceSample);
  onLivePriceSampleRef.current = onLivePriceSample;

  const onSeriesUpdatedRef = useRef(onSeriesUpdated);
  onSeriesUpdatedRef.current = onSeriesUpdated;

  const [sessionVpConfig, setSessionVpConfig] = useState<VolumeProfileConfig>(() =>
    loadStoredVpDefaults(),
  );
  const [vpSettingsOpen, setVpSettingsOpen] = useState(false);
  const [vwapKeyLevelsConfig, setVwapKeyLevelsConfig] = useState<VwapKeyLevelsConfig>(
    loadStoredVwapKeyLevelsConfig,
  );
  const vwapKeyLevelsConfigRef = useRef<VwapKeyLevelsConfig>(vwapKeyLevelsConfig);
  vwapKeyLevelsConfigRef.current = vwapKeyLevelsConfig;
  const [vwapKeyLevelsSettingsOpen, setVwapKeyLevelsSettingsOpen] = useState(false);

  const [tradingSessionsConfig, setTradingSessionsConfig] = useState<TradingSessionsConfig>(
    loadStoredTradingSessionsConfig,
  );
  const tradingSessionsConfigRef = useRef<TradingSessionsConfig>(tradingSessionsConfig);
  tradingSessionsConfigRef.current = tradingSessionsConfig;
  const [tradingSessionsSettingsOpen, setTradingSessionsSettingsOpen] = useState(false);
  const [tpoSettings, setTpoSettings] = useState(loadTpoSettings);
  const [tpoSettingsOpen, setTpoSettingsOpen] = useState(false);
  const [tpoDays, setTpoDays] = useState<number[]>([]);
  const [tpoMergesBySymbol, setTpoMergesBySymbol] = useState<Record<string, number[]>>({});
  const tpoMerges = useMemo(() => tpoMergesBySymbol[symbol] ?? loadTpoMerges(symbol), [symbol, tpoMergesBySymbol]);
  const tpoOptionsRef = useRef({ settings: tpoSettings, merges: tpoMerges });
  tpoOptionsRef.current = { settings: tpoSettings, merges: tpoMerges };
  const tpoRef = useRef<SessionTpo | null>(null);

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
  const [drawingVersion, setDrawingVersion] = useState(0);
  const selectedDrawingIdRef = useRef<string | null>(null);
  selectedDrawingIdRef.current = selectedDrawingId;
  const requestOverlayRedrawRef = useRef<(() => void) | null>(null);
  const syncCrosshairMagnetRef = useRef<(() => void) | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const vwapBandSeriesRef = useRef(new Map<string, ISeriesApi<"Line">>());
  const vwapFillsRef = useRef<VwapFill[]>([]);
  const volumeHistoryRef = useRef<readonly HistogramData<UTCTimestamp>[]>([]);
  const studyLineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const studyPanesRef = useRef<Map<string, IPaneApi<Time>>>(new Map());
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const alertPriceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
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
    const list = engine.list(symbol);
    const nextMeta = {
      canUndo: engine.canUndo(),
      canRedo: engine.canRedo(),
      count: list.length,
    };
    setHistoryMeta(nextMeta);
    onHistoryMetaChange?.(nextMeta);
    onDrawingsSnapshotChangeRef.current?.([...list], selectedDrawingIdRef.current);
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
    setSelectedDrawingId(null);
    setDrawingSettingsOpen(false);
    syncHistoryMeta();
  };

  const handleAddAlert = (explicitPrice?: number) => {
    const fallback = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close;
    const price = explicitPrice ?? lastCrosshairPriceRef.current ?? fallback;
    if (onRequestCreateAlert) {
      onRequestCreateAlert(price !== undefined && Number.isFinite(price) ? price : undefined);
      return;
    }
    if (price !== undefined && Number.isFinite(price)) {
      const decimals = getSymbolMeta(symbol).decimals;
      setLocalAlerts((prev) => [
        ...prev,
        createDefaultAlertDraft({
          symbol,
          timeframe,
          price,
          decimals,
          color: effectiveSettings.alerts.alertLineColor,
        }),
      ]);
      showToast(`Alert added on ${symbol} at ${price.toFixed(decimals)}`);
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

  const openOrderflowSettingsByKey = (key: keyof OverlayVisibility) => {
    if (key === "tpo") {
      setTpoDays(tpoRef.current?.days() ?? []);
      setTpoSettingsOpen(true);
    }
    if (key === "vrvp") setVpSettingsOpen(true);
    if (key === "vwapKeyLevels") setVwapKeyLevelsSettingsOpen(true);
    if (key === "tradingSessions") setTradingSessionsSettingsOpen(true);
  };

  if (historyActionsRef) {
    historyActionsRef.current = {
      undo: handleUndo,
      redo: handleRedo,
      clear: handleClear,
      addAlert: handleAddAlert,
      takeSnapshot: handleTakeSnapshot,
      resetZoom: () => handleResetView(),
      getCurrentPrice: () =>
        latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close ??
        lastCrosshairPriceRef.current ??
        undefined,
      showToast,
      selectDrawing: (id) => {
        setSelectedDrawingId(id);
        setDrawingVersion((v) => v + 1);
        redrawTriggerRef.current();
      },
      updateDrawing: (id, patch) => {
        const updated = drawingEngineRef.current!.update(id, patch);
        if (updated) {
          setDrawingVersion((v) => v + 1);
          syncHistoryMeta();
        }
      },
      deleteDrawing: (id) => {
        if (drawingsLockedRef.current) {
          showToast("Drawings are locked — unlock to remove");
          return;
        }
        if (drawingEngineRef.current!.remove(id)) {
          if (selectedDrawingIdRef.current === id) {
            setSelectedDrawingId(null);
            setDrawingSettingsOpen(false);
          }
          setDrawingVersion((v) => v + 1);
          syncHistoryMeta();
        }
      },
      openDrawingSettings: (id) => {
        setSelectedDrawingId(id);
        setDrawingSettingsOpen(true);
        redrawTriggerRef.current();
      },
      reorderDrawing: (id, targetId) => {
        if (drawingEngineRef.current!.reorder(id, targetId, "before")) {
          setDrawingVersion((v) => v + 1);
          syncHistoryMeta();
        }
      },
      toggleStudyHidden: (id) => toggleStudyVisibility(id),
      toggleOrderflowHidden: (key) => toggleOrderflowLayerHidden(key),
      openOrderflowSettings: openOrderflowSettingsByKey,
      toggleVolumeHidden: () => setVolumeHidden((v) => !v),
      openVolumeSettings: () => setVolumeSettingsOpen(true),
    };
  }

  useEffect(() => {
    const activeCount = alerts.filter((a) => a.status === "active").length;
    onAlertsCountChange?.(activeCount);
  }, [alerts, onAlertsCountChange]);

  useEffect(() => {
    onDrawingsSnapshotChangeRef.current?.([...drawingEngineRef.current!.list(symbol)], selectedDrawingId);
  }, [symbol, selectedDrawingId, drawingVersion]);

  useEffect(() => {
    onIndicatorHiddenStateChange?.({
      hiddenStudyIds,
      hiddenOrderflowLayers,
      volumeHidden,
    });
  }, [hiddenStudyIds, hiddenOrderflowLayers, volumeHidden, onIndicatorHiddenStateChange]);

  useEffect(() => {
    if (dataWindowActive) {
      emitDataWindowRef.current();
    }
  }, [dataWindowActive, symbol, timeframe, studyOverlays, hiddenStudyIds, visibility, hiddenOrderflowLayers, showVolume, volumeHidden]);

  useEffect(() => {
    syncHistoryMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    redrawTriggerRef.current();
  }, [visibility, hiddenOrderflowLayers, drawingsHidden, drawingsLocked, sessionVpConfig, vwapKeyLevelsConfig, tradingSessionsConfig, tpoSettings, tpoMerges]);

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
        mode: CrosshairMode.Normal,
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
        minimumWidth: 82,
        autoScale,
        invertScale,
        mode: targetMode,
        scaleMargins: { top: topMargin, bottom: bottomMargin },
      },
      rightPriceScale: {
        visible: !isLeftScale,
        borderVisible: cfg.canvas.scalesLinesVisible,
        borderColor: cfg.canvas.scalesLineColor,
        minimumWidth: 82,
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

    const showIntegratedCountdown =
      cfg.scales.countdownToBarClose && cfg.scales.symbolPriceLabel !== "hidden";
    const commonPriceOpts = {
      lastValueVisible: cfg.scales.symbolPriceLabel !== "hidden" && !showIntegratedCountdown,
      priceLineVisible: cfg.scales.symbolPriceLabel === "value_line",
      priceFormat: {
        type: "price" as const,
        precision: digits,
        minMove: Math.pow(10, -digits),
      },
    };
    if (
      barType === "candles" ||
      barType === "hollow_candles" ||
      barType === "volume_candles" ||
      barType === "high_low" ||
      barType === "volume_footprint" ||
      barType === "tpo" ||
      barType === "session_vp" ||
      barType === "heikin_ashi" ||
      barType === "renko" ||
      barType === "line_break" ||
      barType === "range"
    ) {
      (cs as ISeriesApi<"Candlestick">).applyOptions({
        ...commonPriceOpts,
        upColor:
          barType === "hollow_candles"
            ? "transparent"
            : cfg.symbol.bodyEnabled
              ? cfg.symbol.bodyUpColor
              : "transparent",
        downColor: cfg.symbol.bodyEnabled ? cfg.symbol.bodyDownColor : "transparent",
        borderVisible: barType === "hollow_candles" ? true : cfg.symbol.borderEnabled,
        borderUpColor: cfg.symbol.borderUpColor,
        borderDownColor: cfg.symbol.borderDownColor,
        wickVisible:
          barType === "high_low" || barType === "renko" || barType === "line_break"
            ? false
            : cfg.symbol.wickEnabled,
        wickUpColor: cfg.symbol.wickUpColor,
        wickDownColor: cfg.symbol.wickDownColor,
      });
    } else if (barType === "bars") {
      (cs as ISeriesApi<"Bar">).applyOptions({
        ...commonPriceOpts,
        upColor: cfg.symbol.bodyUpColor,
        downColor: cfg.symbol.bodyDownColor,
      });
    } else {
      cs.applyOptions(commonPriceOpts);
    }
    requestOverlayRedrawRef.current?.();
  }, [effectiveSettings, autoScale, invertScale, priceScaleMode, effectiveLogScale, symbol, barType]);

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
    alertPriceLinesRef.current.clear();

    const cfg = effectiveSettings;
    const candles = latestCandlesRef.current;
    const lastBar = candles[candles.length - 1];
    const added: IPriceLine[] = [];

    if (cfg.alerts.alertLines) {
      for (const al of alerts) {
        if (al.symbol !== symbol) continue;
        const alertPrice = getAlertPrimaryPrice(al);
        if (alertPrice === null) continue;
        const lineColor =
          al.status === "active"
            ? (al.color || cfg.alerts.alertLineColor)
            : "#6b7280";
        const drag = alertDragRef.current;
        const line = cs.createPriceLine({
          price: drag?.id === al.id && drag.price !== null ? drag.price : alertPrice,
          color: lineColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
        alertPriceLinesRef.current.set(al.id, line);
        added.push(line);
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
    syncAlertBadgePositionsRef.current();
  }, [effectiveSettings, alerts, activeOrders, symbol, tickSizeE9]);

  // Countdown to bar close clock (rendered inside price-scale badge via primitive, zero React re-renders)
  useEffect(() => {
    if (!effectiveSettings.scales.countdownToBarClose) {
      countdownTextRef.current = "";
      requestOverlayRedrawRef.current?.();
      return;
    }
    const updateClock = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const openSec = alignTimeSecToTimeframe(nowSec, timeframe);
      const closeSec = timeframeBucketCloseSec(openSec, timeframe);
      const rem = Math.max(1, closeSec - nowSec);
      countdownTextRef.current = formatCountdownClock(rem);
      requestOverlayRedrawRef.current?.();
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
        handleAddAlert();
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
    volumeRefreshRef.current?.();
    if (showVolume && !volumeHidden && volLegendRef.current && lastVolSampleRef.current) {
      const { vol, isUp } = lastVolSampleRef.current;
      volLegendRef.current.textContent = volumeConfig.precision === undefined ? formatCompactVolume(vol) : vol.toFixed(volumeConfig.precision);
      volLegendRef.current.style.color = isUp ? volumeConfig.volume?.upColor ?? "#26a69a" : volumeConfig.volume?.downColor ?? "#ef5350";
    }
  }, [showVolume, volumeHidden, volumeConfig, volumeActive]);

  useEffect(() => {
    const chart = chartApiRef.current;
    const count = latestTimesRef.current.length;
    if (!chart || count === 0) return;
    if (rangePreset === "All") {
      chart.timeScale().fitContent();
      return;
    }
    const barSec = Math.max(60, timeframeToSeconds(timeframe));
    const presetSec: Record<string, number> = {
      "1D": 86_400,
      "5D": 5 * 86_400,
      "1M": 30 * 86_400,
      "3M": 90 * 86_400,
      "6M": 180 * 86_400,
      YTD: 270 * 86_400,
      "1Y": 365 * 86_400,
    };
    const targetSec = presetSec[rangePreset];
    const desired = targetSec ? Math.max(30, Math.round(targetSec / barSec)) : count;
    const visible = Math.min(count, desired);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, count - visible),
      to: count + 8,
    });
  }, [rangePreset, timeframe]);

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
        mode: CrosshairMode.Normal,
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
        minimumWidth: 82,
        scaleMargins: { top: initTopMargin, bottom: initBottomMargin },
      },
      rightPriceScale: {
        visible: !initLeftScale,
        borderVisible: initCfg.canvas.scalesLinesVisible,
        borderColor: initCfg.canvas.scalesLineColor,
        minimumWidth: 82,
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

    const initIntegratedCountdown =
      initCfg.scales.countdownToBarClose && initCfg.scales.symbolPriceLabel !== "hidden";
    const commonInitOpts = {
      lastValueVisible: initCfg.scales.symbolPriceLabel !== "hidden" && !initIntegratedCountdown,
      priceLineVisible: initCfg.scales.symbolPriceLabel === "value_line",
      priceFormat: {
        type: "price" as const,
        precision: initDigits,
        minMove: Math.pow(10, -initDigits),
      },
    };
    const isHollow = barType === "hollow_candles";
    const isPnf = barType === "point_and_figure";
    const hideWicks = barType === "high_low" || barType === "renko" || barType === "line_break";

    let candleSeries: ISeriesApi<SeriesType>;
    if (barType === "bars") {
      candleSeries = chart.addSeries(BarSeries, {
        ...commonInitOpts,
        upColor: initCfg.symbol.bodyUpColor,
        downColor: initCfg.symbol.bodyDownColor,
        openVisible: true,
        thinBars: false,
      });
    } else if (barType === "line" || barType === "line_markers" || barType === "step_line" || barType === "hlc_area" || barType === "kagi") {
      candleSeries = chart.addSeries(LineSeries, {
        ...commonInitOpts,
        color: "#2962ff",
        lineWidth: 2,
        lineType:
          barType === "step_line" || barType === "kagi" ? LineType.WithSteps : LineType.Simple,
        pointMarkersVisible: barType === "line_markers",
        pointMarkersRadius: 3,
      });
    } else if (barType === "area") {
      candleSeries = chart.addSeries(AreaSeries, {
        ...commonInitOpts,
        lineColor: "#2962ff",
        topColor: "rgba(41, 98, 255, 0.30)",
        bottomColor: "rgba(41, 98, 255, 0.02)",
        lineWidth: 2,
      });
    } else if (barType === "baseline") {
      candleSeries = chart.addSeries(BaselineSeries, {
        ...commonInitOpts,
        baseValue: { type: "price", price: initSymMeta.basePrice },
        topLineColor: "#089981",
        topFillColor1: "rgba(8, 153, 129, 0.28)",
        topFillColor2: "rgba(8, 153, 129, 0.02)",
        bottomLineColor: "#f23645",
        bottomFillColor1: "rgba(242, 54, 69, 0.02)",
        bottomFillColor2: "rgba(242, 54, 69, 0.28)",
        lineWidth: 2,
      });
    } else if (barType === "columns") {
      candleSeries = chart.addSeries(HistogramSeries, {
        ...commonInitOpts,
        priceScaleId: "right",
      });
    } else {
      candleSeries = chart.addSeries(CandlestickSeries, {
        ...commonInitOpts,
        upColor: isPnf || isHollow ? "transparent" : initCfg.symbol.bodyEnabled ? initCfg.symbol.bodyUpColor : "transparent",
        downColor: isPnf ? "transparent" : initCfg.symbol.bodyEnabled ? initCfg.symbol.bodyDownColor : "transparent",
        borderVisible: isPnf ? false : isHollow ? true : initCfg.symbol.borderEnabled,
        borderUpColor: initCfg.symbol.borderUpColor,
        borderDownColor: initCfg.symbol.borderDownColor,
        wickVisible: isPnf || hideWicks ? false : initCfg.symbol.wickEnabled,
        wickUpColor: initCfg.symbol.wickUpColor,
        wickDownColor: initCfg.symbol.wickDownColor,
      });
    }
    candleSeriesRef.current = candleSeries;

    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      visible: volumeActiveRef.current,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;
    const volumeAverage = chart.addSeries(LineSeries, {
      priceScaleId: "volume", priceFormat: { type: "volume" }, visible: false,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    chartApiRef.current = chart;
    const seeded = dataSource === "paper_sim"
      ? seedInitialCandles(symbol, timeframe)
      : { candles: [], volumes: [], buyVolumes: [], sellVolumes: [] };
    let activeCandles: CandlestickData<UTCTimestamp>[] = [...seeded.candles];
    let activeVolumes: HistogramData<UTCTimestamp>[] = [...seeded.volumes];
    let activeBuyVolumes: number[] = [...seeded.buyVolumes];
    let activeSellVolumes: number[] = [...seeded.sellVolumes];

    const volumeColor = (bar: CandlestickData<UTCTimestamp>, previous?: CandlestickData<UTCTimestamp>) => {
      const cfg = volumeConfigRef.current.volume ?? DEFAULT_VOLUME;
      const growing = bar.close >= (cfg.previousClose ? previous?.close ?? bar.open : bar.open);
      return hexWithOpacity(growing ? cfg.upColor : cfg.downColor, growing ? cfg.upOpacity : cfg.downOpacity);
    };
    const refreshVolume = () => {
      const cfg = volumeConfigRef.current;
      const style = cfg.volume ?? DEFAULT_VOLUME;
      const priceFormat = cfg.precision === undefined ? { type: "volume" as const }
        : { type: "price" as const, precision: cfg.precision, minMove: 10 ** -cfg.precision };
      volumeSeries.applyOptions({ visible: volumeActiveRef.current && style.showBars, lastValueVisible: cfg.showPriceLabel,
        priceLineVisible: cfg.showPriceLine, priceFormat });
      volumeSeries.setData(activeVolumes.map((vol, i) => ({ ...vol, color: volumeColor(activeCandles[i], activeCandles[i - 1]) })));
      volumeAverage.applyOptions({
        visible: volumeActiveRef.current && style.showAverage,
        color: hexWithOpacity(cfg.color, cfg.opacity), lineWidth: cfg.lineWidth,
        lineStyle: cfg.lineStyle === "dashed" ? LineStyle.Dashed : cfg.lineStyle === "dotted" ? LineStyle.Dotted : LineStyle.Solid,
      });
      let sum = 0;
      volumeAverage.setData(style.showAverage ? activeVolumes.flatMap((bar, i) => {
        sum += bar.value - (activeVolumes[i - cfg.period]?.value ?? 0);
        return i + 1 >= cfg.period ? [{ time: bar.time, value: sum / cfg.period }] : [];
      }) : []);
    };
    volumeRefreshRef.current = refreshVolume;

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
        const cfg = volumeConfigRef.current;
        let prior = -1;
        if (bar && cfg.volume?.previousClose) {
          let low = 0;
          let high = activeCandles.length;
          while (low < high) {
            const middle = (low + high) >>> 1;
            if (activeCandles[middle].time < bar.time) low = middle + 1;
            else high = middle;
          }
          prior = low;
        }
        const reference = cfg.volume?.previousClose && prior > 0 ? activeCandles[prior - 1].close : bar?.open;
        const isUp = !bar || bar.close >= (reference ?? bar.open);
        lastVolSampleRef.current = { vol, isUp };
        if (volLegendRef.current) {
          volLegendRef.current.textContent = cfg.precision === undefined ? formatCompactVolume(vol) : vol.toFixed(cfg.precision);
          volLegendRef.current.style.color = isUp ? cfg.volume?.upColor ?? "#26a69a" : cfg.volume?.downColor ?? "#ef5350";
        }
      } else if (volLegendRef.current) {
        volLegendRef.current.textContent = "—";
      }
    };

    const publishSeriesSnapshot = () => {
      const times = activeCandles.map((c) => c.time);
      latestTimesRef.current = times;
      latestCandlesRef.current = activeCandles;
      volumeHistoryRef.current = activeVolumes;
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
    let activePnfColumns: PointAndFigureColumn[] = [];
    const applyMainSeriesData = (
      bars: readonly CandlestickData<UTCTimestamp>[],
      vols: readonly HistogramData<UTCTimestamp>[],
    ) => {
      const cfg = chartSettingsRef.current;
      if (barType === "line" || barType === "line_markers" || barType === "step_line" || barType === "hlc_area" || barType === "area") {
        (candleSeries as ISeriesApi<"Line">).setData(
          bars.map((b) => ({ time: b.time, value: b.close })),
        );
      } else if (barType === "baseline") {
        const mid =
          bars.length > 0
            ? (Math.max(...bars.map((b) => b.high)) + Math.min(...bars.map((b) => b.low))) / 2
            : symMeta.basePrice;
        (candleSeries as ISeriesApi<"Baseline">).applyOptions({
          baseValue: { type: "price", price: mid },
        });
        (candleSeries as ISeriesApi<"Baseline">).setData(
          bars.map((b) => ({ time: b.time, value: b.close })),
        );
      } else if (barType === "columns") {
        (candleSeries as ISeriesApi<"Histogram">).setData(
          bars.map((b) => ({
            time: b.time,
            value: b.close,
            color: b.close >= b.open ? cfg.symbol.bodyUpColor : cfg.symbol.bodyDownColor,
          })),
        );
      } else if (barType === "kagi") {
        const kagiPts = transformKagi(bars);
        (candleSeries as ISeriesApi<"Line">).setData(
          kagiPts.map((pt) => ({
            time: pt.time,
            value: pt.value,
            color: pt.yang ? "#089981" : "#f23645",
          })),
        );
      } else if (barType === "bars") {
        (candleSeries as ISeriesApi<"Bar">).setData([...bars]);
      } else if (barType === "heikin_ashi") {
        (candleSeries as ISeriesApi<"Candlestick">).setData(transformHeikinAshi(bars));
      } else if (barType === "renko") {
        (candleSeries as ISeriesApi<"Candlestick">).setData(transformRenko(bars));
      } else if (barType === "line_break") {
        (candleSeries as ISeriesApi<"Candlestick">).setData(transformLineBreak(bars));
      } else if (barType === "range") {
        (candleSeries as ISeriesApi<"Candlestick">).setData(transformRangeBars(bars));
      } else if (barType === "high_low") {
        (candleSeries as ISeriesApi<"Candlestick">).setData(transformHighLow(bars));
      } else if (barType === "volume_candles") {
        (candleSeries as ISeriesApi<"Candlestick">).setData(
          buildVolumeWeightedCandles(bars, vols, cfg.symbol.bodyUpColor, cfg.symbol.bodyDownColor),
        );
      } else if (barType === "point_and_figure") {
        activePnfColumns = transformPointAndFigure(bars);
        (candleSeries as ISeriesApi<"Candlestick">).setData(
          activePnfColumns.map((col) => ({
            time: col.time,
            open: col.open,
            high: col.high,
            low: col.low,
            close: col.close,
          })),
        );
      } else {
        (candleSeries as ISeriesApi<"Candlestick">).setData([...bars]);
      }
    };

    applyMainSeriesData(activeCandles, activeVolumes);
    refreshVolume();
    publishSeriesSnapshot();
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, activeCandles.length - 150),
      to: activeCandles.length + 24,
    });

    const overlay = new WebGl2OrderflowOverlay();
    setRendererLabel(overlay.isWebGl2() ? "WebGL2" : "Canvas2D");

    const tickFloat = Number(tickSizeE9) / 1e9;
    let activeBarTimeSec = Number(activeCandles[activeCandles.length - 1]?.time ?? 0);
    const footprints = new TradeFootprints(tickSizeE9, timeframe);
    let vpSummary: VolumeProfileSummary | null = null;
    let vpBins: VolumeProfileBin[] = [];
    const tpo = new SessionTpo(tickFloat);
    tpoRef.current = tpo;
    if (dataSource === "paper_sim") {
      for (const bar of seedInitialCandles(symbol, "30m", 1500).candles) {
        tpo.add(Number(bar.time), bar.low, bar.high);
      }
    }

    let pendingBar: CandlestickData<UTCTimestamp> | null = null;
    let liveBucketSec = -1;
    let liveBucketBar: CandlestickData<UTCTimestamp> | null = null;
    let liveBucketBaseVol = 0;
    let liveBucketBaseBuyVol = 0;
    const liveBucketSubVols = new Map<number, { total: number; buy: number }>();
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
    let drawingCrosshairPx: { x: number; y: number } | null = null;
    let lastCrosshairHover: {
      rawY: number;
      time: UTCTimestamp;
      bar: CandlestickData<UTCTimestamp> | LineData<UTCTimestamp>;
    } | null = null;
    let lastDrawingPointerClient: {
      clientX: number;
      clientY: number;
      shiftKey: boolean;
    } | null = null;
    let rafId = 0;
    let lastWatchlistNotifyMs = 0;
    let lastStudyRecomputeMs = 0;
    let historicalLoaded = false;
    const backfillAbort = new AbortController();
    let previousClose: number | null | undefined = dataSource === "paper_sim" ? undefined : null;
    if (dataSource !== "paper_sim") {
      void fetchHistoricalOhlc({
        source: dataSource, symbol, timeframe: "D", limit: 3, signal: backfillAbort.signal,
      }).then((bars) => {
        if (backfillAbort.signal.aborted) return;
        const startOfDay = alignTimeSecToTimeframe(Math.floor(Date.now() / 1000), "D");
        previousClose = bars.filter((bar) => bar.time < startOfDay).at(-1)?.close ?? null;
        const current = activeCandles.at(-1);
        if (current) onLivePriceSampleRef.current?.(symbol, current.close, previousClose);
      }).catch(() => {});
    }

    const primitive = new OrderflowAndDrawingsPrimitive(overlay, {
      getOverlayData: (): OverlayRenderData => ({
        tickSizeFloat: tickFloat,
        footprints,
        vpSummary,
        vpBins,
        visibility: visibilityRef.current,
      }),
      getTpo: () => tpo,
      getVwapFills: () => vwapFillsRef.current,
      getTpoSettings: () => tpoOptionsRef.current,
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
      getVwapKeyLevelsConfig: () => vwapKeyLevelsConfigRef.current,
      getTradingSessionsConfig: () => tradingSessionsConfigRef.current,
      getBarType: () => barType,
      getPnfColumns: () => activePnfColumns,
      getBarStepSec: () => Math.max(60, timeframeToSeconds(timeframe)),
      getCountdownText: () => countdownTextRef.current,
      getPriceScaleBadgeMeta: () => {
        const s = chartSettingsRef.current;
        return {
          showIntegratedCountdown:
            s.scales.countdownToBarClose && s.scales.symbolPriceLabel !== "hidden",
          upColor: s.symbol.bodyUpColor,
          downColor: s.symbol.bodyDownColor,
        };
      },
      getDrawingCrosshair: () => {
        if (!drawingCrosshairPx) return null;
        if (activeToolRef.current === "cursor" && !shiftPressedRef.current) return null;
        return {
          x: drawingCrosshairPx.x,
          y: drawingCrosshairPx.y,
          color: chartSettingsRef.current.canvas.crosshairColor,
          labelBg: "#2b3040",
        };
      },
    });
    candleSeries.attachPrimitive(primitive);

    // Real historical OHLCV backfill when the user has explicitly opted into a live exchange feed.
    // Strictly skipped in `paper_sim` mode (SV-01 zero network calls at boot).
    let loadingOlderHistory = false;
    let olderHistoryExhausted = false;
    let hasPagedHistory = false;
    const historyLimit = 12_000;
    const barSecStep = Math.max(60, timeframeToSeconds(timeframe));

    const prependOlderBars = (
      olderCandles: CandlestickData<UTCTimestamp>[],
      olderVolumes: HistogramData<UTCTimestamp>[],
      olderBuy: number[],
      olderSell: number[],
    ) => {
      const firstExistingTime = Number(activeCandles[0]?.time ?? Infinity);
      const keepIdx: number[] = [];
      for (let i = 0; i < olderCandles.length; i++) {
        if (Number(olderCandles[i].time) < firstExistingTime) keepIdx.push(i);
      }
      if (keepIdx.length === 0) return 0;
      if (timeframe === "30m") {
        for (const index of keepIdx) {
          const bar = olderCandles[index];
          tpo.add(Number(bar.time), bar.low, bar.high);
        }
      }
      hasPagedHistory = true;
      const prevRange = chart.timeScale().getVisibleLogicalRange();
      activeCandles = [...keepIdx.map((i) => olderCandles[i]), ...activeCandles];
      activeVolumes = [...keepIdx.map((i) => olderVolumes[i]), ...activeVolumes];
      activeBuyVolumes = [...keepIdx.map((i) => olderBuy[i]), ...activeBuyVolumes];
      activeSellVolumes = [...keepIdx.map((i) => olderSell[i]), ...activeSellVolumes];
      applyMainSeriesData(activeCandles, activeVolumes);
      refreshVolume();
      publishSeriesSnapshot();
      if (prevRange) {
        chart.timeScale().setVisibleLogicalRange({
          from: prevRange.from + keepIdx.length,
          to: prevRange.to + keepIdx.length,
        });
      }
      onSeriesUpdatedRef.current?.();
      pendingPrimitiveDirty = true;
      scheduleFlush();
      return keepIdx.length;
    };

    const handleVisibleLogicalRangeChange = (range: { from: number; to: number } | null) => {
      if (!range || loadingOlderHistory || olderHistoryExhausted) return;
      if (range.from > 25) return;
      const remaining = historyLimit - activeCandles.length;
      if (remaining <= 0 || activeCandles.length === 0) return;

      if (dataSource === "paper_sim") {
        loadingOlderHistory = true;
        const older = generateOlderSimCandles(symbol, timeframe, activeCandles[0], Math.min(500, remaining));
        prependOlderBars(older.candles, older.volumes, older.buyVolumes, older.sellVolumes);
        loadingOlderHistory = false;
        return;
      }

      if (dataSource === "coinbase_ws" && historicalLoaded) {
        loadingOlderHistory = true;
        const oldestTime = Number(activeCandles[0].time);
        void fetchHistoricalOhlc({
          source: "coinbase_ws",
          symbol,
          timeframe,
          limit: 300,
          endTimeSec: oldestTime,
          signal: backfillAbort.signal,
        })
          .then((bars) => {
            if (backfillAbort.signal.aborted) return;
            if (!bars || bars.length === 0) {
              olderHistoryExhausted = true;
              return;
            }
            bars = bars.filter((bar) => bar.time < oldestTime).slice(-remaining);
            const oCandles = bars.map((c) => ({
              time: c.time as UTCTimestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }));
            const oVolumes = bars.map((c) => ({
              time: c.time as UTCTimestamp,
              value: c.volume,
              color: c.close >= c.open ? "rgba(130, 142, 165, 0.24)" : "rgba(95, 103, 122, 0.2)",
            }));
            const oBuy = bars.map((c) => c.volume * (c.close >= c.open ? 0.62 : 0.38));
            const oSell = bars.map((c, idx) => Math.max(0, c.volume - oBuy[idx]));
            const added = prependOlderBars(oCandles, oVolumes, oBuy, oSell);
            if (added === 0) olderHistoryExhausted = true;
          })
          .catch(() => {
            // Ignore transient scroll-back network errors
          })
          .finally(() => {
            loadingOlderHistory = false;
          });
      }
    };
    const syncAlertBadgePositions = () => {
      const containerH = el.clientHeight || 0;
      const currentAlerts = alertsRef.current;
      for (const al of currentAlerts) {
        if (al.symbol !== symbol) continue;
        const badgeEl = alertBadgeRefs.current.get(al.id);
        if (!badgeEl) continue;
        const drag = alertDragRef.current;
        const price = drag?.id === al.id && drag.price !== null ? drag.price : getAlertPrimaryPrice(al);
        if (price === null || !chartSettingsRef.current.alerts.alertLines) {
          badgeEl.style.display = "none";
          continue;
        }
        const y = candleSeries.priceToCoordinate(price);
        if (y === null || !Number.isFinite(y) || y < 8 || y > Math.max(24, containerH - 28)) {
          badgeEl.style.display = "none";
          continue;
        }
        badgeEl.style.display = "flex";
        badgeEl.style.transform = `translate3d(0, ${Math.round(y - 12)}px, 0)`;
      }
    };
    syncAlertBadgePositionsRef.current = syncAlertBadgePositions;

    let lastDataWindowSig = "";
    const emitDataWindow = (
      bar?: CandlestickData<UTCTimestamp>,
      vol?: number,
      seriesData?: ReadonlyMap<unknown, unknown>,
    ) => {
      if (!dataWindowActiveRef.current || !onDataWindowSnapshotRef.current) return;
      const targetBar = bar ?? activeCandles[activeCandles.length - 1];
      if (!targetBar || typeof targetBar.open !== "number") return;
      const barIdx = activeCandles.findIndex((c) => c.time === targetBar.time);
      const prevBar = barIdx > 0 ? activeCandles[barIdx - 1] : undefined;
      const resolvedVol =
        vol ??
        (barIdx >= 0 ? activeVolumes[barIdx]?.value : activeVolumes[activeVolumes.length - 1]?.value) ??
        0;
      const digits = getPrecisionDigits(chartSettingsRef.current, symMeta.decimals);
      const change = targetBar.close - targetBar.open;
      const changePct = targetBar.open !== 0 ? (change / targetBar.open) * 100 : 0;
      const lastDayChange =
        previousClose !== null && previousClose !== undefined
          ? targetBar.close - previousClose
          : prevBar
            ? targetBar.close - prevBar.close
            : null;
      const lastDayChangePct =
        lastDayChange !== null
          ? (() => {
              const ref =
                previousClose !== null && previousClose !== undefined
                  ? previousClose
                  : prevBar?.close ?? 0;
              return ref !== 0 ? (lastDayChange / ref) * 100 : null;
            })()
          : null;
      const fmtVal = (v: number) =>
        v.toLocaleString("en-US", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
      const indicators: DataWindowIndicatorValue[] = [];
      if (volumeActiveRef.current) {
        const volStr =
          resolvedVol >= 1_000_000
            ? `${(resolvedVol / 1_000_000).toFixed(2)}M`
            : resolvedVol >= 1_000
              ? `${(resolvedVol / 1_000).toFixed(2)}K`
              : resolvedVol.toFixed(0);
        indicators.push({
          id: "volume",
          label: "Vol",
          value: volStr,
          color: targetBar.close >= targetBar.open ? "#26a69a" : "#ef5350",
        });
      }
      for (const st of studyOverlaysRef.current) {
        if (hiddenStudyIdsRef.current.has(st.id)) continue;
        const series = studyLineSeriesRef.current.get(st.id);
        const pt =
          series && seriesData
            ? (seriesData.get(series) as LineData<UTCTimestamp> | undefined)
            : undefined;
        const val =
          pt && typeof pt.value === "number" && Number.isFinite(pt.value)
            ? pt.value
            : studyLatestRef.current.get(st.id);
        indicators.push({
          id: st.id,
          label: st.label,
          value: typeof val === "number" && Number.isFinite(val) ? fmtVal(val) : "∅",
          color: st.color,
        });
      }
      const vis = visibilityRef.current;
      const hiddenOf = hiddenOrderflowRef.current;
      if (vis.vwapKeyLevels && !hiddenOf.has("vwapKeyLevels")) {
        indicators.push({
          id: "of:vwapKeyLevels",
          label: "VWAP Key Levels",
          value: fmtVal(targetBar.close),
          color: vwapKeyLevelsConfigRef.current.monthVwapColor,
        });
      }
      if (vis.vrvp && !hiddenOf.has("vrvp")) {
        indicators.push({
          id: "of:vrvp",
          label: "Session Volume Profile",
          value: "Active",
          color: "#38bdf8",
        });
      }
      if (vis.footprint && !hiddenOf.has("footprint")) {
        indicators.push({
          id: "of:footprint",
          label: "Footprint Bid/Ask",
          value: "Active",
          color: "#34d399",
        });
      }
      if (vis.tpo && !hiddenOf.has("tpo")) {
        indicators.push({
          id: "of:tpo",
          label: "TPO Market Profile",
          value: "Active",
          color: "#f59e0b",
        });
      }
      if (vis.marketStructure && !hiddenOf.has("marketStructure")) {
        indicators.push({
          id: "of:marketStructure",
          label: "Market Structure",
          value: "Active",
          color: "#089981",
        });
      }
      if (vis.tradingSessions && !hiddenOf.has("tradingSessions")) {
        indicators.push({
          id: "of:tradingSessions",
          label: "Trading Sessions",
          value: "Active",
          color: tradingSessionsConfigRef.current.newYorkColor,
        });
      }
      const sig = `${targetBar.time}:${targetBar.close}:${resolvedVol}:${indicators.map((i) => `${i.id}=${i.value}`).join("|")}`;
      if (sig === lastDataWindowSig) return;
      lastDataWindowSig = sig;
      onDataWindowSnapshotRef.current({
        timeSec: Number(targetBar.time),
        open: targetBar.open,
        high: targetBar.high,
        low: targetBar.low,
        close: targetBar.close,
        change,
        changePct,
        volume: resolvedVol,
        lastDayChange,
        lastDayChangePct,
        decimals: digits,
        indicators,
      });
    };
    emitDataWindowRef.current = () => {
      lastDataWindowSig = "";
      emitDataWindow();
    };

    const handleVisibleRangeWithAlerts = (range: { from: number; to: number } | null) => {
      handleVisibleLogicalRangeChange(range);
      syncAlertBadgePositions();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeWithAlerts);

    if (dataSource !== "paper_sim") {
      void fetchHistoricalOhlc({
        source: dataSource,
        symbol,
        timeframe,
        limit: 1500,
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
          pendingBar = null;
          pendingVol = null;
          liveBucketSec = -1;
          liveBucketBar = null;
          liveBucketBaseVol = 0;
          liveBucketBaseBuyVol = 0;
          liveBucketSubVols.clear();
          const lastBar = activeCandles[activeCandles.length - 1];
          activeBarTimeSec = Number(lastBar.time);
          applyMainSeriesData(activeCandles, activeVolumes);
          refreshVolume();
          publishSeriesSnapshot();
          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(0, activeCandles.length - 150),
            to: activeCandles.length + 24,
          });
          onLivePriceSampleRef.current?.(symbol, lastBar.close, previousClose);
          onSeriesUpdatedRef.current?.();
          pendingPrimitiveDirty = true;
          scheduleFlush();
        })
        .catch(() => {
          // Continue displaying candles built from the selected live stream.
        });
    }

    const scheduleFlush = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (pendingBar && pendingVol) {
          const res = applyBarHysteresis(activeCandles, pendingBar, hasPagedHistory);
          activeCandles = res.bars;
          activeBarTimeSec = Number(pendingBar.time);
          if (!res.trimmed) {
            if (
              barType === "candles" ||
              barType === "hollow_candles" ||
              barType === "volume_footprint" ||
              barType === "tpo" ||
              barType === "session_vp" ||
              barType === "bars"
            ) {
              (candleSeries as ISeriesApi<"Candlestick">).update(pendingBar);
            } else if (
              barType === "line" ||
              barType === "line_markers" ||
              barType === "step_line" ||
              barType === "area" ||
              barType === "baseline" ||
              barType === "hlc_area"
            ) {
              (candleSeries as ISeriesApi<"Line">).update({
                time: pendingBar.time,
                value: pendingBar.close,
              });
            } else {
              applyMainSeriesData(activeCandles, activeVolumes);
            }
            const previous = activeCandles.at(-2);
            volumeSeries.update({ ...pendingVol, color: volumeColor(pendingBar, previous) });
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
            applyMainSeriesData(activeCandles, activeVolumes);
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
            refreshVolume();
          }

          const volumeCfg = volumeConfigRef.current;
          if (volumeCfg.volume?.showAverage && activeVolumes.length >= volumeCfg.period) {
            const sum = activeVolumes.slice(-volumeCfg.period).reduce((total, bar) => total + bar.value, 0);
            volumeAverage.update({ time: pendingVol.time, value: sum / volumeCfg.period });
          }
          const nowMs = performance.now();
          if (nowMs - lastWatchlistNotifyMs >= 500) {
            lastWatchlistNotifyMs = nowMs;
            onLivePriceSampleRef.current?.(symbol, pendingBar.close, previousClose);
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
        syncAlertBadgePositions();
        emitDataWindow();
      });
    };

    let tpoBackfillRequested = false;
    const backfillTpo = () => {
      if (dataSource === "paper_sim" || !visibilityRef.current.tpo || tpoBackfillRequested) return;
      tpoBackfillRequested = true;
      void fetchHistoricalOhlc({
        source: dataSource,
        symbol,
        timeframe: "30m",
        limit: 1500,
        signal: backfillAbort.signal,
      }).then((bars) => {
        if (backfillAbort.signal.aborted) return;
        for (const bar of bars) tpo.add(bar.time, bar.low, bar.high);
        pendingPrimitiveDirty = true;
        scheduleFlush();
      }).catch(() => {
        tpoBackfillRequested = false;
      });
    };

    backfillTpo();
    redrawTriggerRef.current = () => {
      backfillTpo();
      pendingPrimitiveDirty = true;
      scheduleFlush();
    };

    const resolveSnapPriceForBar = (
      rawPrice: number,
      snapBar: CandlestickData<UTCTimestamp> | LineData<UTCTimestamp>,
    ): number => {
      if ("open" in snapBar && typeof snapBar.open === "number") {
        return snapPriceToCandleZone(rawPrice, snapBar);
      }
      if ("value" in snapBar && typeof snapBar.value === "number" && Number.isFinite(snapBar.value)) {
        return snapBar.value;
      }
      return rawPrice;
    };

    chart.subscribeCrosshairMove((param) => {
      const rawHovered = param.seriesData.get(candleSeries) as
        | CandlestickData<UTCTimestamp>
        | LineData<UTCTimestamp>
        | undefined;
      const bar: CandlestickData<UTCTimestamp> | undefined =
        rawHovered && "open" in rawHovered && typeof rawHovered.open === "number"
          ? rawHovered
          : param.time !== undefined
            ? activeCandles.find((c) => c.time === param.time)
            : undefined;
      const snapBar: CandlestickData<UTCTimestamp> | LineData<UTCTimestamp> | undefined =
        rawHovered &&
        (("open" in rawHovered && typeof rawHovered.open === "number") ||
          ("value" in rawHovered && typeof rawHovered.value === "number"))
          ? rawHovered
          : bar;

      if (param.point && (param.paneIndex ?? 0) === 0) {
        const rawPrice = candleSeries.coordinateToPrice(param.point.y);
        const magnetNow = param.sourceEvent
          ? baseMagnetRef.current !== Boolean(param.sourceEvent.metaKey || param.sourceEvent.ctrlKey)
          : magnetRef.current;
        if (param.time !== undefined && snapBar) {
          lastCrosshairHover = { rawY: param.point.y, time: snapBar.time, bar: snapBar };
          let displayPrice: number | null = rawPrice !== null ? Number(rawPrice) : null;
          if (magnetNow && displayPrice !== null && Number.isFinite(displayPrice)) {
            const snappedPrice = resolveSnapPriceForBar(displayPrice, snapBar);
            displayPrice = snappedPrice;
            try {
              chart.setCrosshairPosition(snappedPrice, snapBar.time, candleSeries);
            } catch {
              // Ignore if bar time is not currently indexed
            }
          }
          if (displayPrice !== null && Number.isFinite(displayPrice)) {
            lastCrosshairPriceRef.current = displayPrice;
          }
        } else {
          lastCrosshairHover = null;
          if (rawPrice !== null && Number.isFinite(rawPrice)) {
            lastCrosshairPriceRef.current = rawPrice;
          }
        }
      } else {
        if (!param.point) {
          lastCrosshairHover = null;
        }
      }
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
      if (dataWindowActiveRef.current) {
        emitDataWindow(
          bar && typeof bar.open === "number" ? bar : lastBar,
          bar && typeof bar.open === "number" ? vPoint?.value : lastVol,
          param.seriesData,
        );
      }
      syncAlertBadgePositions();
    });

    const unsub = transport.subscribeBinary(1, (buf) => {
      if (!marketStreamReadyRef.current) return;
      try {
        const hdr = decodeFrameHeader(buf);
        if (hdr.frameType === FrameType.LIVE_BAR_UPDATE_BATCH) {
          const { bars } = decodeLiveBarUpdateBatch(buf);
          const latest = bars[bars.length - 1];
          if (!latest) return;
          const rawSubSec = Number(latest.tsOpenNs / 1_000_000_000n);
          const bucketSec = alignTimeSecToTimeframe(rawSubSec, timeframe);
          const t = bucketSec as UTCTimestamp;
          const rawOpen = Number(latest.openTick) * tickFloat;
          const rawHigh = Number(latest.highTick) * tickFloat;
          const rawLow = Number(latest.lowTick) * tickFloat;
          const rawClose = Number(latest.closeTick) * tickFloat;
          const subVol = Number(latest.volumeE9) / 1e9;
          const lastCandle = activeCandles[activeCandles.length - 1];
          if (bucketSec < liveBucketSec || (lastCandle && t < lastCandle.time)) return;
          const lastSeed = lastCandle?.close ?? symMeta.basePrice;
          const ratio =
            !historicalLoaded &&
            dataSource === "paper_sim" &&
            rawClose > 0 &&
            Math.abs(rawClose - lastSeed) / Math.max(1, lastSeed) > 0.35
              ? lastSeed / rawClose
              : 1;
          const inOpen = rawOpen * ratio;
          const inHigh = rawHigh * ratio;
          const inLow = rawLow * ratio;
          const inClose = rawClose * ratio;

          // Accumulate sub-bars inside the current timeframe bucket so a 15m candle
          // stays live for the full 15 minutes from open to close (5m = 5m, 1h = 1h, etc.).
          if (liveBucketSec !== bucketSec) {
            liveBucketSec = bucketSec;
            liveBucketSubVols.clear();
            const existingSameBucket =
              lastCandle && Number(lastCandle.time) === bucketSec ? lastCandle : null;
            liveBucketBaseVol =
              existingSameBucket && activeVolumes.length > 0
                ? activeVolumes[activeVolumes.length - 1].value
                : 0;
            liveBucketBaseBuyVol = existingSameBucket ? (activeBuyVolumes.at(-1) ?? 0) : 0;
            liveBucketBar = existingSameBucket
              ? {
                  time: t,
                  open: existingSameBucket.open,
                  high: Math.max(existingSameBucket.high, inHigh),
                  low: Math.min(existingSameBucket.low, inLow),
                  close: inClose,
                }
              : {
                  time: t,
                  open: inOpen,
                  high: inHigh,
                  low: inLow,
                  close: inClose,
                };
          } else if (liveBucketBar) {
            liveBucketBar = {
              time: t,
              open: liveBucketBar.open,
              high: Math.max(liveBucketBar.high, inHigh),
              low: Math.min(liveBucketBar.low, inLow),
              close: inClose,
            };
          }

          liveBucketSubVols.set(rawSubSec, { total: subVol, buy: Number(latest.buyVolE9) / 1e9 });
          let totalVol = liveBucketBaseVol;
          let totalBuyVol = liveBucketBaseBuyVol;
          for (const v of liveBucketSubVols.values()) {
            totalVol += v.total;
            totalBuyVol += v.buy;
          }

          const barOut = liveBucketBar ?? { time: t, open: inOpen, high: inHigh, low: inLow, close: inClose };
          pendingBar = barOut;
          pendingVol = {
            time: t,
            value: totalVol,
            color: barOut.close >= barOut.open ? "rgba(130, 142, 165, 0.24)" : "rgba(95, 103, 122, 0.2)",
          };
          pendingBuyVol = totalBuyVol;
          pendingSellVol = Math.max(0, totalVol - pendingBuyVol);
          scheduleFlush();
        } else if (hdr.frameType === FrameType.LIVE_TRADE_BATCH) {
          const { trades } = decodeLiveTradeBatch(buf);
          footprints.add(trades);
          for (const trade of trades) {
            const price = Number(trade.priceE9) / 1e9;
            tpo.add(Number(trade.tsNs / 1_000_000_000n), price, price);
          }
          if (visibilityRef.current.footprint || visibilityRef.current.tpo) {
            pendingPrimitiveDirty = true;
            scheduleFlush();
          }
        } else if (hdr.frameType === FrameType.VOLUME_PROFILE_SOA) {
          const decoded = decodeVolumeProfile(buf);
          vpSummary = decoded.summary;
          vpBins = decoded.bins;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
      } catch {
        // Ignore unrelated or malformed frames
      }
    });

    const collectVpMagnetTargets = (): MagnetTarget[] => {
      const targets: MagnetTarget[] = [];
      if (vpSummary && visibilityRef.current.vrvp) {
        targets.push(
          { priceTick: vpSummary.pocPrice, source: "tpo_poc" },
          { priceTick: vpSummary.vahPrice, source: "tpo_vah" },
          { priceTick: vpSummary.valPrice, source: "tpo_val" },
        );
      }
      if (tickFloat > 0) {
        for (const d of drawingEngineRef.current!.list(symbol)) {
          if (
            !d.hidden &&
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

    const ANGLE_SNAP_TOOLS = new Set<string>([
      "trendline",
      "ray",
      "extended_line",
      "arrow_line",
      "info_line",
      "parallel_channel",
      "disjoint_channel",
      "trend_angle",
    ]);

    const toAnchorFromPointer = (
      clientX: number,
      clientY: number,
      modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; tool?: string; originAnchor?: AnchorPoint },
    ): AnchorPoint | null => {
      const rect = el.getBoundingClientRect();
      let x = clientX - rect.left;
      let y = clientY - rect.top;

      // Shift constrains line/ray/channel tools to crisp 0° / 45° / 90° angles
      if (
        modifiers?.shiftKey &&
        modifiers.originAnchor &&
        modifiers.tool &&
        ANGLE_SNAP_TOOLS.has(modifiers.tool)
      ) {
        const ax = timeSecToCoordinateExt(chart, activeCandles, modifiers.originAnchor.timeSec, barSecStep);
        const ay = candleSeries.priceToCoordinate(Number(modifiers.originAnchor.priceTick) * tickFloat);
        if (ax !== null && ay !== null) {
          const dx = x - ax;
          const dy = y - ay;
          const dist = Math.hypot(dx, dy);
          if (dist > 4) {
            const angle = Math.atan2(dy, dx);
            const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            x = ax + Math.cos(snappedAngle) * dist;
            y = ay + Math.sin(snappedAngle) * dist;
          }
        }
      }

      const price = candleSeries.coordinateToPrice(y);
      if (price === null || !Number.isFinite(price)) return null;
      const scaled = price / tickFloat;
      if (!Number.isFinite(scaled)) return null;
      const timeSec = coordinateToTimeSecExt(
        chart,
        activeCandles,
        x,
        barSecStep,
        activeBarTimeSec || Math.floor(Date.now() / 1000),
      );
      let priceTick = BigInt(Math.round(scaled));
      const useMagnet =
        modifiers !== undefined
          ? baseMagnetRef.current !== Boolean(modifiers.metaKey || modifiers.ctrlKey)
          : magnetRef.current;
      if (useMagnet) {
        const rawLogical = chart.timeScale().coordinateToLogical(x);
        const barIdx = rawLogical !== null && Number.isFinite(rawLogical) ? Math.round(rawLogical) : null;
        const seriesBar =
          barIdx !== null
            ? (candleSeries.dataByIndex(barIdx, MismatchDirection.None) as
                | CandlestickData<UTCTimestamp>
                | LineData<UTCTimestamp>
                | null)
            : null;
        if (seriesBar) {
          const snappedPrice = resolveSnapPriceForBar(price, seriesBar);
          const snappedScaled = snappedPrice / tickFloat;
          if (Number.isFinite(snappedScaled)) {
            priceTick = BigInt(Math.round(snappedScaled));
          }
        } else {
          const snapped = snapTickToMagnet(priceTick, collectVpMagnetTargets(), 250n);
          priceTick = snapped.snappedTick;
        }
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
      if (rulerPinned && activeToolRef.current === "cursor" && !ev.shiftKey) {
        rulerStart = null;
        rulerEnd = null;
        rulerPinned = false;
        rulerDragOrigin = null;
        setRulerActive(false);
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }
      const tool =
        (ev.shiftKey || (rulerStart !== null && !rulerPinned)) && activeToolRef.current === "cursor"
          ? "ruler"
          : activeToolRef.current;
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

      const anchor = toAnchorFromPointer(ev.clientX, ev.clientY, {
        shiftKey: ev.shiftKey,
        metaKey: ev.metaKey,
        ctrlKey: ev.ctrlKey,
        tool,
        originAnchor: draftAnchors[draftAnchors.length - 1],
      });
      if (!anchor) return;

      if (tool === "ruler") {
        if (!rulerStart || rulerPinned) {
          rulerStart = anchor;
          rulerEnd = anchor;
          rulerPinned = false;
          setRulerActive(true);
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

      // Keep living NESW dotted crosshair lines active whenever pointerSurface is handling hover
      const tool = activeToolRef.current;
      const isDrawingSurfaceActive = tool !== "cursor" || shiftPressedRef.current;
      if (isDrawingSurfaceActive) {
        lastDrawingPointerClient = {
          clientX: ev.clientX,
          clientY: ev.clientY,
          shiftKey: ev.shiftKey,
        };
        let cx = px;
        let cy = py;
        const magnetNow = baseMagnetRef.current !== Boolean(ev.metaKey || ev.ctrlKey);
        if (magnetNow && !zoomBox) {
          const snapped = toAnchorFromPointer(ev.clientX, ev.clientY, {
            shiftKey: ev.shiftKey,
            metaKey: ev.metaKey,
            ctrlKey: ev.ctrlKey,
            tool,
            originAnchor: draftAnchors.length > 0 ? draftAnchors[draftAnchors.length - 1] : undefined,
          });
          if (snapped) {
            const sy = candleSeries.priceToCoordinate(Number(snapped.priceTick) * tickFloat);
            const sx = timeSecToCoordinateExt(chart, activeCandles, snapped.timeSec, barSecStep);
            if (sy !== null && Number.isFinite(Number(sy))) cy = Number(sy);
            if (sx !== null && Number.isFinite(sx)) cx = sx;
          }
        }
        drawingCrosshairPx = { x: cx, y: cy };
        chart.clearCrosshairPosition();
        pendingPrimitiveDirty = true;
        scheduleFlush();
      } else if (drawingCrosshairPx !== null) {
        drawingCrosshairPx = null;
        pendingPrimitiveDirty = true;
        scheduleFlush();
      }

      if (zoomBox) {
        zoomBox = { ...zoomBox, x2: px, y2: py };
        pendingPrimitiveDirty = true;
        scheduleFlush();
        return;
      }

      if (rulerStart && !rulerPinned) {
        const nextAnchor = toAnchorFromPointer(ev.clientX, ev.clientY, { metaKey: ev.metaKey, ctrlKey: ev.ctrlKey });
        if (nextAnchor) {
          rulerEnd = nextAnchor;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
        return;
      }

      if (tool === "cursor" || draftAnchors.length === 0) return;

      const meta = getDrawingToolMeta(tool);
      if (meta.interaction === "freehand" && isFreehandDrawing) {
        if (lastFreehandPx && Math.hypot(px - lastFreehandPx.x, py - lastFreehandPx.y) < 4) {
          return;
        }
        const nextAnchor = toAnchorFromPointer(ev.clientX, ev.clientY, { metaKey: ev.metaKey, ctrlKey: ev.ctrlKey });
        if (nextAnchor) {
          draftAnchors.push(nextAnchor);
          lastFreehandPx = { x: px, y: py };
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
        return;
      }

      hoverAnchor = toAnchorFromPointer(ev.clientX, ev.clientY, {
        shiftKey: ev.shiftKey,
        metaKey: ev.metaKey,
        ctrlKey: ev.ctrlKey,
        tool,
        originAnchor: draftAnchors[draftAnchors.length - 1],
      });
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
          const nextAnchor = toAnchorFromPointer(ev.clientX, ev.clientY, { metaKey: ev.metaKey, ctrlKey: ev.ctrlKey });
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
        drawingCrosshairPx = null;
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
        if (activeToolRef.current === "cursor" && drawingCrosshairPx !== null) {
          drawingCrosshairPx = null;
          pendingPrimitiveDirty = true;
          scheduleFlush();
        }
      }
    };

    requestOverlayRedrawRef.current = () => {
      primitive.requestUpdate();
    };

    syncCrosshairMagnetRef.current = () => {
      const tool = activeToolRef.current;
      if (tool === "cursor" && !shiftPressedRef.current) {
        if (!lastCrosshairHover) return;
        const rawPrice = candleSeries.coordinateToPrice(lastCrosshairHover.rawY);
        if (rawPrice === null || !Number.isFinite(rawPrice)) return;
        const nextPrice = magnetRef.current
          ? resolveSnapPriceForBar(rawPrice, lastCrosshairHover.bar)
          : rawPrice;
        lastCrosshairPriceRef.current = nextPrice;
        try {
          chart.setCrosshairPosition(nextPrice, lastCrosshairHover.time, candleSeries);
        } catch {
          // Ignore if bar time is not currently indexed
        }
        return;
      }
      if (lastDrawingPointerClient && !zoomBox) {
        const rect = el.getBoundingClientRect();
        let cx = lastDrawingPointerClient.clientX - rect.left;
        let cy = lastDrawingPointerClient.clientY - rect.top;
        if (magnetRef.current) {
          const snapped = toAnchorFromPointer(
            lastDrawingPointerClient.clientX,
            lastDrawingPointerClient.clientY,
            {
              shiftKey: lastDrawingPointerClient.shiftKey,
              metaKey: cmdHeldRef.current,
              ctrlKey: false,
              tool,
              originAnchor: draftAnchors.length > 0 ? draftAnchors[draftAnchors.length - 1] : undefined,
            },
          );
          if (snapped) {
            const sy = candleSeries.priceToCoordinate(Number(snapped.priceTick) * tickFloat);
            const sx = timeSecToCoordinateExt(chart, activeCandles, snapped.timeSec, barSecStep);
            if (sy !== null && Number.isFinite(Number(sy))) cy = Number(sy);
            if (sx !== null && Number.isFinite(sx)) cx = sx;
          }
        }
        drawingCrosshairPx = { x: cx, y: cy };
        pendingPrimitiveDirty = true;
        scheduleFlush();
      }
    };

    const toPixel = (anchor: AnchorPoint): { x: number | null; y: number | null } => {
      const xCoord = timeSecToCoordinateExt(chart, activeCandles, anchor.timeSec, barSecStep);
      const yCoord = candleSeries.priceToCoordinate(Number(anchor.priceTick) * tickFloat);
      return {
        x: xCoord,
        y: yCoord === null ? null : Number(yCoord),
      };
    };

    let dragState: {
      drawingId: string;
      hitKind: "anchor" | "body";
      anchorIndex: number;
      rectangleHandle?: RectangleHandle;
      startAnchor: AnchorPoint;
      origAnchors: AnchorPoint[];
      moved: boolean;
    } | null = null;

    const getVisibleDrawingsForHit = (): DrawingObject[] => {
      if (drawingsHiddenRef.current) return [];
      return drawingEngineRef.current!
        .list(symbol)
        .filter((d) => !d.hidden && isTimeframeVisible(timeframe, d.visibility, barType));
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
      const startAnchor = toAnchorFromPointer(ev.clientX, ev.clientY, { metaKey: ev.metaKey, ctrlKey: ev.ctrlKey });
      if (!startAnchor) return;

      ev.stopPropagation();
      ev.preventDefault();
      dragState = {
        drawingId: hit.drawing.id,
        hitKind: hit.hitKind,
        anchorIndex: hit.anchorIndex,
        rectangleHandle: hit.rectangleHandle,
        startAnchor,
        origAnchors: hit.drawing.anchors.map((a) => ({ ...a })),
        moved: false,
      };
    };

    const onHostPointerMoveWindow = (ev: PointerEvent) => {
      if (!dragState) return;
      const cur = toAnchorFromPointer(ev.clientX, ev.clientY, { metaKey: ev.metaKey, ctrlKey: ev.ctrlKey });
      if (!cur) return;
      ev.preventDefault();
      let nextAnchors: AnchorPoint[];
      if (dragState.rectangleHandle) {
        nextAnchors = resizeRectangle(dragState.origAnchors, dragState.rectangleHandle, cur);
      } else if (dragState.hitKind === "anchor" && dragState.anchorIndex >= 0) {
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

    const onPointerLeave = () => {
      lastDrawingPointerClient = null;
      if (drawingCrosshairPx !== null) {
        drawingCrosshairPx = null;
        pendingPrimitiveDirty = true;
        scheduleFlush();
      }
    };

    pointerSurface.addEventListener("pointerdown", onPointerDown);
    pointerSurface.addEventListener("pointermove", onPointerMove);
    pointerSurface.addEventListener("pointerup", onPointerUp);
    pointerSurface.addEventListener("pointerleave", onPointerLeave);
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
      syncCrosshairMagnetRef.current = null;
      tpoRef.current = null;
      el.removeEventListener("pointerdown", onHostPointerDownCapture, { capture: true });
      el.removeEventListener("dblclick", onHostDoubleClickCapture, { capture: true });
      window.removeEventListener("pointermove", onHostPointerMoveWindow);
      window.removeEventListener("pointerup", onHostPointerUpWindow);
      window.removeEventListener("keydown", onDeleteSelectedKey);
      pointerSurface.removeEventListener("pointerdown", onPointerDown);
      pointerSurface.removeEventListener("pointermove", onPointerMove);
      pointerSurface.removeEventListener("pointerup", onPointerUp);
      pointerSurface.removeEventListener("pointerleave", onPointerLeave);
      pointerSurface.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      candleSeries.detachPrimitive(primitive);
      priceLinesRef.current = [];
      alertPriceLinesRef.current.clear();
      studyLineSeriesRef.current.clear();
      vwapBandSeriesRef.current.clear();
      vwapFillsRef.current = [];
      studyPanesRef.current.clear();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      volumeRefreshRef.current = null;
      overlay.dispose();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeWithAlerts);
      syncAlertBadgePositionsRef.current = () => {};
      emitDataWindowRef.current = () => {};
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, symbol, timeframe, tickSizeE9, dataSource, barType]);

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
    const fills: VwapFill[] = [];
    const wantedBands = new Set<string>();
    const bandSeries = vwapBandSeriesRef.current;
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
      const visible = !hiddenStudyIds.has(st.id) && isTimeframeVisible(timeframe, st.visibility, barType)
        && !(st.vwap?.hideOnDaily && timeframeToSeconds(timeframe) >= 86_400);
      const scale = effectiveSettings.scales.scalesPlacement === "left" ? "left" : "right";
      const vwap = st.vwap;
      const vwapValues = vwap ? calculateVwap(latestCandlesRef.current, volumeHistoryRef.current, timeframe, st.source ?? "hlc3", vwap) : null;
      const plotTimes = vwapValues && vwapValues.length > times.length && times.length > 0 ? [...times] : times;
      while (plotTimes.length > 0 && vwapValues && plotTimes.length < vwapValues.length) {
        plotTimes.push(timeframeBucketCloseSec(plotTimes[plotTimes.length - 1], timeframe) as UTCTimestamp);
      }
      if (vwap && vwapValues && visible && plotTimes.length) {
        for (const [index, band] of vwap.bands.entries()) {
          if (!band.enabled) continue;
          if (band.fill) fills.push({ color: band.fillColor, opacity: band.fillOpacity,
            points: vwapValues.map((point, i) => point && ({
              time: plotTimes[i], anchor: point.anchor,
              lower: point.value - point.distance * band.multiplier,
              upper: point.value + point.distance * band.multiplier,
            })) });
          for (const direction of ["upper", "lower"] as const) {
            if (!band[direction]) continue;
            const key = `${st.id}:${index}:${direction}`;
            wantedBands.add(key);
            let line = bandSeries.get(key);
            if (!line) {
              line = chart.addSeries(LineSeries, { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
              bandSeries.set(key, line);
            }
            const style = band[`${direction}Style`];
            line.applyOptions({ priceScaleId: scale, color: band[`${direction}Color`], lineWidth: 1,
              lineStyle: style === "dashed" ? LineStyle.Dashed : style === "dotted" ? LineStyle.Dotted : LineStyle.Solid });
            line.setData(vwapValues.map((point, i) => point ? {
              time: plotTimes[i], value: point.value + point.distance * band.multiplier * (direction === "upper" ? 1 : -1),
            } : { time: plotTimes[i] }));
          }
        }
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
        visible: visible && vwap?.showLine !== false,
        ...(isOverlay ? { priceScaleId: scale } : {}),
        priceFormat: st.precision === undefined ? { type: "price" } : { type: "price", precision: st.precision, minMove: 10 ** -st.precision },
        lastValueVisible:
          (st.showPriceLabel ?? true) &&
          effectiveSettings.scales.indicatorsLabel === "value",
      });
      const values = vwapValues ? vwapValues.map((point) => point?.value ?? null) : st.values;
      const n = Math.min(plotTimes.length, values.length);
      const pts: LineData<UTCTimestamp>[] = [];
      for (let i = 0; i < n; i++) {
        const v = values[i];
        if (v !== null && Number.isFinite(v)) {
          pts.push({ time: plotTimes[i], value: v });
        }
      }
      const lastNonNull = [...values].reverse().find((v): v is number => v !== null && Number.isFinite(v));
      if (lastNonNull !== undefined) {
        latestMap.set(st.id, lastNonNull);
      }
      series.setData(pts);
    }
    for (const [key, line] of bandSeries) {
      if (!wantedBands.has(key)) {
        chart.removeSeries(line);
        bandSeries.delete(key);
      }
    }
    vwapFillsRef.current = fills;
    requestOverlayRedrawRef.current?.();
    studyLatestRef.current = latestMap;
  }, [studyOverlays, hiddenStudyIds, symbol, timeframe, dataSource, barType, effectiveSettings.scales.indicatorsLabel, effectiveSettings.scales.scalesPlacement]);

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
    let tpoMergeDay: number | undefined;
    let price = latestCandlesRef.current[latestCandlesRef.current.length - 1]?.close ?? symMeta.basePrice;
    if (el && cs) {
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const computed = cs.coordinateToPrice(y);
      if (computed !== null && Number.isFinite(computed)) {
        price = computed;
      }
    }
    const chart = chartApiRef.current;
    const tpo = tpoRef.current;
    const { settings, merges } = tpoOptionsRef.current;
    const range = chart?.timeScale().getVisibleRange();
    if (el && cs && chart && tpo && visibilityRef.current.tpo &&
        (!settings.intradayOnly || timeframeToSeconds(timeframe) < 86_400) &&
        typeof range?.from === "number" && typeof range.to === "number") {
      const rect = el.getBoundingClientRect();
      const tickSize = Number(tickSizeE9) / 1e9;
      const profile = hitTestTpoProfile(
        tpo.visible(range.from, range.to, merges, settings.valueArea, settings.blockMinutes),
        {
          timeToX: (time) => timeSecToCoordinateExt(chart, latestCandlesRef.current, time, timeframeToSeconds(timeframe)),
          priceToY: (price) => cs.priceToCoordinate(price),
        },
        tickSize,
        chart.timeScale().width(),
        e.clientX - rect.left - chart.priceScale("left").width(),
        e.clientY - rect.top,
      );
      if (profile) {
        const day = alignTimeSecToTimeframe(profile.time, "D");
        if (tpo.days().some((previous) => previous < day)) tpoMergeDay = day;
      }
    }
    const menuWidth = 296;
    const menuHeight = tpoMergeDay === undefined ? 464 : 498;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight));
    setContextMenu({
      x,
      y,
      price,
      formattedPrice: formatPriceValue(price),
      tpoMergeDay,
    });
  };

  const updateTpoMerges = (merges: number[]) => {
    setTpoMergesBySymbol((current) => ({ ...current, [symbol]: merges }));
    saveTpoPreference(`merges.${symbol}`, merges);
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
      window.localStorage?.setItem("allegedly.floating_bar_pos.v2", JSON.stringify(finalPos));
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
      window.localStorage?.setItem("allegedly.floating_bar_pos.v2", JSON.stringify(next));
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
          magnetEnabled={effectiveMagnet}
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
            <div data-trade-buttons={new URLSearchParams(window.location.search).get("tradeButtons") || "filled"} className="pointer-events-none mt-0.5 flex items-center gap-1.5">
              <UiButton variant="ghost" size="xs"
                type="button"
                onClick={() => {
                  onSubmitOrderAtPrice?.("sell", "market");
                  showToast(`Sell 1 ${symbol} market submitted`);
                }}
                className={"pointer-events-auto " + (new URLSearchParams(window.location.search).get("tradeButtons") === "outline" ? "h-7 rounded-md border border-white/15 bg-[#16181f] px-3 text-[11px] text-[#ef8b8b] hover:bg-white/10" : new URLSearchParams(window.location.search).get("tradeButtons") === "split" ? "h-8 rounded-l-md rounded-r-none border-l-2 border-[#e97777] bg-[#202126] px-3 text-[11px] text-[#f4f4f5] hover:bg-[#303136]" : new URLSearchParams(window.location.search).get("tradeButtons") === "filled" ? "h-8 rounded-md bg-[#ad454b] px-3 text-[11px] text-white hover:bg-[#c4565b]" : "h-8 rounded-md bg-[#ad454b] px-3 text-[11px] text-white hover:bg-[#c4565b]")}
              >
                SELL MKT
              </UiButton>
              <UiButton variant="ghost" size="xs"
                type="button"
                onClick={() => {
                  onSubmitOrderAtPrice?.("buy", "market");
                  showToast(`Buy 1 ${symbol} market submitted`);
                }}
                className={"pointer-events-auto " + (new URLSearchParams(window.location.search).get("tradeButtons") === "outline" ? "h-7 rounded-md border border-white/15 bg-[#16181f] px-3 text-[11px] text-[#7fcbb1] hover:bg-white/10" : new URLSearchParams(window.location.search).get("tradeButtons") === "split" ? "-ml-1.5 h-8 rounded-l-none rounded-r-md border-l border-l-white/10 border-r-2 border-r-[#6dbd9e] bg-[#202126] px-3 text-[11px] text-[#f4f4f5] hover:bg-[#303136]" : new URLSearchParams(window.location.search).get("tradeButtons") === "filled" ? "h-8 rounded-md bg-[#28785f] px-3 text-[11px] text-white hover:bg-[#348e70]" : "h-8 rounded-md bg-[#28785f] px-3 text-[11px] text-white hover:bg-[#348e70]")}
              >
                BUY MKT
              </UiButton>
            </div>
          )}

          {effectiveSettings.statusLine.indicatorTitles && (
            <ActiveIndicatorsLegend
              studyOverlays={studyOverlays}
              hiddenStudyIds={hiddenStudyIds}
              showVolumeRow={showVolume}
              volumeHidden={volumeHidden || !isTimeframeVisible(timeframe, volumeConfig.visibility, barType)}
              volumeValues={volumeConfig.showStatusValue !== false}
              volumeLabel={volumeConfig.showStatusInputs !== false && volumeConfig.volume?.showAverage ? `Vol (${volumeConfig.period})` : "Vol"}
              onOpenVolumeSettings={() => setVolumeSettingsOpen(true)}
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
                ...(visibility.vwapKeyLevels
                  ? [
                      {
                        key: "vwapKeyLevels" as const,
                        label: `VWAP Key Levels (${vwapKeyLevelsConfig.source})`,
                        badge: "M/PW/W",
                        color: vwapKeyLevelsConfig.monthVwapColor,
                      },
                    ]
                  : []),
                ...(visibility.tradingSessions
                  ? [
                      {
                        key: "tradingSessions" as const,
                        label: `Trading Sessions (${tradingSessionsConfig.timezone.replace("America/", "").replace("Etc/", "").replace("_", " ")})`,
                        badge: /^(\d+)(s|m|h)$/i.test(timeframe) ? "TYO/LDN/NY" : "Intraday",
                        color: tradingSessionsConfig.newYorkColor,
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
              onOpenOrderflowSettings={openOrderflowSettingsByKey}
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
                : "absolute bottom-9 left-1/2 z-25 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[#2a2e39] bg-[#1e222d]/95 px-1.5 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.62)] backdrop-blur-md select-none"
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
            activeTool === "cursor" && !shiftHeld && !rulerActive
              ? "pointer-events-none absolute inset-0 z-15 h-full w-full"
              : "pointer-events-auto absolute inset-0 z-15 h-full w-full cursor-crosshair"
          }
        />

        <IndicatorSettingsDialog open={volumeSettingsOpen} onOpenChange={setVolumeSettingsOpen} config={volumeConfig}
          onSave={(next) => {
            setVolumeConfig(next);
            try { localStorage.setItem("allegedly.volume.settings", JSON.stringify(next)); } catch { /* Storage can be unavailable. */ }
          }} />

        <TpoSettingsDialog
          key={symbol}
          open={tpoSettingsOpen}
          onOpenChange={setTpoSettingsOpen}
          settings={tpoSettings}
          onChange={(next) => {
            setTpoSettings(next);
            saveTpoPreference("settings", next);
          }}
          days={tpoDays}
          merges={tpoMerges}
          onMergesChange={updateTpoMerges}
        />

        <VwapKeyLevelsSettingsDialog
          open={vwapKeyLevelsSettingsOpen}
          config={vwapKeyLevelsConfig}
          onOpenChange={setVwapKeyLevelsSettingsOpen}
          onChange={(next) => {
            setVwapKeyLevelsConfig(next);
            saveStoredVwapKeyLevelsConfig(next);
            vwapKeyLevelsConfigRef.current = next;
            requestOverlayRedrawRef.current?.();
          }}
        />

        <TradingSessionsSettingsDialog
          open={tradingSessionsSettingsOpen}
          config={tradingSessionsConfig}
          onOpenChange={setTradingSessionsSettingsOpen}
          onChange={(next) => {
            setTradingSessionsConfig(next);
            saveStoredTradingSessionsConfig(next);
            tradingSessionsConfigRef.current = next;
            requestOverlayRedrawRef.current?.();
          }}
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
            <button
              type="button"
              aria-label="Price scale settings menu"
              aria-expanded={scaleMenuOpen}
              title="Price scale & overlay options"
              onClick={() => setScaleMenuOpen((o) => !o)}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#2a2f3d] bg-[#14171f]/90 text-[#9aa1b2] hover:bg-[#222633] hover:text-white"
            >
              <SettingsCogIcon className="h-3.5 w-3.5" />
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

        {/* Floating Interactive Alert Line Pills (60fps imperative Y-sync) */}
        {effectiveSettings.alerts.alertLines &&
          alerts
            .filter((al) => al.symbol === symbol && getAlertPrimaryPrice(al) !== null)
            .map((al) => {
              const digits = getPrecisionDigits(effectiveSettings, symMeta.decimals);
              const label =
                al.message.trim() ||
                formatAlertConditionSummary(al.symbol, al.conditions, digits);
              const accent =
                al.status === "active"
                  ? (al.color || effectiveSettings.alerts.alertLineColor)
                  : "#787b86";
              return (
                <div
                  key={al.id}
                  ref={(node) => {
                    if (node) alertBadgeRefs.current.set(al.id, node);
                    else alertBadgeRefs.current.delete(al.id);
                  }}
                  style={{ display: "none", touchAction: "none" }}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || (event.target as HTMLElement).closest('button[aria-label]')) return;
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    alertDragRef.current = { id: al.id, startY: event.clientY, moved: false, price: null };
                  }}
                  onPointerMove={(event) => {
                    const drag = alertDragRef.current;
                    const container = chartContainerRef.current;
                    if (!drag || drag.id !== al.id || !container) return;
                    if (Math.abs(event.clientY - drag.startY) < 3 && !drag.moved) return;
                    drag.moved = true;
                    const y = event.clientY - container.getBoundingClientRect().top;
                    const price = candleSeriesRef.current?.coordinateToPrice(y);
                    if (price == null || !Number.isFinite(price)) return;
                    drag.price = price;
                    alertPriceLinesRef.current.get(al.id)?.applyOptions({ price });
                    const readout = event.currentTarget.querySelector<HTMLElement>("[data-alert-drag-price]");
                    if (readout) {
                      readout.textContent = price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
                      readout.hidden = false;
                    }
                    event.currentTarget.style.transform = `translate3d(0, ${Math.round(y - 12)}px, 0)`;
                  }}
                  onPointerUp={(event) => {
                    const drag = alertDragRef.current;
                    alertDragRef.current = null;
                    const readout = event.currentTarget.querySelector<HTMLElement>("[data-alert-drag-price]");
                    if (readout) readout.hidden = true;
                    if (!drag?.moved || drag.price === null) return;
                    suppressAlertClickRef.current = true;
                    const price = Number(drag.price.toFixed(getPrecisionDigits(effectiveSettings, symMeta.decimals)));
                    if (onMoveAlert) onMoveAlert(al.id, price);
                    else setLocalAlerts((previous) => previous.map((item) => {
                      if (item.id !== al.id) return item;
                      const index = item.conditions.findIndex((condition) => condition.valueType === "value" && Number.isFinite(condition.value));
                      return { ...item, conditions: item.conditions.map((condition, i) => i === index ? { ...condition, value: price } : condition) };
                    }));
                    event.stopPropagation();
                  }}
                  onPointerCancel={(event) => {
                    alertDragRef.current = null;
                    const originalPrice = getAlertPrimaryPrice(al);
                    if (originalPrice !== null) alertPriceLinesRef.current.get(al.id)?.applyOptions({ price: originalPrice });
                    const readout = event.currentTarget.querySelector<HTMLElement>("[data-alert-drag-price]");
                    if (readout) readout.hidden = true;
                    syncAlertBadgePositionsRef.current();
                  }}
                  className="group/alertpill pointer-events-auto absolute right-[82px] top-0 z-20 flex min-h-6 cursor-ns-resize items-center gap-1 rounded-md border border-[var(--app-border,#323848)] bg-[var(--app-surface-bg,#1e222d)] px-2 py-0.5 text-[11px] font-medium text-[#e0e3eb] shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-colors hover:border-[#596171]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (suppressAlertClickRef.current) { suppressAlertClickRef.current = false; return; }
                      onEditAlert?.(al);
                    }}
                    title={`Edit alert: ${label}`}
                    className="flex items-center gap-1.5 text-left hover:text-white focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      style={{ backgroundColor: accent }}
                      className="h-2 w-2 shrink-0 rounded-full"
                    />
                    <span className="max-w-[230px] truncate">{label}</span>
                  </button>
                  <span data-alert-drag-price hidden className="rounded bg-[var(--app-panel-bg,#181c27)] px-1.5 py-0.5 font-mono tabular-nums text-[#f0f3fa]" />
                  {onEditAlert && (
                    <button
                      type="button"
                      title="Edit alert"
                      aria-label={`Edit alert ${label}`}
                      onClick={() => onEditAlert(al)}
                      className="hidden h-5 w-5 items-center justify-center rounded-md text-[#a1a7b4] hover:bg-[var(--app-panel-bg,#2a2e39)] hover:text-white group-hover/alertpill:flex focus-visible:flex"
                    >
                      <SettingsCogIcon className="h-2.5 w-2.5" />
                    </button>
                  )}
                  {onDeleteAlert && (
                    <button
                      type="button"
                      title="Delete alert"
                      aria-label={`Delete alert ${label}`}
                      onClick={() => onDeleteAlert(al.id)}
                      className="hidden h-5 w-5 items-center justify-center rounded-md text-[#a1a7b4] hover:bg-[var(--app-panel-bg,#2a2e39)] hover:text-rose-400 group-hover/alertpill:flex focus-visible:flex"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}

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
            drawingCount={historyMeta.count}
            onRemoveDrawings={handleClear}
            lockCursorByTime={lockCursorByTime}
            tableViewOpen={tableViewOpen}
            templates={chartTemplates}
            onClose={() => setContextMenu(null)}
            onMergeTpoProfile={(day) => updateTpoMerges([...new Set([...tpoMerges, day])])}
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
              handleAddAlert(price);
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
          barTimes={drawingSettingsOpen ? latestCandlesRef.current.map((c) => Number(c.time)) : undefined}
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
