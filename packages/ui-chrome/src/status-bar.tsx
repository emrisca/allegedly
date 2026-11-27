import { useEffect, useState } from "react";
import type { BootConfig } from "@allegedly/ipc-client";

export type ChartDateRange = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";
export type QuickRangePreset = ChartDateRange;

export interface StatusBarProps {
  transportKind: string;
  bootConfig: BootConfig;
  bookState: number;
  provenanceTier: number;
  stateRev: number;
  droppedTotal: number;
  showProvenance?: boolean;
  activeRange?: ChartDateRange;
  onSelectRange?: (range: ChartDateRange) => void;
  autoScale?: boolean;
  onToggleAutoScale?: () => void;
  logScale?: boolean;
  onToggleLogScale?: () => void;
}

const RANGES: readonly ChartDateRange[] = [
  "1D",
  "5D",
  "1M",
  "3M",
  "6M",
  "YTD",
  "1Y",
  "All",
];

function formatClock(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absH = Math.floor(Math.abs(offsetMin) / 60);
  return `${hh}:${mm}:${ss} (UTC${sign}${absH})`;
}

export function StatusBar({
  activeRange = "All",
  onSelectRange,
  autoScale = true,
  onToggleAutoScale,
  logScale = false,
  onToggleLogScale,
}: StatusBarProps) {
  const [clock, setClock] = useState<string>(() => formatClock());

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <footer
      aria-label="Chart range and scale bar"
      className="flex h-7 shrink-0 items-center justify-between border-t border-[#2a2e39] bg-[#131722] px-2 text-[12px] text-[#787b86] select-none"
    >
      {/* Left: Quick Date Ranges (1D 5D 1M 3M 6M YTD 1Y 5Y All) */}
      <div className="flex items-center gap-0.5">
        {RANGES.map((rng) => {
          const selected = activeRange === rng;
          return (
            <button
              key={rng}
              type="button"
              onClick={() => onSelectRange?.(rng)}
              className={
                selected
                  ? "rounded px-2 py-0.5 text-[11px] font-medium text-[#2962ff] bg-[#2962ff]/12"
                  : "rounded px-2 py-0.5 text-[11px] font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white"
              }
            >
              {rng}
            </button>
          );
        })}
      </div>

      {/* Right: Clock, log / auto scale toggles */}
      <div className="flex items-center gap-2 text-[11px] tabular-nums">
        <span className="text-[#d1d4dc]">{clock}</span>
        {(onToggleLogScale || onToggleAutoScale) && (
          <span className="h-3.5 w-px bg-[#2a2e39]" aria-hidden="true" />
        )}
        {onToggleLogScale && (
          <button
            type="button"
            onClick={onToggleLogScale}
            aria-pressed={logScale}
            className={
              logScale
                ? "rounded px-1.5 py-0.5 text-[11px] font-medium text-[#2962ff] bg-[#2962ff]/12 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                : "rounded px-1.5 py-0.5 text-[11px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            }
          >
            log
          </button>
        )}
        {onToggleAutoScale && (
          <button
            type="button"
            onClick={onToggleAutoScale}
            aria-pressed={autoScale}
            className={
              autoScale
                ? "rounded px-1.5 py-0.5 text-[11px] font-medium text-[#2962ff] bg-[#2962ff]/12 focus-visible:outline-2 focus-visible:outline-[#2962ff]"
                : "rounded px-1.5 py-0.5 text-[11px] text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2962ff]"
            }
          >
            auto
          </button>
        )}
      </div>
    </footer>
  );
}
