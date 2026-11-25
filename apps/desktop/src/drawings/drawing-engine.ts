export type DrawingToolKind =
  | "cursor"
  | "ruler"
  | "zoom_in"
  // Lines
  | "trendline"
  | "ray"
  | "info_line"
  | "extended_line"
  | "trend_angle"
  | "horizontal_line"
  | "horizontal_ray"
  | "vertical_line"
  | "crossline"
  // Fibonacci & Pitchforks
  | "fib_retracement"
  | "fib_extension"
  | "fib_channel"
  | "fib_time_zone"
  | "fib_fan"
  | "fib_trend_time"
  | "fib_circles"
  | "fib_spiral"
  | "fib_arcs"
  | "fib_wedge"
  | "pitchfan"
  // Chart Patterns, Elliott Waves & Cycles
  | "xabcd_pattern"
  | "cypher_pattern"
  | "head_and_shoulders"
  | "abcd_pattern"
  | "triangle_pattern"
  | "three_drives"
  | "elliott_impulse"
  | "elliott_correction"
  | "elliott_triangle"
  | "elliott_double_combo"
  | "elliott_triple_combo"
  | "cyclic_lines"
  | "time_cycles"
  | "sine_line"
  // Forecasting, Volume-Based & Measurers
  | "long_position"
  | "short_position"
  | "position_forecast"
  | "bars_pattern"
  | "ghost_feed"
  | "sector"
  | "anchored_vwap"
  | "fixed_range_vp"
  | "anchored_vp"
  | "price_range"
  | "date_range"
  | "date_price_range"
  // Brushes, Arrows & Shapes
  | "brush"
  | "highlighter"
  | "arrow_marker"
  | "arrow"
  | "arrow_mark_up"
  | "arrow_mark_down"
  | "box_zone"
  | "rotated_rectangle"
  | "path"
  | "circle"
  | "ellipse"
  | "polyline"
  | "triangle"
  | "arc"
  | "curve"
  | "double_curve"
  // Text, Notes & Content
  | "text"
  | "note"
  | "price_note"
  | "pin"
  | "table"
  | "callout"
  | "comment"
  | "price_label"
  | "signpost"
  | "flag_mark"
  | "image_annotation"
  | "post_annotation"
  | "idea_annotation"
  // Icons / Stamps
  | "icon_stamp";

export type PlacedDrawingKind = Exclude<DrawingToolKind, "cursor" | "ruler" | "zoom_in">;

export type ToolSlotId =
  | "lines"
  | "fibs"
  | "patterns"
  | "forecast"
  | "shapes"
  | "text"
  | "icons";

export type ToolInteractionMode =
  | "transient"
  | "points"
  | "freehand"
  | "multipoint"
  | "text";

export interface DrawingToolMeta {
  kind: DrawingToolKind;
  label: string;
  shortLabel: string;
  slot?: ToolSlotId;
  section?: string;
  requiredAnchors: number;
  interaction: ToolInteractionMode;
  defaultColor: string;
  shortcut?: string;
}

export interface AnchorPoint {
  /** Unix timestamp in seconds (LWC UTCTimestamp) */
  timeSec: number;
  /** Exact integer price tick (SV-17 / SV-08) */
  priceTick: bigint;
}

export interface DrawingObject {
  id: string;
  kind: PlacedDrawingKind;
  symbol: string;
  anchors: AnchorPoint[];
  color: string;
  label?: string;
}

export interface MagnetTarget {
  priceTick: bigint;
  source: "ohlc" | "tpo_poc" | "tpo_vah" | "tpo_val";
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const FIB_EXT_LEVELS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2.618] as const;

export const ICON_STAMP_CHOICES = [
  "♡",
  "★",
  "✓",
  "▲",
  "▼",
  "⚡",
  "🎯",
  "⚑",
  "⚠",
  "💎",
  "🔥",
  "⛔",
] as const;

export const DEFAULT_FAVORITE_TOOLS: readonly PlacedDrawingKind[] = [
  "box_zone",
  "path",
  "trendline",
  "horizontal_ray",
  "fixed_range_vp",
  "fib_retracement",
  "short_position",
  "long_position",
  "anchored_vwap",
  "brush",
  "text",
  "anchored_vp",
];

