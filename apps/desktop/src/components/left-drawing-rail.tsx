import type { ReactNode } from "react";
import type { DrawingToolKind } from "../drawings/drawing-engine";

export interface LeftDrawingRailProps {
  activeTool: DrawingToolKind;
  magnetEnabled: boolean;
  showFloatingBar: boolean;
  drawingCount: number;
  onSelectTool: (tool: DrawingToolKind) => void;
  onToggleMagnet: () => void;
  onToggleFloatingBar: () => void;
  onClearDrawings: () => void;
}

interface RailItem {
  kind: DrawingToolKind;
  label: string;
  icon: ReactNode;
}

const TOOL_ITEMS: readonly RailItem[] = [
  {
    kind: "cursor",
    label: "Crosshair",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M10 3v4.5M10 12.5V17M3 10h4.5M12.5 10H17" strokeLinecap="round" />
        <circle cx="10" cy="10" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    kind: "trendline",
    label: "Trendline",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M4.5 15.5 15.5 4.5" strokeLinecap="round" />
        <circle cx="4.5" cy="15.5" r="1.6" fill="#101217" />
        <circle cx="15.5" cy="4.5" r="1.6" fill="#101217" />
      </svg>
    ),
  },
  {
    kind: "horizontal_ray",
    label: "Horizontal Ray",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M5.5 10H17" strokeLinecap="round" />
        <circle cx="4.5" cy="10" r="1.7" fill="#101217" />
      </svg>
    ),
  },
  {
    kind: "fib_retracement",
    label: "Fib Retracement",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.35">
        <path d="M3.5 5h13M3.5 8.5h13M3.5 12h13M3.5 15.5h13" strokeLinecap="round" />
        <circle cx="6.5" cy="5" r="1.2" fill="currentColor" />
        <circle cx="13.5" cy="15.5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    kind: "box_zone",
    label: "Box / Zone",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="4" y="5.5" width="12" height="9" rx="1" />
        <circle cx="4" cy="5.5" r="1.2" fill="#101217" />
        <circle cx="16" cy="14.5" r="1.2" fill="#101217" />
      </svg>
    ),
  },
  {
    kind: "price_range",
    label: "Price Range Measure",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M5 4h10M5 16h10M10 4.5v11M7.8 7 10 4.5 12.2 7M7.8 13 10 15.5 12.2 13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    kind: "anchored_vwap",
    label: "Anchored VWAP",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M3.5 14c2.8-1.5 4.2-6 7-5.5s3.5 1.8 6-3" strokeLinecap="round" />
        <circle cx="3.5" cy="14" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
];

export function LeftDrawingRail({
  activeTool,
  magnetEnabled,
  showFloatingBar,
  drawingCount,
  onSelectTool,
  onToggleMagnet,
  onToggleFloatingBar,
  onClearDrawings,
}: LeftDrawingRailProps) {
  return (
    <aside
      aria-label="Chart drawing tools"
      className="flex w-11 shrink-0 flex-col items-center justify-between border-r border-[#232733] bg-[#101217] py-2 select-none"
    >
      <div className="flex flex-col items-center gap-1">
        {TOOL_ITEMS.map((item) => {
          const active = activeTool === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => onSelectTool(item.kind)}
              className={
                active
                  ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#292e3b] text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                  : "flex h-8 w-8 items-center justify-center rounded-md text-[#8c93a4] hover:bg-[#1c202b] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-sky-400"
              }
            >
              {item.icon}
            </button>
          );
        })}

        <div className="my-1.5 h-px w-6 bg-[#232733]" aria-hidden="true" />

        {/* Magnet Snap Toggle */}
        <button
          type="button"
          title={magnetEnabled ? "Magnet snap ON (snaps to OHLC/TPO)" : "Magnet snap OFF"}
          aria-label="Toggle OHLC and TPO magnet snap"
          aria-pressed={magnetEnabled}
          onClick={onToggleMagnet}
          className={
            magnetEnabled
              ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#1e2c42] text-sky-300 hover:bg-[#243550] focus-visible:outline-2 focus-visible:outline-sky-400"
              : "flex h-8 w-8 items-center justify-center rounded-md text-[#8c93a4] hover:bg-[#1c202b] hover:text-[#e6e8ee] focus-visible:outline-2 focus-visible:outline-sky-400"
          }
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 4.5v6a4 4 0 0 0 8 0v-6" strokeLinecap="round" />
            <path d="M4.8 4.5h2.4M12.8 4.5h2.4M4.8 7.5h2.4M12.8 7.5h2.4" strokeLinecap="round" />
          </svg>
        </button>

        {/* Clear Drawings */}
        <button
          type="button"
          title={drawingCount > 0 ? `Clear ${drawingCount} drawing(s)` : "No drawings on symbol"}
          aria-label={`Clear drawings (${drawingCount})`}
          disabled={drawingCount === 0}
          onClick={onClearDrawings}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-[#8c93a4] hover:bg-[#1c202b] hover:text-rose-300 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M4.5 6h11M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M6.5 6l.7 9.5a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9L13.5 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {drawingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[#292e3b] px-1 font-mono text-[9px] text-[#e6e8ee]">
              {drawingCount}
            </span>
          )}
        </button>
      </div>

      {/* Bottom Star: Toggle Floating Favorites Drawing Toolbar (matches screenshot bottom-left star!) */}
      <button
        type="button"
        title={showFloatingBar ? "Hide floating favorites toolbar" : "Show floating favorites toolbar"}
        aria-label="Toggle floating favorites drawing toolbar"
        aria-pressed={showFloatingBar}
        onClick={onToggleFloatingBar}
        className={
          showFloatingBar
            ? "flex h-8 w-8 items-center justify-center rounded-md bg-[#e6e8ee] text-[#0c0d11] shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-400"
            : "flex h-8 w-8 items-center justify-center rounded-md text-[#8c93a4] hover:bg-[#1c202b] hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        }
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m10 3.2 2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14l-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L10 3.2Z" strokeLinejoin="round" />
        </svg>
      </button>
    </aside>
  );
}
