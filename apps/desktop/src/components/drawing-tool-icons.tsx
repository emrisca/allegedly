import type { DrawingToolKind } from "../drawings/drawing-engine";

export function DrawingToolIcon({
  kind,
  className = "h-[18px] w-[18px]",
}: {
  kind: DrawingToolKind;
  className?: string;
}) {
  const props = {
    "aria-hidden": true as const,
    viewBox: "0 0 20 20",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.35",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "cursor":
      return (
        <svg {...props}>
          <path d="M10 3v4.5M10 12.5V17M3 10h4.5M12.5 10H17" />
          <circle cx="10" cy="10" r="1.2" fill="currentColor" />
        </svg>
      );
    case "ruler":
      return (
        <svg {...props}>
          <path d="m4.2 13.4 9.2-9.2 2.4 2.4-9.2 9.2-2.4-2.4Z" />
          <path d="m7.2 10.4 1.3 1.3M9.5 8.1l1.3 1.3M11.8 5.8l1.3 1.3" />
        </svg>
      );
    case "zoom_in":
      return (
        <svg {...props}>
          <circle cx="9" cy="9" r="5.2" />
          <path d="M13 13l3.6 3.6M6.8 9h4.4M9 6.8v4.4" />
        </svg>
      );

    // LINES
    case "trendline":
      return (
        <svg {...props}>
          <path d="M4.5 15.5 15.5 4.5" />
          <circle cx="4.5" cy="15.5" r="1.5" fill="#101217" />
          <circle cx="15.5" cy="4.5" r="1.5" fill="#101217" />
        </svg>
      );
    case "ray":
      return (
        <svg {...props}>
          <path d="M5 15 16.5 3.5" />
          <circle cx="5" cy="15" r="1.5" fill="#101217" />
          <circle cx="11" cy="9" r="1.3" fill="#101217" />
        </svg>
      );
    case "info_line":
      return (
        <svg {...props}>
          <path d="M4.5 15 14 5.5" />
          <rect x="9.5" y="10.5" width="7" height="4.5" rx="1" />
          <circle cx="4.5" cy="15" r="1.4" fill="#101217" />
          <circle cx="14" cy="5.5" r="1.4" fill="#101217" />
        </svg>
      );
    case "extended_line":
      return (
        <svg {...props}>
          <path d="M3 17 17 3" />
          <circle cx="7" cy="13" r="1.4" fill="#101217" />
          <circle cx="13" cy="7" r="1.4" fill="#101217" />
        </svg>
      );
    case "trend_angle":
      return (
        <svg {...props}>
          <path d="M4 15h12.5M4 15 15 5" />
          <path d="M9.5 15a5.5 5.5 0 0 0-1.6-3.9" />
          <circle cx="4" cy="15" r="1.4" fill="#101217" />
          <circle cx="15" cy="5" r="1.4" fill="#101217" />
        </svg>
      );
    case "horizontal_line":
      return (
        <svg {...props}>
          <path d="M3 10h14" />
          <circle cx="10" cy="10" r="1.6" fill="#101217" />
        </svg>
      );
    case "horizontal_ray":
      return (
        <svg {...props}>
          <path d="M5.5 10H17" />
          <circle cx="4.5" cy="10" r="1.6" fill="#101217" />
        </svg>
      );
    case "vertical_line":
      return (
        <svg {...props}>
          <path d="M10 3v14" />
          <circle cx="10" cy="10" r="1.6" fill="#101217" />
        </svg>
      );
    case "crossline":
      return (
        <svg {...props}>
          <path d="M10 3v14M3 10h14" />
          <circle cx="10" cy="10" r="1.6" fill="#101217" />
        </svg>
      );

    // FIBONACCI & PITCHFAN
    case "fib_retracement":
      return (
        <svg {...props}>
          <path d="M3.5 5h13M3.5 8.3h13M3.5 11.6h13M3.5 15h13" />
          <circle cx="5.5" cy="15" r="1.4" fill="#101217" />
          <circle cx="14.5" cy="8.3" r="1.4" fill="#101217" />
        </svg>
      );
    case "fib_extension":
      return (
        <svg {...props}>
          <path d="M3.5 14 8 6l4.5 5.5H16.5M3.5 5.5h13M3.5 15h13" />
          <circle cx="8" cy="6" r="1.3" fill="#101217" />
        </svg>
      );
    case "fib_channel":
      return (
        <svg {...props}>
          <path d="M3 13 15 4M4.5 15.5 16.5 6.5M6.5 17 17 9" />
          <circle cx="4.5" cy="15.5" r="1.3" fill="#101217" />
        </svg>
      );
    case "fib_time_zone":
    case "fib_trend_time":
      return (
        <svg {...props}>
          <path d="M4 3.5v13M7 3.5v13M11.5 3.5v13M16.5 3.5v13" />
          <circle cx="7" cy="10" r="1.3" fill="#101217" />
        </svg>
      );
    case "fib_fan":
    case "pitchfan":
      return (
        <svg {...props}>
          <path d="M4 15.5 16 4M4 15.5l12-6M4 15.5l12-1" />
          <circle cx="4" cy="15.5" r="1.4" fill="#101217" />
        </svg>
      );
    case "fib_circles":
    case "fib_arcs":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="3" />
          <circle cx="10" cy="10" r="6.2" strokeDasharray="2 2" />
          <circle cx="10" cy="10" r="1.1" fill="currentColor" />
        </svg>
      );
    case "fib_spiral":
      return (
        <svg {...props}>
          <path d="M10 10c0-1.2 1.2-2 2.2-1.5 1.8.9 2 3.4.6 4.8-2 2-5.5 1.5-6.8-1-1.6-3.1-.3-7 3.1-8.2" />
        </svg>
      );
    case "fib_wedge":
      return (
        <svg {...props}>
          <path d="M4 15 16 5M4 15h12" />
          <path d="M9.5 15a5.5 5.5 0 0 0-1.8-4.1M13 15a9 9 0 0 0-2.9-6.6" />
        </svg>
      );

    // PATTERNS / ELLIOTT / CYCLES
    case "xabcd_pattern":
    case "cypher_pattern":
    case "abcd_pattern":
    case "three_drives":
      return (
        <svg {...props}>
          <path d="m3.5 14 3.5-8 3.2 6.5 3.3-7.5 3 8.5" />
          <circle cx="7" cy="6" r="1.2" fill="#101217" />
          <circle cx="10.2" cy="12.5" r="1.2" fill="#101217" />
          <circle cx="13.5" cy="5" r="1.2" fill="#101217" />
        </svg>
      );
    case "head_and_shoulders":
      return (
        <svg {...props}>
          <path d="m3 14 3.2-4.5 2 2.5L10 4.5l1.8 7.5 2-2.5L17 14" />
          <path d="M4 14h12" strokeDasharray="2 2" />
        </svg>
      );
    case "triangle_pattern":
      return (
        <svg {...props}>
          <path d="m4 14 6-9 6 9H4Z" />
          <circle cx="10" cy="5" r="1.3" fill="#101217" />
        </svg>
      );
    case "elliott_impulse":
    case "elliott_correction":
    case "elliott_triangle":
    case "elliott_double_combo":
    case "elliott_triple_combo":
      return (
        <svg {...props}>
          <path d="m3.5 14.5 3.2-5 2.4 2.5 3.6-7.5 2 4 2.3-4.5" />
          <text x="12.5" y="16" fontSize="6.5" fill="currentColor" stroke="none" fontFamily="monospace">W</text>
        </svg>
      );
    case "cyclic_lines":
      return (
        <svg {...props}>
          <path d="M4.5 3.5v13M10 3.5v13M15.5 3.5v13" />
          <path d="M4.5 10h11" strokeDasharray="1.5 2" />
        </svg>
      );
    case "time_cycles":
      return (
        <svg {...props}>
          <path d="M3 13a3.5 3.5 0 0 1 7 0M10 13a3.5 3.5 0 0 1 7 0" />
          <path d="M2.5 13h15" />
        </svg>
      );
    case "sine_line":
      return (
        <svg {...props}>
          <path d="M3 10c1.8-5.5 4.2-5.5 6 0s4.2 5.5 6 0 2-3.2 2.5-3.2" />
        </svg>
      );

    // FORECASTING / VOLUME / MEASURERS
    case "long_position":
      return (
        <svg {...props}>
          <path d="M4.5 5.5h11.5M4.5 10h11.5M4.5 14.5h11.5" />
          <circle cx="4.5" cy="5.5" r="1.3" fill="#101217" />
          <circle cx="4.5" cy="14.5" r="1.3" fill="#101217" />
          <path d="M9.1 8.6v2.8h2" strokeWidth="1.25" />
        </svg>
      );
    case "short_position":
      return (
        <svg {...props}>
          <path d="M4.5 5.5h11.5M4.5 10h11.5M4.5 14.5h11.5" />
          <circle cx="4.5" cy="5.5" r="1.3" fill="#101217" />
          <circle cx="4.5" cy="14.5" r="1.3" fill="#101217" />
          <path d="M11 8.8H9.2c-.5 0-.7.9 0 1.1l1.5.4c.7.2.5 1.1 0 1.1H9" strokeWidth="1.2" />
        </svg>
      );
    case "position_forecast":
    case "bars_pattern":
    case "ghost_feed":
      return (
        <svg {...props}>
          <path d="M4 13.5 8 9.5l3 2.5 5-6" />
          <path d="M6 6.5v3M10 5v4M14 4v3" />
          <circle cx="4" cy="13.5" r="1.2" fill="#101217" />
        </svg>
      );
    case "sector":
      return (
        <svg {...props}>
          <path d="M4.5 15.5V4.5A11 11 0 0 1 15.5 15.5H4.5Z" />
          <circle cx="4.5" cy="15.5" r="1.3" fill="#101217" />
        </svg>
      );
    case "anchored_vwap":
      return (
        <svg {...props}>
          <path d="M6 5.5v9M9.5 4v10M13 7v7" strokeWidth="1.15" />
          <path d="M4 12.5c3-.8 4.8-4.5 7.5-4.2 1.8.2 3.2-1 4.8-3" />
          <circle cx="4" cy="12.5" r="1.4" fill="#101217" />
        </svg>
      );
    case "fixed_range_vp":
      return (
        <svg {...props}>
          <path d="M5 4v12M5 6h4v2H5M5 8.5h6v2H5M5 11h3v2H5M15 4v12" />
          <circle cx="5" cy="15.5" r="1.3" fill="#101217" />
          <circle cx="15" cy="4.5" r="1.3" fill="#101217" />
        </svg>
      );
    case "anchored_vp":
      return (
        <svg {...props}>
          <path d="M15.5 3.5v13M15.5 5.5h-4v2h4M15.5 8h-7v2h7M15.5 10.5h-5v2h5M15.5 13h-2.5v1.5h2.5" />
          <circle cx="5.5" cy="10" r="1.4" fill="#101217" />
          <path d="M7 10h1.5" />
        </svg>
      );
    case "price_range":
      return (
        <svg {...props}>
          <path d="M5 4.5h10M5 15.5h10M10 5v10M7.8 7.5 10 5l2.2 2.5" />
          <circle cx="14.5" cy="4.5" r="1.2" fill="#101217" />
        </svg>
      );
    case "date_range":
      return (
        <svg {...props}>
          <path d="M4.5 5v10M15.5 5v10M5 10h10M12.5 7.8 15 10l-2.5 2.2" />
          <circle cx="4.5" cy="14.5" r="1.2" fill="#101217" />
        </svg>
      );
    case "date_price_range":
      return (
        <svg {...props}>
          <rect x="4.5" y="4.5" width="11" height="11" rx="0.8" />
          <path d="M6.5 10h7M10 6.5v7M12 8.2 13.8 10 12 11.8M8.2 8 10 6.2 11.8 8" />
        </svg>
      );

    // BRUSHES, ARROWS & SHAPES
    case "brush":
      return (
        <svg {...props}>
          <path d="M15.8 4.2 11 9M8.5 10.2c-2 .4-2.8 2.2-3.8 4.3 2.7.2 5-.4 5.8-2.6.3-.9-.5-2-2-1.7Z" />
          <path d="M12.2 7.8c.8.8 1.5.7 2.2 0l1.8-2" />
        </svg>
      );
    case "highlighter":
      return (
        <svg {...props}>
          <path d="m11.5 4.5 4 4-6.8 6.8-4-4 6.8-6.8Z" />
          <path d="m4.7 11.3-1.2 4 4-1.2" />
        </svg>
      );
    case "arrow_marker":
    case "arrow":
      return (
        <svg {...props}>
          <path d="M4.5 15.5 15.5 4.5M10 4.5h5.5V10" />
          <circle cx="4.5" cy="15.5" r="1.3" fill="#101217" />
        </svg>
      );
    case "arrow_mark_up":
      return (
        <svg {...props}>
          <path d="M10 4.2 15 9.5h-3.2V16H8.2V9.5H5l5-5.3Z" />
        </svg>
      );
    case "arrow_mark_down":
      return (
        <svg {...props}>
          <path d="M10 15.8 15 10.5h-3.2V4H8.2v6.5H5l5 5.3Z" />
        </svg>
      );
    case "box_zone":
      return (
        <svg {...props}>
          <rect x="4.5" y="5" width="11" height="10" rx="0.8" />
          <circle cx="4.5" cy="5" r="1.3" fill="#101217" />
          <circle cx="15.5" cy="5" r="1.3" fill="#101217" />
          <circle cx="4.5" cy="15" r="1.3" fill="#101217" />
          <circle cx="15.5" cy="15" r="1.3" fill="#101217" />
        </svg>
      );
    case "rotated_rectangle":
      return (
        <svg {...props}>
          <path d="m10 4 6 6-6 6-6-6 6-6Z" />
          <circle cx="10" cy="4" r="1.3" fill="#101217" />
          <circle cx="16" cy="10" r="1.3" fill="#101217" />
        </svg>
      );
    case "path":
      return (
        <svg {...props}>
          <path d="m4 13.5 3.5-4.5 3.2 2.5 5-5.5M12.8 6h2.9v2.9" />
          <circle cx="7.5" cy="9" r="1.4" fill="#101217" />
          <circle cx="10.7" cy="11.5" r="1.4" fill="#101217" />
        </svg>
      );
    case "circle":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="5.5" />
          <circle cx="10" cy="10" r="1.2" fill="currentColor" />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...props}>
          <ellipse cx="10" cy="10" rx="6.2" ry="4" />
          <circle cx="10" cy="6" r="1.1" fill="#101217" />
          <circle cx="10" cy="14" r="1.1" fill="#101217" />
        </svg>
      );
    case "polyline":
      return (
        <svg {...props}>
          <path d="M5 14V6h5.5v4.5H15V14H5Z" />
          <circle cx="5" cy="6" r="1.2" fill="#101217" />
          <circle cx="15" cy="14" r="1.2" fill="#101217" />
        </svg>
      );
    case "triangle":
      return (
        <svg {...props}>
          <path d="M4.5 15 7 5l8.5 10h-11Z" />
          <circle cx="7" cy="5" r="1.3" fill="#101217" />
        </svg>
      );
    case "arc":
      return (
        <svg {...props}>
          <path d="M4.5 14.5C5.5 7.5 10.5 5 15.5 5.5" />
          <circle cx="4.5" cy="14.5" r="1.3" fill="#101217" />
          <circle cx="15.5" cy="5.5" r="1.3" fill="#101217" />
        </svg>
      );
    case "curve":
      return (
        <svg {...props}>
          <path d="M4.5 15Q7 5.5 15.5 5.5" />
          <circle cx="4.5" cy="15" r="1.3" fill="#101217" />
          <circle cx="15.5" cy="5.5" r="1.3" fill="#101217" />
        </svg>
      );
    case "double_curve":
      return (
        <svg {...props}>
          <path d="M4.5 15C4.5 8 15.5 12 15.5 5" />
          <circle cx="4.5" cy="15" r="1.3" fill="#101217" />
          <circle cx="15.5" cy="5" r="1.3" fill="#101217" />
        </svg>
      );

    // TEXT, NOTES & CONTENT
    case "text":
      return (
        <svg {...props}>
          <path d="M5 4.8h10M10 4.8v10.7M8 15.5h4" />
        </svg>
      );
    case "note":
      return (
        <svg {...props}>
          <rect x="4.5" y="4" width="11" height="8" rx="1" />
          <path d="M8 6.5h4M10 6.5v3.2M10 12v2.5" />
          <circle cx="10" cy="15.5" r="1.2" fill="#101217" />
        </svg>
      );
    case "price_note":
      return (
        <svg {...props}>
          <rect x="4.5" y="4" width="11" height="8" rx="1" />
          <path d="M10 5.6v4.8M11.2 6.8h-1.8c-.5 0-.6.9 0 1.1l1.2.3c.6.2.5 1.1 0 1.1H8.8M10 12v2.5" />
          <circle cx="10" cy="15.5" r="1.2" fill="#101217" />
        </svg>
      );
    case "pin":
      return (
        <svg {...props}>
          <path d="M10 16.5s4.5-4.4 4.5-8a4.5 4.5 0 1 0-9 0c0 3.6 4.5 8 4.5 8Z" />
          <circle cx="10" cy="8.5" r="1.5" />
        </svg>
      );
    case "table":
      return (
        <svg {...props}>
          <rect x="4" y="4.5" width="12" height="11" rx="1" />
          <path d="M4 8.2h12M4 11.8h12M8.5 4.5v11" />
        </svg>
      );
    case "callout":
      return (
        <svg {...props}>
          <path d="M4 5h12v7.5H8.5L5.5 15.5v-3H4V5Z" />
        </svg>
      );
    case "comment":
      return (
        <svg {...props}>
          <path d="M5 5.5h9a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6.5L4 15.5V7.5a2 2 0 0 1 1-2Z" />
        </svg>
      );
    case "price_label":
      return (
        <svg {...props}>
          <path d="M5 13V6.5h10v5H7L5 13Z" />
          <circle cx="4.5" cy="14" r="1.3" fill="#101217" />
        </svg>
      );
    case "signpost":
      return (
        <svg {...props}>
          <circle cx="10" cy="8.5" r="4.5" />
          <path d="M10 13v3.8M10 6.3l.7 1.4 1.5.2-1.1 1.1.3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1.1 1.5-.2.7-1.4Z" />
        </svg>
      );
    case "flag_mark":
      return (
        <svg {...props}>
          <path d="M5 16V4.5h9.5l-2 3 2 3H5" />
        </svg>
      );
    case "image_annotation":
      return (
        <svg {...props}>
          <rect x="4" y="4.5" width="12" height="11" rx="1.2" />
          <circle cx="7.8" cy="8" r="1.1" />
          <path d="m4.5 14 3.5-3.5 2.5 2.5 2-2 3 3" />
        </svg>
      );
    case "post_annotation":
      return (
        <svg {...props}>
          <path d="M4.5 4.5 15.5 15.5M15.5 4.5 4.5 15.5" />
        </svg>
      );
    case "idea_annotation":
      return (
        <svg {...props}>
          <path d="M7.5 12.8c-1.2-.8-2-2.2-2-3.8a4.5 4.5 0 1 1 9 0c0 1.6-.8 3-2 3.8V14h-5v-1.2ZM8 16h4M10 8.5V12" />
        </svg>
      );
    case "icon_stamp":
      return (
        <svg {...props}>
          <path d="M10 16s-5.5-3.6-5.5-7.4a3.2 3.2 0 0 1 5.5-2.1 3.2 3.2 0 0 1 5.5 2.1C15.5 12.4 10 16 10 16Z" />
        </svg>
      );
  }
}