export const DRAWING_SLOTS: ReadonlyArray<{
  id: ToolSlotId;
  label: string;
  defaultTool: PlacedDrawingKind;
  sections: readonly string[];
}> = [
  {
    id: "lines",
    label: "Trend Line Tools",
    defaultTool: "trendline",
    sections: ["LINES"],
  },
  {
    id: "fibs",
    label: "Gann and Fibonacci Tools",
    defaultTool: "fib_retracement",
    sections: ["FIBONACCI"],
  },
  {
    id: "patterns",
    label: "Patterns, Elliott Waves & Cycles",
    defaultTool: "xabcd_pattern",
    sections: ["CHART PATTERNS", "ELLIOTT WAVES", "CYCLES"],
  },
  {
    id: "forecast",
    label: "Forecasting, Volume & Measurers",
    defaultTool: "long_position",
    sections: ["FORECASTING", "VOLUME-BASED", "MEASURERS"],
  },
  {
    id: "shapes",
    label: "Brushes, Arrows & Shapes",
    defaultTool: "brush",
    sections: ["BRUSHES", "ARROWS", "SHAPES"],
  },
  {
    id: "text",
    label: "Annotation & Content Tools",
    defaultTool: "text",
    sections: ["TEXT AND NOTES", "CONTENT"],
  },
  {
    id: "icons",
    label: "Icons & Stickers",
    defaultTool: "icon_stamp",
    sections: ["ICONS"],
  },
];

