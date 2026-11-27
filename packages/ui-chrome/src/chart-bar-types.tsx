export type ChartBarType =
  | "bars"
  | "candles"
  | "hollow_candles"
  | "volume_candles"
  | "line"
  | "line_markers"
  | "step_line"
  | "area"
  | "hlc_area"
  | "baseline"
  | "columns"
  | "high_low"
  | "volume_footprint"
  | "tpo"
  | "session_vp"
  | "heikin_ashi"
  | "renko"
  | "line_break"
  | "kagi"
  | "point_and_figure"
  | "range";

export interface ChartBarTypeItem {
  id: ChartBarType;
  label: string;
}

export const CHART_BAR_TYPE_GROUPS: readonly (readonly ChartBarTypeItem[])[] = [
  [
    { id: "bars", label: "Bars" },
    { id: "candles", label: "Candles" },
    { id: "hollow_candles", label: "Hollow candles" },
    { id: "volume_candles", label: "Volume candles" },
  ],
  [
    { id: "line", label: "Line" },
    { id: "line_markers", label: "Line with markers" },
    { id: "step_line", label: "Step line" },
  ],
  [
    { id: "area", label: "Area" },
    { id: "hlc_area", label: "HLC area" },
    { id: "baseline", label: "Baseline" },
  ],
  [
    { id: "columns", label: "Columns" },
    { id: "high_low", label: "High-low" },
  ],
  [
    { id: "volume_footprint", label: "Volume footprint" },
    { id: "tpo", label: "Time price opportunity" },
    { id: "session_vp", label: "Session volume profile" },
  ],
  [
    { id: "heikin_ashi", label: "Heikin Ashi" },
    { id: "renko", label: "Renko" },
    { id: "line_break", label: "Line break" },
    { id: "kagi", label: "Kagi" },
    { id: "point_and_figure", label: "Point & figure" },
    { id: "range", label: "Range" },
  ],
];

export function getChartBarTypeLabel(type: ChartBarType): string {
  for (const group of CHART_BAR_TYPE_GROUPS) {
    const found = group.find((item) => item.id === type);
    if (found) return found.label;
  }
  return "Candles";
}