export const DRAWING_TOOL_META: ReadonlyArray<DrawingToolMeta> = [
  { kind: "cursor", label: "Crosshair", shortLabel: "Cursor", requiredAnchors: 0, interaction: "transient", defaultColor: "#e4e4e7" },
  { kind: "ruler", label: "Measure", shortLabel: "Ruler", requiredAnchors: 0, interaction: "transient", defaultColor: "#f23645" },
  { kind: "zoom_in", label: "Zoom In", shortLabel: "Zoom", requiredAnchors: 0, interaction: "transient", defaultColor: "#38bdf8" },

  // LINES
  { kind: "trendline", label: "Trendline", shortLabel: "Trendline", slot: "lines", section: "LINES", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8", shortcut: "⌥T" },
  { kind: "ray", label: "Ray", shortLabel: "Ray", slot: "lines", section: "LINES", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "info_line", label: "Info line", shortLabel: "Info Line", slot: "lines", section: "LINES", requiredAnchors: 2, interaction: "points", defaultColor: "#60a5fa" },
  { kind: "extended_line", label: "Extended line", shortLabel: "Extended", slot: "lines", section: "LINES", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "trend_angle", label: "Trend angle", shortLabel: "Angle", slot: "lines", section: "LINES", requiredAnchors: 2, interaction: "points", defaultColor: "#818cf8" },
  { kind: "horizontal_line", label: "Horizontal line", shortLabel: "H-Line", slot: "lines", section: "LINES", requiredAnchors: 1, interaction: "points", defaultColor: "#f59e0b", shortcut: "⌥H" },
  { kind: "horizontal_ray", label: "Horizontal ray", shortLabel: "H-Ray", slot: "lines", section: "LINES", requiredAnchors: 1, interaction: "points", defaultColor: "#f59e0b", shortcut: "⌥J" },
  { kind: "vertical_line", label: "Vertical line", shortLabel: "V-Line", slot: "lines", section: "LINES", requiredAnchors: 1, interaction: "points", defaultColor: "#94a3b8", shortcut: "⌥V" },
  { kind: "crossline", label: "Crossline", shortLabel: "Cross", slot: "lines", section: "LINES", requiredAnchors: 1, interaction: "points", defaultColor: "#94a3b8", shortcut: "⌥C" },

  // FIBONACCI
  { kind: "fib_retracement", label: "Fib retracement", shortLabel: "Fib", slot: "fibs", section: "FIBONACCI", requiredAnchors: 2, interaction: "points", defaultColor: "#a78bfa", shortcut: "⌥F" },
  { kind: "fib_extension", label: "Trend-based fib extension", shortLabel: "Fib Ext", slot: "fibs", section: "FIBONACCI", requiredAnchors: 3, interaction: "points", defaultColor: "#c084fc" },
  { kind: "fib_channel", label: "Fib channel", shortLabel: "Fib Ch", slot: "fibs", section: "FIBONACCI", requiredAnchors: 3, interaction: "points", defaultColor: "#a78bfa" },
  { kind: "fib_time_zone", label: "Fib time zone", shortLabel: "Fib Time", slot: "fibs", section: "FIBONACCI", requiredAnchors: 2, interaction: "points", defaultColor: "#818cf8" },
  { kind: "fib_fan", label: "Fib speed resistance fan", shortLabel: "Fib Fan", slot: "fibs", section: "FIBONACCI", requiredAnchors: 2, interaction: "points", defaultColor: "#a78bfa" },
  { kind: "fib_trend_time", label: "Trend-based fib time", shortLabel: "T-Fib Time", slot: "fibs", section: "FIBONACCI", requiredAnchors: 3, interaction: "points", defaultColor: "#818cf8" },
  { kind: "fib_circles", label: "Fib circles", shortLabel: "Fib Circ", slot: "fibs", section: "FIBONACCI", requiredAnchors: 2, interaction: "points", defaultColor: "#c084fc" },
  { kind: "fib_spiral", label: "Fib spiral", shortLabel: "Fib Spiral", slot: "fibs", section: "FIBONACCI", requiredAnchors: 2, interaction: "points", defaultColor: "#a78bfa" },
  { kind: "fib_arcs", label: "Fib speed resistance arcs", shortLabel: "Fib Arcs", slot: "fibs", section: "FIBONACCI", requiredAnchors: 2, interaction: "points", defaultColor: "#a78bfa" },
  { kind: "fib_wedge", label: "Fib wedge", shortLabel: "Fib Wedge", slot: "fibs", section: "FIBONACCI", requiredAnchors: 2, interaction: "points", defaultColor: "#818cf8" },
  { kind: "pitchfan", label: "Pitchfan", shortLabel: "Pitchfan", slot: "fibs", section: "FIBONACCI", requiredAnchors: 3, interaction: "points", defaultColor: "#38bdf8" },

  // PATTERNS, ELLIOTT WAVES & CYCLES
  { kind: "xabcd_pattern", label: "XABCD pattern", shortLabel: "XABCD", slot: "patterns", section: "CHART PATTERNS", requiredAnchors: 5, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "cypher_pattern", label: "Cypher pattern", shortLabel: "Cypher", slot: "patterns", section: "CHART PATTERNS", requiredAnchors: 5, interaction: "points", defaultColor: "#2dd4bf" },
  { kind: "head_and_shoulders", label: "Head and shoulders", shortLabel: "H&S", slot: "patterns", section: "CHART PATTERNS", requiredAnchors: 5, interaction: "points", defaultColor: "#fbbf24" },
  { kind: "abcd_pattern", label: "ABCD pattern", shortLabel: "ABCD", slot: "patterns", section: "CHART PATTERNS", requiredAnchors: 4, interaction: "points", defaultColor: "#60a5fa" },
  { kind: "triangle_pattern", label: "Triangle pattern", shortLabel: "Tri Pat", slot: "patterns", section: "CHART PATTERNS", requiredAnchors: 4, interaction: "points", defaultColor: "#a78bfa" },
  { kind: "three_drives", label: "Three drives pattern", shortLabel: "3 Drives", slot: "patterns", section: "CHART PATTERNS", requiredAnchors: 6, interaction: "points", defaultColor: "#34d399" },

  { kind: "elliott_impulse", label: "Elliott impulse wave (12345)", shortLabel: "12345", slot: "patterns", section: "ELLIOTT WAVES", requiredAnchors: 6, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "elliott_correction", label: "Elliott correction wave (ABC)", shortLabel: "ABC", slot: "patterns", section: "ELLIOTT WAVES", requiredAnchors: 4, interaction: "points", defaultColor: "#f59e0b" },
  { kind: "elliott_triangle", label: "Elliott triangle wave (ABCDE)", shortLabel: "ABCDE", slot: "patterns", section: "ELLIOTT WAVES", requiredAnchors: 6, interaction: "points", defaultColor: "#a78bfa" },
  { kind: "elliott_double_combo", label: "Elliott double combo wave (WXY)", shortLabel: "WXY", slot: "patterns", section: "ELLIOTT WAVES", requiredAnchors: 4, interaction: "points", defaultColor: "#fb7185" },
  { kind: "elliott_triple_combo", label: "Elliott triple combo wave (WXYXZ)", shortLabel: "WXYXZ", slot: "patterns", section: "ELLIOTT WAVES", requiredAnchors: 6, interaction: "points", defaultColor: "#2dd4bf" },

  { kind: "cyclic_lines", label: "Cyclic lines", shortLabel: "Cyclic", slot: "patterns", section: "CYCLES", requiredAnchors: 2, interaction: "points", defaultColor: "#94a3b8" },
  { kind: "time_cycles", label: "Time cycles", shortLabel: "T-Cycles", slot: "patterns", section: "CYCLES", requiredAnchors: 2, interaction: "points", defaultColor: "#60a5fa" },
  { kind: "sine_line", label: "Sine line", shortLabel: "Sine", slot: "patterns", section: "CYCLES", requiredAnchors: 2, interaction: "points", defaultColor: "#34d399" },

  // FORECASTING, VOLUME-BASED & MEASURERS
  { kind: "long_position", label: "Long position", shortLabel: "Long", slot: "forecast", section: "FORECASTING", requiredAnchors: 2, interaction: "points", defaultColor: "#26a69a" },
  { kind: "short_position", label: "Short position", shortLabel: "Short", slot: "forecast", section: "FORECASTING", requiredAnchors: 2, interaction: "points", defaultColor: "#ef5350" },
  { kind: "position_forecast", label: "Position forecast", shortLabel: "Forecast", slot: "forecast", section: "FORECASTING", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "bars_pattern", label: "Bars pattern", shortLabel: "Bars Pat", slot: "forecast", section: "FORECASTING", requiredAnchors: 2, interaction: "points", defaultColor: "#818cf8" },
  { kind: "ghost_feed", label: "Ghost feed", shortLabel: "Ghost", slot: "forecast", section: "FORECASTING", requiredAnchors: 2, interaction: "points", defaultColor: "#94a3b8" },
  { kind: "sector", label: "Sector", shortLabel: "Sector", slot: "forecast", section: "FORECASTING", requiredAnchors: 3, interaction: "points", defaultColor: "#38bdf8" },

  { kind: "anchored_vwap", label: "Anchored VWAP", shortLabel: "A-VWAP", slot: "forecast", section: "VOLUME-BASED", requiredAnchors: 1, interaction: "points", defaultColor: "#fbbf24" },
  { kind: "fixed_range_vp", label: "Fixed range volume profile", shortLabel: "FRVP", slot: "forecast", section: "VOLUME-BASED", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "anchored_vp", label: "Anchored volume profile", shortLabel: "AVP", slot: "forecast", section: "VOLUME-BASED", requiredAnchors: 1, interaction: "points", defaultColor: "#60a5fa" },

  { kind: "price_range", label: "Price range", shortLabel: "Price Rng", slot: "forecast", section: "MEASURERS", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "date_range", label: "Date range", shortLabel: "Date Rng", slot: "forecast", section: "MEASURERS", requiredAnchors: 2, interaction: "points", defaultColor: "#a78bfa" },
  { kind: "date_price_range", label: "Date and price range", shortLabel: "Range", slot: "forecast", section: "MEASURERS", requiredAnchors: 2, interaction: "points", defaultColor: "#fb7185" },

  // BRUSHES, ARROWS & SHAPES
  { kind: "brush", label: "Brush", shortLabel: "Brush", slot: "shapes", section: "BRUSHES", requiredAnchors: 2, interaction: "freehand", defaultColor: "#38bdf8" },
  { kind: "highlighter", label: "Highlighter", shortLabel: "Highlight", slot: "shapes", section: "BRUSHES", requiredAnchors: 2, interaction: "freehand", defaultColor: "#facc15" },

  { kind: "arrow_marker", label: "Arrow marker", shortLabel: "Marker", slot: "shapes", section: "ARROWS", requiredAnchors: 2, interaction: "points", defaultColor: "#fbbf24" },
  { kind: "arrow", label: "Arrow", shortLabel: "Arrow", slot: "shapes", section: "ARROWS", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "arrow_mark_up", label: "Arrow mark up", shortLabel: "Arrow Up", slot: "shapes", section: "ARROWS", requiredAnchors: 1, interaction: "points", defaultColor: "#26a69a" },
  { kind: "arrow_mark_down", label: "Arrow mark down", shortLabel: "Arrow Dn", slot: "shapes", section: "ARROWS", requiredAnchors: 1, interaction: "points", defaultColor: "#ef5350" },

  { kind: "box_zone", label: "Rectangle", shortLabel: "Rect", slot: "shapes", section: "SHAPES", requiredAnchors: 2, interaction: "points", defaultColor: "#34d399", shortcut: "⌥⇧R" },
  { kind: "rotated_rectangle", label: "Rotated rectangle", shortLabel: "Rot Rect", slot: "shapes", section: "SHAPES", requiredAnchors: 3, interaction: "points", defaultColor: "#34d399" },
  { kind: "path", label: "Path", shortLabel: "Path", slot: "shapes", section: "SHAPES", requiredAnchors: 2, interaction: "multipoint", defaultColor: "#e6e8ee" },
  { kind: "circle", label: "Circle", shortLabel: "Circle", slot: "shapes", section: "SHAPES", requiredAnchors: 2, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "ellipse", label: "Ellipse", shortLabel: "Ellipse", slot: "shapes", section: "SHAPES", requiredAnchors: 2, interaction: "points", defaultColor: "#60a5fa" },
  { kind: "polyline", label: "Polyline", shortLabel: "Polyline", slot: "shapes", section: "SHAPES", requiredAnchors: 3, interaction: "multipoint", defaultColor: "#a78bfa" },
  { kind: "triangle", label: "Triangle", shortLabel: "Triangle", slot: "shapes", section: "SHAPES", requiredAnchors: 3, interaction: "points", defaultColor: "#fbbf24" },
  { kind: "arc", label: "Arc", shortLabel: "Arc", slot: "shapes", section: "SHAPES", requiredAnchors: 3, interaction: "points", defaultColor: "#2dd4bf" },
  { kind: "curve", label: "Curve", shortLabel: "Curve", slot: "shapes", section: "SHAPES", requiredAnchors: 3, interaction: "points", defaultColor: "#38bdf8" },
  { kind: "double_curve", label: "Double curve", shortLabel: "S-Curve", slot: "shapes", section: "SHAPES", requiredAnchors: 4, interaction: "points", defaultColor: "#c084fc" },

  // TEXT AND NOTES & CONTENT
  { kind: "text", label: "Text", shortLabel: "Text", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "text", defaultColor: "#e6e8ee" },
  { kind: "note", label: "Note", shortLabel: "Note", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "text", defaultColor: "#fbbf24" },
  { kind: "price_note", label: "Price note", shortLabel: "Price Note", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 2, interaction: "text", defaultColor: "#38bdf8" },
  { kind: "pin", label: "Pin", shortLabel: "Pin", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "points", defaultColor: "#ef5350" },
  { kind: "table", label: "Table", shortLabel: "Table", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "points", defaultColor: "#94a3b8" },
  { kind: "callout", label: "Callout", shortLabel: "Callout", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 2, interaction: "text", defaultColor: "#38bdf8" },
  { kind: "comment", label: "Comment", shortLabel: "Comment", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "text", defaultColor: "#a78bfa" },
  { kind: "price_label", label: "Price label", shortLabel: "Price Lbl", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "points", defaultColor: "#2962ff" },
  { kind: "signpost", label: "Signpost", shortLabel: "Signpost", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "text", defaultColor: "#34d399" },
  { kind: "flag_mark", label: "Flag mark", shortLabel: "Flag", slot: "text", section: "TEXT AND NOTES", requiredAnchors: 1, interaction: "points", defaultColor: "#ef5350" },

  { kind: "image_annotation", label: "Image", shortLabel: "Image", slot: "text", section: "CONTENT", requiredAnchors: 1, interaction: "text", defaultColor: "#60a5fa" },
  { kind: "post_annotation", label: "Post", shortLabel: "Post", slot: "text", section: "CONTENT", requiredAnchors: 1, interaction: "text", defaultColor: "#e6e8ee" },
  { kind: "idea_annotation", label: "Idea", shortLabel: "Idea", slot: "text", section: "CONTENT", requiredAnchors: 1, interaction: "text", defaultColor: "#facc15" },

  // ICONS
  { kind: "icon_stamp", label: "Icons & Stickers", shortLabel: "Icon", slot: "icons", section: "ICONS", requiredAnchors: 1, interaction: "points", defaultColor: "#e6e8ee" },
];

export function getDrawingToolMeta(kind: DrawingToolKind): DrawingToolMeta {
  return (
    DRAWING_TOOL_META.find((m) => m.kind === kind) ??
    DRAWING_TOOL_META[0]
  );
}

const FAVORITES_STORAGE_KEY = "allegedly.drawing_favorites.v1";

export function loadStoredFavorites(): PlacedDrawingKind[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [...DEFAULT_FAVORITE_TOOLS];
  }
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_FAVORITE_TOOLS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_FAVORITE_TOOLS];
    const valid = new Set(
      DRAWING_TOOL_META.filter(
        (m) => m.kind !== "cursor" && m.kind !== "ruler" && m.kind !== "zoom_in",
      ).map((m) => m.kind),
    );
    const filtered = parsed.filter(
      (k): k is PlacedDrawingKind => typeof k === "string" && valid.has(k as PlacedDrawingKind),
    );
    return filtered;
  } catch {
    return [...DEFAULT_FAVORITE_TOOLS];
  }
}