export function ChartBarTypeIcon({
  type,
  className = "h-[17px] w-[17px]",
}: {
  type: ChartBarType;
  className?: string;
}) {
  switch (type) {
    case "bars":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <path d="M5.5 3v12M3 6.5h2.5M5.5 11.5H8M12.5 3.5v11M10 11h2.5M12.5 6H15" strokeLinecap="round" />
        </svg>
      );
    case "candles":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <path d="M5.5 2.5v3M5.5 11.5v4" strokeLinecap="round" />
          <rect x="3.8" y="5.5" width="3.4" height="6" rx="0.5" />
          <path d="M12.5 2v3.5M12.5 12.5v3" strokeLinecap="round" />
          <rect x="10.8" y="5.5" width="3.4" height="7" rx="0.5" fill="currentColor" fillOpacity="0.3" />
        </svg>
      );
    case "hollow_candles":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <path d="M5.5 2.5v3M5.5 11.5v4" strokeLinecap="round" />
          <rect x="3.8" y="5.5" width="3.4" height="6" rx="0.5" />
          <path d="M12.5 2v3.5M12.5 12.5v3" strokeLinecap="round" />
          <rect x="10.8" y="5.5" width="3.4" height="7" rx="0.5" fill="currentColor" />
        </svg>
      );
    case "volume_candles":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <path d="M4.5 4v2M4.5 12v2.5" strokeLinecap="round" />
          <rect x="3.2" y="6" width="2.6" height="6" rx="0.4" />
          <path d="M11.5 2.5v2.5M11.5 13v2.5" strokeLinecap="round" />
          <rect x="8.5" y="5" width="6" height="8" rx="0.5" />
        </svg>
      );
    case "line":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2.5 12.5 6.5 8l3.5 3 5.5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "line_markers":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <path d="M3 12.5 7 8.5l3.5 2.5L15 5.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="3" cy="12.5" r="1.4" fill="currentColor" />
          <circle cx="7" cy="8.5" r="1.4" fill="currentColor" />
          <circle cx="10.5" cy="11" r="1.4" fill="currentColor" />
          <circle cx="15" cy="5.5" r="1.4" fill="currentColor" />
        </svg>
      );
    case "step_line":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2.5 13H6V8.5h4V11h3.5V5H16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "area":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <path d="M2.5 12 6.5 8l3.5 2.5 5.5-5.5V14h-13Z" fill="currentColor" fillOpacity="0.22" stroke="none" />
          <path d="M2.5 12 6.5 8l3.5 2.5 5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "hlc_area":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.25">
          <path d="M2.5 8.5 7 5l4 2.5 4.5-3.5v5.5L11 13l-4-2.5-4.5 3.5Z" fill="currentColor" fillOpacity="0.2" stroke="none" />
          <path d="M2.5 8.5 7 5l4 2.5 4.5-3.5M2.5 11.2 7 7.8l4 2.4 4.5-3.4M2.5 14 7 10.5l4 2.5 4.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "baseline":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M2 9.5h14" strokeDasharray="2 2" strokeOpacity="0.6" />
          <path d="M2.5 12.5 6 5.5l4 7.5 3-6 2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "columns":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="3" y="9" width="2.8" height="6" rx="0.4" />
          <rect x="7.6" y="4.5" width="2.8" height="10.5" rx="0.4" />
          <rect x="12.2" y="7" width="2.8" height="8" rx="0.4" />
        </svg>
      );
    case "high_low":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <rect x="4" y="4" width="3.5" height="9" rx="0.5" />
          <rect x="10.5" y="6" width="3.5" height="8" rx="0.5" />
        </svg>
      );
    case "volume_footprint":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M5 3v2M5 13v2" strokeLinecap="round" />
          <rect x="3.5" y="5" width="3" height="8" rx="0.4" />
          <path d="M9 5.5h5.5M9 9h4M9 12.5h5.5" strokeLinecap="round" />
        </svg>
      );
    case "tpo":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="3.5" y="3.5" width="3" height="3" />
          <rect x="6.5" y="3.5" width="3" height="3" />
          <rect x="3.5" y="6.5" width="3" height="3" />
          <rect x="6.5" y="6.5" width="3" height="3" />
          <rect x="9.5" y="6.5" width="3" height="3" />
          <rect x="12.5" y="6.5" width="2.5" height="3" />
          <rect x="3.5" y="9.5" width="3" height="3" />
          <rect x="6.5" y="9.5" width="3" height="3" />
          <rect x="3.5" y="12.5" width="3" height="2.5" />
        </svg>
      );
    case "session_vp":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="3" y="3.5" width="6.5" height="2.5" rx="0.3" />
          <rect x="3" y="7.5" width="11.5" height="3" rx="0.3" />
          <rect x="3" y="12" width="8.5" height="2.5" rx="0.3" />
        </svg>
      );
    case "heikin_ashi":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.35">
          <path d="M5.5 3.5v2" strokeLinecap="round" />
          <rect x="3.8" y="5.5" width="3.4" height="7" rx="0.5" />
          <path d="M12.5 2v2.5M12.5 11.5v3" strokeLinecap="round" />
          <rect x="10.8" y="4.5" width="3.4" height="7" rx="0.5" />
        </svg>
      );
    case "renko":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="3" y="11" width="3.5" height="3.5" />
          <rect x="6.8" y="7.2" width="3.5" height="3.5" />
          <rect x="10.6" y="3.4" width="3.5" height="3.5" />
        </svg>
      );
    case "line_break":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="3" y="7" width="3" height="6" />
          <rect x="7" y="4" width="3" height="5" />
          <rect x="11" y="7.5" width="3" height="6.5" />
        </svg>
      );
    case "kagi":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M3.5 14V6h3.2v7.5h3.2V4.5h3.2V11h2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "point_and_figure":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.25">
          <path d="M4 5l2.5 2.5M6.5 5 4 7.5M4 10l2.5 2.5M6.5 10 4 12.5M11.5 5l2.5 2.5M14 5l-2.5 2.5" strokeLinecap="round" />
          <circle cx="9" cy="9" r="1.4" />
          <circle cx="9" cy="13" r="1.4" />
        </svg>
      );
    case "range":
      return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M5.5 3.5v10M3.5 6.5h2M5.5 10.5h2M12 4.5v8.5M10 10h2M12 6.5h2" strokeLinecap="round" />
        </svg>
      );
  }
}