export function saveStoredFavorites(favs: readonly PlacedDrawingKind[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favs));
  } catch {
    // Ignore storage quota errors
  }
}

export interface RulerCandleInput {
  timeSec: number;
  volume: number;
}

export interface RulerMetrics {
  startPrice: number;
  endPrice: number;
  deltaPrice: number;
  pctChange: number;
  deltaTicks: bigint;
  barCount: number;
  durationSec: number;
  durationLabel: string;
  cumulativeVolume: number;
  volumeLabel: string;
  isNegative: boolean;
}

export function formatDurationCompact(seconds: number): string {
  const abs = Math.max(0, Math.round(Math.abs(seconds)));
  if (abs === 0) return "0m";
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return `${abs}s`;
}

export function formatCompactVolume(vol: number): string {
  const abs = Math.abs(vol);
  if (abs >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)} B`;
  if (abs >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${(vol / 1_000).toFixed(2)} K`;
  return Math.round(vol).toLocaleString("en-US");
}

/**
 * Computes exact Ruler / Measure tool metrics using BigInt tick deltas (SV-08 / SV-17).
 */
export function computeRulerMetrics(params: {
  start: AnchorPoint;
  end: AnchorPoint;
  tickSizeE9: bigint;
  bars: readonly RulerCandleInput[];
}): RulerMetrics {
  const { start, end, tickSizeE9, bars } = params;
  const tickFloat = Number(tickSizeE9) / 1e9;
  const startPrice = Number(start.priceTick) * tickFloat;
  const endPrice = Number(end.priceTick) * tickFloat;
  const deltaTicks = end.priceTick - start.priceTick;
  const deltaPrice = Number(deltaTicks) * tickFloat;
  const pctChange = startPrice !== 0 ? (deltaPrice / startPrice) * 100 : 0;

  const minSec = Math.min(start.timeSec, end.timeSec);
  const maxSec = Math.max(start.timeSec, end.timeSec);
  let barCount = 0;
  let cumulativeVolume = 0;
  for (const bar of bars) {
    if (bar.timeSec >= minSec && bar.timeSec <= maxSec) {
      barCount += 1;
      cumulativeVolume += Number.isFinite(bar.volume) ? bar.volume : 0;
    }
  }
  if (barCount === 0 && bars.length > 0) {
    barCount = 1;
  }

  const durationSec = Math.abs(end.timeSec - start.timeSec);
  return {
    startPrice,
    endPrice,
    deltaPrice,
    pctChange,
    deltaTicks,
    barCount,
    durationSec,
    durationLabel: formatDurationCompact(durationSec),
    cumulativeVolume,
    volumeLabel: formatCompactVolume(cumulativeVolume),
    isNegative: deltaTicks < 0n,
  };
}

/**
 * Exact integer SV-17 magnet snap (0 sub-tick float error).
 */
export function snapTickToMagnet(
  cursorTick: bigint,
  targets: readonly MagnetTarget[],
  maxDistanceTicks: bigint,
): { snappedTick: bigint; target: MagnetTarget | null } {
  let bestTarget: MagnetTarget | null = null;
  let bestDist = maxDistanceTicks + 1n;

  for (const t of targets) {
    const diff = t.priceTick >= cursorTick ? t.priceTick - cursorTick : cursorTick - t.priceTick;
    if (diff <= maxDistanceTicks && diff < bestDist) {
      bestDist = diff;
      bestTarget = t;
    }
  }

  return bestTarget
    ? { snappedTick: bestTarget.priceTick, target: bestTarget }
    : { snappedTick: cursorTick, target: null };
}

type HistoryAction =
  | { type: "add"; drawing: DrawingObject }
  | { type: "delete"; drawing: DrawingObject; index: number }
  | { type: "move"; id: string; before: AnchorPoint[]; after: AnchorPoint[] }
  | { type: "clear"; symbol?: string; previous: DrawingObject[] };

/**
 * Deterministic clean-room Drawing Engine with full Undo/Redo command stack
 * and .atanalysis.toml persistence (E06 / SV-17).
 */
export class DrawingEngine {
  private drawings: DrawingObject[] = [];
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private idCounter = 0;

  public list(symbol?: string): readonly DrawingObject[] {
    return symbol ? this.drawings.filter((d) => d.symbol === symbol) : this.drawings;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public add(
    kind: PlacedDrawingKind,
    symbol: string,
    anchors: AnchorPoint[],
    color?: string,
    label?: string,
  ): DrawingObject {
    const meta = getDrawingToolMeta(kind);
    const drawing: DrawingObject = {
      id: `drw-${++this.idCounter}`,
      kind,
      symbol,
      anchors: anchors.map((a) => ({ ...a })),
      color: color ?? meta.defaultColor ?? "#38bdf8",
      label,
    };
    this.drawings.push(drawing);
    this.undoStack.push({ type: "add", drawing });
    this.redoStack.length = 0;
    return drawing;
  }

  public move(id: string, nextAnchors: AnchorPoint[]): boolean {
    const target = this.drawings.find((d) => d.id === id);
    if (!target) return false;
    const before = target.anchors.map((a) => ({ ...a }));
    const after = nextAnchors.map((a) => ({ ...a }));
    target.anchors = after;
    this.undoStack.push({ type: "move", id, before, after });
    this.redoStack.length = 0;
    return true;
  }

  public remove(id: string): boolean {
    const index = this.drawings.findIndex((d) => d.id === id);
    if (index === -1) return false;
    const [removed] = this.drawings.splice(index, 1);
    this.undoStack.push({ type: "delete", drawing: removed, index });
    this.redoStack.length = 0;
    return true;
  }

  public clear(symbol?: string): void {
    const prev = this.drawings.map((d) => ({ ...d, anchors: d.anchors.map((a) => ({ ...a })) }));
    if (symbol) {
      this.drawings = this.drawings.filter((d) => d.symbol !== symbol);
    } else {
      this.drawings = [];
    }
    this.undoStack.push({ type: "clear", symbol, previous: prev });
    this.redoStack.length = 0;
  }

  public undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;
    switch (action.type) {
      case "add":
        this.drawings = this.drawings.filter((d) => d.id !== action.drawing.id);
        break;
      case "delete":
        this.drawings.splice(action.index, 0, action.drawing);
        break;
      case "move": {
        const d = this.drawings.find((x) => x.id === action.id);
        if (d) d.anchors = action.before.map((a) => ({ ...a }));
        break;
      }
      case "clear":
        this.drawings = action.previous.map((d) => ({
          ...d,
          anchors: d.anchors.map((a) => ({ ...a })),
        }));
        break;
    }
    this.redoStack.push(action);
    return true;
  }

  public redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;
    switch (action.type) {
      case "add":
        this.drawings.push(action.drawing);
        break;
      case "delete":
        this.drawings.splice(action.index, 1);
        break;
      case "move": {
        const d = this.drawings.find((x) => x.id === action.id);
        if (d) d.anchors = action.after.map((a) => ({ ...a }));
        break;
      }
      case "clear":
        if (action.symbol) {
          this.drawings = this.drawings.filter((d) => d.symbol !== action.symbol);
        } else {
          this.drawings = [];
        }
        break;
    }
    this.undoStack.push(action);
    return true;
  }

  /**
   * Canonical `.atanalysis.toml` deterministic serializer (ADR-0001 / SV-07).
   */
  public toAtAnalysisToml(): string {
    const lines: string[] = [
      'schema_version = "allegedly.analysis.v1"',
      "",
    ];
    for (const d of this.drawings) {
      lines.push("[[drawings]]");
      lines.push(`id = "${escapeToml(d.id)}"`);
      lines.push(`kind = "${d.kind}"`);
      lines.push(`symbol = "${escapeToml(d.symbol)}"`);
      lines.push(`color = "${escapeToml(d.color)}"`);
      if (d.label !== undefined) {
        lines.push(`label = "${escapeToml(d.label)}"`);
      }
      const anchorStrs = d.anchors.map(
        (a) => `{ time_sec = ${a.timeSec}, price_tick = "${a.priceTick.toString()}" }`,
      );
      lines.push(`anchors = [${anchorStrs.join(", ")}]`);
      lines.push("");
    }
    return lines.join("\n");
  }

  /**
   * Loads drawings from canonical `.atanalysis.toml`.
   */
  public loadFromAtAnalysisToml(toml: string): number {
    const parsed: DrawingObject[] = [];
    const blocks = toml.split("[[drawings]]").slice(1);
    let maxNumericId = 0;
    for (const block of blocks) {
      const id = matchTomlStr(block, "id");
      const kind = matchTomlStr(block, "kind") as PlacedDrawingKind | null;
      const symbol = matchTomlStr(block, "symbol");
      const color = matchTomlStr(block, "color") ?? "#38bdf8";
      const label = matchTomlStr(block, "label") ?? undefined;
      if (!id || !kind || !symbol) continue;

      const idMatch = /^drw-(\d+)$/.exec(id);
      if (idMatch) {
        const n = Number.parseInt(idMatch[1], 10);
        if (Number.isFinite(n) && n > maxNumericId) {
          maxNumericId = n;
        }
      }

      const anchors: AnchorPoint[] = [];
      const anchorRegex = /\{\s*time_sec\s*=\s*(-?\d+)\s*,\s*price_tick\s*=\s*"(-?\d+)"\s*\}/g;
      for (const m of block.matchAll(anchorRegex)) {
        anchors.push({
          timeSec: Number.parseInt(m[1], 10),
          priceTick: BigInt(m[2]),
        });
      }
      parsed.push({ id, kind, symbol, color, label, anchors });
    }
    this.drawings = parsed;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.idCounter = Math.max(parsed.length, maxNumericId);
    return parsed.length;
  }
}

function escapeToml(s: string): string {
  return s
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
}

function unescapeToml(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      const next = s[++i];
      if (next === "\\") out += "\\";
      else if (next === '"') out += '"';
      else if (next === "n") out += "\n";
      else if (next === "r") out += "\r";
      else if (next === "t") out += "\t";
      else out += next;
    } else {
      out += ch;
    }
  }
  return out;
}

function matchTomlStr(block: string, key: string): string | null {
  const re = new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m");
  const m = block.match(re);
  return m ? unescapeToml(m[1]) : null;
}
